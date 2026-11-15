import type {
  LocationCard,
  LocationLink,
  LocationMapDocument,
  LocationMapLayer,
  LocationMapTheme,
  LocationTerrainKind,
  LocationTerrainShape,
  MapPoint,
} from './types'

export const TERRAIN_LAYERS: LocationMapLayer[] = [
  { id: 'terrain', name: '地形', visible: true, locked: false },
  { id: 'route', name: '路线', visible: true, locked: false },
  { id: 'loc', name: '地点', visible: true, locked: false },
  { id: 'label', name: '标注', visible: true, locked: false },
]

export const MAP_THEMES: { id: LocationMapTheme; label: string }[] = [
  { id: 'dark', label: '深色' },
  { id: 'ink', label: '水墨' },
  { id: 'parchment', label: '羊皮纸' },
  { id: 'blueprint', label: '蓝图' },
]

export const TERRAIN_KIND_LABELS: Record<LocationTerrainKind, string> = {
  mountain: '山脉',
  forest: '森林',
  water: '水域',
  road: '道路',
  river: '河流',
  ravine: '沟壑',
  custom: '自定义区域',
  brush: '地形笔刷',
  label: '地名标注',
}

export const TERRAIN_PALETTE: {
  kind: LocationTerrainKind
  label: string
  hint: string
  tool: 'stamp' | 'polygon' | 'path' | 'brush' | 'label'
}[] = [
  { kind: 'mountain', label: '山脉', hint: '点击放置山段，靠近另一段自动吸附', tool: 'stamp' },
  { kind: 'forest', label: '森林', hint: '逐点绘制闭合林地', tool: 'polygon' },
  { kind: 'water', label: '水域', hint: '逐点绘制湖泊 / 海域', tool: 'polygon' },
  { kind: 'road', label: '道路', hint: '逐点绘制官道 / 小路', tool: 'path' },
  { kind: 'river', label: '河流', hint: '逐点绘制河道', tool: 'path' },
  { kind: 'ravine', label: '沟壑', hint: '逐点绘制裂谷 / 深沟', tool: 'path' },
  { kind: 'custom', label: '自定义区域', hint: '自由绘制闭合地形轮廓', tool: 'polygon' },
  { kind: 'brush', label: '地形笔刷', hint: '按住拖动绘制自由地形笔触', tool: 'brush' },
  { kind: 'label', label: '地名标注', hint: '点击地图放置文字标注', tool: 'label' },
]

export function createEmptyLocationMap(): LocationMapDocument {
  return {
    version: 1,
    width: 1600,
    height: 1000,
    theme: 'dark',
    layers: TERRAIN_LAYERS.map((layer) => ({ ...layer })),
    shapes: [],
  }
}

export function normalizeLocationMap(raw: unknown): LocationMapDocument {
  if (!raw || typeof raw !== 'object') return createEmptyLocationMap()
  const value = raw as Partial<LocationMapDocument>
  const shapes = Array.isArray(value.shapes)
    ? value.shapes
        .map((shape, index) => normalizeShape(shape, index))
        .filter((shape): shape is LocationTerrainShape => Boolean(shape))
    : []
  const layers = Array.isArray(value.layers)
    ? TERRAIN_LAYERS.map((base) => {
        const saved = value.layers?.find((layer) => layer.id === base.id)
        return saved ? { ...base, visible: saved.visible !== false, locked: Boolean(saved.locked) } : base
      })
    : TERRAIN_LAYERS.map((layer) => ({ ...layer }))
  return {
    version: 1,
    width: typeof value.width === 'number' && value.width >= 600 ? value.width : 1600,
    height: typeof value.height === 'number' && value.height >= 400 ? value.height : 1000,
    theme:
      value.theme === 'ink' || value.theme === 'parchment' || value.theme === 'blueprint'
        ? value.theme
        : 'dark',
    layers,
    shapes: shapes.map((shape, index) => ({ ...shape, zIndex: shape.zIndex ?? index })),
  }
}

function normalizeStyle(raw: unknown): LocationTerrainShape['style'] {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Record<string, unknown>
  return {
    fill: typeof value.fill === 'string' ? value.fill : undefined,
    stroke: typeof value.stroke === 'string' ? value.stroke : undefined,
    strokeWidth: typeof value.strokeWidth === 'number' ? value.strokeWidth : undefined,
    opacity: typeof value.opacity === 'number' ? value.opacity : undefined,
    brushColor: typeof value.brushColor === 'string' ? value.brushColor : undefined,
  }
}

function normalizeShape(raw: unknown, index: number): LocationTerrainShape | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<LocationTerrainShape>
  const kinds: LocationTerrainKind[] = [
    'mountain',
    'forest',
    'water',
    'road',
    'river',
    'ravine',
    'custom',
    'brush',
    'label',
  ]
  if (!value.kind || !kinds.includes(value.kind)) return null
  const geometry = normalizeGeometry(value.geometry)
  if (!geometry) return null
  return {
    id: typeof value.id === 'string' && value.id ? value.id : `terrain-${Date.now()}-${index}`,
    kind: value.kind,
    geometry,
    style: normalizeStyle(value.style),
    label: typeof value.label === 'string' ? value.label : undefined,
    linkedLocationId:
      typeof value.linkedLocationId === 'string' ? value.linkedLocationId : undefined,
    linkedFactionId:
      typeof value.linkedFactionId === 'string' ? value.linkedFactionId : undefined,
    zIndex: typeof value.zIndex === 'number' ? value.zIndex : index,
  }
}

function normalizeGeometry(raw: unknown): LocationTerrainShape['geometry'] | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (value.type === 'stamp') {
    return {
      type: 'stamp',
      x: Number(value.x) || 0,
      y: Number(value.y) || 0,
      scale: typeof value.scale === 'number' && value.scale > 0 ? value.scale : 1,
      rotation: typeof value.rotation === 'number' ? value.rotation : 0,
    }
  }
  if ((value.type === 'path' || value.type === 'polygon') && Array.isArray(value.points)) {
    const points = value.points
      .map((point) => {
        if (!point || typeof point !== 'object') return null
        const item = point as Record<string, unknown>
        const x = Number(item.x)
        const y = Number(item.y)
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null
        return { x, y }
      })
      .filter((point): point is MapPoint => Boolean(point))
    if (points.length < 2) return null
    return { type: value.type, points }
  }
  return null
}

export function createTerrainShape(
  kind: LocationTerrainKind,
  geometry: LocationTerrainShape['geometry'],
  zIndex: number,
  style?: LocationTerrainShape['style'],
): LocationTerrainShape {
  return {
    id: `terrain-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    geometry,
    ...(style ? { style } : {}),
    zIndex,
  }
}

export function shapeLayer(kind: LocationTerrainKind): 'terrain' | 'route' | 'label' {
  if (kind === 'label') return 'label'
  return kind === 'road' || kind === 'river' || kind === 'ravine' ? 'route' : 'terrain'
}

export function layerVisible(map: LocationMapDocument, kind: LocationTerrainKind): boolean {
  const layer = map.layers.find((item) => item.id === shapeLayer(kind))
  return layer?.visible !== false
}

export function mapBounds(map: LocationMapDocument): { width: number; height: number } {
  let width = map.width
  let height = map.height
  for (const shape of map.shapes) {
    if (shape.geometry.type === 'stamp') {
      width = Math.max(width, shape.geometry.x + 240)
      height = Math.max(height, shape.geometry.y + 180)
    } else {
      for (const point of shape.geometry.points) {
        width = Math.max(width, point.x + 120)
        height = Math.max(height, point.y + 120)
      }
    }
  }
  return { width, height }
}

export function mountainSnapPoint(
  point: MapPoint,
  shapes: LocationTerrainShape[],
  exceptId?: string,
): MapPoint {
  let best = point
  let bestDistance = 90
  for (const shape of shapes) {
    if (shape.id === exceptId || shape.kind !== 'mountain' || shape.geometry.type !== 'stamp') continue
    const dx = shape.geometry.x - point.x
    const dy = shape.geometry.y - point.y
    const distance = Math.hypot(dx, dy)
    if (distance > 0 && distance < bestDistance) {
      bestDistance = distance
      // 山段靠近时，按相邻山脊中心吸附，留出自然接缝。
      const angle = Math.atan2(dy, dx)
      best = {
        x: shape.geometry.x - Math.cos(angle) * 110,
        y: shape.geometry.y - Math.sin(angle) * 110,
      }
    }
  }
  return best
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function pointsAttr(points: MapPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function mountainSvg(shape: LocationTerrainShape): string {
  if (shape.geometry.type !== 'stamp') return ''
  const { x, y, scale, rotation } = shape.geometry
  return `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale})" class="terrain-mountain">
    <path d="M-80 24 L-38 -46 L-8 12 L18 -30 L70 30 Z" fill="#66705a" fill-opacity=".22" stroke="#9aa88c" stroke-width="2"/>
    <path d="M-38 -46 L-24 -24 L-8 12 M18 -30 L31 -10 L70 30" fill="none" stroke="#c2cbb4" stroke-opacity=".7" stroke-width="1.5"/>
    <path d="M-80 24 L70 30" stroke="#7f8a70" stroke-width="1.2" stroke-opacity=".5"/>
  </g>`
}

export function terrainShapeSvg(shape: LocationTerrainShape): string {
  if (shape.geometry.type === 'stamp') {
    if (shape.kind === 'label') {
      return `<text x="${shape.geometry.x}" y="${shape.geometry.y}" fill="#c9bda9" font-family="serif" font-size="16" text-anchor="middle">${escapeXml(shape.label || '地名')}</text>`
    }
    return shape.kind === 'mountain' ? mountainSvg(shape) : ''
  }
  if (shape.geometry.type === 'polygon') {
    const points = pointsAttr(shape.geometry.points)
    const style = shape.style ?? {}
    if (shape.kind === 'forest') {
      return `<polygon points="${points}" fill="${style.fill ?? '#6d9a6d'}" fill-opacity=".18" stroke="${style.stroke ?? '#86b08a'}" stroke-width="${style.strokeWidth ?? 2}" stroke-dasharray="5 4"/><polygon points="${points}" fill="url(#terrain-forest-pattern)" fill-opacity=".4"/>`
    }
    if (shape.kind === 'water') {
      return `<polygon points="${points}" fill="${style.fill ?? '#6e9db6'}" fill-opacity=".2" stroke="${style.stroke ?? '#8bb7cc'}" stroke-width="${style.strokeWidth ?? 2}"/><polygon points="${points}" fill="url(#terrain-water-pattern)" fill-opacity=".35"/>`
    }
    return `<polygon points="${points}" fill="${style.fill ?? '#8a7b69'}" fill-opacity="${style.opacity ?? 0.16}" stroke="${style.stroke ?? '#b09a7d'}" stroke-width="${style.strokeWidth ?? 2}"/>`
  }
  const d = shape.geometry.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
  if (shape.kind === 'road') {
    return `<path d="${d}" fill="none" stroke="${shape.style?.stroke ?? '#c49b64'}" stroke-width="${shape.style?.strokeWidth ?? 5}" stroke-linecap="round" stroke-dasharray="9 8" stroke-opacity=".75"/>`
  }
  if (shape.kind === 'river') {
    return `<path d="${d}" fill="none" stroke="${shape.style?.stroke ?? '#669ab7'}" stroke-width="${shape.style?.strokeWidth ?? 8}" stroke-linecap="round" stroke-opacity=".6"/><path d="${d}" fill="none" stroke="#b4d5e4" stroke-width="2" stroke-linecap="round" stroke-opacity=".6"/>`
  }
  if (shape.kind === 'brush') {
    return `<path d="${d}" fill="none" stroke="${shape.style?.brushColor ?? '#7f9a72'}" stroke-width="${shape.style?.strokeWidth ?? 28}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".3"/>`
  }
  return `<path d="${d}" fill="none" stroke="${shape.style?.stroke ?? '#756657'}" stroke-width="${shape.style?.strokeWidth ?? 5}" stroke-linecap="round" stroke-dasharray="3 3"/><path d="${d}" fill="none" stroke="#d3c4ad" stroke-width="1.5" stroke-linecap="round"/>`
}

export function locationMapSvg(
  map: LocationMapDocument,
  locations: LocationCard[],
  links: LocationLink[],
): string {
  const positions = new Map(
    locations.map((location) => [
      location.id,
      {
        x: typeof location.mapX === 'number' ? location.mapX : 80,
        y: typeof location.mapY === 'number' ? location.mapY : 80,
      },
    ]),
  )
  const shapes = [...map.shapes]
    .filter((shape) => layerVisible(map, shape.kind))
    .sort((a, b) => a.zIndex - b.zIndex)
    .map(terrainShapeSvg)
    .join('\n')
  const linkSvg = links
    .map((link) => {
      const from = positions.get(link.fromId)
      const to = positions.get(link.toId)
      if (!from || !to) return ''
      return `<line x1="${from.x + 86}" y1="${from.y + 42}" x2="${to.x + 86}" y2="${to.y + 42}" stroke="#806f5d" stroke-opacity=".55" stroke-width="2" stroke-dasharray="6 5"/>`
    })
    .join('\n')
  const roomSvg = locations
    .map((location) => {
      const point = positions.get(location.id) ?? { x: 80, y: 80 }
      return `<g class="terrain-room" transform="translate(${point.x} ${point.y})">
        <rect width="172" height="84" rx="8" fill="#171a1f" fill-opacity=".82" stroke="#8b7e68" stroke-width="1.5"/>
        <text x="14" y="28" fill="#d8cbb6" font-size="15" font-family="serif">${escapeXml(location.name || '未命名地点')}</text>
        <text x="14" y="50" fill="#9d9486" font-size="10">${escapeXml(location.type || '地点')}</text>
      </g>`
    })
    .join('\n')
  const background =
    map.theme === 'parchment'
      ? '#e5d8bd'
      : map.theme === 'blueprint'
        ? '#0c1b2a'
        : map.theme === 'ink'
          ? '#e9e6dc'
          : '#101216'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${map.width}" height="${map.height}" viewBox="0 0 ${map.width} ${map.height}">
  <defs>
    <pattern id="terrain-forest-pattern" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M8 22 L14 9 L20 22 Z" fill="#9dc49d" fill-opacity=".28"/>
      <path d="M14 22 L20 13 L26 22 Z" fill="#7ead82" fill-opacity=".2"/>
    </pattern>
    <pattern id="terrain-water-pattern" width="36" height="18" patternUnits="userSpaceOnUse">
      <path d="M0 9 Q9 3 18 9 T36 9" fill="none" stroke="#b6d7e5" stroke-opacity=".3" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${map.width}" height="${map.height}" fill="${background}"/>
  ${shapes}
  ${linkSvg}
  ${roomSvg}
</svg>`
}
