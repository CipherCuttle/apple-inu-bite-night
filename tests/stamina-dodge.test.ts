import { describe, expect, it } from 'vitest'
import { DEFAULT_LOADOUT } from '../src/game/build/Loadout'
import { GameState } from '../src/game/sim/GameState'

describe('soulslike stamina / dodge v0', () => {
  it('spends weapon stamina and delays regeneration after commitment', () => {
    const state = new GameState(301, DEFAULT_LOADOUT)
    state.player.hp = 999

    state.step({ x: 0, y: 0, aimRadians: 0, slash: true })
    expect(state.staminaCurrent()).toBeCloseTo(88)

    for (let i = 0; i < 23; i += 1) state.step({ x: 0, y: 0, aimRadians: 0 })
    expect(state.staminaCurrent()).toBeCloseTo(88)

    state.step({ x: 0, y: 0, aimRadians: 0 })
    expect(state.staminaCurrent()).toBeGreaterThan(88)
  })

  it('fails closed when an attack cannot afford its stamina cost', () => {
    const state = new GameState(302, DEFAULT_LOADOUT)
    state.player.hp = 999
    state.stamina.current = 0

    state.step({ x: 0, y: 0, aimRadians: 0, slash: true })

    expect(state.events.some((event) => event.type === 'weapon-attack')).toBe(false)
    expect(state.staminaCurrent()).toBe(0)
  })

  it('starts a committed dodge, spends stamina, and moves deterministically', () => {
    const state = new GameState(303, DEFAULT_LOADOUT)
    state.player.hp = 999
    const startX = state.player.x

    state.step({ x: 1, y: 0, aimRadians: 0, dodge: true })

    expect(state.isDodging()).toBe(true)
    expect(state.dodgeInvulnerable()).toBe(true)
    expect(state.player.x).toBeGreaterThan(startX)
    expect(state.staminaCurrent()).toBeCloseTo(76)
    expect(state.events.some((event) => event.type === 'dodge-start')).toBe(true)
    expect(state.events.some((event) => event.type === 'dodge-step')).toBe(true)
  })

  it('has a bounded iframe window followed by vulnerable recovery', () => {
    const state = new GameState(304, DEFAULT_LOADOUT)
    state.player.hp = 999
    state.step({ x: 1, y: 0, dodge: true })
    expect(state.dodgeInvulnerable()).toBe(true)

    for (let i = 0; i < 5; i += 1) state.step({ x: 0, y: 0 })
    expect(state.dodgeInvulnerable()).toBe(true)

    state.step({ x: 0, y: 0 })
    expect(state.isDodging()).toBe(true)
    expect(state.dodgeInvulnerable()).toBe(false)
  })

  it('does not allow dodge to cancel an active attack cooldown', () => {
    const state = new GameState(305, DEFAULT_LOADOUT)
    state.player.hp = 999
    state.step({ x: 0, y: 0, slash: true })
    const afterAttack = state.staminaCurrent()

    state.step({ x: 1, y: 0, dodge: true })

    expect(state.isDodging()).toBe(false)
    expect(state.staminaCurrent()).toBeCloseTo(afterAttack)
  })

  it('keeps stamina and dodge state deterministic', () => {
    const a = new GameState(306, DEFAULT_LOADOUT)
    const b = new GameState(306, DEFAULT_LOADOUT)
    a.player.hp = 999
    b.player.hp = 999

    for (let tick = 0; tick < 180; tick += 1) {
      const input = {
        x: tick % 40 < 20 ? 1 : -1,
        y: 0,
        aimRadians: 0,
        slash: tick % 31 === 0,
        dodge: tick % 47 === 0,
      }
      a.step(input)
      b.step(input)
    }

    expect(a.resultHash()).toBe(b.resultHash())
  })
})
