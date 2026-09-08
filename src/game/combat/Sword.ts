export interface SwordConfig {
  innerRadius: number
  outerRadius: number
  arcRadians: number
  damage: number
  knockback: number
  cooldownTicks: number
}

export const BASE_SWORD: SwordConfig = {
  innerRadius: 12,
  outerRadius: 92,
  arcRadians: Math.PI * 0.75,
  damage: 1,
  knockback: 18,
  cooldownTicks: 26,
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
