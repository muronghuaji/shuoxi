import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  Chapter,
  DetailMode,
  OutlineCard,
  Prompt,
  RelationshipCard,
  Work,
  WorkDetail,
  WorldTemplate,
} from '../types'
import { PERSPECTIVES } from '../data'
import { chapterWords, countWords, formatRelative, formatWords } from '../utils'
import {
  IconChevronLeft,
  IconChevronRight,
  IconMaximize,
  IconPanelRight,
  IconPlus,
  IconSparkles,
  IconTrash,
  IconX,
} from './Icons'
import { GenrePicker } from './GenrePicker'
import { NumberInput } from './NumberInput'
import { RelationshipGraph } from './RelationshipGraph'
import { CharacterCardGrid } from './CharacterCardGrid'
import { FactionCardGrid } from './FactionCardGrid'
import { StoryMemoryPanel } from './StoryMemoryPanel'
import { SpeciesPanel } from './SpeciesPanel'
import { OutlinePanel } from './OutlinePanel'
import { ForeshadowingsPanel } from './ForeshadowingsPanel'
import { LocationsPanel } from './LocationsPanel'
import { ItemsPanel } from './ItemsPanel'
import { ModulesPanel } from './ModulesPanel'
import { StylePanel } from './StylePanel'
import { EventsPanel } from './EventsPanel'
import { SystemPanel } from './SystemPanel'
import { WorldTemplateModal } from './WorldTemplateModal'
import { resolveWorldTemplate } from '../worldTemplates'
import { rollbackStoryState } from '../storyState'
import { resolveWritingMode, resolveContextOptions } from '../writingMode'
import { useContextMenu, type ContextMenuEntry } from './ContextMenuProvider'
import { copyTextToClipboard } from '../clipboard'
import type { ArchiveJob } from '../archiveQueue'

const TABS = [
  { id: 'overview', label: '总览' },
  { id: 'intro', label: '简介' },
  { id: 'characters', label: '角色' },
  { id: 'species', label: '物种' },
  { id: 'factions', label: '势力' },
  { id: 'relations', label: '关系网' },
  { id: 'modules', label: '设定模块' },
  { id: 'chapters', label: '章节' },
  { id: 'outline', label: '大纲' },
  { id: 'locations', label: '地点' },
  { id: 'items', label: '物品' },
  { id: 'events', label: '事件簿' },
  { id: 'promises', label: '故事记忆' },
  { id: 'foreshadow', label: '伏笔' },
  { id: 'style', label: '风格' },
  { id: 'system', label: '系统' },
  { id: 'analysis', label: '剧情分析' },
  { id: 'prompts', label: '提示词' },
] as const

type TabId = (typeof TABS)[number]['id']

const TAB_GROUPS: { label: string; ids: TabId[] }[] = [
  { label: '案头', ids: ['overview'] },
  { label: '设定', ids: ['intro', 'style', 'locations', 'items', 'system'] },
  { label: '人物', ids: ['characters', 'species', 'factions', 'relations'] },
  { label: '叙事', ids: ['modules', 'chapters', 'outline', 'events', 'promises', 'foreshadow'] },
  { label: 'AI', ids: ['analysis', 'prompts'] },
]

const TAB_META: Record<TabId, string> = {
  overview: '进度、家底与最近在写的现场',
  intro: '故事的基本盘、世界观与叙事视角',
  characters: '人物的身份、性格与目标',
  species: '物种、种族与生命形态',
  factions: '组织、阵营与权力关系',
  relations: '人物之间的连接与张力',
  modules: '已启用的题材设定模块与工作台',
  chapters: '章节结构、字数与写作进度',
  outline: '下一章写什么：目标、冲突与状态',
  locations: '地点关系与空间秩序',
  items: '分类、品阶与物品库',
  events: '已发生事件、未解决事项与承接简报',
  promises: '卷级记忆、事实库、剧情账本与认知矩阵',
  foreshadow: '伏笔链、计划回收与逾期线索',
  style: '文风、节奏与禁忌',
  system: '系统人格、任务、奖励与日志',
  analysis: 'AI 对节奏、人物与伏笔的审阅',
  prompts: '本作启用的写作规则',
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

interface WorkDetailDrawerProps {
  mode: DetailMode
  onModeChange: (mode: DetailMode) => void
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  activeChapterId: string
  prompts: Prompt[]
  focusTabRequest?: { tab: string; requestId: number } | null
  focusEntityRequest?: { category: string; id: string; requestId: number } | null
  api: ApiConfig
  apiReady: boolean
  generalApi: ApiConfig
  generalApiReady: boolean
  analyzing: boolean
  onRecordUsage?: (entry: AiUsageEntry) => void
  onUpdateWork: (patch: Partial<Work>) => void
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onUpdateChapter: (chapterId: string, patch: Partial<Chapter>) => void
  onSelectChapter: (chapterId: string) => void
  onAddChapter: () => void
  onDeleteChapter: (chapterId: string) => void
  onRenameChapter: (chapterId: string, title: string) => void
  onOpenPromptPicker: () => void
  onAnalyze: () => void
  onOpenPromptLibrary: () => void
  onToast: (message: string) => void
  onSyncState?: () => void
  syncingState?: boolean
  onCreateChapterFromOutline?: (title: string) => string
  onStartFromOutline?: (card: OutlineCard) => void
  onAuditContinuity?: () => void
  auditingContinuity?: boolean
  onRepairContinuity?: () => void
  repairingContinuity?: boolean
  onSyncAll?: () => void
  syncingAll?: boolean
  syncAllProgress?: number
  archiveJobs?: ArchiveJob[]
  onQueueFactionArchive?: (factionId: string) => void
  assistantOpen?: boolean
  onToggleAssistant?: () => void
  readOnly?: boolean
}

export function WorkDetailDrawer({
  mode,
  onModeChange,
  work,
  detail,
  chapters,
  activeChapterId,
  prompts,
  focusTabRequest,
  focusEntityRequest,
  api,
  apiReady,
  generalApi,
  generalApiReady,
  analyzing,
  onRecordUsage,
  onUpdateWork,
  onUpdateDetail,
  onUpdateChapter,
  onSelectChapter,
  onAddChapter,
  onDeleteChapter,
  onRenameChapter,
  onOpenPromptPicker,
  onAnalyze,
  onOpenPromptLibrary,
  onToast,
  onSyncState,
  syncingState = false,
  onCreateChapterFromOutline,
  onStartFromOutline,
  onAuditContinuity,
  auditingContinuity = false,
  onRepairContinuity,
  repairingContinuity = false,
  onSyncAll,
  syncingAll = false,
  syncAllProgress = 0,
  archiveJobs = [],
  onQueueFactionArchive,
  assistantOpen = false,
  onToggleAssistant,
  readOnly = false,
}: WorkDetailDrawerProps) {
  const [tab, setTab] = useState<TabId>('intro')
  const { openContextMenu } = useContextMenu()
  const [templateOpen, setTemplateOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLButtonElement>(null)
  const gripRef = useRef<HTMLButtonElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  const previousModeRef = useRef<DetailMode>(mode)

  useEffect(() => {
    if (!readOnly) return
    document.body.classList.add('entity-readonly-mode')
    return () => document.body.classList.remove('entity-readonly-mode')
  }, [readOnly])

  const activePrompts = prompts.filter((prompt) => work.promptIds.includes(prompt.id))
  const activeTab = TABS.find((item) => item.id === tab) ?? TABS[0]
  const worldTemplate = resolveWorldTemplate(detail)
  const templateTabs = TABS.filter(
    (item) => item.id !== 'system' || worldTemplate.features.system,
  )
  const visibleTabs =
    mode === 'fullscreen'
      ? templateTabs
      : templateTabs.filter((item) => item.id !== 'overview')

  useEffect(() => {
    if (!focusTabRequest?.tab) return
    if (TABS.some((item) => item.id === focusTabRequest.tab)) {
      setTab(focusTabRequest.tab as TabId)
    }
  }, [focusTabRequest])

  useEffect(() => {
    if (mode !== 'fullscreen' && tab === 'overview') setTab('intro')
  }, [mode, tab])

  useEffect(() => {
    if (tab === 'system' && !worldTemplate.features.system) setTab('intro')
  }, [tab, worldTemplate.features.system])

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [tab, mode])

  useEffect(() => {
    const previous = previousModeRef.current
    previousModeRef.current = mode
    if (previous === mode) return
    if (mode === 'fullscreen' && tab === 'intro') {
      setTab('overview')
    }
    if (mode === 'fullscreen') {
      backRef.current?.focus()
      return
    }
    if (mode === 'collapsed') {
      railRef.current?.focus()
      return
    }
    gripRef.current?.focus()
  }, [mode])

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [tab])

  useEffect(() => {
    if (mode !== 'fullscreen') return
    document
      .getElementById(`detail-tab-${tab}`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [mode, tab])

  const renderTab = (id: TabId) => {
    const item = TABS.find((candidate) => candidate.id === id)
    if (!item) return null
    return (
      <button
        key={item.id}
        id={`detail-tab-${item.id}`}
        type="button"
        role="tab"
        aria-selected={tab === item.id}
        aria-controls="detail-panel-content"
        className={`detail-tab ${tab === item.id ? 'active' : ''}`}
        onClick={() => setTab(item.id)}
        onContextMenu={(event) =>
          openContextMenu(event, [
            { type: 'label', label: `分区 · ${item.label}` },
            { label: '打开这个分区', onSelect: () => setTab(item.id) },
            {
              label: '复制分区名称',
              onSelect: () => {
                void copyTextToClipboard(item.label)
              },
            },
          ])
        }
      >
        {item.label}
      </button>
    )
  }

  return (
    <aside
      className={`detail-drawer ${readOnly ? 'detail-readonly' : ''}`}
      data-mode={mode}
      id="work-detail-panel"
      aria-label={mode === 'fullscreen' ? '作品详情（全屏）' : '作品详情'}
      role={mode === 'fullscreen' ? 'region' : undefined}
    >
      {mode === 'collapsed' ? (
        <div className="detail-collapsed">
          {onToggleAssistant ? (
            <button
              type="button"
              className={`detail-rail-ai ${assistantOpen ? 'active' : ''}`}
              onClick={onToggleAssistant}
              aria-label={assistantOpen ? '收起 AI 灵感助手' : '展开 AI 灵感助手'}
              aria-expanded={assistantOpen}
              title="AI 灵感助手：聊思路、灵感和剧情走向"
            >
              <IconSparkles size={16} />
              <span className="detail-rail-ai-text">AI 灵感</span>
            </button>
          ) : null}
          <button
            type="button"
            className="detail-rail"
            ref={railRef}
            onClick={() => onModeChange('expanded')}
            aria-label="展开作品详情"
            aria-expanded={false}
            aria-controls="work-detail-panel"
          >
            <IconPanelRight size={17} />
            <span className="detail-rail-text">作品详情</span>
            <IconChevronLeft size={14} />
          </button>
        </div>
      ) : (
        <>
          {mode === 'expanded' ? (
            <button
              type="button"
              className="detail-grip"
              ref={gripRef}
              onClick={() => onModeChange('fullscreen')}
              aria-label="二次拓展：占满写作区"
              title="二次拓展：占满写作区"
              aria-controls="work-detail-panel"
            >
              <IconMaximize size={14} />
              <span>全屏</span>
            </button>
          ) : null}
          <div className="detail-panel">
            <header className="detail-head">
              <div className="detail-head-slot">
                {mode === 'fullscreen' ? (
                  <button
                    type="button"
                    className="icon-btn detail-head-btn"
                    ref={backRef}
                    onClick={() => onModeChange('expanded')}
                    aria-label="返回侧栏"
                    title="返回侧栏（一次展开）"
                  >
                    <IconChevronLeft size={18} />
                  </button>
                ) : null}
              </div>
              <div className="detail-head-title">
                <p className="detail-eyebrow">作品详情</p>
                <h2 title={work.title}>{work.title}</h2>
              </div>
              <div className="detail-head-slot detail-head-slot-end">
                <button
                  type="button"
                  className="icon-btn detail-head-btn"
                  onClick={() => onModeChange('collapsed')}
                  aria-label="收起作品详情"
                  title="收起作品详情"
                >
                  <IconX size={18} />
                </button>
              </div>
            </header>

            <div
              className={`detail-tabs ${mode === 'fullscreen' ? 'grouped' : ''}`}
              role="tablist"
              aria-label="作品详情分区"
              aria-orientation={mode === 'fullscreen' ? 'vertical' : 'horizontal'}
            >
              {mode === 'fullscreen'
                ? TAB_GROUPS.map((group) => {
                    const ids = group.ids.filter((id) =>
                      visibleTabs.some((item) => item.id === id),
                    )
                    if (ids.length === 0) return null
                    return (
                      <div className="detail-tab-group" key={group.label} role="presentation">
                        <span className="detail-tab-group-label">{group.label}</span>
                        {ids.map((id) => renderTab(id))}
                      </div>
                    )
                  })
                : visibleTabs.map((item) => renderTab(item.id))}
            </div>

            <div
              className="detail-content"
              role="tabpanel"
              id="detail-panel-content"
              aria-labelledby={`detail-tab-${tab}`}
              data-tab={tab}
              ref={contentRef}
              onClickCapture={
                readOnly
                  ? (event) => {
                      const target = event.target as HTMLElement
                      if (target.closest('.modal')) return
                      const entityCard = target.closest<HTMLElement>(
                        '[data-entity-kind][data-entity-id]',
                      )
                      if (entityCard) return
                      if (
                        target.closest('button, a, input, textarea, select, [contenteditable="true"]')
                      ) {
                        event.preventDefault()
                        event.stopPropagation()
                      }
                    }
                  : undefined
              }
              onKeyDownCapture={
                readOnly
                  ? (event) => {
                      if ((event.target as HTMLElement).closest('.modal')) return
                      event.preventDefault()
                      event.stopPropagation()
                    }
                  : undefined
              }
              onContextMenu={
                readOnly
                  ? (event) => {
                      if ((event.target as HTMLElement).closest('.modal')) return
                      event.preventDefault()
                      event.stopPropagation()
                    }
                  : undefined
              }
            >
              {mode === 'fullscreen' ? (
                <div className="detail-focus-head">
                  <span>当前分区</span>
                  <h3>{activeTab.label}</h3>
                  <p>{TAB_META[activeTab.id]}</p>
                </div>
              ) : null}
              {tab === 'overview' ? (
                <OverviewPanel
                  work={work}
                  detail={detail}
                  chapters={chapters}
                  activeChapterId={activeChapterId}
                  activePrompts={activePrompts}
                  worldTemplate={worldTemplate}
                  onOpenTemplate={() => setTemplateOpen(true)}
                  onUpdateDetail={onUpdateDetail}
                  onGoToTab={setTab}
                />
              ) : null}
              {tab === 'intro' ? (
                <IntroPanel
                  work={work}
                  detail={detail}
                  worldTemplate={worldTemplate}
                  onOpenTemplate={() => setTemplateOpen(true)}
                  onUpdateWork={onUpdateWork}
                  onUpdateDetail={onUpdateDetail}
                />
              ) : null}
              {tab === 'characters' ? (
                <CharacterCardGrid
                  work={work}
                  detail={detail}
                  chapters={chapters}
                  worldTemplate={worldTemplate}
                  api={generalApi}
                  apiReady={generalApiReady}
                  onRecordUsage={onRecordUsage}
                  onToast={onToast}
                  onUpdateDetail={onUpdateDetail}
                  onOpenTab={setTab}
                  archiveJobs={archiveJobs}
                  onQueueFactionArchive={onQueueFactionArchive}
                  focusRequest={
                    focusEntityRequest?.category === 'character' ? focusEntityRequest : null
                  }
                />
              ) : null}
              {tab === 'species' ? (
                <SpeciesPanel
                  work={work}
                  detail={detail}
                  api={generalApi}
                  apiReady={generalApiReady}
                  onRecordUsage={onRecordUsage}
                  onToast={onToast}
                  onUpdateDetail={onUpdateDetail}
                  onOpenTab={setTab}
                  focusRequest={
                    focusEntityRequest?.category === 'species' ? focusEntityRequest : null
                  }
                />
              ) : null}
              {tab === 'factions' ? (
                <FactionCardGrid
                  work={work}
                  detail={detail}
                  worldTemplate={worldTemplate}
                  api={generalApi}
                  apiReady={generalApiReady}
                  onRecordUsage={onRecordUsage}
                  onToast={onToast}
                  onUpdateDetail={onUpdateDetail}
                  focusRequest={
                    focusEntityRequest?.category === 'faction' ? focusEntityRequest : null
                  }
                />
              ) : null}
              {tab === 'relations' ? (
                <RelationsPanel
                  detail={detail}
                  onUpdateDetail={onUpdateDetail}
                  onToast={onToast}
                />
              ) : null}
              {tab === 'modules' ? (
                <ModulesPanel
                  work={work}
                  detail={detail}
                  chapters={chapters}
                  worldTemplate={worldTemplate}
                  api={generalApi}
                  apiReady={generalApiReady}
                  onUpdateDetail={onUpdateDetail}
                  onRecordUsage={onRecordUsage}
                  onToast={onToast}
                />
              ) : null}
              {tab === 'locations' ? (
                <LocationsPanel
                  work={work}
                  detail={detail}
                  chapters={chapters}
                  activeChapterId={activeChapterId}
                  api={generalApi}
                  apiReady={generalApiReady}
                  onRecordUsage={onRecordUsage}
                  onToast={onToast}
                  onUpdateDetail={onUpdateDetail}
                  focusRequest={
                    focusEntityRequest?.category === 'location' ? focusEntityRequest : null
                  }
                />
              ) : null}
              {tab === 'items' ? (
                <ItemsPanel
                  work={work}
                  detail={detail}
                  worldTemplate={worldTemplate}
                  api={generalApi}
                  apiReady={generalApiReady}
                  onRecordUsage={onRecordUsage}
                  onUpdateDetail={onUpdateDetail}
                  onToast={onToast}
                  focusRequest={
                    focusEntityRequest?.category === 'item' ? focusEntityRequest : null
                  }
                />
              ) : null}
              {tab === 'chapters' ? (
                <ChaptersPanel
                  chapters={chapters}
                  activeChapterId={activeChapterId}
                  detail={detail}
                  onSelectChapter={onSelectChapter}
                  onAddChapter={onAddChapter}
                  onDeleteChapter={onDeleteChapter}
                  onRenameChapter={onRenameChapter}
                  onUpdateChapter={onUpdateChapter}
                  onSyncState={onSyncState}
                  onToast={onToast}
                  syncingState={syncingState}
                />
              ) : null}
              {tab === 'outline' ? (
                <OutlinePanel
                  work={work}
                  detail={detail}
                  chapters={chapters}
                  activeChapterId={activeChapterId}
                  api={generalApi}
                  apiReady={generalApiReady}
                  onRecordUsage={onRecordUsage}
                  onUpdateDetail={onUpdateDetail}
                  onSelectChapter={onSelectChapter}
                  onCreateChapter={onCreateChapterFromOutline}
                  onStartFromOutline={onStartFromOutline}
                  onToast={onToast}
                />
              ) : null}
              {tab === 'events' ? (
                <div className="events-page">
                  <EventsPanel
                    work={work}
                    detail={detail}
                    chapters={chapters}
                    activeChapterId={activeChapterId}
                    api={api}
                    apiReady={apiReady}
                    onRecordUsage={onRecordUsage}
                    onToast={onToast}
                    onUpdateDetail={onUpdateDetail}
                    onAuditContinuity={onAuditContinuity}
                    auditingContinuity={auditingContinuity}
                    onRepairContinuity={onRepairContinuity}
                    repairingContinuity={repairingContinuity}
                    onSyncAll={onSyncAll}
                    syncingAll={syncingAll}
                    syncAllProgress={syncAllProgress}
                  />
                </div>
              ) : null}
              {tab === 'promises' ? (
                <StoryMemoryPanel
                  workId={work.id}
                  workTitle={work.title}
                  api={api}
                  detail={detail}
                  chapters={chapters}
                  activeChapterId={activeChapterId}
                  onUpdateDetail={onUpdateDetail}
                  onToast={onToast}
                />
              ) : null}
              {tab === 'foreshadow' ? (
                <ForeshadowingsPanel
                  detail={detail}
                  chapters={chapters}
                  activeChapterId={activeChapterId}
                  onUpdateDetail={onUpdateDetail}
                  onSelectChapter={onSelectChapter}
                  onToast={onToast}
                />
              ) : null}
              {tab === 'style' ? (
                <StylePanel
                  work={work}
                  detail={detail}
                  chapters={chapters}
                  activeChapterId={activeChapterId}
                  api={api}
                  apiReady={apiReady}
                  onUpdateDetail={onUpdateDetail}
                  onUpdateChapter={onUpdateChapter}
                  onRecordUsage={onRecordUsage}
                  onToast={onToast}
                />
              ) : null}
              {tab === 'system' ? (
                <SystemPanel detail={detail} chapters={chapters} onUpdateDetail={onUpdateDetail} />
              ) : null}
              {tab === 'analysis' ? (
                <AnalysisPanel
                  detail={detail}
                  chapters={chapters}
                  apiReady={apiReady}
                  analyzing={analyzing}
                  onAnalyze={onAnalyze}
                  onUpdateDetail={onUpdateDetail}
                  onToast={onToast}
                />
              ) : null}
              {tab === 'prompts' ? (
                <PromptsPanel
                  activePrompts={activePrompts}
                  onOpenPromptPicker={onOpenPromptPicker}
                  onOpenPromptLibrary={onOpenPromptLibrary}
                />
              ) : null}
            </div>
          </div>
        </>
      )}
      {templateOpen ? (
        <WorldTemplateModal
          template={worldTemplate}
          api={generalApi}
          apiReady={generalApiReady}
          onToast={onToast}
          onClose={() => setTemplateOpen(false)}
          onSave={(next) => {
            onUpdateDetail({ worldTemplateId: next.id, worldTemplate: next })
            setTemplateOpen(false)
            onToast(`已应用世界模板：${next.name}`)
          }}
        />
      ) : null}
    </aside>
  )
}

interface OverviewPanelProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  activeChapterId: string
  activePrompts: Prompt[]
  worldTemplate: WorldTemplate
  onOpenTemplate: () => void
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onGoToTab: (tab: TabId) => void
}

function calculateRhythm(chapters: Chapter[]) {
  let totalWords = 0
  let dialogueWords = 0
  let paragraphCount = 0
  let longestParagraph = 0
  const emptyChapters = chapters.filter((chapter) => !chapter.content.trim()).length

  for (const chapter of chapters) {
    const text = chapter.content
    totalWords += countWords(text)
    const quotes = text.match(/“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』/g) ?? []
    for (const quote of quotes) {
      dialogueWords += countWords(quote.replace(/[“”"「」『』]/g, ''))
    }
    const paragraphs = text
      .split(/\n+/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
    paragraphCount += paragraphs.length
    for (const paragraph of paragraphs) {
      longestParagraph = Math.max(longestParagraph, countWords(paragraph))
    }
  }

  return {
    totalWords,
    dialogueRatio: totalWords > 0 ? (dialogueWords / totalWords) * 100 : 0,
    averageParagraph: paragraphCount > 0 ? totalWords / paragraphCount : 0,
    longestParagraph,
    emptyChapters,
  }
}

function OverviewPanel({
  work,
  detail,
  chapters,
  activeChapterId,
  activePrompts,
  worldTemplate,
  onOpenTemplate,
  onUpdateDetail,
  onGoToTab,
}: OverviewPanelProps) {
  const rhythm = useMemo(() => calculateRhythm(chapters), [chapters])
  const pending = detail.foreshadowings.filter((item) => item.status === '未回收')
  const completed = detail.foreshadowings.length - pending.length
  const currentIndex = chapters.findIndex((chapter) => chapter.id === activeChapterId)
  const current = chapters[currentIndex] ?? chapters[0]
  const writtenChapters = chapters.filter((chapter) => chapter.content.trim()).length
  const progress =
    work.targetWords > 0 ? Math.min(100, (rhythm.totalWords / work.targetWords) * 100) : null
  const analysisPreview = detail.analysis.trim()
    ? detail.analysis
        .replace(/[#*_`>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220)
    : ''
  const recent = [...chapters]
    .filter((chapter) => chapter.content.trim())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3)

  const checks: { title: string; detail: string; tab: TabId }[] = []
  if (!work.synopsis.trim()) {
    checks.push({ title: '补一句简介', detail: '读者和 AI 都需要一句话梗概', tab: 'intro' })
  }
  if (!detail.worldview.trim()) {
    checks.push({ title: '补世界观', detail: '时代、地点、规则还没落笔', tab: 'intro' })
  }
  if (detail.characters.length === 0) {
    checks.push({ title: '建人物档案', detail: '没有角色，AI 只能写空场', tab: 'characters' })
  }
  if (rhythm.emptyChapters > 0) {
    checks.push({
      title: '补空章',
      detail: `${rhythm.emptyChapters} 章还没有正文`,
      tab: 'chapters',
    })
  }
  if (pending.length > 0) {
    checks.push({
      title: '收伏笔',
      detail: `${pending.length} 条线索还没有回收`,
      tab: 'foreshadow',
    })
  }
  if (!detail.analysis.trim()) {
    checks.push({ title: '做一次剧情分析', detail: '让 AI 读一遍现有章节', tab: 'analysis' })
  }
  if (work.targetWords === 0) {
    checks.push({ title: '设定目标字数', detail: '没有目标，进度无法计算', tab: 'intro' })
  }

  return (
    <div className="overview">
      <header className="overview-hero">
        <div className="overview-hero-copy">
          <p className="overview-eyebrow">案头 · 折子</p>
          <h3>写到哪儿了</h3>
          <p>
            {work.status} · {work.genres.join(' / ') || '未定题材'} · 最近更新{' '}
            {formatRelative(work.updatedAt)}
          </p>
          <p className="overview-template-line">
            世界模板：
            <button type="button" className="overview-template-link" onClick={onOpenTemplate}>
              {worldTemplate.name}
            </button>
            <span> · {worldTemplate.terms.faction} / {worldTemplate.terms.rank}</span>
          </p>
        </div>
        <div className="overview-progress">
          <strong>{progress === null ? '—' : `${progress.toFixed(2)}%`}</strong>
          <div
            className="overview-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress === null ? 0 : Math.round(progress)}
            aria-label="目标字数进度"
          >
            <span style={{ width: `${progress ?? 0}%` }} />
          </div>
          <small>
            {formatWords(rhythm.totalWords)} / 目标 {formatWords(work.targetWords)}
          </small>
        </div>
      </header>

      <div className="overview-metrics">
        <div className="overview-metric">
          <span>章节</span>
          <strong>{chapters.length}</strong>
          <small>{writtenChapters} 章有正文</small>
        </div>
        <div className="overview-metric">
          <span>正文</span>
          <strong>{formatWords(rhythm.totalWords)}</strong>
          <small>按实际章节统计</small>
        </div>
        <div className="overview-metric">
          <span>角色</span>
          <strong>{detail.characters.length}</strong>
          <small>{detail.factions.length} 个势力</small>
        </div>
        <div className="overview-metric">
          <span>未回收伏笔</span>
          <strong>{pending.length}</strong>
          <small>共 {detail.foreshadowings.length} 条</small>
        </div>
        <div className="overview-metric">
          <span>启用提示词</span>
          <strong>{activePrompts.length}</strong>
          <small>随每次生成</small>
        </div>
        <div className="overview-metric">
          <span>关系</span>
          <strong>{detail.relationships.length}</strong>
          <small>人物之间的连接</small>
        </div>
      </div>

      <div className="overview-grid">
        <section className="overview-card">
          <header className="overview-card-head">
            <div>
              <span>最近在写</span>
              <strong>
                {current ? `第 ${currentIndex >= 0 ? currentIndex + 1 : 1} 章` : '还没有章节'}
              </strong>
            </div>
            <button type="button" className="overview-link" onClick={() => onGoToTab('chapters')}>
              章节看板
            </button>
          </header>
          {current ? (
            <div className="overview-current">
              <strong>{current.title || '未命名章节'}</strong>
              <p>
                {chapterWords(current)} 字 · {formatRelative(current.updatedAt)}
              </p>
              <div className="overview-current-meter">
                <span
                  style={{
                    width: `${Math.min(100, Math.max(6, (chapterWords(current) / Math.max(1, rhythm.totalWords)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="drawer-empty">还没有章节，先在章节看板新建一章。</p>
          )}
          {recent.length > 0 ? (
            <div className="overview-recent">
              <span>最近落笔</span>
              {recent.map((chapter) => (
                <div key={chapter.id}>
                  <span>{chapter.title || '未命名章节'}</span>
                  <small>{chapterWords(chapter)} 字</small>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="overview-card">
          <header className="overview-card-head">
            <div>
              <span>伏笔线头</span>
              <strong>
                {pending.length} 未回收 · {completed} 已回收
              </strong>
            </div>
            <button
              type="button"
              className="overview-link"
              onClick={() => onGoToTab('foreshadow')}
            >
              伏笔
            </button>
          </header>
          {pending.length === 0 ? (
            <p className="drawer-empty">没有未回收的伏笔，桌面很干净。</p>
          ) : (
            <div className="overview-foreshadows">
              {pending.slice(0, 3).map((item) => (
                <div key={item.id}>
                  <strong>{item.title || '未命名伏笔'}</strong>
                  <span>{item.plantedIn || '埋设位置未标注'}</span>
                </div>
              ))}
              {pending.length > 3 ? <small>还有 {pending.length - 3} 条</small> : null}
            </div>
          )}
        </section>
      </div>

      <section className="overview-card overview-state-card">
        <header className="overview-card-head">
          <div>
            <span>当前剧情摘要 · 自动派生</span>
            <strong>{detail.currentSummary ? '截至最新章节' : '还没有同步'}</strong>
          </div>
        </header>
        {detail.currentSummary ? (
          <p className="overview-state-summary">{detail.currentSummary}</p>
        ) : (
          <p className="drawer-empty">
            生成一章后，系统会提取本章状态变化，生成当前剧情摘要；作者简介不会被覆盖。
          </p>
        )}
        {(detail.storyStateEvents?.length ?? 0) > 0 ? (
          <div className="overview-state-events">
            {[...(detail.storyStateEvents ?? [])]
              .slice(-4)
              .reverse()
              .map((event) => (
                <div key={event.id} className="overview-state-event">
                  <div>
                    <strong>{event.chapterTitle || '未命名章节'}</strong>
                    <small>{event.changes.length} 项状态变化</small>
                  </div>
                  <p>{event.summary || '没有摘要'}</p>
                </div>
              ))}
          </div>
        ) : null}
        {(detail.storyStateSnapshots?.length ?? 0) > 0 ? (
          <div className="overview-state-rollback">
            <span>状态快照</span>
            {[...(detail.storyStateSnapshots ?? [])]
              .slice(-4)
              .reverse()
              .map((snapshot) => (
                <button
                  key={snapshot.id}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (!window.confirm(`回滚到「${snapshot.chapterTitle || '本章'}」之前的状态？`)) {
                      return
                    }
                    const restored = rollbackStoryState(detail, snapshot.id)
                    if (restored) onUpdateDetail(restored)
                  }}
                >
                  回滚 · {snapshot.chapterTitle || '未命名章节'}
                </button>
              ))}
          </div>
        ) : null}
      </section>

      <section className="overview-card overview-analysis-glance">
        <header className="overview-card-head">
          <div>
            <span>分析摘要</span>
            <strong>{detail.analysis ? '编辑的批注' : '还没有批注'}</strong>
          </div>
          <button type="button" className="overview-link" onClick={() => onGoToTab('analysis')}>
            去剧情分析
          </button>
        </header>
        {analysisPreview ? (
          <p className="overview-analysis-text">{analysisPreview}…</p>
        ) : (
          <p className="drawer-empty">
            让 AI 读一遍现有章节和设定，检查节奏、人物一致性和伏笔回收情况。
          </p>
        )}
      </section>

      <section className="overview-card overview-checks">
        <header className="overview-card-head">
          <div>
            <span>作品体检</span>
            <strong>{checks.length > 0 ? `${checks.length} 件待办` : '基础设定齐整'}</strong>
          </div>
        </header>
        {checks.length > 0 ? (
          <div className="overview-check-list">
            {checks.map((check) => (
              <button
                key={check.title}
                type="button"
                className="overview-check"
                onClick={() => onGoToTab(check.tab)}
              >
                <span>
                  <strong>{check.title}</strong>
                  <small>{check.detail}</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="drawer-empty">简介、世界观、人物和章节都有底了，可以继续开写。</p>
        )}
      </section>

      <section className="overview-rhythm">
        <div className="overview-rhythm-head">
          <span>节奏度量</span>
          <small>本地统计，不是 AI 情感判断</small>
        </div>
        <div className="overview-rhythm-grid">
          <div>
            <strong>{rhythm.dialogueRatio.toFixed(1)}%</strong>
            <span>对白占比</span>
          </div>
          <div>
            <strong>{rhythm.averageParagraph.toFixed(1)}</strong>
            <span>平均段长</span>
          </div>
          <div>
            <strong>{rhythm.longestParagraph}</strong>
            <span>最长段字数</span>
          </div>
          <div>
            <strong>{rhythm.emptyChapters}</strong>
            <span>空章</span>
          </div>
        </div>
      </section>
    </div>
  )
}

interface IntroPanelProps {
  work: Work
  detail: WorkDetail
  worldTemplate: WorldTemplate
  onOpenTemplate: () => void
  onUpdateWork: (patch: Partial<Work>) => void
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
}

function IntroPanel({
  work,
  detail,
  worldTemplate,
  onOpenTemplate,
  onUpdateWork,
  onUpdateDetail,
}: IntroPanelProps) {
  const writingMode = resolveWritingMode(work, detail)
  const contextOptions = resolveContextOptions(work)
  const toggleContext = (
    key: 'globalOutline' | 'chapterOutline' | 'events' | 'state' | 'foreshadowings',
    value: boolean,
  ) => {
    onUpdateWork({ contextOptions: { ...contextOptions, [key]: value } })
  }
  return (
    <>
      <div className="world-template-bar">
        <div>
          <span>世界模板</span>
          <strong>{worldTemplate.name}</strong>
          <p>{worldTemplate.description || '当前作品使用通用世界模板。'}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenTemplate}>
          切换 / 编辑模板
        </button>
      </div>

      {detail.currentSummary ? (
        <div className="intro-current-summary">
          <span>当前剧情摘要 · 自动派生</span>
          <p>{detail.currentSummary}</p>
          <small>只作为展示，不覆盖作者简介。</small>
        </div>
      ) : null}

      <div className="drawer-field">
        <label htmlFor="detail-title">书名</label>
        <input
          id="detail-title"
          className="input drawer-input"
          value={work.title}
          onChange={(event) => onUpdateWork({ title: event.target.value })}
          placeholder="书名"
        />
      </div>

      <div className="drawer-field drawer-field-span2">
        <label htmlFor="detail-synopsis">简介</label>
        <textarea
          id="detail-synopsis"
          className="input drawer-textarea"
          value={work.synopsis}
          onChange={(event) => onUpdateWork({ synopsis: event.target.value })}
          placeholder="这本书大致讲什么？"
          rows={3}
        />
      </div>

      <div className="drawer-field">
        <label htmlFor="detail-theme">主题</label>
        <textarea
          id="detail-theme"
          className="input drawer-textarea"
          value={work.theme}
          onChange={(event) => onUpdateWork({ theme: event.target.value })}
          placeholder="这本书想表达什么？"
          rows={2}
        />
      </div>

      <div className="drawer-field drawer-field-span2">
        <label htmlFor="detail-worldview">世界观</label>
        <textarea
          id="detail-worldview"
          className="input drawer-textarea"
          value={detail.worldview}
          onChange={(event) => onUpdateDetail({ worldview: event.target.value })}
          placeholder="时代、地点、规则、社会结构、特殊设定……"
          rows={5}
        />
      </div>

      <div className="drawer-field">
        <span className="drawer-label">小说类型（可多选）</span>
        <GenrePicker value={work.genres} onChange={(genres) => onUpdateWork({ genres })} />
      </div>

      <div className="drawer-row">
        <div className="drawer-field">
          <label htmlFor="detail-perspective">叙事视角</label>
          <div className="select-wrap">
            <select
              id="detail-perspective"
              className="input select drawer-input"
              value={work.perspective}
              onChange={(event) =>
                onUpdateWork({ perspective: event.target.value as Work['perspective'] })
              }
            >
              {PERSPECTIVES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="drawer-field">
          <label htmlFor="detail-target">目标字数</label>
          <NumberInput
            id="detail-target"
            min={1000}
            step={10000}
            className="input drawer-input"
            value={work.targetWords}
            fallback={1000}
            onValueChange={(value) => onUpdateWork({ targetWords: value })}
          />
        </div>
      </div>

      <div className="drawer-field">
        <span className="drawer-label">写作模式</span>
        <div className="drawer-segment" role="group" aria-label="写作模式">
          <button
            type="button"
            className={writingMode === 'director' ? 'active' : ''}
            onClick={() => onUpdateWork({ writingMode: 'director' })}
          >
            导演模式
          </button>
          <button
            type="button"
            className={writingMode === 'wheelchair' ? 'active' : ''}
            onClick={() => onUpdateWork({ writingMode: 'wheelchair' })}
          >
            轮椅模式
          </button>
        </div>
      </div>

      <p className="drawer-hint">
        导演模式直接说戏，由事件簿负责连续性，大纲可在“大纲”页随时补充；轮椅模式只选章数和字数，AI 自动推进。切换模式不会删除大纲数据。
      </p>

      <div className="drawer-field">
        <span className="drawer-label">AI 上下文</span>
        <div className="context-options">
          {(
            [
              ['state', '角色 / 势力 / 状态'],
              ['events', '事件簿承接'],
              ['foreshadowings', '未回收伏笔'],
              ['globalOutline', '全局大纲'],
              ['chapterOutline', '当前章大纲'],
            ] as const
          ).map(([key, label]) => (
            <label className="context-option" key={key}>
              <input
                type="checkbox"
                checked={contextOptions[key]}
                onChange={(event) => toggleContext(key, event.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
      <p className="drawer-hint">
        取消勾选后，对应内容不会进入续写和剧情分析的 AI 上下文；本地数据不会被删除。
      </p>
    </>
  )
}

interface RelationsPanelProps {
  detail: WorkDetail
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onToast: (message: string) => void
}

function RelationsPanel({ detail, onUpdateDetail, onToast }: RelationsPanelProps) {
  const [scope, setScope] = useState<'character' | 'faction'>('character')
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph')
  const factionRelations = detail.factionRelations ?? []
  const characterRelations = detail.relationships
  const characterNodes = detail.characters.map((character) => ({
    id: character.id,
    name: character.name,
    role: character.role,
  }))
  const factionNodes = detail.factions.map((faction) => ({
    id: faction.id,
    name: faction.name,
    role: faction.type,
  }))
  const nodes = scope === 'character' ? characterNodes : factionNodes
  const relations = scope === 'character' ? characterRelations : factionRelations
  const label = scope === 'character' ? '角色' : '势力'
  const canRelate = nodes.length >= 2

  const saveRelations = (next: RelationshipCard[]) => {
    onUpdateDetail(
      scope === 'character' ? { relationships: next } : { factionRelations: next },
    )
  }

  const updateRelationship = (id: string, patch: Partial<RelationshipCard>) => {
    saveRelations(relations.map((relationship) =>
      relationship.id === id ? { ...relationship, ...patch } : relationship,
    ))
  }

  const addRelationship = () => {
    if (!canRelate) return
    saveRelations([
      ...relations,
      {
        id: uid(scope === 'character' ? 'r' : 'fr'),
        fromId: nodes[0].id,
        toId: nodes[1].id,
        type: '关联',
        note: '',
      },
    ])
  }

  const removeRelationship = (id: string) => {
    saveRelations(relations.filter((relationship) => relationship.id !== id))
  }

  return (
    <>
      <div className="drawer-section-head relation-panel-head">
        <div>
          <span>关系网</span>
          <small>{scope === 'character' ? '角色与角色' : '势力与势力'}</small>
        </div>
        <div className="relation-panel-actions">
          <span className="relation-scope-switch">
            <button
              type="button"
              className={scope === 'character' ? 'active' : ''}
              onClick={() => setScope('character')}
            >
              角色关系网
            </button>
            <button
              type="button"
              className={scope === 'faction' ? 'active' : ''}
              onClick={() => setScope('faction')}
            >
              势力关系网
            </button>
          </span>
          <span className="relation-scope-switch">
            <button
              type="button"
              className={viewMode === 'graph' ? 'active' : ''}
              onClick={() => setViewMode('graph')}
            >
              视图模式
            </button>
            <button
              type="button"
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
            >
              列表模式
            </button>
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={addRelationship}
            disabled={!canRelate}
          >
            <IconPlus size={14} />
            添加关系
          </button>
        </div>
      </div>

      {viewMode === 'graph' ? (
        <>
          <RelationshipGraph
            characters={nodes}
            relationships={relations}
            nodeLabel={label}
            onDeleteRelationship={removeRelationship}
            onToast={onToast}
          />
          {!canRelate ? (
            <p className="drawer-empty">
              先在「{scope === 'character' ? '角色' : '势力'}」里添加至少两个，才能建立关系。
            </p>
          ) : relations.length === 0 ? (
            <p className="drawer-empty">
              还没有{scope === 'character' ? '角色' : '势力'}关系记录。
            </p>
          ) : null}
        </>
      ) : !canRelate ? (
        <p className="drawer-empty">
          先在「{scope === 'character' ? '角色' : '势力'}」里添加至少两个，才能建立关系。
        </p>
      ) : relations.length === 0 ? (
        <p className="drawer-empty">
          还没有关系记录。{scope === 'character' ? '姐妹、师徒、宿敌、互相利用' : '结盟、敌对、联姻、暗中控制'}……关系越清楚，AI 写冲突时越不容易跑偏。
        </p>
      ) : (
        relations.map((relationship) => (
          <div className="entity-card" key={relationship.id}>
            <div className="relation-line">
              <div className="select-wrap">
                <select
                  className="input select drawer-input"
                  value={relationship.fromId}
                  onChange={(event) =>
                    updateRelationship(relationship.id, { fromId: event.target.value })
                  }
                  aria-label="关系起点"
                >
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name || '未命名'}
                    </option>
                  ))}
                </select>
              </div>
              <span className="relation-arrow">→</span>
              <div className="select-wrap">
                <select
                  className="input select drawer-input"
                  value={relationship.toId}
                  onChange={(event) =>
                    updateRelationship(relationship.id, { toId: event.target.value })
                  }
                  aria-label="关系终点"
                >
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name || '未命名'}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="icon-btn entity-remove"
                title="删除关系"
                aria-label="删除关系"
                onClick={() => removeRelationship(relationship.id)}
              >
                <IconTrash size={14} />
              </button>
            </div>

            <input
              className="input drawer-input"
              value={relationship.type}
              onChange={(event) =>
                updateRelationship(relationship.id, { type: event.target.value })
              }
              placeholder={
                scope === 'character'
                  ? '关系类型：姐妹 / 师徒 / 敌对 / 互相利用'
                  : '势力关系：结盟 / 敌对 / 联姻 / 暗中控制'
              }
            />

            <input
              className="input drawer-input"
              value={relationship.note}
              onChange={(event) =>
                updateRelationship(relationship.id, { note: event.target.value })
              }
              placeholder="关系备注"
            />
          </div>
        ))
      )}
    </>
  )
}

interface ChaptersPanelProps {
  chapters: Chapter[]
  activeChapterId: string
  detail: WorkDetail
  onSelectChapter: (chapterId: string) => void
  onAddChapter: () => void
  onDeleteChapter: (chapterId: string) => void
  onRenameChapter: (chapterId: string, title: string) => void
  onUpdateChapter?: (chapterId: string, patch: Partial<Chapter>) => void
  onSyncState?: () => void
  onToast: (message: string) => void
  syncingState?: boolean
}

function ChaptersPanel({
  chapters,
  activeChapterId,
  detail,
  onSelectChapter,
  onAddChapter,
  onDeleteChapter,
  onRenameChapter,
  onUpdateChapter,
  onSyncState,
  onToast,
  syncingState = false,
}: ChaptersPanelProps) {
  const { openContextMenu } = useContextMenu()
  const activeIndex = Math.max(
    0,
    chapters.findIndex((chapter) => chapter.id === activeChapterId),
  )
  const [chartMode, setChartMode] = useState<'bar' | 'line'>('bar')
  const activeChapter = chapters[activeIndex] ?? chapters[0]
  const totalWords = chapters.reduce((sum, chapter) => sum + chapterWords(chapter), 0)
  const wordValues = chapters.map((chapter) => chapterWords(chapter))
  const maxWords = Math.max(1, ...wordValues)
  const minWords = wordValues.length > 0 ? Math.min(...wordValues) : 0
  const wordRange = Math.max(1, maxWords - minWords)
  const labelsEvery = Math.max(1, Math.ceil(chapters.length / 8))
  const chartWidth = 1000
  const chartHeight = 100
  const chartPadX = 18
  const chartTop = 10
  const chartBottom = 20
  const chartInnerWidth = chartWidth - chartPadX * 2
  const chartInnerHeight = chartHeight - chartTop - chartBottom
  const chartPoints = chapters.map((chapter, index) => {
    const words = chapterWords(chapter)
    const ratio = chapters.length <= 1 ? 0.5 : index / (chapters.length - 1)
    return {
      x: chartPadX + ratio * chartInnerWidth,
      y: chartTop + (1 - (words - minWords) / wordRange) * chartInnerHeight,
      words,
      index,
    }
  })
  const chartLine = chartPoints.map((point) => `${point.x},${point.y}`).join(' ')
  const chartArea =
    chartPoints.length > 0
      ? `M ${chartPoints[0].x} ${chartHeight - chartBottom} L ${chartLine
          .split(' ')
          .join(' L ')} L ${chartPoints[chartPoints.length - 1].x} ${chartHeight - chartBottom} Z`
      : ''
  const readingRef = useRef<HTMLDivElement>(null)
  const activeContent = activeChapter?.content ?? ''
  const activeWords = countWords(activeContent)
  const paragraphs = activeContent
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  const dialogueChars = (activeContent.match(/“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』/g) ?? [])
    .join('')
    .replace(/[“”"「」『』]/g, '').length
  const dialogueRatio = activeWords > 0 ? (dialogueChars / activeWords) * 100 : 0
  const appearingCharacters = detail.characters.filter(
    (character) => character.name.trim() && activeContent.includes(character.name.trim()),
  )
  const chapterLabel = `第 ${activeIndex + 1} 章`
  const relatedForeshadows = detail.foreshadowings.filter(
    (item) =>
      item.plantedChapterId === activeChapterId ||
      item.payoffChapterId === activeChapterId ||
      item.plantedIn.includes(chapterLabel) ||
      item.plantedIn.includes(chapterLabel.replace(' ', '')) ||
      (activeChapter?.title ? item.plantedIn.includes(activeChapter.title) : false),
  )

  useEffect(() => {
    readingRef.current?.scrollTo({ top: 0 })
  }, [activeChapterId])

  const goTo = (index: number) => {
    const chapter = chapters[index]
    if (chapter) onSelectChapter(chapter.id)
  }

  const chapterContextMenu = (chapter: Chapter, index: number): ContextMenuEntry[] => {
    const setDone = (done: boolean) => {
      if (!onUpdateChapter) return
      if (done && !chapter.content.trim()) {
        onToast('本章还没有正文，不能标记完成')
        return
      }
      onUpdateChapter(chapter.id, {
        status: done ? 'done' : 'writing',
        completedAt: done ? Date.now() : undefined,
        ...(done
          ? {
              title:
                chapter.title.trim() && chapter.title.trim() !== '未命名章节'
                  ? chapter.title
                  : `第 ${index + 1} 章`,
            }
          : {}),
      })
      onToast(done ? '本章已标记完成' : '本章已重新打开')
    }
    return [
      { type: 'label', label: `第 ${index + 1} 章 · ${chapter.title || '未命名章节'}` },
      { label: '在正文中打开', onSelect: () => onSelectChapter(chapter.id) },
      {
        label: '复制标题',
        onSelect: () => {
          void copyTextToClipboard(chapter.title).then((ok) =>
            onToast(ok ? '已复制章节标题' : '复制失败'),
          )
        },
      },
      {
        label: '复制正文',
        disabled: !chapter.content.trim(),
        onSelect: () => {
          void copyTextToClipboard(chapter.content).then((ok) =>
            onToast(ok ? '已复制本章正文' : '复制失败'),
          )
        },
      },
      { type: 'separator' },
      chapter.status === 'done'
        ? {
            label: '重新打开本章',
            disabled: !onUpdateChapter,
            onSelect: () => setDone(false),
          }
        : {
            label: '标记本章完成',
            disabled: !onUpdateChapter || !chapter.content.trim(),
            hint: !chapter.content.trim() ? '本章还没有正文' : undefined,
            onSelect: () => setDone(true),
          },
      { type: 'separator' },
      {
        label: '新建章节',
        onSelect: () => onAddChapter(),
      },
      {
        label: '删除章节…',
        danger: true,
        disabled: chapters.length <= 1,
        hint: chapters.length <= 1 ? '至少保留一个章节' : undefined,
        onSelect: () => {
          if (window.confirm(`删除「${chapter.title || '未命名章节'}」？这个操作不可恢复。`)) {
            onDeleteChapter(chapter.id)
          }
        },
      },
    ]
  }

  return (
    <div className="chapter-workspace">
      <div className="drawer-section-head">
        <span>章节工作台</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onAddChapter}>
          <IconPlus size={14} />
          新建章节
        </button>
      </div>

      <div className="chapter-toolbar">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={activeIndex <= 0}
          onClick={() => goTo(activeIndex - 1)}
          title="切换到上一章"
        >
          <IconChevronLeft size={14} />
          上一章
        </button>
        <span>
          第 {activeChapter ? activeIndex + 1 : 0} / {chapters.length} 章
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={activeIndex >= chapters.length - 1}
          onClick={() => goTo(activeIndex + 1)}
          title="切换到下一章"
        >
          下一章
          <IconChevronRight size={14} />
        </button>
      </div>

      {chapters.length > 0 ? (
        <div className="chapter-distribution">
          <div className="chapter-distribution-head">
            <span>字数分布</span>
            <div className="chapter-distribution-tools">
              <span>共 {formatWords(totalWords)} · 单章最高 {formatWords(maxWords)}</span>
              <div className="chapter-chart-modes" role="group" aria-label="字数图模式">
                <button
                  type="button"
                  className={chartMode === 'bar' ? 'active' : ''}
                  onClick={() => setChartMode('bar')}
                  aria-pressed={chartMode === 'bar'}
                >
                  柱形
                </button>
                <button
                  type="button"
                  className={chartMode === 'line' ? 'active' : ''}
                  onClick={() => setChartMode('line')}
                  aria-pressed={chartMode === 'line'}
                >
                  折线
                </button>
              </div>
            </div>
          </div>
          {chartMode === 'bar' ? (
            <div className="chapter-bars" role="img" aria-label="各章字数柱形图">
              {chapters.map((chapter, index) => {
                const words = chapterWords(chapter)
                const height = Math.max(4, (words / maxWords) * 100)
                const showLabel = index % labelsEvery === 0 || index === chapters.length - 1
                return (
                  <div
                    key={chapter.id}
                    className={`chapter-bar-slot ${
                      chapter.id === activeChapter?.id ? 'active' : ''
                    }`}
                    title={`第 ${index + 1} 章 · ${words} 字`}
                  >
                    <span className="chapter-bar" style={{ height: `${height}%` }} />
                    <span className="chapter-bar-label">{showLabel ? index + 1 : ''}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="chapter-chart" role="img" aria-label="各章字数折线图">
            <svg
              className="chapter-chart-svg"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="none"
            >
              {[0.25, 0.5, 0.75].map((ratio) => (
                <line
                  key={ratio}
                  className="chapter-chart-grid"
                  x1={chartPadX}
                  x2={chartWidth - chartPadX}
                  y1={chartTop + chartInnerHeight * ratio}
                  y2={chartTop + chartInnerHeight * ratio}
                />
              ))}
              {chartArea ? <path className="chapter-chart-area" d={chartArea} /> : null}
              {chartLine ? <polyline className="chapter-chart-line" points={chartLine} /> : null}
              {chartPoints.map((point) => {
                const chapter = chapters[point.index]
                const active = chapter.id === activeChapter?.id
                return (
                  <g key={chapter.id}>
                    <line
                      className={`chapter-chart-point ${active ? 'active' : ''}`}
                      x1={point.x}
                      x2={point.x}
                      y1={point.y - (active ? 5 : 3)}
                      y2={point.y + (active ? 5 : 3)}
                    >
                      <title>{`第 ${point.index + 1} 章 · ${point.words} 字`}</title>
                    </line>
                    {point.index % labelsEvery === 0 || point.index === chapters.length - 1 ? (
                      <text
                        className={`chapter-chart-label ${active ? 'active' : ''}`}
                        x={point.x}
                        y={chartHeight - 6}
                        textAnchor="middle"
                      >
                        {point.index + 1}
                      </text>
                    ) : null}
                  </g>
                )
              })}
            </svg>
            </div>
          )}
        </div>
      ) : null}

      <div className="chapter-workspace-body">
        <aside className="chapter-list-pane" aria-label="章节列表">
          {chapters.map((chapter, index) => (
            <button
              key={chapter.id}
              type="button"
              className={`chapter-pane-item ${
                chapter.id === activeChapter?.id ? 'active' : ''
              }`}
              onClick={() => onSelectChapter(chapter.id)}
              onContextMenu={(event) =>
                openContextMenu(event, chapterContextMenu(chapter, index))
              }
              aria-current={chapter.id === activeChapter?.id ? 'page' : undefined}
            >
              <span className="chapter-pane-num">第 {index + 1} 章</span>
              <strong>{chapter.title || '未命名章节'}</strong>
              <small>{chapterWords(chapter)} 字</small>
            </button>
          ))}
          <button type="button" className="chapter-pane-add" onClick={onAddChapter}>
            <IconPlus size={14} />
            新建一章
          </button>
        </aside>

        <section className="chapter-read-pane" ref={readingRef} aria-label="章节正文预览">
          {activeChapter ? (
            <>
              <header className="chapter-read-head">
                <div>
                  <span>第 {activeIndex + 1} 章 · 预览</span>
                  <h4>{activeChapter.title || '未命名章节'}</h4>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  title="删除章节"
                  aria-label="删除章节"
                  disabled={chapters.length <= 1}
                  onClick={() => onDeleteChapter(activeChapter.id)}
                >
                  <IconTrash size={14} />
                </button>
              </header>

              <label className="drawer-field chapter-read-title">
                <span>章节标题</span>
                <input
                  className="input drawer-input"
                  value={activeChapter.title}
                  onChange={(event) =>
                    onRenameChapter(activeChapter.id, event.target.value)
                  }
                  placeholder="章节标题"
                />
              </label>

              <div className="chapter-read-meta">
                <span>{chapterWords(activeChapter)} 字</span>
                <span>{formatRelative(activeChapter.updatedAt)}</span>
                <span>{activeChapter.content.trim() ? '已有正文' : '还没有正文'}</span>
              </div>

              {activeChapter.content.trim() ? (
                <div className="chapter-read-text">
                  {activeChapter.content
                    .split(/\n+/)
                    .map((paragraph) => paragraph.trim())
                    .filter(Boolean)
                    .map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                </div>
              ) : (
                <p className="drawer-empty">
                  这一章还没有正文。回到稿纸，用导演指令把这一场写出来。
                </p>
              )}

              <div className="chapter-read-footer">
                <button type="button" className="btn btn-ghost btn-sm" onClick={onAddChapter}>
                  <IconPlus size={14} />
                  新建下一章
                </button>
                <span>点击章节或上下章切换，稿纸会同步</span>
              </div>
            </>
          ) : (
            <p className="drawer-empty">还没有章节，先新建一章。</p>
          )}
        </section>

        <aside className="chapter-info-pane" aria-label="本章信息">
          <header>
            <span>本章信息</span>
            <strong>{chapterLabel}</strong>
          </header>
          <div className="chapter-info-metrics">
            <div>
              <strong>{activeWords}</strong>
              <span>字数</span>
            </div>
            <div>
              <strong>{paragraphs.length}</strong>
              <span>段落</span>
            </div>
            <div>
              <strong>{dialogueRatio.toFixed(1)}%</strong>
              <span>对白</span>
            </div>
          </div>

          <section className="chapter-info-block">
            <h5>出场人物</h5>
            {appearingCharacters.length > 0 ? (
              <div className="chapter-info-chips">
                {appearingCharacters.map((character) => (
                  <span key={character.id}>
                    {character.name}
                    {character.position ? ` · ${character.position}` : ''}
                  </span>
                ))}
              </div>
            ) : (
              <p className="drawer-empty">正文里还没有出现已登记的角色。</p>
            )}
          </section>

          <section className="chapter-info-block">
            <h5>相关伏笔</h5>
            {relatedForeshadows.length > 0 ? (
              relatedForeshadows.map((item) => (
                <div className="chapter-info-line" key={item.id}>
                  <span>{item.title || '未命名伏笔'}</span>
                  <small>
                    {item.payoffChapterId === activeChapterId
                      ? '本章回收'
                      : item.plantedChapterId === activeChapterId
                        ? '本章埋设'
                        : item.status}
                  </small>
                </div>
              ))
            ) : (
              <p className="drawer-empty">这一章没有登记关联伏笔。</p>
            )}
          </section>

          <p className="chapter-info-note">由现有设定与正文派生，不额外调用 AI。</p>
          {onSyncState ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm chapter-info-sync"
              disabled={syncingState}
              onClick={onSyncState}
              title="完整档案审查，速度较慢；日常自动同步使用快速模式"
            >
              {syncingState ? '同步中…' : '深度同步本章'}
            </button>
          ) : null}
        </aside>
      </div>

      <p className="drawer-hint">
        共 {chapters.length} 章 · {formatWords(totalWords)}。点击章节或使用上下章切换，稿纸会同步到当前章。
      </p>
    </div>
  )
}

const ANALYSIS_HEADINGS = [
  '一句话判断',
  '节奏与结构',
  '人物一致性',
  '伏笔与线索',
  '风险与建议',
]

function parseAnalysisSections(text: string): { title: string; content: string }[] | null {
  const sections: { title: string; content: string }[] = []
  const lines = text.slice(0, 20_000).split(/\r?\n/)

  for (const line of lines) {
    const clean = line
      .replace(/^\s*#{1,6}\s*/, '')
      .replace(/^\s*\d+[.、]\s*/, '')
      .replace(/\*\*/g, '')
      .trim()
    const heading = ANALYSIS_HEADINGS.find((item) => clean.startsWith(item))
    if (heading) {
      const rest = clean.slice(heading.length).replace(/^[：:]\s*/, '')
      sections.push({ title: heading, content: rest })
    } else if (sections.length > 0) {
      sections[sections.length - 1].content += `${line}\n`
    }
  }

  const filled = sections
    .map((section) => ({ ...section, content: section.content.trim() }))
    .filter((section) => section.content)
  return filled.length >= 2 ? filled : null
}

interface AnalysisPanelProps {
  detail: WorkDetail
  chapters: Chapter[]
  apiReady: boolean
  analyzing: boolean
  onAnalyze: () => void
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onToast?: (message: string) => void
}

function AnalysisPanel({
  detail,
  chapters,
  apiReady,
  analyzing,
  onAnalyze,
  onUpdateDetail,
  onToast,
}: AnalysisPanelProps) {
  const { openContextMenu } = useContextMenu()
  const [activeSection, setActiveSection] = useState(0)
  const stats = useMemo(() => {
    const words = chapters.reduce((sum, chapter) => sum + chapterWords(chapter), 0)
    const pending = detail.foreshadowings.filter((item) => item.status === '未回收').length
    const written = chapters.filter((chapter) => chapter.content.trim()).length
    return { words, pending, written }
  }, [chapters, detail.foreshadowings])
  const parsedSections = useMemo(
    () => parseAnalysisSections(detail.analysis),
    [detail.analysis],
  )

  useEffect(() => {
    setActiveSection(0)
  }, [detail.analysis])

  const jumpToSection = (index: number) => {
    setActiveSection(index)
    document
      .getElementById(`analysis-section-${index}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const analysisContextMenu = (): ContextMenuEntry[] => [
    { type: 'label', label: '剧情分析' },
    {
      label: '复制全部分析',
      onSelect: () => {
        void copyTextToClipboard(detail.analysis).then((ok) =>
          onToast?.(ok ? '已复制剧情分析' : '复制失败'),
        )
      },
    },
    {
      label: '重新分析',
      disabled: analyzing || !apiReady,
      hint: !apiReady ? '请先配置 AI' : undefined,
      onSelect: onAnalyze,
    },
    {
      label: '清空分析…',
      danger: true,
      onSelect: () => {
        if (window.confirm('清空当前剧情分析？')) onUpdateDetail({ analysis: '' })
      },
    },
  ]

  return (
    <>
      <div className="drawer-section-head">
        <span>剧情分析</span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onAnalyze}
          disabled={analyzing || !apiReady}
          title={apiReady ? '让 AI 分析当前作品' : '请先在设置中配置模型'}
        >
          <IconSparkles size={14} />
          {analyzing ? '分析中…' : 'AI 分析本书'}
        </button>
      </div>

      <div className="analysis-meta-line">
        <span><strong>{chapters.length}</strong> 章</span>
        <span><strong>{formatWords(stats.words)}</strong> 正文</span>
        <span><strong>{detail.characters.length}</strong> 角色</span>
        <span><strong>{stats.pending}</strong> 条未回收伏笔</span>
      </div>

      {analyzing ? (
        <div className="analysis-progress" role="status">
          <span className="analysis-progress-bar" />
          <span>AI 正在读稿，核对节奏、人物与伏笔…</span>
        </div>
      ) : null}

      {!apiReady ? (
        <p className="drawer-hint">还没有配置 AI 模型，配置完成后才能生成分析。</p>
      ) : null}

      {detail.analysis ? (
        <>
          {parsedSections ? (
            <div
              className="analysis-reader"
              onContextMenu={(event) => openContextMenu(event, analysisContextMenu())}
            >
              <nav className="analysis-nav" aria-label="分析目录">
                {parsedSections.map((section, index) => (
                  <button
                    key={section.title}
                    type="button"
                    className={activeSection === index ? 'active' : ''}
                    aria-current={activeSection === index ? 'true' : undefined}
                    onClick={() => jumpToSection(index)}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    {section.title}
                  </button>
                ))}
              </nav>
              <div className="analysis-sections">
                {parsedSections.map((section, index) => (
                  <section
                    key={section.title}
                    id={`analysis-section-${index}`}
                    className="analysis-section"
                  >
                    <h4>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      {section.title}
                    </h4>
                    <div className="analysis-output">{section.content}</div>
                  </section>
                ))}
              </div>
            </div>
          ) : (
            <div
              className="analysis-output"
              onContextMenu={(event) => openContextMenu(event, analysisContextMenu())}
            >
              {detail.analysis.slice(0, 20_000)}
            </div>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onUpdateDetail({ analysis: '' })}
          >
            清空分析
          </button>
        </>
      ) : (
        <p className="drawer-empty">
          还没有分析结果。让 AI 读一遍现有章节和设定，检查节奏、人物一致性和伏笔回收情况。
        </p>
      )}
    </>
  )
}

interface PromptsPanelProps {
  activePrompts: Prompt[]
  onOpenPromptPicker: () => void
  onOpenPromptLibrary: () => void
}

function PromptsPanel({
  activePrompts,
  onOpenPromptPicker,
  onOpenPromptLibrary,
}: PromptsPanelProps) {
  return (
    <>
      <div className="drawer-section-head">
        <span>本作提示词</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenPromptPicker}>
          <IconPlus size={14} />
          选择提示词
        </button>
      </div>

      {activePrompts.length === 0 ? (
        <p className="drawer-empty">
          还没有启用提示词。提示词可以保存你反复使用的写作要求，写得越多越容易保持风格统一。
        </p>
      ) : (
        activePrompts.map((prompt) => (
          <div className="prompt-summary" key={prompt.id}>
            <div className="prompt-summary-head">
              <span className="prompt-cat">{prompt.category}</span>
              <strong>{prompt.title}</strong>
            </div>
            <p>{prompt.content}</p>
          </div>
        ))
      )}

      <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenPromptLibrary}>
        去提示词库管理
      </button>

      <p className="drawer-hint">
        启用的提示词会随每次导戏一起交给 AI；接入的模型越强，这些规则越容易被稳定执行。
      </p>
    </>
  )
}
