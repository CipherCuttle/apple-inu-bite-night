import { describe, expect, it } from 'vitest'
import { ARENA_BOUNDS, GameState } from '../src/game/sim/GameState'
import { mazeCanOccupy } from '../src/game/world/Maze'

describe('player maze movement', () => {
  it('advances through corridors without penetrating maze walls or arena bounds', () => {
    const state = new GameState(123)
    state.player.hp = 999
    const startX = state.player.x

    for (let tick = 0; tick < 300; tick += 1) state.step({ x: 1, y: 0 })
    expect(state.player.x).toBeGreaterThan(startX)
    expect(Math.abs(state.player.x)).toBeLessThanOrEqual(ARENA_BOUNDS.halfWidth)
    expect(Math.abs(state.player.y)).toBeLessThanOrEqual(ARENA_BOUNDS.halfHeight)
    expect(mazeCanOccupy(state.player.x, state.player.y, 14)).toBe(true)

    for (let tick = 0; tick < 300; tick += 1) state.step({ x: 0, y: 1 })
    expect(Math.abs(state.player.x)).toBeLessThanOrEqual(ARENA_BOUNDS.halfWidth)
    expect(Math.abs(state.player.y)).toBeLessThanOrEqual(ARENA_BOUNDS.halfHeight)
    expect(mazeCanOccupy(state.player.x, state.player.y, 14)).toBe(true)
  })
})
