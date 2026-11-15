import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  Chapter,
  FactionCard,
  PersonalNovelCreateInput,
  PersonalNovelLength,
  PersonalNovelState,
  PersonalNovelSyncJob,
  TypographySettings,
  Work,
  WorkDetail,
} from '../types'
import { runApiTask } from '../aiTask'
import type { ChatUsage } from '../ai'
import { buildFastScopedStateUpdateMessages, buildScopedStateUpdateMessages } from '../ai'
import { applyStoryStateUpdate, parseStoryStateUpdate } from '../storyState'
import { buildPersonalNovelChapterBrief } from '../personalChapterBrief'
import { preparePersonalChapterContent } from '../personalChapterQuality'
import { harmonizeNarrationAddresses, auditDialogueAddressPermissions, applyNarrationAddressFixes } from '../characterAddress'
import {
  completeCharacterFullArchive,
  completeEntityArchive,
  needsArchiveCompletion,
} from '../entityArchive'
import { countWords, estimateTokens } from '../utils'
import {
  PERSONAL_NOVEL_CHAPTER_COUNT_OPTIONS,
  PERSONAL_NOVEL_LENGTH_OPTIONS,
  PERSONAL_NOVEL_POV_OPTIONS,
  PERSONAL_NOVEL_TONE_OPTIONS,
  PERSONAL_NOVEL_WORD_OPTIONS,
  buildPersonalNovelChapterMessages,
  buildPersonalNovelPlanMessages,
  buildNextPersonalNovelChapterPlanMessages,
  parseNextPersonalNovelChapterPlan,
  parsePersonalNovelPlan,
} from '../personalNovel'
import { IconArrowLeft, IconArrowRight, IconSparkles } from './Icons'
import { Modal } from './Modal'
import { PersonalNovelPlanEditor } from './PersonalNovelPlanEditor'
import { PersonalAddressReview } from './PersonalAddressReview'
import type { PersonalNovelBridge } from '../personalNovelBridge'

type PersonalSyncJob = PersonalNovelSyncJob

const WorkDetailDrawer = lazy(() =>
  import('./WorkDetailDrawer').then((module) => ({ default: module.WorkDetailDrawer })),
)

interface PersonalNovelViewProps {
  works: Work[]
  chaptersByWork: Record<string, Chapter[]>
  detail: WorkDetail | null
  initialWorkId: string | null
  generalApi: ApiConfig
  generalApiReady: boolean
  writingApi: ApiConfig
  writingApiReady: boolean
  onCreateWork: (input: PersonalNovelCreateInput) => Work
  onUpdateWork: (workId: string, patch: Partial<Work>) => void
  onUpdateChapter: (workId: string, chapterId: string, patch: Partial<Chapter>) => void
  onUpdateDetail: (workId: string, patch: Partial<WorkDetail>) => void
  onAddChapter: (workId: string) => string
  onRecordUsage?: (entry: AiUsageEntry) => AiUsageEntry | void
  onOpenSettings: () => void
  onOpenWriter: () => void
  typography?: TypographySettings
  onBack: () => void
  onToast: (message: string) => void
  onBridgeChange?: (bridge: PersonalNovelBridge) => void
}

const TONE_EXAMPLES = [
  '暴雨夜，我在便利店遇到十年前死掉的人。',
  '一个被宗门抛弃的废柴，靠一只会说话的猫翻盘。',
  '和离后，前夫每天来我坟前哭。',
  '我写的反派活过来了，第一件事是来找我算账。',
]

export function PersonalNovelView({
  works,
  chaptersByWork,
  detail,
  initialWorkId,
  generalApi,
  generalApiReady,
  writingApi,
  writingApiReady,
  onCreateWork,
  onUpdateWork,
  onUpdateChapter,
  onUpdateDetail,
  onAddChapter,
  onRecordUsage,
  onOpenSettings,
  onOpenWriter,
  onBack,
  onToast,
  onBridgeChange,
}: PersonalNovelViewProps) {
  const [createdWorkId, setCreatedWorkId] = useState<string | null>(null)
  const [busy, setBusy] = useState<'plan' | 'chapter' | ''>('')
  const [batchRunning, setBatchRunning] = useState(false)
  const [error, setError] = useState('')
  const [activeChapter, setActiveChapter] = useState(0)
  const [idea, setIdea] = useState('')
  const [length, setLength] = useState<PersonalNovelLength>('short')
  const [tone, setTone] = useState<string>('悬疑')
  const [pov, setPov] = useState<string>('第三人称')
  const [chapterCount, setChapterCount] = useState(5)
  const [wordsPerChapter, setWordsPerChapter] = useState(2888)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [planEditorOpen, setPlanEditorOpen] = useState(false)
  const [addressReviewOpen, setAddressReviewOpen] = useState(false)
  const [syncJobs, setSyncJobs] = useState<PersonalSyncJob[]>([])
  const [sessionCost, setSessionCost] = useState(0)
  const [syncQueueOpen, setSyncQueueOpen] = useState(false)
  const batchAbortRef = useRef(false)
  const chaptersRef = useRef<Chapter[]>([])
  const detailRef = useRef<WorkDetail | null>(detail)
  const followBatchRef = useRef(true)
  const syncJobsRef = useRef<PersonalSyncJob[]>([])
  const syncRunningRef = useRef(false)

  const workId = initialWorkId ?? createdWorkId
  const work = works.find((item) => item.id === workId) ?? null
  const personal = work?.personalNovel
  const plan = personal?.plan
  const planRef = useRef(plan)
  planRef.current = plan
  const chapters = work ? chaptersByWork[work.id] ?? [] : []
  const hasContent = chapters.some((chapter) => chapter.content.trim().length > 0)
  const syncRunning = syncJobs.some(
    (job) => job.status === 'queued' || job.status === 'running',
  )
  const syncFailed = syncJobs.some((job) => job.status === 'error')
  const syncDone = syncJobs.filter((job) => job.status === 'done').length
  const syncTotal = syncJobs.length

  useEffect(() => {
    chaptersRef.current = chapters
  }, [chapters])

  useEffect(() => {
    detailRef.current = detail
  }, [detail])

  useEffect(() => {
    if (!workId || syncJobsRef.current.length > 0) return
    const stored = work?.syncJobs
    if (!stored?.length) return
    const normalized = stored.map((job) =>
      job.status === 'running' ? { ...job, status: 'queued' as const } : job,
    )
    setSyncJobsSafe(normalized)
    if (normalized.some((job) => job.status === 'queued')) {
      void pumpSyncQueue()
    }
  }, [workId, work?.syncJobs]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!workId) return
    const next = works.find((item) => item.id === workId)
    const state = next?.personalNovel
    if (!state) return
    setIdea(state.idea)
    setLength(state.length)
    setTone(state.tone)
    setPov(state.pov)
    setChapterCount(state.chapterCount ?? state.plan?.chapters.length ?? 5)
    setWordsPerChapter(state.wordsPerChapter ?? 1500)
    setActiveChapter(Math.max(0, (state.currentChapterIndex || 1) - 1))
  }, [workId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasContent) return
    setActiveChapter((current) => Math.max(0, Math.min(current, chapters.length - 1)))
  }, [chapters.length, hasContent])

  const generatedCount = useMemo(
    () => chapters.filter((chapter) => chapter.content.trim()).length,
    [chapters],
  )

  const updatePersonal = (patch: Partial<PersonalNovelState>) => {
    if (!workId) return
    const current = work?.personalNovel
    const next: PersonalNovelState = {
      status: 'setup',
      idea: current?.idea ?? idea,
      length: current?.length ?? length,
      tone: current?.tone ?? tone,
      pov: current?.pov ?? pov,
      chapterCount: current?.chapterCount ?? chapterCount,
      wordsPerChapter: current?.wordsPerChapter ?? wordsPerChapter,
      currentChapterIndex: current?.currentChapterIndex ?? 0,
      createdAt: current?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      ...current,
      ...patch,
    }
    onUpdateWork(workId, { personalNovel: next, updatedAt: Date.now() })
  }

  const recordUsage = (
    kind: '项目生成' | '续写',
    profile: 'general' | 'writing',
    api: ApiConfig,
    input: string,
    output: string,
    usage?: ChatUsage,
  ) => {
    if (!onRecordUsage) return
    const recorded = onRecordUsage({
      id: `usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      at: Date.now(),
      kind,
      profile,
      model: api.model,
      inputTokens: usage?.inputTokens ?? estimateTokens(input),
      outputTokens: usage?.outputTokens ?? estimateTokens(output),
      actual: Boolean(usage),
    })
    if (recorded && typeof recorded === 'object' && recorded.cost) {
      setSessionCost((current) => current + (recorded.cost ?? 0))
    }
  }

  const applyPlanToDetail = (targetWorkId: string, nextPlan: NonNullable<PersonalNovelState['plan']>) => {
    const current = detailRef.current
    const existingChapters = chaptersRef.current
    const palette = ['#b98a52', '#5f8ea3', '#8a6f9b', '#6f9b71', '#a36f6f', '#7d7fa8']
    const realmScheme =
      nextPlan.realmLevels && nextPlan.realmLevels.length >= 3
        ? {
            id: `realm-personal-${targetWorkId}`,
            name: nextPlan.realmSchemeName || '境界',
            levels: nextPlan.realmLevels.map((name, index) => ({
              id: `realm-level-${targetWorkId}-${index + 1}`,
              name,
              color: palette[index % palette.length],
            })),
          }
        : undefined
    const factionTierScheme =
      nextPlan.factionTierLevels && nextPlan.factionTierLevels.length >= 3
        ? {
            id: `faction-tier-personal-${targetWorkId}`,
            name: nextPlan.factionTierName || '势力层级',
            levels: nextPlan.factionTierLevels.map((name, index) => ({
              id: `faction-tier-level-${targetWorkId}-${index + 1}`,
              name,
              color: palette[(index + 2) % palette.length],
            })),
          }
        : undefined
    const characters = nextPlan.characters.map((character, index) => ({
      id: `c-personal-${targetWorkId}-${index + 1}`,
      name: character.name,
      role: character.role,
      identity: character.role,
      personality: '',
      goal: character.goal,
      lifecycle: '未上线' as const,
      realmSchemeId: realmScheme?.id,
      realmLevel: realmScheme ? 1 : undefined,
      addressTimeline: character.hiddenName
        ? [
            {
              id: `address-phase-${targetWorkId}-${index + 1}-public`,
              label: '公开身份',
              name: character.name,
              fromChapterIndex: 0,
            },
            {
              id: `address-phase-${targetWorkId}-${index + 1}-reveal`,
              label: '真实身份',
              name: character.hiddenName,
              fromChapterIndex: Math.max(0, (character.revealChapter ?? 1) - 1),
            },
          ]
        : undefined,
    }))
    const factions = (nextPlan.factions ?? []).map((faction, index) => ({
      id: `f-personal-${targetWorkId}-${index + 1}`,
      name: faction.name,
      type: faction.type,
      leader: '',
      goal: faction.goal,
      description: '',
      lifecycle: '未上线' as const,
      tierLevel: factionTierScheme ? 1 : undefined,
      archiveStatus: 'placeholder' as const,
    }))
    const outline = nextPlan.chapters.map((chapter, index) => ({
      id: `oc-personal-${targetWorkId}-${index + 1}`,
      title: chapter.title,
      summary: chapter.goal,
      goal: chapter.goal,
      conflict: chapter.conflict,
      status: '待写' as const,
      targetWords: wordsPerChapter,
      chapterId: existingChapters[index]?.id,
    }))
    const patch: Partial<WorkDetail> = {
      characters,
      factions,
      outline,
      realmSchemes: realmScheme ? [realmScheme] : current?.realmSchemes,
      activeRealmSchemeId: realmScheme ? realmScheme.id : current?.activeRealmSchemeId,
      tierSchemes: factionTierScheme ? [factionTierScheme] : current?.tierSchemes,
      factionTierSchemeId: factionTierScheme
        ? factionTierScheme.id
        : current?.factionTierSchemeId,
      globalOutline: {
        premise: nextPlan.logline,
        theme: '',
        conflict: nextPlan.chapters[0]?.conflict ?? '',
        structure: `${nextPlan.chapters.length} 章`,
        arcs: [
          {
            id: `arc-personal-${targetWorkId}`,
            title: nextPlan.title,
            goal: nextPlan.logline,
            keyEvents: nextPlan.chapters.map((chapter) => chapter.title).join(' / '),
            endState: nextPlan.chapters[nextPlan.chapters.length - 1]?.hook ?? '',
          },
        ],
        turningPoints: '',
        ending: nextPlan.chapters[nextPlan.chapters.length - 1]?.hook ?? '',
        mustResolve: '',
        rules: '',
        notes: nextPlan.synopsis,
      },
    }
    if (current) detailRef.current = { ...current, ...patch }
    onUpdateDetail(targetWorkId, patch)
  }

  const saveEditedPlan = (nextPlan: NonNullable<PersonalNovelState['plan']>) => {
    if (!workId) return
    const current = work?.personalNovel
    if (!current) return
    applyPlanToDetail(workId, nextPlan)
    onUpdateWork(workId, {
      personalNovel: {
        ...current,
        plan: nextPlan,
        chapterCount: nextPlan.chapters.length,
        wordsPerChapter,
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    })
    setChapterCount(nextPlan.chapters.length)
    setPlanEditorOpen(false)
    onToast('故事方案已更新')
  }

  const generatePlan = async (targetWorkId: string) => {
    if (!generalApiReady) {
      setError('请先在设置里配置通用 AI。')
      return
    }
    setBusy('plan')
    setError('')
    updatePersonal({ status: 'planning', error: undefined })
    try {
      const messages = buildPersonalNovelPlanMessages({
        idea,
        length,
        tone,
        pov,
        chapterCount,
        targetWords: wordsPerChapter,
      })
      let usage: ChatUsage | undefined
      const raw = await runApiTask(generalApi, {
        task: 'analysis.plan',
        messages,
        maxTokens: 4000,
        onUsage: (next) => {
          usage = next
        },
      })
      const nextPlan = parsePersonalNovelPlan(raw)
      if (!nextPlan) throw new Error('故事方案解析失败，请重试。')
      onUpdateWork(targetWorkId, {
        title: nextPlan.title,
        synopsis: nextPlan.logline,
        personalNovel: {
          status: 'plan_ready',
          idea,
          length,
          tone,
          pov,
          chapterCount,
          wordsPerChapter,
          plan: nextPlan,
          currentChapterIndex: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      })
      applyPlanToDetail(targetWorkId, nextPlan)
      recordUsage('项目生成', 'general', generalApi, messages.map((m) => m.content).join('\n'), raw, usage)
      onToast('故事方案已生成')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '故事方案生成失败'
      setError(message)
      updatePersonal({ status: 'error', error: message })
    } finally {
      setBusy('')
    }
  }

  const startStory = async () => {
    if (!idea.trim() || idea.trim().length < 4) {
      setError('先用一句话说清你想看的故事。')
      return
    }
    setError('')
    const created = onCreateWork({
      idea: idea.trim(),
      length,
      tone,
      pov,
      chapterCount,
      wordsPerChapter,
    })
    setCreatedWorkId(created.id)
    setBusy('plan')
    try {
      const messages = buildPersonalNovelPlanMessages({
        idea: idea.trim(),
        length,
        tone,
        pov,
        chapterCount,
        targetWords: wordsPerChapter,
      })
      let usage: ChatUsage | undefined
      const raw = await runApiTask(generalApi, {
        task: 'analysis.plan',
        messages,
        maxTokens: 4000,
        onUsage: (next) => {
          usage = next
        },
      })
      const nextPlan = parsePersonalNovelPlan(raw)
      if (!nextPlan) throw new Error('故事方案解析失败，请重试。')
      onUpdateWork(created.id, {
        title: nextPlan.title,
        synopsis: nextPlan.logline,
        personalNovel: {
          status: 'plan_ready',
          idea: idea.trim(),
          length,
          tone,
          pov,
          chapterCount,
          wordsPerChapter,
          plan: nextPlan,
          currentChapterIndex: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      })
      applyPlanToDetail(created.id, nextPlan)
      recordUsage('项目生成', 'general', generalApi, messages.map((m) => m.content).join('\n'), raw, usage)
      onToast('故事方案已生成')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '故事方案生成失败'
      setError(message)
      onUpdateWork(created.id, {
        personalNovel: {
          status: 'error',
          idea: idea.trim(),
          length,
          tone,
          pov,
          chapterCount,
          wordsPerChapter,
          currentChapterIndex: 0,
          error: message,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      })
    } finally {
      setBusy('')
    }
  }

  const setSyncJobsSafe = (next: PersonalSyncJob[]) => {
    syncJobsRef.current = next
    setSyncJobs(next)
    if (workId) onUpdateWork(workId, { syncJobs: next })
  }

  const enqueueSyncJob = (job: PersonalSyncJob) => {
    const duplicate = syncJobsRef.current.some(
      (item) =>
        item.id === job.id ||
        (item.chapterId === job.chapterId &&
          item.type === job.type &&
          (item.status === 'queued' || item.status === 'running')),
    )
    if (duplicate) return
    setSyncJobsSafe([...syncJobsRef.current, job])
    void pumpSyncQueue()
  }

  const markEntityLifecycles = (current: WorkDetail, text: string): WorkDetail => ({
    ...current,
    characters: current.characters.map((character) =>
      text.includes(character.name) ? { ...character, lifecycle: '已上线' as const } : character,
    ),
    factions: (current.factions ?? []).map((faction) =>
      text.includes(faction.name) ? { ...faction, lifecycle: '已上线' as const } : faction,
    ),
  })

  const executeSyncJob = async (job: PersonalSyncJob) => {
    if (!generalApiReady) throw new Error('通用 AI 未配置')
    const current = detailRef.current
    const currentWork = work
    const chapter = chaptersRef.current.find((item) => item.id === job.chapterId)
    if (!current || !currentWork || !chapter) throw new Error('找不到要同步的章节')
    const content = chapter.content
    if (!content.trim()) throw new Error('章节正文为空')
    const messages =
      job.type === 'deep'
        ? buildScopedStateUpdateMessages({
            work: currentWork,
            detail: current,
            chapter,
            chapters: chaptersRef.current,
            content,
          })
        : buildFastScopedStateUpdateMessages({
            work: currentWork,
            detail: current,
            chapter,
            chapters: chaptersRef.current,
            content,
          })
    const raw = await runApiTask(generalApi, {
      task: job.type === 'deep' ? 'sync.deep' : 'sync.fast',
      messages,
      maxTokens: job.type === 'deep' ? 6000 : 5000,
    })
    const parsed = parseStoryStateUpdate(raw)
    if (!parsed) throw new Error('同步结果解析失败')
    const applied = applyStoryStateUpdate(current, parsed, chapter.id, chapter.title)
    let nextDetail = markEntityLifecycles(applied.detail, content)
    if (job.type === 'deep') {
      const targetCharacter = nextDetail.characters.find(
        (character) =>
          character.lifecycle === '已上线' && needsArchiveCompletion('character', character),
      )
      if (targetCharacter) {
        try {
          const patch = await completeCharacterFullArchive({
            work: currentWork,
            detail: nextDetail,
            character: targetCharacter,
            api: generalApi,
          })
          nextDetail = {
            ...nextDetail,
            characters: nextDetail.characters.map((character) =>
              character.id === targetCharacter.id
                ? { ...character, ...patch, archiveStatus: 'complete' as const }
                : character,
            ),
          }
        } catch {
          // 深度档案补全失败不影响本章同步。
        }
      }
      const targetFaction = (nextDetail.factions ?? []).find((faction) =>
        needsArchiveCompletion('faction', faction),
      )
      if (targetFaction) {
        try {
          const patch = await completeEntityArchive({
            kind: 'faction',
            work: currentWork,
            detail: nextDetail,
            entity: targetFaction,
            api: generalApi,
          })
          nextDetail = {
            ...nextDetail,
            factions: (nextDetail.factions ?? []).map((faction) =>
              faction.id === targetFaction.id
                ? { ...faction, ...(patch as Partial<FactionCard>), archiveStatus: 'complete' as const }
                : faction,
            ),
          }
        } catch {
          // 势力档案补全失败不影响本章同步。
        }
      }
    }
    detailRef.current = nextDetail
    onUpdateDetail(currentWork.id, nextDetail)
    if (parsed.summary?.trim()) {
      onUpdateChapter(currentWork.id, chapter.id, {
        summary: parsed.summary.trim().slice(0, 500),
        summarySource: 'ai',
      })
    }
  }

  async function pumpSyncQueue() {
    if (syncRunningRef.current) return
    syncRunningRef.current = true
    try {
      while (true) {
        const job = syncJobsRef.current.find((item) => item.status === 'queued')
        if (!job) break
        setSyncJobsSafe(
          syncJobsRef.current.map((item) =>
            item.id === job.id ? { ...item, status: 'running', startedAt: Date.now() } : item,
          ),
        )
        try {
          await executeSyncJob(job)
          setSyncJobsSafe(
            syncJobsRef.current.map((item) =>
              item.id === job.id ? { ...item, status: 'done', finishedAt: Date.now() } : item,
            ),
          )
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : '同步失败'
          setSyncJobsSafe(
            syncJobsRef.current.map((item) =>
              item.id === job.id
                ? { ...item, status: 'error', error: message, finishedAt: Date.now() }
                : item,
            ),
          )
        }
      }
    } finally {
      syncRunningRef.current = false
    }
  }

  const queueChapterSync = (chapter: Chapter, type: 'fast' | 'deep') => {
    enqueueSyncJob({
      id: type + '-' + chapter.id + '-' + Date.now(),
      type,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      status: 'queued',
    })
  }

  const generateChapterContent = async (
    index: number,
    prior: Chapter[],
    planOverride?: PersonalNovelState['plan'],
  ): Promise<{ chapterId: string; content: string } | null> => {
    const activePlan = planOverride ?? plan
    if (!workId || !activePlan || !writingApiReady) {
      throw new Error('请先在设置里配置写作 AI。')
    }
    const chapterPlan = activePlan.chapters[index]
    if (!chapterPlan) throw new Error('章节计划不存在。')
    const existing = prior[index]
    const messages = buildPersonalNovelChapterMessages({
      plan: activePlan,
      chapterIndex: index,
      previousChapters: prior.slice(0, index),
      targetWords: wordsPerChapter,
      brief: detailRef.current
        ? buildPersonalNovelChapterBrief({
            plan: activePlan,
            detail: detailRef.current,
            chapters: prior,
            chapterIndex: index,
            targetWords: wordsPerChapter,
          })
        : '',
    })
    let usage: ChatUsage | undefined
    const raw = await runApiTask(writingApi, {
      task: 'writing.continue',
      messages,
      maxTokens: Math.min(8000, Math.max(1800, wordsPerChapter * 2)),
      temperature: 0.88,
      onUsage: (next) => {
        usage = next
      },
    })
    const prepared = await preparePersonalChapterContent({
      text: raw,
      messages,
      targetWords: wordsPerChapter,
      writingApi,
      chapterTitle: chapterPlan.title,
      chapterNumber: index + 1,
    })
    const addressResult = detailRef.current
      ? harmonizeNarrationAddresses({
          text: prepared.content,
          detail: detailRef.current,
          chapterIndex: index,
        })
      : { text: prepared.content, fixes: [], unresolved: [] }
    const content = prepared.content
    const relationWarnings = detailRef.current
      ? auditDialogueAddressPermissions({
          text: content,
          detail: detailRef.current,
        })
      : []
    const qualityIssues = [
      ...prepared.quality.issues,
      ...addressResult.unresolved,
      ...relationWarnings,
    ]
    if (prepared.retryUsage && prepared.retryMessages) {
      recordUsage(
        '续写',
        'writing',
        writingApi,
        prepared.retryMessages.map((message) => message.content).join('\n'),
        content,
        prepared.retryUsage,
      )
    }
    if (!content || countWords(content) < 300) {
      throw new Error('生成的正文太短，请重试。')
    }
    const chapterId = existing?.id ?? onAddChapter(workId)
    const nextChapters = [...prior]
    nextChapters[index] = {
      ...(existing ?? { id: chapterId, title: chapterPlan.title, updatedAt: Date.now() }),
      title: chapterPlan.title,
      content,
      wordCount: countWords(content),
      status: 'done',
      stage: 'done',
      completedAt: Date.now(),
      summary: content.slice(0, 100),
      qualityIssues,
      qualityScore: Math.max(0, 100 - qualityIssues.length * 20),
      addressSuggestions: addressResult.fixes.length ? addressResult.fixes : undefined,
      addressOriginalContent: addressResult.fixes.length ? content : undefined,
      updatedAt: Date.now(),
    }
    chaptersRef.current = nextChapters
    onUpdateChapter(workId, chapterId, {
      title: chapterPlan.title,
      content,
      status: 'done',
      stage: 'done',
      completedAt: Date.now(),
      summary: content.slice(0, 100),
      qualityIssues,
      qualityScore: Math.max(0, 100 - qualityIssues.length * 20),
      addressSuggestions: addressResult.fixes.length ? addressResult.fixes : undefined,
      addressOriginalContent: addressResult.fixes.length ? content : undefined,
    })
    const currentDetail = detailRef.current
    if (currentDetail?.outline?.length) {
      const outline = currentDetail.outline.map((card, cardIndex) =>
        cardIndex === index
          ? { ...card, chapterId, status: '已完成' as const, targetWords: wordsPerChapter }
          : card,
      )
      detailRef.current = { ...currentDetail, outline }
      onUpdateDetail(workId, { outline })
    }
    const words = nextChapters.reduce(
      (sum, item) => sum + countWords(item.content ?? ''),
      0,
    )
    const current = work?.personalNovel
    const startedAt = current?.batch?.startedAt ?? Date.now()
    onUpdateWork(workId, {
      words,
      chapters: nextChapters.length,
      status: work?.status === '草稿' ? '连载中' : work?.status,
      startedAt: work?.startedAt ?? Date.now(),
      updatedAt: Date.now(),
      personalNovel: {
        ...(current ?? {
          status: 'writing',
          idea,
          length,
          tone,
          pov,
          chapterCount,
          wordsPerChapter,
          currentChapterIndex: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
        status: 'writing',
        chapterCount: activePlan.chapters.length,
        wordsPerChapter,
        plan: activePlan,
        currentChapterIndex: index + 1,
        batch: {
          chapterCount: activePlan.chapters.length,
          targetWords: wordsPerChapter,
          status: 'writing',
          completedChapters: index + 1,
          syncStatus: 'done',
          startedAt,
          updatedAt: Date.now(),
        },
        updatedAt: Date.now(),
      },
    })
    if (followBatchRef.current) setActiveChapter(index)
    queueChapterSync(nextChapters[index], 'fast')
    if ((index + 1) % 10 === 0 || index + 1 >= activePlan.chapters.length) {
      queueChapterSync(nextChapters[index], 'deep')
    }
    recordUsage('续写', 'writing', writingApi, messages.map((m) => m.content).join('\n'), content, usage)
    return { chapterId, content }
  }

  const startBatch = async (limit?: number) => {
    if (!workId || !plan || !writingApiReady) {
      setError('请先在设置里配置写作 AI。')
      return
    }
    if (batchRunning) return
    setBatchRunning(true)
    batchAbortRef.current = false
    followBatchRef.current = false
    setError('')
    try {
      let prior = [...chaptersRef.current]
      let index = prior.findIndex((chapter) => !chapter.content.trim())
      if (index < 0) index = 0
      const target = Math.min(
        plan.chapters.length,
        index + (limit ?? Number.MAX_SAFE_INTEGER),
      )
      while (index < target && !batchAbortRef.current) {
        setBusy('chapter')
        await generateChapterContent(index, prior)
        prior = [...chaptersRef.current]
        index += 1
      }
      const completed = chaptersRef.current.filter((chapter) => chapter.content.trim()).length
      const finished = completed >= plan.chapters.length
      const current = work?.personalNovel
      updatePersonal({
        status: finished ? 'writing' : 'plan_ready',
        batch: {
          chapterCount: plan.chapters.length,
          targetWords: wordsPerChapter,
          status: finished ? 'done' : 'paused',
          completedChapters: completed,
          syncStatus: 'done',
          startedAt: current?.batch?.startedAt ?? Date.now(),
          updatedAt: Date.now(),
        },
      })
      onToast(finished ? '本批章节已全部生成' : '已暂停，已完成章节可以继续阅读')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '批量生成失败'
      setError(message)
      const current = work?.personalNovel
      updatePersonal({
        status: 'error',
        error: message,
        batch: {
          chapterCount: plan.chapters.length,
          targetWords: wordsPerChapter,
          status: 'error',
          completedChapters: chaptersRef.current.filter((chapter) => chapter.content.trim()).length,
          syncStatus: 'pending',
          startedAt: current?.batch?.startedAt ?? Date.now(),
          updatedAt: Date.now(),
          error: message,
        },
      })
    } finally {
      setBatchRunning(false)
      setBusy('')
    }
  }

  const stopBatch = () => {
    batchAbortRef.current = true
    onToast('正在停止，本章完成后会保留已完成章节')
  }

  const rewriteChapter = async (index: number) => {
    if (!workId || !plan || batchRunning || busy !== '') return
    setBatchRunning(true)
    setBusy('chapter')
    setError('')
    try {
      await generateChapterContent(index, [...chaptersRef.current])
      onToast(`第 ${index + 1} 章已重写`)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '本章重写失败'
      setError(message)
    } finally {
      setBatchRunning(false)
      setBusy('')
    }
  }

  const extendOneChapter = async () => {
    const currentPlan = planRef.current ?? plan
    if (!workId || !currentPlan || batchRunning || busy !== '' || !generalApiReady) return
    setBatchRunning(true)
    setBusy('chapter')
    setError('')
    try {
      const nextNumber = currentPlan.chapters.length + 1
      const messages = buildNextPersonalNovelChapterPlanMessages({
        plan: currentPlan,
        chapters: chaptersRef.current,
        chapterNumber: nextNumber,
      })
      let usage: ChatUsage | undefined
      const raw = await runApiTask(generalApi, {
        task: 'analysis.plan',
        messages,
        maxTokens: 1200,
        onUsage: (next) => {
          usage = next
        },
      })
      const chapterPlan = parseNextPersonalNovelChapterPlan(raw)
      if (!chapterPlan) throw new Error('下一章大纲生成失败，请重试。')
      const nextPlan = { ...currentPlan, chapters: [...currentPlan.chapters, chapterPlan] }
      planRef.current = nextPlan
      const currentDetail = detailRef.current
      if (currentDetail) {
        const outline = [
          ...(currentDetail.outline ?? []),
          {
            id: `oc-personal-${workId}-${nextNumber}`,
            title: chapterPlan.title,
            summary: chapterPlan.goal,
            goal: chapterPlan.goal,
            conflict: chapterPlan.conflict,
            status: '待写' as const,
            targetWords: wordsPerChapter,
          },
        ]
        detailRef.current = { ...currentDetail, outline }
        onUpdateDetail(workId, { outline })
      }
      const current = work?.personalNovel
      onUpdateWork(workId, {
        personalNovel: {
          ...(current ?? {
            status: 'writing',
            idea,
            length,
            tone,
            pov,
            chapterCount,
            wordsPerChapter,
            currentChapterIndex: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
          status: 'writing',
          chapterCount: nextPlan.chapters.length,
          wordsPerChapter,
          plan: nextPlan,
          updatedAt: Date.now(),
        },
      })
      recordUsage('项目生成', 'general', generalApi, messages.map((m) => m.content).join('\n'), raw, usage)
      await generateChapterContent(currentPlan.chapters.length, [...chaptersRef.current], nextPlan)
      const latest = work?.personalNovel
      onUpdateWork(workId, {
        personalNovel: {
          ...(latest ?? current ?? {
            status: 'writing',
            idea,
            length,
            tone,
            pov,
            chapterCount: nextPlan.chapters.length,
            wordsPerChapter,
            currentChapterIndex: nextPlan.chapters.length,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
          status: 'writing',
          chapterCount: nextPlan.chapters.length,
          wordsPerChapter,
          plan: nextPlan,
          currentChapterIndex: nextPlan.chapters.length,
          batch: {
            chapterCount: nextPlan.chapters.length,
            targetWords: wordsPerChapter,
            status: 'done',
            completedChapters: nextPlan.chapters.length,
            syncStatus: 'done',
            startedAt: latest?.batch?.startedAt ?? Date.now(),
            updatedAt: Date.now(),
          },
          updatedAt: Date.now(),
        },
      })
      onToast('下一章已生成')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '续写下一章失败'
      setError(message)
    } finally {
      setBatchRunning(false)
      setBusy('')
    }
  }

  const continueChapters = async (count: number) => {
    const activePlan = planRef.current
    if (!activePlan || batchRunning) return
    const requested = Math.max(1, Math.min(100, Math.floor(count) || 1))
    const completed = chaptersRef.current.filter((chapter) => chapter.content.trim()).length
    const remaining = Math.max(0, activePlan.chapters.length - completed)
    const withinPlan = Math.min(requested, remaining)
    if (withinPlan > 0) await startBatch(withinPlan)
    const extraCount = requested - withinPlan
    for (let index = 0; index < extraCount; index += 1) {
      if (batchAbortRef.current) break
      await extendOneChapter()
    }
  }

  useEffect(() => {
    if (!onBridgeChange || !workId) return
    onBridgeChange({
      generation: {
        completed: generatedCount,
        total: plan?.chapters.length ?? 0,
        status: batchRunning
          ? 'writing'
          : personal?.batch?.status === 'error'
            ? 'error'
            : personal?.batch?.status === 'paused'
              ? 'paused'
              : 'done',
        currentChapter: personal?.currentChapterIndex ?? 0,
      },
      sync: {
        status: syncRunning ? 'running' : syncFailed ? 'error' : 'idle',
        done: syncDone,
        total: syncTotal,
      },
      continueChapters: (count) => {
        void continueChapters(count)
      },
      stop: stopBatch,
      openAddressReview: () => setAddressReviewOpen(true),
      openSyncQueue: () => setSyncQueueOpen(true),
      cost: sessionCost,
    })
  }, [
    onBridgeChange,
    workId,
    generatedCount,
    plan?.chapters.length,
    batchRunning,
    personal?.batch?.status,
    personal?.currentChapterIndex,
    syncRunning,
    syncFailed,
    syncDone,
    syncTotal,
    sessionCost,
  ])

  const patchChapter = (chapterId: string, patch: Partial<Chapter>) => {
    const current = chaptersRef.current
    const next = current.map((chapter) =>
      chapter.id === chapterId ? { ...chapter, ...patch, updatedAt: Date.now() } : chapter,
    )
    chaptersRef.current = next
    onUpdateChapter(workId!, chapterId, patch)
  }

  const applyChapterAddressSuggestions = (chapterId: string) => {
    const chapter = chaptersRef.current.find((item) => item.id === chapterId)
    if (!chapter?.addressSuggestions?.length) return
    const original = chapter.addressOriginalContent ?? chapter.content
    const text = applyNarrationAddressFixes(original, chapter.addressSuggestions)
    patchChapter(chapterId, {
      content: text,
      wordCount: countWords(text),
      addressFixes: chapter.addressSuggestions.map(
        (suggestion) => `${suggestion.from} → ${suggestion.to} ×${suggestion.count}`,
      ),
      addressSuggestions: undefined,
      addressOriginalContent: original,
    })
    onToast('已应用称呼修改')
  }

  const rejectChapterAddressSuggestions = (chapterId: string) => {
    patchChapter(chapterId, { addressSuggestions: undefined })
  }

  const restoreChapterAddressOriginal = (chapterId: string) => {
    const chapter = chaptersRef.current.find((item) => item.id === chapterId)
    if (!chapter?.addressOriginalContent) return
    patchChapter(chapterId, {
      content: chapter.addressOriginalContent,
      wordCount: countWords(chapter.addressOriginalContent),
      addressFixes: undefined,
      addressSuggestions: undefined,
      addressOriginalContent: undefined,
    })
    onToast('已恢复自动修改前的原文')
  }

  const planReady = Boolean(plan)
  const showPlan = planReady && !hasContent
  const active = chapters[activeChapter]
  const canContinue = Boolean(plan && generatedCount < plan.chapters.length)

  const header = (
    <header className="personal-novel-topbar">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
        <IconArrowLeft size={15} />
        书架
      </button>
      <div>
        <span className="chat-eyebrow">个人小说 · 看戏模式</span>
        <h1>{work?.title || '我想看一个故事'}</h1>
      </div>
      <div className="personal-novel-top-actions">
        {!generalApiReady || !writingApiReady ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenSettings}>
            配置 AI
          </button>
        ) : null}
        {work && planReady && hasContent ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenWriter}>
            阅读
          </button>
        ) : null}
        {work && planReady && hasContent ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAddressReviewOpen(true)}>
            称呼检查
          </button>
        ) : null}
        {work && planReady ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetailsOpen(true)}>
            作品详情
          </button>
        ) : null}
        {work && planReady ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenWriter}>
            写作模式
          </button>
        ) : null}
        {work && planReady ? (
          <span className="personal-novel-wordcount">
            {countWords(chapters.map((chapter) => chapter.content).join('\n'))} 字
          </span>
        ) : null}
        {personal?.batch ? (
          <span className="personal-novel-batch-progress">
            本批 {personal.batch.completedChapters}/{personal.batch.chapterCount} 章
          </span>
        ) : null}
      </div>
    </header>
  )

  if (!work || !planReady) {
    return (
      <div className="personal-novel-view">
        {header}
        <main className="personal-novel-setup">
          <p className="personal-novel-kicker">
            <IconSparkles size={14} />
            一句话，开一部戏
          </p>
          <h2>你想看一个什么样的故事？</h2>
          <p className="personal-novel-lede">
            只写你真正想看的那一句。书名、人物、分章和正文，交给说戏。
          </p>
          <textarea
            className="input drawer-textarea personal-novel-idea"
            rows={4}
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder="例如：暴雨夜，我在便利店遇到十年前死掉的人。"
            maxLength={300}
          />
          <div className="personal-novel-examples">
            {TONE_EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => setIdea(example)}>
                {example}
              </button>
            ))}
          </div>

          <div className="personal-novel-choice-row">
            <div>
              <span>篇幅</span>
              <div className="personal-novel-segments">
                {PERSONAL_NOVEL_LENGTH_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={length === option.value ? 'active' : ''}
                    onClick={() => setLength(option.value)}
                    title={option.hint}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span>基调</span>
              <div className="personal-novel-segments">
                {PERSONAL_NOVEL_TONE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={tone === option ? 'active' : ''}
                    onClick={() => setTone(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span>视角</span>
              <div className="personal-novel-segments">
                {PERSONAL_NOVEL_POV_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={pov === option ? 'active' : ''}
                    onClick={() => setPov(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="personal-novel-choice-row personal-novel-batch-row">
            <div>
              <span>生成章数</span>
              <div className="personal-novel-segments">
                {PERSONAL_NOVEL_CHAPTER_COUNT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={chapterCount === option ? 'active' : ''}
                    onClick={() => setChapterCount(option)}
                  >
                    {option} 章
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span>每章目标字数</span>
              <div className="personal-novel-segments">
                {PERSONAL_NOVEL_WORD_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={wordsPerChapter === option ? 'active' : ''}
                    onClick={() => setWordsPerChapter(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <label className="personal-novel-custom-words">
                <span>自定义</span>
                <input
                  type="number"
                  min={300}
                  max={8000}
                  step={100}
                  value={wordsPerChapter}
                  onChange={(event) =>
                    setWordsPerChapter(Math.max(300, Math.min(8000, Number(event.target.value) || 0)))
                  }
                />
                <span>字</span>
              </label>
            </div>
            <div>
              <span>本批计划</span>
              <strong className="personal-novel-total">
                {chapterCount} 章 · 约 {chapterCount * wordsPerChapter} 字
              </strong>
            </div>
          </div>

          {error ? <p className="field-error">{error}</p> : null}
          <div className="personal-novel-start-row">
            <button
              type="button"
              className="btn btn-primary personal-novel-start"
              onClick={() => void startStory()}
              disabled={busy !== '' || !generalApiReady || !writingApiReady}
            >
              {busy === 'plan' ? '正在搭故事…' : '生成故事方案'}
              <IconArrowRight size={15} />
            </button>
            <span>先生成方案，确认后再写正文。</span>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="personal-novel-view">
      {header}
      <div className="personal-novel-body">
        <aside className="personal-novel-chapters">
          <div className="personal-novel-side-title">
            <span>故事目录</span>
            <small>{plan!.chapters.length} 章计划</small>
          </div>
          {plan!.chapters.map((chapter, index) => {
            const generated = Boolean(chapters[index]?.content.trim())
            return (
              <button
                key={`${chapter.title}-${index}`}
                type="button"
                className={`personal-novel-chapter-item ${activeChapter === index && generated ? 'active' : ''} ${generated ? '' : 'pending'}`}
                onClick={() => {
                  if (generated) {
                    followBatchRef.current = index >= generatedCount - 1
                    setActiveChapter(index)
                  }
                }}
                disabled={!generated}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{chapter.title}</strong>
                <small>
                  {generated ? `${countWords(chapters[index].content)} 字` : '待写'}
                  {generated && chapters[index].qualityIssues?.length ? ' · ⚠ 质量检查' : ''}
                </small>
              </button>
            )
          })}
        </aside>

        <main className="personal-novel-main">
          {showPlan ? (
            <section className="personal-novel-plan">
              <p className="personal-novel-kicker">故事方案</p>
              <h2>{plan!.title}</h2>
              <p className="personal-novel-logline">{plan!.logline}</p>
              {plan!.synopsis ? <p className="personal-novel-synopsis">{plan!.synopsis}</p> : null}
              {plan!.protagonist ? (
                <div className="personal-novel-plan-block">
                  <span>主角</span>
                  <p>{plan!.protagonist}</p>
                </div>
              ) : null}
              {plan!.characters.length ? (
                <div className="personal-novel-plan-block">
                  <span>人物</span>
                  <div className="personal-novel-cast">
                    {plan!.characters.map((character) => (
                      <div key={character.name}>
                        <strong>{character.name}</strong>
                        <small>{character.role}</small>
                        <p>{character.goal}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="personal-novel-plan-block">
                <span>章节</span>
                <div className="personal-novel-plan-chapters">
                  {plan!.chapters.map((chapter, index) => (
                    <div key={`${chapter.title}-${index}`}>
                      <strong>
                        {String(index + 1).padStart(2, '0')} {chapter.title}
                      </strong>
                      <p>{chapter.goal}</p>
                      <small>{chapter.hook}</small>
                    </div>
                  ))}
                </div>
              </div>
              {error ? <p className="field-error">{error}</p> : null}
              <p className="personal-novel-estimate">
                预计正文 {plan!.chapters.length * wordsPerChapter} 字 ·{' '}
                {plan!.chapters.length} 次章节生成 · 约{' '}
                {Math.max(1, Math.round(plan!.chapters.length * 0.7))}–
                {Math.max(2, Math.round(plan!.chapters.length * 1.4))} 分钟
              </p>
              <div className="personal-novel-plan-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void startBatch()}
                  disabled={busy !== '' || batchRunning}
                >
                  {busy === 'chapter' ? '正在生成…' : `生成 ${plan!.chapters.length} 章`}
                  <IconArrowRight size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void startBatch(1)}
                  disabled={busy !== '' || batchRunning}
                >
                  先写 1 章
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setPlanEditorOpen(true)}
                  disabled={busy !== '' || batchRunning}
                >
                  编辑方案
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (workId) void generatePlan(workId)
                  }}
                  disabled={busy !== ''}
                >
                  换一个方案
                </button>
              </div>
            </section>
          ) : active ? (
            <article className="personal-novel-reader">
              <div className="personal-novel-reader-head">
                <div>
                  <span>第 {activeChapter + 1} 章</span>
                  <h2>{active.title}</h2>
                </div>
                <span>{countWords(active.content)} 字</span>
              </div>
              <div className="personal-novel-reader-text">
                {active.content
                  .split(/\n+/)
                  .filter(Boolean)
                  .map((paragraph, index) => (
                    <p key={`${active.id}-${index}`}>{paragraph}</p>
                  ))}
              </div>
              {error ? <p className="field-error">{error}</p> : null}
              <div className="personal-novel-reader-actions">
                {activeChapter > 0 ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      followBatchRef.current = false
                      setActiveChapter((current) => Math.max(0, current - 1))
                    }}
                  >
                    上一章
                  </button>
                ) : null}
                {activeChapter < generatedCount - 1 ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      followBatchRef.current = activeChapter + 1 >= generatedCount - 1
                      setActiveChapter((current) => current + 1)
                    }}
                  >
                    下一章
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void rewriteChapter(activeChapter)}
                  disabled={busy !== '' || batchRunning}
                >
                  重写本章
                </button>
                {batchRunning ? (
                  <button type="button" className="btn btn-primary" onClick={stopBatch}>
                    停止生成
                  </button>
                ) : canContinue ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void startBatch()}
                    disabled={busy !== ''}
                  >
                    继续生成未完成章节
                    <IconArrowRight size={15} />
                  </button>
                ) : (
                  <span className="personal-novel-end">本批章节已全部生成</span>
                )}
              </div>
            </article>
          ) : (
            <section className="personal-novel-empty">故事还没有正文。</section>
          )}
        </main>
      </div>
      {addressReviewOpen ? (
        <PersonalAddressReview
          chapters={chapters}
          onApply={applyChapterAddressSuggestions}
          onReject={rejectChapterAddressSuggestions}
          onRestore={restoreChapterAddressOriginal}
          onClose={() => setAddressReviewOpen(false)}
        />
      ) : null}
      {planEditorOpen && plan ? (
        <PersonalNovelPlanEditor
          plan={plan}
          onClose={() => setPlanEditorOpen(false)}
          onSave={saveEditedPlan}
        />
      ) : null}
      {syncQueueOpen ? (
        <Modal
          title="同步队列"
          subtitle="快速同步每章一次；深度同步在每 10 章或本批完成时执行。"
          onClose={() => setSyncQueueOpen(false)}
          size="lg"
          footer={
            <button type="button" className="btn btn-ghost" onClick={() => setSyncQueueOpen(false)}>
              关闭
            </button>
          }
        >
          {syncJobs.length === 0 ? (
            <p className="personal-details-empty">还没有同步任务。</p>
          ) : (
            <div className="personal-sync-queue">
              {syncJobs.map((job) => (
                <div className={`personal-sync-row ${job.status}`} key={job.id}>
                  <div>
                    <strong>
                      {job.type === 'deep' ? '深度同步' : '快速同步'} · {job.chapterTitle}
                    </strong>
                    <small>
                      {job.status === 'queued'
                        ? '排队中'
                        : job.status === 'running'
                          ? '同步中'
                          : job.status === 'done'
                            ? '已完成'
                            : `失败：${job.error ?? '未知错误'}`}
                    </small>
                  </div>
                  {job.status === 'error' ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setSyncJobsSafe(
                          syncJobsRef.current.map((item) =>
                            item.id === job.id
                              ? { ...item, status: 'queued', error: undefined }
                              : item,
                          ),
                        )
                        void pumpSyncQueue()
                      }}
                    >
                      重试
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Modal>
      ) : null}
      {detailsOpen && detail && work ? (
        <div className="personal-detail-overlay">
          <Suspense fallback={<div className="app-view-loading">正在加载作品详情…</div>}>
            <WorkDetailDrawer
              readOnly
              mode="fullscreen"
              onModeChange={(next) => {
                if (next !== 'fullscreen') setDetailsOpen(false)
              }}
              work={work}
              detail={detail}
              chapters={chapters}
              activeChapterId={active?.id ?? chapters[0]?.id ?? ''}
              prompts={[]}
              api={generalApi}
              apiReady={generalApiReady}
              generalApi={generalApi}
              generalApiReady={generalApiReady}
              analyzing={false}
              onUpdateWork={() => {}}
              onUpdateDetail={() => {}}
              onUpdateChapter={() => {}}
              onSelectChapter={(chapterId) => {
                const index = chapters.findIndex((chapter) => chapter.id === chapterId)
                if (index >= 0) {
                  setActiveChapter(index)
                  setDetailsOpen(false)
                }
              }}
              onAddChapter={() => {}}
              onDeleteChapter={() => {}}
              onRenameChapter={() => {}}
              onOpenPromptPicker={() => {}}
              onAnalyze={() => {}}
              onOpenPromptLibrary={() => {}}
              onToast={() => {}}
            />
          </Suspense>
        </div>
      ) : null}
    </div>
  )
}
