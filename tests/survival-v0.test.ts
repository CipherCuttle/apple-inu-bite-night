import { describe, expect, it } from 'vitest'
import { SurvivalState, type SurvivalInput } from '../src/game/survival/SurvivalState'

function scriptedInput(tick: number): SurvivalInput {
  const phase = Math.floor(tick / 90) % 4
  const movement = phase === 0 ? { x: 1, y: 0 } : phase === 1 ? { x: 0, y: 1 } : phase === 2 ? { x: -1, y: 0 } : { x: 0, y: -1 }
  return { ...movement, sprint: tick % 180 > 130, attack: tick % 97 === 0, interact: tick % 211 === 0 }
}

function run(seed: number, ticks: number): string {
  const state = new SurvivalState(seed)
  for (let tick = 0; tick < ticks && !state.dead; tick += 1) state.step(scriptedInput(tick))
  return state.resultHash()
}

describe('PZ survival V0', () => {
  it('is deterministic for identical seed and input', () => {
    expect(run(0x51a7b10c, 720)).toBe(run(0x51a7b10c, 720))
    expect(run(0x51a7b10c, 720)).not.toBe(run(0x51a7b10d, 720))
  })

  it('doors are authoritative blockers and can be opened', () => {
    const state = new SurvivalState(7)
    const door = state.fixtures.find((fixture) => fixture.kind === 'door' && fixture.roomId === 'house-a')
    expect(door).toBeDefined()
    expect(state.canOccupy((door?.x ?? 0) + 0.5, (door?.y ?? 0) + 0.5)).toBe(false)
    state.player.x = (door?.x ?? 0) + 0.5
    state.player.y = (door?.y ?? 0) - 0.45
    state.step({ x: 0, y: 0, interact: true })
    expect(door?.open).toBe(true)
    expect(state.canOccupy((door?.x ?? 0) + 0.5, (door?.y ?? 0) + 0.5)).toBe(true)
  })

  it('loud broken glass pulls a nearby zombie into investigation', () => {
    const state = new SurvivalState(8)
    const windowFixture = state.fixtures.find((fixture) => fixture.kind === 'window' && fixture.roomId === 'house-a')
    expect(windowFixture).toBeDefined()
    const zombie = state.zombies[0]
    zombie.x = (windowFixture?.x ?? 0) + 4
    zombie.y = (windowFixture?.y ?? 0) + 1
    zombie.mode = 'wander'
    zombie.alertTicks = 0
    state.player.x = (windowFixture?.x ?? 0) + 0.5
    state.player.y = (windowFixture?.y ?? 0) - 0.45
    state.step({ x: 0, y: 0, smash: true })
    expect(windowFixture?.smashed).toBe(true)
    expect(state.noises.some((noise) => noise.source === 'window' && noise.power === 11)).toBe(true)
    expect(zombie.mode).toBe('investigate')
  })

  it('backpack loot materially expands carrying capacity', () => {
    const state = new SurvivalState(9)
    const dresser = state.fixtures.find((fixture) => fixture.kind === 'container' && fixture.containerKind === 'dresser')
    const backpack = dresser?.items?.find((item) => item.kind === 'backpack')
    expect(dresser).toBeDefined()
    expect(backpack).toBeDefined()
    expect(state.inventoryCapacity()).toBe(8)
    expect(state.takeItem(dresser?.id ?? 0, backpack?.id ?? 0)).toBe(true)
    expect(state.inventoryCapacity()).toBe(20)
  })

  it('bleeding costs health, bandaging stops it, and save/load preserves state', () => {
    const state = new SurvivalState(10)
    state.player.bleeding = 40
    const hpBefore = state.player.hp
    state.step({ x: 0, y: 0 })
    expect(state.player.hp).toBeLessThan(hpBefore)
    expect(state.bandage()).toBe(true)
    expect(state.player.bleeding).toBe(0)
    const loaded = SurvivalState.deserialize(state.serialize())
    expect(loaded.resultHash()).toBe(state.resultHash())
    expect(loaded.timeLabel()).toBe(state.timeLabel())
  })
})
