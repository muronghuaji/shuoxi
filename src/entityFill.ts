import type { AiUsageEntry, ApiConfig, CharacterCard, FactionCard, Work, WorkDetail } from './types'
import {
  buildEntityDeepFillMessages,
  buildEntityFillMessages,
  buildEntityGenerateMessages,
  parseEntityFill,
  type ChatUsage,
  type EntityFillKind,
} from './ai'
import { runApiTask } from './aiTask'
import { normalizeCharacterProfile } from './characterProfile'
import { normalizeFactionProfile } from './factionProfile'
import { estimateTokens } from './utils'

interface EntityFillRequest {
  kind: EntityFillKind
  work: Work
  detail: WorkDetail
  entity: Record<string, unknown>
  api: ApiConfig
  background?: boolean
  onRecordUsage?: (entry: AiUsageEntry) => void
}

interface EntityGenerateRequest {
  kind: EntityFillKind
  work: Work
  detail: WorkDetail
  hint?: string
  api: ApiConfig
  onRecordUsage?: (entry: AiUsageEntry) => void
}

function recordUsage(
  api: ApiConfig,
  messages: { content: string }[],
  result: string,
  actualUsage: ChatUsage | undefined,
  kind: '实体补全' | '实体生成',
  onRecordUsage?: (entry: AiUsageEntry) => void,
) {
  if (!onRecordUsage) return
  const inputText = messages.map((message) => message.content).join('\n')
  const inputTokens = actualUsage?.inputTokens ?? estimateTokens(inputText)
  const outputTokens = actualUsage?.outputTokens ?? estimateTokens(result)
  const priceInput = api.inputPrice ?? 0
  const priceOutput = api.outputPrice ?? 0
  const cost =
    actualUsage && (priceInput > 0 || priceOutput > 0)
      ? (inputTokens / 1_000_000) * priceInput +
        (outputTokens / 1_000_000) * priceOutput
      : undefined
  onRecordUsage({
    id: `usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    at: Date.now(),
    kind,
    profile: 'general',
    model: api.model,
    inputTokens,
    outputTokens,
    actual: Boolean(actualUsage),
    cost,
  })
}

export async function requestEntityFill(input: EntityFillRequest): Promise<Record<string, unknown>> {  const messages = buildEntityFillMessages({
    kind: input.kind,
    work: input.work,
    detail: input.detail,
    entity: input.entity,
  })
  let actualUsage: ChatUsage | undefined
  const result = await runApiTask(input.api, {
    task: 'entity.fill',
    messages,
    temperature: 0.75,
    maxTokens: 1500,
    onUsage: (usage) => {
      actualUsage = usage
    },
  })
  const fields = parseEntityFill(result)
  if (!fields) throw new Error('模型没有返回可解析的档案 JSON')
  recordUsage(input.api, messages, result, actualUsage, '实体补全', input.onRecordUsage)
  return fields
}

function extractGeneratedProfile(generated: Record<string, unknown>): unknown {
  if (generated.profile && typeof generated.profile === 'object') return generated.profile
  if (typeof generated.profile === 'string') {
    try {
      return JSON.parse(generated.profile) as unknown
    } catch {
      return undefined
    }
  }
  // 部分模型会直接输出 profile 内容，不包一层 {"profile": ...}。
  if (
    'coreContradiction' in generated ||
    'truePersonality' in generated ||
    'publicFace' in generated ||
    'trueFace' in generated
  ) {
    return generated
  }
  return undefined
}

function fillMissingValue(current: unknown, incoming: unknown): unknown {
  if (incoming === undefined || incoming === null) return current
  if (current === undefined || current === null || current === '') return incoming
  if (Array.isArray(current)) {
    if (current.length > 0 || !Array.isArray(incoming)) return current
    return incoming
  }
  if (typeof current === 'object' && typeof incoming === 'object') {
    const output: Record<string, unknown> = { ...(current as Record<string, unknown>) }
    for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
      output[key] = fillMissingValue(output[key], value)
    }
    return output
  }
  return current
}

export function mergeCharacterDeepArchive(
  character: CharacterCard,
  generated: Record<string, unknown>,
): Partial<CharacterCard> {
  const incoming = extractGeneratedProfile(generated)
  if (!incoming || typeof incoming !== 'object') return {}
  return {
    profile: normalizeCharacterProfile(
      fillMissingValue(
        normalizeCharacterProfile(character.profile),
        incoming,
      ) as ReturnType<typeof normalizeCharacterProfile>,
    ),
  }
}

/** 只补基础档案的空白字段，不覆盖已有内容。 */
export function mergeCharacterBasicArchive(
  character: CharacterCard,
  generated: Record<string, unknown>,
): Partial<CharacterCard> {
  const patch: Record<string, unknown> = {}
  const current = character as unknown as Record<string, unknown>
  const textFields = [
    'role',
    'identity',
    'personality',
    'goal',
    'appearance',
    'background',
    'gender',
    'age',
    'position',
    'cultivation',
    'spiritRoot',
    'physique',
    'talent',
    'currency',
    'status',
  ]
  for (const key of textFields) {
    const value = generated[key]
    const existing = current[key]
    if (
      typeof value === 'string' &&
      value.trim() &&
      (typeof existing !== 'string' || !existing.trim())
    ) {
      patch[key] = value.trim()
    }
  }
  for (const key of ['weapons', 'techniques', 'treasures'] as const) {
    const value = generated[key]
    if (
      Array.isArray(value) &&
      value.some((item) => typeof item === 'string' && item.trim()) &&
      (!Array.isArray(current[key]) || (current[key] as unknown[]).length === 0)
    ) {
      patch[key] = value
        .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        .map((item) => item.trim())
    }
  }
  return patch as Partial<CharacterCard>
}

export function mergeFactionDeepArchive(
  faction: FactionCard,
  generated: Record<string, unknown>,
): Partial<FactionCard> {
  const incoming = extractGeneratedProfile(generated)
  if (!incoming || typeof incoming !== 'object') return {}
  return {
    profile: normalizeFactionProfile(
      fillMissingValue(
        normalizeFactionProfile(faction.profile),
        incoming,
      ) as ReturnType<typeof normalizeFactionProfile>,
    ),
  }
}

export async function requestEntityDeepFill(input: EntityFillRequest): Promise<Record<string, unknown>> {
  const messages = buildEntityDeepFillMessages({
    kind: input.kind,
    work: input.work,
    detail: input.detail,
    entity: input.entity,
  })
  let actualUsage: ChatUsage | undefined
  const result = await runApiTask(input.api, {
    task: 'entity.deep-fill',
    messages,
    temperature: 0.5,
    maxTokens: input.kind === 'faction' ? 9000 : 8000,
    priority: input.background ? -1 : 0,
    onUsage: (usage) => {
      actualUsage = usage
    },
  })
  let fields = parseEntityFill(result)
  if (!fields) {
    const retryMessages = [
      ...messages,
      {
        role: 'user' as const,
        content:
          '上一次输出无法解析或可能被截断。请重新只输出一个完整合法的 {"profile":{...}} JSON；只写核心字段，每个字段一句短句；不要 markdown。',
      },
    ]
    const retried = await runApiTask(input.api, {
      task: 'entity.deep-fill',
      messages: retryMessages,
      temperature: 0.25,
      maxTokens: input.kind === 'faction' ? 10000 : 9000,
      priority: input.background ? -1 : 0,
      onUsage: (usage) => {
        actualUsage = usage
      },
    })
    fields = parseEntityFill(retried)
    if (fields) recordUsage(input.api, retryMessages, retried, actualUsage, '实体补全', input.onRecordUsage)
  } else {
    recordUsage(input.api, messages, result, actualUsage, '实体补全', input.onRecordUsage)
  }
  if (!fields) throw new Error('模型没有返回可解析的深度档案 JSON')
  return fields
}

export async function requestEntityGenerate(
  input: EntityGenerateRequest,
): Promise<Record<string, unknown>> {
  const messages = buildEntityGenerateMessages({
    kind: input.kind,
    work: input.work,
    detail: input.detail,
    hint: input.hint,
  })
  let actualUsage: ChatUsage | undefined
  const firstBudget =
    input.kind === 'faction'
      ? 8000
      : input.kind === 'character'
        ? 6500
        : input.kind === 'species'
          ? 4000
          : 2500
  const retryBudget =
    input.kind === 'faction'
      ? 10000
      : input.kind === 'character'
        ? 8000
        : input.kind === 'species'
          ? 5000
          : 3000
  let result = await runApiTask(input.api, {
    task: 'entity.generate',
    messages,
    temperature: 0.9,
    maxTokens: firstBudget,
    onUsage: (usage) => {
      actualUsage = usage
    },
  })
  let fields = parseEntityFill(result)
  if (!fields) {
    // 深度角色档案字段较多，容易被截断；给模型一次更严格的 JSON 重试。
    const retryMessages = [
      ...messages,
      {
        role: 'user' as const,
        content:
          '上一次输出无法解析，可能被截断。请重新只输出一个完整、合法的 JSON 对象；不要 markdown、不要解释；必须包含 name 和所要求的字段；深度档案每个字段只写一句短句，优先保证括号完整闭合。',
      },
    ]
    result = await runApiTask(input.api, {
      task: 'entity.generate',
      messages: retryMessages,
      temperature: 0.35,
      maxTokens: retryBudget,
      onUsage: (usage) => {
        actualUsage = usage
      },
    })
    fields = parseEntityFill(result)
  }
  if (!fields) {
    // 最后给一个极简版 JSON，宁可少写档案字段，也要先拿到合法对象。
    const minimalMessages = [
      ...messages,
      {
        role: 'user' as const,
        content: [
          '上一次输出仍然无法解析。请输出最短的合法 JSON 版本：',
          '只必须包含 name，以及 type / role / leader / goal / description / appearance 中适用的字段；',
          'profile 只写少量核心字段（例如公开形象、真实面目、核心矛盾、目的、叙事功能），每个字段一句短句；',
          '其余字段可以省略或写空字符串 / 空数组；不要 markdown，不要解释。',
        ].join('\n'),
      },
    ]
    result = await runApiTask(input.api, {
      task: 'entity.generate',
      messages: minimalMessages,
      temperature: 0.2,
      maxTokens: 3500,
      onUsage: (usage) => {
        actualUsage = usage
      },
    })
    fields = parseEntityFill(result)
  }
  if (!fields) {
    throw new Error(
      `模型没有返回可解析的新实体 JSON（输出 ${result.length} 字，可能被截断；请在设置中换用更稳定的模型或降低生成复杂度）`,
    )
  }
  recordUsage(input.api, messages, result, actualUsage, '实体生成', input.onRecordUsage)
  return fields
}

export function characterFromGenerated(
  generated: Record<string, unknown>,
  detail: WorkDetail,
  options: { name?: string; factionId?: string; lifecycle?: CharacterCard['lifecycle'] } = {},
): CharacterCard {
  const stringValue = (key: string, fallback = '') =>
    typeof generated[key] === 'string' ? String(generated[key]).trim() : fallback
  const listValue = (key: string): string[] =>
    Array.isArray(generated[key])
      ? generated[key].map((item) => String(item).trim()).filter(Boolean)
      : []
  const factionName = stringValue('sectName')
  const faction = detail.factions.find(
    (item) => item.id === options.factionId || item.name === factionName,
  )
  return {
    id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: options.name || stringValue('name', '新角色'),
    role: stringValue('role', '配角'),
    identity: stringValue('identity'),
    personality: stringValue('personality'),
    goal: stringValue('goal'),
    gender: stringValue('gender') || undefined,
    age: stringValue('age') || undefined,
    sectId: options.factionId ?? faction?.id,
    position: stringValue('position'),
    cultivation: stringValue('cultivation'),
    spiritRoot: stringValue('spiritRoot'),
    physique: stringValue('physique'),
    talent: stringValue('talent'),
    techniques: listValue('techniques'),
    weapons: listValue('weapons'),
    treasures: listValue('treasures'),
    currency: stringValue('currency'),
    appearance: stringValue('appearance'),
    background: stringValue('background'),
    status: stringValue('status', '正常'),
    lifecycle: options.lifecycle ?? '未上线',
    profile: normalizeCharacterProfile(generated.profile),
  }
}
