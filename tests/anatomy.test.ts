import { describe, expect, it } from 'vitest'
import { GameState } from '../src/game/sim/GameState'

describe('authoritative zombie anatomy', () => {
  it('a surviving heavy zombie visibly loses one deterministic arm to a slash', () => {
    const state = new GameState(0xabc123)
    for (const enemy of state.enemies.items) enemy.active = false
    const enemy = state.enemies.items[0]
    Object.assign(enemy, {
      id: 7, active: true, x: 62, y: 0, hp: 2, speed: 0, radius: 14, mass: 1.6,
      vx: 0, vy: 0, impulseX: 0, impulseY: 0, staggerTicks: 0, severedArm: 'none',
    })
    state.step({ x: 0, y: 0, aimRadians: 0, slash: true })
    expect(enemy.active).toBe(true)
    expect(enemy.hp).toBe(1)
    expect(['left', 'right']).toContain(enemy.severedArm)
    const hit = state.events.find((event) => event.type === 'enemy-hit')
    expect(hit && hit.type === 'enemy-hit' ? hit.severedPart : undefined).toMatch(/^(left|right)-arm$/)
  })
})
