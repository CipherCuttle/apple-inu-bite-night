import { describe, expect, it } from 'vitest'
import { buttonToAttack, toLogicalPointer } from '../src/game/input/DesktopCombatInput'

describe('desktop combat input helpers', () => {
  it('maps native mouse buttons to the intended melee attacks', () => {
    expect(buttonToAttack(0)).toBe('slash')
    expect(buttonToAttack(2)).toBe('stab')
    expect(buttonToAttack(1)).toBeNull()
  })

  it('maps CSS-scaled canvas coordinates back to the 960x540 logical playfield', () => {
    const point = toLogicalPointer(500, 300, { left: 20, top: 30, width: 960, height: 540 }, 960, 540)
    expect(point).toEqual({ x: 480, y: 270 })

    const scaled = toLogicalPointer(260, 165, { left: 20, top: 30, width: 480, height: 270 }, 960, 540)
    expect(scaled).toEqual({ x: 480, y: 270 })
  })
})
