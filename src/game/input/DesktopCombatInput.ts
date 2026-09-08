import type { AttackKind } from '../combat/Sword'

export interface LogicalPoint {
  x: number
  y: number
}

export interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

export interface DesktopPointerSnapshot extends LogicalPoint {
  active: boolean
  leftClicks: number
  rightPresses: number
  rightReleases: number
  rightHeld: boolean
}

export function buttonToAttack(button: number): AttackKind | null {
  if (button === 0) return 'slash'
  if (button === 2) return 'dash'
  return null
}

export function toLogicalPointer(
  clientX: number,
  clientY: number,
  rect: RectLike,
  logicalWidth: number,
  logicalHeight: number,
): LogicalPoint {
  const width = Math.max(1, rect.width)
  const height = Math.max(1, rect.height)
  return {
    x: ((clientX - rect.left) / width) * logicalWidth,
    y: ((clientY - rect.top) / height) * logicalHeight,
  }
}

export class DesktopCombatInput {
  private readonly canvas: HTMLCanvasElement
  private readonly logicalWidth: number
  private readonly logicalHeight: number
  private readonly onEngage?: () => void
  private pointerX: number
  private pointerY: number
  private active = false
  private queuedSlash = false
  private queuedDashRelease = false
  private rightHeld = false
  private leftClicks = 0
  private rightPresses = 0
  private rightReleases = 0

  constructor(
    canvas: HTMLCanvasElement,
    logicalWidth: number,
    logicalHeight: number,
    onEngage?: () => void,
  ) {
    this.canvas = canvas
    this.logicalWidth = logicalWidth
    this.logicalHeight = logicalHeight
    this.onEngage = onEngage
    this.pointerX = logicalWidth / 2
    this.pointerY = logicalHeight / 2

    canvas.addEventListener('pointermove', this.handlePointerMove)
    canvas.addEventListener('pointerdown', this.handlePointerDown)
    canvas.addEventListener('pointerup', this.handlePointerUp)
    canvas.addEventListener('pointercancel', this.handlePointerCancel)
    canvas.addEventListener('contextmenu', this.handleContextMenu)
  }

  snapshot(): DesktopPointerSnapshot {
    return {
      active: this.active,
      x: this.pointerX,
      y: this.pointerY,
      leftClicks: this.leftClicks,
      rightPresses: this.rightPresses,
      rightReleases: this.rightReleases,
      rightHeld: this.rightHeld,
    }
  }

  consumeAttacks(): { slash: boolean; dashReleased: boolean } {
    const attacks = { slash: this.queuedSlash, dashReleased: this.queuedDashRelease }
    this.queuedSlash = false
    this.queuedDashRelease = false
    return attacks
  }

  destroy(): void {
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel)
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu)
  }

  private updatePointer(event: PointerEvent): void {
    const point = toLogicalPointer(
      event.clientX,
      event.clientY,
      this.canvas.getBoundingClientRect(),
      this.logicalWidth,
      this.logicalHeight,
    )
    this.pointerX = point.x
    this.pointerY = point.y
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return
    this.active = true
    this.updatePointer(event)
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return
    this.active = true
    this.updatePointer(event)
    this.onEngage?.()

    const attack = buttonToAttack(event.button)
    if (attack === 'slash') {
      this.queuedSlash = true
      this.leftClicks += 1
      return
    }

    if (attack === 'dash') {
      event.preventDefault()
      this.rightHeld = true
      this.rightPresses += 1
      try {
        this.canvas.setPointerCapture(event.pointerId)
      } catch {
        // Pointer capture is an enhancement; the combat contract still works without it.
      }
    }
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || event.button !== 2) return
    event.preventDefault()
    this.active = true
    this.updatePointer(event)
    if (this.rightHeld) {
      this.rightHeld = false
      this.queuedDashRelease = true
      this.rightReleases += 1
    }
    try {
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
    } catch {
      // Ignore browsers that do not expose pointer capture consistently.
    }
  }

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return
    this.rightHeld = false
    this.queuedDashRelease = false
  }

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }
}
