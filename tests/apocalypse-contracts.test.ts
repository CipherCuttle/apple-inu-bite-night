import { describe, expect, it } from 'vitest'
import {
  canonicalTermsJson,
  createReplayProof,
  verifyReplay,
  type SurvivalContractTerms,
} from '../src/game/contracts/ApocalypseContracts'
import type { InputState } from '../src/game/sim/GameState'

const runner = '0xrunner'

function terms(overrides: Partial<SurvivalContractTerms> = {}): SurvivalContractTerms {
  return {
    version: 0,
    contractId: 'contract-1',
    objective: 'survive',
    seed: 0xa11e1,
    minTicks: 30,
    maxTicks: 120,
    minKills: 0,
    rewardAtomic: '1000000',
    ...overrides,
  }
}

function idleInputs(count: number): InputState[] {
  return Array.from({ length: count }, () => ({ x: 0, y: 0, aimRadians: 0 }))
}

describe('apocalypse contracts v0', () => {
  it('independently replays a run before issuing a success receipt', () => {
    const contractTerms = terms()
    const proof = createReplayProof(contractTerms, runner, idleInputs(30))
    const result = verifyReplay(contractTerms, proof, runner)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.receipt.ticks).toBeGreaterThanOrEqual(contractTerms.minTicks)
    expect(result.receipt.resultHash).toBe(proof.claimedResultHash)
  })

  it('rejects a forged result hash', () => {
    const contractTerms = terms()
    const proof = createReplayProof(contractTerms, runner, idleInputs(30))
    proof.claimedResultHash = 'deadbeef'

    expect(verifyReplay(contractTerms, proof, runner)).toEqual({
      ok: false,
      reason: 'RESULT_HASH_MISMATCH',
    })
  })

  it('binds the replay to the accepted runner and seed', () => {
    const contractTerms = terms()
    const proof = createReplayProof(contractTerms, runner, idleInputs(30))

    expect(verifyReplay(contractTerms, proof, '0xsomeone-else')).toEqual({
      ok: false,
      reason: 'RUNNER_MISMATCH',
    })

    const wrongSeed = { ...proof, seed: proof.seed + 1 }
    expect(verifyReplay(contractTerms, wrongSeed, runner)).toEqual({
      ok: false,
      reason: 'SEED_MISMATCH',
    })
  })

  it('rejects a replay that does not satisfy the contract window', () => {
    const contractTerms = terms({ minTicks: 60, maxTicks: 90 })
    const proof = createReplayProof(contractTerms, runner, idleInputs(30))

    expect(verifyReplay(contractTerms, proof, runner)).toEqual({
      ok: false,
      reason: 'MIN_TICKS_NOT_REACHED',
    })
  })

  it('canonicalizes terms without depending on object key order', () => {
    const contractTerms = terms()
    expect(canonicalTermsJson(contractTerms)).toBe(
      '{"version":0,"contractId":"contract-1","objective":"survive","seed":659937,"minTicks":30,"maxTicks":120,"minKills":0,"rewardAtomic":"1000000"}',
    )
  })
})
