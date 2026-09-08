#!/usr/bin/env python3
from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "open-realm/build-wasm/openrealm.html")
text = path.read_text()

if "__wasm_smoke__" not in text:
    raise SystemExit("expected wasm smoke map argument in generated shell")
text = text.replace("__wasm_smoke__", "__hero_line_wars__")

# Emscripten creates callable-looking native wrappers before the Wasm runtime is
# ready. Make readiness explicit at the existing lifecycle boundary so neither
# HUD polling nor user input can invoke a native export early.
runtime_hook = "onRuntimeInitialized: () => { document.getElementById('status').textContent = 'OpenRealm wasm runtime initialized'; },"
if text.count(runtime_hook) != 1:
    raise SystemExit("generated shell runtime hook anchor missing")
text = text.replace(
    runtime_hook,
    "onRuntimeInitialized: () => { window.__HLW_RUNTIME_READY = true; document.getElementById('status').textContent = 'OpenRealm wasm runtime initialized'; },",
    1,
)

style = r'''
<style id="hlw-style">
  #status{top:auto;bottom:10px;left:12px;opacity:.55;font-size:11px;pointer-events:none}
  #hlw-hud{position:fixed;z-index:10;inset:0;pointer-events:none;color:#eee;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-shadow:0 1px 2px #000}
  #hlw-top{position:absolute;left:50%;top:14px;transform:translateX(-50%);display:flex;gap:10px;align-items:stretch}
  .hlw-card{background:#09070dd9;border:1px solid #7042a3;padding:8px 11px;min-width:112px;box-shadow:0 0 0 1px #0008 inset}
  .hlw-title{font-size:10px;letter-spacing:.14em;color:#bd8cff;margin-bottom:4px}
  .hlw-value{font-size:15px;font-weight:700;white-space:nowrap}
  #hlw-versus{display:flex;align-items:center;font-size:11px;letter-spacing:.18em;color:#a6a0ae;padding:0 3px}
  #hlw-help{position:absolute;left:18px;bottom:18px;background:#09070dcc;border:1px solid #3c2c4d;padding:8px 10px;font-size:11px;line-height:1.55;color:#c8c3cf}
  #hlw-sendbar{pointer-events:auto;position:absolute;left:50%;bottom:18px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;background:#08060bcc;border:1px solid #4d3066;padding:8px}
  .hlw-send{appearance:none;border:1px solid #8053b7;background:#17101f;color:#eee;padding:8px 10px;font:inherit;cursor:pointer;min-width:132px;text-align:left}
  .hlw-send:hover{background:#261735;border-color:#b978ff}.hlw-send:active{transform:translateY(1px)}
  .hlw-send strong{display:block;color:#fff;font-size:12px}.hlw-send small{color:#b8adbf}
  #hlw-nova{border-color:#3da981}.hlw-hotkey{color:#d8a7ff;font-weight:700}
  #hlw-result{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#050408ee;border:2px solid #a962ef;padding:20px 28px;font-size:26px;font-weight:800;letter-spacing:.08em;display:none}
  #hlw-lanes{position:absolute;inset:0;pointer-events:none}
  .hlw-lane-tag{position:absolute;right:13%;font-size:10px;letter-spacing:.16em;opacity:.72}.hlw-lane-tag.enemy{top:32%;color:#ff7aa4}.hlw-lane-tag.player{top:63%;color:#69efc0}
  @media(max-width:900px){#hlw-top{top:6px;gap:4px}.hlw-card{min-width:82px;padding:6px;font-size:10px}.hlw-value{font-size:12px}#hlw-help{display:none}.hlw-send{min-width:96px;padding:6px;font-size:10px}}
</style>
'''

body = r'''
<div id="hlw-hud">
  <div id="hlw-top">
    <div class="hlw-card"><div class="hlw-title">YOU</div><div class="hlw-value"><span id="hlw-gold">—</span>g · +<span id="hlw-income">—</span></div><div>lives <b id="hlw-lives">—</b> · lvl <b id="hlw-level">—</b></div></div>
    <div class="hlw-card"><div class="hlw-title">INCOME</div><div class="hlw-value"><span id="hlw-income-timer">—</span>s</div><div>xp <b id="hlw-xp">—</b> · nova <b id="hlw-nova-cd">—</b></div></div>
    <div id="hlw-versus">VS</div>
    <div class="hlw-card"><div class="hlw-title">ENEMY AI</div><div class="hlw-value"><span id="hlw-enemy-income">—</span> inc</div><div>lives <b id="hlw-enemy-lives">—</b> · lvl <b id="hlw-enemy-level">—</b></div></div>
    <div class="hlw-card"><div class="hlw-title">CREEPS</div><div class="hlw-value"><span id="hlw-your-lane">—</span> / <span id="hlw-enemy-lane">—</span></div><div>your lane / enemy lane</div></div>
  </div>
  <div id="hlw-lanes"><div class="hlw-lane-tag enemy">SEND → ENEMY EXIT</div><div class="hlw-lane-tag player">DEFEND → YOUR EXIT</div></div>
  <div id="hlw-help"><b>HERO LINE WARS</b><br><span class="hlw-hotkey">WASD</span> move hero<br><span class="hlw-hotkey">Q</span> nova<br><span class="hlw-hotkey">1 / 2 / 3</span> send creeps<br><span class="hlw-hotkey">R</span> restart</div>
  <div id="hlw-sendbar">
    <button class="hlw-send" data-send="0"><strong><span class="hlw-hotkey">1</span> RUNNER · 10g</strong><small>fast · +2 income</small></button>
    <button class="hlw-send" data-send="1"><strong><span class="hlw-hotkey">2</span> BRUTE · 35g</strong><small>tough · +6 income</small></button>
    <button class="hlw-send" data-send="2"><strong><span class="hlw-hotkey">3</span> JUGGERNAUT · 75g</strong><small>slow tank · +12 income</small></button>
    <button id="hlw-nova" class="hlw-send"><strong><span class="hlw-hotkey">Q</span> NOVA</strong><small>AOE · 6s cooldown</small></button>
  </div>
  <div id="hlw-result"></div>
</div>
'''

script = r'''
<script id="hlw-bridge">
(() => {
  const byId = id => document.getElementById(id);
  const ready = () => window.__HLW_RUNTIME_READY === true && window.Module;
  const call = (name, ...args) => {
    if (!ready()) return 0;
    const fn = window.Module['_' + name];
    return typeof fn === 'function' ? fn(...args) : 0;
  };
  const movement = {a:0,d:1,w:2,s:3};
  let bridgeReadyLogged = false;

  function send(type){ return call('HLW_Send', type|0); }
  function nova(){ return call('HLW_CastNova'); }
  function reset(){ call('HLW_Reset'); }

  document.querySelectorAll('[data-send]').forEach(btn => btn.addEventListener('click', () => send(Number(btn.dataset.send))));
  byId('hlw-nova').addEventListener('click', nova);

  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(movement, key)) {
      if (ready()) call('HLW_SetMove', movement[key], 1); e.preventDefault(); return;
    }
    if (e.repeat) return;
    if (key === '1' || key === '2' || key === '3') { if (ready()) send(Number(key) - 1); e.preventDefault(); }
    else if (key === 'q') { if (ready()) nova(); e.preventDefault(); }
    else if (key === 'r') { if (ready()) reset(); e.preventDefault(); }
  }, {passive:false});
  window.addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(movement, key)) {
      if (ready()) call('HLW_SetMove', movement[key], 0); e.preventDefault();
    }
  }, {passive:false});
  window.addEventListener('blur', () => { if (ready()) for (let i=0;i<4;i++) call('HLW_SetMove', i, 0); });

  function refresh(){
    if (!ready() || typeof window.Module._HLW_GetGold !== 'function') return;
    if (!bridgeReadyLogged) { console.log('HERO_LINE_WARS_BROWSER_BRIDGE=READY'); bridgeReadyLogged = true; }
    byId('hlw-gold').textContent = call('HLW_GetGold');
    byId('hlw-income').textContent = call('HLW_GetIncome');
    byId('hlw-enemy-income').textContent = call('HLW_GetEnemyIncome');
    byId('hlw-lives').textContent = call('HLW_GetLives', 0);
    byId('hlw-enemy-lives').textContent = call('HLW_GetLives', 1);
    byId('hlw-level').textContent = call('HLW_GetHeroLevel', 0);
    byId('hlw-enemy-level').textContent = call('HLW_GetHeroLevel', 1);
    byId('hlw-xp').textContent = call('HLW_GetHeroXp', 0);
    byId('hlw-income-timer').textContent = call('HLW_GetIncomeCountdown');
    const cd = call('HLW_GetNovaCooldown');
    byId('hlw-nova-cd').textContent = cd ? cd + 's' : 'ready';
    byId('hlw-your-lane').textContent = call('HLW_GetCreepCount', 0);
    byId('hlw-enemy-lane').textContent = call('HLW_GetCreepCount', 1);
    const state = call('HLW_GetGameState');
    const result = byId('hlw-result');
    if (state) { result.textContent = state > 0 ? 'VICTORY' : 'DEFEAT'; result.style.display = 'block'; }
    else result.style.display = 'none';
  }
  setInterval(refresh, 100);
  window.HLW = {send, nova, reset, call, refresh, ready};
})();
</script>
'''

if "</head>" not in text or "<body>" not in text or "</body>" not in text:
    raise SystemExit("generated html shell anchors missing")
text = text.replace("</head>", style + "\n</head>", 1)
text = text.replace("<body>", "<body>\n" + body, 1)
text = text.replace("</body>", script + "\n</body>", 1)
path.write_text(text)
print(f"Hero Line Wars browser shell decorated: {path}")
