export type PropMaterial = 'wood' | 'glass' | 'metal'

export interface PropState {
  id: number
  active: boolean
  x: number
  y: number
  radius: number
  hp: number
  maxHp: number
  material: PropMaterial
  breakImpulse: number
}

export function createImpactProps(): PropState[] {
  return [
    makeProp(1, -185, -105, 24, 2, 'wood', 6),
    makeProp(2, -120, -115, 17, 1, 'wood', 5.5),
    makeProp(3, 150, -122, 17, 1, 'glass', 3),
    makeProp(4, 194, -122, 17, 1, 'glass', 3),
    makeProp(5, -245, 125, 19, 3, 'metal', 14),
    makeProp(6, 122, 112, 22, 2, 'wood', 6.5),
    makeProp(7, 176, 134, 22, 2, 'wood', 6.5),
  ]
}

function makeProp(
  id: number,
  x: number,
  y: number,
  radius: number,
  hp: number,
  material: PropMaterial,
  breakImpulse: number,
): PropState {
  return {
    id,
    active: true,
    x,
    y,
    radius,
    hp,
    maxHp: hp,
    material,
    breakImpulse,
  }
}
