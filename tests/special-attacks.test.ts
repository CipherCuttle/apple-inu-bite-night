import { describe, expect, it } from 'vitest'
import { SWORD_ATTACKS } from '../src/game/combat/Sword'
import { GameState } from '../src/game/sim/GameState'

describe('special melee attacks', () => {
  it('keeps the primary slash deliberately wide', () => {
    expect(SWORD_ATTACKS.slash.arcRadians).toBeGreaterThan(Math.PI * 0.85)
    expect(SWORD_ATTACKS.slash.arcRadians).toBeLessThan(Math.PI)
  })

  it('charges on fixed ticks and releases into a deterministic multi-tick forward dash', () => {
    const state = new GameState(42)
    state.player.hp = 999

    for (let tick = 0; tick < 60; tick += 1) {
      state.step({ x: 0, y: 0, aimRadians: 0, dashHeld: true })
    }

    expect(state.dashChargeRatio()).toBe(1)
    state.step({ x: 0, y: 0, aimRadians: 0, dashReleased: true })

    const dash = state.events.find((event) => event.type === 'weapon-attack' && event.attack === 'dash')
    expect(dash).toBeDefined()
    expect(dash?.type === 'weapon-attack' ? dash.distance : 0).toBeGreaterThan(180)
    expect(state.isDashing()).toBe(true)
    expect(state.player.x).toBeGreaterThan(0)
    expect(state.player.x).toBeLessThan(80)
    expect(state.dashChargeRatio()).toBe(0)

    let safety = 20
    while (state.isDashing() && safety-- > 0) state.step({ x: 0, y: 0, aimRadians: 0 })
    expect(state.isDashing()).toBe(false)
    expect(state.player.x).toBeGreaterThan(180)
  })

  it('whirlwind hits behind the dog inside a full 360 degree radius', () => {
    const state = new GameState(7)
    state.player.hp = 999
    const target = state.enemies.items.find((enemy) => enemy.active)
    expect(target).toBeDefined()
    if (!target) return

    target.x = -70
    target.y = 0
    target.speed = 0
    target.hp = 2

    state.step({ x: 0, y: 0, aimRadians: 0, whirlwind: true })

    expect(state.events.some((event) => event.type === 'weapon-attack' && event.attack === 'whirlwind')).toBe(true)
    expect(state.events.some((event) => event.type === 'enemy-hit' && event.attack === 'whirlwind' && event.enemyId === target.id)).toBe(true)
  })
})