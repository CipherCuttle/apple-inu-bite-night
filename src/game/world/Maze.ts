export const MAZE_CELL_SIZE = 64
export const MAZE_GRID = [
  '#############',
  '#.....#.....#',
  '#.###.#.###.#',
  '#...#.......#',
  '###.#.###.#.#',
  '#.....#.....#',
  '#############',
] as const

export const MAZE_ROWS = MAZE_GRID.length
export const MAZE_COLS = MAZE_GRID[0].length
export const MAZE_WIDTH = MAZE_COLS * MAZE_CELL_SIZE
export const MAZE_HEIGHT = MAZE_ROWS * MAZE_CELL_SIZE
export const MAZE_ORIGIN_X = -MAZE_WIDTH / 2
export const MAZE_ORIGIN_Y = -MAZE_HEIGHT / 2
export const MAZE_KILL_GATE = 18

export interface MazeCell {
  row: number
  col: number
}

export interface MazePoint {
  x: number
  y: number
}

export const MAZE_START: MazePoint = cellCenter({ row: 3, col: 6 })
export const MAZE_EXIT: MazePoint = cellCenter({ row: 5, col: 11 })

export function mazeCellAt(x: number, y: number): MazeCell | null {
  const col = Math.floor((x - MAZE_ORIGIN_X) / MAZE_CELL_SIZE)
  const row = Math.floor((y - MAZE_ORIGIN_Y) / MAZE_CELL_SIZE)
  if (row < 0 || row >= MAZE_ROWS || col < 0 || col >= MAZE_COLS) return null
  return { row, col }
}

export function isMazeCellOpen(cell: MazeCell | null): boolean {
  if (!cell) return false
  if (cell.row < 0 || cell.row >= MAZE_ROWS || cell.col < 0 || cell.col >= MAZE_COLS) return false
  return MAZE_GRID[cell.row][cell.col] !== '#'
}

export function cellCenter(cell: MazeCell): MazePoint {
  return {
    x: MAZE_ORIGIN_X + cell.col * MAZE_CELL_SIZE + MAZE_CELL_SIZE / 2,
    y: MAZE_ORIGIN_Y + cell.row * MAZE_CELL_SIZE + MAZE_CELL_SIZE / 2,
  }
}

export function mazeCanOccupy(x: number, y: number, radius: number): boolean {
  const probes: readonly [number, number][] = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
    [radius * 0.7, radius * 0.7],
    [radius * 0.7, -radius * 0.7],
    [-radius * 0.7, radius * 0.7],
    [-radius * 0.7, -radius * 0.7],
  ]
  return probes.every(([dx, dy]) => isMazeCellOpen(mazeCellAt(x + dx, y + dy)))
}

export function buildMazeFlowField(targetX: number, targetY: number): number[] {
  const distances = Array<number>(MAZE_ROWS * MAZE_COLS).fill(Number.POSITIVE_INFINITY)
  const target = nearestOpenCell(mazeCellAt(targetX, targetY))
  if (!target) return distances

  const queue: MazeCell[] = [target]
  distances[indexOf(target)] = 0
  let cursor = 0
  while (cursor < queue.length) {
    const current = queue[cursor]
    cursor += 1
    const nextDistance = distances[indexOf(current)] + 1
    for (const neighbor of neighbors(current)) {
      const index = indexOf(neighbor)
      if (distances[index] <= nextDistance) continue
      distances[index] = nextDistance
      queue.push(neighbor)
    }
  }
  return distances
}

export function mazeFlowTarget(x: number, y: number, flow: readonly number[]): MazePoint {
  const current = nearestOpenCell(mazeCellAt(x, y))
  if (!current) return { x, y }

  let best = current
  let bestDistance = flow[indexOf(current)] ?? Number.POSITIVE_INFINITY
  for (const neighbor of neighbors(current)) {
    const distance = flow[indexOf(neighbor)] ?? Number.POSITIVE_INFINITY
    if (distance < bestDistance) {
      best = neighbor
      bestDistance = distance
    }
  }
  return cellCenter(best)
}

export function openMazeCenters(): MazePoint[] {
  const points: MazePoint[] = []
  for (let row = 0; row < MAZE_ROWS; row += 1) {
    for (let col = 0; col < MAZE_COLS; col += 1) {
      if (MAZE_GRID[row][col] === '#') continue
      points.push(cellCenter({ row, col }))
    }
  }
  return points
}

export function mazeWallCells(): MazeCell[] {
  const cells: MazeCell[] = []
  for (let row = 0; row < MAZE_ROWS; row += 1) {
    for (let col = 0; col < MAZE_COLS; col += 1) {
      if (MAZE_GRID[row][col] === '#') cells.push({ row, col })
    }
  }
  return cells
}

export function mazeExitReached(x: number, y: number, radius = 26): boolean {
  const dx = x - MAZE_EXIT.x
  const dy = y - MAZE_EXIT.y
  return dx * dx + dy * dy <= radius * radius
}

function neighbors(cell: MazeCell): MazeCell[] {
  const result: MazeCell[] = []
  const candidates: MazeCell[] = [
    { row: cell.row - 1, col: cell.col },
    { row: cell.row + 1, col: cell.col },
    { row: cell.row, col: cell.col - 1 },
    { row: cell.row, col: cell.col + 1 },
  ]
  for (const candidate of candidates) {
    if (isMazeCellOpen(candidate)) result.push(candidate)
  }
  return result
}

function nearestOpenCell(cell: MazeCell | null): MazeCell | null {
  if (isMazeCellOpen(cell)) return cell
  if (!cell) return null
  for (let radius = 1; radius <= 2; radius += 1) {
    for (let dr = -radius; dr <= radius; dr += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        const candidate = { row: cell.row + dr, col: cell.col + dc }
        if (isMazeCellOpen(candidate)) return candidate
      }
    }
  }
  return null
}

function indexOf(cell: MazeCell): number {
  return cell.row * MAZE_COLS + cell.col
}
