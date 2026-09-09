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

async function step(page, ticks, label) {
  const ok = await page.evaluate((n) => Module._TW_BrowserStep(n), ticks)
  if (ok !== 1) throw new Error(`${label}: step(${ticks}) rejected`)
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

  const audit = await page.evaluate(() => {
    const shared = {
      move: typeof Module?._HLW_BrowserHeroMove === 'function',
      attack: typeof Module?._HLW_BrowserHeroAttack === 'function',
      ability: typeof Module?._HLW_BrowserHeroAbility === 'function',
      send: typeof Module?._TW_BrowserSend === 'function',
    }
    const forbiddenExact = [
      '_tw_match_apply_action',
      '_tw_session_apply_action',
      '_tw_session_hero_attack',
      '_tw_session_hero_ability',
      '_tw_session_resolve_hero_kill',
      '_HLW_OpenRealmHeroCommandMove',
      '_HLW_OpenRealmHeroAcquireTarget',
      '_HLW_BotHeroMove',
      '_HLW_BotHeroAttack',
      '_HLW_BotHeroAbility',
      '_TW_BotSend',
      '_HLW_BotSetHP',
      '_HLW_BotSetGold',
      '_HLW_BotSetIncome',
      '_HLW_BotSetXP',
      '_HLW_BotSetLives',
    ]
    const forbiddenPresent = forbiddenExact.filter((name) => typeof Module?.[name] === 'function')
    const suspiciousBotExports = Object.keys(Module ?? {}).filter((name) =>
      /bot/i.test(name) && /(move|attack|ability|cast|send|damage|hp|gold|income|xp|lives|position|teleport|mutat)/i.test(name),
    )
    return {
      openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
      towerWars: globalThis.__TW_READY === true,
      webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
      shared,
      forbiddenPresent,
      suspiciousBotExports,
    }
  })
  console.log(`HLW_H6_AUTHORITY_AUDIT=${JSON.stringify(audit)}`)
  if (!audit.openRealm || !audit.towerWars || !audit.webgl2 ||
      !Object.values(audit.shared).every(Boolean) ||
      audit.forbiddenPresent.length !== 0 || audit.suspiciousBotExports.length !== 0) {
    throw new Error(`H6 authority surface audit failed: ${JSON.stringify(audit)}`)
  }

  if (await page.evaluate(() => Module._TW_BrowserReset()) !== 1) {
    throw new Error('H6 canonical reset failed')
  }
  const initial = await snapshot(page)
  const initialPos = await page.evaluate(() => [
    Module._HLW_BrowserHeroX(1), Module._HLW_BrowserHeroY(1),
  ])

  // Hostile invalid commands from the bot seat must be non-mutating.
  const invalid = await page.evaluate(() => ({
    crossLaneMove: Module._HLW_BrowserHeroMove(1, -120, -140),
    attackWithoutTarget: Module._HLW_BrowserHeroAttack(1),
    abilityWithoutTarget: Module._HLW_BrowserHeroAbility(1),
    invalidSeatSend: Module._TW_BrowserSend(2, 0),
  }))
  const afterInvalid = await snapshot(page)
  const afterInvalidPos = await page.evaluate(() => [
    Module._HLW_BrowserHeroX(1), Module._HLW_BrowserHeroY(1),
  ])
  console.log(`HLW_H6_INVALID=${JSON.stringify({ invalid, initial, afterInvalid, initialPos, afterInvalidPos })}`)
  if (Object.values(invalid).some((value) => value !== 0) ||
      afterInvalid.stateHash !== initial.stateHash || afterInvalid.logHash !== initial.logHash ||
      afterInvalidPos[0] !== initialPos[0] || afterInvalidPos[1] !== initialPos[1]) {
    throw new Error('H6 invalid bot commands mutated authority')
  }

  // The bot uses the exact shared H2 movement boundary. Move it close to its
  // own lane entrance; no bot-only teleport or position setter exists.
  if (await page.evaluate(() => Module._HLW_BrowserHeroMove(1, -120, 140)) !== 1) {
    throw new Error('H6 bot move through shared boundary rejected')
  }
  await step(page, 30, 'H6 bot move')
  const movedPos = await page.evaluate(() => [
    Module._HLW_BrowserHeroX(1), Module._HLW_BrowserHeroY(1),
  ])
  if (movedPos[0] !== -120 || movedPos[1] !== 140) {
    throw new Error(`H6 shared move did not reach deterministic goal: ${JSON.stringify(movedPos)}`)
  }

  // Human seat sends a Swarm into the bot lane. The bot then casts the same
  // PHASE LANCE command used by the human in H4, twice across its cooldown.
  if (await page.evaluate(() => Module._TW_BrowserSend(0, 1)) !== 1) {
    throw new Error('H6 opponent swarm send rejected')
  }
  await step(page, 1, 'H6 swarm spawn')
  let snap = await snapshot(page)
  if (snap.creeps.length !== 1 || snap.creeps[0].target !== 1 || snap.creeps[0].hp !== 70) {
    throw new Error(`H6 unexpected bot-lane swarm: ${JSON.stringify(snap)}`)
  }
  if (await page.evaluate(() => Module._HLW_BrowserHeroAbility(1)) !== 1) {
    throw new Error('H6 bot PHASE LANCE through shared boundary rejected')
  }
  const abilityHit = await snapshot(page)
  if (abilityHit.creeps[0]?.hp !== 10 || abilityHit.heroXP[1] !== 0) {
    throw new Error(`H6 bot ability damage diverged: ${JSON.stringify(abilityHit)}`)
  }
  await step(page, 12, 'H6 ability cooldown')
  if (await page.evaluate(() => Module._HLW_BrowserHeroAbility(1)) !== 1) {
    throw new Error('H6 bot lethal PHASE LANCE rejected')
  }
  const abilityKill = await snapshot(page)
  if (abilityKill.activeCount !== 0 || abilityKill.heroXP[1] !== 50 ||
      abilityKill.heroLevel[1] !== 1) {
    throw new Error(`H6 bot ability kill/progression diverged: ${JSON.stringify(abilityKill)}`)
  }

  // The bot uses the same send boundary; this must debit its own gold and raise
  // its own income, with the pending creep targeting the rival seat.
  const beforeBotSend = await snapshot(page)
  if (await page.evaluate(() => Module._TW_BrowserSend(1, 0)) !== 1) {
    throw new Error('H6 bot send through shared boundary rejected')
  }
  const afterBotSend = await snapshot(page)
  if (afterBotSend.players[1].gold !== beforeBotSend.players[1].gold - 40 ||
      afterBotSend.players[1].income !== beforeBotSend.players[1].income + 4 ||
      afterBotSend.pendingCount !== beforeBotSend.pendingCount + 1) {
    throw new Error(`H6 bot send/economy diverged: ${JSON.stringify({ beforeBotSend, afterBotSend })}`)
  }

  // Give the bot a fresh incoming Scout and prove the same H3 attack command
  // owns damage, cadence, reward and the second 50 XP level transition.
  if (await page.evaluate(() => Module._TW_BrowserSend(0, 0)) !== 1) {
    throw new Error('H6 second opponent scout send rejected')
  }
  await step(page, 1, 'H6 scout spawn')
  snap = await snapshot(page)
  const incoming = snap.creeps.find((creep) => creep.target === 1)
  if (!incoming || incoming.hp !== 45) {
    throw new Error(`H6 incoming Scout missing: ${JSON.stringify(snap)}`)
  }
  if (await page.evaluate(() => Module._HLW_BrowserHeroAttack(1)) !== 1) {
    throw new Error('H6 bot basic attack through shared boundary rejected')
  }
  const basicHit = await snapshot(page)
  const damaged = basicHit.creeps.find((creep) => creep.id === incoming.id)
  if (!damaged || damaged.hp !== 20) {
    throw new Error(`H6 bot basic damage diverged: ${JSON.stringify(basicHit)}`)
  }
  await step(page, 4, 'H6 basic cooldown')
  if (await page.evaluate(() => Module._HLW_BrowserHeroAttack(1)) !== 1) {
    throw new Error('H6 bot lethal basic attack rejected')
  }
  const finalState = await snapshot(page)
  if (finalState.creeps.some((creep) => creep.id === incoming.id) ||
      finalState.heroXP[1] !== 100 || finalState.heroLevel[1] !== 2 ||
      finalState.heroBasicDamage[1] !== 30) {
    throw new Error(`H6 bot basic kill/progression diverged: ${JSON.stringify(finalState)}`)
  }

  if (await page.evaluate(() => Module._TW_BrowserReplayVerify()) !== 1) {
    throw new Error('H6 session replay diverged')
  }
  const replayed = await snapshot(page)
  const final = await page.evaluate(() => ({
    openRealm: globalThis.__OPENREALM_SDL_WEBGL_BOOT === true,
    webgl2: Boolean(document.getElementById('canvas')?.getContext('webgl2')),
  }))
  if (!replayed.replayOk || !final.openRealm || !final.webgl2 || abortSeen || pageError) {
    throw new Error(`H6 final stability/replay failed: ${JSON.stringify({ replayed, final, abortSeen, pageError })}`)
  }

  console.log(`HLW_H6_EVIDENCE=${JSON.stringify({
    sharedAuthorityExports: Object.keys(audit.shared).filter((key) => audit.shared[key]),
    botOnlyMutationExports: audit.forbiddenPresent.concat(audit.suspiciousBotExports),
    invalidBotCommandsNonMutating: true,
    botMovedThroughSharedCommand: movedPos,
    botAbilityKillXP: abilityKill.heroXP[1],
    botSendGoldDelta: afterBotSend.players[1].gold - beforeBotSend.players[1].gold,
    botSendIncomeDelta: afterBotSend.players[1].income - beforeBotSend.players[1].income,
    botFinalXP: finalState.heroXP[1],
    botFinalLevel: finalState.heroLevel[1],
    botFinalBasicDamage: finalState.heroBasicDamage[1],
    replayOk: replayed.replayOk,
    finalWebGL2: final.webgl2,
  })}`)
  console.log('HERO_LINE_WARS_H6_BOT_PARITY=PASS')
} finally {
  await browser.close()
}
