import { describe, expect, it } from 'vitest'
import { ACTIVE_ENEMY_CAP, EnemyPool } from '../src/game/enemies/EnemyPool'
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

  it('caps the live horde below the backing pool capacity', () => {
    const pool = new EnemyPool(220)
    const rng = new XorShift32(7)
    for (let i = 0; i < ACTIVE_ENEMY_CAP + 20; i += 1) pool.spawnAround(0, 0, rng)
    expect(pool.activeCount()).toBe(ACTIVE_ENEMY_CAP)
    expect(ACTIVE_ENEMY_CAP).toBeLessThan(60)
  })
})
