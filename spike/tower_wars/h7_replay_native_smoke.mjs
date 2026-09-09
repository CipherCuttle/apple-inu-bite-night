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

async function replaySnapshot(page) {
  return page.evaluate(() => {
    const pointer = Module._HLW_BrowserReplaySnapshot()
    return JSON.parse(Module.UTF8ToString(pointer))
  })
}

async function expectOne(page, expression, label) {
  const value = await page.evaluate(expression)
  if (value !== 1) throw new Error(`${label}: expected 1, got ${value}`)
}

async function step(page, ticks, label) {
  const value = await page.evaluate((n) => Module._TW_BrowserStep(n), ticks)
  if (value !== 1) throw new Error(`${label}: step(${ticks}) rejected`)
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

  const surface = await page.evaluate(() => ({
    commandCount: typeof Module?._HLW_BrowserCommandCount === 'function',
    nativeReplay: typeof Module?._HLW_BrowserNativeReplayVerify === 'function',
    replaySnapshot: typeof Module?._HLW_BrowserReplaySnapshot === 'function',
    rawNativeHash: typeof Module?._HLW_OpenRealmNativeSemanticHash === 'function',
    rawHeroMove: typeof Module?._HLW_OpenRealmHeroCommandMove === 'function',
  }))
  console.log(`HLW_H7_SURFACE=${JSON.stringify(surface)}`)
  if (!surface.commandCount || !surface.nativeReplay || !surface.replaySnapshot ||
      surface.rawNativeHash || surface.rawHeroMove) {
    throw new Error(`H7 replay surface invalid: ${JSON.stringify(surface)}`)
  }

  await expectOne(page, () => Module._TW_BrowserReset(), 'H7 reset')

  // Both hero seats move through the ordinary H2 public authority before any
  // combat. These moves are the state that legacy tw_session replay could not
  // reconstruct and are therefore the key H7 differentiator.
  await expectOne(page, () => Module._HLW_BrowserHeroMove(0, -80, -82), 'H7 hero0 move')
  await expectOne(page, () => Module._HLW_BrowserHeroMove(1, -80, 82), 'H7 hero1 move')
  await step(page, 40, 'H7 settle hero movement')
  const moved = await page.evaluate(() => [
    [Module._HLW_BrowserHeroX(0), Module._HLW_BrowserHeroY(0)],
    [Module._HLW_BrowserHeroX(1), Module._HLW_BrowserHeroY(1)],
  ])
  if (JSON.stringify(moved) !== JSON.stringify([[-80, -82], [-80, 82]])) {
    throw new Error(`H7 native hero movement diverged: ${JSON.stringify(moved)}`)
  }

  // Player 0 kills one incoming Scout with the H3 basic command.
  await expectOne(page, () => Module._TW_BrowserSend(1, 0), 'H7 scout to player0')
  await step(page, 1, 'H7 spawn scout')
  await expectOne(page, () => Module._HLW_BrowserHeroAttack(0), 'H7 basic hit')
  await step(page, 4, 'H7 basic cooldown')
  await expectOne(page, () => Module._HLW_BrowserHeroAttack(0), 'H7 basic kill')

  // Player 1 kills one incoming Swarm through the H4 ability command.
  await expectOne(page, () => Module._TW_BrowserSend(0, 1), 'H7 swarm to player1')
  await step(page, 1, 'H7 spawn swarm')
  await expectOne(page, () => Module._HLW_BrowserHeroAbility(1), 'H7 lance hit')
  await step(page, 12, 'H7 lance cooldown')
  await expectOne(page, () => Module._HLW_BrowserHeroAbility(1), 'H7 lance kill')

  const progressed = await snapshot(page)
  if (progressed.heroXP[0] !== 50 || progressed.heroXP[1] !== 50 ||
      progressed.activeCount !== 0 || progressed.terminal) {
    throw new Error(`H7 combat/progression setup diverged: ${JSON.stringify(progressed)}`)
  }

  // Create real leak/lives/economy history and finish at a deterministic
  // terminal state while deliberately leaving one sibling Siege active. This
  // makes the final native-presentation digest nontrivial instead of hashing an
  // empty creep set.
  for (let i = 0; i < 3; i += 1) {
    await expectOne(page, () => Module._TW_BrowserSend(1, 3), `H7 first siege batch ${i}`)
  }
  await step(page, 80, 'H7 first siege leaks')
  let afterLeaks = await snapshot(page)
  if (afterLeaks.players[0].lives !== 11 || afterLeaks.terminal) {
    throw new Error(`H7 first leak batch diverged: ${JSON.stringify(afterLeaks)}`)
  }

  // Accrue enough deterministic income to send five simultaneous Sieges.
  await step(page, 140, 'H7 accrue terminal batch gold')
  for (let i = 0; i < 5; i += 1) {
    await expectOne(page, () => Module._TW_BrowserSend(1, 3), `H7 terminal siege batch ${i}`)
  }
  await step(page, 80, 'H7 terminal siege leaks')

  const terminal = await snapshot(page)
  const terminalReplay = await replaySnapshot(page)
  if (!terminal.terminal || terminal.winner !== 1 || terminal.loser !== 0 ||
      terminal.players[0].lives !== 0 || terminal.heroXP[0] !== 50 || terminal.heroXP[1] !== 50 ||
      terminal.activeCount !== 1 || terminalReplay.nativeCreepCount !== 1) {
    throw new Error(`H7 terminal setup diverged: ${JSON.stringify({ terminal, terminalReplay })}`)
  }

  // Terminal simulation must freeze native movement as well as tw_session.
  // Move is rejected; a post-terminal step is a safe no-op and must not advance
  // either the authoritative tick or the native semantic state.
  const terminalHeroPos = await page.evaluate(() => [
    Module._HLW_BrowserHeroX(0), Module._HLW_BrowserHeroY(0),
  ])
  const beforeFreeze = await replaySnapshot(page)
  const rejectedMove = await page.evaluate(() => Module._HLW_BrowserHeroMove(0, -40, -82))
  const noOpStep = await page.evaluate(() => Module._TW_BrowserStep(10))
  const afterFreeze = await replaySnapshot(page)
  const frozenHeroPos = await page.evaluate(() => [
    Module._HLW_BrowserHeroX(0), Module._HLW_BrowserHeroY(0),
  ])
  if (rejectedMove !== 0 || noOpStep !== 1 ||
      JSON.stringify(terminalHeroPos) !== JSON.stringify(frozenHeroPos) ||
      beforeFreeze.stateHash !== afterFreeze.stateHash ||
      beforeFreeze.sessionLogHash !== afterFreeze.sessionLogHash ||
      beforeFreeze.commandHash !== afterFreeze.commandHash ||
      beforeFreeze.nativeHash !== afterFreeze.nativeHash) {
    throw new Error(`H7 terminal freeze diverged: ${JSON.stringify({ rejectedMove, noOpStep, beforeFreeze, afterFreeze, terminalHeroPos, frozenHeroPos })}`)
  }

  // Legacy session replay must still pass, then H7 performs destructive
  // canonical reset + ordered public-command replay and proves session and
  // semantic native state reconstruct exactly.
  await expectOne(page, () => Module._TW_BrowserReplayVerify(), 'H7 session replay')
  const beforeNativeReplay = await replaySnapshot(page)
  const beforeState = await snapshot(page)
  if (beforeNativeReplay.commandCount <= beforeState.eventCount) {
    throw new Error(`H7 journal did not capture native-only movement: ${JSON.stringify({ beforeNativeReplay, eventCount: beforeState.eventCount })}`)
  }

  await expectOne(page, () => Module._HLW_BrowserNativeReplayVerify(), 'H7 native replay')
  await new Promise((resolve) => setTimeout(resolve, 250))

  const afterNativeReplay = await replaySnapshot(page)
  const replayedState = await snapshot(page)
  const replayedHeroPos = await page.evaluate(() => [
    [Module._HLW_BrowserHeroX(0), Module._HLW_BrowserHeroY(0)],
    [Module._HLW_BrowserHeroX(1), Module._HLW_BrowserHeroY(1)],
  ])
  const finalRuntime = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
  }))

  const exactReplay = beforeNativeReplay.commandCount === afterNativeReplay.commandCount &&
    beforeNativeReplay.commandHash === afterNativeReplay.commandHash &&
    beforeNativeReplay.nativeHash === afterNativeReplay.nativeHash &&
    beforeNativeReplay.nativeCreepCount === afterNativeReplay.nativeCreepCount &&
    beforeNativeReplay.stateHash === afterNativeReplay.stateHash &&
    beforeNativeReplay.sessionLogHash === afterNativeReplay.sessionLogHash &&
    JSON.stringify(beforeNativeReplay.hero0) === JSON.stringify(afterNativeReplay.hero0) &&
    JSON.stringify(beforeNativeReplay.hero1) === JSON.stringify(afterNativeReplay.hero1)

  if (!exactReplay || !replayedState.replayOk || !replayedState.terminal ||
      replayedState.winner !== 1 || replayedState.loser !== 0 ||
      replayedState.players[0].lives !== 0 || replayedState.activeCount !== 1 ||
      replayedState.heroXP[0] !== 50 || replayedState.heroXP[1] !== 50 ||
      JSON.stringify(replayedHeroPos) !== JSON.stringify([[-80, -82], [-80, 82]]) ||
      !finalRuntime.openRealm || !finalRuntime.webgl2 || abortSeen || pageError) {
    throw new Error(`H7 final replay proof failed: ${JSON.stringify({ exactReplay, beforeNativeReplay, afterNativeReplay, replayedState, replayedHeroPos, finalRuntime, abortSeen, pageError })}`)
  }

  console.log(`HLW_H7_EVIDENCE=${JSON.stringify({
    commandCount: afterNativeReplay.commandCount,
    sessionEventCount: replayedState.eventCount,
    commandHash: afterNativeReplay.commandHash,
    sessionLogHash: afterNativeReplay.sessionLogHash,
    stateHash: afterNativeReplay.stateHash,
    nativeHash: afterNativeReplay.nativeHash,
    nativeCreepCount: afterNativeReplay.nativeCreepCount,
    heroPositions: replayedHeroPos,
    heroXP: replayedState.heroXP,
    lives: replayedState.players.map((player) => player.lives),
    terminal: replayedState.terminal,
    winner: replayedState.winner,
    loser: replayedState.loser,
    postTerminalFrozen: true,
    sessionReplayOk: replayedState.replayOk,
    nativeReplayExact: exactReplay,
    finalWebGL2: finalRuntime.webgl2,
  })}`)
  console.log('HERO_LINE_WARS_H7_REPLAY_NATIVE_CONSISTENCY=PASS')
} finally {
  await browser.close()
}
