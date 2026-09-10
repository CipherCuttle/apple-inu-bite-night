#!/usr/bin/env python3
from pathlib import Path

browser_path = Path("spike/tower_wars/tw_browser.c")
browser = browser_path.read_text()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected {label} anchor once, got {count}")
    return text.replace(old, new, 1)


browser = replace_once(
    browser,
    '''EMSCRIPTEN_KEEPALIVE\nint TW_BrowserStep(int ticks) {\n''',
    '''/* P3 exposes only read-only catalog/capacity/pressure facts. These functions\n * never mutate the session and deliberately source the same authoritative match\n * state/definitions used by tw_match_apply_action. Pressure accessors scan the\n * full match rather than the snapshot's bounded visible-creep list. */\nEMSCRIPTEN_KEEPALIVE\nint TW_BrowserCreepCount(void) {\n    return TW_CREEP_COUNT;\n}\n\nEMSCRIPTEN_KEEPALIVE\nint TW_BrowserCreepCost(int creep) {\n    if (creep < 0 || creep >= TW_CREEP_COUNT) return -1;\n    const tw_creep_def_t *def = tw_creep_def((tw_creep_kind_t)creep);\n    return def ? (int)def->cost : -1;\n}\n\nEMSCRIPTEN_KEEPALIVE\nint TW_BrowserCreepIncomeGain(int creep) {\n    if (creep < 0 || creep >= TW_CREEP_COUNT) return -1;\n    const tw_creep_def_t *def = tw_creep_def((tw_creep_kind_t)creep);\n    return def ? (int)def->income_gain : -1;\n}\n\nEMSCRIPTEN_KEEPALIVE\nint TW_BrowserMaxCreeps(void) {\n    return TW_MAX_CREEPS;\n}\n\nEMSCRIPTEN_KEEPALIVE\nint TW_BrowserOutboundCount(int actor) {\n    if (!browser_initialized || actor < 0 || actor >= TW_PLAYER_COUNT) return -1;\n    int count = 0;\n    for (uint16_t i = 0; i < browser_session.match.active_creep_count; ++i) {\n        if (browser_session.match.active_creeps[i].sender == (uint8_t)actor) count++;\n    }\n    return count;\n}\n\nEMSCRIPTEN_KEEPALIVE\nint TW_BrowserPendingSendCount(int actor) {\n    if (!browser_initialized || actor < 0 || actor >= TW_PLAYER_COUNT) return -1;\n    int count = 0;\n    for (uint16_t i = 0; i < browser_session.match.pending_send_count; ++i) {\n        if (browser_session.match.pending_sends[i].sender == (uint8_t)actor) count++;\n    }\n    return count;\n}\n\nEMSCRIPTEN_KEEPALIVE\nint TW_BrowserOutboundHitPoints(int actor) {\n    if (!browser_initialized || actor < 0 || actor >= TW_PLAYER_COUNT) return -1;\n    uint32_t hit_points = 0;\n    for (uint16_t i = 0; i < browser_session.match.active_creep_count; ++i) {\n        const tw_creep_t *creep = &browser_session.match.active_creeps[i];\n        if (creep->sender == (uint8_t)actor) hit_points += creep->hit_points;\n    }\n    return (int)hit_points;\n}\n\nEMSCRIPTEN_KEEPALIVE\nint TW_BrowserStep(int ticks) {\n''',
    "P3 read-only browser catalog and pressure",
)
browser_path.write_text(browser)

shell_path = Path("spike/tower_wars/tower_wars_shell.html")
text = shell_path.read_text()

text = replace_once(
    text,
    '''    .combat-empty{color:var(--muted)}\n''',
    '''    .combat-empty{color:var(--muted)}\n    .economy-readout{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #202a35;font-size:10px}\n    .economy-fact{border-left:2px solid #3a5668;background:#0d141b;padding:6px 8px;white-space:nowrap}\n    .economy-fact strong{color:#fff}\n    .send-group button{font-size:10px;padding:7px 8px}\n    .send-group button[data-ready="true"]{border-color:#4c7f75;color:#b8f5e9}\n    .send-group button[data-ready="false"]{border-color:#684d3a;color:#d7b28f;background:#17130f}\n    #send-feedback{color:#c7d4df;min-width:190px;text-align:right}\n''',
    "P3 economy styles",
)

text = replace_once(
    text,
    '''        <div id="combat-feed" class="combat-feed" role="status" aria-live="polite" aria-atomic="false"><span class="combat-empty">COMBAT FEED · NO ACCEPTED COMBAT YET</span></div>\n      </div>\n      <div class="group"><strong>BUILD</strong>''',
    '''        <div id="combat-feed" class="combat-feed" role="status" aria-live="polite" aria-atomic="false"><span class="combat-empty">COMBAT FEED · NO ACCEPTED COMBAT YET</span></div>\n      </div>\n      <div id="economy-readout" class="economy-readout" aria-label="Send economy status">\n        <div id="own-economy" class="economy-fact">YOU · GOLD <strong>0</strong> · INCOME <strong>0</strong> · LIVES <strong>0</strong></div>\n        <div id="rival-pressure" class="economy-fact">RIVAL PRESSURE · <strong>0 ACTIVE</strong> · <strong>0 QUEUED</strong> · RIVAL LIVES <strong>0</strong></div>\n        <div id="send-feedback" role="status" aria-live="polite">SEND · NO COMMAND YET</div>\n      </div>\n      <div class="group"><strong>BUILD</strong>''',
    "P3 economy readout",
)

text = replace_once(
    text,
    '''      <div class="group"><strong>SEND</strong><button data-send="0">Scout 40</button><button data-send="1">Swarm 60</button><button data-send="2">Brute 90</button><button data-send="3">Siege 130</button></div>\n''',
    '''      <div class="group send-group"><strong>SEND</strong><button data-send="0">Scout</button><button data-send="1">Swarm</button><button data-send="2">Brute</button><button data-send="3">Siege</button><span class="key-hint">1–4 SEND</span></div>\n''',
    "P3 send controls",
)

text = replace_once(
    text,
    '''  const BOT_SEND_COST = [40, 60, 90, 130]\n''',
    '''''',
    "remove browser-owned bot send costs",
)

text = replace_once(
    text,
    '''  const combatPresentation = { previous: null, events: [], feedRevision: 0, renderedFeedRevision: 0 }\n  const byId = (id) => document.getElementById(id)\n''',
    '''  const combatPresentation = { previous: null, events: [], feedRevision: 0, renderedFeedRevision: 0 }\n  const SEND_NAMES = ['Scout', 'Swarm', 'Brute', 'Siege']\n  const SEND_KEYS = new Map([['Digit1', 0], ['Digit2', 1], ['Digit3', 2], ['Digit4', 3]])\n  const byId = (id) => document.getElementById(id)\n''',
    "P3 presentation catalog names and keys",
)

text = replace_once(
    text,
    '''  function botAct(state = snap()) {\n''',
    '''  function creepCost(kind) {\n    return apiCall('_TW_BrowserCreepCost', kind)\n  }\n\n  function creepIncomeGain(kind) {\n    return apiCall('_TW_BrowserCreepIncomeGain', kind)\n  }\n\n  function sendName(kind) {\n    return SEND_NAMES[kind] ?? `Creep ${kind}`\n  }\n\n  function renderEconomy(state) {\n    const player = state.players[0]\n    const rival = state.players[1]\n    const outboundCount = apiCall('_TW_BrowserOutboundCount', 0)\n    const pendingOutbound = apiCall('_TW_BrowserPendingSendCount', 0)\n    const outboundHp = apiCall('_TW_BrowserOutboundHitPoints', 0)\n    const maxCreeps = apiCall('_TW_BrowserMaxCreeps')\n    const capacityReady = state.activeCount + state.pendingCount < maxCreeps\n\n    byId('own-economy').innerHTML = `YOU · GOLD <strong>${player.gold}</strong> · INCOME <strong>${player.income}</strong> · LIVES <strong>${player.lives}</strong>`\n    byId('rival-pressure').innerHTML = `RIVAL PRESSURE · <strong>${outboundCount} ACTIVE</strong> · <strong>${pendingOutbound} QUEUED</strong> · OUTBOUND HP <strong>${outboundHp}</strong> · RIVAL LIVES <strong>${rival.lives}</strong>`\n\n    document.querySelectorAll('[data-send]').forEach((button) => {\n      const kind = Number(button.dataset.send)\n      const cost = creepCost(kind)\n      const incomeGain = creepIncomeGain(kind)\n      const affordable = cost >= 0 && player.gold >= cost\n      const ready = !state.terminal && affordable && capacityReady\n      const status = state.terminal\n        ? 'MATCH ENDED'\n        : !affordable\n          ? `NEED ${Math.max(0, cost - player.gold)}G`\n          : !capacityReady\n            ? 'CAP FULL'\n            : 'READY'\n      button.dataset.cost = String(cost)\n      button.dataset.incomeGain = String(incomeGain)\n      button.dataset.affordable = affordable ? 'true' : 'false'\n      button.dataset.ready = ready ? 'true' : 'false'\n      button.textContent = `${kind + 1} ${sendName(kind)} · ${cost}G → +${incomeGain} INC · ${status}`\n      button.title = `Send ${sendName(kind)}: authoritative cost ${cost} gold, income gain ${incomeGain}; ${status}`\n    })\n  }\n\n  function sendCreep(kind, source = 'pointer') {\n    const before = snap()\n    const ok = apiCall('_TW_BrowserSend', 0, kind) === 1\n    const after = snap()\n    const name = sendName(kind)\n    if (ok) {\n      const goldSpent = before.players[0].gold - after.players[0].gold\n      const incomeGain = after.players[0].income - before.players[0].income\n      byId('send-feedback').textContent = `SEND ACCEPTED · ${name} · -${goldSpent}G · +${incomeGain} INC`\n      setMessage(`${source} send accepted · ${name}`, true)\n    } else {\n      byId('send-feedback').textContent = `SEND REJECTED · ${name} · AUTHORITATIVE`\n      setMessage(`${source} send rejected · ${name}`, false)\n    }\n    render()\n    return ok ? 1 : 0\n  }\n\n  function botAct(state = snap()) {\n''',
    "P3 economy presentation helpers",
)

text = replace_once(
    text,
    '''    if (!ownsActiveCreep && state.players[1].gold >= BOT_SEND_COST[kind] &&\n        apiCall('_TW_BrowserSend', 1, kind) === 1) {\n''',
    '''    if (!ownsActiveCreep && state.players[1].gold >= creepCost(kind) &&\n        apiCall('_TW_BrowserSend', 1, kind) === 1) {\n''',
    "authoritative bot affordability source",
)

text = replace_once(
    text,
    '''    if (heroMode) updateCombatPresentation(state)\n    if (heroMode) {\n''',
    '''    if (heroMode) {\n      updateCombatPresentation(state)\n      renderEconomy(state)\n    }\n    if (heroMode) {\n''',
    "P3 render hook",
)

text = replace_once(
    text,
    '''      '_TW_BrowserStep', '_TW_BrowserReplayVerify',\n''',
    '''      '_TW_BrowserStep', '_TW_BrowserReplayVerify', '_TW_BrowserCreepCount',\n      '_TW_BrowserCreepCost', '_TW_BrowserCreepIncomeGain', '_TW_BrowserMaxCreeps',\n      '_TW_BrowserOutboundCount', '_TW_BrowserPendingSendCount', '_TW_BrowserOutboundHitPoints',\n''',
    "P3 read-only required exports",
)

text = replace_once(
    text,
    '''        nativeReplay,\n        sampleHumanInput,\n''',
    '''        nativeReplay,\n        sendCreep,\n        sampleHumanInput,\n''',
    "P3 shared UI helper",
)

text = replace_once(
    text,
    '''    if (!MOVE_KEYS.has(event.code) && !ACTION_KEYS.has(event.code)) return\n    event.preventDefault()\n    if (MOVE_KEYS.has(event.code)) {\n''',
    '''    if (!MOVE_KEYS.has(event.code) && !ACTION_KEYS.has(event.code) && !SEND_KEYS.has(event.code)) return\n    event.preventDefault()\n    if (SEND_KEYS.has(event.code)) {\n      if (!event.repeat) sendCreep(SEND_KEYS.get(event.code), 'keyboard')\n      return\n    }\n    if (MOVE_KEYS.has(event.code)) {\n''',
    "P3 keyboard sends",
)

text = replace_once(
    text,
    '''  document.querySelectorAll('[data-send]').forEach((button) => button.addEventListener('click', () => {\n    const ok = apiCall('_TW_BrowserSend', 0, Number(button.dataset.send)) === 1\n    setMessage(ok ? 'creep sent to rival line' : 'send rejected', ok)\n    render()\n  }))\n''',
    '''  document.querySelectorAll('[data-send]').forEach((button) => button.addEventListener('click', () => {\n    sendCreep(Number(button.dataset.send), 'pointer')\n  }))\n''',
    "P3 pointer sends",
)

shell_path.write_text(text)
print("Hero Line Wars Playable V1 P3 send/economy readability overlay applied")
