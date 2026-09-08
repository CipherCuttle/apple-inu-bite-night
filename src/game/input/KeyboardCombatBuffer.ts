export interface BufferedCombatKeys { slash: boolean; stab: boolean; whirlwind: boolean; dashReleased: boolean; dodge: boolean }

const ATTACK_BUFFER_TICKS = 10
const WHIRLWIND_BUFFER_TICKS = 12
const DASH_RELEASE_BUFFER_TICKS = 12
const DODGE_BUFFER_TICKS = 8

export class KeyboardCombatBuffer {
  private slashTicks = 0
  private stabTicks = 0
  private whirlwindTicks = 0
  private dashReleaseTicks = 0
  private dodgeTicks = 0
  queueSlash(): void { this.slashTicks = ATTACK_BUFFER_TICKS }
  queueStab(): void { this.stabTicks = ATTACK_BUFFER_TICKS }
  queueWhirlwind(): void { this.whirlwindTicks = WHIRLWIND_BUFFER_TICKS }
  queueDashRelease(): void { this.dashReleaseTicks = DASH_RELEASE_BUFFER_TICKS }
  queueDodge(): void { this.dodgeTicks = DODGE_BUFFER_TICKS }
  consume(): BufferedCombatKeys {
    const value = {
      slash: this.slashTicks > 0,
      stab: this.stabTicks > 0,
      whirlwind: this.whirlwindTicks > 0,
      dashReleased: this.dashReleaseTicks > 0,
      dodge: this.dodgeTicks > 0,
    }
    if (this.slashTicks > 0) this.slashTicks -= 1
    if (this.stabTicks > 0) this.stabTicks -= 1
    if (this.whirlwindTicks > 0) this.whirlwindTicks -= 1
    if (this.dashReleaseTicks > 0) this.dashReleaseTicks -= 1
    if (this.dodgeTicks > 0) this.dodgeTicks -= 1
    return value
  }
  clear(): void {
    this.slashTicks = 0
    this.stabTicks = 0
    this.whirlwindTicks = 0
    this.dashReleaseTicks = 0
    this.dodgeTicks = 0
  }
}
