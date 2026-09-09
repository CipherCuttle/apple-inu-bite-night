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
const server = []
const client = []
const draws = []
const removals = []

function parse(text) {
  let m = text.match(/HLW_NATIVE_CREEP_SERVER=(SPAWN|SYNC) creep=(\d+) ent=(\d+) cell=(\d+),(\d+) world=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (m) server.push({ op: m[1], creep: +m[2], ent: +m[3], x: +m[4], y: +m[5], wx: +m[6], wy: +m[7] })
  m = text.match(/HLW_NATIVE_CREEP_CLIENT=PASS ent=(\d+) world=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?) model=(\d+)/)
  if (m) client.push({ ent: +m[1], wx: +m[2], wy: +m[3], model: +m[4] })
  m = text.match(/HLW_NATIVE_CREEP_DRAW=PASS ent=(\d+) world=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?) scale=(-?\d+(?:\.\d+)?)/)
  if (m) draws.push({ ent: +m[1], wx: +m[2], wy: +m[3], scale: +m[4] })
  m = text.match(/HLW_NATIVE_CREEP_SERVER=REMOVE creep=(\d+) ent=(\d+)/)
  if (m) removals.push({ creep: +m[1], ent: +m[2] })
}

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`timeout waiting for ${label}: ${JSON.stringify({ server, client, draws, removals })}`)
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
    rawMatchMutationExported: typeof globalThis.Module?._tw_match_apply_action === 'function',
    state: globalThis.__TW_API.snapshot(),
  }))
  console.log(`HLW_H1_BOOT=${JSON.stringify(boot)}`)
  if (!boot.openRealm || !boot.towerWars || !boot.webgl2 || boot.rawMatchMutationExported ||
      !boot.state.nativeSyncOk || abortSeen || pageError) {
    throw new Error(`H1 boot/authority boundary failed: ${JSON.stringify(boot)}`)
  }

  if (await page.evaluate(() => globalThis.__TW_API.send(1, 3)) !== 1) {
    throw new Error('authoritative Siege send rejected')
  }
  if (await page.evaluate(() => globalThis.__TW_API.step(1)) !== 1) {
    throw new Error('authoritative spawn tick failed')
  }
  const spawnedState = await page.evaluate(() => globalThis.__TW_API.snapshot())
  if (!spawnedState.nativeSyncOk || spawnedState.activeCount !== 1) {
    throw new Error(`session/native sync failed after spawn: ${JSON.stringify(spawnedState)}`)
  }

  await waitFor(() => server.some((e) => e.op === 'SPAWN'), 5_000, 'native server spawn')
  const spawn = server.find((e) => e.op === 'SPAWN')
  await waitFor(() => client.some((e) => e.ent === spawn.ent), 5_000, 'same edict in client snapshot')
  await waitFor(() => draws.some((e) => e.ent === spawn.ent), 5_000, 'same edict in R_DrawEntity')

  const clientSpawn = client.find((e) => e.ent === spawn.ent)
  const drawSpawn = draws.find((e) => e.ent === spawn.ent)
  console.log(`HLW_H1_NATIVE_SPAWN=${JSON.stringify({ session: spawnedState.creeps[0], spawn, clientSpawn, drawSpawn })}`)
  if (spawn.creep !== spawnedState.creeps[0].id || spawn.x !== spawnedState.creeps[0].x ||
      spawn.y !== spawnedState.creeps[0].y || clientSpawn.model <= 0 || drawSpawn.scale <= 0) {
    throw new Error('native edict does not correspond to authoritative session creep')
  }

  const drawCountBeforeMove = draws.length
  if (await page.evaluate(() => globalThis.__TW_API.step(8)) !== 1) {
    throw new Error('authoritative movement step failed')
  }
  const movedState = await page.evaluate(() => globalThis.__TW_API.snapshot())
  if (!movedState.nativeSyncOk || movedState.activeCount !== 1) {
    throw new Error(`native sync failed after movement: ${JSON.stringify(movedState)}`)
  }

  await waitFor(
    () => server.some((e) => e.ent === spawn.ent && (e.x !== spawn.x || e.y !== spawn.y)),
    5_000,
    'native edict movement from session state',
  )
  const serverMoved = [...server].reverse().find((e) => e.ent === spawn.ent && (e.x !== spawn.x || e.y !== spawn.y))
  await waitFor(
    () => client.some((e) => e.ent === spawn.ent && (e.wx !== clientSpawn.wx || e.wy !== clientSpawn.wy)),
    5_000,
    'moved native snapshot on client',
  )
  await waitFor(
    () => draws.slice(drawCountBeforeMove).some((e) => e.ent === spawn.ent && (e.wx !== drawSpawn.wx || e.wy !== drawSpawn.wy)),
    5_000,
    'moved native entity draw',
  )
  const clientMoved = [...client].reverse().find((e) => e.ent === spawn.ent && (e.wx !== clientSpawn.wx || e.wy !== clientSpawn.wy))
  const drawMoved = [...draws].reverse().find((e) => e.ent === spawn.ent && (e.wx !== drawSpawn.wx || e.wy !== drawSpawn.wy))
  console.log(`HLW_H1_NATIVE_MOVE=${JSON.stringify({ session: movedState.creeps[0], serverMoved, clientMoved, drawMoved })}`)
  if (serverMoved.x !== movedState.creeps[0].x || serverMoved.y !== movedState.creeps[0].y) {
    throw new Error('OpenRealm native movement diverged from session creep cell')
  }

  let retiredState = movedState
  for (let i = 0; i < 30 && retiredState.activeCount; i++) {
    if (await page.evaluate(() => globalThis.__TW_API.step(5)) !== 1) {
      throw new Error('authoritative retirement progression failed')
    }
    retiredState = await page.evaluate(() => globalThis.__TW_API.snapshot())
  }
  if (retiredState.activeCount !== 0 || !retiredState.nativeSyncOk) {
    throw new Error(`session creep did not retire cleanly: ${JSON.stringify(retiredState)}`)
  }
  await waitFor(() => removals.some((e) => e.ent === spawn.ent && e.creep === spawn.creep), 5_000, 'native mirror retirement')

  const final = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    towerWars: globalThis.__TW_READY === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    state: globalThis.__TW_API.snapshot(),
  }))
  if (!final.openRealm || !final.towerWars || !final.webgl2 || !final.state.nativeSyncOk || abortSeen || pageError) {
    throw new Error(`OpenRealm did not remain stable through H1: ${JSON.stringify(final)}`)
  }

  console.log(`HLW_H1_EVIDENCE=${JSON.stringify({
    creepId: spawn.creep,
    entityNumber: spawn.ent,
    firstCell: [spawn.x, spawn.y],
    movedCell: [serverMoved.x, serverMoved.y],
    sameEntityOnClient: clientSpawn.ent === spawn.ent,
    sameEntityDrawn: drawSpawn.ent === spawn.ent,
    retired: removals.some((e) => e.ent === spawn.ent),
    finalWebGL2: final.webgl2,
  })}`)
  console.log('HERO_LINE_WARS_H1_NATIVE_ENTITY_BRIDGE=PASS')
} finally {
  await browser.close()
}
