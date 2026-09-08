import { describe, expect, it } from 'vitest'
import { GameState, TARGET_ENEMIES } from '../src/game/sim/GameState'

function prepKills(state: GameState, count: number): void {
  for (const enemy of state.enemies.items) enemy.active = false
  for (let i = 0; i < count; i += 1) {
    const enemy = state.enemies.items[i]
    Object.assign(enemy, { active: true, hp: 1, mass: 1, radius: 10, x: 54 + (i % 3) * 8, y: (i - Math.floor(count / 2)) * 3, speed: 0, vx: 0, vy: 0, impulseX: 0, impulseY: 0, staggerTicks: 0 })
  }
}

describe('combat reward loop v1', () => {
  it('keeps the active horde intentionally below 60', () => { expect(TARGET_ENEMIES).toBe(48); expect(new GameState(1).enemies.activeCount()).toBe(48) })
  it('keeps chain scoring but only modestly accelerates normal cutting', () => {
    const state = new GameState(2); prepKills(state, 12); state.step({ x: 0, y: 0, aimRadians: 0, whirlwind: true })
    expect(state.comboMultiplier()).toBe(4); expect(state.attackSpeedMultiplier()).toBeGreaterThan(1); expect(state.attackSpeedMultiplier()).toBeLessThanOrEqual(1.12); expect(state.powerups.filter((powerup) => powerup.active)).toHaveLength(0); expect(state.bulletTimeTicksRemaining()).toBe(0)
  })
  it('triggers one last-chance bullet-time rescue when HP falls to one', () => {
    const state = new GameState(3); for (const enemy of state.enemies.items) enemy.active = false; state.player.hp = 2
    const enemy = state.enemies.items[0]; Object.assign(enemy, { active: true, hp: 1, mass: 1, radius: 12, x: 0, y: 0, speed: 0, vx: 0, vy: 0, impulseX: 0, impulseY: 0, staggerTicks: 0 })
    state.step({ x: 0, y: 0 }); expect(state.player.hp).toBe(1); expect(state.hasUsedLastChance()).toBe(true); expect(state.bulletTimeTicksRemaining()).toBeGreaterThan(100); expect(state.powerups.filter((powerup) => powerup.active)).toHaveLength(1); expect(state.events.some((event) => event.type === 'bullet-time')).toBe(true)
  })
})
