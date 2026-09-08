import { describe, expect, it } from 'vitest'
import { ARENA_BOUNDS, GameState } from '../src/game/sim/GameState'

function isolateEnemy(state: GameState, index = 0) {
  for (const enemy of state.enemies.items) enemy.active = false
  const enemy = state.enemies.items[index]
  enemy.active = true
  enemy.id = index + 1
  enemy.x = 0
  enemy.y = 0
  enemy.hp = 2
  enemy.speed = 0
  enemy.radius = 12
  enemy.mass = 1
  enemy.vx = 0
  enemy.vy = 0
  enemy.impulseX = 0
  enemy.impulseY = 0
  enemy.staggerTicks = 0
  return enemy
}

describe('impact physics v0', () => {
  it('converts a launched enemy hitting the arena wall into secondary damage', () => {
    const state = new GameState(11)
    state.player.hp = 999
    const enemy = isolateEnemy(state)
    enemy.x = ARENA_BOUNDS.halfWidth - enemy.radius - 1
    enemy.impulseX = 8

    state.step({ x: 0, y: 0, aimRadians: 0 })

    expect(state.events.some((event) => event.type === 'physics-impact' && event.kind === 'wall' && event.enemyId === enemy.id)).toBe(true)
    expect(enemy.hp).toBe(1)
    expect(enemy.impulseX).toBeLessThan(0)
  })

  it('transfers momentum between overlapping enemies and can cause collision damage', () => {
    const state = new GameState(12)
    state.player.hp = 999
    const a = isolateEnemy(state, 0)
    const b = state.enemies.items[1]
    b.active = true
    b.id = 2
    b.x = 18
    b.y = 0
    b.hp = 2
    b.speed = 0
    b.radius = 12
    b.mass = 1
    b.vx = 0
    b.vy = 0
    b.impulseX = 0
    b.impulseY = 0
    b.staggerTicks = 0
    a.impulseX = 8

    state.step({ x: 0, y: 0, aimRadians: Math.PI / 2 })

    expect(b.impulseX).toBeGreaterThan(0)
    expect(state.events.some((event) => event.type === 'physics-impact' && event.kind === 'enemy')).toBe(true)
  })

  it('lets the sword destroy a deterministic glass prop', () => {
    const state = new GameState(13)
    state.player.hp = 999
    for (const enemy of state.enemies.items) enemy.active = false
    const prop = state.props.find((candidate) => candidate.material === 'glass')
    expect(prop).toBeDefined()
    if (!prop) return
    prop.x = 62
    prop.y = 0
    prop.radius = 14
    prop.hp = 1
    prop.active = true

    state.step({ x: 0, y: 0, aimRadians: 0, slash: true })

    expect(prop.active).toBe(false)
    expect(state.events.some((event) => event.type === 'prop-hit' && event.propId === prop.id && event.broken)).toBe(true)
  })
})
