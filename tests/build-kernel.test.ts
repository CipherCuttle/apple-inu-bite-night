import { describe, expect, it } from 'vitest'
import { ABILITY_IDS, ABILITY_REGISTRY } from '../src/game/build/Ability'
import { HERO_REGISTRY } from '../src/game/build/Hero'
import { DEFAULT_LOADOUT, loadoutFingerprint, validateLoadout } from '../src/game/build/Loadout'
import { createStamina } from '../src/game/build/Stamina'
import { WEAPON_IDS, WEAPON_REGISTRY } from '../src/game/build/Weapon'
import { SWORD_ATTACKS } from '../src/game/combat/Sword'

describe('hero / weapon / ability kernel v0', () => {
  it('models Apple Inu as a hero definition with fixed identity and swappable loadout slots', () => {
    const apple = HERO_REGISTRY['apple-inu']
    expect(apple.name).toBe('APPLE INU')
    expect(apple.signatureAbility).toBe('bark-blast')
    expect(apple.defaultWeapon).toBe('mouthblade')
    expect(DEFAULT_LOADOUT.heroId).toBe(apple.id)
    expect(DEFAULT_LOADOUT.weaponId).toBe(apple.defaultWeapon)
    expect(DEFAULT_LOADOUT.skillA).not.toBe(DEFAULT_LOADOUT.skillB)
  })

  it('ships exactly the bounded v0 content set', () => {
    expect(WEAPON_IDS).toEqual(['mouthblade', 'greatsword', 'spear'])
    expect(ABILITY_IDS).toEqual(['bark-blast', 'zoomies', 'vampiric-bite'])
  })

  it('preserves the existing Mouthblade combat geometry exactly', () => {
    for (const input of ['slash', 'stab', 'dash', 'whirlwind'] as const) {
      const move = WEAPON_REGISTRY.mouthblade.attacks[input]
      expect(move.innerRadius).toBe(SWORD_ATTACKS[input].innerRadius)
      expect(move.outerRadius).toBe(SWORD_ATTACKS[input].outerRadius)
      expect(move.arcRadians).toBe(SWORD_ATTACKS[input].arcRadians)
      expect(move.damage).toBe(SWORD_ATTACKS[input].damage)
      expect(move.knockback).toBe(SWORD_ATTACKS[input].knockback)
      expect(move.cooldownTicks).toBe(SWORD_ATTACKS[input].cooldownTicks)
    }
  })

  it('makes weapon families materially different movesets, not damage skins', () => {
    const mouth = WEAPON_REGISTRY.mouthblade.attacks.stab
    const great = WEAPON_REGISTRY.greatsword.attacks.stab
    const spear = WEAPON_REGISTRY.spear.attacks.stab

    expect(new Set([mouth.outerRadius, great.outerRadius, spear.outerRadius]).size).toBe(3)
    expect(new Set([mouth.arcRadians, great.arcRadians, spear.arcRadians]).size).toBe(3)
    expect(new Set([mouth.cooldownTicks, great.cooldownTicks, spear.cooldownTicks]).size).toBe(3)
    expect(great.movementCommitment).toBe('heavy')
    expect(spear.styleTags).toContain('reach')
  })

  it('expresses abilities through a shared effect vocabulary', () => {
    expect(ABILITY_REGISTRY['bark-blast'].effects.map((effect) => effect.kind)).toEqual(['CONE', 'DAMAGE', 'IMPULSE'])
    expect(ABILITY_REGISTRY.zoomies.effects.map((effect) => effect.kind)).toEqual(['DASH', 'BUFF'])
    expect(ABILITY_REGISTRY['vampiric-bite'].effects.map((effect) => effect.kind)).toEqual(['CONE', 'DAMAGE', 'HEAL'])
  })

  it('provides a stamina state contract without enabling stamina gameplay yet', () => {
    const stamina = createStamina(HERO_REGISTRY['apple-inu'].staminaProfile)
    expect(stamina.current).toBe(stamina.max)
    expect(stamina.max).toBeGreaterThan(0)
    expect(stamina.regenDelayTicks).toBeGreaterThan(0)
  })

  it('validates loadouts and gives authoritative selections a stable fingerprint', () => {
    expect(validateLoadout(DEFAULT_LOADOUT)).toEqual(DEFAULT_LOADOUT)
    expect(loadoutFingerprint(DEFAULT_LOADOUT)).toBe('apple-inu|mouthblade|zoomies|vampiric-bite')
    expect(() => validateLoadout({ ...DEFAULT_LOADOUT, skillB: 'zoomies' })).toThrow(/distinct/)
  })
})
