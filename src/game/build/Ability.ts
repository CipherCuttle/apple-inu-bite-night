export const ABILITY_IDS = ['bark-blast', 'zoomies', 'vampiric-bite'] as const

export type AbilityId = (typeof ABILITY_IDS)[number]

export type AbilityEffect =
  | { kind: 'DAMAGE'; amount: number }
  | { kind: 'IMPULSE'; force: number }
  | { kind: 'DASH'; distance: number }
  | { kind: 'PROJECTILE'; speed: number; lifetimeTicks: number }
  | { kind: 'CONE'; range: number; arcRadians: number }
  | { kind: 'AOE'; radius: number }
  | { kind: 'BUFF'; stat: 'move-speed' | 'attack-speed'; multiplier: number; durationTicks: number }
  | { kind: 'DEBUFF'; stat: 'move-speed' | 'attack-speed'; multiplier: number; durationTicks: number }
  | { kind: 'SUMMON'; archetype: string; durationTicks: number }
  | { kind: 'TRAP'; radius: number; durationTicks: number }
  | { kind: 'HEAL'; amount: number }
  | { kind: 'SHIELD'; amount: number; durationTicks: number }
  | { kind: 'TELEPORT'; distance: number }

export interface AbilityDefinition {
  id: AbilityId
  name: string
  cooldownTicks: number
  staminaCost: number
  castTicks: number
  effects: readonly AbilityEffect[]
  tags: readonly string[]
}

// V0 values are tuning placeholders. The kernel freezes shape and composition, not balance.
export const ABILITY_REGISTRY: Readonly<Record<AbilityId, AbilityDefinition>> = {
  'bark-blast': {
    id: 'bark-blast',
    name: 'BARK BLAST',
    cooldownTicks: 180,
    staminaCost: 24,
    castTicks: 8,
    effects: [
      { kind: 'CONE', range: 120, arcRadians: Math.PI * 0.55 },
      { kind: 'DAMAGE', amount: 1 },
      { kind: 'IMPULSE', force: 30 },
    ],
    tags: ['signature', 'crowd-control', 'space-maker'],
  },
  zoomies: {
    id: 'zoomies',
    name: 'ZOOMIES',
    cooldownTicks: 240,
    staminaCost: 20,
    castTicks: 0,
    effects: [
      { kind: 'DASH', distance: 120 },
      { kind: 'BUFF', stat: 'move-speed', multiplier: 1.35, durationTicks: 60 },
    ],
    tags: ['mobility', 'reposition'],
  },
  'vampiric-bite': {
    id: 'vampiric-bite',
    name: 'VAMPIRIC BITE',
    cooldownTicks: 150,
    staminaCost: 18,
    castTicks: 6,
    effects: [
      { kind: 'CONE', range: 46, arcRadians: Math.PI * 0.32 },
      { kind: 'DAMAGE', amount: 2 },
      { kind: 'HEAL', amount: 1 },
    ],
    tags: ['melee', 'sustain', 'commitment'],
  },
}

export function abilityDefinition(id: AbilityId): AbilityDefinition {
  return ABILITY_REGISTRY[id]
}
