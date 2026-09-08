import { describe, expect, it } from 'vitest'
import { GameState } from '../src/game/sim/GameState'

describe('manual mouse-style combat contract', () => {
  it('does not auto-attack and only emits an attack when commanded', () => {
    const state = new GameState(42)
    state.player.hp = 999

    state.step({ x: 0, y: 0, aimRadians: 0 })
    expect(state.events.some((event) => event.type === 'weapon-attack')).toBe(false)

    state.step({ x: 0, y: 0, aimRadians: 0, slash: true })
    expect(state.events.some((event) => event.type === 'weapon-attack' && event.attack === 'slash')).toBe(true)
  })

  it('aim is authoritative independently of movement direction', () => {
    const state = new GameState(7)
    state.player.hp = 999
    state.step({ x: 1, y: 0, aimRadians: Math.PI / 2 })
    expect(state.player.x).toBeGreaterThan(0)
    expect(state.player.facing).toBeCloseTo(Math.PI / 2)
  })
})
