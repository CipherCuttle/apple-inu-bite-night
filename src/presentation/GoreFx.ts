import Phaser from 'phaser'
import { XorShift32 } from '../game/sim/RNG'
import type { SimEvent } from '../game/sim/GameState'
import { GoreBudget } from './GoreBudget'

interface Droplet {
  sprite: Phaser.GameObjects.Image
  vx: number
  vy: number
  lifeMs: number
}

interface Gib {
  sprite: Phaser.GameObjects.Image
  vx: number
  vy: number
  spin: number
  lifeMs: number
}

interface Decal {
  sprite: Phaser.GameObjects.Image
  lifeMs: number
}

const FRAME_MS = 1000 / 60
const DECAL_LIFE_MS = 30000
const LIMB_TEXTURES = ['zombie-part-arm-left', 'zombie-part-arm-right', 'zombie-part-leg-left', 'zombie-part-leg-right'] as const

export class GoreFx {
  private readonly budget = new GoreBudget(5, 12)
  private readonly droplets: Droplet[] = []
  private readonly gibs: Gib[] = []
  private readonly decals: Decal[] = []
  private dropletCursor = 0
  private gibCursor = 0
  private decalCursor = 0

  constructor(private readonly scene: Phaser.Scene) {
    this.createTextures()

    for (let i = 0; i < 180; i += 1) {
      const sprite = scene.add.image(-9999, -9999, 'blood-pixel').setVisible(false).setDepth(7)
      this.droplets.push({ sprite, vx: 0, vy: 0, lifeMs: 0 })
    }

    for (let i = 0; i < 96; i += 1) {
      const sprite = scene.add.image(-9999, -9999, 'gore-meat-1').setVisible(false).setDepth(8)
      this.gibs.push({ sprite, vx: 0, vy: 0, spin: 0, lifeMs: 0 })
    }

    for (let i = 0; i < 84; i += 1) {
      const sprite = scene.add.image(-9999, -9999, i % 2 === 0 ? 'gore-blood-trail-2' : 'gore-blood-trail-4').setVisible(false).setDepth(1)
      this.decals.push({ sprite, lifeMs: 0 })
    }
  }

  process(events: readonly SimEvent[], cameraX: number, cameraY: number): void {
    const frame = this.budget.select(events)
    for (const hit of frame.minor) {
      this.spawnSpray(hit, 4, cameraX, cameraY)
      if (hit.severedPart) this.spawnSeveredPart(hit, cameraX, cameraY)
      if (hit.attack === 'slash' || hit.attack === 'whirlwind') this.spawnDecal(hit, cameraX, cameraY, 0.5)
    }
    for (const hit of frame.major) {
      this.spawnSpray(hit, hit.attack === 'whirlwind' ? 13 : 10, cameraX, cameraY)
      const limbCount = hit.attack === 'slash' || hit.attack === 'whirlwind' ? 4 : hit.attack === 'dash' ? 3 : 2
      this.spawnDismemberment(hit, limbCount, cameraX, cameraY, true)
      this.spawnMeatBits(hit, hit.attack === 'stab' ? 2 : 3, cameraX, cameraY)
      this.spawnDecal(hit, cameraX, cameraY, 1)
    }
  }

  update(deltaMs: number): void {
    const frameScale = Math.min(2.5, deltaMs / FRAME_MS)

    for (const droplet of this.droplets) {
      if (droplet.lifeMs <= 0) continue
      droplet.lifeMs -= deltaMs
      droplet.vx *= Math.pow(0.91, frameScale)
      droplet.vy *= Math.pow(0.91, frameScale)
      droplet.sprite.x += droplet.vx * frameScale
      droplet.sprite.y += droplet.vy * frameScale
      droplet.sprite.alpha = Math.min(1, droplet.lifeMs / 130)
      if (droplet.lifeMs <= 0) droplet.sprite.setVisible(false)
    }

    for (const gib of this.gibs) {
      if (gib.lifeMs <= 0) continue
      gib.lifeMs -= deltaMs
      gib.vx *= Math.pow(0.95, frameScale)
      gib.vy *= Math.pow(0.95, frameScale)
      gib.sprite.x += gib.vx * frameScale
      gib.sprite.y += gib.vy * frameScale
      gib.sprite.rotation += gib.spin * frameScale
      gib.sprite.alpha = Math.min(1, gib.lifeMs / 650)
      if (gib.lifeMs <= 0) gib.sprite.setVisible(false)
    }

    for (const decal of this.decals) {
      if (decal.lifeMs <= 0) continue
      decal.lifeMs -= deltaMs
      if (decal.lifeMs < 7000) decal.sprite.alpha = Math.max(0, decal.lifeMs / 7000) * 0.78
      if (decal.lifeMs <= 0) decal.sprite.setVisible(false)
    }
  }

  resetTransient(): void {
    for (const droplet of this.droplets) {
      droplet.lifeMs = 0
      droplet.sprite.setVisible(false)
    }
    for (const gib of this.gibs) {
      gib.lifeMs = 0
      gib.sprite.setVisible(false)
    }
    for (const decal of this.decals) {
      decal.lifeMs = 0
      decal.sprite.setVisible(false)
    }
  }

  private spawnSpray(hit: Extract<SimEvent, { type: 'enemy-hit' }>, count: number, cameraX: number, cameraY: number): void {
    const rng = new XorShift32((hit.enemyId * 0x9e3779b1) ^ hit.tick)
    for (let i = 0; i < count; i += 1) {
      const droplet = this.droplets[this.dropletCursor]
      this.dropletCursor = (this.dropletCursor + 1) % this.droplets.length
      const angle = hit.facing + rng.range(-0.95, 0.95)
      const speed = rng.range(3, 8.4)
      droplet.vx = Math.cos(angle) * speed
      droplet.vy = Math.sin(angle) * speed
      droplet.lifeMs = rng.int(280, 600)
      droplet.sprite
        .setPosition(hit.x + cameraX, hit.y + cameraY)
        .setScale(rng.range(0.9, 2.5))
        .setAlpha(1)
        .setVisible(true)
    }
  }

  private spawnSeveredPart(
    hit: Extract<SimEvent, { type: 'enemy-hit' }>,
    cameraX: number,
    cameraY: number,
  ): void {
    const gib = this.gibs[this.gibCursor]
    this.gibCursor = (this.gibCursor + 1) % this.gibs.length
    const rng = new XorShift32((hit.enemyId * 0x7f4a7c15) ^ hit.tick)
    const texture = hit.severedPart === 'left-arm' ? 'zombie-part-arm-left' : 'zombie-part-arm-right'
    const angle = hit.facing + rng.range(-0.55, 0.55)
    const speed = rng.range(5.2, 8.4)
    gib.vx = Math.cos(angle) * speed
    gib.vy = Math.sin(angle) * speed
    gib.spin = rng.range(-0.38, 0.38)
    gib.lifeMs = rng.int(6500, 10500)
    gib.sprite
      .setTexture(texture)
      .setPosition(hit.x + cameraX, hit.y + cameraY)
      .setScale(rng.range(0.8, 1.08))
      .setRotation(rng.range(-Math.PI, Math.PI))
      .setAlpha(1)
      .setVisible(true)
  }

  private spawnDismemberment(
    hit: Extract<SimEvent, { type: 'enemy-hit' }>,
    count: number,
    cameraX: number,
    cameraY: number,
    includeHead: boolean,
  ): void {
    const rng = new XorShift32((hit.enemyId * 0x85ebca6b) ^ (hit.tick * 31) ^ 0x51a5)
    for (let i = 0; i < count; i += 1) {
      const gib = this.gibs[this.gibCursor]
      this.gibCursor = (this.gibCursor + 1) % this.gibs.length
      const angle = hit.facing + rng.range(-1.05, 1.05)
      const speed = rng.range(3.4, 8.2)
      const texture = includeHead && i === 0 ? 'zombie-part-torso-head' : LIMB_TEXTURES[(i + rng.int(0, LIMB_TEXTURES.length - 1)) % LIMB_TEXTURES.length]
      gib.vx = Math.cos(angle) * speed
      gib.vy = Math.sin(angle) * speed
      gib.spin = rng.range(-0.34, 0.34)
      gib.lifeMs = rng.int(includeHead ? 6500 : 4200, includeHead ? 11000 : 7600)
      gib.sprite
        .setTexture(texture)
        .setPosition(hit.x + cameraX + rng.range(-4, 4), hit.y + cameraY + rng.range(-4, 4))
        .setScale(rng.range(0.85, 1.25))
        .setRotation(rng.range(-Math.PI, Math.PI))
        .setAlpha(1)
        .setVisible(true)
    }
  }

  private spawnMeatBits(hit: Extract<SimEvent, { type: 'enemy-hit' }>, count: number, cameraX: number, cameraY: number): void {
    const rng = new XorShift32((hit.enemyId * 0x27d4eb2d) ^ (hit.tick * 17))
    for (let i = 0; i < count; i += 1) {
      const gib = this.gibs[this.gibCursor]
      this.gibCursor = (this.gibCursor + 1) % this.gibs.length
      const angle = hit.facing + rng.range(-1.35, 1.35)
      const speed = rng.range(2.5, 6.2)
      gib.vx = Math.cos(angle) * speed
      gib.vy = Math.sin(angle) * speed
      gib.spin = rng.range(-0.3, 0.3)
      gib.lifeMs = rng.int(2200, 4800)
      gib.sprite
        .setTexture(rng.next() < 0.34 ? 'gore-meat-7' : rng.next() < 0.5 ? 'gore-meat-12' : 'gore-meat-1')
        .setPosition(hit.x + cameraX, hit.y + cameraY)
        .setScale(rng.range(0.75, 1.35))
        .setRotation(rng.range(-Math.PI, Math.PI))
        .setAlpha(1)
        .setVisible(true)
    }
  }

  private spawnDecal(hit: Extract<SimEvent, { type: 'enemy-hit' }>, cameraX: number, cameraY: number, scaleMultiplier: number): void {
    const rng = new XorShift32((hit.enemyId * 0xc2b2ae35) ^ hit.tick)
    const decal = this.decals[this.decalCursor]
    this.decalCursor = (this.decalCursor + 1) % this.decals.length
    decal.lifeMs = DECAL_LIFE_MS
    decal.sprite
      .setTexture(rng.next() < 0.5 ? 'gore-blood-trail-2' : 'gore-blood-trail-4')
      .setPosition(hit.x + cameraX + rng.range(-5, 5), hit.y + cameraY + rng.range(-5, 5))
      .setScale(rng.range(0.7, 1.45) * scaleMultiplier)
      .setRotation(rng.range(-Math.PI, Math.PI))
      .setAlpha(0.78)
      .setVisible(true)
  }

  private createTextures(): void {
    if (this.scene.textures.exists('blood-pixel')) return

    const graphics = this.scene.add.graphics()
    graphics.fillStyle(0xd01432, 1)
    graphics.fillRect(0, 0, 3, 3)
    graphics.generateTexture('blood-pixel', 3, 3)
    graphics.clear()

    for (let variant = 0; variant < 3; variant += 1) {
      const rng = new XorShift32(0xb100d + variant * 97)
      graphics.fillStyle(variant === 1 ? 0x8d0d24 : 0xaa102b, 0.92)
      graphics.fillCircle(16, 16, 8 + variant * 2)
      for (let i = 0; i < 10; i += 1) {
        graphics.fillCircle(rng.int(2, 30), rng.int(2, 30), rng.int(1, 4))
      }
      graphics.generateTexture(`blood-splat-${variant}`, 32, 32)
      graphics.clear()
    }

    graphics.destroy()
  }
}
