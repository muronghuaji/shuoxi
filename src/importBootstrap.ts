import type {
  AiUsageEntry,
  ApiConfig,
  BootstrapMode,
  BootstrapReport,
  Chapter,
  TierScheme,
  Work,
  WorkDetail,
} from './types'
import {
  buildCompactStateUpdateMessages,
  buildStateUpdateMessages,
  type ChatUsage,
} from './ai'
import {
  applyStoryStateUpdate,
  parseStoryStateUpdate,
} from './storyState'
import { createTierScheme } from './tiers'
import { estimateTokens } from './utils'
import { runApiTask } from './aiTask'

const CHAPTER_EXCERPT = 1600
const MAX_BATCHES = 200

export interface BootstrapSelection {
  chapters: Chapter[]
  batches: Chapter[][]
  estimatedCalls: number
}

export interface ImportBootstrapInput {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  mode: BootstrapMode
  api: ApiConfig
  signal?: AbortSignal
  onProgress?: (message: string) => void
  onPartial?: (detail: WorkDetail) => void
  onRecordUsage?: (entry: AiUsageEntry) => void
}

export interface ImportBootstrapResult {
  detail: WorkDetail
  report: BootstrapReport
}

function recordUsage(
  api: ApiConfig,
  messages: { content: string }[],
  result: string,
  usage: ChatUsage | undefined,
  onRecordUsage?: (entry: AiUsageEntry) => void,
) {
  if (!onRecordUsage) return
  const inputTokens = usage?.inputTokens ?? estimateTokens(messages.map((message) => message.content).join('\n'))
  const outputTokens = usage?.outputTokens ?? estimateTokens(result)
  const inputPrice = api.inputPrice ?? 0
  const outputPrice = api.outputPrice ?? 0
  const cost =
    (inputPrice > 0 || outputPrice > 0)
      ? (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice
      : undefined
  onRecordUsage({
    id: `bootstrap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    at: Date.now(),
    kind: '设定同步',
    model: api.model,
    inputTokens,
    outputTokens,
    actual: Boolean(usage),
    cost,
    note: '导入建档',
  })
}

function sampledChapters(chapters: Chapter[], mode: BootstrapMode): Chapter[] {
  if (mode === 'deep') return chapters
  if (mode === 'quick') return chapters.slice(-12)
  if (chapters.length <= 60) return chapters
  const first = chapters.slice(0, 10)
  const last = chapters.slice(-20)
  const middle = chapters.slice(10, -20)
  const middleCount = Math.min(30, middle.length)
  const step = Math.max(1, Math.floor(middle.length / Math.max(1, middleCount)))
  const sampled: Chapter[] = []
  for (let index = 0; index < middle.length && sampled.length < middleCount; index += step) {
    sampled.push(middle[index])
  }
  const seen = new Set<string>()
  return [...first, ...sampled, ...last].filter((chapter) => {
    if (seen.has(chapter.id)) return false
    seen.add(chapter.id)
    return true
  })
}

export function planBootstrap(
  chapters: Chapter[],
  mode: BootstrapMode,
): BootstrapSelection {
  const selected = sampledChapters(chapters, mode)
  const size = mode === 'quick' ? 4 : mode === 'standard' ? 8 : 12
  const batches: Chapter[][] = []
  for (let index = 0; index < selected.length; index += size) {
    batches.push(selected.slice(index, index + size))
  }
  // 极长作品也保留全书的头尾样本，不静默只读前面。
  const limited =
    batches.length <= MAX_BATCHES
      ? batches
      : [
          ...batches.slice(0, Math.floor(MAX_BATCHES / 2)),
          ...batches.slice(-Math.floor(MAX_BATCHES / 2)),
        ]
  return {
    chapters: selected,
    batches: limited,
    estimatedCalls: limited.length + 1,
  }
}

function batchContent(chapters: Chapter[]): string {
  return chapters
    .map((chapter) => {
      const content = chapter.content.trim()
      const excerpt =
        content.length <= CHAPTER_EXCERPT * 2
          ? content
          : `${content.slice(0, CHAPTER_EXCERPT)}\n…\n${content.slice(-CHAPTER_EXCERPT)}`
      return `【${chapter.title || '未命名章节'}】\n${excerpt}`
    })
    .join('\n\n')
}

function jsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(text.slice(start, end + 1))
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function buildRealmMessages(detail: WorkDetail, chapters: Chapter[]) {
  const cultivation = [
    ...new Set(
      detail.characters
        .map((character) => character.cultivation?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, 30)
  const names = detail.characters.map((character) => character.name).filter(Boolean).slice(0, 20)
  return [
    {
      role: 'system' as const,
      content:
        '你是小说境界体系整理器。只根据给出的作品信息推断力量等级，不要编造原文完全不存在的修仙体系。只输出一个合法 JSON：{"schemeName":"境界名","levels":["等级1","等级2"]}。levels 按从低到高排列，最多 20 个；如果这不是力量升级题材，输出 {"schemeName":"","levels":[]}。不要 markdown、不要解释。',
    },
    {
      role: 'user' as const,
      content: [
        `作品：《${detail.worldview ? '已有世界观' : '导入作品'}》`,
        names.length ? `人物：${names.join('、')}` : '',
        cultivation.length ? `人物修为描述：${cultivation.join('；')}` : '',
        `章节标题样本：${chapters.map((chapter) => chapter.title).filter(Boolean).slice(-30).join('、')}`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ]
}

async function extractRealmScheme(
  input: ImportBootstrapInput,
  detail: WorkDetail,
  batches: Chapter[][],
  warnings: string[],
): Promise<WorkDetail> {
  const chapters = batches.flat()
  if (!chapters.length || input.detail.realmSchemes?.length) return detail
  try {
    input.onProgress?.('尝试整理境界体系…')
    const messages = buildRealmMessages(detail, chapters)
    let usage: ChatUsage | undefined
    const raw = await runApiTask(input.api, { task: 'analysis.plan', messages,
      temperature: 0.2,
      maxTokens: 1200,
      signal: input.signal,
      onUsage: (value) => {
        usage = value
      },
    })
    recordUsage(input.api, messages, raw, usage, input.onRecordUsage)
    const value = jsonObject(raw)
    const name = typeof value?.schemeName === 'string' ? value.schemeName.trim() : ''
    const levels = Array.isArray(value?.levels)
      ? value.levels.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
      : []
    if (!name || levels.length < 2) return detail
    const scheme: TierScheme = createTierScheme(name, levels)
    const characters = detail.characters.map((character) => {
      if (!character.cultivation) return character
      const index = levels.findIndex(
        (level) => character.cultivation?.includes(level) || level.includes(character.cultivation ?? ''),
      )
      return index >= 0
        ? {
            ...character,
            realmSchemeId: scheme.id,
            realmLevel: index + 1,
          }
        : character
    })
    return {
      ...detail,
      characters,
      realmSchemes: [...(detail.realmSchemes ?? []), scheme],
      activeRealmSchemeId: detail.activeRealmSchemeId ?? scheme.id,
    }
  } catch {
    warnings.push('境界体系未能自动整理，可稍后在设定页手动建立。')
    return detail
  }
}

export async function runImportBootstrap(
  input: ImportBootstrapInput,
): Promise<ImportBootstrapResult> {
  const progress = input.onProgress ?? (() => undefined)
  const plan = planBootstrap(input.chapters, input.mode)
  let detail: WorkDetail = {
    ...input.detail,
    characters: [...(input.detail.characters ?? [])],
    factions: [...(input.detail.factions ?? [])],
    items: [...(input.detail.items ?? [])],
    species: [...(input.detail.species ?? [])],
    storyStateEvents: [...(input.detail.storyStateEvents ?? [])],
  }
  const before = {
    characters: detail.characters.length,
    factions: detail.factions.length,
    items: (detail.items ?? []).length,
    species: (detail.species ?? []).length,
    events: detail.storyStateEvents?.length ?? 0,
    realms: detail.realmSchemes?.length ?? 0,
  }
  const warnings: string[] = []
  const reportNow = (): BootstrapReport => ({
    characters: Math.max(0, detail.characters.length - before.characters),
    factions: Math.max(0, detail.factions.length - before.factions),
    items: Math.max(0, (detail.items ?? []).length - before.items),
    species: Math.max(0, (detail.species ?? []).length - before.species),
    events: Math.max(0, (detail.storyStateEvents?.length ?? 0) - before.events),
    realms: Math.max(0, (detail.realmSchemes?.length ?? 0) - before.realms),
    analyzedChapters: 0,
    totalChapters: input.chapters.length,
    warnings: [...warnings],
  })
  const setPartial = (status: 'running' | 'partial') => {
    const report = reportNow()
    detail = {
      ...detail,
      bootstrap: {
        status,
        mode: input.mode,
        report,
        updatedAt: Date.now(),
      },
    }
    input.onPartial?.(detail)
  }

  setPartial('running')
  let analyzed = 0
  for (let index = 0; index < plan.batches.length; index += 1) {
    if (input.signal?.aborted) throw new Error('已停止建档')
    const batch = plan.batches[index]
    const chapter = batch[batch.length - 1]
    progress(`分析章节：${batch[0]?.title || ''} – ${chapter.title || ''}（${index + 1}/${plan.batches.length}）`)
    const content = batchContent(batch)
    const messages = buildStateUpdateMessages({
      work: input.work,
      detail,
      chapter,
      chapters: input.chapters,
      content,
    })
    let usage: ChatUsage | undefined
    let raw = ''
    try {
      raw = await runApiTask(input.api, { task: 'analysis.plan', messages,
        temperature: 0.15,
        maxTokens: 5000,
        signal: input.signal,
        onUsage: (value) => {
          usage = value
        },
      })
      recordUsage(input.api, messages, raw, usage, input.onRecordUsage)
      let parsed = parseStoryStateUpdate(raw)
      if (!parsed) {
        const compact = buildCompactStateUpdateMessages({
          work: input.work,
          detail,
          chapter,
          chapters: input.chapters,
          content,
        })
        raw = await runApiTask(input.api, { task: 'analysis.plan', messages: compact,
          temperature: 0.1,
          maxTokens: 3000,
          signal: input.signal,
          onUsage: (value) => {
            usage = value
          },
        })
        recordUsage(input.api, compact, raw, usage, input.onRecordUsage)
        parsed = parseStoryStateUpdate(raw)
      }
      if (!parsed) {
        warnings.push(`第 ${index + 1} 批没有返回可解析的设定 JSON，已跳过。`)
        continue
      }
      detail = applyStoryStateUpdate(
        detail,
        parsed,
        chapter.id,
        chapter.title || `第 ${index + 1} 批`,
      ).detail
      analyzed += batch.length
      setPartial('running')
    } catch (caught) {
      if (input.signal?.aborted) throw new Error('已停止建档')
      warnings.push(
        `第 ${index + 1} 批分析失败：${caught instanceof Error ? caught.message : '未知错误'}，已保留之前结果。`,
      )
    }
  }

  detail = await extractRealmScheme(input, detail, plan.batches, warnings)
  if (detail.realmSchemes?.length) {
    // extractRealmScheme 可能没有触发 partial，这里统一落一次。
  }
  if (analyzed === 0 && warnings.length > 0) {
    const report = reportNow()
    detail = {
      ...detail,
      bootstrap: {
        status: 'partial',
        mode: input.mode,
        report,
        updatedAt: Date.now(),
      },
    }
    throw new Error(`建档没有取得可用结果：${warnings[0]}`)
  }
  const report: BootstrapReport = {
    ...reportNow(),
    analyzedChapters: analyzed,
    totalChapters: input.chapters.length,
    warnings: [...new Set(warnings)].slice(0, 12),
  }
  detail = {
    ...detail,
    bootstrap: {
      status: report.warnings.length > 0 || analyzed < input.chapters.length ? 'partial' : 'done',
      mode: input.mode,
      report,
      updatedAt: Date.now(),
    },
  }
  input.onPartial?.(detail)
  progress('建档完成，正在整理报告…')
  return { detail, report }
}
