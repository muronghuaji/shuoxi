import { describe, expect, it } from 'vitest'
import { buildTerrainAiMessages, buildTerrainFromLocations, parseTerrainAiResult } from './terrainAi'
import { createEmptyDetail, SEED_WORKS } from './data'
import type { LocationCard } from './types'

describe('terrain ai', () => {
  it('parses regions, routes and labels from a map JSON response', () => {
    const parsed = parseTerrainAiResult(
      JSON.stringify({
        summary: '北山南水',
        regions: [
          { kind: 'mountain', label: '北境雪山', x: 30, y: 20, w: 30, h: 12 },
          { kind: 'forest', label: '西林', x: 20, y: 55, w: 18, h: 16 },
          { kind: 'water', label: '南湖', x: 65, y: 72, w: 24, h: 10 },
        ],
        routes: [
          { kind: 'road', label: '官道', points: [[20, 40], [50, 45], [80, 38]] },
        ],
        labels: [{ text: '云海', x: 70, y: 18 }],
      }),
    )
    expect(parsed?.shapes.length).toBeGreaterThanOrEqual(6)
    expect(parsed?.shapes.some((shape) => shape.kind === 'mountain')).toBe(true)
    expect(parsed?.shapes.some((shape) => shape.kind === 'road')).toBe(true)
    expect(parsed?.shapes.some((shape) => shape.kind === 'label')).toBe(true)
    expect(parseTerrainAiResult('不是 JSON')).toBeNull()
  })

  it('builds terrain from natural and route locations', () => {
    const locations: LocationCard[] = [
      { id: 'a', name: '北境雪山', type: '山脉', description: '', mapX: 100, mapY: 100 },
      { id: 'b', name: '青木林', type: '森林', description: '', mapX: 300, mapY: 200 },
      { id: 'c', name: '镜湖', type: '湖泊', description: '', mapX: 500, mapY: 300 },
      { id: 'd', name: '北关', type: '关隘', description: '', mapX: 100, mapY: 400 },
      { id: 'e', name: '南渡', type: '渡口', description: '', mapX: 500, mapY: 500 },
    ]
    const shapes = buildTerrainFromLocations(locations)
    expect(shapes.some((shape) => shape.kind === 'mountain')).toBe(true)
    expect(shapes.some((shape) => shape.kind === 'forest')).toBe(true)
    expect(shapes.some((shape) => shape.kind === 'water')).toBe(true)
    expect(shapes.some((shape) => shape.kind === 'road')).toBe(true)
  })

  it('builds a prompt with locations and chapter context', () => {
    const work = { ...SEED_WORKS[0], title: '测试书' }
    const detail = createEmptyDetail()
    detail.locations = [
      { id: 'l1', name: '北境', type: '山脉', description: '', mapX: 10, mapY: 20 },
    ]
    const messages = buildTerrainAiMessages({
      work,
      detail,
      chapters: [],
      request: '山水相依',
    })
    expect(messages[0].role).toBe('system')
    expect(messages[1].content).toContain('北境')
    expect(messages[1].content).toContain('山水相依')
  })
})
