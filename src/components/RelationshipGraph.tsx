import { useEffect, useMemo, useRef, useState } from 'react'
import type { RelationshipCard } from '../types'
import { useContextMenu, type ContextMenuEntry } from './ContextMenuProvider'
import { copyTextToClipboard } from '../clipboard'

export interface RelationshipNode {
  id: string
  name: string
  role?: string
}

interface RelationshipGraphProps {
  characters: RelationshipNode[]
  relationships: RelationshipCard[]
  nodeLabel?: string
  onDeleteRelationship?: (id: string) => void
  onToast?: (message: string) => void
}

interface Point {
  x: number
  y: number
}

interface ViewState {
  x: number
  y: number
  scale: number
}

interface DragState {
  kind: 'node' | 'pan'
  id?: string
  startX: number
  startY: number
  originX: number
  originY: number
  scale: number
  moved: boolean
}

const W = 900
const H = 560
const NODE_R = 23
const MAX_NODES = 24
const MIN_SCALE = 0.55
const MAX_SCALE = 2.4

function displayName(name: string) {
  return (name || '未命名').slice(0, 4)
}

function buildLayout(
  characters: RelationshipNode[],
  relationships: RelationshipCard[],
  selectedId: string | null,
): Record<string, Point> {
  const positions: Record<string, Point> = {}
  if (characters.length === 0) return positions

  if (selectedId) {
    const selected = characters.find((character) => character.id === selectedId)
    if (!selected) return positions
    const centerY = H * 0.38
    positions[selected.id] = { x: W / 2, y: centerY }
    const neighborIds = Array.from(
      new Set(
        relationships
          .filter(
            (relationship) =>
              relationship.fromId === selectedId || relationship.toId === selectedId,
          )
          .map((relationship) =>
            relationship.fromId === selectedId ? relationship.toId : relationship.fromId,
          ),
      ),
    ).filter((id) => id !== selectedId)
    const neighbors = neighborIds
      .map((id) => characters.find((character) => character.id === id))
      .filter((character): character is RelationshipNode => Boolean(character))
      .slice(0, 12)
    const radius = 165
    neighbors.forEach((character, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, neighbors.length) - Math.PI / 2
      positions[character.id] = {
        x: W / 2 + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius * 0.82,
      }
    })
    return positions
  }

  const nodes = characters.slice(0, MAX_NODES)
  const count = nodes.length
  const rx = count <= 8 ? 205 : count <= 16 ? 260 : 290
  const ry = count <= 8 ? 155 : count <= 16 ? 190 : 205
  nodes.forEach((character, index) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2
    positions[character.id] = {
      x: W / 2 + Math.cos(angle) * rx,
      y: H / 2 + Math.sin(angle) * ry,
    }
  })
  return positions
}

export function RelationshipGraph({
  characters,
  relationships,
  nodeLabel = '角色',
  onDeleteRelationship,
  onToast,
}: RelationshipGraphProps) {
  const { openContextMenu } = useContextMenu()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [positions, setPositions] = useState<Record<string, Point>>({})
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, scale: 1 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const characterKey = characters.map((character) => `${character.id}:${character.name}`).join('|')
  const relationshipKey = relationships
    .map((relationship) => `${relationship.id}:${relationship.fromId}:${relationship.toId}`)
    .join('|')

  useEffect(() => {
    setPositions(buildLayout(characters, relationships, selectedId))
    setView({ x: 0, y: 0, scale: 1 })
    dragRef.current = null
    setDragging(false)
    // 只在人物/关系/聚焦对象变化时重排；拖动本身不触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterKey, relationshipKey, selectedId])

  const visibleCharacters = useMemo(() => {
    if (!selectedId) return characters.slice(0, MAX_NODES)
    const neighbors = new Set<string>([selectedId])
    relationships.forEach((relationship) => {
      if (relationship.fromId === selectedId) neighbors.add(relationship.toId)
      if (relationship.toId === selectedId) neighbors.add(relationship.fromId)
    })
    const focused = characters.find((character) => character.id === selectedId)
    const related = characters.filter(
      (character) => character.id !== selectedId && neighbors.has(character.id),
    )
    return [focused, ...related].filter(
      (character): character is RelationshipNode => Boolean(character),
    ).slice(0, 13)
  }, [characters, relationships, selectedId])

  const selected = characters.find((character) => character.id === selectedId) ?? null
  const neighborCount = new Set(
    relationships
      .filter(
        (relationship) =>
          relationship.fromId === selectedId || relationship.toId === selectedId,
      )
      .map((relationship) =>
        relationship.fromId === selectedId ? relationship.toId : relationship.fromId,
      ),
  ).size

  const zoomBy = (factor: number, centerX = W / 2, centerY = H / 2) => {
    setView((prev) => {
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor))
      const ratio = nextScale / prev.scale
      return {
        scale: nextScale,
        x: centerX - (centerX - prev.x) * ratio,
        y: centerY - (centerY - prev.y) * ratio,
      }
    })
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const x = ((event.clientX - rect.left) / rect.width) * W
      const y = ((event.clientY - rect.top) / rect.height) * H
      zoomBy(event.deltaY < 0 ? 1.14 : 0.88, x, y)
    }
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleNodePointerDown = (
    event: React.PointerEvent<SVGGElement>,
    characterId: string,
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const point = positions[characterId]
    if (!point) return
    svgRef.current?.setPointerCapture(event.pointerId)
    dragRef.current = {
      kind: 'node',
      id: characterId,
      startX: event.clientX,
      startY: event.clientY,
      originX: point.x,
      originY: point.y,
      scale: view.scale,
      moved: false,
    }
    setDragging(true)
  }

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    const target = event.target as Element
    if (target !== event.currentTarget && !target.classList.contains('kg-graph-bg')) return
    svgRef.current?.setPointerCapture(event.pointerId)
    dragRef.current = {
      kind: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
      scale: view.scale,
      moved: false,
    }
    setDragging(true)
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect?.width || !rect?.height) return
    const dx = ((event.clientX - drag.startX) / rect.width) * W
    const dy = ((event.clientY - drag.startY) / rect.height) * H
    if (Math.hypot(dx, dy) > 3) drag.moved = true
    if (drag.kind === 'pan') {
      setView((prev) => ({ ...prev, x: drag.originX + dx, y: drag.originY + dy }))
      return
    }
    if (!drag.id) return
    setPositions((prev) => {
      const point = prev[drag.id!]
      if (!point) return prev
      return {
        ...prev,
        [drag.id!]: {
          x: drag.originX + dx / drag.scale,
          y: drag.originY + dy / drag.scale,
        },
      }
    })
  }

  const handlePointerUp = () => {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (!drag) return
    if (drag.kind === 'node' && !drag.moved && drag.id) {
      setSelectedId((prev) => (prev === drag.id ? null : drag.id!))
    }
    if (drag.kind === 'pan' && !drag.moved) {
      setSelectedId(null)
    }
  }

  const nodeContextMenu = (character: RelationshipNode): ContextMenuEntry[] => [
    { type: 'label', label: character.name || `未命名${nodeLabel}` },
    {
      label: `以该${nodeLabel}为中心`,
      onSelect: () => setSelectedId(character.id),
    },
    {
      label: '查看全部关系',
      onSelect: () => setSelectedId(null),
    },
    {
      label: `复制${nodeLabel}名称`,
      onSelect: () => {
        void copyTextToClipboard(character.name).then((ok) =>
          onToast?.(ok ? `已复制${nodeLabel}名称` : '复制失败'),
        )
      },
    },
  ]

  const edgeContextMenu = (relationship: RelationshipCard): ContextMenuEntry[] => {
    const from = characters.find((character) => character.id === relationship.fromId)
    const to = characters.find((character) => character.id === relationship.toId)
    return [
      {
        type: 'label',
        label: `${from?.name ?? '未知'} → ${to?.name ?? '未知'} · ${relationship.type || '关系'}`,
      },
      {
        label: '复制关系描述',
        onSelect: () => {
          const text = [
            `${from?.name ?? '未知'} → ${to?.name ?? '未知'}`,
            relationship.type,
            relationship.note,
          ]
            .filter(Boolean)
            .join('｜')
          void copyTextToClipboard(text).then((ok) =>
            onToast?.(ok ? '已复制关系描述' : '复制失败'),
          )
        },
      },
      ...(onDeleteRelationship
        ? [
            { type: 'separator' as const },
            {
              label: '删除这条关系…',
              danger: true,
              onSelect: () => {
                if (window.confirm('删除这条人物关系？')) onDeleteRelationship(relationship.id)
              },
            } satisfies ContextMenuEntry,
          ]
        : []),
    ]
  }

  return (
    <div className="kg-graph-wrap">
      <div className="kg-graph-toolbar">
        <div>
          <strong>关系网</strong>
          <span>拖动节点 · 滚轮缩放 · 点击人物聚焦</span>
        </div>
        <div className="kg-graph-zoom">
          <button type="button" onClick={() => zoomBy(0.85)} aria-label="缩小">
            −
          </button>
          <span>{Math.round(view.scale * 100)}%</span>
          <button type="button" onClick={() => zoomBy(1.18)} aria-label="放大">
            +
          </button>
          <button
            type="button"
            className="kg-graph-reset"
            onClick={() => {
              setSelectedId(null)
              setPositions(buildLayout(characters, relationships, null))
              setView({ x: 0, y: 0, scale: 1 })
            }}
          >
            重置
          </button>
        </div>
      </div>

      {selectedId ? (
        <div className="kg-graph-focus">
          <span>
            正在看：<strong>{selected?.name || '未命名'}</strong> · 直接关系 {neighborCount} 个{nodeLabel}
          </span>
          <button type="button" onClick={() => setSelectedId(null)}>
            查看全部
          </button>
        </div>
      ) : null}

      <svg
        ref={svgRef}
        className={`kg-graph ${dragging ? 'is-dragging' : ''}`}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${nodeLabel}关系网`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <rect className="kg-graph-bg" width={W} height={H} />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {relationships.map((relationship) => {
            const from = positions[relationship.fromId]
            const to = positions[relationship.toId]
            if (!from || !to) return null
            if (
              !visibleCharacters.some((character) => character.id === relationship.fromId) ||
              !visibleCharacters.some((character) => character.id === relationship.toId)
            ) {
              return null
            }
            const active =
              selectedId !== null &&
              (relationship.fromId === selectedId || relationship.toId === selectedId)
            return (
              <line
                key={relationship.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className={`kg-graph-edge ${active ? 'active' : ''}`}
                onContextMenu={(event) =>
                  openContextMenu(event, edgeContextMenu(relationship))
                }
              />
            )
          })}
          {visibleCharacters.map((character) => {
            const point = positions[character.id]
            if (!point) return null
            const active = character.id === selectedId
            const related =
              !selectedId ||
              active ||
              relationships.some(
                (relationship) =>
                  (relationship.fromId === selectedId && relationship.toId === character.id) ||
                  (relationship.toId === selectedId && relationship.fromId === character.id),
              )
            return (
              <g
                key={character.id}
                className={`kg-graph-node ${active ? 'active' : ''} ${related ? '' : 'dimmed'}`}
                transform={`translate(${point.x} ${point.y})`}
                onPointerDown={(event) => handleNodePointerDown(event, character.id)}
                onContextMenu={(event) =>
                  openContextMenu(event, nodeContextMenu(character))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedId((prev) => (prev === character.id ? null : character.id))
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`${character.name || '未命名'}，${character.role || nodeLabel}`}
              >
                <circle r={NODE_R + 5} className="kg-graph-halo" />
                <circle r={NODE_R} className="kg-graph-core" />
                <text y={3.5} textAnchor="middle" className="kg-graph-name">
                  {displayName(character.name)}
                </text>
                <text y={NODE_R + 18} textAnchor="middle" className="kg-graph-role">
                  {(character.role || nodeLabel).slice(0, 6)}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {!selectedId && characters.length > MAX_NODES ? (
        <p className="kg-graph-hint">只显示前 {MAX_NODES} 个{nodeLabel}；点击节点可查看直接关系。</p>
      ) : null}
    </div>
  )
}
