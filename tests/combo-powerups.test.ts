import { describe, expect, it } from 'vitest'
import { GameState, TARGET_ENEMIES } from '../src/game/sim/GameState'

describe('style reward + rescue loop', () => {
  it('keeps the maze horde corridor-readable', () => {
    expect(TARGET_ENEMIES).toBe(20)
    expect(TARGET_ENEMIES).toBeLessThan(30)
    expect(new GameState(1).enemies.activeCount()).toBe(20)
  })

  it('uses style for score without turning style into passive attack-speed power', () => {
    const state = new GameState(2)
    state.style.award(700, 'slash')
    expect(state.styleScoreMultiplier()).toBeGreaterThan(1)
    expect(state.attackSpeedMultiplier()).toBe(1)
    expect(state.powerups.filter((powerup) => powerup.active)).toHaveLength(0)
    expect(state.bulletTimeTicksRemaining()).toBe(0)
  })

  it('triggers one last-chance bullet-time rescue when HP falls to one', () => {
    const state = new GameState(3)
    for (const enemy of state.enemies.items) enemy.active = false
    state.player.hp = 2
    const enemy = state.enemies.items[0]
    Object.assign(enemy, {
      active: true,
      hp: 1,
      mass: 1,
      radius: 12,
      x: state.player.x,
      y: state.player.y,
      speed: 0,
      vx: 0,
      vy: 0,
      impulseX: 0,
      impulseY: 0,
      staggerTicks: 0,
    })
    state.step({ x: 0, y: 0 })
    expect(state.player.hp).toBe(1)
    expect(state.hasUsedLastChance()).toBe(true)
    expect(state.bulletTimeTicksRemaining()).toBeGreaterThan(100)
    expect(state.powerups.filter((powerup) => powerup.active)).toHaveLength(1)
    expect(state.events.some((event) => event.type === 'bullet-time')).toBe(true)
  })
})
