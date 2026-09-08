import puppeteer from 'puppeteer-core'

const url = process.env.OPENREALM_URL ?? 'http://127.0.0.1:8765/openrealm.html'
const executablePath = process.env.CHROME

if (!executablePath) {
  console.error('CHROME is required')
  process.exit(2)
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
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

try {
  const page = await browser.newPage()
  page.on('console', (message) => {
    const text = message.text()
    console.log(`[page:${message.type()}] ${text}`)
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

  // A marker that flashes before the first renderer frame is not enough.
  // Let several requestAnimationFrame turns execute and reject an immediate abort.
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

  console.log('OPENREALM_SDL_WEBGL_BOOT=PASS')
} finally {
  await browser.close()
}
