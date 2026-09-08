import Phaser from 'phaser'
import { BASE_SWORD, type AttackKind } from '../combat/Sword'
import { DesktopCombatInput } from '../input/DesktopCombatInput'
import { ARENA_BOUNDS, GameState, type InputState } from '../sim/GameState'
import { FixedTick } from '../sim/FixedTick'
import { GoreFx } from '../../presentation/GoreFx'
import { getImpactProfile } from '../../presentation/CombatFeel'
import { Sfx } from '../../presentation/Sfx'

const WORLD_CX = 480
const WORLD_CY = 270
const WORLD_WIDTH = 960
const WORLD_HEIGHT = 540
const ENEMY_CAPACITY = 220

export class GameScene extends Phaser.Scene {
  private readonly fixed = new FixedTick()
  private readonly sfx = new Sfx()
  private state = new GameState(0xa11e1)
  private player!: Phaser.GameObjects.Container
  private headRig!: Phaser.GameObjects.Container
  private sword!: Phaser.GameObjects.Rectangle
  private swordTrails: Phaser.GameObjects.Rectangle[] = []
  private crosshair!: Phaser.GameObjects.Container
  private aimGuide!: Phaser.GameObjects.Graphics
  private inputText!: Phaser.GameObjects.Text
  private hpText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private killText!: Phaser.GameObjects.Text
  private zombieSprites: Phaser.GameObjects.Image[] = []
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>
  private desktopInput!: DesktopCombatInput
  private gore!: GoreFx
  private endedText?: Phaser.GameObjects.Text
  private hitStopMs = 0
  private queuedSlash = false
  private queuedStab = false

  create(): void {
    this.createPlaceholderTextures()
    this.createArena()
    this.gore = new GoreFx(this)
    this.createPlayer()
    this.createEnemyRenderPool()
    this.createCrosshair()
    this.createHud()

    this.desktopInput = new DesktopCombatInput(this.game.canvas, WORLD_WIDTH, WORLD_HEIGHT, () => this.sfx.unlock())

    const keyboard = this.input.keyboard
    if (!keyboard) throw new Error('Keyboard input unavailable')
    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    keyboard.on('keydown', () => this.sfx.unlock())
    keyboard.on('keydown-SPACE', () => {
      this.queuedSlash = true
    })
    keyboard.on('keydown-E', () => {
      this.queuedStab = true
    })
    keyboard.on('keydown-R', () => this.restartRun())

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.desktopInput.destroy()
    })
  }

  update(_time: number, delta: number): void {
    this.syncPointerPresentation()

    if (this.hitStopMs > 0) {
      this.hitStopMs = Math.max(0, this.hitStopMs - delta)
      return
    }

    this.fixed.advance(delta, () => {
      this.state.step(this.readInputForTick())
      this.consumeEvents()
    })

    this.syncRenderState()
    this.gore.update(delta)
  }

  private readInputForTick(): InputState {
    const pointer = this.desktopInput.snapshot()
    const mouseAttacks = this.desktopInput.consumeAttacks()
    const input: InputState = {
      x: Number(this.keys.right.isDown) - Number(this.keys.left.isDown),
      y: Number(this.keys.down.isDown) - Number(this.keys.up.isDown),
      slash: this.queuedSlash || mouseAttacks.slash,
      stab: this.queuedStab || mouseAttacks.stab,
    }

    if (pointer.active) {
      input.aimRadians = Math.atan2(pointer.y - (WORLD_CY + this.state.player.y), pointer.x - (WORLD_CX + this.state.player.x))
    }

    this.queuedSlash = false
    this.queuedStab = false
    return input
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
      if (event.type === 'sword-attack') {
        this.animateSword(event.attack)
        this.sfx.sword(event.attack)
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

  private syncPointerPresentation(): void {
    if (!this.desktopInput || !this.crosshair || !this.aimGuide || !this.inputText) return
    const pointer = this.desktopInput.snapshot()
    this.aimGuide.clear()

    if (!pointer.active) {
      this.crosshair.setVisible(false)
      this.inputText.setText('INPUT: MOVE MOUSE TO ARM CURSOR')
      return
    }

    const playerX = WORLD_CX + this.state.player.x
    const playerY = WORLD_CY + this.state.player.y
    const aimRadians = Math.atan2(pointer.y - playerY, pointer.x - playerX)
    const aimDegrees = Math.round((aimRadians * 180) / Math.PI)

    this.aimGuide.lineStyle(1, 0xff4f8d, 0.34)
    this.aimGuide.lineBetween(playerX, playerY, pointer.x, pointer.y)
    this.crosshair.setVisible(true).setPosition(pointer.x, pointer.y)
    this.inputText.setText(`INPUT: MOUSE ✓  AIM ${aimDegrees}°  LMB ${pointer.leftClicks}  RMB ${pointer.rightClicks}`)
  }

  private createArena(): void {
    const graphics = this.add.graphics().setDepth(0)
    graphics.fillStyle(0x09070d, 1)
    graphics.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    graphics.fillStyle(0x120b18, 1)
    graphics.fillRect(
      WORLD_CX - ARENA_BOUNDS.halfWidth,
      WORLD_CY - ARENA_BOUNDS.halfHeight,
      ARENA_BOUNDS.halfWidth * 2,
      ARENA_BOUNDS.halfHeight * 2,
    )
    graphics.lineStyle(1, 0x2a1835, 0.42)
    for (let x = 0; x <= WORLD_WIDTH; x += 32) graphics.lineBetween(x, 0, x, WORLD_HEIGHT)
    for (let y = 0; y <= WORLD_HEIGHT; y += 32) graphics.lineBetween(0, y, WORLD_WIDTH, y)
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
    const makeTrail = (angle: number) =>
      this.add
        .rectangle(BASE_SWORD.innerRadius, 0, bladeLength, 11, 0xff4f8d, 1)
        .setOrigin(0, 0.5)
        .setRotation(angle)
        .setAlpha(0)

    this.swordTrails = [makeTrail(-0.22), makeTrail(0.22)]

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

    this.headRig = this.add.container(0, 0, [...this.swordTrails, head, earTop, earBottom, muzzle, leaf, this.sword])
    this.player = this.add.container(WORLD_CX, WORLD_CY, [hind, body, this.headRig]).setDepth(10)
  }

  private animateSword(attack: AttackKind): void {
    this.tweens.killTweensOf(this.headRig)
    this.tweens.killTweensOf(this.sword)
    for (const trail of this.swordTrails) this.tweens.killTweensOf(trail)

    this.headRig.setPosition(0, 0).setRotation(0)
    this.sword.setPosition(BASE_SWORD.innerRadius, 0).setScale(1, 1).setAlpha(1)

    if (attack === 'slash') {
      this.headRig.setRotation(-0.58)
      this.sword.setScale(1.04, 1.38)
      for (let i = 0; i < this.swordTrails.length; i += 1) {
        this.swordTrails[i].setAlpha(i === 0 ? 0.36 : 0.24).setScale(1.03, 1.3)
      }
      this.tweens.add({
        targets: this.headRig,
        rotation: 0.48,
        duration: 92,
        ease: 'Cubic.Out',
        onComplete: () => {
          this.tweens.add({ targets: this.headRig, rotation: 0, duration: 65, ease: 'Quad.Out' })
        },
      })
    } else {
      this.headRig.setX(-4)
      this.sword.setX(BASE_SWORD.innerRadius - 5).setScale(1.12, 0.9)
      this.swordTrails[0].setRotation(0).setAlpha(0.42).setScale(1.3, 0.75)
      this.tweens.add({ targets: this.headRig, x: 12, duration: 58, yoyo: true, ease: 'Quad.Out' })
      this.tweens.add({ targets: this.sword, x: BASE_SWORD.innerRadius + 24, scaleX: 1.28, duration: 58, yoyo: true, ease: 'Quad.Out' })
    }

    this.tweens.add({ targets: this.sword, scaleY: 1, duration: 105, ease: 'Quad.Out' })
    for (const trail of this.swordTrails) {
      this.tweens.add({ targets: trail, alpha: 0, scaleX: 1, scaleY: 1, duration: 125, ease: 'Quad.Out' })
    }
  }

  private createCrosshair(): void {
    this.aimGuide = this.add.graphics().setDepth(140)
    const graphics = this.add.graphics()
    graphics.lineStyle(2, 0xf44f7f, 0.92)
    graphics.strokeCircle(0, 0, 8)
    graphics.lineBetween(-13, 0, -5, 0)
    graphics.lineBetween(5, 0, 13, 0)
    graphics.lineBetween(0, -13, 0, -5)
    graphics.lineBetween(0, 5, 0, 13)
    this.crosshair = this.add.container(0, 0, [graphics]).setDepth(150).setVisible(false)
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
    this.inputText = this.add.text(16, 486, 'INPUT: MOVE MOUSE TO ARM CURSOR', { ...style, fontSize: '12px', color: '#ff77a5' }).setDepth(160)
    this.add.text(16, 510, 'WASD MOVE  •  MOUSE AIM  •  LMB SLASH  •  RMB STAB  •  R RESTART', { ...style, fontSize: '12px', color: '#a998b6' }).setDepth(100)
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
    this.queuedSlash = false
    this.queuedStab = false
    this.desktopInput.consumeAttacks()
    this.gore.resetTransient()
    this.endedText?.destroy()
    this.endedText = undefined
  }
}
