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

async function lifecycleUi(page) {
  return page.evaluate(() => ({
    phase: document.getElementById('lifecycle-state')?.textContent ?? '',
    phaseData: document.getElementById('lifecycle-state')?.dataset.phase ?? '',
    detail: document.getElementById('lifecycle-detail')?.textContent ?? '',
    botPace: document.getElementById('bot-pace')?.textContent ?? '',
    playText: document.getElementById('play')?.textContent ?? '',
    transitions: globalThis.__HLW_P4?.lifecyclePresentation?.transitions.map((entry) => ({ ...entry })) ?? [],
    botState: globalThis.__HLW_H8 ? {
      sendIndex: globalThis.__HLW_H8.botState.sendIndex,
      lastActTick: globalThis.__HLW_H8.botState.lastActTick,
      actions: globalThis.__HLW_H8.botState.actions.map((entry) => ({ ...entry })),
    } : null,
  }))
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
    lifecycle: Boolean(globalThis.__HLW_P4?.lifecyclePresentation),
    deriveLifecycle: typeof globalThis.__HLW_P4?.deriveLifecycle === 'function',
    lifecycleStrip: Boolean(document.getElementById('lifecycle-strip')),
    rawMatchMutation: typeof Module._tw_match_apply_action === 'function',
    rawSessionMutation: typeof Module._tw_session_apply_action === 'function',
    rawLeak: typeof Module._leak_creep === 'function',
  }))
  if (!boot.openRealm || !boot.webgl2 || !boot.lifecycle || !boot.deriveLifecycle || !boot.lifecycleStrip ||
      boot.rawMatchMutation || boot.rawSessionMutation || boot.rawLeak || abortSeen || pageError) {
    throw new Error(`P4 boot/authority boundary failed: ${JSON.stringify({ boot, abortSeen, pageError })}`)
  }

  await page.evaluate(() => globalThis.__TW_API.reset())
  const baseline = await snapshot(page)
  const baselineHero0 = await heroPosition(page, 0)
  const baselineHero1 = await heroPosition(page, 1)
  let ui = await lifecycleUi(page)
  if (baseline.tick !== 0 || baseline.eventCount !== 0 || baseline.terminal ||
      baseline.players[0].gold !== 500 || baseline.players[1].gold !== 500 ||
      baseline.players[0].income !== 10 || baseline.players[1].income !== 10 ||
      baseline.players[0].lives !== 20 || baseline.players[1].lives !== 20 ||
      ui.phase !== 'READY' || ui.phaseData !== 'READY' || ui.playText !== 'Start match' ||
      !ui.detail.includes('AUTHORITATIVE TICK 0')) {
    throw new Error(`P4 READY state diverged from frozen origin: ${JSON.stringify({ baseline, baselineHero0, baselineHero1, ui })}`)
  }

  // Physical Start transitions through START before the first scheduled authoritative
  // tick, then RUNNING. Bot actions remain at most one action per play tick.
  await page.click('#play')
  await page.waitForFunction(() => globalThis.__TW_API.snapshot().tick >= 3, { timeout: 3_000, polling: 20 })
  const running = await snapshot(page)
  ui = await lifecycleUi(page)
  const phases = ui.transitions.map((entry) => entry.phase)
  if (ui.phase !== 'RUNNING' || ui.playText !== 'Pause match' ||
      !phases.includes('READY') || !phases.includes('START') || !phases.includes('RUNNING') ||
      !ui.botState || ui.botState.lastActTick !== running.tick - 1 ||
      ui.botState.actions.length !== running.tick ||
      !ui.botPace.includes('MAX 1 ACTION / PLAY TICK')) {
    throw new Error(`P4 START/RUNNING or bot cadence diverged: ${JSON.stringify({ running, ui })}`)
  }

  // Pause freezes both authority and bot scheduling. No hidden catch-up may occur.
  await page.click('#play')
  const paused = await snapshot(page)
  const pausedUi = await lifecycleUi(page)
  const pausedActionCount = pausedUi.botState?.actions.length ?? -1
  await new Promise((resolve) => setTimeout(resolve, 350))
  const stillPaused = await snapshot(page)
  const stillPausedUi = await lifecycleUi(page)
  if (pausedUi.phase !== 'PAUSED' || pausedUi.playText !== 'Resume match' ||
      stillPaused.tick !== paused.tick || stillPaused.eventCount !== paused.eventCount ||
      stillPaused.stateHash !== paused.stateHash || stillPaused.logHash !== paused.logHash ||
      (stillPausedUi.botState?.actions.length ?? -2) !== pausedActionCount ||
      stillPausedUi.botState?.lastActTick !== pausedUi.botState?.lastActTick) {
    throw new Error(`P4 pause allowed authority/bot catch-up: ${JSON.stringify({ paused, pausedUi, stillPaused, stillPausedUi })}`)
  }

  // Resume schedules exactly one bot action for each subsequent play tick; it does
  // not compensate for the wall-clock time spent paused.
  await page.click('#play')
  await page.waitForFunction((tick) => globalThis.__TW_API.snapshot().tick >= tick + 2, { timeout: 3_000, polling: 20 }, paused.tick)
  await page.click('#play')
  const resumed = await snapshot(page)
  const resumedUi = await lifecycleUi(page)
  const tickDelta = resumed.tick - paused.tick
  const actionDelta = (resumedUi.botState?.actions.length ?? 0) - pausedActionCount
  if (resumedUi.phase !== 'PAUSED' || tickDelta < 2 || actionDelta !== tickDelta ||
      resumedUi.botState?.lastActTick !== resumed.tick - 1) {
    throw new Error(`P4 resume cadence/catch-up diverged: ${JSON.stringify({ paused, pausedUi, resumed, resumedUi, tickDelta, actionDelta })}`)
  }
  const firstFlowTransitions = resumedUi.transitions.map((entry) => ({ ...entry }))

  // Reset before the terminal scenario. The terminal itself is produced exclusively
  // through existing actor-1 public send commands plus the authoritative step path.
  await page.click('#reset')
  let staged = await snapshot(page)
  if (staged.stateHash !== baseline.stateHash || staged.logHash !== baseline.logHash || staged.tick !== 0 || staged.eventCount !== 0) {
    throw new Error(`P4 pre-terminal reset did not restore origin: ${JSON.stringify({ baseline, staged })}`)
  }

  for (let leak = 1; leak <= 6; leak++) {
    const sent = await page.evaluate(() => globalThis.__TW_API.send(1, 3))
    if (sent !== 1) throw new Error(`P4 public actor-1 Siege send ${leak} rejected unexpectedly`)
    const stepped = await page.evaluate(() => globalThis.__TW_API.step(100))
    if (stepped !== 1) throw new Error(`P4 authoritative leak step ${leak} failed`)
    staged = await snapshot(page)
    const expectedLives = 20 - leak * 3
    if (staged.terminal || staged.players[0].lives !== expectedLives) {
      throw new Error(`P4 staged leak ${leak} diverged: ${JSON.stringify({ expectedLives, staged })}`)
    }
  }

  if (await page.evaluate(() => globalThis.__TW_API.send(1, 3)) !== 1) {
    throw new Error('P4 final public actor-1 Siege send rejected unexpectedly')
  }
  if (await page.evaluate(() => globalThis.__TW_API.step(60)) !== 1) {
    throw new Error('P4 final Siege staging step failed')
  }
  staged = await snapshot(page)
  ui = await lifecycleUi(page)
  if (staged.terminal || staged.players[0].lives !== 2 || staged.activeCount < 1 || ui.phase !== 'PAUSED') {
    throw new Error(`P4 final terminal staging diverged: ${JSON.stringify({ staged, ui })}`)
  }

  // The last leak occurs while the real browser scheduler is RUNNING. Terminal
  // presentation reads only authoritative terminal/winner/loser state, and render()
  // stops the scheduler without adding any hidden terminal mutation.
  await page.click('#play')
  await page.waitForFunction(
    () => globalThis.__TW_API.snapshot().terminal === true && globalThis.__HLW_P4.lifecyclePresentation.phase === 'TERMINAL',
    { timeout: 4_000, polling: 20 },
  )
  const terminal = await snapshot(page)
  const terminalUi = await lifecycleUi(page)
  if (!terminal.terminal || terminal.winner !== 1 || terminal.loser !== 0 || terminal.players[0].lives !== 0 ||
      terminalUi.phase !== 'TERMINAL' || terminalUi.playText !== 'Restart match' ||
      !terminalUi.detail.includes('BOT WINS') || !terminalUi.detail.includes('YOU 0 LIVES')) {
    throw new Error(`P4 authoritative terminal presentation diverged: ${JSON.stringify({ terminal, terminalUi })}`)
  }

  const terminalTick = terminal.tick
  const terminalActionCount = terminalUi.botState?.actions.length ?? -1
  await new Promise((resolve) => setTimeout(resolve, 350))
  const terminalStable = await snapshot(page)
  const terminalStableUi = await lifecycleUi(page)
  if (terminalStable.tick !== terminalTick || terminalStable.stateHash !== terminal.stateHash || terminalStable.logHash !== terminal.logHash ||
      (terminalStableUi.botState?.actions.length ?? -2) !== terminalActionCount) {
    throw new Error(`P4 terminal failed to stop scheduler: ${JSON.stringify({ terminal, terminalStable, terminalUi, terminalStableUi })}`)
  }

  const receiptBefore = await replayReceipt(page)
  if (await page.evaluate(() => globalThis.__TW_API.nativeReplay()) !== 1) {
    throw new Error('P4 terminal native replay failed')
  }
  const receiptAfter = await replayReceipt(page)
  if (!receiptsEqual(receiptBefore, receiptAfter)) {
    throw new Error(`P4 terminal replay diverged: ${JSON.stringify({ receiptBefore, receiptAfter })}`)
  }

  // Restart through the lifecycle control must call the existing reset path and
  // reproduce the frozen deterministic origin exactly, including native heroes.
  await page.click('#play')
  const restarted = await snapshot(page)
  const restartedHero0 = await heroPosition(page, 0)
  const restartedHero1 = await heroPosition(page, 1)
  const restartedUi = await lifecycleUi(page)
  await new Promise((resolve) => setTimeout(resolve, 250))
  const restartedStable = await snapshot(page)
  if (restarted.stateHash !== baseline.stateHash || restarted.logHash !== baseline.logHash ||
      restarted.tick !== 0 || restarted.eventCount !== 0 || restarted.terminal ||
      JSON.stringify(restartedHero0) !== JSON.stringify(baselineHero0) ||
      JSON.stringify(restartedHero1) !== JSON.stringify(baselineHero1) ||
      restartedUi.phase !== 'READY' || restartedUi.playText !== 'Start match' ||
      !restartedUi.botState || restartedUi.botState.sendIndex !== 0 || restartedUi.botState.lastActTick !== -1 ||
      restartedUi.botState.actions.length !== 0 || restartedStable.tick !== 0 ||
      restartedStable.stateHash !== restarted.stateHash || restartedStable.logHash !== restarted.logHash) {
    throw new Error(`P4 restart did not reproduce frozen origin: ${JSON.stringify({ baseline, restarted, baselineHero0, restartedHero0, baselineHero1, restartedHero1, restartedUi, restartedStable })}`)
  }

  const final = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    phase: globalThis.__HLW_P4?.lifecyclePresentation?.phase,
  }))
  if (!final.openRealm || !final.webgl2 || final.phase !== 'READY' || abortSeen || pageError) {
    throw new Error(`P4 final WebGL/lifecycle proof failed: ${JSON.stringify({ final, abortSeen, pageError })}`)
  }

  console.log(`HLW_P4_EVIDENCE=${JSON.stringify({
    firstFlowTransitions,
    pausedTickStable: stillPaused.tick === paused.tick,
    pausedBotStable: (stillPausedUi.botState?.actions.length ?? -2) === pausedActionCount,
    resumeTickDelta: tickDelta,
    resumeActionDelta: actionDelta,
    terminal: { tick: terminal.tick, winner: terminal.winner, loser: terminal.loser, lives: terminal.players.map((player) => player.lives) },
    terminalSchedulerStopped: terminalStable.tick === terminal.tick,
    terminalReplayExact: receiptsEqual(receiptBefore, receiptAfter),
    restartStateExact: restarted.stateHash === baseline.stateHash && restarted.logHash === baseline.logHash,
    restartHeroesExact: JSON.stringify(restartedHero0) === JSON.stringify(baselineHero0) && JSON.stringify(restartedHero1) === JSON.stringify(baselineHero1),
    finalWebGL2: final.webgl2,
  })}`)
  console.log('HERO_LINE_WARS_PLAYABLE_V1_P4_MATCH_LIFECYCLE_BOT_PACING=PASS')
} finally {
  await browser.close()
}
