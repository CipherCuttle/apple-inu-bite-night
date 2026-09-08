import type { SimEvent } from '../game/sim/GameState'

export interface GoreFrame {
  major: Extract<SimEvent, { type: 'enemy-hit' }>[]
  minor: Extract<SimEvent, { type: 'enemy-hit' }>[]
}

export class GoreBudget {
  constructor(
    readonly maxMajorPerFrame = 4,
    readonly maxMinorPerFrame = 12,
  ) {}

  select(events: readonly SimEvent[]): GoreFrame {
    const hits = events.filter((event): event is Extract<SimEvent, { type: 'enemy-hit' }> => event.type === 'enemy-hit')
    const major = hits.filter((event) => event.killed).slice(0, this.maxMajorPerFrame)
    const majorIds = new Set(major.map((event) => event.enemyId))
    const minor = hits.filter((event) => !majorIds.has(event.enemyId)).slice(0, this.maxMinorPerFrame)
    return { major, minor }
  }
}
