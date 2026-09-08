import fs from 'node:fs'

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`missing patch anchor: ${label}`)
  return source.replace(from, () => to)
}

const simPath = 'src/game/sim/GameState.ts'
let sim = fs.readFileSync(simPath, 'utf8')

sim = replaceOnce(
  sim,
  "import { isPointInSwordArc, normalizeAngle, swordForAttack, type AttackKind } from '../combat/Sword'\n",
  "import { isPointInSwordArc, normalizeAngle, swordForAttack, type AttackKind } from '../combat/Sword'\nimport { StyleMeter, type StyleRank } from '../combat/StyleMeter'\n",
  'style import',
)
sim = replaceOnce(
  sim,
  "import { createImpactProps, type PropMaterial, type PropState } from '../world/Props'\n",
  "import { createImpactProps, type PropMaterial, type PropState } from '../world/Props'\nimport { MAZE_EXIT, MAZE_KILL_GATE, MAZE_START, buildMazeFlowField, mazeCanOccupy, mazeExitReached, mazeFlowTarget, openMazeCenters } from '../world/Maze'\n",
  'maze import',
)

sim = replaceOnce(
  sim,
  "  | { type: 'combo-tier'; tick: number; comboKills: number; multiplier: number; attackSpeed: number }\n",
  "  | { type: 'combo-tier'; tick: number; comboKills: number; multiplier: number; attackSpeed: number }\n  | { type: 'style-award'; tick: number; x: number; y: number; label: string; points: number; total: number; rank: StyleRank; variety: boolean }\n  | { type: 'style-rank'; tick: number; rank: StyleRank; label: string; total: number }\n  | { type: 'style-break'; tick: number; x: number; y: number; total: number; rank: StyleRank }\n  | { type: 'maze-exit-unlocked'; tick: number; kills: number }\n  | { type: 'maze-cleared'; tick: number; kills: number; score: number }\n",
  'style events',
)

sim = replaceOnce(sim, 'export const TARGET_ENEMIES = 48', 'export const TARGET_ENEMIES = 20', 'enemy target')
sim = replaceOnce(
  sim,
  "export const ARENA_BOUNDS = {\n  halfWidth: 430,\n  halfHeight: 235,\n} as const\n",
  "export const ARENA_BOUNDS = {\n  halfWidth: 430,\n  halfHeight: 235,\n} as const\n\nconst MAZE_SPAWN_POINTS = openMazeCenters()\n",
  'maze spawn points',
)

sim = replaceOnce(
  sim,
  "  readonly props: PropState[] = createImpactProps()\n  readonly player: PlayerState = { x: 0, y: 0, facing: 0, hp: PLAYER_MAX_HP, invulnerableTicks: 0 }\n  readonly events: SimEvent[] = []\n",
  "  readonly props: PropState[] = createImpactProps()\n  readonly style = new StyleMeter()\n  readonly player: PlayerState = { x: MAZE_START.x, y: MAZE_START.y, facing: 0, hp: PLAYER_MAX_HP, invulnerableTicks: 0 }\n  readonly events: SimEvent[] = []\n",
  'style field and maze start',
)
sim = replaceOnce(sim, '  ended = false\n', '  ended = false\n  mazeWon = false\n', 'maze won field')

sim = replaceOnce(
  sim,
  "    this.events.length = 0\n    this.tick += 1\n\n    this.updateComboAndBuffTimers()\n",
  "    this.events.length = 0\n    this.tick += 1\n\n    const decayedRank = this.style.tick()\n    if (decayedRank) this.events.push({ type: 'style-rank', tick: this.tick, rank: decayedRank, label: this.style.label(), total: this.style.points })\n    this.updateComboAndBuffTimers()\n",
  'style tick',
)

sim = replaceOnce(
  sim,
  "    this.updatePowerups()\n    if (worldStepsThisTick) this.resolveEnemyContact()\n    this.ensurePopulation()\n",
  "    this.updatePowerups()\n    if (worldStepsThisTick) this.resolveEnemyContact()\n    if (!this.ended && this.kills >= MAZE_KILL_GATE && mazeExitReached(this.player.x, this.player.y)) {\n      this.mazeWon = true\n      this.ended = true\n      this.score += 5000\n      this.events.push({ type: 'maze-cleared', tick: this.tick, kills: this.kills, score: this.score })\n      return\n    }\n    this.ensurePopulation()\n",
  'maze clear check',
)

sim = replaceOnce(
  sim,
  "  comboMultiplier(): number {\n    if (this.comboKills >= 12) return 4\n    if (this.comboKills >= 8) return 3\n    if (this.comboKills >= 4) return 2\n    return 1\n  }\n\n  attackSpeedMultiplier(): number {\n    const comboBoost = this.comboKills >= 12 ? 1.12 : this.comboKills >= 8 ? 1.08 : this.comboKills >= 4 ? 1.04 : 1\n    return comboBoost * (this.lastBiteFrenzyTicks > 0 ? LAST_BITE_ATTACK_SPEED : 1)\n  }\n",
  "  comboMultiplier(): number { return this.style.scoreMultiplier() }\n  styleRank(): StyleRank { return this.style.rank() }\n  styleLabel(): string { return this.style.label() }\n  stylePoints(): number { return this.style.points }\n  styleProgress(): number { return this.style.meterProgress() }\n  styleScoreMultiplier(): number { return this.style.scoreMultiplier() }\n  mazeExitUnlocked(): boolean { return this.kills >= MAZE_KILL_GATE }\n  mazeKillsRemaining(): number { return Math.max(0, MAZE_KILL_GATE - this.kills) }\n  mazeExit(): { x: number; y: number } { return MAZE_EXIT }\n\n  attackSpeedMultiplier(): number {\n    return this.lastBiteFrenzyTicks > 0 ? LAST_BITE_ATTACK_SPEED : 1\n  }\n",
  'style public API',
)

sim = replaceOnce(
  sim,
  "    feed(this.lastChanceUsed ? 1 : 0)\n    feed(this.nextPowerupId)\n",
  "    feed(this.lastChanceUsed ? 1 : 0)\n    feed(this.mazeWon ? 1 : 0)\n    for (const value of this.style.snapshot()) feed(value)\n    feed(this.nextPowerupId)\n",
  'style hash',
)

sim = replaceOnce(
  sim,
  "    const chargeSlowdown = input.dashHeld ? 0.55 : 1\n    const flowMoveBoost = this.comboMultiplier() >= 3 ? 1.03 : 1\n    const speed = PLAYER_SPEED * chargeSlowdown * flowMoveBoost\n    const nextX = clamp(this.player.x + nx * speed, -ARENA_BOUNDS.halfWidth, ARENA_BOUNDS.halfWidth)\n    if (!this.playerOverlapsProp(nextX, this.player.y)) this.player.x = nextX\n    const nextY = clamp(this.player.y + ny * speed, -ARENA_BOUNDS.halfHeight, ARENA_BOUNDS.halfHeight)\n    if (!this.playerOverlapsProp(this.player.x, nextY)) this.player.y = nextY\n",
  "    const chargeSlowdown = input.dashHeld ? 0.55 : 1\n    const speed = PLAYER_SPEED * chargeSlowdown\n    const nextX = clamp(this.player.x + nx * speed, -ARENA_BOUNDS.halfWidth, ARENA_BOUNDS.halfWidth)\n    if (!this.playerOverlapsProp(nextX, this.player.y) && mazeCanOccupy(nextX, this.player.y, PLAYER_RADIUS)) this.player.x = nextX\n    const nextY = clamp(this.player.y + ny * speed, -ARENA_BOUNDS.halfHeight, ARENA_BOUNDS.halfHeight)\n    if (!this.playerOverlapsProp(this.player.x, nextY) && mazeCanOccupy(this.player.x, nextY, PLAYER_RADIUS)) this.player.y = nextY\n",
  'maze player collision',
)

const oldUpdateEnemies = `  private updateEnemies(): void {\n    for (const enemy of this.enemies.items) {\n      if (!enemy.active) continue\n      if (enemy.staggerTicks > 0) enemy.staggerTicks -= 1\n\n      const dx = this.player.x - enemy.x\n      const dy = this.player.y - enemy.y\n      const dist = Math.hypot(dx, dy) || 1\n      const chaseScale = enemy.staggerTicks > 0 ? 0.12 : 1\n      const chaseX = (dx / dist) * enemy.speed * chaseScale\n      const chaseY = (dy / dist) * enemy.speed * chaseScale\n\n      enemy.vx = chaseX + enemy.impulseX\n      enemy.vy = chaseY + enemy.impulseY\n      enemy.x += enemy.vx\n      enemy.y += enemy.vy\n\n      this.resolveEnemyArenaWall(enemy)\n      if (!enemy.active) continue\n\n      enemy.impulseX *= IMPULSE_DRAG\n      enemy.impulseY *= IMPULSE_DRAG\n      if (Math.abs(enemy.impulseX) < MIN_IMPULSE) enemy.impulseX = 0\n      if (Math.abs(enemy.impulseY) < MIN_IMPULSE) enemy.impulseY = 0\n    }\n  }\n`
const newUpdateEnemies = `  private updateEnemies(): void {\n    const flow = buildMazeFlowField(this.player.x, this.player.y)\n    for (const enemy of this.enemies.items) {\n      if (!enemy.active) continue\n      if (enemy.staggerTicks > 0) enemy.staggerTicks -= 1\n\n      const directDx = this.player.x - enemy.x\n      const directDy = this.player.y - enemy.y\n      const directDist = Math.hypot(directDx, directDy) || 1\n      const flowTarget = directDist < 42 ? { x: this.player.x, y: this.player.y } : mazeFlowTarget(enemy.x, enemy.y, flow)\n      const dx = flowTarget.x - enemy.x\n      const dy = flowTarget.y - enemy.y\n      const dist = Math.hypot(dx, dy) || 1\n      const chaseScale = enemy.staggerTicks > 0 ? 0.12 : 1\n      const chaseX = (dx / dist) * enemy.speed * chaseScale\n      const chaseY = (dy / dist) * enemy.speed * chaseScale\n\n      enemy.vx = chaseX + enemy.impulseX\n      enemy.vy = chaseY + enemy.impulseY\n      const nextX = enemy.x + enemy.vx\n      if (mazeCanOccupy(nextX, enemy.y, enemy.radius)) enemy.x = nextX\n      else {\n        const wallForce = Math.abs(enemy.impulseX)\n        if (wallForce >= WALL_SLAM_THRESHOLD) this.damageEnemyFromPhysics(enemy, wallForce, 'wall', enemy.x, enemy.y)\n        enemy.impulseX *= -0.2\n      }\n      if (!enemy.active) continue\n      const nextY = enemy.y + enemy.vy\n      if (mazeCanOccupy(enemy.x, nextY, enemy.radius)) enemy.y = nextY\n      else {\n        const wallForce = Math.abs(enemy.impulseY)\n        if (wallForce >= WALL_SLAM_THRESHOLD) this.damageEnemyFromPhysics(enemy, wallForce, 'wall', enemy.x, enemy.y)\n        enemy.impulseY *= -0.2\n      }\n\n      this.resolveEnemyArenaWall(enemy)\n      if (!enemy.active) continue\n\n      enemy.impulseX *= IMPULSE_DRAG\n      enemy.impulseY *= IMPULSE_DRAG\n      if (Math.abs(enemy.impulseX) < MIN_IMPULSE) enemy.impulseX = 0\n      if (Math.abs(enemy.impulseY) < MIN_IMPULSE) enemy.impulseY = 0\n    }\n  }\n`
sim = replaceOnce(sim, oldUpdateEnemies, newUpdateEnemies, 'flow-field enemy steering')

sim = replaceOnce(
  sim,
  "    let blocked = false\n    const dashForce = 12 + dash.power * 22\n",
  "    let blocked = false\n    if (!mazeCanOccupy(endX, endY, PLAYER_RADIUS)) { blocked = true; endX = startX; endY = startY }\n    const dashForce = 12 + dash.power * 22\n",
  'maze dash collision',
)

sim = replaceOnce(
  sim,
  "    if (killed) {\n      this.registerKill(hitX, hitY)\n      this.enemies.kill(enemy)\n    } else {\n      const impulse = (knockback * IMPULSE_SCALE) / Math.max(0.6, enemy.mass)\n",
  "    if (killed) {\n      const styleBase = attack === 'dash' ? 80 : attack === 'stab' ? 65 : attack === 'whirlwind' ? 58 : 48\n      const styleLabel = attack === 'dash' ? 'RIP THROUGH' : attack === 'stab' ? 'SKEWER' : attack === 'whirlwind' ? 'BLENDER' : 'CLEAVE'\n      this.awardStyle(styleBase, styleLabel, hitX, hitY, attack)\n      this.registerKill(hitX, hitY)\n      this.enemies.kill(enemy)\n    } else {\n      if (severedPart) this.awardStyle(32, 'DISMEMBER', hitX, hitY)\n      const impulse = (knockback * IMPULSE_SCALE) / Math.max(0.6, enemy.mass)\n",
  'attack style awards',
)

sim = replaceOnce(
  sim,
  "    if (killed) {\n      this.registerKill(x, y)\n      this.enemies.kill(enemy)\n    } else {\n      enemy.staggerTicks = Math.max(enemy.staggerTicks, STAGGER_TICKS)\n    }\n    this.events.push({\n      type: 'physics-impact',\n",
  "    if (killed) {\n      const styleBase = kind === 'enemy' ? 105 : kind === 'wall' ? 95 : 80\n      const styleLabel = kind === 'enemy' ? 'BODY CHECK' : kind === 'wall' ? 'WALL SLAM' : 'CRUSH'\n      this.awardStyle(styleBase, styleLabel, x, y)\n      this.registerKill(x, y)\n      this.enemies.kill(enemy)\n    } else {\n      enemy.staggerTicks = Math.max(enemy.staggerTicks, STAGGER_TICKS)\n    }\n    this.events.push({\n      type: 'physics-impact',\n",
  'physics style awards',
)

const oldRegisterKill = `  private registerKill(_x: number, _y: number): void {\n    const previousMultiplier = this.comboMultiplier()\n    this.kills += 1\n    this.comboKills += 1\n    this.comboTicksRemaining = COMBO_WINDOW_TICKS\n    const multiplier = this.comboMultiplier()\n    this.score += 100 * multiplier\n\n    if (multiplier !== previousMultiplier) {\n      this.events.push({\n        type: 'combo-tier',\n        tick: this.tick,\n        comboKills: this.comboKills,\n        multiplier,\n        attackSpeed: this.attackSpeedMultiplier(),\n      })\n    }\n\n  }\n`
const newRegisterKill = `  private registerKill(_x: number, _y: number): void {\n    this.kills += 1\n    this.comboKills += 1\n    this.comboTicksRemaining = COMBO_WINDOW_TICKS\n    this.score += Math.round(100 * this.style.scoreMultiplier())\n    if (this.kills === MAZE_KILL_GATE) this.events.push({ type: 'maze-exit-unlocked', tick: this.tick, kills: this.kills })\n  }\n\n  private awardStyle(base: number, label: string, x: number, y: number, attack?: AttackKind): void {\n    const result = this.style.award(base, attack)\n    this.events.push({ type: 'style-award', tick: this.tick, x, y, label, points: result.gained, total: result.total, rank: result.rank, variety: result.variety })\n    if (result.rankChanged) this.events.push({ type: 'style-rank', tick: this.tick, rank: result.rank, label: this.style.label(), total: result.total })\n  }\n`
sim = replaceOnce(sim, oldRegisterKill, newRegisterKill, 'style scoring')

sim = replaceOnce(
  sim,
  "    let x = clamp(this.player.x + Math.cos(angle) * 54, -ARENA_BOUNDS.halfWidth + 24, ARENA_BOUNDS.halfWidth - 24)\n    let y = clamp(this.player.y + Math.sin(angle) * 54, -ARENA_BOUNDS.halfHeight + 24, ARENA_BOUNDS.halfHeight - 24)\n    const powerup: PowerupState",
  "    let x = clamp(this.player.x + Math.cos(angle) * 54, -ARENA_BOUNDS.halfWidth + 24, ARENA_BOUNDS.halfWidth - 24)\n    let y = clamp(this.player.y + Math.sin(angle) * 54, -ARENA_BOUNDS.halfHeight + 24, ARENA_BOUNDS.halfHeight - 24)\n    if (!mazeCanOccupy(x, y, 10)) { x = this.player.x; y = this.player.y }\n    const powerup: PowerupState",
  'last bite maze placement',
)

sim = replaceOnce(
  sim,
  "      this.player.hp -= 1\n      this.player.invulnerableTicks = 45\n      this.events.push({ type: 'player-hit', tick: this.tick, hp: this.player.hp })\n      this.triggerLastChance()\n",
  "      this.player.hp -= 1\n      this.player.invulnerableTicks = 45\n      const styleRankDrop = this.style.onPlayerHit()\n      this.events.push({ type: 'player-hit', tick: this.tick, hp: this.player.hp })\n      this.events.push({ type: 'style-break', tick: this.tick, x: this.player.x, y: this.player.y, total: this.style.points, rank: this.style.rank() })\n      if (styleRankDrop) this.events.push({ type: 'style-rank', tick: this.tick, rank: styleRankDrop, label: this.style.label(), total: this.style.points })\n      this.triggerLastChance()\n",
  'style damage penalty',
)

sim = replaceOnce(
  sim,
  "  private ensurePopulation(): void {\n    while (this.enemies.activeCount() < TARGET_ENEMIES) {\n      const enemy = this.enemies.spawnAround(this.player.x, this.player.y, this.rng)\n      if (!enemy) break\n    }\n  }\n",
  "  private ensurePopulation(): void {\n    while (this.enemies.activeCount() < TARGET_ENEMIES) {\n      const enemy = this.enemies.spawnAround(this.player.x, this.player.y, this.rng)\n      if (!enemy) break\n      const candidates = MAZE_SPAWN_POINTS.filter((point) => Math.hypot(point.x - this.player.x, point.y - this.player.y) >= 150)\n      const pool = candidates.length > 0 ? candidates : MAZE_SPAWN_POINTS\n      const point = pool[this.rng.int(0, pool.length - 1)]\n      enemy.x = point.x + this.rng.range(-9, 9)\n      enemy.y = point.y + this.rng.range(-9, 9)\n      if (!mazeCanOccupy(enemy.x, enemy.y, enemy.radius)) { enemy.x = point.x; enemy.y = point.y }\n    }\n  }\n",
  'maze spawning',
)

fs.writeFileSync(simPath, sim)

const scenePath = 'src/game/scenes/GameScene.ts'
let scene = fs.readFileSync(scenePath, 'utf8')
scene = replaceOnce(
  scene,
  "import type { PropMaterial } from '../world/Props'\n",
  "import type { PropMaterial } from '../world/Props'\nimport { MAZE_CELL_SIZE, MAZE_EXIT, MAZE_GRID, MAZE_KILL_GATE, MAZE_ORIGIN_X, MAZE_ORIGIN_Y, MAZE_START, mazeWallCells, cellCenter } from '../world/Maze'\nimport type { StyleRank } from '../combat/StyleMeter'\n",
  'scene maze import',
)
scene = replaceOnce(
  scene,
  "import { Sfx } from '../../presentation/Sfx'\n",
  "import { Sfx } from '../../presentation/Sfx'\nimport { CombatTextFx } from '../../presentation/CombatTextFx'\n",
  'combat text import',
)
scene = replaceOnce(
  scene,
  "  private comboText!: Phaser.GameObjects.Text\n  private buffText!: Phaser.GameObjects.Text\n",
  "  private comboText!: Phaser.GameObjects.Text\n  private buffText!: Phaser.GameObjects.Text\n  private styleRankText!: Phaser.GameObjects.Text\n  private styleLabelText!: Phaser.GameObjects.Text\n  private styleMeterGraphics!: Phaser.GameObjects.Graphics\n  private mazeStatusText!: Phaser.GameObjects.Text\n  private mazeExitCore!: Phaser.GameObjects.Rectangle\n  private mazeExitLabel!: Phaser.GameObjects.Text\n",
  'style HUD fields',
)
scene = replaceOnce(
  scene,
  "  private gore!: GoreFx\n",
  "  private gore!: GoreFx\n  private combatText!: CombatTextFx\n",
  'combat text field',
)
scene = replaceOnce(
  scene,
  "    this.createArena()\n    this.createPropRenderers()\n    this.gore = new GoreFx(this)\n",
  "    this.createArena()\n    this.createMazeLevel()\n    this.createPropRenderers()\n    this.gore = new GoreFx(this)\n    this.combatText = new CombatTextFx(this)\n",
  'maze scene create',
)
scene = replaceOnce(
  scene,
  "      if (event.type === 'combo-tier') this.showComboTier(event)\n      if (event.type === 'bullet-time') this.showBulletTime(event)\n",
  "      if (event.type === 'combo-tier') this.showComboTier(event)\n      if (event.type === 'style-award') this.combatText.show(WORLD_CX + event.x, WORLD_CY + event.y - 18, event.label, event.points, event.rank, event.variety)\n      if (event.type === 'style-rank') this.showStyleRank(event)\n      if (event.type === 'style-break') this.combatText.show(WORLD_CX + event.x, WORLD_CY + event.y - 28, 'STYLE BROKEN', 0, event.rank)\n      if (event.type === 'maze-exit-unlocked') this.showMazeExitUnlocked()\n      if (event.type === 'maze-cleared') this.showMazeCleared(event)\n      if (event.type === 'bullet-time') this.showBulletTime(event)\n",
  'style event presentation',
)

scene = replaceOnce(
  scene,
  "    this.timerText.setText(`SURVIVE ${(this.state.tick / 60).toFixed(1)}s`)\n    this.killText.setText(`KILLS ${this.state.kills}  •  SCORE ${this.state.score}`)\n    const multiplier = this.state.comboMultiplier()\n    const comboWindow = this.state.comboTimeRemaining()\n    this.comboText.setText(this.state.comboKills > 0 ? `CHAIN ${this.state.comboKills}  ×${multiplier}  CUT ${this.state.attackSpeedMultiplier().toFixed(2)}×  ${Math.ceil(comboWindow / 60)}s` : 'CHAIN —')\n",
  "    this.timerText.setText(`MAZE ${(this.state.tick / 60).toFixed(1)}s`)\n    this.killText.setText(`KILLS ${this.state.kills}  •  SCORE ${this.state.score}`)\n    const comboWindow = this.state.comboTimeRemaining()\n    this.comboText.setText(this.state.comboKills > 0 ? `CHAIN ${this.state.comboKills}  •  ${Math.ceil(comboWindow / 60)}s` : 'CHAIN —')\n    this.styleRankText.setText(this.state.styleRank()).setColor(styleColor(this.state.styleRank()))\n    this.styleLabelText.setText(`${this.state.styleLabel()}  ×${this.state.styleScoreMultiplier().toFixed(2)}`)\n    this.mazeStatusText.setText(this.state.mazeExitUnlocked() ? 'EXIT OPEN // RUN' : `SEAL ${MAZE_KILL_GATE - this.state.mazeKillsRemaining()}/${MAZE_KILL_GATE}`)\n    this.mazeExitCore.setFillStyle(this.state.mazeExitUnlocked() ? 0x7cff9b : 0x7a204e, this.state.mazeExitUnlocked() ? 0.72 : 0.38)\n    this.mazeExitLabel.setText(this.state.mazeExitUnlocked() ? 'EXIT' : `${this.state.mazeKillsRemaining()} KILLS`)\n    this.styleMeterGraphics.clear()\n    this.styleMeterGraphics.fillStyle(0x17131c, 0.9).fillRect(850, 148, 82, 7)\n    this.styleMeterGraphics.fillStyle(styleColorNumber(this.state.styleRank()), 0.95).fillRect(850, 148, 82 * this.state.styleProgress(), 7)\n",
  'style HUD sync',
)

const createArenaAnchor = "  private createPropRenderers(): void {\n"
const mazeMethod = `  private createMazeLevel(): void {\n    const graphics = this.add.graphics().setDepth(1)\n    for (let row = 0; row < MAZE_GRID.length; row += 1) {\n      for (let col = 0; col < MAZE_GRID[row].length; col += 1) {\n        const x = WORLD_CX + MAZE_ORIGIN_X + col * MAZE_CELL_SIZE\n        const y = WORLD_CY + MAZE_ORIGIN_Y + row * MAZE_CELL_SIZE\n        if (MAZE_GRID[row][col] === '#') {\n          graphics.fillStyle(0x0b0810, 0.96).fillRect(x, y, MAZE_CELL_SIZE, MAZE_CELL_SIZE)\n          graphics.lineStyle(2, 0x3b263f, 0.72).strokeRect(x + 1, y + 1, MAZE_CELL_SIZE - 2, MAZE_CELL_SIZE - 2)\n          graphics.lineStyle(1, 0x6e4267, 0.18).lineBetween(x + 7, y + 9, x + MAZE_CELL_SIZE - 8, y + 9)\n        } else {\n          graphics.fillStyle((row + col) % 2 === 0 ? 0x18121d : 0x151019, 0.7).fillRect(x, y, MAZE_CELL_SIZE, MAZE_CELL_SIZE)\n        }\n      }\n    }\n\n    const startX = WORLD_CX + MAZE_START.x\n    const startY = WORLD_CY + MAZE_START.y\n    const boneGlow = this.add.circle(startX, startY, 18, 0xff9d57, 0.12).setDepth(2)\n    const boneCore = this.add.circle(startX, startY, 7, 0xffc46b, 0.7).setDepth(2)\n    this.add.text(startX, startY + 24, 'BONEFIRE', { fontFamily: 'monospace', fontSize: '9px', color: '#d7b690' }).setOrigin(0.5).setDepth(3)\n    this.tweens.add({ targets: boneGlow, scale: 1.35, alpha: 0.04, duration: 700, yoyo: true, repeat: -1 })\n    this.tweens.add({ targets: boneCore, alpha: 0.35, duration: 420, yoyo: true, repeat: -1 })\n\n    const exitX = WORLD_CX + MAZE_EXIT.x\n    const exitY = WORLD_CY + MAZE_EXIT.y\n    this.mazeExitCore = this.add.rectangle(exitX, exitY, 30, 30, 0x7a204e, 0.38).setRotation(Math.PI / 4).setStrokeStyle(2, 0xd8c8dc, 0.55).setDepth(3)\n    this.mazeExitLabel = this.add.text(exitX, exitY + 27, '', { fontFamily: 'monospace', fontSize: '9px', color: '#f1e6f5' }).setOrigin(0.5).setDepth(4)\n  }\n\n`
scene = replaceOnce(scene, createArenaAnchor, mazeMethod + createArenaAnchor, 'maze renderer method')

scene = replaceOnce(
  scene,
  "    this.comboText = this.add.text(480, 38, 'CHAIN —', { ...style, fontSize: '14px', color: '#ff77a5' }).setOrigin(0.5, 0).setDepth(105)\n    this.buffText = this.add.text(480, 60, '', { ...style, fontSize: '12px', color: '#8fefff' }).setOrigin(0.5, 0).setDepth(105)\n",
  "    this.comboText = this.add.text(480, 38, 'CHAIN —', { ...style, fontSize: '14px', color: '#ff77a5' }).setOrigin(0.5, 0).setDepth(105)\n    this.buffText = this.add.text(480, 60, '', { ...style, fontSize: '12px', color: '#8fefff' }).setOrigin(0.5, 0).setDepth(105)\n    this.styleRankText = this.add.text(890, 66, 'D', { ...style, fontSize: '58px', fontStyle: 'bold', color: '#b8b4c3', stroke: '#09070d', strokeThickness: 7 }).setOrigin(0.5, 0).setDepth(130)\n    this.styleLabelText = this.add.text(890, 126, 'STRAY ×1.00', { ...style, fontSize: '11px', color: '#d8d2c8' }).setOrigin(0.5, 0).setDepth(130)\n    this.styleMeterGraphics = this.add.graphics().setDepth(129)\n    this.mazeStatusText = this.add.text(480, 82, '', { ...style, fontSize: '11px', color: '#d6b8d7' }).setOrigin(0.5, 0).setDepth(105)\n",
  'style HUD create',
)

const showComboAnchor = "  private showBulletTime(_event: Extract<SimEvent, { type: 'bullet-time' }>): void {\n"
const styleMethods = `  private showStyleRank(event: Extract<SimEvent, { type: 'style-rank' }>): void {\n    this.styleRankText.setText(event.rank).setColor(styleColor(event.rank)).setScale(0.72)\n    this.styleLabelText.setText(event.label)\n    this.tweens.killTweensOf(this.styleRankText)\n    this.tweens.add({ targets: this.styleRankText, scale: 1.08, duration: 120, yoyo: true, ease: 'Back.Out' })\n  }\n\n  private showMazeExitUnlocked(): void {\n    const text = this.add.text(480, 132, 'SEAL BROKEN // EXIT OPEN', { fontFamily: 'monospace', fontSize: '20px', color: '#9dffb4', backgroundColor: '#07120bdd', padding: { x: 12, y: 6 } }).setOrigin(0.5).setDepth(220)\n    this.cameras.main.flash(60, 110, 255, 155, false)\n    this.tweens.add({ targets: text, y: 112, alpha: 0, duration: 900, ease: 'Cubic.Out', onComplete: () => text.destroy() })\n  }\n\n  private showMazeCleared(event: Extract<SimEvent, { type: 'maze-cleared' }>): void {\n    if (this.endedText) return\n    this.endedText = this.add.text(480, 270, \`MAZE CLEARED\\nSTYLE \${this.state.styleRank()} // \${this.state.styleLabel()}\\n\${event.kills} kills • \${event.score} score\\n\\nR TO RUN AGAIN\`, { fontFamily: 'monospace', fontSize: '25px', align: 'center', color: '#effff2', backgroundColor: '#08140ddd', padding: { x: 24, y: 18 } }).setOrigin(0.5).setDepth(230)\n  }\n\n`
scene = replaceOnce(scene, showComboAnchor, styleMethods + showComboAnchor, 'style banners')

scene = replaceOnce(
  scene,
  "      .text(480, 270, `DOG DOWN\\n${(this.state.tick / 60).toFixed(1)}s • ${this.state.kills} kills\\n\\nR TO RETRY`, {\n",
  "      .text(480, 270, `YOU DIED // BONEFIRE\\n${(this.state.tick / 60).toFixed(1)}s • ${this.state.kills} kills • STYLE ${this.state.styleRank()}\\n\\nR TO RETURN`, {\n",
  'soulslike death copy',
)
scene = replaceOnce(
  scene,
  "    this.gore.resetTransient()\n",
  "    this.gore.resetTransient()\n    this.combatText.reset()\n",
  'combat text reset',
)

scene += `\nfunction styleColor(rank: StyleRank): string {\n  return rank === 'SS' ? '#ff4f8d' : rank === 'S' ? '#ff7aa8' : rank === 'A' ? '#ffd166' : rank === 'B' ? '#a8e66b' : rank === 'C' ? '#d8d2c8' : '#b8b4c3'\n}\n\nfunction styleColorNumber(rank: StyleRank): number {\n  return rank === 'SS' ? 0xff4f8d : rank === 'S' ? 0xff7aa8 : rank === 'A' ? 0xffd166 : rank === 'B' ? 0xa8e66b : rank === 'C' ? 0xd8d2c8 : 0xb8b4c3\n}\n`

fs.writeFileSync(scenePath, scene)

fs.writeFileSync('docs/STYLE_MAZE_V0.md', `# Style + Maze Run V0\n\n- Combat multiplier is now driven by an authoritative style meter rather than raw kill-chain tiers.\n- Rank ladder: D STRAY -> C HUNGRY -> B FERAL -> A RABID -> S UNLEASHED -> SS HELLHOUND.\n- Repeating the same attack yields sharply less style; changing attacks gets a variety bonus.\n- Dismemberment and physics kills award named style events, rendered as pooled scrolling combat text.\n- Taking damage cuts style and can drop rank. Style decays after a grace window.\n- Style affects score only; it does not make normal attacks faster. Last Bite remains the only temporary speed rescue.\n- The arena becomes a clean authored maze with deterministic flow-field navigation, 20 active zombies, a BONEFIRE start, and a sealed exit.\n- The exit unlocks after 18 kills. Reaching it ends the run as a maze clear. Death returns the player to the Bonefire on restart.\n- This is a Soulslike/maze-runner skeleton, not yet a full corpse-recovery/shortcut/metaprogression system.\n`)
