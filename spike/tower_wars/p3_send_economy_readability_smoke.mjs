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
const consoleLines = []

async function snapshot(page) {
  return page.evaluate(() => globalThis.__TW_API.snapshot())
}

async function replayReceipt(page) {
  return page.evaluate(() => JSON.parse(Module.UTF8ToString(Module._HLW_BrowserReplaySnapshot())))
}

function receiptsEqual(a, b) {
  return a.commandCount === b.commandCount &&
    a.commandHash === b.commandHash &&
    a.stateHash === b.stateHash &&
    a.sessionLogHash === b.sessionLogHash &&
    a.nativeHash === b.nativeHash &&
    a.nativeCreepCount === b.nativeCreepCount
}

async function economyUi(page) {
  return page.evaluate(() => ({
    own: document.getElementById('own-economy')?.textContent ?? '',
    pressure: document.getElementById('rival-pressure')?.textContent ?? '',
    feedback: document.getElementById('send-feedback')?.textContent ?? '',
    feedbackLive: document.getElementById('send-feedback')?.getAttribute('aria-live') ?? '',
    buttons: [...document.querySelectorAll('[data-send]')].map((button) => ({
      kind: Number(button.dataset.send),
      text: button.textContent,
      cost: Number(button.dataset.cost),
      incomeGain: Number(button.dataset.incomeGain),
      affordable: button.dataset.affordable,
      ready: button.dataset.ready,
      disabled: button.disabled,
      title: button.title,
    })),
    message: document.getElementById('message')?.textContent ?? '',
  }))
}

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
  page.on('console', (message) => {
    const text = message.text()
    consoleLines.push(text)
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

  const boot = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    economyReadout: Boolean(document.getElementById('economy-readout')),
    sendHelper: typeof globalThis.__TW_API?.sendCreep === 'function',
    creepCountExport: typeof Module._TW_BrowserCreepCount === 'function',
    costExport: typeof Module._TW_BrowserCreepCost === 'function',
    incomeExport: typeof Module._TW_BrowserCreepIncomeGain === 'function',
    maxCreepsExport: typeof Module._TW_BrowserMaxCreeps === 'function',
    rawMatchMutation: typeof Module._tw_match_apply_action === 'function',
    rawSessionMutation: typeof Module._tw_session_apply_action === 'function',
    catalog: [...Array(Module._TW_BrowserCreepCount())].map((_, kind) => ({
      kind,
      cost: Module._TW_BrowserCreepCost(kind),
      incomeGain: Module._TW_BrowserCreepIncomeGain(kind),
    })),
    maxCreeps: Module._TW_BrowserMaxCreeps(),
  }))
  if (!boot.openRealm || !boot.webgl2 || !boot.economyReadout || !boot.sendHelper ||
      !boot.creepCountExport || !boot.costExport || !boot.incomeExport || !boot.maxCreepsExport ||
      boot.rawMatchMutation || boot.rawSessionMutation || boot.maxCreeps !== 256 ||
      JSON.stringify(boot.catalog) !== JSON.stringify([
        { kind: 0, cost: 40, incomeGain: 4 },
        { kind: 1, cost: 60, incomeGain: 6 },
        { kind: 2, cost: 90, incomeGain: 9 },
        { kind: 3, cost: 130, incomeGain: 13 },
      ]) || abortSeen || pageError) {
    throw new Error(`P3 boot/catalog authority failed: ${JSON.stringify({ boot, abortSeen, pageError })}`)
  }

  await page.evaluate(() => globalThis.__TW_API.reset())
  let state = await snapshot(page)
  let ui = await economyUi(page)
  if (state.players[0].gold !== 500 || state.players[0].income !== 10 || state.players[0].lives !== 20 ||
      !ui.own.includes('GOLD 500') || !ui.own.includes('INCOME 10') || !ui.own.includes('LIVES 20') ||
      !ui.pressure.includes('0 ACTIVE') || !ui.pressure.includes('RIVAL LIVES 20') || ui.feedbackLive !== 'polite' ||
      ui.buttons.length !== 4 || ui.buttons.some((button, kind) =>
        button.cost !== boot.catalog[kind].cost || button.incomeGain !== boot.catalog[kind].incomeGain ||
        button.affordable !== 'true' || button.ready !== 'true' || button.disabled ||
        !button.text.includes(`${boot.catalog[kind].cost}G`) ||
        !button.text.includes(`+${boot.catalog[kind].incomeGain} INC`) || !button.text.includes('READY'))) {
    throw new Error(`P3 initial economy presentation diverged: ${JSON.stringify({ state, ui })}`)
  }

  // Physical keyboard send: Digit1 must enter the same public _TW_BrowserSend boundary.
  await page.keyboard.press('Digit1')
  state = await snapshot(page)
  ui = await economyUi(page)
  if (state.players[0].gold !== 460 || state.players[0].income !== 14 || state.pendingCount !== 1 ||
      !ui.feedback.includes('SEND ACCEPTED · Scout · -40G · +4 INC') ||
      !ui.message.includes('keyboard send accepted · Scout') ||
      !consoleLines.some((line) => line.includes('TOWER_WARS_BROWSER_SEND=PASS actor=0 creep=0'))) {
    throw new Error(`P3 keyboard send did not prove public authoritative economy transition: ${JSON.stringify({ state, ui })}`)
  }

  if (await page.evaluate(() => globalThis.__TW_API.step(1)) !== 1) {
    throw new Error('P3 failed to spawn accepted keyboard send')
  }
  state = await snapshot(page)
  ui = await economyUi(page)
  const outboundScout = state.creeps.find((creep) => creep.sender === 0 && creep.target === 1 && creep.kind === 0)
  if (!outboundScout || outboundScout.hp !== 45 || !ui.pressure.includes('1 ACTIVE') ||
      !ui.pressure.includes('OUTBOUND HP 45') || !ui.pressure.includes('RIVAL LIVES 20')) {
    throw new Error(`P3 rival pressure did not derive from authoritative active creep state: ${JSON.stringify({ state, ui })}`)
  }

  // Physical pointer sends use the same helper/public command and their displayed
  // consequence is measured from the accepted before/after authoritative snapshots.
  await page.click('[data-send="3"]')
  state = await snapshot(page)
  ui = await economyUi(page)
  if (state.players[0].gold !== 330 || state.players[0].income !== 27 ||
      !ui.feedback.includes('SEND ACCEPTED · Siege · -130G · +13 INC') ||
      !ui.message.includes('pointer send accepted · Siege') ||
      !consoleLines.some((line) => line.includes('TOWER_WARS_BROWSER_SEND=PASS actor=0 creep=3'))) {
    throw new Error(`P3 pointer send did not prove public authoritative economy transition: ${JSON.stringify({ state, ui })}`)
  }

  await page.click('[data-send="3"]')
  await page.click('[data-send="3"]')
  state = await snapshot(page)
  ui = await economyUi(page)
  const siegeButton = ui.buttons.find((button) => button.kind === 3)
  if (state.players[0].gold !== 70 || state.players[0].income !== 53 || !siegeButton ||
      siegeButton.affordable !== 'false' || siegeButton.ready !== 'false' || siegeButton.disabled ||
      !siegeButton.text.includes('130G') || !siegeButton.text.includes('+13 INC') ||
      !siegeButton.text.includes('NEED 60G')) {
    throw new Error(`P3 unaffordable readiness did not derive from authoritative gold: ${JSON.stringify({ state, ui })}`)
  }

  // Readiness is advisory presentation only: the control remains physically callable,
  // and the authoritative public command must reject without mutating economy/log state.
  const beforeReject = state
  await page.click('[data-send="3"]')
  const afterReject = await snapshot(page)
  ui = await economyUi(page)
  if (afterReject.players[0].gold !== beforeReject.players[0].gold ||
      afterReject.players[0].income !== beforeReject.players[0].income ||
      afterReject.pendingCount !== beforeReject.pendingCount || afterReject.eventCount !== beforeReject.eventCount ||
      afterReject.stateHash !== beforeReject.stateHash || afterReject.logHash !== beforeReject.logHash ||
      afterReject.lastMatchResult !== 7 || !ui.feedback.includes('SEND REJECTED · Siege · AUTHORITATIVE') ||
      !ui.message.includes('pointer send rejected · Siege') ||
      !consoleLines.some((line) => line.includes('TOWER_WARS_BROWSER_SEND=REJECT actor=0 creep=3'))) {
    throw new Error(`P3 authoritative rejection/fail-closed proof diverged: ${JSON.stringify({ beforeReject, afterReject, ui })}`)
  }

  const receiptBefore = await replayReceipt(page)
  if (await page.evaluate(() => globalThis.__TW_API.nativeReplay()) !== 1) {
    throw new Error('P3 native replay failed')
  }
  const receiptAfter = await replayReceipt(page)
  if (!receiptsEqual(receiptBefore, receiptAfter)) {
    throw new Error(`P3 replay diverged: ${JSON.stringify({ receiptBefore, receiptAfter })}`)
  }

  const final = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    economyText: document.getElementById('economy-readout')?.textContent ?? '',
  }))
  if (!final.openRealm || !final.webgl2 || !final.economyText.includes('GOLD 70') || abortSeen || pageError) {
    throw new Error(`P3 final UI/WebGL proof failed: ${JSON.stringify({ final, abortSeen, pageError })}`)
  }

  console.log(`HLW_P3_EVIDENCE=${JSON.stringify({
    catalog: boot.catalog,
    keyboardScout: { gold: 460, income: 14 },
    rivalPressure: '1 ACTIVE / 45 HP',
    unaffordableSiege: { gold: 70, need: 60, disabled: false },
    rejectionFailClosed: true,
    replayExact: receiptsEqual(receiptBefore, receiptAfter),
    finalWebGL2: final.webgl2,
  })}`)
  console.log('HERO_LINE_WARS_PLAYABLE_V1_P3_SEND_ECONOMY_READABILITY=PASS')
} finally {
  await browser.close()
}
