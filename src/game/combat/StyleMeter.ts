import type { AttackKind } from './Sword'

export type StyleRank = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS'

export interface StyleRankSpec {
  rank: StyleRank
  label: string
  threshold: number
  scoreMultiplier: number
}

export const STYLE_RANKS: readonly StyleRankSpec[] = [
  { rank: 'D', label: 'STRAY', threshold: 0, scoreMultiplier: 1 },
  { rank: 'C', label: 'HUNGRY', threshold: 150, scoreMultiplier: 1.2 },
  { rank: 'B', label: 'FERAL', threshold: 350, scoreMultiplier: 1.5 },
  { rank: 'A', label: 'RABID', threshold: 650, scoreMultiplier: 2 },
  { rank: 'S', label: 'UNLEASHED', threshold: 1000, scoreMultiplier: 2.75 },
  { rank: 'SS', label: 'HELLHOUND', threshold: 1500, scoreMultiplier: 3.5 },
] as const

const MAX_STYLE = 2200
const DECAY_GRACE_TICKS = 120
const DECAY_PER_TICK = 3

export interface StyleAwardResult {
  gained: number
  total: number
  rank: StyleRank
  rankChanged: boolean
  variety: boolean
}

export class StyleMeter {
  points = 0
  private ticksSinceAward = DECAY_GRACE_TICKS
  private lastAttack: AttackKind | null = null
  private repeatCount = 0

  rankSpec(): StyleRankSpec {
    for (let i = STYLE_RANKS.length - 1; i >= 0; i -= 1) {
      if (this.points >= STYLE_RANKS[i].threshold) return STYLE_RANKS[i]
    }
    return STYLE_RANKS[0]
  }

  rank(): StyleRank {
    return this.rankSpec().rank
  }

  label(): string {
    return this.rankSpec().label
  }

  scoreMultiplier(): number {
    return this.rankSpec().scoreMultiplier
  }

  meterProgress(): number {
    const index = STYLE_RANKS.findIndex((entry) => entry.rank === this.rank())
    if (index < 0 || index >= STYLE_RANKS.length - 1) return 1
    const current = STYLE_RANKS[index]
    const next = STYLE_RANKS[index + 1]
    return clamp01((this.points - current.threshold) / (next.threshold - current.threshold))
  }

  award(base: number, attack?: AttackKind): StyleAwardResult {
    const before = this.rank()
    let factor = 1
    let variety = false

    if (attack) {
      if (this.lastAttack === attack) {
        this.repeatCount += 1
        factor = this.repeatCount === 1 ? 0.72 : this.repeatCount === 2 ? 0.48 : 0.3
      } else {
        variety = this.lastAttack !== null
        factor = variety ? 1.18 : 1
        this.lastAttack = attack
        this.repeatCount = 0
      }
    }

    const gained = Math.max(1, Math.round(base * factor))
    this.points = Math.min(MAX_STYLE, this.points + gained)
    this.ticksSinceAward = 0
    return {
      gained,
      total: this.points,
      rank: this.rank(),
      rankChanged: this.rank() !== before,
      variety,
    }
  }

  tick(): StyleRank | null {
    const before = this.rank()
    this.ticksSinceAward += 1
    if (this.ticksSinceAward > DECAY_GRACE_TICKS && this.points > 0) {
      this.points = Math.max(0, this.points - DECAY_PER_TICK)
    }
    const after = this.rank()
    return after !== before ? after : null
  }

  onPlayerHit(): StyleRank | null {
    const before = this.rank()
    this.points = Math.floor(this.points * 0.55)
    this.repeatCount = 0
    this.lastAttack = null
    this.ticksSinceAward = DECAY_GRACE_TICKS
    const after = this.rank()
    return after !== before ? after : null
  }

  snapshot(): readonly number[] {
    return [
      this.points,
      this.ticksSinceAward,
      this.repeatCount,
      this.lastAttack === 'slash' ? 1 : this.lastAttack === 'stab' ? 2 : this.lastAttack === 'dash' ? 3 : this.lastAttack === 'whirlwind' ? 4 : 0,
    ]
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
