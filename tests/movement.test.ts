import { describe, expect, it } from 'vitest'
import { ARENA_BOUNDS, GameState } from '../src/game/sim/GameState'
import { CITY_LEVEL_OBSTACLES, circleOverlapsObstacle } from '../src/game/world/Level'

describe('player arena bounds', () => {
  it('keeps authoritative movement inside the arena and outside city obstacles', () => {
    const state = new GameState(123)
    state.player.hp = 999
    const startX = state.player.x

    for (let tick = 0; tick < 300; tick += 1) state.step({ x: 1, y: 0 })
    expect(state.player.x).toBeGreaterThan(startX)
    expect(Math.abs(state.player.x)).toBeLessThanOrEqual(ARENA_BOUNDS.halfWidth)
    expect(Math.abs(state.player.y)).toBeLessThanOrEqual(ARENA_BOUNDS.halfHeight)
    expect(CITY_LEVEL_OBSTACLES.some((obstacle) => circleOverlapsObstacle(state.player.x, state.player.y, 14, obstacle))).toBe(false)

    for (let tick = 0; tick < 300; tick += 1) state.step({ x: 0, y: 1 })
    expect(Math.abs(state.player.x)).toBeLessThanOrEqual(ARENA_BOUNDS.halfWidth)
    expect(Math.abs(state.player.y)).toBeLessThanOrEqual(ARENA_BOUNDS.halfHeight)
    expect(CITY_LEVEL_OBSTACLES.some((obstacle) => circleOverlapsObstacle(state.player.x, state.player.y, 14, obstacle))).toBe(false)
  })
})
