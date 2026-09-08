import Phaser from 'phaser'
import { BASE_SWORD } from '../combat/Sword'
import { ARENA_BOUNDS, GameState, activeEnemies, type InputState } from '../sim/GameState'
import { FixedTick } from '../sim/FixedTick'
import { GoreFx } from '../../presentation/GoreFx'

const WORLD_CX = 480
const WORLD_CY = 270

export class GameScene extends Phaser.Scene {
  private readonly fixed = new FixedTick()
  private state = new GameState(0xa11e1)
  private player!: Phaser.GameObjects.Container
  private sword!: Phaser.GameObjects.Rectangle
  private hpText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private killText!: Phaser.GameObjects.Text
  private zombieSprites: Phaser.GameObjects.Arc[] = []
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>
  private gore!: GoreFx
  private endedText?: Phaser.GameObjects.Text

  create(): void {
    this.createPlaceholderTextures()
    this.createArena()
    this.createPlayer()
    this.createEnemyRenderPool()
    this.createHud()
    this.gore = new GoreFx(this)

    const keyboard = this.input.keyboard
    if (!keyboard) throw new Error('Keyboard input unavailable')
    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
    keyboard.on('keydown-R', () => this.restartRun())
  }

  update(_time: number, delta: number): void {
    const input = this.readInput()
    this.fixed.advance(delta, () => {
      this.state.step(input)
      this.consumeEvents()
    })

    this.syncRenderState()
    this.gore.update()
  }

  private readInput(): InputState {
    return {
      x: Number(this.keys.right.isDown) - Number(this.keys.left.isDown),
      y: Number(this.keys.down.isDown) - Number(this.keys.up.isDown),
    }
  }

  private consumeEvents(): void {
    this.gore.process(this.state.events, WORLD_CX, WORLD_CY)

    for (const event of this.state.events) {
      if (event.type === 'sword-swing') {
        this.tweens.killTweensOf(this.sword)
        this.sword.setAlpha(1).setScale(1.1, 1.7)
        this.tweens.add({ targets: this.sword, scaleX: 1, scaleY: 1, duration: 80, ease: 'Quad.Out' })
      }
      if (event.type === 'enemy-hit') {
        this.cameras.main.shake(event.killed ? 45 : 20, event.killed ? 0.0022 : 0.001)
      }
      if (event.type === 'player-hit') {
        this.cameras.main.flash(70, 180, 20, 50, false)
      }
      if (event.type === 'run-ended') this.showRunEnded()
    }
  }

  private syncRenderState(): void {
    this.player.setPosition(WORLD_CX + this.state.player.x, WORLD_CY + this.state.player.y)
    this.player.setRotation(this.state.player.facing)
    this.hpText.setText(`HP ${'■'.repeat(Math.max(0, this.state.player.hp))}`)
    this.timerText.setText(`SURVIVE ${(this.state.tick / 60).toFixed(1)}s`)
    this.killText.setText(`KILLS ${this.state.kills}`)

    const enemies = activeEnemies(this.state)
    for (let i = 0; i < this.zombieSprites.length; i += 1) {
      const sprite = this.zombieSprites[i]
      const enemy = enemies[i]
      if (!enemy) {
        sprite.setVisible(false)
        continue
      }
      sprite.setVisible(true).setPosition(WORLD_CX + enemy.x, WORLD_CY + enemy.y)
    }
  }

  private createArena(): void {
    const graphics = this.add.graphics().setDepth(0)
    graphics.fillStyle(0x0e0913, 1)
    graphics.fillRect(0, 0, 960, 540)
    graphics.lineStyle(1, 0x2a1835, 0.7)
    for (let x = 0; x <= 960; x += 32) graphics.lineBetween(x, 0, x, 540)
    for (let y = 0; y <= 540; y += 32) graphics.lineBetween(0, y, 960, y)
    graphics.lineStyle(2, 0x5a1839, 0.55)
    graphics.strokeRect(
      WORLD_CX - ARENA_BOUNDS.halfWidth,
      WORLD_CY - ARENA_BOUNDS.halfHeight,
      ARENA_BOUNDS.halfWidth * 2,
      ARENA_BOUNDS.halfHeight * 2,
    )
  }

  private createPlayer(): void {
    const body = this.add.ellipse(0, 0, 42, 28, 0xe53d35).setStrokeStyle(2, 0x250c16)
    const head = this.add.circle(16, 0, 17, 0xf24c35).setStrokeStyle(2, 0x250c16)
    const leaf = this.add.triangle(18, -18, 0, 8, 12, 0, 0, 0, 0x77d14b)
    const bladeLength = BASE_SWORD.outerRadius - BASE_SWORD.innerRadius
    this.sword = this.add
      .rectangle(BASE_SWORD.innerRadius, 0, bladeLength, 7, 0xe7e5ef)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, 0x3b3345)
    this.player = this.add.container(WORLD_CX, WORLD_CY, [this.sword, body, head, leaf]).setDepth(10)
  }

  private createEnemyRenderPool(): void {
    for (let i = 0; i < 220; i += 1) {
      const zombie = this.add.circle(-9999, -9999, 12, i % 3 === 0 ? 0x75924d : 0x657b49).setStrokeStyle(2, 0x1d241c).setDepth(5)
      this.zombieSprites.push(zombie)
    }
  }

  private createHud(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'monospace', fontSize: '15px', color: '#f2e9ff' }
    this.hpText = this.add.text(16, 14, '', style).setDepth(100)
    this.timerText = this.add.text(480, 14, '', style).setOrigin(0.5, 0).setDepth(100)
    this.killText = this.add.text(944, 14, '', style).setOrigin(1, 0).setDepth(100)
    this.add.text(16, 510, 'WASD MOVE  •  AUTO-SLASH  •  R RESTART', { ...style, fontSize: '12px', color: '#a998b6' }).setDepth(100)
  }

  private createPlaceholderTextures(): void {
    // Reserved for real sprite sheets. Phase 1 intentionally uses primitives so
    // combat can be falsified before art-production cost is incurred.
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
    this.endedText?.destroy()
    this.endedText = undefined
  }
}
