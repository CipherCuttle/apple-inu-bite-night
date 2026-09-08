import { describe, expect, it } from 'vitest'
import { BASE_SWORD, SWORD_ATTACKS, isPointInSwordArc } from '../src/game/combat/Sword'

describe('sword sectors', () => {
  it('wide slash hits a target in front', () => {
    expect(isPointInSwordArc(0, 0, 0, 60, 0, 10, BASE_SWORD)).toBe(true)
  })

  it('does not hit behind the dog', () => {
    expect(isPointInSwordArc(0, 0, 0, -60, 0, 10, BASE_SWORD)).toBe(false)
  })

  it('includes target radius near the blade tip', () => {
    expect(isPointInSwordArc(0, 0, 0, BASE_SWORD.outerRadius + 8, 0, 10, BASE_SWORD)).toBe(true)
  })

  it('stab reaches farther but has a much narrower angle', () => {
    expect(SWORD_ATTACKS.stab.outerRadius).toBeGreaterThan(SWORD_ATTACKS.slash.outerRadius)
    expect(SWORD_ATTACKS.stab.arcRadians).toBeLessThan(SWORD_ATTACKS.slash.arcRadians / 2)
    expect(isPointInSwordArc(0, 0, 0, 116, 0, 8, SWORD_ATTACKS.stab)).toBe(true)
    expect(isPointInSwordArc(0, 0, 0, 75, 48, 8, SWORD_ATTACKS.stab)).toBe(false)
  })

  it('keeps primary melee recovery below a quarter second at 60 Hz', () => {
    expect(SWORD_ATTACKS.slash.cooldownTicks).toBeLessThanOrEqual(15)
    expect(SWORD_ATTACKS.stab.cooldownTicks).toBeLessThanOrEqual(18)
  })
})
