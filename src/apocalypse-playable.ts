import './apocalypse-playable.css'
import { createReplayProof, verifyReplay, type SurvivalContractTerms } from './game/contracts/ApocalypseContracts'
import { GameState, type InputState, type SimEvent } from './game/sim/GameState'
import { FixedTick } from './game/sim/FixedTick'
import { MAZE_CELL_SIZE, MAZE_EXIT, MAZE_GRID, MAZE_ORIGIN_X, MAZE_ORIGIN_Y } from './game/world/Maze'
import { Sfx } from './presentation/Sfx'
import { getImpactProfile } from './presentation/CombatFeel'

const PIXI_URL = 'https://cdn.jsdelivr.net/npm/pixi.js@8.17.0/dist/pixi.mjs'
const RAPIER_URL = 'https://esm.sh/@dimforge/rapier2d-compat@0.20.0'
const PIXI = await import(/* @vite-ignore */ PIXI_URL)
const { Application, Assets, Container, Graphics, Sprite, Text } = PIXI

const WIDTH = 1280
const HEIGHT = 720
const WORLD_SCALE = 1.16
const WORLD_SCREEN_X = WIDTH / 2
const WORLD_SCREEN_Y = HEIGHT / 2 + 30
const MIN_TICKS = 15 * 60
const MAX_TICKS = 35 * 60
const MIN_KILLS = 3
const RUNNER = 'local-runner'
const AUTOTEST = new URLSearchParams(location.search).get('autotest') === '1'

const stage = required<HTMLDivElement>('stage')
const acceptButton = required<HTMLButtonElement>('accept-job')
const againButton = required<HTMLButtonElement>('run-again')
const missionScreen = required<HTMLElement>('mission-screen')
const resultScreen = required<HTMLElement>('result-screen')
const resultTitle = required<HTMLElement>('result-title')
const resultKicker = required<HTMLElement>('result-kicker')
const resultReceipt = required<HTMLPreElement>('result-receipt')
const hudContract = required<HTMLElement>('hud-contract')
const hudSeed = required<HTMLElement>('hud-seed')
const hudState = required<HTMLElement>('hud-state')
const runTime = required<HTMLElement>('run-time')
const runKills = required<HTMLElement>('run-kills')
const runHp = required<HTMLElement>('run-hp')
const runStyle = required<HTMLElement>('run-style')
const bootStatus = required<HTMLElement>('boot-status')

const app = new Application()
await app.init({
  width: WIDTH,
  height: HEIGHT,
  background: '#030206',
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
})
stage.appendChild(app.canvas)
app.canvas.style.cursor = 'crosshair'
app.canvas.tabIndex = 0

const camera = new Container()
const worldRoot = new Container()
const floorLayer = new Container()
const decalLayer = new Container()
const propLayer = new Container()
const actorLayer = new Container()
const debrisLayer = new Container()
const particleLayer = new Container()
const impactLayer = new Container()
const lightingLayer = new Container()
const screenFxLayer = new Container()

worldRoot.position.set(WORLD_SCREEN_X, WORLD_SCREEN_Y)
worldRoot.scale.set(WORLD_SCALE)
worldRoot.addChild(floorLayer, decalLayer, propLayer, actorLayer, debrisLayer, particleLayer, impactLayer)
camera.addChild(worldRoot)
app.stage.addChild(camera, lightingLayer, screenFxLayer)
actorLayer.sortableChildren = true

const randState = { value: 0x51f15e }
function rand(): number {
  randState.value = (Math.imul(randState.value, 1664525) + 1013904223) >>> 0
  return randState.value / 4294967296
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}

function radialGlow(radius: number, color: number, alpha: number) {
  const root = new Container()
  root.blendMode = 'add'
  for (let i = 12; i >= 1; i -= 1) {
    const p = i / 12
    root.addChild(new Graphics().circle(0, 0, radius * p).fill({ color, alpha: alpha * (1 - p) * 0.21 }))
  }
  return root
}

function addEnvironment(): void {
  const mazeWidth = MAZE_GRID[0].length * MAZE_CELL_SIZE
  const mazeHeight = MAZE_GRID.length * MAZE_CELL_SIZE

  floorLayer.addChild(
    new Graphics()
      .roundRect(MAZE_ORIGIN_X - 24, MAZE_ORIGIN_Y - 24, mazeWidth + 48, mazeHeight + 48, 18)
      .fill({ color: 0x08060c })
      .stroke({ color: 0x3c2454, width: 3, alpha: 0.85 }),
  )

  const tiles = new Graphics()
  for (let row = 0; row < MAZE_GRID.length; row += 1) {
    for (let col = 0; col < MAZE_GRID[row].length; col += 1) {
      const x = MAZE_ORIGIN_X + col * MAZE_CELL_SIZE
      const y = MAZE_ORIGIN_Y + row * MAZE_CELL_SIZE
      if (MAZE_GRID[row][col] === '#') {
        tiles.roundRect(x + 2, y + 2, MAZE_CELL_SIZE - 4, MAZE_CELL_SIZE - 4, 7)
          .fill({ color: (row + col) % 2 === 0 ? 0x21172a : 0x1a1321 })
          .stroke({ color: 0x5b3b70, width: 1.2, alpha: 0.66 })
        tiles.rect(x + 7, y + 8, MAZE_CELL_SIZE - 14, 4).fill({ color: 0x9b63b8, alpha: 0.06 })
      } else {
        tiles.rect(x + 2, y + 2, MAZE_CELL_SIZE - 4, MAZE_CELL_SIZE - 4)
          .fill({ color: (row + col) % 2 === 0 ? 0x100c14 : 0x0d0a11 })
          .stroke({ color: 0x2c2033, width: 0.7, alpha: 0.72 })
      }
    }
  }
  floorLayer.addChild(tiles)

  const grime = new Graphics()
  for (let i = 0; i < 250; i += 1) {
    const x = MAZE_ORIGIN_X + 12 + rand() * (mazeWidth - 24)
    const y = MAZE_ORIGIN_Y + 12 + rand() * (mazeHeight - 24)
    grime.circle(x, y, 1 + rand() * 7).fill({ color: rand() > 0.84 ? 0x6b1531 : 0x3b2b43, alpha: 0.035 + rand() * 0.11 })
  }
  floorLayer.addChild(grime)

  const exitGlow = radialGlow(42, 0x7effa4, 0.6)
  exitGlow.position.set(MAZE_EXIT.x, MAZE_EXIT.y)
  exitGlow.alpha = 0.34
  floorLayer.addChild(exitGlow)

  const sign = new Text({
    text: 'DISTRICT 06 // NO EVAC',
    style: { fontFamily: 'monospace', fontSize: 12, fontWeight: '700', fill: 0xd2b5e8, letterSpacing: 2 },
  })
  sign.anchor.set(0.5)
  sign.position.set(0, MAZE_ORIGIN_Y - 40)
  floorLayer.addChild(sign)

  for (let i = 0; i < 34; i += 1) {
    const side = i % 2 === 0 ? -1 : 1
    const distant = new Graphics()
      .ellipse(0, 10, 18 + rand() * 11, 8).fill({ color: 0x000000, alpha: 0.38 })
      .circle(0, 0, 6 + rand() * 3).fill({ color: 0x24172d, alpha: 0.7 })
    distant.position.set(side * (mazeWidth / 2 + 42 + rand() * 125), MAZE_ORIGIN_Y + rand() * mazeHeight)
    floorLayer.addChild(distant)
  }
}

addEnvironment()

const [survivorTexture, swordTexture, zombieTexture, heavyTexture, bloodTexture, gibTextureA, gibTextureB, gibTextureC] = await Promise.all([
  Assets.load('./assets/characters/survivor/survivor.svg'),
  Assets.load('./assets/characters/apple-inu/sword.png'),
  Assets.load('./assets/enemies/zombies/walker.png'),
  Assets.load('./assets/enemies/zombies/heavy.png'),
  Assets.load('./assets/gore/decals/trail-4.png'),
  Assets.load('./assets/gore/gibs/meat-1.png'),
  Assets.load('./assets/gore/gibs/meat-7.png'),
  Assets.load('./assets/gore/gibs/meat-12.png'),
])

const sfx = new Sfx()
let state = new GameState(0xabad1dea)
let fixed = new FixedTick()
let terms = createTerms()
let replay: InputState[] = []
let running = false
let finished = false
let hitStopMs = 0
let cameraShake = 0
let flash = 0
let damageFlash = 0
let blastLightPower = 0
let lastBlastScreenX = WORLD_SCREEN_X
let lastBlastScreenY = WORLD_SCREEN_Y
let rapierStatus = 'LOADING'

const player = new Container()
const playerShadow = new Graphics().ellipse(0, 24, 55, 18).fill({ color: 0x000000, alpha: 0.5 })
const survivor = new Sprite(survivorTexture)
survivor.anchor.set(0.5)
survivor.scale.set(0.28)
survivor.position.set(0, -8)
const weaponRig = new Container()
const sword = new Sprite(swordTexture)
sword.anchor.set(0.08, 0.5)
sword.position.set(14, 0)
sword.scale.set(1.45)
weaponRig.addChild(sword)
player.addChild(playerShadow, survivor, weaponRig)
actorLayer.addChild(player)

const enemyViews: Array<{ holder: any; shadow: any; sprite: any }> = []
const enemyViewById = new Map<number, { holder: any; shadow: any; sprite: any }>()
for (let i = 0; i < state.enemies.items.length; i += 1) {
  const holder = new Container()
  const shadow = new Graphics().ellipse(0, 15, 42, 12).fill({ color: 0x000000, alpha: 0.43 })
  const sprite = new Sprite(zombieTexture)
  sprite.anchor.set(0.5)
  holder.addChild(shadow, sprite)
  holder.visible = false
  actorLayer.addChild(holder)
  enemyViews.push({ holder, shadow, sprite })
}

const propViews: Array<{ holder: any; body: any; hpBar: any }> = []
for (const prop of state.props) {
  const holder = new Container()
  const body = new Graphics()
  const hpBar = new Graphics()
  holder.addChild(body, hpBar)
  propLayer.addChild(holder)
  propViews.push({ holder, body, hpBar })
}

const particleDot = new Graphics().circle(5, 5, 4).fill({ color: 0xffffff })
const particleTexture = app.renderer.generateTexture(particleDot)
const particlePool: Array<{ sprite: any; vx: number; vy: number; life: number; maxLife: number; gravity: number; spin: number }> = []
let particleCursor = 0
for (let i = 0; i < 1200; i += 1) {
  const sprite = new Sprite(particleTexture)
  sprite.anchor.set(0.5)
  sprite.visible = false
  particleLayer.addChild(sprite)
  particlePool.push({ sprite, vx: 0, vy: 0, life: 0, maxLife: 0, gravity: 0, spin: 0 })
}

const decals: any[] = []
const gibs: Array<{ sprite: any; vx: number; vy: number; life: number; spin: number }> = []
const impactRings: Array<{ ring: any; life: number; maxLife: number }> = []
const floatingText: Array<{ text: any; life: number; vy: number }> = []

function spawnParticles(x: number, y: number, count: number, massacre = false): void {
  const palette = massacre
    ? [0x6b0e2b, 0xb81642, 0xff315f, 0xff9bb4, 0xc178ff, 0xffffff]
    : [0x6b0e2b, 0xa5163b, 0xe22e58, 0xff7695]
  for (let i = 0; i < Math.min(count, particlePool.length); i += 1) {
    const p = particlePool[particleCursor]
    particleCursor = (particleCursor + 1) % particlePool.length
    const angle = rand() * Math.PI * 2
    const speed = 55 + rand() * (massacre ? 500 : 280)
    p.sprite.visible = true
    p.sprite.position.set(x + (rand() - 0.5) * 12, y + (rand() - 0.5) * 12)
    p.sprite.scale.set(0.18 + rand() * (massacre ? 1.1 : 0.65))
    p.sprite.tint = palette[Math.floor(rand() * palette.length)]
    p.sprite.alpha = 0.95
    p.vx = Math.cos(angle) * speed
    p.vy = Math.sin(angle) * speed
    p.maxLife = p.life = 0.45 + rand() * (massacre ? 1.5 : 0.8)
    p.gravity = 80 + rand() * 180
    p.spin = (rand() - 0.5) * 12
  }
}

function spawnDecal(x: number, y: number, heavy = false): void {
  const blood = new Sprite(bloodTexture)
  blood.anchor.set(0.5)
  blood.position.set(x, y)
  blood.rotation = rand() * Math.PI * 2
  blood.scale.set((heavy ? 0.7 : 0.4) + rand() * (heavy ? 1.3 : 0.7))
  blood.tint = rand() > 0.18 ? 0x8e1533 : 0x4e0e25
  blood.alpha = 0.28 + rand() * 0.42
  decalLayer.addChild(blood)
  decals.push(blood)
  while (decals.length > 180) {
    const old = decals.shift()
    old?.destroy()
  }
}

function spawnGibs(x: number, y: number, count: number): void {
  const textures = [gibTextureA, gibTextureB, gibTextureC]
  for (let i = 0; i < count; i += 1) {
    const sprite = new Sprite(textures[i % textures.length])
    sprite.anchor.set(0.5)
    sprite.position.set(x, y)
    sprite.scale.set(0.9 + rand() * 1.5)
    sprite.tint = 0xc1284b
    debrisLayer.addChild(sprite)
    const angle = rand() * Math.PI * 2
    const speed = 45 + rand() * 240
    gibs.push({ sprite, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.2 + rand() * 1.8, spin: (rand() - 0.5) * 10 })
  }
  while (gibs.length > 90) {
    const old = gibs.shift()
    old?.sprite.destroy()
  }
}

function spawnRing(x: number, y: number, massacre = false): void {
  const ring = new Graphics().circle(0, 0, massacre ? 26 : 16).stroke({ color: massacre ? 0xffc1ce : 0xff5478, width: massacre ? 5 : 3, alpha: 0.95 })
  ring.position.set(x, y)
  impactLayer.addChild(ring)
  impactRings.push({ ring, life: massacre ? 0.55 : 0.32, maxLife: massacre ? 0.55 : 0.32 })
}

function popText(x: number, y: number, copy: string, big = false): void {
  const text = new Text({
    text: copy,
    style: {
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize: big ? 29 : 15,
      fontWeight: '900',
      fill: big ? 0xffd9e3 : 0xff7191,
      stroke: { color: 0x160913, width: big ? 6 : 4 },
      letterSpacing: big ? 1 : 0,
    },
  })
  text.anchor.set(0.5)
  text.position.set(x, y)
  impactLayer.addChild(text)
  floatingText.push({ text, life: big ? 0.9 : 0.55, vy: big ? -45 : -28 })
}

const darkness = new Graphics().rect(0, 0, WIDTH, HEIGHT).fill({ color: 0x020104, alpha: 0.38 })
const playerLight = radialGlow(175, 0x8c4cff, 0.75)
const emergencyLightA = radialGlow(245, 0xff214f, 0.44)
const emergencyLightB = radialGlow(210, 0x5d3cff, 0.34)
const blastLight = radialGlow(270, 0xffa75f, 0.82)
emergencyLightA.position.set(1120, 175)
emergencyLightB.position.set(120, 560)
blastLight.alpha = 0
lightingLayer.addChild(darkness, playerLight, emergencyLightA, emergencyLightB, blastLight)

const flashOverlay = new Graphics().rect(0, 0, WIDTH, HEIGHT).fill({ color: 0xffe5dc, alpha: 1 })
const damageOverlay = new Graphics().rect(8, 8, WIDTH - 16, HEIGHT - 16).stroke({ color: 0xff2451, width: 24, alpha: 1 })
flashOverlay.alpha = 0
damageOverlay.alpha = 0
screenFxLayer.addChild(flashOverlay, damageOverlay)

let RAPIER: any = null
let physicsWorld: any = null
const physicsDebris: Array<{ body: any; sprite: any }> = []
const PX_PER_M = 55

async function initRapier(): Promise<void> {
  try {
    const mod = await import(/* @vite-ignore */ RAPIER_URL)
    RAPIER = mod.default ?? mod
    if (typeof RAPIER.init === 'function') await RAPIER.init()
    physicsWorld = new RAPIER.World({ x: 0, y: 0 })
    const halfW = (MAZE_GRID[0].length * MAZE_CELL_SIZE) / 2
    const halfH = (MAZE_GRID.length * MAZE_CELL_SIZE) / 2
    const addWall = (x: number, y: number, hx: number, hy: number) => {
      const body = physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y))
      physicsWorld.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy), body)
    }
    addWall(0, -(halfH + 10) / PX_PER_M, halfW / PX_PER_M, 0.2)
    addWall(0, (halfH + 10) / PX_PER_M, halfW / PX_PER_M, 0.2)
    addWall(-(halfW + 10) / PX_PER_M, 0, 0.2, halfH / PX_PER_M)
    addWall((halfW + 10) / PX_PER_M, 0, 0.2, halfH / PX_PER_M)

    for (let i = 0; i < 30; i += 1) {
      const x = MAZE_ORIGIN_X + 90 + rand() * (MAZE_GRID[0].length * MAZE_CELL_SIZE - 180)
      const y = MAZE_ORIGIN_Y + 90 + rand() * (MAZE_GRID.length * MAZE_CELL_SIZE - 180)
      const size = 5 + rand() * 9
      const body = physicsWorld.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x / PX_PER_M, y / PX_PER_M)
          .setRotation(rand() * Math.PI)
          .setLinearDamping(1.7)
          .setAngularDamping(1.8),
      )
      physicsWorld.createCollider(RAPIER.ColliderDesc.cuboid(size / PX_PER_M, size / PX_PER_M).setRestitution(0.58).setFriction(0.62), body)
      const sprite = new Graphics().roundRect(-size, -size, size * 2, size * 2, 2)
        .fill({ color: i % 5 === 0 ? 0x8e2648 : i % 3 === 0 ? 0x6b4b84 : 0x55453d })
        .stroke({ color: 0x140b16, width: 2, alpha: 0.9 })
      debrisLayer.addChild(sprite)
      physicsDebris.push({ body, sprite })
    }
    rapierStatus = 'READY'
  } catch (error) {
    rapierStatus = `FX PHYSICS DEGRADED: ${error instanceof Error ? error.message : String(error)}`
  }
}

function physicsBlast(x: number, y: number, strength = 4.5): void {
  if (!physicsWorld) return
  const bx = x / PX_PER_M
  const by = y / PX_PER_M
  for (const item of physicsDebris) {
    const p = item.body.translation()
    const dx = p.x - bx
    const dy = p.y - by
    const distance = Math.max(0.35, Math.hypot(dx, dy))
    if (distance > 5.5) continue
    const impulse = Math.min(5.6, strength / distance)
    item.body.applyImpulse({ x: (dx / distance) * impulse, y: (dy / distance) * impulse }, true)
    item.body.applyTorqueImpulse((rand() - 0.5) * 4.2, true)
  }
}

void initRapier().finally(() => {
  bootStatus.textContent = rapierStatus === 'READY' ? 'PIXI + REPLAY + FX PHYSICS READY' : `PIXI + REPLAY READY // ${rapierStatus}`
  setTimeout(() => bootStatus.classList.add('hidden'), 2500)
})

const keys = new Set<string>()
let pointerX = WORLD_SCREEN_X
let pointerY = WORLD_SCREEN_Y
let pointerActive = false
let queueSlash = false
let queueStab = false
let queueWhirlwind = false
let queueDodge = false
let queueDashRelease = false
let rightHeld = false

window.addEventListener('keydown', (event) => {
  keys.add(event.code)
  sfx.unlock()
  if (event.repeat) return
  if (event.code === 'Space') queueSlash = true
  if (event.code === 'KeyE') queueStab = true
  if (event.code === 'KeyQ') queueWhirlwind = true
  if (event.code === 'KeyC') queueDodge = true
})
window.addEventListener('keyup', (event) => {
  keys.delete(event.code)
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') queueDashRelease = true
})
app.canvas.addEventListener('pointermove', (event: PointerEvent) => {
  const rect = app.canvas.getBoundingClientRect()
  pointerX = ((event.clientX - rect.left) / rect.width) * WIDTH
  pointerY = ((event.clientY - rect.top) / rect.height) * HEIGHT
  pointerActive = true
})
app.canvas.addEventListener('pointerdown', (event: PointerEvent) => {
  sfx.unlock()
  if (event.button === 0) queueSlash = true
  if (event.button === 2) rightHeld = true
})
app.canvas.addEventListener('pointerup', (event: PointerEvent) => {
  if (event.button === 2) {
    rightHeld = false
    queueDashRelease = true
  }
})
app.canvas.addEventListener('contextmenu', (event: Event) => event.preventDefault())

acceptButton.addEventListener('click', () => startJob())
againButton.addEventListener('click', () => {
  terms = createTerms()
  showMission()
})

function createTerms(): SurvivalContractTerms {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  const seed = values[0] >>> 0
  return {
    version: 0,
    contractId: `JOB-${seed.toString(16).toUpperCase().padStart(8, '0')}`,
    objective: 'survive',
    seed,
    minTicks: MIN_TICKS,
    maxTicks: MAX_TICKS,
    minKills: MIN_KILLS,
    rewardAtomic: '25000000',
  }
}

function showMission(): void {
  running = false
  finished = false
  document.body.classList.remove('running', 'verified', 'failed')
  missionScreen.classList.remove('hidden')
  resultScreen.classList.add('hidden')
  hudContract.textContent = terms.contractId
  hudSeed.textContent = 'SEED HIDDEN'
  hudState.textContent = 'OPEN'
  runTime.textContent = 'T 0.0s / 15.0s'
  runKills.textContent = `KILLS 0/${MIN_KILLS}`
  runHp.textContent = 'HP —'
  runStyle.textContent = 'STYLE D'
}

function startJob(): void {
  sfx.unlock()
  state = new GameState(terms.seed)
  fixed = new FixedTick()
  replay = []
  running = true
  finished = false
  hitStopMs = 0
  cameraShake = 0
  flash = 0
  damageFlash = 0
  decals.splice(0).forEach((item) => item.destroy())
  for (const item of gibs.splice(0)) item.sprite.destroy()
  for (const item of floatingText.splice(0)) item.text.destroy()
  for (const item of impactRings.splice(0)) item.ring.destroy()
  document.body.classList.remove('verified', 'failed')
  document.body.classList.add('running')
  missionScreen.classList.add('hidden')
  resultScreen.classList.add('hidden')
  hudContract.textContent = terms.contractId
  hudSeed.textContent = `SEED 0x${terms.seed.toString(16).padStart(8, '0')}`
  hudState.textContent = 'ACCEPTED // RECORDING'
  app.canvas.focus()
  syncRenderState()
}

function scriptedInput(): InputState {
  const t = state.tick
  const active = state.enemies.items.filter((enemy) => enemy.active)
  let aim = state.player.facing
  if (active.length > 0) {
    let best = active[0]
    let bestDistance = Number.POSITIVE_INFINITY
    for (const enemy of active) {
      const distance = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y)
      if (distance < bestDistance) {
        best = enemy
        bestDistance = distance
      }
    }
    aim = Math.atan2(best.y - state.player.y, best.x - state.player.x)
  }
  return {
    x: Math.cos(t * 0.018),
    y: Math.sin(t * 0.023),
    aimRadians: aim,
    slash: t % 16 === 0,
    stab: t % 73 === 19,
    whirlwind: t % 145 === 40,
    dodge: t % 181 === 75,
    dashHeld: t % 220 >= 150 && t % 220 < 182,
    dashReleased: t % 220 === 182,
  }
}

function readInput(): InputState {
  if (AUTOTEST) return scriptedInput()
  const dashHeld = rightHeld || keys.has('ShiftLeft') || keys.has('ShiftRight')
  const input: InputState = {
    x: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
    y: Number(keys.has('KeyS')) - Number(keys.has('KeyW')),
    slash: queueSlash,
    stab: queueStab,
    whirlwind: queueWhirlwind,
    dodge: queueDodge,
    dashHeld,
    dashReleased: queueDashRelease && !dashHeld,
  }
  if (pointerActive) {
    const worldPointerX = (pointerX - WORLD_SCREEN_X) / WORLD_SCALE
    const worldPointerY = (pointerY - WORLD_SCREEN_Y) / WORLD_SCALE
    input.aimRadians = Math.atan2(worldPointerY - state.player.y, worldPointerX - state.player.x)
  }
  queueSlash = false
  queueStab = false
  queueWhirlwind = false
  queueDodge = false
  queueDashRelease = false
  return input
}

function processEvents(events: readonly SimEvent[]): void {
  let hitCount = 0
  let killCount = 0
  for (const event of events) {
    if (event.type === 'enemy-hit' || event.type === 'physics-impact') {
      hitCount += 1
      if (event.killed) killCount += 1
    }
  }
  const profile = getImpactProfile(hitCount, killCount)
  if (profile.hitStopMs > 0) hitStopMs = Math.max(hitStopMs, profile.hitStopMs)
  if (profile.shakeIntensity > 0) cameraShake = Math.max(cameraShake, profile.shakeIntensity * 2700)
  if (profile.sfxWeight !== 'none') sfx.hit(profile.sfxWeight)

  for (const event of events) {
    if (event.type === 'weapon-attack') {
      sfx.sword(event.attack)
      spawnRing(event.x, event.y, event.attack === 'whirlwind' || event.attack === 'dash')
      if (event.attack === 'whirlwind') {
        popText(event.x, event.y - 38, 'FUCK AROUND / FIND OUT', true)
        flash = Math.max(flash, 0.28)
      }
    }
    if (event.type === 'enemy-hit') {
      spawnParticles(event.x, event.y, event.killed ? 95 : 34, event.killed)
      spawnRing(event.x, event.y, event.killed)
      if (event.killed) {
        spawnDecal(event.x, event.y, true)
        spawnGibs(event.x, event.y, 3 + Math.floor(rand() * 4))
        popText(event.x, event.y - 25, state.comboKills >= 5 ? `CHAIN x${state.comboKills}` : 'DEAD', state.comboKills >= 5)
        flash = Math.max(flash, state.comboKills >= 5 ? 0.42 : 0.24)
        blastLightPower = Math.max(blastLightPower, state.comboKills >= 5 ? 0.95 : 0.6)
        const screen = worldToScreen(event.x, event.y)
        lastBlastScreenX = screen.x
        lastBlastScreenY = screen.y
        physicsBlast(event.x, event.y, state.comboKills >= 5 ? 6.2 : 4.4)
      }
    }
    if (event.type === 'physics-impact' && event.killed) {
      spawnDecal(event.x, event.y, true)
      spawnParticles(event.x, event.y, 150, true)
      spawnGibs(event.x, event.y, 5)
      popText(event.x, event.y - 30, 'WALL MEAT', true)
      cameraShake = Math.max(cameraShake, 13)
      flash = Math.max(flash, 0.5)
      physicsBlast(event.x, event.y, 6.4)
    }
    if (event.type === 'prop-hit' && event.broken) {
      spawnParticles(event.x, event.y, 65, true)
      physicsBlast(event.x, event.y, 5.2)
      popText(event.x, event.y - 20, `${event.material.toUpperCase()} GONE`)
    }
    if (event.type === 'player-hit') {
      damageFlash = 1
      cameraShake = Math.max(cameraShake, 8)
      sfx.hurt()
    }
    if (event.type === 'style-rank') {
      popText(state.player.x, state.player.y - 52, `${event.rank} // ${event.label}`, true)
    }
    if (event.type === 'combo-tier' && event.comboKills >= 5) {
      popText(state.player.x, state.player.y - 70, `KILL CHAIN ${event.comboKills}`, true)
    }
    if (event.type === 'maze-exit-unlocked') {
      popText(MAZE_EXIT.x, MAZE_EXIT.y - 34, 'EXIT UNLOCKED', true)
    }
  }
}

function worldToScreen(x: number, y: number): { x: number; y: number } {
  return { x: WORLD_SCREEN_X + x * WORLD_SCALE, y: WORLD_SCREEN_Y + y * WORLD_SCALE }
}

function finishJob(): void {
  if (finished) return
  finished = true
  running = false
  const proof = createReplayProof(terms, RUNNER, replay)
  const verified = verifyReplay(terms, proof, RUNNER)

  resultScreen.classList.remove('hidden', 'pass', 'fail')
  if (verified.ok) {
    const receipt = verified.receipt
    document.body.classList.remove('running', 'failed')
    document.body.classList.add('verified')
    resultScreen.classList.add('pass')
    resultKicker.textContent = 'REPLAY VERIFIED // PAYOUT GATE OPEN'
    resultTitle.textContent = 'CONTRACT VERIFIED'
    resultReceipt.textContent = [
      `contract    ${receipt.contractId}`,
      `runner      ${receipt.runner}`,
      `seed        0x${receipt.seed.toString(16).padStart(8, '0')}`,
      `ticks       ${receipt.ticks}`,
      `kills       ${receipt.kills}`,
      `score       ${receipt.score}`,
      `resultHash  ${receipt.resultHash}`,
      '',
      'This preview does not submit a wallet transaction.',
      'This verified receipt is the object the escrow settlement layer consumes.',
    ].join('\n')
    hudState.textContent = 'VERIFIED // WOULD PAY'
    flash = 1
    cameraShake = 12
  } else {
    document.body.classList.remove('running', 'verified')
    document.body.classList.add('failed')
    resultScreen.classList.add('fail')
    resultKicker.textContent = 'REPLAY REJECTED // ESCROW STAYS LOCKED'
    resultTitle.textContent = 'BOUNTY FAILED'
    resultReceipt.textContent = [
      `contract    ${terms.contractId}`,
      `reason      ${verified.reason}`,
      `ticks       ${replay.length}`,
      `kills       ${state.kills}`,
      `resultHash  ${proof.claimedResultHash}`,
      '',
      'No valid receipt. No payout authorization.',
    ].join('\n')
    hudState.textContent = `REJECTED // ${verified.reason}`
    damageFlash = 1
  }
}

function syncRenderState(): void {
  player.position.set(state.player.x, state.player.y)
  player.zIndex = Math.round(state.player.y + 1000)
  survivor.rotation = state.player.facing + Math.PI / 2
  survivor.alpha = state.dodgeInvulnerable() || state.player.invulnerableTicks > 0 ? 0.56 : 1
  weaponRig.rotation = state.player.facing

  enemyViewById.clear()
  for (let i = 0; i < enemyViews.length; i += 1) {
    const enemy = state.enemies.items[i]
    const view = enemyViews[i]
    if (!enemy?.active) {
      view.holder.visible = false
      continue
    }
    view.holder.visible = true
    view.holder.position.set(enemy.x, enemy.y)
    view.holder.zIndex = Math.round(enemy.y)
    view.holder.rotation = Math.atan2(enemy.vy, enemy.vx) + Math.sin((state.tick + enemy.id * 9) * 0.08) * 0.035
    view.sprite.texture = enemy.mass > 1.35 ? heavyTexture : zombieTexture
    view.sprite.scale.set((enemy.radius / 24) * (enemy.mass > 1.35 ? 0.86 : 0.78))
    view.sprite.tint = enemy.staggerTicks > 0 ? 0xffc4d2 : enemy.mass > 1.35 ? 0xd4a9bf : 0xc1b0cf
    view.shadow.scale.set(enemy.mass > 1.35 ? 1.28 : 1)
    enemyViewById.set(enemy.id, view)
  }

  for (let i = 0; i < propViews.length; i += 1) {
    const prop = state.props[i]
    const view = propViews[i]
    view.holder.visible = prop.active
    if (!prop.active) continue
    view.holder.position.set(prop.x, prop.y)
    view.body.clear()
    view.body.roundRect(-prop.radius, -prop.radius, prop.radius * 2, prop.radius * 2, 4)
      .fill({ color: prop.material === 'metal' ? 0x565768 : prop.material === 'glass' ? 0x344f5b : 0x634537 })
      .stroke({ color: prop.material === 'glass' ? 0x83d5ea : 0x140c15, width: 2, alpha: 0.9 })
    view.hpBar.clear()
    view.hpBar.rect(-prop.radius, -prop.radius - 7, prop.radius * 2, 3).fill({ color: 0x191019, alpha: 0.9 })
    view.hpBar.rect(-prop.radius, -prop.radius - 7, prop.radius * 2 * (prop.hp / prop.maxHp), 3).fill({ color: 0xff4f76, alpha: 0.85 })
  }

  const playerScreen = worldToScreen(state.player.x, state.player.y)
  playerLight.position.set(playerScreen.x, playerScreen.y)
  blastLight.position.set(lastBlastScreenX, lastBlastScreenY)

  runTime.textContent = `T ${(state.tick / 60).toFixed(1)}s / 15.0s`
  runKills.textContent = `KILLS ${state.kills}/${MIN_KILLS}`
  runHp.textContent = `HP ${state.player.hp}`
  runStyle.textContent = `STYLE ${state.styleRank()} // ${state.styleLabel()}`
}

function updatePresentation(dt: number): void {
  for (const particle of particlePool) {
    if (particle.life <= 0) continue
    particle.life -= dt
    if (particle.life <= 0) {
      particle.sprite.visible = false
      continue
    }
    particle.vx *= Math.pow(0.18, dt)
    particle.vy *= Math.pow(0.22, dt)
    particle.vy += particle.gravity * dt
    particle.sprite.x += particle.vx * dt
    particle.sprite.y += particle.vy * dt
    particle.sprite.rotation += particle.spin * dt
    particle.sprite.alpha = clamp((particle.life / particle.maxLife) * 1.4, 0, 1)
  }

  for (let i = gibs.length - 1; i >= 0; i -= 1) {
    const gib = gibs[i]
    gib.life -= dt
    gib.vx *= Math.pow(0.12, dt)
    gib.vy *= Math.pow(0.18, dt)
    gib.vy += 130 * dt
    gib.sprite.x += gib.vx * dt
    gib.sprite.y += gib.vy * dt
    gib.sprite.rotation += gib.spin * dt
    gib.sprite.alpha = clamp(gib.life, 0, 1)
    if (gib.life <= 0) {
      gib.sprite.destroy()
      gibs.splice(i, 1)
    }
  }

  for (let i = impactRings.length - 1; i >= 0; i -= 1) {
    const item = impactRings[i]
    item.life -= dt
    const progress = 1 - item.life / item.maxLife
    item.ring.scale.set(1 + progress * 3.6)
    item.ring.alpha = clamp(1 - progress, 0, 1)
    if (item.life <= 0) {
      item.ring.destroy()
      impactRings.splice(i, 1)
    }
  }

  for (let i = floatingText.length - 1; i >= 0; i -= 1) {
    const item = floatingText[i]
    item.life -= dt
    item.text.y += item.vy * dt
    item.text.alpha = clamp(item.life * 1.8, 0, 1)
    item.text.scale.set(1 + Math.max(0, 0.4 - item.life) * 0.2)
    if (item.life <= 0) {
      item.text.destroy()
      floatingText.splice(i, 1)
    }
  }

  if (physicsWorld) {
    physicsWorld.step()
    for (const item of physicsDebris) {
      const position = item.body.translation()
      item.sprite.position.set(position.x * PX_PER_M, position.y * PX_PER_M)
      item.sprite.rotation = item.body.rotation()
    }
  }

  const t = performance.now() / 1000
  emergencyLightA.alpha = 0.72 + Math.sin(t * 7.4) * 0.14
  emergencyLightB.alpha = 0.48 + Math.sin(t * 4.9 + 1.4) * 0.1
  blastLight.alpha = blastLightPower * 0.72
  blastLightPower *= Math.pow(0.018, dt)

  if (cameraShake > 0.08) {
    camera.position.set((rand() - 0.5) * cameraShake, (rand() - 0.5) * cameraShake)
    cameraShake *= Math.pow(0.015, dt)
  } else {
    camera.position.set(0, 0)
    cameraShake = 0
  }

  flashOverlay.alpha = flash * 0.22
  flash *= Math.pow(0.008, dt)
  damageOverlay.alpha = damageFlash * 0.34
  damageFlash *= Math.pow(0.02, dt)

  survivor.y = -8 + Math.sin(t * 5.3) * 1.5
}

app.ticker.add((ticker: { deltaMS: number }) => {
  const deltaMs = Math.min(100, ticker.deltaMS)
  const dt = deltaMs / 1000

  if (hitStopMs > 0) {
    hitStopMs = Math.max(0, hitStopMs - deltaMs)
  } else if (running && !finished) {
    fixed.advance(deltaMs, () => {
      const input = readInput()
      replay.push({ ...input })
      state.step(input)
      processEvents(state.events)

      const objectiveMet = state.tick >= terms.minTicks && state.kills >= terms.minKills
      const exhausted = replay.length >= terms.maxTicks
      if (objectiveMet || state.ended || exhausted) finishJob()
    })
  }

  syncRenderState()
  updatePresentation(dt)
})

showMission()
syncRenderState()
Object.assign(window, {
  __APOCALYPSE_READY__: true,
  __APOCALYPSE_MODE__: 'PIXI_C_CONTRACTS',
  __APOCALYPSE_RAPIER__: () => rapierStatus,
})

if (AUTOTEST) setTimeout(() => startJob(), 650)

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id}`)
  return element as T
}
