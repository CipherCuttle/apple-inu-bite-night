import './pz-survival-v1.css'
import {
  SurvivalState,
  SURVIVAL_WORLD_HEIGHT,
  SURVIVAL_WORLD_WIDTH,
  type FixtureState,
  type SurvivalEvent,
  type SurvivalInput,
  type SurvivalItem,
} from './game/survival/SurvivalState'

const PIXI_URL = 'https://cdn.jsdelivr.net/npm/pixi.js@8.17.0/dist/pixi.mjs'
const PIXI = await import(/* @vite-ignore */ PIXI_URL)
const { Application, Assets, Container, Graphics, Sprite } = PIXI

const WIDTH = 1280
const HEIGHT = 720
const TILE_W = 64
const TILE_H = 32
const WALL_H = 70
const SAVE_KEY = 'last-block-survival-v1'
const AUTOTEST = new URLSearchParams(location.search).get('autotest') === '1'

type BuildingSpec = {
  id: 'house-a' | 'house-b' | 'store'
  x: number
  y: number
  w: number
  h: number
  roof: number
  trim: number
}

const BUILDINGS: BuildingSpec[] = [
  { id: 'house-a', x: 2, y: 2, w: 9, h: 8, roof: 0x6e4036, trim: 0xe6d8bd },
  { id: 'house-b', x: 19, y: 2, w: 9, h: 8, roof: 0x3f5965, trim: 0xd4ddd8 },
  { id: 'store', x: 18, y: 15, w: 11, h: 8, roof: 0x34393b, trim: 0xd6c88b },
]

const app = new Application()
await app.init({
  width: WIDTH,
  height: HEIGHT,
  background: '#10140f',
  antialias: true,
  autoDensity: true,
  resolution: Math.min(devicePixelRatio || 1, 2),
})
required<HTMLDivElement>('stage').appendChild(app.canvas)
app.canvas.tabIndex = 0

const world = new Container()
const groundLayer = new Container()
const architectureLayer = new Container()
const decorLayer = new Container()
const corpseLayer = new Container()
const fixtureLayer = new Container()
const actorLayer = new Container()
const roofLayer = new Container()
const fogLayer = new Container()
world.addChild(groundLayer, architectureLayer, decorLayer, corpseLayer, fixtureLayer, actorLayer, roofLayer, fogLayer)
app.stage.addChild(world)
actorLayer.sortableChildren = true
fixtureLayer.sortableChildren = true

const [survivorTexture, zombieTexture, heavyTexture] = await Promise.all([
  Assets.load('./assets/characters/survivor/survivor.svg'),
  Assets.load('./assets/enemies/zombies/walker.png'),
  Assets.load('./assets/enemies/zombies/heavy.png'),
])

let state = new SurvivalState(AUTOTEST ? 0x51a7b10c : crypto.getRandomValues(new Uint32Array(1))[0])
let zoom = 0.92
let openContainerId: number | null = null
let inventoryOpen = AUTOTEST
let lastDeath = false
let frameAccumulator = 0
let uiAccumulator = 0
const keys = new Set<string>()
let queueInteract = false
let queueAttack = false
let queueSmash = false
const corpseIds = new Set<number>()
const fixtureViews = new Map<number, any>()
const zombieViews = new Map<number, { holder: any; sprite: any; shadow: any }>()
const corpseViews = new Map<number, any>()
const roofViews = new Map<string, any>()

const staticGround = new Graphics()
groundLayer.addChild(staticGround)
const architectureGraphics = new Graphics()
architectureLayer.addChild(architectureGraphics)
const decorGraphics = new Graphics()
decorLayer.addChild(decorGraphics)

const player = new Container()
const playerShadow = new Graphics().ellipse(0, 8, 17, 6).fill({ color: 0x000000, alpha: 0.5 })
const playerSprite = new Sprite(survivorTexture)
playerSprite.anchor.set(0.5, 0.82)
playerSprite.scale.set(0.22)
player.addChild(playerShadow, playerSprite)
actorLayer.addChild(player)

const hpBar = required<HTMLElement>('hp-bar')
const hungerBar = required<HTMLElement>('hunger-bar')
const thirstBar = required<HTMLElement>('thirst-bar')
const fatigueBar = required<HTMLElement>('fatigue-bar')
const bleedBar = required<HTMLElement>('bleed-bar')
const painBar = required<HTMLElement>('pain-bar')
const hpValue = required<HTMLElement>('hp-value')
const hungerValue = required<HTMLElement>('hunger-value')
const thirstValue = required<HTMLElement>('thirst-value')
const fatigueValue = required<HTMLElement>('fatigue-value')
const bleedValue = required<HTMLElement>('bleed-value')
const painValue = required<HTMLElement>('pain-value')
const inventoryList = required<HTMLElement>('inventory-list')
const lootList = required<HTMLElement>('loot-list')
const lootName = required<HTMLElement>('loot-name')
const weightLabel = required<HTMLElement>('weight-label')
const interactionPrompt = required<HTMLElement>('interaction-prompt')
const eventFeed = required<HTMLElement>('event-feed')
const timeLabel = required<HTMLElement>('time-label')
const dayLabel = required<HTMLElement>('day-label')
const statusLabel = required<HTMLElement>('status-label')
const inventoryWindow = required<HTMLElement>('inventory-window')
const deathScreen = required<HTMLElement>('death-screen')
const bootStatus = required<HTMLElement>('boot-status')

function iso(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * TILE_W * 0.5, y: (x + y) * TILE_H * 0.5 }
}

function diamond(graphics: any, x: number, y: number, color: number, alpha = 1): void {
  const p = iso(x, y)
  graphics.poly([
    p.x, p.y,
    p.x + TILE_W * 0.5, p.y + TILE_H * 0.5,
    p.x, p.y + TILE_H,
    p.x - TILE_W * 0.5, p.y + TILE_H * 0.5,
  ]).fill({ color, alpha })
}

function drawStaticWorld(): void {
  staticGround.clear()
  architectureGraphics.clear()
  decorGraphics.clear()

  for (let y = 0; y < SURVIVAL_WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < SURVIVAL_WORLD_WIDTH; x += 1) {
      const cell = state.cell(x, y)
      if (!cell) continue
      const color = cell.terrain === 'road' ? 0x353b3b
        : cell.terrain === 'floor' ? 0x756f60
          : cell.terrain === 'wall' ? 0x5b554d
            : cell.terrain === 'fence' ? 0x53604c
              : ((x + y) % 2 === 0 ? 0x516448 : 0x485b42)
      diamond(staticGround, x, y, color, 1)

      const p = iso(x, y)
      if (cell.terrain === 'road') {
        staticGround.moveTo(p.x - TILE_W * 0.5, p.y + TILE_H * 0.5)
          .lineTo(p.x, p.y + TILE_H)
          .stroke({ color: 0x202525, width: 1, alpha: 0.45 })
      }
    }
  }

  drawSidewalks(staticGround)
  drawArchitecture(architectureGraphics)
  drawNeighborhoodDecor(decorGraphics)
  createRoofs()
}

function drawSidewalks(g: any): void {
  for (let y = 0; y < SURVIVAL_WORLD_HEIGHT; y += 1) {
    for (const x of [12, 17]) diamond(g, x, y, 0x74776d, 0.72)
  }
  for (let x = 0; x < SURVIVAL_WORLD_WIDTH; x += 1) {
    for (const y of [10, 14]) diamond(g, x, y, 0x74776d, 0.72)
  }

  for (const [x0, y0, x1, y1] of [
    [6, 9, 6, 11],
    [23, 9, 23, 11],
    [23, 14, 23, 15],
  ]) {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) diamond(g, x, y, 0x88877d, 0.78)
  }

  for (let x = 1; x < SURVIVAL_WORLD_WIDTH; x += 3) {
    const p = iso(x, 12)
    g.moveTo(p.x - 14, p.y + 15).lineTo(p.x + 14, p.y + 1).stroke({ color: 0xd2c893, width: 3, alpha: 0.58 })
  }
}

function drawArchitecture(g: any): void {
  const currentRoom = state.currentRoomId()
  for (let y = 0; y < SURVIVAL_WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < SURVIVAL_WORLD_WIDTH; x += 1) {
      const cell = state.cell(x, y)
      if (!cell) continue
      if (cell.terrain === 'wall') drawWallBlock(g, x, y, cell.roomId === currentRoom ? 0.22 : 1)
      if (cell.terrain === 'fence') drawFence(g, x, y)
    }
  }

  drawInteriorFurniture(g)
}

function drawWallBlock(g: any, x: number, y: number, alpha: number): void {
  const p = iso(x, y)
  const topY = p.y - WALL_H
  g.poly([p.x, topY, p.x + TILE_W * 0.5, topY + TILE_H * 0.5, p.x, topY + TILE_H, p.x - TILE_W * 0.5, topY + TILE_H * 0.5])
    .fill({ color: 0xb7aa91, alpha })
  g.poly([p.x - TILE_W * 0.5, topY + TILE_H * 0.5, p.x, topY + TILE_H, p.x, p.y + TILE_H, p.x - TILE_W * 0.5, p.y + TILE_H * 0.5])
    .fill({ color: 0x635b50, alpha })
  g.poly([p.x + TILE_W * 0.5, topY + TILE_H * 0.5, p.x, topY + TILE_H, p.x, p.y + TILE_H, p.x + TILE_W * 0.5, p.y + TILE_H * 0.5])
    .fill({ color: 0x7b7162, alpha })
}

function drawFence(g: any, x: number, y: number): void {
  const p = iso(x, y)
  g.moveTo(p.x - 24, p.y + 12).lineTo(p.x + 24, p.y + 4).stroke({ color: 0x8d7e62, width: 3 })
  g.moveTo(p.x - 18, p.y + 15).lineTo(p.x - 18, p.y - 14).stroke({ color: 0x75694f, width: 3 })
  g.moveTo(p.x + 18, p.y + 9).lineTo(p.x + 18, p.y - 20).stroke({ color: 0x75694f, width: 3 })
}

function drawInteriorFurniture(g: any): void {
  for (const rug of [
    { x: 6.3, y: 6.5, w: 2.2, h: 1.3, color: 0x7b4f43 },
    { x: 23.2, y: 6.4, w: 2.0, h: 1.2, color: 0x4a6373 },
  ]) drawFloorRect(g, rug.x, rug.y, rug.w, rug.h, rug.color, 0.68)

  drawFurnitureBox(g, 5.1, 6.1, 1.5, 0.75, 0x59483d)
  drawFurnitureBox(g, 7.1, 6.3, 1.2, 0.7, 0x735d42)
  drawFurnitureBox(g, 5.0, 3.4, 2.2, 0.65, 0xd5c8ad)
  drawFurnitureBox(g, 21.1, 6.4, 1.8, 0.75, 0x465a67)
  drawFurnitureBox(g, 24.4, 4.0, 1.3, 0.8, 0xd1c4ac)

  for (const shelfX of [20.0, 23.0, 26.0]) {
    drawFurnitureBox(g, shelfX, 18.4, 0.8, 2.0, 0x66513a)
  }
  drawFurnitureBox(g, 27.1, 20.9, 1.3, 0.8, 0x554637)
}

function drawFloorRect(g: any, x: number, y: number, w: number, h: number, color: number, alpha: number): void {
  const a = iso(x, y)
  const b = iso(x + w, y)
  const c = iso(x + w, y + h)
  const d = iso(x, y + h)
  g.poly([a.x, a.y + TILE_H * 0.5, b.x, b.y + TILE_H * 0.5, c.x, c.y + TILE_H * 0.5, d.x, d.y + TILE_H * 0.5]).fill({ color, alpha })
}

function drawFurnitureBox(g: any, x: number, y: number, w: number, h: number, color: number): void {
  const p = iso(x, y)
  const width = Math.max(22, (w + h) * 18)
  const depth = Math.max(10, (w + h) * 8)
  g.roundRect(p.x - width / 2, p.y - depth - 8, width, depth, 3)
    .fill({ color, alpha: 0.95 })
    .stroke({ color: 0x242019, width: 2, alpha: 0.75 })
  g.moveTo(p.x - width / 2 + 4, p.y - depth - 4).lineTo(p.x + width / 2 - 4, p.y - depth - 4)
    .stroke({ color: 0xe0d0ae, width: 1, alpha: 0.2 })
}

function drawNeighborhoodDecor(g: any): void {
  for (const [x, y, tint] of [[14, 5, 0x4b5a64], [15, 18, 0x74483b], [12, 17, 0x40594c]] as const) {
    const p = iso(x, y)
    g.roundRect(p.x - 25, p.y - 5, 50, 20, 7).fill({ color: tint, alpha: 0.96 }).stroke({ color: 0x171918, width: 2 })
    g.circle(p.x - 15, p.y + 15, 5).fill({ color: 0x111312 })
    g.circle(p.x + 15, p.y + 15, 5).fill({ color: 0x111312 })
  }

  for (const [x, y] of [[1, 1], [11, 2], [18, 1], [28, 2], [3, 16], [8, 20], [17, 22], [29, 13]] as const) {
    const p = iso(x, y)
    g.rect(p.x - 3, p.y - 21, 6, 23).fill({ color: 0x5b4430 })
    g.circle(p.x, p.y - 29, 19).fill({ color: 0x385539, alpha: 0.95 })
    g.circle(p.x - 12, p.y - 23, 13).fill({ color: 0x456447, alpha: 0.9 })
    g.circle(p.x + 12, p.y - 21, 13).fill({ color: 0x3e5d41, alpha: 0.9 })
  }

  const sign = iso(23.5, 15)
  g.roundRect(sign.x - 62, sign.y - 58, 124, 20, 3).fill({ color: 0xd7b44c }).stroke({ color: 0x2c2922, width: 3 })
  for (let i = 0; i < 5; i += 1) g.rect(sign.x - 52 + i * 24, sign.y - 53, 14, 10).fill({ color: i % 2 ? 0x9f372e : 0xf0e2b2 })
}

function createRoofs(): void {
  for (const view of roofViews.values()) view.destroy({ children: true })
  roofViews.clear()
  for (const spec of BUILDINGS) {
    const holder = new Container()
    roofLayer.addChild(holder)
    roofViews.set(spec.id, holder)
    const g = new Graphics()
    holder.addChild(g)
    drawRoof(g, spec)
  }
  syncRoofs()
}

function drawRoof(g: any, spec: BuildingSpec): void {
  const lift = spec.id === 'store' ? 82 : 88
  const a = iso(spec.x - 0.25, spec.y - 0.25)
  const b = iso(spec.x + spec.w + 0.25, spec.y - 0.25)
  const c = iso(spec.x + spec.w + 0.25, spec.y + spec.h + 0.25)
  const d = iso(spec.x - 0.25, spec.y + spec.h + 0.25)
  const midA = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 - 18 }
  const midB = { x: (d.x + c.x) * 0.5, y: (d.y + c.y) * 0.5 - 18 }

  g.poly([a.x, a.y - lift, midA.x, midA.y - lift, midB.x, midB.y - lift, d.x, d.y - lift])
    .fill({ color: spec.roof })
    .stroke({ color: 0x1e211e, width: 3 })
  g.poly([midA.x, midA.y - lift, b.x, b.y - lift, c.x, c.y - lift, midB.x, midB.y - lift])
    .fill({ color: darken(spec.roof, 0.78) })
    .stroke({ color: 0x1e211e, width: 3 })
  g.moveTo(midA.x, midA.y - lift).lineTo(midB.x, midB.y - lift).stroke({ color: spec.trim, width: 3, alpha: 0.58 })

  if (spec.id !== 'store') {
    const chimney = iso(spec.x + spec.w * 0.68, spec.y + spec.h * 0.35)
    g.rect(chimney.x - 7, chimney.y - lift - 28, 14, 26).fill({ color: 0x6b4b3d }).stroke({ color: 0x2a211d, width: 2 })
  } else {
    const vent = iso(spec.x + spec.w * 0.62, spec.y + spec.h * 0.45)
    g.rect(vent.x - 16, vent.y - lift - 12, 32, 12).fill({ color: 0x666e6d }).stroke({ color: 0x222625, width: 2 })
  }
}

function darken(color: number, factor: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * factor)
  const g = Math.floor(((color >> 8) & 0xff) * factor)
  const b = Math.floor((color & 0xff) * factor)
  return (r << 16) | (g << 8) | b
}

function syncRoofs(): void {
  const room = state.currentRoomId()
  for (const spec of BUILDINGS) {
    const holder = roofViews.get(spec.id)
    if (!holder) continue
    holder.alpha = room === spec.id ? 0.08 : 0.98
    holder.visible = true
  }
}

function createFixtureView(fixture: FixtureState): any {
  const holder = new Container()
  fixtureLayer.addChild(holder)
  fixtureViews.set(fixture.id, holder)
  return holder
}

function syncFixtures(): void {
  for (const fixture of state.fixtures) {
    const holder = fixtureViews.get(fixture.id) ?? createFixtureView(fixture)
    holder.removeChildren().forEach((child: any) => child.destroy())
    const p = iso(fixture.x + 0.5, fixture.y + 0.5)
    holder.position.set(p.x, p.y)
    holder.zIndex = Math.round(p.y)
    const g = new Graphics()
    if (fixture.kind === 'door') {
      if (fixture.open) {
        g.roundRect(-20, -4, 40, 8, 2).fill({ color: 0x6e4f32 }).stroke({ color: 0x231b15, width: 2 })
      } else {
        g.roundRect(-8, -51, 16, 52, 2).fill({ color: 0x704b2f }).stroke({ color: 0x261c14, width: 3 })
        g.circle(4, -25, 2).fill({ color: 0xcdbb72 })
      }
    } else if (fixture.kind === 'window') {
      if (fixture.smashed) {
        for (let i = 0; i < 6; i += 1) g.moveTo(-20 + i * 7, -10 + i).lineTo(-14 + i * 7, 4 - i).stroke({ color: 0xb7e7e6, width: 2, alpha: 0.75 })
      } else {
        g.rect(-24, -39, 48, 30).fill({ color: 0x659aa5, alpha: 0.82 }).stroke({ color: 0xd4eee8, width: 3 })
        g.moveTo(0, -39).lineTo(0, -9).stroke({ color: 0xe6f4ef, width: 2, alpha: 0.8 })
        g.moveTo(-24, -24).lineTo(24, -24).stroke({ color: 0xe6f4ef, width: 2, alpha: 0.8 })
      }
    } else {
      const kind = fixture.containerKind
      const color = kind === 'fridge' ? 0xe1e1d8 : kind === 'medicine' ? 0xe5e1cf : kind === 'shelf' ? 0x765c3d : 0x685441
      const w = kind === 'shelf' ? 44 : 32
      const h = kind === 'fridge' ? 48 : 30
      g.roundRect(-w / 2, -h, w, h, 3).fill({ color }).stroke({ color: 0x27231d, width: 2 })
      if (kind === 'fridge') g.circle(9, -25, 2).fill({ color: 0x343330 })
      if (kind === 'shelf') {
        g.moveTo(-18, -20).lineTo(18, -20).stroke({ color: 0xd5a666, width: 2 })
        g.moveTo(-18, -10).lineTo(18, -10).stroke({ color: 0xd5a666, width: 2 })
      }
    }
    holder.addChild(g)
  }
}

function syncActors(): void {
  const pp = iso(state.player.x, state.player.y)
  player.position.set(pp.x, pp.y)
  player.zIndex = Math.round(pp.y + 1000)
  playerSprite.rotation = state.player.facing + Math.PI / 4
  playerSprite.alpha = state.dead ? 0.35 : 1

  for (const zombie of state.zombies) {
    let view = zombieViews.get(zombie.id)
    if (!view) {
      const holder = new Container()
      const shadow = new Graphics().ellipse(0, 6, 17, 6).fill({ color: 0x000000, alpha: 0.5 })
      const sprite = new Sprite(zombie.id % 9 === 0 ? heavyTexture : zombieTexture)
      sprite.anchor.set(0.5, 0.82)
      sprite.scale.set(zombie.id % 9 === 0 ? 0.76 : 0.61)
      holder.addChild(shadow, sprite)
      actorLayer.addChild(holder)
      view = { holder, sprite, shadow }
      zombieViews.set(zombie.id, view)
    }
    if (!zombie.active) {
      view.holder.visible = false
      if (!corpseIds.has(zombie.id)) spawnCorpse(zombie.id, zombie.x, zombie.y)
      continue
    }
    view.holder.visible = true
    const p = iso(zombie.x, zombie.y)
    view.holder.position.set(p.x, p.y)
    view.holder.zIndex = Math.round(p.y)
    view.sprite.rotation = zombie.facing + Math.PI / 4
    view.sprite.tint = zombie.mode === 'chase' ? 0xe3aaa2 : zombie.mode === 'investigate' ? 0xd2c793 : 0xb9beb2
    view.holder.alpha = visibleToPlayer(zombie.x, zombie.y) ? 1 : 0.08
  }
}

function spawnCorpse(id: number, x: number, y: number): void {
  corpseIds.add(id)
  const p = iso(x, y)
  const corpse = new Sprite(zombieTexture)
  corpse.anchor.set(0.5)
  corpse.position.set(p.x, p.y + 7)
  corpse.rotation = -0.7 + (id % 4) * 0.45
  corpse.scale.set(0.56, 0.29)
  corpse.tint = 0x6a625c
  corpse.alpha = 0.8
  corpseLayer.addChild(corpse)
  corpseViews.set(id, corpse)
  const blood = new Graphics().ellipse(p.x, p.y + 10, 25, 10).fill({ color: 0x6d1619, alpha: 0.62 })
  corpseLayer.addChildAt(blood, 0)
}

function visibleToPlayer(x: number, y: number): boolean {
  const d = Math.hypot(x - state.player.x, y - state.player.y)
  const radius = 7 + state.daylight() * 5
  return d < radius
}

function drawFog(): void {
  fogLayer.removeChildren().forEach((child: any) => child.destroy())
  const g = new Graphics()
  const radius = 7 + state.daylight() * 5
  for (let y = 0; y < SURVIVAL_WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < SURVIVAL_WORLD_WIDTH; x += 1) {
      const d = Math.hypot(x + 0.5 - state.player.x, y + 0.5 - state.player.y)
      if (d <= radius * 0.68) continue
      const alpha = d > radius ? 0.82 : 0.16 + ((d - radius * 0.68) / (radius * 0.32)) * 0.54
      diamond(g, x, y, 0x060806, alpha)
    }
  }
  fogLayer.addChild(g)
}

function updateCamera(): void {
  const pp = iso(state.player.x, state.player.y)
  world.scale.set(zoom)
  world.position.set(WIDTH * 0.48 - pp.x * zoom, HEIGHT * 0.50 - pp.y * zoom)
}

function processEvents(events: readonly SurvivalEvent[]): void {
  for (const event of events) {
    if (event.type === 'container-open') {
      openContainerId = event.fixtureId
      inventoryOpen = true
    }
    if (event.type === 'window-smashed') feed('GLASS BREAKS — ZOMBIES HEARD THAT.', true)
    if (event.type === 'door') feed(event.open ? 'DOOR OPENED' : 'DOOR CLOSED')
    if (event.type === 'zombie-hit') feed(event.killed ? 'ZOMBIE DOWN' : 'KNIFE CONNECTS', event.killed)
    if (event.type === 'survivor-hit') feed(`HIT · HP ${Math.max(0, Math.ceil(event.hp))} · BLEED ${Math.ceil(event.bleeding)}`, true)
    if (event.type === 'bandaged') feed('BLEEDING STOPPED')
    if (event.type === 'inventory-full') feed('TOO HEAVY', true)
    if (event.type === 'item-taken') feed(`TOOK ${event.item.name}`)
  }
}

function feed(copy: string, danger = false): void {
  const line = document.createElement('div')
  line.className = `feed-line${danger ? ' danger' : ''}`
  line.textContent = copy
  eventFeed.prepend(line)
  setTimeout(() => line.remove(), 3600)
  while (eventFeed.children.length > 6) eventFeed.lastElementChild?.remove()
}

function updateUi(): void {
  const p = state.player
  setMeter(hpBar, hpValue, p.hp)
  setMeter(hungerBar, hungerValue, p.hunger)
  setMeter(thirstBar, thirstValue, p.thirst)
  setMeter(fatigueBar, fatigueValue, p.fatigue)
  setMeter(bleedBar, bleedValue, p.bleeding)
  setMeter(painBar, painValue, p.pain)
  timeLabel.textContent = state.timeLabel()
  dayLabel.textContent = `DAY ${Math.floor(state.worldMinutes / (24 * 60)) + 1}`
  weightLabel.textContent = `${state.inventoryWeight().toFixed(1)} / ${state.inventoryCapacity()} kg`
  statusLabel.textContent = state.noises.length > 0 ? `${state.noises.length} SOUND${state.noises.length === 1 ? '' : 'S'}` : 'QUIET'
  inventoryWindow.classList.toggle('hidden', !inventoryOpen)
  renderInventory()
  renderLoot()
  updatePrompt()
  if (state.dead && !lastDeath) deathScreen.classList.remove('hidden')
  lastDeath = state.dead
}

function setMeter(bar: HTMLElement, label: HTMLElement, value: number): void {
  const clamped = Math.max(0, Math.min(100, value))
  bar.style.width = `${clamped}%`
  label.textContent = Math.ceil(clamped).toString()
}

function renderInventory(): void {
  inventoryList.replaceChildren()
  if (state.inventory.length === 0) {
    inventoryList.append(emptyRow('EMPTY'))
    return
  }
  for (const item of state.inventory) {
    const row = document.createElement('div')
    row.className = 'item-row'
    const text = document.createElement('button')
    text.type = 'button'
    text.className = 'item-main'
    text.innerHTML = `<strong>${escapeHtml(item.name)}</strong><small>${(item.weight * item.quantity).toFixed(1)} kg</small>`
    text.onclick = () => activateInventoryItem(item)
    row.appendChild(text)
    const action = inventoryAction(item)
    if (action) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'item-action'
      button.textContent = action.label
      button.onclick = () => activateInventoryItem(item)
      row.appendChild(button)
    }
    inventoryList.appendChild(row)
  }
}

function activateInventoryItem(item: SurvivalItem): void {
  state.events.length = 0
  const action = inventoryAction(item)
  if (!action) {
    feed(item.kind === 'backpack' ? 'BACKPACK CAPACITY ACTIVE' : `${item.name.toUpperCase()} EQUIPPED`)
    return
  }
  if (action.kind === 'bandage') {
    if (!state.bandage()) feed('NO BLEEDING TO BANDAGE')
  } else {
    state.consume(item.id)
  }
  processEvents(state.events)
  updateUi()
}

function inventoryAction(item: SurvivalItem): { label: string; kind: 'consume' | 'bandage' } | null {
  if (item.kind === 'water') return { label: 'DRINK', kind: 'consume' }
  if (item.kind === 'beans' || item.kind === 'canned-soup') return { label: 'EAT', kind: 'consume' }
  if (item.kind === 'painkillers') return { label: 'TAKE', kind: 'consume' }
  if (item.kind === 'bandage') return { label: 'USE', kind: 'bandage' }
  return null
}

function renderLoot(): void {
  const nearby = state.nearestFixture(['container'], 1.45)
  if (openContainerId !== null && (!nearby || nearby.id !== openContainerId)) openContainerId = null
  const fixture = openContainerId === null ? null : state.fixtures.find((candidate) => candidate.id === openContainerId) ?? null
  lootList.replaceChildren()

  if (!fixture || fixture.kind !== 'container') {
    lootName.textContent = nearby ? `${nearby.containerKind?.toUpperCase()} · PRESS E TO SEARCH` : 'NO CONTAINER OPEN'
    required<HTMLButtonElement>('take-all-button').disabled = true
    lootList.append(emptyRow(nearby ? 'PRESS E' : 'MOVE NEXT TO FURNITURE'))
    return
  }

  lootName.textContent = `${fixture.containerKind?.toUpperCase()} · ${fixture.items?.length ?? 0} ITEMS`
  required<HTMLButtonElement>('take-all-button').disabled = (fixture.items?.length ?? 0) === 0
  if ((fixture.items?.length ?? 0) === 0) lootList.append(emptyRow('EMPTY'))

  for (const item of fixture.items ?? []) {
    const row = document.createElement('div')
    row.className = 'item-row loot'
    const text = document.createElement('div')
    text.className = 'item-main static'
    text.innerHTML = `<strong>${escapeHtml(item.name)}</strong><small>${item.weight.toFixed(1)} kg</small>`
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'item-action take'
    button.textContent = 'TAKE'
    button.onclick = () => takeLoot(fixture.id, item.id)
    row.append(text, button)
    lootList.appendChild(row)
  }
}

function emptyRow(copy: string): HTMLElement {
  const row = document.createElement('div')
  row.className = 'empty-row'
  row.textContent = copy
  return row
}

function takeLoot(fixtureId: number, itemId: number): void {
  state.events.length = 0
  state.takeItem(fixtureId, itemId)
  processEvents(state.events)
  updateUi()
}

function takeAll(): void {
  if (openContainerId === null) return
  const fixture = state.fixtures.find((candidate) => candidate.id === openContainerId && candidate.kind === 'container')
  if (!fixture?.items) return
  for (const item of [...fixture.items]) {
    state.events.length = 0
    if (!state.takeItem(fixture.id, item.id)) {
      processEvents(state.events)
      break
    }
    processEvents(state.events)
  }
  updateUi()
}

function updatePrompt(): void {
  const fixture = state.nearestFixture()
  if (!fixture) {
    interactionPrompt.textContent = inventoryOpen ? 'I / ESC · CLOSE INVENTORY' : 'I · INVENTORY   //   MOVE QUIETLY · SEARCH BUILDINGS'
    return
  }
  if (fixture.kind === 'door') interactionPrompt.textContent = `E · ${fixture.open ? 'CLOSE' : 'OPEN'} DOOR`
  else if (fixture.kind === 'window') interactionPrompt.textContent = fixture.smashed ? 'BROKEN WINDOW · PASSABLE' : 'F · SMASH WINDOW (LOUD)'
  else interactionPrompt.textContent = `E · SEARCH ${fixture.containerKind?.toUpperCase() ?? 'CONTAINER'}`
}

function readInput(): SurvivalInput {
  if (inventoryOpen) return { x: 0, y: 0 }
  return {
    x: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
    y: Number(keys.has('KeyS')) - Number(keys.has('KeyW')),
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    interact: consumeFlag('interact'),
    attack: consumeFlag('attack'),
    smash: consumeFlag('smash'),
  }
}

function consumeFlag(kind: 'interact' | 'attack' | 'smash'): boolean {
  if (kind === 'interact') { const value = queueInteract; queueInteract = false; return value }
  if (kind === 'attack') { const value = queueAttack; queueAttack = false; return value }
  const value = queueSmash
  queueSmash = false
  return value
}

function scriptedInput(): SurvivalInput {
  const t = state.tick
  if (t < 80) return { x: 0, y: 0 }
  if (t < 150) return { x: 0, y: 0.65 }
  if (t === 152) return { x: 0, y: 0, interact: true }
  return { x: 0, y: 0 }
}

function reset(seed = crypto.getRandomValues(new Uint32Array(1))[0]): void {
  state = new SurvivalState(seed)
  openContainerId = null
  inventoryOpen = AUTOTEST
  corpseIds.clear()
  for (const view of zombieViews.values()) view.holder.destroy({ children: true })
  zombieViews.clear()
  for (const view of corpseViews.values()) view.destroy()
  corpseViews.clear()
  for (const view of fixtureViews.values()) view.destroy({ children: true })
  fixtureViews.clear()
  deathScreen.classList.add('hidden')
  lastDeath = false
  drawStaticWorld()
  syncFixtures()
  syncActors()
  syncRoofs()
  drawFog()
  updateUi()
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyI' || event.code === 'Tab') {
    event.preventDefault()
    if (!event.repeat) {
      inventoryOpen = !inventoryOpen
      if (!inventoryOpen) openContainerId = null
      updateUi()
    }
    return
  }
  if (event.code === 'Escape' && inventoryOpen) {
    inventoryOpen = false
    openContainerId = null
    updateUi()
    return
  }

  keys.add(event.code)
  if (event.repeat || inventoryOpen) return
  if (event.code === 'KeyE') queueInteract = true
  if (event.code === 'Space') queueAttack = true
  if (event.code === 'KeyF') queueSmash = true
  if (event.code === 'KeyB') {
    state.events.length = 0
    if (!state.bandage()) feed('NO BANDAGE NEEDED / AVAILABLE')
    processEvents(state.events)
    updateUi()
  }
})
window.addEventListener('keyup', (event) => keys.delete(event.code))
window.addEventListener('wheel', (event) => {
  if (!inventoryOpen) zoom = Math.max(0.68, Math.min(1.42, zoom - Math.sign(event.deltaY) * 0.07))
}, { passive: true })

required<HTMLButtonElement>('inventory-button').onclick = () => { inventoryOpen = !inventoryOpen; updateUi() }
required<HTMLButtonElement>('close-inventory').onclick = () => { inventoryOpen = false; openContainerId = null; updateUi() }
required<HTMLButtonElement>('take-all-button').onclick = takeAll
required<HTMLButtonElement>('bandage-button').onclick = () => {
  state.events.length = 0
  if (!state.bandage()) feed('NO BANDAGE NEEDED / AVAILABLE')
  processEvents(state.events)
  updateUi()
}
required<HTMLButtonElement>('save-button').onclick = () => {
  localStorage.setItem(SAVE_KEY, state.serialize())
  feed('WORLD SAVED')
}
required<HTMLButtonElement>('load-button').onclick = loadSave
required<HTMLButtonElement>('new-button').onclick = () => reset()
required<HTMLButtonElement>('death-load').onclick = loadSave
required<HTMLButtonElement>('death-new').onclick = () => reset()

function loadSave(): void {
  const save = localStorage.getItem(SAVE_KEY)
  if (!save) { feed('NO SAVE FOUND', true); return }
  try {
    const loaded = SurvivalState.deserialize(save)
    reset(loaded.seed)
    state = loaded
    drawStaticWorld()
    syncFixtures()
    syncActors()
    syncRoofs()
    drawFog()
    deathScreen.classList.toggle('hidden', !state.dead)
    lastDeath = state.dead
    updateUi()
    feed('WORLD LOADED')
  } catch {
    feed('SAVE INVALID', true)
  }
}

app.ticker.add((ticker: { deltaMS: number }) => {
  const delta = Math.min(100, ticker.deltaMS)
  frameAccumulator += delta
  uiAccumulator += delta

  while (frameAccumulator >= 1000 / 60) {
    state.step(AUTOTEST ? scriptedInput() : readInput())
    processEvents(state.events)
    frameAccumulator -= 1000 / 60
  }

  if (uiAccumulator >= 110) {
    drawArchitecture(architectureGraphics.clear())
    syncFixtures()
    syncRoofs()
    drawFog()
    updateUi()
    uiAccumulator = 0
  }
  syncActors()
  updateCamera()
})

reset(AUTOTEST ? 0x51a7b10c : state.seed)
app.canvas.focus()
bootStatus.textContent = 'NEIGHBORHOOD READY · HOUSES + LOOT + NEEDS + NOISE'
setTimeout(() => bootStatus.classList.add('hidden'), 2200)
Object.assign(window, {
  __PZ_SURVIVAL_V1_READY__: true,
  __PZ_SURVIVAL_STATE__: () => state.resultHash(),
})

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[char] ?? char))
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id}`)
  return element as T
}
