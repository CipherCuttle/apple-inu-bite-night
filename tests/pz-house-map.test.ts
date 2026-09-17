import { describe, expect, it } from 'vitest'
import houseMap from '../src/game/world/maps/house01.json'

describe('authored house map', () => {
  it('contains distinct readable rooms and a single exterior house footprint', () => {
    expect(houseMap.name).toBe('Maple Street House 01')
    expect(houseMap.rooms.map((room) => room.id)).toEqual(['kitchen', 'bathroom', 'living', 'hall', 'bedroom'])
    expect(houseMap.houseBounds).toEqual({ x: 4, y: 2, w: 10, h: 8 })
    expect(houseMap.walls.filter((wall) => wall.kind === 'exterior').length).toBeGreaterThan(20)
  })

  it('has authored lootable furniture and a real entry door', () => {
    const containers = houseMap.objects.filter((object) => object.container)
    expect(containers.map((object) => object.id)).toEqual(expect.arrayContaining(['fridge', 'counter-a', 'bookshelf', 'nightstand', 'dresser']))
    expect(houseMap.openings.some((opening) => opening.id === 'front-door' && opening.kind === 'door')).toBe(true)
    expect(houseMap.objects.some((object) => object.sprite === 'bed')).toBe(true)
    expect(houseMap.objects.some((object) => object.sprite === 'toilet')).toBe(true)
    expect(houseMap.objects.some((object) => object.sprite === 'sofa')).toBe(true)
  })
})
