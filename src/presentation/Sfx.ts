import type { AttackKind } from '../game/combat/Sword'

export class Sfx {
  private context?: AudioContext
  private noise?: AudioBuffer
  private lastHitAt = -Infinity

  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext()
      this.noise = this.createNoiseBuffer(this.context)
    }
    if (this.context.state === 'suspended') void this.context.resume()
  }

  sword(kind: AttackKind = 'slash'): void {
    const ctx = this.context
    if (!ctx) return

    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    const now = ctx.currentTime

    const profile =
      kind === 'stab'
        ? { type: 'triangle' as OscillatorType, start: 230, end: 74, peak: 0.042, duration: 0.075 }
        : kind === 'dash'
          ? { type: 'triangle' as OscillatorType, start: 520, end: 62, peak: 0.065, duration: 0.13 }
          : kind === 'whirlwind'
            ? { type: 'sawtooth' as OscillatorType, start: 640, end: 88, peak: 0.052, duration: 0.2 }
            : { type: 'sawtooth' as OscillatorType, start: 430, end: 92, peak: 0.04, duration: 0.12 }

    oscillator.type = profile.type
    oscillator.frequency.setValueAtTime(profile.start, now)
    oscillator.frequency.exponentialRampToValueAtTime(profile.end, now + profile.duration * 0.86)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(profile.peak, now + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration)

    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(now)
    oscillator.stop(now + profile.duration + 0.005)

    if (kind === 'dash') this.lowThump(54)
    if (kind === 'whirlwind') this.lowThump(64)
  }

  hit(weight: 'light' | 'heavy' | 'massacre'): void {
    const ctx = this.context
    const noise = this.noise
    if (!ctx || !noise) return

    const nowMs = performance.now()
    if (nowMs - this.lastHitAt < 42) return
    this.lastHitAt = nowMs

    const source = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    const now = ctx.currentTime

    source.buffer = noise
    filter.type = 'lowpass'
    filter.frequency.value = weight === 'massacre' ? 700 : weight === 'heavy' ? 1050 : 1450
    gain.gain.setValueAtTime(weight === 'massacre' ? 0.12 : weight === 'heavy' ? 0.085 : 0.055, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095)

    source.connect(filter).connect(gain).connect(ctx.destination)
    source.start(now)
    source.stop(now + 0.1)

    if (weight !== 'light') this.lowThump(weight === 'massacre' ? 58 : 72)
  }

  hurt(): void {
    const ctx = this.context
    if (!ctx) return
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    const now = ctx.currentTime
    oscillator.type = 'square'
    oscillator.frequency.setValueAtTime(110, now)
    oscillator.frequency.exponentialRampToValueAtTime(52, now + 0.11)
    gain.gain.setValueAtTime(0.055, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.125)
  }

  private lowThump(frequency: number): void {
    const ctx = this.context
    if (!ctx) return
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    const now = ctx.currentTime
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, now)
    oscillator.frequency.exponentialRampToValueAtTime(34, now + 0.08)
    gain.gain.setValueAtTime(0.05, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.095)
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.ceil(ctx.sampleRate * 0.12)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let value = 0x51f15e
    for (let i = 0; i < data.length; i += 1) {
      value ^= value << 13
      value ^= value >>> 17
      value ^= value << 5
      data[i] = ((value >>> 0) / 0xffffffff) * 2 - 1
    }
    return buffer
  }
}
