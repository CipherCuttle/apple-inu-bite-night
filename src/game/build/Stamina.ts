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
