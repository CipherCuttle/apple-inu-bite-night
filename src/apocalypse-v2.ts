import './apocalypse-v2.css'
import { createReplayProof, verifyReplay, type SurvivalContractTerms } from './game/contracts/ApocalypseContracts'
import { GameState, type InputState, type SimEvent } from './game/sim/GameState'
import { FixedTick } from './game/sim/FixedTick'
import {
  MAZE_CELL_SIZE,
  MAZE_EXIT,
  MAZE_GRID,
  MAZE_ORIGIN_X,
  MAZE_ORIGIN_Y,
} from './game/world/Maze'
import { Sfx } from './presentation/Sfx'
import { getImpactProfile } from './presentation/CombatFeel'

const PIXI_URL = 'https://cdn.jsdelivr.net/npm/pixi.js@8.17.0/dist/pixi.mjs'
const RAPIER_URL = 'https://esm.sh/@dimforge/rapier2d-compat@0.20.0'
const PIXI = await import(/* @vite-ignore */ PIXI_URL)
const { Application, Assets, Container, Graphics, Sprite, Text } = PIXI

const WIDTH = 1280
const HEIGHT = 720
const WORLD_SCALE = 1.18
const WORLD_SCREEN_X = WIDTH / 2
const WORLD_SCREEN_Y = HEIGHT / 2 + 36
const MIN_TICKS = 15 * 60
const MAX_TICKS = 40 * 60
const MIN_KILLS = 3
const RUNNER = 'local-runner'
const AUTOTEST = new URLSearchParams(location.search).get('autotest') === '1'

type AttackKind = 'slash' | 'stab' | 'whirlwind' | 'dash'
interface ActiveAttack {
  kind: AttackKind
  elapsed: number
  duration: number
  facing: number
}
interface FadeLine {
  graphics: any
  life: number
  maxLife: number
}
interface Ghost {
  sprite: any
  life: number
  maxLife: number
  vx: number
  vy: number
}
interface Particle {
  sprite: any
  vx: number
  vy: number
  life: number
  maxLife: number
  gravity: number
  spin: number
}
interface Gib {
  sprite: any
  vx: number
  vy: number
  life: number
  spin: number
}
interface Floating {
  text: any
  life: number
  vy: number
}
interface RingFx {
  ring: any
  life: number
  maxLife: number
}

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
  background: '#020205',
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
const ghostLayer = new Container()
const trailLayer = new Container()
const debrisLayer = new Container()
const particleLayer = new Container()
const impactLayer = new Container()
const lightingLayer = new Container()
const screenFxLayer = new Container()

worldRoot.position.set(WORLD_SCREEN_X, WORLD_SCREEN_Y)
worldRoot.scale.set(WORLD_SCALE)
worldRoot.addChild(floorLayer, decalLayer, propLayer, ghostLayer, actorLayer, trailLayer, debrisLayer, particleLayer, impactLayer)
camera.addChild(worldRoot)
app.stage.addChild(camera, lightingLayer, screenFxLayer)
actorLayer.sortableChildren = true

const randState = { value: 0x514b1ade }
function rand(): number {
  randState.value = (Math.imul(randState.value, 1664525) + 1013904223) >>> 0
  return randState.value / 4294967296
}
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3)
}
function radialGlow(radius: number, color: number, alpha: number): any {
  const root = new Container()
  root.blendMode = 'add'
  for (let i = 12; i >= 1; i -= 1) {
    const p = i / 12
    root.addChild(new Graphics().circle(0, 0, radius * p).fill({ color, alpha: alpha * (1 - p) * 0.2 }))
  }
  return root
}
function cellXY(row: number, col: number): { x: number; y: number } {
  return {
    x: MAZE_ORIGIN_X + col * MAZE_CELL_SIZE,
    y: MAZE_ORIGIN_Y + row * MAZE_CELL_SIZE,
  }
}

function addEnvironment(): void {
  const mazeWidth = MAZE_GRID[0].length * MAZE_CELL_SIZE
  const mazeHeight = MAZE_GRID.length * MAZE_CELL_SIZE
  const left = MAZE_ORIGIN_X
  const top = MAZE_ORIGIN_Y

  floorLayer.addChild(
    new Graphics()
      .roundRect(left - 30, top - 30, mazeWidth + 60, mazeHeight + 60, 22)
      .fill({ color: 0x050508 })
      .stroke({ color: 0x291d33, width: 3, alpha: 0.95 }),
  )

  const asphalt = new Graphics()
    .rect(-20, top + 6, mazeWidth / 2 + 398, mazeHeight - 12)
    .fill({ color: 0x0c0d10 })
  floorLayer.addChild(asphalt)

  const storeFloor = new Graphics()
    .rect(left + 6, top + 6, 362, 314)
    .fill({ color: 0x151219 })
    .stroke({ color: 0x4a315b, width: 2, alpha: 0.85 })
  for (let x = left + 10; x < left + 360; x += 32) {
    storeFloor.moveTo(x, top + 8).lineTo(x, top + 316).stroke({ color: 0x2c2431, width: 1, alpha: 0.55 })
  }
  for (let y = top + 10; y < top + 316; y += 32) {
    storeFloor.moveTo(left + 8, y).lineTo(left + 360, y).stroke({ color: 0x2c2431, width: 1, alpha: 0.55 })
  }
  floorLayer.addChild(storeFloor)

  const parking = new Graphics()
  parking.rect(-42, top + 12, 448, mazeHeight - 24).fill({ color: 0x0b0c0f, alpha: 0.95 })
  for (let y = top + 60; y < top + mazeHeight - 34; y += 94) {
    for (let x = 10; x < 370; x += 92) {
      parking.moveTo(x, y).lineTo(x + 56, y).stroke({ color: 0xd7d0a4, width: 3, alpha: 0.18 })
    }
  }
  parking.moveTo(-22, top + 20).lineTo(-22, top + mazeHeight - 20).stroke({ color: 0xe08a51, width: 3, alpha: 0.23 })
  floorLayer.addChild(parking)

  const storefront = new Graphics()
  storefront.rect(-64, top + 14, 12, 278).fill({ color: 0x39263e })
  storefront.rect(-58, top + 54, 8, 58).fill({ color: 0x6dd8ff, alpha: 0.24 })
  storefront.rect(-58, top + 142, 8, 78).fill({ color: 0x6dd8ff, alpha: 0.18 })
  storefront.rect(-66, top + 124, 16, 18).fill({ color: 0x09070c })
  floorLayer.addChild(storefront)

  const signPlate = new Graphics()
    .roundRect(left + 38, top + 18, 250, 48, 7)
    .fill({ color: 0x100b13 })
    .stroke({ color: 0xdf4cff, width: 2.5, alpha: 0.9 })
  floorLayer.addChild(signPlate)
  const storeSign = new Text({
    text: 'NIGHTMART 24/7',
    style: { fontFamily: 'Arial Black, Impact, sans-serif', fontSize: 24, fontWeight: '900', fill: 0xff91ff, letterSpacing: 2 },
  })
  storeSign.anchor.set(0.5)
  storeSign.position.set(left + 163, top + 42)
  floorLayer.addChild(storeSign)

  const laneLabel = new Text({
    text: 'NO EVAC // AISLE 6',
    style: { fontFamily: 'monospace', fontSize: 11, fontWeight: '700', fill: 0x8d7d93, letterSpacing: 2 },
  })
  laneLabel.anchor.set(0.5)
  laneLabel.position.set(178, top + mazeHeight - 28)
  floorLayer.addChild(laneLabel)

  const staticDecor = new Graphics()
  staticDecor.roundRect(left + 56, top + 92, 104, 34, 5).fill({ color: 0x3c2735 }).stroke({ color: 0x845267, width: 2 })
  staticDecor.rect(left + 74, top + 78, 28, 15).fill({ color: 0x251d29 })
  for (let i = 0; i < 3; i += 1) {
    staticDecor.roundRect(left + 28 + i * 66, top + 246, 54, 52, 4)
      .fill({ color: 0x18232a })
      .stroke({ color: 0x67d6ef, width: 1.5, alpha: 0.6 })
    staticDecor.rect(left + 35 + i * 66, top + 254, 40, 5).fill({ color: 0x6ee8ff, alpha: 0.15 })
  }
  staticDecor.roundRect(70, top + 60, 96, 42, 11).fill({ color: 0x301f2c }).stroke({ color: 0x8a3c5b, width: 2 })
  staticDecor.roundRect(250, top + 260, 106, 44, 11).fill({ color: 0x252836 }).stroke({ color: 0x536483, width: 2 })
  for (const x of [-8, 22, 388]) {
    staticDecor.circle(x, top + 316, 7).fill({ color: 0xf25f45, alpha: 0.72 })
  }
  floorLayer.addChild(staticDecor)

  const obstacle = new Graphics()
  for (let row = 0; row < MAZE_GRID.length; row += 1) {
    for (let col = 0; col < MAZE_GRID[row].length; col += 1) {
      if (MAZE_GRID[row][col] !== '#') continue
      const { x, y } = cellXY(row, col)
      const border = row === 0 || row === MAZE_GRID.length - 1 || col === 0 || col === MAZE_GRID[0].length - 1
      if (border) {
        obstacle.rect(x + 2, y + 2, MAZE_CELL_SIZE - 4, MAZE_CELL_SIZE - 4)
          .fill({ color: 0x151019 })
          .stroke({ color: 0x4b3253, width: 1.5, alpha: 0.85 })
      } else if (col <= 5) {
        obstacle.roundRect(x + 6, y + 12, MAZE_CELL_SIZE - 12, MAZE_CELL_SIZE - 24, 5)
          .fill({ color: (row + col) % 2 ? 0x402b39 : 0x34252f })
          .stroke({ color: 0x7a5265, width: 2, alpha: 0.8 })
        for (let shelf = 0; shelf < 3; shelf += 1) {
          obstacle.rect(x + 12, y + 18 + shelf * 11, MAZE_CELL_SIZE - 24, 3)
            .fill({ color: shelf === 1 ? 0xb24e72 : 0x8d785f, alpha: 0.55 })
        }
      } else {
        obstacle.roundRect(x + 5, y + 13, MAZE_CELL_SIZE - 10, MAZE_CELL_SIZE - 26, 14)
          .fill({ color: (row + col) % 2 ? 0x33202b : 0x202b37 })
          .stroke({ color: (row + col) % 2 ? 0x8d4260 : 0x4a6684, width: 2, alpha: 0.85 })
        obstacle.rect(x + 15, y + 18, MAZE_CELL_SIZE - 30, 12).fill({ color: 0x0b1016, alpha: 0.9 })
      }
    }
  }
  floorLayer.addChild(obstacle)

  const cracks = new Graphics()
  for (let i = 0; i < 70; i += 1) {
    const x = -40 + rand() * 440
    const y = top + 20 + rand() * (mazeHeight - 40)
    cracks.moveTo(x, y)
      .lineTo(x + (rand() - 0.5) * 26, y + (rand() - 0.5) * 18)
      .stroke({ color: 0x565057, width: 1, alpha: 0.18 })
  }
  floorLayer.addChild(cracks)

  const glass = new Graphics()
  for (let i = 0; i < 46; i += 1) {
    const x = -74 + rand() * 42
    const y = top + 80 + rand() * 170
    glass.moveTo(x, y).lineTo(x + 4 + rand() * 8, y + (rand() - 0.5) * 7)
      .stroke({ color: 0x9feeff, width: 1.1, alpha: 0.45 })
  }
  floorLayer.addChild(glass)

  const exitGlow = radialGlow(46, 0x79ff9f, 0.66)
  exitGlow.position.set(MAZE_EXIT.x, MAZE_EXIT.y)
  exitGlow.alpha = 0.38
  floorLayer.addChild(exitGlow)

  const fridgeGlow = radialGlow(118, 0x6fe8ff, 0.26)
  fridgeGlow.position.set(left + 130, top + 270)
  floorLayer.addChild(fridgeGlow)
  const signGlow = radialGlow(135, 0xe04dff, 0.24)
  signGlow.position.set(left + 160, top + 48)
  floorLayer.addChild(signGlow)
}
addEnvironment()

const [
  survivorTexture,
  swordTexture,
  zombieTexture,
  heavyTexture,
  bloodTexture,
  gibTextureA,
  gibTextureB,
  gibTextureC,
] = await Promise.all([
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
let activeAttack: ActiveAttack | null = null
let previousBladeTip: { x: number; y: number } | null = null
let stabImpulse = 0

const player = new Container()
const playerShadow = new Graphics().ellipse(0, 26, 58, 18).fill({ color: 0x000000, alpha: 0.5 })
const survivor = new Sprite(survivorTexture)
survivor.anchor.set(0.5)
survivor.scale.set(0.28)
survivor.position.set(0, -8)
const weaponRig = new Container()
const sword = new Sprite(swordTexture)
sword.anchor.set(0.08, 0.5)
sword.position.set(16, 0)
sword.scale.set(1.5)
weaponRig.addChild(sword)
player.addChild(playerShadow, survivor, weaponRig)
actorLayer.addChild(player)

const enemyViews: Array<{ holder: any; shadow: any; sprite: any }> = []
for (let i = 0; i < state.enemies.items.length; i += 1) {
  const holder = new Container()
  const shadow = new Graphics().ellipse(0, 16, 43, 12).fill({ color: 0x000000, alpha: 0.45 })
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
const particlePool: Particle[] = []
let particleCursor = 0
for (let i = 0; i < 1500; i += 1) {
  const sprite = new Sprite(particleTexture)
  sprite.anchor.set(0.5)
  sprite.visible = false
  particleLayer.addChild(sprite)
  particlePool.push({ sprite, vx: 0, vy: 0, life: 0, maxLife: 0, gravity: 0, spin: 0 })
}

const decals: any[] = []
const gibs: Gib[] = []
const rings: RingFx[] = []
const floating: Floating[] = []
const fadeLines: FadeLine[] = []
const ghosts: Ghost[] = []

function spawnParticles(x: number, y: number, count: number, massacre = false): void {
  const palette = massacre
    ? [0x6b0e2b, 0xb81642, 0xff315f, 0xff9bb4, 0xc178ff, 0xffffff]
    : [0x6b0e2b, 0xa5163b, 0xe22e58, 0xff7695]
  for (let i = 0; i < Math.min(count, particlePool.length); i += 1) {
    const p = particlePool[particleCursor]
    particleCursor = (particleCursor + 1) % particlePool.length
    const angle = rand() * Math.PI * 2
    const speed = 55 + rand() * (massacre ? 520 : 300)
    p.sprite.visible = true
    p.sprite.position.set(x + (rand() - 0.5) * 12, y + (rand() - 0.5) * 12)
    p.sprite.scale.set(0.18 + rand() * (massacre ? 1.1 : 0.66))
    p.sprite.tint = palette[Math.floor(rand() * palette.length)]
    p.sprite.alpha = 0.96
    p.vx = Math.cos(angle) * speed
    p.vy = Math.sin(angle) * speed
    p.maxLife = p.life = 0.4 + rand() * (massacre ? 1.5 : 0.85)
    p.gravity = 75 + rand() * 190
    p.spin = (rand() - 0.5) * 13
  }
}

function spawnDirectionalBlood(x: number, y: number, facing: number, count: number, wide = false): void {
  for (let i = 0; i < count; i += 1) {
    const p = particlePool[particleCursor]
    particleCursor = (particleCursor + 1) % particlePool.length
    const angle = facing + (rand() - 0.5) * (wide ? 1.0 : 0.34)
    const speed = 170 + rand() * (wide ? 410 : 560)
    p.sprite.visible = true
    p.sprite.position.set(x, y)
    p.sprite.scale.set(0.18 + rand() * 0.65, 0.12 + rand() * 0.28)
    p.sprite.rotation = angle
    p.sprite.tint = rand() > 0.12 ? 0xe22954 : 0xffb0c0
    p.sprite.alpha = 1
    p.vx = Math.cos(angle) * speed
    p.vy = Math.sin(angle) * speed
    p.maxLife = p.life = 0.35 + rand() * 0.75
    p.gravity = 65 + rand() * 120
    p.spin = (rand() - 0.5) * 2
  }
}

function spawnDecal(x: number, y: number, heavy = false): void {
  const blood = new Sprite(bloodTexture)
  blood.anchor.set(0.5)
  blood.position.set(x, y)
  blood.rotation = rand() * Math.PI * 2
  blood.scale.set((heavy ? 0.72 : 0.42) + rand() * (heavy ? 1.4 : 0.75))
  blood.tint = rand() > 0.18 ? 0x8e1533 : 0x4e0e25
  blood.alpha = 0.28 + rand() * 0.45
  decalLayer.addChild(blood)
  decals.push(blood)
  while (decals.length > 190) decals.shift()?.destroy()
}

function spawnGibs(x: number, y: number, count: number): void {
  const textures = [gibTextureA, gibTextureB, gibTextureC]
  for (let i = 0; i < count; i += 1) {
    const sprite = new Sprite(textures[i % textures.length])
    sprite.anchor.set(0.5)
    sprite.position.set(x, y)
    sprite.scale.set(0.9 + rand() * 1.55)
    sprite.tint = 0xc1284b
    debrisLayer.addChild(sprite)
    const angle = rand() * Math.PI * 2
    const speed = 50 + rand() * 255
    gibs.push({ sprite, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.25 + rand() * 1.85, spin: (rand() - 0.5) * 10 })
  }
  while (gibs.length > 100) gibs.shift()?.sprite.destroy()
}

function spawnRing(x: number, y: number, strong = false): void {
  const ring = new Graphics().circle(0, 0, strong ? 28 : 16)
    .stroke({ color: strong ? 0xffd4df : 0xff5478, width: strong ? 5 : 3, alpha: 0.95 })
  ring.position.set(x, y)
  impactLayer.addChild(ring)
  rings.push({ ring, life: strong ? 0.52 : 0.3, maxLife: strong ? 0.52 : 0.3 })
}

function popText(x: number, y: number, copy: string, big = false): void {
  const text = new Text({
    text: copy,
    style: {
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize: big ? 28 : 15,
      fontWeight: '900',
      fill: big ? 0xffedf4 : 0xff7191,
      stroke: { color: 0x100910, width: big ? 6 : 4 },
      letterSpacing: big ? 1 : 0,
    },
  })
  text.anchor.set(0.5)
  text.position.set(x, y)
  impactLayer.addChild(text)
  floating.push({ text, life: big ? 0.85 : 0.52, vy: big ? -48 : -28 })
}

function addFadeLine(x1: number, y1: number, x2: number, y2: number, color: number, width: number, life: number, alpha = 1): void {
  const graphics = new Graphics()
    .moveTo(x1, y1)
    .lineTo(x2, y2)
    .stroke({ color, width, alpha })
  graphics.blendMode = 'add'
  trailLayer.addChild(graphics)
  fadeLines.push({ graphics, life, maxLife: life })
}

function spawnAfterimages(facing: number): void {
  for (let i = 1; i <= 4; i += 1) {
    const ghost = new Sprite(survivorTexture)
    ghost.anchor.set(0.5)
    ghost.scale.set(0.28)
    ghost.rotation = facing + Math.PI / 2
    ghost.position.set(
      state.player.x - Math.cos(facing) * i * 11,
      state.player.y - Math.sin(facing) * i * 11 - 8,
    )
    ghost.tint = i % 2 === 0 ? 0x6adfff : 0xff4ab9
    ghost.alpha = 0.32 / i
    ghostLayer.addChild(ghost)
    ghosts.push({
      sprite: ghost,
      life: 0.17 + i * 0.025,
      maxLife: 0.17 + i * 0.025,
      vx: -Math.cos(facing) * 18,
      vy: -Math.sin(facing) * 18,
    })
  }
}

function spawnNinjaStab(facing: number, hitX = state.player.x, hitY = state.player.y): void {
  const reach = 176
  const back = 24
  const sx = state.player.x - Math.cos(facing) * back
  const sy = state.player.y - Math.sin(facing) * back
  const ex = state.player.x + Math.cos(facing) * reach
  const ey = state.player.y + Math.sin(facing) * reach
  const perpX = -Math.sin(facing)
  const perpY = Math.cos(facing)

  addFadeLine(sx, sy, ex, ey, 0xffffff, 7, 0.16, 0.98)
  addFadeLine(sx + perpX * 8, sy + perpY * 8, ex + perpX * 8, ey + perpY * 8, 0x48e9ff, 3, 0.22, 0.82)
  addFadeLine(sx - perpX * 8, sy - perpY * 8, ex - perpX * 8, ey - perpY * 8, 0xff3ec8, 3, 0.22, 0.72)
  spawnAfterimages(facing)
  spawnDirectionalBlood(hitX, hitY, facing, 22, false)
  spawnRing(hitX, hitY, true)
  stabImpulse = 1
  flash = Math.max(flash, 0.42)
  cameraShake = Math.max(cameraShake, 8)
  blastLightPower = Math.max(blastLightPower, 0.7)
  const screen = worldToScreen(hitX, hitY)
  lastBlastScreenX = screen.x
  lastBlastScreenY = screen.y
}

function startAttack(kind: AttackKind, facing: number): void {
  const duration = kind === 'slash' ? 0.22 : kind === 'stab' ? 0.18 : kind === 'whirlwind' ? 0.38 : 0.2
  activeAttack = { kind, elapsed: 0, duration, facing }
  previousBladeTip = null
  if (kind === 'stab') spawnNinjaStab(facing)
  if (kind === 'whirlwind') popText(state.player.x, state.player.y - 52, 'SPIN TO WIN', true)
}

const darkness = new Graphics().rect(0, 0, WIDTH, HEIGHT).fill({ color: 0x010104, alpha: 0.34 })
const playerLight = radialGlow(180, 0x8d50ff, 0.7)
const storeLight = radialGlow(260, 0x57dcff, 0.32)
const parkingLight = radialGlow(280, 0xff315f, 0.34)
const blastLight = radialGlow(290, 0xffae69, 0.86)
storeLight.position.set(235, 205)
parkingLight.position.set(1070, 510)
blastLight.alpha = 0
lightingLayer.addChild(darkness, storeLight, parkingLight, playerLight, blastLight)

const flashOverlay = new Graphics().rect(0, 0, WIDTH, HEIGHT).fill({ color: 0xfff0f4, alpha: 1 })
const damageOverlay = new Graphics().rect(8, 8, WIDTH - 16, HEIGHT - 16).stroke({ color: 0xff2451, width: 26, alpha: 1 })
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
    addWall(0, -(halfH + 8) / PX_PER_M, halfW / PX_PER_M, 0.2)
    addWall(0, (halfH + 8) / PX_PER_M, halfW / PX_PER_M, 0.2)
    addWall(-(halfW + 8) / PX_PER_M, 0, 0.2, halfH / PX_PER_M)
    addWall((halfW + 8) / PX_PER_M, 0, 0.2, halfH / PX_PER_M)

    for (let i = 0; i < 34; i += 1) {
      const x = -70 + rand() * 440
      const y = MAZE_ORIGIN_Y + 45 + rand() * (MAZE_GRID.length * MAZE_CELL_SIZE - 90)
      const size = 4 + rand() * 8
      const body = physicsWorld.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x / PX_PER_M, y / PX_PER_M)
          .setRotation(rand() * Math.PI)
          .setLinearDamping(1.6)
          .setAngularDamping(1.7),
      )
      physicsWorld.createCollider(
        RAPIER.ColliderDesc.cuboid(size / PX_PER_M, size / PX_PER_M).setRestitution(0.58).setFriction(0.6),
        body,
      )
      const sprite = new Graphics().roundRect(-size, -size, size * 2, size * 2, 2)
        .fill({ color: i % 4 === 0 ? 0x7d2947 : i % 3 === 0 ? 0x5b6d80 : 0x5a493d })
        .stroke({ color: 0x130b14, width: 2, alpha: 0.9 })
      debrisLayer.addChild(sprite)
      physicsDebris.push({ body, sprite })
    }
    rapierStatus = 'READY'
  } catch (error) {
    rapierStatus = `DEGRADED: ${error instanceof Error ? error.message : String(error)}`
  }
}

function physicsBlast(x: number, y: number, strength = 4.8): void {
  if (!physicsWorld) return
  const bx = x / PX_PER_M
  const by = y / PX_PER_M
  for (const item of physicsDebris) {
    const p = item.body.translation()
    const dx = p.x - bx
    const dy = p.y - by
    const distance = Math.max(0.35, Math.hypot(dx, dy))
    if (distance > 5.5) continue
    const impulse = Math.min(6.0, strength / distance)
    item.body.applyImpulse({ x: (dx / distance) * impulse, y: (dy / distance) * impulse }, true)
    item.body.applyTorqueImpulse((rand() - 0.5) * 4.5, true)
  }
}

void initRapier().finally(() => {
  bootStatus.textContent = rapierStatus === 'READY'
    ? 'V2 // PIXI + NINJA FX + REPLAY + RAPIER READY'
    : `V2 // CORE READY // ${rapierStatus}`
  setTimeout(() => bootStatus.classList.add('hidden'), 2600)
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
  activeAttack = null
  previousBladeTip = null
  decals.splice(0).forEach((item) => item.destroy())
  for (const item of gibs.splice(0)) item.sprite.destroy()
  for (const item of floating.splice(0)) item.text.destroy()
  for (const item of rings.splice(0)) item.ring.destroy()
  for (const item of fadeLines.splice(0)) item.graphics.destroy()
  for (const item of ghosts.splice(0)) item.sprite.destroy()
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
    x: Math.cos(t * 0.021),
    y: Math.sin(t * 0.025),
    aimRadians: aim,
    slash: t % 24 === 0,
    stab: t % 48 === 12,
    whirlwind: t % 150 === 45,
    dodge: t % 190 === 76,
    dashHeld: t % 230 >= 156 && t % 230 < 185,
    dashReleased: t % 230 === 185,
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
  if (profile.shakeIntensity > 0) cameraShake = Math.max(cameraShake, profile.shakeIntensity * 2900)
  if (profile.sfxWeight !== 'none') sfx.hit(profile.sfxWeight)

  for (const event of events) {
    if (event.type === 'weapon-attack') {
      const kind = event.attack as AttackKind
      sfx.sword(event.attack)
      startAttack(kind, event.facing)
      if (kind === 'whirlwind') {
        flash = Math.max(flash, 0.24)
        cameraShake = Math.max(cameraShake, 7)
      }
      if (kind === 'dash') spawnAfterimages(event.facing)
    }

    if (event.type === 'enemy-hit') {
      if (event.attack === 'stab') {
        spawnDirectionalBlood(event.x, event.y, event.facing, event.killed ? 72 : 38, event.killed)
        spawnNinjaStab(event.facing, event.x, event.y)
        addFadeLine(
          event.x - Math.cos(event.facing) * 48,
          event.y - Math.sin(event.facing) * 48,
          event.x + Math.cos(event.facing) * 84,
          event.y + Math.sin(event.facing) * 84,
          0xffffff,
          event.killed ? 8 : 5,
          0.12,
        )
        popText(event.x, event.y - 30, event.killed ? 'THROUGH.' : 'STAB', event.killed)
        hitStopMs = Math.max(hitStopMs, event.killed ? 38 : 18)
        cameraShake = Math.max(cameraShake, event.killed ? 11 : 7)
        flash = Math.max(flash, event.killed ? 0.58 : 0.3)
      } else {
        spawnParticles(event.x, event.y, event.killed ? 100 : 34, event.killed)
      }

      spawnRing(event.x, event.y, event.killed)
      if (event.killed) {
        spawnDecal(event.x, event.y, true)
        spawnGibs(event.x, event.y, 3 + Math.floor(rand() * 4))
        if (event.attack !== 'stab') {
          popText(event.x, event.y - 25, state.comboKills >= 5 ? `CHAIN x${state.comboKills}` : 'DEAD', state.comboKills >= 5)
        }
        blastLightPower = Math.max(blastLightPower, state.comboKills >= 5 ? 1 : 0.66)
        const screen = worldToScreen(event.x, event.y)
        lastBlastScreenX = screen.x
        lastBlastScreenY = screen.y
        physicsBlast(event.x, event.y, state.comboKills >= 5 ? 6.4 : 4.6)
      }
    }

    if (event.type === 'physics-impact' && event.killed) {
      spawnDecal(event.x, event.y, true)
      spawnParticles(event.x, event.y, 165, true)
      spawnGibs(event.x, event.y, 5)
      popText(event.x, event.y - 30, 'WALL MEAT', true)
      cameraShake = Math.max(cameraShake, 13)
      flash = Math.max(flash, 0.52)
      physicsBlast(event.x, event.y, 6.6)
    }
    if (event.type === 'prop-hit' && event.broken) {
      spawnParticles(event.x, event.y, 75, true)
      physicsBlast(event.x, event.y, 5.4)
      popText(event.x, event.y - 20, `${event.material.toUpperCase()} GONE`)
    }
    if (event.type === 'player-hit') {
      damageFlash = 1
      cameraShake = Math.max(cameraShake, 9)
      sfx.hurt()
    }
    if (event.type === 'style-rank') popText(state.player.x, state.player.y - 54, `${event.rank} // ${event.label}`, true)
    if (event.type === 'combo-tier' && event.comboKills >= 5) popText(state.player.x, state.player.y - 72, `KILL CHAIN ${event.comboKills}`, true)
    if (event.type === 'maze-exit-unlocked') popText(MAZE_EXIT.x, MAZE_EXIT.y - 34, 'EXIT UNLOCKED', true)
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
    resultTitle.textContent = 'BOUNTY CLEARED'
    resultReceipt.textContent = [
      `contract    ${receipt.contractId}`,
      `runner      ${receipt.runner}`,
      `seed        0x${receipt.seed.toString(16).padStart(8, '0')}`,
      `ticks       ${receipt.ticks}`,
      `kills       ${receipt.kills}`,
      `score       ${receipt.score}`,
      `resultHash  ${receipt.resultHash}`,
      '',
      'No wallet transaction is submitted in this preview.',
    ].join('\n')
    hudState.textContent = 'VERIFIED // WOULD PAY'
    flash = 1
    cameraShake = 13
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

function animateWeapon(dt: number): void {
  survivor.position.set(0, -8)
  survivor.scale.set(0.28)
  weaponRig.position.set(0, 0)
  weaponRig.rotation = state.player.facing
  sword.position.set(16, 0)
  sword.rotation = 0
  sword.scale.set(1.5)

  const attack = activeAttack
  if (!attack) {
    previousBladeTip = null
    return
  }

  attack.elapsed += dt
  const p = clamp(attack.elapsed / attack.duration, 0, 1)
  let angle = attack.facing
  let reach = 16

  if (attack.kind === 'slash') {
    const windup = p < 0.18 ? p / 0.18 : 1
    const swingP = p < 0.18 ? 0 : clamp((p - 0.18) / 0.54, 0, 1)
    const recovery = p <= 0.72 ? 1 : 1 - ((p - 0.72) / 0.28)
    const arc = -1.18 + easeOutCubic(swingP) * 2.45
    angle = attack.facing + (p < 0.18 ? -1.18 * windup : arc * Math.max(0.2, recovery))
    weaponRig.rotation = angle
    survivor.rotation = attack.facing + Math.PI / 2 + Math.sin(swingP * Math.PI) * 0.12
    reach = 20
  } else if (attack.kind === 'stab') {
    const thrust = p < 0.56 ? easeOutCubic(p / 0.56) : 1 - easeOutCubic((p - 0.56) / 0.44)
    const anticipation = p < 0.16 ? (1 - p / 0.16) * 8 : 0
    reach = 12 + thrust * 62 - anticipation
    weaponRig.rotation = attack.facing
    weaponRig.position.set(Math.cos(attack.facing) * reach, Math.sin(attack.facing) * reach)
    survivor.rotation = attack.facing + Math.PI / 2
    survivor.position.set(Math.cos(attack.facing) * thrust * 8, Math.sin(attack.facing) * thrust * 8 - 8)
    survivor.scale.set(0.28 + thrust * 0.018, 0.28 - thrust * 0.012)
    sword.scale.set(1.58 + thrust * 0.14, 1.38 - thrust * 0.1)
  } else if (attack.kind === 'whirlwind') {
    angle = attack.facing + p * Math.PI * 2.35
    weaponRig.rotation = angle
    reach = 24
    survivor.rotation = attack.facing + Math.PI / 2 + p * Math.PI * 0.35
  } else {
    angle = attack.facing
    weaponRig.rotation = angle
    reach = 38
  }

  const tipDistance = 92 + reach
  const tip = {
    x: state.player.x + Math.cos(angle) * tipDistance,
    y: state.player.y + Math.sin(angle) * tipDistance,
  }
  if (previousBladeTip && attack.kind !== 'stab') {
    addFadeLine(previousBladeTip.x, previousBladeTip.y, tip.x, tip.y, 0xffffff, attack.kind === 'whirlwind' ? 6 : 4, 0.11, 0.72)
    addFadeLine(
      previousBladeTip.x,
      previousBladeTip.y,
      tip.x,
      tip.y,
      attack.kind === 'whirlwind' ? 0xbf54ff : 0x69e6ff,
      attack.kind === 'whirlwind' ? 10 : 7,
      0.16,
      0.18,
    )
  }
  previousBladeTip = tip

  if (attack.elapsed >= attack.duration) {
    activeAttack = null
    previousBladeTip = null
  }
}

function syncRenderState(): void {
  player.position.set(state.player.x, state.player.y)
  player.zIndex = Math.round(state.player.y + 1000)
  if (!activeAttack) survivor.rotation = state.player.facing + Math.PI / 2
  survivor.alpha = state.dodgeInvulnerable() || state.player.invulnerableTicks > 0 ? 0.55 : 1
  if (!activeAttack) weaponRig.rotation = state.player.facing

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
    view.sprite.scale.set((enemy.radius / 24) * (enemy.mass > 1.35 ? 0.88 : 0.8))
    view.sprite.tint = enemy.staggerTicks > 0 ? 0xffc4d2 : enemy.mass > 1.35 ? 0xd6a9bf : 0xc3b1d0
    view.shadow.scale.set(enemy.mass > 1.35 ? 1.28 : 1)
  }

  for (let i = 0; i < propViews.length; i += 1) {
    const prop = state.props[i]
    const view = propViews[i]
    view.holder.visible = prop.active
    if (!prop.active) continue
    view.holder.position.set(prop.x, prop.y)
    view.body.clear()
    view.body.roundRect(-prop.radius, -prop.radius, prop.radius * 2, prop.radius * 2, 4)
      .fill({ color: prop.material === 'metal' ? 0x5d5e70 : prop.material === 'glass' ? 0x315160 : 0x654737 })
      .stroke({ color: prop.material === 'glass' ? 0x8be7ff : 0x150c15, width: 2, alpha: 0.9 })
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
  animateWeapon(dt)

  for (const p of particlePool) {
    if (p.life <= 0) continue
    p.life -= dt
    if (p.life <= 0) {
      p.sprite.visible = false
      continue
    }
    p.vx *= Math.pow(0.18, dt)
    p.vy *= Math.pow(0.22, dt)
    p.vy += p.gravity * dt
    p.sprite.x += p.vx * dt
    p.sprite.y += p.vy * dt
    p.sprite.rotation += p.spin * dt
    p.sprite.alpha = clamp((p.life / p.maxLife) * 1.4, 0, 1)
  }

  for (let i = gibs.length - 1; i >= 0; i -= 1) {
    const item = gibs[i]
    item.life -= dt
    item.vx *= Math.pow(0.12, dt)
    item.vy *= Math.pow(0.18, dt)
    item.vy += 130 * dt
    item.sprite.x += item.vx * dt
    item.sprite.y += item.vy * dt
    item.sprite.rotation += item.spin * dt
    item.sprite.alpha = clamp(item.life, 0, 1)
    if (item.life <= 0) {
      item.sprite.destroy()
      gibs.splice(i, 1)
    }
  }

  for (let i = rings.length - 1; i >= 0; i -= 1) {
    const item = rings[i]
    item.life -= dt
    const progress = 1 - item.life / item.maxLife
    item.ring.scale.set(1 + progress * 3.7)
    item.ring.alpha = clamp(1 - progress, 0, 1)
    if (item.life <= 0) {
      item.ring.destroy()
      rings.splice(i, 1)
    }
  }

  for (let i = floating.length - 1; i >= 0; i -= 1) {
    const item = floating[i]
    item.life -= dt
    item.text.y += item.vy * dt
    item.text.alpha = clamp(item.life * 1.8, 0, 1)
    item.text.scale.set(1 + Math.max(0, 0.38 - item.life) * 0.2)
    if (item.life <= 0) {
      item.text.destroy()
      floating.splice(i, 1)
    }
  }

  for (let i = fadeLines.length - 1; i >= 0; i -= 1) {
    const item = fadeLines[i]
    item.life -= dt
    item.graphics.alpha = clamp(item.life / item.maxLife, 0, 1)
    if (item.life <= 0) {
      item.graphics.destroy()
      fadeLines.splice(i, 1)
    }
  }

  for (let i = ghosts.length - 1; i >= 0; i -= 1) {
    const ghost = ghosts[i]
    ghost.life -= dt
    ghost.sprite.x += ghost.vx * dt
    ghost.sprite.y += ghost.vy * dt
    ghost.sprite.alpha = clamp((ghost.life / ghost.maxLife) * 0.36, 0, 0.36)
    if (ghost.life <= 0) {
      ghost.sprite.destroy()
      ghosts.splice(i, 1)
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

  const now = performance.now() / 1000
  storeLight.alpha = 0.58 + Math.sin(now * 11.4) * 0.09
  parkingLight.alpha = 0.48 + Math.sin(now * 4.5 + 1.2) * 0.1
  blastLight.alpha = blastLightPower * 0.75
  blastLightPower *= Math.pow(0.016, dt)

  if (stabImpulse > 0.005) {
    camera.position.set(-Math.cos(state.player.facing) * stabImpulse * 8, -Math.sin(state.player.facing) * stabImpulse * 8)
    stabImpulse *= Math.pow(0.002, dt)
  } else if (cameraShake > 0.08) {
    camera.position.set((rand() - 0.5) * cameraShake, (rand() - 0.5) * cameraShake)
    cameraShake *= Math.pow(0.014, dt)
  } else {
    camera.position.set(0, 0)
    cameraShake = 0
  }

  flashOverlay.alpha = flash * 0.24
  flash *= Math.pow(0.008, dt)
  damageOverlay.alpha = damageFlash * 0.35
  damageFlash *= Math.pow(0.02, dt)

  if (!activeAttack) survivor.y = -8 + Math.sin(now * 5.3) * 1.5
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
  __APOCALYPSE_V2_READY__: true,
  __APOCALYPSE_V2_MODE__: 'NIGHTMART_NINJA',
  __APOCALYPSE_V2_RAPIER__: () => rapierStatus,
})

if (AUTOTEST) setTimeout(() => startJob(), 650)

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id}`)
  return element as T
}
