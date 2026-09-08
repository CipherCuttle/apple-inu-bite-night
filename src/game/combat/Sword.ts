export type AttackKind = 'slash' | 'stab' | 'dash' | 'whirlwind'

export interface SwordConfig {
  innerRadius: number
  outerRadius: number
  arcRadians: number
  damage: number
  knockback: number
  cooldownTicks: number
}

export const SWORD_ATTACKS: Record<AttackKind, SwordConfig> = {
  slash: {
    innerRadius: 8,
    outerRadius: 104,
    arcRadians: Math.PI * 0.95,
    damage: 1,
    knockback: 26,
    cooldownTicks: 22,
  },
  stab: {
    innerRadius: 18,
    outerRadius: 128,
    arcRadians: Math.PI * 0.16,
    damage: 2,
    knockback: 34,
    cooldownTicks: 28,
  },
  dash: {
    innerRadius: 0,
    outerRadius: 34,
    arcRadians: Math.PI * 0.24,
    damage: 2,
    knockback: 52,
    cooldownTicks: 48,
  },
  whirlwind: {
    innerRadius: 0,
    outerRadius: 112,
    arcRadians: Math.PI * 2,
    damage: 1,
    knockback: 32,
    cooldownTicks: 78,
  },
}

// Canonical rendered blade dimensions for the Phase-1 player rig.
export const BASE_SWORD = SWORD_ATTACKS.slash

export function swordForAttack(kind: AttackKind): SwordConfig {
  return SWORD_ATTACKS[kind]
}

export function normalizeAngle(angle: number): number {
  let value = angle
  while (value <= -Math.PI) value += Math.PI * 2
  while (value > Math.PI) value -= Math.PI * 2
  return value
}

export function isPointInSwordArc(
  originX: number,
  originY: number,
  facing: number,
  pointX: number,
  pointY: number,
  targetRadius: number,
  config: SwordConfig,
): boolean {
  const dx = pointX - originX
  const dy = pointY - originY
  const distanceSq = dx * dx + dy * dy
  const outer = config.outerRadius + targetRadius
  const inner = Math.max(0, config.innerRadius - targetRadius)

  if (distanceSq > outer * outer || distanceSq < inner * inner) return false

  const targetAngle = Math.atan2(dy, dx)
  const diff = Math.abs(normalizeAngle(targetAngle - facing))
  return diff <= config.arcRadians / 2
}
