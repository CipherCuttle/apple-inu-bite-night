import puppeteer from 'puppeteer-core'
import { PNG } from 'pngjs'

const url = process.env.OPENREALM_URL ?? 'http://127.0.0.1:8765/openrealm.html'
const executablePath = process.env.CHROME
if (!executablePath) throw new Error('CHROME is required')

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  timeout: 45_000,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu-sandbox',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-gl=angle',
    '--use-angle=swiftshader-webgl',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,720',
  ],
})

let pageError = null
let abortSeen = false
const markers = []

function inspectPng(buffer) {
  const png = PNG.sync.read(buffer)
  let nonDark = 0
  let colorful = 0
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4
      const r = png.data[i]
      const g = png.data[i + 1]
      const b = png.data[i + 2]
      const a = png.data[i + 3]
      if (!a) continue
      if (r + g + b >= 45) nonDark++
      if (Math.max(r, g, b) - Math.min(r, g, b) >= 24) colorful++
    }
  }
  const total = png.width * png.height
  return {
    width: png.width,
    height: png.height,
    nonDarkRatio: total ? nonDark / total : 0,
    colorfulRatio: total ? colorful / total : 0,
  }
}

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
  page.on('console', (message) => {
    const text = message.text()
    console.log(`[page:${message.type()}] ${text}`)
    if (text.startsWith('TOWER_WARS_') || text.startsWith('OPENREALM_')) markers.push(text)
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
    towerWarsReady: globalThis.__TW_READY === true,
    openRealmReady: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    rawMatchMutationExported: typeof globalThis.Module?._tw_match_apply_action === 'function',
    sessionMutationExports: [
      '_TW_BrowserReset', '_TW_BrowserBuild', '_TW_BrowserSend', '_TW_BrowserStep',
      '_TW_BrowserReplayVerify', '_TW_BrowserSnapshot',
    ].every((name) => typeof globalThis.Module?.[name] === 'function'),
    cells: document.querySelectorAll('.cell').length,
  }))
  console.log(`TOWER_WARS_G8_BOOT=${JSON.stringify(boot)}`)
  if (!boot.towerWarsReady || !boot.openRealmReady || !boot.webgl2 ||
      boot.rawMatchMutationExported || !boot.sessionMutationExports || boot.cells !== 126 ||
      abortSeen || pageError) {
    throw new Error(`G8 boot/authority boundary failed: ${JSON.stringify(boot)}`)
  }

  const initial = await page.evaluate(() => globalThis.__TW_API.snapshot())
  if (initial.players[0].pathLength !== 9 || initial.players[1].pathLength !== 9 ||
      initial.players[0].gold !== 500 || initial.players[1].gold !== 500 ||
      initial.players[0].lives !== 20 || initial.players[1].lives !== 20) {
    throw new Error(`unexpected initial Tower Wars state: ${JSON.stringify(initial)}`)
  }

  const buildOk = await page.evaluate(() => globalThis.__TW_API.build(0, 0, 4, 3))
  const built = await page.evaluate(() => globalThis.__TW_API.snapshot())
  const visibleBuild = await page.evaluate(() => ({
    towers: document.querySelectorAll('[data-player="0"] .tower').length,
    pathCells: document.querySelectorAll('[data-player="0"] .cell.path').length,
  }))
  console.log(`TOWER_WARS_G8_BUILD=${JSON.stringify({ buildOk, initialPath: initial.players[0].pathLength, path: built.players[0].pathLength, gold: built.players[0].gold, ...visibleBuild })}`)
  if (buildOk !== 1 || built.players[0].towerCount !== 1 || built.players[0].gold !== 450 ||
      built.players[0].pathLength <= initial.players[0].pathLength || visibleBuild.towers !== 1 ||
      visibleBuild.pathCells !== built.players[0].pathLength) {
    throw new Error('tower placement did not visibly and authoritatively reroute the line')
  }

  const sendOk = await page.evaluate(() => globalThis.__TW_API.send(1, 3))
  const sent = await page.evaluate(() => globalThis.__TW_API.snapshot())
  console.log(`TOWER_WARS_G8_SEND=${JSON.stringify({ sendOk, gold: sent.players[1].gold, income: sent.players[1].income, pending: sent.pendingCount })}`)
  if (sendOk !== 1 || sent.players[1].gold !== 370 || sent.players[1].income !== 23 || sent.pendingCount !== 1) {
    throw new Error(`send/economy transition failed: ${JSON.stringify(sent)}`)
  }

  if (await page.evaluate(() => globalThis.__TW_API.step(1)) !== 1) throw new Error('first simulation tick failed')
  const firstActive = await page.evaluate(() => globalThis.__TW_API.snapshot())
  const firstVisible = await page.evaluate(() => document.querySelectorAll('[data-player="0"] .creep').length)
  if (firstActive.activeCount < 1 || firstVisible < 1) {
    throw new Error(`sent creep did not become visibly active: ${JSON.stringify(firstActive)}`)
  }
  const firstCreep = firstActive.creeps[0]

  const activeShot = await page.$('#tw-root')
  if (!activeShot) throw new Error('Tower Wars UI root missing')
  const activePng = await activeShot.screenshot({ type: 'png', path: 'tower-wars-active.png' })
  const activeVisual = inspectPng(activePng)
  if (activeVisual.nonDarkRatio < 0.25 || activeVisual.colorfulRatio < 0.01) {
    throw new Error(`Tower Wars vertical slice is not meaningfully visible: ${JSON.stringify(activeVisual)}`)
  }

  for (let i = 0; i < 8; i++) {
    if (await page.evaluate(() => globalThis.__TW_API.step(1)) !== 1) throw new Error('movement tick failed')
  }
  const moved = await page.evaluate(() => globalThis.__TW_API.snapshot())
  if (moved.activeCount < 1) throw new Error('siege retired before movement evidence could be observed')
  const movedCreep = moved.creeps[0]
  const movementChanged = firstCreep.x !== movedCreep.x || firstCreep.y !== movedCreep.y || firstCreep.progress !== movedCreep.progress
  console.log(`TOWER_WARS_G8_MOVEMENT=${JSON.stringify({ firstCreep, movedCreep, movementChanged })}`)
  if (!movementChanged) throw new Error('authoritative creep did not move')

  const beforeIncomeTick = await page.evaluate(() => globalThis.__TW_API.snapshot())
  const toIncomeBoundary = 20 - (beforeIncomeTick.tick % 20)
  if (toIncomeBoundary > 0 && toIncomeBoundary < 20) {
    if (await page.evaluate((ticks) => globalThis.__TW_API.step(ticks), toIncomeBoundary) !== 1) {
      throw new Error('income-boundary step failed')
    }
  } else if (beforeIncomeTick.tick < 20) {
    if (await page.evaluate(() => globalThis.__TW_API.step(20)) !== 1) throw new Error('income step failed')
  }
  const paid = await page.evaluate(() => globalThis.__TW_API.snapshot())
  console.log(`TOWER_WARS_G8_INCOME=${JSON.stringify({ tick: paid.tick, botGold: paid.players[1].gold, botIncome: paid.players[1].income })}`)
  if (paid.tick < 20 || paid.players[1].gold < 393 || paid.players[1].income !== 23) {
    throw new Error(`periodic income not observed: ${JSON.stringify(paid)}`)
  }

  let leaked = paid
  for (let guard = 0; guard < 50 && leaked.players[0].lives === 20; guard++) {
    if (await page.evaluate(() => globalThis.__TW_API.step(5)) !== 1) throw new Error('leak progression step failed')
    leaked = await page.evaluate(() => globalThis.__TW_API.snapshot())
  }
  console.log(`TOWER_WARS_G8_LEAK=${JSON.stringify({ tick: leaked.tick, lives: leaked.players[0].lives, active: leaked.activeCount, stateHash: leaked.stateHash })}`)
  if (leaked.players[0].lives >= 20 || leaked.activeCount !== 0) {
    throw new Error(`creep did not resolve through kill/leak semantics with life change: ${JSON.stringify(leaked)}`)
  }

  const beforeReplayHash = leaked.stateHash
  const beforeReplayLog = leaked.logHash
  const replayOk = await page.evaluate(() => globalThis.__TW_API.replay())
  const replayed = await page.evaluate(() => globalThis.__TW_API.snapshot())
  console.log(`TOWER_WARS_G8_REPLAY=${JSON.stringify({ replayOk, replayFlag: replayed.replayOk, stateHash: replayed.stateHash, logHash: replayed.logHash, events: replayed.eventCount })}`)
  if (replayOk !== 1 || !replayed.replayOk || replayed.stateHash !== beforeReplayHash || replayed.logHash !== beforeReplayLog) {
    throw new Error('browser replay verification failed or mutated authoritative state')
  }

  const finalRuntime = await page.evaluate(() => ({
    openRealmReady: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    towerWarsReady: globalThis.__TW_READY === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    status: document.getElementById('tw-status')?.textContent ?? '',
  }))
  if (!finalRuntime.openRealmReady || !finalRuntime.towerWarsReady || !finalRuntime.webgl2 || abortSeen || pageError) {
    throw new Error(`OpenRealm did not remain stable through G8: ${JSON.stringify(finalRuntime)}`)
  }

  const evidence = {
    initialPath: initial.players[0].pathLength,
    reroutedPath: built.players[0].pathLength,
    senderIncome: sent.players[1].income,
    movementChanged,
    defenderLivesBefore: 20,
    defenderLivesAfter: leaked.players[0].lives,
    replayOk: replayed.replayOk,
    stateHash: replayed.stateHash,
    logHash: replayed.logHash,
    events: replayed.eventCount,
    visual: activeVisual,
    finalRuntime,
  }
  console.log(`TOWER_WARS_G8_EVIDENCE=${JSON.stringify(evidence)}`)
  console.log('TOWER_WARS_G8_BROWSER_VERTICAL_SLICE=PASS')
} finally {
  await browser.close()
}
