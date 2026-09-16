import Phaser from 'phaser'
import { BASE_SWORD } from '../combat/Sword'
import { GameScene } from './GameScene'

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
 * Presentation-only Bean skin for the resurrected pre-HLW combat game.
 *
 * GameScene remains authoritative for simulation, combat, stamina, dodge
 * i-frames, enemies, scoring, gore, fixed-tick timing and determinism.
 * This class only replaces the visible player rig.
 */
export class BeanGameScene extends GameScene {
  preload(): void {
    super.preload()
  }

  create(): void {
    super.create()
    this.installBeanPresentation()
  }

  private installBeanPresentation(): void {
    const internals = this as unknown as PlayerPresentationInternals
    const player = internals.player

    // Keep the player container itself: inherited simulation/render sync owns
    // its position, facing and damage/dodge alpha. Replace presentation only.
    player.removeAll(true)

    const bladeLength = BASE_SWORD.outerRadius - BASE_SWORD.innerRadius
    const outline = 0x17120d
    const bean = 0xf2bf3f
    const beanLight = 0xffdf69
    const beanShade = 0xcd9228
    const capBlue = 0x4979b9
    const capDark = 0x31588d
    const cloth = 0xf5f1e6

    const makeTrail = (angle: number) =>
      this.add
        .rectangle(SWORD_MOUTH_X, 0, bladeLength, 9, 0xffd34d, 1)
        .setOrigin(0, 0.5)
        .setRotation(SWORD_REST_ANGLE + angle)
        .setAlpha(0)

    const swordTrails = SLASH_TRAIL_ANGLES.map(makeTrail)

    // Cheap-web / Y2K silhouette: thick outline, deliberately chunky shapes,
    // minimal facial detail, blue cap and oversized white BEAN tee.
    const shadow = this.add.ellipse(-2, 20, 51, 17, 0x000000, 0.27)
    const backShoe = this.add.ellipse(-12, 21, 17, 9, cloth).setStrokeStyle(3, outline).setRotation(0.16)
    const frontShoe = this.add.ellipse(13, 21, 17, 9, cloth).setStrokeStyle(3, outline).setRotation(-0.16)
    const pantsBack = this.add.ellipse(-9, 14, 13, 15, capBlue).setStrokeStyle(3, outline)
    const pantsFront = this.add.ellipse(10, 14, 13, 15, capBlue).setStrokeStyle(3, outline)

    const bodyLeft = this.add.ellipse(-7, -3, 37, 50, beanShade).setStrokeStyle(4, outline).setRotation(-0.18)
    const bodyMain = this.add.ellipse(2, -5, 42, 51, bean).setStrokeStyle(4, outline).setRotation(0.14)
    const bodyHighlight = this.add.ellipse(-7, -12, 14, 28, beanLight, 0.7).setRotation(-0.38)

    const shirt = this.add.ellipse(1, 8, 43, 28, cloth).setStrokeStyle(3, outline)
    const shirtBottom = this.add.rectangle(1, 13, 35, 18, cloth).setStrokeStyle(3, outline)
    const shirtLabel = this.add.text(1, 7, 'BEAN', {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '9px',
      fontStyle: 'bold',
      color: '#4979b9',
      stroke: '#4979b9',
      strokeThickness: 0.5,
    }).setOrigin(0.5)

    const leftArm = this.add.ellipse(-23, 7, 10, 24, bean).setStrokeStyle(3, outline).setRotation(0.36)
    const leftHand = this.add.circle(-26, 17, 5, beanLight).setStrokeStyle(3, outline)

    const leftEye = this.add.circle(-8, -10, 2.8, outline)
    const rightEye = this.add.circle(5, -10, 2.8, outline)
    const mouth = this.add.arc(-1, -3, 7, 12, 168, false, bean, 0).setStrokeStyle(2.2, outline)

    const capCrown = this.add.ellipse(-2, -27, 28, 13, capBlue).setStrokeStyle(3, outline).setRotation(-0.05)
    const capPanel = this.add.ellipse(-3, -27, 13, 10, cloth).setStrokeStyle(2, outline).setRotation(-0.05)
    const capTop = this.add.rectangle(-4, -35, 6, 8, capBlue).setStrokeStyle(2, outline)
    const capBrim = this.add.ellipse(10, -23, 19, 6, capDark).setStrokeStyle(3, outline).setRotation(-0.08)

    const grip = this.add.circle(SWORD_MOUTH_X - 5, 2, 6, beanLight).setStrokeStyle(3, outline)
    const rightArm = this.add.ellipse(16, 6, 10, 25, bean).setStrokeStyle(3, outline).setRotation(-0.52)
    const sword = this.add
      .image(SWORD_MOUTH_X, 0, 'apple-inu-sword')
      .setOrigin(0.08, 0.5)
      .setRotation(SWORD_REST_ANGLE)
      .setScale(1.04)

    // The original combat animation drives headRig. Putting Bean's face/cap,
    // sword arm and weapon here keeps the old violent sweep without touching
    // hit geometry or simulation timing.
    const headRig = this.add.container(0, 0, [
      ...swordTrails,
      rightArm,
      grip,
      sword,
      leftEye,
      rightEye,
      mouth,
      capCrown,
      capPanel,
      capTop,
      capBrim,
    ])

    player.add([
      shadow,
      backShoe,
      frontShoe,
      pantsBack,
      pantsFront,
      bodyLeft,
      bodyMain,
      bodyHighlight,
      shirt,
      shirtBottom,
      shirtLabel,
      leftArm,
      leftHand,
      headRig,
    ])

    internals.headRig = headRig
    internals.sword = sword
    internals.swordTrails = swordTrails
  }
}
