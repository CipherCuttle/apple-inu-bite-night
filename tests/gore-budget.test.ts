import { describe, expect, it } from 'vitest'
import { GoreBudget } from '../src/presentation/GoreBudget'
import type { SimEvent } from '../src/game/sim/GameState'

describe('GoreBudget', () => {
  it('caps loud and filler gore independently', () => {
    const events: SimEvent[] = Array.from({ length: 30 }, (_, i) => ({
      type: 'enemy-hit' as const,
      attack: 'slash' as const,
      tick: 1,
      enemyId: i + 1,
      x: 0,
      y: 0,
      killed: i < 10,
      facing: 0,
    }))
    const selected = new GoreBudget(3, 5).select(events)
    expect(selected.major).toHaveLength(3)
    expect(selected.minor).toHaveLength(5)
  })
})
