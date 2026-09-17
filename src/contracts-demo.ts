import { createReplayProof, verifyReplay, type SurvivalContractTerms } from './game/contracts/ApocalypseContracts'
import { GameState, type InputState, type SimEvent } from './game/sim/GameState'
import { FixedTick } from './game/sim/FixedTick'
import { MAZE_CELL_SIZE, MAZE_EXIT, MAZE_GRID, MAZE_ORIGIN_X, MAZE_ORIGIN_Y } from './game/world/Maze'

const canvas = required<HTMLCanvasElement>('game')
const ctx = canvas.getContext('2d')
if (!ctx) throw new Error('Canvas 2D unavailable')

const acceptButton = required<HTMLButtonElement>('accept')
const newJobButton = required<HTMLButtonElement>('new-job')
const gate = required<HTMLDivElement>('gate')
const statusEl = required<HTMLDivElement>('status')
const receiptEl = required<HTMLDivElement>('receipt')
const contractIdEl = required<HTMLDivElement>('contract-id')
const seedEl = required<HTMLDivElement>('seed')
const timeEl = required<HTMLSpanElement>('time')
const killsEl = required<HTMLSpanElement>('kills')
const hpEl = required<HTMLSpanElement>('hp')
const hashEl = required<HTMLSpanElement>('hash')

const RUNNER = 'local-runner'
const WORLD_CX = canvas.width / 2
const WORLD_CY = canvas.height / 2
const MIN_TICKS = 12 * 60
const MAX_TICKS = 25 * 60
const MIN_KILLS = 1
const fixed = new FixedTick()
const keys = new Set<string>()
const splats: { x: number; y: number; r: number; alpha: number }[] = []
const bursts: { x: number; y: number; ttl: number }[] = []
let pointerX = WORLD_CX
let pointerY = WORLD_CY
let pointerActive = false
let queueSlash = false
let queueStab = false
let queueWhirlwind = false
let queueDodge = false
let queueDashRelease = false
let currentTerms = createTerms()
let state = new GameState(currentTerms.seed)
let replay: InputState[] = []
let armed = false
let finished = false
let lastFrame = performance.now()

renderContract(false)
render()
requestAnimationFrame(frame)

acceptButton.addEventListener('click', () => startJob())
newJobButton.addEventListener('click', () => {
  currentTerms = createTerms()
  state = new GameState(currentTerms.seed)
  replay = []
  armed = false
  finished = false
  splats.length = 0
  bursts.length = 0
  gate.classList.remove('hidden')
  acceptButton.disabled = false
  receiptEl.className = ''
  receiptEl.textContent = 'No replay receipt yet.'
  renderContract(false)
  render()
})

window.addEventListener('keydown', (event) => {
  if (event.repeat) return
  keys.add(event.code)
  if (event.code === 'Space') queueSlash = true
  if (event.code === 'KeyE') queueStab = true
  if (event.code === 'KeyQ') queueWhirlwind = true
  if (event.code === 'KeyC') queueDodge = true
})
window.addEventListener('keyup', (event) => {
  keys.delete(event.code)
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') queueDashRelease = true
})
canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect()
  pointerX = ((event.clientX - rect.left) / rect.width) * canvas.width
  pointerY = ((event.clientY - rect.top) / rect.height) * canvas.height
  pointerActive = true
})
canvas.addEventListener('pointerdown', (event) => {
  if (event.button === 0) queueSlash = true
})
canvas.addEventListener('contextmenu', (event) => event.preventDefault())

function startJob(): void {
  state = new GameState(currentTerms.seed)
  replay = []
  armed = true
  finished = false
  splats.length = 0
  bursts.length = 0
  gate.classList.add('hidden')
  acceptButton.disabled = true
  seedEl.textContent = `0x${currentTerms.seed.toString(16).padStart(8, '0')}`
  statusEl.textContent = 'ACCEPTED\nReplay recording active. Survive 12s and get at least 1 kill.'
  receiptEl.className = ''
  receiptEl.textContent = 'Recording deterministic input stream…'
  canvas.focus()
}

function frame(now: number): void {
  const delta = Math.min(100, now - lastFrame)
  lastFrame = now

  if (armed && !finished) {
    fixed.advance(delta, () => {
      const input = readInput()
      replay.push({ ...input })
      state.step(input)
      absorbEvents(state.events)

      const objectiveMet = state.tick >= currentTerms.minTicks && state.kills >= currentTerms.minKills
      const exhausted = replay.length >= currentTerms.maxTicks
      if (objectiveMet || state.ended || exhausted) finishJob()
    })
  }

  for (const burst of bursts) burst.ttl -= delta
  while (bursts.length > 0 && bursts[0].ttl <= 0) bursts.shift()
  render()
  requestAnimationFrame(frame)
}

function readInput(): InputState {
  const dashHeld = keys.has('ShiftLeft') || keys.has('ShiftRight')
  const input: InputState = {
    x: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
    y: Number(keys.has('KeyS')) - Number(keys.has('KeyW')),
    slash: queueSlash,
    stab: queueStab,
    dashHeld,
    dashReleased: queueDashRelease && !dashHeld,
    whirlwind: queueWhirlwind,
    dodge: queueDodge,
  }
  if (pointerActive) {
    const px = WORLD_CX + state.player.x
    const py = WORLD_CY + state.player.y
    input.aimRadians = Math.atan2(pointerY - py, pointerX - px)
  }
  queueSlash = false
  queueStab = false
  queueWhirlwind = false
  queueDodge = false
  queueDashRelease = false
  return input
}

function finishJob(): void {
  if (finished) return
  finished = true
  armed = false

  const proof = createReplayProof(currentTerms, RUNNER, replay)
  const verified = verifyReplay(currentTerms, proof, RUNNER)

  if (verified.ok) {
    const r = verified.receipt
    statusEl.textContent = 'VERIFIED\nReplay independently reproduced. Escrow settlement would be authorized.'
    receiptEl.className = 'pass'
    receiptEl.textContent = [
      'VERIFIED RECEIPT',
      `contract: ${r.contractId}`,
      `runner: ${r.runner}`,
      `seed: 0x${r.seed.toString(16).padStart(8, '0')}`,
      `ticks: ${r.ticks}`,
      `kills: ${r.kills}`,
      `score: ${r.score}`,
      `resultHash: ${r.resultHash}`,
      '',
      'LOCAL PREVIEW: this receipt is real verifier output, but no testnet transaction is submitted here.',
    ].join('\n')
  } else {
    statusEl.textContent = `FAILED\nVerifier rejected replay: ${verified.reason}`
    receiptEl.className = 'fail'
    receiptEl.textContent = [
      'REJECTED RECEIPT',
      `reason: ${verified.reason}`,
      `recorded ticks: ${replay.length}`,
      `kills: ${state.kills}`,
      `claimed hash: ${proof.claimedResultHash}`,
      '',
      'Escrow would NOT pay this run.',
    ].join('\n')
  }

  acceptButton.disabled = false
  acceptButton.textContent = 'Retry same job'
}

function absorbEvents(events: readonly SimEvent[]): void {
  for (const event of events) {
    if (event.type === 'enemy-hit') {
      bursts.push({ x: event.x, y: event.y, ttl: 180 })
      if (event.killed) {
        splats.push({ x: event.x, y: event.y, r: 8 + ((event.enemyId * 7) % 13), alpha: 0.26 + ((event.enemyId % 5) * 0.05) })
        if (splats.length > 90) splats.shift()
      }
    }
    if (event.type === 'physics-impact' && event.killed) {
      splats.push({ x: event.x, y: event.y, r: 10, alpha: 0.34 })
    }
  }
}

function render(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#090610'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = '#16101e'
  ctx.lineWidth = 1
  for (let x = 0; x < canvas.width; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
  }
  for (let y = 0; y < canvas.height; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
  }

  for (let row = 0; row < MAZE_GRID.length; row += 1) {
    for (let col = 0; col < MAZE_GRID[row].length; col += 1) {
      if (MAZE_GRID[row][col] !== '#') continue
      const x = WORLD_CX + MAZE_ORIGIN_X + col * MAZE_CELL_SIZE
      const y = WORLD_CY + MAZE_ORIGIN_Y + row * MAZE_CELL_SIZE
      ctx.fillStyle = '#21162d'
      ctx.fillRect(x + 2, y + 2, MAZE_CELL_SIZE - 4, MAZE_CELL_SIZE - 4)
      ctx.strokeStyle = '#3c2753'
      ctx.strokeRect(x + 3.5, y + 3.5, MAZE_CELL_SIZE - 7, MAZE_CELL_SIZE - 7)
    }
  }

  const exitX = WORLD_CX + MAZE_EXIT.x
  const exitY = WORLD_CY + MAZE_EXIT.y
  ctx.fillStyle = state.mazeExitUnlocked() ? '#6dff8a55' : '#8d215055'
  ctx.beginPath(); ctx.arc(exitX, exitY, 21, 0, Math.PI * 2); ctx.fill()

  for (const splat of splats) {
    ctx.fillStyle = `rgba(173, 20, 65, ${splat.alpha})`
    ctx.beginPath(); ctx.ellipse(WORLD_CX + splat.x, WORLD_CY + splat.y, splat.r * 1.7, splat.r, 0.3, 0, Math.PI * 2); ctx.fill()
  }

  for (const prop of state.props) {
    if (!prop.active) continue
    ctx.save()
    ctx.translate(WORLD_CX + prop.x, WORLD_CY + prop.y)
    ctx.fillStyle = prop.material === 'metal' ? '#60616d' : '#79543e'
    ctx.fillRect(-prop.halfWidth, -prop.halfHeight, prop.halfWidth * 2, prop.halfHeight * 2)
    ctx.restore()
  }

  for (const enemy of state.enemies.items) {
    if (!enemy.active) continue
    const x = WORLD_CX + enemy.x
    const y = WORLD_CY + enemy.y
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(Math.atan2(enemy.vy, enemy.vx))
    ctx.fillStyle = enemy.mass > 1.35 ? '#8c394e' : '#68536f'
    ctx.beginPath(); ctx.ellipse(0, 0, enemy.radius * 1.15, enemy.radius * 0.82, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#f1d3da'
    ctx.fillRect(enemy.radius * 0.3, -4, 3, 3)
    ctx.restore()
  }

  for (const burst of bursts) {
    const alpha = Math.max(0, burst.ttl / 180)
    ctx.strokeStyle = `rgba(255, 67, 125, ${alpha})`
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(WORLD_CX + burst.x, WORLD_CY + burst.y, 22 * (1 - alpha) + 6, 0, Math.PI * 2); ctx.stroke()
  }

  const px = WORLD_CX + state.player.x
  const py = WORLD_CY + state.player.y
  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(state.player.facing)
  ctx.fillStyle = state.dodgeInvulnerable() ? '#d7b6ff88' : '#b278ff'
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(27, 0); ctx.stroke()
  ctx.restore()

  if (pointerActive) {
    ctx.strokeStyle = '#c99cffaa'
    ctx.beginPath(); ctx.moveTo(pointerX - 6, pointerY); ctx.lineTo(pointerX + 6, pointerY); ctx.moveTo(pointerX, pointerY - 6); ctx.lineTo(pointerX, pointerY + 6); ctx.stroke()
  }

  const seconds = state.tick / 60
  timeEl.textContent = `T ${seconds.toFixed(1)}s / 12.0s`
  killsEl.textContent = `KILLS ${state.kills} / ${MIN_KILLS}`
  hpEl.textContent = `HP ${state.player.hp}`
  hashEl.textContent = `HASH ${state.resultHash()}`
}

function renderContract(revealSeed: boolean): void {
  contractIdEl.textContent = currentTerms.contractId
  seedEl.textContent = revealSeed ? `0x${currentTerms.seed.toString(16).padStart(8, '0')}` : 'HIDDEN UNTIL ACCEPT'
  statusEl.textContent = 'OPEN\nSponsor escrowed test value.'
  acceptButton.textContent = 'Accept job'
}

function createTerms(): SurvivalContractTerms {
  const seed = randomUint32()
  return {
    version: 0,
    contractId: `JOB-${seed.toString(16).toUpperCase().padStart(8, '0')}`,
    objective: 'survive',
    seed,
    minTicks: MIN_TICKS,
    maxTicks: MAX_TICKS,
    minKills: MIN_KILLS,
    rewardAtomic: '5000000',
  }
}

function randomUint32(): number {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0] >>> 0
}

function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing #${id}`)
  return el as T
}
