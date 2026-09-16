import Phaser from 'phaser'
import { BASE_SWORD } from '../combat/Sword'
import { GameScene } from './GameScene'

const BEAN_ON_INK_AVATAR_KEY = 'bean-on-ink-avatar'
const BEAN_ON_INK_AVATAR_URL = 'https://pbs.twimg.com/profile_images/2099926388161622016/UPXfsSam_reasonably_small.jpg'
const SWORD_MOUTH_X = 23
const SWORD_REST_ANGLE = -Math.PI * 0.42
const SLASH_TRAIL_ANGLES = [-0.72, -0.36, 0, 0.36, 0.72]

type PlayerPresentationInternals = {
  player: Phaser.GameObjects.Container
  headRig: Phaser.GameObjects.Container
  sword: Phaser.GameObjects.Image
  swordTrails: Phaser.GameObjects.Rectangle[]
}

/**
 * Presentation-only resurrection skin for the pre-HLW combat game.
 *
 * The inherited GameScene remains authoritative for simulation, combat,
 * stamina, dodge i-frames, enemies, scoring, gore, fixed-tick timing and
 * determinism. This class only replaces the visible player rig after the
 * base scene has created it.
 */
export class BeanGameScene extends GameScene {
  preload(): void {
    super.preload()
    this.load.image(BEAN_ON_INK_AVATAR_KEY, BEAN_ON_INK_AVATAR_URL)
  }

  create(): void {
    super.create()
    this.installBeanPresentation()
  }

  private installBeanPresentation(): void {
    const internals = this as unknown as PlayerPresentationInternals
    const player = internals.player

    // Destroy only the old Apple Inu presentation children. The player
    // container itself is retained so the inherited simulation/render sync
    // keeps driving position, facing, alpha and attack animation correctly.
    player.removeAll(true)

    const bladeLength = BASE_SWORD.outerRadius - BASE_SWORD.innerRadius
    const ink = 0x111318
    const beanGreen = 0x48d38a
    const beanLight = 0x91f0b7
    const beanDark = 0x1e8f5e

    const makeTrail = (angle: number) =>
      this.add
        .rectangle(SWORD_MOUTH_X, 0, bladeLength, 9, 0x6cff9f, 1)
        .setOrigin(0, 0.5)
        .setRotation(SWORD_REST_ANGLE + angle)
        .setAlpha(0)

    const swordTrails = SLASH_TRAIL_ANGLES.map(makeTrail)
    const shadow = this.add.ellipse(-2, 7, 47, 23, 0x000000, 0.3)
    const backFoot = this.add.ellipse(-11, 18, 12, 7, beanDark).setStrokeStyle(2, ink).setRotation(0.2)
    const frontFoot = this.add.ellipse(10, 18, 12, 7, beanDark).setStrokeStyle(2, ink).setRotation(-0.2)
    const bodyPlate = this.add.ellipse(-1, 0, 48, 50, beanGreen, 1).setStrokeStyle(3, ink)
    const highlight = this.add.ellipse(-9, -8, 15, 23, beanLight, 0.34).setRotation(-0.32)

    const faceObjects: Phaser.GameObjects.GameObject[] = []
    if (this.textures.exists(BEAN_ON_INK_AVATAR_KEY)) {
      const avatar = this.add.image(-1, 0, BEAN_ON_INK_AVATAR_KEY).setDisplaySize(44, 44)
      faceObjects.push(avatar)
    } else {
      // Network/CDN failures must not make the fighter unplayable. This is a
      // deliberately simple fallback until approved Bean art is vendored.
      const leftEye = this.add.circle(-8, -5, 2.6, ink)
      const rightEye = this.add.circle(7, -5, 2.6, ink)
      const mouth = this.add.arc(0, 2, 9, 18, 162, false, ink, 1).setStrokeStyle(2, ink)
      const label = this.add.text(0, -19, 'BEAN', {
        fontFamily: 'monospace',
        fontSize: '7px',
        fontStyle: 'bold',
        color: '#0f1713',
      }).setOrigin(0.5)
      faceObjects.push(leftEye, rightEye, mouth, label)
    }

    const grip = this.add.circle(SWORD_MOUTH_X - 4, 0, 7, beanDark, 1).setStrokeStyle(2, ink)
    const sword = this.add
      .image(SWORD_MOUTH_X, 0, 'apple-inu-sword')
      .setOrigin(0.08, 0.5)
      .setRotation(SWORD_REST_ANGLE)
      .setScale(1.04)

    const headRig = this.add.container(0, 0, [
      ...swordTrails,
      grip,
      sword,
    ])

    player.add([
      shadow,
      backFoot,
      frontFoot,
      bodyPlate,
      highlight,
      ...faceObjects,
      headRig,
    ])

    internals.headRig = headRig
    internals.sword = sword
    internals.swordTrails = swordTrails
  }
}
