import { useEffect, useRef, useState } from 'react'
import type {
  LocationMapDocument,
  LocationTerrainKind,
  LocationTerrainShape,
  MapPoint,
} from '../types'
import {
  createTerrainShape,
  layerVisible,
  mountainSnapPoint,
  TERRAIN_KIND_LABELS,
} from '../locationMap'
import { useContextMenu } from './ContextMenuProvider'

export type TerrainTool = 'select' | LocationTerrainKind

interface TerrainLayerProps {
  map: LocationMapDocument
  editing: boolean
  tool: TerrainTool
  selectedId: string | null
  snapEnabled?: boolean
  onSelect: (id: string | null) => void
  onCommit: (next: LocationMapDocument) => void
}

interface DragState {
  mode: 'move' | 'node'
  shapeId: string
  startPoint: MapPoint
  nodeIndex?: number
  original: LocationTerrainShape
}

interface Draft {
  kind: LocationTerrainKind
  type: 'polygon' | 'path'
  points: MapPoint[]
}

const POLYGON_KINDS: LocationTerrainKind[] = ['forest', 'water', 'custom']

function pointsString(points: MapPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function pathString(points: MapPoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function centerOf(points: MapPoint[]): MapPoint {
  const sum = points.reduce((value, point) => ({ x: value.x + point.x, y: value.y + point.y }), {
    x: 0,
    y: 0,
  })
  return { x: sum.x / points.length, y: sum.y / points.length }
}

export function TerrainLayer({
  map,
  editing,
  tool,
  selectedId,
  snapEnabled = true,
  onSelect,
  onCommit,
}: TerrainLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [preview, setPreview] = useState<LocationMapDocument | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [brushActive, setBrushActive] = useState(false)
  const [cursor, setCursor] = useState<MapPoint | null>(null)
  const { openContextMenu } = useContextMenu()
  const active = preview ?? map
  const selected = active.shapes.find((shape) => shape.id === selectedId) ?? null

  const toMapPoint = (event: React.PointerEvent | React.MouseEvent): MapPoint => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const matrix = svg.getScreenCTM()
    if (!matrix) return { x: 0, y: 0 }
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const local = point.matrixTransform(matrix.inverse())
    return { x: local.x, y: local.y }
  }

  const snapPoint = (point: MapPoint): MapPoint => {
    if (!snapEnabled) return point
    let nearest: MapPoint | null = null
    let nearestDistance = 26
    for (const shape of active.shapes) {
      if (shape.geometry.type === 'stamp') continue
      for (const endpoint of shape.geometry.points) {
        const distance = Math.hypot(endpoint.x - point.x, endpoint.y - point.y)
        if (distance < nearestDistance) {
          nearest = endpoint
          nearestDistance = distance
        }
      }
    }
    if (nearest) return { ...nearest }
    return { x: Math.round(point.x / 20) * 20, y: Math.round(point.y / 20) * 20 }
  }

  const commit = (next: LocationMapDocument) => {
    setPreview(null)
    onCommit(next)
  }

  const finishDraft = () => {
    if (!draft || draft.points.length < 2) {
      setDraft(null)
      return
    }
    const shape = createTerrainShape(
      draft.kind,
      { type: draft.type, points: draft.points },
      active.shapes.length + 1,
      draft.kind === 'custom'
        ? { fill: '#8a7b69', stroke: '#b09a7d', strokeWidth: 2, opacity: 0.16 }
        : draft.kind === 'brush'
          ? { brushColor: '#7f9a72', strokeWidth: 28 }
          : undefined,
    )
    const next = { ...active, shapes: [...active.shapes, shape] }
    setDraft(null)
    setCursor(null)
    onSelect(shape.id)
    commit(next)
  }

  useEffect(() => {
    if (!editing) {
      setDraft(null)
      setPreview(null)
      setDrag(null)
      return
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (draft) {
          setDraft(null)
        } else {
          onSelect(null)
        }
      }
      if (event.key === 'Enter' && draft) {
        event.preventDefault()
        finishDraft()
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        const target = document.activeElement
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
        event.preventDefault()
        commit({ ...map, shapes: map.shapes.filter((shape) => shape.id !== selectedId) })
        onSelect(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [editing, draft, selectedId, map, onSelect])

  const startShapeDrag = (
    event: React.PointerEvent<SVGElement>,
    shape: LocationTerrainShape,
  ) => {
    if (!editing || tool !== 'select' || event.button !== 0) return
    event.stopPropagation()
    const point = toMapPoint(event)
    onSelect(shape.id)
    setDrag({ mode: 'move', shapeId: shape.id, startPoint: point, original: shape })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const startNodeDrag = (
    event: React.PointerEvent<SVGCircleElement>,
    shape: LocationTerrainShape,
    nodeIndex: number,
  ) => {
    if (!editing || event.button !== 0) return
    event.stopPropagation()
    const point = toMapPoint(event)
    onSelect(shape.id)
    setDrag({
      mode: 'node',
      shapeId: shape.id,
      startPoint: point,
      nodeIndex,
      original: shape,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!editing) return
    if (event.button !== 0) return
    if (tool === 'select') {
      onSelect(null)
      return
    }
    const point = toMapPoint(event)
    if (tool === 'mountain') {
      const snapped = mountainSnapPoint(point, active.shapes)
      const shape = createTerrainShape(
        'mountain',
        { type: 'stamp', x: snapped.x, y: snapped.y, scale: 1, rotation: 0 },
        active.shapes.length + 1,
      )
      const next = { ...active, shapes: [...active.shapes, shape] }
      onSelect(shape.id)
      commit(next)
      return
    }
    if (tool === 'label') {
      const label = window.prompt('地图标注文字')
      if (!label?.trim()) return
      const shape = createTerrainShape(
        'label',
        { type: 'stamp', x: point.x, y: point.y, scale: 1, rotation: 0 },
        active.shapes.length + 1,
        { fill: '#c9bda9' },
      )
      shape.label = label.trim()
      const next = { ...active, shapes: [...active.shapes, shape] }
      onSelect(shape.id)
      commit(next)
      return
    }
    if (tool === 'brush') {
      setDraft({ kind: 'brush', type: 'path', points: [point] })
      setBrushActive(true)
      setCursor(point)
      return
    }
    const clicked = snapPoint(point)
    const type = POLYGON_KINDS.includes(tool) ? 'polygon' : 'path'
    setDraft((current) => ({
      kind: tool,
      type,
      points: [...(current?.points ?? []), clicked],
    }))
    setCursor(clicked)
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!editing) return
    const point = toMapPoint(event)
    setCursor(point)
    if (brushActive) {
      setDraft((current) => {
        if (!current) return current
        const last = current.points[current.points.length - 1]
        if (last && Math.hypot(point.x - last.x, point.y - last.y) < 4) return current
        return { ...current, points: [...current.points, point] }
      })
      return
    }
    if (!drag) return
    const delta = { x: point.x - drag.startPoint.x, y: point.y - drag.startPoint.y }
    const original = drag.original
    let geometry = original.geometry
    if (geometry.type === 'stamp') {
      if (drag.mode === 'move') {
        let next = { ...geometry, x: geometry.x + delta.x, y: geometry.y + delta.y }
        if (original.kind === 'mountain') {
          const snapped = mountainSnapPoint(
            { x: next.x, y: next.y },
            active.shapes,
            original.id,
          )
          next = { ...next, x: snapped.x, y: snapped.y }
        }
        geometry = next
      }
    } else if (geometry.type === 'polygon' || geometry.type === 'path') {
      const points =
        drag.mode === 'node' && drag.nodeIndex !== undefined
          ? geometry.points.map((item, index) =>
              index === drag.nodeIndex
                ? { x: item.x + delta.x, y: item.y + delta.y }
                : item,
            )
          : geometry.points.map((item) => ({ x: item.x + delta.x, y: item.y + delta.y }))
      geometry = { ...geometry, points }
    }
    setPreview({
      ...active,
      shapes: active.shapes.map((shape) =>
        shape.id === drag.shapeId ? { ...shape, geometry } : shape,
      ),
    })
  }

  const endDrag = () => {
    if (brushActive) {
      setBrushActive(false)
      finishDraft()
      return
    }
    if (drag && preview) {
      onCommit(preview)
      setPreview(null)
    }
    setDrag(null)
  }

  const renderShape = (shape: LocationTerrainShape) => {
    if (!layerVisible(active, shape.kind)) return null
    if (shape.geometry.type === 'stamp') {
      const { x, y, scale, rotation } = shape.geometry
      return (
        <g
          key={shape.id}
          className={`terrain-shape terrain-shape-${shape.kind} ${selectedId === shape.id ? 'selected' : ''}`}
          transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}
          onPointerDown={(event) => startShapeDrag(event, shape)}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onSelect(shape.id)
            shapeContextMenuFor(shape, event)
          }}
        >
          {shape.kind === 'label' ? (
            <text x="0" y="0" textAnchor="middle" className="terrain-label terrain-label-standalone">
              {shape.label || '地名'}
            </text>
          ) : (
            <>
              <path
                d="M-80 24 L-38 -46 L-8 12 L18 -30 L70 30 Z"
                className="terrain-mountain-fill"
              />
              <path
                d="M-38 -46 L-24 -24 L-8 12 M18 -30 L31 -10 L70 30"
                className="terrain-mountain-ridge"
              />
              <path d="M-80 24 L70 30" className="terrain-mountain-base" />
            </>
          )}
          <rect
            x={shape.kind === 'label' ? -70 : -90}
            y={shape.kind === 'label' ? -26 : -60}
            width={shape.kind === 'label' ? 140 : 180}
            height={shape.kind === 'label' ? 40 : 110}
            fill="transparent"
            onPointerDown={(event) => startShapeDrag(event, shape)}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onSelect(shape.id)
              shapeContextMenuFor(shape, event)
            }}
          />
          {shape.kind !== 'label' && shape.label ? (
            <text x="0" y="52" textAnchor="middle" className="terrain-label">
              {shape.label}
            </text>
          ) : null}
        </g>
      )
    }
    if (shape.geometry.type === 'polygon') {
      const points = shape.geometry.points
      return (
        <g key={shape.id}>
          <polygon
            points={pointsString(points)}
            className={`terrain-shape terrain-area terrain-${shape.kind} ${selectedId === shape.id ? 'selected' : ''}`}
            fill={shape.kind === 'forest'
              ? 'url(#terrain-forest-pattern)'
              : shape.kind === 'water'
                ? 'url(#terrain-water-pattern)'
                : shape.style?.fill ?? 'rgba(138, 123, 105, .18)'}
            stroke={shape.style?.stroke}
            strokeWidth={shape.style?.strokeWidth}
            onPointerDown={(event) => startShapeDrag(event, shape)}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onSelect(shape.id)
              shapeContextMenuFor(shape, event)
            }}
          />
          {shape.label ? (
            <text
              x={centerOf(points).x}
              y={centerOf(points).y}
              textAnchor="middle"
              className="terrain-label"
            >
              {shape.label}
            </text>
          ) : null}
        </g>
      )
    }
    const points = shape.geometry.points
    return (
      <g key={shape.id}>
        <path
          d={pathString(points)}
          className="terrain-path-hit"
          fill="none"
          stroke="transparent"
          strokeWidth={24}
          onPointerDown={(event) => startShapeDrag(event, shape)}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onSelect(shape.id)
            shapeContextMenuFor(shape, event)
          }}
        />
        <path
          d={pathString(points)}
          className={`terrain-shape terrain-path terrain-${shape.kind} ${selectedId === shape.id ? 'selected' : ''}`}
          fill="none"
          style={
            shape.kind === 'brush'
              ? { stroke: shape.style?.brushColor ?? '#7f9a72', strokeWidth: shape.style?.strokeWidth ?? 28 }
              : undefined
          }
          onPointerDown={(event) => startShapeDrag(event, shape)}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onSelect(shape.id)
            shapeContextMenuFor(shape, event)
          }}
        />
        {shape.label ? (
          <text
            x={centerOf(points).x}
            y={centerOf(points).y}
            textAnchor="middle"
            className="terrain-label"
          >
            {shape.label}
          </text>
        ) : null}
      </g>
    )
  }

  const shapeContextMenuFor = (
    shape: LocationTerrainShape,
    event: React.MouseEvent<SVGElement>,
  ) => {
    openContextMenu(event, shapeMenu(shape))
  }

  const shapeMenu = (shape: LocationTerrainShape) => {
    const shapeName = shape.label || TERRAIN_KIND_LABELS[shape.kind]
    return [
      { type: 'label' as const, label: shapeName },
      {
        label: '重命名…',
        onSelect: () => {
          const name = window.prompt('地形名称', shape.label ?? '')
          if (name === null) return
          commit({
            ...map,
            shapes: map.shapes.map((item) =>
              item.id === shape.id ? { ...item, label: name.trim() || undefined } : item,
            ),
          })
        },
      },
      {
        label: '复制形状',
        onSelect: () => {
          const geometry =
            shape.geometry.type === 'stamp'
              ? { ...shape.geometry, x: shape.geometry.x + 32, y: shape.geometry.y + 32 }
              : {
                  ...shape.geometry,
                  points: shape.geometry.points.map((point) => ({
                    x: point.x + 32,
                    y: point.y + 32,
                  })),
                }
          const copy = createTerrainShape(shape.kind, geometry, map.shapes.length + 1)
          commit({ ...map, shapes: [...map.shapes, copy] })
          onSelect(copy.id)
        },
      },
      { type: 'separator' as const },
      {
        label: '置顶',
        onSelect: () =>
          commit({
            ...map,
            shapes: map.shapes.map((item) =>
              item.id === shape.id
                ? { ...item, zIndex: Math.max(...map.shapes.map((entry) => entry.zIndex)) + 1 }
                : item,
            ),
          }),
      },
      {
        label: '置底',
        onSelect: () =>
          commit({
            ...map,
            shapes: map.shapes.map((item) =>
              item.id === shape.id
                ? { ...item, zIndex: Math.min(...map.shapes.map((entry) => entry.zIndex)) - 1 }
                : item,
            ),
          }),
      },
      { type: 'separator' as const },
      {
        label: '删除形状…',
        danger: true,
        onSelect: () => {
          if (!window.confirm('删除这个地形形状？')) return
          commit({ ...map, shapes: map.shapes.filter((item) => item.id !== shape.id) })
          if (selectedId === shape.id) onSelect(null)
        },
      },
    ]
  }

  return (
    <svg
      ref={svgRef}
      className={`terrain-layer ${editing ? 'is-editing' : ''}`}
      width={active.width}
      height={active.height}
      viewBox={`0 0 ${active.width} ${active.height}`}
      style={{
        position: 'absolute',
        inset: 0,
        width: active.width,
        height: active.height,
        pointerEvents: editing ? 'auto' : 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={() => setCursor(null)}
      onDoubleClick={finishDraft}
    >
      <defs>
        <pattern id="terrain-forest-pattern" width="34" height="34" patternUnits="userSpaceOnUse">
          <path d="M7 28 L15 10 L23 28 Z" className="terrain-forest-tree" />
          <path d="M17 28 L24 16 L31 28 Z" className="terrain-forest-tree faint" />
        </pattern>
        <pattern id="terrain-water-pattern" width="44" height="22" patternUnits="userSpaceOnUse">
          <path d="M0 11 Q11 4 22 11 T44 11" className="terrain-water-wave" />
        </pattern>
      </defs>
      {active.shapes
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .map(renderShape)}
      {draft && draft.points.length > 0 ? (
        <g className="terrain-draft">
          {draft.type === 'polygon' ? (
            <polygon
              points={pointsString(cursor ? [...draft.points, cursor] : draft.points)}
              className="terrain-draft-shape"
            />
          ) : (
            <path
              d={pathString(cursor ? [...draft.points, cursor] : draft.points)}
              className="terrain-draft-shape"
            />
          )}
          {draft.points.map((point, index) => (
            <circle key={index} cx={point.x} cy={point.y} r={5} className="terrain-handle" />
          ))}
        </g>
      ) : null}
      {selected ? renderSelection(selected) : null}
    </svg>
  )

  function renderSelection(shape: LocationTerrainShape) {
    if (shape.geometry.type === 'stamp') {
      const { x, y, scale, rotation } = shape.geometry
      return (
        <g className="terrain-selection" transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}>
          <rect x="-90" y="-58" width="180" height="106" rx="10" className="terrain-selection-box" />
        </g>
      )
    }
    if (shape.geometry.type === 'polygon') {
      return (
        <g className="terrain-selection">
          <polygon
            points={pointsString(shape.geometry.points)}
            className="terrain-selection-box"
          />
          {shape.geometry.points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={6}
              className="terrain-handle"
              onPointerDown={(event) => startNodeDrag(event, shape, index)}
            />
          ))}
        </g>
      )
    }
    return (
      <g className="terrain-selection">
        <path d={pathString(shape.geometry.points)} className="terrain-selection-line" />
        {shape.geometry.points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={6}
            className="terrain-handle"
            onPointerDown={(event) => startNodeDrag(event, shape, index)}
          />
        ))}
      </g>
    )
  }
}
