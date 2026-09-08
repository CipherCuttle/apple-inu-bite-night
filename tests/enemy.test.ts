import { describe, expect, it } from 'vitest'
import { EnemyPool } from '../src/game/enemies/EnemyPool'
import { XorShift32 } from '../src/game/sim/RNG'

describe('EnemyPool', () => {
  it('reuses capacity without growing the pool', () => {
    const pool = new EnemyPool(2)
    const rng = new XorShift32(42)
    const first = pool.spawnAround(0, 0, rng)
    const second = pool.spawnAround(0, 0, rng)
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(pool.spawnAround(0, 0, rng)).toBeNull()
    pool.kill(first!)
    expect(pool.spawnAround(0, 0, rng)).not.toBeNull()
    expect(pool.items).toHaveLength(2)
  })
})
