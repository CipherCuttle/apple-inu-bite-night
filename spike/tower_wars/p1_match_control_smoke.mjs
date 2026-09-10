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

async function heroPosition(page, actor = 0) {
  return page.evaluate((seat) => globalThis.__TW_API.heroPosition(seat), actor)
}

async function playTick(page) {
  const result = await page.evaluate(() => globalThis.__TW_API.playTick())
  if (result !== 1) throw new Error('P1 playTick failed')
}

async function replayReceipt(page) {
  return page.evaluate(() => JSON.parse(Module.UTF8ToString(Module._HLW_BrowserReplaySnapshot())))
}

function receiptsEqual(a, b) {
  return a.commandCount === b.commandCount &&
    a.commandHash === b.commandHash &&
    a.stateHash === b.stateHash &&
    a.sessionLogHash === b.sessionLogHash &&
    a.nativeHash === b.nativeHash &&
    a.nativeCreepCount === b.nativeCreepCount
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
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    p1: Boolean(globalThis.__HLW_P1?.inputState),
    sampledApi: typeof globalThis.__TW_API?.sampleHumanInput === 'function',
    controlsEnabled: ['hero-left', 'hero-right', 'hero-up', 'hero-down', 'hero-attack', 'hero-ability', 'play']
      .every((id) => document.getElementById(id) && !document.getElementById(id).disabled),
    rawMove: typeof Module._HLW_OpenRealmHeroCommandMove === 'function',
    rawAttack: typeof Module._tw_session_hero_attack === 'function',
    rawAbility: typeof Module._tw_session_hero_ability === 'function',
  }))
  if (!boot.openRealm || !boot.webgl2 || !boot.p1 || !boot.sampledApi || !boot.controlsEnabled ||
      boot.rawMove || boot.rawAttack || boot.rawAbility || abortSeen || pageError) {
    throw new Error(`P1 boot/authority boundary failed: ${JSON.stringify({ boot, abortSeen, pageError })}`)
  }

  // Held movement is sampled exactly once per authoritative play tick. Keydown
  // alone must not move the native hero; two ticks produce exactly two native
  // 8-unit steps through the existing actor-indexed move command.
  const initial = await heroPosition(page)
  if (JSON.stringify(initial) !== JSON.stringify([-120, -140])) {
    throw new Error(`P1 initial hero position diverged: ${JSON.stringify(initial)}`)
  }
  await page.keyboard.down('d')
  const beforeMovementTick = await heroPosition(page)
  if (JSON.stringify(beforeMovementTick) !== JSON.stringify(initial)) {
    throw new Error(`P1 keydown mutated movement before a tick: ${JSON.stringify({ initial, beforeMovementTick })}`)
  }
  await playTick(page)
  const afterMove1 = await heroPosition(page)
  await playTick(page)
  const afterMove2 = await heroPosition(page)
  if (JSON.stringify(afterMove1) !== JSON.stringify([-112, -140]) ||
      JSON.stringify(afterMove2) !== JSON.stringify([-104, -140])) {
    throw new Error(`P1 held movement cadence diverged: ${JSON.stringify({ afterMove1, afterMove2 })}`)
  }

  // Releasing the key does not mutate native position asynchronously. The next
  // play tick emits one validated stop-at-current-position command before step.
  await page.keyboard.up('d')
  const beforeStopTick = await heroPosition(page)
  await playTick(page)
  const afterStopTick = await heroPosition(page)
  const moveTelemetry = await page.evaluate(() => ({ ...globalThis.__HLW_P1.inputState }))
  if (JSON.stringify(beforeStopTick) !== JSON.stringify(afterMove2) ||
      JSON.stringify(afterStopTick) !== JSON.stringify(afterMove2) ||
      moveTelemetry.samples !== 3 || moveTelemetry.movementCommands !== 2 || moveTelemetry.stopCommands !== 1 ||
      moveTelemetry.wasMoving !== false) {
    throw new Error(`P1 release-stop semantics diverged: ${JSON.stringify({ beforeStopTick, afterStopTick, moveTelemetry })}`)
  }

  const movementReceiptBefore = await replayReceipt(page)
  if (await page.evaluate(() => globalThis.__TW_API.nativeReplay()) !== 1) {
    throw new Error('P1 movement native replay failed')
  }
  const movementReceiptAfter = await replayReceipt(page)
  if (!receiptsEqual(movementReceiptBefore, movementReceiptAfter)) {
    throw new Error(`P1 movement replay diverged: ${JSON.stringify({ movementReceiptBefore, movementReceiptAfter })}`)
  }

  // Space queues one basic attack but does not mutate authoritative creep HP until
  // the next play tick samples the queue. H8's existing center button is retained
  // as a fallback control and only prepares a legal native range position.
  await page.evaluate(() => globalThis.__TW_API.reset())
  await page.click('#hero-center')
  await playTick(page)
  const attackSetup = await snapshot(page)
  const scout = attackSetup.creeps.find((creep) => creep.sender === 1 && creep.target === 0 && creep.kind === 0)
  if (!scout || scout.hp !== 45) throw new Error(`P1 attack setup missing Scout: ${JSON.stringify(attackSetup)}`)
  await page.keyboard.press('Space')
  const queuedAttack = await snapshot(page)
  const queuedAttackTelemetry = await page.evaluate(() => ({ ...globalThis.__HLW_P1.inputState }))
  if (queuedAttack.creeps.find((creep) => creep.id === scout.id)?.hp !== 45 || !queuedAttackTelemetry.attackQueued) {
    throw new Error(`P1 Space mutated before tick or failed to queue: ${JSON.stringify({ queuedAttack, queuedAttackTelemetry })}`)
  }
  await playTick(page)
  const attacked = await snapshot(page)
  const attackTelemetry = await page.evaluate(() => ({ ...globalThis.__HLW_P1.inputState }))
  if (attacked.creeps.find((creep) => creep.id === scout.id)?.hp !== 20 ||
      attackTelemetry.attackQueued || attackTelemetry.attackCommands !== 1 || attackTelemetry.lastSample?.attackResult !== 1) {
    throw new Error(`P1 sampled Space attack diverged: ${JSON.stringify({ attacked, attackTelemetry })}`)
  }

  // E uses the same queued input boundary for PHASE LANCE. No mutation occurs on
  // keydown; the following tick performs the public cast, pays 15, kills the
  // Scout for the existing 20 gold reward, and grants the frozen 50 XP.
  await page.evaluate(() => globalThis.__TW_API.reset())
  await page.click('#hero-center')
  await playTick(page)
  const abilitySetup = await snapshot(page)
  const abilityScout = abilitySetup.creeps.find((creep) => creep.sender === 1 && creep.target === 0 && creep.kind === 0)
  if (!abilityScout || abilityScout.hp !== 45) throw new Error(`P1 ability setup missing Scout: ${JSON.stringify(abilitySetup)}`)
  await page.keyboard.press('e')
  const queuedAbility = await snapshot(page)
  const queuedAbilityTelemetry = await page.evaluate(() => ({ ...globalThis.__HLW_P1.inputState }))
  if (queuedAbility.creeps.find((creep) => creep.id === abilityScout.id)?.hp !== 45 || !queuedAbilityTelemetry.abilityQueued) {
    throw new Error(`P1 E mutated before tick or failed to queue: ${JSON.stringify({ queuedAbility, queuedAbilityTelemetry })}`)
  }
  await playTick(page)
  const lanced = await snapshot(page)
  const abilityTelemetry = await page.evaluate(() => ({ ...globalThis.__HLW_P1.inputState }))
  if (lanced.creeps.some((creep) => creep.id === abilityScout.id) || lanced.players[0].gold !== 505 ||
      lanced.heroXP[0] !== 50 || abilityTelemetry.abilityQueued || abilityTelemetry.abilityCommands !== 1 ||
      abilityTelemetry.lastSample?.abilityResult !== 1) {
    throw new Error(`P1 sampled E ability diverged: ${JSON.stringify({ lanced, abilityTelemetry })}`)
  }

  const actionReceiptBefore = await replayReceipt(page)
  if (await page.evaluate(() => globalThis.__TW_API.nativeReplay()) !== 1) {
    throw new Error('P1 action native replay failed')
  }
  const actionReceiptAfter = await replayReceipt(page)
  if (!receiptsEqual(actionReceiptBefore, actionReceiptAfter)) {
    throw new Error(`P1 action replay diverged: ${JSON.stringify({ actionReceiptBefore, actionReceiptAfter })}`)
  }

  // The browser interval is only a scheduler for playTick. While Run match is
  // active ticks and native movement advance; after Pause both remain frozen.
  await page.evaluate(() => globalThis.__TW_API.reset())
  await page.keyboard.down('d')
  await page.click('#play')
  await page.waitForFunction(() => globalThis.__TW_API.snapshot().tick >= 2, { timeout: 3_000, polling: 25 })
  await page.click('#play')
  await page.keyboard.up('d')
  const pausedState = await snapshot(page)
  const pausedHero = await heroPosition(page)
  await new Promise((resolve) => setTimeout(resolve, 350))
  const stillPausedState = await snapshot(page)
  const stillPausedHero = await heroPosition(page)
  if (stillPausedState.tick !== pausedState.tick || JSON.stringify(stillPausedHero) !== JSON.stringify(pausedHero)) {
    throw new Error(`P1 pause allowed asynchronous simulation: ${JSON.stringify({ pausedState, stillPausedState, pausedHero, stillPausedHero })}`)
  }

  const final = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    keyHint: document.querySelector('.key-hint')?.textContent ?? '',
    input: { ...globalThis.__HLW_P1.inputState },
  }))
  if (!final.openRealm || !final.webgl2 || !final.keyHint.includes('WASD') || abortSeen || pageError) {
    throw new Error(`P1 final UI/WebGL proof failed: ${JSON.stringify({ final, abortSeen, pageError })}`)
  }

  console.log(`HLW_P1_EVIDENCE=${JSON.stringify({
    heldMovement: [initial, afterMove1, afterMove2],
    releaseStop: afterStopTick,
    queuedBasicDamage: [45, attacked.creeps.find((creep) => creep.id === scout.id)?.hp],
    queuedAbilityXP: lanced.heroXP[0],
    queuedAbilityGold: lanced.players[0].gold,
    movementReplayExact: receiptsEqual(movementReceiptBefore, movementReceiptAfter),
    actionReplayExact: receiptsEqual(actionReceiptBefore, actionReceiptAfter),
    pausedTickStable: stillPausedState.tick === pausedState.tick,
    finalWebGL2: final.webgl2,
  })}`)
  console.log('HERO_LINE_WARS_PLAYABLE_V1_P1_MATCH_CONTROL_LOOP=PASS')
} finally {
  await browser.close()
}
