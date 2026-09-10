#!/usr/bin/env python3
from pathlib import Path

path = Path("spike/tower_wars/tower_wars_shell.html")
text = path.read_text()

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
    ("incoming pursuit", incoming_old, incoming_new),
    ("defensive anchor", anchor_old, anchor_new),
):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"tower_wars_shell.html: expected {label} anchor once, got {count}")
    text = text.replace(old, new, 1)

path.write_text(text)
print("Hero Line Wars H8 deterministic bot scheduler repair applied")
