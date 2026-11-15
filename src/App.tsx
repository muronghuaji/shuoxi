import { Suspense, lazy, startTransition, useEffect, useRef, useState } from 'react'
import type { PersonalNovelBridge } from './personalNovelBridge'
import type {
  AiProfileId,
  AiProfilesConfig,
  AppearanceSettings,
  BackgroundImageRecord,
  Chapter,
  CharacterChatMemory,
  CharacterChatSession,
  CharacterChatSettings,
  CreateWorkInput,
  Genre,
  Idea,
  PersonalNovelCreateInput,
  PlatformBalance,
  Prompt,
  View,
  Work,
  WorkDetail,
  WorkStyle,
  ReasoningEffort,
  AiUsageEntry,
  SyncSettings,
} from './types'
import {
  createChapter,
  createEmptyDetail,
  INITIAL_CHAPTERS,
  INITIAL_WORK_DETAILS,
  INITIAL_WORKS,
  SEED_PROMPTS,
  normalizeStoredWorks,
} from './data'
import { chapterWords, countWords } from './utils'
import { parseImportedNovel, type ImportedNovel } from './novelImport'
import { decodeNovelBuffer } from './novelEncoding'
import { ImportProgress, type ImportJobState } from './components/ImportProgress'
import { ImportStyleModal } from './components/ImportStyleModal'
import { BootstrapModal } from './components/BootstrapModal'
import { applyStylePreset, createEmptyStyle, formatStyleCard, STYLE_PRESETS } from './styleProfile'
import { seedToWorkInput, type StorySeedDraft, type StorySeedRequest } from './storySeed'
import { StorySeedModal } from './components/StorySeedModal'
import { importedStylePromptTitle } from './importStyle'
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  applyAppearance,
  normalizeAppearance,
} from './appearance'
import { compressBackgroundImage } from './backgroundImage'
import {
  AI_PROFILES_KEY,
  DEFAULT_AI_PROFILES,
  loadInitialAiProfiles,
  normalizeAiProfiles,
  profileReady,
  resolveAiConfig,
} from './aiProfiles'
import {
  CHARACTER_CHAT_SETTINGS_KEY,
  DEFAULT_CHARACTER_CHAT_SETTINGS,
  normalizeCharacterChatSettings,
} from './characterChatSettings'
import { useStoredState } from './hooks/useStoredState'
import {
  setAiBudgetGuard,
  setAiRequestObserver,
  type AiRequestObservation,
} from './ai'
import { initStorySqlite } from './storySqlite'
import {
  loadWritingPricing,
  normalizeWritingPricing,
  resolveWritingPrice,
  type WritingPricingSettings,
} from './pricing'
import {
  DEFAULT_SYNC_SETTINGS,
  SYNC_SETTINGS_KEY,
  normalizeSyncSettings,
} from './syncSettings'
import { calculateUsageCost } from './usage'
import { fetchPlatformBalance } from './billing'
import { useIndexedStoredState } from './hooks/useIndexedStoredState'
import { useSqliteStoryStore } from './hooks/useSqliteStoryStore'
import { batchExportWorks } from './batchExport'
import {
  MAX_TRASH_ENTRIES,
  createAutoSnapshot,
  createProjectBackup,
  createTrashEntry,
  downloadProjectBackup,
  downloadTextFile,
  parseProjectBackup,
  pruneSnapshots,
} from './backup'
import type { AutoSnapshot, ProjectBackup, TrashEntry } from './backup'
import { createProjectPackage, parseProjectPackage, projectPackageFileName } from './projectPackage'
import { HomeView } from './components/HomeView'
import { ConfirmModal } from './components/ConfirmModal'
import { importSkillPackageFile } from './skillPackage'
import { loadCustomSkills, saveCustomSkills } from './skills'
import { ExportNovelModal } from './components/ExportNovelModal'
import { IconCheck } from './components/Icons'
import { IconRail, type RailSection } from './components/IconRail'
import {
  DEFAULT_STATS_BUDGET,
  addUsageToDaily,
  buildUsageDailyFromEntries,
  buildWritingDailySnapshot,
  monthCost,
  normalizeBudget,
  upsertWritingSnapshot,
  writingStreak,
  type StatsBudget,
  type UsageDailyBucket,
  type WritingActivityEntry,
  type WritingDailySnapshot,
} from './stats'
import { normalizeIdeas } from './ideas'
import { createIdea } from './ideas'

const Workspace = lazy(() =>
  import('./components/Workspace').then((module) => ({ default: module.Workspace })),
)
const CharacterChatView = lazy(() =>
  import('./components/CharacterChatView').then((module) => ({
    default: module.CharacterChatView,
  })),
)
const PersonalNovelView = lazy(() =>
  import('./components/PersonalNovelView').then((module) => ({
    default: module.PersonalNovelView,
  })),
)
const StatsView = lazy(() =>
  import('./components/StatsView').then((module) => ({ default: module.StatsView })),
)
const IdeasView = lazy(() =>
  import('./components/IdeasView').then((module) => ({ default: module.IdeasView })),
)
const PromptManagerView = lazy(() =>
  import('./components/PromptManagerView').then((module) => ({
    default: module.PromptManagerView,
  })),
)
const NewWorkModal = lazy(() =>
  import('./components/NewWorkModal').then((module) => ({ default: module.NewWorkModal })),
)
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((module) => ({ default: module.SettingsModal })),
)
const CommandPalette = lazy(() =>
  import('./components/CommandPalette').then((module) => ({
    default: module.CommandPalette,
  })),
)

type ModalKind = 'new' | 'seed' | 'settings' | null

type ImportWorkerMessage =
  | { type: 'progress'; percent: number; stage: string; chapters?: number; words?: number }
  | { type: 'done'; novel: ImportedNovel }
  | { type: 'error'; message: string }


interface Draft extends Partial<CreateWorkInput> {
  synopsis: string
  genres: Genre[]
  stylePresetId?: string
}

function readInitialState(): { view: View; workId: string | null; modal: ModalKind } {
  const params = new URLSearchParams(window.location.search)
  const viewParam = params.get('view')
  const view: View =
    viewParam === 'workspace'
      ? 'workspace'
      : viewParam === 'prompts'
        ? 'prompts'
        : viewParam === 'chat'
          ? 'chat'
          : viewParam === 'stats'
            ? 'stats'
            : 'home'
  const workId = params.get('work')
  const modalParam = params.get('modal')
  const modal: ModalKind =
    modalParam === 'new' || modalParam === 'settings' ? modalParam : null
  return { view, workId, modal }
}

const initial = readInitialState()

export default function App() {
  const {
    works,
    setWorks,
    chaptersByWork,
    setChaptersByWork,
    detailsByWork,
    setDetailsByWork,
    ready: storyReady,
    saveState,
    retrySave,
  } = useSqliteStoryStore({
    works: INITIAL_WORKS,
    chapters: INITIAL_CHAPTERS,
    details: INITIAL_WORK_DETAILS,
    normalizeWorks: normalizeStoredWorks,
  })
  const chaptersReady = storyReady
  const detailsReady = storyReady
  const [prompts, setPrompts] = useStoredState<Prompt[]>('shuoxi.prompts.v1', SEED_PROMPTS)
  const [aiProfiles, setAiProfiles] = useStoredState<AiProfilesConfig>(
    AI_PROFILES_KEY,
    loadInitialAiProfiles,
    normalizeAiProfiles,
  )
  const [lastBackupAt, setLastBackupAt] = useStoredState<number>('shuoxi.lastBackup.v1', 0)
  const [aiUsage, setAiUsage] = useStoredState<AiUsageEntry[]>('shuoxi.aiUsage.v1', [])
  const [ideas, setIdeas] = useStoredState<Idea[]>('shuoxi.ideas.v1', [], normalizeIdeas)
  const [platformBalance, setPlatformBalance] = useState<PlatformBalance | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [usageDaily, setUsageDaily] = useStoredState<UsageDailyBucket[]>(
    'shuoxi.usageDaily.v1',
    [],
  )
  const [writingDaily, setWritingDaily] = useStoredState<WritingDailySnapshot[]>(
    'shuoxi.writingDaily.v1',
    [],
  )
  const [writingActivity, setWritingActivity] = useStoredState<WritingActivityEntry[]>(
    'shuoxi.writingActivity.v1',
    [],
  )
  const [aiRequests, setAiRequests] = useStoredState<AiRequestObservation[]>(
    'shuoxi.aiRequests.v1',
    [],
  )
  const [statsBudget, setStatsBudget] = useStoredState<StatsBudget>(
    'shuoxi.statsBudget.v1',
    DEFAULT_STATS_BUDGET,
    normalizeBudget,
  )
  const [writingPricing, setWritingPricing] = useStoredState<WritingPricingSettings>(
    'shuoxi.writingPricing.v1',
    loadWritingPricing,
    normalizeWritingPricing,
  )
  const [importJob, setImportJob] = useState<ImportJobState | null>(null)
  const [pendingImportStyle, setPendingImportStyle] = useState<{
    work: Work
    novel: ImportedNovel
  } | null>(null)
  const [postImport, setPostImport] = useState<{
    work: Work
    novel: ImportedNovel
  } | null>(null)
  const [bootstrapWorkId, setBootstrapWorkId] = useState<string | null>(null)
  const [deleteRequest, setDeleteRequest] = useState<Work | null>(null)
  const [pendingDropNovel, setPendingDropNovel] = useState<File | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [exportWorkRequest, setExportWorkRequest] = useState<Work | null>(null)
  const importWorkerRef = useRef<Worker | null>(null)

  useEffect(() => {
    return () => {
      importWorkerRef.current?.terminate()
      importWorkerRef.current = null
    }
  }, [])
  const [appearance, setAppearance] = useStoredState<AppearanceSettings>(
    APPEARANCE_STORAGE_KEY,
    DEFAULT_APPEARANCE,
    normalizeAppearance,
  )
  const [backgroundImage, setBackgroundImage, backgroundReady] = useIndexedStoredState<string>(
    'shuoxi.backgroundImage.v1',
    '',
  )
  const [backgroundImages, setBackgroundImages, backgroundImagesReady] =
    useIndexedStoredState<BackgroundImageRecord[]>('shuoxi.backgroundImages.v1', [])
  const [syncSettings, setSyncSettings] = useStoredState<SyncSettings>(
    SYNC_SETTINGS_KEY,
    DEFAULT_SYNC_SETTINGS,
    normalizeSyncSettings,
  )
  const [characterChatSettings, setCharacterChatSettings] = useStoredState<CharacterChatSettings>(
    CHARACTER_CHAT_SETTINGS_KEY,
    DEFAULT_CHARACTER_CHAT_SETTINGS,
    normalizeCharacterChatSettings,
  )
  const [characterChats, setCharacterChats, characterChatsReady] = useIndexedStoredState<
    CharacterChatSession[]
  >('shuoxi.characterChats.v1', [])
  const [characterMemories, setCharacterMemories, characterMemoriesReady] = useIndexedStoredState<
    CharacterChatMemory[]
  >('shuoxi.characterMemories.v1', [])
  const [autoSnapshots, setAutoSnapshots, autoSnapshotsReady] = useIndexedStoredState<AutoSnapshot[]>(
    'shuoxi.autoSnapshots.v1',
    [],
  )
  const [trash, setTrash, trashReady] = useIndexedStoredState<TrashEntry[]>('shuoxi.trash.v1', [])
  const [lastAutoSnapshotAt, setLastAutoSnapshotAt] = useStoredState<number>(
    'shuoxi.lastAutoSnapshot.v1',
    0,
  )
  const [view, setView] = useState<View>(initial.view)
  const [personalBridge, setPersonalBridge] = useState<PersonalNovelBridge | null>(null)
  const [activeWorkId, setActiveWorkId] = useState<string | null>(initial.workId)
  const [modal, setModal] = useState<ModalKind>(initial.modal)
  const [draft, setDraft] = useState<Draft>({ synopsis: '', genres: [] })
  const [seedRequest, setSeedRequest] = useState<StorySeedRequest | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const budgetWarnedRef = useRef(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const usageDailyMigratedRef = useRef(false)
  const writingTotalsRef = useRef<Map<string, number> | null>(null)

  const activeWork = works.find((work) => work.id === activeWorkId) ?? null
  const bootstrapWork = works.find((work) => work.id === bootstrapWorkId) ?? null
  const deleteWorkSummary = deleteRequest
    ? {
        chapters: chaptersByWork[deleteRequest.id]?.length ?? deleteRequest.chapters,
        chats: characterChats.filter((session) => session.workId === deleteRequest.id).length,
        memories: characterMemories.filter((memory) => memory.workId === deleteRequest.id).length,
      }
    : null
  const generalApiBase = resolveAiConfig(aiProfiles, 'general')
  const writingApiBase = resolveAiConfig(aiProfiles, 'writing')
  const chatApiBase = resolveAiConfig(aiProfiles, 'chat')
  const currentWritingPrice = resolveWritingPrice(
    writingPricing.rules,
    writingApiBase.provider,
    writingApiBase.model,
  )
  const generalApi: typeof generalApiBase = {
    ...generalApiBase,
    inputPrice: 0,
    outputPrice: 0,
  }
  const writingApi: typeof writingApiBase = {
    ...writingApiBase,
    inputPrice: currentWritingPrice?.inputPrice ?? 0,
    outputPrice: currentWritingPrice?.outputPrice ?? 0,
  }
  const refreshPlatformBalance = async (force = false) => {
    const shared = aiProfiles.shared
    if (!shared.baseUrl.trim() || !shared.apiKey.trim()) {
      setPlatformBalance(null)
      return
    }
    setBalanceLoading(true)
    try {
      const result = await fetchPlatformBalance(
        shared.baseUrl,
        shared.apiKey,
        shared.provider,
        force,
      )
      setPlatformBalance(result.ok && result.balance ? result.balance : null)
    } catch {
      setPlatformBalance(null)
    } finally {
      setBalanceLoading(false)
    }
  }

  useEffect(() => {
    void refreshPlatformBalance()
    // 配置变化时重新查询；余额在 main 进程缓存 10 分钟
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiProfiles.shared.baseUrl, aiProfiles.shared.apiKey, aiProfiles.shared.provider])

  const chatApi: typeof chatApiBase = {
    ...chatApiBase,
    inputPrice: 0,
    outputPrice: 0,
  }
  const generalApiReady = profileReady(aiProfiles, 'general')
  const writingApiReady = profileReady(aiProfiles, 'writing')
  const chatApiReady = profileReady(aiProfiles, 'chat')
  const railActive: RailSection =
    view === 'prompts'
      ? 'prompts'
      : view === 'chat'
        ? 'chat'
        : view === 'stats'
          ? 'stats'
          : view === 'ideas'
            ? 'ideas'
            : 'library'

  const buildProjectBackup = (): ProjectBackup =>
    createProjectBackup({
      works,
      chapters: chaptersByWork,
      details: detailsByWork,
      prompts,
      characterChats,
      characterMemories,
      appearance,
      aiProfiles,
      characterChatSettings,
      aiUsage,
      lastBackupAt,
      backgroundImage,
      syncSettings,
      usageDaily,
      writingDaily,
      writingActivity,
      aiRequests,
      statsBudget,
      writingPricing,
      ideas,
    })

  const snapshotNow = (reason: string) => {
    const snapshot = createAutoSnapshot({ backup: buildProjectBackup(), reason })
    setAutoSnapshots((prev) => pruneSnapshots([snapshot, ...prev]))
    setLastAutoSnapshotAt(Date.now())
    return snapshot
  }

  const applyProjectBackup = (backup: ProjectBackup) => {
    setWorks(backup.works)
    setChaptersByWork(backup.chapters)
    setDetailsByWork(backup.details)
    setPrompts(backup.prompts)
    if (backup.characterChats) setCharacterChats(backup.characterChats)
    if (backup.characterMemories) setCharacterMemories(backup.characterMemories)
    if (backup.settings) {
      setAppearance(normalizeAppearance(backup.settings.appearance))
      const importedProfiles = normalizeAiProfiles(backup.settings.aiProfiles)
      setAiProfiles({
        ...importedProfiles,
        shared: {
          ...importedProfiles.shared,
          apiKey: aiProfiles.shared.apiKey,
        },
      })
      setCharacterChatSettings(
        normalizeCharacterChatSettings(backup.settings.characterChatSettings),
      )
      setAiUsage(backup.settings.aiUsage)
      if (backup.settings.usageDaily) setUsageDaily(backup.settings.usageDaily)
      if (backup.settings.writingDaily) setWritingDaily(backup.settings.writingDaily)
      if (backup.settings.writingActivity) setWritingActivity(backup.settings.writingActivity)
      if (backup.settings.aiRequests) setAiRequests(backup.settings.aiRequests)
      if (backup.settings.statsBudget) setStatsBudget(backup.settings.statsBudget)
      if (backup.settings.writingPricing) {
        setWritingPricing(normalizeWritingPricing(backup.settings.writingPricing))
      }
      if (backup.settings.ideas) {
        setIdeas(normalizeIdeas(backup.settings.ideas))
      }
      if (backup.settings.syncSettings) {
        setSyncSettings(normalizeSyncSettings(backup.settings.syncSettings))
      }
      if (backup.settings.backgroundImage !== undefined) {
        const restoredImage = backup.settings.backgroundImage
        setBackgroundImage(restoredImage)
        if (restoredImage) {
          setBackgroundImages((prev) =>
            prev.some((item) => item.data === restoredImage)
              ? prev
              : [
                  {
                    id: `bg-restore-${Date.now().toString(36)}`,
                    name: '备份恢复背景',
                    data: restoredImage,
                    createdAt: Date.now(),
                  },
                  ...prev,
                ].slice(0, 12),
          )
        }
      }
    }
    setLastBackupAt(Date.now())
    setActiveWorkId(null)
    setView('home')
  }

  useEffect(() => {
    if (
      !chaptersReady ||
      !detailsReady ||
      !characterChatsReady ||
      !characterMemoriesReady ||
      !autoSnapshotsReady ||
      !trashReady
    ) {
      return
    }
    if (lastAutoSnapshotAt && Date.now() - lastAutoSnapshotAt < 24 * 60 * 60 * 1000) return
    snapshotNow('每日自动快照')
    // snapshotNow 通过函数式更新写入快照；这里只关心首次就绪和每日节流
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chaptersReady,
    detailsReady,
    characterChatsReady,
    characterMemoriesReady,
    autoSnapshotsReady,
    trashReady,
    lastAutoSnapshotAt,
  ])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!postImport) return
    const timer = window.setTimeout(() => setPostImport(null), 3000)
    return () => window.clearTimeout(timer)
  }, [postImport])

  useEffect(() => {
    const buckets = usageDaily.length > 0 ? usageDaily : buildUsageDailyFromEntries(aiUsage)
    const cost = monthCost(buckets)
    const over = statsBudget.monthlyBudget > 0 && cost >= statsBudget.monthlyBudget
    const mode = statsBudget.budgetMode ?? 'off'
    if (!over) budgetWarnedRef.current = false
    if (over && mode === 'warn' && !budgetWarnedRef.current) {
      budgetWarnedRef.current = true
      setToast(
        `本月 AI 费用已达到预算上限（${cost.toFixed(2)} / ${statsBudget.monthlyBudget.toFixed(2)} ${statsBudget.currency}）`,
      )
    }
    setAiBudgetGuard(
      over && mode === 'block'
        ? () =>
            `本月 AI 预算已用完（${cost.toFixed(2)} / ${statsBudget.monthlyBudget.toFixed(2)} ${statsBudget.currency}）。请到创作统计调整预算，或关闭硬限制。`
        : null,
    )
    return () => setAiBudgetGuard(null)
  }, [aiUsage, statsBudget, usageDaily])

  useEffect(() => {
    void initStorySqlite()
  }, [])

  useEffect(() => {
    setAiRequestObserver((observation) => {
      setAiRequests((current) => [observation, ...current].slice(0, 5000))
    })
    return () => setAiRequestObserver(undefined)
  }, [setAiRequests])

  useEffect(() => {
    if (usageDailyMigratedRef.current) return
    usageDailyMigratedRef.current = true
    if (usageDaily.length === 0 && aiUsage.length > 0) {
      setUsageDaily(buildUsageDailyFromEntries(aiUsage))
    }
  }, [aiUsage, setUsageDaily, usageDaily.length])

  useEffect(() => {
    if (!chaptersReady) return
    const timer = window.setTimeout(() => {
      setWritingDaily((current) =>
        upsertWritingSnapshot(
          current,
          buildWritingDailySnapshot({ works, chaptersByWork }),
        ),
      )
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [chaptersByWork, chaptersReady, setWritingDaily, works])

  useEffect(() => {
    if (!chaptersReady) return
    const totals = new Map<string, number>()
    for (const work of works) {
      totals.set(
        work.id,
        (chaptersByWork[work.id] ?? []).reduce(
          (sum, chapter) => sum + chapterWords(chapter),
          0,
        ),
      )
    }
    const previous = writingTotalsRef.current
    writingTotalsRef.current = totals
    if (!previous) return
    const additions: { workId: string; words: number }[] = []
    for (const [workId, words] of totals) {
      const prior = previous.get(workId)
      if (prior !== undefined && words > prior) {
        additions.push({ workId, words: words - prior })
      }
    }
    if (additions.length === 0) return
    const now = Date.now()
    setWritingActivity((current) => {
      let next = [...current]
      for (const addition of additions) {
        const last = next[0]
        if (last && last.workId === addition.workId && now - last.at < 60_000) {
          next = [{ ...last, at: now, words: last.words + addition.words }, ...next.slice(1)]
        } else {
          next = [{ at: now, workId: addition.workId, words: addition.words }, ...next]
        }
      }
      return next.slice(0, 10_000)
    })
  }, [chaptersByWork, chaptersReady, setWritingActivity, works])

  useEffect(() => {
    const handleIdeaShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        setView('ideas')
      }
    }
    window.addEventListener('keydown', handleIdeaShortcut)
    return () => window.removeEventListener('keydown', handleIdeaShortcut)
  }, [])

  useEffect(() => {
    const handleStorageError = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; error?: string }>).detail
      setToast(`本地存储写入失败：${detail?.error ?? '空间可能已满'}，请立即导出备份`)
    }
    window.addEventListener('shuoxi-storage-error', handleStorageError)
    return () => window.removeEventListener('shuoxi-storage-error', handleStorageError)
  }, [])

  useEffect(() => {
    if (!backgroundReady || !backgroundImagesReady) return
    if (backgroundImages.length > 0 || !backgroundImage) return
    setBackgroundImages([
      {
        id: `bg-${Date.now().toString(36)}`,
        name: '已上传背景',
        data: backgroundImage,
        createdAt: Date.now(),
      },
    ])
  }, [
    backgroundImage,
    backgroundImages.length,
    backgroundImagesReady,
    backgroundReady,
    setBackgroundImages,
  ])

  useEffect(() => {
    applyAppearance(appearance, backgroundImage, view)
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const handleSystemTheme = () => {
      if (appearance.mode === 'system') applyAppearance(appearance, backgroundImage, view)
    }
    media.addEventListener('change', handleSystemTheme)
    return () => media.removeEventListener('change', handleSystemTheme)
  }, [appearance, backgroundImage, backgroundReady, view])

  useEffect(() => {
    const handleSearchKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleSearchKey)
    return () => window.removeEventListener('keydown', handleSearchKey)
  }, [])

  useEffect(() => {
    if (view === 'workspace' && !activeWork) setView('home')
  }, [view, activeWork])

  // 旧数据、新作品、URL 直达作品页时，补齐章节与作品详情。
  useEffect(() => {
    if (!activeWork || !chaptersReady || !detailsReady) return
    if (!chaptersByWork[activeWork.id]?.length) {
      setChaptersByWork((prev) =>
        prev[activeWork.id]?.length
          ? prev
          : { ...prev, [activeWork.id]: [createChapter('第 1 章')] },
      )
    }
    if (!detailsByWork[activeWork.id]) {
      setDetailsByWork((prev) =>
        prev[activeWork.id] ? prev : { ...prev, [activeWork.id]: createEmptyDetail() },
      )
    }
  }, [activeWork, chaptersByWork, detailsByWork, setChaptersByWork, setDetailsByWork, chaptersReady, detailsReady])

  
  useEffect(() => {
    if (!chaptersReady) return
    setWorks((prev) => {
      let changed = false
      const next = prev.map((work) => {
        const chapters = chaptersByWork[work.id]
        if (!chapters) return work
        const words = chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0)
        if (work.chapters === chapters.length && work.words === words) return work
        changed = true
        return { ...work, chapters: chapters.length, words, updatedAt: Date.now() }
      })
      return changed ? next : prev
    })
  }, [chaptersByWork, setWorks, chaptersReady])

  const openWork = (id: string) => {
    const target = works.find((work) => work.id === id)
    if (!target) return
    setActiveWorkId(id)
    setView('workspace')
  }

  const startFromComposer = (request: StorySeedRequest) => {
    setSeedRequest(request)
    setModal('seed')
  }

  const confirmStorySeed = (seed: StorySeedDraft | null) => {
    if (!seedRequest) return
    if (seed) {
      const input = seedToWorkInput(seed, seedRequest)
      setDraft({
        ...input,
        stylePresetId: seedRequest.stylePresetId,
      })
    } else {
      setDraft({
        synopsis: seedRequest.premise,
        genres: seedRequest.genres,
        targetWords: seedRequest.targetWords,
        stylePresetId: seedRequest.stylePresetId,
      })
    }
    setModal('new')
  }

  const createWork = (data: CreateWorkInput) => {
    const work: Work = {
      id: `w-${Date.now().toString(36)}`,
      title: data.title,
      synopsis: data.synopsis,
      theme: data.theme,
      genres: data.genres,
      outlineMode: data.outlineMode,
      writingMode: data.writingMode,
      perspective: data.perspective,
      characterCount: data.characterCount,
      targetWords: data.targetWords,
      creationSettings: data.creationSettings,
      promptIds: [],
      status: '草稿',
      chapters: 1,
      words: 0,
      updatedAt: Date.now(),
      coverIndex: Math.floor(Math.random() * 5),
    }
    const firstChapter = createChapter('第 1 章')
    const detail = createEmptyDetail()
    if (data.worldTemplateId) detail.worldTemplateId = data.worldTemplateId
    if (data.globalOutline) detail.globalOutline = data.globalOutline
    if (data.outline?.length) {
      detail.outline = data.outline.map((card, index) => ({
        ...card,
        chapterId: card.chapterId ?? (index === 0 ? firstChapter.id : undefined),
      }))
    }
    if (draft.stylePresetId) {
      detail.style = applyStylePreset(createEmptyStyle(), draft.stylePresetId)
    }
    if (data.characters?.length) detail.characters = data.characters
    if (data.factions?.length) detail.factions = data.factions
    if (data.relationships?.length) detail.relationships = data.relationships
    setWorks((prev) => [work, ...prev])
    setChaptersByWork((prev) => ({ ...prev, [work.id]: [firstChapter] }))
    setDetailsByWork((prev) => ({ ...prev, [work.id]: detail }))
    setActiveWorkId(work.id)
    setModal(null)
    setView('workspace')
    setToast(`《${work.title}》已创建 · 章节与详情工作区已就绪`)
  }

  const updateWork = (workId: string, patch: Partial<Work>) => {
    setWorks((prev) => prev.map((work) => (work.id === workId ? { ...work, ...patch } : work)))
  }

  const createPersonalNovelWork = (input: PersonalNovelCreateInput): Work => {
    const targetWords = input.chapterCount * input.wordsPerChapter
    const work: Work = {
      id: `w-personal-${Date.now().toString(36)}`,
      title: '未命名故事',
      synopsis: input.idea,
      theme: '',
      genres: [],
      outlineMode: 'fine',
      writingMode: 'director',
      perspective: 'third-limited',
      characterCount: 0,
      targetWords,
      promptIds: [],
      status: '草稿',
      chapters: 1,
      words: 0,
      updatedAt: Date.now(),
      coverIndex: Math.floor(Math.random() * 5),
      kind: 'personal',
      personalNovel: {
        status: 'setup',
        idea: input.idea,
        length: input.length,
        tone: input.tone,
        pov: input.pov,
        chapterCount: input.chapterCount,
        wordsPerChapter: input.wordsPerChapter,
        currentChapterIndex: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    }
    const firstChapter = createChapter('第 1 章')
    setWorks((prev) => [work, ...prev])
    setChaptersByWork((prev) => ({ ...prev, [work.id]: [firstChapter] }))
    setDetailsByWork((prev) => ({ ...prev, [work.id]: createEmptyDetail() }))
    setActiveWorkId(work.id)
    return work
  }

  const deleteWork = (work: Work) => {
    const deletedChats = characterChats.filter((session) => session.workId === work.id)
    const deletedMemories = characterMemories.filter((memory) => memory.workId === work.id)
    setTrash((prev) =>
      [
        createTrashEntry({
          work,
          chapters: chaptersByWork[work.id] ?? [],
          detail: detailsByWork[work.id],
          chats: deletedChats,
          memories: deletedMemories,
        }),
        ...prev,
      ].slice(0, MAX_TRASH_ENTRIES),
    )
    setWorks((prev) => prev.filter((item) => item.id !== work.id))
    setChaptersByWork((prev) => {
      if (!(work.id in prev)) return prev
      const next = { ...prev }
      delete next[work.id]
      return next
    })
    setDetailsByWork((prev) => {
      if (!(work.id in prev)) return prev
      const next = { ...prev }
      delete next[work.id]
      return next
    })
    if (deletedChats.length > 0) {
      setCharacterChats((prev) => prev.filter((session) => session.workId !== work.id))
    }
    if (deletedMemories.length > 0) {
      setCharacterMemories((prev) => prev.filter((memory) => memory.workId !== work.id))
    }
    if (activeWorkId === work.id) {
      setActiveWorkId(null)
      setView('home')
    }
    setToast(`《${work.title}》已移入最近删除`)
  }

  const deleteWorks = (worksToDelete: Work[]) => {
    if (worksToDelete.length === 0) return
    const ids = new Set(worksToDelete.map((work) => work.id))
    const chats = characterChats.filter((session) => ids.has(session.workId))
    const memories = characterMemories.filter((memory) => ids.has(memory.workId))
    const entries = worksToDelete.map((work) =>
      createTrashEntry({
        work,
        chapters: chaptersByWork[work.id] ?? [],
        detail: detailsByWork[work.id],
        chats: chats.filter((session) => session.workId === work.id),
        memories: memories.filter((memory) => memory.workId === work.id),
      }),
    )
    setTrash((prev) => [...entries, ...prev].slice(0, MAX_TRASH_ENTRIES))
    setWorks((prev) => prev.filter((work) => !ids.has(work.id)))
    setChaptersByWork((prev) => {
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })
    setDetailsByWork((prev) => {
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })
    if (chats.length > 0) {
      setCharacterChats((prev) => prev.filter((session) => !ids.has(session.workId)))
    }
    if (memories.length > 0) {
      setCharacterMemories((prev) => prev.filter((memory) => !ids.has(memory.workId)))
    }
    if (activeWorkId && ids.has(activeWorkId)) {
      setActiveWorkId(null)
      setView('home')
    }
    setToast(`已将 ${worksToDelete.length} 部作品移入最近删除`)
  }

  const restoreTrashEntry = (entry: TrashEntry) => {
    if (works.some((work) => work.id === entry.work.id)) {
      setToast('同 ID 的作品已经存在，无法恢复')
      return
    }
    setWorks((prev) => [entry.work, ...prev])
    setChaptersByWork((prev) => ({ ...prev, [entry.work.id]: entry.chapters }))
    setDetailsByWork((prev) => ({
      ...prev,
      [entry.work.id]: entry.detail ?? createEmptyDetail(),
    }))
    if (entry.chats.length > 0) {
      setCharacterChats((prev) => [...entry.chats, ...prev])
    }
    if (entry.memories.length > 0) {
      setCharacterMemories((prev) => [...entry.memories, ...prev])
    }
    setTrash((prev) => prev.filter((item) => item.id !== entry.id))
    setToast(`已恢复《${entry.work.title}》`)
  }

  const removeTrashEntry = (id: string) => {
    if (!window.confirm('彻底删除这条记录？此操作不可恢复。')) return
    setTrash((prev) => prev.filter((entry) => entry.id !== id))
    setToast('已彻底删除')
  }

  const clearTrash = () => {
    if (trash.length === 0) return
    if (!window.confirm(`彻底清空最近删除的 ${trash.length} 部作品？此操作不可恢复。`)) return
    setTrash([])
    setToast('最近删除已清空')
  }

  const finishImport = (novel: ImportedNovel) => {
    if (novel.chapters.length === 0) {
      setImportJob((prev) =>
        prev
          ? {
              ...prev,
              percent: 100,
              chapters: 0,
              words: 0,
              stage: '没有找到正文',
              error: '没有找到可导入的正文',
            }
          : null,
      )
      return
    }
    const now = Date.now()
    const workId = `w-import-${now.toString(36)}`
    const importedChapters = novel.chapters.map((chapter) =>
      createChapter(chapter.title, chapter.content, chapter.wordCount),
    )
    const words =
      novel.words ||
      importedChapters.reduce((sum, chapter) => sum + (chapter.wordCount ?? countWords(chapter.content)), 0)
    const work: Work = {
      id: workId,
      title: novel.title,
      synopsis: '从外部文件导入的草稿，可在简介中补充。',
      theme: '',
      genres: ['其他'] as Genre[],
      outlineMode: 'fine',
      perspective: 'third-limited',
      characterCount: 3,
      targetWords: Math.max(100000, words),
      promptIds: [],
      status: '草稿',
      chapters: importedChapters.length,
      words,
      updatedAt: now,
      coverIndex: works.length % 5,
    }
    setImportJob((prev) =>
      prev
        ? {
            ...prev,
            percent: 94,
            stage: '保存章节到本地…',
            chapters: importedChapters.length,
            words,
            error: undefined,
          }
        : null,
    )
    startTransition(() => {
      setWorks((prev) => [work, ...prev])
      setChaptersByWork((prev) => ({ ...prev, [workId]: importedChapters }))
      setDetailsByWork((prev) => ({ ...prev, [workId]: createEmptyDetail() }))
      setView('home')
    })
    window.setTimeout(() => {
      setImportJob(null)
      setPostImport({ work, novel })
    }, 80)
  }

  const importNovel = (file: File) => {
    importWorkerRef.current?.terminate()
    importWorkerRef.current = null
    setPendingImportStyle(null)
    setPostImport(null)
    setImportJob({
      fileName: file.name,
      fileSize: file.size,
      percent: 2,
      stage: '准备本地解析…',
    })

    const fallbackParse = async () => {
      try {
        const buffer = await file.arrayBuffer()
        const { text } = decodeNovelBuffer(buffer)
        const novel = parseImportedNovel(file.name, text, (progress) => {
          setImportJob((prev) => (prev ? { ...prev, ...progress } : prev))
        })
        finishImport(novel)
      } catch (error) {
        setImportJob((prev) =>
          prev
            ? {
                ...prev,
                percent: 100,
                stage: '导入失败',
                error: error instanceof Error ? error.message : '文件格式不正确',
              }
            : prev,
        )
      }
    }

    if (typeof Worker === 'undefined') {
      void fallbackParse()
      return
    }

    try {
      const worker = new Worker(new URL('./novelImport.worker.ts', import.meta.url), {
        type: 'module',
      })
      importWorkerRef.current = worker
      worker.onmessage = (event: MessageEvent<ImportWorkerMessage>) => {
        const message = event.data
        if (message.type === 'progress') {
          setImportJob((prev) =>
            prev
              ? {
                  ...prev,
                  percent: message.percent,
                  stage: message.stage,
                  chapters: message.chapters ?? prev.chapters,
                  words: message.words ?? prev.words,
                }
              : prev,
          )
          return
        }
        if (message.type === 'done') {
          worker.terminate()
          importWorkerRef.current = null
          finishImport(message.novel)
          return
        }
        if (message.type === 'error') {
          worker.terminate()
          importWorkerRef.current = null
          setImportJob((prev) =>
            prev
              ? {
                  ...prev,
                  percent: 100,
                  stage: '导入失败',
                  error: message.message,
                }
              : prev,
          )
        }
      }
      worker.onerror = () => {
        worker.terminate()
        importWorkerRef.current = null
        setImportJob((prev) =>
          prev
            ? {
                ...prev,
                percent: 100,
                stage: '导入失败',
                error: '后台解析失败，可以关闭后重试',
              }
            : prev,
        )
      }
      worker.postMessage({ file })
    } catch {
      void fallbackParse()
    }
  }

  const cancelImport = () => {
    importWorkerRef.current?.terminate()
    importWorkerRef.current = null
    setImportJob(null)
    setToast('已取消导入')
  }

  const importDroppedSkillPackage = async (file: File) => {
    try {
      const skills = await importSkillPackageFile(file)
      const current = loadCustomSkills()
      const imported = skills.map((skill, index) => ({
        ...skill,
        id: skill.id.startsWith('custom.')
          ? skill.id
          : `custom.drop-${Date.now().toString(36)}-${index}`,
        builtin: false,
      }))
      const merged = [
        ...current.filter((skill) => !imported.some((next) => next.id === skill.id)),
        ...imported,
      ]
      saveCustomSkills(merged)
      setToast(
        imported.length === 1
          ? `已导入技能包：${imported[0].name}`
          : `已导入 ${imported.length} 个技能`,
      )
    } catch (caught) {
      setToast(
        `技能包导入失败：${caught instanceof Error ? caught.message : '文件格式不对'}`,
      )
    }
  }

  const handleDroppedFile = (file: File) => {
    const lower = file.name.toLowerCase()
    const isNovel = /\.(txt|md|markdown)$/.test(lower)
    const isSkill = lower.endsWith('.zip')
    if (!isNovel && !isSkill) {
      setToast('只支持拖入 TXT / Markdown 小说，或 ZIP 技能包')
      return
    }
    if (isSkill) {
      void importDroppedSkillPackage(file)
      return
    }
    if (view === 'workspace') {
      setToast('小说导入请在书架操作；写作页只支持拖入 ZIP 技能包')
      return
    }
    setPendingDropNovel(file)
  }

  useEffect(() => {
    if (modal || pendingDropNovel) return
    let depth = 0
    const hasFiles = (event: DragEvent) => Boolean(event.dataTransfer?.types.includes('Files'))
    const reset = () => {
      depth = 0
      setDropActive(false)
    }
    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth += 1
      setDropActive(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDropActive(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      reset()
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length === 0) return
      if (files.length > 1) {
        setToast('一次只支持拖入一个文件')
        return
      }
      handleDroppedFile(files[0])
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragend', reset)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', reset)
    }
  }, [modal, pendingDropNovel, view])

  const updateDetail = (workId: string, patch: Partial<WorkDetail>) => {
    setDetailsByWork((prev) => {
      const current = prev[workId] ?? createEmptyDetail()
      return { ...prev, [workId]: { ...current, ...patch } }
    })
  }

  const updateChapter = (workId: string, chapterId: string, patch: Partial<Chapter>) => {
    setChaptersByWork((prev) => {
      const current = prev[workId] ?? []
      const list = current.map((chapter) => {
        if (chapter.id !== chapterId) return chapter
        const history =
          patch.content !== undefined && patch.content !== chapter.content
            ? [
                ...(chapter.history ?? []),
                {
                  id: `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
                  content: chapter.content,
                  updatedAt: chapter.updatedAt,
                },
              ].slice(-8)
            : chapter.history
        const wordCount =
          patch.content !== undefined ? countWords(patch.content) : chapter.wordCount
        return { ...chapter, ...patch, wordCount, updatedAt: Date.now(), history }
      })
      if (list.length === 0) return prev
      return { ...prev, [workId]: list }
    })
  }

  const insertIdeaIntoChapter = (workId: string, chapterId: string, text: string) => {
    const chapter = chaptersByWork[workId]?.find((item) => item.id === chapterId)
    if (!chapter) {
      setToast('没有找到目标章节')
      return
    }
    const current = chapter.content.trimEnd()
    const content = current ? `${current}\n\n${text.trim()}` : text.trim()
    updateChapter(workId, chapterId, { content })
    setToast('灵感已插入章节末尾')
  }

  const addChapter = (workId: string): string => {    const chapter = createChapter(`第 ${(chaptersByWork[workId]?.length ?? 0) + 1} 章`)
    setChaptersByWork((prev) => ({
      ...prev,
      [workId]: [...(prev[workId] ?? []), chapter],
    }))
    return chapter.id
  }

  const deleteChapter = (workId: string, chapterId: string) => {
    setChaptersByWork((prev) => {
      const list = (prev[workId] ?? []).filter((chapter) => chapter.id !== chapterId)
      if (list.length === 0) return prev
      return { ...prev, [workId]: list }
    })
  }

  const moveChapter = (workId: string, chapterId: string, direction: -1 | 1) => {
    setChaptersByWork((prev) => {
      const list = [...(prev[workId] ?? [])]
      const index = list.findIndex((chapter) => chapter.id === chapterId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= list.length) return prev
      const [item] = list.splice(index, 1)
      list.splice(target, 0, item)
      return { ...prev, [workId]: list }
    })
  }

  const changeAppearance = (patch: Partial<AppearanceSettings>) => {
    setAppearance((prev) => normalizeAppearance({ ...prev, ...patch }))
  }

  const uploadBackground = async (file: File) => {
    try {
      const image = await compressBackgroundImage(file)
      const record: BackgroundImageRecord = {
        id: `bg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || '自定义背景',
        data: image,
        createdAt: Date.now(),
      }
      setBackgroundImages((prev) => {
        if (prev.some((item) => item.data === image)) return prev
        return [record, ...prev].slice(0, 12)
      })
      setBackgroundImage(image)
      setAppearance((prev) =>
        normalizeAppearance({ ...prev, backgroundKind: 'image', backgroundPreset: 'none' }),
      )
      setToast('自定义背景已应用，并加入背景图库')
    } catch (error) {
      setToast(`背景图片处理失败：${error instanceof Error ? error.message : '请换一张图片'}`)
    }
  }

  const selectBackgroundImage = (record: BackgroundImageRecord) => {
    setBackgroundImage(record.data)
    setAppearance((prev) =>
      normalizeAppearance({ ...prev, backgroundKind: 'image', backgroundPreset: 'none' }),
    )
    setToast(`已切换到背景：${record.name}`)
  }

  const deleteBackgroundImage = (record: BackgroundImageRecord) => {
    setBackgroundImages((prev) => prev.filter((item) => item.id !== record.id))
    if (backgroundImage === record.data) {
      setBackgroundImage('')
      setAppearance((prev) =>
        normalizeAppearance({ ...prev, backgroundKind: 'preset', backgroundPreset: 'none' }),
      )
    }
    setToast(`已从图库删除：${record.name}`)
  }

  const removeBackground = () => {
    setBackgroundImage('')
    setAppearance((prev) =>
      normalizeAppearance({ ...prev, backgroundKind: 'preset', backgroundPreset: 'none' }),
    )
    setToast('已移除当前背景，图库中的图片仍保留')
  }

  const saveSettings = (profiles: AiProfilesConfig) => {
    setAiProfiles(profiles)
    setModal(null)
    const configured = (['general', 'writing', 'chat'] as AiProfileId[]).some((id) =>
      profileReady(profiles, id),
    )
    setToast(configured ? 'AI 配置已保存（本地）' : '已保存配置 · 尚未填写 API Key')
  }

  const clearSettings = () => {
    setAiProfiles(DEFAULT_AI_PROFILES)
    setToast('AI 配置已清除')
  }

  const changeModel = (model: string) => {
    setAiProfiles((prev) => ({
      ...prev,
      writing: { ...prev.writing, model },
    }))
    const label =
      model === 'deepseek-flash'
        ? 'V4.1 Flash'
        : model === 'deepseek-v4-pro'
          ? 'V4 Pro'
          : model
    setToast(`写作 AI：已切换到 ${label}`)
  }

  const changeChatModel = (model: string) => {
    setAiProfiles((prev) => ({
      ...prev,
      chat: { ...prev.chat, model },
    }))
    const label =
      model === 'deepseek-flash'
        ? 'V4.1 Flash'
        : model === 'deepseek-v4-pro'
          ? 'V4 Pro'
          : model
    setToast(`角色聊天 AI：已切换到 ${label}`)
  }

  const changeReasoning = (reasoningEffort: ReasoningEffort) => {
    setAiProfiles((prev) => ({
      ...prev,
      writing: { ...prev.writing, reasoningEffort },
    }))
    const label =
      reasoningEffort === 'fast'
        ? '快速'
        : reasoningEffort === 'balanced'
          ? '标准'
          : reasoningEffort === 'deep'
            ? '深度'
            : '自动'
    setToast(`写作 AI 推理等级：${label}`)
  }

  const savePrompt = (prompt: Prompt) => {
    setPrompts((prev) => {
      const exists = prev.some((item) => item.id === prompt.id)
      return exists
        ? prev.map((item) => (item.id === prompt.id ? prompt : item))
        : [prompt, ...prev]
    })
    setToast('提示词已保存')
  }

  const deletePrompt = (id: string) => {
    setPrompts((prev) => prev.filter((item) => item.id !== id))
    setWorks((prev) =>
      prev.map((work) =>
        work.promptIds.includes(id)
          ? { ...work, promptIds: work.promptIds.filter((promptId) => promptId !== id) }
          : work,
      ),
    )
    setToast('提示词已删除')
  }

  const toggleFavoritePrompt = (id: string) => {
    setPrompts((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, favorite: !item.favorite } : item,
      ),
    )
  }

  const importPrompts = (imported: Prompt[]) => {
    setPrompts((prev) => [...imported, ...prev])
  }

  const duplicatePrompt = (prompt: Prompt) => {    const now = Date.now()
    const copy: Prompt = {
      ...prompt,
      id: `p-${now.toString(36)}`,
      title: `${prompt.title} 副本`,
      favorite: false,
      createdAt: now,
      updatedAt: now,
    }
    setPrompts((prev) => {
      const index = prev.findIndex((item) => item.id === prompt.id)
      const next = [...prev]
      next.splice(index >= 0 ? index + 1 : 0, 0, copy)
      return next
    })
    setToast('提示词已复制')
  }

  const saveWorkPromptIds = (workId: string, promptIds: string[]) => {
    setWorks((prev) =>
      prev.map((work) => (work.id === workId ? { ...work, promptIds } : work)),
    )
  }

  const recordAiUsage = (entry: AiUsageEntry) => {
    const profile = entry.profile ?? 'writing'
    const api = profile === 'general' ? generalApiBase : profile === 'chat' ? chatApiBase : writingApiBase
    const effectivePrice = resolveWritingPrice(
      writingPricing.rules,
      api.provider,
      entry.model,
      entry.at,
    )
    let next = entry
    if (effectivePrice) {
      const cost = calculateUsageCost(
        entry,
        effectivePrice.inputPrice,
        effectivePrice.outputPrice,
        effectivePrice.cacheHitPrice,
        effectivePrice.cacheWritePrice,
        true,
      )
      next = {
        ...entry,
        ...(cost === undefined ? {} : { cost }),
        currency: 'CNY',
        peak: effectivePrice.offPeak,
        priceSource: effectivePrice.rule.id,
        priceConfidence: 'high',
        ...(cost === undefined ? { unpricedReason: 'no-price' } : { unpricedReason: undefined }),
      }
    } else if (entry.cost === undefined) {
      next = { ...entry, unpricedReason: 'no-price' }
    }
    setAiUsage((prev) => [next, ...prev].slice(0, 1000))
    setUsageDaily((prev) => addUsageToDaily(prev, next))
  }

  const applyImportedStyle = (
    work: Work,
    style: WorkStyle,
    createPrompt: boolean,
  ) => {
    setDetailsByWork((prev) => {
      const current = prev[work.id] ?? createEmptyDetail()
      return { ...prev, [work.id]: { ...current, style } }
    })
    if (createPrompt) {
      const now = Date.now()
      const prompt: Prompt = {
        id: `p-import-style-${now.toString(36)}`,
        title: importedStylePromptTitle(work.title),
        content: formatStyleCard(style),
        category: '文风',
        tags: ['导入', '文风'],
        favorite: false,
        createdAt: now,
        updatedAt: now,
      }
      setPrompts((prev) => [prompt, ...prev])
    }
    setPendingImportStyle(null)
    setToast(
      createPrompt
        ? '导入文风已应用到作品，并保存到提示词库'
        : '导入文风已应用到作品',
    )
  }

  const exportCharacterChats = () => {
    if (characterChats.length === 0 && characterMemories.length === 0) {
      setToast('还没有角色聊天数据')
      return
    }
    downloadTextFile(
      `shuoxi-character-chats-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          sessions: characterChats,
          memories: characterMemories,
        },
        null,
        2,
      ),
      'application/json;charset=utf-8',
    )
    setToast(`已导出 ${characterChats.length} 个会话 / ${characterMemories.length} 条记忆`)
  }

  const clearCharacterChats = () => {
    if (
      !window.confirm(
        '清空全部角色聊天和长期记忆？不会删除作品正文、角色卡或事件簿。此操作不可恢复。',
      )
    ) {
      return
    }
    setCharacterChats([])
    setCharacterMemories([])
    setToast('角色聊天与长期记忆已清空')
  }

  const insertChatDialogue = (workId: string, chapterId: string, text: string) => {
    const value = text.trim()
    if (!value) return
    snapshotNow('角色会客厅插入对白前')
    setChaptersByWork((prev) => {
      const list = prev[workId] ?? []
      if (!list.some((chapter) => chapter.id === chapterId)) return prev
      return {
        ...prev,
        [workId]: list.map((chapter) =>
          chapter.id === chapterId
            ? {
                ...chapter,
                content: `${chapter.content.trimEnd()}${chapter.content.trim() ? '\n\n' : ''}${value}`,
                updatedAt: Date.now(),
              }
            : chapter,
        ),
      }
    })
    setToast('对白草稿已插入正文')
  }

  const exportWorkPackage = (workId: string) => {
    const work = works.find((item) => item.id === workId)
    if (!work) return
    const chapters = chaptersByWork[workId] ?? []
    const detail = detailsByWork[workId] ?? createEmptyDetail()
    downloadTextFile(
      projectPackageFileName(work),
      createProjectPackage(work, chapters, detail),
      'application/json',
    )
    setToast('已导出项目包：' + work.title)
  }

  const importWorkPackage = async (file: File) => {
    try {
      const parsed = parseProjectPackage(await file.text())
      const work: Work = {
        ...parsed.work,
        id: 'w-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5),
        updatedAt: Date.now(),
      }
      setWorks((prev) => [work, ...prev])
      setChaptersByWork((prev) => ({ ...prev, [work.id]: parsed.chapters }))
      setDetailsByWork((prev) => ({ ...prev, [work.id]: parsed.detail }))
      setToast('已导入项目：' + (work.title || '未命名作品') + '（' + parsed.chapters.length + ' 章）')
    } catch (caught) {
      setToast('项目包导入失败：' + (caught instanceof Error ? caught.message : '文件格式不对'))
    }
  }
  const exportProjectBackup = () => {
    const backup = buildProjectBackup()
    downloadProjectBackup(backup)
    setLastBackupAt(Date.now())
    setToast('完整项目备份已导出（含聊天、外观与自定义色板；不含 API Key）')
  }

  const importProjectBackup = async (file: File) => {
    try {
      const text = await file.text()
      const backup = parseProjectBackup(text)
      const chatCount = backup.characterChats?.length ?? 0
      if (
        !window.confirm(
          `导入备份会替换当前 ${works.length} 部作品、${Object.keys(chaptersByWork).length} 组章节和全部设定。\n备份还包含 ${chatCount} 个角色聊天会话和外观设置；API Key 会保留当前值。\n\n继续吗？`,
        )
      ) {
        return
      }
      snapshotNow('导入项目备份前')
      applyProjectBackup(backup)
      setModal(null)
      setToast(`已从 ${backup.exportedAt.slice(0, 10)} 的备份恢复`)
    } catch (error) {
      setToast(`导入失败：${error instanceof Error ? error.message : '文件格式不正确'}`)
    }
  }

  const createManualSnapshot = () => {
    snapshotNow('手动本地快照')
    setToast('已创建本地快照，可在数据页恢复')
  }

  const restoreAutoSnapshot = (snapshot: AutoSnapshot) => {
    if (
      !window.confirm(
        `恢复 ${new Date(snapshot.createdAt).toLocaleString()} 的快照？\n\n当前数据会先自动保存为一份新快照。`,
      )
    ) {
      return
    }
    snapshotNow('恢复快照前')
    applyProjectBackup(snapshot.backup)
    setModal(null)
    setToast(`已恢复 ${snapshot.reason}`)
  }

  const removeAutoSnapshot = (id: string) => {
    if (!window.confirm('删除这份本地快照？')) return
    setAutoSnapshots((prev) => prev.filter((snapshot) => snapshot.id !== id))
    setToast('本地快照已删除')
  }

  if (!chaptersReady || !detailsReady) {
    return (
      <div className="app app-boot">
        <div className="app-boot-card">
          <span className="app-boot-mark">戏</span>
          <strong>正在加载本地作品</strong>
          <small>从 IndexedDB 读取章节与设定…</small>
        </div>
      </div>
    )
  }

  return (
    <div className={`app ${view === 'workspace' || view === 'personal' ? 'app-no-rail' : ''}`}>
      {dropActive ? (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-card">
            <strong>{view === 'workspace' ? '松开导入技能包' : '松开导入文件'}</strong>
            <p>
              {view === 'workspace'
                ? 'ZIP 技能包；小说请回书架导入'
                : 'TXT / Markdown 导入小说，ZIP 导入技能包'}
            </p>
          </div>
        </div>
      ) : null}
      {view !== 'workspace' && view !== 'personal' ? (
        <IconRail
          active={railActive}
          onNavigate={(section) => {
            setView(
              section === 'prompts'
                ? 'prompts'
                : section === 'chat'
                  ? 'chat'
                  : section === 'stats'
                    ? 'stats'
                    : section === 'ideas'
                      ? 'ideas'
                      : 'home',
            )
          }}
          onSearch={() => setSearchOpen(true)}
          onSettings={() => setModal('settings')}
        />
      ) : null}

      {view === 'personal' ? (
        <Suspense fallback={<div className="app-view-loading">正在加载看戏模式…</div>}>
          <PersonalNovelView
            works={works}
            chaptersByWork={chaptersByWork}
            detail={activeWork ? detailsByWork[activeWork.id] ?? null : null}
            initialWorkId={activeWorkId}
            generalApi={generalApi}
            generalApiReady={generalApiReady}
            writingApi={writingApi}
            writingApiReady={writingApiReady}
            onCreateWork={createPersonalNovelWork}
            onUpdateWork={updateWork}
            onUpdateChapter={(workId, chapterId, patch) =>
              updateChapter(workId, chapterId, patch)
            }
            onUpdateDetail={updateDetail}
            onAddChapter={(workId) => addChapter(workId)}
            onRecordUsage={recordAiUsage}
            onOpenSettings={() => setModal('settings')}
            onOpenWriter={() => setView('workspace')}
            typography={appearance.typography}
            onBack={() => setView('home')}
            onToast={setToast}
          />
        </Suspense>
      ) : view === 'workspace' && activeWork ? (
        <>
        <Suspense fallback={<div className="app-view-loading">正在加载写作台…</div>}>
          <Workspace
          key={activeWork.id}
          work={activeWork}
          detail={detailsByWork[activeWork.id] ?? createEmptyDetail()}
          chapters={chaptersByWork[activeWork.id] ?? []}
          prompts={prompts}
          api={writingApi}
          apiReady={writingApiReady}
          writingPricing={writingPricing}
          generalApi={generalApi}
          generalApiReady={generalApiReady}
          typography={appearance.typography}
          saveState={saveState}
          onRetrySave={retrySave}
          onBack={() => setView('home')}
          onUpdateWork={(patch) => updateWork(activeWork.id, patch)}
          onUpdateDetail={(patch) => updateDetail(activeWork.id, patch)}
          onUpdateChapter={(chapterId, patch) =>
            updateChapter(activeWork.id, chapterId, patch)
          }
          onAddChapter={() => addChapter(activeWork.id)}
          onDeleteChapter={(chapterId) => deleteChapter(activeWork.id, chapterId)}
          onMoveChapter={(chapterId, direction) => moveChapter(activeWork.id, chapterId, direction)}
          onSavePromptIds={(ids) => saveWorkPromptIds(activeWork.id, ids)}
          onModelChange={changeModel}
          onReasoningChange={changeReasoning}
          syncSettings={syncSettings}
          platformBalance={platformBalance}
          balanceLoading={balanceLoading}
          onRefreshBalance={() => void refreshPlatformBalance(true)}
          personalBridge={activeWork.kind === 'personal' ? personalBridge ?? undefined : undefined}
          onOpenSettings={() => setModal('settings')}
          onOpenGlobalSearch={() => setSearchOpen(true)}
          onOpenPromptLibrary={() => setView('prompts')}
          onToast={setToast}
          onRecordUsage={recordAiUsage}
          onSnapshot={(reason) => {
            snapshotNow(reason)
          }}
          onOpenBootstrap={() => setBootstrapWorkId(activeWork.id)}
        />
        </Suspense>
        {activeWork.kind === 'personal' ? (
          <div className="personal-novel-bridge" aria-hidden="true">
            <Suspense fallback={null}>
              <PersonalNovelView
                works={works}
                chaptersByWork={chaptersByWork}
                detail={detailsByWork[activeWork.id] ?? null}
                initialWorkId={activeWork.id}
                generalApi={generalApi}
                generalApiReady={generalApiReady}
                writingApi={writingApi}
                writingApiReady={writingApiReady}
                onCreateWork={createPersonalNovelWork}
                onUpdateWork={updateWork}
                onUpdateChapter={(workId, chapterId, patch) =>
                  updateChapter(workId, chapterId, patch)
                }
                onUpdateDetail={updateDetail}
                onAddChapter={(workId) => addChapter(workId)}
                onRecordUsage={recordAiUsage}
                onOpenSettings={() => setModal('settings')}
                onOpenWriter={() => setView('workspace')}
                typography={appearance.typography}
                onBack={() => setView('home')}
                onToast={setToast}
                onBridgeChange={setPersonalBridge}
              />
            </Suspense>
          </div>
        ) : null}
        </>
      ) : view === 'chat' ? (
        <Suspense fallback={<div className="app-view-loading">正在加载角色会客厅…</div>}>
          <CharacterChatView
          works={works}
          detailsByWork={detailsByWork}
          chaptersByWork={chaptersByWork}
          api={chatApi}
          apiReady={chatApiReady}
          onChatModelChange={changeChatModel}
          initialWorkId={activeWorkId}
          sessions={characterChats}
          setSessions={setCharacterChats}
          sessionsReady={characterChatsReady}
          memories={characterMemories}
          setMemories={setCharacterMemories}
          memoriesReady={characterMemoriesReady}
          settings={characterChatSettings}
          onChatSettingsChange={(next) => setCharacterChatSettings(next)}
          onBack={() => setView('home')}
          onOpenSettings={() => setModal('settings')}
          onRecordUsage={recordAiUsage}
          onInsertDialogue={insertChatDialogue}
          onUpdateDetailForWork={updateDetail}
          onToast={setToast}
        />
        </Suspense>
      ) : view === 'ideas' ? (
        <Suspense fallback={<div className="app-view-loading">正在加载灵感库…</div>}>
          <IdeasView
            ideas={ideas}
            works={works}
            chaptersByWork={chaptersByWork}
            initialWorkId={activeWorkId}
            onChange={setIdeas}
            onInsert={insertIdeaIntoChapter}
            onToast={setToast}
            onBack={() => setView('home')}
          />
        </Suspense>
      ) : view === 'prompts' ? (
        <Suspense fallback={<div className="app-view-loading">正在加载提示词库…</div>}>
          <PromptManagerView
            prompts={prompts}
            api={generalApi}
            apiReady={generalApiReady}
            onSavePrompt={savePrompt}
            onDeletePrompt={deletePrompt}
            onToggleFavorite={toggleFavoritePrompt}
            onDuplicatePrompt={duplicatePrompt}
            onImportPrompts={importPrompts}
            onRecordUsage={recordAiUsage}
            onToast={setToast}
          />
        </Suspense>
      ) : view === 'stats' ? (
        <Suspense fallback={<div className="app-view-loading">正在加载创作统计…</div>}>
          <StatsView
            works={works}
            chaptersByWork={chaptersByWork}
            detailsByWork={detailsByWork}
            usage={aiUsage}
            usageDaily={usageDaily}
            writingDaily={writingDaily}
            writingActivity={writingActivity}
            aiRequests={aiRequests}
            budget={statsBudget}
            onBudgetChange={setStatsBudget}
            onOpenWork={openWork}
            onBack={() => setView('home')}
          />
        </Suspense>
      ) : (
        <HomeView
          works={works}
          api={generalApi}
          onOpenWork={openWork}
          onOpenStats={() => setView('stats')}
          monthCost={monthCost(usageDaily)}
          streak={writingStreak(writingDaily)}
          currency={statsBudget.currency}
          balance={platformBalance}
          balanceLoading={balanceLoading}
          onRefreshBalance={() => void refreshPlatformBalance(true)}
          onNewWork={() => {
            setDraft({ synopsis: '', genres: [] })
            setModal('new')
          }}
          onOpenPersonalNovel={() => {
            setActiveWorkId(null)
            setView('personal')
          }}
          onImportNovel={(file) => void importNovel(file)}
          onImportProjectPackage={(file) => void importWorkPackage(file)}
          onExportProjectPackage={exportWorkPackage}
          onExportWork={(workId) => {
            const work = works.find((item) => item.id === workId)
            if (work) setExportWorkRequest(work)
          }}
          onDeleteWork={(work) => setDeleteRequest(work)}
          onExportWorks={(selectedWorks, format) =>
            batchExportWorks(selectedWorks, chaptersByWork, format)
          }
          onDeleteWorks={deleteWorks}
          onUpdateWork={(workId, patch) => updateWork(workId, patch)}
          onOpenChat={() => setView('chat')}
          onOpenPrompts={() => setView('prompts')}
          onOpenSettings={() => setModal('settings')}
          onToast={setToast}
          onStart={startFromComposer}
          homeLayout={appearance.homeLayout}
          onHomeLayoutChange={(homeLayout) => changeAppearance({ homeLayout })}
        />
      )}

      {modal === 'seed' && seedRequest ? (
        <Suspense fallback={null}>
          <StorySeedModal
            request={seedRequest}
            styleLabel={
              STYLE_PRESETS.find((preset) => preset.id === seedRequest.stylePresetId)?.name ?? ''
            }
            api={generalApi}
            apiReady={generalApiReady}
            onRecordUsage={recordAiUsage}
            onClose={() => setModal(null)}
            onConfirm={confirmStorySeed}
          />
        </Suspense>
      ) : null}

      {modal === 'new' ? (
        <Suspense fallback={null}>
          <NewWorkModal
            initialSynopsis={draft.synopsis}
            initialGenres={draft.genres}
            initialData={draft}
            api={generalApi}
            apiReady={generalApiReady}
            onRecordUsage={recordAiUsage}
            onClose={() => setModal(null)}
            onCreate={createWork}
            onSaveIdea={(data) => {
              const idea = createIdea({
                title: data.title,
                body: data.synopsis,
                tags: data.genres,
                source: 'manual',
              })
              setIdeas((prev) => [idea, ...prev])
              setModal(null)
              setView('ideas')
              setToast('已先存进灵感库')
            }}
          />
        </Suspense>
      ) : null}

      {modal === 'settings' ? (
        <Suspense fallback={null}>
          <SettingsModal
          profiles={aiProfiles}
          lastBackupAt={lastBackupAt}
          aiUsage={aiUsage}
          platformBalance={platformBalance}
          balanceLoading={balanceLoading}
          onRefreshBalance={() => void refreshPlatformBalance(true)}
          writingPricing={writingPricing}
          onWritingPricingChange={setWritingPricing}
          appearance={appearance}
          backgroundImage={backgroundImage}
          backgroundImages={backgroundImages}
          chatSettings={characterChatSettings}
          syncSettings={syncSettings}
          onSyncSettingsChange={setSyncSettings}
          chatSessionCount={characterChats.length}
          chatMemoryCount={characterMemories.length}
          onChatSettingsChange={(next) => setCharacterChatSettings(next)}
          onExportChats={exportCharacterChats}
          onClearChats={clearCharacterChats}
          onAppearanceChange={changeAppearance}
          onUploadBackground={uploadBackground}
          onRemoveBackground={removeBackground}
          onSelectBackgroundImage={selectBackgroundImage}
          onDeleteBackgroundImage={deleteBackgroundImage}
          onToast={setToast}
          onClearUsage={() => {
            setAiUsage([])
            setUsageDaily([])
            setAiRequests([])
          }}
          onClose={() => setModal(null)}
          onSave={saveSettings}
          onClear={clearSettings}
          onExportBackup={exportProjectBackup}
          onImportBackup={(file) => void importProjectBackup(file)}
          autoSnapshots={autoSnapshots}
          onCreateSnapshot={createManualSnapshot}
          onRestoreSnapshot={restoreAutoSnapshot}
          onRemoveSnapshot={removeAutoSnapshot}
          trash={trash}
          onRestoreTrash={restoreTrashEntry}
          onRemoveTrash={removeTrashEntry}
          onClearTrash={clearTrash}
        />
        </Suspense>
      ) : null}

      {searchOpen ? (
        <Suspense fallback={null}>
          <CommandPalette
            works={works}
            chaptersByWork={chaptersByWork}
            detailsByWork={detailsByWork}
            onOpenWork={(id) => {
              openWork(id)
              setSearchOpen(false)
            }}
            onOpenPrompts={() => {
              setView('prompts')
              setSearchOpen(false)
            }}
            onClose={() => setSearchOpen(false)}
          />
        </Suspense>
      ) : null}

      {importJob ? <ImportProgress job={importJob} onCancel={cancelImport} /> : null}

      {exportWorkRequest ? (
        <ExportNovelModal
          work={exportWorkRequest}
          chapters={chaptersByWork[exportWorkRequest.id] ?? []}
          detail={detailsByWork[exportWorkRequest.id] ?? createEmptyDetail()}
          onClose={() => setExportWorkRequest(null)}
          onToast={setToast}
        />
      ) : null}

      {pendingDropNovel ? (
        <ConfirmModal
          title="导入小说"
          confirmLabel="开始导入"
          message={
            <>
              <p>
                拖入文件：<strong>{pendingDropNovel.name}</strong>
              </p>
              <p>
                文件大小约 {Math.max(1, Math.round(pendingDropNovel.size / 1024))} KB。
                将作为新作品导入，不会覆盖现有作品。
              </p>
              <p>大文件会在后台解析，导入期间可以继续使用书架，但不要关闭软件。</p>
            </>
          }
          onConfirm={() => {
            const file = pendingDropNovel
            setPendingDropNovel(null)
            void importNovel(file)
          }}
          onClose={() => setPendingDropNovel(null)}
        />
      ) : null}

      {deleteRequest && deleteWorkSummary ? (
        <ConfirmModal
          title="删除作品"
          danger
          confirmLabel="移入最近删除"
          message={
            <>
              <p>
                确定删除《{deleteRequest.title}》？
              </p>
              <div className="confirm-detail-list">
                正文 {deleteWorkSummary.chapters} 章 · 约 {deleteRequest.words.toLocaleString()} 字
                {' · '}作品设定与模块数据
                {deleteWorkSummary.chats > 0 ? ` · 角色聊天 ${deleteWorkSummary.chats} 个会话` : ''}
                {deleteWorkSummary.memories > 0 ? ` · 长期记忆 ${deleteWorkSummary.memories} 条` : ''}
              </div>
              <p>删除后会移入「最近删除」，可以在设置 → 数据中恢复。建议先导出重要作品的备份。</p>
            </>
          }
          onConfirm={() => {
            deleteWork(deleteRequest)
            setDeleteRequest(null)
          }}
          onClose={() => setDeleteRequest(null)}
        />
      ) : null}

      {postImport && view === 'home' ? (
        <div className="post-import-card">
          <strong>《{postImport.work.title}》导入完成</strong>
          <p>
            {postImport.novel.chapters.length} 章 · {postImport.novel.words.toLocaleString()} 字。
            可以提取文风、建立作品档案，或者直接开始写作。
          </p>
          <div className="post-import-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setPendingImportStyle(postImport)
                setPostImport(null)
              }}
            >
              提取文风
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setBootstrapWorkId(postImport.work.id)
                setPostImport(null)
              }}
            >
              快速建档
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setActiveWorkId(postImport.work.id)
                setView('workspace')
                setPostImport(null)
              }}
            >
              直接写作
            </button>
          </div>
        </div>
      ) : null}

      {bootstrapWork ? (
        <BootstrapModal
          work={bootstrapWork}
          detail={detailsByWork[bootstrapWork.id] ?? createEmptyDetail()}
          chapters={chaptersByWork[bootstrapWork.id] ?? []}
          api={generalApi}
          apiReady={generalApiReady}
          onUpdateDetail={(next) => updateDetail(bootstrapWork.id, next)}
          onSnapshot={snapshotNow}
          onRecordUsage={recordAiUsage}
          onToast={setToast}
          onClose={() => setBootstrapWorkId(null)}
        />
      ) : null}

      {pendingImportStyle ? (
        <ImportStyleModal
          work={pendingImportStyle.work}
          novel={pendingImportStyle.novel}
          api={generalApi}
          apiReady={generalApiReady}
          onRecordUsage={recordAiUsage}
          onOpenSettings={() => setModal('settings')}
          onToast={setToast}
          onApply={(style, createPrompt) =>
            applyImportedStyle(pendingImportStyle.work, style, createPrompt)
          }
          onClose={() => setPendingImportStyle(null)}
        />
      ) : null}

      {toast ? (
        <div className={`toast ${view === 'workspace' ? 'toast-raised' : ''}`} role="status">
          <span className="toast-icon">
            <IconCheck size={13} />
          </span>
          {toast}
        </div>
      ) : null}
    </div>
  )
}
