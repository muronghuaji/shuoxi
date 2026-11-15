import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  Chapter,
  ChapterBeats,
  ChapterStage,
  CharacterCard,
  DetailMode,
  FactionCard,
  OutlineCard,
  PlatformBalance,
  Prompt,
  ReasoningEffort,
  RescueChapterDraft,
  SyncSettings,
  Work,
  WorkDetail,
  WritingContextOptions,
  TypographySettings,
} from '../types'
import { getProvider } from '../data'
import { chapterWords, countWords, estimateTokens, formatWords } from '../utils'
import { balanceMoney } from '../billing'
import {
  buildAnalysisMessages,
  buildContinuityAuditMessages,
  buildParagraphRepairMessages,
  parseParagraphRepairEdits,
  applyParagraphRepairEdits,
  buildGenerationMessages,
  buildSceneBriefMessages,
  buildFastScopedStateUpdateMessages,
  buildScopedCompactStateUpdateMessages,
  buildScopedStateUpdateMessages,
  buildSelectionEditMessages,
  buildTitleMessages,
  fetchModels,
  parseTitleSuggestions,
  type ChatMessage,
  type ChatUsage,
  type SelectionEditAction,
} from '../ai'
import { runApiTask } from '../aiTask'
import { applyStoryStateUpdate, mergeDeepStateUpdate, parseStoryStateUpdate, type ParsedStateUpdate } from '../storyState'
import { runAiTask } from '../aiTask'
import { applyArchivePatch, completeCharacterFullArchive, completeEntityArchive, needsArchiveCompletion } from '../entityArchive'
import {
  createArchiveCandidates,
  createArchiveJob,
  mergeArchiveJobs,
  nextArchiveJob,
  updateArchiveJob,
  type ArchiveJob,
} from '../archiveQueue'
import { applyLifecycleFromChapter } from '../entityLifecycle'
import {
  CHAPTER_STAGE_LABELS,
  CHAPTER_STAGE_OPTIONS,
  chapterBeatProgress,
  chapterPlanWarnings,
  chapterStageOf,
  chapterStatusForStage,
  chapterTargetWords,
  outlineForChapter,
} from '../chapterMeta'
import {
  addUsageTotals,
  calculateUsageCost,
  emptyUsageTotals,
  formatCost,
  formatTokenCount,
} from '../usage'
import { checkContinuity } from '../continuity'
import { resolveWritingPrice, type WritingPricingSettings } from '../pricing'
import { buildStoryMemory } from '../storyMemory'
import {
  createSyncJob,
  mergeSyncJobs,
  nextSyncJob,
  syncJobProgress,
  updateSyncJob,
  type SyncJob,
} from '../syncQueue'
import { SyncQueuePanel } from './SyncQueuePanel'
import { SyncControl } from './SyncControl'
import { SyncMultiChapterModal } from './SyncMultiChapterModal'
import { ConfirmModal } from './ConfirmModal'
import { BookmarkModal } from './BookmarkModal'
import { SkillsModal } from './SkillsModal'
import { auditGeneratedText, repairRepeatedParagraphs } from '../storyAudit'
import {
  buildGenerationRetryInstruction,
  checkGenerationQuality,
} from '../generationQuality'
import {
  isStorySqliteReady,
  queryLexicalStoryIndex,
  querySemanticStoryIndex,
} from '../storySqlite'
import { hasEmbeddingModel } from '../semantic'
import {
  resolveWritingMode,
  writingModeLabel,
  outlineToDirective,
  resolveContextOptions,
} from '../writingMode'
import {
  IconArrowLeft,
  IconArrowRight,
  IconBookmark,
  IconBookOpen,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconDownload,
  IconFeather,
  IconFileText,
  IconPalette,
  IconPlus,
  IconRewind,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconStop,
} from './Icons'
import { PromptPickerModal } from './PromptPickerModal'
import { WorkDetailDrawer } from './WorkDetailDrawer'
import { AssistantDrawer } from './AssistantDrawer'
import { WheelchairBar } from './WheelchairBar'
import { Modal } from './Modal'
import { ContextInspector } from './ContextInspector'
import { ExportNovelModal } from './ExportNovelModal'
import { useStoredState } from '../hooks/useStoredState'
import type { StorySaveState } from '../hooks/useSqliteStoryStore'
import {
  BOOK_SEARCH_KIND_LABELS,
  searchBook,
  type BookSearchResult,
} from '../bookSearch'
import { buildEntityIndex, type EntityCategory, type EntityIndexEntry } from '../entityIndex'
import {
  DEFAULT_ENTITY_HIGHLIGHT_SETTINGS,
  ENTITY_CATEGORY_COLORS,
  ENTITY_CATEGORY_LABELS,
  ENTITY_HIGHLIGHT_CATEGORIES,
  normalizeEntityHighlightSettings,
  splitEntityText,
  type EntityHighlightSettings,
} from '../entityHighlight'
import { EntityInfoCard } from './EntityInfoCard'
import { EntityArchiveModal } from './EntityArchiveModal'
import { EntityBindingModal } from './EntityBindingModal'
import { ProseQualityModal } from './ProseQualityModal'
import { ProsePolishModal } from './ProsePolishModal'
import { polishChapterProse } from '../prosePolish'
import { FindReplaceModal } from './FindReplaceModal'
import { bindCharacterAlias } from '../entityBinding'
import { Reader } from './Reader'
import type { PersonalNovelBridge } from '../personalNovelBridge'
import { RescueModal } from './RescueModal'
import { useContextMenu, type ContextMenuEntry } from './ContextMenuProvider'
import {
  createLocalChapterSummary,
  isImportantChapter,
  shouldAutoSyncChapter,
} from '../syncSettings'

type ComposerToolId =
  | 'beats'
  | 'context'
  | 'brief'
  | 'mention'
  | 'actions'
  | 'continuity'
  | 'foreshadow'
  | 'inspire'
  | 'continue'
  | 'search'
const EMPTY_BEATS: ChapterBeats = {
  advance: '',
  reveal: '',
  hook: '',
  goal: '',
  obstacle: '',
  turn: '',
  change: '',
}

const LENGTH_OPTIONS = [0, 300, 500, 800, 1200]
const PACE_OPTIONS = ['默认', '慢', '标准', '快'] as const

const WRITING_ACTIONS = [
  { label: '扩写', instruction: '把上一段扩写得更具体，增加动作、感官和环境细节。' },
  { label: '精简', instruction: '精简上一段，删掉重复解释，保留关键动作和冲突。' },
  { label: '改写', instruction: '换一种写法重写上一段，保持剧情不变但让语言更有画面感。' },
  { label: '润色', instruction: '润色上一段，统一语气和节奏，不要改变剧情。' },
  { label: '加强冲突', instruction: '加强双方冲突，不要立刻和解，让分歧更尖锐。' },
  { label: '降低解释感', instruction: '减少解释和心理总结，用动作、对白和细节呈现。' },
  { label: '增加对白', instruction: '增加一段有张力的对白，让双方的立场和秘密更清楚。' },
  { label: '增加环境描写', instruction: '增加环境描写，让场景参与气氛和冲突，不要写成纯景物堆砌。' },
  { label: '增加心理活动', instruction: '增加主要人物的心理活动，展现犹豫、恐惧或欲望。' },
  { label: '章末钩子', instruction: '给这一段写一个章末钩子：出现新的威胁、秘密或意外，但不要解释。' },
] as const

const INSPIRATION_OPTIONS = [
  {
    label: '下一章三个方向',
    prompt: '结合当前章节和事件簿，给我下一章的三个发展方向。每个方向写清冲突、转折和结尾钩子。',
  },
  {
    label: '三个剧情反转',
    prompt: '给我三个适合当前剧情的反转，要求不破坏已有设定，并说明各自需要提前埋什么线索。',
  },
  {
    label: '三个章末钩子',
    prompt: '给当前章节写三个章末钩子，每个一句话，要求能自然引出下一章。',
  },
  {
    label: '分析当前卡点',
    prompt: '分析当前剧情为什么卡住，指出人物动机、冲突和伏笔上的问题，并给可执行的修改建议。',
  },
] as const

const SELECTION_ACTIONS: { action: SelectionEditAction; label: string }[] = [
  { action: 'rewrite', label: '改写' },
  { action: 'polish', label: '润色' },
  { action: 'expand', label: '扩写' },
  { action: 'condense', label: '精简' },
  { action: 'continue', label: '续写' },
]

const SELECTION_LABELS: Record<SelectionEditAction, string> = {
  rewrite: 'AI 改写',
  polish: 'AI 润色',
  expand: 'AI 扩写',
  condense: 'AI 精简',
  continue: 'AI 续写',
}

interface TextSelectionCapture {
  text: string
  start: number
  end: number
  left: number
  top: number
}

interface SelectionPreview {
  action: SelectionEditAction
  original: string
  result: string
  start: number
  end: number
}

interface ContextMenuState {
  x: number
  y: number
  selection: TextSelectionCapture | null
  editing: boolean
}

function paragraphRanges(content: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = []
  const matcher = /[^\n]+/g
  for (let match = matcher.exec(content); match; match = matcher.exec(content)) {
    const raw = match[0]
    const text = raw.trim()
    if (!text) continue
    const leading = raw.indexOf(text)
    const start = match.index + leading
    ranges.push({ start, end: start + text.length })
  }
  return ranges
}

function offsetWithinParagraph(
  paragraph: HTMLElement,
  node: Node,
  offset: number,
): number {
  const range = document.createRange()
  range.selectNodeContents(paragraph)
  try {
    range.setEnd(node, offset)
    return range.toString().length
  } catch {
    return 0
  }
}

function joinContent(base: string, addition: string): string {
  const left = base.trimEnd()
  const right = addition.trim()
  if (!left) return right
  if (!right) return left
  return `${left}\n\n${right}`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

const REASONING_OPTIONS: { value: ReasoningEffort; label: string; hint: string }[] = [
  { value: 'auto', label: '自动', hint: '按任务自动决定推演强度' },
  { value: 'fast', label: '快速', hint: '优先推进剧情，减少铺陈' },
  { value: 'balanced', label: '标准', hint: '兼顾人物、节奏与伏笔' },
  { value: 'deep', label: '深度', hint: '多检查人物关系、伏笔与因果' },
]

const SYNC_QUEUE_STORAGE_KEY = 'shuoxi.syncQueue.v1'

interface WorkspaceProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  prompts: Prompt[]
  api: ApiConfig
  apiReady: boolean
  writingPricing: WritingPricingSettings
  generalApi: ApiConfig
  generalApiReady: boolean
  typography: TypographySettings
  saveState: StorySaveState
  onRetrySave: () => void
  onBack: () => void
  onUpdateWork: (patch: Partial<Work>) => void
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onUpdateChapter: (chapterId: string, patch: Partial<Chapter>) => void
  onAddChapter: () => string
  onDeleteChapter: (chapterId: string) => void
  onMoveChapter: (chapterId: string, direction: -1 | 1) => void
  onSavePromptIds: (ids: string[]) => void
  onModelChange: (model: string) => void
  onReasoningChange: (effort: ReasoningEffort) => void
  syncSettings: SyncSettings
  platformBalance?: PlatformBalance | null
  balanceLoading?: boolean
  onRefreshBalance?: () => void
  onOpenSettings: () => void
  onOpenGlobalSearch: () => void
  onOpenPromptLibrary: () => void
  onToast: (message: string) => void
  onRecordUsage?: (entry: AiUsageEntry) => void
  onSnapshot: (reason: string) => void
  onOpenBootstrap?: () => void
  personalBridge?: PersonalNovelBridge
}

export function Workspace({
  work,
  detail,
  chapters,
  prompts,
  api,
  apiReady,
  writingPricing,
  generalApi,
  generalApiReady,
  typography,
  saveState,
  onRetrySave,
  onBack,
  onUpdateWork,
  onUpdateDetail,
  onUpdateChapter,
  onAddChapter,
  onDeleteChapter,
  onMoveChapter,
  onSavePromptIds,
  onModelChange,
  onReasoningChange,
  syncSettings,
  platformBalance,
  balanceLoading,
  onRefreshBalance,
  onOpenSettings,
  onOpenGlobalSearch,
  onOpenPromptLibrary,
  onToast,
  onRecordUsage,
  onSnapshot,
  onOpenBootstrap,
  personalBridge,
}: WorkspaceProps) {
  const [activeChapterId, setActiveChapterId] = useState(() => {
    const fallback = chapters[0]?.id ?? ''
    try {
      const stored = window.localStorage.getItem(`shuoxi.activeChapter.v1.${work.id}`)
      if (stored && chapters.some((chapter) => chapter.id === stored)) return stored
    } catch {
      // localStorage 不可用时使用第一章。
    }
    return fallback
  })
  const [visibleChapterCount, setVisibleChapterCount] = useState(120)
  const [chapterQuery, setChapterQuery] = useState('')
  const [chapterStageFilter, setChapterStageFilter] = useState<'all' | ChapterStage>('all')
  const [collapsedChapterArcs, setCollapsedChapterArcs] = useState<Set<string>>(new Set())
  const [detailMode, setDetailMode] = useState<DetailMode>('collapsed')
  const usageSessionIdRef = useRef(
    `usage-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  )
  const [sessionUsage, setSessionUsage] = useState(emptyUsageTotals)
  const [chaptersCollapsed, setChaptersCollapsed] = useStoredState<boolean>(
    'shuoxi.layout.chaptersCollapsed.v1',
    false,
  )
  const [composerCollapsed, setComposerCollapsed] = useStoredState<boolean>(
    'shuoxi.layout.composerCollapsed.v1',
    false,
  )
  const [entityHighlightSettings, setEntityHighlightSettings] =
    useStoredState<EntityHighlightSettings>(
      'shuoxi.entityHighlight.v1',
      DEFAULT_ENTITY_HIGHLIGHT_SETTINGS,
      normalizeEntityHighlightSettings,
    )
  const [selectedEntity, setSelectedEntity] = useState<{
    entry: EntityIndexEntry
    left: number
    top: number
  } | null>(null)
  const [bindingText, setBindingText] = useState('')
  const [bindingUndo, setBindingUndo] = useState<{
    label: string
    characters: WorkDetail['characters']
  } | null>(null)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [findReplaceOpen, setFindReplaceOpen] = useState(false)
  const [prosePolishOpen, setProsePolishOpen] = useState(false)
  const [prosePolishBefore, setProsePolishBefore] = useState('')
  const [prosePolishAfter, setProsePolishAfter] = useState('')
  const [prosePolishing, setProsePolishing] = useState(false)
  const prosePolishAbortRef = useRef<AbortController | null>(null)
  const [readerOpen, setReaderOpen] = useState(() => {
    try {
      const stored = window.localStorage.getItem(`shuoxi.readerOpen.v1.${work.id}`)
      if (stored === '0' || stored === '1') return stored === '1'
    } catch {
      // localStorage 不可用时按作品类型决定。
    }
    return work.kind === 'personal'
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(
        `shuoxi.readerOpen.v1.${work.id}`,
        readerOpen ? '1' : '0',
      )
    } catch {
      // 忽略存储异常。
    }
  }, [readerOpen, work.id])
  const [rescueOpen, setRescueOpen] = useState(false)
  const entityIndex = useMemo(() => buildEntityIndex(detail), [detail])
  const [bookSearchQuery, setBookSearchQuery] = useState('')
  const [bookSearchHighlight, setBookSearchHighlight] = useState('')
  const [detailFocusRequest, setDetailFocusRequest] = useState<{
    tab: string
    requestId: number
  } | null>(null)
  const [entityArchive, setEntityArchive] = useState<{
    category: EntityCategory
    id: string
  } | null>(null)
  const [detailEntityFocus, setDetailEntityFocus] = useState<{
    category: string
    id: string
    requestId: number
  } | null>(null)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantSeed, setAssistantSeed] = useState<{ id: string; text: string } | null>(null)
  const [composerTool, setComposerTool] = useState<ComposerToolId | null>(null)
  const [autoWriteRunning, setAutoWriteRunning] = useState(false)
  const [beatsDraft, setBeatsDraft] = useState<ChapterBeats>(EMPTY_BEATS)
  const [mentionQuery, setMentionQuery] = useState('')
  const [lengthPreset, setLengthPreset] = useState(0)
  const [pacePreset, setPacePreset] = useState<(typeof PACE_OPTIONS)[number]>('默认')
  const [continueWords, setContinueWords] = useState(800)
  const [continueCustom, setContinueCustom] = useState('')
  const [directive, setDirective] = useState('')
  const [sceneBrief, setSceneBrief] = useState('')
  const [sceneBriefLoading, setSceneBriefLoading] = useState(false)
  const [promptPickerOpen, setPromptPickerOpen] = useState(false)
  const [promptDraft, setPromptDraft] = useState<string[]>(work.promptIds)
  const [isGenerating, setIsGenerating] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamBase, setStreamBase] = useState('')
  const [error, setError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [syncingState, setSyncingState] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncAllProgress, setSyncAllProgress] = useState(0)
  const [syncResult, setSyncResult] = useState<{ title: string; detail: string } | null>(null)
  const syncResultTimerRef = useRef<number | null>(null)
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([])
  const [syncQueueOpen, setSyncQueueOpen] = useState(false)
  const [syncMultiOpen, setSyncMultiOpen] = useState(false)
  const [deleteChapterTarget, setDeleteChapterTarget] = useState<Chapter | null>(null)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [pendingBackfill, setPendingBackfill] = useState<Chapter[] | null>(null)
  const [syncQueuePaused, setSyncQueuePaused] = useState(false)
  const [archiveJobs, setArchiveJobs] = useState<ArchiveJob[]>([])
  const archiveJobsRef = useRef<ArchiveJob[]>([])
  const archiveRunningRef = useRef(false)
  const syncJobsRef = useRef<SyncJob[]>([])
  const syncRunningRef = useRef(false)
  const syncPausedRef = useRef(false)
  const syncQueueRestoredRef = useRef(false)
  const syncChaptersRef = useRef(chapters)
  const syncDetailRef = useRef(detail)
  syncChaptersRef.current = chapters
  syncDetailRef.current = detail

  useEffect(() => {
    if (!syncSettings.aiBackgroundPaused && archiveJobsRef.current.some((job) => job.status === 'queued')) {
      void pumpArchiveQueue()
    }
  }, [syncSettings.aiBackgroundPaused])

  useEffect(
    () => () => {
      if (syncResultTimerRef.current !== null) {
        window.clearTimeout(syncResultTimerRef.current)
      }
    },
    [],
  )

  const showSyncSuccess = (title: string, detail: string) => {
    setSyncResult({ title, detail })
    if (syncResultTimerRef.current !== null) {
      window.clearTimeout(syncResultTimerRef.current)
    }
    syncResultTimerRef.current = window.setTimeout(() => {
      setSyncResult(null)
      syncResultTimerRef.current = null
    }, 8000)
  }
  const [editing, setEditing] = useState(false)
  const [draftContent, setDraftContent] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [briefOpen, setBriefOpen] = useState(false)
  const [auditingContinuity, setAuditingContinuity] = useState(false)
  const [repairingContinuity, setRepairingContinuity] = useState(false)
  const [repairPreview, setRepairPreview] = useState<{ before: string; after: string } | null>(null)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [titleEditing, setTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([])
  const [suggestingTitle, setSuggestingTitle] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [workStatusOpen, setWorkStatusOpen] = useState(false)
  const [finishChecked, setFinishChecked] = useState(false)
  const [completionNote, setCompletionNote] = useState('')
  const [selectionCapture, setSelectionCapture] = useState<TextSelectionCapture | null>(null)
  const [selectionPreview, setSelectionPreview] = useState<SelectionPreview | null>(null)
  const [selectionBusy, setSelectionBusy] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const { openContextMenu } = useContextMenu()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportPresetChapterId, setExportPresetChapterId] = useState<string | null>(null)
  const [redoStack, setRedoStack] = useState<string[]>([])

  const abortRef = useRef<AbortController | null>(null)
  const lastRunRef = useRef<{ instruction: string; before: string; chapterId: string } | null>(
    null,
  )
  const chaptersRef = useRef<HTMLElement | null>(null)
  const manuscriptRef = useRef<HTMLElement | null>(null)
  const manuscriptScrollRef = useRef<HTMLDivElement | null>(null)
  const proseRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingEditCaretRef = useRef<number | null>(null)
  const pendingEditScrollRef = useRef<number | null>(null)
  const skipRedoClearRef = useRef(false)
  const lastContentRef = useRef('')
  const modelMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!modelMenuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) setModelMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [modelMenuOpen])

  useEffect(() => {
    if (isGenerating) setModelMenuOpen(false)
  }, [isGenerating])

  useEffect(() => {
    setTitleEditing(false)
    setTitleSuggestions([])
    setCompleteOpen(false)
  }, [activeChapterId])

  const currentIndex = chapters.findIndex((chapter) => chapter.id === activeChapterId)
  const currentChapter = chapters[currentIndex] ?? chapters[0]
  const currentContent = currentChapter?.content ?? ''
  const deferredSearchQuery = useDeferredValue(bookSearchQuery)
  const bookSearchResults = useMemo(
    () =>
      searchBook({
        query: deferredSearchQuery,
        chapters,
        detail,
        liveChapterId: currentChapter?.id,
        liveContent: currentContent,
      }),
    [chapters, currentContent, currentChapter?.id, deferredSearchQuery, detail],
  )
  const displayContent = isGenerating ? joinContent(streamBase, streamingText) : currentContent
  const syncQueueProgress = syncJobProgress(syncJobs)
  const paragraphs = displayContent
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  const renderSearchHighlights = (text: string) => {
    const query = bookSearchHighlight.trim()
    if (!query) return text
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return text.split(new RegExp(`(${escaped})`, 'gi')).map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark className="book-search-mark" key={`${part}-${index}`}>
          {part}
        </mark>
      ) : (
        part
      ),
    )
  }

  const highlightedEntities = entityHighlightSettings.enabled
    ? entityIndex.filter((entry) => entityHighlightSettings.categories[entry.category])
    : []
  const bindingCharacters = entityIndex.filter((entry) => entry.category === 'character')
  const finishCharacterBinding = (entry: EntityIndexEntry) => {
    const previousCharacters = detail.characters
    const nextDetail = bindCharacterAlias(detail, entry.id, bindingText)
    onUpdateDetail({ characters: nextDetail.characters })
    setBindingUndo({
      label: `已将「${bindingText}」绑定为${entry.name}`,
      characters: previousCharacters,
    })
    setBindingText('')
    onToast(`「${bindingText}」以后都会识别为${entry.name}`)
  }
  const undoCharacterBinding = () => {
    if (!bindingUndo) return
    onUpdateDetail({ characters: bindingUndo.characters })
    setBindingUndo(null)
    onToast('已撤销绑定')
  }

  const openEntityCard = (entry: EntityIndexEntry, x: number, y: number) => {
    setSelectedEntity({
      entry,
      left: Math.max(12, Math.min(x + 8, window.innerWidth - 280)),
      top: Math.max(12, Math.min(y + 10, window.innerHeight - 270)),
    })
  }

  const openEntityDetails = (entry: EntityIndexEntry) => {
    setSelectedEntity(null)
    let category = entry.category
    let id = entry.id
    if (entry.category === 'weapon' || entry.category === 'technique') {
      const owner = detail.characters.find((character) =>
        entry.category === 'weapon'
          ? (character.weapons ?? []).includes(entry.name)
          : (character.techniques ?? []).includes(entry.name),
      )
      if (owner) {
        category = 'character'
        id = owner.id
      } else {
        onToast('这个武器 / 功法还没有关联角色，先到角色档案里补充')
        return
      }
    }
    setEntityArchive({ category, id })
    setDetailEntityFocus(null)
    onToast(`已打开${entry.name}的详细档案`)
  }

  const renderBookText = (text: string) => {
    if (highlightedEntities.length === 0) return renderSearchHighlights(text)
    return splitEntityText(text, highlightedEntities).map((segment, index) => {
      if (!segment.entity) {
        return <span key={`text-${index}`}>{renderSearchHighlights(segment.text)}</span>
      }
      const entry = segment.entity
      const accent = entry.tierColor
      return (
        <span
          key={`entity-${index}-${entry.category}-${entry.id}`}
          className={`entity-mark entity-${entry.category} ${accent ? 'has-tier' : 'no-tier'}`}
          style={accent ? ({ '--entity-color': accent } as React.CSSProperties) : undefined}
          role="button"
          tabIndex={0}
          title={`${ENTITY_CATEGORY_LABELS[entry.category]}${entry.tierLabel ? ` · ${entry.tierLabel}` : ''}：${entry.name}`}
          onClick={(event) => {
            if (window.getSelection()?.toString()) return
            event.preventDefault()
            event.stopPropagation()
            openEntityCard(entry, event.clientX, event.clientY)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            event.stopPropagation()
            openEntityCard(entry, 180, 140)
          }}
        >
          {renderSearchHighlights(segment.text)}
        </span>
      )
    })
  }

  const entityAtEditorOffset = (offset: number): EntityIndexEntry | null => {
    if (offset < 0 || highlightedEntities.length === 0) return null
    const candidates = [...highlightedEntities].sort(
      (left, right) => Math.max(right.name.length, ...right.aliases.map((alias) => alias.length)) -
        Math.max(left.name.length, ...left.aliases.map((alias) => alias.length)),
    )
    for (const entry of candidates) {
      for (const name of [entry.name, ...entry.aliases].filter(Boolean)) {
        let start = draftContent.indexOf(name)
        while (start >= 0) {
          if (offset >= start && offset <= start + name.length) return entry
          start = draftContent.indexOf(name, start + 1)
        }
      }
    }
    return null
  }

  useEffect(() => {
    if (!editing) return
    const editor = editorRef.current
    if (!editor) return
    const selectionStart = editor.selectionStart
    const selectionEnd = editor.selectionEnd
    const scrollTop = manuscriptScrollRef.current?.scrollTop ?? 0
    editor.style.height = 'auto'
    editor.style.height = `${Math.max(editor.scrollHeight, 320)}px`
    window.requestAnimationFrame(() => {
      if (editorRef.current !== editor) return
      editor.setSelectionRange(selectionStart, selectionEnd)
      if (manuscriptScrollRef.current) manuscriptScrollRef.current.scrollTop = scrollTop
    })
  }, [editing, draftContent])

  useEffect(() => {
    if (!editing) return
    const editor = editorRef.current
    if (!editor) return
    const caret = Math.min(
      pendingEditCaretRef.current ?? editor.value.length,
      editor.value.length,
    )
    const scrollTop = pendingEditScrollRef.current
    pendingEditCaretRef.current = null
    pendingEditScrollRef.current = null
    const frame = window.requestAnimationFrame(() => {
      if (editorRef.current !== editor) return
      editor.focus({ preventScroll: true })
      editor.setSelectionRange(caret, caret)
      if (scrollTop !== null && manuscriptScrollRef.current) {
        manuscriptScrollRef.current.scrollTop = scrollTop
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [editing])

  useEffect(() => {
    setRedoStack([])
    skipRedoClearRef.current = false
    lastContentRef.current = currentContent
  }, [currentChapter?.id])

  useEffect(() => {
    setSelectedEntity(null)
  }, [currentChapter?.id])

  useEffect(() => {
    if (lastContentRef.current === currentContent) return
    lastContentRef.current = currentContent
    if (skipRedoClearRef.current) {
      skipRedoClearRef.current = false
      return
    }
    setRedoStack([])
  }, [currentContent])

  const captureSelection = (): TextSelectionCapture | null => {
    if (editing || isGenerating || !currentChapter) return null
    const selection = window.getSelection()
    const prose = proseRef.current
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !prose) return null
    const range = selection.getRangeAt(0)
    if (!prose.contains(range.commonAncestorContainer)) return null
    const elements = Array.from(prose.querySelectorAll('p'))
    const startIndex = elements.findIndex((paragraph) => paragraph.contains(range.startContainer))
    const endIndex = elements.findIndex((paragraph) => paragraph.contains(range.endContainer))
    if (startIndex < 0 || endIndex < 0) return null
    const ranges = paragraphRanges(currentContent)
    const startParagraph = ranges[startIndex]
    const endParagraph = ranges[endIndex]
    if (!startParagraph || !endParagraph) return null
    const startOffset = offsetWithinParagraph(
      elements[startIndex],
      range.startContainer,
      range.startOffset,
    )
    const endOffset = offsetWithinParagraph(elements[endIndex], range.endContainer, range.endOffset)
    const start = startParagraph.start + startOffset
    const end = endParagraph.start + endOffset
    if (end <= start) return null
    const rect = range.getBoundingClientRect()
    return {
      text: currentContent.slice(start, end),
      start,
      end,
      left: Math.min(window.innerWidth - 250, Math.max(120, rect.left + rect.width / 2)),
      top: Math.max(12, rect.top - 46),
    }
  }

  const showSelectionToolbar = () => {
    window.setTimeout(() => {
      setSelectionCapture(captureSelection())
    }, 0)
  }

  const runSelectionEdit = async (
    action: SelectionEditAction,
    captureOverride?: TextSelectionCapture,
  ) => {
    const capture = captureOverride ?? selectionCapture
    if (!capture || !currentChapter || !apiReady || selectionBusy) {
      if (!apiReady) onToast('请先配置 AI 模型和 API Key')
      return
    }
    setContextMenu(null)
    setSelectionCapture(null)
    setSelectionBusy(true)
    let generated = ''
    setSelectionPreview({
      action,
      original: capture.text,
      result: '',
      start: capture.start,
      end: capture.end,
    })
    try {
      const messages = buildSelectionEditMessages({
        action,
        work,
        detail,
        chapter: currentChapter,
        content: currentContent,
        selectedText: capture.text,
        before: currentContent.slice(Math.max(0, capture.start - 1200), capture.start),
        after: currentContent.slice(capture.end, capture.end + 1200),
      })
      let actualUsage: ChatUsage | undefined
      const result = await runAiTask({
        task: 'writing.selection-edit',
        apis: { writing: api, general: generalApi, chat: api },
        messages,
        maxTokens: action === 'continue' ? 1200 : 1000,
        temperature: action === 'continue' ? 0.85 : 0.65,
        onUsage: (usage) => {
          actualUsage = usage
        },
        onDelta: (delta) => {
          generated += delta
          setSelectionPreview((current) =>
            current ? { ...current, result: generated } : current,
          )
        },
      })
      const text = (generated || result).trim()
      if (!text) throw new Error('模型没有返回改写内容')
      recordUsage(
        'AI 改写',
        messages.map((message) => message.content).join('\n'),
        text,
        SELECTION_LABELS[action],
        actualUsage,
      )
      setSelectionPreview({
        action,
        original: capture.text,
        result: text,
        start: capture.start,
        end: capture.end,
      })
    } catch (caught) {
      setSelectionPreview(null)
      onToast(`${SELECTION_LABELS[action]}失败：${errorMessage(caught)}`)
    } finally {
      setSelectionBusy(false)
    }
  }

  const applySelectionPreview = () => {
    if (!selectionPreview || !currentChapter) return
    if (chapterReadOnly) {
      onToast(chapterDone ? '本章已完成，先重新打开' : '本书已完结，先重新开启连载')
      return
    }
    const base = currentChapter.content
    let replacement = selectionPreview.action === 'continue'
      ? `\n\n${selectionPreview.result.trim()}`
      : selectionPreview.result.trim()
    if (
      selectionPreview.action !== 'continue' &&
      /[。！？]$/.test(replacement) &&
      /[，、；：]/.test(base.slice(selectionPreview.end, selectionPreview.end + 1))
    ) {
      replacement = replacement.replace(/[。！？]$/, '')
    }
    const next =
      selectionPreview.action === 'continue'
        ? `${base.slice(0, selectionPreview.end).trimEnd()}${replacement}${base
            .slice(selectionPreview.end)
            .trimStart() ? `\n\n${base.slice(selectionPreview.end).trimStart()}` : ''}`
        : `${base.slice(0, selectionPreview.start)}${replacement}${base.slice(selectionPreview.end)}`
    onUpdateChapter(currentChapter.id, { content: next })
    setSelectionPreview(null)
    onToast('已应用选中文字修改，可用撤销回退')
  }

  const openManuscriptContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    const selection = editing ? null : captureSelection()
    setSelectionCapture(null)
    setContextMenu({
      x: Math.min(window.innerWidth - 220, event.clientX),
      y: Math.min(window.innerHeight - 280, event.clientY),
      selection,
      editing,
    })
  }

  const copySelectedText = () => {
    const selected = contextMenu?.selection?.text
    if (selected) {
      void navigator.clipboard?.writeText(selected)
      onToast('已复制选中文字')
    } else {
      document.execCommand('copy')
      onToast('已复制')
    }
    setContextMenu(null)
  }

  const selectAllManuscript = () => {
    if (editing) {
      const textarea = document.querySelector<HTMLTextAreaElement>('.manuscript-editor')
      textarea?.focus()
      textarea?.select()
    } else if (proseRef.current && window.getSelection()) {
      const range = document.createRange()
      range.selectNodeContents(proseRef.current)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    }
    setContextMenu(null)
  }

  const copyChapterContent = () => {
    if (!currentChapter) return
    void navigator.clipboard?.writeText(currentChapter.content)
    setContextMenu(null)
    onToast('已复制整章正文')
  }

  const cutFromEditor = async () => {
    const textarea = document.querySelector<HTMLTextAreaElement>('.manuscript-editor')
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    if (start === end) {
      onToast('先选中要剪切的文字')
      return
    }
    try {
      await navigator.clipboard?.writeText(draftContent.slice(start, end))
      setDraftContent(draftContent.slice(0, start) + draftContent.slice(end))
      onToast('已剪切')
    } catch {
      onToast('剪切失败：无法访问剪贴板')
    }
    setContextMenu(null)
  }

  const pasteIntoEditor = async () => {
    const textarea = document.querySelector<HTMLTextAreaElement>('.manuscript-editor')
    if (!textarea) return
    try {
      const text = await navigator.clipboard?.readText()
      if (!text) {
        onToast('剪贴板里没有可粘贴的文字')
        setContextMenu(null)
        return
      }
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      setDraftContent(draftContent.slice(0, start) + text + draftContent.slice(end))
      window.requestAnimationFrame(() => {
        textarea.setSelectionRange(start + text.length, start + text.length)
      })
      onToast('已粘贴')
    } catch {
      onToast('粘贴失败：无法访问剪贴板')
    }
    setContextMenu(null)
  }

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (
        target.closest('.selection-toolbar') ||
        target.closest('.manuscript-context-menu')
      ) {
        return
      }
      setSelectionCapture(null)
      setContextMenu(null)
    }
    const handleScroll = () => {
      setSelectionCapture(null)
      setContextMenu(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    manuscriptScrollRef.current?.addEventListener('scroll', handleScroll)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      manuscriptScrollRef.current?.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const activePromptIds = work.promptIds.filter((id) =>
    prompts.some((prompt) => prompt.id === id),
  )
  const activePrompts = prompts.filter((prompt) => activePromptIds.includes(prompt.id))

  const provider = getProvider(api.provider)
  const providerLabel =
    api.provider === 'custom' ? '自定义' : provider.name.replace('（本地）', '')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    if (!apiReady || !api.baseUrl.trim() || !api.apiKey.trim()) {
      setAvailableModels([])
      return () => {
        cancelled = true
      }
    }
    void fetchModels(api)
      .then((models) => {
        if (!cancelled) setAvailableModels(models)
      })
      .catch(() => {
        if (!cancelled) setAvailableModels(api.model ? [api.model] : [])
      })
    return () => {
      cancelled = true
    }
  }, [apiReady, api.provider, api.baseUrl, api.apiKey, api.model])
  const modelOptions = !apiReady
    ? []
    : api.model && !availableModels.includes(api.model)
      ? [api.model, ...availableModels]
      : availableModels
  const reasoningEffort = api.reasoningEffort ?? 'auto'
  const totalWords = useMemo(
    () => chapters.reduce((sum, chapter) => sum + chapterWords(chapter), 0),
    [chapters],
  )
  const chapterOutlineMap = useMemo(() => {
    const map = new Map<string, OutlineCard>()
    for (const card of detail.outline ?? []) {
      if (card.chapterId) map.set(card.chapterId, card)
    }
    return map
  }, [detail.outline])
  const filteredChapters = useMemo(() => {
    const keyword = chapterQuery.trim().toLowerCase()
    return chapters.filter((chapter) => {
      if (chapterStageFilter !== 'all' && chapterStageOf(chapter) !== chapterStageFilter) {
        return false
      }
      if (!keyword) return true
      const outline = chapterOutlineMap.get(chapter.id)
      return `${chapter.title} ${chapter.summary ?? ''} ${outline?.summary ?? ''} ${outline?.goal ?? ''}`
        .toLowerCase()
        .includes(keyword)
    })
  }, [chapters, chapterOutlineMap, chapterQuery, chapterStageFilter])
  const visibleChapterLimit = Math.max(visibleChapterCount, currentIndex + 1)
  const visibleChapters = filteredChapters.slice(0, visibleChapterLimit)
  const hiddenChapterCount = Math.max(0, filteredChapters.length - visibleChapters.length)
  const chapterGroups = useMemo(() => {
    const arcs = detail.globalOutline?.arcs ?? []
    if (arcs.length === 0) {
      return [{ id: '', title: '全部章节', goal: '', chapters: visibleChapters }]
    }
    const groups = arcs.map((arc) => ({
      id: arc.id,
      title: arc.title || '未命名卷 / 阶段',
      goal: arc.goal,
      chapters: visibleChapters.filter(
        (chapter) => chapterOutlineMap.get(chapter.id)?.arcId === arc.id,
      ),
    }))
    const groupedIds = new Set(
      groups.flatMap((group) => group.chapters.map((chapter) => chapter.id)),
    )
    const ungrouped = visibleChapters.filter((chapter) => !groupedIds.has(chapter.id))
    return [
      ...groups,
      ...(ungrouped.length > 0
        ? [{ id: '__ungrouped', title: '未分卷', goal: '', chapters: ungrouped }]
        : []),
    ]
  }, [chapterOutlineMap, detail.globalOutline?.arcs, visibleChapters])
  const currentOutline = currentChapter ? outlineForChapter(detail, currentChapter.id) : undefined
  const currentStage = currentChapter ? chapterStageOf(currentChapter) : 'draft'
  const currentTarget = currentChapter
    ? chapterTargetWords(currentChapter, currentOutline)
    : 0
  const currentBeatProgress = currentChapter ? chapterBeatProgress(currentChapter) : 0
  const currentWarnings = currentChapter
    ? chapterPlanWarnings(currentChapter, currentOutline)
    : []
  const currentPlanPercent =
    currentTarget > 0 && currentChapter
      ? Math.min(100, Math.round((chapterWords(currentChapter) / currentTarget) * 100))
      : 0
  const currentAppearingCharacters = currentChapter
    ? detail.characters
        .filter((character) => character.name && currentChapter.content.includes(character.name))
        .slice(0, 5)
    : []
  const currentRelatedForeshadows = currentChapter
    ? detail.foreshadowings
        .filter(
          (item) =>
            item.plantedChapterId === currentChapter.id ||
            item.payoffChapterId === currentChapter.id ||
            (item.title && currentChapter.content.includes(item.title)),
        )
        .slice(0, 5)
    : []
  const harnessWords = currentChapter ? countWords(currentContent) : 0
  const balanceEntry = platformBalance?.balances[0] ?? null
  const cacheHitRate =
    sessionUsage.inputTokens > 0
      ? Math.round((sessionUsage.cachedInputTokens / sessionUsage.inputTokens) * 100)
      : 0

  const harnessContextTokens =
    estimateTokens(currentContent) + estimateTokens(directive) + estimateTokens(JSON.stringify(detail.storyStateEvents ?? []))
  const writingMode = resolveWritingMode(work, detail)
  const recentStoryEvents = (detail.storyStateEvents ?? [])
    .slice(-3)
    .reverse()
    .flatMap((event) => (event.events ?? []).map((item) => item.title))
  const openStoryThreads = (detail.storyStateEvents ?? []).flatMap(
    (event) => event.openThreads ?? [],
  )
  const totalStoryEvents = (detail.storyStateEvents ?? []).reduce(
    (sum, event) => sum + Math.max(1, event.events?.length ?? 0),
    0,
  )
  const chapterDone = (currentChapter?.status ?? 'writing') === 'done'
  const workDone = work.status === '已完结'
  const chapterReadOnly = chapterDone || workDone
  const completedChapterCount = chapters.filter((chapter) => chapter.status === 'done').length
  const unfinishedChapters = chapters.filter((chapter) => chapter.status !== 'done')
  const unresolvedForeshadowings = detail.foreshadowings.filter(
    (item) => item.status === '未回收',
  ).length
  const setWritingMode = (mode: 'director' | 'wheelchair') => {
    if (isGenerating || syncingState || syncingAll || autoWriteRunning) {
      onToast('正在写作或同步设定，完成后再切换模式')
      return
    }
    onUpdateWork({ writingMode: mode })
    onToast(`已切换到${writingModeLabel(mode)}`)
  }

  const handleRecordUsage = (entry: AiUsageEntry) => {
    const effectivePrice =
      entry.profile === 'writing'
        ? resolveWritingPrice(writingPricing.rules, api.provider, api.model, entry.at)
        : undefined
    const cost =
      effectivePrice && (effectivePrice.inputPrice > 0 || effectivePrice.outputPrice > 0)
        ? calculateUsageCost(
            {
              inputTokens: entry.inputTokens,
              outputTokens: entry.outputTokens,
              cachedInputTokens: entry.cachedInputTokens,
              cacheWriteTokens: entry.cacheWriteTokens,
              uncachedInputTokens: entry.uncachedInputTokens,
            },
            effectivePrice.inputPrice,
            effectivePrice.outputPrice,
            effectivePrice.cacheHitPrice,
            effectivePrice.cacheWritePrice,
            true,
          )
        : undefined
    const { cost: _previousCost, ...entryWithoutCost } = entry
    const normalized: AiUsageEntry = {
      ...entryWithoutCost,
      workId: work.id,
      chapterId: entry.chapterId ?? currentChapter?.id,
      sessionId: usageSessionIdRef.current,
      ...(effectivePrice
        ? {
            currency: 'CNY',
            peak: effectivePrice.offPeak,
            priceSource: effectivePrice.rule.id,
            priceConfidence: 'high' as const,
          }
        : {}),
      ...(cost === undefined ? {} : { cost }),
    }
    onRecordUsage?.(normalized)
    if (entry.profile === 'writing') {
      setSessionUsage((current) => addUsageTotals(current, normalized))
    }
  }

  const resetSessionUsage = () => {
    usageSessionIdRef.current = `usage-session-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`
    setSessionUsage(emptyUsageTotals())
  }

  const recordUsage = (
    kind: AiUsageEntry['kind'],
    input: string,
    output: string,
    note?: string,
    usage?: ChatUsage,
  ) => {
    const inputTokens = usage?.inputTokens ?? estimateTokens(input)
    const outputTokens = usage?.outputTokens ?? estimateTokens(output)
    handleRecordUsage({
      id: `usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      at: Date.now(),
      kind,
      profile: 'writing',
      model: api.model,
      inputTokens,
      outputTokens,
      cachedInputTokens: usage?.cachedInputTokens,
      cacheWriteTokens: usage?.cacheWriteTokens,
      uncachedInputTokens: usage?.uncachedInputTokens,
      note,
      actual: Boolean(usage),
    })
  }

  useEffect(() => {
    if (chapters.length === 0) {
      if (activeChapterId) setActiveChapterId('')
      return
    }
    if (!chapters.some((chapter) => chapter.id === activeChapterId)) {
      setActiveChapterId(chapters[0].id)
    }
  }, [chapters, activeChapterId])

  useEffect(() => {
    if (!activeChapterId) return
    if (!chapters.some((chapter) => chapter.id === activeChapterId)) return
    try {
      window.localStorage.setItem(`shuoxi.activeChapter.v1.${work.id}`, activeChapterId)
    } catch {
      // 本地存储失败不影响写作。
    }
  }, [activeChapterId, chapters, work.id])

  useEffect(() => {
    manuscriptScrollRef.current?.scrollTo({ top: 0 })
    setEditing(false)
    setHistoryOpen(false)
  }, [activeChapterId])

  useEffect(() => {
    if (!isGenerating) return
    const element = manuscriptScrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [streamingText, isGenerating])

  useEffect(() => {
    const hidden = detailMode === 'fullscreen'
    for (const element of [chaptersRef.current, manuscriptRef.current]) {
      if (!element) continue
      const interactive = element as HTMLElement & { inert: boolean }
      interactive.inert = hidden
      if (hidden) element.setAttribute('aria-hidden', 'true')
      else element.removeAttribute('aria-hidden')
    }
  }, [detailMode])

  useEffect(() => {
    if (detailMode === 'collapsed') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (event.isComposing || event.keyCode === 229) return
      if (document.querySelector('.modal-backdrop') || document.querySelector('.genre-pop')) return

      const active = document.activeElement
      if (active instanceof HTMLElement) {
        const tag = active.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) {
          return
        }
      }

      if (detailMode === 'fullscreen') {
        event.preventDefault()
        setDetailMode('expanded')
        return
      }

      event.preventDefault()
      setDetailMode('collapsed')
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [detailMode])

  useEffect(() => {
    if (!bookSearchHighlight) return
    const scrollTimer = window.setTimeout(() => {
      document
        .querySelector<HTMLElement>('.book-search-mark')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 80)
    const clearTimer = window.setTimeout(() => setBookSearchHighlight(''), 8000)
    return () => {
      window.clearTimeout(scrollTimer)
      window.clearTimeout(clearTimer)
    }
  }, [bookSearchHighlight, currentChapter?.id])

  useEffect(() => {
    const handleLayoutShortcut = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey
      if (!modifier || event.isComposing) return
      if (event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setComposerCollapsed((value) => !value)
        setComposerTool(null)
      }
      if (event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setComposerCollapsed(false)
        setComposerTool('search')
      }
    }
    window.addEventListener('keydown', handleLayoutShortcut)
    return () => window.removeEventListener('keydown', handleLayoutShortcut)
  }, [setComposerCollapsed])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const selectChapter = (chapterId: string) => {
    if (isGenerating) {
      onToast('正在生成，先停止或等这一场写完再切换章节')
      return
    }
    setActiveChapterId(chapterId)
    const index = chapters.findIndex((chapter) => chapter.id === chapterId)
    if (index >= 0) setVisibleChapterCount((count) => Math.max(count, index + 1))
  }

  const startFromOutline = (card: OutlineCard) => {
    if (!card.chapterId) {
      onToast('本章大纲还没有绑定正文章节')
      return
    }
    selectChapter(card.chapterId)
    setDirective(outlineToDirective(card))
    onToast('已把本章大纲填入导演指令，确认后再点继续写')
  }

  const openChapterOutline = () => {
    setDetailMode('expanded')
    setDetailFocusRequest({ tab: 'outline', requestId: Date.now() })
  }

  const openPromptPicker = () => {
    setPromptDraft(activePromptIds)
    setPromptPickerOpen(true)
  }

  const savePromptIds = (ids: string[]) => {
    onSavePromptIds(ids)
    setPromptPickerOpen(false)
    onToast(ids.length > 0 ? `已启用 ${ids.length} 条提示词` : '已清空本作提示词')
  }

  const appendDirective = (text: string) => {
    setDirective((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text))
  }

  const openComposerTool = (tool: ComposerToolId) => {
    setComposerTool((prev) => (prev === tool ? null : tool))
    if (tool === 'beats') {
      setBeatsDraft(currentChapter?.beats ?? EMPTY_BEATS)
    }
    if (tool === 'mention') setMentionQuery('')
  }

  const insertMention = (name: string) => {
    appendDirective(`@${name} `)
    setComposerTool(null)
    onToast(`已引用 ${name}`)
  }

  const saveBeats = () => {
    if (!currentChapter) return
    onUpdateChapter(currentChapter.id, { beats: beatsDraft })
    setComposerTool(null)
    onToast('本章三拍目标已保存')
  }

  const openAssistantWithPrompt = (text: string) => {
    setAssistantSeed({ id: `seed-${Date.now().toString(36)}`, text })
    setAssistantOpen(true)
    setComposerTool(null)
  }

  const withComposerControls = (instruction: string) => {
    const extras: string[] = []
    const beats = currentChapter?.beats
    if (beats) {
      if (beats.advance.trim()) extras.push(`本章必须推进：${beats.advance.trim()}`)
      if (beats.reveal.trim()) extras.push(`本章必须暴露：${beats.reveal.trim()}`)
      if (beats.hook.trim()) extras.push(`本章结尾钩子：${beats.hook.trim()}`)
      if (beats.goal?.trim()) extras.push(`场景目标：${beats.goal.trim()}`)
      if (beats.obstacle?.trim()) extras.push(`场景阻力：${beats.obstacle.trim()}`)
      if (beats.turn?.trim()) extras.push(`场景转折：${beats.turn.trim()}`)
      if (beats.change?.trim()) extras.push(`场景结束时必须改变：${beats.change.trim()}`)
    }
    if (lengthPreset > 0) extras.push(`本次生成约 ${lengthPreset} 字`)
    if (pacePreset !== '默认') extras.push(`本次节奏：${pacePreset}`)
    return extras.length ? `${instruction}\n\n【本次生成要求】\n${extras.join('\n')}` : instruction
  }

  const contextOptions = resolveContextOptions(work)
  const unresolvedForeshadowItems = detail.foreshadowings.filter((item) => item.status === '未回收')
  const mentionItems = [
    ...detail.characters.map((item) => ({ id: `character-${item.id}`, name: item.name, kind: '人物' })),
    ...detail.factions.map((item) => ({ id: `faction-${item.id}`, name: item.name, kind: '势力' })),
    ...(detail.locations ?? []).map((item) => ({ id: `location-${item.id}`, name: item.name, kind: '地点' })),
    ...detail.foreshadowings.map((item) => ({ id: `foreshadow-${item.id}`, name: item.title, kind: '伏笔' })),
  ]
    .filter((item) => item.name.trim())
    .filter((item) => !mentionQuery.trim() || item.name.includes(mentionQuery.trim()))
    .slice(0, 30)
  const continuityWarnings = composerTool === 'continuity' ? checkContinuity(detail, chapters).slice(0, 8) : []
  let contextTokens = 0
  if (composerTool === 'context' && currentChapter) {
    const messages = buildGenerationMessages({
      work,
      detail,
      chapters,
      chapter: currentChapter,
      baseContent: currentContent,
      directive: directive.trim() || '（还没有导演指令）',
      prompts: activePrompts,
      reasoningEffort,
      api,
    })
    contextTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0)
  }

  const analyzeScene = async () => {
    if (!currentChapter || sceneBriefLoading) return
    if (!apiReady) {
      onToast('先在设置里配置写作 AI，再做场记分析')
      return
    }
    setComposerTool('brief')
    setSceneBriefLoading(true)
    setSceneBrief('')
    try {
      const messages = buildSceneBriefMessages({
        work,
        detail,
        chapters,
        chapter: currentChapter,
        baseContent: currentContent,
        directive: directive.trim(),
        prompts: activePrompts,
        reasoningEffort,
        api,
      })
      const result = await runApiTask(api, {
        task: 'analysis.story',
        messages,
        maxTokens: 1800,
        temperature: 0.35,
      })
      setSceneBrief(result.trim())
      onToast('场记分析已生成，可修改后填入导演指令')
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : '场记分析失败')
    } finally {
      setSceneBriefLoading(false)
    }
  }

  const toggleContextOption = (key: keyof WritingContextOptions) => {
    onUpdateWork({
      contextOptions: {
        ...contextOptions,
        [key]: !contextOptions[key],
      },
    })
  }

  const hasBrief = Boolean(
    detail.currentSummary || recentStoryEvents.length || openStoryThreads.length,
  )
  const beatsFilled = currentChapter?.beats
    ? [currentChapter.beats.advance, currentChapter.beats.reveal, currentChapter.beats.hook].filter(
        (item) => item.trim(),
      ).length
    : 0
  const composerToolSide =
    composerTool === 'beats' || composerTool === 'context' || composerTool === 'mention'
      ? 'left'
      : 'right'
  const composerToolTitle: Record<ComposerToolId, string> = {
    beats: '本章目标',
    context: '上下文与预算',
    brief: '场记分析',
    mention: '@ 引用实体',
    actions: '写作动作',
    continuity: '连续性检查',
    foreshadow: '未回收伏笔',
    inspire: '灵感与钩子',
    continue: 'AI 自动续写',
    search: '搜索本书',
  }

  const renderComposerToolPanel = () => {
    if (!composerTool) return null
    const close = () => setComposerTool(null)
    const content = (() => {
      if (composerTool === 'beats') {
        return (
          <div className="composer-tool-stack">
            <label>
              推进
              <input
                className="input composer-tool-input"
                value={beatsDraft.advance}
                placeholder="本章必须推进什么"
                onChange={(event) =>
                  setBeatsDraft((prev) => ({ ...prev, advance: event.target.value }))
                }
              />
            </label>
            <label>
              暴露
              <input
                className="input composer-tool-input"
                value={beatsDraft.reveal}
                placeholder="本章必须暴露什么"
                onChange={(event) =>
                  setBeatsDraft((prev) => ({ ...prev, reveal: event.target.value }))
                }
              />
            </label>
            <label>
              钩子
              <input
                className="input composer-tool-input"
                value={beatsDraft.hook}
                placeholder="本章结尾留什么钩子"
                onChange={(event) =>
                  setBeatsDraft((prev) => ({ ...prev, hook: event.target.value }))
                }
              />
            </label>
            <div className="composer-tool-grid">
              <label>
                场景目标
                <input
                  className="input composer-tool-input"
                  value={beatsDraft.goal ?? ''}
                  placeholder="这一场人物想要什么"
                  onChange={(event) =>
                    setBeatsDraft((prev) => ({ ...prev, goal: event.target.value }))
                  }
                />
              </label>
              <label>
                场景阻力
                <input
                  className="input composer-tool-input"
                  value={beatsDraft.obstacle ?? ''}
                  placeholder="什么阻止了他"
                  onChange={(event) =>
                    setBeatsDraft((prev) => ({ ...prev, obstacle: event.target.value }))
                  }
                />
              </label>
              <label>
                场景转折
                <input
                  className="input composer-tool-input"
                  value={beatsDraft.turn ?? ''}
                  placeholder="中途发生什么变化"
                  onChange={(event) =>
                    setBeatsDraft((prev) => ({ ...prev, turn: event.target.value }))
                  }
                />
              </label>
              <label>
                结束变化
                <input
                  className="input composer-tool-input"
                  value={beatsDraft.change ?? ''}
                  placeholder="结束时什么和开始不同"
                  onChange={(event) =>
                    setBeatsDraft((prev) => ({ ...prev, change: event.target.value }))
                  }
                />
              </label>
            </div>
            <div className="composer-tool-chips">
              <span>本次长度</span>
              {LENGTH_OPTIONS.map((length) => (
                <button
                  key={length}
                  type="button"
                  className={lengthPreset === length ? 'active' : ''}
                  onClick={() => setLengthPreset(length)}
                >
                  {length === 0 ? '不限' : `${length} 字`}
                </button>
              ))}
            </div>
            <div className="composer-tool-chips">
              <span>本次节奏</span>
              {PACE_OPTIONS.map((pace) => (
                <button
                  key={pace}
                  type="button"
                  className={pacePreset === pace ? 'active' : ''}
                  onClick={() => setPacePreset(pace)}
                >
                  {pace}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={saveBeats}>
              保存本章目标
            </button>
          </div>
        )
      }
      if (composerTool === 'context') {
        const options: [keyof WritingContextOptions, string][] = [
          ['state', '角色与状态'],
          ['events', '事件簿与承接'],
          ['foreshadowings', '未回收伏笔'],
          ['globalOutline', '全局大纲'],
          ['chapterOutline', '当前章大纲'],
        ]
        return (
          <div className="composer-tool-stack">
            <p className="composer-tool-meta">
              估算 <strong>{contextTokens.toLocaleString()}</strong> tokens · 建议上限 16,000
            </p>
            <div className="composer-context-toggles">
              {options.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={contextOptions[key] ? 'active' : ''}
                  onClick={() => toggleContextOption(key)}
                >
                  <span>{label}</span>
                  <small>{contextOptions[key] ? '开' : '关'}</small>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setContextOpen(true)
                close()
              }}
            >
              查看完整上下文预算
            </button>
          </div>
        )
      }
      if (composerTool === 'brief') {
        return (
          <div className="composer-tool-stack">
            <p className="composer-tool-meta">
              先让 AI 把这场戏拆成场记单：在场角色、各自知道什么、冲突、必须回收的线和结尾钩子。不会写正文。
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={sceneBriefLoading || !apiReady}
              onClick={() => void analyzeScene()}
            >
              <IconSparkles size={14} />
              {sceneBriefLoading ? '分析中…' : sceneBrief ? '重新分析' : '分析这一场'}
            </button>
            {sceneBrief ? (
              <>
                <textarea
                  className="input textarea composer-brief-text"
                  value={sceneBrief}
                  rows={12}
                  onChange={(event) => setSceneBrief(event.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setDirective((prev) =>
                      [prev.trim(), '【场记分析】', sceneBrief.trim()].filter(Boolean).join('\n\n'),
                    )
                    setComposerTool(null)
                    onToast('场记分析已追加到导演指令')
                  }}
                >
                  填入导演指令
                </button>
              </>
            ) : null}
          </div>
        )
      }
      if (composerTool === 'mention') {
        return (
          <div className="composer-tool-stack">
            <input
              className="input composer-tool-input"
              value={mentionQuery}
              placeholder="搜索人物、势力、地点、伏笔…"
              autoFocus
              onChange={(event) => setMentionQuery(event.target.value)}
            />
            <div className="composer-mention-list">
              {mentionItems.length === 0 ? (
                <p className="composer-tool-empty">没有匹配的实体。</p>
              ) : (
                mentionItems.map((item) => (
                  <button key={item.id} type="button" onClick={() => insertMention(item.name)}>
                    <span>{item.name}</span>
                    <small>{item.kind}</small>
                  </button>
                ))
              )}
            </div>
          </div>
        )
      }
      if (composerTool === 'actions') {
        return (
          <div className="composer-action-list">
            {WRITING_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  appendDirective(action.instruction)
                  close()
                  onToast(`已追加「${action.label}」要求，确认后再发送`)
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )
      }
      if (composerTool === 'continuity') {
        return (
          <div className="composer-tool-stack">
            {continuityWarnings.length === 0 ? (
              <p className="composer-tool-empty">当前章节没有发现本地连续性问题。</p>
            ) : (
              <div className="composer-warning-list">
                {continuityWarnings.map((warning) => (
                  <div key={warning.id}>
                    <strong>{warning.title}</strong>
                    <small>{warning.detail}</small>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={auditingContinuity}
              onClick={() => {
                close()
                void auditContinuity()
              }}
            >
              {auditingContinuity ? 'AI 审查中…' : 'AI 连续性审查'}
            </button>
          </div>
        )
      }
      if (composerTool === 'foreshadow') {
        return (
          <div className="composer-tool-stack">
            {unresolvedForeshadowItems.length === 0 ? (
              <p className="composer-tool-empty">目前没有未回收伏笔。</p>
            ) : (
              <div className="composer-foreshadow-list">
                {unresolvedForeshadowItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      appendDirective(`本章推进伏笔：${item.title}`)
                      close()
                      onToast(`已追加伏笔「${item.title}」`)
                    }}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      }
      if (composerTool === 'search') {
        const query = bookSearchQuery.trim()
        const order = [
          'chapter',
          'character',
          'species',
          'faction',
          'location',
          'item',
          'weapon',
          'technique',
          'foreshadow',
          'event',
        ] as const
        const groups = order
          .map((kind) => ({
            kind,
            items: bookSearchResults.filter((result) => result.kind === kind),
          }))
          .filter((group) => group.items.length > 0)
        const renderSnippet = (text: string) => {
          if (!query || !text) return text
          const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
          return parts.map((part, index) =>
            part.toLowerCase() === query.toLowerCase() ? (
              <mark className="book-search-mark" key={`${part}-${index}`}>
                {part}
              </mark>
            ) : (
              part
            ),
          )
        }
        const openResult = (result: BookSearchResult) => {
          setComposerTool(null)
          if (result.kind === 'chapter' && result.chapterId) {
            setBookSearchHighlight(query)
            selectChapter(result.chapterId)
            onToast(`已定位到《${work.title}》的${result.title}`)
            return
          }
          if (result.tab) {
            if (result.kind === 'event' && result.chapterId) {
              selectChapter(result.chapterId)
            }
            setDetailMode('expanded')
            setDetailFocusRequest({ tab: result.tab, requestId: Date.now() })
            onToast(`已打开${BOOK_SEARCH_KIND_LABELS[result.kind]}页签`)
          }
        }
        return (
          <div className="composer-tool-stack book-search-tool">
            <div className="book-search-input-wrap">
              <IconSearch size={14} />
              <input
                className="input book-search-input"
                autoFocus
                value={bookSearchQuery}
                placeholder="搜索本书：章名、正文、人物、势力…"
                onChange={(event) => setBookSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setComposerTool(null)
                    return
                  }
                  if (event.key === 'Enter' && bookSearchResults[0]) {
                    event.preventDefault()
                    openResult(bookSearchResults[0])
                  }
                }}
              />
              {bookSearchQuery ? (
                <button
                  type="button"
                  className="book-search-clear"
                  aria-label="清空搜索"
                  onClick={() => setBookSearchQuery('')}
                >
                  ×
                </button>
              ) : null}
            </div>
            <p className="composer-tool-meta">
              只搜索《{work.title}》当前作品，不跨书、不调用 AI
            </p>
            {!query ? (
              <p className="composer-tool-empty">
                输入关键词，结果会按章节、人物、势力、地点、物品、伏笔和事件分组。
              </p>
            ) : bookSearchResults.length === 0 ? (
              <p className="composer-tool-empty">这本书里没有找到「{query}」。</p>
            ) : (
              <div className="book-search-results">
                {groups.map((group) => (
                  <div className="book-search-group" key={group.kind}>
                    <div className="book-search-group-head">
                      <span>{BOOK_SEARCH_KIND_LABELS[group.kind]}</span>
                      <small>{group.items.length}</small>
                    </div>
                    {group.items.map((result) => (
                      <button
                        key={`${result.kind}-${result.id}`}
                        type="button"
                        className="book-search-result"
                        onClick={() => openResult(result)}
                      >
                        <strong>{result.title}</strong>
                        <small>{result.subtitle}</small>
                        <p>{renderSnippet(result.snippet)}</p>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }
      if (composerTool === 'continue') {
        const customValue = Number(continueCustom)
        const selectedWords =
          Number.isFinite(customValue) && customValue > 0
            ? Math.max(100, Math.min(5000, Math.round(customValue)))
            : continueWords
        return (
          <div className="composer-tool-stack continue-tool">
            <p className="composer-tool-meta">
              不用输入指令。AI 会接着当前剧情自己判断下一步，主动推进场景和人物行动。
            </p>
            <div className="composer-tool-chips">
              <span>生成字数</span>
              {[300, 500, 800, 1200, 1500, 2000].map((words) => (
                <button
                  key={words}
                  type="button"
                  className={!continueCustom && continueWords === words ? 'active' : ''}
                  onClick={() => {
                    setContinueWords(words)
                    setContinueCustom('')
                  }}
                >
                  {words}
                </button>
              ))}
            </div>
            <label className="continue-custom">
              <span>自定义字数</span>
              <input
                className="input composer-tool-input"
                type="number"
                min={100}
                max={5000}
                placeholder="例如 1600"
                value={continueCustom}
                onChange={(event) => setContinueCustom(event.target.value)}
              />
            </label>
            <div className="continue-actions">
              <span>本次约 {selectedWords} 字</span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!currentChapter || chapterReadOnly || isGenerating}
                onClick={() => startUnpromptedWriting(selectedWords)}
              >
                开始续写
              </button>
            </div>
            {!apiReady ? (
              <p className="composer-tool-empty">先配置 AI 模型后才能自动续写。</p>
            ) : null}
          </div>
        )
      }
      return (
        <div className="composer-inspire-list">
          {INSPIRATION_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              disabled={!apiReady}
              onClick={() => openAssistantWithPrompt(option.prompt)}
            >
              {option.label}
            </button>
          ))}
          {!apiReady ? <p className="composer-tool-empty">先配置 AI 模型后才能使用灵感助手。</p> : null}
        </div>
      )
    })()

    return (
      <div className={`composer-tool-panel ${composerToolSide}`}>
        <div className="composer-tool-head">
          <strong>{composerToolTitle[composerTool]}</strong>
          <button type="button" onClick={close} aria-label="关闭工具面板">
            ×
          </button>
        </div>
        {content}
      </div>
    )
  }

  const handleAddChapter = () => {
    if (workDone) {
      onToast('本书已完结，重新开启连载后再新建章节')
      return
    }
    if (isGenerating || syncingAll) {
      onToast('正在生成或同步，先等完成再新建章节')
      return
    }
    const id = onAddChapter()
    setActiveChapterId(id)
    onToast('新章节已创建')
  }

  const createChapterFromOutline = (title: string): string => {
    const id = onAddChapter()
    onUpdateChapter(id, { title })
    setActiveChapterId(id)
    onToast('已从大纲创建章节')
    return id
  }

  const addRescueChapter = (draft: RescueChapterDraft) => {
    const id = onAddChapter()
    onUpdateChapter(id, {
      title: draft.title,
      content: draft.content,
      wordCount: countWords(draft.content),
    })
    setActiveChapterId(id)
  }

  const handleDeleteChapter = (chapterId: string) => {
    if (isGenerating) {
      onToast('正在生成，先停止再删除章节')
      return
    }
    if (chapters.length <= 1) {
      onToast('至少保留一个章节')
      return
    }
    const remaining = chapters.filter((chapter) => chapter.id !== chapterId)
    onDeleteChapter(chapterId)
    if (activeChapterId === chapterId) setActiveChapterId(remaining[0]?.id ?? '')
  }

  const startTitleEdit = () => {
    if (!currentChapter) return
    if (workDone) {
      onToast('本书已完结，重新开启连载后再修改')
      return
    }
    setTitleDraft(currentChapter.title === '未命名章节' ? '' : currentChapter.title)
    setTitleEditing(true)
  }

  const saveTitle = (value?: string) => {
    if (!currentChapter) return
    const next = (value ?? titleDraft).trim() || `第 ${currentIndex + 1} 章`
    onUpdateChapter(currentChapter.id, {
      title: next,
      titleSource: 'manual',
      titleLocked: true,
    })
    setTitleEditing(false)
    setTitleSuggestions([])
    onToast('章节标题已更新')
  }

  const suggestTitles = async () => {
    if (!currentChapter || suggestingTitle) return
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      onOpenSettings()
      return
    }
    setSuggestingTitle(true)
    try {
      const messages = buildTitleMessages({
        work,
        chapter: currentChapter,
        content: currentContent,
        directive,
      })
      let actualUsage: ChatUsage | undefined
      const result = await runAiTask({
        task: 'writing.title',
        apis: { writing: api, general: generalApi, chat: api },
        messages,
        maxTokens: 160,
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      const suggestions = parseTitleSuggestions(result)
      if (suggestions.length === 0) throw new Error('没有返回可用标题')
      setTitleSuggestions(suggestions)
      recordUsage(
        '标题生成',
        messages.map((message) => message.content).join('\n'),
        result,
        undefined,
        actualUsage,
      )
    } catch (caught) {
      onToast(`标题生成失败：${errorMessage(caught)}`)
    } finally {
      setSuggestingTitle(false)
    }
  }

  const applyTitleSuggestion = (title: string) => {
    if (!currentChapter) return
    onUpdateChapter(currentChapter.id, {
      title,
      titleSource: 'ai',
      titleLocked: true,
    })
    setTitleEditing(false)
    setTitleSuggestions([])
    onToast(`已采用标题「${title}」`)
  }

  const writeLocalChapterSummary = (chapter: Chapter, content = chapter.content) => {
    if (!syncSettings.localChapterSummary || !content.trim()) return
    const next = createLocalChapterSummary({ ...chapter, content }, detail)
    if (!next.summary || next.summary === chapter.summary) return
    onUpdateChapter(chapter.id, {
      summary: next.summary,
      summarySource: 'local',
    })
  }

  const completeChapter = () => {
    if (!currentChapter || chapterDone) return
    if (!currentChapter.content.trim()) {
      onToast('本章还没有正文，不能标记完成')
      return
    }
    const fallbackTitle =
      currentChapter.title.trim() && currentChapter.title.trim() !== '未命名章节'
        ? currentChapter.title.trim()
        : `第 ${currentIndex + 1} 章`
    onUpdateChapter(currentChapter.id, {
      title: fallbackTitle,
      titleSource: currentChapter.titleSource ?? 'default',
      status: 'done',
      stage: 'done',
      completedAt: Date.now(),
    })
    const bound = (detail.outline ?? []).find((card) => card.chapterId === currentChapter.id)
    if (bound) {
      onUpdateDetail({
        outline: (detail.outline ?? []).map((card) =>
          card.id === bound.id ? { ...card, status: '已完成' } : card,
        ),
      })
    }
    if (work.status === '草稿') {
      onUpdateWork({ status: '连载中', startedAt: work.startedAt ?? Date.now() })
      onToast('本章已完成，本书已标记为连载中')
    } else {
      onToast('本章已完成')
    }
    setCompleteOpen(false)
    setEditing(false)
    writeLocalChapterSummary(currentChapter)
    void maybeAutoSyncCompletedChapter(currentChapter, currentChapter.content)
  }

  const reopenChapter = () => {
    if (!currentChapter) return
    if (workDone) {
      onToast('本书已完结，先重新开启连载')
      return
    }
    onUpdateChapter(currentChapter.id, {
      status: 'writing',
      stage: 'writing',
      completedAt: undefined,
    })
    onToast('本章已重新打开')
  }

  const changeChapterStage = (stage: ChapterStage) => {
    if (!currentChapter || workDone) return
    onUpdateChapter(currentChapter.id, {
      stage,
      status: chapterStatusForStage(stage),
      completedAt:
        stage === 'done' || stage === 'published'
          ? currentChapter.completedAt ?? Date.now()
          : undefined,
    })
    onToast(`本章阶段：${CHAPTER_STAGE_LABELS[stage]}`)
  }

  const copyToClipboard = (text: string, message: string) => {
    if (!text.trim()) {
      onToast('这里还没有可复制的内容')
      return
    }
    void navigator.clipboard?.writeText(text)
    onToast(message)
  }

  const renameChapterFromMenu = (chapter: Chapter) => {
    if (isGenerating) return
    if (workDone) {
      onToast('本书已完结，重新开启连载后再修改')
      return
    }
    if (chapter.id === currentChapter?.id) {
      startTitleEdit()
      return
    }
    selectChapter(chapter.id)
    window.setTimeout(() => {
      setTitleDraft(chapter.title === '未命名章节' ? '' : chapter.title)
      setTitleEditing(true)
    }, 30)
  }

  const setChapterDoneFromMenu = (chapter: Chapter, done: boolean) => {
    if (isGenerating) return
    if (workDone) {
      onToast('本书已完结，先重新开启连载')
      return
    }
    if (done) {
      if (!chapter.content.trim()) {
        onToast('本章还没有正文，不能标记完成')
        return
      }
      const fallbackTitle =
        chapter.title.trim() && chapter.title.trim() !== '未命名章节'
          ? chapter.title.trim()
          : `第 ${chapters.findIndex((item) => item.id === chapter.id) + 1} 章`
      onUpdateChapter(chapter.id, {
        title: fallbackTitle,
        titleSource: chapter.titleSource ?? 'default',
        status: 'done',
        stage: 'done',
        completedAt: Date.now(),
      })
      onToast('本章已标记完成')
      return
    }
    onUpdateChapter(chapter.id, {
      status: 'writing',
      stage: 'writing',
      completedAt: undefined,
    })
    onToast('本章已重新打开')
  }

  const duplicateChapter = (chapter: Chapter) => {
    if (isGenerating || workDone) return
    const id = onAddChapter()
    onUpdateChapter(id, {
      title: `${chapter.title || '未命名章节'} 副本`,
      content: chapter.content,
      wordCount: countWords(chapter.content),
      status: 'writing',
      completedAt: undefined,
    })
    setActiveChapterId(id)
    onToast('已复制为新章节')
  }

  const openChapterHistory = (chapterId: string) => {
    if (chapterId !== currentChapter?.id) selectChapter(chapterId)
    window.setTimeout(() => setHistoryOpen(true), 30)
  }

  const chapterContextMenu = (chapter: Chapter, index: number): ContextMenuEntry[] => [
    { type: 'label', label: `第 ${index + 1} 章 · ${chapter.title || '未命名章节'}` },
    {
      label: '打开这一章',
      disabled: isGenerating,
      onSelect: () => selectChapter(chapter.id),
    },
    {
      label: '重命名',
      disabled: isGenerating || workDone,
      hint: workDone ? '本书已完结' : undefined,
      onSelect: () => renameChapterFromMenu(chapter),
    },
    { type: 'separator' },
    chapter.status === 'done'
      ? {
          label: '重新打开本章',
          disabled: isGenerating || workDone,
          onSelect: () => setChapterDoneFromMenu(chapter, false),
        }
      : {
          label: '标记本章完成',
          disabled: isGenerating || workDone || !chapter.content.trim(),
          hint: !chapter.content.trim() ? '本章还没有正文' : workDone ? '本书已完结' : undefined,
          onSelect: () => setChapterDoneFromMenu(chapter, true),
        },
    { type: 'separator' },
    {
      label: '复制标题',
      onSelect: () => copyToClipboard(chapter.title, '已复制章节标题'),
    },
    {
      label: '复制正文',
      disabled: !chapter.content.trim(),
      onSelect: () => copyToClipboard(chapter.content, '已复制本章正文'),
    },
    { type: 'separator' },
    {
      label: '上移章节',
      disabled: isGenerating || index === 0,
      onSelect: () => onMoveChapter(chapter.id, -1),
    },
    {
      label: '下移章节',
      disabled: isGenerating || index === chapters.length - 1,
      onSelect: () => onMoveChapter(chapter.id, 1),
    },
    { type: 'separator' },
    {
      label: '复制为新章节',
      disabled: isGenerating || workDone,
      onSelect: () => duplicateChapter(chapter),
    },
    {
      label: '导出本章…',
      onSelect: () => openExportNovel(chapter.id),
    },
    {
      label: '查看版本历史',
      disabled: !chapter.history?.length,
      onSelect: () => openChapterHistory(chapter.id),
    },
    { type: 'separator' },
    {
      label: '删除章节…',
      danger: true,
      disabled: isGenerating || chapters.length <= 1,
      hint: chapters.length <= 1 ? '至少保留一个章节' : isGenerating ? '正在生成' : undefined,
      onSelect: () => {
        setDeleteChapterTarget(chapter)
      },
    },
  ]

  const finishWork = () => {
    if (!finishChecked) {
      onToast('请先确认完结检查项')
      return
    }
    onUpdateWork({
      status: '已完结',
      completedAt: Date.now(),
      completionNote: completionNote.trim(),
      startedAt: work.startedAt ?? Date.now(),
    })
    setWorkStatusOpen(false)
    setFinishChecked(false)
    setCompletionNote('')
    onToast('本书已标记为已完结')
  }

  const reopenWork = () => {
    onUpdateWork({ status: '连载中', completedAt: undefined })
    setWorkStatusOpen(false)
    onToast('已重新开启连载')
  }

  const openWorkStatusModal = () => {
    setFinishChecked(false)
    setCompletionNote(work.completionNote ?? '')
    setWorkStatusOpen(true)
  }

  const startEditing = () => {
    if (!currentChapter) return
    if (chapterReadOnly) {
      onToast(chapterDone ? '本章已完成，先重新打开再编辑' : '本书已完结，先重新开启连载')
      return
    }
    const content = currentChapter.content
    const scroller = manuscriptScrollRef.current
    const maxScroll = scroller ? Math.max(0, scroller.scrollHeight - scroller.clientHeight) : 0
    const ratio = scroller && maxScroll > 0 ? scroller.scrollTop / maxScroll : 0
    pendingEditCaretRef.current = Math.round(content.length * ratio)
    pendingEditScrollRef.current = scroller?.scrollTop ?? 0
    setDraftContent(content)
    setEditing(true)
  }

  const saveEditing = () => {
    if (!currentChapter) return
    onUpdateChapter(currentChapter.id, { content: draftContent })
    setEditing(false)
    onToast('正文已保存')
  }

  const undoContent = () => {
    if (!currentChapter) return
    if (chapterReadOnly) {
      onToast(chapterDone ? '本章已完成，先重新打开' : '本书已完结，先重新开启连载')
      return
    }
    const history = currentChapter.history ?? []
    const last = history[history.length - 1]
    if (!last) {
      onToast('还没有可撤销的版本')
      return
    }
    skipRedoClearRef.current = true
    setRedoStack((prev) => [...prev, currentChapter.content].slice(-20))
    onUpdateChapter(currentChapter.id, { content: last.content })
    setEditing(false)
    onToast('已撤销到上一个版本')
  }

  const redoContent = () => {
    if (!currentChapter) return
    if (chapterReadOnly) {
      onToast(chapterDone ? '本章已完成，先重新打开' : '本书已完结，先重新开启连载')
      return
    }
    const next = redoStack[redoStack.length - 1]
    if (!next) {
      onToast('没有可重做的修改')
      return
    }
    skipRedoClearRef.current = true
    setRedoStack((prev) => prev.slice(0, -1))
    onUpdateChapter(currentChapter.id, { content: next })
    setEditing(false)
    onToast('已重做修改')
  }

  const restoreVersion = (content: string) => {
    if (!currentChapter || chapterReadOnly) return
    onUpdateChapter(currentChapter.id, { content })
    setEditing(false)
    setHistoryOpen(false)
    onToast('已恢复正文版本')
  }

  const requestStateUpdate = async (
    messages: ChatMessage[],
    compactMessages: ChatMessage[] | undefined,
    signal: AbortSignal | undefined,
    task: 'sync.fast' | 'sync.deep',
    maxTokens = 4000,
  ) => {
    const request = async (attempt: ChatMessage[]) => {
      let usage: ChatUsage | undefined
      const result = await runAiTask({
        task,
        apis: {
          writing: api,
          general: generalApiReady ? generalApi : api,
          chat: api,
        },
        messages: attempt,
        maxTokens,
        signal,
        onUsage: (value) => {
          usage = value
        },
      })
      return { result, usage }
    }
    let { result, usage } = await request(messages).catch(async (error: unknown) => {
      // 同步 JSON 较长时，部分推理模型会先把输出预算耗在推理上，正文为空。
      // 此时改用紧凑 schema 再试一次，避免整个同步直接失败。
      if (
        compactMessages &&
        error instanceof Error &&
        /没有返回正文内容|finish_reason/i.test(error.message)
      ) {
        return request(compactMessages)
      }
      throw error
    })
    let parsed = parseStoryStateUpdate(result)
    if (!parsed && compactMessages) {
      // 完整同步 JSON 太长时，用紧凑 schema 再试一次，避免整章同步失败。
      const fallback = await request(compactMessages)
      result = fallback.result
      usage = fallback.usage
      parsed = parseStoryStateUpdate(result)
    }
    if (!parsed) {
      const retryMessages: ChatMessage[] = [
        ...(compactMessages ?? messages),
        {
          role: 'user',
          content:
            '上一次输出无法解析。请重新只输出一个完整、合法的 JSON 对象；不要 markdown、不要解释；必须包含 summary 和 events 数组；字段尽量短，确保括号完整闭合。',
        },
      ]
      const retried = await request(retryMessages)
      result = retried.result
      usage = retried.usage
      parsed = parseStoryStateUpdate(result)
    }
    return { parsed, result, usage }
  }

  const setSyncQueueState = (next: SyncJob[]) => {
    syncJobsRef.current = next
    setSyncJobs(next)
    const progress = syncJobProgress(next)
    setSyncingState(progress.running)
    setSyncingAll(
      next.some(
        (job) =>
          job.source === 'backfill' &&
          (job.status === 'queued' || job.status === 'running'),
      ),
    )
    setSyncAllProgress(progress.done + progress.failed)
    try {
      const saved = next
        .filter((job) => job.status === 'queued' || job.status === 'running')
        .slice(-80)
        .map(({ id: _id, content: _content, contentHash: _hash, ...job }) => job)
      const payload =
        saved.length > 0 ? JSON.stringify(saved) : ''
      if (window.shuoxiWindow?.saveSyncQueue) {
        window.shuoxiWindow.saveSyncQueue(payload)
      } else if (payload) {
        localStorage.setItem(SYNC_QUEUE_STORAGE_KEY, payload)
      } else {
        localStorage.removeItem(SYNC_QUEUE_STORAGE_KEY)
      }
    } catch {
      // 存储失败不影响同步本身
    }
  }

  const setArchiveQueue = (next: ArchiveJob[]) => {
    archiveJobsRef.current = next
    setArchiveJobs(next)
  }

  const enqueueArchiveCandidates = (parsed: ParsedStateUpdate, chapterId: string) => {
    if (!syncSettings.autoArchiveComplete || !apiReady) return
    const jobs = createArchiveCandidates(parsed.newEntities, chapterId, {
      limit: syncSettings.archiveCompleteLimit,
      onlyImportant: syncSettings.archiveOnlyImportant,
    })
    if (jobs.length === 0) return
    setArchiveQueue(mergeArchiveJobs(archiveJobsRef.current, jobs))
    void pumpArchiveQueue()
  }

  const queueFactionArchive = (factionId: string) => {
    const current = syncDetailRef.current
    const faction = current.factions.find((item) => item.id === factionId)
    const characters = current.characters.filter((item) => item.sectId === factionId)
    if (!faction) return
    if (characters.length === 0) {
      onToast(`「${faction.name}」下还没有角色`)
      return
    }
    if (!apiReady && !generalApiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return
    }
    const jobs = characters.map((character) =>
      createArchiveJob('character', character.name, currentChapter?.id ?? '', true),
    )
    setArchiveQueue(mergeArchiveJobs(archiveJobsRef.current, jobs))
    void pumpArchiveQueue()
    onToast(`已加入后台补全队列：${faction.name} · ${characters.length} 个角色`)
  }

  const pumpArchiveQueue = async () => {
    if (archiveRunningRef.current || syncRunningRef.current || (!apiReady && !generalApiReady)) return
    if (
      syncSettings.aiBackgroundPaused &&
      !archiveJobsRef.current.some((job) => job.status === 'queued' && job.force)
    ) {
      return
    }
    archiveRunningRef.current = true
    const completionApi = generalApiReady ? generalApi : api
    try {
      while (true) {
        const job = nextArchiveJob(archiveJobsRef.current)
        if (!job) break
        if (syncSettings.aiBackgroundPaused && !job.force) break
        setArchiveQueue(
          updateArchiveJob(archiveJobsRef.current, job.id, {
            status: 'running',
            attempts: job.attempts + 1,
          }),
        )
        const current = syncDetailRef.current
        try {
          if (job.kind === 'character') {
            const character = current.characters.find((item) => item.name === job.name)
            if (!character || (!job.force && !needsArchiveCompletion('character', character))) {
              setArchiveQueue(updateArchiveJob(archiveJobsRef.current, job.id, { status: 'done' }))
              continue
            }
            const patch = job.force
              ? await completeCharacterFullArchive({
                  work,
                  detail: current,
                  character,
                  api: completionApi,
                  background: true,
                  onRecordUsage,
                })
              : await completeEntityArchive({
                  kind: 'character',
                  work,
                  detail: current,
                  entity: character,
                  api: completionApi,
                  background: true,
                  onRecordUsage,
                })
            const latestCharacter =
              syncDetailRef.current.characters.find((item) => item.id === character.id) ?? character
            const safePatch = applyArchivePatch('character', latestCharacter, patch) as Partial<CharacterCard>
            const next = {
              ...current,
              characters: current.characters.map((item) =>
                item.id === character.id
                  ? {
                      ...item,
                      ...safePatch,
                      archiveStatus: job.force ? ('complete' as const) : ('partial' as const),
                    }
                  : item,
              ),
            }
            syncDetailRef.current = next
            onUpdateDetail({ characters: next.characters })
          } else {
            const faction = current.factions.find((item) => item.name === job.name)
            if (!faction || !needsArchiveCompletion('faction', faction)) {
              setArchiveQueue(updateArchiveJob(archiveJobsRef.current, job.id, { status: 'done' }))
              continue
            }
            const patch = await completeEntityArchive({
              kind: 'faction',
              work,
              detail: current,
              entity: faction,
              api: completionApi,
              background: true,
              onRecordUsage,
            })
            const latestFaction =
              syncDetailRef.current.factions.find((item) => item.id === faction.id) ?? faction
            const safePatch = applyArchivePatch('faction', latestFaction, patch) as Partial<FactionCard>
            const next = {
              ...current,
              factions: current.factions.map((item) =>
                item.id === faction.id
                  ? { ...item, ...safePatch, archiveStatus: 'partial' as const }
                  : item,
              ),
            }
            syncDetailRef.current = next
            onUpdateDetail({ factions: next.factions })
          }
          setArchiveQueue(updateArchiveJob(archiveJobsRef.current, job.id, { status: 'done' }))
        } catch (caught) {
          setArchiveQueue(
            updateArchiveJob(archiveJobsRef.current, job.id, {
              status: 'failed',
              error: caught instanceof Error ? caught.message : '档案补全失败',
            }),
          )
        }
      }
    } finally {
      archiveRunningRef.current = false
    }
  }

  const runSyncJob = async (job: SyncJob) => {
    if (!apiReady) throw new Error('请先配置 AI 模型和 API Key')
    const chapter = syncChaptersRef.current.find((item) => item.id === job.chapterId)
    if (!chapter) throw new Error('章节已被删除')
    if (chapter.content !== job.content) {
      throw new Error('章节内容已变化，跳过过期的同步任务')
    }
    const messages =
      job.mode === 'fast'
        ? buildFastScopedStateUpdateMessages({
            work,
            detail: syncDetailRef.current,
            chapter,
            chapters: syncChaptersRef.current,
            content: job.content,
            reasoningEffort,
          })
        : buildScopedStateUpdateMessages({
            work,
            detail: syncDetailRef.current,
            chapter,
            chapters: syncChaptersRef.current,
            content: job.content,
            reasoningEffort,
          })
    const compactMessages =
      job.mode === 'fast'
        ? undefined
        : buildScopedCompactStateUpdateMessages({
            work,
            detail: syncDetailRef.current,
            chapter,
            chapters: syncChaptersRef.current,
            content: job.content,
            reasoningEffort,
          })
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 120_000)
    let response: Awaited<ReturnType<typeof requestStateUpdate>>
    try {
      response = await requestStateUpdate(
        messages,
        compactMessages,
        controller.signal,
        job.mode === 'fast' ? 'sync.fast' : 'sync.deep',
        job.mode === 'fast' ? 5000 : 4000,
      )
    } finally {
      window.clearTimeout(timeout)
    }
    const { parsed, result, usage } = response
    if (!parsed) {
      throw new Error('模型没有返回完整、可解析的设定 JSON')
    }
    recordUsage(
      '设定同步',
      messages.map((message) => message.content).join('\n'),
      result,
      chapter.title,
      usage,
    )
    const existingEvent =
      job.mode === 'full'
        ? (syncDetailRef.current.storyStateEvents ?? []).find(
            (event) => event.chapterId === chapter.id,
          )
        : undefined
    const applied = existingEvent
      ? mergeDeepStateUpdate(syncDetailRef.current, parsed, chapter.id)
      : applyStoryStateUpdate(
          syncDetailRef.current,
          parsed,
          chapter.id,
          chapter.title,
        )
    const lifecycleDetail = applyLifecycleFromChapter(applied.detail, job.content)
    syncDetailRef.current = lifecycleDetail
    onUpdateDetail({
      characters: lifecycleDetail.characters,
      factions: lifecycleDetail.factions,
      items: lifecycleDetail.items,
      species: lifecycleDetail.species,
      locations: lifecycleDetail.locations,
      foreshadowings: applied.detail.foreshadowings,
      relationships: applied.detail.relationships,
      system: applied.detail.system,
      moduleData: applied.detail.moduleData,
      currentSummary: applied.detail.currentSummary,
      storyStateEvents: applied.detail.storyStateEvents,
      storyStateSnapshots: applied.detail.storyStateSnapshots,
      characterStateTimeline: applied.detail.characterStateTimeline,
      factionStateTimeline: applied.detail.factionStateTimeline,
      memory: buildStoryMemory(lifecycleDetail, syncChaptersRef.current),
    })
    if (parsed.summary.trim()) {
      onUpdateChapter(chapter.id, {
        summary: parsed.summary.trim().slice(0, 500),
        summarySource: 'ai',
      })
    }
    enqueueArchiveCandidates(parsed, chapter.id)
    return {
      changes: applied.event.changes.length,
      experiences: applied.experiences.length,
      issues: parsed.characterIssues.length + parsed.factionIssues.length,
      needsDeep:
        job.mode === 'fast' &&
        ((parsed.events.length >= 2 && parsed.changes.length >= 5) ||
          parsed.newEntities.length >= 4),
    }
  }

  const pumpSyncQueue = async () => {
    if (syncRunningRef.current || syncPausedRef.current) return
    syncRunningRef.current = true
    setSyncingState(true)
    try {
      while (!syncPausedRef.current) {
        const job = nextSyncJob(syncJobsRef.current)
        if (!job) break
        setSyncQueueState(
          updateSyncJob(syncJobsRef.current, job.id, {
            status: 'running',
            attempts: job.attempts + 1,
          }),
        )
        try {
          const result = await runSyncJob(job)
          setSyncQueueState(
            updateSyncJob(syncJobsRef.current, job.id, {
              status: 'done',
              error: undefined,
            }),
          )
          if (
            result.needsDeep &&
            syncSettings.coverageDeepSync &&
            !syncJobsRef.current.some(
              (item) =>
                item.chapterId === job.chapterId &&
                item.mode === 'full' &&
                item.status !== 'cancelled',
            )
          ) {
            setSyncQueueState(
              mergeSyncJobs(syncJobsRef.current, [
                createSyncJob({
                  chapterId: job.chapterId,
                  chapterTitle: job.chapterTitle,
                  content: job.content,
                  mode: 'full',
                  source: 'auto',
                }),
              ]),
            )
          }
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught)
          const retryable =
            job.mode === 'fast' &&
            job.attempts < 1 &&
            /超时|timeout|abort|网络|fetch|502|503|504|429|没有返回正文内容|finish_reason|rate limit/i.test(
              message,
            )
          if (retryable) {
            setSyncQueueState(
              updateSyncJob(syncJobsRef.current, job.id, {
                status: 'queued',
                error: `自动重试：${message}`,
              }),
            )
            await new Promise((resolve) => window.setTimeout(resolve, 1200))
            continue
          }
          setSyncQueueState(
            updateSyncJob(syncJobsRef.current, job.id, {
              status: 'failed',
              error: message,
            }),
          )
        }
      }
    } finally {
      syncRunningRef.current = false
      void pumpArchiveQueue()
      const progress = syncJobProgress(syncJobsRef.current)
      setSyncingState(false)
      setSyncingAll(false)
      setSyncAllProgress(progress.done + progress.failed)
      if (progress.done + progress.failed > 0) {
        showSyncSuccess(
          '设定同步完成',
          progress.failed > 0
            ? `已同步 ${progress.done} 章，失败 ${progress.failed} 章；可在同步队列中重试`
            : `已同步 ${progress.done} 章；相关角色 / 势力 / 物品 / 事件已更新`,
        )
      }
    }
  }

  const enqueueSyncJobs = (incoming: SyncJob[]) => {
    if (incoming.length === 0) return
    setSyncQueueState(mergeSyncJobs(syncJobsRef.current, incoming))
    void pumpSyncQueue()
  }

  const syncStoryState = (chapter: Chapter, content: string, force = false) => {
    if (!apiReady || !content.trim()) return
    if (!force && (detail.storyStateEvents ?? []).some((event) => event.chapterId === chapter.id)) {
      return
    }
    if (force) {
      setSyncQueueState(
        syncJobsRef.current.filter(
          (job) => !(job.chapterId === chapter.id && job.status === 'done'),
        ),
      )
    }
    enqueueSyncJobs([
      createSyncJob({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        content,
        mode: force ? 'full' : 'fast',
        source: 'auto',
      }),
    ])
  }

  const syncChapterFromReader = (chapterId: string, mode: 'fast' | 'full') => {
    const chapter = syncChaptersRef.current.find((item) => item.id === chapterId)
    if (!chapter || !chapter.content.trim()) {
      onToast('本章还没有正文，暂时不能同步')
      return
    }
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      onOpenSettings()
      return
    }
    setSyncQueueState(
      syncJobsRef.current.filter(
        (job) => !(job.chapterId === chapterId && job.status === 'done'),
      ),
    )
    enqueueSyncJobs([
      createSyncJob({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        content: chapter.content,
        mode,
        source: 'manual',
      }),
    ])
    onToast(`已加入${mode === 'full' ? '深度' : '快速'}同步队列`)
  }

  const syncMultipleChapters = (chapterIds: string[]) => {
    const selected = new Set(chapterIds)
    const jobs = syncChaptersRef.current
      .filter((chapter) => selected.has(chapter.id) && chapter.content.trim())
      .map((chapter) =>
        createSyncJob({
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          content: chapter.content,
          mode: 'full',
          source: 'manual',
        }),
      )
    if (jobs.length === 0) {
      onToast('没有可同步的章节')
      setSyncMultiOpen(false)
      return
    }
    setSyncQueueState(
      syncJobsRef.current.filter(
        (job) => !(selected.has(job.chapterId) && job.status === 'done'),
      ),
    )
    enqueueSyncJobs(jobs)
    setSyncMultiOpen(false)
    onToast(`已加入深度同步队列：${jobs.length} 章`)
  }

  const syncChapterBatch = (targets: Chapter[], source: 'auto' | 'backfill' = 'backfill') => {
    const jobs = targets
      .filter((chapter) => chapter.content.trim())
      .map((chapter) =>
        createSyncJob({
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          content: chapter.content,
          mode: 'fast',
          source,
        }),
      )
    enqueueSyncJobs(jobs)
  }

  function maybeAutoSyncCompletedChapter(chapter: Chapter, content: string): void {
    if (!apiReady || !content.trim()) return
    const synced = new Set(
      (detail.storyStateEvents ?? []).map((event) => event.chapterId),
    )
    if (synced.has(chapter.id)) return
    const pending = chapters.filter(
      (item, index) =>
        index <= currentIndex &&
        item.id !== chapter.id &&
        item.content.trim() &&
        item.status === 'done' &&
        !synced.has(item.id),
    )
    pending.push(chapter)
    const indexById = new Map(chapters.map((item, index) => [item.id, index]))
    const lastSyncedIndex = Math.max(
      -1,
      ...(detail.storyStateEvents ?? []).map(
        (event) => indexById.get(event.chapterId) ?? -1,
      ),
    )
    const important =
      syncSettings.importantChapterAutoSync && isImportantChapter(chapter, content)
    if (
      !shouldAutoSyncChapter({
        chapterIndex: currentIndex,
        lastSyncedIndex,
        interval: syncSettings.chapterInterval,
        important,
      })
    ) {
      return
    }
    const targets =
      syncSettings.strategy === 'backfill' && !important
        ? pending.slice(-100)
        : [chapter]
    onToast(
      targets.length > 1
        ? `AI 同步已加入队列：补同步 ${targets.length} 章`
        : 'AI 同步已加入队列',
    )
    syncChapterBatch(targets, targets.length > 1 ? 'backfill' : 'auto')
  }

  const syncMissingChapters = () => {
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      onOpenSettings()
      return
    }
    if (isGenerating) {
      onToast('正在生成正文，稍后再同步')
      return
    }
    const missing = chapters.filter(
      (chapter) =>
        chapter.content.trim() &&
        !(detail.storyStateEvents ?? []).some((event) => event.chapterId === chapter.id),
    )
    if (missing.length === 0) {
      onToast('所有有正文的章节都已经同步')
      return
    }
    setPendingBackfill(missing)
  }

  const pauseSyncQueue = () => {
    syncPausedRef.current = true
    setSyncQueuePaused(true)
  }

  const resumeSyncQueue = () => {
    syncPausedRef.current = false
    setSyncQueuePaused(false)
    void pumpSyncQueue()
  }

  const cancelSyncJob = (id: string) => {
    const job = syncJobsRef.current.find((item) => item.id === id)
    if (!job || job.status === 'running') return
    setSyncQueueState(updateSyncJob(syncJobsRef.current, id, { status: 'cancelled' }))
  }

  const retrySyncJob = (id: string) => {
    setSyncQueueState(
      updateSyncJob(syncJobsRef.current, id, {
        status: 'queued',
        error: undefined,
        priority: 0,
      }),
    )
    void pumpSyncQueue()
  }

  const clearFinishedSyncJobs = () => {
    setSyncQueueState(
      syncJobsRef.current.filter(
        (job) => job.status !== 'done' && job.status !== 'cancelled',
      ),
    )
  }

  useEffect(() => {
    if (syncQueueRestoredRef.current) return
    syncQueueRestoredRef.current = true
    let cancelled = false
    void (async () => {
      let raw = ''
      try {
        if (window.shuoxiWindow?.loadSyncQueue) {
          raw = (await window.shuoxiWindow.loadSyncQueue()) || ''
        } else {
          raw = localStorage.getItem(SYNC_QUEUE_STORAGE_KEY) ?? ''
        }
      } catch {
        return
      }
      if (!raw || cancelled) return
      try {
        const saved = JSON.parse(raw) as Array<{
          chapterId?: string
          chapterTitle?: string
          mode?: 'fast' | 'full'
          source?: 'auto' | 'manual' | 'backfill'
          priority?: number
        }>
        const jobs = saved
          .map((item) => {
            const chapter = syncChaptersRef.current.find((entry) => entry.id === item.chapterId)
            if (!chapter?.content.trim()) return null
            return createSyncJob({
              chapterId: chapter.id,
              chapterTitle: chapter.title || item.chapterTitle || '未命名章节',
              content: chapter.content,
              mode: item.mode === 'full' ? 'full' : 'fast',
              source:
                item.source === 'manual'
                  ? 'manual'
                  : item.source === 'backfill'
                    ? 'backfill'
                    : 'auto',
            })
          })
          .filter((job): job is SyncJob => Boolean(job))
        if (cancelled || jobs.length === 0) return
        setSyncQueueState(mergeSyncJobs([], jobs))
        if (apiReady) void pumpSyncQueue()
      } catch {
        // 损坏的队列数据不应阻塞写作
      }
    })()
    return () => {
      cancelled = true
    }
    // 只在当前工作区首次挂载时恢复
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runGeneration = async (
    instruction: string,
    beforeOverride?: string,
    options?: { maxTokens?: number },
  ) => {
    if (!currentChapter || isGenerating) return
    if (workDone) {
      onToast('本书已完结，先重新开启连载')
      return
    }
    if (chapterDone) {
      onToast('本章已完成，先重新打开本章')
      return
    }
    if (editing) {
      onToast('正在手动编辑正文，先保存或取消再让 AI 续写')
      return
    }
    if (syncingState || syncingAll) {
      onToast('正在同步设定，稍等片刻')
      return
    }
    if (!apiReady) {
      onToast('请先在设置中配置模型和 API Key')
      onOpenSettings()
      return
    }

    const before = beforeOverride ?? currentContent
    setError('')
    setIsGenerating(true)
    setStreamBase(before)
    setStreamingText('')
    lastRunRef.current = { instruction, before, chapterId: currentChapter.id }

    const controller = new AbortController()
    abortRef.current = controller
    let generated = ''

    try {
      let retrievedMemories: Awaited<ReturnType<typeof querySemanticStoryIndex>> | undefined
      if (isStorySqliteReady()) {
        const chapterNumber = Math.max(
          1,
          chapters.findIndex((chapter) => chapter.id === currentChapter.id) + 1,
        )
        const query = `${instruction}\n${before.slice(-2500)}`
        try {
          if (hasEmbeddingModel(api)) {
            retrievedMemories = await querySemanticStoryIndex({
              workId: work.id,
              query,
              currentChapterNumber: chapterNumber,
              api,
              limit: 8,
            })
          }
          if (!retrievedMemories || retrievedMemories.length === 0) {
            retrievedMemories = queryLexicalStoryIndex({
              workId: work.id,
              query,
              currentChapterNumber: chapterNumber,
              limit: 8,
            })
          }
        } catch {
          retrievedMemories = queryLexicalStoryIndex({
            workId: work.id,
            query,
            currentChapterNumber: chapterNumber,
            limit: 8,
          })
        }
      }
      const messages = buildGenerationMessages({
        work,
        detail,
        chapters,
        chapter: currentChapter,
        baseContent: before,
        directive: instruction,
        prompts: activePrompts,
        reasoningEffort,
        retrievedMemories,
        api,
      })

      let actualUsage: ChatUsage | undefined
      let generationRetried = false
      let generationStillShort = false
      let attemptMessages = messages
      for (let attempt = 0; attempt < 2; attempt += 1) {
        generated = ''
        setStreamingText('')
        let finishReason: string | undefined
        await runAiTask({
          task: 'writing.continue',
          apis: { writing: api, general: generalApi, chat: api },
          messages: attemptMessages,
          signal: controller.signal,
          temperature: attempt === 0 ? 0.9 : 0.75,
          maxTokens: options?.maxTokens ?? 2600,
          onDelta: (delta) => {
            generated += delta
            setStreamingText(generated)
          },
          onUsage: (usage) => {
            actualUsage = usage
          },
          onFinishReason: (reason) => {
            finishReason = reason
          },
        })
        const quality = checkGenerationQuality({
          text: generated,
          finishReason,
          targetWords: currentTarget,
        })
        if (!quality.shouldRetry) break
        if (attempt === 0 && !controller.signal.aborted) {
          generationRetried = true
          onToast(`模型返回${quality.reasonText}，正在按目标补写重试一次…`)
          attemptMessages = [
            ...messages,
            {
              role: 'user',
              content: buildGenerationRetryInstruction({
                quality,
                targetWords: currentTarget,
                directive: instruction,
              }),
            },
          ]
        } else {
          generationStillShort = true
        }
      }

      if (!generated.trim()) throw new Error('模型没有返回正文')
      recordUsage(
        '续写',
        messages.map((message) => message.content).join('\n'),
        generated,
        undefined,
        actualUsage,
      )
      const repaired = repairRepeatedParagraphs(generated, before)
      const finalGenerated = repaired.text || generated
      const nextContent = joinContent(before, finalGenerated)
      onUpdateChapter(currentChapter.id, { content: nextContent })
      const auditIssues = auditGeneratedText({
        text: finalGenerated,
        baseContent: before,
        detail,
        chapters,
        chapterId: currentChapter.id,
        memory: detail.memory ?? buildStoryMemory(detail, chapters),
      })
      const auditMemory = detail.memory ?? buildStoryMemory(detail, chapters)
      onUpdateDetail({
        memory: {
          ...auditMemory,
          lastAudit: {
            chapterId: currentChapter.id,
            chapterNumber: currentChapter
              ? Math.max(0, chapters.findIndex((chapter) => chapter.id === currentChapter.id)) + 1
              : 1,
            generatedAt: new Date().toISOString(),
            issues: auditIssues,
          },
        },
      })
      if (auditIssues.length > 0) {
        const high = auditIssues.filter((issue) => issue.severity === 'high').length
        onToast(
          `这一场写完了${repaired.removed > 0 ? `，已自动去掉 ${repaired.removed} 段重复` : ''}${generationStillShort ? '（重试后仍偏短，请检查）' : generationRetried ? '（已自动补写重试）' : ''}；连续性检查发现 ${auditIssues.length} 条提示${high > 0 ? `（${high} 条高优先级）` : ''}，已记录到「故事记忆 → 健康」`,
        )
      } else {
        onToast(
          `这一场写完了${repaired.removed > 0 ? `，已自动去掉 ${repaired.removed} 段重复` : ''}${generationStillShort ? '（重试后仍偏短，请检查）' : generationRetried ? '（已自动补写重试）' : ''}，连续性检查未发现明显问题`,
        )
      }
      if (syncSettings.afterGeneration) {
        void syncStoryState(currentChapter, nextContent)
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        if (generated.trim()) {
          onUpdateChapter(currentChapter.id, { content: joinContent(before, generated) })
        }
        onToast('已停止生成')
      } else {
        const message = errorMessage(caught)
        setError(message)
        if (generated.trim()) {
          onUpdateChapter(currentChapter.id, { content: joinContent(before, generated) })
          onToast(`生成中断：${message}（已保留部分内容）`)
        } else {
          onToast(`生成失败：${message}`)
        }
      }
    } finally {
      setIsGenerating(false)
      setStreamingText('')
      setStreamBase('')
      abortRef.current = null
    }
  }

  function startUnpromptedWriting(words: number): void {
    const safeWords = Math.max(100, Math.min(5000, Math.round(words)))
    setComposerTool(null)
    setDirective('')
    const instruction = [
      '请在不等待作者额外提示的情况下，接着当前章节自然续写。',
      '根据已有正文、当前场景、人物动机和设定，自己判断下一步剧情发展并主动推进；保持叙事视角、人物语气和已有事实。',
      '不要总结，不要解释，不要写标题或「以下是正文」。',
      `本次生成约 ${safeWords} 字。`,
    ].join('\n')
    void runGeneration(withComposerControls(instruction), undefined, {
      maxTokens: Math.min(6000, Math.max(1600, Math.ceil(safeWords * 1.4))),
    })
  }

  const send = () => {
    if (!directive.trim() || isGenerating) return
    const instruction = directive.trim()
    setDirective('')
    setComposerTool(null)
    void runGeneration(withComposerControls(instruction))
  }

  const stop = () => {
    abortRef.current?.abort()
  }

  const reroll = () => {
    const last = lastRunRef.current
    if (!last) {
      onToast('还没有可重拍的生成记录')
      return
    }
    if (!currentChapter || currentChapter.id !== last.chapterId) {
      onToast('请回到上次生成的那个章节再重拍')
      return
    }
    if (isGenerating) return
    onUpdateChapter(currentChapter.id, { content: last.before })
    void runGeneration(last.instruction, last.before)
  }

  const analyze = async () => {
    if (analyzing) return
    if (isGenerating) {
      onToast('正在写作，等这一场写完再分析')
      return
    }
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      onOpenSettings()
      return
    }

    setAnalyzing(true)
    try {
      const messages = buildAnalysisMessages({
        work,
        detail,
        chapters,
        reasoningEffort,
      })
      let actualUsage: ChatUsage | undefined
      const result = await runAiTask({
        task: 'analysis.story',
        apis: { writing: api, general: generalApi, chat: api },
        messages,
        maxTokens: 1800,
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      if (!result.trim()) throw new Error('模型没有返回分析内容')
      recordUsage(
        '剧情分析',
        messages.map((message) => message.content).join('\n'),
        result,
        undefined,
        actualUsage,
      )
      onUpdateDetail({ analysis: result.trim() })
      onToast('剧情分析已更新')
    } catch (caught) {
      onToast(`分析失败：${errorMessage(caught)}`)
    } finally {
      setAnalyzing(false)
    }
  }

  const openPromptLibrary = () => {
    if (isGenerating) {
      onToast('正在生成，先停止再离开')
      return
    }
    onOpenPromptLibrary()
  }

  const auditContinuity = async () => {
    if (auditingContinuity || isGenerating || syncingState || syncingAll) {
      onToast('正在写作或同步，稍后再检查连续性')
      return
    }
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      onOpenSettings()
      return
    }
    if (!currentChapter || !currentContent.trim()) {
      onToast('当前章节还没有正文')
      return
    }
    setAuditingContinuity(true)
    try {
      const memory = detail.memory ?? buildStoryMemory(detail, chapters)
      const localIssues = auditGeneratedText({
        text: currentContent,
        baseContent: '',
        detail,
        chapters,
        chapterId: currentChapter.id,
        memory,
      })
      const messages = buildContinuityAuditMessages({
        work,
        detail,
        chapters,
        chapter: currentChapter,
        content: currentContent,
        memory,
        localIssues,
      })
      let actualUsage: ChatUsage | undefined
      const result = await runApiTask(api, { task: 'analysis.story', messages,
        temperature: 0.2,
        maxTokens: 1800,
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      if (!result.trim()) throw new Error('模型没有返回审查结果')
      recordUsage(
        '连续性审查',
        messages.map((message) => message.content).join('\n'),
        result,
        undefined,
        actualUsage,
      )
      onUpdateDetail({ continuityReport: result.trim() })
      onToast('连续性审查完成')
    } catch (caught) {
      onToast(`连续性审查失败：${errorMessage(caught)}`)
    } finally {
      setAuditingContinuity(false)
    }
  }

  const repairContinuity = async () => {
    if (repairingContinuity || auditingContinuity || isGenerating) return
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      onOpenSettings()
      return
    }
    if (!currentChapter || !currentContent.trim()) {
      onToast('当前章节还没有正文')
      return
    }
    if (!detail.continuityReport?.trim()) {
      onToast('请先做一次 AI 连续性审查')
      return
    }
    setRepairingContinuity(true)
    try {
      const memory = detail.memory ?? buildStoryMemory(detail, chapters)
      const messages = buildParagraphRepairMessages({
        work,
        detail,
        chapters,
        chapter: currentChapter,
        content: currentContent,
        memory,
        report: detail.continuityReport,
      })
      let actualUsage: ChatUsage | undefined
      const result = await runApiTask(api, { task: 'analysis.story', messages,
        temperature: 0.2,
        maxTokens: 3000,
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      if (!result.trim()) throw new Error('模型没有返回段落修复结果')
      const edits = parseParagraphRepairEdits(result)
      if (edits.length === 0) {
        onToast('审查报告没有需要修改的段落，或模型未返回可用编辑')
        return
      }
      const repaired = applyParagraphRepairEdits(currentContent, edits)
      if (repaired.applied === 0) {
        onToast('修复段落没有在正文中唯一命中，未应用')
        return
      }
      recordUsage(
        '连续性审查',
        messages.map((message) => message.content).join('\n'),
        result,
        undefined,
        actualUsage,
      )
      setRepairPreview({ before: currentContent, after: repaired.text })
      onToast(
        `已生成 ${repaired.applied} 处段落修复${repaired.rejected > 0 ? `，${repaired.rejected} 处未唯一命中已跳过` : ''}，请预览后确认`,
      )
    } catch (caught) {
      onToast(`连续性修复失败：${errorMessage(caught)}`)
    } finally {
      setRepairingContinuity(false)
    }
  }

  const applyRepairPreview = () => {
    if (!repairPreview || !currentChapter) return
    onSnapshot('AI 连续性修复前')
    onUpdateChapter(currentChapter.id, { content: repairPreview.after })
    setRepairPreview(null)
    onToast('连续性修复稿已应用；如需回退，使用撤销或快照')
  }

  const openExportNovel = (chapterId?: string) => {
    setExportPresetChapterId(chapterId ?? null)
    setExportOpen(true)
  }

  const startProsePolish = async () => {
    if (!currentChapter || !currentContent.trim()) {
      onToast('本章还没有可精修的正文')
      return
    }
    if (!apiReady) {
      onToast('请先配置写作 AI')
      return
    }
    if (editing || isGenerating || prosePolishing) return
    prosePolishAbortRef.current?.abort()
    const controller = new AbortController()
    prosePolishAbortRef.current = controller
    setProsePolishBefore(currentContent)
    setProsePolishAfter('')
    setProsePolishOpen(true)
    setProsePolishing(true)
    try {
      const revised = await polishChapterProse({
        work,
        detail,
        chapter: currentChapter,
        chapters,
        content: currentContent,
        api,
        signal: controller.signal,
        onDelta: (text) => {
          if (!controller.signal.aborted) setProsePolishAfter(text)
        },
        onRecordUsage: handleRecordUsage,
      })
      if (!controller.signal.aborted) setProsePolishAfter(revised)
    } catch (caught) {
      if (!controller.signal.aborted) {
        onToast(`文笔精修失败：${errorMessage(caught)}`)
        setProsePolishOpen(false)
      }
    } finally {
      if (!controller.signal.aborted) setProsePolishing(false)
      if (prosePolishAbortRef.current === controller) prosePolishAbortRef.current = null
    }
  }

  const applyProsePolish = () => {
    if (!currentChapter || !prosePolishAfter.trim()) return
    onSnapshot('文笔精修前')
    onUpdateChapter(currentChapter.id, {
      content: prosePolishAfter,
      wordCount: countWords(prosePolishAfter),
      summary: prosePolishAfter.replace(/\s+/g, ' ').slice(0, 160),
      updatedAt: Date.now(),
    })
    setProsePolishOpen(false)
    setProsePolishAfter('')
    onToast('已应用文笔精修稿，可从版本历史回退')
  }

  const closeProsePolish = () => {
    const wasRunning = prosePolishing
    prosePolishAbortRef.current?.abort()
    prosePolishAbortRef.current = null
    setProsePolishing(false)
    setProsePolishOpen(false)
    setProsePolishAfter('')
    if (wasRunning) onToast('已取消文笔精修')
  }

  useEffect(() => {
    return () => {
      prosePolishAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        Boolean(target?.isContentEditable)
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (editing) {
          saveEditing()
        } else {
          onToast('正文已自动保存到本地')
        }
        return
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        openExportNovel()
        return
      }
      if (modifier && !typing && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        if (!editing && !isGenerating) setFindReplaceOpen(true)
        return
      }
      if (modifier && !typing && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault()
        undoContent()
        return
      }
      if (
        modifier &&
        !typing &&
        (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))
      ) {
        event.preventDefault()
        redoContent()
        return
      }
      if (event.key === '?' && !typing && !modifier) {
        event.preventDefault()
        setShortcutsOpen(true)
        return
      }
      if (event.key === 'Escape') {
        setSelectionCapture(null)
        setContextMenu(null)
        setShortcutsOpen(false)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  })

  return (
    <div className="workspace">
      <header className="ws-topbar">
        <button type="button" className="btn btn-ghost btn-sm ws-back" onClick={onBack}>
          <IconArrowLeft size={16} />
          书库
        </button>
        <div className="ws-title">
          <h2>{work.title}</h2>
          <button
            type="button"
            className={`status-pill ${
              work.status === '草稿' ? 'draft' : work.status === '已完结' ? 'done' : ''
            }`}
            title="管理作品状态 / 完结"
            onClick={openWorkStatusModal}          >
            {work.status}
          </button>
        </div>
        <div className="ws-actions">
          <button
            type="button"
            className="ws-reader-btn"
            title="进入阅读模式"
            aria-label="阅读模式"
            onClick={() => setReaderOpen(true)}
          >
            <IconBookOpen size={15} />
            <span>阅读</span>
          </button>
          <SyncControl
            disabled={!currentChapter?.content.trim() || !apiReady}
            onSync={(mode) => {
              if (currentChapter) syncChapterFromReader(currentChapter.id, mode)
            }}
            onMultiChapter={() => setSyncMultiOpen(true)}
          />
          <button
            type="button"
            className="ws-reader-btn"
            title="书签：收藏当前章，跳回已收藏章节"
            aria-label="书签"
            onClick={() => setBookmarksOpen(true)}
          >
            <IconBookmark size={15} />
            <span>书签</span>
          </button>
          <button
            type="button"
            className="ws-reader-btn"
            title="写作技能：场景诊断、对白打磨、连续性审查、局部润色、章节收尾"
            aria-label="写作技能"
            onClick={() => setSkillsOpen(true)}
          >
            <IconSparkles size={15} />
            <span>技能</span>
          </button>
          <button
            type="button"
            className="ws-reader-btn"
            title="导出整本或选择章节"
            aria-label="导出作品"
            onClick={() => openExportNovel()}
          >
            <IconDownload size={15} />
            <span>导出</span>
          </button>
          <button
            type="button"
            className="ws-reader-btn ws-rescue-btn"
            title="续写救援：分析作品并生成下一章"
            aria-label="续写救援"
            onClick={() => setRescueOpen(true)}
          >
            <IconSparkles size={15} />
            <span>救书</span>
          </button>
          {onOpenBootstrap ? (
            <button
              type="button"
              className="ws-reader-btn"
              title="导入建档：分析正文并补全人物、势力、物种、事件和境界"
              aria-label="导入建档"
              onClick={onOpenBootstrap}
            >
              <IconSparkles size={15} />
              <span>建档</span>
            </button>
          ) : null}
          {syncJobs.length > 0 ? (
            <button
              type="button"
              className={`ws-reader-btn ws-sync-queue-btn ${syncingState ? 'active' : ''}`}
              title={
                archiveJobs.some((job) => job.status === 'queued' || job.status === 'running')
                  ? '打开同步队列（档案补全进行中）'
                  : '打开同步队列'
              }
              aria-label="同步队列"
              onClick={() => setSyncQueueOpen(true)}
            >
              <IconFileText size={15} />
              <span>
                {syncingState
                  ? `同步中 ${syncQueueProgress.done + syncQueueProgress.failed}/${syncQueueProgress.total}`
                  : `同步队列 ${syncQueueProgress.pending}`}
                {syncQueuePaused ? ' · 已暂停' : ''}
              </span>
            </button>
          ) : null}
          <div className="writing-mode-switch" role="group" aria-label="写作模式">
            <button
              type="button"
              className={writingMode === 'director' ? 'active' : ''}
              aria-pressed={writingMode === 'director'}
              onClick={() => setWritingMode('director')}
              title="直接说戏，事件簿负责连续性；大纲可在作品详情里随时补充"
            >
              导演模式
            </button>
            <button
              type="button"
              className={writingMode === 'wheelchair' ? 'active' : ''}
              aria-pressed={writingMode === 'wheelchair'}
              onClick={() => setWritingMode('wheelchair')}
              title="不用输入指令：选择章数和字数，AI 自动补全设定并推进"
            >
              轮椅模式
            </button>
          </div>
          <span className={`ws-saved ${saveState.status}`}>
            <span className="status-dot" />
            {saveState.status === 'saving' ? (
              '保存中…'
            ) : saveState.status === 'error' ? (
              <>
                保存失败
                <button type="button" onClick={onRetrySave}>
                  重试
                </button>
              </>
            ) : (
              '已保存 · 本地'
            )}
          </span>

          {balanceEntry ? (
            <button
              type="button"
              className="ws-balance-pill"
              title={`账户余额，点击刷新\n充值：${balanceMoney(
                balanceEntry.toppedUp,
                balanceEntry.currency,
              )}\n赠送：${balanceMoney(balanceEntry.granted, balanceEntry.currency)}`}
              onClick={onRefreshBalance}
              aria-label="刷新账户余额"
            >
              <span>余额</span>
              <strong>{balanceMoney(balanceEntry.total, balanceEntry.currency)}</strong>
              {balanceLoading ? <i>刷新中</i> : null}
            </button>
          ) : null}

          <details className="usage-pill-wrap">
            <summary
              className="usage-pill"
              title="本次写作费用，点击查看 token 明细"
              aria-label="本次写作用量"
            >
              <span className="usage-pill-label">本次计费</span>
              {sessionUsage.calls === 0 ? (
                <strong>¥0.00</strong>
              ) : sessionUsage.pricedCalls > 0 ? (
                <strong>{formatCost(sessionUsage.cost)}</strong>
              ) : (
                <strong className="usage-pill-muted">未配价</strong>
              )}
            </summary>
            <div className="usage-popover">
              <div className="usage-popover-head">
                <strong>本次写作</strong>
                <span>{sessionUsage.calls} 次调用</span>
              </div>
              <div className="usage-popover-grid">
                <div>
                  <span>输入</span>
                  <strong>{formatTokenCount(sessionUsage.inputTokens)}</strong>
                </div>
                <div>
                  <span>输出</span>
                  <strong>{formatTokenCount(sessionUsage.outputTokens)}</strong>
                </div>
                <div>
                  <span>实际用量</span>
                  <strong>{formatTokenCount(sessionUsage.actualTokens)}</strong>
                </div>
                <div>
                  <span>估算用量</span>
                  <strong>{formatTokenCount(sessionUsage.estimatedTokens)}</strong>
                </div>
                <div>
                  <span>缓存命中</span>
                  <strong>{formatTokenCount(sessionUsage.cachedInputTokens)}</strong>
                </div>
                <div>
                  <span>缓存写入</span>
                  <strong>{formatTokenCount(sessionUsage.cacheWriteTokens)}</strong>
                </div>
              </div>
              <div className="usage-popover-cost">
                <span>本次费用</span>
                <strong>
                  {sessionUsage.calls === 0
                    ? '¥0.00'
                    : sessionUsage.pricedCalls > 0
                      ? formatCost(sessionUsage.cost)
                      : '未配置价格'}
                </strong>
              </div>
              {sessionUsage.inputTokens > 0 ? (
                <div className="usage-popover-rate">
                  <span>缓存命中率</span>
                  <strong>{cacheHitRate}%</strong>
                </div>
              ) : null}
              {sessionUsage.unpricedCalls > 0 && sessionUsage.pricedCalls > 0 ? (
                <small>其中 {sessionUsage.unpricedCalls} 次调用未配置价格，未计入金额。</small>
              ) : null}
              {sessionUsage.estimatedCalls > 0 ? (
                <small>含 {sessionUsage.estimatedCalls} 次估算用量，最终以 API 返回为准。</small>
              ) : null}
              <button
                type="button"
                className="usage-reset"
                onClick={(event) => {
                  resetSessionUsage()
                  const details = event.currentTarget.closest('details')
                  if (details) details.open = false
                }}
              >
                重置本次统计
              </button>
            </div>
          </details>

          <details className="entity-highlight-wrap">
            <summary
              className={`entity-highlight-trigger ${entityHighlightSettings.enabled ? 'active' : ''}`}
              title="实体颜色标识"
              aria-label="实体颜色标识"
            >
              <IconPalette size={18} />
            </summary>
            <div className="entity-highlight-popover">
              <div className="entity-highlight-head">
                <strong>实体颜色标识</strong>
                <label className="entity-highlight-switch">
                  <input
                    type="checkbox"
                    checked={entityHighlightSettings.enabled}
                    onChange={(event) =>
                      setEntityHighlightSettings({
                        ...entityHighlightSettings,
                        enabled: event.target.checked,
                      })
                    }
                  />
                  <span>{entityHighlightSettings.enabled ? '开' : '关'}</span>
                </label>
              </div>
              <p className="entity-highlight-note">
                正文颜色按角色境界、物品品阶、势力层级和物种阶位显示；没有品阶的实体不着色，只保留下划线，点击仍可打开档案。
              </p>
              <div className="entity-highlight-categories">
                {ENTITY_HIGHLIGHT_CATEGORIES.map((category) => (
                  <label key={category} className="entity-highlight-category">
                    <input
                      type="checkbox"
                      checked={entityHighlightSettings.categories[category]}
                      disabled={!entityHighlightSettings.enabled}
                      onChange={(event) =>
                        setEntityHighlightSettings({
                          ...entityHighlightSettings,
                          categories: {
                            ...entityHighlightSettings.categories,
                            [category]: event.target.checked,
                          },
                        })
                      }
                    />
                    <span
                      className="entity-highlight-dot"
                      style={{ background: ENTITY_CATEGORY_COLORS[category] }}
                    />
                    <span>{ENTITY_CATEGORY_LABELS[category]}</span>
                  </label>
                ))}
              </div>
            </div>
          </details>

          <button
            type="button"
            className="icon-btn"
            title="全局搜索（Ctrl / Cmd + K）"
            aria-label="全局搜索"
            onClick={onOpenGlobalSearch}
          >
            <IconSearch size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="设置"
            aria-label="设置"
            onClick={onOpenSettings}
          >
            <IconSettings size={18} />
          </button>
          <button
            type="button"
            className="icon-btn ws-prompt-btn"
            title={`本作提示词（已启用 ${activePrompts.length} 条）`}
            aria-label="本作提示词"
            onClick={openPromptPicker}
          >
            <IconFileText size={18} />
            {activePrompts.length > 0 ? (
              <span className="icon-badge">{activePrompts.length}</span>
            ) : null}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="导出小说"
            title="导出整本或选择章节"
            onClick={() => openExportNovel()}
          >
            <IconBookmark size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="快捷键"
            aria-label="快捷键"
            onClick={() => setShortcutsOpen(true)}
          >
            ?
          </button>
        </div>
      </header>

      {workDone ? (
        <div className="work-finished-banner">
          <span>本书已完结 · {completedChapterCount} 章已完成</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reopenWork}>
            重新开启连载
          </button>
        </div>
      ) : null}

      <div className="ws-body" data-detail={detailMode}>
        <aside
          className={`chapters ${chaptersCollapsed ? 'collapsed' : ''}`}
          aria-label="章节"
          ref={chaptersRef}
        >
          {chaptersCollapsed ? (
            <div className="chapters-rail">
              <button
                type="button"
                className="chapters-rail-toggle"
                aria-label="展开章节栏"
                aria-expanded={false}
                title="展开章节栏"
                onClick={() => setChaptersCollapsed(false)}
              >
                <IconChevronRight size={15} />
              </button>
              <span className="chapters-rail-label">章节</span>
              <span className="chapters-rail-count">{chapters.length}</span>
              <span className="chapters-rail-current">
                第 {currentIndex + 1} 章
              </span>
              <button
                type="button"
                className="chapters-rail-add"
                aria-label="新建章节"
                title="新建章节"
                onClick={handleAddChapter}
                disabled={isGenerating || workDone}
              >
                <IconPlus size={15} />
              </button>
            </div>
          ) : (
            <>
              <div className="chapters-head">
                <span>章节</span>
                <span className="chapters-note">{chapters.length} 章</span>
                <button
                  type="button"
                  className="chapters-collapse"
                  aria-label="收起章节栏"
                  aria-expanded
                  title="收起章节栏"
                  onClick={() => setChaptersCollapsed(true)}
                >
                  <IconChevronLeft size={14} />
                </button>
              </div>
              <div className="chapter-filter-bar">
                <input
                  className="input"
                  value={chapterQuery}
                  onChange={(event) => setChapterQuery(event.target.value)}
                  placeholder="搜索章节 / 摘要"
                  aria-label="搜索章节"
                />
                <select
                  className="input select"
                  value={chapterStageFilter}
                  aria-label="按章节阶段筛选"
                  onChange={(event) =>
                    setChapterStageFilter(event.target.value as 'all' | ChapterStage)
                  }
                >
                  <option value="all">全部阶段</option>
                  {CHAPTER_STAGE_OPTIONS.map((stage) => (
                    <option key={stage} value={stage}>
                      {CHAPTER_STAGE_LABELS[stage]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="chapter-list">
                {chapterGroups.filter((group) => group.chapters.length > 0).map((group) => (
                  <section className="chapter-arc-group" key={group.id || 'all'}>
                    <button
                      type="button"
                      className="chapter-arc-head"
                      aria-expanded={!collapsedChapterArcs.has(group.id)}
                      onClick={() =>
                        setCollapsedChapterArcs((current) => {
                          const next = new Set(current)
                          if (next.has(group.id)) next.delete(group.id)
                          else next.add(group.id)
                          return next
                        })
                      }
                    >
                      <span>{group.title}</span>
                      <small>{group.chapters.length} 章</small>
                    </button>
                    {collapsedChapterArcs.has(group.id)
                      ? null
                      : group.chapters.map((chapter) => {
                      const index = chapters.findIndex((item) => item.id === chapter.id)
                      const outline = chapterOutlineMap.get(chapter.id)
                      const stage = chapterStageOf(chapter)
                      const beats = chapterBeatProgress(chapter)
                      const warnings = chapterPlanWarnings(chapter, outline)
                      return (
                        <div
                          className="chapter-row"
                          key={chapter.id}
                          onContextMenu={(event) =>
                            openContextMenu(event, chapterContextMenu(chapter, index))
                          }
                        >
                          <button
                            type="button"
                            className={`chapter-item ${chapter.id === currentChapter?.id ? 'active' : ''}`}
                            onClick={() => selectChapter(chapter.id)}
                            disabled={isGenerating}
                          >
                            <span className="chapter-num">第 {index + 1} 章</span>
                            <span className="chapter-name">{chapter.title || '未命名章节'}</span>
                            <span className="chapter-summary">
                              {outline?.summary || chapter.summary || '还没有本章摘要'}
                            </span>
                            <span className="chapter-meta">
                              <em className={`chapter-stage-label stage-${stage}`}>
                                {CHAPTER_STAGE_LABELS[stage]}
                              </em>
                              <span>
                                {chapterWords(chapter)} 字
                              </span>
                              {beats > 0 ? <span>目标 {beats}/3</span> : null}
                              {warnings.length > 0 ? (
                                <span className="chapter-warning">⚠ {warnings.length}</span>
                              ) : null}
                            </span>
                          </button>
                          <div className="chapter-moves">
                            <button
                              type="button"
                              aria-label="上移章节"
                              disabled={index <= 0 || isGenerating}
                              onClick={() => onMoveChapter(chapter.id, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label="下移章节"
                              disabled={index === chapters.length - 1 || isGenerating}
                              onClick={() => onMoveChapter(chapter.id, 1)}
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </section>
                ))}
                {filteredChapters.length === 0 ? (
                  <p className="chapter-filter-empty">没有匹配的章节。</p>
                ) : null}
                {hiddenChapterCount > 0 ? (
                  <button
                    type="button"
                    className="chapter-load-more"
                    onClick={() =>
                      setVisibleChapterCount((count) => Math.min(filteredChapters.length, count + 200))
                    }
                  >
                    再显示 200 章 · 还有 {hiddenChapterCount} 章
                  </button>
                ) : null}
                <button
                  type="button"
                  className="chapter-add"
                  onClick={handleAddChapter}
                  disabled={isGenerating || workDone}
                >
                  <IconPlus size={14} />
                  新建一章
                </button>
              </div>
              <p className="chapters-foot">
                共 {chapters.length} 章 · {formatWords(totalWords)}
              </p>
            </>
          )}
        </aside>

        <section className="manuscript" aria-label="稿纸" ref={manuscriptRef}>
          {currentChapter ? (
            <>
              <div className="scene-head">
                <div className="scene-head-inner">
                <div className="scene-head-main">
                <div className="scene-title-row">
                  <span className="scene-eyebrow">第 {currentIndex + 1} 章</span>
                  {titleEditing ? (
                    <div className="scene-title-edit">
                      <input
                        className="input scene-title-input"
                        value={titleDraft}
                        autoFocus
                        placeholder={`第 ${currentIndex + 1} 章`}
                        onChange={(event) => setTitleDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            saveTitle()
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            setTitleEditing(false)
                          }
                        }}
                        aria-label="章节标题"
                      />
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => saveTitle()}>
                        保存
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setTitleEditing(false)}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="scene-title-button"
                      onClick={startTitleEdit}
                      title="点击修改章节标题"
                    >
                      <h3>{currentChapter.title || '未命名章节'}</h3>
                    </button>
                  )}
                  <select
                    className={`chapter-stage-select stage-${chapterStageOf(currentChapter)}`}
                    value={chapterStageOf(currentChapter)}
                    aria-label="章节阶段"
                    disabled={isGenerating || workDone}
                    onChange={(event) => changeChapterStage(event.target.value as ChapterStage)}
                  >
                    {CHAPTER_STAGE_OPTIONS.map((stage) => (
                      <option key={stage} value={stage}>
                        {CHAPTER_STAGE_LABELS[stage]}
                      </option>
                    ))}
                  </select>
                </div>
                {titleSuggestions.length > 0 ? (
                  <div className="title-suggestions">
                    <span>选择标题</span>
                    {titleSuggestions.map((title) => (
                      <button
                        key={title}
                        type="button"
                        className="title-suggestion"
                        onClick={() => applyTitleSuggestion(title)}
                      >
                        {title}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="title-suggestion-close"
                      onClick={() => setTitleSuggestions([])}
                      aria-label="关闭标题建议"
                    >
                      取消
                    </button>
                  </div>
                ) : null}
                </div>
                <div className="scene-head-actions">
                  {editing ? (
                    <>
                      <button type="button" className="btn btn-primary btn-sm" onClick={saveEditing}>
                        保存正文
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditing(false)}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={startEditing}
                        disabled={isGenerating || chapterReadOnly}
                      >
                        编辑正文
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={undoContent}
                        disabled={isGenerating || chapterReadOnly || !currentChapter.history?.length}
                      >
                        撤销
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={redoContent}
                        disabled={isGenerating || chapterReadOnly || redoStack.length === 0}
                      >
                        重做
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setHistoryOpen(true)}
                        disabled={!currentChapter.history?.length}
                      >
                        版本 {currentChapter.history?.length ?? 0}
                      </button>
                    </>
                  )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setQualityOpen(true)}
                        disabled={!displayContent.trim()}
                        title="本地检查抽象情绪、过滤词、对白占比、长句和重复分句"
                      >
                        质感检查
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void startProsePolish()}
                        disabled={
                          editing ||
                          isGenerating ||
                          prosePolishing ||
                          chapterReadOnly ||
                          !displayContent.trim() ||
                          !apiReady
                        }
                        title={
                          apiReady
                            ? '只修文笔，不改剧情：用写作 AI 精修本章并预览'
                            : '请先配置写作 AI'
                        }
                      >
                        {prosePolishing ? '精修中…' : '文笔精修'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setFindReplaceOpen(true)}
                        disabled={editing || isGenerating || !displayContent.trim()}
                        title="当前章节查找替换；Ctrl / Cmd + F"
                      >
                        查找替换
                      </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm scene-ai-title"
                    onClick={() => void suggestTitles()}
                    disabled={isGenerating || suggestingTitle || workDone}
                    title="根据导演指令和本章正文生成 3 个标题候选"
                  >
                    {suggestingTitle ? '起名中…' : 'AI 起名'}
                  </button>
                  <span className="scene-count">{countWords(displayContent)} 字</span>
                  {!editing ? (
                    chapterDone ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={reopenChapter}
                        disabled={workDone}
                      >
                        重新打开本章
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setCompleteOpen(true)}
                        disabled={isGenerating || !currentChapter.content.trim() || workDone}
                      >
                        完成本章
                      </button>
                    )
                  ) : null}
                </div>
                </div>
              </div>

              {currentChapter ? (
                <details className="chapter-insight-bar">
                  <summary>
                    <span className={`chapter-stage-label stage-${currentStage}`}>
                      {CHAPTER_STAGE_LABELS[currentStage]}
                    </span>
                    <span>
                      {chapterWords(currentChapter)} 字
                    </span>
                    {currentTarget > 0 ? (
                      <span className="chapter-plan-progress" title={`目标字数进度 ${currentPlanPercent}%`}>
                        <i style={{ width: `${currentPlanPercent}%` }} />
                      </span>
                    ) : null}
                    <span>本章目标 {currentBeatProgress}/3</span>
                    {currentWarnings.length > 0 ? (
                      <span className="chapter-warning">⚠ {currentWarnings[0]}</span>
                    ) : (
                      <span className="chapter-ok">计划正常</span>
                    )}
                    <span className="chapter-insight-open">展开本章计划</span>
                  </summary>
                  <div className="chapter-insight-body">
                    <div className="chapter-insight-plan">
                      <span>本章计划</span>
                      <p>
                        {currentOutline?.summary ||
                          currentChapter.summary ||
                          '还没有本章大纲。先写一句想推进什么，或者打开大纲用 AI 补全。'}
                      </p>
                      {currentOutline?.goal ? (
                        <small>目标：{currentOutline.goal}</small>
                      ) : null}
                      {currentOutline?.conflict ? (
                        <small>冲突：{currentOutline.conflict}</small>
                      ) : null}
                      <div className="chapter-outline-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={openChapterOutline}>
                          {currentOutline ? '编辑本章大纲' : '写本章大纲'}
                        </button>
                        {!currentOutline ? (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={openChapterOutline}>
                            AI 补全
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="chapter-insight-beats">
                      <span>本章目标</span>
                      <p>推进：{currentChapter.beats?.advance || '未填写'}</p>
                      <p>暴露：{currentChapter.beats?.reveal || '未填写'}</p>
                      <p>钩子：{currentChapter.beats?.hook || '未填写'}</p>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => openComposerTool('beats')}
                      >
                        编辑本章目标
                      </button>
                    </div>
                    <div className="chapter-insight-links">
                      <span>关联</span>
                      <p>
                        视角：
                        {currentOutline?.povCharacterId
                          ? detail.characters.find(
                              (character) => character.id === currentOutline.povCharacterId,
                            )?.name ?? '未找到'
                          : '未指定'}
                      </p>
                      <p>
                        地点：
                        {currentOutline?.locationIds?.[0]
                          ? (detail.locations ?? []).find(
                              (location) => location.id === currentOutline.locationIds?.[0],
                            )?.name ?? '未找到'
                          : '未指定'}
                      </p>
                      <p>
                        伏笔：
                        {currentRelatedForeshadows.length > 0
                          ? currentRelatedForeshadows.map((item) => item.title).join('、')
                          : '未登记'}
                      </p>
                      <p>
                        出场：
                        {currentAppearingCharacters.length > 0
                          ? currentAppearingCharacters.map((item) => item.name).join('、')
                          : '正文还没有已登记角色'}
                      </p>
                    </div>
                  </div>
                </details>
              ) : null}

              <div
                className="manuscript-scroll"
                ref={manuscriptScrollRef}
                onContextMenu={openManuscriptContextMenu}
              >
              {editing ? (
                <div className="manuscript-editor-wrap">
                  <div className="manuscript-inline-editor">
                    <div className="manuscript-highlight-layer" aria-hidden="true">
                      {highlightedEntities.length === 0
                        ? draftContent
                        : splitEntityText(draftContent, highlightedEntities).map((segment, index) =>
                            segment.entity ? (
                              <span
                                key={`edit-highlight-${index}`}
                                className={`entity-edit-word entity-${segment.entity.category} ${segment.entity.tierColor ? 'has-tier' : 'no-tier'}`}
                                style={
                                  segment.entity.tierColor
                                    ? ({
                                        '--entity-color': segment.entity.tierColor,
                                      } as React.CSSProperties)
                                    : undefined
                                }
                              >
                                {segment.text}
                              </span>
                            ) : (
                              <span key={`edit-plain-${index}`}>{segment.text}</span>
                            ),
                          )}
                    </div>
                    <textarea
                      ref={editorRef}
                      className="manuscript-editor manuscript-inline-textarea"
                      value={draftContent}
                      onChange={(event) => setDraftContent(event.target.value)}
                      onDoubleClick={(event) => {
                        const entry = entityAtEditorOffset(event.currentTarget.selectionStart)
                        if (!entry) return
                        openEntityCard(entry, event.clientX, event.clientY)
                      }}
                      aria-label="在当前界面直接编辑本章正文"
                      spellCheck={false}
                    />
                  </div>
                  <p className="manuscript-editor-note">
                    Ctrl / Cmd + S 保存；编辑时已知实体词会实时着色，双击彩色词打开实体信息卡。
                  </p>
                </div>
              ) : paragraphs.length > 0 || isGenerating ? (
                <div
                  className={`prose ${isGenerating ? 'streaming' : ''}`}
                  ref={proseRef}
                  onMouseUp={showSelectionToolbar}
                  onKeyUp={showSelectionToolbar}
                >
                  {paragraphs.length === 0 ? (
                    <p>
                      <span className="typing-cursor" />
                    </p>
                  ) : (
                    paragraphs.map((paragraph, index) => (
                      <p key={index}>
                        {renderBookText(paragraph)}
                        {isGenerating && index === paragraphs.length - 1 ? (
                          <span className="typing-cursor" />
                        ) : null}
                      </p>
                    ))
                  )}
                </div>
              ) : (
                <div className="scene-empty">
                  <span className="scene-empty-icon">
                    <IconFeather size={22} />
                  </span>
                  <p className="scene-empty-title">这一章还没有开演</p>
                  <p className="scene-empty-text">
                    在下方导一段戏，AI 会把它写成正文；也可以点击「编辑正文」手动写。
                  </p>
                </div>
              )}

              {!editing && !isGenerating && paragraphs.length > 0 ? (
                <div className="scene-end">
                  <span className="line" />
                  <span>本章草稿</span>
                  <span className="line" />
                </div>
              ) : null}
              </div>
            </>
          ) : (
            <div className="manuscript-scroll" ref={manuscriptScrollRef}>
              <div className="scene-empty">
                <span className="scene-empty-icon">
                  <IconFeather size={22} />
                </span>
                <p className="scene-empty-title">还没有章节</p>
                <p className="scene-empty-text">点击左侧「新建一章」开始。</p>
              </div>
            </div>
          )}
        </section>

        <WorkDetailDrawer
          mode={detailMode}
          onModeChange={setDetailMode}
          work={work}
          detail={detail}
          chapters={chapters}
          activeChapterId={currentChapter?.id ?? ''}
          prompts={prompts}
          focusTabRequest={detailFocusRequest}
          focusEntityRequest={detailEntityFocus}
          api={api}
          apiReady={apiReady}
          generalApi={generalApi}
          generalApiReady={generalApiReady}
          analyzing={analyzing}
          onRecordUsage={handleRecordUsage}
          onUpdateWork={onUpdateWork}
          onUpdateDetail={onUpdateDetail}
          onUpdateChapter={onUpdateChapter}
          onSelectChapter={selectChapter}
          onAddChapter={handleAddChapter}
          onDeleteChapter={handleDeleteChapter}
          onRenameChapter={(chapterId, title) => onUpdateChapter(chapterId, { title })}
          onOpenPromptPicker={openPromptPicker}
          onAnalyze={analyze}
          onOpenPromptLibrary={openPromptLibrary}
          onToast={onToast}
          onSyncState={() => {
            if (currentChapter) void syncStoryState(currentChapter, currentContent, true)
          }}
          syncingState={syncingState}
          onCreateChapterFromOutline={createChapterFromOutline}
          onStartFromOutline={startFromOutline}
          onAuditContinuity={() => void auditContinuity()}
          auditingContinuity={auditingContinuity}
          onRepairContinuity={() => void repairContinuity()}
          repairingContinuity={repairingContinuity}
          onSyncAll={() => void syncMissingChapters()}
          syncingAll={syncingAll}
          syncAllProgress={syncAllProgress}
          archiveJobs={archiveJobs}
          onQueueFactionArchive={queueFactionArchive}
          assistantOpen={assistantOpen}
          onToggleAssistant={() => {
            setAssistantSeed(null)
            setAssistantOpen((open) => !open)
          }}
        />

        <AssistantDrawer
          key={work.id}
          open={assistantOpen}
          onClose={() => {
            setAssistantOpen(false)
            setAssistantSeed(null)
          }}
          seedPrompt={assistantSeed}
          work={work}
          detail={detail}
          chapter={currentChapter}
          content={currentContent}
          api={api}
          apiReady={apiReady}
          onRecordUsage={handleRecordUsage}
        />
      </div>

      {detail.currentSummary || recentStoryEvents.length || openStoryThreads.length ? (
        <div className={`continuity-strip ${briefOpen ? 'open' : ''}`}>
          <button
            type="button"
            className="continuity-strip-toggle"
            aria-expanded={briefOpen}
            onClick={() => setBriefOpen((prev) => !prev)}
          >
            <span>承接简报</span>
            <small>{detail.currentSummary || '查看最近事件与未解决事项'}</small>
            <span className="continuity-strip-arrow">{briefOpen ? '收起' : '展开'}</span>
          </button>
          {briefOpen ? (
            <div className="continuity-strip-body">
              <div>
                <span>最近事件</span>
                {recentStoryEvents.length ? (
                  recentStoryEvents.map((title) => <small key={title}>{title}</small>)
                ) : (
                  <small>暂无</small>
                )}
              </div>
              <div>
                <span>未解决事项</span>
                {openStoryThreads.length ? (
                  openStoryThreads.slice(0, 6).map((text) => <small key={text}>{text}</small>)
                ) : (
                  <small>暂无</small>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {writingMode === 'wheelchair' ? (
        <WheelchairBar
          work={work}
          detail={detail}
          chapters={chapters}
          writingApi={api}
          generalApi={generalApi}
          apiReady={apiReady}
          onUpdateDetail={onUpdateDetail}
          onUpdateChapter={onUpdateChapter}
          onAddChapter={onAddChapter}
          onSnapshot={onSnapshot}
          onToast={onToast}
          onRecordUsage={onRecordUsage}
          onRunningChange={setAutoWriteRunning}
          onExit={() => setWritingMode('director')}
        />
      ) : (
      <div className={`director-bar harness-dock ${composerCollapsed ? 'is-collapsed' : ''}`}>
        {composerCollapsed ? (
          <div className="composer-collapsed-bar">
            <button
              type="button"
              className="composer-collapsed-expand"
              onClick={() => setComposerCollapsed(false)}
              title="展开输入栏（Ctrl / Cmd + J）"
              aria-label="展开输入栏"
            >
              <IconChevronUp size={15} />
              展开输入
            </button>
            <span className="composer-collapsed-meta">
              {currentChapter ? `第 ${currentIndex + 1} 章` : '还没有章节'} · {harnessWords} 字 · 已保存
            </span>
            {isGenerating ? <span className="composer-collapsed-writing">正在写…{streamingText ? ` 已接收 ${streamingText.length} 字` : ' 等待首字…'}</span> : null}
            <div className="composer-collapsed-actions">
              <button
                type="button"
                className="composer-collapsed-search"
                title="搜索本书"
                aria-label="搜索本书"
                onClick={() => {
                  setComposerCollapsed(false)
                  setComposerTool('search')
                }}
              >
                <IconSearch size={15} />
              </button>
              {isGenerating ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={stop}>
                  停止
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm composer-collapsed-continue"
                  disabled={!currentChapter || chapterReadOnly}
                  title={`按上次选择的字数（${continueWords} 字）直接续写`}
                  onClick={() => void startUnpromptedWriting(continueWords)}
                >
                  <IconSparkles size={14} />
                  续写 {continueWords} 字
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
        <div className="composer-stage">
          <div className="composer-side left" aria-label="写作辅助">
            <button
              type="button"
              className={`composer-side-btn ${briefOpen ? 'active' : ''}`}
              title="承接简报"
              aria-label="承接简报"
              aria-expanded={briefOpen}
              disabled={!hasBrief}
              onClick={() => {
                setComposerTool(null)
                setBriefOpen((prev) => !prev)
              }}
            >
              <IconFileText size={15} />
            </button>
            <button
              type="button"
              className={`composer-side-btn ${composerTool === 'beats' ? 'active' : ''}`}
              title="本章目标：推进 / 暴露 / 钩子，长度与节奏"
              aria-label="本章目标"
              aria-expanded={composerTool === 'beats'}
              onClick={() => openComposerTool('beats')}
            >
              <IconBookOpen size={15} />
              {beatsFilled > 0 ? <span className="composer-side-badge">{beatsFilled}</span> : null}
            </button>
            <button
              type="button"
              className={`composer-side-btn ${composerTool === 'context' ? 'active' : ''}`}
              title="上下文开关与 token 预算"
              aria-label="上下文与预算"
              aria-expanded={composerTool === 'context'}
              onClick={() => openComposerTool('context')}
            >
              <IconSearch size={15} />
            </button>
            <button
              type="button"
              className={`composer-side-btn ${composerTool === 'brief' ? 'active' : ''}`}
              title="先分析这一场：在场角色、冲突、认知边界、必须回收的线"
              aria-label="场记分析"
              aria-expanded={composerTool === 'brief'}
              onClick={() => void analyzeScene()}
            >
              <IconSparkles size={15} />
            </button>
            <button
              type="button"
              className={`composer-side-btn ${composerTool === 'mention' ? 'active' : ''}`}
              title="@ 引用人物、势力、地点或伏笔"
              aria-label="@ 引用实体"
              aria-expanded={composerTool === 'mention'}
              onClick={() => openComposerTool('mention')}
            >
              <span className="composer-side-at">@</span>
            </button>
          </div>

          <div className={`harness-composer ${isGenerating ? 'is-generating' : ''}`}>
          <div className="harness-main">
            <button
              type="button"
              className="harness-plus"
              aria-label="选择本作提示词"
              title="选择本作启用的提示词"
              disabled={isGenerating}
              onClick={openPromptPicker}
            >
              <IconPlus size={17} />
            </button>
            <textarea
              className="harness-textarea"
              value={directive}
              onChange={(event) => setDirective(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  send()
                }
              }}
              rows={1}
              placeholder={
                workDone
                  ? '本书已完结，重新开启连载后继续写。'
                  : chapterDone
                    ? '本章已完成，重新打开本章后继续写。'
                    : '下一场戏：在哪儿、谁在场、人物要做什么？'
              }
              disabled={chapterReadOnly}
              aria-label="导演指令"
            />
            <div className="harness-model-wrap" ref={modelMenuRef}>
              <button
                type="button"
                className="harness-model-trigger"
                aria-haspopup="listbox"
                aria-expanded={modelMenuOpen}
                title={`服务商：${provider.name}（可在设置中更换）`}
                disabled={isGenerating || modelOptions.length === 0 || workDone}
                onClick={() => setModelMenuOpen((open) => !open)}
              >
                <span>{apiReady ? api.model || '选择模型' : '未配置模型'}</span>
                <IconChevronDown size={12} />
              </button>
              {modelMenuOpen ? (
                <div className="harness-model-menu" role="listbox" aria-label="写作模型">
                  <small>{providerLabel} · 模型列表来自服务商</small>
                  {modelOptions.map((model) => (
                    <button
                      key={model}
                      type="button"
                      role="option"
                      aria-selected={model === api.model}
                      className={model === api.model ? 'active' : ''}
                      onClick={() => {
                        onModelChange(model)
                        setModelMenuOpen(false)
                      }}
                    >
                      <span>{model}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="harness-reroll"
              aria-label="重拍"
              title="用上一次的导演指令重新生成"
              disabled={isGenerating || chapterReadOnly || !lastRunRef.current}
              onClick={reroll}
            >
              <IconRewind size={18} />
            </button>
            {isGenerating ? (
              <button
                type="button"
                className="harness-send is-stop"
                aria-label="停止生成"
                title="停止生成"
                onClick={stop}
              >
                <IconStop size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="harness-send"
                aria-label="继续写"
                title="继续写（Ctrl / Cmd + Enter）"
                disabled={!directive.trim() || !currentChapter || chapterReadOnly}
                onClick={send}
              >
                <IconArrowRight size={18} />
              </button>
            )}
          </div>
          <div className="harness-subline">
            <span>导演指令 · Ctrl / Cmd + Enter 发送</span>
            {isGenerating ? <span className="harness-writing">正在写…{streamingText ? ` 已接收 ${streamingText.length} 字` : ' 等待首字…'}</span> : null}
          </div>
        </div>

          <div className="composer-side right" aria-label="写作动作与检查">
            <button
              type="button"
              className={`composer-side-btn ${composerTool === 'search' ? 'active' : ''}`}
              title="搜索本书（Ctrl / Cmd + Shift + F）"
              aria-label="搜索本书"
              aria-expanded={composerTool === 'search'}
              onClick={() => openComposerTool('search')}
            >
              <IconSearch size={15} />
            </button>
            <button
              type="button"
              className={`composer-side-btn composer-continue-btn ${composerTool === 'continue' ? 'active' : ''}`}
              title="AI 自动续写：不用输入指令，选择字数后直接生成"
              aria-label="AI 自动续写"
              aria-expanded={composerTool === 'continue'}
              onClick={() => openComposerTool('continue')}
            >
              <IconSparkles size={15} />
              <span>续写</span>
            </button>
            <button
              type="button"
              className={`composer-side-btn ${composerTool === 'actions' ? 'active' : ''}`}
              title="写作动作：扩写、精简、改写、加强冲突等"
              aria-label="写作动作"
              aria-expanded={composerTool === 'actions'}
              onClick={() => openComposerTool('actions')}
            >
              <IconFeather size={15} />
            </button>
            <button
              type="button"
              className={`composer-side-btn ${composerTool === 'continuity' ? 'active' : ''}`}
              title="连续性检查"
              aria-label="连续性检查"
              aria-expanded={composerTool === 'continuity'}
              onClick={() => openComposerTool('continuity')}
            >
              <IconCheck size={15} />
            </button>
            <button
              type="button"
              className={`composer-side-btn ${composerTool === 'foreshadow' ? 'active' : ''}`}
              title="未回收伏笔"
              aria-label="未回收伏笔"
              aria-expanded={composerTool === 'foreshadow'}
              onClick={() => openComposerTool('foreshadow')}
            >
              <IconBookmark size={15} />
              {unresolvedForeshadowItems.length > 0 ? (
                <span className="composer-side-badge">{unresolvedForeshadowItems.length}</span>
              ) : null}
            </button>
            <button
              type="button"
              className={`composer-side-btn ${composerTool === 'inspire' ? 'active' : ''}`}
              title="灵感与章末钩子"
              aria-label="灵感与钩子"
              aria-expanded={composerTool === 'inspire'}
              onClick={() => openComposerTool('inspire')}
            >
              <IconSparkles size={15} />
            </button>
            <button
              type="button"
              className="composer-side-btn composer-collapse-btn"
              title="收起输入栏（Ctrl / Cmd + J）"
              aria-label="收起输入栏"
              onClick={() => {
                setComposerTool(null)
                setComposerCollapsed(true)
              }}
            >
              <IconChevronDown size={15} />
            </button>
          </div>

          {renderComposerToolPanel()}
        </div>

        <div className="director-status harness-stats">
          <div className="director-controls">
            <div
              className="director-reasoning"
              role="group"
              aria-label="推理等级"
              title="推理等级会写入写作提示词，影响模型检查人物、伏笔与因果的强度"
            >
              <span className="director-reasoning-label">推理</span>
              {REASONING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={reasoningEffort === option.value ? 'active' : ''}
                  aria-pressed={reasoningEffort === option.value}
                  disabled={isGenerating}
                  title={option.hint}
                  onClick={() => onReasoningChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <span className="harness-stat">
            第 {currentIndex + 1} 章 · {harnessWords} 字
          </span>
          <span className="harness-stat">
            事件 {totalStoryEvents} · 未解决 {openStoryThreads.length}
          </span>
          <span className="harness-stat">
            上下文约 {harnessContextTokens.toLocaleString()} tokens
          </span>
          {currentChapter ? (
            <button
              type="button"
              className="director-link"
              title="查看本次续写的上下文预算"
              onClick={() => setContextOpen(true)}
            >
              上下文
            </button>
          ) : null}
          <span className="director-meta">已启用 {activePrompts.length} 条提示词</span>
          <span className={`ai-state ${apiReady ? 'ready' : 'warn'}`}>
            <span className="status-dot" />
            {apiReady ? `写作 · ${providerLabel} · ${api.model}` : 'AI 未配置'}
          </span>
          {!apiReady ? (
            <button type="button" className="director-link" onClick={onOpenSettings}>
              去设置
            </button>
          ) : null}
          {error ? (
            <span className="director-error" title={error}>
              {error}
            </span>
          ) : null}
        </div>
          </>
        )}
      </div>
      )}

      {completeOpen && currentChapter ? (
        <Modal
          title="完成本章"
          subtitle={`${currentChapter.title || `第 ${currentIndex + 1} 章`} · ${countWords(currentChapter.content)} 字`}
          onClose={() => setCompleteOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCompleteOpen(false)}>
                取消
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={completeChapter}>
                确认完成
              </button>
            </>
          }
        >
          <div className="chapter-complete-checks">
            <div>
              <span>章节标题</span>
              <strong>{currentChapter.title || '未命名章节'}</strong>
              {currentChapter.title === '未命名章节' ? (
                <small>仍是默认标题，建议先修改或让 AI 起名。</small>
              ) : null}
            </div>
            <div>
              <span>正文</span>
              <strong>{countWords(currentChapter.content)} 字</strong>
            </div>
            <div>
              <span>完成后</span>
              <strong>本章设为只读，可随时重新打开</strong>
            </div>
          </div>
          <p className="drawer-hint">
            完成本章会保留当前快照；如果本章尚未同步过事件，会自动补一次状态同步。如果本章绑定了大纲卡，会同时标记为已完成。
          </p>
          {work.status === '草稿' ? (
            <p className="warn-line">这是本书第一次完成章节，确认后作品状态会从「草稿」变为「连载中」。</p>
          ) : null}
        </Modal>
      ) : null}

      {workStatusOpen ? (
        <Modal
          title="作品状态"
          subtitle={`当前：${work.status}`}
          onClose={() => setWorkStatusOpen(false)}
          size="lg"
          footer={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWorkStatusOpen(false)}>
              关闭
            </button>
          }
        >
          <div className="work-status-summary">
            <span>章节</span>
            <strong>
              {completedChapterCount} / {chapters.length} 已完成
            </strong>
            <span>未回收伏笔</span>
            <strong>{unresolvedForeshadowings}</strong>
            <span>未解决线索</span>
            <strong>{openStoryThreads.length}</strong>
          </div>

          {work.status !== '已完结' ? (
            <div className="work-status-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  onUpdateWork({ status: '草稿' })
                  setWorkStatusOpen(false)
                  onToast('已切换为草稿')
                }}
              >
                草稿
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  onUpdateWork({ status: '连载中', startedAt: work.startedAt ?? Date.now() })
                  setWorkStatusOpen(false)
                  onToast('已切换为连载中')
                }}
              >
                连载中
              </button>
            </div>
          ) : (
            <div className="work-status-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={reopenWork}>
                重新开启连载
              </button>
            </div>
          )}

          {work.status !== '已完结' ? (
            <section className="finish-work">
              <div className="drawer-section-head">
                <span>完结本书</span>
                <strong>{completedChapterCount}/{chapters.length} 章完成</strong>
              </div>
              <p className="drawer-hint">
                完结不会删除正文或设定；之后可以重新开启连载。建议先把未完成章节、伏笔和未解决事项收束。
              </p>
              {unfinishedChapters.length > 0 ? (
                <p className="warn-line">
                  还有 {unfinishedChapters.length} 章未完成：{unfinishedChapters.slice(0, 5).map((chapter) => chapter.title || '未命名章节').join('、')}
                  {unfinishedChapters.length > 5 ? '…' : ''}
                </p>
              ) : (
                <p className="drawer-hint">全部章节已完成。</p>
              )}
              {unresolvedForeshadowings > 0 || openStoryThreads.length > 0 ? (
                <p className="warn-line">
                  仍有 {unresolvedForeshadowings} 条未回收伏笔、{openStoryThreads.length} 条未解决事项。
                </p>
              ) : null}
              <textarea
                className="input drawer-textarea"
                rows={3}
                value={completionNote}
                onChange={(event) => setCompletionNote(event.target.value)}
                placeholder="完结说明（可选）"
              />
              <label className="finish-confirm">
                <input
                  type="checkbox"
                  checked={finishChecked}
                  onChange={(event) => setFinishChecked(event.target.checked)}
                />
                <span>我确认本书完结；未完成章节和未解决线索保持现状。</span>
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!finishChecked}
                onClick={finishWork}
              >
                确认完结
              </button>
            </section>
          ) : (
            <section className="finished-note">
              <p>
                本书已于{' '}
                {work.completedAt ? new Date(work.completedAt).toLocaleDateString() : '未知日期'} 完结。
              </p>
              {work.completionNote ? <p>{work.completionNote}</p> : null}
            </section>
          )}
        </Modal>
      ) : null}

      {historyOpen && currentChapter ? (
        <Modal
          title="正文版本"
          subtitle={`${currentChapter.title || '未命名章节'} · 最近 ${currentChapter.history?.length ?? 0} 个版本`}
          onClose={() => setHistoryOpen(false)}
          size="lg"
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setHistoryOpen(false)}>
              关闭
            </button>
          }
        >
          <div className="version-list">
            {(currentChapter.history ?? []).length === 0 ? (
              <p className="drawer-empty">还没有历史版本。</p>
            ) : (
              [...(currentChapter.history ?? [])].reverse().map((version) => (
                <article className="version-row" key={version.id}>
                  <div>
                    <strong>{new Date(version.updatedAt).toLocaleString()}</strong>
                    <small>{countWords(version.content)} 字</small>
                  </div>
                  <p>{version.content.replace(/\s+/g, ' ').slice(0, 160) || '空章节'}</p>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={chapterReadOnly}
                    onClick={() => restoreVersion(version.content)}
                  >
                    恢复此版本
                  </button>
                </article>
              ))
            )}
          </div>
        </Modal>
      ) : null}

      {selectionCapture && !editing && !isGenerating ? (
        <div
          className="selection-toolbar"
          style={{ left: selectionCapture.left, top: selectionCapture.top }}
          role="toolbar"
          aria-label="选中文字工具"
        >
          {SELECTION_ACTIONS.map((item) => (
            <button
              type="button"
              key={item.action}
              onClick={() => void runSelectionEdit(item.action)}
              disabled={selectionBusy || !apiReady}
              title={apiReady ? item.label : '请先配置 AI'}
            >
              {item.label}
            </button>
          ))}
          <span className="selection-toolbar-divider" />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(selectionCapture.text)
              setSelectionCapture(null)
              onToast('已复制选中文字')
            }}
          >
            复制
          </button>
          <span className="selection-toolbar-divider" />
          <button
            type="button"
            onClick={() => {
              setBindingText(selectionCapture.text)
              setSelectionCapture(null)
            }}
          >
            绑定人物
          </button>
        </div>
      ) : null}

      {selectionBusy ? (
        <div className="selection-busy" role="status">
          <span className="status-dot" />
          AI 正在处理选中文字…
        </div>
      ) : null}

      {contextMenu ? (
        <div
          className="manuscript-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          {contextMenu.selection ? (
            <>
              <span className="context-menu-label">
                选中 {contextMenu.selection.text.length} 字
              </span>
              {SELECTION_ACTIONS.map((item) => (
                <button
                  type="button"
                  key={item.action}
                  role="menuitem"
                  disabled={!apiReady}
                  onClick={() => void runSelectionEdit(item.action, contextMenu.selection ?? undefined)}
                >
                  {item.label}
                </button>
              ))}
              <span className="context-menu-separator" />
            </>
          ) : null}
          <button type="button" role="menuitem" onClick={copySelectedText}>
            复制
          </button>
          {contextMenu.selection ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setBindingText(contextMenu.selection?.text ?? '')
                setContextMenu(null)
              }}
            >
              绑定人物
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={selectAllManuscript}>
            全选正文
          </button>
          {!contextMenu.editing ? (
            <>
              <span className="context-menu-separator" />
              <button
                type="button"
                role="menuitem"
                disabled={chapterReadOnly}
                onClick={() => {
                  startEditing()
                  setContextMenu(null)
                }}
              >
                编辑正文
              </button>
              <button type="button" role="menuitem" onClick={copyChapterContent}>
                复制整章
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setHistoryOpen(true)
                  setContextMenu(null)
                }}
              >
                查看版本历史
              </button>
              <span className="context-menu-separator" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openExportNovel(currentChapter?.id)
                  setContextMenu(null)
                }}
              >
                导出本章…
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openExportNovel()
                  setContextMenu(null)
                }}
              >
                导出整本…
              </button>
            </>
          ) : null}
          {contextMenu.editing ? (
            <>
              <button type="button" role="menuitem" onClick={() => void cutFromEditor()}>
                剪切
              </button>
              <button type="button" role="menuitem" onClick={() => void pasteIntoEditor()}>
                粘贴
              </button>
            </>
          ) : null}
          {contextMenu.editing ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  saveEditing()
                  setContextMenu(null)
                }}
              >
                保存正文
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  document.execCommand('undo')
                  setContextMenu(null)
                }}
              >
                撤销编辑
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  document.execCommand('redo')
                  setContextMenu(null)
                }}
              >
                重做编辑
              </button>
              <span className="context-menu-separator" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setEditing(false)
                  setContextMenu(null)
                }}
              >
                取消编辑
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setHistoryOpen(true)
                  setContextMenu(null)
                }}
              >
                查看版本历史
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openExportNovel()
                  setContextMenu(null)
                }}
              >
                导出整本…
              </button>
            </>
          ) : (
            <>
              <span className="context-menu-separator" />
              <button
                type="button"
                role="menuitem"
                disabled={!currentChapter?.history?.length}
                onClick={() => {
                  undoContent()
                  setContextMenu(null)
                }}
              >
                撤销正文
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={redoStack.length === 0}
                onClick={() => {
                  redoContent()
                  setContextMenu(null)
                }}
              >
                重做正文
              </button>
            </>
          )}
        </div>
      ) : null}

      {selectionPreview ? (
        <Modal
          title={SELECTION_LABELS[selectionPreview.action]}
          subtitle={`选中 ${selectionPreview.original.length} 字 · 确认后再替换正文`}
          onClose={() => setSelectionPreview(null)}
          size="lg"
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setSelectionPreview(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={applySelectionPreview}
                disabled={chapterReadOnly}
              >
                {selectionPreview.action === 'continue' ? '插入续写' : '应用修改'}
              </button>
            </>
          }
        >
          <div className="selection-preview">
            <div className="selection-preview-column original">
              <span>原文</span>
              <p>{selectionPreview.original}</p>
            </div>
            <div className="selection-preview-column result">
              <span>{selectionPreview.action === 'continue' ? '续写内容' : 'AI 结果'}</span>
              <p>{selectionPreview.result}</p>
            </div>
          </div>
        </Modal>
      ) : null}

      {shortcutsOpen ? (
        <Modal
          title="快捷键"
          subtitle="写作页当前可用快捷键"
          onClose={() => setShortcutsOpen(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShortcutsOpen(false)}>
              关闭
            </button>
          }
        >
          <div className="shortcut-list">
            {[
              ['Ctrl / Cmd + S', '保存当前正文；非编辑态提示自动保存状态'],
              ['Ctrl / Cmd + Enter', '把导演指令发送给 AI，继续写'],
              ['Ctrl / Cmd + Z', '撤销上一版正文（非输入框内）'],
              ['Ctrl / Cmd + Shift + Z / Ctrl + Y', '重做正文'],
              ['Ctrl / Cmd + Shift + E', '打开导出面板：整本 / 选章 / 单章'],
              ['Ctrl / Cmd + F', '打开查找替换（非编辑态）'],
              ['Ctrl / Cmd + K', '全局搜索'],
              ['鼠标划选正文', '打开改写 / 润色 / 扩写 / 精简 / 续写工具条'],
              ['右键正文', '编辑、复制整章、版本历史、导出与选中文字 AI 操作'],
              ['?', '打开这个快捷键面板'],
            ].map(([key, description]) => (
              <div className="shortcut-row" key={key}>
                <kbd>{key}</kbd>
                <span>{description}</span>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}

      {exportOpen ? (
        <ExportNovelModal
          work={work}
          chapters={chapters}
          detail={detail}
          initialChapterId={exportPresetChapterId}
          onClose={() => setExportOpen(false)}
          onToast={onToast}
        />
      ) : null}

      {contextOpen && currentChapter ? (
        <ContextInspector
          work={work}
          detail={detail}
          chapters={chapters}
          chapter={currentChapter}
          content={currentContent}
          directive={directive}
          prompts={activePrompts}
          reasoningEffort={reasoningEffort}
          api={api}
          onUpdateWork={onUpdateWork}
          onClose={() => setContextOpen(false)}
        />
      ) : null}

      {promptPickerOpen ? (
        <PromptPickerModal
          prompts={prompts}
          selectedIds={promptDraft}
          onClose={() => setPromptPickerOpen(false)}
          onSave={savePromptIds}
        />
      ) : null}

      {rescueOpen ? (
        <RescueModal
          work={work}
          detail={detail}
          chapters={chapters}
          analysisApi={generalApi}
          analysisApiReady={generalApiReady}
          writingApi={api}
          writingApiReady={apiReady}
          onUpdateDetail={onUpdateDetail}
          onAddChapter={addRescueChapter}
          onSnapshot={onSnapshot}
          onOpenSettings={onOpenSettings}
          onToast={onToast}
          onRecordUsage={handleRecordUsage}
          onClose={() => setRescueOpen(false)}
        />
      ) : null}

      {selectedEntity ? (
        <EntityInfoCard
          entry={selectedEntity.entry}
          position={{ left: selectedEntity.left, top: selectedEntity.top }}
          onClose={() => setSelectedEntity(null)}
          onOpenDetails={openEntityDetails}
        />
      ) : null}

      {entityArchive ? (
        <EntityArchiveModal
          category={entityArchive.category}
          id={entityArchive.id}
          detail={detail}
          chapters={chapters}
          onUpdateDetail={onUpdateDetail}
          onToast={onToast}
          onClose={() => setEntityArchive(null)}
        />
      ) : null}

      {repairPreview ? (
        <Modal
          title="连续性修复预览"
          subtitle="只应用必要修改；确认前不会覆盖当前正文"
          size="lg"
          onClose={() => setRepairPreview(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setRepairPreview(null)}
              >
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={applyRepairPreview}>
                应用修复稿
              </button>
            </>
          }
        >
          <div className="repair-preview-grid">
            <section>
              <h4>修改前</h4>
              <pre>{repairPreview.before}</pre>
            </section>
            <section>
              <h4>修改后</h4>
              <pre>{repairPreview.after}</pre>
            </section>
          </div>
        </Modal>
      ) : null}

      {syncResult ? (
        <div className="sync-success-pop" role="status" aria-live="polite">
          <span className="sync-success-icon">
            <IconCheck size={15} />
          </span>
          <div>
            <strong>{syncResult.title}</strong>
            <span>{syncResult.detail}</span>
          </div>
          <button
            type="button"
            className="sync-success-close"
            aria-label="关闭同步提示"
            onClick={() => setSyncResult(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      {bindingText ? (
        <EntityBindingModal
          selectedText={bindingText}
          detail={detail}
          characters={bindingCharacters}
          mode="writing"
          onBind={(entry) => finishCharacterBinding(entry)}
          onClose={() => setBindingText('')}
        />
      ) : null}

      {syncQueueOpen ? (
        <SyncQueuePanel
          jobs={syncJobs}
          archiveJobs={archiveJobs}
          paused={syncQueuePaused}
          onPause={pauseSyncQueue}
          onResume={resumeSyncQueue}
          onCancelJob={cancelSyncJob}
          onRetryJob={retrySyncJob}
          onClearFinished={clearFinishedSyncJobs}
          onClose={() => setSyncQueueOpen(false)}
        />
      ) : null}

      {skillsOpen ? (
        <SkillsModal
          work={work}
          detail={detail}
          chapters={chapters}
          currentChapter={currentChapter}
          apis={{ writing: api, general: generalApi, chat: api }}
          onRecordUsage={onRecordUsage}
          onToast={onToast}
          onClose={() => setSkillsOpen(false)}
        />
      ) : null}

      {bookmarksOpen ? (
        <BookmarkModal
          work={work}
          chapters={chapters}
          currentChapter={currentChapter}
          onJump={(chapterId) => {
            setActiveChapterId(chapterId)
            setBookmarksOpen(false)
          }}
          onClose={() => setBookmarksOpen(false)}
        />
      ) : null}

      {pendingBackfill ? (
        <ConfirmModal
          title="补同步未同步章节"
          message={
            <>
              将为 {pendingBackfill.length} 个未同步章节加入同步队列。
              <br />
              会逐章调用 AI，产生 {pendingBackfill.length} 次模型请求，可能产生费用。
            </>
          }
          confirmLabel={`同步 ${pendingBackfill.length} 章`}
          onClose={() => setPendingBackfill(null)}
          onConfirm={() => {
            const targets = pendingBackfill
            setPendingBackfill(null)
            syncChapterBatch(targets, 'backfill')
            setSyncQueueOpen(true)
            onToast(`已加入同步队列：${targets.length} 章`)
          }}
        />
      ) : null}

      {deleteChapterTarget ? (
        <ConfirmModal
          title="删除章节"
          message={
            <>
              确定删除「{deleteChapterTarget.title || '未命名章节'}」？
              <br />
              共 {countWords(deleteChapterTarget.content)} 字，删除后无法恢复。
            </>
          }
          confirmLabel="删除章节"
          danger
          onClose={() => setDeleteChapterTarget(null)}
          onConfirm={() => {
            handleDeleteChapter(deleteChapterTarget.id)
            setDeleteChapterTarget(null)
          }}
        />
      ) : null}

      {syncMultiOpen ? (
        <SyncMultiChapterModal
          chapters={chapters}
          initialChapterId={currentChapter?.id}
          onConfirm={syncMultipleChapters}
          onClose={() => setSyncMultiOpen(false)}
        />
      ) : null}

      {prosePolishOpen ? (
        <ProsePolishModal
          before={prosePolishBefore}
          after={prosePolishAfter}
          polishing={prosePolishing}
          onApply={applyProsePolish}
          onClose={closeProsePolish}
        />
      ) : null}

      {qualityOpen ? (
        <ProseQualityModal
          content={displayContent}
          chapterTitle={currentChapter?.title ?? '当前章节'}
          onClose={() => setQualityOpen(false)}
        />
      ) : null}

      {findReplaceOpen && currentChapter ? (
        <FindReplaceModal
          content={currentChapter.content}
          chapterTitle={currentChapter.title}
          onApply={(nextText) => {
            onUpdateChapter(currentChapter.id, { content: nextText })
            onToast('查找替换已应用到当前章节')
          }}
          onClose={() => setFindReplaceOpen(false)}
        />
      ) : null}

      {bindingUndo ? (
        <div className="writing-binding-undo">
          <span>{bindingUndo.label}</span>
          <button type="button" onClick={undoCharacterBinding}>
            撤销
          </button>
        </div>
      ) : null}

      {readerOpen ? (
        <Reader
          work={work}
          chapters={chapters}
          initialChapterId={currentChapter?.id}
          entityEntries={entityIndex}
          typography={typography}
          billing={{
            balance: balanceEntry
              ? balanceMoney(balanceEntry.total, balanceEntry.currency)
              : '--',
            cost: personalBridge
              ? formatCost(personalBridge.cost)
              : sessionUsage.calls === 0
                ? '¥0.00'
                : sessionUsage.pricedCalls > 0
                  ? formatCost(sessionUsage.cost)
                  : '未配价',
            loading: balanceLoading,
            onRefresh: onRefreshBalance,
          }}
          generation={
            personalBridge
              ? {
                  completed: personalBridge.generation.completed,
                  total: personalBridge.generation.total,
                  status: personalBridge.generation.status,
                  currentChapter: personalBridge.generation.currentChapter,
                  onContinue: (count) => personalBridge.continueChapters(count ?? 1),
                  onStop: personalBridge.stop,
                }
              : undefined
          }
          sync={
            personalBridge
              ? {
                  status: personalBridge.sync.status,
                  done: personalBridge.sync.done,
                  total: personalBridge.sync.total,
                  onOpen: personalBridge.openSyncQueue,
                }
              : undefined
          }
          onOpenDetails={() => {
            setReaderOpen(false)
            setDetailMode('expanded')
            setDetailFocusRequest({ tab: 'intro', requestId: Date.now() })
          }}
          onOpenWriter={() => setReaderOpen(false)}
          onOpenAddressReview={personalBridge?.openAddressReview}
          onOpenEntityDetails={openEntityDetails}
          onOpenShelf={(chapterId) => {
            if (chapterId && chapterId !== activeChapterId) setActiveChapterId(chapterId)
            onBack()
          }}
          onClose={(chapterId) => {
            if (chapterId && chapterId !== activeChapterId) setActiveChapterId(chapterId)
            setReaderOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
