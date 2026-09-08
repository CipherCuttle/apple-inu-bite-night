from pathlib import Path
import re

p = Path('src/game/scenes/GameScene.ts')
s = p.read_text()
pattern = r"    // Silhouette-first bitten apple head:.*?const leaf = this\.add\.ellipse\(2, -29, 19, 9, green\)\.setStrokeStyle\(2, dark\)\.setRotation\(-0\.48\)\n"
replacement = '''    // Apple-logo-first top silhouette: smooth lobes, deep cleft, tapered base, oversized side bite.\n    const outline = this.add.graphics()\n    outline.fillStyle(dark, 1)\n    outline.beginPath()\n    outline.moveTo(12, -22)\n    outline.bezierCurveTo(-2, -28, -19, -18, -20, -1)\n    outline.bezierCurveTo(-21, 13, -11, 25, 2, 26)\n    outline.bezierCurveTo(9, 27, 12, 23, 16, 23)\n    outline.bezierCurveTo(20, 23, 28, 17, 29, 7)\n    outline.bezierCurveTo(31, -7, 23, -18, 14, -20)\n    outline.closePath()\n    outline.fillPath()\n    const apple = this.add.graphics()\n    apple.fillStyle(furHighlight, 1)\n    apple.beginPath()\n    apple.moveTo(11, -18)\n    apple.bezierCurveTo(0, -23, -15, -15, -16, -1)\n    apple.bezierCurveTo(-17, 11, -8, 21, 3, 22)\n    apple.bezierCurveTo(9, 23, 12, 19, 16, 19)\n    apple.bezierCurveTo(20, 19, 25, 14, 26, 6)\n    apple.bezierCurveTo(28, -6, 21, -14, 13, -16)\n    apple.closePath()\n    apple.fillPath()\n    const topCleft = this.add.triangle(10, -18, 0, 0, 8, 0, 4, 8, dark).setRotation(Math.PI)\n    const bite1 = this.add.circle(27, -7, 7, dark)\n    const bite2 = this.add.circle(31, 1, 7.5, dark)\n    const bite3 = this.add.circle(27, 9, 6.5, dark)\n    const stem = this.add.rectangle(10, -27, 4, 10, 0x79513a).setRotation(0.24)\n    const leaf = this.add.ellipse(1, -30, 20, 8, green).setStrokeStyle(2, dark).setRotation(-0.48)\n'''
s, n = re.subn(pattern, replacement, s, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'head rewrite count={n}')
old = '''      headOutline,\n      appleLower,\n      appleLobeRear,\n      appleLobeFront,\n      appleCenter,\n      topCleft,\n      bottomTaperLeft,\n      bottomTaperRight,\n      biteUpper,\n      biteMiddle,\n      biteLower,\n'''
new = '''      outline,\n      apple,\n      topCleft,\n      bite1,\n      bite2,\n      bite3,\n'''
if old not in s:
    raise SystemExit('head container list not found')
s = s.replace(old, new, 1)
p.write_text(s)
