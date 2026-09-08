from pathlib import Path

# Fix integration edges left by the broad migration after the old queued-key fields disappear.
p = Path('src/game/scenes/GameScene.ts')
s = p.read_text()
s = s.replace(
    "    this.hitStopMs = 0    this.desktopInput.consumeAttacks()\n",
    "    this.hitStopMs = 0\n    this.keyboardCombat.clear()\n    this.desktopInput.clearAttackBuffers()\n",
)
s = s.replace(
    "  private powerupColor(kind: PowerupKind): number {\n    return kind === 'frenzy' ? 0xff4f8d : kind === 'freeze' ? 0x75e6ff : 0x7cff7c\n  }\n",
    "  private powerupColor(_kind: PowerupKind): number {\n    return 0xffd35a\n  }\n",
)
s = s.replace(
    "    const label = this.add.text(0, 18, kind === 'frenzy' ? 'CUT' : kind === 'freeze' ? 'TIME' : 'HP', {\n",
    "    const label = this.add.text(0, 18, 'LAST BITE', {\n",
)
s = s.replace(
    "    this.flowBanner = this.add.text(480, 150, event.source === 'combo' ? 'LAST CHANCE // BULLET TIME' : 'TIME CORE', {\n",
    "    this.flowBanner = this.add.text(480, 150, 'LAST CHANCE // BULLET TIME', {\n",
)
s = s.replace(
    "    const label = kind === 'frenzy' ? 'CUT FRENZY' : kind === 'freeze' ? 'TIME FREEZE' : 'APPLE JUICE +HP'\n",
    "    const label = 'LAST BITE // SAVED'\n",
)
p.write_text(s)

p = Path('src/game/sim/GameState.ts')
s = p.read_text()
s = s.replace("  private registerKill(x: number, y: number): void {\n", "  private registerKill(_x: number, _y: number): void {\n")
p.write_text(s)
