import { describe, expect, it } from 'vitest'
import { ARENA_BOUNDS, GameState } from '../src/game/sim/GameState'

describe('player arena bounds', () => {
  it('keeps authoritative movement inside the visible one-screen arena', () => {
    const state = new GameState(123)
    state.player.hp = 999
    for (let tick = 0; tick < 300; tick += 1) state.step({ x: 1, y: 0 })
    expect(state.player.x).toBe(ARENA_BOUNDS.halfWidth)
    for (let tick = 0; tick < 300; tick += 1) state.step({ x: 0, y: 1 })
    expect(state.player.y).toBe(ARENA_BOUNDS.halfHeight)
  })
})
