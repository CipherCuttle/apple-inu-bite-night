import Phaser from 'phaser'
import { BASE_SWORD, type AttackKind } from '../combat/Sword'
import { DesktopCombatInput } from '../input/DesktopCombatInput'
import { KeyboardCombatBuffer } from '../input/KeyboardCombatBuffer'
import { ARENA_BOUNDS, GameState, type InputState, type PowerupKind, type SimEvent } from '../sim/GameState'
import { FixedTick } from '../sim/FixedTick'
import type { PropMaterial } from '../world/Props'
import { GoreFx } from '../../presentation/GoreFx'
import { getImpactProfile } from '../../presentation/CombatFeel'
import { Sfx } from '../../presentation/Sfx'

const WORLD_CX = 480
const WORLD_CY = 270
const WORLD_WIDTH = 960
const WORLD_HEIGHT = 540
const ENEMY_CAPACITY = 220
const SLASH_TRAIL_ANGLES = [-0.72, -0.36, 0, 0.36, 0.72]
const SWORD_MOUTH_X = 23
const SWORD_REST_ANGLE = -Math.PI * 0.42

export class GameScene extends Phaser.Scene {
  private readonly fixed = new FixedTick()
  private readonly sfx = new Sfx()
  private state = new GameState(0xa11e1)
  private player!: Phaser.GameObjects.Container
  private headRig!: Phaser.GameObjects.Container
  private sword!: Phaser.GameObjects.Image
  private swordTrails: Phaser.GameObjects.Rectangle[] = []
  private crosshair!: Phaser.GameObjects.Container
  private aimGuide!: Phaser.GameObjects.Graphics
  private inputText!: Phaser.GameObjects.Text
  private hpText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private killText!: Phaser.GameObjects.Text
  private comboText!: Phaser.GameObjects.Text
  private buffText!: Phaser.GameObjects.Text
  private flowBanner?: Phaser.GameObjects.Text
  private readonly keyboardCombat = new KeyboardCombatBuffer()
  private powerupSprites = new Map<number, Phaser.GameObjects.Container>()
  private zombieSprites: Phaser.GameObjects.Image[] = []
  private propSprites: Phaser.GameObjects.Container[] = []
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>
  private dashKey!: Phaser.Input.Keyboard.Key
  private stabKey!: Phaser.Input.Keyboard.Key
  private whirlwindKey!: Phaser.Input.Keyboard.Key
  private desktopInput!: DesktopCombatInput
  private gore!: GoreFx
  private endedText?: Phaser.GameObjects.Text
  private hitStopMs = 0

  preload(): void {
    this.load.image('apple-inu-sword', 'assets/characters/apple-inu/sword.png')
    this.load.svg('apple-inu-head', 'assets/characters/apple-inu/head.svg', { width: 48, height: 48 })
    this.load.image('zombie-walker', 'assets/enemies/zombies/walker.png')
    this.load.image('zombie-heavy', 'assets/enemies/zombies/heavy.png')
    this.load.image('zombie-heavy-missing-left-arm', 'assets/enemies/zombies/heavy-missing-left-arm.png')
    this.load.image('zombie-heavy-missing-right-arm', 'assets/enemies/zombies/heavy-missing-right-arm.png')
    this.load.image('zombie-part-arm-left', 'assets/enemies/zombies/parts/arm-left.png')
    this.load.image('zombie-part-arm-right', 'assets/enemies/zombies/parts/arm-right.png')
    this.load.image('zombie-part-leg-left', 'assets/enemies/zombies/parts/leg-left.png')
    this.load.image('zombie-part-leg-right', 'assets/enemies/zombies/parts/leg-right.png')
    this.load.image('zombie-part-torso-head', 'assets/enemies/zombies/parts/torso-head.png')
    this.load.image('gore-meat-1', 'assets/gore/gibs/meat-1.png')
    this.load.image('gore-meat-7', 'assets/gore/gibs/meat-7.png')
    this.load.image('gore-meat-12', 'assets/gore/gibs/meat-12.png')
    this.load.image('gore-blood-trail-2', 'assets/gore/decals/trail-2.png')
    this.load.image('gore-blood-trail-4', 'assets/gore/decals/trail-4.png')
  }

  create(): void {
    this.createArena()
    this.createPropRenderers()
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
    this.dashKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
    this.stabKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E)
    this.whirlwindKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q)

    keyboard.on('keydown', () => this.sfx.unlock())
    keyboard.on('keydown-SPACE', (event: KeyboardEvent) => { if (!event.repeat) this.keyboardCombat.queueSlash() })
    keyboard.on('keydown-E', (event: KeyboardEvent) => { if (!event.repeat) this.keyboardCombat.queueStab() })
    keyboard.on('keydown-Q', (event: KeyboardEvent) => { if (!event.repeat) this.keyboardCombat.queueWhirlwind() })
    keyboard.on('keyup-SHIFT', () => this.keyboardCombat.queueDashRelease())
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
    const keyAttacks = this.keyboardCombat.consume()
    const dashHeld = pointer.rightHeld || this.dashKey.isDown
    const dashReleaseEdge = keyAttacks.dashReleased || mouseAttacks.dashReleased
    const input: InputState = {
      x: Number(this.keys.right.isDown) - Number(this.keys.left.isDown),
      y: Number(this.keys.down.isDown) - Number(this.keys.up.isDown),
      slash: keyAttacks.slash || mouseAttacks.slash,
      stab: keyAttacks.stab,
      dashHeld,
      dashReleased: dashReleaseEdge && !dashHeld,
      whirlwind: keyAttacks.whirlwind,
    }

    if (pointer.active) {
      input.aimRadians = Math.atan2(pointer.y - (WORLD_CY + this.state.player.y), pointer.x - (WORLD_CX + this.state.player.x))
    }
    return input
  }

  private consumeEvents(): void {
    const events = this.state.events
    this.gore.process(events, WORLD_CX, WORLD_CY)

    let hitCount = 0
    let killCount = 0
    for (const event of events) {
      if (event.type === 'enemy-hit' || event.type === 'physics-impact') {
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
        this.animateSword(event)
        this.sfx.sword(event.attack)
      }
      if (event.type === 'dash-step') this.spawnDashAfterimage(event)
      if (event.type === 'physics-impact') this.spawnPhysicsImpact(event)
      if (event.type === 'prop-hit') {
        if (event.broken) this.spawnPropBurst(event)
        else this.cameras.main.shake(35, Math.min(0.0028, 0.0008 + event.force * 0.00008))
      }
      if (event.type === 'combo-tier') this.showComboTier(event)
      if (event.type === 'bullet-time') this.showBulletTime(event)
      if (event.type === 'powerup-drop') this.spawnPowerupRenderer(event.powerupId, event.kind, event.x, event.y)
      if (event.type === 'powerup-picked') this.showPowerupPickup(event.kind)
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
    this.killText.setText(`KILLS ${this.state.kills}  •  SCORE ${this.state.score}`)
    const multiplier = this.state.comboMultiplier()
    const comboWindow = this.state.comboTimeRemaining()
    this.comboText.setText(this.state.comboKills > 0 ? `CHAIN ${this.state.comboKills}  ×${multiplier}  CUT ${this.state.attackSpeedMultiplier().toFixed(2)}×  ${Math.ceil(comboWindow / 60)}s` : 'CHAIN —')
    const buffs: string[] = []
    if (this.state.bulletTimeTicksRemaining() > 0) buffs.push(`LAST CHANCE ${(this.state.bulletTimeTicksRemaining() / 60).toFixed(1)}s`)
    if (this.state.frenzyTicksRemaining() > 0) buffs.push(`FRENZY ${(this.state.frenzyTicksRemaining() / 60).toFixed(1)}s`)
    this.buffText.setText(buffs.join('  •  '))
    this.syncPowerupRenderers()

    for (let i = 0; i < this.zombieSprites.length; i += 1) {
      const sprite = this.zombieSprites[i]
      const enemy = this.state.enemies.items[i]
      if (!enemy?.active) {
        sprite.setVisible(false)
        continue
      }
      const impulseSpeed = Math.hypot(enemy.impulseX, enemy.impulseY)
      const wobble = Math.sin((this.state.tick + enemy.id * 13) * 0.12) * (0.055 + Math.min(0.12, impulseSpeed * 0.012))
      const texture =
        enemy.mass > 1.35
          ? enemy.severedArm === 'left'
            ? 'zombie-heavy-missing-left-arm'
            : enemy.severedArm === 'right'
              ? 'zombie-heavy-missing-right-arm'
              : 'zombie-heavy'
          : 'zombie-walker'
      sprite
        .setTexture(texture)
        .setVisible(true)
        .setPosition(WORLD_CX + enemy.x, WORLD_CY + enemy.y)
        .setRotation(Math.atan2(enemy.vy, enemy.vx) + wobble)
        .setScale(enemy.radius / 24)
        .clearTint()
    }

    for (let i = 0; i < this.propSprites.length; i += 1) {
      const sprite = this.propSprites[i]
      const prop = this.state.props[i]
      sprite
        .setVisible(prop.active)
        .setPosition(WORLD_CX + prop.x, WORLD_CY + prop.y)
        .setAlpha(prop.active ? 0.65 + 0.35 * Math.max(0, prop.hp / prop.maxHp) : 0)
    }
  }

  private syncPointerPresentation(): void {
    if (!this.desktopInput || !this.crosshair || !this.aimGuide || !this.inputText) return
    const pointer = this.desktopInput.snapshot()
    const charge = this.state.dashChargeRatio()
    this.aimGuide.clear()

    const playerX = WORLD_CX + this.state.player.x
    const playerY = WORLD_CY + this.state.player.y
    if (charge > 0) {
      this.aimGuide.lineStyle(4, 0xff4f8d, 0.82)
      this.aimGuide.beginPath()
      this.aimGuide.arc(playerX, playerY, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge)
      this.aimGuide.strokePath()
    }

    if (!pointer.active) {
      this.crosshair.setVisible(false)
      this.inputText.setText(`INPUT: MOVE MOUSE TO ARM CURSOR${charge > 0 ? `  •  CHARGE ${Math.round(charge * 100)}%` : ''}`)
      return
    }

    const aimRadians = Math.atan2(pointer.y - playerY, pointer.x - playerX)
    const aimDegrees = Math.round((aimRadians * 180) / Math.PI)
    const dashState = this.state.isDashing() ? `  •  DASH ${this.state.dashTicksRemaining()}t` : ''

    this.aimGuide.lineStyle(charge > 0 ? 2 : 1, 0xff4f8d, charge > 0 ? 0.72 : 0.34)
    this.aimGuide.lineBetween(playerX, playerY, pointer.x, pointer.y)
    this.crosshair.setVisible(true).setPosition(pointer.x, pointer.y)
    this.inputText.setText(
      `INPUT: MOUSE ✓  AIM ${aimDegrees}°  LMB ${pointer.leftClicks}  RMB ${pointer.rightPresses}/${pointer.rightReleases}${charge > 0 ? `  CHARGE ${Math.round(charge * 100)}%` : ''}${dashState}`,
    )
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
    graphics.fillStyle(0x16131c, 1)
    graphics.fillRect(70, 95, 820, 350)
    graphics.fillStyle(0x201b27, 1)
    graphics.fillRect(70, 95, 820, 38)
    graphics.fillRect(70, 407, 820, 38)
    graphics.fillStyle(0xb49855, 0.28)
    for (let x = 110; x < 860; x += 86) graphics.fillRect(x, 266, 42, 3)
    graphics.fillStyle(0xd8d2c8, 0.16)
    for (let i = 0; i < 6; i += 1) graphics.fillRect(150 + i * 18, 126, 9, 54)
    graphics.fillStyle(0x573046, 0.22)
    graphics.fillRect(725, 358, 120, 4)
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

  private createPropRenderers(): void {
    const colors: Record<PropMaterial, number> = {
      wood: 0x8c4f31,
      glass: 0x55d8eb,
      metal: 0x7c7f89,
    }
    const outlines: Record<PropMaterial, number> = {
      wood: 0x32170f,
      glass: 0xc1f5ff,
      metal: 0x242630,
    }

    for (const prop of this.state.props) {
      const alpha = prop.material === 'glass' ? 0.42 : 0.9
      const shadow = this.add.ellipse(2, 5, prop.radius * 2.1, prop.radius * 1.35, 0x000000, 0.32)
      const body = this.add.circle(0, 0, prop.radius, colors[prop.material], alpha).setStrokeStyle(2, outlines[prop.material], 0.95)
      const slash = this.add.rectangle(0, 0, prop.radius * 1.15, 3, outlines[prop.material], 0.65).setRotation(prop.id * 0.61)
      const container = this.add.container(WORLD_CX + prop.x, WORLD_CY + prop.y, [shadow, body, slash]).setDepth(3)
      this.propSprites.push(container)
    }
  }

  private createPlayer(): void {
    const bladeLength = BASE_SWORD.outerRadius - BASE_SWORD.innerRadius
    const dark = 0x17151b
    const fur = 0xf5f4ee
    const furHighlight = 0xffffff
    const furShade = 0xcfd3dc

    const makeTrail = (angle: number) =>
      this.add
        .rectangle(SWORD_MOUTH_X, 0, bladeLength, 9, 0xff4f8d, 1)
        .setOrigin(0, 0.5)
        .setRotation(SWORD_REST_ANGLE + angle)
        .setAlpha(0)

    this.swordTrails = SLASH_TRAIL_ANGLES.map(makeTrail)

    const shadow = this.add.ellipse(-5, 5, 43, 24, 0x000000, 0.25)
    const tail = this.add.ellipse(-25, -2, 16, 6, furShade).setStrokeStyle(2, dark).setRotation(-0.72)
    const hind = this.add.ellipse(-18, 0, 18, 18, fur).setStrokeStyle(2, dark)
    const body = this.add.ellipse(-3, 0, 36, 24, fur).setStrokeStyle(2, dark)
    const chest = this.add.ellipse(8, 0, 20, 18, furHighlight).setStrokeStyle(2, dark)
    const pawBackTop = this.add.ellipse(-15, -11, 11, 6, furShade).setStrokeStyle(1.5, dark).setRotation(-0.18)
    const pawBackBottom = this.add.ellipse(-15, 11, 11, 6, furShade).setStrokeStyle(1.5, dark).setRotation(0.18)
    const pawFrontTop = this.add.ellipse(4, -11, 12, 6, furHighlight).setStrokeStyle(1.5, dark).setRotation(-0.12)
    const pawFrontBottom = this.add.ellipse(4, 11, 12, 6, furHighlight).setStrokeStyle(1.5, dark).setRotation(0.12)

    const head = this.add.image(9, 0, 'apple-inu-head').setDisplaySize(42, 42)
    const mouthGap = this.add.ellipse(SWORD_MOUTH_X - 2, 0, 14, 8, dark, 0.95)
    const lowerJaw = this.add.ellipse(SWORD_MOUTH_X - 3, 4, 14, 6, furShade).setStrokeStyle(1.5, dark)
    this.sword = this.add
      .image(SWORD_MOUTH_X, 0, 'apple-inu-sword')
      .setOrigin(0.08, 0.5)
      .setRotation(SWORD_REST_ANGLE)
      .setScale(1.04)
    const upperJaw = this.add.ellipse(SWORD_MOUTH_X - 3, -4, 14, 6, furHighlight).setStrokeStyle(1.5, dark)
    const toothTop = this.add.triangle(SWORD_MOUTH_X, -1, 0, 0, 4, 0, 2, 4, 0xfefefe)
    const toothBottom = this.add.triangle(SWORD_MOUTH_X, 1, 0, 0, 4, 0, 2, -4, 0xe9e9e5)

    this.headRig = this.add.container(0, 0, [
      ...this.swordTrails,
      head,
      mouthGap,
      lowerJaw,
      this.sword,
      upperJaw,
      toothTop,
      toothBottom,
    ])
    this.player = this.add
      .container(WORLD_CX, WORLD_CY, [
        shadow,
        tail,
        pawBackTop,
        pawBackBottom,
        hind,
        body,
        chest,
        pawFrontTop,
        pawFrontBottom,
        this.headRig,
      ])
      .setDepth(10)
  }

  private animateSword(event: Extract<SimEvent, { type: 'sword-attack' }>): void {
    const attack: AttackKind = event.attack
    this.tweens.killTweensOf(this.headRig)
    this.tweens.killTweensOf(this.sword)
    for (const trail of this.swordTrails) this.tweens.killTweensOf(trail)

    this.headRig.setPosition(0, 0).setRotation(0)
    this.sword
      .setPosition(SWORD_MOUTH_X, 0)
      .setRotation(SWORD_REST_ANGLE)
      .setScale(1.04, 1.04)
      .setAlpha(1)
    for (let i = 0; i < this.swordTrails.length; i += 1) {
      this.swordTrails[i]
        .setRotation(SWORD_REST_ANGLE + SLASH_TRAIL_ANGLES[i])
        .setAlpha(0)
        .setScale(1, 1)
    }

    if (attack === 'slash') {
      // Head-led sweep: the blade stays clenched sideways while the full head rig whips through the arc.
      this.headRig.setPosition(-3, -2).setRotation(-1.35)
      this.sword.setScale(1.09, 1.34)
      for (let i = 0; i < this.swordTrails.length; i += 1) {
        const distanceFromCenter = Math.abs(i - (this.swordTrails.length - 1) / 2)
        this.swordTrails[i].setAlpha(0.5 - distanceFromCenter * 0.075).setScale(1.08, 1.28)
      }
      this.tweens.add({
        targets: this.headRig,
        x: 5,
        y: 2,
        rotation: 1.55,
        duration: 150,
        ease: 'Cubic.Out',
        onComplete: () => {
          this.tweens.add({ targets: this.headRig, x: 0, y: 0, rotation: 0, duration: 72, ease: 'Quad.Out' })
        },
      })
    } else if (attack === 'stab') {
      this.headRig.setX(-4)
      this.sword.setScale(1.12, 0.92)
      this.swordTrails[2].setRotation(-0.12).setAlpha(0.4).setScale(1.3, 0.72)
      this.tweens.add({ targets: this.headRig, x: 11, duration: 56, yoyo: true, ease: 'Quad.Out' })
      this.tweens.add({
        targets: this.sword,
        x: SWORD_MOUTH_X + 21,
        rotation: -0.12,
        scaleX: 1.25,
        duration: 56,
        yoyo: true,
        ease: 'Quad.Out',
        onComplete: () => this.sword.setPosition(SWORD_MOUTH_X, 0).setRotation(SWORD_REST_ANGLE),
      })
    } else if (attack === 'dash') {
      const power = event.power ?? 0
      this.headRig.setX(-8)
      this.sword.setScale(1.18 + power * 0.18, 0.86)
      this.swordTrails[2].setRotation(-0.34).setAlpha(0.58).setScale(1.55 + power * 0.48, 0.62)
      this.tweens.add({ targets: this.headRig, x: 20, duration: 70, yoyo: true, ease: 'Expo.Out' })
      this.tweens.add({
        targets: this.sword,
        x: SWORD_MOUTH_X + 28,
        rotation: -0.34,
        duration: 70,
        yoyo: true,
        ease: 'Expo.Out',
        onComplete: () => this.sword.setPosition(SWORD_MOUTH_X, 0).setRotation(SWORD_REST_ANGLE),
      })
    } else if (attack === 'whirlwind') {
      this.sword.setScale(1.1, 1.22)
      for (let i = 0; i < this.swordTrails.length; i += 1) {
        this.swordTrails[i]
          .setRotation(SWORD_REST_ANGLE + (i / this.swordTrails.length) * Math.PI * 2)
          .setAlpha(0.3)
          .setScale(1.1, 1.2)
      }
      this.tweens.add({
        targets: this.headRig,
        rotation: Math.PI * 2.15,
        duration: 300,
        ease: 'Cubic.Out',
        onComplete: () => this.headRig.setRotation(0),
      })
    }

    this.tweens.add({ targets: this.sword, scaleY: 1.04, duration: attack === 'whirlwind' ? 255 : 118, ease: 'Quad.Out' })
    for (const trail of this.swordTrails) {
      this.tweens.add({ targets: trail, alpha: 0, scaleX: 1, scaleY: 1, duration: attack === 'whirlwind' ? 295 : 175, ease: 'Quad.Out' })
    }
  }

  private spawnDashAfterimage(event: Extract<SimEvent, { type: 'dash-step' }>): void {
    const body = this.add.ellipse(-4, 0, 30, 18, 0xff4f8d, 0.1)
    const blade = this.add.rectangle(15, 0, 72, 4, 0xffb6cf, 0.16).setOrigin(0, 0.5)
    const ghost = this.add
      .container(WORLD_CX + event.x, WORLD_CY + event.y, [body, blade])
      .setRotation(event.facing)
      .setDepth(8)
      .setAlpha(0.42 + event.power * 0.18)
    this.tweens.add({ targets: ghost, alpha: 0, scaleX: 0.88, scaleY: 0.88, duration: 115, ease: 'Quad.Out', onComplete: () => ghost.destroy() })
  }

  private spawnPhysicsImpact(event: Extract<SimEvent, { type: 'physics-impact' }>): void {
    const color = event.kind === 'wall' ? 0xffd37c : event.kind === 'enemy' ? 0xff4f8d : 0xa7e8ff
    const ring = this.add.circle(WORLD_CX + event.x, WORLD_CY + event.y, 7, 0x000000, 0).setStrokeStyle(2, color, 0.75).setDepth(30)
    this.tweens.add({ targets: ring, scale: 1.8 + Math.min(1.6, event.force * 0.08), alpha: 0, duration: 125, ease: 'Quad.Out', onComplete: () => ring.destroy() })
    if (event.kind === 'wall') this.cameras.main.shake(55, Math.min(0.0045, 0.0012 + event.force * 0.00012))
  }

  private spawnPropBurst(event: Extract<SimEvent, { type: 'prop-hit' }>): void {
    const color = event.material === 'glass' ? 0x8fefff : event.material === 'metal' ? 0xb8bac2 : 0xb76b3f
    const count = event.material === 'glass' ? 10 : event.material === 'wood' ? 7 : 5
    for (let i = 0; i < count; i += 1) {
      const angle = (event.propId * 1.73 + i * 2.39) % (Math.PI * 2)
      const distance = 18 + ((event.propId * 7 + i * 11) % 22)
      const shard = this.add
        .rectangle(WORLD_CX + event.x, WORLD_CY + event.y, event.material === 'glass' ? 4 : 6, event.material === 'glass' ? 2 : 4, color, 0.9)
        .setRotation(angle)
        .setDepth(28)
      this.tweens.add({
        targets: shard,
        x: shard.x + Math.cos(angle) * distance,
        y: shard.y + Math.sin(angle) * distance,
        rotation: angle + 2.2,
        alpha: 0,
        duration: 230,
        ease: 'Cubic.Out',
        onComplete: () => shard.destroy(),
      })
    }
    this.cameras.main.shake(70, event.material === 'glass' ? 0.0025 : 0.0035)
    this.sfx.hit(event.material === 'metal' ? 'heavy' : 'light')
  }

  private powerupColor(_kind: PowerupKind): number {
    return 0xffd35a
  }

  private spawnPowerupRenderer(id: number, kind: PowerupKind, x: number, y: number): void {
    if (this.powerupSprites.has(id)) return
    const color = this.powerupColor(kind)
    const glow = this.add.circle(0, 0, 14, color, 0.16)
    const core = this.add.rectangle(0, 0, 13, 13, color, 0.95).setRotation(Math.PI / 4).setStrokeStyle(2, 0xffffff, 0.8)
    const label = this.add.text(0, 18, 'LAST BITE', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#ffffff',
    }).setOrigin(0.5)
    const container = this.add.container(WORLD_CX + x, WORLD_CY + y, [glow, core, label]).setDepth(35)
    this.powerupSprites.set(id, container)
    this.tweens.add({ targets: core, rotation: Math.PI / 4 + Math.PI * 2, duration: 1100, repeat: -1 })
    this.tweens.add({ targets: glow, scale: 1.35, alpha: 0.05, duration: 520, yoyo: true, repeat: -1 })
  }

  private syncPowerupRenderers(): void {
    for (const powerup of this.state.powerups) {
      const existing = this.powerupSprites.get(powerup.id)
      if (!powerup.active) {
        if (existing) { existing.destroy(true); this.powerupSprites.delete(powerup.id) }
        continue
      }
      if (!existing) this.spawnPowerupRenderer(powerup.id, powerup.kind, powerup.x, powerup.y)
      this.powerupSprites.get(powerup.id)?.setPosition(WORLD_CX + powerup.x, WORLD_CY + powerup.y)
    }
  }

  private showComboTier(event: Extract<SimEvent, { type: 'combo-tier' }>): void {
    const text = this.add.text(480, 112, `×${event.multiplier} CHAIN  •  CUT ${event.attackSpeed.toFixed(2)}×`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#ff77a5', backgroundColor: '#120812cc', padding: { x: 10, y: 6 },
    }).setOrigin(0.5).setDepth(210).setScale(0.7)
    this.tweens.add({ targets: text, scale: 1.05, alpha: 0, y: 92, duration: 720, ease: 'Back.Out', onComplete: () => text.destroy() })
  }

  private showBulletTime(_event: Extract<SimEvent, { type: 'bullet-time' }>): void {
    this.flowBanner?.destroy()
    this.flowBanner = this.add.text(480, 150, 'LAST CHANCE // BULLET TIME', {
      fontFamily: 'monospace', fontSize: '28px', color: '#d9fbff', backgroundColor: '#08131bdd', padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setDepth(220)
    this.cameras.main.flash(70, 90, 220, 255, false)
    this.tweens.add({ targets: this.flowBanner, alpha: 0, scale: 1.22, duration: 560, ease: 'Quad.Out', onComplete: () => { this.flowBanner?.destroy(); this.flowBanner = undefined } })
  }

  private showPowerupPickup(_kind: PowerupKind): void {
    const label = 'LAST BITE // SAVED'
    const text = this.add.text(480, 190, label, { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' }).setOrigin(0.5).setDepth(215)
    this.tweens.add({ targets: text, y: 172, alpha: 0, duration: 650, onComplete: () => text.destroy() })
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
      const zombie = this.add.image(-9999, -9999, 'zombie-walker').setVisible(false).setDepth(5)
      this.zombieSprites.push(zombie)
    }
  }

  private createHud(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'monospace', fontSize: '15px', color: '#f2e9ff' }
    this.hpText = this.add.text(16, 14, '', style).setDepth(100)
    this.timerText = this.add.text(480, 14, '', style).setOrigin(0.5, 0).setDepth(100)
    this.killText = this.add.text(944, 14, '', style).setOrigin(1, 0).setDepth(100)
    this.comboText = this.add.text(480, 38, 'CHAIN —', { ...style, fontSize: '14px', color: '#ff77a5' }).setOrigin(0.5, 0).setDepth(105)
    this.buffText = this.add.text(480, 60, '', { ...style, fontSize: '12px', color: '#8fefff' }).setOrigin(0.5, 0).setDepth(105)
    this.inputText = this.add.text(16, 478, 'INPUT: MOVE MOUSE TO ARM CURSOR', { ...style, fontSize: '12px', color: '#ff77a5' }).setDepth(160)
    this.add
      .text(16, 505, 'WASD MOVE • LMB WIDE SLASH • HOLD RMB / SHIFT CHARGE → RELEASE DASH • Q WHIRLWIND • E STAB • R RESTART', {
        ...style,
        fontSize: '11px',
        color: '#a998b6',
      })
      .setDepth(100)
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
    this.keyboardCombat.clear()
    this.desktopInput.clearAttackBuffers()
    this.gore.resetTransient()
    for (const sprite of this.powerupSprites.values()) sprite.destroy(true)
    this.powerupSprites.clear()
    this.flowBanner?.destroy()
    this.flowBanner = undefined
    this.endedText?.destroy()
    this.endedText = undefined
  }
}
