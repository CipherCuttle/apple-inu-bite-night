import './apocalypse-v2'

const WIDTH = 1280
const HEIGHT = 720
const AUTOTEST = new URLSearchParams(location.search).get('autotest') === '1'

const stage = document.getElementById('stage') as HTMLDivElement
const baseCanvas = stage.querySelector('canvas') as HTMLCanvasElement
if (!baseCanvas) throw new Error('V3 spectacle compositor requires the V2 render canvas')

const style = document.createElement('style')
style.textContent = `
  #stage canvas.v3-base {
    transition: filter 45ms linear, transform 55ms cubic-bezier(.2,.9,.2,1);
    transform-origin: center;
  }
  #stage canvas.v3-punch {
    filter: url(#v3-displace) brightness(1.42) saturate(1.75) contrast(1.12);
    transform: scale(1.012);
  }
  #stage canvas.v3-kill {
    filter: url(#v3-displace) brightness(1.72) saturate(2.15) contrast(1.24);
    transform: scale(1.02);
  }
  #v3-freeze, #v3-fx {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    object-fit: contain;
  }
  #v3-freeze { z-index: 23; display: none; image-rendering: auto; }
  #v3-fx { z-index: 24; mix-blend-mode: screen; }
  .v3-badge {
    position: fixed;
    right: 20px;
    bottom: 47px;
    z-index: 31;
    pointer-events: none;
    padding: 7px 10px;
    border: 1px solid rgba(106,231,255,.32);
    background: rgba(4,3,9,.64);
    color: rgba(229,246,255,.72);
    font: 700 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 1.5px;
    backdrop-filter: blur(8px);
  }
`
document.head.appendChild(style)
baseCanvas.classList.add('v3-base')

const ns = 'http://www.w3.org/2000/svg'
const svg = document.createElementNS(ns, 'svg')
svg.setAttribute('width', '0')
svg.setAttribute('height', '0')
svg.style.position = 'fixed'
svg.style.pointerEvents = 'none'
const filter = document.createElementNS(ns, 'filter')
filter.setAttribute('id', 'v3-displace')
filter.setAttribute('x', '-20%')
filter.setAttribute('y', '-20%')
filter.setAttribute('width', '140%')
filter.setAttribute('height', '140%')
const turbulence = document.createElementNS(ns, 'feTurbulence')
turbulence.setAttribute('type', 'fractalNoise')
turbulence.setAttribute('baseFrequency', '0.014 0.034')
turbulence.setAttribute('numOctaves', '2')
turbulence.setAttribute('seed', '8')
const displacement = document.createElementNS(ns, 'feDisplacementMap')
displacement.setAttribute('in', 'SourceGraphic')
displacement.setAttribute('scale', '0')
displacement.setAttribute('xChannelSelector', 'R')
displacement.setAttribute('yChannelSelector', 'B')
filter.append(turbulence, displacement)
svg.appendChild(filter)
document.body.appendChild(svg)

const freezeCanvas = document.createElement('canvas')
freezeCanvas.id = 'v3-freeze'
freezeCanvas.width = WIDTH
freezeCanvas.height = HEIGHT
const freezeCtx = freezeCanvas.getContext('2d')!
document.body.appendChild(freezeCanvas)

const fxCanvas = document.createElement('canvas')
fxCanvas.id = 'v3-fx'
fxCanvas.width = WIDTH
fxCanvas.height = HEIGHT
const ctx = fxCanvas.getContext('2d')!
document.body.appendChild(fxCanvas)

const badge = document.createElement('div')
badge.className = 'v3-badge'
badge.textContent = 'V3 // SPECTACLE COMPOSITOR // E = TIME-CUT STAB'
document.body.appendChild(badge)

type Vec = { x: number; y: number }
type BeamFx = { origin: Vec; dir: Vec; life: number; maxLife: number; power: number }
type ArcFx = { center: Vec; angle: number; life: number; maxLife: number; radius: number; sweep: number }
type RingFx = { center: Vec; life: number; maxLife: number; radius: number; power: number }
type BurstFx = { center: Vec; life: number; maxLife: number; angle: number; power: number }
type ShardFx = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; length: number; hue: number }

const beams: BeamFx[] = []
const arcs: ArcFx[] = []
const rings: RingFx[] = []
const bursts: BurstFx[] = []
const shards: ShardFx[] = []
let pointer = { x: WIDTH * 0.69, y: HEIGHT * 0.52 }
let previousKills = 0
let previousHp: number | null = null
let screenFlash = 0
let blackout = 0
let displacementTimer = 0
let displacementPeak = 0
let freezeTimer: number | null = null

function canvasPoint(event: PointerEvent): Vec {
  const rect = baseCanvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
  }
}

function normalize(dx: number, dy: number): Vec {
  const length = Math.hypot(dx, dy) || 1
  return { x: dx / length, y: dy / length }
}

function attackOrigin(): Vec {
  // V2 uses a fixed world camera; center-biased origin keeps the compositor legible
  // even while the authoritative player moves around the arena.
  return { x: WIDTH * 0.5, y: HEIGHT * 0.55 }
}

function aimDirection(): Vec {
  const origin = attackOrigin()
  return normalize(pointer.x - origin.x, pointer.y - origin.y)
}

function freezeFrame(ms: number): void {
  try {
    freezeCtx.clearRect(0, 0, WIDTH, HEIGHT)
    freezeCtx.drawImage(baseCanvas, 0, 0, WIDTH, HEIGHT)
    freezeCanvas.style.display = 'block'
    if (freezeTimer !== null) window.clearTimeout(freezeTimer)
    freezeTimer = window.setTimeout(() => {
      freezeCanvas.style.display = 'none'
      freezeTimer = null
    }, ms)
  } catch {
    freezeCanvas.style.display = 'none'
  }
}

function punchDistortion(scale: number, ms: number, kill = false): void {
  displacementPeak = Math.max(displacementPeak, scale)
  displacementTimer = Math.max(displacementTimer, ms)
  displacement.setAttribute('scale', String(displacementPeak))
  baseCanvas.classList.toggle('v3-kill', kill)
  baseCanvas.classList.toggle('v3-punch', !kill)
}

function spawnShards(center: Vec, count: number, facing: number, power: number): void {
  for (let i = 0; i < count; i += 1) {
    const angle = facing + (Math.random() - 0.5) * 1.35
    const speed = 180 + Math.random() * 720 * power
    const life = 0.18 + Math.random() * 0.42
    shards.push({
      x: center.x,
      y: center.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      length: 8 + Math.random() * 34,
      hue: Math.random() > 0.5 ? 190 : 320,
    })
  }
}

function triggerSlash(): void {
  const origin = attackOrigin()
  const dir = aimDirection()
  const angle = Math.atan2(dir.y, dir.x)
  arcs.push({ center: origin, angle, life: 0.16, maxLife: 0.16, radius: 118, sweep: 2.35 })
  screenFlash = Math.max(screenFlash, 0.18)
  punchDistortion(4, 55)
}

function triggerStab(confirmed = false): void {
  const origin = attackOrigin()
  const dir = aimDirection()
  const angle = Math.atan2(dir.y, dir.x)
  beams.push({ origin, dir, life: confirmed ? 0.28 : 0.2, maxLife: confirmed ? 0.28 : 0.2, power: confirmed ? 1.35 : 1 })
  bursts.push({ center: origin, life: 0.28, maxLife: 0.28, angle, power: confirmed ? 1.35 : 1 })
  rings.push({ center: { x: origin.x + dir.x * 190, y: origin.y + dir.y * 190 }, life: 0.34, maxLife: 0.34, radius: 20, power: confirmed ? 1.4 : 1 })
  spawnShards({ x: origin.x + dir.x * 130, y: origin.y + dir.y * 130 }, confirmed ? 42 : 24, angle, confirmed ? 1.3 : 1)
  freezeFrame(confirmed ? 34 : 18)
  punchDistortion(confirmed ? 24 : 12, confirmed ? 105 : 70, confirmed)
  screenFlash = Math.max(screenFlash, confirmed ? 1 : 0.58)
  blackout = Math.max(blackout, confirmed ? 0.38 : 0.18)
}

function triggerWhirlwind(): void {
  const center = attackOrigin()
  for (let i = 0; i < 4; i += 1) {
    arcs.push({ center, angle: i * Math.PI * 0.5, life: 0.34, maxLife: 0.34, radius: 120 + i * 17, sweep: 4.8 })
  }
  rings.push({ center, life: 0.44, maxLife: 0.44, radius: 52, power: 1.3 })
  punchDistortion(16, 120)
  screenFlash = Math.max(screenFlash, 0.48)
}

function triggerDash(): void {
  const center = attackOrigin()
  const dir = aimDirection()
  const angle = Math.atan2(dir.y, dir.x)
  bursts.push({ center, life: 0.34, maxLife: 0.34, angle, power: 1.5 })
  punchDistortion(8, 80)
}

function triggerKill(count = 1): void {
  const center = pointer
  rings.push({ center, life: 0.52, maxLife: 0.52, radius: 26, power: 1.8 })
  rings.push({ center, life: 0.72, maxLife: 0.72, radius: 12, power: 1.15 })
  spawnShards(center, Math.min(80, 34 + count * 12), Math.atan2(center.y - HEIGHT * 0.5, center.x - WIDTH * 0.5), 1.45)
  freezeFrame(30 + Math.min(18, count * 4))
  punchDistortion(28 + Math.min(18, count * 4), 130, true)
  screenFlash = 1
  blackout = Math.max(blackout, 0.52)
}

baseCanvas.addEventListener('pointermove', (event) => { pointer = canvasPoint(event) })
baseCanvas.addEventListener('pointerdown', (event) => {
  pointer = canvasPoint(event)
  if (event.button === 0) triggerSlash()
})
window.addEventListener('keydown', (event) => {
  if (event.repeat) return
  if (event.code === 'Space') triggerSlash()
  if (event.code === 'KeyE') triggerStab(false)
  if (event.code === 'KeyQ') triggerWhirlwind()
})
window.addEventListener('keyup', (event) => {
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') triggerDash()
})

const killsEl = document.getElementById('run-kills')
if (killsEl) {
  new MutationObserver(() => {
    const match = killsEl.textContent?.match(/KILLS\s+(\d+)/i)
    const kills = Number(match?.[1] ?? previousKills)
    if (kills > previousKills) {
      triggerKill(kills - previousKills)
      triggerStab(true)
    }
    previousKills = kills
  }).observe(killsEl, { childList: true, characterData: true, subtree: true })
}

const hpEl = document.getElementById('run-hp')
if (hpEl) {
  new MutationObserver(() => {
    const match = hpEl.textContent?.match(/HP\s+(\d+)/i)
    const hp = match ? Number(match[1]) : null
    if (hp !== null && previousHp !== null && hp < previousHp) {
      punchDistortion(18, 90, true)
      blackout = Math.max(blackout, 0.45)
    }
    if (hp !== null) previousHp = hp
  }).observe(hpEl, { childList: true, characterData: true, subtree: true })
}

function drawBeam(effect: BeamFx): void {
  const p = 1 - effect.life / effect.maxLife
  const fade = Math.max(0, 1 - p)
  const length = 1280 * (0.65 + p * 0.55)
  const end = { x: effect.origin.x + effect.dir.x * length, y: effect.origin.y + effect.dir.y * length }
  const perp = { x: -effect.dir.y, y: effect.dir.x }

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.shadowBlur = 42 * effect.power
  ctx.shadowColor = `rgba(255,255,255,${0.7 * fade})`

  const lines = [
    { offset: 0, width: 14 * effect.power, color: `rgba(255,255,255,${0.96 * fade})` },
    { offset: 7, width: 8 * effect.power, color: `rgba(57,229,255,${0.72 * fade})` },
    { offset: -7, width: 8 * effect.power, color: `rgba(255,46,190,${0.65 * fade})` },
    { offset: 0, width: 34 * effect.power, color: `rgba(181,108,255,${0.16 * fade})` },
  ]
  for (const line of lines) {
    ctx.beginPath()
    ctx.moveTo(effect.origin.x + perp.x * line.offset, effect.origin.y + perp.y * line.offset)
    ctx.lineTo(end.x + perp.x * line.offset, end.y + perp.y * line.offset)
    ctx.lineWidth = line.width
    ctx.strokeStyle = line.color
    ctx.stroke()
  }
  ctx.restore()
}

function drawArc(effect: ArcFx): void {
  const p = 1 - effect.life / effect.maxLife
  const alpha = Math.max(0, 1 - p)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.shadowBlur = 28
  ctx.shadowColor = `rgba(160,84,255,${alpha})`
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath()
    ctx.arc(effect.center.x, effect.center.y, effect.radius + i * 8, effect.angle - effect.sweep * 0.55 + p * 0.3, effect.angle + effect.sweep * 0.45 + p * 0.55)
    ctx.lineWidth = i === 0 ? 10 : 4
    ctx.strokeStyle = i === 0
      ? `rgba(255,255,255,${0.78 * alpha})`
      : i === 1
        ? `rgba(67,229,255,${0.52 * alpha})`
        : `rgba(255,44,193,${0.45 * alpha})`
    ctx.stroke()
  }
  ctx.restore()
}

function drawRing(effect: RingFx): void {
  const p = 1 - effect.life / effect.maxLife
  const radius = effect.radius + p * 185 * effect.power
  const alpha = Math.max(0, 1 - p)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.beginPath()
  ctx.arc(effect.center.x, effect.center.y, radius, 0, Math.PI * 2)
  ctx.lineWidth = Math.max(1, 12 * (1 - p) * effect.power)
  ctx.strokeStyle = `rgba(255,244,255,${0.72 * alpha})`
  ctx.shadowBlur = 34
  ctx.shadowColor = `rgba(199,74,255,${0.75 * alpha})`
  ctx.stroke()
  ctx.restore()
}

function drawBurst(effect: BurstFx): void {
  const p = 1 - effect.life / effect.maxLife
  const alpha = Math.max(0, 1 - p)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.translate(effect.center.x, effect.center.y)
  ctx.rotate(effect.angle)
  const count = 30
  for (let i = 0; i < count; i += 1) {
    const spread = (i / (count - 1) - 0.5) * Math.PI * 1.25
    const len = (130 + (i % 5) * 52) * (0.45 + p) * effect.power
    ctx.beginPath()
    ctx.moveTo(18, 0)
    ctx.lineTo(Math.cos(spread) * len, Math.sin(spread) * len)
    ctx.lineWidth = i % 4 === 0 ? 3 : 1
    ctx.strokeStyle = `rgba(191,212,255,${(i % 3 === 0 ? 0.42 : 0.17) * alpha})`
    ctx.stroke()
  }
  ctx.restore()
}

let last = performance.now()
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  ctx.clearRect(0, 0, WIDTH, HEIGHT)

  for (let i = beams.length - 1; i >= 0; i -= 1) {
    beams[i].life -= dt
    drawBeam(beams[i])
    if (beams[i].life <= 0) beams.splice(i, 1)
  }
  for (let i = arcs.length - 1; i >= 0; i -= 1) {
    arcs[i].life -= dt
    drawArc(arcs[i])
    if (arcs[i].life <= 0) arcs.splice(i, 1)
  }
  for (let i = rings.length - 1; i >= 0; i -= 1) {
    rings[i].life -= dt
    drawRing(rings[i])
    if (rings[i].life <= 0) rings.splice(i, 1)
  }
  for (let i = bursts.length - 1; i >= 0; i -= 1) {
    bursts[i].life -= dt
    drawBurst(bursts[i])
    if (bursts[i].life <= 0) bursts.splice(i, 1)
  }
  for (let i = shards.length - 1; i >= 0; i -= 1) {
    const shard = shards[i]
    shard.life -= dt
    shard.x += shard.vx * dt
    shard.y += shard.vy * dt
    shard.vx *= Math.pow(0.08, dt)
    shard.vy *= Math.pow(0.08, dt)
    const alpha = Math.max(0, shard.life / shard.maxLife)
    const angle = Math.atan2(shard.vy, shard.vx)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.translate(shard.x, shard.y)
    ctx.rotate(angle)
    ctx.fillStyle = `hsla(${shard.hue} 100% 72% / ${alpha * 0.8})`
    ctx.shadowBlur = 13
    ctx.shadowColor = `hsla(${shard.hue} 100% 68% / ${alpha})`
    ctx.fillRect(-shard.length * 0.5, -1.3, shard.length, 2.6)
    ctx.restore()
    if (shard.life <= 0) shards.splice(i, 1)
  }

  if (screenFlash > 0.002) {
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.fillStyle = `rgba(255,245,255,${screenFlash * 0.24})`
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    ctx.restore()
    screenFlash *= Math.pow(0.0009, dt)
  }
  if (blackout > 0.002) {
    const gradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 50, WIDTH / 2, HEIGHT / 2, WIDTH * 0.7)
    gradient.addColorStop(0, `rgba(0,0,0,0)`)
    gradient.addColorStop(1, `rgba(0,0,0,${blackout * 0.88})`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    blackout *= Math.pow(0.004, dt)
  }

  if (displacementTimer > 0) {
    displacementTimer -= dt * 1000
    const ratio = Math.max(0, displacementTimer / 130)
    displacement.setAttribute('scale', String(Math.max(0, displacementPeak * Math.min(1, ratio))))
  } else if (displacementPeak > 0) {
    displacementPeak = 0
    displacement.setAttribute('scale', '0')
    baseCanvas.classList.remove('v3-punch', 'v3-kill')
  }

  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

if (AUTOTEST) {
  window.setInterval(() => {
    pointer = { x: 830 + Math.random() * 120, y: 330 + Math.random() * 120 }
    triggerStab(true)
  }, 900)
}

Object.assign(window, {
  __APOCALYPSE_V3_FX_READY__: true,
  __APOCALYPSE_V3_STAB__: () => triggerStab(true),
})
