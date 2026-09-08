import Phaser from 'phaser'
import { XorShift32 } from '../game/sim/RNG'
import type { SimEvent } from '../game/sim/GameState'
import { GoreBudget } from './GoreBudget'

interface Droplet {
  sprite: Phaser.GameObjects.Image
  vx: number
  vy: number
  life: number
}

export class GoreFx {
  private readonly budget = new GoreBudget()
  private readonly droplets: Droplet[] = []
  private cursor = 0

  constructor(private readonly scene: Phaser.Scene) {
    if (!scene.textures.exists('blood-pixel')) {
      const graphics = scene.add.graphics()
      graphics.fillStyle(0xb4132f, 1)
      graphics.fillRect(0, 0, 3, 3)
      graphics.generateTexture('blood-pixel', 3, 3)
      graphics.destroy()
    }

    for (let i = 0; i < 160; i += 1) {
      const sprite = scene.add.image(-9999, -9999, 'blood-pixel').setVisible(false).setDepth(7)
      this.droplets.push({ sprite, vx: 0, vy: 0, life: 0 })
    }
  }

  process(events: readonly SimEvent[], cameraX: number, cameraY: number): void {
    const frame = this.budget.select(events)
    for (const hit of frame.minor) this.spawn(hit, 3, cameraX, cameraY)
    for (const hit of frame.major) this.spawn(hit, 8, cameraX, cameraY)
  }

  update(): void {
    for (const droplet of this.droplets) {
      if (droplet.life <= 0) continue
      droplet.life -= 1
      droplet.vx *= 0.93
      droplet.vy *= 0.93
      droplet.sprite.x += droplet.vx
      droplet.sprite.y += droplet.vy
      droplet.sprite.alpha = Math.min(1, droplet.life / 12)
      if (droplet.life <= 0) droplet.sprite.setVisible(false)
    }
  }

  private spawn(hit: Extract<SimEvent, { type: 'enemy-hit' }>, count: number, cameraX: number, cameraY: number): void {
    const rng = new XorShift32((hit.enemyId * 0x9e3779b1) ^ hit.tick)
    for (let i = 0; i < count; i += 1) {
      const droplet = this.droplets[this.cursor]
      this.cursor = (this.cursor + 1) % this.droplets.length
      const angle = hit.facing + rng.range(-0.9, 0.9)
      const speed = rng.range(1.5, 5.2)
      droplet.vx = Math.cos(angle) * speed
      droplet.vy = Math.sin(angle) * speed
      droplet.life = rng.int(18, 36)
      droplet.sprite
        .setPosition(hit.x + cameraX, hit.y + cameraY)
        .setScale(rng.range(0.8, 1.8))
        .setAlpha(1)
        .setVisible(true)
    }
  }
}
