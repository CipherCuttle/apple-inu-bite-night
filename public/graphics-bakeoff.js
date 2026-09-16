import { Application, Assets, Container, Graphics, Sprite, Text } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.17.0/dist/pixi.mjs'

const WIDTH = 1280
const HEIGHT = 720
const params = new URLSearchParams(location.search)
const MODE = ['A', 'B', 'C'].includes((params.get('mode') || 'C').toUpperCase())
  ? (params.get('mode') || 'C').toUpperCase()
  : 'C'
const AUTOTEST = params.get('autotest') === '1'

for (const link of document.querySelectorAll('[data-mode]')) {
  if (link.dataset.mode === MODE) link.classList.add('active')
}

const app = new Application()
await app.init({
  width: WIDTH,
  height: HEIGHT,
  background: '#030207',
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
})
document.querySelector('#stage').appendChild(app.canvas)
app.canvas.style.cursor = 'crosshair'

const root = new Container()
const world = new Container()
const decals = new Container()
const actors = new Container()
const debrisLayer = new Container()
const particlesLayer = new Container()
const lighting = new Container()
const ui = new Container()
root.addChild(world, decals, actors, debrisLayer, particlesLayer, lighting, ui)
app.stage.addChild(root)
actors.sortableChildren = true

let seed = 0x00beab01
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function panel(x, y, w, h, color, alpha = 1, stroke = null) {
  const g = new Graphics().roundRect(x, y, w, h, 8).fill({ color, alpha })
  if (stroke !== null) g.stroke({ color: stroke, width: 1, alpha: 0.75 })
  return g
}

function radialGlow(x, y, radius, color, alpha) {
  const c = new Container()
  c.blendMode = 'add'
  for (let i = 12; i >= 1; i -= 1) {
    const p = i / 12
    c.addChild(new Graphics().circle(x, y, radius * p).fill({ color, alpha: alpha * (1 - p) * 0.20 }))
  }
  return c
}

// Same room geometry in A/B/C.
const bg = new Graphics()
bg.rect(0, 0, WIDTH, HEIGHT).fill({ color: MODE === 'A' ? 0x17151a : 0x05040a })
bg.rect(56, 80, 1168, 516).fill({ color: MODE === 'A' ? 0x29262d : 0x0c0912 })
bg.rect(56, 80, 1168, 516).stroke({ color: MODE === 'A' ? 0x6b6571 : 0x36234f, width: 3, alpha: 0.85 })
world.addChild(bg)

const floor = new Graphics()
floor.rect(56, 284, 1168, 312).fill({ color: MODE === 'A' ? 0x343137 : 0x100d14 })
for (let y = 308; y <= 584; y += 34) {
  floor.moveTo(56, y).lineTo(1224, y).stroke({ color: MODE === 'A' ? 0x48434d : 0x292231, width: 1, alpha: 0.72 })
}
for (let x = 82; x <= 1210; x += 58) {
  floor.moveTo(x, 284).lineTo(640 + (x - 640) * 1.13, 596).stroke({ color: MODE === 'A' ? 0x49444c : 0x211a29, width: 1, alpha: 0.45 })
}
world.addChild(floor)

const backWall = new Graphics()
backWall.rect(86, 105, 1108, 150).fill({ color: MODE === 'A' ? 0x39343f : 0x100b17 })
backWall.rect(86, 105, 1108, 150).stroke({ color: MODE === 'A' ? 0x615b67 : 0x41245f, width: 2 })
world.addChild(backWall)

if (MODE !== 'A') {
  world.addChild(radialGlow(220, 235, 270, 0x7137c8, 0.62))
  world.addChild(radialGlow(1080, 250, 250, 0xff244f, 0.40))
  world.addChild(radialGlow(650, 520, 330, 0x512497, 0.30))
  const grime = new Graphics()
  for (let i = 0; i < 180; i += 1) {
    const x = 70 + rand() * 1140
    const y = 295 + rand() * 286
    grime.circle(x, y, 1 + rand() * 9).fill({ color: rand() > 0.82 ? 0x51142b : 0x2b1e31, alpha: 0.07 + rand() * 0.22 })
  }
  world.addChild(grime)
}

world.addChild(panel(490, 125, 300, 72, MODE === 'A' ? 0x28252b : 0x09060e, 0.98, MODE === 'A' ? 0x706a75 : 0x8951df))
const signText = new Text({
  text: MODE === 'A' ? 'RAW PIXI BASELINE' : 'BEAN COUNTY MALL\nAFTER HOURS',
  style: { fontFamily: 'Arial Black, Impact, sans-serif', fontSize: MODE === 'A' ? 22 : 24, fontWeight: '900', fill: MODE === 'A' ? 0xd7d2dd : 0xd3baff, align: 'center', letterSpacing: 2 },
})
signText.anchor.set(0.5)
signText.position.set(640, 160)
world.addChild(signText)

if (MODE !== 'A') {
  for (const [copy, x, y, w, h, color] of [
    ['NO THOUGHTS\nJUST BEAN', 120, 132, 138, 88, 0x23143a],
    ['404\nLIQUIDITY', 274, 132, 118, 88, 0x241126],
    ['CLOSED DUE\nTO ZOMBIES', 888, 132, 136, 88, 0x2b111b],
    ['FREE WIFI\nBAD IDEA', 1038, 132, 120, 88, 0x1d1430],
  ]) {
    world.addChild(panel(x, y, w, h, color, 0.96, 0x68478e))
    const t = new Text({ text: copy, style: { fontFamily: 'monospace', fontSize: 12, fontWeight: '700', fill: 0xddd0ef, align: 'center' } })
    t.anchor.set(0.5)
    t.position.set(x + w / 2, y + h / 2)
    world.addChild(t)
  }
}

const [beanTexture, swordTexture, zombieTexture, bloodTexture] = await Promise.all([
  Assets.load('./assets/characters/bean-on-ink/bean.svg'),
  Assets.load('./assets/characters/apple-inu/sword.png'),
  Assets.load('./assets/enemies/zombies/walker.png'),
  Assets.load('./assets/gore/decals/trail-4.png'),
])

if (MODE !== 'A') {
  for (let i = 0; i < 46; i += 1) {
    const blood = new Sprite(bloodTexture)
    blood.anchor.set(0.5)
    blood.position.set(100 + rand() * 1080, 330 + rand() * 235)
    blood.rotation = rand() * Math.PI * 2
    blood.scale.set(0.55 + rand() * 1.75)
    blood.tint = rand() > 0.25 ? 0x81142c : 0x481021
    blood.alpha = 0.18 + rand() * 0.42
    decals.addChild(blood)
  }
}

const zombieCount = 120
const zombies = []
for (let i = 0; i < zombieCount; i += 1) {
  const holder = new Container()
  const column = i % 20
  const row = Math.floor(i / 20)
  const x = 104 + column * 56 + (row % 2) * 18 + (rand() - 0.5) * 12
  const y = 314 + row * 45 + (rand() - 0.5) * 10
  if (MODE !== 'A') holder.addChild(new Graphics().ellipse(0, 25, 46, 15).fill({ color: 0x000000, alpha: 0.38 }))
  const sprite = new Sprite(zombieTexture)
  sprite.anchor.set(0.5)
  sprite.scale.set(0.63 + rand() * 0.23)
  sprite.tint = MODE === 'A' ? 0xd7d3da : i % 11 === 0 ? 0xe5c8ff : 0xcbb9dc
  holder.addChild(sprite)
  holder.position.set(x, y)
  holder.zIndex = Math.round(y)
  actors.addChild(holder)
  zombies.push({ holder, baseX: x, baseY: y, phase: rand() * 10 })
}

const player = new Container()
player.position.set(640, 470)
player.zIndex = 999
if (MODE !== 'A') player.addChild(new Graphics().ellipse(0, 43, 90, 26).fill({ color: 0x000000, alpha: 0.46 }))
const bean = new Sprite(beanTexture)
bean.anchor.set(0.5)
bean.scale.set(0.83)
bean.position.set(0, -8)
const weaponRig = new Container()
const sword = new Sprite(swordTexture)
sword.anchor.set(0.08, 0.5)
sword.position.set(25, 0)
sword.scale.set(1.72)
weaponRig.addChild(sword)
player.addChild(bean, weaponRig)
actors.addChild(player)

// B/C pooled presentation particles. This is intentionally not combat authority.
const particlePool = []
let particleCursor = 0
const particleCapacity = MODE === 'A' ? 0 : 1200
if (MODE !== 'A') {
  const dot = new Graphics().circle(5, 5, 4).fill({ color: 0xffffff })
  const particleTexture = app.renderer.generateTexture(dot)
  for (let i = 0; i < particleCapacity; i += 1) {
    const sprite = new Sprite(particleTexture)
    sprite.anchor.set(0.5)
    sprite.visible = false
    particlesLayer.addChild(sprite)
    particlePool.push({ sprite, vx: 0, vy: 0, life: 0, maxLife: 0, spin: 0 })
  }
}

function spawnParticleBurst(x, y, count) {
  if (MODE === 'A') return
  const palette = [0x7d102c, 0xd51f45, 0xff557b, 0xffbacb, 0x9b57e7]
  for (let i = 0; i < Math.min(count, particleCapacity); i += 1) {
    const p = particlePool[particleCursor]
    particleCursor = (particleCursor + 1) % particleCapacity
    const angle = rand() * Math.PI * 2
    const speed = 90 + rand() * 520
    p.sprite.visible = true
    p.sprite.position.set(x + (rand() - 0.5) * 30, y + (rand() - 0.5) * 24)
    p.sprite.scale.set(0.25 + rand() * 1.15)
    p.sprite.tint = palette[Math.floor(rand() * palette.length)]
    p.sprite.alpha = 0.90
    p.vx = Math.cos(angle) * speed
    p.vy = Math.sin(angle) * speed
    p.maxLife = p.life = 0.75 + rand() * 1.65
    p.spin = (rand() - 0.5) * 11
  }
}

// C: actual Rapier compatibility build. Physics is only for chaos/debris objects.
let RAPIER = null
let physicsWorld = null
const physicsDebris = []
const PX_PER_M = 55
let rapierStatus = 'OFF'
if (MODE === 'C') {
  try {
    const rapierModule = await import('https://esm.sh/@dimforge/rapier2d-compat@0.20.0')
    RAPIER = rapierModule.default ?? rapierModule
    if (typeof RAPIER.init === 'function') await RAPIER.init()
    physicsWorld = new RAPIER.World({ x: 0, y: 0 })
    rapierStatus = 'READY 0.20.0'

    const left = 70 / PX_PER_M
    const right = 1210 / PX_PER_M
    const top = 294 / PX_PER_M
    const bottom = 590 / PX_PER_M
    const wt = 0.25
    const addWall = (x, y, hx, hy) => {
      const body = physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y))
      physicsWorld.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy), body)
    }
    addWall((left + right) / 2, top - wt, (right - left) / 2, wt)
    addWall((left + right) / 2, bottom + wt, (right - left) / 2, wt)
    addWall(left - wt, (top + bottom) / 2, wt, (bottom - top) / 2)
    addWall(right + wt, (top + bottom) / 2, wt, (bottom - top) / 2)

    for (let i = 0; i < 42; i += 1) {
      const px = 145 + rand() * 980
      const py = 330 + rand() * 220
      const size = 7 + rand() * 12
      const body = physicsWorld.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(px / PX_PER_M, py / PX_PER_M)
          .setRotation(rand() * Math.PI)
          .setLinearDamping(1.5 + rand() * 1.5)
          .setAngularDamping(1.8),
      )
      physicsWorld.createCollider(RAPIER.ColliderDesc.cuboid(size / PX_PER_M, size / PX_PER_M).setRestitution(0.62).setFriction(0.55), body)
      const g = new Graphics().roundRect(-size, -size, size * 2, size * 2, 3)
        .fill({ color: i % 4 === 0 ? 0x8d2442 : i % 3 === 0 ? 0x7448a7 : 0x5a4537 })
        .stroke({ color: 0x160d19, width: 2, alpha: 0.9 })
      debrisLayer.addChild(g)
      physicsDebris.push({ body, g })
    }
  } catch (error) {
    rapierStatus = `FAILED: ${error?.message || error}`
    console.error('RAPIER_LOAD_FAILED', error)
  }
}

// C dynamic composite-light model. Normal maps/custom shader are deliberately R2 if C wins.
const darkness = new Graphics().rect(0, 0, WIDTH, HEIGHT).fill({ color: 0x050309, alpha: MODE === 'C' ? 0.20 : 0 })
lighting.addChild(darkness)
const playerLight = MODE === 'C' ? radialGlow(player.x, player.y, 195, 0x8550ff, 0.78) : null
const emergencyLight = MODE === 'C' ? radialGlow(1110, 180, 245, 0xff214c, 0.58) : null
const blastLight = MODE === 'C' ? radialGlow(0, 0, 260, 0xffc17f, 0.82) : null
if (MODE === 'C') {
  blastLight.alpha = 0
  lighting.addChild(playerLight, emergencyLight, blastLight)
}

ui.addChild(panel(18, 16, 355, 86, 0x07050b, 0.88, MODE === 'A' ? 0x615b67 : 0x583777))
const modeTitle = new Text({
  text: MODE === 'A' ? 'A // RAW PIXI' : MODE === 'B' ? 'B // PIXI MAX FX' : 'C // FX + LIGHT + RAPIER',
  style: { fontFamily: 'monospace', fontSize: 18, fontWeight: '700', fill: 0xf0e6ff, letterSpacing: 1 },
})
modeTitle.position.set(32, 29)
ui.addChild(modeTitle)
const invariantText = new Text({ text: '120 ZOMBIES · SAME ART · GRAPHICS LAB ONLY', style: { fontFamily: 'monospace', fontSize: 10, fill: 0x9b89ad } })
invariantText.position.set(32, 61)
ui.addChild(invariantText)

ui.addChild(panel(965, 16, 297, 110, 0x07050b, 0.90, 0x583777))
const metricsText = new Text({ text: 'booting…', style: { fontFamily: 'monospace', fontSize: 11, fill: 0xd8caea, lineHeight: 17 } })
metricsText.position.set(980, 29)
ui.addChild(metricsText)

if (MODE !== 'A') {
  const scan = new Graphics()
  for (let y = 0; y < HEIGHT; y += 4) scan.rect(0, y, WIDTH, 1).fill({ color: 0xffffff, alpha: 0.015 })
  ui.addChild(scan)
}

const flashOverlay = new Graphics().rect(0, 0, WIDTH, HEIGHT).fill({ color: 0xffdac7, alpha: 1 })
flashOverlay.alpha = 0
ui.addChild(flashOverlay)

const keys = new Set()
let pointerX = 800
let pointerY = 450
let shake = 0
let flash = 0
let blastX = 640
let blastY = 450
let eventCount = 0
window.addEventListener('keydown', (e) => keys.add(e.code))
window.addEventListener('keyup', (e) => keys.delete(e.code))
app.canvas.addEventListener('pointermove', (e) => {
  const rect = app.canvas.getBoundingClientRect()
  pointerX = ((e.clientX - rect.left) / rect.width) * WIDTH
  pointerY = ((e.clientY - rect.top) / rect.height) * HEIGHT
})
app.canvas.addEventListener('pointerdown', () => triggerBlast(pointerX, pointerY))

function triggerBlast(x, y) {
  eventCount += 1
  blastX = x
  blastY = y
  shake = MODE === 'A' ? 0.12 : MODE === 'B' ? 0.62 : 0.82
  flash = MODE === 'A' ? 0 : MODE === 'B' ? 0.55 : 0.72
  spawnParticleBurst(x, y, MODE === 'B' ? 850 : MODE === 'C' ? 1050 : 0)

  if (MODE === 'C' && physicsWorld) {
    const bx = x / PX_PER_M
    const by = y / PX_PER_M
    for (const item of physicsDebris) {
      const p = item.body.translation()
      const dx = p.x - bx
      const dy = p.y - by
      const d = Math.max(0.35, Math.hypot(dx, dy))
      const strength = Math.min(5.6, 6.5 / d)
      item.body.applyImpulse({ x: (dx / d) * strength, y: (dy / d) * strength }, true)
      item.body.applyTorqueImpulse((rand() - 0.5) * 5.0, true)
    }
  }
}

let lastMetricsAt = performance.now()
let frameAccum = 0
let frameCount = 0
let maxFrameMs = 0
app.ticker.add((ticker) => {
  const dt = Math.min(0.04, ticker.deltaMS / 1000)
  const now = performance.now()
  const t = now / 1000
  frameAccum += ticker.deltaMS
  frameCount += 1
  maxFrameMs = Math.max(maxFrameMs, ticker.deltaMS)

  const mx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
  const my = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0)
  const len = Math.hypot(mx, my) || 1
  player.x = clamp(player.x + (mx / len) * 240 * dt, 100, 1180)
  player.y = clamp(player.y + (my / len) * 240 * dt, 315, 570)
  player.zIndex = Math.round(player.y + 100)
  bean.y = -8 + Math.sin(t * 5.2) * 2.4
  bean.rotation = Math.sin(t * 2.9) * 0.017
  weaponRig.rotation = Math.atan2(pointerY - player.y, pointerX - player.x)

  for (const z of zombies) {
    const amp = MODE === 'A' ? 0.8 : 2.2
    z.holder.y = z.baseY + Math.sin(t * 2.4 + z.phase) * amp
    z.holder.x = z.baseX + Math.sin(t * 1.15 + z.phase) * amp * 0.42
    z.holder.zIndex = Math.round(z.holder.y)
  }

  let activeParticles = 0
  for (const p of particlePool) {
    if (p.life <= 0) continue
    activeParticles += 1
    p.life -= dt
    if (p.life <= 0) {
      p.sprite.visible = false
      continue
    }
    p.vx *= Math.pow(0.15, dt)
    p.vy *= Math.pow(0.20, dt)
    p.vy += 145 * dt
    p.sprite.x += p.vx * dt
    p.sprite.y += p.vy * dt
    p.sprite.rotation += p.spin * dt
    p.sprite.alpha = clamp((p.life / p.maxLife) * 1.3, 0, 1)
  }

  if (MODE === 'C' && physicsWorld) {
    physicsWorld.step()
    for (const item of physicsDebris) {
      const p = item.body.translation()
      item.g.position.set(p.x * PX_PER_M, p.y * PX_PER_M)
      item.g.rotation = item.body.rotation()
    }
  }

  if (MODE === 'C') {
    emergencyLight.alpha = 0.72 + Math.sin(t * 7.2) * 0.12
    blastLight.position.set(blastX, blastY)
    blastLight.alpha = Math.max(0, flash * 0.34)
  }

  if (shake > 0.002) {
    const mag = shake * (MODE === 'C' ? 12 : 8)
    root.position.set((rand() - 0.5) * mag, (rand() - 0.5) * mag)
    shake *= Math.pow(0.04, dt)
  } else {
    root.position.set(0, 0)
    shake = 0
  }

  flashOverlay.alpha = flash * (MODE === 'C' ? 0.18 : 0.13)
  flash *= Math.pow(0.012, dt)

  if (now - lastMetricsAt >= 400) {
    const avgFrameMs = frameAccum / Math.max(1, frameCount)
    const fps = 1000 / Math.max(0.01, avgFrameMs)
    metricsText.text = [
      `FPS ~ ${fps.toFixed(0)}  AVG ${avgFrameMs.toFixed(1)}ms`,
      `WORST ${maxFrameMs.toFixed(1)}ms  CI/SW RENDER`,
      `ZOMBIES ${zombieCount}  PARTICLES ${activeParticles}/${particleCapacity}`,
      `RAPIER ${rapierStatus}`,
      `FX EVENTS ${eventCount}`,
    ].join('\n')
    window.__BAKEOFF_METRICS__ = { mode: MODE, fps, avgFrameMs, maxFrameMs, zombieCount, activeParticles, particleCapacity, rapierStatus, eventCount }
    frameAccum = 0
    frameCount = 0
    maxFrameMs = 0
    lastMetricsAt = now
  }
})

if (AUTOTEST) {
  if (MODE === 'A') setTimeout(() => { eventCount += 1; shake = 0.10 }, 3400)
  else setTimeout(() => triggerBlast(640, 455), 3400)
}

window.__BAKEOFF_READY__ = true
window.__BAKEOFF_MODE__ = MODE
window.__BAKEOFF_RAPIER__ = rapierStatus
