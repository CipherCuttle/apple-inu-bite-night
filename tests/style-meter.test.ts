import { describe, expect, it } from 'vitest'
import { StyleMeter } from '../src/game/combat/StyleMeter'

describe('StyleMeter', () => {
  it('rewards variety more than repeated spam', () => {
    const meter = new StyleMeter()
    const first = meter.award(100, 'slash')
    const repeated = meter.award(100, 'slash')
    const mixed = meter.award(100, 'stab')

    expect(first.gained).toBe(100)
    expect(repeated.gained).toBeLessThan(first.gained)
    expect(mixed.gained).toBeGreaterThan(first.gained)
    expect(mixed.variety).toBe(true)
  })

  it('climbs ranks, then loses style after a hit', () => {
    const meter = new StyleMeter()
    meter.award(700, 'dash')
    expect(['A', 'S', 'SS']).toContain(meter.rank())
    const before = meter.points
    meter.onPlayerHit()
    expect(meter.points).toBeLessThan(before)
  })

  it('decays after the grace window', () => {
    const meter = new StyleMeter()
    meter.award(400, 'whirlwind')
    const before = meter.points
    for (let i = 0; i < 150; i += 1) meter.tick()
    expect(meter.points).toBeLessThan(before)
  })
})
