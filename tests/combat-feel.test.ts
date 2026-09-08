import { describe, expect, it } from 'vitest'
import { getImpactProfile } from '../src/presentation/CombatFeel'

describe('combat impact profile', () => {
  it('keeps feedback bounded while escalating multi-kills', () => {
    const miss = getImpactProfile(0, 0)
    const single = getImpactProfile(1, 1)
    const triple = getImpactProfile(3, 3)
    const massacre = getImpactProfile(12, 12)

    expect(miss.hitStopMs).toBe(0)
    expect(single.hitStopMs).toBeGreaterThan(0)
    expect(triple.hitStopMs).toBeGreaterThan(single.hitStopMs)
    expect(massacre.hitStopMs).toBeGreaterThan(triple.hitStopMs)
    expect(massacre.hitStopMs).toBeLessThanOrEqual(60)
    expect(massacre.shakeIntensity).toBeLessThan(0.006)
  })
})
