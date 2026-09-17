import { GameState, type InputState } from '../sim/GameState'

export interface SurvivalContractTerms {
  version: 0
  contractId: string
  objective: 'survive'
  seed: number
  minTicks: number
  maxTicks: number
  minKills: number
  rewardAtomic: string
}

export interface ReplayProof {
  contractId: string
  runner: string
  seed: number
  inputs: InputState[]
  claimedResultHash: string
}

export interface VerifiedRunReceipt {
  contractId: string
  runner: string
  seed: number
  ticks: number
  kills: number
  score: number
  resultHash: string
}

export type VerificationFailure =
  | 'CONTRACT_MISMATCH'
  | 'RUNNER_MISMATCH'
  | 'SEED_MISMATCH'
  | 'INVALID_TERMS'
  | 'REPLAY_TOO_LONG'
  | 'RUN_ENDED_EARLY'
  | 'MIN_TICKS_NOT_REACHED'
  | 'MIN_KILLS_NOT_REACHED'
  | 'RESULT_HASH_MISMATCH'

export type VerificationResult =
  | { ok: true; receipt: VerifiedRunReceipt }
  | { ok: false; reason: VerificationFailure }

export function canonicalTermsJson(terms: SurvivalContractTerms): string {
  return JSON.stringify({
    version: terms.version,
    contractId: terms.contractId,
    objective: terms.objective,
    seed: terms.seed >>> 0,
    minTicks: terms.minTicks,
    maxTicks: terms.maxTicks,
    minKills: terms.minKills,
    rewardAtomic: terms.rewardAtomic,
  })
}

export function createReplayProof(
  terms: SurvivalContractTerms,
  runner: string,
  inputs: InputState[],
): ReplayProof {
  const state = replay(terms.seed, inputs)
  return {
    contractId: terms.contractId,
    runner,
    seed: terms.seed >>> 0,
    inputs: inputs.map((input) => ({ ...input })),
    claimedResultHash: state.resultHash(),
  }
}

export function verifyReplay(
  terms: SurvivalContractTerms,
  proof: ReplayProof,
  expectedRunner: string,
): VerificationResult {
  if (proof.contractId !== terms.contractId) return { ok: false, reason: 'CONTRACT_MISMATCH' }
  if (proof.runner !== expectedRunner) return { ok: false, reason: 'RUNNER_MISMATCH' }
  if ((proof.seed >>> 0) !== (terms.seed >>> 0)) return { ok: false, reason: 'SEED_MISMATCH' }
  if (!validTerms(terms)) return { ok: false, reason: 'INVALID_TERMS' }
  if (proof.inputs.length > terms.maxTicks) return { ok: false, reason: 'REPLAY_TOO_LONG' }

  const state = replay(terms.seed, proof.inputs)
  if (state.ended && state.tick < terms.minTicks) return { ok: false, reason: 'RUN_ENDED_EARLY' }
  if (state.tick < terms.minTicks) return { ok: false, reason: 'MIN_TICKS_NOT_REACHED' }
  if (state.kills < terms.minKills) return { ok: false, reason: 'MIN_KILLS_NOT_REACHED' }

  const resultHash = state.resultHash()
  if (resultHash !== proof.claimedResultHash) return { ok: false, reason: 'RESULT_HASH_MISMATCH' }

  return {
    ok: true,
    receipt: {
      contractId: terms.contractId,
      runner: proof.runner,
      seed: terms.seed >>> 0,
      ticks: state.tick,
      kills: state.kills,
      score: state.score,
      resultHash,
    },
  }
}

function replay(seed: number, inputs: InputState[]): GameState {
  const state = new GameState(seed)
  for (const input of inputs) {
    if (state.ended) break
    state.step(input)
  }
  return state
}

function validTerms(terms: SurvivalContractTerms): boolean {
  return (
    terms.version === 0 &&
    terms.objective === 'survive' &&
    terms.contractId.length > 0 &&
    Number.isInteger(terms.minTicks) &&
    terms.minTicks > 0 &&
    Number.isInteger(terms.maxTicks) &&
    terms.maxTicks >= terms.minTicks &&
    Number.isInteger(terms.minKills) &&
    terms.minKills >= 0 &&
    /^\d+$/.test(terms.rewardAtomic)
  )
}
