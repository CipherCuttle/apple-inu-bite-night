export type SeveredArm = 'none' | 'left' | 'right'

export interface EnemyState {
  id: number
  active: boolean
  x: number
  y: number
  hp: number
  speed: number
  radius: number
  mass: number
  vx: number
  vy: number
  impulseX: number
  impulseY: number
  staggerTicks: number
  severedArm: SeveredArm
}
