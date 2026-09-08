import { describe, expect, it } from 'vitest'
import { CITY_LEVEL_OBSTACLES, circleOverlapsObstacle } from '../src/game/world/Level'

describe('city level geometry', () => { it('provides multiple building blocks and leaves player start open', () => { expect(CITY_LEVEL_OBSTACLES.length).toBeGreaterThanOrEqual(8); expect(CITY_LEVEL_OBSTACLES.some((obstacle) => circleOverlapsObstacle(0, 0, 14, obstacle))).toBe(false) }) })
