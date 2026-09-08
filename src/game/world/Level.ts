export interface LevelObstacle {
  id: number
  x: number
  y: number
  width: number
  height: number
}

export const CITY_LEVEL_OBSTACLES: readonly LevelObstacle[] = [
  { id: 1, x: -300, y: -155, width: 170, height: 82 },
  { id: 2, x: -55, y: -160, width: 150, height: 72 },
  { id: 3, x: 255, y: -150, width: 170, height: 88 },
  { id: 4, x: -325, y: 18, width: 96, height: 142 },
  { id: 5, x: 315, y: 22, width: 94, height: 142 },
  { id: 6, x: -278, y: 163, width: 150, height: 70 },
  { id: 7, x: 12, y: 168, width: 184, height: 66 },
  { id: 8, x: 302, y: 166, width: 112, height: 72 },
] as const

export function circleOverlapsObstacle(x: number, y: number, radius: number, obstacle: LevelObstacle): boolean {
  const halfW = obstacle.width / 2
  const halfH = obstacle.height / 2
  const closestX = Math.max(obstacle.x - halfW, Math.min(x, obstacle.x + halfW))
  const closestY = Math.max(obstacle.y - halfH, Math.min(y, obstacle.y + halfH))
  const dx = x - closestX
  const dy = y - closestY
  return dx * dx + dy * dy < radius * radius
}

export function pointInsideExpandedObstacle(x: number, y: number, radius: number, obstacle: LevelObstacle): boolean {
  return x > obstacle.x - obstacle.width / 2 - radius && x < obstacle.x + obstacle.width / 2 + radius && y > obstacle.y - obstacle.height / 2 - radius && y < obstacle.y + obstacle.height / 2 + radius
}
