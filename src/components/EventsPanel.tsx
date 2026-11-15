import { useEffect, useMemo, useState } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  Chapter,
  OutlineStatus,
  StoryEventEntry,
  StoryEventImportance,
  StoryEventStatus,
  StoryStateEvent,
  Work,
  WorkDetail,
} from '../types'
import { checkContinuity } from '../continuity'
import { requestArcSummary } from '../arcSummary'
import { resolveStoryThreads } from '../storyState'
import { Modal } from './Modal'
import { IconTrash } from './Icons'
import { useContextMenu, type ContextMenuEntry } from './ContextMenuProvider'
import { copyTextToClipboard } from '../clipboard'

interface EventsPanelProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  activeChapterId: string
  api: ApiConfig
  apiReady: boolean
  onRecordUsage?: (entry: AiUsageEntry) => void
  onToast: (message: string) => void
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onAuditContinuity?: () => void
  auditingContinuity?: boolean
  onRepairContinuity?: () => void
  repairingContinuity?: boolean
  onSyncAll?: () => void
  syncingAll?: boolean
  syncAllProgress?: number
}

type Filter = 'all' | 'important' | 'unresolved'

interface FlatEvent {
  storyId: string
  chapterId: string
  chapterTitle: string
  event: StoryEventEntry
}

function fallbackEvent(event: StoryStateEvent): StoryEventEntry {
  return {
    id: `${event.id}-legacy`,
    title: event.chapterTitle || '本章事件',
    summary: event.summary,
    participants: [],
    location: '',
    cause: '',
    result: '',
    consequences: event.changes.map((change) => `${change.field}：${change.value}`),
    importance: 'medium',
    status: 'canon',
  }
}

export function EventsPanel({
  work,
  detail,
  chapters,
  activeChapterId,
  api,
  apiReady,
  onRecordUsage,
  onToast,
  onUpdateDetail,
  onAuditContinuity,
  auditingContinuity = false,
  onRepairContinuity,
  repairingContinuity = false,
  onSyncAll,
  syncingAll = false,
  syncAllProgress = 0,
}: EventsPanelProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [chapterPage, setChapterPage] = useState(0)
  const [arcGenerating, setArcGenerating] = useState(false)
  const [editing, setEditing] = useState<FlatEvent | null>(null)
  const [draft, setDraft] = useState<StoryEventEntry | null>(null)
  const [isNew, setIsNew] = useState(false)
  const { openContextMenu } = useContextMenu()

  const storyEvents = detail.storyStateEvents ?? []
  const activeIndex = Math.max(
    0,
    chapters.findIndex((chapter) => chapter.id === activeChapterId),
  )
  const arcSize = 50
  const arcStart = Math.floor(activeIndex / arcSize) * arcSize
  const arcEnd = Math.min(chapters.length - 1, arcStart + arcSize - 1)
  const currentArcSummary = (detail.arcSummaries ?? []).find(
    (summary) => summary.startIndex === arcStart && summary.endIndex === arcEnd,
  )
  const flatEvents = useMemo<FlatEvent[]>(
    () =>
      storyEvents.flatMap((story) => {
        const events = story.events?.length ? story.events : [fallbackEvent(story)]
        return events.map((event) => ({
          storyId: story.id,
          chapterId: story.chapterId,
          chapterTitle: story.chapterTitle,
          event,
        }))
      }),
    [storyEvents],
  )
  const openThreads = useMemo(
    () =>
      resolveStoryThreads(detail)
        .filter((thread) => thread.status === 'open')
        .sort((a, b) => {
          const rank = { main: 0, side: 1, background: 2 }
          return rank[a.priority] - rank[b.priority]
        }),
    [detail],
  )
  const visibleEvents = flatEvents.filter((item) => {
    if (filter === 'important') return item.event.importance === 'high'
    if (filter === 'unresolved') return item.event.consequences.length > 0
    if (search.trim()) {
      const query = search.trim().toLowerCase()
      const haystack = [
        item.event.title,
        item.event.summary,
        item.event.participants.join(' '),
        item.event.location,
        item.event.cause,
        item.event.consequences.join(' '),
        item.chapterTitle,
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
  const chapterMemories = useMemo(
    () => new Map((detail.chapterMemories ?? []).map((memory) => [memory.chapterId, memory])),
    [detail.chapterMemories],
  )
  const chapterOrder = useMemo(
    () => new Map(chapters.map((chapter, index) => [chapter.id, index])),
    [chapters],
  )
  const groupedEvents = useMemo(() => {
    const groups = new Map<
      string,
      { chapterId: string; chapterTitle: string; items: FlatEvent[] }
    >()
    for (const item of visibleEvents) {
      const key = item.chapterId || item.chapterTitle || 'unknown'
      const group = groups.get(key) ?? {
        chapterId: item.chapterId,
        chapterTitle: item.chapterTitle || '未知章节',
        items: [],
      }
      group.items.push(item)
      groups.set(key, group)
    }
    return [...groups.values()].sort(
      (a, b) =>
        (chapterOrder.get(b.chapterId) ?? -1) - (chapterOrder.get(a.chapterId) ?? -1),
    )
  }, [visibleEvents, chapterOrder])
  const chapterPageSize = 20
  const pageCount = Math.max(1, Math.ceil(groupedEvents.length / chapterPageSize))
  const safePage = Math.min(chapterPage, pageCount - 1)
  const pageGroups = groupedEvents.slice(
    safePage * chapterPageSize,
    (safePage + 1) * chapterPageSize,
  )
  useEffect(() => {
    setChapterPage(0)
  }, [filter, search])
  const pendingSyncCount = chapters.filter(
    (chapter) =>
      chapter.content.trim() &&
      !storyEvents.some((event) => event.chapterId === chapter.id),
  ).length
  const recentEvents = flatEvents.slice(-3).reverse()
  const outlineCards = detail.outline ?? []
  const continuityWarnings = useMemo(
    () => checkContinuity(detail, chapters),
    [detail, chapters],
  )
  const characterIssues = useMemo(
    () =>
      storyEvents.flatMap((event) =>
        (event.characterIssues ?? []).map((issue, issueIndex) => ({
          ...issue,
          eventId: event.id,
          issueIndex,
          chapterId: event.chapterId,
          chapterTitle: event.chapterTitle,
        })),
      ),
    [storyEvents],
  )
  const openCharacterIssues = characterIssues.filter((issue) => !issue.dismissed)
  const dismissedCharacterIssues = characterIssues.filter((issue) => issue.dismissed)
  const sortedCharacterIssues = [...openCharacterIssues, ...dismissedCharacterIssues]
  const factionIssues = useMemo(
    () =>
      storyEvents.flatMap((event) =>
        (event.factionIssues ?? []).map((issue, issueIndex) => ({
          ...issue,
          eventId: event.id,
          issueIndex,
          chapterId: event.chapterId,
          chapterTitle: event.chapterTitle,
        })),
      ),
    [storyEvents],
  )
  const openFactionIssues = factionIssues.filter((issue) => !issue.dismissed)
  const dismissedFactionIssues = factionIssues.filter((issue) => issue.dismissed)
  const sortedFactionIssues = [...openFactionIssues, ...dismissedFactionIssues]

  const setPlanStatus = (outlineId: string, status: OutlineStatus) => {
    onUpdateDetail({
      outline: outlineCards.map((card) => (card.id === outlineId ? { ...card, status } : card)),
    })
  }

  const saveStoryEvents = (next: StoryStateEvent[]) => onUpdateDetail({ storyStateEvents: next })

  const setIssueDismissed = (eventId: string, issueIndex: number, dismissed: boolean) => {
    const next = storyEvents.map((event) =>
      event.id === eventId
        ? {
            ...event,
            characterIssues: (event.characterIssues ?? []).map((issue, index) =>
              index === issueIndex
                ? {
                    ...issue,
                    dismissed,
                    dismissedAt: dismissed ? new Date().toISOString() : undefined,
                  }
                : issue,
            ),
          }
        : event,
    )
    saveStoryEvents(next)
    onToast(
      dismissed
        ? '已记录为“不是问题”，后续同一句提示不再重复出现'
        : '已恢复这条角色一致性提示',
    )
  }

  const dismissAllIssues = () => {
    if (openCharacterIssues.length === 0) return
    const now = new Date().toISOString()
    saveStoryEvents(
      storyEvents.map((event) => ({
        ...event,
        characterIssues: (event.characterIssues ?? []).map((issue) =>
          issue.dismissed ? issue : { ...issue, dismissed: true, dismissedAt: now },
        ),
      })),
    )
    onToast(`已记录 ${openCharacterIssues.length} 条角色豁免，后续相同提示不再重复出现`)
  }

  const setFactionIssueDismissed = (
    eventId: string,
    issueIndex: number,
    dismissed: boolean,
  ) => {
    saveStoryEvents(
      storyEvents.map((event) =>
        event.id === eventId
          ? {
              ...event,
              factionIssues: (event.factionIssues ?? []).map((issue, index) =>
                index === issueIndex
                  ? {
                      ...issue,
                      dismissed,
                      dismissedAt: dismissed ? new Date().toISOString() : undefined,
                    }
                  : issue,
              ),
            }
          : event,
      ),
    )
    onToast(
      dismissed
        ? '已记录为“不是问题”，后续同一句势力提示不再重复出现'
        : '已恢复这条势力一致性提示',
    )
  }

  const dismissAllFactionIssues = () => {
    if (openFactionIssues.length === 0) return
    const now = new Date().toISOString()
    saveStoryEvents(
      storyEvents.map((event) => ({
        ...event,
        factionIssues: (event.factionIssues ?? []).map((issue) =>
          issue.dismissed ? issue : { ...issue, dismissed: true, dismissedAt: now },
        ),
      })),
    )
    onToast(`已记录 ${openFactionIssues.length} 条势力豁免，后续相同提示不再重复出现`)
  }

  const updateEvent = (storyId: string, event: StoryEventEntry) => {
    saveStoryEvents(
      storyEvents.map((story) =>
        story.id === storyId
          ? {
              ...story,
              events: (story.events?.length ? story.events : [fallbackEvent(story)]).map((item) =>
                item.id === event.id ? event : item,
              ),
            }
          : story,
      ),
    )
  }

  const deleteEvent = (storyId: string, eventId: string) => {
    saveStoryEvents(
      storyEvents.map((story) => {
        if (story.id !== storyId) return story
        const events = (story.events?.length ? story.events : [fallbackEvent(story)]).filter(
          (item) => item.id !== eventId,
        )
        return { ...story, events }
      }),
    )
  }

  const resolveThread = (threadId: string) => {
    onUpdateDetail({
      storyThreads: resolveStoryThreads(detail).map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              status: 'resolved',
              resolutionChapterId: activeChapterId,
            }
          : thread,
      ),
    })
  }

  const setThreadPriority = (threadId: string, priority: 'main' | 'side' | 'background') => {
    onUpdateDetail({
      storyThreads: resolveStoryThreads(detail).map((thread) =>
        thread.id === threadId ? { ...thread, priority } : thread,
      ),
    })
  }

  const generateArcSummary = async () => {
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return
    }
    if (arcEnd < arcStart) {
      onToast('当前卷还没有章节')
      return
    }
    setArcGenerating(true)
    try {
      const arc = await requestArcSummary({
        work,
        detail,
        chapters,
        startIndex: arcStart,
        endIndex: arcEnd,
        api,
        onRecordUsage,
      })
      onUpdateDetail({
        arcSummaries: [
          ...(detail.arcSummaries ?? []).filter(
            (summary) => summary.startIndex !== arcStart || summary.endIndex !== arcEnd,
          ),
          arc,
        ],
      })
      onToast(`卷摘要已生成：${arc.title}`)
    } catch (caught) {
      onToast(`卷摘要生成失败：${caught instanceof Error ? caught.message : '请稍后重试'}`)
    } finally {
      setArcGenerating(false)
    }
  }

  const startEdit = (item: FlatEvent) => {
    setEditing(item)
    setDraft(JSON.parse(JSON.stringify(item.event)) as StoryEventEntry)
    setIsNew(false)
  }

  const eventContextMenu = (item: FlatEvent): ContextMenuEntry[] => [
    { type: 'label', label: item.event.title || '未命名事件' },
    { label: '编辑事件', onSelect: () => startEdit(item) },
    {
      label: '复制事件摘要',
      onSelect: () => {
        void copyTextToClipboard(
          [item.event.title, item.event.summary, ...item.event.consequences].filter(Boolean).join('\n'),
        ).then((ok) => onToast(ok ? '已复制事件摘要' : '复制失败'))
      },
    },
    { type: 'separator' },
    {
      label: '删除事件…',
      danger: true,
      onSelect: () => {
        if (window.confirm(`删除事件「${item.event.title || '未命名事件'}」？`)) {
          deleteEvent(item.storyId, item.event.id)
        }
      },
    },
  ]

  const startAdd = () => {
    const activeChapter =
      chapters.find((chapter) => chapter.id === activeChapterId) ?? chapters[0]
    if (!activeChapter) return
    const event: StoryEventEntry = {
      id: `se-manual-${Date.now().toString(36)}`,
      title: '',
      summary: '',
      participants: [],
      location: '',
      cause: '',
      result: '',
      consequences: [],
      importance: 'medium',
      status: 'canon',
    }
    setEditing({
      storyId: '',
      chapterId: activeChapter.id,
      chapterTitle: activeChapter.title,
      event,
    })
    setDraft(event)
    setIsNew(true)
  }

  const saveEdit = () => {
    if (!editing || !draft) return
    if (isNew) {
      const event: StoryStateEvent = {
        id: `state-event-manual-${Date.now().toString(36)}`,
        chapterId: editing.chapterId,
        chapterTitle: editing.chapterTitle,
        createdAt: new Date().toISOString(),
        summary: draft.summary,
        changes: [],
        events: [{ ...draft, title: draft.title.trim() || '未命名事件' }],
        openThreads: draft.consequences,
      }
      const nextEvents = [...storyEvents, event]
      const threads = resolveStoryThreads(detail).map((thread) => ({ ...thread }))
      const existing = new Set(threads.map((thread) => thread.text.trim().toLowerCase()))
      for (const text of event.openThreads ?? []) {
        const key = text.trim().toLowerCase()
        if (!key || existing.has(key)) continue
        existing.add(key)
        threads.push({
          id: `thread-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          text: text.trim(),
          status: 'open',
          priority: 'side',
          createdChapterId: editing.chapterId,
          lastTouchedChapterId: editing.chapterId,
          createdAt: event.createdAt,
        })
      }
      onUpdateDetail({ storyStateEvents: nextEvents, storyThreads: threads })
      setEditing(null)
      setDraft(null)
      setIsNew(false)
      return
    }
    updateEvent(editing.storyId, { ...draft, title: draft.title.trim() || '未命名事件' })
    setEditing(null)
    setDraft(null)
  }

  return (
    <div className="events-panel">
      <div className="drawer-section-head">
        <span>事件簿</span>
        <div className="event-head-actions">
          <span className="module-count">
            {flatEvents.length} 条事件 · {openThreads.length} 条未解决
          </span>
          {onSyncAll && pendingSyncCount > 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={syncingAll}
              onClick={onSyncAll}
              title="为所有还没有同步过事件的章节补跑一次 AI 同步"
            >
              {syncingAll
                ? `同步中 ${syncAllProgress}/${pendingSyncCount}`
                : `补齐同步 ${pendingSyncCount} 章`}
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost btn-sm" onClick={startAdd}>
            手动添加
          </button>
        </div>
      </div>
      <p className="drawer-hint">
        每章写完后自动提取 2–8 条已发生事件。可以直接编辑或删除；事件簿用来保证下一章不写歪。
      </p>

      <section className="arc-summary-card">
        <div className="arc-summary-head">
          <div>
            <span>当前卷摘要</span>
            <strong>
              第 {Math.max(1, arcStart + 1)}–{Math.max(1, arcEnd + 1)} 章
            </strong>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void generateArcSummary()}
            disabled={!apiReady || arcGenerating || arcEnd < arcStart}
            title={apiReady ? '按 50 章为一段生成压缩摘要，用于长篇上下文' : '请先配置 AI'}
          >
            {arcGenerating ? '生成中…' : currentArcSummary ? '重新生成卷摘要' : '生成卷摘要'}
          </button>
        </div>
        {currentArcSummary ? (
          <p>{currentArcSummary.summary}</p>
        ) : (
          <p className="drawer-empty">
            还没有当前卷摘要。每 50 章生成一次，长篇续写会用最近一卷摘要做骨架。
          </p>
        )}
      </section>

      <section className="continuity-brief">
        <div className="continuity-brief-head">
          <span>承接简报</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const text = [
                `当前剧情：${detail.currentSummary || '（无摘要）'}`,
                `最近事件：${recentEvents.map((item) => item.event.title).join('；') || '（无）'}`,
                `未解决：${openThreads.map((thread) => thread.text).join('；') || '（无）'}`,
              ].join('\n')
              void navigator.clipboard?.writeText(text)
            }}
          >
            复制承接简报
          </button>
        </div>
        <p>{detail.currentSummary || '还没有当前剧情摘要。写完一章后会自动生成。'}</p>
        <div className="continuity-brief-grid">
          <div>
            <span>最近事件</span>
            {recentEvents.length ? (
              recentEvents.map((item) => <small key={item.event.id}>{item.event.title}</small>)
            ) : (
              <small>暂无</small>
            )}
          </div>
          <div>
            <span>未解决事项</span>
            {openThreads.length ? (
              openThreads.slice(0, 5).map((thread) => <small key={thread.id}>{thread.text}</small>)
            ) : (
              <small>暂无</small>
            )}
          </div>
        </div>
      </section>

      {outlineCards.length > 0 ? (
        <section className="plan-compare">
          <div className="drawer-section-head">
            <span>计划 vs 实际</span>
            <strong>{outlineCards.length} 条章节计划</strong>
          </div>
          {outlineCards.map((card) => {
            const actual = flatEvents.filter((item) => item.chapterId === card.chapterId)
            return (
              <article className="plan-compare-card" key={card.id}>
                <div className="plan-compare-head">
                  <strong>{card.title || '未命名章节计划'}</strong>
                  <span className={`plan-status status-${card.status}`}>{card.status}</span>
                </div>
                <p>{card.summary || card.goal || '这条计划还没有概要。'}</p>
                {card.conflict ? <small>计划冲突：{card.conflict}</small> : null}
                <div className="plan-actual">
                  <span>实际事件</span>
                  {actual.length ? (
                    actual.map((item) => <small key={item.event.id}>{item.event.title}</small>)
                  ) : (
                    <small>还没有事件记录</small>
                  )}
                </div>
                <div className="plan-compare-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPlanStatus(card.id, '已完成')}
                  >
                    标记完成
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPlanStatus(card.id, '偏离')}
                  >
                    标记偏离
                  </button>
                </div>
              </article>
            )
          })}
        </section>
      ) : null}

      <section className="continuity-check">
        <div className="drawer-section-head">
          <span>连续性检查</span>
          <strong>{continuityWarnings.length ? `${continuityWarnings.length} 条提醒` : '通过'}</strong>
        </div>
        {continuityWarnings.length === 0 ? (
          <p className="drawer-empty">
            未发现“死亡角色再次出场 / 已失去物品再次使用”的明显冲突。秘密和时间线检查在 P1 后续继续加强。
          </p>
        ) : (
          continuityWarnings.map((warning) => (
            <div className="continuity-warning" key={warning.id}>
              <strong>{warning.title}</strong>
              <p>{warning.detail}</p>
            </div>
          ))
        )}
      </section>

      <section className="ai-continuity-audit">
        <div className="drawer-section-head">
          <span>AI 连续性审查</span>
          {onAuditContinuity ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={auditingContinuity || repairingContinuity}
              onClick={onAuditContinuity}
            >
              {auditingContinuity ? '审查中…' : '审查当前章'}
            </button>
          ) : null}
          {onRepairContinuity && detail.continuityReport ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={auditingContinuity || repairingContinuity}
              onClick={onRepairContinuity}
            >
              {repairingContinuity ? '修复中…' : '按段落修复'}
            </button>
          ) : null}
        </div>
        <p className="drawer-hint">
          对照记忆库、事件簿、人物状态、事实、承诺、认知边界和时间线做语义检查；只提示，不自动改正文。修复会先生成预览。
        </p>
        {detail.continuityReport ? (
          <pre className="continuity-report">{detail.continuityReport}</pre>
        ) : (
          <p className="drawer-empty">还没有 AI 连续性审查结果。</p>
        )}
      </section>

      {characterIssues.length > 0 ? (
        <section className="character-issue-panel">
          <div className="drawer-section-head">
            <span>角色一致性提示</span>
            <div className="drawer-section-actions">
              <strong>
                {openCharacterIssues.length} 条待看
                {dismissedCharacterIssues.length
                  ? ` · ${dismissedCharacterIssues.length} 条已豁免`
                  : ''}
              </strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={openCharacterIssues.length === 0}
                onClick={dismissAllIssues}
              >
                全部标为不是问题
              </button>
            </div>
          </div>
          <p className="drawer-hint">
            来自章节同步时的角色档案检查：是否知道了不该知道的事、说了“绝不说”的话，或明显违背行为设定。只提示，不改正文。
          </p>
          {sortedCharacterIssues
            .slice(0, 12)
            .map((issue) => (
              <div
                className={`character-issue-row severity-${issue.severity} ${issue.dismissed ? 'dismissed' : ''}`}
                key={`${issue.eventId}-${issue.issueIndex}`}
              >
                <div>
                  <strong>{issue.characterName}</strong>
                  <span>{issue.chapterTitle} · {issue.type}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm character-issue-action"
                    onClick={() =>
                      setIssueDismissed(issue.eventId, issue.issueIndex, !issue.dismissed)
                    }
                  >
                    {issue.dismissed ? '恢复提示' : '不是问题'}
                  </button>
                </div>
                <p>{issue.reason}</p>
                {issue.quote ? <blockquote>{issue.quote}</blockquote> : null}
                {issue.dismissed ? <small>已豁免，后续同一句不再重复提示。</small> : null}
              </div>
            ))}
          {openCharacterIssues.length === 0 ? (
            <p className="drawer-empty">当前提示都已标记为“不是问题”。</p>
          ) : null}
        </section>
      ) : null}

      {factionIssues.length > 0 ? (
        <section className="character-issue-panel faction-issue-panel">
          <div className="drawer-section-head">
            <span>势力一致性提示</span>
            <div className="drawer-section-actions">
              <strong>
                {openFactionIssues.length} 条待看
                {dismissedFactionIssues.length
                  ? ` · ${dismissedFactionIssues.length} 条已豁免`
                  : ''}
              </strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={openFactionIssues.length === 0}
                onClick={dismissAllFactionIssues}
              >
                全部标为不是问题
              </button>
            </div>
          </div>
          <p className="drawer-hint">
            检查势力是否使用了不拥有的资源、知道了情报边界外的事、绕过决策流程，或把组织写成一个人。只提示，不改正文。
          </p>
          {sortedFactionIssues.slice(0, 12).map((issue) => (
            <div
              className={`character-issue-row severity-${issue.severity} ${issue.dismissed ? 'dismissed' : ''}`}
              key={`${issue.eventId}-${issue.issueIndex}`}
            >
              <div>
                <strong>{issue.factionName}</strong>
                <span>{issue.chapterTitle} · {issue.type}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm character-issue-action"
                  onClick={() =>
                    setFactionIssueDismissed(
                      issue.eventId,
                      issue.issueIndex,
                      !issue.dismissed,
                    )
                  }
                >
                  {issue.dismissed ? '恢复提示' : '不是问题'}
                </button>
              </div>
              <p>{issue.reason}</p>
              {issue.quote ? <blockquote>{issue.quote}</blockquote> : null}
              {issue.dismissed ? <small>已豁免，后续同一句不再重复提示。</small> : null}
            </div>
          ))}
          {openFactionIssues.length === 0 ? (
            <p className="drawer-empty">当前势力提示都已标记为“不是问题”。</p>
          ) : null}
        </section>
      ) : null}

      <div className="event-filter">
        <input
          className="input event-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索事件 / 人物 / 地点 / 后果"
          aria-label="搜索事件"
        />
        {(
          [
            ['all', '全部'],
            ['important', '重要'],
            ['unresolved', '有后续'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={filter === value ? 'active' : ''}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
        <span>{visibleEvents.length} 条</span>
      </div>

      {visibleEvents.length === 0 ? (
        <p className="drawer-empty">还没有事件。写完一章后，AI 会自动提取。</p>
      ) : (
        <>
          <div className="event-pagebar">
            <span>
              共 {groupedEvents.length} 章 · 第 {safePage + 1} / {pageCount} 页
            </span>
            <div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={safePage <= 0}
                onClick={() => setChapterPage((page) => Math.max(0, page - 1))}
              >
                上一页
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => setChapterPage((page) => Math.min(pageCount - 1, page + 1))}
              >
                下一页
              </button>
            </div>
          </div>
          {pageGroups.map((group) => (
            <section
              className="event-chapter-group"
              key={`${group.chapterId}-${group.chapterTitle}`}
            >
              <header>
                <span>{group.chapterTitle}</span>
                <small>{group.items.length} 条</small>
              </header>
              {chapterMemories.get(group.chapterId)?.summary ? (
                <p className="event-chapter-memory">
                  {chapterMemories.get(group.chapterId)?.summary}
                </p>
              ) : null}
              <div className="event-list">
                {group.items.map((item) => (
                  <article
                    className={`event-card importance-${item.event.importance}`}
                    key={`${item.storyId}-${item.event.id}`}
                    onContextMenu={(event) => openContextMenu(event, eventContextMenu(item))}
                  >
                    <div className="event-card-head">
                      <span>{item.event.importance}</span>
                      <span className="event-status">{item.event.status}</span>
                    </div>
                    <strong>{item.event.title}</strong>
                    <p>{item.event.summary}</p>
                    {item.event.participants.length ? (
                      <small>参与：{item.event.participants.join('、')}</small>
                    ) : null}
                    {item.event.consequences.length ? (
                      <div className="event-consequences">
                        {item.event.consequences.map((consequence) => (
                          <span key={consequence}>{consequence}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="event-card-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => startEdit(item)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger-ghost btn-sm"
                        onClick={() => deleteEvent(item.storyId, item.event.id)}
                      >
                        <IconTrash size={13} />
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
          {pageCount > 1 ? (
            <div className="event-pagebar">
              <span>
                第 {safePage + 1} / {pageCount} 页
              </span>
              <div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={safePage <= 0}
                  onClick={() => setChapterPage((page) => Math.max(0, page - 1))}
                >
                  上一页
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setChapterPage((page) => Math.min(pageCount - 1, page + 1))}
                >
                  下一页
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <div className="unresolved-board">
        <div className="drawer-section-head">
          <span>未解决事项</span>
          <strong>{openThreads.length}</strong>
        </div>
        {openThreads.length === 0 ? (
          <p className="drawer-empty">暂时没有未解决事项。</p>
        ) : (
          openThreads.map((thread) => (
            <div className="unresolved-row" key={thread.id}>
              <span>{thread.text}</span>
              <select
                className="input select unresolved-priority"
                value={thread.priority}
                aria-label={`${thread.text}的优先级`}
                onChange={(event) =>
                  setThreadPriority(
                    thread.id,
                    event.target.value as 'main' | 'side' | 'background',
                  )
                }
              >
                <option value="main">主线</option>
                <option value="side">支线</option>
                <option value="background">氛围</option>
              </select>
              <button
                type="button"
                className="icon-btn"
                aria-label="标记为已解决"
                onClick={() => resolveThread(thread.id)}
              >
                ✓
              </button>
            </div>
          ))
        )}
      </div>

      {editing && draft ? (
        <Modal
          title={isNew ? '手动添加事件' : '编辑事件'}
          subtitle={editing.chapterTitle}
          onClose={() => {
            setEditing(null)
            setDraft(null)
            setIsNew(false)
          }}
          size="lg"
          footer={
            <div className="record-modal-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEditing(null)
                  setDraft(null)
                  setIsNew(false)
                }}
              >
                取消
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={saveEdit}>
                {isNew ? '添加事件' : '保存事件'}
              </button>
            </div>
          }
        >
          <div className="record-form-grid">
            <label className="record-field record-field-wide">
              <span>事件标题</span>
              <input
                className="input drawer-input"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>
            <label className="record-field record-field-wide">
              <span>事件经过</span>
              <textarea
                className="input drawer-textarea"
                rows={3}
                value={draft.summary}
                onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
              />
            </label>
            <label className="record-field">
              <span>参与者（顿号分隔）</span>
              <input
                className="input drawer-input"
                value={draft.participants.join('、')}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    participants: event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
                  })
                }
              />
            </label>
            <label className="record-field">
              <span>地点</span>
              <input
                className="input drawer-input"
                value={draft.location}
                onChange={(event) => setDraft({ ...draft, location: event.target.value })}
              />
            </label>
            <label className="record-field">
              <span>重要度</span>
              <select
                className="input select drawer-input"
                value={draft.importance}
                onChange={(event) =>
                  setDraft({ ...draft, importance: event.target.value as StoryEventImportance })
                }
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </label>
            <label className="record-field">
              <span>状态</span>
              <select
                className="input select drawer-input"
                value={draft.status}
                onChange={(event) =>
                  setDraft({ ...draft, status: event.target.value as StoryEventStatus })
                }
              >
                <option value="canon">已发生</option>
                <option value="rumor">传闻</option>
                <option value="retconned">已推翻</option>
              </select>
            </label>
            <label className="record-field record-field-wide">
              <span>原因</span>
              <input
                className="input drawer-input"
                value={draft.cause}
                onChange={(event) => setDraft({ ...draft, cause: event.target.value })}
              />
            </label>
            <label className="record-field record-field-wide">
              <span>结果</span>
              <input
                className="input drawer-input"
                value={draft.result}
                onChange={(event) => setDraft({ ...draft, result: event.target.value })}
              />
            </label>
            <label className="record-field record-field-wide">
              <span>后果 / 未解决事项（换行分隔）</span>
              <textarea
                className="input drawer-textarea"
                rows={3}
                value={draft.consequences.join('\n')}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    consequences: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean),
                  })
                }
              />
            </label>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
