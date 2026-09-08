import type { AbilityId } from './Ability'
import type { DodgeProfile } from './Dodge'
import type { StaminaProfile } from './Stamina'
import type { WeaponId } from './Weapon'

export const HERO_IDS = ['apple-inu'] as const
export type HeroId = (typeof HERO_IDS)[number]
export type PassiveId = 'last-chance'

export interface HeroStats {
  maxHp: number
}

export interface MovementProfile {
  speed: number
  collisionRadius: number
}

export interface HeroPresentation {
  headTexture: string
  weaponTexture: string
  displayName: string
}

export interface HeroDefinition {
  id: HeroId
  name: string
  baseStats: HeroStats
  innatePassive: PassiveId
  signatureAbility: AbilityId
  defaultWeapon: WeaponId
  movementProfile: MovementProfile
  staminaProfile: StaminaProfile
  dodgeProfile: DodgeProfile
  presentation: HeroPresentation
  unlockCondition?: string
}

export const HERO_REGISTRY: Readonly<Record<HeroId, HeroDefinition>> = {
  'apple-inu': {
    id: 'apple-inu',
    name: 'APPLE INU',
    baseStats: { maxHp: 5 },
    innatePassive: 'last-chance',
    signatureAbility: 'bark-blast',
    defaultWeapon: 'mouthblade',
    movementProfile: { speed: 3.25, collisionRadius: 14 },
    staminaProfile: { max: 100, regenPerTick: 1.15, regenDelayTicks: 24 },
    dodgeProfile: {
      staminaCost: 24,
      distance: 78,
      travelTicks: 8,
      recoveryTicks: 4,
      iframeStartTick: 1,
      iframeEndTick: 6,
    },
    presentation: {
      headTexture: 'apple-inu-head',
      weaponTexture: 'apple-inu-sword',
      displayName: 'APPLE INU',
    },
  },
}

export function heroDefinition(id: HeroId): HeroDefinition {
  return HERO_REGISTRY[id]
}
