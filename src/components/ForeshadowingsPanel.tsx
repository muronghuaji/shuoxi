import { useState, type CSSProperties } from 'react'
import type {
  Chapter,
  ForeshadowingCard,
  ForeshadowingImportance,
  ForeshadowingStatus,
  ForeshadowingType,
  WorkDetail,
} from '../types'
import { IconPlus, IconTrash } from './Icons'
import { useContextMenu, type ContextMenuEntry } from './ContextMenuProvider'
import { copyTextToClipboard } from '../clipboard'

const FORESHADOW_TYPES: ForeshadowingType[] = ['人物', '物品', '秘密', '事件', '关系', '世界观']
const FORESHADOW_IMPORTANCES: ForeshadowingImportance[] = ['主线', '支线', '氛围']
const STALE_CHAPTERS = 5

type ViewMode = 'list' | 'timeline'
type FilterMode = 'all' | 'open' | 'done' | 'overdue' | 'stale'

interface ForeshadowingsPanelProps {
  detail: WorkDetail
  chapters: Chapter[]
  activeChapterId: string
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onSelectChapter: (chapterId: string) => void
  onToast?: (message: string) => void
}

interface ForeshadowMeta {
  plantedIndex: number
  payoffIndex: number
  lastMentionIndex: number | null
  dueNow: boolean
  overdue: boolean
  stale: boolean
  open: boolean
}

function chapterIndexByRef(
  chapters: Chapter[],
  chapterId: string | undefined,
  fallbackLabel: string,
): number {
  if (chapterId) {
    const index = chapters.findIndex((chapter) => chapter.id === chapterId)
    if (index >= 0) return index
  }
  const match = fallbackLabel.match(/第\s*(\d+)\s*章/)
  if (match) {
    const index = Number(match[1]) - 1
    if (index >= 0 && index < chapters.length) return index
  }
  return -1
}

function chapterShortLabel(chapters: Chapter[], index: number): string {
  const chapter = chapters[index]
  if (!chapter) return '未指定'
  return `第 ${index + 1} 章${chapter.title ? ` · ${chapter.title}` : ''}`
}

function relatedPicker(
  label: string,
  options: { id: string; name: string }[],
  selectedIds: string[],
  onChange: (ids: string[]) => void,
) {
  if (options.length === 0) return null
  const selected = options.filter((option) => selectedIds.includes(option.id))
  return (
    <div className="foreshadow-related-row">
      <span>{label}</span>
      <div className="foreshadow-related-values">
        {selected.map((option) => (
          <button
            type="button"
            className="foreshadow-related-chip"
            key={option.id}
            onClick={() => onChange(selectedIds.filter((id) => id !== option.id))}
            title="移除关联"
          >
            {option.name || '未命名'} ×
          </button>
        ))}
        <select
          className="input select foreshadow-related-add"
          value=""
          aria-label={`关联${label}`}
          onChange={(event) => {
            const value = event.target.value
            if (value && !selectedIds.includes(value)) onChange([...selectedIds, value])
          }}
        >
          <option value="">+ 关联{label}</option>
          {options
            .filter((option) => !selectedIds.includes(option.id))
            .map((option) => (
              <option value={option.id} key={option.id}>
                {option.name || '未命名'}
              </option>
            ))}
        </select>
      </div>
    </div>
  )
}

export function ForeshadowingsPanel({
  detail,
  chapters,
  activeChapterId,
  onUpdateDetail,
  onSelectChapter,
  onToast,
}: ForeshadowingsPanelProps) {
  const [view, setView] = useState<ViewMode>('list')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { openContextMenu } = useContextMenu()

  const activeIndex = Math.max(
    0,
    chapters.findIndex((chapter) => chapter.id === activeChapterId),
  )

  const metas = new Map<string, ForeshadowMeta>()
  for (const item of detail.foreshadowings) {
    const plantedIndex = Math.max(
      0,
      chapterIndexByRef(chapters, item.plantedChapterId, item.plantedIn),
    )
    const payoffIndex = chapterIndexByRef(chapters, item.payoffChapterId, '')
    const open = item.status === '未回收'
    let lastMentionIndex: number | null = null
    const title = item.title.trim()
    if (title) {
      chapters.forEach((chapter, index) => {
        if (index >= plantedIndex && chapter.content.includes(title)) {
          lastMentionIndex = index
        }
      })
    }
    const baseline = lastMentionIndex ?? plantedIndex
    metas.set(item.id, {
      plantedIndex,
      payoffIndex,
      lastMentionIndex,
      open,
      dueNow: open && payoffIndex >= 0 && payoffIndex === activeIndex,
      overdue: open && payoffIndex >= 0 && payoffIndex < activeIndex,
      stale: open && activeIndex - baseline >= STALE_CHAPTERS,
    })
  }

  const openCount = detail.foreshadowings.filter((item) => item.status === '未回收').length
  const completedCount = detail.foreshadowings.length - openCount
  const overdueCount = detail.foreshadowings.filter((item) => metas.get(item.id)?.overdue).length
  const staleCount = detail.foreshadowings.filter((item) => metas.get(item.id)?.stale).length
  const dueCount = detail.foreshadowings.filter((item) => metas.get(item.id)?.dueNow).length
  const completionRate =
    detail.foreshadowings.length > 0
      ? Math.round((completedCount / detail.foreshadowings.length) * 100)
      : 0

  const updateItem = (id: string, patch: Partial<ForeshadowingCard>) => {
    onUpdateDetail({
      foreshadowings: detail.foreshadowings.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })
  }

  const addItem = () => {
    const chapterId = activeChapterId || chapters[0]?.id
    const plantedIndex = chapters.findIndex((chapter) => chapter.id === chapterId)
    const id = `fs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const next: ForeshadowingCard = {
      id,
      title: '',
      status: '未回收',
      plantedIn: plantedIndex >= 0 ? chapterShortLabel(chapters, plantedIndex) : '',
      note: '',
      type: '秘密',
      importance: '支线',
      plantedChapterId: chapterId || undefined,
      clues: [],
      truth: '',
      relatedCharacterIds: [],
      relatedFactionIds: [],
      relatedItemIds: [],
      relatedLocationIds: [],
    }
    onUpdateDetail({ foreshadowings: [...detail.foreshadowings, next] })
    setExpandedId(id)
  }

  const removeItem = (id: string) => {
    onUpdateDetail({
      foreshadowings: detail.foreshadowings.filter((item) => item.id !== id),
    })
    if (expandedId === id) setExpandedId(null)
  }

  const setPlantedChapter = (item: ForeshadowingCard, chapterId: string) => {
    const index = chapters.findIndex((chapter) => chapter.id === chapterId)
    updateItem(item.id, {
      plantedChapterId: chapterId || undefined,
      plantedIn: index >= 0 ? chapterShortLabel(chapters, index) : item.plantedIn,
    })
  }

  const filteredItems = detail.foreshadowings.filter((item) => {
    const meta = metas.get(item.id)
    if (filter === 'open') return item.status === '未回收'
    if (filter === 'done') return item.status === '已回收'
    if (filter === 'overdue') return Boolean(meta?.overdue)
    if (filter === 'stale') return Boolean(meta?.stale)
    return true
  })

  const sortedItems = [...filteredItems].sort((a, b) => {
    const metaA = metas.get(a.id)
    const metaB = metas.get(b.id)
    const score = (meta: ForeshadowMeta | undefined) =>
      meta?.overdue ? 0 : meta?.dueNow ? 1 : meta?.stale ? 2 : meta?.open ? 3 : 4
    return score(metaA) - score(metaB)
  })

  const characterOptions = detail.characters.map((character) => ({
    id: character.id,
    name: character.name,
  }))
  const factionOptions = detail.factions.map((faction) => ({ id: faction.id, name: faction.name }))
  const itemOptions = (detail.items ?? []).map((item) => ({ id: item.id, name: item.name }))
  const locationOptions = (detail.locations ?? []).map((location) => ({
    id: location.id,
    name: location.name,
  }))

  const renderBadges = (item: ForeshadowingCard) => {
    const meta = metas.get(item.id)
    if (!meta) return null
    return (
      <>
        {meta.overdue ? <span className="foreshadow-flag overdue">已逾期</span> : null}
        {meta.dueNow ? <span className="foreshadow-flag due">本章应回收</span> : null}
        {meta.stale ? <span className="foreshadow-flag stale">久未提及</span> : null}
      </>
    )
  }

  const renderEntry = (item: ForeshadowingCard) => {
    const meta = metas.get(item.id)
    const expanded = expandedId === item.id
    if (!meta) return null
    return (
      <article
        className={`foreshadow-entry type-${item.type ?? '秘密'} ${meta.overdue ? 'is-overdue' : ''} ${item.status === '已回收' ? 'is-done' : ''}`}
        key={item.id}
        onContextMenu={(event) =>
          openContextMenu(event, [
            { type: 'label', label: item.title || '未命名伏笔' },
            {
              label: '复制伏笔内容',
              onSelect: () => {
                void copyTextToClipboard(
                  [item.title, item.note, item.truth].filter(Boolean).join('\n'),
                ).then((ok) => onToast?.(ok ? '已复制伏笔内容' : '复制失败'))
              },
            },
            {
              label: item.status === '已回收' ? '标记为未回收' : '标记为已回收',
              onSelect: () =>
                updateItem(item.id, {
                  status: item.status === '已回收' ? '未回收' : '已回收',
                }),
            },
            ...(item.plantedChapterId
              ? [
                  {
                    label: '跳到埋设章节',
                    onSelect: () => onSelectChapter(item.plantedChapterId!),
                  } satisfies ContextMenuEntry,
                ]
              : []),
            { type: 'separator' },
            {
              label: '删除伏笔…',
              danger: true,
              onSelect: () => {
                if (window.confirm(`删除伏笔「${item.title || '未命名伏笔'}」？`)) {
                  removeItem(item.id)
                }
              },
            },
          ])
        }
      >
        <div className="foreshadow-entry-head">
          <input
            className="input drawer-input foreshadow-title"
            value={item.title}
            onChange={(event) => updateItem(item.id, { title: event.target.value })}
            placeholder="伏笔名称"
            aria-label="伏笔名称"
          />
          <div className="foreshadow-entry-actions">
            {renderBadges(item)}
            <select
              className="input select foreshadow-status"
              value={item.status}
              onChange={(event) =>
                updateItem(item.id, { status: event.target.value as ForeshadowingStatus })
              }
              aria-label={`${item.title || '未命名伏笔'}的状态`}
            >
              <option value="未回收">未回收</option>
              <option value="已回收">已回收</option>
            </select>
            <button
              type="button"
              className="icon-btn"
              title="删除伏笔"
              aria-label="删除伏笔"
              onClick={() => removeItem(item.id)}
            >
              <IconTrash size={14} />
            </button>
          </div>
        </div>

        <div className="foreshadow-entry-tags">
          <div className="foreshadow-tag-selects">
            <select
              className={`input select foreshadow-type type-${item.type ?? '秘密'}`}
              value={item.type ?? '秘密'}
              onChange={(event) =>
                updateItem(item.id, { type: event.target.value as ForeshadowingType })
              }
              aria-label="伏笔类型"
            >
              {FORESHADOW_TYPES.map((type) => (
                <option value={type} key={type}>
                  {type}
                </option>
              ))}
            </select>
            <select
              className={`input select foreshadow-importance importance-${item.importance ?? '支线'}`}
              value={item.importance ?? '支线'}
              onChange={(event) =>
                updateItem(item.id, { importance: event.target.value as ForeshadowingImportance })
              }
              aria-label="伏笔重要度"
            >
              {FORESHADOW_IMPORTANCES.map((importance) => (
                <option value={importance} key={importance}>
                  {importance}
                </option>
              ))}
            </select>
          </div>
          <span className="foreshadow-mention">
            {meta.lastMentionIndex !== null
              ? `最近提及：第 ${meta.lastMentionIndex + 1} 章`
              : '埋设后未再提及'}
          </span>
        </div>

        <div className="foreshadow-chapters">
          <label>
            <span>埋设章节</span>
            <select
              className="input select"
              value={item.plantedChapterId ?? ''}
              onChange={(event) => setPlantedChapter(item, event.target.value)}
            >
              <option value="">未指定</option>
              {chapters.map((chapter, index) => (
                <option value={chapter.id} key={chapter.id}>
                  第 {index + 1} 章{chapter.title ? ` · ${chapter.title}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>计划回收章节</span>
            <select
              className="input select"
              value={item.payoffChapterId ?? ''}
              onChange={(event) =>
                updateItem(item.id, { payoffChapterId: event.target.value || undefined })
              }
            >
              <option value="">未设置</option>
              {chapters.map((chapter, index) => (
                <option value={chapter.id} key={chapter.id}>
                  第 {index + 1} 章{chapter.title ? ` · ${chapter.title}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="foreshadow-entry-note">
          {item.note || item.truth || '还没有写回收计划或备注。'}
        </p>

        {expanded ? (
          <div className="foreshadow-entry-details">
            <label className="foreshadow-field">
              <span>线索（每行一条）</span>
              <textarea
                className="input drawer-textarea"
                rows={3}
                value={(item.clues ?? []).join('\n')}
                onChange={(event) =>
                  updateItem(item.id, {
                    clues: event.target.value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="已埋下的提示、物件、对话或误导"
              />
            </label>
            <label className="foreshadow-field">
              <span>真相 / 回收答案</span>
              <textarea
                className="input drawer-textarea"
                rows={2}
                value={item.truth ?? ''}
                onChange={(event) => updateItem(item.id, { truth: event.target.value })}
                placeholder="读者最后会知道的真相"
              />
            </label>
            <label className="foreshadow-field">
              <span>备注 / 回收方式</span>
              <textarea
                className="input drawer-textarea"
                rows={2}
                value={item.note}
                onChange={(event) => updateItem(item.id, { note: event.target.value })}
                placeholder="计划怎么回收，或者为什么暂时搁置"
              />
            </label>
            <div className="foreshadow-related">
              <span className="foreshadow-related-label">关联实体</span>
              {relatedPicker(
                '角色',
                characterOptions,
                item.relatedCharacterIds ?? [],
                (ids) => updateItem(item.id, { relatedCharacterIds: ids }),
              )}
              {relatedPicker(
                '势力',
                factionOptions,
                item.relatedFactionIds ?? [],
                (ids) => updateItem(item.id, { relatedFactionIds: ids }),
              )}
              {relatedPicker(
                '物品',
                itemOptions,
                item.relatedItemIds ?? [],
                (ids) => updateItem(item.id, { relatedItemIds: ids }),
              )}
              {relatedPicker(
                '地点',
                locationOptions,
                item.relatedLocationIds ?? [],
                (ids) => updateItem(item.id, { relatedLocationIds: ids }),
              )}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className="foreshadow-expand"
          onClick={() => setExpandedId(expanded ? null : item.id)}
        >
          {expanded ? '收起线索 / 关联' : '展开线索 / 关联'}
        </button>
      </article>
    )
  }

  const trackMinWidth = Math.max(380, chapters.length * 44)

  const renderTimeline = () => {
    if (chapters.length === 0) {
      return <p className="drawer-empty">还没有章节，伏笔时间轴需要至少一章。</p>
    }
    return (
      <div className="foreshadow-timeline">
        <div className="foreshadow-timeline-scroll">
          <div className="foreshadow-timeline-header">
            <span>伏笔</span>
            <div
              className="foreshadow-timeline-chapters"
              style={{
                gridTemplateColumns: `repeat(${chapters.length}, minmax(0, 1fr))`,
                minWidth: trackMinWidth,
              }}
            >
              {chapters.map((chapter, index) => (
                <button
                  type="button"
                  key={chapter.id}
                  className={`foreshadow-timeline-chapter ${index === activeIndex ? 'active' : ''}`}
                  onClick={() => onSelectChapter(chapter.id)}
                  title={chapter.title}
                >
                  第 {index + 1} 章
                </button>
              ))}
            </div>
          </div>
          <div className="foreshadow-timeline-rows">
            {sortedItems.map((item) => {
              const meta = metas.get(item.id)
              if (!meta) return null
              const start = meta.plantedIndex
              const end = meta.payoffIndex >= 0 ? meta.payoffIndex : activeIndex
              const startPct = ((start + 0.5) / chapters.length) * 100
              const endPct = ((Math.max(start, end) + 0.5) / chapters.length) * 100
              return (
                <div
                  className={`foreshadow-timeline-row ${meta.overdue ? 'overdue' : ''} ${meta.stale ? 'stale' : ''}`}
                  key={item.id}
                >
                  <button
                    type="button"
                    className="foreshadow-timeline-label"
                    onClick={() => onSelectChapter(chapters[start]?.id ?? chapters[0]?.id)}
                    title="跳到埋设章节"
                  >
                    <strong>{item.title || '未命名伏笔'}</strong>
                    <small>
                      {item.type ?? '秘密'} · {item.importance ?? '支线'}
                    </small>
                  </button>
                  <div
                    className="foreshadow-timeline-track"
                    style={
                      {
                        minWidth: trackMinWidth,
                        '--foreshadow-chapters': chapters.length,
                      } as CSSProperties
                    }
                  >
                    <span
                      className="foreshadow-timeline-bar"
                      style={{ left: `${startPct}%`, width: `${Math.max(1.5, endPct - startPct)}%` }}
                    />
                    <span
                      className="foreshadow-timeline-dot planted"
                      style={{ left: `${startPct}%` }}
                      title="埋设"
                    />
                    {meta.payoffIndex >= 0 ? (
                      <span
                        className="foreshadow-timeline-dot payoff"
                        style={{ left: `${((meta.payoffIndex + 0.5) / chapters.length) * 100}%` }}
                        title="计划回收"
                      />
                    ) : null}
                    <span
                      className="foreshadow-timeline-now"
                      style={{ left: `${((activeIndex + 0.5) / chapters.length) * 100}%` }}
                      title="当前章节"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <p className="drawer-hint">
          线从埋设章节连到计划回收章节；红色表示已超过计划回收章节，黄色表示超过 {STALE_CHAPTERS} 章没有再次提及。
        </p>
      </div>
    )
  }

  return (
    <div className="foreshadow-panel">
      <div className="drawer-section-head">
        <span>伏笔台账</span>
        <div className="drawer-section-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>
            <IconPlus size={14} />
            添加伏笔
          </button>
        </div>
      </div>

      <div className="foreshadow-toolbar">
        <div className="foreshadow-view-switch">
          <button
            type="button"
            className={view === 'list' ? 'active' : ''}
            onClick={() => setView('list')}
          >
            列表
          </button>
          <button
            type="button"
            className={view === 'timeline' ? 'active' : ''}
            onClick={() => setView('timeline')}
          >
            时间轴
          </button>
        </div>
        <span>第 {activeIndex + 1} 章 · 未回收 {openCount} · 已回收 {completedCount}</span>
      </div>

      <div className="foreshadow-metrics">
        <div className="foreshadow-metric">
          <span>未回收</span>
          <strong>{openCount}</strong>
        </div>
        <div className="foreshadow-metric">
          <span>已回收</span>
          <strong>{completedCount}</strong>
        </div>
        <div className={`foreshadow-metric ${overdueCount > 0 ? 'warn' : ''}`}>
          <span>已逾期</span>
          <strong>{overdueCount}</strong>
        </div>
        <div className={`foreshadow-metric ${staleCount > 0 ? 'stale' : ''}`}>
          <span>久未提及</span>
          <strong>{staleCount}</strong>
        </div>
        <div className="foreshadow-metric rate">
          <span>回收进度</span>
          <strong>{completionRate}%</strong>
        </div>
      </div>

      <div className="foreshadow-filters">
        {(
          [
            ['all', '全部'],
            ['open', '未回收'],
            ['done', '已回收'],
            ['overdue', `逾期 ${overdueCount}`],
            ['stale', `久未提及 ${staleCount}`],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={filter === value ? 'active' : ''}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
        {dueCount > 0 ? <span className="foreshadow-due-hint">本章应回收 {dueCount} 条</span> : null}
      </div>

      {detail.foreshadowings.length === 0 ? (
        <p className="drawer-empty">
          还没有伏笔记录。先埋一条线索，再给它选一个计划回收章节，时间轴会自动画出来。
        </p>
      ) : view === 'list' ? (
        <div className="foreshadow-list">
          {sortedItems.length === 0 ? (
            <p className="drawer-empty">当前筛选下没有伏笔。</p>
          ) : (
            sortedItems.map(renderEntry)
          )}
        </div>
      ) : (
        renderTimeline()
      )}
    </div>
  )
}
