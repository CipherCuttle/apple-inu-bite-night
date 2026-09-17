import './pz-survival.css'
import {
  SURVIVAL_WORLD_HEIGHT,
  SURVIVAL_WORLD_WIDTH,
  SurvivalState,
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
const WALL_H = 42
const SAVE_KEY = 'last-block-survival-v0'
const AUTOTEST = new URLSearchParams(location.search).get('autotest') === '1'

const app = new Application()
await app.init({ width: WIDTH, height: HEIGHT, background: '#0a0d0a', antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2) })
required<HTMLDivElement>('stage').appendChild(app.canvas)
app.canvas.tabIndex = 0

const world = new Container()
const groundLayer = new Container()
const corpseLayer = new Container()
const fixtureLayer = new Container()
const actorLayer = new Container()
const fogLayer = new Container()
world.addChild(groundLayer, corpseLayer, fixtureLayer, actorLayer, fogLayer)
app.stage.addChild(world)
actorLayer.sortableChildren = true
fixtureLayer.sortableChildren = true

const [survivorTexture, zombieTexture, heavyTexture] = await Promise.all([
  Assets.load('./assets/characters/survivor/survivor.svg'),
  Assets.load('./assets/enemies/zombies/walker.png'),
  Assets.load('./assets/enemies/zombies/heavy.png'),
])

let state = new SurvivalState(AUTOTEST ? 0x51a7b10c : crypto.getRandomValues(new Uint32Array(1))[0])
let zoom = 1
let openContainerId: number | null = null
let lastDeath = false
let frameAccumulator = 0
let renderClock = 0
const keys = new Set<string>()
let queueInteract = false
let queueAttack = false
let queueSmash = false
const corpseIds = new Set<number>()

const tileGraphics = new Graphics()
groundLayer.addChild(tileGraphics)
const fixtureViews = new Map<number, any>()
const zombieViews = new Map<number, { holder: any; sprite: any; shadow: any }>()
const corpseViews = new Map<number, any>()

const player = new Container()
const playerShadow = new Graphics().ellipse(0, 8, 19, 7).fill({ color: 0x000000, alpha: 0.45 })
const playerSprite = new Sprite(survivorTexture)
playerSprite.anchor.set(0.5, 0.82)
playerSprite.scale.set(0.24)
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

function drawGround(): void {
  tileGraphics.clear()
  const room = state.currentRoomId()
  for (let y = 0; y < SURVIVAL_WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < SURVIVAL_WORLD_WIDTH; x += 1) {
      const cell = state.cell(x, y)
      if (!cell) continue
      const color = cell.terrain === 'road' ? 0x343632
        : cell.terrain === 'floor' ? 0x5d584d
          : cell.terrain === 'wall' ? 0x302d29
            : cell.terrain === 'fence' ? 0x383a31
              : ((x + y) % 2 === 0 ? 0x45513d : 0x3d4937)
      diamond(tileGraphics, x, y, color, 1)
      const p = iso(x, y)
      tileGraphics.moveTo(p.x - TILE_W * 0.5, p.y + TILE_H * 0.5).lineTo(p.x, p.y + TILE_H)
        .stroke({ color: 0x11130f, width: 1, alpha: 0.18 })
      if (cell.terrain === 'road' && y >= 11 && y <= 13 && x % 3 === 0) {
        tileGraphics.moveTo(p.x - 12, p.y + TILE_H * 0.5).lineTo(p.x + 12, p.y + TILE_H * 0.5)
          .stroke({ color: 0xc7bb86, width: 2, alpha: 0.34 })
      }
      if (cell.terrain === 'wall') drawWallBlock(tileGraphics, x, y, cell.roomId === room ? 0.22 : 0.86)
      if (cell.terrain === 'fence') drawFence(tileGraphics, x, y)
    }
  }
  drawStreetDecor(tileGraphics)
}

function drawWallBlock(graphics: any, x: number, y: number, alpha: number): void {
  const p = iso(x, y)
  const topY = p.y - WALL_H
  graphics.poly([p.x, topY, p.x + TILE_W * 0.5, topY + TILE_H * 0.5, p.x, topY + TILE_H, p.x - TILE_W * 0.5, topY + TILE_H * 0.5])
    .fill({ color: 0x777067, alpha })
  graphics.poly([p.x - TILE_W * 0.5, topY + TILE_H * 0.5, p.x, topY + TILE_H, p.x, p.y + TILE_H, p.x - TILE_W * 0.5, p.y + TILE_H * 0.5])
    .fill({ color: 0x45413d, alpha })
  graphics.poly([p.x + TILE_W * 0.5, topY + TILE_H * 0.5, p.x, topY + TILE_H, p.x, p.y + TILE_H, p.x + TILE_W * 0.5, p.y + TILE_H * 0.5])
    .fill({ color: 0x58534d, alpha })
}

function drawFence(graphics: any, x: number, y: number): void {
  const p = iso(x, y)
  graphics.moveTo(p.x - 24, p.y + 12).lineTo(p.x + 24, p.y + 4).stroke({ color: 0x80745f, width: 3, alpha: 0.85 })
  graphics.moveTo(p.x - 18, p.y + 15).lineTo(p.x - 18, p.y - 13).stroke({ color: 0x716654, width: 3 })
  graphics.moveTo(p.x + 18, p.y + 9).lineTo(p.x + 18, p.y - 19).stroke({ color: 0x716654, width: 3 })
}

function drawStreetDecor(graphics: any): void {
  for (const [x, y, tint] of [[14, 5, 0x4b5259], [15, 18, 0x704538], [12, 17, 0x3d4d45]] as const) {
    const p = iso(x, y)
    graphics.roundRect(p.x - 23, p.y - 4, 46, 20, 7).fill({ color: tint, alpha: 0.88 })
    graphics.circle(p.x - 14, p.y + 15, 5).fill({ color: 0x161716 })
    graphics.circle(p.x + 14, p.y + 15, 5).fill({ color: 0x161716 })
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
      const open = fixture.open === true
      g.roundRect(open ? -18 : -7, open ? -5 : -32, open ? 36 : 14, open ? 8 : 38, 2)
        .fill({ color: 0x6f543c }).stroke({ color: 0x2b2119, width: 2 })
    } else if (fixture.kind === 'window') {
      if (fixture.smashed) {
        for (let i = 0; i < 5; i += 1) g.moveTo(-18 + i * 8, -7 + i * 2).lineTo(-12 + i * 8, 4 - i).stroke({ color: 0xa8d5d1, width: 1, alpha: 0.65 })
      } else {
        g.rect(-22, -22, 44, 22).fill({ color: 0x5d7b7a, alpha: 0.72 }).stroke({ color: 0x9fc7c3, width: 2, alpha: 0.7 })
        g.moveTo(0, -22).lineTo(0, 0).stroke({ color: 0xcedbd5, width: 1, alpha: 0.7 })
      }
    } else {
      const kind = fixture.containerKind
      const color = kind === 'fridge' ? 0xc3c6bd : kind === 'medicine' ? 0xe1ded1 : kind === 'shelf' ? 0x6b563c : 0x665847
      const w = kind === 'shelf' ? 42 : 30
      const h = kind === 'fridge' ? 42 : 28
      g.roundRect(-w / 2, -h, w, h, 3).fill({ color }).stroke({ color: 0x29261f, width: 2 })
      if (kind === 'fridge') g.circle(8, -22, 2).fill({ color: 0x302f2c })
      if (kind === 'shelf') {
        g.moveTo(-18, -18).lineTo(18, -18).stroke({ color: 0xc49b5f, width: 2, alpha: 0.7 })
        g.moveTo(-18, -10).lineTo(18, -10).stroke({ color: 0xc49b5f, width: 2, alpha: 0.7 })
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
    view.sprite.tint = zombie.mode === 'chase' ? 0xdcb2aa : zombie.mode === 'investigate' ? 0xc5c0a1 : 0xb2b7aa
    view.holder.alpha = visibleToPlayer(zombie.x, zombie.y) ? 1 : 0.18
  }
}

function spawnCorpse(id: number, x: number, y: number): void {
  corpseIds.add(id)
  const p = iso(x, y)
  const corpse = new Sprite(zombieTexture)
  corpse.anchor.set(0.5)
  corpse.position.set(p.x, p.y + 6)
  corpse.rotation = -0.7 + (id % 4) * 0.45
  corpse.scale.set(0.56, 0.29)
  corpse.tint = 0x6a625c
  corpse.alpha = 0.75
  corpseLayer.addChild(corpse)
  corpseViews.set(id, corpse)
  const blood = new Graphics().ellipse(p.x, p.y + 9, 24, 9).fill({ color: 0x5c151b, alpha: 0.55 })
  corpseLayer.addChildAt(blood, 0)
}

function visibleToPlayer(x: number, y: number): boolean {
  const d = Math.hypot(x - state.player.x, y - state.player.y)
  const radius = 6.5 + state.daylight() * 4.5
  return d < radius
}

function drawFog(): void {
  fogLayer.removeChildren().forEach((child: any) => child.destroy())
  const g = new Graphics()
  const radius = 6.5 + state.daylight() * 4.5
  for (let y = 0; y < SURVIVAL_WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < SURVIVAL_WORLD_WIDTH; x += 1) {
      const d = Math.hypot(x + 0.5 - state.player.x, y + 0.5 - state.player.y)
      if (d <= radius * 0.68) continue
      const alpha = d > radius ? 0.86 : 0.2 + ((d - radius * 0.68) / (radius * 0.32)) * 0.56
      diamond(g, x, y, 0x050705, alpha)
    }
  }
  fogLayer.addChild(g)
}

function updateCamera(): void {
  const pp = iso(state.player.x, state.player.y)
  world.scale.set(zoom)
  world.position.set(WIDTH * 0.47 - pp.x * zoom, HEIGHT * 0.5 - pp.y * zoom)
}

function processEvents(events: readonly SurvivalEvent[]): void {
  for (const event of events) {
    if (event.type === 'container-open') openContainerId = event.fixtureId
    if (event.type === 'window-smashed') feed('GLASS BREAKS. THAT WAS LOUD.', true)
    if (event.type === 'door') feed(event.open ? 'DOOR OPENED' : 'DOOR CLOSED')
    if (event.type === 'zombie-hit') feed(event.killed ? 'ZOMBIE DOWN' : 'KNIFE CONNECTS', event.killed)
    if (event.type === 'survivor-hit') feed(`HIT // HP ${Math.max(0, Math.ceil(event.hp))} // BLEED ${Math.ceil(event.bleeding)}`, true)
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
  setTimeout(() => line.remove(), 3200)
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
  statusLabel.textContent = state.noises.length > 0 ? `${state.noises.length} SOUND${state.noises.length === 1 ? '' : 'S'} ACTIVE` : 'QUIET'
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
  for (const item of state.inventory) {
    const row = document.createElement('div')
    row.className = 'item'
    const text = document.createElement('div')
    text.innerHTML = `<strong>${escapeHtml(item.name)}</strong><small>${(item.weight * item.quantity).toFixed(1)} kg</small>`
    row.appendChild(text)
    const action = inventoryAction(item)
    if (action) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = action.label
      button.onclick = () => {
        if (action.kind === 'bandage') state.bandage()
        else state.consume(item.id)
        processEvents(state.events)
        updateUi()
      }
      row.appendChild(button)
    }
    inventoryList.appendChild(row)
  }
}

function inventoryAction(item: SurvivalItem): { label: string; kind: 'consume' | 'bandage' } | null {
  if (item.kind === 'water') return { label: 'DRINK', kind: 'consume' }
  if (item.kind === 'beans' || item.kind === 'canned-soup') return { label: 'EAT', kind: 'consume' }
  if (item.kind === 'painkillers') return { label: 'TAKE', kind: 'consume' }
  if (item.kind === 'bandage') return { label: 'BANDAGE', kind: 'bandage' }
  return null
}

function renderLoot(): void {
  const nearby = state.nearestFixture(['container'], 1.35)
  if (openContainerId !== null && (!nearby || nearby.id !== openContainerId)) openContainerId = null
  const fixture = openContainerId === null ? null : state.fixtures.find((candidate) => candidate.id === openContainerId) ?? null
  lootList.replaceChildren()
  if (!fixture || fixture.kind !== 'container') {
    lootName.textContent = nearby ? `${nearby.containerKind?.toUpperCase()} // PRESS E` : 'NONE'
    return
  }
  lootName.textContent = `${fixture.containerKind?.toUpperCase()} // ${fixture.items?.length ?? 0} ITEMS`
  for (const item of fixture.items ?? []) {
    const row = document.createElement('div')
    row.className = 'item'
    const text = document.createElement('div')
    text.innerHTML = `<strong>${escapeHtml(item.name)}</strong><small>${item.weight.toFixed(1)} kg</small>`
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'TAKE'
    button.onclick = () => {
      state.events.length = 0
      state.takeItem(fixture.id, item.id)
      processEvents(state.events)
      updateUi()
    }
    row.append(text, button)
    lootList.appendChild(row)
  }
}

function updatePrompt(): void {
  const fixture = state.nearestFixture()
  if (!fixture) { interactionPrompt.textContent = 'MOVE QUIETLY. SEARCH HOUSES. WATCH THE ROAD.'; return }
  if (fixture.kind === 'door') interactionPrompt.textContent = `E // ${fixture.open ? 'CLOSE' : 'OPEN'} DOOR`
  else if (fixture.kind === 'window') interactionPrompt.textContent = fixture.smashed ? 'BROKEN WINDOW // PASSABLE' : 'F // SMASH WINDOW (LOUD)'
  else interactionPrompt.textContent = `E // SEARCH ${fixture.containerKind?.toUpperCase() ?? 'CONTAINER'}`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char))
}

function readInput(): SurvivalInput {
  return { x: Number(keys.has('KeyD')) - Number(keys.has('KeyA')), y: Number(keys.has('KeyS')) - Number(keys.has('KeyW')), sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'), interact: consumeFlag('interact'), attack: consumeFlag('attack'), smash: consumeFlag('smash') }
}

function consumeFlag(kind: 'interact' | 'attack' | 'smash'): boolean {
  if (kind === 'interact') { const value = queueInteract; queueInteract = false; return value }
  if (kind === 'attack') { const value = queueAttack; queueAttack = false; return value }
  const value = queueSmash; queueSmash = false; return value
}

function scriptedInput(): SurvivalInput {
  const t = state.tick
  if (t < 150) return { x: 0, y: 1 }
  if (t === 155) return { x: 0, y: 0, interact: true }
  if (t < 300) return { x: 1, y: 0, sprint: t > 220 }
  if (t % 120 === 0) return { x: 0, y: 0, attack: true }
  return { x: Math.cos(t * 0.013), y: Math.sin(t * 0.017), sprint: t % 240 > 190 }
}

function reset(seed = crypto.getRandomValues(new Uint32Array(1))[0]): void {
  state = new SurvivalState(seed)
  openContainerId = null
  corpseIds.clear()
  for (const view of zombieViews.values()) view.holder.destroy({ children: true })
  zombieViews.clear()
  for (const view of corpseViews.values()) view.destroy()
  corpseViews.clear()
  for (const view of fixtureViews.values()) view.destroy({ children: true })
  fixtureViews.clear()
  deathScreen.classList.add('hidden')
  lastDeath = false
  drawGround(); syncFixtures(); syncActors(); drawFog(); updateUi()
}

window.addEventListener('keydown', (event) => {
  keys.add(event.code)
  if (event.repeat) return
  if (event.code === 'KeyE') queueInteract = true
  if (event.code === 'Space') queueAttack = true
  if (event.code === 'KeyF') queueSmash = true
  if (event.code === 'KeyB') {
    state.events.length = 0
    if (!state.bandage()) feed('NO BANDAGE NEEDED / AVAILABLE')
    processEvents(state.events)
  }
})
window.addEventListener('keyup', (event) => keys.delete(event.code))
window.addEventListener('wheel', (event) => { zoom = Math.max(0.62, Math.min(1.45, zoom - Math.sign(event.deltaY) * 0.08)) }, { passive: true })

required<HTMLButtonElement>('bandage-button').onclick = () => { state.events.length = 0; if (!state.bandage()) feed('NO BANDAGE NEEDED / AVAILABLE'); processEvents(state.events); updateUi() }
required<HTMLButtonElement>('save-button').onclick = () => { localStorage.setItem(SAVE_KEY, state.serialize()); feed('WORLD SAVED') }
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
    drawGround(); syncFixtures(); syncActors(); drawFog()
    deathScreen.classList.toggle('hidden', !state.dead)
    lastDeath = state.dead
    updateUi(); feed('WORLD LOADED')
  } catch { feed('SAVE INVALID', true) }
}

app.ticker.add((ticker: { deltaMS: number }) => {
  const delta = Math.min(100, ticker.deltaMS)
  frameAccumulator += delta
  renderClock += delta
  while (frameAccumulator >= 1000 / 60) {
    state.step(AUTOTEST ? scriptedInput() : readInput())
    processEvents(state.events)
    frameAccumulator -= 1000 / 60
  }
  if (renderClock >= 80) { drawGround(); syncFixtures(); drawFog(); updateUi(); renderClock = 0 }
  syncActors(); updateCamera()
})

reset(AUTOTEST ? 0x51a7b10c : state.seed)
app.canvas.focus()
bootStatus.textContent = 'SURVIVAL WORLD READY // SAVE + NEEDS + NOISE + ZOMBIES'
setTimeout(() => bootStatus.classList.add('hidden'), 2400)
Object.assign(window, { __PZ_SURVIVAL_V0_READY__: true, __PZ_SURVIVAL_STATE__: () => state.resultHash() })

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id}`)
  return element as T
}
