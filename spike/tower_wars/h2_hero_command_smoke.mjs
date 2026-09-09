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
const serverSpawns = []
const serverMoves = []
const commands = []
const clients = []
const draws = []

function parse(text) {
  let m = text.match(/HLW_NATIVE_HERO_SERVER=SPAWN actor=(\d+) ent=(\d+) world=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (m) serverSpawns.push({ actor: +m[1], ent: +m[2], x: +m[3], y: +m[4] })
  m = text.match(/HLW_NATIVE_HERO_SERVER=MOVE actor=(\d+) ent=(\d+) world=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?) goal=(ACTIVE|REACHED)/)
  if (m) serverMoves.push({ actor: +m[1], ent: +m[2], x: +m[3], y: +m[4], goal: m[5] })
  m = text.match(/HLW_NATIVE_HERO_COMMAND=PASS actor=(\d+) ent=(\d+) goal=(-?\d+),(-?\d+)/)
  if (m) commands.push({ actor: +m[1], ent: +m[2], x: +m[3], y: +m[4] })
  m = text.match(/HLW_NATIVE_HERO_CLIENT=PASS actor=(\d+) ent=(\d+) world=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?) model=(\d+)/)
  if (m) clients.push({ actor: +m[1], ent: +m[2], x: +m[3], y: +m[4], model: +m[5] })
  m = text.match(/HLW_NATIVE_HERO_DRAW=PASS actor=(\d+) ent=(\d+) world=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?) scale=(-?\d+(?:\.\d+)?)/)
  if (m) draws.push({ actor: +m[1], ent: +m[2], x: +m[3], y: +m[4], scale: +m[5] })
}

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`timeout waiting for ${label}: ${JSON.stringify({ serverSpawns, serverMoves, commands, clients, draws })}`)
}

async function heroState(page) {
  return page.evaluate(() => ({
    e0: Module._HLW_BrowserHeroEntity(0),
    x0: Module._HLW_BrowserHeroX(0),
    y0: Module._HLW_BrowserHeroY(0),
    e1: Module._HLW_BrowserHeroEntity(1),
    x1: Module._HLW_BrowserHeroX(1),
    y1: Module._HLW_BrowserHeroY(1),
    session: globalThis.__TW_API.snapshot(),
  }))
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
    heroExports: [
      '_HLW_BrowserHeroMove', '_HLW_BrowserHeroEntity',
      '_HLW_BrowserHeroX', '_HLW_BrowserHeroY',
    ].every((name) => typeof Module?.[name] === 'function'),
    rawHeroMutationExported: typeof Module?._HLW_OpenRealmHeroCommandMove === 'function',
    botOnlyMoveExported: typeof Module?._HLW_BrowserBotMove === 'function',
  }))
  const initial = await heroState(page)
  console.log(`HLW_H2_BOOT=${JSON.stringify({ ...boot, initial })}`)

  if (!boot.openRealm || !boot.towerWars || !boot.webgl2 || !boot.heroExports ||
      boot.rawHeroMutationExported || boot.botOnlyMoveExported || !initial.session.heroOk ||
      !initial.session.nativeSyncOk || abortSeen || pageError) {
    throw new Error(`H2 boot/authority boundary failed: ${JSON.stringify({ boot, initial })}`)
  }
  if (initial.e0 <= 0 || initial.e1 <= 0 || initial.e0 === initial.e1 ||
      initial.x0 !== -120 || initial.y0 !== -140 || initial.x1 !== 120 || initial.y1 !== 140) {
    throw new Error(`unexpected native hero initialization: ${JSON.stringify(initial)}`)
  }

  await waitFor(() => serverSpawns.some((h) => h.actor === 0 && h.ent === initial.e0), 5_000, 'hero 0 server spawn')
  await waitFor(() => serverSpawns.some((h) => h.actor === 1 && h.ent === initial.e1), 5_000, 'hero 1 server spawn')
  await waitFor(() => clients.some((h) => h.actor === 0 && h.ent === initial.e0), 5_000, 'hero 0 client snapshot')
  await waitFor(() => clients.some((h) => h.actor === 1 && h.ent === initial.e1), 5_000, 'hero 1 client snapshot')
  await waitFor(() => draws.some((h) => h.actor === 0 && h.ent === initial.e0), 5_000, 'hero 0 renderer draw')
  await waitFor(() => draws.some((h) => h.actor === 1 && h.ent === initial.e1), 5_000, 'hero 1 renderer draw')

  const commandCountBeforeInvalid = commands.length
  const invalid = await page.evaluate(() => ({
    actor: Module._HLW_BrowserHeroMove(-1, -80, -140),
    humanCrossLane: Module._HLW_BrowserHeroMove(0, -80, 40),
    botCrossLane: Module._HLW_BrowserHeroMove(1, 80, -40),
    humanOutOfBounds: Module._HLW_BrowserHeroMove(0, -999, -140),
  }))
  const afterInvalid = await heroState(page)
  console.log(`HLW_H2_INVALID=${JSON.stringify({ invalid, afterInvalid })}`)
  if (Object.values(invalid).some((value) => value !== 0) || commands.length !== commandCountBeforeInvalid ||
      afterInvalid.x0 !== initial.x0 || afterInvalid.y0 !== initial.y0 ||
      afterInvalid.x1 !== initial.x1 || afterInvalid.y1 !== initial.y1) {
    throw new Error('invalid hero command mutated or passed authority boundary')
  }

  const accepted = await page.evaluate(() => ({
    human: Module._HLW_BrowserHeroMove(0, -80, -140),
    bot: Module._HLW_BrowserHeroMove(1, 80, 140),
  }))
  if (accepted.human !== 1 || accepted.bot !== 1) {
    throw new Error(`shared hero move command rejected: ${JSON.stringify(accepted)}`)
  }
  if (await page.evaluate(() => Module._TW_BrowserStep(5)) !== 1) {
    throw new Error('deterministic hero movement tick failed')
  }
  const moved = await heroState(page)
  console.log(`HLW_H2_NATIVE_MOVE=${JSON.stringify({ accepted, moved })}`)
  if (moved.x0 !== -80 || moved.y0 !== -140 || moved.x1 !== 80 || moved.y1 !== 140 ||
      !moved.session.heroOk || !moved.session.nativeSyncOk) {
    throw new Error(`native hero movement diverged: ${JSON.stringify(moved)}`)
  }

  await waitFor(
    () => clients.some((h) => h.ent === initial.e0 && (h.x !== initial.x0 || h.y !== initial.y0)),
    5_000,
    'moved hero 0 client snapshot',
  )
  await waitFor(
    () => clients.some((h) => h.ent === initial.e1 && (h.x !== initial.x1 || h.y !== initial.y1)),
    5_000,
    'moved hero 1 client snapshot',
  )
  await waitFor(
    () => draws.some((h) => h.ent === initial.e0 && (h.x !== initial.x0 || h.y !== initial.y0)),
    5_000,
    'moved hero 0 renderer draw',
  )
  await waitFor(
    () => draws.some((h) => h.ent === initial.e1 && (h.x !== initial.x1 || h.y !== initial.y1)),
    5_000,
    'moved hero 1 renderer draw',
  )

  if (await page.evaluate(() => Module._TW_BrowserReset()) !== 1) {
    throw new Error('deterministic reset before repeat failed')
  }
  const repeatedStart = await heroState(page)
  if (repeatedStart.x0 !== -120 || repeatedStart.y0 !== -140 ||
      repeatedStart.x1 !== 120 || repeatedStart.y1 !== 140) {
    throw new Error(`hero reset did not restore deterministic starts: ${JSON.stringify(repeatedStart)}`)
  }
  const repeatedCommands = await page.evaluate(() => [
    Module._HLW_BrowserHeroMove(0, -80, -140),
    Module._HLW_BrowserHeroMove(1, 80, 140),
  ])
  if (repeatedCommands.some((value) => value !== 1) ||
      await page.evaluate(() => Module._TW_BrowserStep(5)) !== 1) {
    throw new Error('repeat hero movement sequence failed')
  }
  const repeated = await heroState(page)
  if (repeated.x0 !== moved.x0 || repeated.y0 !== moved.y0 ||
      repeated.x1 !== moved.x1 || repeated.y1 !== moved.y1) {
    throw new Error(`same commands did not reproduce hero positions: ${JSON.stringify({ moved, repeated })}`)
  }

  const final = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    rawHeroMutationExported: typeof Module?._HLW_OpenRealmHeroCommandMove === 'function',
    state: globalThis.__TW_API.snapshot(),
  }))
  if (!final.openRealm || !final.webgl2 || final.rawHeroMutationExported ||
      !final.state.heroOk || !final.state.nativeSyncOk || abortSeen || pageError) {
    throw new Error(`OpenRealm did not remain stable through H2: ${JSON.stringify(final)}`)
  }

  console.log(`HLW_H2_EVIDENCE=${JSON.stringify({
    firstEntities: [initial.e0, initial.e1],
    initialPositions: [[initial.x0, initial.y0], [initial.x1, initial.y1]],
    movedPositions: [[moved.x0, moved.y0], [moved.x1, moved.y1]],
    humanAndBotSameCommand: accepted.human === 1 && accepted.bot === 1,
    invalidCommandsFailClosed: Object.values(invalid).every((value) => value === 0),
    sameEntitiesReachedClient: clients.some((h) => h.ent === initial.e0) && clients.some((h) => h.ent === initial.e1),
    sameEntitiesReachedRenderer: draws.some((h) => h.ent === initial.e0) && draws.some((h) => h.ent === initial.e1),
    deterministicRepeat: repeated.x0 === moved.x0 && repeated.y0 === moved.y0 && repeated.x1 === moved.x1 && repeated.y1 === moved.y1,
    finalWebGL2: final.webgl2,
  })}`)
  console.log('HERO_LINE_WARS_H2_HERO_ENTITY_COMMAND=PASS')
} finally {
  await browser.close()
}
