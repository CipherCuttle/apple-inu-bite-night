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
  it('turns an actual slash into a delayed wall-slam kill', () => {
    const state = new GameState(11)
    state.player.hp = 999
    state.player.x = 340
    const enemy = isolateEnemy(state)
    enemy.x = ARENA_BOUNDS.halfWidth - enemy.radius - 13
    enemy.y = 0
    const targetId = enemy.id

    state.step({ x: 0, y: 0, aimRadians: 0, slash: true })
    expect(state.events.some((event) => event.type === 'enemy-hit' && event.enemyId === targetId && !event.killed)).toBe(true)

    let wallSlammed = false
    for (let tick = 0; tick < 12 && !wallSlammed; tick += 1) {
      state.step({ x: 0, y: 0, aimRadians: 0 })
      wallSlammed = state.events.some(
        (event) => event.type === 'physics-impact' && event.kind === 'wall' && event.enemyId === targetId && event.killed,
      )
    }

    expect(wallSlammed).toBe(true)
  })

  it('turns an actual slash into enemy-to-enemy collision damage', () => {
    const state = new GameState(12)
    state.player.hp = 999
    const launched = isolateEnemy(state, 0)
    launched.x = 92
    const launchedId = launched.id

    const target = state.enemies.items[1]
    target.active = true
    target.id = 2
    target.x = 132
    target.y = 0
    target.hp = 2
    target.speed = 0
    target.radius = 12
    target.mass = 1
    target.vx = 0
    target.vy = 0
    target.impulseX = 0
    target.impulseY = 0
    target.staggerTicks = 0
    const targetId = target.id

    state.step({ x: 0, y: 0, aimRadians: 0, slash: true })
    expect(state.events.some((event) => event.type === 'enemy-hit' && event.enemyId === launchedId)).toBe(true)
    expect(state.events.some((event) => event.type === 'enemy-hit' && event.enemyId === targetId)).toBe(false)

    let collided = false
    for (let tick = 0; tick < 12 && !collided; tick += 1) {
      state.step({ x: 0, y: 0, aimRadians: 0 })
      collided = state.events.some((event) => event.type === 'physics-impact' && event.kind === 'enemy')
    }

    expect(collided).toBe(true)
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
