import { describe, expect, it } from 'vitest'
import { GameState, TARGET_ENEMIES } from '../src/game/sim/GameState'

function prepKills(state: GameState, count: number): void {
  for (const enemy of state.enemies.items) enemy.active = false
  for (let i = 0; i < count; i += 1) {
    const enemy = state.enemies.items[i]
    enemy.active = true
    enemy.hp = 1
    enemy.mass = 1
    enemy.radius = 10
    enemy.x = 54 + (i % 3) * 8
    enemy.y = (i - Math.floor(count / 2)) * 3
    enemy.speed = 0
    enemy.vx = 0
    enemy.vy = 0
    enemy.impulseX = 0
    enemy.impulseY = 0
    enemy.staggerTicks = 0
  }
}

describe('combat reward loop v0', () => {
  it('keeps the active horde intentionally below 60', () => {
    expect(TARGET_ENEMIES).toBe(48)
    expect(new GameState(1).enemies.activeCount()).toBe(48)
  })

  it('builds a multiplier and attack-speed reward from consecutive kills', () => {
    const state = new GameState(2)
    prepKills(state, 4)
    state.step({ x: 0, y: 0, aimRadians: 0, slash: true })
    expect(state.kills).toBeGreaterThanOrEqual(4)
    expect(state.comboMultiplier()).toBeGreaterThanOrEqual(2)
    expect(state.attackSpeedMultiplier()).toBeGreaterThan(1)
    expect(state.score).toBeGreaterThanOrEqual(500)
  })

  it('freezes the world at an 8-kill chain milestone while preserving deterministic ticks', () => {
    const state = new GameState(3)
    prepKills(state, 8)
    state.step({ x: 0, y: 0, aimRadians: 0, whirlwind: true })
    expect(state.comboKills).toBeGreaterThanOrEqual(8)
    expect(state.freezeTicksRemaining()).toBeGreaterThan(0)
    expect(state.events.some((event) => event.type === 'flow-freeze' && event.source === 'combo')).toBe(true)
  })

  it('guarantees a deterministic powerup drop every sixth kill', () => {
    const state = new GameState(4)
    prepKills(state, 6)
    state.step({ x: 0, y: 0, aimRadians: 0, whirlwind: true })
    expect(state.powerups.some((powerup) => powerup.active)).toBe(true)
    expect(state.events.some((event) => event.type === 'powerup-drop')).toBe(true)
  })
})
