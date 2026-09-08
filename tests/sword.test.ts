import { describe, expect, it } from 'vitest'
import { BASE_SWORD, isPointInSwordArc } from '../src/game/combat/Sword'

describe('sword sector', () => {
  it('hits a target in front', () => {
    expect(isPointInSwordArc(0, 0, 0, 60, 0, 10, BASE_SWORD)).toBe(true)
  })

  it('does not hit behind the dog', () => {
    expect(isPointInSwordArc(0, 0, 0, -60, 0, 10, BASE_SWORD)).toBe(false)
  })

  it('includes target radius near the blade tip', () => {
    expect(isPointInSwordArc(0, 0, 0, BASE_SWORD.outerRadius + 8, 0, 10, BASE_SWORD)).toBe(true)
  })
})
