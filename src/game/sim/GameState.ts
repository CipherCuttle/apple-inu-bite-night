import { isPointInSwordArc, normalizeAngle, swordForAttack, type AttackKind } from '../combat/Sword'
import { EnemyPool } from '../enemies/EnemyPool'
import type { EnemyState } from '../enemies/Enemy'
import { createImpactProps, type PropMaterial, type PropState } from '../world/Props'
import { XorShift32 } from './RNG'

export type PowerupKind = 'last-bite'

export interface PowerupState {
  id: number
  kind: PowerupKind
  x: number
  y: number
  active: boolean
  ttlTicks: number
}

export interface InputState {
  x: number
  y: number
  aimRadians?: number
  slash?: boolean
  stab?: boolean
  dashHeld?: boolean
  dashReleased?: boolean
  whirlwind?: boolean
}

export interface PlayerState {
  x: number
  y: number
  facing: number
  hp: number
  invulnerableTicks: number
}

export type PhysicsImpactKind = 'wall' | 'enemy' | 'prop'

export type SimEvent =
  | {
      type: 'sword-attack'
      attack: AttackKind
      tick: number
      x: number
      y: number
      facing: number
      power?: number
      distance?: number
    }
  | { type: 'dash-step'; tick: number; x: number; y: number; facing: number; power: number }
  | {
      type: 'enemy-hit'
      attack: AttackKind
      tick: number
      enemyId: number
      x: number
      y: number
      killed: boolean
      facing: number
      severedPart?: 'left-arm' | 'right-arm'
    }
  | {
      type: 'physics-impact'
      kind: PhysicsImpactKind
      tick: number
      x: number
      y: number
      force: number
      enemyId: number
      otherEnemyId?: number
      propId?: number
      killed: boolean
    }
  | {
      type: 'prop-hit'
      tick: number
      propId: number
      material: PropMaterial
      x: number
      y: number
      force: number
      broken: boolean
    }
  | { type: 'player-hit'; tick: number; hp: number }
  | { type: 'combo-tier'; tick: number; comboKills: number; multiplier: number; attackSpeed: number }
  | { type: 'bullet-time'; tick: number; durationTicks: number }
  | { type: 'last-chance'; tick: number; powerupId: number; x: number; y: number }
  | { type: 'powerup-drop'; tick: number; powerupId: number; kind: PowerupKind; x: number; y: number }
  | { type: 'powerup-picked'; tick: number; powerupId: number; kind: PowerupKind }
  | { type: 'run-ended'; tick: number; kills: number }

interface DashState {
  facing: number
  power: number
  remainingTicks: number
  totalTicks: number
  stepX: number
  stepY: number
  hitEnemyIds: number[]
  hitPropIds: number[]
}

const PLAYER_SPEED = 3.25
const PLAYER_RADIUS = 14
export const TARGET_ENEMIES = 48
const DASH_MIN_DISTANCE = 48
const DASH_MAX_BONUS_DISTANCE = 150
const DASH_HIT_RADIUS = 24
const DASH_MIN_TRAVEL_TICKS = 6
const DASH_MAX_BONUS_TICKS = 4
const IMPULSE_SCALE = 0.18
const IMPULSE_DRAG = 0.84
const MIN_IMPULSE = 0.025
const STAGGER_TICKS = 12
const WALL_SLAM_THRESHOLD = 2.65
const ENEMY_COLLISION_DAMAGE_THRESHOLD = 2.8
const ENEMY_RESTITUTION = 0.42
const PROP_RESTITUTION = 0.28
export const MAX_DASH_CHARGE_TICKS = 60
const COMBO_WINDOW_TICKS = 150
const LAST_BITE_TTL_TICKS = 240
const POWERUP_PICKUP_RADIUS = 30
const LAST_CHANCE_BULLET_TIME_TICKS = 150
const LAST_CHANCE_WORLD_DIVISOR = 4
const LAST_CHANCE_INVULNERABLE_TICKS = 60
const LAST_BITE_HEAL = 2
const LAST_BITE_FRENZY_TICKS = 120
const LAST_BITE_ATTACK_SPEED = 1.25
const PLAYER_MAX_HP = 5

export const ARENA_BOUNDS = {
  halfWidth: 430,
  halfHeight: 235,
} as const

export class GameState {
  readonly seed: number
  readonly rng: XorShift32
  readonly enemies = new EnemyPool(220)
  readonly props: PropState[] = createImpactProps()
  readonly player: PlayerState = { x: 0, y: 0, facing: 0, hp: PLAYER_MAX_HP, invulnerableTicks: 0 }
  readonly events: SimEvent[] = []
  readonly powerups: PowerupState[] = []
  tick = 0
  kills = 0
  score = 0
  comboKills = 0
  ended = false
  private comboTicksRemaining = 0
  private bulletTimeTicks = 0
  private lastBiteFrenzyTicks = 0
  private lastChanceUsed = false
  private nextPowerupId = 1
  private nextAttackTick = 0
  private dashChargeTicks = 0
  private dashState: DashState | null = null

  constructor(seed: number) {
    this.seed = seed >>> 0
    this.rng = new XorShift32(seed)
    this.ensurePopulation()
  }

  step(input: InputState): void {
    if (this.ended) return
    this.events.length = 0
    this.tick += 1

    this.updateComboAndBuffTimers()
    this.updateDashCharge(input)
    this.updatePlayer(input)

    const worldStepsThisTick = this.bulletTimeTicks <= 0 || this.tick % LAST_CHANCE_WORLD_DIVISOR === 0
    if (worldStepsThisTick) {
      this.updateEnemies()
      this.resolveEnemyEnemyCollisions()
      this.resolveEnemyPropCollisions()
    }

    if (this.dashState) {
      this.advanceDash()
    } else {
      this.trySwordAttack(input)
      if (this.dashState) this.advanceDash()
    }

    this.updatePowerups()
    if (worldStepsThisTick) this.resolveEnemyContact()
    this.ensurePopulation()

    if (this.bulletTimeTicks > 0) this.bulletTimeTicks -= 1
    if (this.lastBiteFrenzyTicks > 0) this.lastBiteFrenzyTicks -= 1
    if (this.player.invulnerableTicks > 0) this.player.invulnerableTicks -= 1
    if (this.player.hp <= 0 && !this.ended) {
      this.ended = true
      this.events.push({ type: 'run-ended', tick: this.tick, kills: this.kills })
    }
  }

  dashChargeRatio(): number {
    return Math.min(1, this.dashChargeTicks / MAX_DASH_CHARGE_TICKS)
  }

  isDashing(): boolean {
    return this.dashState !== null
  }

  dashTicksRemaining(): number {
    return this.dashState?.remainingTicks ?? 0
  }

  comboMultiplier(): number {
    if (this.comboKills >= 12) return 4
    if (this.comboKills >= 8) return 3
    if (this.comboKills >= 4) return 2
    return 1
  }

  attackSpeedMultiplier(): number {
    const comboBoost = this.comboKills >= 12 ? 1.12 : this.comboKills >= 8 ? 1.08 : this.comboKills >= 4 ? 1.04 : 1
    return comboBoost * (this.lastBiteFrenzyTicks > 0 ? LAST_BITE_ATTACK_SPEED : 1)
  }

  comboTimeRemaining(): number {
    return this.comboTicksRemaining
  }

  bulletTimeTicksRemaining(): number { return this.bulletTimeTicks }
  frenzyTicksRemaining(): number { return this.lastBiteFrenzyTicks }
  hasUsedLastChance(): boolean { return this.lastChanceUsed }

  resultHash(): string {
    let hash = 2166136261 >>> 0
    const feed = (value: number) => {
      const n = Math.trunc(value * 1000)
      hash ^= n >>> 0
      hash = Math.imul(hash, 16777619) >>> 0
    }

    feed(this.tick)
    feed(this.kills)
    feed(this.score)
    feed(this.comboKills)
    feed(this.comboTicksRemaining)
    feed(this.bulletTimeTicks)
    feed(this.lastBiteFrenzyTicks)
    feed(this.lastChanceUsed ? 1 : 0)
    feed(this.nextPowerupId)
    feed(this.player.x)
    feed(this.player.y)
    feed(this.player.facing)
    feed(this.player.hp)
    feed(this.nextAttackTick)
    feed(this.dashChargeTicks)
    feed(this.rng.snapshot())

    if (this.dashState) {
      feed(1)
      feed(this.dashState.facing)
      feed(this.dashState.power)
      feed(this.dashState.remainingTicks)
      feed(this.dashState.totalTicks)
      feed(this.dashState.stepX)
      feed(this.dashState.stepY)
      for (const id of this.dashState.hitEnemyIds) feed(id)
      feed(-1)
      for (const id of this.dashState.hitPropIds) feed(id)
    } else {
      feed(0)
    }

    for (const powerup of this.powerups) {
      feed(powerup.id)
      feed(1)
      feed(powerup.x)
      feed(powerup.y)
      feed(powerup.active ? 1 : 0)
      feed(powerup.ttlTicks)
    }

    for (const prop of this.props) {
      feed(prop.id)
      feed(prop.active ? 1 : 0)
      feed(prop.hp)
    }

    for (const enemy of this.enemies.items) {
      if (!enemy.active) continue
      feed(enemy.id)
      feed(enemy.x)
      feed(enemy.y)
      feed(enemy.hp)
      feed(enemy.mass)
      feed(enemy.vx)
      feed(enemy.vy)
      feed(enemy.impulseX)
      feed(enemy.impulseY)
      feed(enemy.staggerTicks)
      feed(enemy.severedArm === 'left' ? 1 : enemy.severedArm === 'right' ? 2 : 0)
    }

    return hash.toString(16).padStart(8, '0')
  }

  private updateDashCharge(input: InputState): void {
    if (this.dashState) {
      this.dashChargeTicks = 0
      return
    }
    if (input.dashHeld) {
      this.dashChargeTicks = Math.min(MAX_DASH_CHARGE_TICKS, this.dashChargeTicks + 1)
      return
    }
    if (!input.dashReleased && this.dashChargeTicks > 0) this.dashChargeTicks = 0
  }

  private updatePlayer(input: InputState): void {
    if (this.dashState) {
      this.player.facing = this.dashState.facing
      return
    }

    const length = Math.hypot(input.x, input.y)
    if (Number.isFinite(input.aimRadians)) {
      this.player.facing = normalizeAngle(input.aimRadians as number)
    } else if (length > 0.0001) {
      this.player.facing = Math.atan2(input.y, input.x)
    }

    if (length <= 0.0001) return

    const nx = input.x / Math.max(1, length)
    const ny = input.y / Math.max(1, length)
    const chargeSlowdown = input.dashHeld ? 0.55 : 1
    const flowMoveBoost = this.comboMultiplier() >= 3 ? 1.03 : 1
    const speed = PLAYER_SPEED * chargeSlowdown * flowMoveBoost
    const nextX = clamp(this.player.x + nx * speed, -ARENA_BOUNDS.halfWidth, ARENA_BOUNDS.halfWidth)
    if (!this.playerOverlapsProp(nextX, this.player.y)) this.player.x = nextX
    const nextY = clamp(this.player.y + ny * speed, -ARENA_BOUNDS.halfHeight, ARENA_BOUNDS.halfHeight)
    if (!this.playerOverlapsProp(this.player.x, nextY)) this.player.y = nextY
  }

  private updateEnemies(): void {
    for (const enemy of this.enemies.items) {
      if (!enemy.active) continue
      if (enemy.staggerTicks > 0) enemy.staggerTicks -= 1

      const dx = this.player.x - enemy.x
      const dy = this.player.y - enemy.y
      const dist = Math.hypot(dx, dy) || 1
      const chaseScale = enemy.staggerTicks > 0 ? 0.12 : 1
      const chaseX = (dx / dist) * enemy.speed * chaseScale
      const chaseY = (dy / dist) * enemy.speed * chaseScale

      enemy.vx = chaseX + enemy.impulseX
      enemy.vy = chaseY + enemy.impulseY
      enemy.x += enemy.vx
      enemy.y += enemy.vy

      this.resolveEnemyArenaWall(enemy)
      if (!enemy.active) continue

      enemy.impulseX *= IMPULSE_DRAG
      enemy.impulseY *= IMPULSE_DRAG
      if (Math.abs(enemy.impulseX) < MIN_IMPULSE) enemy.impulseX = 0
      if (Math.abs(enemy.impulseY) < MIN_IMPULSE) enemy.impulseY = 0
    }
  }

  private resolveEnemyArenaWall(enemy: EnemyState): void {
    const limitX = ARENA_BOUNDS.halfWidth - enemy.radius
    const limitY = ARENA_BOUNDS.halfHeight - enemy.radius

    if (enemy.x > limitX || enemy.x < -limitX) {
      const hitRight = enemy.x > limitX
      enemy.x = clamp(enemy.x, -limitX, limitX)
      const force = Math.abs(enemy.impulseX)
      if (force >= WALL_SLAM_THRESHOLD) this.damageEnemyFromPhysics(enemy, force, 'wall', enemy.x, enemy.y)
      if (!enemy.active) return
      enemy.impulseX = (hitRight ? -1 : 1) * Math.abs(enemy.impulseX) * 0.24
      enemy.staggerTicks = Math.max(enemy.staggerTicks, STAGGER_TICKS)
    }

    if (enemy.y > limitY || enemy.y < -limitY) {
      const hitBottom = enemy.y > limitY
      enemy.y = clamp(enemy.y, -limitY, limitY)
      const force = Math.abs(enemy.impulseY)
      if (force >= WALL_SLAM_THRESHOLD) this.damageEnemyFromPhysics(enemy, force, 'wall', enemy.x, enemy.y)
      if (!enemy.active) return
      enemy.impulseY = (hitBottom ? -1 : 1) * Math.abs(enemy.impulseY) * 0.24
      enemy.staggerTicks = Math.max(enemy.staggerTicks, STAGGER_TICKS)
    }
  }

  private resolveEnemyEnemyCollisions(): void {
    const items = this.enemies.items
    for (let i = 0; i < items.length; i += 1) {
      const a = items[i]
      if (!a.active) continue
      for (let j = i + 1; j < items.length; j += 1) {
        const b = items[j]
        if (!b.active) continue

        let dx = b.x - a.x
        let dy = b.y - a.y
        const minDist = a.radius + b.radius
        const distSq = dx * dx + dy * dy
        if (distSq >= minDist * minDist) continue

        let dist = Math.sqrt(distSq)
        if (dist < 0.0001) {
          dx = a.id < b.id ? 1 : -1
          dy = 0
          dist = 1
        }
        const nx = dx / dist
        const ny = dy / dist
        const overlap = minDist - dist
        const invA = 1 / a.mass
        const invB = 1 / b.mass
        const invTotal = invA + invB
        a.x -= nx * overlap * (invA / invTotal)
        a.y -= ny * overlap * (invA / invTotal)
        b.x += nx * overlap * (invB / invTotal)
        b.y += ny * overlap * (invB / invTotal)

        const relativeNormalVelocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
        if (relativeNormalVelocity >= 0) continue

        const impulseMagnitude = (-(1 + ENEMY_RESTITUTION) * relativeNormalVelocity) / invTotal
        const impulseX = impulseMagnitude * nx
        const impulseY = impulseMagnitude * ny
        a.impulseX -= impulseX * invA
        a.impulseY -= impulseY * invA
        b.impulseX += impulseX * invB
        b.impulseY += impulseY * invB

        if (impulseMagnitude >= ENEMY_COLLISION_DAMAGE_THRESHOLD) {
          this.damageEnemyFromPhysics(a, impulseMagnitude, 'enemy', a.x, a.y, b.id)
          if (b.active) this.damageEnemyFromPhysics(b, impulseMagnitude, 'enemy', b.x, b.y, a.id)
        }
      }
    }
  }

  private resolveEnemyPropCollisions(): void {
    for (const enemy of this.enemies.items) {
      if (!enemy.active) continue
      for (const prop of this.props) {
        if (!prop.active) continue
        const dx = enemy.x - prop.x
        const dy = enemy.y - prop.y
        const minDist = enemy.radius + prop.radius
        const distSq = dx * dx + dy * dy
        if (distSq >= minDist * minDist) continue

        const dist = Math.sqrt(distSq) || 1
        const nx = dx / dist
        const ny = dy / dist
        const approachSpeed = Math.max(0, -(enemy.vx * nx + enemy.vy * ny))
        const force = Math.max(approachSpeed, Math.hypot(enemy.impulseX, enemy.impulseY))

        if (force >= prop.breakImpulse) {
          const damage = prop.material === 'glass' ? prop.hp : Math.max(1, Math.floor(force / prop.breakImpulse))
          this.damageProp(prop, damage, force)
          if (!prop.active) continue
        }

        const overlap = minDist - dist
        enemy.x += nx * overlap
        enemy.y += ny * overlap
        const impulseNormal = enemy.impulseX * nx + enemy.impulseY * ny
        if (impulseNormal < 0) {
          enemy.impulseX -= (1 + PROP_RESTITUTION) * impulseNormal * nx
          enemy.impulseY -= (1 + PROP_RESTITUTION) * impulseNormal * ny
        }
        enemy.staggerTicks = Math.max(enemy.staggerTicks, 6)

        if (prop.material === 'metal' && force >= WALL_SLAM_THRESHOLD) {
          this.damageEnemyFromPhysics(enemy, force, 'prop', enemy.x, enemy.y, undefined, prop.id)
        }
      }
    }
  }

  private trySwordAttack(input: InputState): void {
    if (input.dashReleased) {
      const chargeTicks = this.dashChargeTicks
      this.dashChargeTicks = 0
      if (this.tick >= this.nextAttackTick) this.beginDash(chargeTicks)
      return
    }

    const attack: AttackKind | null = input.whirlwind ? 'whirlwind' : input.stab ? 'stab' : input.slash ? 'slash' : null
    if (!attack || input.dashHeld || this.tick < this.nextAttackTick) return

    const config = swordForAttack(attack)
    this.nextAttackTick = this.tick + this.scaledCooldown(config.cooldownTicks)
    this.events.push({ type: 'sword-attack', attack, tick: this.tick, x: this.player.x, y: this.player.y, facing: this.player.facing })

    for (const enemy of this.enemies.items) {
      if (!enemy.active) continue
      if (!isPointInSwordArc(this.player.x, this.player.y, this.player.facing, enemy.x, enemy.y, enemy.radius, config)) continue

      const hitFacing = attack === 'whirlwind' ? Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x) : this.player.facing
      this.hitEnemy(enemy, attack, config.damage, config.knockback, hitFacing)
    }

    for (const prop of this.props) {
      if (!prop.active) continue
      if (!isPointInSwordArc(this.player.x, this.player.y, this.player.facing, prop.x, prop.y, prop.radius, config)) continue
      const force = config.knockback * IMPULSE_SCALE
      const damage = attack === 'stab' ? 2 : 1
      this.damageProp(prop, damage, force)
    }
  }

  private beginDash(chargeTicks: number): void {
    const config = swordForAttack('dash')
    const power = Math.min(1, Math.max(0, chargeTicks) / MAX_DASH_CHARGE_TICKS)
    const requestedDistance = DASH_MIN_DISTANCE + DASH_MAX_BONUS_DISTANCE * power
    const startX = this.player.x
    const startY = this.player.y
    const facing = this.player.facing
    const endX = clamp(startX + Math.cos(facing) * requestedDistance, -ARENA_BOUNDS.halfWidth, ARENA_BOUNDS.halfWidth)
    const endY = clamp(startY + Math.sin(facing) * requestedDistance, -ARENA_BOUNDS.halfHeight, ARENA_BOUNDS.halfHeight)
    const actualDistance = Math.hypot(endX - startX, endY - startY)
    const totalTicks = DASH_MIN_TRAVEL_TICKS + Math.round(power * DASH_MAX_BONUS_TICKS)

    this.nextAttackTick = this.tick + this.scaledCooldown(config.cooldownTicks)
    this.dashState = {
      facing,
      power,
      remainingTicks: totalTicks,
      totalTicks,
      stepX: (endX - startX) / totalTicks,
      stepY: (endY - startY) / totalTicks,
      hitEnemyIds: [],
      hitPropIds: [],
    }

    this.events.push({
      type: 'sword-attack',
      attack: 'dash',
      tick: this.tick,
      x: startX,
      y: startY,
      facing,
      power,
      distance: actualDistance,
    })
  }

  private advanceDash(): void {
    const dash = this.dashState
    if (!dash) return

    const startX = this.player.x
    const startY = this.player.y
    let endX = clamp(startX + dash.stepX, -ARENA_BOUNDS.halfWidth, ARENA_BOUNDS.halfWidth)
    let endY = clamp(startY + dash.stepY, -ARENA_BOUNDS.halfHeight, ARENA_BOUNDS.halfHeight)
    let blocked = false
    const dashForce = 12 + dash.power * 22

    for (const prop of this.props) {
      if (blocked) break
      if (!prop.active || dash.hitPropIds.includes(prop.id)) continue
      const hitRadius = PLAYER_RADIUS + prop.radius
      if (distanceSqPointToSegment(prop.x, prop.y, startX, startY, endX, endY) > hitRadius * hitRadius) continue
      dash.hitPropIds.push(prop.id)
      const damage = prop.material === 'glass' ? prop.hp : 1 + Math.floor(dash.power * 2)
      this.damageProp(prop, damage, dashForce)
      if (prop.active) {
        blocked = true
        endX = startX
        endY = startY
        break
      }
    }

    this.player.x = endX
    this.player.y = endY
    this.player.facing = dash.facing
    this.events.push({ type: 'dash-step', tick: this.tick, x: endX, y: endY, facing: dash.facing, power: dash.power })

    if (!blocked) {
      const config = swordForAttack('dash')
      const damage = config.damage + Math.floor(dash.power * 2)
      const knockback = config.knockback + dash.power * 38
      for (const enemy of this.enemies.items) {
        if (!enemy.active || dash.hitEnemyIds.includes(enemy.id)) continue
        const hitRadius = DASH_HIT_RADIUS + enemy.radius
        if (distanceSqPointToSegment(enemy.x, enemy.y, startX, startY, endX, endY) > hitRadius * hitRadius) continue
        dash.hitEnemyIds.push(enemy.id)
        this.hitEnemy(enemy, 'dash', damage, knockback, dash.facing)
      }
    }

    dash.remainingTicks -= 1
    if (blocked || dash.remainingTicks <= 0) this.dashState = null
  }

  private hitEnemy(enemy: EnemyState, attack: AttackKind, damage: number, knockback: number, facing: number): void {
    enemy.hp -= damage
    const killed = enemy.hp <= 0
    const hitX = enemy.x
    const hitY = enemy.y
    let severedPart: 'left-arm' | 'right-arm' | undefined

    if (!killed && enemy.severedArm === 'none' && (attack === 'slash' || attack === 'whirlwind')) {
      const side = ((enemy.id ^ this.tick) & 1) === 0 ? 'left' : 'right'
      enemy.severedArm = side
      severedPart = side === 'left' ? 'left-arm' : 'right-arm'
    }

    if (killed) {
      this.registerKill(hitX, hitY)
      this.enemies.kill(enemy)
    } else {
      const impulse = (knockback * IMPULSE_SCALE) / Math.max(0.6, enemy.mass)
      enemy.impulseX += Math.cos(facing) * impulse
      enemy.impulseY += Math.sin(facing) * impulse
      enemy.staggerTicks = Math.max(enemy.staggerTicks, STAGGER_TICKS)
    }

    this.events.push({
      type: 'enemy-hit',
      attack,
      tick: this.tick,
      enemyId: enemy.id,
      x: hitX,
      y: hitY,
      killed,
      facing,
      severedPart,
    })
  }

  private damageEnemyFromPhysics(
    enemy: EnemyState,
    force: number,
    kind: PhysicsImpactKind,
    x: number,
    y: number,
    otherEnemyId?: number,
    propId?: number,
  ): void {
    if (!enemy.active) return
    enemy.hp -= 1
    const killed = enemy.hp <= 0
    if (killed) {
      this.registerKill(x, y)
      this.enemies.kill(enemy)
    } else {
      enemy.staggerTicks = Math.max(enemy.staggerTicks, STAGGER_TICKS)
    }
    this.events.push({
      type: 'physics-impact',
      kind,
      tick: this.tick,
      x,
      y,
      force,
      enemyId: enemy.id,
      otherEnemyId,
      propId,
      killed,
    })
  }

  private scaledCooldown(baseTicks: number): number {
    return Math.max(6, Math.round(baseTicks / this.attackSpeedMultiplier()))
  }

  private updateComboAndBuffTimers(): void {
    if (this.comboTicksRemaining > 0) {
      this.comboTicksRemaining -= 1
      if (this.comboTicksRemaining === 0) this.comboKills = 0
    }
  }

  private registerKill(_x: number, _y: number): void {
    const previousMultiplier = this.comboMultiplier()
    this.kills += 1
    this.comboKills += 1
    this.comboTicksRemaining = COMBO_WINDOW_TICKS
    const multiplier = this.comboMultiplier()
    this.score += 100 * multiplier

    if (multiplier !== previousMultiplier) {
      this.events.push({
        type: 'combo-tier',
        tick: this.tick,
        comboKills: this.comboKills,
        multiplier,
        attackSpeed: this.attackSpeedMultiplier(),
      })
    }

  }

  private triggerLastChance(): void {
    if (this.lastChanceUsed || this.player.hp !== 1) return
    this.lastChanceUsed = true
    this.bulletTimeTicks = LAST_CHANCE_BULLET_TIME_TICKS
    this.player.invulnerableTicks = Math.max(this.player.invulnerableTicks, LAST_CHANCE_INVULNERABLE_TICKS)
    const angle = normalizeAngle(this.player.facing + Math.PI * 0.5)
    let x = clamp(this.player.x + Math.cos(angle) * 54, -ARENA_BOUNDS.halfWidth + 24, ARENA_BOUNDS.halfWidth - 24)
    let y = clamp(this.player.y + Math.sin(angle) * 54, -ARENA_BOUNDS.halfHeight + 24, ARENA_BOUNDS.halfHeight - 24)
    const powerup: PowerupState = { id: this.nextPowerupId++, kind: 'last-bite', x, y, active: true, ttlTicks: LAST_BITE_TTL_TICKS }
    this.powerups.push(powerup)
    this.events.push({ type: 'last-chance', tick: this.tick, powerupId: powerup.id, x, y })
    this.events.push({ type: 'powerup-drop', tick: this.tick, powerupId: powerup.id, kind: 'last-bite', x, y })
    this.events.push({ type: 'bullet-time', tick: this.tick, durationTicks: LAST_CHANCE_BULLET_TIME_TICKS })
  }

  private updatePowerups(): void {
    for (const powerup of this.powerups) {
      if (!powerup.active) continue
      powerup.ttlTicks -= 1
      if (powerup.ttlTicks <= 0) { powerup.active = false; continue }
      const dx = powerup.x - this.player.x
      const dy = powerup.y - this.player.y
      if (dx * dx + dy * dy > POWERUP_PICKUP_RADIUS * POWERUP_PICKUP_RADIUS) continue
      powerup.active = false
      this.player.hp = Math.min(PLAYER_MAX_HP, this.player.hp + LAST_BITE_HEAL)
      this.lastBiteFrenzyTicks = LAST_BITE_FRENZY_TICKS
      this.events.push({ type: 'powerup-picked', tick: this.tick, powerupId: powerup.id, kind: powerup.kind })
    }
  }

  private damageProp(prop: PropState, damage: number, force: number): void {
    if (!prop.active) return
    prop.hp -= Math.max(1, damage)
    const broken = prop.hp <= 0
    if (broken) prop.active = false
    this.events.push({
      type: 'prop-hit',
      tick: this.tick,
      propId: prop.id,
      material: prop.material,
      x: prop.x,
      y: prop.y,
      force,
      broken,
    })
  }

  private playerOverlapsProp(x: number, y: number): boolean {
    for (const prop of this.props) {
      if (!prop.active) continue
      const dx = prop.x - x
      const dy = prop.y - y
      const minDist = prop.radius + PLAYER_RADIUS
      if (dx * dx + dy * dy < minDist * minDist) return true
    }
    return false
  }

  private resolveEnemyContact(): void {
    if (this.player.invulnerableTicks > 0 || this.dashState) return

    for (const enemy of this.enemies.items) {
      if (!enemy.active) continue
      const dx = enemy.x - this.player.x
      const dy = enemy.y - this.player.y
      const minDist = enemy.radius + PLAYER_RADIUS
      if (dx * dx + dy * dy > minDist * minDist) continue

      this.player.hp -= 1
      this.player.invulnerableTicks = 45
      this.events.push({ type: 'player-hit', tick: this.tick, hp: this.player.hp })
      this.triggerLastChance()
      return
    }
  }

  private ensurePopulation(): void {
    while (this.enemies.activeCount() < TARGET_ENEMIES) {
      const enemy = this.enemies.spawnAround(this.player.x, this.player.y, this.rng)
      if (!enemy) break
    }
  }
}

function distanceSqPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const lengthSq = abx * abx + aby * aby
  if (lengthSq <= 0.000001) return apx * apx + apy * apy
  const t = clamp((apx * abx + apy * aby) / lengthSq, 0, 1)
  const dx = px - (ax + abx * t)
  const dy = py - (ay + aby * t)
  return dx * dx + dy * dy
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function activeEnemies(state: GameState): EnemyState[] {
  return state.enemies.items.filter((enemy) => enemy.active)
}
