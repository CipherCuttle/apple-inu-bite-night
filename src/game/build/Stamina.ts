export interface StaminaProfile {
  max: number
  regenPerTick: number
  regenDelayTicks: number
}

export interface Stamina {
  current: number
  max: number
  regenPerTick: number
  regenDelayTicks: number
  lockedUntilTick: number
}

export function createStamina(profile: StaminaProfile): Stamina {
  return {
    current: profile.max,
    max: profile.max,
    regenPerTick: profile.regenPerTick,
    regenDelayTicks: profile.regenDelayTicks,
    lockedUntilTick: 0,
  }
}

export function canSpendStamina(stamina: Stamina, cost: number): boolean {
  return Number.isFinite(cost) && cost >= 0 && stamina.current + 1e-9 >= cost
}

export function spendStamina(stamina: Stamina, cost: number, tick: number): boolean {
  if (!canSpendStamina(stamina, cost)) return false
  stamina.current = Math.max(0, stamina.current - cost)
  stamina.lockedUntilTick = Math.max(stamina.lockedUntilTick, tick + stamina.regenDelayTicks)
  return true
}

export function regenerateStamina(stamina: Stamina, tick: number): void {
  if (tick < stamina.lockedUntilTick || stamina.current >= stamina.max) return
  stamina.current = Math.min(stamina.max, stamina.current + stamina.regenPerTick)
}

export function staminaRatio(stamina: Stamina): number {
  if (stamina.max <= 0) return 0
  return Math.max(0, Math.min(1, stamina.current / stamina.max))
}
