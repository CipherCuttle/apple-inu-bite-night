#!/usr/bin/env python3
from pathlib import Path

path = Path("spike/tower_wars/tower_wars_shell.html")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"tower_wars_shell.html: expected {label} anchor once, got {count}")
    text = text.replace(old, new, 1)


replace_once(
'''    .ok{color:var(--good)!important}.bad{color:#ff7777!important}\n''',
'''    .ok{color:var(--good)!important}.bad{color:#ff7777!important}\n    .combat-readout{grid-column:1/-1;display:grid;grid-template-columns:minmax(250px,.8fr) 1.2fr;gap:12px;padding:10px 0;border-bottom:1px solid #202a35}\n    .combat-status{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n    .combat-status strong{font-size:11px;color:var(--muted);margin-right:3px}\n    .combat-pill{border:1px solid #344554;background:#101820;padding:5px 7px;font-size:10px;letter-spacing:.03em;white-space:nowrap}\n    .combat-pill[data-ready="true"]{border-color:#4c7f75}\n    .combat-pill[data-ready="false"]{border-color:#845d38}\n    .combat-feed{min-height:30px;display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:10px;color:#c7d4df}\n    .combat-event{border-left:2px solid #567083;background:#0d141b;padding:5px 7px;white-space:nowrap}\n    .combat-empty{color:var(--muted)}\n    .creep-hp{position:absolute;left:50%;top:calc(100% + 3px);transform:translateX(-50%);font-size:8px;line-height:1;white-space:nowrap;color:#fff;background:#090c10e8;border:1px solid #394652;padding:2px 3px;border-radius:2px;pointer-events:none}\n    @media (prefers-reduced-motion: reduce){.cell,.combat-event{transition:none!important;animation:none!important}}\n''',
"P2 combat readability styles",
)

replace_once(
'''      <div class="group hero-group"><strong>HERO</strong><button id="hero-center">Lane center</button><button id="hero-left">←</button><button id="hero-right">→</button><button id="hero-up">↑</button><button id="hero-down">↓</button><button id="hero-attack" class="primary">Basic attack</button><button id="hero-ability" class="warn">PHASE LANCE · 15</button><span id="bot-status">BOT: READY</span><span class="key-hint">WASD / ARROWS · SPACE ATTACK · E LANCE</span></div>\n''',
'''      <div class="group hero-group"><strong>HERO</strong><button id="hero-center">Lane center</button><button id="hero-left">←</button><button id="hero-right">→</button><button id="hero-up">↑</button><button id="hero-down">↓</button><button id="hero-attack" class="primary">Basic attack</button><button id="hero-ability" class="warn">PHASE LANCE · 15</button><span id="bot-status">BOT: READY</span><span class="key-hint">WASD / ARROWS · SPACE ATTACK · E LANCE</span></div>\n      <div id="combat-readout" class="combat-readout">\n        <div class="combat-status" aria-label="Player combat status">\n          <strong>COMBAT</strong>\n          <span id="hero-progression" class="combat-pill">LV 1 · XP 0</span>\n          <span id="incoming-status" class="combat-pill">INCOMING · 0</span>\n          <span id="basic-state" class="combat-pill" data-ready="true">BASIC · READY</span>\n          <span id="ability-state" class="combat-pill" data-ready="true">LANCE · READY</span>\n        </div>\n        <div id="combat-feed" class="combat-feed" role="status" aria-live="polite" aria-atomic="false"><span class="combat-empty">COMBAT FEED · NO ACCEPTED COMBAT YET</span></div>\n      </div>\n''',
"P2 combat readout",
)

replace_once(
'''  const byId = (id) => document.getElementById(id)\n''',
'''  const combatPresentation = { previous: null, events: [] }\n  const byId = (id) => document.getElementById(id)\n''',
"P2 presentation state",
)

replace_once(
'''  function botAct(state = snap()) {\n''',
'''  function resetCombatPresentation() {\n    combatPresentation.previous = null\n    combatPresentation.events.length = 0\n    const feed = byId('combat-feed')\n    if (feed) {\n      const empty = document.createElement('span')\n      empty.className = 'combat-empty'\n      empty.textContent = 'COMBAT FEED · NO ACCEPTED COMBAT YET'\n      feed.replaceChildren(empty)\n    }\n  }\n\n  function combatSnapshot(state) {\n    return {\n      tick: state.tick,\n      heroLevel: [...state.heroLevel],\n      heroXP: [...state.heroXP],\n      heroReady: [...state.heroReady],\n      heroAbilityReady: [...state.heroAbilityReady],\n      creeps: state.creeps.map((creep) => ({ id: creep.id, target: creep.target, hp: creep.hp })),\n    }\n  }\n\n  function pushCombatEvent(tick, text) {\n    combatPresentation.events.unshift({ tick, text })\n    if (combatPresentation.events.length > 8) combatPresentation.events.length = 8\n  }\n\n  function renderCombatFeed() {\n    const feed = byId('combat-feed')\n    if (!feed) return\n    if (!combatPresentation.events.length) {\n      const empty = document.createElement('span')\n      empty.className = 'combat-empty'\n      empty.textContent = 'COMBAT FEED · NO ACCEPTED COMBAT YET'\n      feed.replaceChildren(empty)\n      return\n    }\n    feed.replaceChildren(...combatPresentation.events.map((event) => {\n      const item = document.createElement('span')\n      item.className = 'combat-event'\n      item.textContent = `T${event.tick} · ${event.text}`\n      return item\n    }))\n  }\n\n  function updateCombatPresentation(state) {\n    const current = combatSnapshot(state)\n    const previous = combatPresentation.previous\n\n    if (previous) {\n      const priorIncoming = new Map(previous.creeps.filter((creep) => creep.target === 0).map((creep) => [creep.id, creep]))\n      const currentIncoming = new Map(current.creeps.filter((creep) => creep.target === 0).map((creep) => [creep.id, creep]))\n      const disappeared = []\n\n      for (const [id, before] of priorIncoming) {\n        const after = currentIncoming.get(id)\n        if (after && after.hp < before.hp) {\n          pushCombatEvent(current.tick, `DAMAGE · CREEP #${id} · HP ${before.hp}→${after.hp}`)\n        } else if (!after) {\n          disappeared.push(id)\n        }\n      }\n\n      if (current.heroReady[0] > previous.heroReady[0]) {\n        pushCombatEvent(current.tick, `BASIC ACCEPTED · READY T${current.heroReady[0]}`)\n      }\n      if (current.heroAbilityReady[0] > previous.heroAbilityReady[0]) {\n        pushCombatEvent(current.tick, `PHASE LANCE ACCEPTED · READY T${current.heroAbilityReady[0]}`)\n      }\n\n      const xpGain = current.heroXP[0] - previous.heroXP[0]\n      if (xpGain > 0) {\n        if (disappeared.length === 1) {\n          pushCombatEvent(current.tick, `KILL CONFIRMED · CREEP #${disappeared[0]}`)\n        }\n        pushCombatEvent(current.tick, `XP +${xpGain}`)\n      }\n      if (current.heroLevel[0] > previous.heroLevel[0]) {\n        pushCombatEvent(current.tick, `LEVEL UP · LV ${current.heroLevel[0]}`)\n      }\n    }\n\n    combatPresentation.previous = current\n\n    const basicRemaining = Math.max(0, state.heroReady[0] - state.tick)\n    const abilityRemaining = Math.max(0, state.heroAbilityReady[0] - state.tick)\n    const incoming = state.creeps.filter((creep) => creep.target === 0)\n    const incomingHp = incoming.length ? Math.min(...incoming.map((creep) => creep.hp)) : null\n\n    byId('hero-progression').textContent = `LV ${state.heroLevel[0]} · XP ${state.heroXP[0]}`\n    byId('incoming-status').textContent = incomingHp === null\n      ? 'INCOMING · 0'\n      : `INCOMING · ${incoming.length} · LOW HP ${incomingHp}`\n\n    const basic = byId('basic-state')\n    basic.dataset.ready = basicRemaining === 0 ? 'true' : 'false'\n    basic.textContent = basicRemaining === 0 ? 'BASIC · READY' : `BASIC · ${basicRemaining}T`\n\n    const ability = byId('ability-state')\n    ability.dataset.ready = abilityRemaining === 0 ? 'true' : 'false'\n    ability.textContent = abilityRemaining === 0 ? 'LANCE · READY' : `LANCE · ${abilityRemaining}T`\n\n    renderCombatFeed()\n  }\n\n  function botAct(state = snap()) {\n''',
"P2 derived combat presentation",
)

replace_once(
'''      mark.className = `creep ${creep.sender === 0 ? 'human-send' : ''}`\n      mark.title = `creep ${creep.id} hp ${creep.hp} progress ${creep.progress}`\n      cell.appendChild(mark)\n''',
'''      mark.className = `creep ${creep.sender === 0 ? 'human-send' : ''}`\n      mark.title = `creep ${creep.id} hp ${creep.hp} progress ${creep.progress}`\n      mark.setAttribute('role', 'img')\n      mark.setAttribute('aria-label', `Creep ${creep.id}, ${creep.hp} HP`)\n      const hp = document.createElement('span')\n      hp.className = 'creep-hp'\n      hp.textContent = `${creep.hp} HP`\n      mark.appendChild(hp)\n      cell.appendChild(mark)\n''',
"visible creep HP",
)

replace_once(
'''  function render() {\n    if (!globalThis.__TW_READY) return null\n    const state = snap()\n    if (heroMode) {\n''',
'''  function render() {\n    if (!globalThis.__TW_READY) return null\n    const state = snap()\n    if (heroMode) updateCombatPresentation(state)\n    if (heroMode) {\n''',
"P2 render hook",
)

replace_once(
'''    if (heroMode) {\n      resetBot()\n      resetHumanInput()\n    }\n    const ok = apiCall('_TW_BrowserReset') === 1\n''',
'''    if (heroMode) {\n      resetBot()\n      resetHumanInput()\n      resetCombatPresentation()\n    }\n    const ok = apiCall('_TW_BrowserReset') === 1\n''',
"P2 reset presentation",
)

replace_once(
'''      globalThis.__HLW_H8 = { botState }\n      globalThis.__HLW_P1 = { inputState }\n''',
'''      globalThis.__HLW_H8 = { botState }\n      globalThis.__HLW_P1 = { inputState }\n      globalThis.__HLW_P2 = { combatPresentation }\n''',
"P2 inspection surface",
)

replace_once(
'''      delete globalThis.__HLW_H8\n      delete globalThis.__HLW_P1\n''',
'''      delete globalThis.__HLW_H8\n      delete globalThis.__HLW_P1\n      delete globalThis.__HLW_P2\n''',
"P2 TW-only isolation",
)

path.write_text(text)
print("Hero Line Wars Playable V1 P2 combat readability overlay applied")
