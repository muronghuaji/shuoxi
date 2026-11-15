import { useEffect, useMemo, useRef, useState } from 'react'
import type { FactionCard, LocationCard, LocationLink, LocationMapDocument } from '../types'
import { mapBounds } from '../locationMap'
import { TerrainLayer, type TerrainTool } from './TerrainLayer'

interface LocationMapProps {
  locations: LocationCard[]
  links: LocationLink[]
  factions: FactionCard[]
  selectedId: string | null
  onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>, id: string) => void
  onBlankContextMenu?: (event: React.MouseEvent<HTMLElement>) => void
  terrainMap?: LocationMapDocument
  terrainEditing?: boolean
  terrainTool?: TerrainTool
  terrainSnap?: boolean
  selectedTerrainId?: string | null
  onTerrainCommit?: (next: LocationMapDocument) => void
  onTerrainSelect?: (id: string | null) => void
}

const ROOM_W = 172
const ROOM_H = 84
const GAP_X = 48
const GAP_Y = 52
const MAX_ROW_WIDTH = 980

interface Point {
  x: number
  y: number
}

function autoLayout(locations: LocationCard[]): Record<string, Point> {
  const byId = new Map(locations.map((location) => [location.id, location]))
  const children = new Map<string, LocationCard[]>()
  const roots: LocationCard[] = []
  for (const location of locations) {
    if (location.parentId && byId.has(location.parentId)) {
      const list = children.get(location.parentId) ?? []
      list.push(location)
      children.set(location.parentId, list)
    } else {
      roots.push(location)
    }
  }

  const positions: Record<string, Point> = {}
  let cursorX = 60
  let cursorY = 60
  let rowHeight = ROOM_H

  for (const root of roots) {
    const members: LocationCard[] = [root]
    const walk = (parentId: string) => {
      for (const child of children.get(parentId) ?? []) {
        members.push(child)
        walk(child.id)
      }
    }
    walk(root.id)
    const childCount = members.length - 1
    const cols = Math.min(3, Math.max(1, childCount))
    const rows = Math.max(1, Math.ceil(childCount / cols))
    const width = Math.max(ROOM_W, cols * ROOM_W + (cols - 1) * GAP_X)
    const height = ROOM_H + (childCount > 0 ? GAP_Y + rows * ROOM_H + (rows - 1) * GAP_Y : 0)

    if (cursorX + width > MAX_ROW_WIDTH && cursorX > 60) {
      cursorX = 60
      cursorY += rowHeight + GAP_Y * 1.6
      rowHeight = 0
    }

    positions[root.id] = { x: cursorX + (width - ROOM_W) / 2, y: cursorY }
    members.slice(1).forEach((location, index) => {
      positions[location.id] = {
        x: cursorX + (index % cols) * (ROOM_W + GAP_X),
        y: cursorY + ROOM_H + GAP_Y + Math.floor(index / cols) * (ROOM_H + GAP_Y),
      }
    })
    cursorX += width + GAP_X * 2
    rowHeight = Math.max(rowHeight, height)
  }

  return positions
}

function typeMeta(type: string): { glyph: string; tone: string } {
  if (/宗|门|派|殿/.test(type)) return { glyph: '宗', tone: 'sect' }
  if (/国|朝|邦/.test(type)) return { glyph: '国', tone: 'nation' }
  if (/城|镇|村|街|市/.test(type)) return { glyph: '城', tone: 'city' }
  if (/秘境|禁地|遗迹|洞|墓|遗址/.test(type)) return { glyph: '境', tone: 'secret' }
  if (/山|峰|谷|林|海|湖|河|原/.test(type)) return { glyph: '山', tone: 'nature' }
  if (/渡|关|港|路|桥|驿/.test(type)) return { glyph: '渡', tone: 'route' }
  return { glyph: '点', tone: 'other' }
}

function linkPath(from: Point, to: Point): string {
  const ax = from.x + (to.x >= from.x ? ROOM_W : 0)
  const ay = from.y + ROOM_H / 2
  const bx = to.x + (to.x >= from.x ? 0 : ROOM_W)
  const by = to.y + ROOM_H / 2
  if (Math.abs(bx - ax) < 26) {
    const sx = from.x + ROOM_W / 2
    const sy = from.y + (to.y >= from.y ? ROOM_H : 0)
    const ex = to.x + ROOM_W / 2
    const ey = to.y + (to.y >= from.y ? 0 : ROOM_H)
    const midY = (sy + ey) / 2
    return `M ${sx} ${sy} V ${midY} H ${ex} V ${ey}`
  }
  const midX = (ax + bx) / 2
  return `M ${ax} ${ay} H ${midX} V ${by} H ${bx}`
}

export function LocationMap({
  locations,
  links,
  factions,
  selectedId,
  onSelect,
  onMove,
  onContextMenu,
  onBlankContextMenu,
  terrainMap,
  terrainEditing = false,
  terrainTool = 'select',
  terrainSnap = true,
  selectedTerrainId = null,
  onTerrainCommit,
  onTerrainSelect,
}: LocationMapProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [dragged, setDragged] = useState<Record<string, Point>>({})
  const dragRef = useRef<{
    id: string
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  )

  const autoPositions = useMemo(() => autoLayout(locations), [locations])
  const positions = useMemo(() => {
    const next: Record<string, Point> = { ...autoPositions }
    for (const location of locations) {
      if (typeof location.mapX === 'number' && typeof location.mapY === 'number') {
        next[location.id] = { x: location.mapX, y: location.mapY }
      }
    }
    for (const [id, point] of Object.entries(dragged)) {
      next[id] = point
    }
    return next
  }, [autoPositions, locations, dragged])

  const factionNames = useMemo(
    () => new Map(factions.map((faction) => [faction.id, faction.name])),
    [factions],
  )
  const childCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const location of locations) {
      if (location.parentId) {
        counts.set(location.parentId, (counts.get(location.parentId) ?? 0) + 1)
      }
    }
    return counts
  }, [locations])

  const world = useMemo(() => {
    let maxX = 900
    let maxY = 560
    for (const location of locations) {
      const point = positions[location.id]
      if (!point) continue
      maxX = Math.max(maxX, point.x + ROOM_W + 120)
      maxY = Math.max(maxY, point.y + ROOM_H + 120)
    }
    if (terrainMap) {
      const bounds = mapBounds(terrainMap)
      maxX = Math.max(maxX, bounds.width)
      maxY = Math.max(maxY, bounds.height)
    }
    return { width: maxX, height: maxY }
  }, [locations, positions, terrainMap])

  const fitView = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const fit = Math.min(1, (rect.width - 48) / world.width, (rect.height - 48) / world.height)
    const nextZoom = Math.max(0.32, fit)
    setZoom(nextZoom)
    setPan({
      x: (rect.width - world.width * nextZoom) / 2,
      y: (rect.height - world.height * nextZoom) / 2,
    })
  }

  useEffect(() => {
    fitView()
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(() => fitView())
    observer.observe(viewport)
    return () => observer.disconnect()
    // world 改变时重新适配；抽屉展开 / 窗口缩放由 ResizeObserver 处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      const pointX = event.clientX - rect.left
      const pointY = event.clientY - rect.top
      setZoom((currentZoom) => {
        const nextZoom = Math.min(1.8, Math.max(0.48, currentZoom * (event.deltaY > 0 ? 0.9 : 1.1)))
        setPan((currentPan) => ({
          x: pointX - (pointX - currentPan.x) * (nextZoom / currentZoom),
          y: pointY - (pointY - currentPan.y) * (nextZoom / currentZoom),
        }))
        return nextZoom
      })
    }
    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [])

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('.location-room') || target.closest('.terrain-layer')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    }
  }

  const onCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const panState = panRef.current
    if (!panState) return
    setPan({
      x: panState.originX + (event.clientX - panState.startX),
      y: panState.originY + (event.clientY - panState.startY),
    })
  }

  const endCanvasDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current) {
      panRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    }
  }

  const onRoomPointerDown = (event: React.PointerEvent<HTMLButtonElement>, location: LocationCard) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onSelect(location.id)
    const point = positions[location.id]
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      id: location.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: point.x,
      originY: point.y,
    }
  }

  const onRoomPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag) return
    setDragged((previous) => ({
      ...previous,
      [drag.id]: {
        x: drag.originX + (event.clientX - drag.startX) / zoom,
        y: drag.originY + (event.clientY - drag.startY) / zoom,
      },
    }))
  }

  const onRoomPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const point = {
      x: Math.max(20, Math.round(drag.originX + (event.clientX - drag.startX) / zoom)),
      y: Math.max(20, Math.round(drag.originY + (event.clientY - drag.startY) / zoom)),
    }
    onMove(drag.id, point.x, point.y)
    setDragged((previous) => {
      const next = { ...previous }
      delete next[drag.id]
      return next
    })
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const zoomBy = (delta: number) => {
    setZoom((current) => Math.min(1.8, Math.max(0.48, Math.round((current + delta) * 100) / 100)))
  }

  const resetView = () => {
    fitView()
  }

  return (
    <div className="location-map">
      <div className="location-map-toolbar">
        <span>拖拽房间调整位置 · 滚轮缩放 · 拖动空白处平移</span>
        <div className="location-map-zoom">
          <button type="button" onClick={() => zoomBy(-0.1)} aria-label="缩小">
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => zoomBy(0.1)} aria-label="放大">
            +
          </button>
          <button type="button" className="location-map-reset" onClick={resetView}>
            复位
          </button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className={`location-map-viewport terrain-theme-${terrainMap?.theme ?? 'dark'}`}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={endCanvasDrag}
        onPointerCancel={endCanvasDrag}
        onContextMenu={(event) => {
          if ((event.target as Element).closest('.location-room')) return
          if ((event.target as Element).closest('.terrain-layer')) return
          onBlankContextMenu?.(event)
        }}
      >
        <div
          className={`location-map-world ${terrainEditing ? 'is-terrain-editing' : ''} ${
            terrainMap?.layers.find((layer) => layer.id === 'loc')?.visible === false
              ? 'locations-hidden'
              : ''
          } terrain-theme-${terrainMap?.theme ?? 'dark'}`}
          style={{
            width: world.width,
            height: world.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {terrainMap && onTerrainCommit && onTerrainSelect ? (
            <TerrainLayer
              map={terrainMap}
              editing={terrainEditing}
              tool={terrainTool}
              snapEnabled={terrainSnap}
              selectedId={selectedTerrainId}
              onSelect={onTerrainSelect}
              onCommit={onTerrainCommit}
            />
          ) : null}
          <svg className="location-map-links" width={world.width} height={world.height}>
            {links.map((link) => {
              const from = positions[link.fromId]
              const to = positions[link.toId]
              if (!from || !to) return null
              const active = selectedId === link.fromId || selectedId === link.toId
              const middle = {
                x: (from.x + to.x) / 2 + ROOM_W / 2,
                y: (from.y + to.y) / 2 + ROOM_H / 2,
              }
              return (
                <g key={link.id}>
                  <path
                    className={`location-map-link ${active ? 'active' : ''}`}
                    d={linkPath(from, to)}
                  />
                  {active ? (
                    <text
                      className="location-map-link-label"
                      x={middle.x}
                      y={middle.y - 5}
                      textAnchor="middle"
                    >
                      {link.type}
                    </text>
                  ) : null}
                </g>
              )
            })}
          </svg>

          {locations.map((location) => {
            const point = positions[location.id]
            if (!point) return null
            const meta = typeMeta(location.type)
            const active = location.id === selectedId
            const factionName = location.factionId ? factionNames.get(location.factionId) : ''
            const children = childCounts.get(location.id) ?? 0
            return (
              <button
                key={location.id}
                type="button"
                className={`location-room location-room-${meta.tone} ${active ? 'active' : ''}`}
                style={{ left: point.x, top: point.y, width: ROOM_W, height: ROOM_H }}
                onPointerDown={(event) => onRoomPointerDown(event, location)}
                onContextMenu={(event) => onContextMenu?.(event, location.id)}
                onPointerMove={onRoomPointerMove}
                onPointerUp={onRoomPointerUp}
                onPointerCancel={onRoomPointerUp}
                title={`${location.name || '未命名地点'} · ${location.type || '类型未定'}`}
              >
                <span className="location-room-glyph">{meta.glyph}</span>
                <span className="location-room-body">
                  <strong>{location.name || '未命名地点'}</strong>
                  <small>{location.type || '类型未定'}{factionName ? ` · ${factionName}` : ''}</small>
                  {children > 0 ? <em>{children} 个子地点</em> : null}
                </span>
                <span className="location-room-door" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
