import { useMemo, useState } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  Chapter,
  GlobalOutline,
  GlobalOutlineArc,
  OutlineCard,
  OutlineStatus,
  Work,
  WorkDetail,
} from '../types'
import { createGlobalOutline } from '../writingMode'
import { outlineHealth } from '../chapterMeta'
import { mergeGlobalOutline } from '../outlineAi'
import { IconPlus, IconSparkles, IconTrash } from './Icons'
import { OutlineAiModal } from './OutlineAiModal'
import { NumberInput } from './NumberInput'
import { useContextMenu, type ContextMenuEntry } from './ContextMenuProvider'
import { copyTextToClipboard } from '../clipboard'

interface OutlinePanelProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  activeChapterId: string
  api: ApiConfig
  apiReady: boolean
  onRecordUsage?: (entry: AiUsageEntry) => void
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onSelectChapter: (chapterId: string) => void
  onCreateChapter?: (title: string) => string
  onStartFromOutline?: (card: OutlineCard) => void
  onToast?: (message: string) => void
}

const STATUSES: OutlineStatus[] = ['未规划', '待写', '写作中', '已完成', '偏离', '放弃']

function createId(): string {
  return `o-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function OutlinePanel({
  work,
  detail,
  chapters,
  activeChapterId,
  api,
  apiReady,
  onRecordUsage,
  onUpdateDetail,
  onSelectChapter,
  onCreateChapter,
  onStartFromOutline,
  onToast,
}: OutlinePanelProps) {
  const outline = detail.outline ?? []
  const globalOutline = detail.globalOutline ?? createGlobalOutline()
  const [view, setView] = useState<'global' | 'chapters'>('chapters')
  const [selectedId, setSelectedId] = useState<string | null>(outline[0]?.id ?? null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const { openContextMenu } = useContextMenu()
  const selected = outline.find((card) => card.id === selectedId) ?? outline[0] ?? null
  const health = outlineHealth(chapters, detail)
  const filteredOutline = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return outline
    return outline.filter((card) =>
      `${card.title} ${card.summary} ${card.goal} ${card.conflict}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [outline, query])
  const outlineGroups = useMemo(() => {
    const arcs = globalOutline.arcs
    const groups = arcs.map((arc) => ({
      id: arc.id,
      title: arc.title || '未命名卷 / 阶段',
      goal: arc.goal,
      cards: filteredOutline.filter((card) => card.arcId === arc.id),
    }))
    const groupedIds = new Set(groups.flatMap((group) => group.cards.map((card) => card.id)))
    const ungrouped = filteredOutline.filter((card) => !groupedIds.has(card.id))
    return [...groups, { id: '', title: '未分卷', goal: '', cards: ungrouped }]
  }, [filteredOutline, globalOutline.arcs])

  const saveGlobal = (patch: Partial<GlobalOutline>) => {
    onUpdateDetail({ globalOutline: { ...globalOutline, ...patch } })
  }

  const applyGeneratedOutline = (
    generatedGlobal: GlobalOutline,
    cards: OutlineCard[],
    replace: boolean,
  ) => {
    if (replace) {
      onUpdateDetail({ globalOutline: generatedGlobal, outline: cards })
    } else {
      const existingTitles = new Set(outline.map((card) => card.title))
      const nextCards = cards.filter((card) => !existingTitles.has(card.title))
      onUpdateDetail({
        globalOutline: mergeGlobalOutline(globalOutline, generatedGlobal),
        outline: [...outline, ...nextCards],
      })
    }
    setSelectedId(cards[0]?.id ?? selectedId)
    setView('chapters')
    onToast?.(
      replace
        ? `已替换大纲：${generatedGlobal.arcs.length} 卷 / ${cards.length} 章`
        : `已合并大纲：新增 ${cards.length} 章草稿`,
    )
  }

  const addArc = () => {
    const arc: GlobalOutlineArc = {
      id: `arc-${Date.now().toString(36)}`,
      title: `第 ${globalOutline.arcs.length + 1} 卷 / 阶段`,
      goal: '',
      keyEvents: '',
      endState: '',
    }
    saveGlobal({ arcs: [...globalOutline.arcs, arc] })
  }

  const updateArc = (id: string, patch: Partial<GlobalOutlineArc>) => {
    saveGlobal({
      arcs: globalOutline.arcs.map((arc) => (arc.id === id ? { ...arc, ...patch } : arc)),
    })
  }

  const removeArc = (id: string) => {
    saveGlobal({ arcs: globalOutline.arcs.filter((arc) => arc.id !== id) })
  }

  const startWriting = () => {
    if (!selected || !onStartFromOutline) return
    let card = selected
    if (!selected.chapterId && onCreateChapter) {
      const id = onCreateChapter(selected.title || '未命名章节')
      card = { ...selected, chapterId: id }
      update(selected.id, { chapterId: id })
      onSelectChapter(id)
    }
    if (card.chapterId) onStartFromOutline(card)
  }

  const save = (next: OutlineCard[]) => onUpdateDetail({ outline: next })

  const update = (id: string, patch: Partial<OutlineCard>) => {
    save(outline.map((card) => (card.id === id ? { ...card, ...patch } : card)))
  }

  const add = () => {
    const card: OutlineCard = {
      id: createId(),
      title: `第 ${outline.length + 1} 章大纲`,
      summary: '',
      goal: '',
      conflict: '',
      status: '未规划',
      targetWords: 1200,
      chapterId: activeChapterId || undefined,
    }
    save([...outline, card])
    setSelectedId(card.id)
  }

  const remove = (id: string) => {
    save(outline.filter((card) => card.id !== id))
    setSelectedId(outline.find((card) => card.id !== id)?.id ?? null)
  }

  const move = (id: string, direction: -1 | 1) => {
    const index = outline.findIndex((card) => card.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= outline.length) return
    const next = [...outline]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    save(next)
  }

  const moveTo = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    const from = outline.findIndex((card) => card.id === sourceId)
    const to = outline.findIndex((card) => card.id === targetId)
    if (from < 0 || to < 0) return
    const next = [...outline]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    save(next)
  }

  const outlineContextMenu = (card: OutlineCard, index: number): ContextMenuEntry[] => [
    { type: 'label', label: `第 ${index + 1} 章 · ${card.title || '未命名章节'}` },
    { label: '选中这条大纲', onSelect: () => setSelectedId(card.id) },
    {
      label: '开始写本章',
      disabled: !card.chapterId && !onCreateChapter,
      onSelect: () => {
        setSelectedId(card.id)
        if (!card.chapterId && onCreateChapter) {
          const id = onCreateChapter(card.title || '未命名章节')
          update(card.id, { chapterId: id })
          onSelectChapter(id)
          return
        }
        if (onStartFromOutline) onStartFromOutline(card)
      },
    },
    {
      label: '复制标题',
      onSelect: () => {
        void copyTextToClipboard(card.title).then((ok) =>
          onToast?.(ok ? '已复制大纲标题' : '复制失败'),
        )
      },
    },
    {
      label: '复制概要',
      disabled: !(card.summary || card.goal || card.conflict),
      onSelect: () => {
        void copyTextToClipboard([card.title, card.summary, card.goal, card.conflict].filter(Boolean).join('\n')).then(
          (ok) => onToast?.(ok ? '已复制大纲概要' : '复制失败'),
        )
      },
    },
    { type: 'separator' },
    {
      label: '标记为已完成',
      onSelect: () => update(card.id, { status: '已完成' }),
    },
    {
      label: '标记为待写',
      onSelect: () => update(card.id, { status: '待写' }),
    },
    { type: 'separator' },
    {
      label: '删除大纲…',
      danger: true,
      onSelect: () => {
        if (window.confirm(`删除「${card.title || '未命名章节'}」的大纲？正文章节不会被删除。`)) {
          remove(card.id)
        }
      },
    },
  ]

  return (
    <div className="outline-panel">
      <div className="drawer-section-head">
        <span>章节大纲</span>
        <div className="outline-view-tabs" role="tablist" aria-label="大纲视图">
          <button
            type="button"
            className={view === 'global' ? 'active' : ''}
            role="tab"
            aria-selected={view === 'global'}
            onClick={() => setView('global')}
          >
            全局大纲
          </button>
          <button
            type="button"
            className={view === 'chapters' ? 'active' : ''}
            role="tab"
            aria-selected={view === 'chapters'}
            onClick={() => setView('chapters')}
          >
            章节大纲
          </button>
        </div>
      </div>

      {view === 'global' ? (
        <div className="global-outline">
          <p className="drawer-hint">
            先定全书主线、阶段和转折，再拆成章节大纲。全局大纲只提供高层方向，不会把未来结局直接写进正文生成上下文。
          </p>
          <div className="record-form-grid">
            <label className="record-field record-field-wide">
              <span>一句话主线</span>
              <textarea
                className="input drawer-textarea"
                rows={2}
                value={globalOutline.premise}
                onChange={(event) => saveGlobal({ premise: event.target.value })}
                placeholder="这本书一句话讲什么"
              />
            </label>
            <label className="record-field">
              <span>主题 / 母题</span>
              <textarea
                className="input drawer-textarea"
                rows={2}
                value={globalOutline.theme}
                onChange={(event) => saveGlobal({ theme: event.target.value })}
              />
            </label>
            <label className="record-field">
              <span>主要矛盾</span>
              <textarea
                className="input drawer-textarea"
                rows={2}
                value={globalOutline.conflict}
                onChange={(event) => saveGlobal({ conflict: event.target.value })}
              />
            </label>
            <label className="record-field record-field-wide">
              <span>结构 / 三幕 / 起承转合</span>
              <textarea
                className="input drawer-textarea"
                rows={3}
                value={globalOutline.structure}
                onChange={(event) => saveGlobal({ structure: event.target.value })}
              />
            </label>
            <label className="record-field record-field-wide">
              <span>关键转折</span>
              <textarea
                className="input drawer-textarea"
                rows={2}
                value={globalOutline.turningPoints}
                onChange={(event) => saveGlobal({ turningPoints: event.target.value })}
              />
            </label>
            <label className="record-field">
              <span>结局方向</span>
              <textarea
                className="input drawer-textarea"
                rows={2}
                value={globalOutline.ending}
                onChange={(event) => saveGlobal({ ending: event.target.value })}
              />
            </label>
            <label className="record-field">
              <span>必须回收的线</span>
              <textarea
                className="input drawer-textarea"
                rows={2}
                value={globalOutline.mustResolve}
                onChange={(event) => saveGlobal({ mustResolve: event.target.value })}
              />
            </label>
            <label className="record-field record-field-wide">
              <span>不能违背的世界规则</span>
              <textarea
                className="input drawer-textarea"
                rows={2}
                value={globalOutline.rules}
                onChange={(event) => saveGlobal({ rules: event.target.value })}
              />
            </label>
            <label className="record-field record-field-wide">
              <span>备注 / 灵感</span>
              <textarea
                className="input drawer-textarea"
                rows={3}
                value={globalOutline.notes}
                onChange={(event) => saveGlobal({ notes: event.target.value })}
              />
            </label>
          </div>

          <div className="drawer-section-head global-arc-head">
            <span>卷 / 阶段</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addArc}>
              <IconPlus size={14} />
              添加卷 / 阶段
            </button>
          </div>
          {globalOutline.arcs.length === 0 ? (
            <p className="drawer-empty">还没有分卷。先写一个阶段目标，再拆章节。</p>
          ) : (
            <div className="global-arc-list">
              {globalOutline.arcs.map((arc, index) => (
                <article className="global-arc" key={arc.id}>
                  <div className="global-arc-head">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <input
                      className="input drawer-input"
                      value={arc.title}
                      onChange={(event) => updateArc(arc.id, { title: event.target.value })}
                      placeholder="卷 / 阶段名"
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="删除卷 / 阶段"
                      onClick={() => removeArc(arc.id)}
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                  <textarea
                    className="input drawer-textarea"
                    rows={2}
                    value={arc.goal}
                    onChange={(event) => updateArc(arc.id, { goal: event.target.value })}
                    placeholder="阶段目标"
                  />
                  <textarea
                    className="input drawer-textarea"
                    rows={2}
                    value={arc.keyEvents}
                    onChange={(event) => updateArc(arc.id, { keyEvents: event.target.value })}
                    placeholder="关键事件"
                  />
                  <textarea
                    className="input drawer-textarea"
                    rows={2}
                    value={arc.endState}
                    onChange={(event) => updateArc(arc.id, { endState: event.target.value })}
                    placeholder="阶段结束状态"
                  />
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
      <div className="drawer-section-head">
        <span>章节大纲</span>
        <div className="outline-head-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setAiOpen(true)}
            disabled={!apiReady}
          >
            <IconSparkles size={14} />
            AI 生成大纲
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={add}>
            <IconPlus size={14} />
            添加章节大纲
          </button>
        </div>
      </div>

      <p className="drawer-hint">
        大纲只做到章节级：规划下一章要写什么，生成时作为本章任务；正文仍由稿纸和导演指令推进。
      </p>

      <div className="outline-health-grid">
        <div><strong>{health.planned}</strong><span>已规划章节</span></div>
        <div><strong>{health.unbound}</strong><span>未绑定正文</span></div>
        <div><strong>{health.orphanChapters}</strong><span>正文未规划</span></div>
        <div><strong>{health.offPlan}</strong><span>标记偏离</span></div>
        <div>
          <strong>{health.totalTarget ? Math.round((health.totalActual / health.totalTarget) * 100) : 0}%</strong>
          <span>目标字数进度</span>
        </div>
      </div>

      <div className="outline-search-row">
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索章节大纲标题 / 概要 / 目标 / 冲突"
          aria-label="搜索章节大纲"
        />
        <span>{filteredOutline.length} 条</span>
      </div>

      {outline.length === 0 ? (
        <div className="drawer-empty outline-empty-action">
          <p>
            还没有大纲。先给下一章写一句概要、目标和冲突，AI 续写时会优先参考这一章的计划。
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAiOpen(true)}>
            <IconSparkles size={14} />
            AI 补全故事脊椎和开篇大纲
          </button>
        </div>
      ) : filteredOutline.length === 0 ? (
        <p className="drawer-empty">没有匹配的大纲卡。</p>
      ) : (
        <div className="outline-layout">
          <div className="outline-list">
            {outlineGroups.map((group) => (
              <section className="outline-arc-group" key={group.id || 'ungrouped'}>
                <button
                  type="button"
                  className="outline-arc-head"
                  aria-expanded={!collapsedGroups.has(group.id)}
                  onClick={() =>
                    setCollapsedGroups((current) => {
                      const next = new Set(current)
                      if (next.has(group.id)) next.delete(group.id)
                      else next.add(group.id)
                      return next
                    })
                  }
                >
                  <div>
                    <strong>{group.title}</strong>
                    <small>{group.cards.length} 章</small>
                  </div>
                  {group.goal ? <p>{group.goal}</p> : null}
                </button>
                {collapsedGroups.has(group.id)
                  ? null
                  : group.cards.map((card) => {
                  const index = outline.findIndex((item) => item.id === card.id)
                  return (
                    <div
                      className={`outline-row ${card.id === selected?.id ? 'active' : ''}`}
                      key={card.id}
                      onContextMenu={(event) =>
                        openContextMenu(event, outlineContextMenu(card, index))
                      }
                      draggable
                      onDragStart={() => setDraggedId(card.id)}
                      onDragEnd={() => setDraggedId(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggedId) moveTo(draggedId, card.id)
                        setDraggedId(null)
                      }}
                    >
                      <button
                        type="button"
                        className="outline-row-main"
                        onClick={() => setSelectedId(card.id)}
                      >
                        <span className="outline-row-index">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="outline-row-copy">
                          <strong>{card.title || '未命名章节'}</strong>
                          <small>{card.summary || card.goal || '还没有概要'}</small>
                          <em>
                            {card.chapterId ? '已绑定正文' : '未绑定正文'}
                            {' · '}
                            目标 {card.targetWords || 0} 字
                          </em>
                        </span>
                        <span className={`outline-status status-${card.status}`}>{card.status}</span>
                      </button>
                      <div className="outline-row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="上移大纲"
                          disabled={index === 0}
                          onClick={() => move(card.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="下移大纲"
                          disabled={index === outline.length - 1}
                          onClick={() => move(card.id, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="删除大纲"
                          onClick={() => remove(card.id)}
                        >
                          <IconTrash size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {group.cards.length === 0 ? (
                  <p className="outline-arc-empty">这一卷还没有章节大纲。</p>
                ) : null}
              </section>
            ))}
          </div>

          {selected ? (
            <div className="outline-editor">
              <div className="record-form-grid">
                <label className="record-field record-field-wide">
                  <span>章节标题</span>
                  <input
                    className="input drawer-input"
                    value={selected.title}
                    onChange={(event) => update(selected.id, { title: event.target.value })}
                    placeholder="这一章叫什么"
                  />
                </label>
                <label className="record-field">
                  <span>状态</span>
                  <select
                    className="input select drawer-input"
                    value={selected.status}
                    onChange={(event) =>
                      update(selected.id, { status: event.target.value as OutlineStatus })
                    }
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="record-field">
                  <span>目标字数</span>
                  <NumberInput
                    className="input drawer-input"
                    min={0}
                    value={selected.targetWords}
                    fallback={0}
                    onValueChange={(value) => update(selected.id, { targetWords: value })}
                  />
                </label>
                <label className="record-field">
                  <span>分卷 / 阶段</span>
                  <select
                    className="input select drawer-input"
                    value={selected.arcId ?? ''}
                    onChange={(event) =>
                      update(selected.id, { arcId: event.target.value || undefined })
                    }
                  >
                    <option value="">未分卷</option>
                    {globalOutline.arcs.map((arc) => (
                      <option key={arc.id} value={arc.id}>
                        {arc.title || '未命名卷 / 阶段'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="record-field">
                  <span>视角人物</span>
                  <select
                    className="input select drawer-input"
                    value={selected.povCharacterId ?? ''}
                    onChange={(event) =>
                      update(selected.id, { povCharacterId: event.target.value || undefined })
                    }
                  >
                    <option value="">未指定</option>
                    {detail.characters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name || '未命名角色'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="record-field">
                  <span>主要地点</span>
                  <select
                    className="input select drawer-input"
                    value={selected.locationIds?.[0] ?? ''}
                    onChange={(event) =>
                      update(selected.id, {
                        locationIds: event.target.value ? [event.target.value] : [],
                      })
                    }
                  >
                    <option value="">未指定</option>
                    {(detail.locations ?? []).map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name || '未命名地点'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="record-field">
                  <span>关联伏笔</span>
                  <select
                    className="input select drawer-input"
                    value={selected.foreshadowingIds?.[0] ?? ''}
                    onChange={(event) =>
                      update(selected.id, {
                        foreshadowingIds: event.target.value ? [event.target.value] : [],
                      })
                    }
                  >
                    <option value="">未指定</option>
                    {detail.foreshadowings.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title || '未命名伏笔'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="record-field record-field-wide">
                  <span>绑定正文章节</span>
                  <select
                    className="input select drawer-input"
                    value={selected.chapterId ?? ''}
                    onChange={(event) =>
                      update(selected.id, { chapterId: event.target.value || undefined })
                    }
                  >
                    <option value="">未绑定</option>
                    {chapters.map((chapter, index) => (
                      <option key={chapter.id} value={chapter.id}>
                        第 {index + 1} 章 · {chapter.title || '未命名'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="record-field record-field-wide">
                  <span>本章概要</span>
                  <textarea
                    className="input drawer-textarea"
                    rows={3}
                    value={selected.summary}
                    onChange={(event) => update(selected.id, { summary: event.target.value })}
                    placeholder="这一章发生什么"
                  />
                </label>
                <label className="record-field record-field-wide">
                  <span>本章目标</span>
                  <textarea
                    className="input drawer-textarea"
                    rows={2}
                    value={selected.goal}
                    onChange={(event) => update(selected.id, { goal: event.target.value })}
                    placeholder="剧情 / 人物 / 伏笔要推进什么"
                  />
                </label>
                <label className="record-field record-field-wide">
                  <span>核心冲突</span>
                  <textarea
                    className="input drawer-textarea"
                    rows={2}
                    value={selected.conflict}
                    onChange={(event) => update(selected.id, { conflict: event.target.value })}
                    placeholder="谁和谁冲突，代价是什么"
                  />
                </label>
              </div>
              <div className="outline-editor-foot">
                {onStartFromOutline ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!selected.chapterId && !onCreateChapter}
                    onClick={startWriting}
                  >
                    开始写本章
                  </button>
                ) : !selected.chapterId && onCreateChapter ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const id = onCreateChapter(selected.title || '未命名章节')
                      update(selected.id, { chapterId: id })
                      onSelectChapter(id)
                    }}
                  >
                    创建正文章节
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={!selected.chapterId}
                  onClick={() => selected.chapterId && onSelectChapter(selected.chapterId)}
                >
                  定位绑定章节
                </button>
                <span>
                  {selected.chapterId
                    ? `已绑定：${chapters.find((chapter) => chapter.id === selected.chapterId)?.title ?? '章节'}`
                    : '开始写会自动创建并绑定正文章节。'}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      )}
        </>
      )}

      {aiOpen ? (
        <OutlineAiModal
          work={work}
          detail={detail}
          chapters={chapters}
          api={api}
          apiReady={apiReady}
          onRecordUsage={onRecordUsage}
          onApply={applyGeneratedOutline}
          onToast={(message) => onToast?.(message)}
          onClose={() => setAiOpen(false)}
        />
      ) : null}
    </div>
  )
}
