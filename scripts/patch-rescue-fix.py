from pathlib import Path
import re

# Fix integration edges left by the broad migration after the old queued-key fields disappear.
p = Path('src/game/scenes/GameScene.ts')
s = p.read_text()
s = s.replace(
    "    this.hitStopMs = 0    this.desktopInput.consumeAttacks()\n",
    "    this.hitStopMs = 0\n    this.keyboardCombat.clear()\n    this.desktopInput.clearAttackBuffers()\n",
)
s = s.replace(
    "  private powerupColor(kind: PowerupKind): number {\n    return kind === 'frenzy' ? 0xff4f8d : kind === 'freeze' ? 0x75e6ff : 0x7cff7c\n  }\n",
    "  private powerupColor(_kind: PowerupKind): number {\n    return 0xffd35a\n  }\n",
)
s = s.replace(
    "    const label = this.add.text(0, 18, kind === 'frenzy' ? 'CUT' : kind === 'freeze' ? 'TIME' : 'HP', {\n",
    "    const label = this.add.text(0, 18, 'LAST BITE', {\n",
)
s = s.replace(
    "    this.flowBanner = this.add.text(480, 150, event.source === 'combo' ? 'LAST CHANCE // BULLET TIME' : 'TIME CORE', {\n",
    "    this.flowBanner = this.add.text(480, 150, 'LAST CHANCE // BULLET TIME', {\n",
)
s = s.replace(
    "    const label = kind === 'frenzy' ? 'CUT FRENZY' : kind === 'freeze' ? 'TIME FREEZE' : 'APPLE JUICE +HP'\n",
    "    const label = 'LAST BITE // SAVED'\n",
)
s = s.replace(
    "  private showBulletTime(event: Extract<SimEvent, { type: 'bullet-time' }>): void {\n",
    "  private showBulletTime(_event: Extract<SimEvent, { type: 'bullet-time' }>): void {\n",
)
s = s.replace(
    "  private showPowerupPickup(kind: PowerupKind): void {\n",
    "  private showPowerupPickup(_kind: PowerupKind): void {\n",
)

# Phaser Graphics does not expose cubic bezier path methods in the current typed API.
# At gameplay scale a deliberately faceted apple-logo silhouette is clearer anyway.
head_pattern = r"    // Apple-logo-first top silhouette:.*?const leaf = this\.add\.ellipse\(1, -30, 20, 8, green\)\.setStrokeStyle\(2, dark\)\.setRotation\(-0\.48\)\n"
head_replacement = '''    // Apple-logo-first top silhouette: deliberately faceted for top-down readability.\n    const outline = this.add.polygon(10, 0, [\n      5, -25, -3, -20, -12, -22, -21, -16, -26, -6, -25, 7, -19, 18, -10, 27, 1, 31,\n      10, 27, 16, 20, 21, 21, 30, 14, 34, 5, 33, -5, 28, -15, 19, -22, 11, -23,\n    ], dark, 1)\n    const apple = this.add.polygon(10, 0, [\n      5, -20, -2, -16, -10, -18, -17, -13, -21, -5, -20, 6, -15, 15, -7, 22, 2, 26,\n      9, 22, 14, 16, 19, 17, 26, 11, 29, 4, 28, -4, 24, -12, 17, -18, 10, -19,\n    ], furHighlight, 1)\n    const topCleft = this.add.triangle(10, -20, -5, 0, 5, 0, 0, 9, dark).setRotation(Math.PI)\n    const bite1 = this.add.circle(29, -8, 7, dark)\n    const bite2 = this.add.circle(33, 0, 7.5, dark)\n    const bite3 = this.add.circle(29, 8, 6.5, dark)\n    const stem = this.add.rectangle(10, -28, 4, 10, 0x79513a).setRotation(0.24)\n    const leaf = this.add.ellipse(0, -31, 20, 8, green).setStrokeStyle(2, dark).setRotation(-0.48)\n'''
s, n = re.subn(head_pattern, head_replacement, s, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'polygon head replacement count={n}')
p.write_text(s)

p = Path('src/game/sim/GameState.ts')
s = p.read_text()
s = s.replace("  private registerKill(x: number, y: number): void {\n", "  private registerKill(_x: number, _y: number): void {\n")
s = s.replace(
    "obstacle: { x: number; y: number; width: number; height: number }",
    "obstacle: { id: number; x: number; y: number; width: number; height: number }",
)
p.write_text(s)

# The old movement regression assumed an empty arena and required the player to reach the outer wall.
# With level geometry the correct invariant is forward progress + no arena escape + no building penetration.
Path('tests/movement.test.ts').write_text('''import { describe, expect, it } from 'vitest'\nimport { ARENA_BOUNDS, GameState } from '../src/game/sim/GameState'\nimport { CITY_LEVEL_OBSTACLES, circleOverlapsObstacle } from '../src/game/world/Level'\n\ndescribe('player arena bounds', () => {\n  it('keeps authoritative movement inside the arena and outside city obstacles', () => {\n    const state = new GameState(123)\n    state.player.hp = 999\n    const startX = state.player.x\n\n    for (let tick = 0; tick < 300; tick += 1) state.step({ x: 1, y: 0 })\n    expect(state.player.x).toBeGreaterThan(startX)\n    expect(Math.abs(state.player.x)).toBeLessThanOrEqual(ARENA_BOUNDS.halfWidth)\n    expect(Math.abs(state.player.y)).toBeLessThanOrEqual(ARENA_BOUNDS.halfHeight)\n    expect(CITY_LEVEL_OBSTACLES.some((obstacle) => circleOverlapsObstacle(state.player.x, state.player.y, 14, obstacle))).toBe(false)\n\n    for (let tick = 0; tick < 300; tick += 1) state.step({ x: 0, y: 1 })\n    expect(Math.abs(state.player.x)).toBeLessThanOrEqual(ARENA_BOUNDS.halfWidth)\n    expect(Math.abs(state.player.y)).toBeLessThanOrEqual(ARENA_BOUNDS.halfHeight)\n    expect(CITY_LEVEL_OBSTACLES.some((obstacle) => circleOverlapsObstacle(state.player.x, state.player.y, 14, obstacle))).toBe(false)\n  })\n})\n''')
