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
const creepSpawns = []
const creepRemovals = []
const targets = []
const attacks = []

function parse(text) {
  let m = text.match(/HLW_NATIVE_CREEP_SERVER=SPAWN creep=(\d+) ent=(\d+)/)
  if (m) creepSpawns.push({ creep: +m[1], ent: +m[2] })
  m = text.match(/HLW_NATIVE_CREEP_SERVER=REMOVE creep=(\d+) ent=(\d+)/)
  if (m) creepRemovals.push({ creep: +m[1], ent: +m[2] })
  m = text.match(/HLW_NATIVE_HERO_TARGET=PASS actor=(\d+) creep=(\d+) ent=(\d+) distance2=(-?\d+(?:\.\d+)?) range=(-?\d+(?:\.\d+)?)/)
  if (m) targets.push({ actor: +m[1], creep: +m[2], ent: +m[3], distance2: +m[4], range: +m[5] })
  m = text.match(/HLW_BROWSER_HERO_ATTACK=(PASS|REJECT|FAIL) actor=(-?\d+)(?: creep=(\d+))?/) 
  if (m) attacks.push({ result: m[1], actor: +m[2], creep: m[3] ? +m[3] : null })
}

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`timeout waiting for ${label}: ${JSON.stringify({ creepSpawns, creepRemovals, targets, attacks })}`)
}

async function snapshot(page) {
  return page.evaluate(() => globalThis.__TW_API.snapshot())
}

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
  page.on('console', (message) => {
    const text = message.text()
    console.log(`[page:${message.type()}] ${text}`)
    parse(text)
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
    rawTargetExported: typeof Module?._HLW_OpenRealmHeroAcquireTarget === 'function',
    rawDamageExported: typeof Module?._tw_session_hero_attack === 'function',
  }))
  const initial = await snapshot(page)
  console.log(`HLW_H3_BOOT=${JSON.stringify({ boot, initial })}`)
  if (!boot.openRealm || !boot.towerWars || !boot.webgl2 || !boot.attackExport ||
      boot.rawTargetExported || boot.rawDamageExported || !initial.nativeSyncOk ||
      !initial.heroOk || abortSeen || pageError) {
    throw new Error(`H3 boot/authority boundary failed: ${JSON.stringify({ boot, initial })}`)
  }

  if (await page.evaluate(() => Module._TW_BrowserSend(1, 0)) !== 1) {
    throw new Error('failed to send H3 scout')
  }
  if (await page.evaluate(() => Module._TW_BrowserStep(1)) !== 1) {
    throw new Error('failed to spawn H3 scout')
  }

  const spawned = await snapshot(page)
  if (spawned.activeCount !== 1 || spawned.creeps.length !== 1 ||
      spawned.creeps[0].target !== 0 || spawned.creeps[0].hp !== 45) {
    throw new Error(`unexpected H3 spawn state: ${JSON.stringify(spawned)}`)
  }
  const creepId = spawned.creeps[0].id
  await waitFor(() => creepSpawns.some((x) => x.creep === creepId), 5_000, 'native H3 creep spawn')
  const nativeSpawn = creepSpawns.find((x) => x.creep === creepId)

  const beforeWrongSeatState = spawned.stateHash
  const beforeWrongSeatLog = spawned.logHash
  if (await page.evaluate(() => Module._HLW_BrowserHeroAttack(1)) !== 0) {
    throw new Error('wrong-seat hero acquired an outgoing creep')
  }
  const afterWrongSeat = await snapshot(page)
  if (afterWrongSeat.stateHash !== beforeWrongSeatState || afterWrongSeat.logHash !== beforeWrongSeatLog ||
      afterWrongSeat.creeps[0]?.hp !== 45) {
    throw new Error('wrong-seat attack mutated authoritative state')
  }

  if (await page.evaluate(() => Module._HLW_BrowserHeroAttack(0)) !== 1) {
    throw new Error('first legal hero attack rejected')
  }
  const damaged = await snapshot(page)
  console.log(`HLW_H3_DAMAGE=${JSON.stringify(damaged)}`)
  if (damaged.activeCount !== 1 || damaged.creeps[0]?.id !== creepId || damaged.creeps[0]?.hp !== 20 ||
      damaged.players[0].gold !== 500 || damaged.heroReady[0] !== 5) {
    throw new Error(`first H3 hit diverged: ${JSON.stringify(damaged)}`)
  }
  await waitFor(
    () => targets.some((x) => x.actor === 0 && x.creep === creepId && x.ent === nativeSpawn.ent),
    5_000,
    'native legal target acquisition',
  )

  const beforeCooldownState = damaged.stateHash
  const beforeCooldownLog = damaged.logHash
  if (await page.evaluate(() => Module._HLW_BrowserHeroAttack(0)) !== 0) {
    throw new Error('hero attacked through cooldown')
  }
  const afterCooldown = await snapshot(page)
  if (afterCooldown.stateHash !== beforeCooldownState || afterCooldown.logHash !== beforeCooldownLog ||
      afterCooldown.creeps[0]?.hp !== 20 || afterCooldown.players[0].gold !== 500) {
    throw new Error('cooldown rejection mutated authoritative state')
  }

  if (await page.evaluate(() => Module._TW_BrowserStep(4)) !== 1) {
    throw new Error('failed to advance to deterministic attack cadence')
  }
  const ready = await snapshot(page)
  if (ready.tick !== 5 || ready.heroReady[0] !== 5 || ready.activeCount !== 1) {
    throw new Error(`hero did not become ready on tick 5: ${JSON.stringify(ready)}`)
  }

  if (await page.evaluate(() => Module._HLW_BrowserHeroAttack(0)) !== 1) {
    throw new Error('lethal hero attack rejected')
  }
  const killed = await snapshot(page)
  console.log(`HLW_H3_KILL=${JSON.stringify(killed)}`)
  if (killed.activeCount !== 0 || killed.creeps.length !== 0 ||
      killed.players[0].gold !== 520 || killed.players[0].lives !== 20) {
    throw new Error(`hero kill/reward diverged: ${JSON.stringify(killed)}`)
  }
  await waitFor(
    () => creepRemovals.some((x) => x.creep === creepId && x.ent === nativeSpawn.ent),
    5_000,
    'same native creep retirement',
  )

  const beforeRepeatState = killed.stateHash
  const beforeRepeatLog = killed.logHash
  if (await page.evaluate(() => Module._HLW_BrowserHeroAttack(0)) !== 0) {
    throw new Error('retired creep was rewarded twice')
  }
  const afterRepeat = await snapshot(page)
  if (afterRepeat.stateHash !== beforeRepeatState || afterRepeat.logHash !== beforeRepeatLog ||
      afterRepeat.players[0].gold !== 520) {
    throw new Error('post-kill attack mutated reward/state')
  }

  if (await page.evaluate(() => Module._TW_BrowserStep(80)) !== 1) {
    throw new Error('post-kill leak-exclusivity advance failed')
  }
  const postWindow = await snapshot(page)
  if (postWindow.activeCount !== 0 || postWindow.players[0].lives !== 20) {
    throw new Error(`killed creep later leaked: ${JSON.stringify(postWindow)}`)
  }

  if (await page.evaluate(() => Module._TW_BrowserReplayVerify()) !== 1) {
    throw new Error('H3 authoritative replay diverged')
  }
  const replayed = await snapshot(page)
  const final = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
  }))
  if (!replayed.replayOk || !final.openRealm || !final.webgl2 || abortSeen || pageError) {
    throw new Error(`H3 final stability failed: ${JSON.stringify({ replayed, final })}`)
  }

  console.log(`HLW_H3_EVIDENCE=${JSON.stringify({
    creepId,
    nativeEntity: nativeSpawn.ent,
    firstHitHp: 20,
    cadenceReadyTick: 5,
    killReward: 20,
    finalGoldBeforeIncomeWindow: 520,
    noDoubleReward: afterRepeat.players[0].gold === 520,
    noLeakAfterKill: postWindow.players[0].lives === 20,
    replayOk: replayed.replayOk,
    finalWebGL2: final.webgl2,
  })}`)
  console.log('HERO_LINE_WARS_H3_HERO_BASIC_COMBAT=PASS')
} finally {
  await browser.close()
}
