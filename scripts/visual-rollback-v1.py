from pathlib import Path
import re
import shutil

# V1 visual recovery: preserve buffered attacks + Last Chance rescue, remove the failed
# imported-city collision experiment, tame gore, and replace procedural Apple-head shapes
# with a dedicated small SVG silhouette.

p = Path('src/game/scenes/GameScene.ts')
s = p.read_text()
s = s.replace("import { CITY_LEVEL_OBSTACLES } from '../world/Level'\n", '')
s = s.replace("    this.load.image('city-tiles', 'assets/levels/city-block/tiles.png')\n    this.load.tilemapTiledJSON('city-level', 'assets/levels/city-block/map.json')\n", '')
s = s.replace("    this.load.image('apple-inu-sword', 'assets/characters/apple-inu/sword.png')\n", "    this.load.image('apple-inu-sword', 'assets/characters/apple-inu/sword.png')\n    this.load.svg('apple-inu-head', 'assets/characters/apple-inu/head.svg', { width: 48, height: 48 })\n")
s = s.replace('const SWORD_MOUTH_X = 28\n', 'const SWORD_MOUTH_X = 23\n')
s = s.replace('    this.createImportedCityLevel()\n', '')
s, n = re.subn(r"\n  private createImportedCityLevel\(\): void \{.*?\n  private createPropRenderers\(\): void \{", "\n  private createPropRenderers(): void {", s, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'createImportedCityLevel removal count={n}')
player_replacement = '''  private createPlayer(): void {\n    const bladeLength = BASE_SWORD.outerRadius - BASE_SWORD.innerRadius\n    const dark = 0x17151b\n    const fur = 0xf5f4ee\n    const furHighlight = 0xffffff\n    const furShade = 0xcfd3dc\n\n    const makeTrail = (angle: number) =>\n      this.add\n        .rectangle(SWORD_MOUTH_X, 0, bladeLength, 9, 0xff4f8d, 1)\n        .setOrigin(0, 0.5)\n        .setRotation(SWORD_REST_ANGLE + angle)\n        .setAlpha(0)\n\n    this.swordTrails = SLASH_TRAIL_ANGLES.map(makeTrail)\n\n    const shadow = this.add.ellipse(-5, 5, 43, 24, 0x000000, 0.25)\n    const tail = this.add.ellipse(-25, -2, 16, 6, furShade).setStrokeStyle(2, dark).setRotation(-0.72)\n    const hind = this.add.ellipse(-18, 0, 18, 18, fur).setStrokeStyle(2, dark)\n    const body = this.add.ellipse(-3, 0, 36, 24, fur).setStrokeStyle(2, dark)\n    const chest = this.add.ellipse(8, 0, 20, 18, furHighlight).setStrokeStyle(2, dark)\n    const pawBackTop = this.add.ellipse(-15, -11, 11, 6, furShade).setStrokeStyle(1.5, dark).setRotation(-0.18)\n    const pawBackBottom = this.add.ellipse(-15, 11, 11, 6, furShade).setStrokeStyle(1.5, dark).setRotation(0.18)\n    const pawFrontTop = this.add.ellipse(4, -11, 12, 6, furHighlight).setStrokeStyle(1.5, dark).setRotation(-0.12)\n    const pawFrontBottom = this.add.ellipse(4, 11, 12, 6, furHighlight).setStrokeStyle(1.5, dark).setRotation(0.12)\n\n    const head = this.add.image(9, 0, 'apple-inu-head').setDisplaySize(42, 42)\n    const mouthGap = this.add.ellipse(SWORD_MOUTH_X - 2, 0, 14, 8, dark, 0.95)\n    const lowerJaw = this.add.ellipse(SWORD_MOUTH_X - 3, 4, 14, 6, furShade).setStrokeStyle(1.5, dark)\n    this.sword = this.add\n      .image(SWORD_MOUTH_X, 0, 'apple-inu-sword')\n      .setOrigin(0.08, 0.5)\n      .setRotation(SWORD_REST_ANGLE)\n      .setScale(1.04)\n    const upperJaw = this.add.ellipse(SWORD_MOUTH_X - 3, -4, 14, 6, furHighlight).setStrokeStyle(1.5, dark)\n    const toothTop = this.add.triangle(SWORD_MOUTH_X, -1, 0, 0, 4, 0, 2, 4, 0xfefefe)\n    const toothBottom = this.add.triangle(SWORD_MOUTH_X, 1, 0, 0, 4, 0, 2, -4, 0xe9e9e5)\n\n    this.headRig = this.add.container(0, 0, [\n      ...this.swordTrails,\n      head,\n      mouthGap,\n      lowerJaw,\n      this.sword,\n      upperJaw,\n      toothTop,\n      toothBottom,\n    ])\n    this.player = this.add\n      .container(WORLD_CX, WORLD_CY, [\n        shadow,\n        tail,\n        pawBackTop,\n        pawBackBottom,\n        hind,\n        body,\n        chest,\n        pawFrontTop,\n        pawFrontBottom,\n        this.headRig,\n      ])\n      .setDepth(10)\n  }\n\n'''
s, n = re.subn(r"  private createPlayer\(\): void \{.*?\n  private animateSword", player_replacement + '  private animateSword', s, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'createPlayer replacement count={n}')
arena_marker = "    graphics.fillStyle(0x120b18, 1)\n    graphics.fillRect(\n      WORLD_CX - ARENA_BOUNDS.halfWidth,\n      WORLD_CY - ARENA_BOUNDS.halfHeight,\n      ARENA_BOUNDS.halfWidth * 2,\n      ARENA_BOUNDS.halfHeight * 2,\n    )\n"
arena_insert = arena_marker + "    graphics.fillStyle(0x16131c, 1)\n    graphics.fillRect(70, 95, 820, 350)\n    graphics.fillStyle(0x201b27, 1)\n    graphics.fillRect(70, 95, 820, 38)\n    graphics.fillRect(70, 407, 820, 38)\n    graphics.fillStyle(0xb49855, 0.28)\n    for (let x = 110; x < 860; x += 86) graphics.fillRect(x, 266, 42, 3)\n    graphics.fillStyle(0xd8d2c8, 0.16)\n    for (let i = 0; i < 6; i += 1) graphics.fillRect(150 + i * 18, 126, 9, 54)\n    graphics.fillStyle(0x573046, 0.22)\n    graphics.fillRect(725, 358, 120, 4)\n"
if arena_marker not in s:
    raise SystemExit('arena marker missing')
s = s.replace(arena_marker, arena_insert, 1)
s = s.replace("    const body = this.add.ellipse(-4, 0, 42, 24, 0xff4f8d, 0.14)\n    const blade = this.add.rectangle(15, 0, 84, 5, 0xffb6cf, 0.2).setOrigin(0, 0.5)\n", "    const body = this.add.ellipse(-4, 0, 30, 18, 0xff4f8d, 0.1)\n    const blade = this.add.rectangle(15, 0, 72, 4, 0xffb6cf, 0.16).setOrigin(0, 0.5)\n")
p.write_text(s)

p = Path('src/game/sim/GameState.ts')
s = p.read_text()
s = s.replace("import { CITY_LEVEL_OBSTACLES, circleOverlapsObstacle, pointInsideExpandedObstacle } from '../world/Level'\n", '')
s = s.replace("    if (!this.playerOverlapsProp(nextX, this.player.y) && !this.playerOverlapsLevel(nextX, this.player.y)) this.player.x = nextX\n", "    if (!this.playerOverlapsProp(nextX, this.player.y)) this.player.x = nextX\n")
s = s.replace("    if (!this.playerOverlapsProp(this.player.x, nextY) && !this.playerOverlapsLevel(this.player.x, nextY)) this.player.y = nextY\n", "    if (!this.playerOverlapsProp(this.player.x, nextY)) this.player.y = nextY\n")
s = s.replace("      this.resolveEnemyArenaWall(enemy)\n      this.resolveEnemyLevelObstacles(enemy)\n", "      this.resolveEnemyArenaWall(enemy)\n")
city_dash = '''    let blocked = false\n    for (const obstacle of CITY_LEVEL_OBSTACLES) {\n      if (!segmentIntersectsExpandedObstacle(startX, startY, endX, endY, PLAYER_RADIUS, obstacle)) continue\n      blocked = true\n      endX = startX\n      endY = startY\n      break\n    }\n'''
if city_dash not in s:
    raise SystemExit('city dash block missing')
s = s.replace(city_dash, "    let blocked = false\n", 1)
s = s.replace("    if (this.playerOverlapsLevel(x, y)) { x = this.player.x; y = this.player.y }\n", '')
s, n = re.subn(r"\n  private playerOverlapsLevel\(x: number, y: number\): boolean \{.*?\n  private resolveEnemyContact\(\): void \{", "\n  private resolveEnemyContact(): void {", s, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'level helper removal count={n}')
s = s.replace("      if (!enemy) break\n      if (CITY_LEVEL_OBSTACLES.some((obstacle) => circleOverlapsObstacle(enemy.x, enemy.y, enemy.radius, obstacle))) { this.enemies.kill(enemy); continue }\n", "      if (!enemy) break\n")
s, n = re.subn(r"\nfunction segmentIntersectsExpandedObstacle\(.*?\n\}\n\nfunction clamp", "\nfunction clamp", s, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'segment helper removal count={n}')
p.write_text(s)

p = Path('src/presentation/GoreFx.ts')
s = p.read_text()
s = s.replace('const DECAL_LIFE_MS = 30000', 'const DECAL_LIFE_MS = 12000')
s = s.replace('private readonly budget = new GoreBudget(5, 12)', 'private readonly budget = new GoreBudget(3, 8)')
s = s.replace("      this.spawnSpray(hit, 4, cameraX, cameraY)\n      if (hit.severedPart) this.spawnSeveredPart(hit, cameraX, cameraY)\n      if (hit.attack === 'slash' || hit.attack === 'whirlwind') this.spawnDecal(hit, cameraX, cameraY, 0.5)\n", "      this.spawnSpray(hit, 2, cameraX, cameraY)\n      if (hit.severedPart) {\n        this.spawnSeveredPart(hit, cameraX, cameraY)\n        this.spawnDecal(hit, cameraX, cameraY, 0.28)\n      }\n")
s = s.replace("      this.spawnSpray(hit, hit.attack === 'whirlwind' ? 13 : 10, cameraX, cameraY)\n      const limbCount = hit.attack === 'slash' || hit.attack === 'whirlwind' ? 4 : hit.attack === 'dash' ? 3 : 2\n      this.spawnDismemberment(hit, limbCount, cameraX, cameraY, true)\n      this.spawnMeatBits(hit, hit.attack === 'stab' ? 2 : 3, cameraX, cameraY)\n      this.spawnDecal(hit, cameraX, cameraY, 1)\n", "      this.spawnSpray(hit, hit.attack === 'whirlwind' ? 7 : 6, cameraX, cameraY)\n      const limbCount = hit.attack === 'slash' || hit.attack === 'whirlwind' ? 3 : hit.attack === 'dash' ? 2 : 1\n      this.spawnDismemberment(hit, limbCount, cameraX, cameraY, true)\n      this.spawnMeatBits(hit, hit.attack === 'stab' ? 1 : 2, cameraX, cameraY)\n      this.spawnDecal(hit, cameraX, cameraY, 0.62)\n")
s = s.replace('gib.lifeMs = rng.int(6500, 10500)', 'gib.lifeMs = rng.int(3200, 6200)')
s = s.replace('gib.lifeMs = rng.int(includeHead ? 6500 : 4200, includeHead ? 11000 : 7600)', 'gib.lifeMs = rng.int(includeHead ? 3600 : 2600, includeHead ? 6800 : 5200)')
s = s.replace('gib.lifeMs = rng.int(2200, 4800)', 'gib.lifeMs = rng.int(1400, 3000)')
s = s.replace("      .setScale(rng.range(0.7, 1.45) * scaleMultiplier)\n", "      .setScale(rng.range(0.48, 0.92) * scaleMultiplier)\n")
s = s.replace("      .setAlpha(0.78)\n", "      .setAlpha(0.55)\n")
p.write_text(s)

Path('public/assets/characters/apple-inu/head.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n  <g stroke="#17151b" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">\n    <path fill="#f7f7f3" d="M31 15 C25 10 16 11 11 19 C5 28 9 44 18 53 C24 59 29 55 35 55 C41 55 46 59 52 52 C57 46 59 41 60 36 C54 35 49 31 49 25 C49 20 52 17 56 15 C50 10 42 10 36 14 C34 15 33 16 31 15 Z"/>\n    <path fill="#67c857" d="M31 10 C35 3 43 2 48 5 C44 11 38 14 31 13 Z"/>\n    <path fill="none" d="M33 14 C34 10 34 8 36 5"/>\n  </g>\n</svg>\n''')

Path('tests/movement.test.ts').write_text('''import { describe, expect, it } from 'vitest'\nimport { ARENA_BOUNDS, GameState } from '../src/game/sim/GameState'\n\ndescribe('player arena bounds', () => {\n  it('keeps authoritative movement inside the visible one-screen arena', () => {\n    const state = new GameState(123)\n    state.player.hp = 999\n    for (let tick = 0; tick < 300; tick += 1) state.step({ x: 1, y: 0 })\n    expect(state.player.x).toBe(ARENA_BOUNDS.halfWidth)\n    for (let tick = 0; tick < 300; tick += 1) state.step({ x: 0, y: 1 })\n    expect(state.player.y).toBe(ARENA_BOUNDS.halfHeight)\n  })\n})\n''')

for path in [Path('src/game/world/Level.ts'), Path('tests/level.test.ts'), Path('docs/RESCUE_LEVEL_V0.md')]:
    if path.exists(): path.unlink()
for path in [Path('public/assets/levels/city-block'), Path('licenses/third_party/kenney-pico8-city')]:
    if path.exists(): shutil.rmtree(path)
Path('docs/VISUAL_RECOVERY_V1.md').write_text('''# Visual Recovery V1\n\nThe imported full-city experiment was rejected by human playtest because it created unreadable visual density and deterministic enemy pile-ups against building rectangles.\n\nThis recovery keeps the successful pieces from that pass: fixed-tick buffering for SPACE/E/Q/Shift release and the once-per-run Last Chance rescue.\n\nIt removes the imported city tilemap and all building collision geometry. The arena is open again, with sparse street dressing only; authoritative collision remains limited to the existing breakable props.\n\nApple Inu now uses a dedicated small SVG bitten-apple head asset instead of a procedural pile of Phaser shapes. The white dog body is reduced in screen size while the sword remains side-bitten.\n\nGore density and persistence are reduced so limbs remain readable without covering the arena.\n''')
