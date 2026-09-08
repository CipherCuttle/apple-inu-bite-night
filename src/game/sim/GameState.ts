import { isPointInSwordArc, normalizeAngle, swordForAttack, type AttackKind } from '../combat/Sword'
import { EnemyPool } from '../enemies/EnemyPool'
import type { EnemyState } from '../enemies/Enemy'
import { XorShift32 } from './RNG'

export interface InputState {
  x: number
  y: number
  aimRadians?: number
  slash?: boolean
  stab?: boolean
}

export interface PlayerState {
  x: number
  y: number
  facing: number
  hp: number
  invulnerableTicks: number
}

export type SimEvent =
  | { type: 'sword-attack'; attack: AttackKind; tick: number; x: number; y: number; facing: number }
  | { type: 'enemy-hit'; attack: AttackKind; tick: number; enemyId: number; x: number; y: number; killed: boolean; facing: number }
  | { type: 'player-hit'; tick: number; hp: number }
  | { type: 'run-ended'; tick: number; kills: number }

const PLAYER_SPEED = 3.25
const PLAYER_RADIUS = 14
const TARGET_ENEMIES = 120

export const ARENA_BOUNDS = {
  halfWidth: 430,
  halfHeight: 235,
} as const

export class GameState {
  readonly seed: number
  readonly rng: XorShift32
  readonly enemies = new EnemyPool(220)
  readonly player: PlayerState = { x: 0, y: 0, facing: 0, hp: 5, invulnerableTicks: 0 }
  readonly events: SimEvent[] = []
  tick = 0
  kills = 0
  ended = false
  private nextAttackTick = 0

  constructor(seed: number) {
    this.seed = seed >>> 0
    this.rng = new XorShift32(seed)
    this.ensurePopulation()
  }

  step(input: InputState): void {
    if (this.ended) return
    this.events.length = 0
    this.tick += 1

    this.updatePlayer(input)
    this.updateEnemies()
    this.trySwordAttack(input)
    this.resolveEnemyContact()
    this.ensurePopulation()

    if (this.player.invulnerableTicks > 0) this.player.invulnerableTicks -= 1
    if (this.player.hp <= 0 && !this.ended) {
      this.ended = true
      this.events.push({ type: 'run-ended', tick: this.tick, kills: this.kills })
    }
  }

  resultHash(): string {
    let hash = 2166136261 >>> 0
    const feed = (value: number) => {
      const n = Math.trunc(value * 1000)
      hash ^= n >>> 0
      hash = Math.imul(hash, 16777619) >>> 0
    }

    feed(this.tick)
    feed(this.kills)
    feed(this.player.x)
    feed(this.player.y)
    feed(this.player.facing)
    feed(this.player.hp)
    feed(this.nextAttackTick)
    feed(this.rng.snapshot())

    for (const enemy of this.enemies.items) {
      if (!enemy.active) continue
      feed(enemy.id)
      feed(enemy.x)
      feed(enemy.y)
      feed(enemy.hp)
    }

    return hash.toString(16).padStart(8, '0')
  }

  private updatePlayer(input: InputState): void {
    const length = Math.hypot(input.x, input.y)
    if (length > 0.0001) {
      const nx = input.x / Math.max(1, length)
      const ny = input.y / Math.max(1, length)
      this.player.x = clamp(this.player.x + nx * PLAYER_SPEED, -ARENA_BOUNDS.halfWidth, ARENA_BOUNDS.halfWidth)
      this.player.y = clamp(this.player.y + ny * PLAYER_SPEED, -ARENA_BOUNDS.halfHeight, ARENA_BOUNDS.halfHeight)
      if (!Number.isFinite(input.aimRadians)) this.player.facing = Math.atan2(ny, nx)
    }

    if (Number.isFinite(input.aimRadians)) this.player.facing = normalizeAngle(input.aimRadians as number)
  }

  private updateEnemies(): void {
    for (const enemy of this.enemies.items) {
      if (!enemy.active) continue
      const dx = this.player.x - enemy.x
      const dy = this.player.y - enemy.y
      const dist = Math.hypot(dx, dy) || 1
      const nx = dx / dist
      const ny = dy / dist
      enemy.vx = nx * enemy.speed
      enemy.vy = ny * enemy.speed
      enemy.x += enemy.vx
      enemy.y += enemy.vy
    }
  }

  private trySwordAttack(input: InputState): void {
    const attack: AttackKind | null = input.stab ? 'stab' : input.slash ? 'slash' : null
    if (!attack || this.tick < this.nextAttackTick) return

    const config = swordForAttack(attack)
    this.nextAttackTick = this.tick + config.cooldownTicks
    this.events.push({ type: 'sword-attack', attack, tick: this.tick, x: this.player.x, y: this.player.y, facing: this.player.facing })

    for (const enemy of this.enemies.items) {
      if (!enemy.active) continue
      if (!isPointInSwordArc(this.player.x, this.player.y, this.player.facing, enemy.x, enemy.y, enemy.radius, config)) continue

      enemy.hp -= config.damage
      const killed = enemy.hp <= 0
      const hitX = enemy.x
      const hitY = enemy.y
      enemy.x += Math.cos(this.player.facing) * config.knockback
      enemy.y += Math.sin(this.player.facing) * config.knockback

      if (killed) {
        this.kills += 1
        this.enemies.kill(enemy)
      }

      this.events.push({
        type: 'enemy-hit',
        attack,
        tick: this.tick,
        enemyId: enemy.id,
        x: hitX,
        y: hitY,
        killed,
        facing: this.player.facing,
      })
    }
  }

  private resolveEnemyContact(): void {
    if (this.player.invulnerableTicks > 0) return

    for (const enemy of this.enemies.items) {
      if (!enemy.active) continue
      const dx = enemy.x - this.player.x
      const dy = enemy.y - this.player.y
      const minDist = enemy.radius + PLAYER_RADIUS
      if (dx * dx + dy * dy > minDist * minDist) continue

      this.player.hp -= 1
      this.player.invulnerableTicks = 45
      this.events.push({ type: 'player-hit', tick: this.tick, hp: this.player.hp })
      return
    }
  }

  private ensurePopulation(): void {
    while (this.enemies.activeCount() < TARGET_ENEMIES) {
      if (!this.enemies.spawnAround(this.player.x, this.player.y, this.rng)) break
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function activeEnemies(state: GameState): EnemyState[] {
  return state.enemies.items.filter((enemy) => enemy.active)
}
