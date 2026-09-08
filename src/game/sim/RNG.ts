export class XorShift32 {
  private state: number

  constructor(seed: number) {
    this.state = seed | 0
    if (this.state === 0) this.state = 0x6d2b79f5
  }

  nextU32(): number {
    let x = this.state | 0
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.state = x | 0
    return x >>> 0
  }

  next(): number {
    return this.nextU32() / 0x1_0000_0000
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1))
  }

  snapshot(): number {
    return this.state >>> 0
  }
}
