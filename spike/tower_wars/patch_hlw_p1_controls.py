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
'''    #bot-status{color:var(--enemy);font-size:11px}\n''',
'''    #bot-status{color:var(--enemy);font-size:11px}\n    .key-hint{color:var(--muted);font-size:10px;letter-spacing:.04em;margin-left:auto}\n''',
"key hint style",
)

replace_once(
'''      <div class="group hero-group"><strong>HERO</strong><button id="hero-center">Lane center</button><button id="hero-left">←</button><button id="hero-right">→</button><button id="hero-up">↑</button><button id="hero-down">↓</button><button id="hero-attack" class="primary">Basic attack</button><button id="hero-ability" class="warn">PHASE LANCE · 15</button><span id="bot-status">BOT: READY</span></div>\n''',
'''      <div class="group hero-group"><strong>HERO</strong><button id="hero-center">Lane center</button><button id="hero-left">←</button><button id="hero-right">→</button><button id="hero-up">↑</button><button id="hero-down">↓</button><button id="hero-attack" class="primary">Basic attack</button><button id="hero-ability" class="warn">PHASE LANCE · 15</button><span id="bot-status">BOT: READY</span><span class="key-hint">WASD / ARROWS · SPACE ATTACK · E LANCE</span></div>\n''',
"hero controls",
)

replace_once(
'''  const botState = { sendIndex: 0, lastActTick: -1, lastMoveGoal: '', actions: [] }\n  const byId = (id) => document.getElementById(id)\n''',
'''  const botState = { sendIndex: 0, lastActTick: -1, lastMoveGoal: '', actions: [] }\n  const heldKeys = new Set()\n  const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'])\n  const ACTION_KEYS = new Set(['Space', 'KeyE'])\n  const inputState = {\n    attackQueued: false,\n    abilityQueued: false,\n    wasMoving: false,\n    samples: 0,\n    movementCommands: 0,\n    stopCommands: 0,\n    attackCommands: 0,\n    abilityCommands: 0,\n    lastSample: null,\n  }\n  const byId = (id) => document.getElementById(id)\n''',
"P1 input state",
)

replace_once(
'''  function clamp(value, min, max) {\n    return Math.max(min, Math.min(max, value))\n  }\n\n  function botAct(state = snap()) {\n''',
'''  function clamp(value, min, max) {\n    return Math.max(min, Math.min(max, value))\n  }\n\n  function releaseHumanInput() {\n    heldKeys.clear()\n    inputState.attackQueued = false\n    inputState.abilityQueued = false\n  }\n\n  function resetHumanInput() {\n    releaseHumanInput()\n    inputState.wasMoving = false\n    inputState.samples = 0\n    inputState.movementCommands = 0\n    inputState.stopCommands = 0\n    inputState.attackCommands = 0\n    inputState.abilityCommands = 0\n    inputState.lastSample = null\n  }\n\n  function sampleHumanInput(state = snap()) {\n    if (!heroMode || state.terminal) return null\n\n    const horizontal = Number(heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) -\n      Number(heldKeys.has('KeyA') || heldKeys.has('ArrowLeft'))\n    const vertical = Number(heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) -\n      Number(heldKeys.has('KeyS') || heldKeys.has('ArrowDown'))\n    const [x, y] = heroPosition(0)\n    let moveResult = null\n    let stopResult = null\n\n    if (horizontal || vertical) {\n      const goalX = clamp(x + horizontal * 40, -160, 160)\n      const goalY = clamp(y + vertical * 22, -160, -24)\n      moveResult = apiCall('_HLW_BrowserHeroMove', 0, goalX, goalY)\n      inputState.movementCommands++\n      inputState.wasMoving = moveResult === 1\n    } else if (inputState.wasMoving) {\n      // Key release becomes a deterministic stop command on the next authoritative\n      // play tick. Browser key timing never advances native movement by itself.\n      stopResult = apiCall('_HLW_BrowserHeroMove', 0, x, y)\n      inputState.stopCommands++\n      if (stopResult === 1) inputState.wasMoving = false\n    }\n\n    const abilityRequested = inputState.abilityQueued\n    const attackRequested = inputState.attackQueued\n    inputState.abilityQueued = false\n    inputState.attackQueued = false\n\n    let abilityResult = null\n    let attackResult = null\n    // Freeze command ordering when both actions arrive between ticks: movement,\n    // PHASE LANCE, then basic attack. Every mutation still enters the existing\n    // actor-indexed public authority functions.\n    if (abilityRequested) {\n      abilityResult = apiCall('_HLW_BrowserHeroAbility', 0)\n      inputState.abilityCommands++\n    }\n    if (attackRequested) {\n      attackResult = apiCall('_HLW_BrowserHeroAttack', 0)\n      inputState.attackCommands++\n    }\n\n    inputState.samples++\n    inputState.lastSample = {\n      tick: state.tick, horizontal, vertical, moveResult, stopResult,\n      abilityRequested, abilityResult, attackRequested, attackResult,\n    }\n    return inputState.lastSample\n  }\n\n  function botAct(state = snap()) {\n''',
"tick-sampled human input",
)

replace_once(
'''  function reset() {\n    stopPlay()\n    if (heroMode) resetBot()\n    const ok = apiCall('_TW_BrowserReset') === 1\n''',
'''  function reset() {\n    stopPlay()\n    if (heroMode) {\n      resetBot()\n      resetHumanInput()\n    }\n    const ok = apiCall('_TW_BrowserReset') === 1\n''',
"reset input state",
)

replace_once(
'''    if (heroMode) botAct(before)\n    const stepped = apiCall('_TW_BrowserStep', 1)\n''',
'''    if (heroMode) {\n      sampleHumanInput(before)\n      botAct(before)\n    }\n    const stepped = apiCall('_TW_BrowserStep', 1)\n''',
"P1 play tick sampling",
)

replace_once(
'''        nativeReplay,\n        botState,\n      })\n      globalThis.__HLW_H8 = { botState }\n    } else {\n      delete globalThis.__HLW_H8\n    }\n''',
'''        nativeReplay,\n        sampleHumanInput,\n        inputState,\n        botState,\n      })\n      globalThis.__HLW_H8 = { botState }\n      globalThis.__HLW_P1 = { inputState }\n    } else {\n      delete globalThis.__HLW_H8\n      delete globalThis.__HLW_P1\n    }\n''',
"P1 public inspection surface",
)

replace_once(
'''  document.querySelectorAll('[data-tower]').forEach((button) => button.addEventListener('click', () => {\n''',
'''  function blocksGameShortcut(event) {\n    if (event.ctrlKey || event.metaKey || event.altKey) return true\n    const target = event.target\n    if (!(target instanceof Element)) return false\n    if (target.closest('input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"])')) return true\n    return false\n  }\n\n  window.addEventListener('keydown', (event) => {\n    if (!heroMode || blocksGameShortcut(event)) return\n    if (!MOVE_KEYS.has(event.code) && !ACTION_KEYS.has(event.code)) return\n    event.preventDefault()\n    if (MOVE_KEYS.has(event.code)) {\n      heldKeys.add(event.code)\n      return\n    }\n    if (event.repeat) return\n    if (event.code === 'Space') inputState.attackQueued = true\n    if (event.code === 'KeyE') inputState.abilityQueued = true\n  })\n  window.addEventListener('keyup', (event) => {\n    if (!MOVE_KEYS.has(event.code)) return\n    // Always release the held movement state even if focus moved while the key\n    // was down, but never consume a keyup owned by an interactive control.\n    heldKeys.delete(event.code)\n    if (blocksGameShortcut(event)) return\n    event.preventDefault()\n  })\n  window.addEventListener('blur', releaseHumanInput)\n\n  document.querySelectorAll('[data-tower]').forEach((button) => button.addEventListener('click', () => {\n''',
"keyboard event boundary",
)

path.write_text(text)
print("Hero Line Wars Playable V1 P1 controls overlay applied")
