import { useEffect, useRef, useState } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  Chapter,
  LocationCard,
  LocationLink,
  LocationMapDocument,
  Work,
  WorkDetail,
} from '../types'
import { requestEntityGenerate } from '../entityFill'
import { IconPlus, IconSparkles, IconTrash } from './Icons'
import { LocationMap } from './LocationMap'
import { EntityIdeaModal } from './EntityIdeaModal'
import { useContextMenu, type ContextMenuEntry } from './ContextMenuProvider'
import type { TerrainTool } from './TerrainLayer'
import {
  locationMapSvg,
  MAP_THEMES,
  normalizeLocationMap,
  TERRAIN_PALETTE,
} from '../locationMap'
import { buildTerrainFromLocations } from '../terrainAi'
import { TerrainAiModal } from './TerrainAiModal'
import { downloadTextFile } from '../backup'
import { copyTextToClipboard } from '../clipboard'

interface LocationsPanelProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  activeChapterId: string
  api: ApiConfig
  apiReady: boolean
  onRecordUsage?: (entry: AiUsageEntry) => void
  onToast: (message: string) => void
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  focusRequest?: { id: string; requestId: number } | null
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function LocationsPanel({
  work,
  detail,
  chapters,
  activeChapterId,
  api,
  apiReady,
  onRecordUsage,
  onToast,
  onUpdateDetail,
  focusRequest,
}: LocationsPanelProps) {
  const locations = detail.locations ?? []
  const links = detail.locationLinks ?? []
  const [selectedId, setSelectedId] = useState<string | null>(locations[0]?.id ?? null)
  const selected = locations.find((location) => location.id === selectedId) ?? locations[0] ?? null
  useEffect(() => {
    if (!focusRequest?.id) return
    if (!locations.some((location) => location.id === focusRequest.id)) return
    setSelectedId(focusRequest.id)
    setView('list')
  }, [focusRequest, locations])
  const [generating, setGenerating] = useState(false)
  const [ideaOpen, setIdeaOpen] = useState(false)
  const [view, setView] = useState<'map' | 'list'>('map')
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [linkType, setLinkType] = useState('相邻')
  const [linkNote, setLinkNote] = useState('')
  const { openContextMenu } = useContextMenu()
  const [mapData, setMapData] = useState<LocationMapDocument>(() =>
    normalizeLocationMap(detail.locationMap),
  )
  const [mapEditing, setMapEditing] = useState(false)
  const [mapWide, setMapWide] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [terrainTool, setTerrainTool] = useState<TerrainTool>('select')
  const [selectedTerrainId, setSelectedTerrainId] = useState<string | null>(null)
  const [mapHistory, setMapHistory] = useState<LocationMapDocument[]>([])
  const [mapFuture, setMapFuture] = useState<LocationMapDocument[]>([])
  const [terrainAiOpen, setTerrainAiOpen] = useState(false)
  const mapInitializedRef = useRef(false)

  useEffect(() => {
    if (mapInitializedRef.current) return
    mapInitializedRef.current = true
    if (!detail.locationMap) {
      onUpdateDetail({ locationMap: mapData })
    }
  }, [detail.locationMap, mapData, onUpdateDetail])

  const commitMap = (next: LocationMapDocument) => {
    setMapHistory((previous) => [...previous.slice(-49), mapData])
    setMapFuture([])
    setMapData(next)
    onUpdateDetail({ locationMap: next })
  }

  const undoMap = () => {
    const previous = mapHistory[mapHistory.length - 1]
    if (!previous) return
    setMapHistory((history) => history.slice(0, -1))
    setMapFuture((future) => [mapData, ...future].slice(0, 50))
    setMapData(previous)
    setSelectedTerrainId(null)
    onUpdateDetail({ locationMap: previous })
  }

  const redoMap = () => {
    const next = mapFuture[0]
    if (!next) return
    setMapHistory((history) => [...history.slice(-49), mapData])
    setMapFuture((future) => future.slice(1))
    setMapData(next)
    setSelectedTerrainId(null)
    onUpdateDetail({ locationMap: next })
  }

  const selectedTerrain = mapData.shapes.find((shape) => shape.id === selectedTerrainId) ?? null

  const deleteSelectedTerrain = () => {
    if (!selectedTerrainId) return
    commitMap({
      ...mapData,
      shapes: mapData.shapes.filter((shape) => shape.id !== selectedTerrainId),
    })
    setSelectedTerrainId(null)
  }

  const scaleSelectedTerrain = (ratio: number) => {
    if (!selectedTerrain) return
    const source = selectedTerrain.geometry
    let geometry = source
    if (source.type === 'stamp') {
      geometry = { ...source, scale: Math.min(4, Math.max(0.35, source.scale * ratio)) }
    } else {
      const points = source.points
      const center = points.reduce(
        (acc, point) => ({
          x: acc.x + point.x / points.length,
          y: acc.y + point.y / points.length,
        }),
        { x: 0, y: 0 },
      )
      geometry = {
        ...source,
        points: points.map((point) => ({
          x: center.x + (point.x - center.x) * ratio,
          y: center.y + (point.y - center.y) * ratio,
        })),
      }
    }
    commitMap({
      ...mapData,
      shapes: mapData.shapes.map((shape) =>
        shape.id === selectedTerrain.id ? { ...shape, geometry } : shape,
      ),
    })
  }

  const rotateSelectedTerrain = (degrees: number) => {
    if (!selectedTerrain) return
    const source = selectedTerrain.geometry
    let geometry = source
    if (source.type === 'stamp') {
      geometry = { ...source, rotation: (source.rotation + degrees) % 360 }
    } else {
      const points = source.points
      const center = points.reduce(
        (acc, point) => ({
          x: acc.x + point.x / points.length,
          y: acc.y + point.y / points.length,
        }),
        { x: 0, y: 0 },
      )
      const radians = (degrees * Math.PI) / 180
      geometry = {
        ...source,
        points: points.map((point) => ({
          x: center.x + (point.x - center.x) * Math.cos(radians) - (point.y - center.y) * Math.sin(radians),
          y: center.y + (point.x - center.x) * Math.sin(radians) + (point.y - center.y) * Math.cos(radians),
        })),
      }
    }
    commitMap({
      ...mapData,
      shapes: mapData.shapes.map((shape) =>
        shape.id === selectedTerrain.id ? { ...shape, geometry } : shape,
      ),
    })
  }

  const toggleMapLayer = (layerId: 'terrain' | 'route' | 'loc' | 'label') => {
    commitMap({
      ...mapData,
      layers: mapData.layers.map((layer) =>
        layer.id === layerId ? { ...layer, visible: !layer.visible } : layer,
      ),
    })
  }

  const exportMap = () => {
    downloadTextFile(
      '地点地图.svg',
      locationMapSvg(mapData, locations, links),
      'image/svg+xml;charset=utf-8',
    )
    onToast('地点地图已导出 SVG')
  }

  const exportMapPng = () => {
    const svg = locationMapSvg(mapData, locations, links)
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = mapData.width * 2
        canvas.height = mapData.height * 2
        const context = canvas.getContext('2d')
        if (!context) throw new Error('无法创建画布')
        context.scale(2, 2)
        context.drawImage(image, 0, 0, mapData.width, mapData.height)
        canvas.toBlob((png) => {
          if (!png) {
            onToast('地图 PNG 导出失败')
            return
          }
          const link = document.createElement('a')
          link.href = URL.createObjectURL(png)
          link.download = '地点地图.png'
          link.click()
          URL.revokeObjectURL(link.href)
          onToast('地点地图已导出 PNG')
        }, 'image/png')
      } catch (caught) {
        onToast(caught instanceof Error ? caught.message : '地图 PNG 导出失败')
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      onToast('地图 PNG 导出失败')
    }
    image.src = url
  }

  const printMap = () => {
    const svg = locationMapSvg(mapData, locations, links)
    const win = window.open('', '_blank', 'width=1200,height=900')
    if (!win) {
      onToast('浏览器阻止了打印窗口')
      return
    }
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>地点地图</title><style>body{margin:0;padding:24px;background:#fff}svg{max-width:100%;height:auto}</style></head><body>${svg}<script>window.onload=()=>window.print()<\/script></body></html>`,
    )
    win.document.close()
    onToast('已打开打印窗口，可另存为 PDF')
  }

  const applyTerrainAi = (shapes: LocationMapDocument['shapes'], summary: string) => {
    if (shapes.length === 0) {
      onToast('没有可应用的地形')
      return
    }
    commitMap({ ...mapData, shapes: [...mapData.shapes, ...shapes] })
    onToast(`已应用地形：${summary || `${shapes.length} 个形状`}`)
  }

  const generateTerrainFromLocations = () => {
    const shapes = buildTerrainFromLocations(locations)
    if (shapes.length === 0) {
      onToast('当前地点类型还不足以生成地形，试试地点里写「山 / 林 / 湖 / 河 / 关」')
      return
    }
    commitMap({ ...mapData, shapes: [...mapData.shapes, ...shapes] })
    onToast(`已按地点列表生成 ${shapes.length} 个地形`)
    setMapEditing(true)
    setMapWide(true)
  }

  const setMapTheme = (theme: LocationMapDocument['theme']) => {
    commitMap({ ...mapData, theme })
  }

  const updateSelectedTerrainLink = (
    field: 'linkedLocationId' | 'linkedFactionId',
    value: string,
  ) => {
    if (!selectedTerrain) return
    commitMap({
      ...mapData,
      shapes: mapData.shapes.map((shape) =>
        shape.id === selectedTerrain.id
          ? { ...shape, [field]: value || undefined }
          : shape,
      ),
    })
  }

  const exportMapJson = () => {
    downloadTextFile(
      '地点地图.json',
      JSON.stringify(mapData, null, 2),
      'application/json;charset=utf-8',
    )
    onToast('地点地图 JSON 已导出')
  }

  const importMapJson = async (file: File | undefined) => {
    if (!file) return
    try {
      const raw: unknown = JSON.parse(await file.text())
      const next = normalizeLocationMap(raw)
      commitMap(next)
      setSelectedTerrainId(null)
      onToast('地点地图 JSON 已导入')
    } catch {
      onToast('地图 JSON 导入失败')
    }
  }

  const saveLocations = (next: LocationCard[]) => onUpdateDetail({ locations: next })
  const saveLinks = (next: LocationLink[]) => onUpdateDetail({ locationLinks: next })

  const updateLocation = (id: string, patch: Partial<LocationCard>) => {
    saveLocations(
      locations.map((location) => (location.id === id ? { ...location, ...patch } : location)),
    )
  }

  const addLocation = () => {
    const location: LocationCard = {
      id: createId('loc'),
      name: '',
      type: '地点',
      description: '',
      notes: '',
    }
    saveLocations([...locations, location])
    setSelectedId(location.id)
  }

  const removeLocation = (id: string) => {
    saveLocations(locations.filter((location) => location.id !== id))
    saveLinks(links.filter((link) => link.fromId !== id && link.toId !== id))
    setSelectedId(null)
  }

  const generateLocation = async (hint?: string): Promise<boolean> => {
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return false
    }
    setGenerating(true)
    try {
      const generated = await requestEntityGenerate({
        kind: 'location',
        work,
        detail,
        hint,
        api,
        onRecordUsage,
      })
      const baseName =
        typeof generated.name === 'string' && generated.name.trim()
          ? generated.name.trim()
          : '新地点'
      const existingNames = locations.map((location) => location.name)
      let name = baseName
      let suffix = 2
      while (existingNames.includes(name)) {
        name = `${baseName} ${suffix}`
        suffix += 1
      }
      const factionName =
        typeof generated.factionName === 'string' ? generated.factionName.trim() : ''
      const faction = detail.factions.find((item) => item.name === factionName)
      const location: LocationCard = {
        id: createId('loc'),
        name,
        type: typeof generated.type === 'string' && generated.type.trim() ? generated.type.trim() : '地点',
        description:
          typeof generated.description === 'string' ? generated.description.trim() : '',
        notes: typeof generated.notes === 'string' ? generated.notes.trim() : '',
        factionId: faction?.id,
      }
      saveLocations([...locations, location])
      setSelectedId(location.id)
      onToast(`AI 已生成地点：${name}`)
      return true
    } catch (caught) {
      onToast(`地点生成失败：${caught instanceof Error ? caught.message : '请稍后重试'}`)
      return false
    } finally {
      setGenerating(false)
    }
  }

  const addLink = () => {
    if (!fromId || !toId || fromId === toId) return
    saveLinks([
      ...links,
      {
        id: createId('link'),
        fromId,
        toId,
        type: linkType.trim() || '相邻',
        note: linkNote.trim() || undefined,
      },
    ])
    setLinkNote('')
  }

  const removeLink = (id: string) => {
    saveLinks(links.filter((link) => link.id !== id))
  }

  const addChildLocation = (parent: LocationCard) => {
    const location: LocationCard = {
      id: createId('loc'),
      name: '',
      type: '地点',
      parentId: parent.id,
      description: '',
      notes: '',
    }
    saveLocations([...locations, location])
    setSelectedId(location.id)
    setView('list')
    onToast(`已在「${parent.name || '未命名地点'}」下新建子地点`)
  }

  const locationContextMenu = (location: LocationCard): ContextMenuEntry[] => [
    { type: 'label', label: `${location.name || '未命名地点'}${location.type ? ` · ${location.type}` : ''}` },
    { label: '打开 / 编辑地点', onSelect: () => setSelectedId(location.id) },
    {
      label: '添加子地点',
      onSelect: () => addChildLocation(location),
    },
    {
      label: '添加地点关系…',
      onSelect: () => {
        setSelectedId(location.id)
        setFromId(location.id)
        setView('list')
      },
    },
    {
      label: '复制名称',
      onSelect: () => {
        void copyTextToClipboard(location.name).then((ok) =>
          onToast(ok ? '已复制地点名称' : '复制失败'),
        )
      },
    },
    {
      label: '复制描述',
      disabled: !location.description.trim(),
      onSelect: () => {
        void copyTextToClipboard(location.description).then((ok) =>
          onToast(ok ? '已复制地点描述' : '复制失败'),
        )
      },
    },
    { type: 'separator' },
    {
      label: '删除地点…',
      danger: true,
      onSelect: () => {
        if (window.confirm(`删除「${location.name || '未命名地点'}」？地点关系和子地点的上级关联会一并移除。`)) {
          removeLocation(location.id)
        }
      },
    },
  ]

  return (
    <div className="locations-panel">
      <div className="drawer-section-head">
        <span>地点关系</span>
        <div className="drawer-section-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setIdeaOpen(true)}
            disabled={!apiReady || generating}
            title={apiReady ? '输入你的想法，AI 分析后按想法生成地点' : '请先配置 AI'}
          >
            <IconSparkles size={14} />
            {generating ? '生成中…' : '一键生成'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addLocation}>
            <IconPlus size={14} />
            添加地点
          </button>
        </div>
      </div>
      <p className="drawer-hint">
        地点地图是房间式布局：房间代表地点，折线代表关系；拖拽房间可整理位置，滚轮缩放，拖动空白处平移。
      </p>

      <div className="location-viewbar">
        <div className="location-view-switch">
          <button
            type="button"
            className={view === 'map' ? 'active' : ''}
            onClick={() => setView('map')}
          >
            地图
          </button>
          <button
            type="button"
            className={view === 'list' ? 'active' : ''}
            onClick={() => setView('list')}
          >
            列表
          </button>
        </div>
        <span>{view === 'map' ? '点击房间选中，拖拽调整位置' : '列表模式用于快速查找和编辑'}</span>
        {view === 'map' ? (
          <button
            type="button"
            className="terrain-wide-toggle"
            onClick={() => setMapWide((current) => !current)}
          >
            {mapWide ? '显示地点栏' : '全宽地图'}
          </button>
        ) : null}
      </div>

      {view === 'map' ? (
        <div className="terrain-editor-shell">
          <div className="terrain-editor-toolbar">
            <button
              type="button"
              className={`btn btn-sm ${mapEditing ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setMapEditing((current) => !current)
                setView('map')
                setSelectedTerrainId(null)
                setMapWide(true)
              }}
            >
              {mapEditing ? '完成地形编辑' : '编辑地形'}
            </button>
            {mapEditing ? (
              <>
                <span className="terrain-toolbar-divider" />
                <button
                  type="button"
                  className={`terrain-tool ${terrainTool === 'select' ? 'active' : ''}`}
                  onClick={() => setTerrainTool('select')}
                >
                  选择
                </button>
                {TERRAIN_PALETTE.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    className={`terrain-tool ${terrainTool === item.kind ? 'active' : ''}`}
                    title={item.hint}
                    onClick={() => {
                      setTerrainTool(item.kind)
                      setView('map')
                    }}
                  >
                    {item.label}
                  </button>
                ))}
                <span className="terrain-toolbar-divider" />
                <button
                  type="button"
                  className="terrain-tool"
                  disabled={mapHistory.length === 0}
                  onClick={undoMap}
                >
                  撤销
                </button>
                <button
                  type="button"
                  className="terrain-tool"
                  disabled={mapFuture.length === 0}
                  onClick={redoMap}
                >
                  重做
                </button>
                <button
                  type="button"
                  className="terrain-tool danger"
                  disabled={!selectedTerrain}
                  onClick={deleteSelectedTerrain}
                >
                  删除
                </button>
                {selectedTerrain ? (
                  <>
                    <span className="terrain-toolbar-divider" />
                    <button
                      type="button"
                      className="terrain-tool"
                      onClick={() => scaleSelectedTerrain(1.15)}
                    >
                      放大
                    </button>
                    <button
                      type="button"
                      className="terrain-tool"
                      onClick={() => scaleSelectedTerrain(0.87)}
                    >
                      缩小
                    </button>
                    <button
                      type="button"
                      className="terrain-tool"
                      onClick={() => rotateSelectedTerrain(15)}
                    >
                      旋转
                    </button>
                  </>
                ) : null}
                <span className="terrain-toolbar-divider" />
                <select
                  className="terrain-theme-select"
                  value={mapData.theme}
                  aria-label="地图主题"
                  onChange={(event) =>
                    setMapTheme(event.target.value as LocationMapDocument['theme'])
                  }
                >
                  {MAP_THEMES.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`terrain-tool ${snapEnabled ? 'active' : ''}`}
                  onClick={() => setSnapEnabled((value) => !value)}
                >
                  吸附
                </button>
                <button type="button" className="terrain-tool" onClick={exportMap}>
                  导出 SVG
                </button>
                <button type="button" className="terrain-tool" onClick={exportMapJson}>
                  备份 JSON
                </button>
                <label className="terrain-tool terrain-import-label">
                  导入 JSON
                  <input
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={(event) => {
                      void importMapJson(event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                </label>
                <span className="terrain-toolbar-divider" />
                <button
                  type="button"
                  className="terrain-tool"
                  disabled={!apiReady || generating}
                  title={apiReady ? '根据正文和地点生成地形建议' : '请先配置 AI'}
                  onClick={() => setTerrainAiOpen(true)}
                >
                  AI 地形
                </button>
                <button
                  type="button"
                  className="terrain-tool"
                  disabled={locations.length === 0}
                  onClick={generateTerrainFromLocations}
                >
                  按地点生成
                </button>
                <button type="button" className="terrain-tool" onClick={exportMapPng}>
                  PNG
                </button>
                <button type="button" className="terrain-tool" onClick={printMap}>
                  打印 / PDF
                </button>
              </>
            ) : null}
          </div>
          {mapEditing ? (
            <>
            <div className="terrain-editor-hintbar">
              <span>
                {terrainTool === 'select'
                  ? '选择形状后可拖动、缩放、旋转；右键有更多操作'
                  : terrainTool === 'mountain'
                    ? '点击地图放置山段；山段靠近其他山段会自动吸附'
                    : terrainTool === 'brush'
                      ? '按住鼠标拖动绘制地形笔触'
                      : terrainTool === 'label'
                        ? '点击地图放置文字标注'
                        : `${TERRAIN_PALETTE.find((item) => item.kind === terrainTool)?.hint ?? ''}；逐点点击，双击 / Enter 完成`}
              </span>
              <span className="terrain-layer-toggles">
                {mapData.layers.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    className={`terrain-layer-toggle ${layer.visible ? 'active' : ''}`}
                    onClick={() => toggleMapLayer(layer.id)}
                  >
                    {layer.visible ? '●' : '○'} {layer.name}
                  </button>
                ))}
              </span>
            </div>
          {selectedTerrain ? (
            <div className="terrain-linkbar">
              <span>关联</span>
              <select
                className="input select"
                value={selectedTerrain.linkedLocationId ?? ''}
                onChange={(event) =>
                  updateSelectedTerrainLink('linkedLocationId', event.target.value)
                }
              >
                <option value="">不关联地点</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name || '未命名地点'}
                  </option>
                ))}
              </select>
              <select
                className="input select"
                value={selectedTerrain.linkedFactionId ?? ''}
                onChange={(event) =>
                  updateSelectedTerrainLink('linkedFactionId', event.target.value)
                }
              >
                <option value="">不关联势力</option>
                {detail.factions.map((faction) => (
                  <option key={faction.id} value={faction.id}>
                    {faction.name || '未命名势力'}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {locations.length === 0 && !mapEditing ? (
        <p className="drawer-empty">
          还没有地点。添加地点后，地图上会出现第一间房间；继续添加会按上级地点自动排列。
        </p>
      ) : (
        <div className={`locations-layout ${view === 'list' ? 'location-list-view' : ''} ${mapWide && view === 'map' ? 'location-map-wide' : ''}`}>
          {view === 'map' ? (
            <LocationMap
              locations={locations}
              links={links}
              factions={detail.factions}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
              onMove={(id, x, y) => updateLocation(id, { mapX: x, mapY: y })}
              onContextMenu={(event, id) => {
                const location = locations.find((item) => item.id === id)
                if (location) openContextMenu(event, locationContextMenu(location))
              }}
              onBlankContextMenu={(event) =>
                openContextMenu(event, [
                  { type: 'label', label: '地点地图' },
                  { label: '添加地点', onSelect: addLocation },
                  {
                    label: 'AI 按想法生成地点…',
                    disabled: !apiReady || generating,
                    onSelect: () => setIdeaOpen(true),
                  },
                  { type: 'separator' },
                  { label: '切换到列表视图', onSelect: () => setView('list') },
                ])
              }
              terrainMap={mapData}
              terrainEditing={mapEditing}
              terrainTool={terrainTool}
              terrainSnap={snapEnabled}
              selectedTerrainId={selectedTerrainId}
              onTerrainSelect={setSelectedTerrainId}
              onTerrainCommit={commitMap}
            />
          ) : null}

          <div className={`location-side ${view === 'list' ? 'location-side-wide' : ''}`}>
            <div className="location-list">
              {locations.map((location) => (
                <button
                  key={location.id}
                  type="button"
                  className={`location-list-row ${location.id === selected?.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(location.id)}
                  onContextMenu={(event) =>
                    openContextMenu(event, locationContextMenu(location))
                  }
                >
                  <span>{location.name || '未命名地点'}</span>
                  <small>{location.type || '类型未定'}</small>
                </button>
              ))}
            </div>

            {selected ? (
              <div className="location-editor">
                <div className="record-form-grid">
                  <label className="record-field">
                    <span>地点名</span>
                    <input
                      className="input drawer-input"
                      value={selected.name}
                      onChange={(event) => updateLocation(selected.id, { name: event.target.value })}
                    />
                  </label>
                  <label className="record-field">
                    <span>类型</span>
                    <input
                      className="input drawer-input"
                      value={selected.type}
                      onChange={(event) => updateLocation(selected.id, { type: event.target.value })}
                      placeholder="国家 / 城市 / 宗门 / 秘境"
                    />
                  </label>
                  <label className="record-field">
                    <span>上级地点</span>
                    <select
                      className="input select drawer-input"
                      value={selected.parentId ?? ''}
                      onChange={(event) =>
                        updateLocation(selected.id, { parentId: event.target.value || undefined })
                      }
                    >
                      <option value="">无</option>
                      {locations
                        .filter((location) => location.id !== selected.id)
                        .map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name || '未命名'}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="record-field">
                    <span>所属势力</span>
                    <select
                      className="input select drawer-input"
                      value={selected.factionId ?? ''}
                      onChange={(event) =>
                        updateLocation(selected.id, { factionId: event.target.value || undefined })
                      }
                    >
                      <option value="">无</option>
                      {detail.factions.map((faction) => (
                        <option key={faction.id} value={faction.id}>
                          {faction.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="record-field record-field-wide">
                    <span>描述</span>
                    <textarea
                      className="input drawer-textarea"
                      rows={3}
                      value={selected.description}
                      onChange={(event) =>
                        updateLocation(selected.id, { description: event.target.value })
                      }
                    />
                  </label>
                  <label className="record-field record-field-wide">
                    <span>备注 / 交通 / 禁忌</span>
                    <textarea
                      className="input drawer-textarea"
                      rows={2}
                      value={selected.notes ?? ''}
                      onChange={(event) =>
                        updateLocation(selected.id, { notes: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="record-modal-actions">
                  <button
                    type="button"
                    className="btn btn-danger-ghost btn-sm"
                    onClick={() => removeLocation(selected.id)}
                  >
                    <IconTrash size={14} />
                    删除地点
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="location-links">
        <div className="drawer-section-head">
          <span>地点关系</span>
          <strong>{links.length}</strong>
        </div>
        <div className="location-link-form">
          <select
            className="input select drawer-input"
            value={fromId}
            onChange={(event) => setFromId(event.target.value)}
          >
            <option value="">起点</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name || '未命名'}
              </option>
            ))}
          </select>
          <select
            className="input select drawer-input"
            value={toId}
            onChange={(event) => setToId(event.target.value)}
          >
            <option value="">终点</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name || '未命名'}
              </option>
            ))}
          </select>
          <input
            className="input drawer-input"
            value={linkType}
            onChange={(event) => setLinkType(event.target.value)}
            placeholder="关系：相邻 / 通往 / 敌对"
          />
          <input
            className="input drawer-input"
            value={linkNote}
            onChange={(event) => setLinkNote(event.target.value)}
            placeholder="备注（可选）"
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!fromId || !toId || fromId === toId}
            onClick={addLink}
          >
            <IconPlus size={14} />
            添加关系
          </button>
        </div>
        {links.length === 0 ? (
          <p className="drawer-empty">还没有地点关系。</p>
        ) : (
          <div className="location-link-list">
            {links.map((link) => (
              <div className="location-link-row" key={link.id}>
                <span>{locations.find((location) => location.id === link.fromId)?.name || '起点'}</span>
                <small>{link.type}</small>
                <span>{locations.find((location) => location.id === link.toId)?.name || '终点'}</span>
                {link.note ? <em>{link.note}</em> : null}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="删除地点关系"
                  onClick={() => removeLink(link.id)}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {ideaOpen ? (
        <EntityIdeaModal
          kind="location"
          work={work}
          detail={detail}
          api={api}
          apiReady={apiReady}
          onRecordUsage={onRecordUsage}
          onGenerate={generateLocation}
          onToast={onToast}
          onClose={() => setIdeaOpen(false)}
        />
      ) : null}

      {terrainAiOpen ? (
        <TerrainAiModal
          work={work}
          detail={detail}
          chapters={chapters}
          activeChapterId={activeChapterId}
          api={api}
          apiReady={apiReady}
          onRecordUsage={onRecordUsage}
          onApply={applyTerrainAi}
          onToast={onToast}
          onClose={() => setTerrainAiOpen(false)}
        />
      ) : null}
    </div>
  )
}
