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
      vx: 0,
      vy: 0,
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
    enemy.id = this.nextId++
    enemy.active = true
    enemy.x = playerX + Math.cos(angle) * radius
    enemy.y = playerY + Math.sin(angle) * radius
    enemy.hp = 1
    enemy.speed = rng.range(0.75, 1.15)
    enemy.radius = rng.range(10, 14)
    enemy.vx = 0
    enemy.vy = 0
    return enemy
  }

  kill(enemy: EnemyState): void {
    enemy.active = false
    enemy.vx = 0
    enemy.vy = 0
  }
}
