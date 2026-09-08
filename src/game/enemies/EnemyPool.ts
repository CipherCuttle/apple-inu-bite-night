import type { XorShift32 } from '../sim/RNG'
import type { EnemyState } from './Enemy'

export class EnemyPool {
  readonly items: EnemyState[]
  private nextId = 1

  constructor(capacity: number) {
    this.items = Array.from({ length: capacity }, () => ({
      id: 0,
      active: false,
      x: 0,
      y: 0,
      hp: 1,
      speed: 0,
      radius: 12,
      mass: 1,
      vx: 0,
      vy: 0,
      impulseX: 0,
      impulseY: 0,
      staggerTicks: 0,
    }))
  }

  activeCount(): number {
    let count = 0
    for (const item of this.items) if (item.active) count += 1
    return count
  }

  spawnAround(playerX: number, playerY: number, rng: XorShift32, radiusMin = 300, radiusMax = 480): EnemyState | null {
    const enemy = this.items.find((item) => !item.active)
    if (!enemy) return null

    const angle = rng.range(-Math.PI, Math.PI)
    const radius = rng.range(radiusMin, radiusMax)
    const heavy = rng.next() < 0.22
    enemy.id = this.nextId++
    enemy.active = true
    enemy.x = playerX + Math.cos(angle) * radius
    enemy.y = playerY + Math.sin(angle) * radius
    enemy.hp = heavy ? 2 : 1
    enemy.speed = heavy ? rng.range(0.62, 0.9) : rng.range(0.8, 1.2)
    enemy.radius = heavy ? rng.range(13, 16) : rng.range(10, 13)
    enemy.mass = heavy ? rng.range(1.45, 1.8) : rng.range(0.85, 1.15)
    enemy.vx = 0
    enemy.vy = 0
    enemy.impulseX = 0
    enemy.impulseY = 0
    enemy.staggerTicks = 0
    return enemy
  }

  kill(enemy: EnemyState): void {
    enemy.active = false
    enemy.vx = 0
    enemy.vy = 0
    enemy.impulseX = 0
    enemy.impulseY = 0
    enemy.staggerTicks = 0
  }
}
