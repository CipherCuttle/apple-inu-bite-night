import { describe, expect, it } from 'vitest'
import { GameState, type InputState } from '../src/game/sim/GameState'

function scriptedInput(tick: number): InputState {
  const phase = Math.floor(tick / 120) % 4
  const movement =
    phase === 0 ? { x: 1, y: 0 } : phase === 1 ? { x: 0, y: 1 } : phase === 2 ? { x: -1, y: 0 } : { x: 0, y: -1 }
  const stab = tick % 113 === 0
  return {
    ...movement,
    aimRadians: ((tick * 7) % 360) * (Math.PI / 180),
    slash: !stab && tick % 23 === 0,
    stab,
  }
}

function run(seed: number, ticks: number): string {
  const state = new GameState(seed)
  for (let tick = 0; tick < ticks && !state.ended; tick += 1) state.step(scriptedInput(tick))
  return state.resultHash()
}

describe('deterministic simulation', () => {
  it('same seed + same movement/aim/attack input yields identical state hash', () => {
    expect(run(0xa11e1, 900)).toBe(run(0xa11e1, 900))
  })

  it('different seeds diverge', () => {
    expect(run(0xa11e1, 900)).not.toBe(run(0xb17e5, 900))
  })
})
