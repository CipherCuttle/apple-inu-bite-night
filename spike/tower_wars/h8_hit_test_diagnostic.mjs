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

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 25_000 })
  await page.waitForFunction(
    () => globalThis.__TW_READY === true && globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    { timeout: 30_000, polling: 100 },
  )

  await page.click('#hero-center')
  if (await page.evaluate(() => globalThis.__TW_API.playTick()) !== 1) {
    throw new Error('diagnostic first H8 play tick failed')
  }

  const diagnostic = await page.evaluate(() => {
    const element = document.getElementById('hero-attack')
    const rect = element.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const stack = document.elementsFromPoint(x, y).map((node) => ({
      tag: node.tagName,
      id: node.id,
      className: typeof node.className === 'string' ? node.className : null,
    }))
    const ancestors = []
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      const r = node.getBoundingClientRect()
      ancestors.push({
        tag: node.tagName,
        id: node.id,
        className: typeof node.className === 'string' ? node.className : null,
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        overflow: style.overflow,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        position: style.position,
        zIndex: style.zIndex,
        transform: style.transform,
        clip: style.clip,
        clipPath: style.clipPath,
        contain: style.contain,
        contentVisibility: style.contentVisibility,
      })
    }
    return {
      center: [x, y],
      stack,
      ancestors,
      activeElement: { tag: document.activeElement?.tagName ?? null, id: document.activeElement?.id ?? null },
      pointerLockElement: { tag: document.pointerLockElement?.tagName ?? null, id: document.pointerLockElement?.id ?? null },
      fullscreenElement: { tag: document.fullscreenElement?.tagName ?? null, id: document.fullscreenElement?.id ?? null },
      rootScrollTop: document.getElementById('tw-root')?.scrollTop ?? null,
      documentScrollTop: document.documentElement.scrollTop,
      viewport: [innerWidth, innerHeight],
      hero: globalThis.__TW_API.heroPosition(0),
      state: globalThis.__TW_API.snapshot(),
    }
  })

  console.log(`H8_HIT_DIAGNOSTIC=${JSON.stringify(diagnostic)}`)
} finally {
  await browser.close()
}
