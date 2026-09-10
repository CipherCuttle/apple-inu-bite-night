#!/usr/bin/env python3
from pathlib import Path

path = Path("spike/tower_wars/tower_wars_shell.html")
text = path.read_text()

layout_old = '''    .fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;min-height:0}
    .field-card{padding:12px;display:grid;grid-template-rows:auto 1fr;gap:10px;min-height:0}
    .field-head{display:flex;align-items:center;justify-content:space-between}
    .human{color:var(--human)} .enemy{color:var(--enemy)}
    .grid{display:grid;grid-template-columns:repeat(9,1fr);grid-template-rows:repeat(7,1fr);gap:3px;aspect-ratio:9/7;align-self:center;width:100%;max-height:100%;user-select:none}
'''
layout_new = '''    .fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;min-height:0;overflow:hidden;position:relative;z-index:1}
    .field-card{padding:12px;display:grid;grid-template-rows:auto 1fr;gap:10px;min-height:0;overflow:hidden}
    .field-head{display:flex;align-items:center;justify-content:space-between}
    .human{color:var(--human)} .enemy{color:var(--enemy)}
    .grid{display:grid;grid-template-columns:repeat(9,1fr);grid-template-rows:repeat(7,1fr);gap:3px;align-self:stretch;width:100%;height:100%;min-height:0;user-select:none}
'''
controls_old = '''    .controls{padding:12px;display:grid;grid-template-columns:1.45fr 1.05fr 1fr;gap:10px 14px}
'''
controls_new = '''    .controls{padding:12px;display:grid;grid-template-columns:1.45fr 1.05fr 1fr;gap:10px 14px;position:relative;z-index:2}
'''
arguments_old = '''    arguments: ['-data', '/share', '+map', '__wasm_smoke__'],
'''
arguments_new = '''    // H8 is an embedded browser control surface. OpenRealm's shipped WC3 config
    // requests native fullscreen, which promotes the canvas into the browser top
    // layer and makes sibling DOM controls non-hit-testable. Override only video
    // presentation policy here; simulation/game authority remains unchanged.
    arguments: ['-data', '/share', '+set', 'vid_native', '0', '+set', 'vid_fullscreen', '0', '+map', '__wasm_smoke__'],
'''

incoming_old = '''      if (distance > 48) {
        const goalX = clamp(tx, -160, 160)
        const goalY = clamp(ty, 24, 160)
        const goal = `${goalX},${goalY}`
        if (botState.lastMoveGoal !== goal && apiCall('_HLW_BrowserHeroMove', 1, goalX, goalY) === 1) {
          botState.lastMoveGoal = goal
          return recordBot({ tick: state.tick, kind: 'move', detail: `creep ${target.id} @ ${goal}` })
        }
        return recordBot({ tick: state.tick, kind: 'pursue', detail: `creep ${target.id}` })
      }
'''
incoming_new = '''      if (distance > 48) {
        // Native hero movement resolves X before Y. Align vertically first so a
        // moving creep cannot keep the bot permanently outside combat range.
        const goalY = clamp(ty, 24, 160)
        const goalX = Math.abs(dy) > 24 ? hx : clamp(tx, -160, 160)
        const goal = `${goalX},${goalY}`
        if (botState.lastMoveGoal !== goal && apiCall('_HLW_BrowserHeroMove', 1, goalX, goalY) === 1) {
          botState.lastMoveGoal = goal
          return recordBot({ tick: state.tick, kind: 'move', detail: `creep ${target.id} @ ${goal}` })
        }
        return recordBot({ tick: state.tick, kind: 'pursue', detail: `creep ${target.id}` })
      }
'''

anchor_old = '''    const [hx, hy] = heroPosition(1)
    const anchor = [-120, 82]
    if (hx !== anchor[0] || hy !== anchor[1]) {
      const goal = `${anchor[0]},${anchor[1]}`
      if (botState.lastMoveGoal !== goal && apiCall('_HLW_BrowserHeroMove', 1, anchor[0], anchor[1]) === 1) {
        botState.lastMoveGoal = goal
        return recordBot({ tick: state.tick, kind: 'move', detail: 'defensive anchor' })
      }
      return recordBot({ tick: state.tick, kind: 'position', detail: 'defensive anchor' })
    }
'''
anchor_new = '''    const [hx, hy] = heroPosition(1)
    const anchor = [0, 82]
    if (hx !== anchor[0] || hy !== anchor[1]) {
      // Stage at the actual lane center. Because native movement is axis-ordered,
      // finish Y alignment before traversing X; this guarantees the bot reaches a
      // combat-capable posture during quiet ticks instead of shadowing the lane
      // from y=140 forever.
      const goalX = hy !== anchor[1] ? hx : anchor[0]
      const goalY = anchor[1]
      const goal = `${goalX},${goalY}`
      if (botState.lastMoveGoal !== goal && apiCall('_HLW_BrowserHeroMove', 1, goalX, goalY) === 1) {
        botState.lastMoveGoal = goal
        return recordBot({ tick: state.tick, kind: 'move', detail: 'defensive lane center' })
      }
      return recordBot({ tick: state.tick, kind: 'position', detail: 'defensive lane center' })
    }
'''

for label, old, new in (
    ("playfield containment", layout_old, layout_new),
    ("control stacking", controls_old, controls_new),
    ("embedded video policy", arguments_old, arguments_new),
    ("incoming pursuit", incoming_old, incoming_new),
    ("defensive anchor", anchor_old, anchor_new),
):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"tower_wars_shell.html: expected {label} anchor once, got {count}")
    text = text.replace(old, new, 1)

path.write_text(text)
print("Hero Line Wars H8 playable shell repair applied")
