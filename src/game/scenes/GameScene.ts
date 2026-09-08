import Phaser from 'phaser'
import { BASE_SWORD } from '../combat/Sword'
import { ARENA_BOUNDS, GameState, type InputState } from '../sim/GameState'
import { FixedTick } from '../sim/FixedTick'
import { GoreFx } from '../../presentation/GoreFx'
import { getImpactProfile } from '../../presentation/CombatFeel'
import { Sfx } from '../../presentation/Sfx'

const WORLD_CX = 480
const WORLD_CY = 270
const ENEMY_CAPACITY = 220

export class GameScene extends Phaser.Scene {
  private readonly fixed = new FixedTick()
  private readonly sfx = new Sfx()
  private state = new GameState(0xa11e1)
  private player!: Phaser.GameObjects.Container
  private sword!: Phaser.GameObjects.Rectangle
  private swordTrails: Phaser.GameObjects.Rectangle[] = []
  private hpText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private killText!: Phaser.GameObjects.Text
  private zombieSprites: Phaser.GameObjects.Image[] = []
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>
  private gore!: GoreFx
  private endedText?: Phaser.GameObjects.Text
  private hitStopMs = 0

  create(): void {
    this.createPlaceholderTextures()
    this.createArena()
    this.gore = new GoreFx(this)
    this.createPlayer()
    this.createEnemyRenderPool()
    this.createHud()

    const keyboard = this.input.keyboard
    if (!keyboard) throw new Error('Keyboard input unavailable')
    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
    keyboard.on('keydown', () => this.sfx.unlock())
    keyboard.on('keydown-R', () => this.restartRun())
    this.input.on('pointerdown', () => this.sfx.unlock())
  }

  update(_time: number, delta: number): void {
    if (this.hitStopMs > 0) {
      this.hitStopMs = Math.max(0, this.hitStopMs - delta)
      return
    }

    const input = this.readInput()
    this.fixed.advance(delta, () => {
      this.state.step(input)
      this.consumeEvents()
    })

    this.syncRenderState()
    this.gore.update(delta)
  }

  private readInput(): InputState {
    return {
      x: Number(this.keys.right.isDown) - Number(this.keys.left.isDown),
      y: Number(this.keys.down.isDown) - Number(this.keys.up.isDown),
    }
  }

  private consumeEvents(): void {
    const events = this.state.events
    this.gore.process(events, WORLD_CX, WORLD_CY)

    let hitCount = 0
    let killCount = 0
    for (const event of events) {
      if (event.type === 'enemy-hit') {
        hitCount += 1
        if (event.killed) killCount += 1
      }
    }

    const impact = getImpactProfile(hitCount, killCount)
    if (impact.hitStopMs > 0) {
      this.hitStopMs = Math.max(this.hitStopMs, impact.hitStopMs)
      this.cameras.main.shake(impact.shakeDurationMs, impact.shakeIntensity)
      if (impact.sfxWeight !== 'none') this.sfx.hit(impact.sfxWeight)
    }

    for (const event of events) {
      if (event.type === 'sword-swing') {
        this.animateSword()
        this.sfx.sword()
      }
      if (event.type === 'player-hit') {
        this.cameras.main.flash(90, 190, 18, 46, false)
        this.sfx.hurt()
      }
      if (event.type === 'run-ended') this.showRunEnded()
    }
  }

  private syncRenderState(): void {
    this.player.setPosition(WORLD_CX + this.state.player.x, WORLD_CY + this.state.player.y)
    this.player.setRotation(this.state.player.facing)
    this.player.setAlpha(this.state.player.invulnerableTicks > 0 && this.state.tick % 6 < 3 ? 0.42 : 1)
    this.hpText.setText(`HP ${'■'.repeat(Math.max(0, this.state.player.hp))}`)
    this.timerText.setText(`SURVIVE ${(this.state.tick / 60).toFixed(1)}s`)
    this.killText.setText(`KILLS ${this.state.kills}`)

    for (let i = 0; i < this.zombieSprites.length; i += 1) {
      const sprite = this.zombieSprites[i]
      const enemy = this.state.enemies.items[i]
      if (!enemy?.active) {
        sprite.setVisible(false)
        continue
      }
      const wobble = Math.sin((this.state.tick + enemy.id * 13) * 0.12) * 0.055
      sprite
        .setVisible(true)
        .setPosition(WORLD_CX + enemy.x, WORLD_CY + enemy.y)
        .setRotation(Math.atan2(enemy.vy, enemy.vx) + wobble)
        .setScale(enemy.radius / 12)
        .setTint(enemy.id % 5 === 0 ? 0x8cae5a : enemy.id % 3 === 0 ? 0x6f8950 : 0x7b9954)
    }
  }

  private createArena(): void {
    const graphics = this.add.graphics().setDepth(0)
    graphics.fillStyle(0x09070d, 1)
    graphics.fillRect(0, 0, 960, 540)
    graphics.fillStyle(0x120b18, 1)
    graphics.fillRect(
      WORLD_CX - ARENA_BOUNDS.halfWidth,
      WORLD_CY - ARENA_BOUNDS.halfHeight,
      ARENA_BOUNDS.halfWidth * 2,
      ARENA_BOUNDS.halfHeight * 2,
    )
    graphics.lineStyle(1, 0x2a1835, 0.42)
    for (let x = 0; x <= 960; x += 32) graphics.lineBetween(x, 0, x, 540)
    for (let y = 0; y <= 540; y += 32) graphics.lineBetween(0, y, 960, y)
    graphics.lineStyle(2, 0x7a204e, 0.72)
    graphics.strokeRect(
      WORLD_CX - ARENA_BOUNDS.halfWidth,
      WORLD_CY - ARENA_BOUNDS.halfHeight,
      ARENA_BOUNDS.halfWidth * 2,
      ARENA_BOUNDS.halfHeight * 2,
    )
  }

  private createPlayer(): void {
    const bladeLength = BASE_SWORD.outerRadius - BASE_SWORD.innerRadius
    const makeTrail = (angle: number, alpha: number) =>
      this.add
        .rectangle(BASE_SWORD.innerRadius, 0, bladeLength, 10, 0xff4f8d, alpha)
        .setOrigin(0, 0.5)
        .setRotation(angle)
        .setAlpha(0)

    this.swordTrails = [makeTrail(-0.42, 0.26), makeTrail(0.42, 0.18)]

    const body = this.add.ellipse(-5, 0, 44, 27, 0xc9333d).setStrokeStyle(3, 0x230811)
    const hind = this.add.ellipse(-24, 0, 18, 18, 0x9f2432).setStrokeStyle(2, 0x230811)
    const head = this.add.circle(17, 0, 18, 0xef4540).setStrokeStyle(3, 0x230811)
    const earTop = this.add.triangle(13, -16, 0, 12, 11, 0, 3, -9, 0x80202d).setStrokeStyle(2, 0x230811)
    const earBottom = this.add.triangle(13, 16, 0, -12, 11, 0, 3, 9, 0x80202d).setStrokeStyle(2, 0x230811)
    const muzzle = this.add.ellipse(29, 0, 15, 11, 0xf28b72).setStrokeStyle(2, 0x230811)
    const leaf = this.add.triangle(14, -22, 0, 9, 14, 1, 2, -2, 0x78cc57).setStrokeStyle(1, 0x183b18)
    this.sword = this.add
      .rectangle(BASE_SWORD.innerRadius, 0, bladeLength, 7, 0xeceaf3)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, 0x3b3345)

    this.player = this.add
      .container(WORLD_CX, WORLD_CY, [...this.swordTrails, hind, body, head, earTop, earBottom, muzzle, leaf, this.sword])
      .setDepth(10)
  }

  private animateSword(): void {
    this.tweens.killTweensOf(this.sword)
    for (const trail of this.swordTrails) this.tweens.killTweensOf(trail)

    this.sword.setAlpha(1).setScale(1.08, 1.75)
    this.tweens.add({ targets: this.sword, scaleX: 1, scaleY: 1, duration: 95, ease: 'Quad.Out' })

    for (let i = 0; i < this.swordTrails.length; i += 1) {
      const trail = this.swordTrails[i]
      trail.setAlpha(i === 0 ? 0.32 : 0.22).setScale(1.04, 1.2)
      this.tweens.add({ targets: trail, alpha: 0, scaleX: 1, scaleY: 1, duration: 115, ease: 'Quad.Out' })
    }
  }

  private createEnemyRenderPool(): void {
    for (let i = 0; i < ENEMY_CAPACITY; i += 1) {
      const zombie = this.add.image(-9999, -9999, 'zombie-placeholder').setVisible(false).setDepth(5)
      this.zombieSprites.push(zombie)
    }
  }

  private createHud(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'monospace', fontSize: '15px', color: '#f2e9ff' }
    this.hpText = this.add.text(16, 14, '', style).setDepth(100)
    this.timerText = this.add.text(480, 14, '', style).setOrigin(0.5, 0).setDepth(100)
    this.killText = this.add.text(944, 14, '', style).setOrigin(1, 0).setDepth(100)
    this.add.text(16, 510, 'WASD MOVE  •  AUTO-SLASH  •  R RESTART  •  SURVIVE', { ...style, fontSize: '12px', color: '#a998b6' }).setDepth(100)
  }

  private createPlaceholderTextures(): void {
    if (this.textures.exists('zombie-placeholder')) return
    const graphics = this.add.graphics()

    graphics.fillStyle(0x182018, 1)
    graphics.fillEllipse(14, 16, 20, 25)
    graphics.fillStyle(0x5f7445, 1)
    graphics.fillEllipse(15, 16, 17, 22)
    graphics.fillCircle(24, 16, 8)
    graphics.fillStyle(0x27351f, 1)
    graphics.fillRect(5, 5, 12, 4)
    graphics.fillRect(5, 23, 12, 4)
    graphics.fillStyle(0xa3bd62, 1)
    graphics.fillCircle(27, 13, 2)
    graphics.fillStyle(0x541928, 1)
    graphics.fillCircle(22, 21, 3)
    graphics.generateTexture('zombie-placeholder', 34, 32)
    graphics.destroy()
  }

  private showRunEnded(): void {
    if (this.endedText) return
    this.endedText = this.add
      .text(480, 270, `DOG DOWN\n${(this.state.tick / 60).toFixed(1)}s • ${this.state.kills} kills\n\nR TO RETRY`, {
        fontFamily: 'monospace',
        fontSize: '28px',
        align: 'center',
        color: '#fff3f8',
        backgroundColor: '#180a16dd',
        padding: { x: 24, y: 18 },
      })
      .setOrigin(0.5)
      .setDepth(200)
  }

  private restartRun(): void {
    this.state = new GameState(0xa11e1)
    this.hitStopMs = 0
    this.gore.resetTransient()
    this.endedText?.destroy()
    this.endedText = undefined
  }
}
