import { SWORD_ATTACKS, type AttackKind, type SwordConfig } from '../combat/Sword'
import type { AbilityId } from './Ability'

export const WEAPON_IDS = ['mouthblade', 'greatsword', 'spear'] as const
export type WeaponId = (typeof WEAPON_IDS)[number]
export type WeaponFamily = 'mouthblade' | 'greatsword' | 'spear'

export interface AttackDefinition extends SwordConfig {
  id: string
  input: AttackKind
  windupTicks: number
  activeTicks: number
  recoveryTicks: number
  staminaCost: number
  stagger: number
  movementCommitment: 'light' | 'medium' | 'heavy' | 'dash'
  styleTags: readonly string[]
}

export interface WeaponStaminaProfile {
  light: number
  heavy: number
  mobility: number
  art: number
}

export interface WeaponDefinition {
  id: WeaponId
  name: string
  family: WeaponFamily
  attacks: Readonly<Record<AttackKind, AttackDefinition>>
  weaponArt?: AbilityId
  staminaCosts: WeaponStaminaProfile
  stagger: number
  knockback: number
  styleTags: readonly string[]
}

function defineAttack(
  id: string,
  input: AttackKind,
  config: SwordConfig,
  timing: Pick<AttackDefinition, 'windupTicks' | 'activeTicks' | 'recoveryTicks' | 'staminaCost' | 'stagger' | 'movementCommitment' | 'styleTags'>,
): AttackDefinition {
  return { id, input, ...config, ...timing }
}

const mouthbladeAttacks: Readonly<Record<AttackKind, AttackDefinition>> = {
  slash: defineAttack('mouthblade-slash', 'slash', SWORD_ATTACKS.slash, {
    windupTicks: 3, activeTicks: 3, recoveryTicks: 8, staminaCost: 12, stagger: 1, movementCommitment: 'light', styleTags: ['sweep', 'wide'],
  }),
  stab: defineAttack('mouthblade-stab', 'stab', SWORD_ATTACKS.stab, {
    windupTicks: 4, activeTicks: 3, recoveryTicks: 11, staminaCost: 16, stagger: 2, movementCommitment: 'medium', styleTags: ['thrust', 'precision'],
  }),
  dash: defineAttack('mouthblade-dash', 'dash', SWORD_ATTACKS.dash, {
    windupTicks: 4, activeTicks: 10, recoveryTicks: 24, staminaCost: 22, stagger: 3, movementCommitment: 'dash', styleTags: ['gap-close', 'impact'],
  }),
  whirlwind: defineAttack('mouthblade-whirlwind', 'whirlwind', SWORD_ATTACKS.whirlwind, {
    windupTicks: 10, activeTicks: 12, recoveryTicks: 36, staminaCost: 34, stagger: 2, movementCommitment: 'heavy', styleTags: ['aoe', 'crowd-control'],
  }),
}

const greatswordAttacks: Readonly<Record<AttackKind, AttackDefinition>> = {
  slash: defineAttack('greatsword-cleave', 'slash', {
    innerRadius: 10, outerRadius: 126, arcRadians: Math.PI * 1.12, damage: 2, knockback: 42, cooldownTicks: 24,
  }, {
    windupTicks: 7, activeTicks: 5, recoveryTicks: 12, staminaCost: 22, stagger: 4, movementCommitment: 'heavy', styleTags: ['cleave', 'wide', 'commitment'],
  }),
  stab: defineAttack('greatsword-overhead', 'stab', {
    innerRadius: 4, outerRadius: 98, arcRadians: Math.PI * 0.42, damage: 3, knockback: 54, cooldownTicks: 32,
  }, {
    windupTicks: 11, activeTicks: 4, recoveryTicks: 17, staminaCost: 28, stagger: 5, movementCommitment: 'heavy', styleTags: ['overhead', 'stagger', 'commitment'],
  }),
  dash: defineAttack('greatsword-shoulder-charge', 'dash', {
    innerRadius: 0, outerRadius: 38, arcRadians: Math.PI * 0.28, damage: 2, knockback: 64, cooldownTicks: 46,
  }, {
    windupTicks: 7, activeTicks: 10, recoveryTicks: 29, staminaCost: 30, stagger: 5, movementCommitment: 'dash', styleTags: ['gap-close', 'stagger'],
  }),
  whirlwind: defineAttack('greatsword-great-circle', 'whirlwind', {
    innerRadius: 0, outerRadius: 132, arcRadians: Math.PI * 2, damage: 2, knockback: 46, cooldownTicks: 72,
  }, {
    windupTicks: 16, activeTicks: 14, recoveryTicks: 42, staminaCost: 42, stagger: 4, movementCommitment: 'heavy', styleTags: ['aoe', 'commitment', 'finisher'],
  }),
}

const spearAttacks: Readonly<Record<AttackKind, AttackDefinition>> = {
  slash: defineAttack('spear-sweep', 'slash', {
    innerRadius: 32, outerRadius: 142, arcRadians: Math.PI * 0.48, damage: 1, knockback: 24, cooldownTicks: 13,
  }, {
    windupTicks: 3, activeTicks: 3, recoveryTicks: 7, staminaCost: 10, stagger: 1, movementCommitment: 'light', styleTags: ['spacing', 'sweep'],
  }),
  stab: defineAttack('spear-thrust', 'stab', {
    innerRadius: 38, outerRadius: 184, arcRadians: Math.PI * 0.10, damage: 2, knockback: 30, cooldownTicks: 15,
  }, {
    windupTicks: 3, activeTicks: 3, recoveryTicks: 9, staminaCost: 13, stagger: 2, movementCommitment: 'medium', styleTags: ['reach', 'thrust', 'precision'],
  }),
  dash: defineAttack('spear-lunge', 'dash', {
    innerRadius: 0, outerRadius: 42, arcRadians: Math.PI * 0.18, damage: 2, knockback: 38, cooldownTicks: 30,
  }, {
    windupTicks: 3, activeTicks: 10, recoveryTicks: 17, staminaCost: 18, stagger: 2, movementCommitment: 'dash', styleTags: ['lunge', 'reach'],
  }),
  whirlwind: defineAttack('spear-zone', 'whirlwind', {
    innerRadius: 30, outerRadius: 148, arcRadians: Math.PI * 2, damage: 1, knockback: 26, cooldownTicks: 52,
  }, {
    windupTicks: 8, activeTicks: 12, recoveryTicks: 32, staminaCost: 28, stagger: 2, movementCommitment: 'medium', styleTags: ['zone-control', 'aoe'],
  }),
}

export const WEAPON_REGISTRY: Readonly<Record<WeaponId, WeaponDefinition>> = {
  mouthblade: {
    id: 'mouthblade', name: 'MOUTHBLADE', family: 'mouthblade', attacks: mouthbladeAttacks,
    staminaCosts: { light: 12, heavy: 16, mobility: 22, art: 34 }, stagger: 2, knockback: 32,
    styleTags: ['feral', 'close-control', 'apple-inu'],
  },
  greatsword: {
    id: 'greatsword', name: 'GREATSWORD', family: 'greatsword', attacks: greatswordAttacks,
    staminaCosts: { light: 22, heavy: 28, mobility: 30, art: 42 }, stagger: 5, knockback: 52,
    styleTags: ['heavy', 'stagger', 'commitment'],
  },
  spear: {
    id: 'spear', name: 'SPEAR', family: 'spear', attacks: spearAttacks,
    staminaCosts: { light: 10, heavy: 13, mobility: 18, art: 28 }, stagger: 2, knockback: 29,
    styleTags: ['reach', 'spacing', 'precision'],
  },
}

export function weaponDefinition(id: WeaponId): WeaponDefinition {
  return WEAPON_REGISTRY[id]
}

export function weaponAttackForInput(id: WeaponId, input: AttackKind): AttackDefinition {
  return weaponDefinition(id).attacks[input]
}
