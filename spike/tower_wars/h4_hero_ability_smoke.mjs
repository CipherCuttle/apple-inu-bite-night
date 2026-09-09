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
const nativeTargets = []
const abilityPasses = []

function parse(text) {
  let m = text.match(/HLW_NATIVE_CREEP_SERVER=SPAWN creep=(\d+) ent=(\d+)/)
  if (m) creepSpawns.push({ creep: +m[1], ent: +m[2] })
  m = text.match(/HLW_NATIVE_CREEP_SERVER=REMOVE creep=(\d+) ent=(\d+)/)
  if (m) creepRemovals.push({ creep: +m[1], ent: +m[2] })
  m = text.match(/HLW_NATIVE_HERO_TARGET=PASS actor=(\d+) creep=(\d+) ent=(\d+) distance2=(-?\d+(?:\.\d+)?) range=(-?\d+(?:\.\d+)?)/)
  if (m) nativeTargets.push({ actor: +m[1], creep: +m[2], ent: +m[3], distance2: +m[4], range: +m[5] })
  m = text.match(/HLW_BROWSER_HERO_ABILITY=PASS actor=(\d+) ability=PHASE_LANCE creep=(\d+) killed=(\d+) hp=(\d+) cost=(\d+) reward=(\d+) gold=(\d+) ready=(\d+)/)
  if (m) abilityPasses.push({ actor: +m[1], creep: +m[2], killed: +m[3], hp: +m[4], cost: +m[5], reward: +m[6], gold: +m[7], ready: +m[8] })
}

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`timeout waiting for ${label}: ${JSON.stringify({ creepSpawns, creepRemovals, nativeTargets, abilityPasses })}`)
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
    abilityExport: typeof Module?._HLW_BrowserHeroAbility === 'function',
    rawAbilityExported: typeof Module?._tw_session_hero_ability === 'function',
    rawTargetExported: typeof Module?._HLW_OpenRealmHeroAcquireTarget === 'function',
    botOnlyAbilityExported: typeof Module?._HLW_BrowserBotAbility === 'function',
  }))
  if (!boot.openRealm || !boot.towerWars || !boot.webgl2 || !boot.abilityExport ||
      boot.rawAbilityExported || boot.rawTargetExported || boot.botOnlyAbilityExported ||
      abortSeen || pageError) {
    throw new Error(`H4 boot/authority boundary failed: ${JSON.stringify(boot)}`)
  }

  if (await page.evaluate(() => Module._TW_BrowserSend(1, 1)) !== 1 ||
      await page.evaluate(() => Module._TW_BrowserStep(1)) !== 1) {
    throw new Error('failed to spawn player-0 H4 swarm')
  }
  const spawned = await snapshot(page)
  if (spawned.activeCount !== 1 || spawned.creeps[0]?.target !== 0 || spawned.creeps[0]?.hp !== 70) {
    throw new Error(`unexpected H4 swarm state: ${JSON.stringify(spawned)}`)
  }
  const creepId = spawned.creeps[0].id
  await waitFor(() => creepSpawns.some((x) => x.creep === creepId), 5_000, 'H4 native swarm spawn')
  const nativeSpawn = creepSpawns.find((x) => x.creep === creepId)

  const wrongState = spawned.stateHash
  const wrongLog = spawned.logHash
  if (await page.evaluate(() => Module._HLW_BrowserHeroAbility(1)) !== 0) {
    throw new Error('wrong-seat Phase Lance acquired outgoing creep')
  }
  const afterWrong = await snapshot(page)
  if (afterWrong.stateHash !== wrongState || afterWrong.logHash !== wrongLog || afterWrong.creeps[0]?.hp !== 70) {
    throw new Error('wrong-seat Phase Lance mutated authority')
  }

  if (await page.evaluate(() => Module._HLW_BrowserHeroAbility(0)) !== 1) {
    throw new Error('first Phase Lance rejected')
  }
  const first = await snapshot(page)
  console.log(`HLW_H4_FIRST_CAST=${JSON.stringify(first)}`)
  if (first.creeps[0]?.id !== creepId || first.creeps[0]?.hp !== 10 ||
      first.players[0].gold !== 485 || first.heroAbilityReady[0] !== 13) {
    throw new Error(`first Phase Lance diverged: ${JSON.stringify(first)}`)
  }
  await waitFor(
    () => nativeTargets.some((x) => x.actor === 0 && x.creep === creepId && x.ent === nativeSpawn.ent && x.range === 128),
    5_000,
    'Phase Lance native target acquisition',
  )

  const cooldownState = first.stateHash
  const cooldownLog = first.logHash
  if (await page.evaluate(() => Module._HLW_BrowserHeroAbility(0)) !== 0) {
    throw new Error('Phase Lance bypassed cooldown')
  }
  const afterCooldown = await snapshot(page)
  if (afterCooldown.stateHash !== cooldownState || afterCooldown.logHash !== cooldownLog ||
      afterCooldown.creeps[0]?.hp !== 10 || afterCooldown.players[0].gold !== 485) {
    throw new Error('cooldown rejection mutated H4 authority')
  }

  if (await page.evaluate(() => Module._TW_BrowserStep(12)) !== 1) {
    throw new Error('failed to advance Phase Lance cooldown')
  }
  const ready = await snapshot(page)
  if (ready.tick !== 13 || ready.heroAbilityReady[0] !== 13 || ready.activeCount !== 1) {
    throw new Error(`Phase Lance not ready on tick 13: ${JSON.stringify(ready)}`)
  }

  if (await page.evaluate(() => Module._HLW_BrowserHeroAbility(0)) !== 1) {
    throw new Error('lethal Phase Lance rejected')
  }
  const killed = await snapshot(page)
  console.log(`HLW_H4_KILL=${JSON.stringify(killed)}`)
  if (killed.activeCount !== 0 || killed.players[0].gold !== 490 ||
      killed.players[0].lives !== 20 || killed.heroAbilityReady[0] !== 25) {
    throw new Error(`Phase Lance kill/cost/reward diverged: ${JSON.stringify(killed)}`)
  }
  await waitFor(
    () => creepRemovals.some((x) => x.creep === creepId && x.ent === nativeSpawn.ent),
    5_000,
    'same native H4 creep retirement',
  )

  const repeatState = killed.stateHash
  const repeatLog = killed.logHash
  if (await page.evaluate(() => Module._HLW_BrowserHeroAbility(0)) !== 0) {
    throw new Error('retired creep produced a second Phase Lance reward')
  }
  const afterRepeat = await snapshot(page)
  if (afterRepeat.stateHash !== repeatState || afterRepeat.logHash !== repeatLog || afterRepeat.players[0].gold !== 490) {
    throw new Error('post-kill Phase Lance mutated authority')
  }

  if (await page.evaluate(() => Module._TW_BrowserReplayVerify()) !== 1) {
    throw new Error('H4 actor-0 replay diverged')
  }

  /* Prove the other seat uses the exact same public ability command. Move the
   * actor-1 hero near its entrance before spawning the incoming creep. */
  if (await page.evaluate(() => Module._TW_BrowserReset()) !== 1) {
    throw new Error('H4 parity reset failed')
  }
  if (await page.evaluate(() => Module._HLW_BrowserHeroMove(1, -120, 140)) !== 1 ||
      await page.evaluate(() => Module._TW_BrowserStep(30)) !== 1) {
    throw new Error('failed to position actor-1 hero for shared ability proof')
  }
  const positioned = await page.evaluate(() => ({
    x: Module._HLW_BrowserHeroX(1),
    y: Module._HLW_BrowserHeroY(1),
    state: globalThis.__TW_API.snapshot(),
  }))
  if (positioned.x !== -120 || positioned.y !== 140) {
    throw new Error(`actor-1 hero positioning diverged: ${JSON.stringify(positioned)}`)
  }
  if (await page.evaluate(() => Module._TW_BrowserSend(0, 1)) !== 1 ||
      await page.evaluate(() => Module._TW_BrowserStep(1)) !== 1) {
    throw new Error('failed to spawn actor-1 incoming swarm')
  }
  const beforeActor1 = await snapshot(page)
  const actor1GoldBefore = beforeActor1.players[1].gold
  if (beforeActor1.creeps[0]?.target !== 1 || beforeActor1.creeps[0]?.hp !== 70) {
    throw new Error(`unexpected actor-1 incoming creep: ${JSON.stringify(beforeActor1)}`)
  }
  if (await page.evaluate(() => Module._HLW_BrowserHeroAbility(1)) !== 1) {
    throw new Error('actor-1 shared Phase Lance command rejected')
  }
  const actor1Cast = await snapshot(page)
  if (actor1Cast.creeps[0]?.hp !== 10 || actor1Cast.players[1].gold !== actor1GoldBefore - 15 ||
      actor1Cast.heroAbilityReady[1] !== actor1Cast.tick + 12) {
    throw new Error(`actor-1 Phase Lance diverged: ${JSON.stringify(actor1Cast)}`)
  }
  if (await page.evaluate(() => Module._TW_BrowserReplayVerify()) !== 1) {
    throw new Error('H4 actor-1 replay diverged')
  }

  const final = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    state: globalThis.__TW_API.snapshot(),
  }))
  if (!final.openRealm || !final.webgl2 || !final.state.replayOk ||
      !final.state.nativeSyncOk || !final.state.heroOk || abortSeen || pageError) {
    throw new Error(`H4 final stability failed: ${JSON.stringify(final)}`)
  }

  console.log(`HLW_H4_EVIDENCE=${JSON.stringify({
    ability: 'PHASE_LANCE',
    damage: 60,
    cooldownTicks: 12,
    goldCost: 15,
    rangeWorld: 128,
    firstCreepId: creepId,
    firstNativeEntity: nativeSpawn.ent,
    firstCastHp: 10,
    actor0KillGold: 490,
    actor0NoDoubleReward: afterRepeat.players[0].gold === 490,
    bothSeatsSameCommand: abilityPasses.some((x) => x.actor === 0) && abilityPasses.some((x) => x.actor === 1),
    replayOk: final.state.replayOk,
    finalWebGL2: final.webgl2,
  })}`)
  console.log('HERO_LINE_WARS_H4_HERO_ABILITY=PASS')
} finally {
  await browser.close()
}
