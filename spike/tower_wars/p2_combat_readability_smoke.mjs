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

async function combatUi(page) {
  return page.evaluate(() => ({
    progression: document.getElementById('hero-progression')?.textContent ?? '',
    incoming: document.getElementById('incoming-status')?.textContent ?? '',
    basic: document.getElementById('basic-state')?.textContent ?? '',
    basicReady: document.getElementById('basic-state')?.dataset.ready ?? '',
    ability: document.getElementById('ability-state')?.textContent ?? '',
    abilityReady: document.getElementById('ability-state')?.dataset.ready ?? '',
    feed: document.getElementById('combat-feed')?.textContent ?? '',
    live: document.getElementById('combat-feed')?.getAttribute('aria-live') ?? '',
    creepHp: [...document.querySelectorAll('.field-card[data-player="0"] .creep-hp')].map((el) => el.textContent),
    creepLabels: [...document.querySelectorAll('.field-card[data-player="0"] .creep')].map((el) => el.getAttribute('aria-label')),
  }))
}

async function sendScoutToHuman(page) {
  const result = await page.evaluate(() => {
    if (globalThis.__TW_API.send(1, 0) !== 1) return 0
    return globalThis.__TW_API.step(1)
  })
  if (result !== 1) throw new Error('P2 failed to send/spawn Scout through public session boundary')
  const state = await snapshot(page)
  const scout = state.creeps.find((creep) => creep.sender === 1 && creep.target === 0 && creep.kind === 0)
  if (!scout || scout.hp !== 45) throw new Error(`P2 Scout setup diverged: ${JSON.stringify(state)}`)
  return scout.id
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

  const boot = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    p2: Boolean(globalThis.__HLW_P2?.combatPresentation),
    readout: Boolean(document.getElementById('combat-readout')),
    rawAttack: typeof Module._tw_session_hero_attack === 'function',
    rawAbility: typeof Module._tw_session_hero_ability === 'function',
    rawKillResolver: typeof Module._tw_session_resolve_hero_kill === 'function',
  }))
  const initialUi = await combatUi(page)
  if (!boot.openRealm || !boot.webgl2 || !boot.p2 || !boot.readout || boot.rawAttack || boot.rawAbility ||
      boot.rawKillResolver || initialUi.progression !== 'LV 1 · XP 0' || initialUi.basic !== 'BASIC · READY' ||
      initialUi.ability !== 'LANCE · READY' || initialUi.live !== 'polite' || abortSeen || pageError) {
    throw new Error(`P2 boot/readability boundary failed: ${JSON.stringify({ boot, initialUi, abortSeen, pageError })}`)
  }

  await page.evaluate(() => globalThis.__TW_API.reset())
  const firstScout = await sendScoutToHuman(page)
  let ui = await combatUi(page)
  if (!ui.creepHp.includes('45 HP') || !ui.creepLabels.includes(`Creep ${firstScout}, 45 HP`) ||
      !ui.incoming.includes('INCOMING · 1') || !ui.incoming.includes('LOW HP 45')) {
    throw new Error(`P2 incoming HP is not visibly/semantically readable: ${JSON.stringify(ui)}`)
  }

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  const reducedMotion = await page.evaluate(() => getComputedStyle(document.querySelector('.cell')).transitionDuration)
  if (reducedMotion !== '0s') {
    throw new Error(`P2 reduced-motion rule did not neutralize cell transition: ${reducedMotion}`)
  }

  // Visible fallback attack goes through the already-proven public actor-0 command.
  // P2 must only render the authoritative result after it exists.
  await page.click('#hero-attack')
  const afterFirstHit = await snapshot(page)
  ui = await combatUi(page)
  if (afterFirstHit.creeps.find((creep) => creep.id === firstScout)?.hp !== 20 || !ui.creepHp.includes('20 HP') ||
      ui.basicReady !== 'false' || ui.basic === 'BASIC · READY' ||
      !ui.feed.includes(`DAMAGE · CREEP #${firstScout} · HP 45→20`) || !ui.feed.includes('BASIC ACCEPTED')) {
    throw new Error(`P2 first-hit presentation diverged: ${JSON.stringify({ afterFirstHit, ui })}`)
  }

  const readyTick = afterFirstHit.heroReady[0]
  const delta = Math.max(0, readyTick - afterFirstHit.tick)
  if (await page.evaluate((ticks) => globalThis.__TW_API.step(ticks), delta) !== 1) {
    throw new Error('P2 failed to advance to basic readiness')
  }
  ui = await combatUi(page)
  if (ui.basicReady !== 'true' || ui.basic !== 'BASIC · READY') {
    throw new Error(`P2 basic readiness did not derive from authoritative tick: ${JSON.stringify(ui)}`)
  }

  // Falsify target attribution without touching simulation authority: make the
  // presentation snapshot ambiguous by adding a second disappeared incoming ID.
  // The authoritative XP delta still proves a hero kill occurred, but P2 must
  // not guess which disappeared ID was killed.
  await page.evaluate(() => {
    const previous = globalThis.__HLW_P2?.combatPresentation?.previous
    if (!previous) throw new Error('P2 missing prior presentation snapshot')
    previous.creeps.push({ id: 0x7ffffffe, target: 0, hp: 1 })
  })

  await page.click('#hero-attack')
  const firstKill = await snapshot(page)
  ui = await combatUi(page)
  if (firstKill.creeps.some((creep) => creep.id === firstScout) || firstKill.heroXP[0] !== 50 || firstKill.heroLevel[0] !== 1 ||
      !ui.feed.includes('KILL CONFIRMED') || ui.feed.includes(`KILL CONFIRMED · CREEP #${firstScout}`) ||
      !ui.feed.includes('XP +50') || ui.progression !== 'LV 1 · XP 50' || ui.incoming !== 'INCOMING · 0') {
    throw new Error(`P2 ambiguous kill/XP presentation diverged: ${JSON.stringify({ firstKill, ui })}`)
  }

  // A second authoritative kill through PHASE LANCE reaches the frozen H5 threshold.
  // With one unambiguous disappearance, presentation may identify the exact creep.
  const secondScout = await sendScoutToHuman(page)
  await page.click('#hero-ability')
  const leveled = await snapshot(page)
  ui = await combatUi(page)
  if (leveled.creeps.some((creep) => creep.id === secondScout) || leveled.heroXP[0] !== 100 ||
      leveled.heroLevel[0] !== 2 || leveled.heroBasicDamage[0] !== 30 || ui.progression !== 'LV 2 · XP 100' ||
      ui.abilityReady !== 'false' || ui.ability === 'LANCE · READY' ||
      !ui.feed.includes('PHASE LANCE ACCEPTED') || !ui.feed.includes(`KILL CONFIRMED · CREEP #${secondScout}`) ||
      !ui.feed.includes('XP +50') || !ui.feed.includes('LEVEL UP · LV 2')) {
    throw new Error(`P2 ability/level-up presentation diverged: ${JSON.stringify({ leveled, ui })}`)
  }

  const receiptBefore = await replayReceipt(page)
  if (await page.evaluate(() => globalThis.__TW_API.nativeReplay()) !== 1) {
    throw new Error('P2 native replay failed')
  }
  const receiptAfter = await replayReceipt(page)
  if (!receiptsEqual(receiptBefore, receiptAfter)) {
    throw new Error(`P2 replay diverged: ${JSON.stringify({ receiptBefore, receiptAfter })}`)
  }

  const final = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    live: document.getElementById('combat-feed')?.getAttribute('aria-live'),
    combatText: document.getElementById('combat-readout')?.textContent ?? '',
  }))
  if (!final.openRealm || !final.webgl2 || final.live !== 'polite' || !final.combatText.includes('LV 2 · XP 100') ||
      abortSeen || pageError) {
    throw new Error(`P2 final UI/WebGL proof failed: ${JSON.stringify({ final, abortSeen, pageError })}`)
  }

  console.log(`HLW_P2_EVIDENCE=${JSON.stringify({
    firstScoutVisibleHp: '45 HP',
    damagedScoutVisibleHp: '20 HP',
    ambiguousKillFeedback: 'KILL CONFIRMED',
    firstKillXP: firstKill.heroXP[0],
    leveledXP: leveled.heroXP[0],
    leveledHero: leveled.heroLevel[0],
    level2BasicDamage: leveled.heroBasicDamage[0],
    reducedMotion,
    replayExact: receiptsEqual(receiptBefore, receiptAfter),
    finalWebGL2: final.webgl2,
  })}`)
  console.log('HERO_LINE_WARS_PLAYABLE_V1_P2_COMBAT_READABILITY=PASS')
} finally {
  await browser.close()
}
