import puppeteer from 'puppeteer-core'

const url = process.env.OPENREALM_URL ?? 'http://127.0.0.1:8765/openrealm.html'
const executablePath = process.env.CHROME
if (!executablePath) throw new Error('CHROME is required')

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  timeout: 45_000,
  args: [
    '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu-sandbox',
    '--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle',
    '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader',
    '--window-size=1280,720',
  ],
})

let pageError = null
let abortSeen = false

async function snapshot(page) {
  return page.evaluate(() => globalThis.__TW_API.snapshot())
}

async function sendScout(page) {
  if (await page.evaluate(() => Module._TW_BrowserSend(1, 0)) !== 1) {
    throw new Error('failed to send H5 scout')
  }
  if (await page.evaluate(() => Module._TW_BrowserStep(1)) !== 1) {
    throw new Error('failed to spawn H5 scout')
  }
  const snap = await snapshot(page)
  if (snap.activeCount !== 1 || snap.creeps.length !== 1 ||
      snap.creeps[0].target !== 0 || snap.creeps[0].hp !== 45) {
    throw new Error(`unexpected H5 scout state: ${JSON.stringify(snap)}`)
  }
  return snap.creeps[0].id
}

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
  page.on('console', (message) => {
    const text = message.text()
    console.log(`[page:${message.type()}] ${text}`)
    if (text.includes('OPENREALM_ABORT=')) abortSeen = true
  })
  page.on('pageerror', (error) => {
    pageError = error
    console.error(`[pageerror] ${error.stack ?? error.message}`)
  })

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 25_000 })
  await page.waitForFunction(
    () => globalThis.__TW_READY === true && globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    { timeout: 30_000, polling: 100 },
  )

  const boot = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    towerWars: globalThis.__TW_READY === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    attackExport: typeof Module?._HLW_BrowserHeroAttack === 'function',
    abilityExport: typeof Module?._HLW_BrowserHeroAbility === 'function',
    rawKillResolverExported: typeof Module?._tw_session_resolve_hero_kill === 'function',
  }))
  const initial = await snapshot(page)
  const initialHeroEntities = await page.evaluate(() => [
    Module._HLW_BrowserHeroEntity(0),
    Module._HLW_BrowserHeroEntity(1),
  ])
  console.log(`HLW_H5_BOOT=${JSON.stringify({ boot, initial, initialHeroEntities })}`)
  if (!boot.openRealm || !boot.towerWars || !boot.webgl2 || !boot.attackExport ||
      !boot.abilityExport || boot.rawKillResolverExported || !initial.nativeSyncOk ||
      !initial.heroOk || initial.heroXP?.[0] !== 0 || initial.heroXP?.[1] !== 0 ||
      initial.heroLevel?.[0] !== 1 || initial.heroLevel?.[1] !== 1 ||
      initial.heroBasicDamage?.[0] !== 25 || initial.heroBasicDamage?.[1] !== 25 ||
      abortSeen || pageError) {
    throw new Error(`H5 boot/progression boundary failed: ${JSON.stringify({ boot, initial })}`)
  }

  const firstCreep = await sendScout(page)
  if (await page.evaluate(() => Module._HLW_BrowserHeroAttack(0)) !== 1) {
    throw new Error('H5 first basic hit rejected')
  }
  let snap = await snapshot(page)
  if (snap.creeps[0]?.id !== firstCreep || snap.creeps[0]?.hp !== 20 ||
      snap.heroXP[0] !== 0 || snap.heroLevel[0] !== 1 || snap.heroBasicDamage[0] !== 25) {
    throw new Error(`H5 first hit diverged: ${JSON.stringify(snap)}`)
  }
  if (await page.evaluate(() => Module._TW_BrowserStep(4)) !== 1) {
    throw new Error('failed to advance to H5 first-kill cadence')
  }
  if (await page.evaluate(() => Module._HLW_BrowserHeroAttack(0)) !== 1) {
    throw new Error('H5 first lethal basic attack rejected')
  }
  const firstKill = await snapshot(page)
  console.log(`HLW_H5_FIRST_KILL=${JSON.stringify(firstKill)}`)
  if (firstKill.activeCount !== 0 || firstKill.players[0].gold !== 520 ||
      firstKill.heroXP[0] !== 50 || firstKill.heroLevel[0] !== 1 ||
      firstKill.heroBasicDamage[0] !== 25) {
    throw new Error(`H5 first kill/reward/XP diverged: ${JSON.stringify(firstKill)}`)
  }

  const secondCreep = await sendScout(page)
  if (await page.evaluate(() => Module._HLW_BrowserHeroAbility(0)) !== 1) {
    throw new Error('H5 threshold Phase Lance rejected')
  }
  const leveled = await snapshot(page)
  console.log(`HLW_H5_LEVEL=${JSON.stringify(leveled)}`)
  if (leveled.activeCount !== 0 || leveled.players[0].gold !== 525 ||
      leveled.heroXP[0] !== 100 || leveled.heroLevel[0] !== 2 ||
      leveled.heroBasicDamage[0] !== 30 || leveled.stateHash === firstKill.stateHash) {
    throw new Error(`H5 threshold transition diverged: ${JSON.stringify({ secondCreep, leveled })}`)
  }

  const thirdCreep = await sendScout(page)
  const beforeLevel2Attack = await snapshot(page)
  if (beforeLevel2Attack.tick < beforeLevel2Attack.heroReady[0]) {
    const delta = beforeLevel2Attack.heroReady[0] - beforeLevel2Attack.tick
    if (await page.evaluate((ticks) => Module._TW_BrowserStep(ticks), delta) !== 1) {
      throw new Error('failed to advance to level-2 basic readiness')
    }
  }
  if (await page.evaluate(() => Module._HLW_BrowserHeroAttack(0)) !== 1) {
    throw new Error('level-2 basic attack rejected')
  }
  const level2Damage = await snapshot(page)
  console.log(`HLW_H5_LEVEL2_DAMAGE=${JSON.stringify(level2Damage)}`)
  if (level2Damage.creeps[0]?.id !== thirdCreep || level2Damage.creeps[0]?.hp !== 15 ||
      level2Damage.heroXP[0] !== 100 || level2Damage.heroLevel[0] !== 2 ||
      level2Damage.heroBasicDamage[0] !== 30) {
    throw new Error(`level-2 damage/stat authority diverged: ${JSON.stringify(level2Damage)}`)
  }

  if (await page.evaluate(() => Module._TW_BrowserReplayVerify()) !== 1) {
    throw new Error('H5 authoritative replay diverged')
  }
  const replayed = await snapshot(page)
  if (!replayed.replayOk || replayed.heroXP[0] !== 100 || replayed.heroLevel[0] !== 2 ||
      replayed.heroBasicDamage[0] !== 30) {
    throw new Error(`H5 replay lost progression: ${JSON.stringify(replayed)}`)
  }

  if (await page.evaluate(() => Module._TW_BrowserReset()) !== 1) {
    throw new Error('H5 reset failed')
  }
  const reset = await snapshot(page)
  const resetHeroEntities = await page.evaluate(() => [
    Module._HLW_BrowserHeroEntity(0),
    Module._HLW_BrowserHeroEntity(1),
  ])
  if (reset.heroXP[0] !== 0 || reset.heroXP[1] !== 0 ||
      reset.heroLevel[0] !== 1 || reset.heroLevel[1] !== 1 ||
      reset.heroBasicDamage[0] !== 25 || reset.heroBasicDamage[1] !== 25 ||
      resetHeroEntities[0] !== initialHeroEntities[0] ||
      resetHeroEntities[1] !== initialHeroEntities[1]) {
    throw new Error(`H5 reset did not restore canonical hero state: ${JSON.stringify({ reset, initialHeroEntities, resetHeroEntities })}`)
  }

  const final = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
  }))
  if (!final.openRealm || !final.webgl2 || abortSeen || pageError) {
    throw new Error(`H5 final stability failed: ${JSON.stringify({ final, abortSeen, pageError })}`)
  }

  console.log(`HLW_H5_EVIDENCE=${JSON.stringify({
    firstKillXP: firstKill.heroXP[0],
    thresholdXP: leveled.heroXP[0],
    thresholdLevel: leveled.heroLevel[0],
    level2BasicDamage: leveled.heroBasicDamage[0],
    postLevelHitHp: level2Damage.creeps[0]?.hp,
    replayOk: replayed.replayOk,
    resetXP: reset.heroXP[0],
    resetLevel: reset.heroLevel[0],
    stableHeroEntities: resetHeroEntities[0] === initialHeroEntities[0] && resetHeroEntities[1] === initialHeroEntities[1],
    finalWebGL2: final.webgl2,
  })}`)
  console.log('HERO_LINE_WARS_H5_HERO_XP_LEVEL=PASS')
} finally {
  await browser.close()
}
