import { XorShift32 } from '../sim/RNG'

export const SURVIVAL_WORLD_WIDTH = 30
export const SURVIVAL_WORLD_HEIGHT = 24
export const SURVIVAL_TICKS_PER_MINUTE = 60

export type TerrainKind = 'grass' | 'road' | 'floor' | 'wall' | 'fence'
export type FixtureKind = 'door' | 'window' | 'container'
export type ContainerKind = 'fridge' | 'cabinet' | 'dresser' | 'medicine' | 'shelf' | 'crate'
export type ItemKind = 'knife' | 'bandage' | 'water' | 'beans' | 'backpack' | 'painkillers' | 'canned-soup'
export type ZombieMode = 'wander' | 'investigate' | 'chase'

export interface WorldCell { terrain: TerrainKind; roomId?: string }
export interface SurvivalItem { id: number; kind: ItemKind; name: string; weight: number; quantity: number }
export interface FixtureState { id: number; kind: FixtureKind; x: number; y: number; roomId?: string; open?: boolean; smashed?: boolean; containerKind?: ContainerKind; items?: SurvivalItem[] }
export interface ZombieState { id: number; x: number; y: number; hp: number; active: boolean; mode: ZombieMode; targetX: number; targetY: number; alertTicks: number; attackCooldown: number; wanderTicks: number; facing: number }
export interface NoiseEvent { id: number; x: number; y: number; power: number; ttl: number; source: 'step' | 'sprint' | 'door' | 'window' | 'melee' }
export interface SurvivorState { x: number; y: number; facing: number; hp: number; hunger: number; thirst: number; fatigue: number; bleeding: number; pain: number; attackCooldown: number }
export interface SurvivalInput { x: number; y: number; sprint?: boolean; interact?: boolean; attack?: boolean; smash?: boolean }

export type SurvivalEvent =
  | { type: 'noise'; x: number; y: number; power: number; source: NoiseEvent['source'] }
  | { type: 'door'; fixtureId: number; open: boolean }
  | { type: 'window-smashed'; fixtureId: number; x: number; y: number }
  | { type: 'container-open'; fixtureId: number }
  | { type: 'item-taken'; fixtureId: number; item: SurvivalItem }
  | { type: 'inventory-full'; fixtureId: number; itemId: number }
  | { type: 'consumed'; item: SurvivalItem }
  | { type: 'bandaged' }
  | { type: 'zombie-hit'; zombieId: number; killed: boolean; x: number; y: number }
  | { type: 'survivor-hit'; zombieId: number; hp: number; bleeding: number }
  | { type: 'survivor-died' }

interface SerializedSurvivalState {
  version: 1
  seed: number
  rngState: number
  tick: number
  worldMinutes: number
  nextNoiseId: number
  player: SurvivorState
  inventory: SurvivalItem[]
  fixtures: FixtureState[]
  zombies: ZombieState[]
  noises: NoiseEvent[]
}

const ITEM_DEFS: Record<ItemKind, Omit<SurvivalItem, 'id' | 'quantity'>> = {
  knife: { kind: 'knife', name: 'Kitchen Knife', weight: 0.7 },
  bandage: { kind: 'bandage', name: 'Sterile Bandage', weight: 0.1 },
  water: { kind: 'water', name: 'Water Bottle', weight: 1.0 },
  beans: { kind: 'beans', name: 'Canned Beans', weight: 0.8 },
  backpack: { kind: 'backpack', name: 'School Backpack', weight: 0.9 },
  painkillers: { kind: 'painkillers', name: 'Painkillers', weight: 0.2 },
  'canned-soup': { kind: 'canned-soup', name: 'Canned Soup', weight: 0.9 },
}

function cloneItem(item: SurvivalItem): SurvivalItem { return { ...item } }
function distance(ax: number, ay: number, bx: number, by: number): number { return Math.hypot(ax - bx, ay - by) }
function normalized(x: number, y: number): { x: number; y: number } { const length = Math.hypot(x, y); return length > 0.0001 ? { x: x / length, y: y / length } : { x: 0, y: 0 } }
function cloneFixture(fixture: FixtureState): FixtureState { return { ...fixture, items: fixture.items?.map(cloneItem) } }

export class SurvivalState {
  readonly seed: number
  rng: XorShift32
  readonly cells: WorldCell[]
  fixtures: FixtureState[]
  zombies: ZombieState[]
  noises: NoiseEvent[] = []
  inventory: SurvivalItem[]
  readonly events: SurvivalEvent[] = []
  player: SurvivorState
  tick = 0
  worldMinutes = 8 * 60
  nextNoiseId = 1
  dead = false

  constructor(seed: number) {
    this.seed = seed >>> 0
    this.rng = new XorShift32(seed)
    const world = buildNeighborhood(this.rng)
    this.cells = world.cells
    this.fixtures = world.fixtures
    this.zombies = spawnZombies(this.rng, this.cells, this.fixtures, 42)
    this.inventory = [makeItem(1, 'knife'), makeItem(2, 'bandage')]
    this.player = { x: 6.5, y: 7.1, facing: -Math.PI / 2, hp: 100, hunger: 8, thirst: 10, fatigue: 6, bleeding: 0, pain: 0, attackCooldown: 0 }
  }

  step(input: SurvivalInput): void {
    if (this.dead) return
    this.events.length = 0
    this.tick += 1
    this.worldMinutes += 1 / SURVIVAL_TICKS_PER_MINUTE
    this.updateNeeds()
    this.updatePlayer(input)
    if (input.interact) this.interact()
    if (input.smash) this.smashWindow()
    if (input.attack) this.attack()
    this.updateNoises()
    this.updateZombies()
    if (this.player.attackCooldown > 0) this.player.attackCooldown -= 1
    if (this.player.bleeding > 0) {
      this.player.hp -= 0.0025 * this.player.bleeding
      this.player.pain = Math.min(100, this.player.pain + 0.0015 * this.player.bleeding)
    }
    if (this.player.hp <= 0 && !this.dead) {
      this.player.hp = 0
      this.dead = true
      this.events.push({ type: 'survivor-died' })
    }
  }

  cell(x: number, y: number): WorldCell | null {
    const ix = Math.floor(x); const iy = Math.floor(y)
    if (ix < 0 || iy < 0 || ix >= SURVIVAL_WORLD_WIDTH || iy >= SURVIVAL_WORLD_HEIGHT) return null
    return this.cells[iy * SURVIVAL_WORLD_WIDTH + ix] ?? null
  }

  fixtureAt(x: number, y: number): FixtureState | undefined {
    const ix = Math.floor(x); const iy = Math.floor(y)
    return this.fixtures.find((fixture) => fixture.x === ix && fixture.y === iy)
  }

  canOccupy(x: number, y: number): boolean {
    const cell = this.cell(x, y)
    if (!cell) return false
    const fixture = this.fixtureAt(x, y)
    if (fixture?.kind === 'door') return fixture.open === true
    if (fixture?.kind === 'window') return fixture.smashed === true
    return cell.terrain !== 'wall' && cell.terrain !== 'fence'
  }

  nearestFixture(kinds: FixtureKind[] = ['door', 'window', 'container'], maxDistance = 1.2): FixtureState | null {
    let best: FixtureState | null = null; let bestDistance = maxDistance
    for (const fixture of this.fixtures) {
      if (!kinds.includes(fixture.kind)) continue
      const d = distance(this.player.x, this.player.y, fixture.x + 0.5, fixture.y + 0.5)
      if (d <= bestDistance) { best = fixture; bestDistance = d }
    }
    return best
  }

  inventoryWeight(): number { return this.inventory.reduce((sum, item) => sum + item.weight * item.quantity, 0) }
  inventoryCapacity(): number { return this.inventory.some((item) => item.kind === 'backpack') ? 20 : 8 }

  takeItem(fixtureId: number, itemId: number): boolean {
    const fixture = this.fixtures.find((candidate) => candidate.id === fixtureId && candidate.kind === 'container')
    const index = fixture?.items?.findIndex((item) => item.id === itemId) ?? -1
    if (!fixture?.items || index < 0) return false
    const item = fixture.items[index]
    if (this.inventoryWeight() + item.weight * item.quantity > this.inventoryCapacity()) {
      this.events.push({ type: 'inventory-full', fixtureId, itemId }); return false
    }
    fixture.items.splice(index, 1); this.inventory.push(item)
    this.events.push({ type: 'item-taken', fixtureId, item: cloneItem(item) }); return true
  }

  consume(itemId: number): boolean {
    const index = this.inventory.findIndex((item) => item.id === itemId)
    if (index < 0) return false
    const item = this.inventory[index]
    if (item.kind === 'water') this.player.thirst = Math.max(0, this.player.thirst - 38)
    else if (item.kind === 'beans') this.player.hunger = Math.max(0, this.player.hunger - 32)
    else if (item.kind === 'canned-soup') { this.player.hunger = Math.max(0, this.player.hunger - 24); this.player.thirst = Math.max(0, this.player.thirst - 8) }
    else if (item.kind === 'painkillers') this.player.pain = Math.max(0, this.player.pain - 30)
    else return false
    this.inventory.splice(index, 1); this.events.push({ type: 'consumed', item: cloneItem(item) }); return true
  }

  bandage(): boolean {
    if (this.player.bleeding <= 0) return false
    const index = this.inventory.findIndex((item) => item.kind === 'bandage')
    if (index < 0) return false
    this.inventory.splice(index, 1); this.player.bleeding = 0; this.player.pain = Math.max(0, this.player.pain - 8)
    this.events.push({ type: 'bandaged' }); return true
  }

  currentRoomId(): string | undefined { return this.cell(this.player.x, this.player.y)?.roomId }
  timeLabel(): string { const minutes = Math.floor(this.worldMinutes) % (24 * 60); const hour = Math.floor(minutes / 60); const minute = minutes % 60; return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}` }
  daylight(): number { const hour = (this.worldMinutes / 60) % 24; if (hour < 5 || hour >= 22) return 0.16; if (hour < 7) return 0.16 + ((hour - 5) / 2) * 0.84; if (hour >= 19) return 1 - ((hour - 19) / 3) * 0.84; return 1 }

  serialize(): string {
    const data: SerializedSurvivalState = { version: 1, seed: this.seed, rngState: this.rng.snapshot(), tick: this.tick, worldMinutes: this.worldMinutes, nextNoiseId: this.nextNoiseId, player: { ...this.player }, inventory: this.inventory.map(cloneItem), fixtures: this.fixtures.map(cloneFixture), zombies: this.zombies.map((zombie) => ({ ...zombie })), noises: this.noises.map((noise) => ({ ...noise })) }
    return JSON.stringify(data)
  }

  static deserialize(serialized: string): SurvivalState {
    const data = JSON.parse(serialized) as SerializedSurvivalState
    if (data.version !== 1) throw new Error('Unsupported survival save version')
    const state = new SurvivalState(data.seed)
    state.rng = new XorShift32(data.rngState); state.tick = data.tick; state.worldMinutes = data.worldMinutes; state.nextNoiseId = data.nextNoiseId
    state.player = { ...data.player }; state.inventory = data.inventory.map(cloneItem); state.fixtures = data.fixtures.map(cloneFixture); state.zombies = data.zombies.map((zombie) => ({ ...zombie })); state.noises = data.noises.map((noise) => ({ ...noise })); state.dead = state.player.hp <= 0; state.events.length = 0
    return state
  }

  resultHash(): string {
    let hash = 2166136261 >>> 0
    const feed = (value: number) => { const n = Math.trunc(value * 1000); hash ^= n >>> 0; hash = Math.imul(hash, 16777619) >>> 0 }
    feed(this.seed); feed(this.tick); feed(this.worldMinutes); feed(this.rng.snapshot()); feed(this.nextNoiseId)
    feed(this.player.x); feed(this.player.y); feed(this.player.facing); feed(this.player.hp); feed(this.player.hunger); feed(this.player.thirst); feed(this.player.fatigue); feed(this.player.bleeding); feed(this.player.pain)
    for (const item of this.inventory) { feed(item.id); feed(item.quantity) }
    for (const fixture of this.fixtures) { feed(fixture.id); feed(fixture.open ? 1 : 0); feed(fixture.smashed ? 1 : 0); for (const item of fixture.items ?? []) feed(item.id) }
    for (const zombie of this.zombies) { feed(zombie.id); feed(zombie.active ? 1 : 0); feed(zombie.x); feed(zombie.y); feed(zombie.hp); feed(zombie.mode === 'wander' ? 1 : zombie.mode === 'investigate' ? 2 : 3); feed(zombie.targetX); feed(zombie.targetY); feed(zombie.alertTicks) }
    for (const noise of this.noises) { feed(noise.id); feed(noise.x); feed(noise.y); feed(noise.power); feed(noise.ttl) }
    return hash.toString(16).padStart(8, '0')
  }

  private updateNeeds(): void { this.player.hunger = Math.min(100, this.player.hunger + 0.0011); this.player.thirst = Math.min(100, this.player.thirst + 0.0017); this.player.fatigue = Math.min(100, this.player.fatigue + 0.00085) }

  private updatePlayer(input: SurvivalInput): void {
    const direction = normalized(input.x, input.y); const moving = Math.abs(direction.x) + Math.abs(direction.y) > 0
    const overloaded = Math.max(0, this.inventoryWeight() - this.inventoryCapacity() * 0.8); const speed = (input.sprint ? 0.071 : 0.046) * Math.max(0.55, 1 - overloaded * 0.03)
    if (!moving) return
    this.player.facing = Math.atan2(direction.y, direction.x)
    const nextX = this.player.x + direction.x * speed; const nextY = this.player.y + direction.y * speed
    if (this.canOccupy(nextX, this.player.y)) this.player.x = nextX
    if (this.canOccupy(this.player.x, nextY)) this.player.y = nextY
    if (input.sprint) { this.player.thirst = Math.min(100, this.player.thirst + 0.0025); this.player.fatigue = Math.min(100, this.player.fatigue + 0.002); if (this.tick % 18 === 0) this.emitNoise(this.player.x, this.player.y, 4.5, 'sprint') }
    else if (this.tick % 48 === 0) this.emitNoise(this.player.x, this.player.y, 1.8, 'step')
  }

  private interact(): void {
    const fixture = this.nearestFixture(['door', 'container']); if (!fixture) return
    if (fixture.kind === 'door') { fixture.open = !fixture.open; this.emitNoise(fixture.x + 0.5, fixture.y + 0.5, 2.4, 'door'); this.events.push({ type: 'door', fixtureId: fixture.id, open: fixture.open === true }) }
    else this.events.push({ type: 'container-open', fixtureId: fixture.id })
  }

  private smashWindow(): void {
    const fixture = this.nearestFixture(['window']); if (!fixture || fixture.smashed) return
    fixture.smashed = true; this.emitNoise(fixture.x + 0.5, fixture.y + 0.5, 11, 'window'); this.events.push({ type: 'window-smashed', fixtureId: fixture.id, x: fixture.x + 0.5, y: fixture.y + 0.5 })
  }

  private attack(): void {
    if (this.player.attackCooldown > 0) return
    this.player.attackCooldown = 34; this.emitNoise(this.player.x, this.player.y, 5.2, 'melee')
    let target: ZombieState | null = null; let bestDistance = 1.45
    for (const zombie of this.zombies) {
      if (!zombie.active) continue
      const d = distance(this.player.x, this.player.y, zombie.x, zombie.y); if (d > bestDistance) continue
      const angle = Math.atan2(zombie.y - this.player.y, zombie.x - this.player.x); const delta = Math.atan2(Math.sin(angle - this.player.facing), Math.cos(angle - this.player.facing))
      if (Math.abs(delta) > 1.0) continue
      target = zombie; bestDistance = d
    }
    if (!target) return
    target.hp -= 52; target.mode = 'chase'; target.alertTicks = 480; target.targetX = this.player.x; target.targetY = this.player.y
    const killed = target.hp <= 0; if (killed) target.active = false
    this.events.push({ type: 'zombie-hit', zombieId: target.id, killed, x: target.x, y: target.y })
  }

  private emitNoise(x: number, y: number, power: number, source: NoiseEvent['source']): void { const noise: NoiseEvent = { id: this.nextNoiseId++, x, y, power, ttl: 150, source }; this.noises.push(noise); this.events.push({ type: 'noise', x, y, power, source }) }
  private updateNoises(): void { for (const noise of this.noises) noise.ttl -= 1; this.noises = this.noises.filter((noise) => noise.ttl > 0) }

  private updateZombies(): void {
    for (const zombie of this.zombies) {
      if (!zombie.active) continue
      if (zombie.attackCooldown > 0) zombie.attackCooldown -= 1; if (zombie.alertTicks > 0) zombie.alertTicks -= 1
      const playerDistance = distance(zombie.x, zombie.y, this.player.x, this.player.y)
      if (playerDistance < 6.2 && this.lineOfSight(zombie.x, zombie.y, this.player.x, this.player.y)) { zombie.mode = 'chase'; zombie.alertTicks = 360; zombie.targetX = this.player.x; zombie.targetY = this.player.y }
      else {
        let heard: NoiseEvent | null = null; let heardScore = -Infinity
        for (const noise of this.noises) { const d = distance(zombie.x, zombie.y, noise.x, noise.y); if (d > noise.power) continue; const score = noise.power - d + noise.id * 0.000001; if (score > heardScore) { heard = noise; heardScore = score } }
        if (heard) { zombie.mode = 'investigate'; zombie.alertTicks = Math.max(zombie.alertTicks, 300); zombie.targetX = heard.x; zombie.targetY = heard.y }
        else if (zombie.alertTicks <= 0) zombie.mode = 'wander'
      }
      if (playerDistance < 0.62 && zombie.attackCooldown <= 0) { zombie.attackCooldown = 68; const damage = 4 + this.rng.int(0, 4); this.player.hp -= damage; if (this.rng.next() < 0.55) this.player.bleeding = Math.min(100, this.player.bleeding + 12 + this.rng.int(0, 12)); this.player.pain = Math.min(100, this.player.pain + 8 + damage); this.events.push({ type: 'survivor-hit', zombieId: zombie.id, hp: this.player.hp, bleeding: this.player.bleeding }); continue }
      if (zombie.mode === 'wander') { zombie.wanderTicks -= 1; if (zombie.wanderTicks <= 0) { zombie.targetX = Math.min(SURVIVAL_WORLD_WIDTH - 1.5, Math.max(0.5, zombie.x + this.rng.range(-4, 4))); zombie.targetY = Math.min(SURVIVAL_WORLD_HEIGHT - 1.5, Math.max(0.5, zombie.y + this.rng.range(-4, 4))); zombie.wanderTicks = this.rng.int(90, 280) } }
      else if (zombie.mode === 'chase') { zombie.targetX = this.player.x; zombie.targetY = this.player.y }
      const direction = normalized(zombie.targetX - zombie.x, zombie.targetY - zombie.y); const speed = zombie.mode === 'chase' ? 0.024 : zombie.mode === 'investigate' ? 0.021 : 0.011
      zombie.facing = Math.atan2(direction.y, direction.x); const nextX = zombie.x + direction.x * speed; const nextY = zombie.y + direction.y * speed
      if (this.canOccupy(nextX, zombie.y)) zombie.x = nextX; else if (zombie.mode !== 'wander') zombie.targetX += this.rng.range(-1.5, 1.5)
      if (this.canOccupy(zombie.x, nextY)) zombie.y = nextY; else if (zombie.mode !== 'wander') zombie.targetY += this.rng.range(-1.5, 1.5)
    }
  }

  private lineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    const steps = Math.ceil(distance(ax, ay, bx, by) * 3)
    for (let i = 1; i < steps; i += 1) { const t = i / steps; const x = ax + (bx - ax) * t; const y = ay + (by - ay) * t; const cell = this.cell(x, y); if (!cell) return false; const fixture = this.fixtureAt(x, y); if (fixture?.kind === 'door' && !fixture.open) return false; if (fixture?.kind === 'window' && !fixture.smashed) return false; if (cell.terrain === 'wall' || cell.terrain === 'fence') return false }
    return true
  }
}

function makeItem(id: number, kind: ItemKind, quantity = 1): SurvivalItem { return { id, quantity, ...ITEM_DEFS[kind] } }

function buildNeighborhood(rng: XorShift32): { cells: WorldCell[]; fixtures: FixtureState[] } {
  const cells: WorldCell[] = Array.from({ length: SURVIVAL_WORLD_WIDTH * SURVIVAL_WORLD_HEIGHT }, () => ({ terrain: 'grass' as TerrainKind }))
  const fixtures: FixtureState[] = []; let fixtureId = 1; let itemId = 100
  const set = (x: number, y: number, terrain: TerrainKind, roomId?: string) => { cells[y * SURVIVAL_WORLD_WIDTH + x] = roomId ? { terrain, roomId } : { terrain } }
  const addBuilding = (x0: number, y0: number, width: number, height: number, roomId: string) => { for (let y = y0; y < y0 + height; y += 1) for (let x = x0; x < x0 + width; x += 1) { const border = x === x0 || y === y0 || x === x0 + width - 1 || y === y0 + height - 1; set(x, y, border ? 'wall' : 'floor', roomId) } }
  const door = (x: number, y: number, roomId: string) => { set(x, y, 'floor', roomId); fixtures.push({ id: fixtureId++, kind: 'door', x, y, roomId, open: false }) }
  const windowFixture = (x: number, y: number, roomId: string) => { set(x, y, 'wall', roomId); fixtures.push({ id: fixtureId++, kind: 'window', x, y, roomId, smashed: false }) }
  const container = (x: number, y: number, roomId: string, containerKind: ContainerKind, kinds: ItemKind[]) => { fixtures.push({ id: fixtureId++, kind: 'container', x, y, roomId, containerKind, items: kinds.map((kind) => makeItem(itemId++, kind)) }) }
  for (let y = 0; y < SURVIVAL_WORLD_HEIGHT; y += 1) for (let x = 13; x <= 16; x += 1) set(x, y, 'road')
  for (let y = 11; y <= 13; y += 1) for (let x = 0; x < SURVIVAL_WORLD_WIDTH; x += 1) set(x, y, 'road')
  addBuilding(2, 2, 9, 8, 'house-a'); door(6, 9, 'house-a'); windowFixture(3, 9, 'house-a'); windowFixture(10, 5, 'house-a'); container(4, 4, 'house-a', 'fridge', ['water', 'beans']); container(7, 4, 'house-a', 'cabinet', ['canned-soup', 'bandage']); container(8, 7, 'house-a', 'dresser', ['backpack'])
  addBuilding(19, 2, 9, 8, 'house-b'); door(23, 9, 'house-b'); windowFixture(19, 5, 'house-b'); windowFixture(26, 9, 'house-b'); container(21, 4, 'house-b', 'fridge', ['water']); container(25, 7, 'house-b', 'medicine', ['bandage', 'painkillers'])
  addBuilding(18, 15, 11, 8, 'store'); door(23, 15, 'store'); windowFixture(20, 15, 'store'); windowFixture(26, 15, 'store'); container(20, 18, 'store', 'shelf', ['beans', 'canned-soup']); container(23, 18, 'store', 'shelf', ['water', 'water']); container(26, 18, 'store', 'shelf', ['bandage', 'painkillers']); container(27, 21, 'store', 'crate', ['beans'])
  for (let x = 1; x <= 11; x += 1) if (x !== 6) set(x, 10, 'fence')
  for (let x = 18; x <= 28; x += 1) if (x !== 23) set(x, 14, 'fence')
  for (const fixture of fixtures) if (fixture.kind === 'container' && fixture.items && rng.next() < 0.28) fixture.items.push(makeItem(itemId++, rng.next() < 0.5 ? 'water' : 'beans'))
  return { cells, fixtures }
}

function spawnZombies(rng: XorShift32, cells: WorldCell[], fixtures: FixtureState[], count: number): ZombieState[] {
  const fixtureBlocked = new Set(fixtures.filter((fixture) => fixture.kind !== 'container').map((fixture) => `${fixture.x},${fixture.y}`)); const candidates: Array<{ x: number; y: number }> = []
  for (let y = 0; y < SURVIVAL_WORLD_HEIGHT; y += 1) for (let x = 0; x < SURVIVAL_WORLD_WIDTH; x += 1) { const cell = cells[y * SURVIVAL_WORLD_WIDTH + x]; if (cell.terrain === 'wall' || cell.terrain === 'fence' || cell.terrain === 'floor') continue; if (fixtureBlocked.has(`${x},${y}`)) continue; if (distance(x + 0.5, y + 0.5, 6.5, 7.1) < 5.2) continue; candidates.push({ x: x + 0.25 + rng.next() * 0.5, y: y + 0.25 + rng.next() * 0.5 }) }
  const zombies: ZombieState[] = []
  for (let id = 1; id <= count && candidates.length > 0; id += 1) { const index = rng.int(0, candidates.length - 1); const position = candidates.splice(index, 1)[0]; zombies.push({ id, x: position.x, y: position.y, hp: 100, active: true, mode: 'wander', targetX: position.x, targetY: position.y, alertTicks: 0, attackCooldown: rng.int(0, 40), wanderTicks: rng.int(30, 180), facing: rng.range(-Math.PI, Math.PI) }) }
  return zombies
}
