import puppeteer from 'puppeteer-core'
import { PNG } from 'pngjs'

const url = process.env.OPENREALM_URL ?? 'http://127.0.0.1:8765/openrealm.html'
const executablePath = process.env.CHROME

if (!executablePath) {
  console.error('CHROME is required')
  process.exit(2)
}

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
let serverSpawnSeen = false
let clientBeginSeen = false
let scenePrepSeen = false
let sceneRenderSeen = false
let sceneDrawSeen = false
let unitDrawSeen = false
const clientXs = []
const renderXs = []

function recordSmokeMarker(text) {
  if (text.includes('OPENREALM_MAP_UNIT_SMOKE_SERVER=PASS')) serverSpawnSeen = true
  if (text.includes('OPENREALM_MAP_UNIT_SMOKE_CLIENT_BEGIN=PASS')) clientBeginSeen = true
  if (text.includes('OPENREALM_MAP_SCENE_CLIENT_PREP=PASS')) scenePrepSeen = true
  if (text.includes('OPENREALM_MAP_SCENE_RENDER=PASS')) sceneRenderSeen = true
  if (text.includes('OPENREALM_MAP_SCENE_DRAW=PASS')) sceneDrawSeen = true
  if (text.includes('OPENREALM_MAP_UNIT_DRAW=PASS')) unitDrawSeen = true

  let match = text.match(/OPENREALM_MAP_UNIT_CLIENT .*?x=(-?\d+(?:\.\d+)?)/)
  if (match) clientXs.push(Number(match[1]))
  match = text.match(/OPENREALM_MAP_UNIT_RENDER .*?x=(-?\d+(?:\.\d+)?)/)
  if (match) renderXs.push(Number(match[1]))
}

function moved(xs, minimum = 12) {
  if (xs.length < 2) return false
  return Math.max(...xs) - Math.min(...xs) >= minimum
}

async function waitForSmoke(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (serverSpawnSeen && clientBeginSeen && scenePrepSeen && sceneRenderSeen &&
        sceneDrawSeen && unitDrawSeen && moved(clientXs) && moved(renderXs)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`MAP_UNIT_SMOKE evidence incomplete: ${JSON.stringify({
    serverSpawnSeen,
    clientBeginSeen,
    scenePrepSeen,
    sceneRenderSeen,
    sceneDrawSeen,
    unitDrawSeen,
    clientXs,
    renderXs,
  })}`)
}

function inspectCanvasPng(buffer) {
  const png = PNG.sync.read(buffer)
  let nonDark = 0
  let minX = png.width
  let minY = png.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4
      const r = png.data[i]
      const g = png.data[i + 1]
      const b = png.data[i + 2]
      const a = png.data[i + 3]
      if (a > 0 && r + g + b >= 30) {
        nonDark++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  const total = png.width * png.height
  const bboxWidth = maxX >= minX ? maxX - minX + 1 : 0
  const bboxHeight = maxY >= minY ? maxY - minY + 1 : 0
  return {
    width: png.width,
    height: png.height,
    nonDark,
    nonDarkRatio: total ? nonDark / total : 0,
    bboxWidth,
    bboxHeight,
    bboxWidthRatio: png.width ? bboxWidth / png.width : 0,
    bboxHeightRatio: png.height ? bboxHeight / png.height : 0,
  }
}

try {
  const page = await browser.newPage()
  page.on('console', (message) => {
    const text = message.text()
    console.log(`[page:${message.type()}] ${text}`)
    recordSmokeMarker(text)
    if (text.includes('OPENREALM_ABORT=')) abortSeen = true
  })
  page.on('pageerror', (error) => {
    pageError = error
    console.error(`[pageerror] ${error.stack ?? error.message}`)
  })
  page.on('requestfailed', (request) => {
    console.error(`[requestfailed] ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`)
  })

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 20_000 })

  await page.waitForFunction(
    () => globalThis.__OPENREALM_SDL_WEBGL_BOOT === true ||
      document.getElementById('status')?.textContent?.startsWith('OPENREALM_ABORT='),
    { timeout: 20_000, polling: 100 },
  )

  const first = await page.evaluate(() => ({
    ready: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    status: document.getElementById('status')?.textContent ?? '',
    width: document.getElementById('canvas')?.width ?? 0,
    height: document.getElementById('canvas')?.height ?? 0,
  }))
  console.log(`OPENREALM_BROWSER_STATE=${JSON.stringify(first)}`)

  if (!first.ready || abortSeen || pageError) {
    throw new Error(`OpenRealm did not reach stable SDL/WebGL boot: ${JSON.stringify(first)}`)
  }

  await new Promise((resolve) => setTimeout(resolve, 2_000))

  const stable = await page.evaluate(() => ({
    ready: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    status: document.getElementById('status')?.textContent ?? '',
    context: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
  }))
  console.log(`OPENREALM_BROWSER_STABLE=${JSON.stringify(stable)}`)

  if (!stable.ready || !stable.context || abortSeen || pageError) {
    throw new Error(`OpenRealm browser boot did not remain stable: ${JSON.stringify(stable)}`)
  }

  await waitForSmoke(15_000)
  if (abortSeen || pageError) {
    throw new Error('OpenRealm aborted after MAP_UNIT_SMOKE evidence was observed')
  }

  const canvas = await page.$('#canvas')
  if (!canvas) throw new Error('OpenRealm canvas not found for visual proof')
  const pngBuffer = await canvas.screenshot({ type: 'png' })
  const visual = inspectCanvasPng(pngBuffer)
  console.log(`OPENREALM_VISUAL_EVIDENCE=${JSON.stringify(visual)}`)

  if (visual.nonDarkRatio < 0.03 || visual.bboxWidthRatio < 0.25 || visual.bboxHeightRatio < 0.15) {
    throw new Error(`OpenRealm scene did not occupy a meaningful visible canvas area: ${JSON.stringify(visual)}`)
  }

  const evidence = {
    serverSpawnSeen,
    clientBeginSeen,
    scenePrepSeen,
    sceneRenderSeen,
    sceneDrawSeen,
    unitDrawSeen,
    clientXs,
    renderXs,
    clientMoved: moved(clientXs),
    rendererMoved: moved(renderXs),
    visual,
  }
  console.log(`OPENREALM_MAP_UNIT_SMOKE_EVIDENCE=${JSON.stringify(evidence)}`)
  console.log('OPENREALM_MAP_UNIT_SMOKE=PASS')
  console.log('OPENREALM_SDL_WEBGL_BOOT=PASS')
} finally {
  await browser.close()
}
