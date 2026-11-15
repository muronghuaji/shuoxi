import { describe, expect, it } from 'vitest'
import {
  createEmptyLocationMap,
  createTerrainShape,
  locationMapSvg,
  mountainSnapPoint,
  normalizeLocationMap,
} from './locationMap'
import type { LocationCard } from './types'

describe('location terrain map', () => {
  it('normalizes a legacy empty map and shape geometry', () => {
    const map = normalizeLocationMap({
      width: 1200,
      height: 800,
      shapes: [
        {
          id: 'm1',
          kind: 'mountain',
          geometry: { type: 'stamp', x: 100, y: 120, scale: 1.2, rotation: 20 },
          zIndex: 1,
        },
        {
          id: 'f1',
          kind: 'forest',
          geometry: { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 80, y: 80 }] },
          zIndex: 2,
        },
      ],
    })
    expect(map.width).toBe(1200)
    expect(map.shapes).toHaveLength(2)
    expect(normalizeLocationMap({}).shapes).toEqual([])
    expect(normalizeLocationMap({ shapes: [{ kind: 'bad' }] }).shapes).toEqual([])
  })

  it('snaps a mountain stamp near another mountain', () => {
    const first = createTerrainShape(
      'mountain',
      { type: 'stamp', x: 200, y: 200, scale: 1, rotation: 0 },
      1,
    )
    const snapped = mountainSnapPoint({ x: 230, y: 210 }, [first])
    expect(Math.hypot(snapped.x - 200, snapped.y - 200)).toBeCloseTo(110, 0)
    const far = mountainSnapPoint({ x: 900, y: 900 }, [first])
    expect(far).toEqual({ x: 900, y: 900 })
  })

  it('exports an SVG containing terrain, rooms and links', () => {
    const map = createEmptyLocationMap()
    map.shapes = [
      createTerrainShape('river', { type: 'path', points: [{ x: 50, y: 50 }, { x: 300, y: 180 }] }, 1),
      createTerrainShape(
        'forest',
        { type: 'polygon', points: [{ x: 500, y: 100 }, { x: 700, y: 120 }, { x: 650, y: 300 }] },
        2,
      ),
    ]
    const locations: LocationCard[] = [
      { id: 'a', name: '青云城', type: '城', description: '', mapX: 120, mapY: 200 },
      { id: 'b', name: '太虚剑宗', type: '宗门', description: '', mapX: 600, mapY: 200 },
    ]
    const svg = locationMapSvg(map, locations, [{ id: 'l1', fromId: 'a', toId: 'b', type: '官道' }])
    expect(svg).toContain('青云城')
    expect(svg).toContain('太虚剑宗')
    expect(svg).toContain('stroke="#669ab7"')
    expect(svg).toContain('stroke-dasharray')
    expect(svg).toContain('<svg')
  })
})
