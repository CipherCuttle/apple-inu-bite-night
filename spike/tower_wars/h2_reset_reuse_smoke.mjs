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

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 25_000 })
  await page.waitForFunction(
    () => globalThis.__TW_READY === true && globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    { timeout: 30_000, polling: 100 },
  )

  const result = await page.evaluate(() => {
    const read = () => ({
      e0: Module._HLW_BrowserHeroEntity(0),
      e1: Module._HLW_BrowserHeroEntity(1),
      x0: Module._HLW_BrowserHeroX(0),
      y0: Module._HLW_BrowserHeroY(0),
      x1: Module._HLW_BrowserHeroX(1),
      y1: Module._HLW_BrowserHeroY(1),
    })
    const initial = read()
    const resets = []
    for (let i = 0; i < 64; i++) {
      const ok = Module._TW_BrowserReset()
      const state = read()
      resets.push({ ok, e0: state.e0, e1: state.e1 })
      if (ok !== 1 || state.e0 !== initial.e0 || state.e1 !== initial.e1) break
    }
    const afterBurst = read()
    const humanMove = Module._HLW_BrowserHeroMove(0, -80, -140)
    const botMove = Module._HLW_BrowserHeroMove(1, 80, 140)
    const step = Module._TW_BrowserStep(5)
    const afterMove = read()
    const session = globalThis.__TW_API.snapshot()
    return {
      initial,
      resets,
      afterBurst,
      humanMove,
      botMove,
      step,
      afterMove,
      heroOk: session.heroOk,
      nativeSyncOk: session.nativeSyncOk,
      openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
      webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    }
  })

  console.log(`HLW_H2_RESET_REUSE=${JSON.stringify(result)}`)
  if (result.initial.e0 <= 0 || result.initial.e1 <= 0 || result.initial.e0 === result.initial.e1) {
    throw new Error(`invalid initial hero edicts: ${JSON.stringify(result.initial)}`)
  }
  if (result.resets.length !== 64 || result.resets.some((r) => r.ok !== 1 ||
      r.e0 !== result.initial.e0 || r.e1 !== result.initial.e1)) {
    throw new Error('rapid reset consumed or replaced native hero edicts')
  }
  if (result.afterBurst.x0 !== -120 || result.afterBurst.y0 !== -140 ||
      result.afterBurst.x1 !== 120 || result.afterBurst.y1 !== 140) {
    throw new Error(`reset burst did not restore canonical starts: ${JSON.stringify(result.afterBurst)}`)
  }
  if (result.humanMove !== 1 || result.botMove !== 1 || result.step !== 1 ||
      result.afterMove.x0 !== -80 || result.afterMove.y0 !== -140 ||
      result.afterMove.x1 !== 80 || result.afterMove.y1 !== 140) {
    throw new Error(`hero subsystem unusable after reset burst: ${JSON.stringify(result)}`)
  }
  if (!result.heroOk || !result.nativeSyncOk || !result.openRealm || !result.webgl2 || abortSeen || pageError) {
    throw new Error(`runtime degraded during reset reuse proof: ${JSON.stringify(result)}`)
  }

  console.log(`HLW_H2_RESET_EVIDENCE=${JSON.stringify({
    stableEntities: [result.initial.e0, result.initial.e1],
    rapidResets: result.resets.length,
    postResetMovement: [[result.afterMove.x0, result.afterMove.y0], [result.afterMove.x1, result.afterMove.y1]],
    finalWebGL2: result.webgl2,
  })}`)
  console.log('HERO_LINE_WARS_H2_RESET_REUSE=PASS')
} finally {
  await browser.close()
}
