import Phaser from 'phaser'
import type { StyleRank } from '../game/combat/StyleMeter'

interface Entry {
  text: Phaser.GameObjects.Text
  active: boolean
}

const COLORS: Record<StyleRank, string> = {
  D: '#b8b4c3',
  C: '#d8d2c8',
  B: '#a8e66b',
  A: '#ffd166',
  S: '#ff7aa8',
  SS: '#ff4f8d',
}

export class CombatTextFx {
  private readonly entries: Entry[] = []
  private cursor = 0

  constructor(private readonly scene: Phaser.Scene, size = 28) {
    for (let i = 0; i < size; i += 1) {
      const text = scene.add
        .text(-9999, -9999, '', {
          fontFamily: 'monospace',
          fontSize: '14px',
          fontStyle: 'bold',
          stroke: '#09070d',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(40)
        .setVisible(false)
      this.entries.push({ text, active: false })
    }
  }

  show(x: number, y: number, label: string, points: number, rank: StyleRank, variety = false): void {
    const entry = this.entries[this.cursor]
    this.cursor = (this.cursor + 1) % this.entries.length
    this.scene.tweens.killTweensOf(entry.text)
    entry.active = true
    entry.text
      .setText(`${label} +${points}${variety ? '  MIX-UP' : ''}`)
      .setColor(COLORS[rank])
      .setPosition(x, y)
      .setAlpha(1)
      .setScale(variety ? 1.08 : 1)
      .setVisible(true)

    this.scene.tweens.add({
      targets: entry.text,
      y: y - 34,
      alpha: 0,
      scaleX: variety ? 1.16 : 1.04,
      scaleY: variety ? 1.16 : 1.04,
      duration: 720,
      ease: 'Cubic.Out',
      onComplete: () => {
        entry.active = false
        entry.text.setVisible(false)
      },
    })
  }

  reset(): void {
    for (const entry of this.entries) {
      this.scene.tweens.killTweensOf(entry.text)
      entry.active = false
      entry.text.setVisible(false)
    }
  }
}
