import { describe, expect, it } from 'vitest'
import {
  MAZE_EXIT,
  MAZE_GRID,
  MAZE_START,
  buildMazeFlowField,
  mazeCanOccupy,
  mazeCellAt,
  mazeFlowTarget,
  openMazeCenters,
} from '../src/game/world/Maze'

describe('maze', () => {
  it('keeps start and exit on walkable floor', () => {
    expect(mazeCanOccupy(MAZE_START.x, MAZE_START.y, 12)).toBe(true)
    expect(mazeCanOccupy(MAZE_EXIT.x, MAZE_EXIT.y, 12)).toBe(true)
  })

  it('has a connected flow field from every open cell to the player', () => {
    const flow = buildMazeFlowField(MAZE_START.x, MAZE_START.y)
    for (const point of openMazeCenters()) {
      const cell = mazeCellAt(point.x, point.y)
      expect(cell).not.toBeNull()
      const index = (cell?.row ?? 0) * MAZE_GRID[0].length + (cell?.col ?? 0)
      expect(Number.isFinite(flow[index])).toBe(true)
    }
  })

  it('steers a distant enemy toward a lower-distance neighbor', () => {
    const flow = buildMazeFlowField(MAZE_START.x, MAZE_START.y)
    const target = mazeFlowTarget(MAZE_EXIT.x, MAZE_EXIT.y, flow)
    expect(target.x === MAZE_EXIT.x && target.y === MAZE_EXIT.y).toBe(false)
  })
})
