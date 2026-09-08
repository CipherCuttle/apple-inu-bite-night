export const SIM_HZ = 60
export const STEP_MS = 1000 / SIM_HZ

export class FixedTick {
  private accumulatorMs = 0

  advance(deltaMs: number, step: () => void): number {
    this.accumulatorMs += Math.min(deltaMs, 250)
    let steps = 0

    while (this.accumulatorMs >= STEP_MS && steps < 8) {
      step()
      this.accumulatorMs -= STEP_MS
      steps += 1
    }

    if (steps === 8 && this.accumulatorMs >= STEP_MS) {
      this.accumulatorMs = 0
    }

    return steps
  }
}
