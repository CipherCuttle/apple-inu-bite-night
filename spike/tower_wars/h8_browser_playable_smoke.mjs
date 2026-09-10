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

async function heroPosition(page, actor) {
  return page.evaluate((seat) => globalThis.__TW_API.heroPosition(seat), actor)
}

async function playTicks(page, count) {
  const result = await page.evaluate((ticks) => globalThis.__TW_API.playTicks(ticks), count)
  if (result !== 1) throw new Error(`playTicks(${count}) failed`)
}

async function replayReceipt(page) {
  return page.evaluate(() => {
    if (typeof Module._HLW_BrowserReplaySnapshot !== 'function') return null
    return JSON.parse(Module.UTF8ToString(Module._HLW_BrowserReplaySnapshot()))
  })
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
    playableApi: Boolean(globalThis.__TW_API?.playTick && globalThis.__TW_API?.botAct && globalThis.__TW_API?.nativeReplay),
    controls: ['hero-center', 'hero-attack', 'hero-ability', 'play', 'step', 'replay'].every((id) => Boolean(document.getElementById(id))),
    nativeReplay: typeof Module._HLW_BrowserNativeReplayVerify === 'function',
    rawAttack: typeof Module._tw_session_hero_attack === 'function',
    rawAbility: typeof Module._tw_session_hero_ability === 'function',
    rawMove: typeof Module._HLW_OpenRealmHeroCommandMove === 'function',
  }))
  const initial = await snapshot(page)
  const initialHero = await heroPosition(page, 0)
  if (!boot.openRealm || !boot.webgl2 || !boot.playableApi || !boot.controls || !boot.nativeReplay ||
      boot.rawAttack || boot.rawAbility || boot.rawMove || !initial.nativeSyncOk || !initial.heroOk ||
      JSON.stringify(initialHero) !== JSON.stringify([-120, -140]) || abortSeen || pageError) {
    throw new Error(`H8 boot/authority boundary failed: ${JSON.stringify({ boot, initial, initialHero, abortSeen, pageError })}`)
  }

  // Human uses the actual H8 control surface. The first deterministic bot turn
  // sends a Scout through actor 1's ordinary send boundary, then one authoritative
  // play tick spawns it into the human lane while native hero movement advances.
  await page.click('#hero-center')
  if (await page.evaluate(() => globalThis.__TW_API.playTick()) !== 1) {
    throw new Error('first H8 play tick failed')
  }
  const firstIncoming = await snapshot(page)
  const movedHero = await heroPosition(page, 0)
  const scout = firstIncoming.creeps.find((creep) => creep.sender === 1 && creep.target === 0 && creep.kind === 0)
  if (!scout || firstIncoming.tick !== 1 || scout.hp !== 45 || scout.progress !== 250 ||
      JSON.stringify(movedHero) === JSON.stringify(initialHero)) {
    throw new Error(`H8 opening human-move/bot-send diverged: ${JSON.stringify({ firstIncoming, movedHero })}`)
  }

  // Basic combat through the visible control: 45 -> 20, wait exactly the frozen
  // cadence through playable ticks, then kill for the H5 combat reward + XP.
  await page.click('#hero-attack')
  const damagedScout = await snapshot(page)
  if (damagedScout.creeps.find((creep) => creep.id === scout.id)?.hp !== 20 || damagedScout.heroXP[0] !== 0) {
    throw new Error(`H8 first basic hit diverged: ${JSON.stringify(damagedScout)}`)
  }
  await playTicks(page, 4)
  await page.click('#hero-attack')
  const killedScout = await snapshot(page)
  if (killedScout.creeps.some((creep) => creep.id === scout.id) ||
      killedScout.heroXP[0] !== 50 || killedScout.players[0].gold !== 520 ||
      killedScout.players[0].lives !== 20) {
    throw new Error(`H8 hero kill/reward/XP diverged: ${JSON.stringify(killedScout)}`)
  }

  // With its first send retired, the deterministic bot chooses its second send:
  // a Swarm. The human uses PHASE LANCE through the UI, proving ability cost and
  // authoritative damage in the same playable loop, then intentionally lets the
  // damaged Swarm leak so lives semantics are exercised rather than hidden.
  if (await page.evaluate(() => globalThis.__TW_API.playTick()) !== 1) {
    throw new Error('H8 second bot send play tick failed')
  }
  const swarmState = await snapshot(page)
  const swarm = swarmState.creeps.find((creep) => creep.sender === 1 && creep.target === 0 && creep.kind === 1)
  if (!swarm || swarm.hp !== 70) throw new Error(`H8 bot Swarm missing: ${JSON.stringify(swarmState)}`)

  await page.click('#hero-ability')
  const lanced = await snapshot(page)
  if (lanced.creeps.find((creep) => creep.id === swarm.id)?.hp !== 10 ||
      lanced.heroXP[0] !== 50 || lanced.players[0].gold !== 505) {
    throw new Error(`H8 PHASE LANCE diverged: ${JSON.stringify(lanced)}`)
  }

  // Cross the frozen income boundary with no human economy action on that tick.
  // Bot decisions cannot mutate human gold, so the exact delta must equal income.
  if (lanced.tick > 19) throw new Error(`H8 setup unexpectedly passed income boundary at tick ${lanced.tick}`)
  await playTicks(page, 19 - lanced.tick)
  const beforeIncome = await snapshot(page)
  if (beforeIncome.tick !== 19) throw new Error(`H8 income setup tick diverged: ${beforeIncome.tick}`)
  if (await page.evaluate(() => globalThis.__TW_API.playTick()) !== 1) throw new Error('H8 income tick failed')
  const afterIncome = await snapshot(page)
  if (afterIncome.tick !== 20 || afterIncome.players[0].gold !== beforeIncome.players[0].gold + beforeIncome.players[0].income) {
    throw new Error(`H8 authoritative income diverged: ${JSON.stringify({ beforeIncome, afterIncome })}`)
  }

  let leaked = afterIncome
  for (let i = 0; i < 20 && leaked.players[0].lives === 20; i++) {
    if (await page.evaluate(() => globalThis.__TW_API.playTick()) !== 1) throw new Error('H8 leak advance failed')
    leaked = await snapshot(page)
  }
  if (leaked.players[0].lives !== 19 || leaked.creeps.some((creep) => creep.id === swarm.id)) {
    throw new Error(`H8 damaged Swarm did not leak exactly once: ${JSON.stringify(leaked)}`)
  }
  const settledHuman = await heroPosition(page, 0)
  if (JSON.stringify(settledHuman) !== JSON.stringify([-120, -82])) {
    throw new Error(`H8 human movement never reached lane center: ${JSON.stringify(settledHuman)}`)
  }

  // Human send through the visible roster. This must change only sender economy
  // immediately; the next playable tick lets the bot make its own deterministic
  // choice and spawns the human Scout into the rival lane.
  const beforeHumanSend = await snapshot(page)
  await page.click('[data-send="0"]')
  const afterHumanSend = await snapshot(page)
  if (afterHumanSend.players[0].gold !== beforeHumanSend.players[0].gold - 40 ||
      afterHumanSend.players[0].income !== beforeHumanSend.players[0].income + 4 ||
      afterHumanSend.pendingCount !== beforeHumanSend.pendingCount + 1) {
    throw new Error(`H8 human send economy diverged: ${JSON.stringify({ beforeHumanSend, afterHumanSend })}`)
  }

  if (await page.evaluate(() => globalThis.__TW_API.playTick()) !== 1) throw new Error('H8 rival spawn tick failed')
  let rivalState = await snapshot(page)
  const humanScout = rivalState.creeps.find((creep) => creep.sender === 0 && creep.target === 1 && creep.kind === 0)
  if (!humanScout) throw new Error(`H8 human Scout did not enter rival lane: ${JSON.stringify(rivalState)}`)

  // The actual H8 bot scheduler—not a test-only bot mutation—must autonomously
  // react through shared movement/combat commands. Give it a bounded window to
  // kill the incoming Scout and earn authoritative XP.
  for (let i = 0; i < 10 && rivalState.heroXP[1] === 0; i++) {
    if (await page.evaluate(() => globalThis.__TW_API.playTick()) !== 1) throw new Error('H8 bot defense tick failed')
    rivalState = await snapshot(page)
  }
  const botActions = await page.evaluate(() => globalThis.__HLW_H8.botState.actions)
  const botKinds = new Set(botActions.map((action) => action.kind))
  if (rivalState.heroXP[1] !== 50 || rivalState.creeps.some((creep) => creep.id === humanScout.id) ||
      !botKinds.has('send') || !botKinds.has('move') || (!botKinds.has('ability') && !botKinds.has('attack'))) {
    throw new Error(`H8 deterministic bot did not complete shared-boundary defense: ${JSON.stringify({ rivalState, botActions })}`)
  }

  // H7 is the replay authority for this full command stream because it includes
  // native hero movement. Compare its semantic receipt before/after the UI replay.
  const receiptBefore = await replayReceipt(page)
  if (!receiptBefore) throw new Error('H8 missing H7 replay receipt export')
  if (await page.evaluate(() => globalThis.__TW_API.nativeReplay()) !== 1) {
    throw new Error('H8 ordered native replay failed')
  }
  const receiptAfter = await replayReceipt(page)
  const replayExact = receiptBefore.commandCount === receiptAfter.commandCount &&
    receiptBefore.commandHash === receiptAfter.commandHash &&
    receiptBefore.stateHash === receiptAfter.stateHash &&
    receiptBefore.sessionLogHash === receiptAfter.sessionLogHash &&
    receiptBefore.nativeHash === receiptAfter.nativeHash &&
    receiptBefore.nativeCreepCount === receiptAfter.nativeCreepCount

  const finalState = await snapshot(page)
  const final = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
    stats0: document.getElementById('stats0')?.textContent ?? '',
    stats1: document.getElementById('stats1')?.textContent ?? '',
    botStatus: document.getElementById('bot-status')?.textContent ?? '',
  }))
  if (!replayExact || !final.openRealm || !final.webgl2 || final.stats0.includes('undefined') ||
      final.stats1.includes('undefined') || !final.botStatus.startsWith('BOT:') || abortSeen || pageError) {
    throw new Error(`H8 final replay/UI/WebGL2 proof failed: ${JSON.stringify({ replayExact, receiptBefore, receiptAfter, finalState, final, abortSeen, pageError })}`)
  }

  console.log(`HLW_H8_EVIDENCE=${JSON.stringify({
    humanMoved: JSON.stringify(initialHero) !== JSON.stringify(settledHuman),
    humanKillXP: killedScout.heroXP[0],
    phaseLanceDamage: 60,
    incomeDelta: afterIncome.players[0].gold - beforeIncome.players[0].gold,
    leakLives: [20, leaked.players[0].lives],
    humanSendIncome: [beforeHumanSend.players[0].income, afterHumanSend.players[0].income],
    botActions: [...botKinds].sort(),
    botDefenseXP: rivalState.heroXP[1],
    orderedNativeReplayExact: replayExact,
    finalWebGL2: final.webgl2,
  })}`)
  console.log('HERO_LINE_WARS_H8_BROWSER_PLAYABLE_SLICE=PASS')
} finally {
  await browser.close()
}
