import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
} from 'https://cdn.jsdelivr.net/npm/pixi.js@8.17.0/dist/pixi.mjs'

const WIDTH = 960
const HEIGHT = 540
const app = new Application()
await app.init({
  width: WIDTH,
  height: HEIGHT,
  background: '#05040a',
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
})

document.querySelector('#stage').appendChild(app.canvas)
app.canvas.style.cursor = 'crosshair'

const world = new Container()
const fx = new Container()
const ui = new Container()
app.stage.addChild(world, fx, ui)

function panel(x, y, w, h, color, alpha = 1, stroke = null) {
  const g = new Graphics().roundRect(x, y, w, h, 8).fill({ color, alpha })
  if (stroke) g.stroke({ color: stroke, width: 1, alpha: 0.7 })
  return g
}

function glow(x, y, radius, color, alpha) {
  const c = new Container()
  for (let i = 6; i >= 1; i -= 1) {
    const r = radius * (i / 6)
    const a = alpha * (1 - i / 7) * 0.62
    c.addChild(new Graphics().circle(x, y, r).fill({ color, alpha: a }))
  }
  return c
}

// ----- ROOM -----
const backdrop = new Graphics()
backdrop.rect(0, 0, WIDTH, HEIGHT).fill({ color: 0x05040a })
backdrop.rect(0, 0, WIDTH, 102).fill({ color: 0x10091b })
backdrop.rect(0, 102, WIDTH, 320).fill({ color: 0x0c0a10 })
backdrop.rect(0, 422, WIDTH, 118).fill({ color: 0x09070c })
world.addChild(backdrop)

world.addChild(glow(172, 210, 175, 0x6b3fd5, 0.16))
world.addChild(glow(814, 210, 170, 0xff325f, 0.10))
world.addChild(glow(514, 410, 230, 0x4c2d92, 0.08))

const backWall = new Graphics()
backWall.rect(48, 82, 864, 280).fill({ color: 0x121018, alpha: 0.92 })
backWall.rect(48, 82, 864, 280).stroke({ color: 0x2c213d, width: 2, alpha: 0.8 })
backWall.rect(75, 110, 260, 148).fill({ color: 0x08080d })
backWall.rect(75, 110, 260, 148).stroke({ color: 0x392257, width: 2, alpha: 0.9 })
backWall.rect(622, 112, 260, 145).fill({ color: 0x0a090d })
backWall.rect(622, 112, 260, 145).stroke({ color: 0x4a1f38, width: 2, alpha: 0.85 })
world.addChild(backWall)

const sign = panel(350, 110, 256, 64, 0x0b0710, 0.96, 0x6b43b5)
world.addChild(sign)
const signText = new Text({
  text: 'BEAN\nAFTER DARK',
  style: {
    fontFamily: 'Arial Black, Impact, sans-serif',
    fontSize: 25,
    fontWeight: '900',
    fill: 0xc5a7ff,
    align: 'center',
    letterSpacing: 3,
    dropShadow: { color: '#6b3fd5', blur: 9, angle: 0.8, distance: 1 },
  },
})
signText.anchor.set(0.5)
signText.position.set(478, 142)
world.addChild(signText)

const posterA = panel(94, 128, 112, 104, 0x23123c, 1, 0x7754b7)
const posterB = panel(220, 128, 92, 104, 0x1e102c, 1, 0x6948a0)
world.addChild(posterA, posterB)
const posterText = new Text({
  text: 'NO\nTHOUGHTS\nJUST\nBEAN',
  style: { fontFamily: 'monospace', fontSize: 13, fontWeight: '700', fill: 0xdcc9ff, align: 'center' },
})
posterText.anchor.set(0.5)
posterText.position.set(150, 180)
world.addChild(posterText)
const posterTextB = new Text({
  text: '404\nLIQUIDITY\nNOT FOUND',
  style: { fontFamily: 'monospace', fontSize: 11, fontWeight: '700', fill: 0xffd7e1, align: 'center' },
})
posterTextB.anchor.set(0.5)
posterTextB.position.set(266, 180)
world.addChild(posterTextB)

// Floor with deterministic grime and perspective-ish lanes.
const floor = new Graphics()
floor.rect(48, 282, 864, 188).fill({ color: 0x111015 })
for (let y = 302; y <= 460; y += 32) {
  floor.moveTo(48, y).lineTo(912, y).stroke({ color: 0x2b2630, width: 1, alpha: 0.72 })
}
for (let x = 80; x <= 900; x += 54) {
  floor.moveTo(x, 282).lineTo(480 + (x - 480) * 1.11, 470).stroke({ color: 0x221d29, width: 1, alpha: 0.44 })
}
let seed = 912731
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
for (let i = 0; i < 82; i += 1) {
  const x = 60 + rand() * 840
  const y = 292 + rand() * 166
  const r = 1 + rand() * 7
  floor.circle(x, y, r).fill({ color: rand() > 0.75 ? 0x421a2c : 0x211a25, alpha: 0.18 + rand() * 0.28 })
}
world.addChild(floor)

// Props create depth instead of debug rectangles.
for (const [x, y, color] of [[116, 354, 0x69482f], [830, 358, 0x342a3b], [760, 405, 0x553447]]) {
  const shadow = new Graphics().ellipse(x + 4, y + 15, 54, 16).fill({ color: 0x000000, alpha: 0.32 })
  const crate = new Graphics().roundRect(x - 26, y - 25, 52, 48, 5).fill({ color }).stroke({ color: 0x110e14, width: 4 })
  crate.moveTo(x - 18, y - 12).lineTo(x + 18, y + 10).stroke({ color: 0xb69276, width: 2, alpha: 0.24 })
  world.addChild(shadow, crate)
}

// ----- ASSETS -----
const [beanTexture, swordTexture, zombieTexture, bloodTexture] = await Promise.all([
  Assets.load('./assets/characters/bean-on-ink/bean.svg'),
  Assets.load('./assets/characters/apple-inu/sword.png'),
  Assets.load('./assets/enemies/zombies/walker.png'),
  Assets.load('./assets/gore/decals/trail-4.png'),
])

// ----- BLOOD DECALS -----
for (const d of [
  [640, 374, -0.24, 0.75],
  [696, 324, 0.52, 0.54],
  [378, 420, -0.76, 0.36],
]) {
  const blood = new Sprite(bloodTexture)
  blood.anchor.set(0.5)
  blood.position.set(d[0], d[1])
  blood.rotation = d[2]
  blood.scale.set(1.6)
  blood.alpha = d[3]
  blood.tint = 0x7b1730
  world.addChild(blood)
}

// ----- ENEMIES -----
const zombies = []
for (const [x, y, scale, tint] of [
  [664, 352, 0.95, 0xe9ddff],
  [716, 405, 1.12, 0xd4c7ff],
  [340, 345, 0.86, 0xc9b8e9],
  [815, 315, 0.76, 0xcab0de],
]) {
  const holder = new Container()
  const shadow = new Graphics().ellipse(0, 27, 58, 19).fill({ color: 0x000000, alpha: 0.34 })
  const zombie = new Sprite(zombieTexture)
  zombie.anchor.set(0.5)
  zombie.scale.set(scale)
  zombie.tint = tint
  holder.addChild(shadow, zombie)
  holder.position.set(x, y)
  holder.zIndex = Math.round(y)
  world.addChild(holder)
  zombies.push({ holder, zombie, baseY: y, phase: x * 0.013 })
}
world.sortableChildren = true

// ----- PLAYER -----
const player = new Container()
player.position.set(500, 360)
player.zIndex = 500

const playerShadow = new Graphics().ellipse(0, 42, 86, 24).fill({ color: 0x000000, alpha: 0.4 })
const bean = new Sprite(beanTexture)
bean.anchor.set(0.5)
bean.scale.set(0.76)
bean.position.set(0, -5)

const weaponRig = new Container()
const swordGlow = new Graphics().roundRect(28, -9, 112, 18, 9).fill({ color: 0xb995ff, alpha: 0.11 })
const sword = new Sprite(swordTexture)
sword.anchor.set(0.08, 0.5)
sword.position.set(22, 0)
sword.scale.set(1.55)
weaponRig.addChild(swordGlow, sword)

player.addChild(playerShadow, bean, weaponRig)
world.addChild(player)

const attackArc = new Graphics()
attackArc.zIndex = 460
world.addChild(attackArc)

const particles = []
function spawnHitBurst(angle) {
  const ox = player.x + Math.cos(angle) * 74
  const oy = player.y + Math.sin(angle) * 74
  for (let i = 0; i < 18; i += 1) {
    const spread = angle + (rand() - 0.5) * 1.65
    const speed = 80 + rand() * 250
    const p = new Graphics().circle(0, 0, 2 + rand() * 4).fill({ color: rand() > 0.35 ? 0xb51f45 : 0xff5f88, alpha: 0.9 })
    p.position.set(ox, oy)
    p.zIndex = 700
    world.addChild(p)
    particles.push({ g: p, vx: Math.cos(spread) * speed, vy: Math.sin(spread) * speed - rand() * 80, life: 0.36 + rand() * 0.24 })
  }
}

// ----- UI -----
ui.addChild(panel(18, 16, 236, 72, 0x08060c, 0.84, 0x4b3367))
const title = new Text({
  text: 'BEAN // INK AFTER DARK',
  style: { fontFamily: 'monospace', fontSize: 15, fontWeight: '700', fill: 0xe6d6ff, letterSpacing: 1 },
})
title.position.set(32, 28)
ui.addChild(title)
const subtitle = new Text({
  text: 'PIXI VISUAL SPIKE  ·  NOT GAMEPLAY AUTHORITY',
  style: { fontFamily: 'monospace', fontSize: 9, fill: 0x927da9, letterSpacing: 0.5 },
})
subtitle.position.set(32, 54)
ui.addChild(subtitle)

ui.addChild(panel(730, 16, 212, 72, 0x08060c, 0.84, 0x4b3367))
const styleRank = new Text({ text: 'S', style: { fontFamily: 'Arial Black, sans-serif', fontSize: 52, fontWeight: '900', fill: 0xc9a7ff } })
styleRank.position.set(752, 18)
ui.addChild(styleRank)
const styleCopy = new Text({
  text: 'STUPIDLY\nCOMMITTED',
  style: { fontFamily: 'monospace', fontSize: 11, fontWeight: '700', fill: 0xe5d7ff, lineHeight: 16 },
})
styleCopy.position.set(806, 31)
ui.addChild(styleCopy)

const hp = new Graphics().roundRect(24, 102, 186, 12, 6).fill({ color: 0x1d1524, alpha: 0.95 })
hp.roundRect(26, 104, 154, 8, 4).fill({ color: 0x9b60df })
ui.addChild(hp)
const hpText = new Text({ text: 'BEAN INTEGRITY  83%', style: { fontFamily: 'monospace', fontSize: 9, fill: 0xbca7d9 } })
hpText.position.set(24, 119)
ui.addChild(hpText)

// scanline/noise treatment: intentionally subtle, not a giant CRT filter.
const scan = new Graphics()
for (let y = 0; y < HEIGHT; y += 4) scan.rect(0, y, WIDTH, 1).fill({ color: 0xffffff, alpha: 0.022 })
ui.addChild(scan)

// ----- INPUT / ANIMATION -----
const keys = new Set()
let pointerX = 650
let pointerY = 340
let slashTime = 99
let shake = 0

window.addEventListener('keydown', (event) => keys.add(event.code))
window.addEventListener('keyup', (event) => keys.delete(event.code))
app.canvas.addEventListener('pointermove', (event) => {
  const rect = app.canvas.getBoundingClientRect()
  pointerX = ((event.clientX - rect.left) / rect.width) * WIDTH
  pointerY = ((event.clientY - rect.top) / rect.height) * HEIGHT
})
app.canvas.addEventListener('pointerdown', () => {
  slashTime = 0
  shake = 1
  const a = Math.atan2(pointerY - player.y, pointerX - player.x)
  spawnHitBurst(a)
})

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3) }

app.ticker.add((ticker) => {
  const dt = Math.min(0.033, ticker.deltaMS / 1000)
  const t = performance.now() / 1000
  const mx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
  const my = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0)
  const len = Math.hypot(mx, my) || 1
  player.x = clamp(player.x + (mx / len) * 190 * dt, 100, 860)
  player.y = clamp(player.y + (my / len) * 190 * dt, 300, 438)
  player.zIndex = Math.round(player.y + 30)

  bean.y = -5 + Math.sin(t * 5.4) * 2
  bean.rotation = Math.sin(t * 3.2) * 0.015

  const aim = Math.atan2(pointerY - player.y, pointerX - player.x)
  slashTime += dt
  let slashOffset = -0.24
  let arcAlpha = 0
  if (slashTime < 0.24) {
    const p = clamp(slashTime / 0.18, 0, 1)
    slashOffset = -1.15 + easeOutCubic(p) * 2.45
    arcAlpha = Math.sin(Math.PI * clamp(slashTime / 0.24, 0, 1))
  }
  weaponRig.rotation = aim + slashOffset
  weaponRig.scale.set(slashTime < 0.11 ? 1.12 : 1)

  attackArc.clear()
  if (arcAlpha > 0.01) {
    attackArc.arc(player.x, player.y, 100, aim - 1.1, aim + 1.1)
      .stroke({ color: 0xc9a7ff, width: 18, alpha: arcAlpha * 0.16 })
    attackArc.arc(player.x, player.y, 92, aim - 1.05, aim + 1.05)
      .stroke({ color: 0xf5ecff, width: 5, alpha: arcAlpha * 0.72 })
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i]
    p.life -= dt
    p.vy += 430 * dt
    p.g.x += p.vx * dt
    p.g.y += p.vy * dt
    p.g.alpha = clamp(p.life * 2.5, 0, 1)
    if (p.life <= 0) {
      p.g.destroy()
      particles.splice(i, 1)
    }
  }

  zombies.forEach((z, index) => {
    z.holder.y = z.baseY + Math.sin(t * 2.2 + z.phase) * (2 + index * 0.3)
    z.zombie.rotation = Math.sin(t * 1.7 + z.phase) * 0.045
    z.holder.zIndex = Math.round(z.holder.y)
  })

  if (shake > 0) {
    shake = Math.max(0, shake - dt * 7.8)
    world.x = Math.sin(t * 92) * shake * 5
    world.y = Math.cos(t * 81) * shake * 3
  } else {
    world.position.set(0, 0)
  }
})

document.body.dataset.pixiReady = 'true'
