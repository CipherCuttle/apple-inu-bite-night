export interface DodgeProfile {
  staminaCost: number
  distance: number
  travelTicks: number
  recoveryTicks: number
  iframeStartTick: number
  iframeEndTick: number
}

export interface DodgeState {
  facing: number
  elapsedTicks: number
  totalTicks: number
  travelTicks: number
  stepX: number
  stepY: number
  blocked: boolean
  invulnerableThisTick: boolean
}

export function createDodgeState(profile: DodgeProfile, facing: number): DodgeState {
  if (profile.travelTicks <= 0) throw new Error('Dodge travelTicks must be positive')
  if (profile.recoveryTicks < 0) throw new Error('Dodge recoveryTicks cannot be negative')
  if (profile.iframeStartTick < 1 || profile.iframeEndTick < profile.iframeStartTick || profile.iframeEndTick > profile.travelTicks + profile.recoveryTicks) {
    throw new Error('Dodge iframe window is invalid')
  }

  return {
    facing,
    elapsedTicks: 0,
    totalTicks: profile.travelTicks + profile.recoveryTicks,
    travelTicks: profile.travelTicks,
    stepX: Math.cos(facing) * (profile.distance / profile.travelTicks),
    stepY: Math.sin(facing) * (profile.distance / profile.travelTicks),
    blocked: false,
    invulnerableThisTick: false,
  }
}

export function dodgeIsInvulnerable(state: DodgeState, profile: DodgeProfile): boolean {
  const activeTick = state.elapsedTicks + 1
  return activeTick >= profile.iframeStartTick && activeTick <= profile.iframeEndTick
}

export function dodgeHasTravel(state: DodgeState): boolean {
  return !state.blocked && state.elapsedTicks < state.travelTicks
}
