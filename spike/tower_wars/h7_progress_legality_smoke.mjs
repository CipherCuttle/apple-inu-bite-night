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

  await expectOne(page, () => Module._TW_BrowserReset(), 'H7 progress reset')

  // Put hero 0 exactly where coarse cell-only targeting and authoritative
  // progress-aware targeting disagree. A Scout at cell (0,3), progress 250 is
  // 25% from world x=-160 toward x=-120, so its true mirror position is -150.
  // Hero x=-60 is 90 units away (legal at range 96); the old coarse mirror at
  // x=-160 is 100 units away and would incorrectly reject the same attack.
  await expectOne(page, () => Module._HLW_BrowserHeroMove(0, -60, -82), 'H7 progress hero move')
  await expectOne(page, () => Module._TW_BrowserStep(16), 'H7 progress settle hero')

  const hero = await page.evaluate(() => [Module._HLW_BrowserHeroX(0), Module._HLW_BrowserHeroY(0)])
  if (JSON.stringify(hero) !== JSON.stringify([-60, -82])) {
    throw new Error(`H7 progress hero did not settle: ${JSON.stringify(hero)}`)
  }

  await expectOne(page, () => Module._TW_BrowserSend(1, 0), 'H7 progress scout send')
  await expectOne(page, () => Module._TW_BrowserStep(1), 'H7 progress scout spawn')

  const beforeAttack = await snapshot(page)
  const creep = beforeAttack.creeps[0]
  if (beforeAttack.activeCount !== 1 || !creep || creep.target !== 0 || creep.kind !== 0 ||
      creep.x !== 0 || creep.y !== 3 || creep.progress !== 250 || creep.hp !== 45) {
    throw new Error(`H7 authoritative partial-progress setup diverged: ${JSON.stringify(beforeAttack)}`)
  }

  await expectOne(page, () => Module._HLW_BrowserHeroAttack(0), 'H7 progress-aware range attack')
  const afterAttack = await snapshot(page)
  const hit = afterAttack.creeps[0]
  if (afterAttack.activeCount !== 1 || !hit || hit.id !== creep.id ||
      hit.progress !== 250 || hit.hp !== 20 || afterAttack.heroXP[0] !== 0) {
    throw new Error(`H7 progress-aware attack diverged: ${JSON.stringify(afterAttack)}`)
  }

  // Replay while the creep is still between cells. Exact semantic native hash
  // equality here proves H7 reconstructs the fractional presentation state,
  // not merely the same integer cell index.
  const beforeReplay = await replaySnapshot(page)
  await expectOne(page, () => Module._HLW_BrowserNativeReplayVerify(), 'H7 partial-progress native replay')
  const afterReplay = await replaySnapshot(page)
  const replayed = await snapshot(page)

  const exactReplay = beforeReplay.commandCount === afterReplay.commandCount &&
    beforeReplay.commandHash === afterReplay.commandHash &&
    beforeReplay.stateHash === afterReplay.stateHash &&
    beforeReplay.sessionLogHash === afterReplay.sessionLogHash &&
    beforeReplay.nativeHash === afterReplay.nativeHash &&
    beforeReplay.nativeCreepCount === afterReplay.nativeCreepCount

  const finalHero = await page.evaluate(() => [Module._HLW_BrowserHeroX(0), Module._HLW_BrowserHeroY(0)])
  const firstRuntime = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
  }))

  if (!exactReplay || replayed.activeCount !== 1 || !replayed.creeps[0] ||
      replayed.creeps[0].progress !== 250 || replayed.creeps[0].hp !== 20 ||
      JSON.stringify(finalHero) !== JSON.stringify([-60, -82]) ||
      !firstRuntime.openRealm || !firstRuntime.webgl2 || abortSeen || pageError) {
    throw new Error(`H7 partial-progress replay proof failed: ${JSON.stringify({ exactReplay, beforeReplay, afterReplay, replayed, finalHero, firstRuntime, abortSeen, pageError })}`)
  }

  // Hostile-review repair proof: an accepted build can reroute an already
  // partially-progressed creep. Native legality must reflect the new route
  // immediately, before any subsequent simulation step.
  await expectOne(page, () => Module._TW_BrowserReset(), 'H7 reroute reset')
  await expectOne(page, () => Module._HLW_BrowserHeroMove(0, -60, -82), 'H7 reroute hero move')
  await expectOne(page, () => Module._TW_BrowserStep(16), 'H7 reroute settle hero')
  await expectOne(page, () => Module._TW_BrowserSend(1, 0), 'H7 reroute scout send')
  await expectOne(page, () => Module._TW_BrowserStep(1), 'H7 reroute scout spawn')

  const beforeBuild = await snapshot(page)
  const beforeBuildNative = await replaySnapshot(page)
  if (beforeBuild.activeCount !== 1 || !beforeBuild.creeps[0] ||
      beforeBuild.creeps[0].x !== 0 || beforeBuild.creeps[0].y !== 3 ||
      beforeBuild.creeps[0].progress !== 250 || beforeBuild.creeps[0].hp !== 45) {
    throw new Error(`H7 reroute setup diverged: ${JSON.stringify(beforeBuild)}`)
  }

  // Default route from (0,3) advances east, projecting x=-150 at progress 250.
  // Blocking (1,3) is legal and forces deterministic north-first rerouting.
  // New authoritative projection is about (-160,-87.5), putting the same hero
  // outside basic range 96. Build must resync that projection before returning.
  await expectOne(page, () => Module._TW_BrowserBuild(0, 0, 1, 3), 'H7 route-changing build')
  const afterBuild = await snapshot(page)
  const afterBuildNative = await replaySnapshot(page)
  if (!afterBuild.nativeSyncOk || afterBuild.players[0].towerCount !== 1 ||
      afterBuild.activeCount !== 1 || !afterBuild.creeps[0] ||
      afterBuild.creeps[0].progress !== 250 || afterBuild.creeps[0].hp !== 45 ||
      beforeBuildNative.nativeHash === afterBuildNative.nativeHash) {
    throw new Error(`H7 build did not immediately resync rerouted native projection: ${JSON.stringify({ beforeBuild, beforeBuildNative, afterBuild, afterBuildNative })}`)
  }

  const rejectState = afterBuild.stateHash
  const rejectSessionLog = afterBuildNative.sessionLogHash
  const rejectCommandHash = afterBuildNative.commandHash
  const rejectNativeHash = afterBuildNative.nativeHash
  const rejectedAttack = await page.evaluate(() => Module._HLW_BrowserHeroAttack(0))
  const afterRejectedAttack = await snapshot(page)
  const afterRejectedNative = await replaySnapshot(page)
  if (rejectedAttack !== 0 || afterRejectedAttack.creeps[0]?.hp !== 45 ||
      afterRejectedAttack.heroXP[0] !== 0 || afterRejectedAttack.stateHash !== rejectState ||
      afterRejectedNative.sessionLogHash !== rejectSessionLog ||
      afterRejectedNative.commandHash !== rejectCommandHash ||
      afterRejectedNative.nativeHash !== rejectNativeHash) {
    throw new Error(`H7 post-build stale-legality rejection failed: ${JSON.stringify({ rejectedAttack, afterBuild, afterBuildNative, afterRejectedAttack, afterRejectedNative })}`)
  }

  const rerouteBeforeReplay = await replaySnapshot(page)
  await expectOne(page, () => Module._HLW_BrowserNativeReplayVerify(), 'H7 reroute native replay')
  const rerouteAfterReplay = await replaySnapshot(page)
  const rerouteReplayed = await snapshot(page)
  const rerouteReplayExact = rerouteBeforeReplay.commandCount === rerouteAfterReplay.commandCount &&
    rerouteBeforeReplay.commandHash === rerouteAfterReplay.commandHash &&
    rerouteBeforeReplay.stateHash === rerouteAfterReplay.stateHash &&
    rerouteBeforeReplay.sessionLogHash === rerouteAfterReplay.sessionLogHash &&
    rerouteBeforeReplay.nativeHash === rerouteAfterReplay.nativeHash &&
    rerouteBeforeReplay.nativeCreepCount === rerouteAfterReplay.nativeCreepCount

  const finalRuntime = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
  }))
  if (!rerouteReplayExact || rerouteReplayed.creeps[0]?.progress !== 250 ||
      rerouteReplayed.creeps[0]?.hp !== 45 || rerouteReplayed.players[0].towerCount !== 1 ||
      !finalRuntime.openRealm || !finalRuntime.webgl2 || abortSeen || pageError) {
    throw new Error(`H7 reroute replay/stability failed: ${JSON.stringify({ rerouteReplayExact, rerouteBeforeReplay, rerouteAfterReplay, rerouteReplayed, finalRuntime, abortSeen, pageError })}`)
  }

  console.log(`HLW_H7_PROGRESS_EVIDENCE=${JSON.stringify({
    cell: [0, 3],
    progressMilli: 250,
    currentCellWorldX: -160,
    interpolatedWorldX: -150,
    heroWorldX: -60,
    coarseDistance: 100,
    authoritativeDistance: 90,
    range: 96,
    attackAccepted: true,
    remainingHp: replayed.creeps[0].hp,
    nativeReplayExact: exactReplay,
    routeChangingBuildResynced: beforeBuildNative.nativeHash !== afterBuildNative.nativeHash,
    stalePostBuildAttackRejected: rejectedAttack === 0,
    rerouteReplayExact,
    finalWebGL2: finalRuntime.webgl2,
  })}`)
  console.log('HERO_LINE_WARS_H7_PROGRESS_LEGALITY=PASS')
} finally {
  await browser.close()
}
