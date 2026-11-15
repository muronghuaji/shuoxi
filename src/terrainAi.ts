import type {
  Chapter,
  LocationCard,
  LocationTerrainKind,
  LocationTerrainShape,
  Work,
  WorkDetail,
} from './types'
import type { ChatMessage } from './ai'
import { createTerrainShape } from './locationMap'

const MAP_WIDTH = 1600
const MAP_HEIGHT = 1000

export interface TerrainAiInput {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  activeChapterId?: string
  request: string
}

export interface TerrainAiResult {
  summary: string
  shapes: LocationTerrainShape[]
}

function compact(value: string | undefined, limit: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

export function buildTerrainAiMessages(input: TerrainAiInput): ChatMessage[] {
  const active =
    input.chapters.find((chapter) => chapter.id === input.activeChapterId) ??
    input.chapters.find((chapter) => chapter.content.trim()) ??
    input.chapters[input.chapters.length - 1]
  const recent = input.chapters
    .filter((chapter) => chapter.content.trim())
    .slice(-3)
    .map((chapter) => `- ${chapter.title || '未命名章节'}：${compact(chapter.content, 420)}`)
    .join('\n')
  const locations = (input.detail.locations ?? [])
    .slice(0, 80)
    .map((location) => `- ${location.name || '未命名'}（${location.type || '地点'}，坐标 ${location.mapX ?? 0},${location.mapY ?? 0}）`)
    .join('\n')
  return [
    {
      role: 'system',
      content: [
        '你是小说世界地图的空间设计师。你的任务是根据故事和地点列表，提出一组可绘制的地形布局。',
        '只输出一个完整、合法的 JSON 对象，不要 Markdown、不要解释、不要多余文字。',
        '坐标使用 0–100 的相对百分比，x 向右、y 向下。重点是地理关系，不要求精确比例。',
        '不要替用户删除已有地点；不要输出正文。',
        'JSON 结构：',
        '{"summary":"一句话说明布局","regions":[{"kind":"mountain|forest|water|custom","label":"地名或地形名","x":50,"y":30,"w":24,"h":14}],"routes":[{"kind":"road|river|ravine","label":"道路或河流名","points":[[x,y],[x,y]]}],"labels":[{"text":"标注文字","x":50,"y":20}]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `作品：${input.work.title}`,
        `题材：${input.work.genres.join(' / ') || '未定'}`,
        `简介：${compact(input.work.synopsis, 800) || '未填写'}`,
        `世界观：${compact(input.detail.worldview, 1000) || '未填写'}`,
        locations ? `已有地点：\n${locations}` : '还没有地点列表，请按作品设定自行设计。',
        active ? `当前章节参考：${active.title || '未命名章节'}\n${compact(active.content, 1600)}` : '',
        recent ? `最近正文片段：\n${recent}` : '',
        `作者的地图要求：${input.request.trim() || '根据作品内容自动设计主要山川、河流和道路。'}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

function findJson(raw: string): unknown {
  const text = raw.replace(/```json|```/gi, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toX(value: number): number {
  return clamp(value, 0, 100) * (MAP_WIDTH / 100)
}

function toY(value: number): number {
  return clamp(value, 0, 100) * (MAP_HEIGHT / 100)
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function pointList(raw: unknown): { x: number; y: number }[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((point) => {
      if (Array.isArray(point)) {
        return { x: toX(number(point[0], 0)), y: toY(number(point[1], 0)) }
      }
      if (point && typeof point === 'object') {
        const value = point as Record<string, unknown>
        return { x: toX(number(value.x, 0)), y: toY(number(value.y, 0)) }
      }
      return null
    })
    .filter((point): point is { x: number; y: number } => Boolean(point))
}

function regionPolygon(x: number, y: number, w: number, h: number): { x: number; y: number }[] {
  const left = toX(x - w / 2)
  const right = toX(x + w / 2)
  const top = toY(y - h / 2)
  const bottom = toY(y + h / 2)
  return [
    { x: left, y: top + (bottom - top) * 0.16 },
    { x: left + (right - left) * 0.2, y: top },
    { x: right - (right - left) * 0.18, y: top + (bottom - top) * 0.1 },
    { x: right, y: top + (bottom - top) * 0.48 },
    { x: right - (right - left) * 0.12, y: bottom },
    { x: left + (right - left) * 0.25, y: bottom - (bottom - top) * 0.08 },
  ]
}

export function parseTerrainAiResult(raw: string): TerrainAiResult | null {
  const data = findJson(raw)
  if (!data || typeof data !== 'object') return null
  const value = data as Record<string, unknown>
  const shapes: LocationTerrainShape[] = []
  let zIndex = 1
  const push = (kind: LocationTerrainKind, geometry: LocationTerrainShape['geometry'], label?: string) => {
    if (shapes.length >= 64) return
    const shape = createTerrainShape(kind, geometry, zIndex, kind === 'mountain' ? undefined : undefined)
    if (label?.trim()) shape.label = label.trim()
    shapes.push(shape)
    zIndex += 1
  }

  if (Array.isArray(value.regions)) {
    for (const item of value.regions) {
      if (!item || typeof item !== 'object') continue
      const region = item as Record<string, unknown>
      const kind =
        region.kind === 'forest' || region.kind === 'water' || region.kind === 'custom'
          ? region.kind
          : 'mountain'
      const x = number(region.x, 50)
      const y = number(region.y, 50)
      const w = number(region.w, 24)
      const h = number(region.h, 14)
      const label = typeof region.label === 'string' ? region.label : ''
      if (kind === 'mountain') {
        const count = w > 35 ? 3 : w > 18 ? 2 : 1
        for (let index = 0; index < count; index += 1) {
          push(
            'mountain',
            {
              type: 'stamp',
              x: toX(x + (index - (count - 1) / 2) * Math.max(4, w / count)),
              y: toY(y + (index % 2 === 0 ? 0 : 2)),
              scale: 1,
              rotation: 0,
            },
            index === 0 ? label : undefined,
          )
        }
      } else {
        push(kind, { type: 'polygon', points: regionPolygon(x, y, w, h) }, label)
      }
    }
  }

  if (Array.isArray(value.routes)) {
    for (const item of value.routes) {
      if (!item || typeof item !== 'object') continue
      const route = item as Record<string, unknown>
      const kind = route.kind === 'river' || route.kind === 'ravine' ? route.kind : 'road'
      const points = pointList(route.points)
      if (points.length < 2) continue
      push(kind, { type: 'path', points }, typeof route.label === 'string' ? route.label : '')
    }
  }

  if (Array.isArray(value.labels)) {
    for (const item of value.labels) {
      if (!item || typeof item !== 'object') continue
      const label = item as Record<string, unknown>
      const text = typeof label.text === 'string' ? label.text.trim() : ''
      if (!text) continue
      push(
        'label',
        { type: 'stamp', x: toX(number(label.x, 50)), y: toY(number(label.y, 20)), scale: 1, rotation: 0 },
        text,
      )
    }
  }

  if (shapes.length === 0) return null
  return {
    summary: typeof value.summary === 'string' ? value.summary : `生成了 ${shapes.length} 个地形形状`,
    shapes,
  }
}

export function buildTerrainFromLocations(locations: LocationCard[]): LocationTerrainShape[] {
  const shapes: LocationTerrainShape[] = []
  let zIndex = 1
  let roadPoints: { x: number; y: number }[] = []
  for (const location of locations) {
    const x = typeof location.mapX === 'number' ? location.mapX : 160
    const y = typeof location.mapY === 'number' ? location.mapY : 160
    const type = location.type || location.name
    if (/山|峰|岭|谷/.test(type)) {
      const shape = createTerrainShape(
        'mountain',
        { type: 'stamp', x: x + 30, y: y - 24, scale: 1, rotation: 0 },
        zIndex,
      )
      shape.label = location.name
      shape.linkedLocationId = location.id
      shapes.push(shape)
      zIndex += 1
    } else if (/林|森|树/.test(type)) {
      const shape = createTerrainShape(
        'forest',
        {
          type: 'polygon',
          points: [
            { x: x - 30, y: y - 24 },
            { x: x + 120, y: y - 30 },
            { x: x + 140, y: y + 90 },
            { x: x - 20, y: y + 100 },
          ],
        },
        zIndex,
      )
      shape.label = location.name
      shape.linkedLocationId = location.id
      shapes.push(shape)
      zIndex += 1
    } else if (/湖|海|河|江|溪|潭|泊/.test(type)) {
      const shape = createTerrainShape(
        'water',
        {
          type: 'polygon',
          points: [
            { x: x - 24, y: y + 8 },
            { x: x + 70, y: y - 20 },
            { x: x + 160, y: y + 10 },
            { x: x + 130, y: y + 78 },
            { x: x + 10, y: y + 86 },
          ],
        },
        zIndex,
      )
      shape.label = location.name
      shape.linkedLocationId = location.id
      shapes.push(shape)
      zIndex += 1
    } else if (/路|关|渡|桥|驿|道/.test(type)) {
      roadPoints.push({ x, y })
    }
    if (shapes.length >= 40) break
  }
  if (roadPoints.length >= 2) {
    for (let index = 0; index < roadPoints.length - 1; index += 1) {
      const from = roadPoints[index]
      const to = roadPoints[index + 1]
      shapes.push(
        createTerrainShape(
          'road',
          {
            type: 'path',
            points: [
              { x: from.x + 50, y: from.y + 30 },
              { x: (from.x + to.x) / 2 + 20, y: (from.y + to.y) / 2 - 20 },
              { x: to.x + 50, y: to.y + 30 },
            ],
          },
          zIndex,
        ),
      )
      zIndex += 1
    }
  }
  return shapes
}
