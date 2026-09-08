import { describe, expect, it } from 'vitest'
import { GameState, type InputState } from '../src/game/sim/GameState'

function scriptedInput(tick: number): InputState {
  const phase = Math.floor(tick / 120) % 4
  if (phase === 0) return { x: 1, y: 0 }
  if (phase === 1) return { x: 0, y: 1 }
  if (phase === 2) return { x: -1, y: 0 }
  return { x: 0, y: -1 }
}

function run(seed: number, ticks: number): string {
  const state = new GameState(seed)
  for (let tick = 0; tick < ticks && !state.ended; tick += 1) state.step(scriptedInput(tick))
  return state.resultHash()
}

describe('deterministic simulation', () => {
  it('same seed + same input yields identical state hash', () => {
    expect(run(0xa11e1, 900)).toBe(run(0xa11e1, 900))
  })

  it('different seeds diverge', () => {
    expect(run(0xa11e1, 900)).not.toBe(run(0xb17e5, 900))
  })
})
