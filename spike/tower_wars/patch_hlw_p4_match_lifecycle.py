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
'''    #send-feedback{color:#c7d4df;min-width:190px;text-align:right}\n''',
'''    #send-feedback{color:#c7d4df;min-width:190px;text-align:right}\n    .lifecycle-strip{grid-column:1/-1;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #202a35;font-size:10px}\n    .lifecycle-phase{min-width:82px;border:1px solid #3a5668;background:#0d141b;padding:6px 8px;text-align:center;font-weight:700;letter-spacing:.08em}\n    .lifecycle-phase[data-phase="READY"]{border-color:#567083}\n    .lifecycle-phase[data-phase="START"],.lifecycle-phase[data-phase="RUNNING"]{border-color:#4c7f75;color:#b8f5e9}\n    .lifecycle-phase[data-phase="PAUSED"]{border-color:#845d38;color:#ffd0a3}\n    .lifecycle-phase[data-phase="TERMINAL"]{border-color:#9b5361;color:#ffc2cc}\n    #lifecycle-detail{color:#d8e2ea}\n    #bot-pace{color:var(--enemy);text-align:right;white-space:nowrap}\n''',
"P4 lifecycle styles",
)

replace_once(
'''      <div id="combat-readout" class="combat-readout">\n''',
'''      <div id="lifecycle-strip" class="lifecycle-strip" aria-label="Match lifecycle">\n        <span id="lifecycle-state" class="lifecycle-phase" data-phase="READY" role="status" aria-live="polite" aria-atomic="true">READY</span>\n        <span id="lifecycle-detail">PRESS START · AUTHORITATIVE TICK 0</span>\n        <span id="bot-pace">BOT PACE · WAITING</span>\n      </div>\n      <div id="combat-readout" class="combat-readout">\n''',
"P4 lifecycle strip",
)

replace_once(
'''  const SEND_KEYS = new Map([['Digit1', 0], ['Digit2', 1], ['Digit3', 2], ['Digit4', 3]])\n  const byId = (id) => document.getElementById(id)\n''',
'''  const SEND_KEYS = new Map([['Digit1', 0], ['Digit2', 1], ['Digit3', 2], ['Digit4', 3]])\n  const lifecyclePresentation = { phase: null, transitions: [] }\n  const byId = (id) => document.getElementById(id)\n''',
"P4 lifecycle presentation state",
)

replace_once(
'''  function botAct(state = snap()) {\n''',
'''  function resetLifecyclePresentation() {\n    lifecyclePresentation.phase = null\n    lifecyclePresentation.transitions.length = 0\n  }\n\n  function deriveLifecycle(state = snap()) {\n    if (state.terminal) return 'TERMINAL'\n    if (playTimer) return state.tick === 0 ? 'START' : 'RUNNING'\n    return state.tick === 0 ? 'READY' : 'PAUSED'\n  }\n\n  function renderLifecycle(state = snap()) {\n    if (!heroMode) return null\n    const phase = deriveLifecycle(state)\n    const phaseNode = byId('lifecycle-state')\n    if (phaseNode && lifecyclePresentation.phase !== phase) {\n      lifecyclePresentation.phase = phase\n      lifecyclePresentation.transitions.push({ phase, tick: state.tick, eventCount: state.eventCount })\n      if (lifecyclePresentation.transitions.length > 32) lifecyclePresentation.transitions.shift()\n      phaseNode.dataset.phase = phase\n      phaseNode.textContent = phase\n    }\n\n    const detail = byId('lifecycle-detail')\n    if (detail) {\n      if (phase === 'TERMINAL') {\n        const outcome = state.winner === 0 ? 'YOU WIN' : state.winner === 1 ? 'BOT WINS' : 'MATCH TERMINAL'\n        detail.textContent = `${outcome} · YOU ${state.players[0].lives} LIVES · BOT ${state.players[1].lives} LIVES · TICK ${state.tick}`\n      } else if (phase === 'START') {\n        detail.textContent = 'MATCH START · FIRST AUTHORITATIVE TICK PENDING'\n      } else if (phase === 'RUNNING') {\n        detail.textContent = `MATCH RUNNING · AUTHORITATIVE TICK ${state.tick}`\n      } else if (phase === 'PAUSED') {\n        detail.textContent = `MATCH PAUSED · AUTHORITATIVE TICK ${state.tick}`\n      } else {\n        detail.textContent = 'PRESS START · AUTHORITATIVE TICK 0'\n      }\n    }\n\n    const lastAction = botState.actions.length ? botState.actions[botState.actions.length - 1] : null\n    const botPace = byId('bot-pace')\n    if (botPace) {\n      botPace.textContent = lastAction\n        ? `BOT PACE · MAX 1 ACTION / PLAY TICK · LAST T${botState.lastActTick} ${lastAction.kind.toUpperCase()}`\n        : 'BOT PACE · MAX 1 ACTION / PLAY TICK · WAITING'\n    }\n\n    const play = byId('play')\n    if (play) {\n      play.textContent = phase === 'TERMINAL'\n        ? 'Restart match'\n        : phase === 'READY'\n          ? 'Start match'\n          : phase === 'PAUSED'\n            ? 'Resume match'\n            : 'Pause match'\n    }\n    return phase\n  }\n\n  function botAct(state = snap()) {\n''',
"P4 lifecycle derivation",
)

replace_once(
'''      updateCombatPresentation(state)\n      renderEconomy(state)\n''',
'''      updateCombatPresentation(state)\n      renderEconomy(state)\n      renderLifecycle(state)\n''',
"P4 render hook",
)

replace_once(
'''      resetCombatPresentation()\n    }\n    const ok = apiCall('_TW_BrowserReset') === 1\n''',
'''      resetCombatPresentation()\n      resetLifecyclePresentation()\n    }\n    const ok = apiCall('_TW_BrowserReset') === 1\n''',
"P4 reset presentation",
)

replace_once(
'''  function startPlay() {\n    if (playTimer) return\n    byId('play').textContent = 'Pause match'\n    playTimer = setInterval(() => playTick(), 110)\n    setMessage(heroMode ? 'local 1v1 running · deterministic bot active' : 'Tower Wars core running')\n  }\n\n  function stopPlay() {\n    if (playTimer) clearInterval(playTimer)\n    playTimer = null\n    const button = byId('play')\n    if (button) button.textContent = 'Run match'\n  }\n''',
'''  function startPlay() {\n    if (playTimer) return\n    playTimer = setInterval(() => playTick(), 110)\n    setMessage(heroMode ? 'local 1v1 running · deterministic bot active' : 'Tower Wars core running')\n    if (globalThis.__TW_READY && heroMode) renderLifecycle(snap())\n  }\n\n  function stopPlay() {\n    if (playTimer) clearInterval(playTimer)\n    playTimer = null\n    if (globalThis.__TW_READY && heroMode) renderLifecycle(snap())\n  }\n''',
"P4 scheduler lifecycle updates",
)

replace_once(
'''      globalThis.__HLW_H8 = { botState }\n      globalThis.__HLW_P1 = { inputState }\n      globalThis.__HLW_P2 = { combatPresentation }\n''',
'''      globalThis.__HLW_H8 = { botState }\n      globalThis.__HLW_P1 = { inputState }\n      globalThis.__HLW_P2 = { combatPresentation }\n      globalThis.__HLW_P4 = { lifecyclePresentation, deriveLifecycle, renderLifecycle }\n''',
"P4 inspection surface",
)

replace_once(
'''      delete globalThis.__HLW_H8\n      delete globalThis.__HLW_P1\n      delete globalThis.__HLW_P2\n''',
'''      delete globalThis.__HLW_H8\n      delete globalThis.__HLW_P1\n      delete globalThis.__HLW_P2\n      delete globalThis.__HLW_P4\n''',
"P4 TW-only isolation",
)

replace_once(
'''  byId('play').addEventListener('click', () => {\n    playTimer ? stopPlay() : startPlay()\n    // Run/Pause is the one fallback control that hands focus back to the game\n    // immediately: players click it, then expect WASD/Space/E to control the match.\n    byId('play')?.blur()\n  })\n''',
'''  byId('play').addEventListener('click', () => {\n    const state = snap()\n    if (state.terminal) reset()\n    else playTimer ? stopPlay() : startPlay()\n    // Start/Pause/Resume/Restart is the one fallback control that hands focus\n    // back to the game immediately so global gameplay shortcuts remain usable.\n    byId('play')?.blur()\n  })\n''',
"P4 lifecycle control",
)

path.write_text(text)
print("Hero Line Wars Playable V1 P4 match lifecycle overlay applied")
