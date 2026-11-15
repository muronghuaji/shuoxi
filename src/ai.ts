import type {
  ApiConfig,
  Chapter,
  Prompt,
  ReasoningEffort,
  StoryHealthIssue,
  StoryMemoryData,
  Work,
  WorkDetail,
  WorldTemplate,
} from './types'
import { PERSPECTIVES } from './data'
import { chapterWords, countWords, estimateTokens } from './utils'
import { resolveWorldTemplate } from './worldTemplates'
import { resolveEnabledModules, resolveModuleFields } from './moduleCatalog'
import {
  buildCharacterProfilePrompt,
  characterQuickLine,
  selectFocusCharacters,
} from './characterProfile'
import {
  buildFactionProfilePrompt,
  factionHierarchyLabels,
  factionQuickLine,
  selectFocusFactions,
} from './factionProfile'
import { formatStyleCard } from './styleProfile'
import {
  buildEmotionSceneSection,
  buildProseContractSection,
  buildStyleAnchorSection,
} from './proseCraft'
import { selectScopedSyncDetail } from './syncScope'
import { factionFacilityTotals, normalizeFacilityCounts, normalizeFacilities } from './factionFacilities'
import { buildSpeciesPrompt } from './species'
import { characterRealmScheme, factionTierScheme, schemeById } from './tiers'
import {
  KNOWLEDGE_SCOPE_LABELS,
  formatCharacterExperiencePrompt,
  normalizeCharacterExperiences,
} from './characterExperience'
import { ensureStoryMemory } from './storyMemory'
import { activeFactsAtChapter } from './storyMemory'
import { buildMemoryContextSections, retrieveStoryMemory } from './storyRetrieval'
import type { RetrievedMemory } from './storyRetrieval'
import { collectDismissedIssues } from './characterAudit'
import { collectDismissedFactionIssues } from './factionAudit'
import { resolveWritingMode, writingModeLabel, resolveContextOptions } from './writingMode'
import { resolveStoryThreads } from './storyState'
import { buildWritingAnchors } from './writingAnchors'
import {
  DEFAULT_OUTPUT_RESERVE,
  resolveEffectiveContextBudget,
  type EffectiveContextBudget,
} from './contextBudget'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens?: number
  cacheWriteTokens?: number
  uncachedInputTokens?: number
}

interface ChatOptions {
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
  onDelta?: (delta: string) => void
  onUsage?: (usage: ChatUsage) => void
  onFinishReason?: (reason: string) => void
  includeUsage?: boolean
}

let aiBudgetGuard: (() => string | null) | null = null

export function setAiBudgetGuard(guard: (() => string | null) | null): void {
  aiBudgetGuard = guard
}

function assertBudget(): void {
  const blocked = aiBudgetGuard?.()
  if (blocked) throw new Error(blocked)
}

function readUsage(raw: unknown): ChatUsage | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const input = Number(value.prompt_tokens ?? value.input_tokens)
  const output = Number(value.completion_tokens ?? value.output_tokens)
  const total = Number(value.total_tokens ?? input + output)
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null
  const details = value.prompt_tokens_details
  const detailRecord = details && typeof details === 'object' ? (details as Record<string, unknown>) : {}
  const numberOrUndefined = (candidate: unknown): number | undefined => {
    const parsed = Number(candidate)
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : undefined
  }
  const cachedInputTokens =
    numberOrUndefined(detailRecord.cached_tokens) ??
    numberOrUndefined(value.prompt_cache_hit_tokens) ??
    numberOrUndefined(value.cache_read_input_tokens)
  const cacheWriteTokens = numberOrUndefined(value.cache_creation_input_tokens)
  const explicitUncached = numberOrUndefined(value.prompt_cache_miss_tokens)
  const safeInput = Math.max(0, Math.round(input))
  return {
    inputTokens: safeInput,
    outputTokens: Math.max(0, Math.round(output)),
    totalTokens: Math.max(0, Math.round(Number.isFinite(total) ? total : input + output)),
    cachedInputTokens,
    cacheWriteTokens,
    uncachedInputTokens:
      explicitUncached ??
      (cachedInputTokens !== undefined
        ? Math.max(0, safeInput - cachedInputTokens - (cacheWriteTokens ?? 0))
        : undefined),
  }
}

function assertConfig(api: ApiConfig) {
  if (!api.baseUrl.trim()) throw new Error('还没有填写接口地址，请先到设置里配置')
  if (!api.apiKey.trim()) throw new Error('还没有填写 API Key，请先到设置里配置')
  if (!api.model.trim()) throw new Error('还没有选择模型')
}

function assertHeaderText(value: string, label: string): string {
  if (/[^\x20-\x7E]/.test(value)) {
    throw new Error(`${label}包含非 ASCII 字符，请到设置里重新复制，避免中文标点或空格混入`)
  }
  return value
}

function normalizeBaseUrl(value: string): string {
  try {
    return new URL(value.trim()).toString().replace(/\/+$/, '')
  } catch {
    throw new Error('接口地址格式不正确，请填写完整的 http(s) 地址')
  }
}

async function requestChat(
  api: ApiConfig,
  messages: ChatMessage[],
  options: ChatOptions & { stream: boolean },
): Promise<Response> {
  assertConfig(api)
  if (options.maxTokens !== 64) assertBudget()

  const authorization = assertHeaderText(`Bearer ${api.apiKey.trim()}`, 'API Key')
  const baseUrl = assertHeaderText(normalizeBaseUrl(api.baseUrl), '接口地址')

  const isReasoningModel = /reasoner|(^|[-_:])r1($|[-_:])|v4-pro|deepseek-pro/i.test(api.model)
  const body: Record<string, unknown> = {
    model: api.model.trim(),
    messages,
    stream: options.stream,
  }
  if (!isReasoningModel) body.temperature = options.temperature ?? 0.85
  if (options.maxTokens) body.max_tokens = options.maxTokens
  if (options.stream && options.includeUsage !== false && api.provider !== 'ollama') {
    body.stream_options = { include_usage: true }
  }

  const response = await fetch('/llm-api/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: options.stream ? 'text/event-stream' : 'application/json',
      'cache-control': 'no-cache',
      authorization,
      'x-llm-base-url': baseUrl,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  })

  if (!response.ok) {
    const raw = await response.text().catch(() => '')
    let detail = raw
    try {
      const parsed = JSON.parse(raw)
      detail = parsed?.error?.message ?? parsed?.message ?? raw
    } catch {
      // 保留原始文本
    }
    throw new Error(`接口返回 ${response.status}${detail ? `：${detail}` : ''}`)
  }

  return response
}

function extractDelta(payload: string): string {
  try {
    const json = JSON.parse(payload)
    const delta = json?.choices?.[0]?.delta?.content
    return typeof delta === 'string' ? delta : ''
  } catch {
    return ''
  }
}

function extractUsage(payload: string): ChatUsage | null {
  try {
    return readUsage(JSON.parse(payload)?.usage)
  } catch {
    return null
  }
}

function extractFinishReason(payload: string): string | null {
  try {
    const reason = JSON.parse(payload)?.choices?.[0]?.finish_reason
    return typeof reason === 'string' && reason ? reason : null
  } catch {
    return null
  }
}

export interface AiRequestObservation {
  at: number
  ok: boolean
  model: string
  latencyMs: number
}

let aiRequestObserver: ((observation: AiRequestObservation) => void) | undefined

export function setAiRequestObserver(
  observer: ((observation: AiRequestObservation) => void) | undefined,
): void {
  aiRequestObserver = observer
}

function notifyAiRequest(observation: AiRequestObservation): void {
  try {
    aiRequestObserver?.(observation)
  } catch {
    // 统计观察器不能影响 AI 请求本身。
  }
}

async function streamChatInner(
  api: ApiConfig,
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  let response: Response
  try {
    response = await requestChat(api, messages, { ...options, stream: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      options.includeUsage !== false &&
      api.provider !== 'ollama' &&
      /stream_options|unrecognized|unknown field|invalid.*parameter|不支持/i.test(message)
    ) {
      response = await requestChat(api, messages, {
        ...options,
        stream: true,
        includeUsage: false,
      })
    } else {
      throw error
    }
  }
  const contentType = response.headers.get('content-type') ?? ''

  // 少数兼容接口即使 stream=true 也会返回完整 JSON，这里兜底。
  if (contentType.includes('application/json')) {
    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content
    const usage = readUsage(data?.usage)
    if (usage) options.onUsage?.(usage)
    const finishReason = data?.choices?.[0]?.finish_reason
    if (typeof finishReason === 'string' && finishReason) {
      options.onFinishReason?.(finishReason)
    }
    if (typeof text !== 'string' || !text.trim()) {
      // 返回空内容时交给外层做一次非流式兜底；不要在这里直接抛错，
      // 否则推理模型/兼容接口的空 reasoning 响应会直接中断救书和同步。
      return ''
    }
    options.onDelta?.(text)
    return text
  }

  if (!response.body) throw new Error('模型没有返回内容')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  const consume = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    const usage = extractUsage(payload)
    if (usage) options.onUsage?.(usage)
    const finishReason = extractFinishReason(payload)
    if (finishReason) options.onFinishReason?.(finishReason)
    const delta = extractDelta(payload)
    if (!delta) return
    full += delta
    options.onDelta?.(delta)
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) consume(line)
  }

  buffer += decoder.decode()
  for (const line of buffer.split('\n')) consume(line)

  return full
}

async function completeChat(
  api: ApiConfig,
  messages: ChatMessage[],
  options: ChatOptions,
  allowRetry = true,
): Promise<string> {
  const response = await requestChat(api, messages, { ...options, stream: false })
  const data = (await response.json()) as {
    choices?: {
      message?: { content?: unknown; reasoning_content?: unknown }
      finish_reason?: unknown
    }[]
    usage?: unknown
  }
  const text = data.choices?.[0]?.message?.content
  const usage = readUsage(data.usage)
  if (usage) options.onUsage?.(usage)
  const finishReason = data.choices?.[0]?.finish_reason
  if (typeof finishReason === 'string' && finishReason) {
    options.onFinishReason?.(finishReason)
  }
  if (typeof text !== 'string' || !text.trim() || finishReason === 'length') {
    const reasoning = data.choices?.[0]?.message?.reasoning_content
    const reasoningOnly = typeof reasoning === 'string' && reasoning.trim().length > 0
    const currentMax = options.maxTokens ?? 0
    const bumpedMax = Math.min(8000, Math.max(6000, currentMax * 2))
    if (allowRetry && !options.signal?.aborted && bumpedMax > currentMax) {
      return completeChat(
        api,
        messages,
        { ...options, maxTokens: bumpedMax },
        false,
      )
    }
    if (typeof text === 'string' && text.trim()) {
      options.onDelta?.(text)
      return text
    }
    throw new Error(
      `模型没有返回正文内容（finish_reason=${typeof finishReason === 'string' ? finishReason : '未知'}${reasoningOnly ? '，只返回了推理内容' : ''}）。可能是输出上限不足或模型只返回推理过程，请换用非推理模型或提高 max tokens 后重试。`,
    )
  }
  options.onDelta?.(text)
  return text
}

export async function streamChat(
  api: ApiConfig,
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const started = Date.now()
  try {
    let finishReason = ''
    const observedOptions: ChatOptions = {
      ...options,
      onFinishReason: (reason) => {
        finishReason = reason
        options.onFinishReason?.(reason)
      },
    }
    let result = await streamChatInner(api, messages, observedOptions)
    if (
      (!result.trim() || (finishReason === 'length' && options.maxTokens)) &&
      !options.signal?.aborted
    ) {
      // 推理模型在流式模式下可能只返回 reasoning；或者输出被 max_tokens 截断。
      // 用非流式再请求一次，并在内部自动提高输出预算。
      result = await completeChat(api, messages, options)
    }
    notifyAiRequest({
      at: Date.now(),
      ok: true,
      model: api.model || '未知模型',
      latencyMs: Date.now() - started,
    })
    return result
  } catch (error) {
    notifyAiRequest({
      at: Date.now(),
      ok: false,
      model: api.model || '未知模型',
      latencyMs: Date.now() - started,
    })
    throw error
  }
}

export async function pingModel(api: ApiConfig): Promise<string> {
  const response = await requestChat(
    api,
    [{ role: 'user', content: '只回复四个字：连接成功' }],
    { stream: false, temperature: 0, maxTokens: 64 },
  )
  const data = await response.json()
  const message = data?.choices?.[0]?.message
  const text = message?.content
  const reasoning = message?.reasoning_content
  const output = typeof text === 'string' && text.trim() ? text.trim() : ''
  if (output) return output
  if (typeof reasoning === 'string' && reasoning.trim()) {
    return '连接成功（推理模型已响应）'
  }
  const detail =
    data?.error?.message ??
    data?.message ??
    data?.choices?.[0]?.finish_reason ??
    '响应里没有正文'
  throw new Error(`模型没有返回内容：${String(detail).slice(0, 120)}`)
}

function perspectiveLabel(value: Work['perspective']): string {
  return PERSPECTIVES.find((item) => item.value === value)?.label ?? '第三人称 · 限知'
}

function clip(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `（前文略）\n${text.slice(-maxLength)}`
}

function joinSections(sections: string[]): string {
  return sections.filter((section) => section.trim()).join('\n\n')
}

const CHAPTER_FULL_CONTEXT_LIMIT = 10000
const CHAPTER_LONG_HEAD_CHARS = 1600
const CHAPTER_LONG_TAIL_CHARS = 8000

function chapterBaseContext(baseContent: string, chapter: Chapter): string {
  if (baseContent.length <= CHAPTER_FULL_CONTEXT_LIMIT) return baseContent
  const parts = [
    chapter.summary?.trim() ? `【本章前文摘要】\n${chapter.summary.trim()}` : '',
    `【本章开头】\n${baseContent.slice(0, CHAPTER_LONG_HEAD_CHARS)}`,
    '（本章中间部分省略，以下为最近正文）',
    `【本章最近正文】\n${baseContent.slice(-CHAPTER_LONG_TAIL_CHARS)}`,
  ]
  return parts.filter(Boolean).join('\n\n')
}

const CONTEXT_DROP_ORDER = [  '【章节结构】',
  '【物品库】',
  '【地点关系】',
  '【已有模块记录】',
  '【设定模块】',
  '【系统】',
  '【势力】',
  '【模板',
  '【人物关系】',
  '【相关历史记忆】',
  '【当前有效事实】',
  '【即将到期 / 应推进的承诺】',
  '【当前卷记忆】',
  '【上一卷记忆】',
  '【当前卷摘要】',
  '【最近章节记忆】',
  '【本地章节摘要】',
  '【主要角色】',
  '【当前场景相关物种】',
]

function sectionTitle(section: string): string {
  return section.match(/^【([^】]+)】/)?.[1]?.trim() || section.split('\n')[0]?.slice(0, 24) || '未命名段落'
}

function contextLayer(title: string): string {
  if (/导演简报|作品设定/.test(title)) return '戏核 / 总纲'
  if (/本章|当前章|导演指令|本次写作任务|硬约束|场景/.test(title)) return '本场戏'
  if (/角色|人物/.test(title)) return '在场角色'
  if (/势力|模板|系统|模块/.test(title)) return '势力与规则'
  if (/记忆|事件|事实|承诺|伏笔|章节摘要|关系/.test(title)) return '长期档案'
  return '写作工艺'
}

interface FitContextResult {
  sections: string[]
  dropped: ContextSectionReport[]
}

function fitContextBudget(
  sections: string[],
  systemTokens: number,
  budget: number,
): FitContextResult {
  let next = [...sections]
  const dropped: ContextSectionReport[] = []
  const total = () => systemTokens + estimateTokens(next.join('\n\n'))
  for (const marker of CONTEXT_DROP_ORDER) {
    while (total() > budget) {
      const index = next.findIndex((section) => section.startsWith(marker))
      if (index < 0) break
      const [removed] = next.splice(index, 1)
      const title = sectionTitle(removed)
      dropped.push({
        title,
        layer: contextLayer(title),
        tokens: estimateTokens(removed),
        dropped: true,
        reason: '超出本次输入上限，按低优先级裁剪',
      })
    }
    if (total() <= budget) break
  }
  return { sections: next, dropped }
}

function localChapterSummaryContext(
  detail: WorkDetail,
  chapters: Chapter[],
  chapterId: string,
): string {
  const index = chapters.findIndex((chapter) => chapter.id === chapterId)
  if (index <= 0) return ''
  const memoryIds = new Set((detail.chapterMemories ?? []).map((memory) => memory.chapterId))
  const recent = chapters
    .slice(Math.max(0, index - 12), index)
    .filter((chapter) => chapter.summary && !memoryIds.has(chapter.id))
    .slice(-8)
  if (recent.length === 0) return ''
  return `【本地章节摘要（AI 尚未深度同步）】\n${recent
    .map(
      (chapter) =>
        `- ${chapter.title || '未命名章节'}｜${chapter.summary}${
          chapter.summarySource === 'local' ? '（本地抽取）' : ''
        }`,
    )
    .join('\n')}`
}

function chapterMemoryContext(detail: WorkDetail, chapterId: string): string {  const memories = detail.chapterMemories ?? []
  const order = new Map(memories.map((memory, index) => [memory.chapterId, index]))
  const currentIndex = order.get(chapterId) ?? memories.length
  const recent = memories
    .filter((memory) => (order.get(memory.chapterId) ?? 0) <= currentIndex)
    .slice(-4)
    .reverse()
  if (recent.length === 0) return ''
  return `【最近章节记忆】\n${recent
    .map(
      (memory) =>
        `- ${memory.chapterTitle || '未命名章节'}：${memory.summary || '无摘要'}${
          memory.keyEvents.length ? `｜事件：${memory.keyEvents.join('；')}` : ''
        }${memory.openThreads.length ? `｜未解决：${memory.openThreads.join('；')}` : ''}`,
    )
    .join('\n')}`
}

function arcSummaryContext(detail: WorkDetail, chapters: Chapter[], chapterId: string): string {
  const index = chapters.findIndex((chapter) => chapter.id === chapterId)
  const summaries = detail.arcSummaries ?? []
  if (index < 0 || summaries.length === 0) return ''
  const current =
    summaries.find((summary) => index >= summary.startIndex && index <= summary.endIndex) ??
    summaries[summaries.length - 1]
  return `【当前卷摘要】\n${current.title}：${current.summary}`
}

function speciesContext(detail: WorkDetail, focusText = ''): string {
  const speciesList = detail.species ?? []
  if (speciesList.length === 0) return ''
  const ids = new Set<string>()
  const active = selectFocusCharacters(detail, focusText, 6)
  for (const character of active) {
    if (character.speciesId) ids.add(character.speciesId)
    const faction = detail.factions.find((item) => item.id === character.sectId)
    for (const speciesId of faction?.speciesIds ?? []) ids.add(speciesId)
  }
  const mentioned = speciesList.filter(
    (species) =>
      focusText.includes(species.name) ||
      (species.aliases ?? []).some((alias) => alias && focusText.includes(alias)),
  )
  for (const species of mentioned) ids.add(species.id)
  const selected = speciesList.filter((species) => ids.has(species.id)).slice(0, 4)
  if (selected.length === 0) return ''
  return `【当前场景相关物种】\n${selected.map(buildSpeciesPrompt).join('\n\n')}`
}

function characterContext(
  detail: WorkDetail,
  focusText = '',
  chapters: Chapter[] = [],
  currentChapterId = '',
  chapterNumber?: number,
  extraCharacterIds?: Set<string>,
): string {  if (detail.characters.length === 0) return ''
  const template = resolveWorldTemplate(detail)
  const focus = selectFocusCharacters(detail, focusText, 6)
  const extra = extraCharacterIds
    ? detail.characters.filter(
        (character) =>
          extraCharacterIds.has(character.id) &&
          !focus.some((item) => item.id === character.id),
      )
    : []
  const active = [...focus, ...extra].slice(0, 8)
  const activeIds = new Set(active.map((character) => character.id))
  const activeNames = active.map((character) => character.name)
  const blocks = active.map((character) => {
    const faction = detail.factions.find((item) => item.id === character.sectId)
    const terms = template.terms
    const customFeatureValues = (template.customFeatures ?? [])
      .filter((feature) => feature.scope === 'character' && feature.includeInContext)
      .flatMap((feature) =>
        feature.fields.map((field) => {
          const value = character.attributes?.[field.id]
          return value ? `${feature.name}·${field.label}：${value}` : ''
        }),
      )
    const custom = [
      ...template.characterFields.map((field) => {
        const value = character.attributes?.[field.id]
        return value ? `${field.label}：${value}` : ''
      }),
      ...customFeatureValues,
    ].filter(Boolean)
    const templateExtras = [
      character.speciesId
        ? `物种：${detail.species?.find((species) => species.id === character.speciesId)?.name || '未命名'}`
        : '',
      (() => {
        const scheme = characterRealmScheme(detail, character.realmSchemeId)
        const level = character.realmLevel ? scheme?.levels[character.realmLevel - 1] : undefined
        const sublevel =
          character.realmSublevel && level
            ? level.sublevels?.[character.realmSublevel - 1]
            : undefined
        return scheme && level
          ? `境界：${scheme.name} · ${[level.name, sublevel].filter(Boolean).join(' · ')}`
          : ''
      })(),
      faction ? `${terms.faction}：${faction.name}` : '',
      character.position ? `${terms.position}：${character.position}` : '',
      template.features.cultivation && character.cultivation
        ? `${terms.rank}：${character.cultivation}`
        : '',
      template.features.cultivation && character.spiritRoot
        ? `灵根：${character.spiritRoot}`
        : '',
      template.features.cultivation && character.physique
        ? `体质：${character.physique}`
        : '',
      template.features.cultivation && character.talent
        ? `天赋：${character.talent}`
        : '',
      template.features.equipment && character.techniques?.length
        ? `${terms.ability}：${character.techniques.join('、')}`
        : '',
      template.features.equipment && character.weapons?.length
        ? `武器：${character.weapons.join('、')}`
        : '',
      template.features.equipment && character.treasures?.length
        ? `${terms.item}：${character.treasures.join('、')}`
        : '',
      character.inventory?.length
        ? `背包：${character.inventory
            .map((entry) => {
              const item = detail.items?.find((current) => current.id === entry.itemId)
              return item ? `${item.name}×${entry.quantity}` : ''
            })
            .filter(Boolean)
            .join('、')}`
        : '',
      template.features.equipment && character.currency
        ? `${terms.currency}：${character.currency}`
        : '',
      custom.length ? `模板扩展：${custom.join('｜')}` : '',
    ].filter(Boolean)
    return [
      buildCharacterProfilePrompt(character, {
        mode: 'writing',
        detail,
        activeNames,
        includeKnowledge: true,
        maxSamples: 3,
        extraLines: templateExtras,
        chapterNumber,
      }),
      formatCharacterExperiencePrompt(
        character,
        chapters,
        currentChapterId,
        focusText,
      ),
    ]
      .filter(Boolean)
      .join('\n\n')
  })
  const roster = detail.characters
    .filter((character) => !activeIds.has(character.id))
    .slice(0, 40)
    .map((character) => characterQuickLine(character))
  return [
    blocks.length ? `【当前场景核心角色】\n${blocks.join('\n\n')}` : '',
    roster.length ? `【其他角色概览】\n${roster.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function factionContext(
  detail: WorkDetail,
  focusText = '',
  chapterNumber?: number,
  extraFactionIds?: Set<string>,
): string {
  if (detail.factions.length === 0) return ''
  const template = resolveWorldTemplate(detail)
  const hierarchyLabels = factionHierarchyLabels(template)
  const focusFactions = selectFocusFactions(detail, focusText, 3)
  const extraFactions = extraFactionIds
    ? detail.factions.filter(
        (faction) =>
          extraFactionIds.has(faction.id) &&
          !focusFactions.some((item) => item.id === faction.id),
      )
    : []
  const active = [...focusFactions, ...extraFactions].slice(0, 5)
  const activeIds = new Set(active.map((faction) => faction.id))
  const blocks = active.map((faction) => {
    const customFeatureValues = (template.customFeatures ?? [])
      .filter((feature) => feature.scope === 'faction' && feature.includeInContext)
      .flatMap((feature) =>
        feature.fields.map((field) => {
          const value = faction.attributes?.[field.id]
          return value ? `${feature.name}·${field.label}：${value}` : ''
        }),
      )
    const custom = [
      ...template.factionFields.map((field) => {
        const value = faction.attributes?.[field.id]
        return value ? `${field.label}：${value}` : ''
      }),
      ...customFeatureValues,
    ].filter(Boolean)
    const hierarchy = template.features.hierarchy
      ? [
          `成员结构：${hierarchyLabels.inner} ${faction.innerDisciples ?? 0} 人、${hierarchyLabels.outer} ${faction.outerDisciples ?? 0} 人、${hierarchyLabels.menial} ${faction.menialDisciples ?? 0} 人`,
          `${hierarchyLabels.unitGroup}：${
            faction.peaks?.length
              ? faction.peaks
                  .map((item) => `${item.name}（${item.type}，负责人：${item.master || '未定'}）`)
                  .join('、')
              : '未记录'
          }`,
        ]
      : []
    const facilityLine = faction.facilities?.length
      ? `驻地设施：${faction.facilities
          .map((item) => {
            const counts = normalizeFacilityCounts(item.counts)
            const resourceNames = (item.resources ?? [])
              .map((entry) => {
                const resource = detail.items?.find((current) => current.id === entry.itemId)
                return resource ? `${resource.name}×${entry.quantity}` : ''
              })
              .filter(Boolean)
              .join('、')
            return `${item.name}（${item.type}${item.keeper ? `，负责人：${item.keeper}` : ''}；${hierarchyLabels.elderGroup}${counts.elder}、${hierarchyLabels.mainGroup}${counts.main}、${hierarchyLabels.inner}${counts.inner}、${hierarchyLabels.outer}${counts.outer}、${hierarchyLabels.menial}${counts.menial}${resourceNames ? `；资源：${resourceNames}` : ''}${item.effect ? `；作用：${item.effect}` : ''}）`
          })
          .join('、')}`
      : ''
    const facilityTotals = factionFacilityTotals(faction.facilities)
    const facilityTotalCount =
      facilityTotals.elder +
      facilityTotals.main +
      facilityTotals.inner +
      facilityTotals.outer +
      facilityTotals.menial
    const facilityTotalsLine =
      normalizeFacilities(faction.facilities).length > 0
        ? `设施汇总：总人数 ${facilityTotalCount}，其中${hierarchyLabels.elderGroup} ${facilityTotals.elder}、${hierarchyLabels.mainGroup} ${facilityTotals.main}、${hierarchyLabels.inner} ${facilityTotals.inner}、${hierarchyLabels.outer} ${facilityTotals.outer}、${hierarchyLabels.menial} ${facilityTotals.menial}`
        : ''
    const warehouseLine = faction.warehouse?.length
      ? `仓库：${faction.warehouse
          .map((entry) => {
            const item = detail.items?.find((current) => current.id === entry.itemId)
            return item ? `${item.name}×${entry.quantity}` : ''
          })
          .filter(Boolean)
          .join('、')}`
      : ''
    const factionScheme = factionTierScheme(detail)
    const factionTier = factionScheme && faction.tierLevel
      ? factionScheme.levels[faction.tierLevel - 1]
      : undefined
    return buildFactionProfilePrompt(faction, {
      mode: 'writing',
      detail,
      chapterNumber,
      maxRelations: 16,
      extraLines: [
        ...custom,
        ...hierarchy,
        facilityLine,
        facilityTotalsLine,
        warehouseLine,
        factionTier ? `势力层级：${factionTier.name}` : '',
      ].filter(Boolean),
    })
  })
  const roster = detail.factions
    .filter((faction) => !activeIds.has(faction.id))
    .slice(0, 30)
    .map((faction) => factionQuickLine(faction))
  return [
    blocks.length ? `【当前场景核心势力】\n${blocks.join('\n\n')}` : '',
    roster.length ? `【其他势力概览】\n${roster.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function continuityContext(detail: WorkDetail): string {
  const recent = (detail.storyStateEvents ?? []).slice(-6).reverse()
  const activeThreads = resolveStoryThreads(detail)
    .filter((thread) => thread.status === 'open')
    .sort((a, b) => {
      const rank = { main: 0, side: 1, background: 2 }
      return rank[a.priority] - rank[b.priority]
    })
    .slice(0, 12)
  if (recent.length === 0 && activeThreads.length === 0) return ''
  const lines: string[] = []
  for (const event of recent) {
    lines.push(`【第 ${event.chapterTitle || '未知章节'}｜${event.summary || '无摘要'}】`)
    for (const item of (event.events ?? []).slice(0, 8)) {
      lines.push(
        `- ${item.title}｜${item.status}｜${item.summary}${item.consequences.length ? `｜后果：${item.consequences.join('；')}` : ''}`,
      )
    }
    if ((event.openThreads ?? []).length) {
      lines.push(`未解决：${(event.openThreads ?? []).join('；')}`)
    }
  }
  if (activeThreads.length > 0) {
    lines.push(
      `【长期未解决事项】\n${activeThreads
        .map((thread) => `- ${thread.text}（${thread.priority === 'main' ? '主线' : thread.priority === 'side' ? '支线' : '氛围'}）`)
        .join('\n')}`,
    )
  }
  return `【最近事件与未解决事项】\n${lines.join('\n')}\n写作时必须保持这些事实；未解决事项可以推进，但不能遗忘。`
}

export function moduleContext(detail: WorkDetail, chapters: Chapter[] = []): string {
  const template = resolveWorldTemplate(detail)
  const modules = resolveEnabledModules(detail, template)
  const data = detail.moduleData ?? {}
  const characterNames = new Map(
    (detail.characters ?? []).map((character) => [character.id, character.name]),
  )
  const locationNames = new Map(
    (detail.locations ?? []).map((location) => [location.id, location.name]),
  )
  const chapterNames = new Map(chapters.map((chapter) => [chapter.id, chapter.title]))
  const lines: string[] = []
  for (const module of modules) {
    const records = data[module.id] ?? []
    if (records.length === 0) continue
    lines.push(`【${module.name}】`)
    for (const record of records.slice(0, 12)) {
      const fields = resolveModuleFields(module, detail)
        .map((field) => {
          const value = record.fields[field.id]
          return value ? `${field.label}：${value}` : ''
        })
        .filter(Boolean)
      const links = [
        ...(record.characterIds ?? [])
          .map((id) => characterNames.get(id))
          .filter((name): name is string => Boolean(name))
          .map((name) => `角色：${name}`),
        ...(record.locationIds ?? [])
          .map((id) => locationNames.get(id))
          .filter((name): name is string => Boolean(name))
          .map((name) => `地点：${name}`),
        ...(record.chapterIds ?? [])
          .map((id) => chapterNames.get(id))
          .filter((name): name is string => Boolean(name))
          .map((name) => `章节：${name}`),
      ]
      lines.push(
        `- ${record.title || '未命名'}｜${record.status}${record.summary ? `｜${record.summary}` : ''}${links.length ? `｜${links.join('｜')}` : ''}${fields.length ? `｜${fields.join('｜')}` : ''}`,
      )
    }
  }
  return lines.length ? `【设定模块】\n${lines.join('\n')}` : ''
}

function templateContext(detail: WorkDetail): string {
  const template = resolveWorldTemplate(detail)
  if (!template) return ''
  const customFields = template.characterFields.map((field) => field.label)
  const factionFields = template.factionFields.map((field) => field.label)
  return `【世界模板】${template.name}${template.description ? `：${template.description}` : ''}\n术语：势力=${template.terms.faction}，领袖=${template.terms.leader}，成员=${template.terms.member}，下属单位=${template.terms.factionUnit}，职位=${template.terms.position}，等级=${template.terms.rank}，能力=${template.terms.ability}，物品=${template.terms.item}，货币=${template.terms.currency}${customFields.length ? `\n角色扩展字段：${customFields.join('、')}` : ''}${factionFields.length ? `\n势力扩展字段：${factionFields.join('、')}` : ''}`
}

function globalOutlineContext(detail: WorkDetail): string {
  const global = detail.globalOutline
  if (!global) return ''
  const lines = [
    global.premise ? `主线：${global.premise}` : '',
    global.theme ? `主题：${global.theme}` : '',
    global.conflict ? `主要矛盾：${global.conflict}` : '',
    global.structure ? `结构：${global.structure}` : '',
    global.mustResolve ? `必须回收的线：${global.mustResolve}` : '',
    global.rules ? `不能违背的规则：${global.rules}` : '',
  ].filter(Boolean)
  return lines.length ? `【全局大纲 · 高层】\n${lines.join('\n')}` : ''
}

function outlineContext(detail: WorkDetail, activeChapterId?: string): string {
  const outline = detail.outline ?? []
  if (outline.length === 0) return ''
  const cards = activeChapterId
    ? outline.filter((card) => card.chapterId === activeChapterId)
    : outline.filter((card) => card.status === '待写').slice(0, 1)
  if (cards.length === 0) return ''
  const lines = cards.map(
    (card, index) =>
      `- ${index + 1}. ${card.title || '未命名'}｜${card.status}｜概要：${card.summary || '未写'}｜目标：${card.goal || '未写'}｜冲突：${card.conflict || '未写'}`,
  )
  return `【当前章节大纲】\n${lines.join('\n')}\n只使用当前章节的任务；未来章节计划不在正文上下文中。`
}

function locationContext(
  detail: WorkDetail,
  focusText = '',
  characterIds?: Set<string>,
  factionIds?: Set<string>,
): string {
  const locations = detail.locations ?? []
  if (locations.length === 0) return ''
  const nameOf = (id?: string) =>
    locations.find((location) => location.id === id)?.name ?? '未标注'
  let selectedLocations = locations.slice(0, 30)
  if (focusText) {
    const ids = new Set<string>()
    for (const location of locations) {
      if (focusText.includes(location.name)) ids.add(location.id)
      if (factionIds?.has(location.factionId ?? '')) ids.add(location.id)
    }
    if (characterIds) {
      for (const character of detail.characters) {
        if (!characterIds.has(character.id) || !character.profile?.dynamic?.location) continue
        const location = locations.find(
          (item) => item.name === character.profile?.dynamic?.location,
        )
        if (location) ids.add(location.id)
      }
    }
    const direct = locations.filter((location) => ids.has(location.id))
    for (const location of direct) {
      if (location.parentId) ids.add(location.parentId)
    }
    selectedLocations = locations.filter((location) => ids.has(location.id)).slice(0, 20)
    if (selectedLocations.length === 0) selectedLocations = locations.slice(0, 8)
  }
  const selectedIds = new Set(selectedLocations.map((location) => location.id))
  const lines = selectedLocations.map((location) => {
    const faction = detail.factions.find((item) => item.id === location.factionId)
    return `- ${location.name || '未命名'}｜${location.type || '类型未定'}｜上级：${nameOf(location.parentId)}${faction ? `｜所属：${faction.name}` : ''}${location.description ? `｜${location.description}` : ''}`
  })
  const links = (detail.locationLinks ?? [])
    .filter((link) => selectedIds.has(link.fromId) || selectedIds.has(link.toId))
    .slice(0, 20)
    .map(
      (link) =>
        `- ${nameOf(link.fromId)} —${link.type || '相邻'}→ ${nameOf(link.toId)}${link.note ? `（${link.note}）` : ''}`,
    )
  return `【地点关系】\n${lines.join('\n')}${links.length ? `\n连接：\n${links.join('\n')}` : ''}`
}

function itemContext(
  detail: WorkDetail,
  focusText = '',
  characterIds?: Set<string>,
): string {
  let items = detail.items ?? []
  if (items.length === 0) return ''
  if (focusText) {
    const inventoryIds = new Set<string>()
    for (const character of detail.characters) {
      if (!characterIds?.has(character.id)) continue
      for (const entry of character.inventory ?? []) inventoryIds.add(entry.itemId)
    }
    const selected = items.filter(
      (item) => focusText.includes(item.name) || inventoryIds.has(item.id),
    )
    if (selected.length > 0) items = selected
    else items = []
  }
  if (items.length === 0) return ''
  const categories = detail.itemCategories ?? []
  const gradeNames =
    detail.itemGradeNames?.length === 10
      ? detail.itemGradeNames
      : ['一阶', '二阶', '三阶', '四阶', '五阶', '六阶', '七阶', '八阶', '九阶', '十阶']
  const categoryPath = (id: string): string => {
    const parts: string[] = []
    let current = categories.find((category) => category.id === id)
    let guard = 0
    while (current && guard < 20) {
      parts.unshift(current.name)
      current = current.parentId
        ? categories.find((category) => category.id === current?.parentId)
        : undefined
      guard += 1
    }
    return parts.join('/')
  }
  const lines = items.slice(0, 24).map(
    (item) =>
      `- ${item.name || '未命名'}｜${categoryPath(item.categoryId) || '未分类'}｜${gradeNames[item.grade - 1] ?? `${item.grade}阶`}${item.description ? `｜${item.description}` : ''}${item.notes ? `｜备注：${item.notes}` : ''}`,
  )
  return `【物品库】\n${lines.join('\n')}`
}

function systemContext(detail: WorkDetail): string {
  const system = detail.system
  if (!system?.enabled) return ''
  if (!resolveWorldTemplate(detail).features.system) return ''
  const host = detail.characters.find((character) => character.id === system.hostCharacterId)
  const tasks = system.tasks
    .filter((task) => task.status === '进行中' || task.status === '未触发')
    .slice(0, 12)
    .map(
      (task) =>
        `- ${task.title}｜${task.status}｜条件：${task.requirements || '未写'}｜奖励：${task.reward || '未写'}｜惩罚：${task.penalty || '未写'}`,
    )
  const rewards = system.rewards
    .slice(0, 12)
    .map(
      (reward) =>
        `- ${reward.name}｜${reward.type}｜效果：${reward.effect || '未写'}｜价格：${reward.cost}${reward.claimed ? '｜已领取' : ''}`,
    )
  const logs = system.logs
    .slice(0, 8)
    .map((log) => `- [${log.type}] ${log.content}`)
  return [
    '【系统】',
    `名称：${system.name}｜类型：${system.type}｜宿主：${host?.name || '未绑定'}｜公开：${system.visibility}`,
    `人格语气：${system.tone}｜人格：${system.personality || '未填写'}`,
    `规则：${system.rules || '未填写'}`,
    `余额：${system.balance} ${system.currencyName}`,
    tasks.length ? `进行中任务：\n${tasks.join('\n')}` : '进行中任务：暂无',
    rewards.length ? `奖励 / 兑换：\n${rewards.join('\n')}` : '',
    logs.length ? `最近日志：\n${logs.join('\n')}` : '',
    '写作规则：系统提示要符合上述人格；不得自行修改余额、新增任务或结算奖励，除非用户明确要求。',
  ]
    .filter(Boolean)
    .join('\n')
}


function reasoningInstruction(effort?: ReasoningEffort): string {
  switch (effort) {
    case 'fast':
      return '【推理强度】快速：优先推进剧情，减少铺陈和枝节，直接写到有效冲突。'
    case 'balanced':
      return '【推理强度】标准：在人物动机、场景推进和伏笔之间保持平衡。'
    case 'deep':
      return '【推理强度】深度：动笔前多检查人物关系、伏笔和前后因果，避免吃设定；但仍然只输出正文。'
    default:
      return ''
  }
}

function relationshipContext(
  detail: WorkDetail,
  characterIds?: Set<string>,
): string {
  if (detail.relationships.length === 0) return ''
  const nameOf = (id: string) =>
    detail.characters.find((character) => character.id === id)?.name || '未知角色'
  const relationships =
    characterIds && characterIds.size > 0
      ? detail.relationships.filter(
          (relationship) =>
            characterIds.has(relationship.fromId) || characterIds.has(relationship.toId),
        )
      : detail.relationships
  if (relationships.length === 0) return ''
  return relationships
    .slice(0, 40)
    .map(
      (relationship) =>
        `- ${nameOf(relationship.fromId)} → ${nameOf(relationship.toId)}：${relationship.type || '关联'}${
          relationship.note ? `（${relationship.note}）` : ''
        }`,
    )
    .join('\n')
}

function foreshadowingContext(
  detail: WorkDetail,
  focusText = '',
  characterIds?: Set<string>,
  factionIds?: Set<string>,
  chapters?: Chapter[],
  currentChapterId?: string,
): string {
  const pending = detail.foreshadowings.filter((item) => item.status === '未回收')
  if (pending.length === 0) return ''
  let selected = pending
  if (focusText) {
    const matched = pending.filter((item) => {
      if (focusText.includes(item.title) || focusText.includes(item.plantedIn)) return true
      if (item.note && focusText.includes(item.note.slice(0, 20))) return true
      if (item.truth && focusText.includes(item.truth.slice(0, 20))) return true
      if ((item.clues ?? []).some((clue) => clue && focusText.includes(clue.slice(0, 20)))) return true
      if ((item.relatedCharacterIds ?? []).some((id) => characterIds?.has(id))) return true
      if ((item.relatedFactionIds ?? []).some((id) => factionIds?.has(id))) return true
      return false
    })
    const main = pending.filter((item) => item.importance === '主线')
    const currentIndex = chapters
      ? chapters.findIndex((chapter) => chapter.id === currentChapterId)
      : -1
    const recentChapterIds = new Set(
      chapters && currentIndex >= 0
        ? chapters.slice(Math.max(0, currentIndex - 10), currentIndex).map((chapter) => chapter.id)
        : [],
    )
    const recentSide = pending.filter(
      (item) =>
        item.importance !== '主线' &&
        item.plantedChapterId &&
        recentChapterIds.has(item.plantedChapterId),
    )
    selected = [
      ...matched,
      ...main.filter((item) => !matched.includes(item)),
      ...recentSide.filter((item) => !matched.includes(item) && !main.includes(item)),
    ].slice(0, 20)
  }
  if (selected.length === 0) return ''
  return selected
    .map((item) => {
      const parts = [
        `- ${item.title || '未命名伏笔'}`,
        `类型：${item.type ?? '秘密'}`,
        `重要度：${item.importance ?? '支线'}`,
        `埋设于：${item.plantedIn || '未标注'}`,
        `计划回收：${item.payoffChapterId ? '已设置' : '未设置'}`,
        item.clues?.length ? `线索：${item.clues.join('；')}` : '',
        item.truth ? `真相：${item.truth}` : '',
        item.note || '',
      ].filter(Boolean)
      return parts.join('｜')
    })
    .join('\n')
}

function styleContext(detail: WorkDetail, chapter?: Chapter): string {
  return formatStyleCard(detail.style, chapter?.styleOverride)
}

export function buildCompactStateUpdateMessages(input: StateUpdateInput): ChatMessage[] {
  const { work, detail, chapter, content } = input
  const characters = selectFocusCharacters(detail, content, 4)
  const factions = selectFocusFactions(detail, content, 3)
  const characterLines = characters.map(
    (character) =>
      `- id=${character.id}｜${character.name}｜状态=${character.status || '未定'}｜身份=${character.identity || '未定'}`,
  )
  const factionLines = factions.map(
    (faction) =>
      `- id=${faction.id}｜${faction.name}｜类型=${faction.type || '未定'}｜层级=${faction.tierLevel ?? '未定'}`,
  )
  const system = [
    '你是小说设定同步器。只根据正文提取已发生事实，输出一个紧凑 JSON，不要 markdown 或解释。',
    '结构：{"summary":"1-2句","events":[{"title":"","summary":"","participants":["人物名"],"location":"","cause":"","result":"","consequences":[],"importance":"low|medium|high","status":"canon"}],"openThreads":[],"resolvedThreads":[],"changes":[{"entityType":"character|faction|item|location|species|foreshadowing","entityId":"","field":"","action":"set","value":""}],"characterExperiences":[{"characterId":"","characterName":"","title":"","summary":"","knowledgeScope":"亲身经历|亲眼所见|听别人说|传闻|自己推断|秘密知情","learned":[],"importance":"core|major|minor","status":"canon"}],"characterIssues":[],"factionIssues":[]}',
    'events 最多 3 条，changes 最多 8 条，characterExperiences 最多 4 条；字段短，JSON 必须闭合。',
    '只写正文明确发生的事；没有变化就不写；不要输出 newEntities、完整档案、设施明细。',
    'importance：主线/关键关系 high，一般推进 medium，气氛 low。',
    input.scope === 'scoped'
      ? '只处理焦点人物、焦点势力和正文新出现的实体；不要审查范围外角色。'
      : '',
  ].join('\n')
  const user = [
    `【作品】${work.title}`,
    `【章节】${chapter.title}`,
    `【焦点人物】\n${characterLines.join('\n') || '（无）'}`,
    `【焦点势力】\n${factionLines.join('\n') || '（无）'}`,
    `【长期未解决事项】\n${
      resolveStoryThreads(detail)
        .filter((thread) => thread.status === 'open')
        .slice(0, 8)
        .map((thread) => `- ${thread.text}`)
        .join('\n') || '（无）'
    }`,
    `【本章正文】\n${clip(content, 5000)}`,
    '请输出紧凑 JSON。',
  ].join('\n\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

export interface StateUpdateInput {
  work: Work
  detail: WorkDetail
  chapter: Chapter
  chapters?: Chapter[]
  content: string
  reasoningEffort?: ReasoningEffort
  scope?: 'full' | 'scoped'
}

export function buildStateUpdateMessages(input: StateUpdateInput): ChatMessage[] {
  const { work, detail, chapter, content } = input
  const characterLines = detail.characters
    .map((character) => {
      const realmScheme = characterRealmScheme(detail, character.realmSchemeId)
      const realmLevel =
        realmScheme && character.realmLevel
          ? realmScheme.levels[character.realmLevel - 1]
          : undefined
      const realmText = realmLevel
        ? `${realmScheme?.name ?? '境界'}·${realmLevel.name}${character.realmSublevel ? `·${realmLevel.sublevels?.[character.realmSublevel - 1] ?? character.realmSublevel}` : ''}`
        : character.cultivation || '未定'
      const inventoryText = (character.inventory ?? [])
        .map((entry) => {
          const item = detail.items?.find((current) => current.id === entry.itemId)
          return item ? `${item.name}×${entry.quantity}` : ''
        })
        .filter(Boolean)
        .join('、')
      return `- id=${character.id}｜${character.name || '未命名'}｜状态=${character.status || '未定'}｜等级=${realmText}｜职位=${character.position || '未定'}｜宗门=${detail.factions.find((faction) => faction.id === character.sectId)?.name || '无'}｜货币=${character.currency || '未定'}｜背包=${inventoryText || '空'}｜武器：${(character.weapons ?? []).join('、') || '无'}｜法宝：${(character.treasures ?? []).join('、') || '无'}｜功法：${(character.techniques ?? []).join('、') || '无'}`
    })
    .join('\n')
  const auditCharacters = selectFocusCharacters(detail, content, 4)
  const auditProfiles = auditCharacters
    .map((character) => {
      const realmScheme = characterRealmScheme(detail, character.realmSchemeId)
      const realmLevel =
        realmScheme && character.realmLevel
          ? realmScheme.levels[character.realmLevel - 1]
          : undefined
      return buildCharacterProfilePrompt(character, {
        mode: 'writing',
        detail,
        includeKnowledge: true,
        maxSamples: 2,
        activeNames: auditCharacters.map((item) => item.name),
        extraLines: realmLevel
          ? [`结构化境界：${realmScheme?.name ?? '境界'}·${realmLevel.name}${character.realmSublevel ? `·小境界 ${character.realmSublevel}` : ''}`]
          : [],
      })
    })
    .join('\n\n')
  const dismissedIssues = collectDismissedIssues(detail)
  const dismissedIssueLines = dismissedIssues
    .slice(-20)
    .map(
      (issue) =>
        `- ${issue.characterName}｜${issue.type}｜${issue.quote || issue.reason}`,
    )
    .join('\n')
  const experienceReference = auditCharacters
    .map((character) => {
      const currentIndex = input.chapters
        ? input.chapters.findIndex((item) => item.id === chapter.id)
        : -1
      const chapterIndex = new Map(
        (input.chapters ?? []).map((item, index) => [item.id, index]),
      )
      const experiences = normalizeCharacterExperiences(character.experiences)
        .filter((experience) => experience.status !== 'retconned')
        .filter((experience) => {
          if (!input.chapters?.length || currentIndex < 0 || !experience.chapterId) return true
          const index = chapterIndex.get(experience.chapterId)
          return index === undefined || index <= currentIndex
        })
        .slice(-8)
      if (experiences.length === 0) return ''
      return [
        `【${character.name}（id=${character.id}）】`,
        ...experiences.map(
          (experience) =>
            `- ${experience.chapterNumber ? `第${experience.chapterNumber}章` : '未标章节'}｜${experience.title}｜${KNOWLEDGE_SCOPE_LABELS[experience.knowledgeScope]}｜${experience.summary.slice(0, 220)}${experience.learned.length ? `｜学到：${experience.learned.slice(0, 3).join('；')}` : ''}`,
        ),
      ].join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
  const auditFactions = selectFocusFactions(detail, content, 3)
  const facilitySummaryFor = (faction: (typeof detail.factions)[number]): string[] => {
    const facilities = normalizeFacilities(faction.facilities)
    const tierScheme = factionTierScheme(detail)
    const tier = tierScheme && faction.tierLevel ? tierScheme.levels[faction.tierLevel - 1] : undefined
    const lines: string[] = []
    if (tier) lines.push(`结构化势力层级：${tierScheme?.name ?? '层级'}·${tier.name}`)
    if (facilities.length > 0) {
      lines.push(
        `驻地设施：${facilities
          .map((facility) => {
            const counts = normalizeFacilityCounts(facility.counts)
            const resources = (facility.resources ?? [])
              .map((entry) => {
                const item = detail.items?.find((current) => current.id === entry.itemId)
                return item ? `${item.name}×${entry.quantity}` : ''
              })
              .filter(Boolean)
              .join('、')
            return `${facility.name}（${facility.type}｜长老${counts.elder}/亲传${counts.main}/内门${counts.inner}/外门${counts.outer}/杂役${counts.menial}${facility.keeper ? `｜负责人${facility.keeper}` : ''}${resources ? `｜资源${resources}` : ''}${facility.effect ? `｜作用${facility.effect}` : ''}）`
          })
          .join('；')}`,
      )
      const totals = factionFacilityTotals(facilities)
      lines.push(
        `设施人数汇总：长老${totals.elder}/亲传${totals.main}/内门${totals.inner}/外门${totals.outer}/杂役${totals.menial}`,
      )
    }
    if (faction.warehouse?.length) {
      lines.push(
        `仓库：${faction.warehouse
          .map((entry) => {
            const item = detail.items?.find((current) => current.id === entry.itemId)
            return item ? `${item.name}×${entry.quantity}` : ''
          })
          .filter(Boolean)
          .join('、')}`,
      )
    }
    return lines
  }
  const auditFactionProfiles = auditFactions
    .map((faction) =>
      buildFactionProfilePrompt(faction, {
        mode: 'audit',
        detail,
        maxRelations: 8,
        extraLines: [
          ...facilitySummaryFor(faction),
          '只检查本章明确写到的组织行为，不要推测。',
        ],
      }),
    )
    .join('\n\n')
  const dismissedFactionIssueLines = collectDismissedFactionIssues(detail)
    .slice(-20)
    .map(
      (issue) =>
        `- ${issue.factionName}｜${issue.type}｜${issue.quote || issue.reason}`,
    )
    .join('\n')
  const factionLines = detail.factions
    .map((faction) => {
      const scheme = factionTierScheme(detail)
      const tier = scheme && faction.tierLevel ? scheme.levels[faction.tierLevel - 1] : undefined
      const facilities = normalizeFacilities(faction.facilities)
        .map((facility) => {
          const counts = normalizeFacilityCounts(facility.counts)
          const total =
            counts.elder + counts.main + counts.inner + counts.outer + counts.menial
          return `${facility.name}(${total}人)`
        })
        .join('、')
      const warehouseCount = (faction.warehouse ?? []).reduce(
        (sum, entry) => sum + Math.max(0, entry.quantity),
        0,
      )
      return `- id=${faction.id}｜${faction.name || '未命名'}｜首领=${faction.leader || '未定'}｜类型=${faction.type || '未定'}｜层级=${tier?.name || '未定'}｜设施=${facilities || '无'}｜仓库=${warehouseCount}件｜${faction.description || ''}`
    })
    .join('\n')
  const itemLines = (detail.items ?? [])
    .slice(0, 80)
    .map((item) => {
      const category = detail.itemCategories?.find((entry) => entry.id === item.categoryId)
      const scheme = schemeById(detail.tierSchemes, category?.tierSchemeId)
      const tier = scheme?.levels[item.grade - 1]
      return `- id=${item.id}｜${item.name || '未命名'}｜分类=${category?.name || '未分类'}（id=${category?.id || '无'}）｜品阶=${tier?.name || `${item.grade}阶`}｜${item.description || ''}｜备注=${item.notes || '无'}`
    })
    .join('\n')
  const speciesLines = (detail.species ?? [])
    .slice(0, 60)
    .map(
      (species) =>
        `- id=${species.id}｜${species.name || '未命名'}｜分类=${species.category || '未分类'}（id=${species.categoryId || '无'}）｜阶位=${species.tierLevel ?? '未定'}｜${species.habitat || ''}｜${species.abilities.slice(0, 4).join('、') || '无能力'}｜${species.notes || ''}`,
    )
    .join('\n')
  const locationLines = (detail.locations ?? [])
    .map(
      (location) =>
        `- id=${location.id}｜${location.name || '未命名'}｜${location.type || '类型未定'}｜${location.description || ''}｜备注=${location.notes || '无'}`,
    )
    .join('\n')
  const foreshadowLines = detail.foreshadowings
    .map(
      (item) =>
        `- id=${item.id}｜${item.title}｜${item.status}｜${item.type ?? '秘密'}/${item.importance ?? '支线'}｜计划回收：${item.payoffChapterId ? '已设置' : '未设置'}｜${item.note}`,
    )
    .join('\n')
  const relationshipLines = (detail.relationships ?? [])
    .map((item) => {
      const from = detail.characters.find((character) => character.id === item.fromId)?.name ?? item.fromId
      const to = detail.characters.find((character) => character.id === item.toId)?.name ?? item.toId
      return `- id=${item.id}｜${from} → ${to}｜${item.type}｜${item.note}`
    })
    .join('\n')
  const systemLine = detail.system
    ? `- id=system｜${detail.system.name || '系统'}｜余额=${detail.system.balance} ${detail.system.currencyName || '积分'}`
    : ''
  const moduleLines = Object.entries(detail.moduleData ?? {})
    .flatMap(([moduleId, records]) =>
      records.map(
        (record) =>
          `- module=${moduleId}｜id=${record.id}｜${record.title || '未命名'}｜状态=${record.status || '未定'}`,
      ),
    )
    .join('\n')

  const system = [
    '你是小说设定同步器。只根据【本章正文】和【已有实体】提取已经发生的事件、状态变化和未解决事项，生成给写作软件使用的 JSON。',
    '只输出一个 JSON 对象，不要 markdown、解释或前后缀。',
    'JSON 结构：',
    '{"summary":"截至本章的剧情摘要，1-3 句，不剧透未来","events":[{"title":"事件标题","summary":"事件经过","participants":["人物名"],"location":"地点名","cause":"原因","result":"结果","consequences":["尚未解决的后果"],"importance":"low|medium|high","status":"canon|rumor|retconned"}],"openThreads":["本章结束时仍未解决的线索/承诺/威胁"],"resolvedThreads":["本章明确回收的旧线索/承诺/威胁"],"newEntities":[{"entityType":"character|faction|location|item|species|foreshadowing|relationship","id":"临时 id，如 new-c1","name":"名称","role":"身份定位","identity":"身份","sectId":"已有或临时宗门 id","type":"类型","description":"描述","leader":"首领","location":"所在地","title":"伏笔标题","plantedIn":"埋设章节","note":"备注","fromId":"人物 id 或临时 id","toId":"人物 id 或临时 id","relationType":"关系类型","categoryId":"物品分类 id","grade":1,"profile":{},"data":{}}],"characterExperiences":[{"characterId":"已有或临时人物 id","characterName":"人物名","chapterId":"可选，本章 id","title":"经历标题","summary":"发生了什么","participants":["人物名"],"location":"地点","cause":"原因","result":"结果","knowledgeScope":"亲身经历|亲眼所见|听别人说|传闻|自己推断|秘密知情","learned":["这次经历后新知道的事"],"relationshipChanges":[{"targetName":"对象","type":"关系","change":"变化"}],"injuries":"伤势","possessions":"持有物变化","emotionalImpact":"情绪影响","importance":"core|major|minor","status":"canon|rumor|retconned"}],"changes":[{"entityType":"character|faction|location|item|species|foreshadowing|relationship|system|module","entityId":"已有 id 或临时 id","field":"字段","action":"set|add|remove","value":"字符串/数字/布尔/数组/对象均可","note":"依据"}],"characterIssues":[{"characterName":"角色名","type":"knowledge|voice|behavior|other","quote":"正文原句","reason":"违反了什么设定","severity":"low|medium|high"}],"factionIssues":[{"factionName":"势力名","type":"resources|knowledge|hierarchy|doctrine|behavior|other","quote":"正文原句","reason":"违反了什么组织设定","severity":"low|medium|high"}]}',
    'value 可以是字符串、数字、布尔、数组或对象。profile、facilities、warehouse、peaks、elders、mainDisciples、attributes 等对象/数组字段直接输出结构化值，不要字符串化。',
    'profile 字段会与现有深度档案递归合并，只写变化的子字段即可；facilities / warehouse / peaks / elders / mainDisciples 是整组替换，必须输出完整数组。',
    '事件要求：每章 2–8 条原子事件；只写正文里已经发生的，不要推测未来；不要把同一件事拆成多条。',
    'importance：影响主线/重要关系/关键物品的用 high；一般推进用 medium；气氛和小动作不要记。',
    'status：正文明确发生的用 canon；角色只是听说/误传的用 rumor；不要输出 retconned。',
    'openThreads：只列本章结束时仍未解决的后果，例如未履行的承诺、未爆发的威胁、未解开的秘密。',
    'resolvedThreads：本章正文里明确兑现或彻底放弃的旧线索；必须与【长期未解决事项】文本对应，没有就空数组。',
    'newEntities：正文里出现了【已有实体】列表之外的新人物、宗门、地点、物品、物种、伏笔或人物关系时必须抽取。',
    '只抽取有名有姓、有身份、会继续出现或影响剧情的实体；路人和一次性背景不要建。',
    '新实体使用临时 id（如 new-c1/new-f1/new-l1/new-i1/new-sp1/new-r1），后续 changes 可以用临时 id 指向它。',
    'newEntities 的 profile 可带新角色/新势力的完整深度档案；新势力的 data 可带 facilities、warehouse、tierLevel；新物种的 profile 可带完整物种档案。',
    '已有实体不要重复放进 newEntities；同一人物/宗门只出现一次；newEntities 最多 20 个，没有就空数组。',
    'relationship 的 fromId/toId 可以是已有 id、临时 id 或人物姓名；relationType 例如 师徒、同门、宿敌。',
    '允许的状态字段（带 profile 的实体支持完整深度档案；对象会递归合并，数组字段按整组替换）：',
    'character: status, cultivation, position, sectId, identity, role, personality, goal, appearance, background, gender, age, spiritRoot, physique, talent, currency, weapons, treasures, techniques, mood, currentGoal, injuries, location, possessions, realmSchemeId, realmLevel, realmSublevel, inventory, attributes, speciesId, lifecycle, profile；',
    'faction: leader, type, description, goal, location, founded, motto, parentId, leaderId, stage, leaderState, morale, treasury, forces, territory, diplomacy, internalStruggle, currentOperation, publicImage, tierLevel, facilities, warehouse, peaks, elders, mainDisciples, outerDisciples, innerDisciples, menialDisciples, speciesIds, assets, techniques, attributes, lifecycle, profile；',
    'location: name, description, notes, type, parentId；',
    'item: name, description, notes, categoryId, grade, lifecycle；',
    'species: name, category, categoryId, origin, habitat, appearance, physiology, lifespan, society, language, culture, relations, notes, abilities, weaknesses, variants, tags, tierLevel, lifecycle, profile（完整物种档案）；',
    'foreshadowing: status（只能是 未回收 或 已回收）, title, note, plantedIn, type, importance, payoffChapterId；',
    'relationship: type, note（只能修改已有关系）；',
    'system: balance（只改余额，不改任务、奖励、日志）；',
    'module: status, fields.<fieldId>（只能修改已有模块记录）。',
    '深度档案 profile 包含核心矛盾、表层/真实性格、价值观、恐惧、欲望、羞耻、道德底线、成长弧、语言档案、行为习惯、偏好、认知边界、关系备注、阶段、动态状态和元信息。正文明确改变某条设定时才写入；只写变化字段，未变化的不要编。',
    'facilities 每项包含 id/name/type/description/keeper/effect/counts{elder,main,inner,outer,menial}/resources[{itemId,quantity}]；设施人员或资源发生变化时输出完整设施数组。warehouse 是 {itemId,quantity} 数组。',
    'characterExperiences 只写本章真正发生、角色真正参与 / 目击 / 听到的个人经历；没有新经历就空数组。不要重复【核心角色已有经历】里的同一条。',
    '每条经历必须写 knowledgeScope；learned 只写“这次经历后角色新知道的事”，不要把全局真相直接写成所有角色的认知。听别人说 / 传闻 / 自己推断允许不等于事实。',
    'characterExperiences 最多 12 条；summary 只写一句到两句，不要复制整段正文；同一角色同一章同一件事只写一条。',
    '动态状态：mood=当前情绪，currentGoal=当前目标，injuries=伤势/身体状态，location=当前所在地，possessions=当前持有物。只有正文明确写到或可以直接从动作推断时才输出，不要猜测；没有变化就省略。',
    '角色一致性检查：只根据【角色一致性参考】检查本章正文。characterIssues 只列真正的矛盾，最多 6 条；没有就空数组。重点检查：角色是否知道了认知边界之外的信息；是否说了“绝不说”里的话；是否做出明显违反核心矛盾、价值观或行为习惯的重要行为。不要把成长、故意反常、撒谎或隐藏真实想法误判为矛盾。quote 必须逐字摘自本章正文，reason 要具体到哪一条设定。',
    '作者已经把一些误报标记为“不是问题”；【已豁免的角色一致性提示】里的同一角色 + 同一类型 + 同一句不要再重复输出。豁免只针对同一句，不要放过新的同类问题。',
    '势力一致性检查：只根据【势力一致性参考】检查本章正文。factionIssues 只列真正的矛盾，最多 6 条；没有就空数组。重点检查：是否使用了势力不拥有的资源；是否知道了情报边界外的事；是否绕过权力 / 决策流程；是否违反红线或宗旨却没有代价；是否在士气 / 财政 / 武力不足时做出不可能的组织行动；是否把整个组织写成了一个人。不要把内部派系斗争、故意阳奉阴违或组织成长误判为矛盾。',
    '作者已豁免的势力提示（【已豁免的势力一致性提示】）里的同一势力 + 同一类型 + 同一句不要重复输出。',
    '必须输出完整闭合的 JSON；events 最多 8 条，changes 只列重要变化；描述尽量短，不要写 Markdown 或解释。',
    '禁止把未来计划写成已发生；禁止编造正文没有出现的实体。',
    '没有变化的实体不要输出。正文没写清楚的，不要猜。',
    input.scope === 'scoped'
      ? '本次是范围同步：只处理【已有角色】【已有势力】【已有物品】等列表里出现的实体，以及正文中新出现的实体；不要审查列表外的实体，不要给列表外实体输出 changes / issues。'
      : '',
    reasoningInstruction(input.reasoningEffort),
  ]
    .filter(Boolean)
    .join('\n')

  const user = [
    `【作品】${work.title}｜${work.genres.join('、')}｜${work.synopsis}`,
    `【章节】${chapter.title}`,
    `【已有角色】\n${characterLines || '（无）'}`,
    `【已有势力】\n${factionLines || '（无）'}`,
    `【已有地点】\n${locationLines || '（无）'}`,
    `【已有物品】\n${itemLines || '（无）'}`,
    `【已有物种】\n${speciesLines || '（无）'}`,
    `【已有伏笔】\n${foreshadowLines || '（无）'}`,
    `【长期未解决事项】\n${
      resolveStoryThreads(detail)
        .filter((thread) => thread.status === 'open')
        .slice(0, 24)
        .map((thread) => `- ${thread.text}`)
        .join('\n') || '（无）'
    }`,
    `【已有关系】\n${relationshipLines || '（无）'}`,
    systemLine ? `【系统】\n${systemLine}` : '',
    `【已有模块记录】\n${moduleLines || '（无）'}`,
    auditProfiles ? `【角色一致性参考】\n${auditProfiles}` : '',
    experienceReference ? `【核心角色已有经历（不要重复）】\n${experienceReference}` : '',
    dismissedIssueLines
      ? `【已豁免的角色一致性提示（不要重复报告）】\n${dismissedIssueLines}`
      : '',
    auditFactionProfiles ? `【势力一致性参考】\n${auditFactionProfiles}` : '',
    dismissedFactionIssueLines
      ? `【已豁免的势力一致性提示（不要重复报告）】\n${dismissedFactionIssueLines}`
      : '',
    `【本章正文】\n${clip(content, 7000)}`,
    '请提取本章事件、未解决事项、角色 / 势力动态状态和一致性检查结果。',
  ]
    .filter(Boolean)
    .join('\n\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

export interface GenerationInput {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  chapter: Chapter
  baseContent: string
  directive: string
  prompts: Prompt[]
  reasoningEffort?: ReasoningEffort
  retrievedMemories?: RetrievedMemory[]
  api?: ApiConfig
  outputReserve?: number
}

export interface ContextSectionReport {
  title: string
  layer: string
  tokens: number
  dropped: boolean
  reason: string
}

export interface GenerationContextReport {
  budget: EffectiveContextBudget
  systemTokens: number
  userTokens: number
  totalTokens: number
  sections: ContextSectionReport[]
  dropped: ContextSectionReport[]
  warnings: string[]
}

export interface GenerationContext {
  messages: ChatMessage[]
  report: GenerationContextReport
}

function outlineForChapter(detail: WorkDetail, chapterId: string) {
  return (detail.outline ?? []).find((card) => card.chapterId === chapterId)
}

function buildDirectorBrief(
  detail: WorkDetail,
  chapter: Chapter,
  focusCharacters: ReturnType<typeof selectFocusCharacters>,
  anchors: ReturnType<typeof buildWritingAnchors>,
): string {
  const outline = outlineForChapter(detail, chapter.id)
  const goal = [
    outline?.goal || '',
    outline?.summary || '',
    chapter.summary || '',
    chapter.beats?.advance ? `推进：${chapter.beats.advance}` : '',
  ]
    .filter(Boolean)
    .join('；')
    .slice(0, 320)
  const cast = focusCharacters
    .slice(0, 6)
    .map((character) => {
      const dynamic = character.profile?.dynamic
      const wants = dynamic?.currentGoal || character.goal || '目标未定'
      const mood = dynamic?.mood ? `，情绪：${dynamic.mood}` : ''
      const injuries = dynamic?.injuries ? `，伤势：${dynamic.injuries}` : ''
      return `${character.name}（${wants}${mood}${injuries}）`
    })
    .join('、')
  const threads = resolveStoryThreads(detail)
    .filter((thread) => thread.status === 'open' && thread.priority === 'main')
    .slice(0, 4)
    .map((thread) => thread.text)
  const conflict = [outline?.conflict, detail.globalOutline?.conflict].filter(Boolean).join('；')
  const lines = [
    '【导演简报】',
    `本章：${chapter.title || '未命名章节'}${goal ? `｜${goal}` : ''}`,
    cast ? `在场：${cast}` : '',
    conflict ? `核心冲突：${conflict}` : '',
    threads.length ? `不能丢的主线：${threads.join('；')}` : '',
    anchors.section ? '连续性锚点已放在后文，写作时优先遵守。' : '',
  ].filter(Boolean)
  return lines.length > 1 ? lines.join('\n') : ''
}

function buildHardConstraints(
  chapter: Chapter,
  focusCharacters: ReturnType<typeof selectFocusCharacters>,
  anchors: ReturnType<typeof buildWritingAnchors>,
): string {
  const names = focusCharacters.slice(0, 6).map((character) => character.name).filter(Boolean)
  const neverSays = focusCharacters
    .slice(0, 4)
    .flatMap((character) =>
      (character.profile?.voice?.neverSays ?? [])
        .slice(0, 2)
        .map((line) => `${character.name}绝不说“${line}”`),
    )
    .slice(0, 6)
  const injuries = focusCharacters
    .filter((character) => character.profile?.dynamic?.injuries)
    .slice(0, 4)
    .map((character) => `${character.name}：${character.profile?.dynamic?.injuries}`)
  return [
    '【本次硬约束】',
    '已发生事实、当前状态优先于深层档案里的旧描述；冲突时不要自行改设定。',
    names.length ? `在场角色：${names.join('、')}；只能使用各自认知边界内的信息。` : '',
    injuries.length ? `伤势 / 状态：${injuries.join('；')}` : '',
    neverSays.length ? `语言禁区：${neverSays.join('；')}` : '',
    chapter.summary ? `本章已发生：${chapter.summary.slice(0, 200)}` : '',
    anchors.section ? '连续性锚点里的地点、伤势、目标和主线必须保持。' : '',
    '不要写总结、不要替角色解释动机、不要提前知道未来信息。',
  ]
    .filter(Boolean)
    .join('\n')
}

function contextConflictWarnings(
  detail: WorkDetail,
  focusCharacters: ReturnType<typeof selectFocusCharacters>,
): string[] {
  const warnings: string[] = []
  for (const character of focusCharacters) {
    const status = String(character.status ?? '')
    const dynamic = character.profile?.dynamic
    if (/死亡|已死|阵亡|下线/.test(status)) {
      if (dynamic?.currentGoal || dynamic?.mood || dynamic?.location) {
        warnings.push(
          `${character.name} 的状态是“${status}”，但动态档案里仍有目标 / 情绪 / 位置；写作时以当前事实和状态为准。`,
        )
      }
    }
    const location = dynamic?.location
    if (location && detail.locations?.length) {
      const known = detail.locations.some(
        (item) =>
          item.name &&
          (item.name === location ||
            location.includes(item.name) ||
            item.name.includes(location)),
      )
      if (!known) {
        warnings.push(`${character.name} 的动态位置“${location}”不在地点库里，可能已经过期。`)
      }
    }
  }
  return warnings.slice(0, 6)
}

export function buildGenerationMessages(input: GenerationInput): ChatMessage[] {
  return buildGenerationContext(input).messages
}

export function buildGenerationContext(input: GenerationInput): GenerationContext {
  const { work, detail, chapters, chapter, baseContent, directive, prompts } = input
  const index = chapters.findIndex((item) => item.id === chapter.id)
  const previous = index > 0 ? chapters[index - 1] : null
  const focusText = [
    directive,
    chapter.title,
    baseContent.slice(-4000),
    previous?.content?.slice(-2500) ?? '',
    ...prompts.map((prompt) => prompt.content),
  ].join('\n')

  const system = [
    '你是一位擅长中文长篇小说的职业作者，正在与导演合作完成一部长篇小说。',
    '必须遵守以下规则：',
    '1. 只输出小说正文，不写标题、说明、提纲、分析或「以下是正文」之类的提示。',
    '2. 严格服从【导演指令】，不擅自改变人物动机、世界观和已经发生的事实。',
    '3. 保持与【本章已有正文】一致的人称、语气、节奏和断句习惯，从最后一句自然接续。',
    '4. 不重复已有段落；不替读者总结情绪；用动作、对白和细节推进剧情。',
    '5. 默认写 800–1500 个汉字；导演指令另有字数要求时以指令为准。',
    '6. 不要在本场结尾写「未完待续」等元叙述。',
    '7. 每个角色必须按【当前场景核心角色】里的说话方式、行为习惯和认知边界写；不同角色不能共用同一种语气。',
    '8. 角色只能使用自己知道的信息；不要让人物说出他不知道的事，也不要把秘密直接讲给读者，除非叙事视角允许。',
    '9. 势力必须按【当前场景核心势力】里的公开形象、决策方式、资源约束、内部派系和情报边界来表现；用组织行为、成员反应和制度运作体现，不要让整个势力像一个人一样思考。',
    '10. 叙述遵循【写作风格】；对白优先各角色的语言档案；如果本章有场景覆盖，以场景覆盖为最高优先级。',
    '11. 每个角色只能基于【个人经历与认知边界】行动：没有亲身经历、亲眼所见、听说或推断依据的信息，不能表现出知道；听说和传闻不等于事实，可以误解；未来章节的信息不能提前知道。',
    '12. 按【文笔要求】和【语感锚点】写：不要写剧情摘要；用具体动作、物件、停顿和带潜台词的对白表现情绪；长短句交替；不要堆叠“仿佛 / 似乎 / 不禁 / 不由得”等套话。',
    '13. 按【情感与心理】写：心理不是情绪标签；允许自由间接心理，但每场只写一次真正的情绪转折，保留未说出口的动机。',
    reasoningInstruction(input.reasoningEffort),
  ]
    .filter(Boolean)
    .join('\n')

  const sections: string[] = []

  sections.push(
    joinSections([
      '【作品设定】',
      `书名：${work.title}`,
      `题材：${work.genres.join('、') || '未设定'}`,
      `叙事视角：${perspectiveLabel(work.perspective)}`,
      `写作模式：${writingModeLabel(resolveWritingMode(work, detail))}`,
      `目标字数：${work.targetWords} 字`,
      `简介：${work.synopsis || '未填写'}`,
      `主题：${work.theme || '未填写'}`,
      detail.worldview ? `世界观：${detail.worldview}` : '',
    ]),
  )

  const contextOptions = resolveContextOptions(work)
  const anchors = buildWritingAnchors(detail, chapters, chapter)
  const focusCharacters = selectFocusCharacters(detail, focusText, 6)
  const focusCharacterIds = new Set(focusCharacters.map((character) => character.id))
  for (const id of anchors.characterIds) focusCharacterIds.add(id)
  const focusFactions = selectFocusFactions(detail, focusText, 3)
  const focusFactionIds = new Set(focusFactions.map((faction) => faction.id))
  for (const id of anchors.factionIds) focusFactionIds.add(id)
  const characters = characterContext(
    detail,
    focusText,
    chapters,
    chapter.id,
    index + 1,
    anchors.characterIds,
  )
  if (contextOptions.state && characters) sections.push(`【主要角色】\n${characters}`)
  const species = speciesContext(detail, focusText)
  if (contextOptions.state && species) sections.push(species)

  if (contextOptions.state) sections.push(templateContext(detail))

  if (contextOptions.globalOutline) {
    const globalOutline = globalOutlineContext(detail)
    if (globalOutline) sections.push(globalOutline)
  }
  if (contextOptions.chapterOutline) {
    const outline = outlineContext(detail, chapter.id)
    if (outline) sections.push(outline)
  }

  const locations = locationContext(detail, focusText, focusCharacterIds, focusFactionIds)
  if (contextOptions.state && locations) sections.push(locations)

  const items = itemContext(detail, focusText, focusCharacterIds)
  if (contextOptions.state && items) sections.push(items)

  const systemSection = systemContext(detail)
  if (contextOptions.state && systemSection) sections.push(systemSection)

  const moduleSection = moduleContext(detail, chapters)
  if (contextOptions.state && moduleSection) sections.push(moduleSection)

  if (contextOptions.events) {
    const continuity = continuityContext(detail)
    if (continuity) sections.push(continuity)
    const memories = chapterMemoryContext(detail, chapter.id)
    if (memories) sections.push(memories)
    const localSummaries = localChapterSummaryContext(detail, chapters, chapter.id)
    if (localSummaries) sections.push(localSummaries)
    const arcSummary = arcSummaryContext(detail, chapters, chapter.id)
    if (arcSummary) sections.push(arcSummary)
  }

  if (contextOptions.state) {
    const storyMemory = ensureStoryMemory(detail, chapters)
    const memorySections = buildMemoryContextSections({
      detail,
      chapters,
      chapter,
      focusText,
      memory: storyMemory,
      retrievedMemories: input.retrievedMemories,
    })
    sections.push(...memorySections)
  }

  const factions = factionContext(detail, focusText, index + 1, anchors.factionIds)
  if (contextOptions.state && factions) sections.push(`【势力】\n${factions}`)

  const relationships = relationshipContext(detail, focusCharacterIds)
  if (contextOptions.state && relationships) sections.push(`【人物关系】\n${relationships}`)

  if (contextOptions.foreshadowings) {
    const foreshadowings = foreshadowingContext(
      detail,
      focusText,
      focusCharacterIds,
      focusFactionIds,
      chapters,
      chapter.id,
    )
    if (foreshadowings) sections.push(`【未回收伏笔】\n${foreshadowings}`)
  }

  if (anchors.section) sections.push(anchors.section)

  sections.push(`【写作风格】\n${styleContext(detail, chapter)}`)
  sections.push(`【文笔要求】\n${buildProseContractSection()}`)
  const emotionSection = buildEmotionSceneSection(detail.style)
  if (emotionSection) sections.push(emotionSection)
  const styleAnchors = buildStyleAnchorSection(chapters, chapter.id, detail.style)
  if (styleAnchors) sections.push(styleAnchors)

  if (prompts.length > 0) {
    sections.push(
      `【本作启用的写作提示词】\n${prompts
        .map((prompt) => `- ${prompt.title}：${prompt.content}`)
        .join('\n')}`,
    )
  }

  const structureStart = Math.max(0, index - 9)
  const structureEnd = Math.min(chapters.length, Math.max(index + 1, index + 4))
  sections.push(
    `【章节结构】\n${chapters
      .slice(structureStart, structureEnd)
      .map(
        (item, offset) =>
          `第 ${structureStart + offset + 1} 章 ${item.title || '未命名章节'}（${chapterWords(item)} 字）`,
      )
      .join('\n')}`,
  )

  if (baseContent.trim()) {
    sections.push(
      `【本章已有正文，共 ${countWords(baseContent)} 字】\n${chapterBaseContext(baseContent, chapter)}`,
    )
  } else if (previous && previous.content.trim()) {
    sections.push(
      `【上一章结尾】\n第 ${index} 章 ${previous.title || '未命名章节'}\n${clip(previous.content, 1600)}`,
    )
    sections.push('【本章已有正文】\n（这一章还没有正文，请从开头写起。）')
  } else {
    sections.push('【本章已有正文】\n（这一章还没有正文，请从开头写起。）')
  }

  sections.push(`【导演指令】\n${directive}`)

  sections.push(
    `【本次写作任务】\n第 ${index + 1} 章 ${chapter.title || '未命名章节'}。请根据导演指令续写本章，直接从正文开始，不要解释。`,
  )

  const brief = buildDirectorBrief(detail, chapter, focusCharacters, anchors)
  if (brief) sections.unshift(brief)
  sections.push(buildHardConstraints(chapter, focusCharacters, anchors))

  const systemTokens = estimateTokens(system)
  const budgetPlan = resolveEffectiveContextBudget(
    work,
    input.api,
    input.outputReserve ?? DEFAULT_OUTPUT_RESERVE,
  )
  const fitted = fitContextBudget(sections, systemTokens, budgetPlan.limit)
  const boundedSections = fitted.sections
  const user = boundedSections.join('\n\n')
  const sectionReports = boundedSections.map((section) => {
    const title = sectionTitle(section)
    return {
      title,
      layer: contextLayer(title),
      tokens: estimateTokens(section),
      dropped: false,
      reason: '',
    } satisfies ContextSectionReport
  })
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    report: {
      budget: budgetPlan,
      systemTokens,
      userTokens: estimateTokens(user),
      totalTokens: systemTokens + estimateTokens(user),
      sections: sectionReports,
      dropped: fitted.dropped,
      warnings: contextConflictWarnings(detail, focusCharacters),
    },
  }
}

export function buildSceneBriefMessages(input: GenerationInput): ChatMessage[] {
  const context = buildGenerationContext(input)
  const source = context.messages[1]?.content ?? ''
  const withoutWritingTask = source
    .split('\n\n')
    .filter((section) => !section.startsWith('【本次写作任务】'))
    .join('\n\n')
  return [
    {
      role: 'system',
      content: [
        '你是导演场记，只分析，不写正文。',
        '根据提供的完整上下文，把这一场戏拆成可执行的场记单。',
        '必须指出：本场目标、在场角色各自知道什么 / 想要什么、核心冲突、不能违反的设定、必须回收的线、结尾钩子。',
        '不要复述大段原文，不要写小说正文，不要替作者做最终决定；发现上下文冲突时明确列出。',
        '输出简洁的 Markdown 列表，控制在 60–120 行以内。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `${withoutWritingTask}\n\n请只输出这一场的场记单，不要写正文。`,
    },
  ]
}

/** 日常同步：只带本章相关实体，避免把全书设定全部塞进上下文。 */
export function buildScopedStateUpdateMessages(
  input: Omit<StateUpdateInput, 'scope'>,
): ChatMessage[] {
  return buildStateUpdateMessages({
    ...input,
    detail: selectScopedSyncDetail(input.detail, input.content),
    scope: 'scoped',
  })
}

export function buildScopedCompactStateUpdateMessages(
  input: Omit<StateUpdateInput, 'scope'>,
): ChatMessage[] {
  return buildCompactStateUpdateMessages({
    ...input,
    detail: selectScopedSyncDetail(input.detail, input.content),
    scope: 'scoped',
  })
}

/**
 * 快速同步：保留事件 / 状态变化 / 新实体 / 少量经历，
 * 去掉全局档案审查和问题报告，减少输出 token，但仍然是可校验的 JSON。
 */
export function buildFastStateUpdateMessages(
  input: Omit<StateUpdateInput, 'scope'>,
): ChatMessage[] {
  const { work, detail, chapter, content } = input
  const focusText = content
  const characters = selectFocusCharacters(detail, focusText, 6)
  const factions = selectFocusFactions(detail, focusText, 3)
  const characterLines = characters.map((character) => {
    const profile = character.profile
    return `- id=${character.id}｜${character.name}｜状态=${character.status || '未定'}｜身份=${character.identity || '未定'}｜情绪=${profile?.dynamic?.mood || '未定'}｜目标=${profile?.dynamic?.currentGoal || character.goal || '未定'}`
  })
  const factionLines = factions.map(
    (faction) =>
      `- id=${faction.id}｜${faction.name}｜类型=${faction.type || '未定'}｜首领=${faction.leader || '未定'}`,
  )
  const itemLines = (detail.items ?? [])
    .filter((item) => content.includes(item.name))
    .slice(0, 16)
    .map((item) => `- id=${item.id}｜${item.name}`)
  const locationLines = (detail.locations ?? [])
    .filter((location) => content.includes(location.name))
    .slice(0, 10)
    .map((location) => `- id=${location.id}｜${location.name}`)
  const recentEvents = (detail.storyStateEvents ?? [])
    .slice(-4)
    .map((event) => `- ${event.chapterTitle || '未知章节'}：${event.summary || '无摘要'}`)
  const system = [
    '你是小说设定快速同步器。只根据【本章正文】提取已经发生的事实。',
    '只输出一个合法 JSON，不要 markdown、解释、推理过程或代码块。',
    '结构：{"summary":"1-2句","events":[{"title":"","summary":"","participants":[],"location":"","result":""}],"changes":[{"entityType":"character|faction|location|item|species|foreshadowing|relationship","entityId":"","field":"","action":"set|add|remove","value":""}],"newEntities":[{"entityType":"character|faction|location|item|species|foreshadowing|relationship","name":"","role":"","description":""}],"openThreads":[],"resolvedThreads":[]}',
    'events 最多 2 条；changes 最多 5 条；newEntities 最多 4 条；每条字段尽量短。',
    '不要输出 characterExperiences、characterIssues、factionIssues、完整档案、设施明细或长篇解释。',
    '只写正文明确发生的事；没有变化就不写；JSON 必须闭合。',
  ].join('\n')
  const user = [
    `【作品】${work.title}`,
    `【章节】${chapter.title}`,
    `【已有角色】\n${characterLines.join('\n') || '（无）'}`,
    `【已有势力】\n${factionLines.join('\n') || '（无）'}`,
    `【已有物品】\n${itemLines.join('\n') || '（无）'}`,
    `【已有地点】\n${locationLines.join('\n') || '（无）'}`,
    `【最近事件】\n${recentEvents.join('\n') || '（无）'}`,
    `【本章正文】\n${clip(content, 6000)}`,
    '只输出快速同步 JSON。',
  ].join('\n\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/** 日常快速同步：先裁剪范围，再使用轻量 JSON schema。 */
export function buildFastScopedStateUpdateMessages(
  input: Omit<StateUpdateInput, 'scope'>,
): ChatMessage[] {
  return buildFastStateUpdateMessages({
    ...input,
    detail: selectScopedSyncDetail(input.detail, input.content),
  })
}

export interface ArcSummaryInput {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  startIndex: number
  endIndex: number
}

export function buildArcSummaryMessages(input: ArcSummaryInput): ChatMessage[] {
  const { work, detail, chapters, startIndex, endIndex } = input
  const range = chapters.slice(startIndex, endIndex + 1)
  const rangeIds = new Set(range.map((chapter) => chapter.id))
  const memories = (detail.chapterMemories ?? []).filter((memory) =>
    rangeIds.has(memory.chapterId),
  )
  const events = (detail.storyStateEvents ?? []).filter((event) =>
    rangeIds.has(event.chapterId),
  )
  const chapterLines = range.map(
    (chapter, index) =>
      `第 ${startIndex + index + 1} 章 ${chapter.title || '未命名'}（${chapterWords(chapter)} 字）`,
  )
  const memoryLines = memories.map(
    (memory) =>
      `第 ${startIndex + Math.max(0, range.findIndex((chapter) => chapter.id === memory.chapterId)) + 1} 章：${memory.summary}${
        memory.openThreads.length ? `｜未解决：${memory.openThreads.join('；')}` : ''
      }${memory.resolvedThreads.length ? `｜已回收：${memory.resolvedThreads.join('；')}` : ''}`,
  )
  const eventLines = events.map(
    (event) =>
      `第 ${startIndex + Math.max(0, range.findIndex((chapter) => chapter.id === event.chapterId)) + 1} 章：${event.summary}`,
  )
  return [
    {
      role: 'system',
      content: [
        '你是中文长篇小说编辑，负责把一个章节区间的剧情压缩成可复用的卷摘要。',
        '输出纯文本，不要 Markdown 标题、不要解释，控制在 300–600 字。',
        '必须保留：主线推进、关键人物变化、已回收的线、仍未解决的线、下一阶段最重要的钩子。',
        '不要编造区间外或正文里没有发生的事。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】${work.title}｜${work.genres.join('、')}｜${work.theme || '主题未定'}`,
        `【区间】第 ${startIndex + 1}–${endIndex + 1} 章`,
        `【章节列表】\n${chapterLines.join('\n') || '（无）'}`,
        memoryLines.length ? `【章节记忆】\n${memoryLines.join('\n')}` : '',
        eventLines.length ? `【区间事件】\n${eventLines.join('\n')}` : '',
        '请输出卷摘要。',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

export interface AnalysisInput {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  reasoningEffort?: ReasoningEffort
}

export function buildAnalysisMessages(input: AnalysisInput): ChatMessage[] {
  const { work, detail, chapters } = input
  const withContent = chapters.filter((chapter) => chapter.content.trim())
  const recent = withContent.slice(-3)

  const system = [
    '你是一位资深的中文小说编辑，擅长诊断长篇连载的节奏、人物和伏笔问题。',
    '请基于用户提供的作品设定和现有章节做剧情分析，不要续写正文。',
    '输出结构：',
    '1. 一句话判断：这本书目前的完成度和最大看点。',
    '2. 节奏与结构：章节推进、场景密度、信息释放。',
    '3. 人物一致性：动机、行为、关系是否成立。',
    '4. 伏笔与线索：哪些需要尽快回收，哪些埋得太早。',
    '5. 风险与建议：最可能崩的地方，以及下一章的具体建议。',
    '用中文 Markdown 列表输出，总字数控制在 600–1000 字。',
    reasoningInstruction(input.reasoningEffort),
  ]
    .filter(Boolean)
    .join('\n')

  const sections: string[] = []
  sections.push(
    joinSections([
      '【作品】',
      `书名：${work.title}`,
      `题材：${work.genres.join('、') || '未设定'}`,
      `简介：${work.synopsis || '未填写'}`,
      `主题：${work.theme || '未填写'}`,
      detail.worldview ? `世界观：${detail.worldview}` : '',
      `目标字数：${work.targetWords}`,
      `叙事视角：${perspectiveLabel(work.perspective)}`,
    ]),
  )

  const characters = characterContext(detail)
  const contextOptions = resolveContextOptions(work)
  if (contextOptions.state && characters) sections.push(`【角色】\n${characters}`)
  const species = speciesContext(detail)
  if (contextOptions.state && species) sections.push(species)
  if (contextOptions.state) sections.push(templateContext(detail))
  if (contextOptions.globalOutline) {
    const globalOutline = globalOutlineContext(detail)
    if (globalOutline) sections.push(globalOutline)
  }
  if (contextOptions.chapterOutline) {
    const outline = outlineContext(detail)
    if (outline) sections.push(outline)
  }
  const locations = locationContext(detail)
  if (contextOptions.state && locations) sections.push(locations)
  const systemSection = systemContext(detail)
  if (contextOptions.state && systemSection) sections.push(systemSection)
  const moduleSection = moduleContext(detail, chapters)
  if (contextOptions.state && moduleSection) sections.push(moduleSection)
  if (contextOptions.events) {
    const continuity = continuityContext(detail)
    if (continuity) sections.push(continuity)
  }
  const factions = factionContext(detail)
  if (contextOptions.state && factions) sections.push(`【势力】\n${factions}`)
  const relationships = relationshipContext(detail)
  if (contextOptions.state && relationships) sections.push(`【关系】\n${relationships}`)

  sections.push(
    `【章节与字数】\n${chapters
      .map(
        (chapter, index) =>
          `第 ${index + 1} 章 ${chapter.title || '未命名章节'}：${chapterWords(chapter)} 字`,
      )
      .join('\n')}`,
  )

  if (contextOptions.foreshadowings) {
    sections.push(
      `【伏笔】\n${detail.foreshadowings
        .map(
          (item) =>
            `- ${item.title}｜${item.status}｜埋设：${item.plantedIn || '未标注'}｜${item.note}`,
        )
        .join('\n') || '（暂无）'}`,
    )
  }

  if (recent.length > 0) {
    sections.push(
      `【最近章节内容】\n${recent
        .map((chapter) => `## ${chapter.title}\n${clip(chapter.content, 2500)}`)
        .join('\n\n')}`,
    )
  } else {
    sections.push('【最近章节内容】\n（还没有正文内容，请只基于设定做前期规划分析。）')
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: sections.join('\n\n') },
  ]
}

export interface TitleInput {
  work: Work
  chapter: Chapter
  content: string
  directive: string
}

export function buildTitleMessages(input: TitleInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是中文小说编辑，只负责给章节起名。',
        '根据章节正文和导演指令，给 3 个不同的短标题。',
        '每个标题 2–10 个汉字，不要序号、书名号、引号或解释。',
        '只输出 JSON 数组，例如 ["旧案重开","剑匣夜鸣","雪落问剑峰"]。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】${input.work.title}`,
        `【当前章节】${input.chapter.title || '未命名章节'}`,
        `【导演指令】\n${input.directive || '（无）'}`,
        `【本章正文】\n${clip(input.content, 5000) || '（还没有正文）'}`,
      ].join('\n\n'),
    },
  ]
}

export function parseTitleSuggestions(text: string): string[] {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1))
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().replace(/^[《"“]|[》"”]$/g, '').trim())
          .filter((item) => item.length > 0 && item.length <= 20)
          .slice(0, 3)
      }
    } catch {
      // 继续按行解析
    }
  }
  return trimmed
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.、)])\s*/, '').trim())
    .map((line) => line.replace(/^[《"“]|[》"”]$/g, '').trim())
    .filter((line) => line.length > 0 && line.length <= 20)
    .slice(0, 3)
}

export interface ProjectSetupDraft {
  title: string
  synopsis: string
  theme: string
  factions: {
    name: string
    type: string
    leader: string
    description: string
  }[]
  characters: {
    name: string
    role: string
    identity: string
    sectName: string
    personality: string
    goal: string
  }[]
  relationships: {
    fromName: string
    toName: string
    type: string
    note: string
  }[]
}

export function buildProjectSetupMessages(input: {
  synopsis: string
  theme: string
  genres: string[]
  perspective: string
  requirement?: string
  template?: WorldTemplate
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是中文长篇小说策划编辑，为作者生成一个可以直接开写的项目种子。',
        '只输出 JSON 对象，不要 markdown、解释或前后缀。',
        '结构：',
        '{"title":"4-12字书名","synopsis":"80-180字吸引人的简介，不剧透结局","theme":"10-40字主题","factions":[{"name":"宗门/势力名","type":"宗门/组织/国家","leader":"首领名","description":"30字内描述"}],"characters":[{"name":"人名","role":"主角/配角/反派","identity":"身份","sectName":"所属势力名","personality":"性格","goal":"目标"}],"relationships":[{"fromName":"人物名","toName":"人物名","type":"师徒/同门/宿敌/亲属","note":"关系说明"}]}',
        '要求：书名有记忆点，不要套路词堆砌；简介要有钩子；角色 6 个、势力 3 个、关系 5 条左右。',
        '每个字段尽量短：描述 30 字内、性格 20 字内、目标 30 字内；必须一次性输出完整 JSON，不要省略右括号。',
        '所有人物和势力必须来自同一套设定，彼此有冲突和利益关系；不要出现现实品牌。',
        '如果作者写了额外需求，优先满足额外需求；不要把需求原句直接抄进简介。',
        ...(input.template?.story
          ? [
              `题材模板：${input.template.name}`,
              `故事引擎：${input.template.story.engine}`,
              `主题承诺：${input.template.story.promise}`,
              `角色功能：${input.template.story.roleSlots.join('、')}`,
              `常见开局：${input.template.story.openings.join('、')}`,
              `节奏节点：${input.template.story.beats.join('、')}`,
              `禁忌：${input.template.story.pitfalls.join('、')}`,
              `文风：${input.template.story.style}`,
            ]
          : []),
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【已有简介】${input.synopsis || '（还没有，请根据题材生成）'}`,
        `【主题】${input.theme || '（还没有，请根据题材生成）'}`,
        `【题材】${input.genres.join('、') || '通用小说'}`,
        `【叙事视角】${input.perspective}`,
        `【作者需求】${input.requirement?.trim() || '无额外要求，按已有信息发挥'}`,
        '请生成书名、简介、主题、宗门、人物和关系网。',
      ].join('\n\n'),
    },
  ]
}

export function parseProjectSetup(text: string): ProjectSetupDraft | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const raw = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    const str = (value: unknown, max: number) =>
      typeof value === 'string' ? value.trim().slice(0, max) : ''
    const factions = Array.isArray(raw.factions)
      ? raw.factions
          .map((item) => {
            if (!item || typeof item !== 'object') return null
            const value = item as Record<string, unknown>
            const name = str(value.name, 60)
            if (!name) return null
            return {
              name,
              type: str(value.type, 30) || '宗门',
              leader: str(value.leader, 40),
              description: str(value.description, 160),
            }
          })
          .filter((item): item is ProjectSetupDraft['factions'][number] => Boolean(item))
          .slice(0, 8)
      : []
    const factionNames = new Set(factions.map((faction) => faction.name))
    const characters = Array.isArray(raw.characters)
      ? raw.characters
          .map((item) => {
            if (!item || typeof item !== 'object') return null
            const value = item as Record<string, unknown>
            const name = str(value.name, 40)
            if (!name) return null
            const sectName = str(value.sectName, 60)
            return {
              name,
              role: str(value.role, 30) || '配角',
              identity: str(value.identity, 80),
              sectName: factionNames.has(sectName) ? sectName : '',
              personality: str(value.personality, 120),
              goal: str(value.goal, 160),
            }
          })
          .filter((item): item is ProjectSetupDraft['characters'][number] => Boolean(item))
          .slice(0, 12)
      : []
    const characterNames = new Set(characters.map((character) => character.name))
    const relationships = Array.isArray(raw.relationships)
      ? raw.relationships
          .map((item) => {
            if (!item || typeof item !== 'object') return null
            const value = item as Record<string, unknown>
            const fromName = str(value.fromName, 40)
            const toName = str(value.toName, 40)
            if (!characterNames.has(fromName) || !characterNames.has(toName)) return null
            return {
              fromName,
              toName,
              type: str(value.type, 30) || '关系',
              note: str(value.note, 160),
            }
          })
          .filter((item): item is ProjectSetupDraft['relationships'][number] => Boolean(item))
          .slice(0, 16)
      : []
    const title = str(raw.title, 40)
    const synopsis = str(raw.synopsis, 300)
    const theme = str(raw.theme, 100)
    if (!title && !synopsis && characters.length === 0) return null
    return { title, synopsis, theme, factions, characters, relationships }
  } catch {
    return null
  }
}

export interface AssistantHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantInput {
  work: Work
  detail: WorkDetail
  chapter?: Chapter
  content: string
  history: AssistantHistoryMessage[]
}

export function buildAssistantMessages(input: AssistantInput): ChatMessage[] {
  const { work, detail, chapter, content, history } = input
  const recentEvents = (detail.storyStateEvents ?? [])
    .slice(-5)
    .flatMap((event) => event.events ?? [])
    .slice(-8)
  const openThreads = resolveStoryThreads(detail)
    .filter((thread) => thread.status === 'open')
    .slice(0, 10)
    .map((thread) => thread.text)
  const characterLines = detail.characters
    .slice(0, 16)
    .map(
      (character) =>
        `${character.name || '未命名'}（${character.role || '角色'}，${character.identity || '身份未定'}，${character.status || '状态未定'}）`,
    )
    .join('、')
  const factionLines = detail.factions
    .slice(0, 12)
    .map((faction) => `${faction.name || '未命名'}${faction.leader ? `（首领：${faction.leader}）` : ''}`)
    .join('、')
  const context = [
    `【作品】${work.title || '未命名'}｜${work.genres.join('、') || '通用'}｜${work.theme || '主题未定'}`,
    work.synopsis ? `【简介】${work.synopsis}` : '',
    chapter
      ? `【当前章节】第 ${chapter.title || '未命名'}｜${countWords(content)} 字｜正文末尾：\n${content.trim().slice(-2600) || '（本章还没有正文）'}`
      : '【当前章节】（还没有章节）',
    detail.currentSummary ? `【当前剧情摘要】${detail.currentSummary}` : '',
    recentEvents.length
      ? `【最近事件】${recentEvents.map((event) => `${event.title}：${event.summary}`).join('；')}`
      : '',
    openThreads.length ? `【未解决线索】${openThreads.join('；')}` : '',
    characterLines ? `【人物】${characterLines}` : '',
    factionLines ? `【势力】${factionLines}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  return [
    {
      role: 'system',
      content: [
        '你是作者的小说策划与灵感助手，不是代写正文的枪手。',
        '根据当前作品、章节、事件簿和人物关系帮作者找方向，回答要具体、可执行。',
        '当作者卡文时，优先给出 2–3 个不同的发展方案，每个方案写清冲突、转折和结尾钩子。',
        '也可以分析人物动机、关系张力、伏笔回收和节奏问题；不要空泛鼓励。',
        '除非作者明确要求，否则不要直接代写大段正文，也不要擅自改变既有设定。',
        '不要假装知道没有提供的情节；信息不足时先说明你的假设。',
        '',
        context,
      ].join('\n'),
    },
    ...history.slice(-12).map((message) => ({
      role: message.role,
      content: message.content.slice(0, 3000),
    })),
  ]
}

export type EntityFillKind = 'character' | 'faction' | 'item' | 'location' | 'species'

export interface EntityFillInput {
  kind: EntityFillKind
  work: Work
  detail: WorkDetail
  entity: Record<string, unknown>
}

function entityFillSchema(kind: EntityFillKind): string {
  if (kind === 'character') {
    return '{"role":"","identity":"","personality":"","goal":"","appearance":"","background":"","position":"","cultivation":"","spiritRoot":"","physique":"","talent":"","currency":"","techniques":[],"weapons":[],"treasures":[],"sectName":""}'
  }
  if (kind === 'faction') {
    return '{"type":"","tier":1,"leader":"","goal":"","description":"","location":"","founded":"","motto":"","innerDisciples":0,"outerDisciples":0,"menialDisciples":0,"elders":[{"name":"","title":"","cultivation":"","description":"","items":[]}],"mainDisciples":[{"name":"","title":"","cultivation":"","description":"","items":[]}],"peaks":[{"name":"","type":"","master":""}],"facilities":[{"name":"","type":"","keeper":"","description":"","effect":"","counts":{"elder":0,"main":0,"inner":0,"outer":0,"menial":0},"resources":[]}],"techniques":[],"assets":[]}'
  }
  if (kind === 'item') {
    return '{"name":"","grade":1,"description":"","notes":""}'
  }
  if (kind === 'species') {
    return '{"category":"","tier":1,"tags":[],"aliases":[],"origin":"","habitat":"","appearance":"","physiology":"","lifespan":"","abilities":[],"weaknesses":[],"society":"","language":"","culture":"","relations":"","variants":[],"notes":""}'
  }
  return '{"type":"","description":"","notes":"","factionName":""}'
}

function characterProfileSchema(): string {
  return '{"aliases":[],"coreContradiction":"","surfacePersonality":"","truePersonality":"","values":[],"fears":[],"desires":[],"shame":"","moralLine":"","growthArc":"","voice":{"register":"","sentenceLength":"","vocabulary":"","rhythm":"","honorifics":"","selfReference":"","verbalTics":[],"catchphrases":[],"angry":"","sad":"","intimate":"","pleading":"","threatening":"","lying":"","neverSays":[],"samples":[],"narrationFilter":""},"behavior":{"habits":[],"gestures":[],"nervousTells":[],"lyingTells":[],"angryTells":[],"relaxedTells":[],"posture":"","conflictStyle":"","intimacyBoundary":"","moneyHabit":"","dailyRoutine":"","fightingStyle":""},"preferences":{"likes":[],"dislikes":[],"foods":[],"hobbies":[],"aesthetics":[],"sensory":[],"comforts":[],"triggers":[],"topics":[]},"knowledge":{"knows":[],"believes":[],"secrets":[],"blindSpots":[],"biases":[]},"relationNotes":[],"stages":[{"id":"","label":"","fromChapter":"","toChapter":"","goal":"","traits":"","voiceNote":""}],"dynamic":{"mood":"","currentGoal":"","injuries":"","location":"","possessions":"","arc":"","updatedAt":""},"meta":{"importance":"major","pov":false,"firstAppearance":"","plotArmor":"","aiNotes":""}}'
}

function factionProfileSchema(): string {
  return '{"category":"","scale":"","legitimacy":"","publicFace":"","trueFace":"","coreContradiction":"","purpose":"","origin":"","values":[],"fears":[],"desires":[],"redLine":"","weakness":"","trauma":"","growthArc":"","governance":{"system":"","legitimateLeader":"","actualPower":"","decisionProcess":"","succession":"","council":"","enforcement":"","intelligence":"","promotion":"","punishment":"","internalGroups":[{"name":"","goal":"","stance":"","power":"","secret":""}]},"behavior":{"threatResponse":"","diplomacy":"","conflictStyle":"","negotiation":"","riskAppetite":"","internalDispute":"","expansion":"","crisis":"","redLineBreak":"","defaultReaction":""},"culture":{"beliefs":"","rituals":[],"taboos":[],"symbols":"","dress":"","addressInternal":"","addressExternal":"","honor":"","outsider":"","propaganda":"","slogans":[]},"resources":{"finance":"","manpower":"","military":"","territory":"","supply":"","intelligence":"","technology":"","legitimacy":"","dependencies":[],"bottlenecks":[],"hiddenAssets":[],"debts":[]},"knowledge":{"knows":[],"believes":[],"hides":[],"blindSpots":[],"infiltratedBy":[],"sources":[]},"dynamic":{"stage":"","leaderState":"","morale":"","treasury":"","forces":"","territory":"","diplomacy":"","internalStruggle":"","currentOperation":"","publicImage":""},"meta":{"importance":"major","role":"other","storyFunction":"","aiNotes":""}}'
}

function entityGenerateSchema(kind: EntityFillKind): string {
  if (kind === 'character') {
    return `{"name":"",${entityFillSchema(kind).slice(1, -1)},"profile":${characterProfileSchema()}}`
  }
  if (kind === 'faction') {
    return `{"name":"",${entityFillSchema(kind).slice(1, -1)},"profile":${factionProfileSchema()}}`
  }
  return `{"name":"",${entityFillSchema(kind).slice(1)}`
}

export function buildEntityFillMessages(input: EntityFillInput): ChatMessage[] {  const { kind, work, detail, entity } = input
  const labels: Record<EntityFillKind, string> = {
    character: '角色',
    faction: '势力 / 宗门',
    item: '物品',
    location: '地点',
    species: '物种 / 种族',
  }
  const related = [
    detail.characters.length
      ? `人物：${detail.characters.map((item) => `${item.name}（${item.role || '角色'}）`).join('、')}`
      : '',
    detail.factions.length
      ? `势力：${detail.factions.map((item) => `${item.name}${item.leader ? `（首领：${item.leader}）` : ''}`).join('、')}`
      : '',
    detail.locations?.length
      ? `地点：${detail.locations.map((item) => item.name).join('、')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
  return [
    {
      role: 'system',
      content: [
        '你是中文小说设定编辑，负责补全已有实体档案的空白字段。',
        '只输出一个 JSON 对象，不要 markdown、解释或前后缀。',
        '不要修改已有非空字段；不要改变实体名称；不要杜撰与已有设定冲突的内容。',
        '字段尽量简洁具体，背景 80–160 字，描述 40–100 字；人物 / 势力 / 地点必须符合当前作品设定。',
        `只输出这些字段：${entityFillSchema(kind)}`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【补全对象】${labels[kind]}`,
        `【作品】${work.title}｜${work.genres.join('、') || '通用'}｜${work.theme || '主题未定'}`,
        `【简介】${work.synopsis || '未填写'}`,
        detail.currentSummary ? `【当前剧情】${detail.currentSummary}` : '',
        related ? `【已有实体】\n${related}` : '',
        `【已有档案】\n${JSON.stringify(entity, null, 2)}`,
        '请补全空白字段，返回 JSON。',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

export function parseEntityFill(text: string): Record<string, unknown> | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = trimmed.indexOf('{')
  if (start < 0) return null
  // 找到与第一个 { 配对的 }，避免前后说明文字和多个 JSON 片段干扰。
  let depth = 0
  let inString = false
  let escaped = false
  let end = -1
  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  if (end <= start) return null
  const raw = trimmed.slice(start, end + 1)
  const attempts = [
    raw,
    raw.replace(/,\s*([}\]])/g, '$1'),
    raw.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"),
  ]
  for (const attempt of attempts) {
    try {
      const value = JSON.parse(attempt)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>
      }
    } catch {
      // 尝试下一种修复。
    }
  }
  return null
}

export interface EntityGenerateInput {
  kind: EntityFillKind
  work: Work
  detail: WorkDetail
  hint?: string
}

/** 只补全已有角色/势力的深度档案，不改基础档案和名字。 */
export function buildEntityDeepFillMessages(input: EntityFillInput): ChatMessage[] {
  const { kind, work, detail, entity } = input
  const labels: Record<EntityFillKind, string> = {
    character: '角色',
    faction: '势力 / 宗门',
    item: '物品',
    location: '地点',
    species: '物种 / 种族',
  }
  const isCharacter = kind === 'character'
  const schema = isCharacter ? characterProfileSchema() : factionProfileSchema()
  return [
    {
      role: 'system',
      content: [
        `你是中文小说设定编辑，负责补全已有${labels[kind]}的深度档案。`,
        '只输出一个 JSON 对象，不要 markdown、解释或前后缀。',
        '不要修改已有非空字段；不要改变名字、身份和已经发生的事实；不要杜撰与已有设定冲突的内容。',
        '除了确实不适用于该角色的字段，必须尽量把每个空白字段补全，不要大量留空。',
        ...(isCharacter
          ? [
              '必须补全五个区块：核心档案、语言档案、行为档案、偏好档案、认知边界；不能只写核心矛盾。',
              '语言档案至少填：register、sentenceLength、vocabulary、rhythm；verbalTics 2 条以上；catchphrases 1 条以上；angry / sad / intimate / pleading / threatening / lying 各 1 句；neverSays 2 条以上；samples 3 句以上；narrationFilter 尽量填。',
              '行为档案至少填：habits 2 条以上、gestures 2 条以上、nervousTells 1 条以上、lyingTells 1 条以上；angryTells / relaxedTells 各 1 条；posture、conflictStyle、intimacyBoundary、moneyHabit、dailyRoutine、fightingStyle 尽量填。',
              '偏好档案至少填：likes / dislikes 各 2 条以上；foods、hobbies、aesthetics、sensory、comforts、triggers、topics 尽量填。',
              '认知档案至少填：knows / believes / secrets / blindSpots / biases 各 1 条以上；只能写当前剧情已支持或角色合理能知道的内容，不要剧透未来。',
              'stages 给 1–3 个阶段；dynamic 只填当前章节适用的情绪、目标、伤势、位置和持有物；relationNotes 没有其他角色 id 时留空。',
            ]
          : [
              '必须补全公开形象、真实面目、核心矛盾、目的、权力与决策、内部派系、文化口号、资源与瓶颈、情报边界、动态状态和叙事功能。',
              'governance、behavior、culture、resources、knowledge、dynamic、meta 每个区块都要尽量给出具体内容，不要只写一句简介。',
            ]),
        `结构：{"profile":${schema}}`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】${work.title}｜${work.theme || '主题未定'}`,
        `【当前剧情】${detail.currentSummary || '还没有同步摘要'}`,
        `【补全对象】${JSON.stringify(entity, null, 2)}`,
        '请只补全空白的深度档案字段，已有非空内容原样保留；空白字段要尽量全部补齐，不要只补核心矛盾。',
      ].join('\n\n'),
    },
  ]
}

export function buildEntityGenerateMessages(input: EntityGenerateInput): ChatMessage[] {
  const { kind, work, detail, hint } = input
  const labels: Record<EntityFillKind, string> = {
    character: '角色',
    faction: '势力 / 宗门',
    item: '物品',
    location: '地点',
    species: '物种 / 种族',
  }
  const existing = [
    detail.characters.length
      ? `人物：${detail.characters.map((item) => item.name).join('、')}`
      : '',
    detail.factions.length
      ? `势力：${detail.factions.map((item) => item.name).join('、')}`
      : '',
    detail.locations?.length
      ? `地点：${detail.locations.map((item) => item.name).join('、')}`
      : '',
    detail.items?.length
      ? `物品：${detail.items.map((item) => item.name).join('、')}`
      : '',
    detail.species?.length
      ? `物种：${detail.species.map((species) => species.name).join('、')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
  const schema = entityGenerateSchema(kind)
  return [
    {
      role: 'system',
      content: [
        '你是中文小说设定生成器。根据作品现有设定生成一个新的实体，直接补入作品。',
        '只输出一个 JSON 对象，不要 markdown、解释或前后缀。',
        '不要重复已有实体名称；不要与已有设定冲突；名称要符合当前题材。',
        '字段尽量具体，人物 / 势力 / 物品 / 地点必须有明确钩子，能继续用于正文。',
        '深度档案每个字段用短句，避免长段落；必须保证 JSON 完整闭合，宁可少写也不要把输出截断。',
        hint
          ? '本次有【作者想法】和 AI 分析，必须优先满足作者想法；不要把设定改写成无关内容。'
          : '',
        kind === 'character'
          ? '角色必须同时生成 profile 深度档案：核心矛盾、表层/真实性格、价值观、恐惧、欲望、声音、口癖、语气样本、行为小动作、喜欢/讨厌、认知边界、动态状态。profile 要能直接指导正文表演，不要写空泛形容词；voice.samples 写 3–5 句该角色会说的话，voice.neverSays 写 2–4 条他绝不会说的话。'
          : '',
        kind === 'faction'
          ? '势力必须同时生成 profile 深度档案：公开形象、真实面目、核心矛盾、目的、权力与决策、内部派系、文化口号、资源与瓶颈、情报边界、动态状态、叙事功能。必须按当前作品题材生成组织：修仙题材是宗门/世家，都市题材是公司/家族/机构，科幻是舰队/殖民公司，悬疑是基金会/警局/秘密组织，历史是王朝/门阀/商帮；不要把所有势力都写成宗门。名册必须具体：elders 生成 2-4 名长老 / 核心层，mainDisciples 生成 3-6 名亲传 / 主要弟子；每人必须有 name、title、cultivation、description，并给 items 写 1-3 件随身物品名。若本次提示明确说不需要名册，则 elders / mainDisciples 输出空数组。facilities 必须按势力类型生成 3-6 处有写作用途的设施 / 分堂 / 产业，例如宗门写山峰、藏书阁、剑阁、炼丹房、任务堂，商会写总号、仓库、拍卖行、账房，王朝写朝堂、国库、军营、情报司；名称、类型、负责人、描述和作用都要具体，不要只换几个地名。每处设施必须填写 counts：elder（长老 / 核心层）、main（亲传 / 核心成员）、inner（内门 / 正式成员）、outer（外门 / 外围成员）、menial（杂役 / 临时人员），数字要符合势力规模；resources 写 1-4 个该设施产出的资源名，如丹药、功法、法器、粮草、情报、军械。势力总人数会从设施汇总，不要把所有人数都堆在单一设施。profile 要能直接指导正文表现组织行为。'
          : '',
        kind === 'species'
          ? '物种必须符合当前作品题材：可以是动物、神兽、精灵、亡灵、外星种族、AI / 机械生命、变异体或自定义；不要把所有物种都写成修仙神兽，也不要把物种写成势力或职业。要写清生理、社会、语言、文化和弱点，让角色归属有实际写作后果。'
          : '',
        `只输出这些字段：${schema}`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
    {
      role: 'user',
      content: [
        `【生成对象】${labels[kind]}`,
        `【作品】${work.title}｜${work.genres.join('、') || '通用'}｜${work.theme || '主题未定'}`,
        `【简介】${work.synopsis || '未填写'}`,
        detail.currentSummary ? `【当前剧情】${detail.currentSummary}` : '',
        existing ? `【已有实体，不要重名】\n${existing}` : '',
        hint ? `【本次要求】${hint}` : '',
        `请生成一个新的${labels[kind]}，返回 JSON。`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

export type SelectionEditAction = 'rewrite' | 'polish' | 'expand' | 'condense' | 'continue'

export interface SelectionEditInput {
  action: SelectionEditAction
  work: Work
  detail: WorkDetail
  chapter: Chapter
  content: string
  selectedText: string
  before: string
  after: string
}

export function buildSelectionEditMessages(input: SelectionEditInput): ChatMessage[] {
  const instructions: Record<SelectionEditAction, string> = {
    rewrite: '改写选中片段，保持事件、信息、人物和事实不变，让表达更有画面感和节奏。',
    polish: '润色选中片段，统一语气和节奏，修正别扭表达，不改变剧情。',
    expand: '扩写选中片段，增加动作、感官、环境或心理细节，但不要增加新的关键事实。',
    condense: '精简选中片段，删掉重复解释和冗余修饰，保留关键动作、信息与冲突。',
    continue: '从选中片段末尾自然续写 300–500 字，延续同一场景、视角和语气；只输出续写内容，不要重复选中文本。',
  }
  return [
    {
      role: 'system',
      content: [
        '你是中文小说正文编辑器。',
        '只输出最终正文片段，不要标题、解释、Markdown、引号或“修改后：”等提示。',
        '必须保持原文的人称、叙事视角、人物性格和已经发生的事实。',
        '不要擅自增加新的关键设定；不要用总结代替动作和对白。',
        instructions[input.action],
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】${input.work.title}｜${input.work.genres.join('、') || '未设置题材'}｜${input.work.theme || '主题未定'}`,
        `【本章】${input.chapter.title || '未命名章节'}`,
        `【文风】\n${formatStyleCard(input.detail.style, input.chapter.styleOverride)}`,
        `【选中片段】\n${input.selectedText}`,
        `【前文】\n${input.before || '（无）'}`,
        `【后文】\n${input.after || '（无）'}`,
        `【本章上下文】\n${clip(input.content, 6000)}`,
      ].join('\n\n'),
    },
  ]
}

export interface PromptGenerateInput {
  requirement: string
  categories: string[]
}

export function buildPromptGenerateMessages(input: PromptGenerateInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是中文小说写作提示词编辑器。根据作者描述的作用，生成一条可以直接保存到提示词库的写作规则。',
        '只输出一个 JSON 对象，不要 markdown、解释或前后缀。',
        '字段：title、category、content、tags。',
        `category 必须从这些值中选择：${input.categories.join('、')}。`,
        'content 要写成给 AI 的明确指令，包含使用场景、要做什么、不要做什么；控制在 80–400 字。',
        'tags 输出 2–4 个短标签。',
        '不要写成泛泛的“提升文笔”，要能直接约束下一次生成。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `【作者想要的作用】\n${input.requirement.trim()}\n\n请生成提示词 JSON。`,
    },
  ]
}

export interface GeneratedPromptDraft {
  title: string
  category: string
  content: string
  tags: string[]
}

export function parseGeneratedPrompt(text: string): GeneratedPromptDraft | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    const raw = JSON.parse(trimmed) as Record<string, unknown>
    const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 60) : ''
    const category = typeof raw.category === 'string' ? raw.category.trim() : ''
    const content = typeof raw.content === 'string' ? raw.content.trim().slice(0, 2000) : ''
    const tags = Array.isArray(raw.tags)
      ? raw.tags
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 8)
      : []
    if (!title || !content) return null
    return { title, category, content, tags }
  } catch {
    return null
  }
}

export interface ContinuityAuditInput {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  chapter: Chapter
  content: string
  memory?: StoryMemoryData
  localIssues?: StoryHealthIssue[]
}

export function buildContinuityAuditMessages(input: ContinuityAuditInput): ChatMessage[] {
  const { work, detail, chapters, chapter, content } = input
  const index = chapters.findIndex((item) => item.id === chapter.id)
  const previous = index > 0 ? chapters[index - 1] : null
  const events = detail.storyStateEvents ?? []
  const recentEvents = events.slice(-6).reverse()
  const openThreads = resolveStoryThreads(detail)
    .filter((thread) => thread.status === 'open')
    .slice(0, 16)
    .map((thread) => thread.text)
  const characters = detail.characters
    .map(
      (item) =>
        `- ${item.name || '未命名'}｜状态：${item.status || '未定'}｜身份：${item.identity || '未定'}｜武器：${(item.weapons ?? []).join('、') || '无'}｜法宝：${(item.treasures ?? []).join('、') || '无'}`,
    )
    .join('\n')
  const foreshadowings = detail.foreshadowings
    .map(
      (item) =>
        `- ${item.title}｜${item.status}｜${item.type ?? '秘密'}/${item.importance ?? '支线'}｜计划回收：${item.payoffChapterId ? '已设置' : '未设置'}｜${item.note}`,
    )
    .join('\n')
  const outline = (detail.outline ?? []).find((card) => card.chapterId === chapter.id)
  const globalRules = detail.globalOutline?.rules ?? ''
  const globalMustResolve = detail.globalOutline?.mustResolve ?? ''
  const memory = input.memory ?? ensureStoryMemory(detail, chapters)
  const currentFacts = activeFactsAtChapter(memory, chapters, chapter.id)
    .filter((fact) => fact.status !== 'retconned')
    .slice(0, 30)
  const memoryKnowledge = memory.knowledge
    .filter((entry) => content.includes(entry.characterName))
    .slice(0, 40)
  const memoryPromises = memory.promises
    .filter((promise) => promise.status === 'open' || promise.status === 'advanced')
    .slice(0, 20)
  const memoryHits = retrieveStoryMemory(
    detail,
    chapters,
    chapter.id,
    `${chapter.title}\n${content.slice(-3000)}`,
    memory,
    8,
  )

  const system = [
    '你是小说连续性审稿员。你只检查，不续写、不改正文。',
    '对照已发生事件、当前人物状态、物品、秘密、时间线、世界规则和本章大纲，找出本章正文里的冲突或风险。',
    '检查项：',
    '1. 死亡角色是否再次行动，重伤/失能状态是否被忽略；',
    '2. 已失去、损毁或不在身上的物品是否再次使用；',
    '3. 角色是否知道了不该知道的秘密，或忘记已知事实；',
    '4. 时间、地点、移动是否与上一章和事件簿冲突；',
    '5. 是否违反全局大纲里的世界规则；',
    '6. 是否偏离本章大纲；',
    '7. 未解决事项是否被无故遗忘。',
    '8. 事实库、认知矩阵、剧情承诺与相关历史记忆是否被违反。',
    '输出格式：先给一行结论（通过 / 有风险 / 有冲突），再按严重度列出条目。',
    '每条写：问题、依据、建议，不要重写正文。没有发现就明确说“未发现明显冲突”。',
    input.localIssues?.length
      ? `本地规则审计已经发现 ${input.localIssues.length} 条问题，请重点复核这些：\n${input.localIssues
          .map((issue) => `- ${issue.title}：${issue.detail}`)
          .join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  const user = [
    `【作品】${work.title}`,
    `【当前章节】第 ${index + 1} 章 ${chapter.title || '未命名章节'}`,
    `【当前剧情摘要】\n${detail.currentSummary || '（无）'}`,
    `【最近事件】\n${
      recentEvents
        .map(
          (event) =>
            `- ${event.chapterTitle}：${event.summary || '无摘要'}${(event.events ?? []).length ? `（${(event.events ?? []).map((item) => item.title).join('、')}）` : ''}`,
        )
        .join('\n') || '（无）'
    }`,
    `【未解决事项】\n${openThreads.join('\n') || '（无）'}`,
    `【人物状态】\n${characters || '（无）'}`,
    `【伏笔】\n${foreshadowings || '（无）'}`,
    `【世界规则】\n${globalRules || '（无）'}`,
    `【必须回收的线】\n${globalMustResolve || '（无）'}`,
    `【当前有效事实】\n${currentFacts.map((fact) => `- ${fact.subjectName} · ${fact.field}：${fact.displayValue}（第 ${fact.validFromChapterNumber} 章）`).join('\n') || '（无）'}`,
    `【认知矩阵】\n${memoryKnowledge.map((entry) => `- ${entry.characterName}｜${entry.state}：${entry.topic}`).join('\n') || '（无）'}`,
    `【剧情承诺】\n${memoryPromises.map((promise) => `- ${promise.title}：${promise.detail}${promise.dueChapterNumber ? `（计划第 ${promise.dueChapterNumber} 章）` : ''}`).join('\n') || '（无）'}`,
    memoryHits.length
      ? `【相关历史记忆】\n${memoryHits.map((hit) => `- ${hit.chapterNumber ? `第${hit.chapterNumber}章` : ''}${hit.title}：${hit.text.slice(0, 240)}`).join('\n')}`
      : '',
    outline
      ? `【本章大纲】\n概要：${outline.summary || '无'}\n目标：${outline.goal || '无'}\n冲突：${outline.conflict || '无'}`
      : '【本章大纲】\n（无，或未填写）',
    `【上一章结尾】\n${previous ? clip(previous.content, 2200) : '（无上一章）'}`,
    `【本章正文】\n${clip(content, 12000)}`,
    '请审查本章连续性。',
  ].join('\n\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

export interface ContinuityRepairInput extends ContinuityAuditInput {
  report: string
}

export function buildContinuityRepairMessages(input: ContinuityRepairInput): ChatMessage[] {
  const { work, detail, chapters, chapter, content, report } = input
  const memory = input.memory ?? ensureStoryMemory(detail, chapters)
  const facts = activeFactsAtChapter(memory, chapters, chapter.id)
    .filter((fact) => fact.status !== 'retconned')
    .slice(0, 30)
  const system = [
    '你是小说连续性修复器。只修复审查报告指出的问题，不续写新剧情，不改变未出问题的段落。',
    '必须保留：原有叙事视角、人物语气、段落顺序、场景目标、已发生事实。',
    '只输出修复后的完整本章正文，不要解释、不要 markdown、不要标题。',
    '如果报告误报，不要为了迎合报告而破坏正文；保留原文并在对应位置用最小改动消除真正矛盾。',
    '不得新增设定、角色、物品或未发生的剧情；不得让人物知道其认知边界外的信息。',
  ].join('\n')
  const user = [
    `【作品】${work.title}`,
    `【章节】第 ${chapters.findIndex((item) => item.id === chapter.id) + 1} 章 ${chapter.title || '未命名章节'}`,
    `【审查报告】\n${report}`,
    `【当前有效事实】\n${facts.map((fact) => `- ${fact.subjectName} · ${fact.field}：${fact.displayValue}`).join('\n') || '（无）'}`,
    `【必须保留的本章正文】\n${clip(content, 12000)}`,
    '请输出修复后的完整正文。只改必要段落。',
  ].join('\n\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

const modelListCache = new Map<string, string[]>()

export interface ParagraphRepairEdit {
  quote: string
  replacement: string
  reason: string
}

export function buildParagraphRepairMessages(input: ContinuityRepairInput): ChatMessage[] {
  const { work, detail, chapters, chapter, content, report } = input
  const memory = input.memory ?? ensureStoryMemory(detail, chapters)
  const facts = activeFactsAtChapter(memory, chapters, chapter.id)
    .filter((fact) => fact.status !== 'retconned')
    .slice(0, 30)
  return [
    {
      role: 'system',
      content: [
        '你是小说连续性局部修复器。只修改审查报告指出的问题段落，不重写整章。',
        '只输出一个 JSON 对象：{"edits":[{"quote":"必须逐字出现在正文中的原句或原段","replacement":"修复后的对应文本","reason":"为什么改"}]}',
        'quote 必须从【本章正文】逐字复制，长度尽量是一句或一个短段，不能改写 quote。',
        'replacement 必须保持原视角、语气、句式和相邻段落衔接；不新增剧情、设定、角色或物品。',
        '如果报告是误报，或没有需要修改的段落，输出 {"edits":[]}。不要输出 markdown 或解释。',
        '不得让人物知道认知边界外的信息；不得复活已下线角色；不得修改未出问题的段落。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】${work.title}`,
        `【章节】第 ${chapters.findIndex((item) => item.id === chapter.id) + 1} 章 ${chapter.title || '未命名章节'}`,
        `【审查报告】\n${report}`,
        `【当前有效事实】\n${facts.map((fact) => `- ${fact.subjectName} · ${fact.field}：${fact.displayValue}`).join('\n') || '（无）'}`,
        `【本章正文】\n${clip(content, 12000)}`,
        '请只输出需要修改的段落编辑 JSON。',
      ].join('\n\n'),
    },
  ]
}

export function parseParagraphRepairEdits(text: string): ParagraphRepairEdit[] {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as { edits?: unknown }
    if (!Array.isArray(raw.edits)) return []
    return raw.edits
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const value = item as Record<string, unknown>
        const quote = typeof value.quote === 'string' ? value.quote.trim() : ''
        const replacement =
          typeof value.replacement === 'string' ? value.replacement.trim() : ''
        const reason = typeof value.reason === 'string' ? value.reason.trim().slice(0, 300) : ''
        if (!quote || quote.length < 4) return null
        return { quote, replacement, reason }
      })
      .filter((edit): edit is ParagraphRepairEdit => Boolean(edit))
      .slice(0, 12)
  } catch {
    return []
  }
}

export function applyParagraphRepairEdits(
  content: string,
  edits: ParagraphRepairEdit[],
): { text: string; applied: number; rejected: number } {
  let text = content
  let applied = 0
  let rejected = 0
  for (const edit of edits) {
    const first = text.indexOf(edit.quote)
    if (first < 0 || text.indexOf(edit.quote, first + edit.quote.length) >= 0) {
      rejected += 1
      continue
    }
    text =
      text.slice(0, first) + edit.replacement + text.slice(first + edit.quote.length)
    applied += 1
  }
  return { text, applied, rejected }
}

export function clearModelListCache(): void {
  modelListCache.clear()
}

export async function fetchModels(api: ApiConfig): Promise<string[]> {
  const baseUrl = api.baseUrl.trim()
  const apiKey = api.apiKey.trim()
  if (!baseUrl) throw new Error('还没有填写接口地址')
  if (!apiKey) throw new Error('还没有填写 API Key')
  const cacheKey = `${api.provider}|${baseUrl}|${apiKey}`
  const cached = modelListCache.get(cacheKey)
  if (cached) return cached

  const response = await fetch('/llm-api/models', {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
      'x-llm-base-url': baseUrl,
    },
  })
  if (!response.ok) {
    const raw = await response.text().catch(() => '')
    let detail = raw
    try {
      const parsed = JSON.parse(raw)
      detail = parsed?.error?.message ?? parsed?.message ?? raw
    } catch {
      // 保留原始文本
    }
    throw new Error(`获取模型失败（${response.status}）${detail ? `：${detail}` : ''}`)
  }
  const payload: unknown = await response.json()
  const rawList = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? ((payload as Record<string, unknown>).data ??
        (payload as Record<string, unknown>).models ??
        [])
      : []
  const models = Array.isArray(rawList)
    ? Array.from(
        new Set(
          rawList
            .map((item) => {
              if (typeof item === 'string') return item.trim()
              if (item && typeof item === 'object') {
                const value = item as Record<string, unknown>
                return String(value.id ?? value.name ?? value.model ?? '').trim()
              }
              return ''
            })
            .filter(Boolean),
        ),
      )
    : []
  modelListCache.set(cacheKey, models)
  return models
}
