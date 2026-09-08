import { describe, expect, it } from 'vitest'
import { GameState } from '../src/game/sim/GameState'
import { mazeCanOccupy } from '../src/game/world/Maze'

describe('maze enemy collision separation', () => {
  it('never resolves overlapping enemies through maze walls', () => {
    const state = new GameState(77)
    for (const enemy of state.enemies.items) enemy.active = false
    const a = state.enemies.items[0]
    const b = state.enemies.items[1]
    Object.assign(a, { active: true, hp: 2, mass: 1, radius: 14, x: 68, y: -70, speed: 0, vx: 0, vy: 0, impulseX: 0, impulseY: 0, staggerTicks: 0 })
    Object.assign(b, { active: true, hp: 2, mass: 1, radius: 14, x: 81, y: -70, speed: 0, vx: 0, vy: 0, impulseX: 0, impulseY: 0, staggerTicks: 0 })
    expect(mazeCanOccupy(a.x, a.y, a.radius)).toBe(true)
    expect(mazeCanOccupy(b.x, b.y, b.radius)).toBe(true)
    state.step({ x: 0, y: 0 })
    expect(mazeCanOccupy(a.x, a.y, a.radius)).toBe(true)
    expect(mazeCanOccupy(b.x, b.y, b.radius)).toBe(true)
  })
})
