import './pz-house-art.css'
import houseMapJson from './game/world/maps/house01.json'

const PIXI_URL = 'https://cdn.jsdelivr.net/npm/pixi.js@8.17.0/dist/pixi.mjs'
const PIXI = await import(/* @vite-ignore */ PIXI_URL)
const { Application, Assets, Container, Rectangle, Sprite, Texture } = PIXI

const WIDTH = 1280
const HEIGHT = 720
const TILE_W = 64
const TILE_H = 32
const FRAME = 96
const AUTOTEST = new URLSearchParams(location.search).get('autotest') === '1'
const SAVE_KEY = 'last-block-real-tileset-v0'
const SBS_REF = '6dc738b1f6aa0e94115956914fae9d529f63f7b9'
const KENNEY_REF = 'dfa19a5602a31f64bd890d15279a61f43b127328'
const SBS_ROOT = `https://raw.githubusercontent.com/DeinekoRoman/devoops/${SBS_REF}`
const KENNEY_ROOT = `https://raw.githubusercontent.com/RetroDECK/RetroQUEST/${KENNEY_REF}/assets/kenney_furniture-kit/Isometric`

type SpriteKey =
  | 'grass' | 'road' | 'sidewalk' | 'wood' | 'tile' | 'carpet'
  | 'exterior-wall' | 'interior-wall' | 'roof' | 'ridge' | 'door-closed' | 'door-open' | 'window'
  | 'fridge' | 'counter' | 'sink' | 'table' | 'chair' | 'sofa' | 'coffee-table' | 'tv' | 'bed' | 'dresser'
  | 'nightstand' | 'toilet' | 'bathtub' | 'medicine' | 'bookshelf' | 'shrub' | 'mailbox' | 'car' | 'trash' | 'rug' | 'lamp' | 'porch' | 'hedge'

type FloorKey = 'wood' | 'tile' | 'carpet'
type WallKind = 'exterior' | 'interior'
type OpeningKind = 'door' | 'window'
type RoomSpec = { id: string; x: number; y: number; w: number; h: number; floor: FloorKey }
type WallSpec = { x: number; y: number; kind: WallKind }
type OpeningSpec = { id: string; kind: OpeningKind; x: number; y: number; orientation: string; open?: boolean }
type ObjectSpec = { id: string; sprite: SpriteKey; x: number; y: number; container?: string; loot?: string[] }
type RectSpec = { x: number; y: number; w: number; h: number }
type HouseMap = {
  version: number
  name: string
  width: number
  height: number
  spawn: { x: number; y: number }
  houseBounds: RectSpec
  road: RectSpec
  sidewalk: RectSpec
  driveway: RectSpec
  rooms: RoomSpec[]
  walls: WallSpec[]
  openings: OpeningSpec[]
  objects: ObjectSpec[]
  roof: RectSpec & { tile: 'roof'; ridgeY: number }
}
type InventoryItem = { id: number; name: string; weight: number }
type Zombie = { id: number; x: number; y: number; vx: number; vy: number; alive: boolean; view?: any }
type SaveData = { player: { x: number; y: number }; inventory: InventoryItem[]; equippedBackpack: boolean; doorStates: Record<string, boolean>; containers: Record<string, InventoryItem[]> }

type TextureSpec = { url: string; scale: number }
const map = houseMapJson as HouseMap

const FALLBACK_FRAMES: Record<SpriteKey, [number, number]> = {
  grass: [0, 0], road: [1, 0], sidewalk: [2, 0], wood: [3, 0], tile: [4, 0], carpet: [5, 0],
  'exterior-wall': [0, 1], 'interior-wall': [1, 1], roof: [2, 1], ridge: [3, 1], 'door-closed': [4, 1], 'door-open': [5, 1],
  window: [0, 2], fridge: [1, 2], counter: [2, 2], sink: [3, 2], table: [4, 2], chair: [5, 2],
  sofa: [0, 3], 'coffee-table': [1, 3], tv: [2, 3], bed: [3, 3], dresser: [4, 3], nightstand: [5, 3],
  toilet: [0, 4], bathtub: [1, 4], medicine: [2, 4], bookshelf: [3, 4], shrub: [4, 4], mailbox: [5, 4],
  car: [0, 5], trash: [1, 5], rug: [2, 5], lamp: [3, 5], porch: [4, 5], hedge: [5, 5],
}

const REAL_OBJECTS: Partial<Record<SpriteKey, TextureSpec>> = {
  fridge: { url: `${KENNEY_ROOT}/kitchenFridge_NE.png`, scale: 0.42 },
  counter: { url: `${KENNEY_ROOT}/kitchenCabinet_NE.png`, scale: 0.42 },
  sink: { url: `${KENNEY_ROOT}/kitchenSink_NE.png`, scale: 0.42 },
  table: { url: `${KENNEY_ROOT}/tableRound_NE.png`, scale: 0.42 },
  sofa: { url: `${KENNEY_ROOT}/loungeSofa_NE.png`, scale: 0.42 },
  bed: { url: `${KENNEY_ROOT}/bedSingle_NE.png`, scale: 0.42 },
  toilet: { url: `${KENNEY_ROOT}/toilet_NE.png`, scale: 0.42 },
  bathtub: { url: `${KENNEY_ROOT}/bathtub_NE.png`, scale: 0.42 },
}

const ITEM_WEIGHT: Record<string, number> = {
  'Water Bottle': 1.0, 'Canned Beans': 0.8, 'Orange Soda': 0.7, 'Kitchen Knife': 0.7, 'Can Opener': 0.3,
  'Garbage Bag': 0.1, Bandage: 0.1, Painkillers: 0.2, Magazine: 0.2, 'Maple Street Map': 0.1,
  Flashlight: 0.5, Battery: 0.1, 'T-Shirt': 0.3, 'School Backpack': 0.9,
}

const app = new Application()
await app.init({ width: WIDTH, height: HEIGHT, background: '#a9b198', antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2) })
required<HTMLDivElement>('stage').appendChild(app.canvas)
app.canvas.tabIndex = 0

const [atlasBase, survivorTexture, zombieTexture] = await Promise.all([
  Assets.load('./assets/pz-house-v0/house-atlas.svg'),
  Assets.load('./assets/characters/survivor/survivor.svg'),
  Assets.load('./assets/enemies/zombies/walker.png'),
])

const fallbackTextures = new Map<SpriteKey, any>()
function fallbackTexture(key: SpriteKey): any {
  const cached = fallbackTextures.get(key)
  if (cached) return cached
  const [cx, cy] = FALLBACK_FRAMES[key]
  const texture = new Texture({ source: atlasBase.source, frame: new Rectangle(cx * FRAME, cy * FRAME, FRAME, FRAME) })
  fallbackTextures.set(key, texture)
  return texture
}

async function loadImageTexture(url: string): Promise<any> {
  return Assets.load(url)
}

async function loadKeyedFloor(url: string, frameIndex = 0): Promise<any> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`Could not load ${url}`))
    image.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D unavailable')
  ctx.drawImage(image, 0, 0)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < pixels.data.length; i += 4) {
    const r = pixels.data[i] ?? 0; const g = pixels.data[i + 1] ?? 0; const b = pixels.data[i + 2] ?? 0
    if (r > 245 && g < 20 && b > 245) pixels.data[i + 3] = 0
  }
  ctx.putImageData(pixels, 0, 0)
  const base = Texture.from(canvas)
  const col = frameIndex % 3; const row = Math.floor(frameIndex / 3)
  return new Texture({ source: base.source, frame: new Rectangle(col * 128, row * 64, 128, 64) })
}

const floorBase = `${SBS_ROOT}/SBS%20-%20Isometric%20Floor%20Tiles%20-%20Small%20128x64/Small%20128x64`
const wallBase = `${SBS_ROOT}/SBS%20-%20Isometric%20Wall%20Pack%20-%20Small/Small%20Wall%20Tiles/Flat%2064x96`

const realTextures = new Map<string, any>()
const realScales = new Map<SpriteKey, number>()
try {
  const [grass, wood, tile, stone, brickSE, brickSW, plasterSE, plasterSW, ...objects] = await Promise.all([
    loadKeyedFloor(`${floorBase}/Exterior/Grass/Floor_Grass_01-128x64.png`, 4),
    loadKeyedFloor(`${floorBase}/Interior/Wood/Floor_Wood_01-128x64.png`, 5),
    loadKeyedFloor(`${floorBase}/Interior/Tile/Floor_Tile_01-128x64.png`, 1),
    loadKeyedFloor(`${floorBase}/Interior/Stone/Floor_Stone_02-128x64.png`, 3),
    loadImageTexture(`${wallBase}/Flat_Brick_02-SE-64x96.png`),
    loadImageTexture(`${wallBase}/Flat_Brick_02-SW-64x96.png`),
    loadImageTexture(`${wallBase}/Flat_Plaster_04-SE-64x96.png`),
    loadImageTexture(`${wallBase}/Flat_Plaster_04-SW-64x96.png`),
    ...Object.entries(REAL_OBJECTS).map(([, spec]) => loadImageTexture(spec.url)),
  ])
  realTextures.set('grass', grass); realTextures.set('wood', wood); realTextures.set('tile', tile); realTextures.set('road', stone); realTextures.set('sidewalk', stone)
  realTextures.set('exterior-se', brickSE); realTextures.set('exterior-sw', brickSW); realTextures.set('interior-se', plasterSE); realTextures.set('interior-sw', plasterSW)
  let index = 0
  for (const [key, spec] of Object.entries(REAL_OBJECTS) as Array<[SpriteKey, TextureSpec]>) {
    realTextures.set(key, objects[index++]); realScales.set(key, spec.scale)
  }
} catch (error) {
  console.warn('Real tileset intake partially unavailable; using local fallback atlas.', error)
}

function textureFor(key: SpriteKey): any { return realTextures.get(key) ?? fallbackTexture(key) }

const world = new Container(); world.sortableChildren = true; app.stage.addChild(world)
function layer(zIndex: number): any { const value = new Container(); value.zIndex = zIndex; value.sortableChildren = true; world.addChild(value); return value }
const groundLayer = layer(0)
const wallLayer = layer(10000)
const objectLayer = layer(20000)
const actorLayer = layer(30000)
const roofLayer = layer(50000)

const keys = new Set<string>()
let zoom = 1.12
let playerX = AUTOTEST ? 6.25 : map.spawn.x
let playerY = AUTOTEST ? 7.15 : map.spawn.y
let nextItemId = 1000
let inventory: InventoryItem[] = [item('Kitchen Knife'), item('Bandage')]
let equippedBackpack = false
let openContainerId: string | null = AUTOTEST ? 'bookshelf' : null
const doorStates = new Map<string, boolean>(map.openings.filter((opening) => opening.kind === 'door').map((door) => [door.id, door.open === true]))
const containerItems = new Map<string, InventoryItem[]>()
for (const object of map.objects) if (object.container) containerItems.set(object.id, (object.loot ?? []).map((name) => item(name)))
function item(name: string): InventoryItem { return { id: nextItemId++, name, weight: ITEM_WEIGHT[name] ?? 0.4 } }

const wallViews: Array<{ spec: WallSpec; view: any }> = []
const openingViews = new Map<string, any>()

function iso(x: number, y: number): { x: number; y: number } { return { x: (x - y) * TILE_W * 0.5, y: (x + y) * TILE_H * 0.5 } }
function inRect(x: number, y: number, rect: RectSpec): boolean { return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h }
function roomAt(x: number, y: number): RoomSpec | null { return map.rooms.find((room) => inRect(x, y, room)) ?? null }
function groundKeyAt(x: number, y: number): SpriteKey {
  const room = roomAt(x, y)
  if (room) return room.floor
  if (inRect(x, y, map.road)) return 'road'
  if (inRect(x, y, map.sidewalk) || inRect(x, y, map.driveway)) return 'sidewalk'
  if (x === 8 && y === 10) return 'porch'
  return 'grass'
}

function addWorldSprite(target: any, key: SpriteKey, x: number, y: number, kind: 'floor' | 'object', scale = 1): any {
  const sprite = new Sprite(textureFor(key))
  const p = iso(x, y)
  sprite.position.set(p.x, p.y)
  const floorIsReal = kind === 'floor' && realTextures.has(key)
  sprite.anchor.set(0.5, floorIsReal ? 0.5 : kind === 'floor' ? 0.43 : 0.78)
  const baseScale = floorIsReal ? 0.5 : realScales.get(key) ?? 1
  sprite.scale.set(scale * baseScale)
  sprite.zIndex = Math.round(p.y * 10)
  target.addChild(sprite)
  return sprite
}

function wallOrientation(spec: WallSpec): 'se' | 'sw' {
  const horizontalNeighbor = map.walls.some((wall) => wall !== spec && wall.y === spec.y && Math.abs(wall.x - spec.x) === 1)
  const verticalNeighbor = map.walls.some((wall) => wall !== spec && wall.x === spec.x && Math.abs(wall.y - spec.y) === 1)
  if (horizontalNeighbor && !verticalNeighbor) return 'se'
  if (verticalNeighbor && !horizontalNeighbor) return 'sw'
  return spec.y <= map.houseBounds.y || spec.y >= map.houseBounds.y + map.houseBounds.h - 1 ? 'se' : 'sw'
}
function wallTexture(spec: WallSpec): any {
  const orientation = wallOrientation(spec)
  return realTextures.get(`${spec.kind}-${orientation}`) ?? fallbackTexture(spec.kind === 'exterior' ? 'exterior-wall' : 'interior-wall')
}

function renderGround(): void {
  for (let y = 0; y < map.height; y += 1) for (let x = 0; x < map.width; x += 1) addWorldSprite(groundLayer, groundKeyAt(x, y), x + 0.5, y + 0.5, 'floor')
  for (const [x, y] of [[8, 10], [8, 11]] as const) addWorldSprite(groundLayer, 'porch', x + 0.5, y + 0.5, 'floor')
  for (const [x, y] of [[3.2, 9.9], [3.1, 10.6], [14.0, 9.7], [14.4, 10.5]] as const) addWorldSprite(objectLayer, 'hedge', x, y, 'object', 0.72)
}
function renderWalls(): void {
  for (const spec of map.walls) {
    const sprite = new Sprite(wallTexture(spec)); const p = iso(spec.x + 0.5, spec.y + 0.5)
    sprite.position.set(p.x, p.y); sprite.anchor.set(0.5, 0.84); sprite.zIndex = Math.round(p.y * 10); wallLayer.addChild(sprite); wallViews.push({ spec, view: sprite })
  }
  for (const opening of map.openings) {
    const key: SpriteKey = opening.kind === 'window' ? 'window' : doorStates.get(opening.id) ? 'door-open' : 'door-closed'
    openingViews.set(opening.id, addWorldSprite(wallLayer, key, opening.x + 0.5, opening.y + 0.5, 'object'))
  }
}
function renderObjects(): void {
  for (const object of map.objects) addWorldSprite(objectLayer, object.sprite, object.x, object.y, 'object', object.sprite === 'car' ? 0.92 : 1)
  addWorldSprite(objectLayer, 'rug', 6.5, 7.25, 'floor', 1.25)
  addWorldSprite(objectLayer, 'lamp', 7.35, 8.15, 'object', 0.88)
}
function renderRoof(): void {
  for (let y = map.roof.y; y < map.roof.y + map.roof.h; y += 1) for (let x = map.roof.x; x < map.roof.x + map.roof.w; x += 1) {
    const roof = addWorldSprite(roofLayer, 'roof', x + 0.5, y + 0.5, 'floor', 1.12); roof.tint = (x + y) % 2 === 0 ? 0xffffff : 0xf2e4df
  }
  for (let x = map.roof.x + 1; x < map.roof.x + map.roof.w - 1; x += 1) addWorldSprite(roofLayer, 'ridge', x + 0.5, map.roof.ridgeY + 0.5, 'floor', 1.08)
}

renderGround(); renderWalls(); renderObjects(); renderRoof()

const player = new Container(); player.zIndex = 999999
const playerShadow = new Sprite(fallbackTexture('rug')); playerShadow.anchor.set(0.5); playerShadow.scale.set(0.42, 0.16); playerShadow.tint = 0x20251e; playerShadow.alpha = 0.26
const playerSprite = new Sprite(survivorTexture); playerSprite.anchor.set(0.5, 0.82); playerSprite.scale.set(0.22)
player.addChild(playerShadow, playerSprite); actorLayer.addChild(player)

const zombies: Zombie[] = [
  { id: 1, x: 2.8, y: 11.8, vx: 0.0007, vy: 0, alive: true }, { id: 2, x: 15.5, y: 11.3, vx: -0.0007, vy: 0.0004, alive: true },
  { id: 3, x: 2.4, y: 5.7, vx: 0.0004, vy: 0.0006, alive: true }, { id: 4, x: 15.8, y: 6.2, vx: -0.0005, vy: -0.0003, alive: true },
  { id: 5, x: 11.9, y: 12.8, vx: -0.0006, vy: 0, alive: true },
]
for (const zombie of zombies) {
  const holder = new Container(); const shadow = new Sprite(fallbackTexture('rug')); shadow.anchor.set(0.5); shadow.scale.set(0.34, 0.13); shadow.tint = 0x263022; shadow.alpha = 0.25
  const sprite = new Sprite(zombieTexture); sprite.anchor.set(0.5, 0.82); sprite.scale.set(0.56); sprite.tint = 0x9ca695
  holder.addChild(shadow, sprite); actorLayer.addChild(holder); zombie.view = holder
}

const inventoryWindow = required<HTMLElement>('inventory-window')
const lootWindow = required<HTMLElement>('loot-window')
const inventoryList = required<HTMLElement>('inventory-list')
const lootList = required<HTMLElement>('loot-list')
const lootTitle = required<HTMLElement>('loot-title')
const weightLabel = required<HTMLElement>('weight-label')
const interactionPrompt = required<HTMLElement>('interaction-prompt')
const eventFeed = required<HTMLElement>('event-feed')
const bootStatus = required<HTMLElement>('boot-status')
if (AUTOTEST) { inventoryWindow.classList.remove('hidden'); lootWindow.classList.remove('hidden') }
makeDraggable(inventoryWindow); makeDraggable(lootWindow)

function isWallCell(x: number, y: number): boolean { const ix = Math.floor(x); const iy = Math.floor(y); return map.walls.some((wall) => wall.x === ix && wall.y === iy) }
function doorAt(x: number, y: number): OpeningSpec | null { const ix = Math.floor(x); const iy = Math.floor(y); return map.openings.find((opening) => opening.kind === 'door' && opening.x === ix && opening.y === iy) ?? null }
function canOccupy(x: number, y: number): boolean { if (x < 0.3 || y < 0.3 || x > map.width - 0.3 || y > map.height - 0.3) return false; if (isWallCell(x, y)) return false; const door = doorAt(x, y); return !door || doorStates.get(door.id) === true }
function insideHouse(): boolean { return playerX > map.houseBounds.x && playerY > map.houseBounds.y && playerX < map.houseBounds.x + map.houseBounds.w - 1 && playerY < map.houseBounds.y + map.houseBounds.h - 1 }
function nearestDoor(max = 1.15): OpeningSpec | null { let best: OpeningSpec | null = null; let bestDistance = max; for (const opening of map.openings) { if (opening.kind !== 'door') continue; const d = Math.hypot(opening.x + 0.5 - playerX, opening.y + 0.5 - playerY); if (d < bestDistance) { best = opening; bestDistance = d } } return best }
function nearestContainer(max = 1.25): ObjectSpec | null { let best: ObjectSpec | null = null; let bestDistance = max; for (const object of map.objects) { if (!object.container) continue; const d = Math.hypot(object.x - playerX, object.y - playerY); if (d < bestDistance) { best = object; bestDistance = d } } return best }

function interact(): void {
  const door = nearestDoor()
  if (door) { const open = !doorStates.get(door.id); doorStates.set(door.id, open); const view = openingViews.get(door.id); if (view) view.texture = fallbackTexture(open ? 'door-open' : 'door-closed'); feed(open ? 'Door opened.' : 'Door closed.'); return }
  const container = nearestContainer()
  if (container) { openContainerId = container.id; lootWindow.classList.remove('hidden'); inventoryWindow.classList.remove('hidden'); renderUi(); feed(`Searching ${container.container}.`) }
}
function movePlayer(dx: number, dy: number, sprint: boolean): void { const length = Math.hypot(dx, dy); if (length < 0.01) return; const speed = sprint ? 0.052 : 0.034; const nx = playerX + (dx / length) * speed; const ny = playerY + (dy / length) * speed; if (canOccupy(nx, playerY)) playerX = nx; if (canOccupy(playerX, ny)) playerY = ny }
function updateActors(delta: number): void { const pp = iso(playerX, playerY); player.position.set(pp.x, pp.y); player.zIndex = Math.round(pp.y * 10 + 5); for (const zombie of zombies) { if (!zombie.alive || !zombie.view) continue; zombie.x += zombie.vx * delta; zombie.y += zombie.vy * delta; if (zombie.x < 1 || zombie.x > map.width - 1) zombie.vx *= -1; if (zombie.y < 1 || zombie.y > map.height - 1) zombie.vy *= -1; const p = iso(zombie.x, zombie.y); zombie.view.position.set(p.x, p.y); zombie.view.zIndex = Math.round(p.y * 10) } }
function updateCutaway(): void { const inside = insideHouse(); roofLayer.alpha += ((inside ? 0.07 : 1) - roofLayer.alpha) * 0.12; for (const { spec, view } of wallViews) { const foreground = spec.kind === 'exterior' && (spec.y >= 8 || spec.x >= 12); view.alpha += (((inside && foreground) ? 0.12 : 1) - view.alpha) * 0.16 } }
function updateCamera(): void { const pp = iso(playerX, playerY); world.scale.set(zoom); world.position.set(WIDTH * 0.5 - pp.x * zoom, HEIGHT * 0.53 - pp.y * zoom) }

function inventoryCapacity(): number { return equippedBackpack ? 20 : 8 }
function inventoryWeight(): number { return inventory.reduce((sum, current) => sum + current.weight, 0) }
function renderUi(): void {
  weightLabel.textContent = `${inventoryWeight().toFixed(1)} / ${inventoryCapacity()} KG`; inventoryList.replaceChildren()
  for (const current of inventory) {
    const row = document.createElement('div'); row.className = 'row'; const copy = document.createElement('div'); copy.innerHTML = `<strong>${escapeHtml(current.name)}</strong><small>${current.weight.toFixed(1)} kg</small>`; row.appendChild(copy)
    if (current.name === 'School Backpack' && !equippedBackpack) { const button = document.createElement('button'); button.textContent = 'EQUIP'; button.onclick = () => { equippedBackpack = true; feed('Backpack equipped.'); renderUi() }; row.appendChild(button) }
    else if (['Water Bottle', 'Orange Soda', 'Canned Beans', 'Bandage', 'Painkillers'].includes(current.name)) { const button = document.createElement('button'); button.textContent = current.name === 'Bandage' ? 'USE' : current.name.includes('Water') || current.name.includes('Soda') ? 'DRINK' : current.name === 'Painkillers' ? 'TAKE' : 'EAT'; button.onclick = () => { inventory = inventory.filter((entry) => entry.id !== current.id); feed(`${current.name} used.`); renderUi() }; row.appendChild(button) }
    inventoryList.appendChild(row)
  }
  lootList.replaceChildren(); const object = openContainerId ? map.objects.find((candidate) => candidate.id === openContainerId) ?? null : null
  if (!object || !object.container) { lootTitle.textContent = 'CONTAINER'; if (!AUTOTEST) lootWindow.classList.add('hidden'); return }
  lootTitle.textContent = object.container.toUpperCase(); const contents = containerItems.get(object.id) ?? []
  for (const current of contents) { const row = document.createElement('div'); row.className = 'row'; const copy = document.createElement('div'); copy.innerHTML = `<strong>${escapeHtml(current.name)}</strong><small>${current.weight.toFixed(1)} kg</small>`; const button = document.createElement('button'); button.textContent = 'TAKE'; button.onclick = () => takeItem(object.id, current.id); row.append(copy, button); lootList.appendChild(row) }
  if (contents.length === 0) { const empty = document.createElement('div'); empty.className = 'row'; empty.textContent = 'Empty.'; lootList.appendChild(empty) }
}
function takeItem(containerId: string, itemId: number): void { const contents = containerItems.get(containerId) ?? []; const index = contents.findIndex((entry) => entry.id === itemId); if (index < 0) return; const current = contents[index]; if (inventoryWeight() + current.weight > inventoryCapacity()) { feed('Too heavy.'); return }; contents.splice(index, 1); inventory.push(current); feed(`Took ${current.name}.`); renderUi() }
function takeAll(): void { if (!openContainerId) return; const contents = containerItems.get(openContainerId) ?? []; for (const current of [...contents]) takeItem(openContainerId, current.id) }
function updatePrompt(): void { const door = nearestDoor(); if (door) { interactionPrompt.textContent = `E · ${doorStates.get(door.id) ? 'CLOSE' : 'OPEN'} DOOR`; return }; const container = nearestContainer(); if (container) { interactionPrompt.textContent = `E · SEARCH ${container.container?.toUpperCase()}`; return }; const room = roomAt(playerX, playerY); interactionPrompt.textContent = room ? `${room.id.toUpperCase()} · I INVENTORY · ESC CLOSE PANELS` : 'WASD MOVE · E OPEN / SEARCH · I INVENTORY · WHEEL ZOOM' }

function save(): void { const data: SaveData = { player: { x: playerX, y: playerY }, inventory, equippedBackpack, doorStates: Object.fromEntries(doorStates), containers: Object.fromEntries(containerItems) }; localStorage.setItem(SAVE_KEY, JSON.stringify(data)); feed('House state saved.') }
function load(): void { const raw = localStorage.getItem(SAVE_KEY); if (!raw) { feed('No save found.'); return }; try { const data = JSON.parse(raw) as SaveData; playerX = data.player.x; playerY = data.player.y; inventory = data.inventory; equippedBackpack = data.equippedBackpack; for (const [id, value] of Object.entries(data.doorStates)) doorStates.set(id, value); for (const [id, value] of Object.entries(data.containers)) containerItems.set(id, value); for (const opening of map.openings.filter((entry) => entry.kind === 'door')) { const view = openingViews.get(opening.id); if (view) view.texture = fallbackTexture(doorStates.get(opening.id) ? 'door-open' : 'door-closed') }; feed('House state loaded.'); renderUi() } catch { feed('Save could not be loaded.') } }
function feed(copy: string): void { const line = document.createElement('div'); line.className = 'feed'; line.textContent = copy; eventFeed.prepend(line); setTimeout(() => line.remove(), 3200); while (eventFeed.children.length > 5) eventFeed.lastElementChild?.remove() }
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char)) }
function makeDraggable(element: HTMLElement): void { const handle = element.querySelector<HTMLElement>('.window-handle'); if (!handle) return; let drag = false; let ox = 0; let oy = 0; handle.addEventListener('pointerdown', (event) => { if ((event.target as HTMLElement).tagName === 'BUTTON') return; drag = true; ox = event.clientX - element.offsetLeft; oy = event.clientY - element.offsetTop; handle.setPointerCapture(event.pointerId) }); handle.addEventListener('pointermove', (event) => { if (!drag) return; element.style.left = `${Math.max(8, Math.min(innerWidth - element.offsetWidth - 8, event.clientX - ox))}px`; element.style.top = `${Math.max(62, Math.min(innerHeight - 80, event.clientY - oy))}px`; element.style.right = 'auto' }); handle.addEventListener('pointerup', () => { drag = false }) }

window.addEventListener('keydown', (event) => { keys.add(event.code); if (event.repeat) return; if (event.code === 'KeyE') interact(); if (event.code === 'KeyI' || event.code === 'Tab') { event.preventDefault(); inventoryWindow.classList.toggle('hidden'); renderUi() }; if (event.code === 'Escape') { inventoryWindow.classList.add('hidden'); lootWindow.classList.add('hidden'); openContainerId = null } })
window.addEventListener('keyup', (event) => keys.delete(event.code))
window.addEventListener('wheel', (event) => { zoom = Math.max(0.78, Math.min(1.55, zoom - Math.sign(event.deltaY) * 0.07) }, { passive: true })
required<HTMLButtonElement>('close-inventory').onclick = () => inventoryWindow.classList.add('hidden')
required<HTMLButtonElement>('close-loot').onclick = () => { lootWindow.classList.add('hidden'); openContainerId = null }
required<HTMLButtonElement>('take-all').onclick = takeAll
required<HTMLButtonElement>('save-button').onclick = save
required<HTMLButtonElement>('load-button').onclick = load

let last = performance.now()
app.ticker.add(() => { const now = performance.now(); const delta = Math.min(34, now - last); last = now; if (inventoryWindow.classList.contains('hidden') && lootWindow.classList.contains('hidden')) { const dx = Number(keys.has('KeyD')) - Number(keys.has('KeyA')); const dy = Number(keys.has('KeyS')) - Number(keys.has('KeyW')); movePlayer(dx, dy, keys.has('ShiftLeft') || keys.has('ShiftRight')) }; if (openContainerId) { const object = map.objects.find((candidate) => candidate.id === openContainerId); if (!object || Math.hypot(object.x - playerX, object.y - playerY) > 1.7) { openContainerId = null; if (!AUTOTEST) lootWindow.classList.add('hidden') } }; updateActors(delta); updateCutaway(); updateCamera(); updatePrompt() })

renderUi(); updateCamera(); bootStatus.textContent = realTextures.size > 0 ? 'REAL CC0 TILESET LOADED' : 'FALLBACK ART LOADED'; setTimeout(() => bootStatus.classList.add('hidden'), 1900)
Object.assign(window, { __PZ_REAL_TILESET_V0_READY__: true, __PZ_REAL_TILESET_COUNT__: () => realTextures.size, __PZ_HOUSE_ROOM__: () => roomAt(playerX, playerY)?.id ?? 'outside' })
app.canvas.focus()

function required<T extends HTMLElement>(id: string): T { const element = document.getElementById(id); if (!element) throw new Error(`Missing #${id}`); return element as T }
