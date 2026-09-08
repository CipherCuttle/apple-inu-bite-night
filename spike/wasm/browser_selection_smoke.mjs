import puppeteer from 'puppeteer-core'
import { PNG } from 'pngjs'

const url = process.env.OPENREALM_URL ?? 'http://127.0.0.1:8765/openrealm.html'
const executablePath = process.env.CHROME
if (!executablePath) throw new Error('CHROME is required')

function countMissingMagenta(buffer) {
  const png = PNG.sync.read(buffer)
  let count = 0
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4
      const r = png.data[i]
      const g = png.data[i + 1]
      const b = png.data[i + 2]
      const a = png.data[i + 3]
      if (a > 0 && r >= 245 && g <= 10 && b >= 245) count++
    }
  }
  return count
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

let missingSelectionAssetSeen = false
let proceduralRingSeen = false
let abortSeen = false
let pageError = null

try {
  const page = await browser.newPage()
  page.on('console', (message) => {
    const text = message.text()
    console.log(`[selection:${message.type()}] ${text}`)
    if (text.includes('ReplaceableTextures\\Selection\\SelectionCircle')) missingSelectionAssetSeen = true
    if (text.includes('OPENREALM_SELECTION_RING=PROCEDURAL')) proceduralRingSeen = true
    if (text.includes('OPENREALM_ABORT=')) abortSeen = true
  })
  page.on('pageerror', (error) => {
    pageError = error
    console.error(`[selection:pageerror] ${error.stack ?? error.message}`)
  })

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 20_000 })
  await page.waitForFunction(
    () => globalThis.__OPENREALM_SDL_WEBGL_BOOT === true ||
      document.getElementById('status')?.textContent?.startsWith('OPENREALM_ABORT='),
    { timeout: 20_000, polling: 100 },
  )
  await new Promise((resolve) => setTimeout(resolve, 1_500))

  if (abortSeen || pageError) throw new Error('OpenRealm aborted before drag-selection smoke')
  if (!proceduralRingSeen) throw new Error('Procedural wasm selection ring was not installed')
  if (missingSelectionAssetSeen) throw new Error('Browser build still attempted to load retail WC3 selection-circle BLPs')

  const canvas = await page.$('#canvas')
  if (!canvas) throw new Error('OpenRealm canvas not found')
  const box = await canvas.boundingBox()
  if (!box || box.width < 100 || box.height < 100) throw new Error(`Invalid canvas bounds: ${JSON.stringify(box)}`)

  const before = await canvas.screenshot({ type: 'png' })
  const beforeMagenta = countMissingMagenta(before)

  const x1 = box.x + box.width * 0.15
  const y1 = box.y + box.height * 0.22
  const x2 = box.x + box.width * 0.85
  const y2 = box.y + box.height * 0.72
  await page.mouse.move(x1, y1)
  await page.mouse.down({ button: 'left' })
  await page.mouse.move(x2, y2, { steps: 16 })
  await page.mouse.up({ button: 'left' })
  await new Promise((resolve) => setTimeout(resolve, 500))

  if (abortSeen || pageError) throw new Error('OpenRealm aborted during drag-selection smoke')

  const after = await canvas.screenshot({ type: 'png' })
  const afterMagenta = countMissingMagenta(after)
  const evidence = {
    proceduralRingSeen,
    missingSelectionAssetSeen,
    beforeMagenta,
    afterMagenta,
    drag: { x1, y1, x2, y2 },
  }
  console.log(`OPENREALM_SELECTION_SMOKE_EVIDENCE=${JSON.stringify(evidence)}`)

  if (afterMagenta > beforeMagenta + 64) {
    throw new Error(`Drag selection introduced missing-texture magenta pixels: ${JSON.stringify(evidence)}`)
  }

  console.log('OPENREALM_SELECTION_SMOKE=PASS')
} finally {
  await browser.close()
}
