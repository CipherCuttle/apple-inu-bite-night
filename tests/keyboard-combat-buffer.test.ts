import { describe, expect, it } from 'vitest'
import { KeyboardCombatBuffer } from '../src/game/input/KeyboardCombatBuffer'

describe('keyboard combat buffer', () => {
  it('holds stab and whirlwind edges across several fixed ticks', () => { const buffer = new KeyboardCombatBuffer(); buffer.queueStab(); buffer.queueWhirlwind(); for (let i = 0; i < 6; i += 1) { const input = buffer.consume(); expect(input.stab).toBe(true); expect(input.whirlwind).toBe(true) } })
  it('clears all queued edges on restart', () => { const buffer = new KeyboardCombatBuffer(); buffer.queueSlash(); buffer.queueStab(); buffer.queueWhirlwind(); buffer.queueDashRelease(); buffer.clear(); expect(buffer.consume()).toEqual({ slash: false, stab: false, whirlwind: false, dashReleased: false }) })
})
