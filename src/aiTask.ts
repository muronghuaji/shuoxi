import type { ChatMessage, ChatUsage } from './ai'
import { streamChat } from './ai'
import type { ApiConfig } from './types'

export type AiTaskType =
  | 'writing.continue'
  | 'writing.selection-edit'
  | 'writing.title'
  | 'sync.fast'
  | 'sync.deep'
  | 'entity.generate'
  | 'entity.fill'
  | 'entity.deep-fill'
  | 'chat.character'
  | 'analysis.plan'
  | 'analysis.story'
  | 'analysis.rescue'

export type AiTaskProfile = 'writing' | 'general' | 'chat'

export interface AiTaskDefinition {
  profile: AiTaskProfile
  maxTokens: number
  temperature: number
  timeoutMs: number
  retries: number
}

export interface AiTaskApis {
  writing: ApiConfig
  general: ApiConfig
  chat: ApiConfig
}

export const AI_TASKS: Record<AiTaskType, AiTaskDefinition> = {
  'writing.continue': { profile: 'writing', maxTokens: 2600, temperature: 0.85, timeoutMs: 180_000, retries: 1 },
  'writing.selection-edit': { profile: 'writing', maxTokens: 1200, temperature: 0.8, timeoutMs: 120_000, retries: 1 },
  'writing.title': { profile: 'writing', maxTokens: 160, temperature: 0.9, timeoutMs: 45_000, retries: 1 },
  'sync.fast': { profile: 'general', maxTokens: 5000, temperature: 0.2, timeoutMs: 120_000, retries: 1 },
  'sync.deep': { profile: 'writing', maxTokens: 4000, temperature: 0.2, timeoutMs: 120_000, retries: 1 },
  'entity.generate': { profile: 'general', maxTokens: 6500, temperature: 0.9, timeoutMs: 150_000, retries: 1 },
  'entity.fill': { profile: 'general', maxTokens: 1500, temperature: 0.75, timeoutMs: 90_000, retries: 1 },
  'entity.deep-fill': { profile: 'general', maxTokens: 9000, temperature: 0.5, timeoutMs: 150_000, retries: 1 },
  'chat.character': { profile: 'chat', maxTokens: 1800, temperature: 0.85, timeoutMs: 120_000, retries: 1 },
  'analysis.plan': { profile: 'general', maxTokens: 3000, temperature: 0.6, timeoutMs: 120_000, retries: 1 },
  'analysis.story': { profile: 'writing', maxTokens: 1800, temperature: 0.4, timeoutMs: 120_000, retries: 1 },
  'analysis.rescue': { profile: 'general', maxTokens: 4000, temperature: 0.5, timeoutMs: 120_000, retries: 1 },
}

export function apiForTask(task: AiTaskType, apis: AiTaskApis): ApiConfig {
  return apis[AI_TASKS[task].profile]
}

export interface AiTaskUsageRecord {
  id: string
  task: AiTaskType
  model: string
  inputTokens: number
  outputTokens: number
  at: number
}

export interface AiTaskUsageSummary {
  requests: number
  inputTokens: number
  outputTokens: number
  byTask: Record<string, { requests: number; inputTokens: number; outputTokens: number }>
}

const usageRecords: AiTaskUsageRecord[] = []

function recordTaskUsage(task: AiTaskType, api: ApiConfig, usage: ChatUsage): void {
  usageRecords.push({
    id: `task-usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    task,
    model: api.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    at: Date.now(),
  })
  if (usageRecords.length > 300) usageRecords.splice(0, usageRecords.length - 300)
}

export function aiTaskUsageSummary(): AiTaskUsageSummary {
  const summary: AiTaskUsageSummary = {
    requests: usageRecords.length,
    inputTokens: 0,
    outputTokens: 0,
    byTask: {},
  }
  for (const record of usageRecords) {
    summary.inputTokens += record.inputTokens
    summary.outputTokens += record.outputTokens
    const current = summary.byTask[record.task] ?? { requests: 0, inputTokens: 0, outputTokens: 0 }
    current.requests += 1
    current.inputTokens += record.inputTokens
    current.outputTokens += record.outputTokens
    summary.byTask[record.task] = current
  }
  return summary
}

export function resetAiTaskUsage(): void {
  usageRecords.length = 0
}

const TRANSIENT_ERROR = /超时|timeout|abort|网络|fetch|502|503|504|429|没有返回正文内容|finish_reason|rate limit/i

const MAX_CONCURRENT_AI_TASKS = 2
let activeAiTasks = 0
const aiTaskWaiters: { priority: number; resolve: () => void }[] = []

async function acquireAiTaskSlot(priority: number): Promise<void> {
  if (activeAiTasks < MAX_CONCURRENT_AI_TASKS) {
    activeAiTasks += 1
    return
  }
  await new Promise<void>((resolve) => {
    aiTaskWaiters.push({ priority, resolve })
    aiTaskWaiters.sort((left, right) => right.priority - left.priority)
  })
}

function releaseAiTaskSlot(): void {
  activeAiTasks = Math.max(0, activeAiTasks - 1)
  const next = aiTaskWaiters.shift()
  if (next) {
    activeAiTasks += 1
    next.resolve()
  }
}

export function aiTaskConcurrency(): { active: number; queued: number; max: number } {
  return {
    active: activeAiTasks,
    queued: aiTaskWaiters.length,
    max: MAX_CONCURRENT_AI_TASKS,
  }
}

export interface RunAiTaskOptions {
  task: AiTaskType
  apis: AiTaskApis
  messages: ChatMessage[]
  signal?: AbortSignal
  maxTokens?: number
  temperature?: number
  priority?: number
  onDelta?: (delta: string) => void
  onFinishReason?: (reason: string) => void
  onUsage?: (usage: ChatUsage) => void
}

async function executeTask(
  task: AiTaskType,
  api: ApiConfig,
  definition: AiTaskDefinition,
  options: Omit<RunAiTaskOptions, 'task' | 'apis'>,
): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt <= definition.retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), definition.timeoutMs)
    const onAbort = () => controller.abort()
    options.signal?.addEventListener('abort', onAbort)
    await acquireAiTaskSlot(options.priority ?? 0)
    try {
      return await streamChat(api, options.messages, {
        temperature: options.temperature ?? definition.temperature,
        maxTokens: options.maxTokens ?? definition.maxTokens,
        signal: controller.signal,
        onDelta: options.onDelta,
        onFinishReason: options.onFinishReason,
        onUsage: (usage) => {
          recordTaskUsage(task, api, usage)
          options.onUsage?.(usage)
        },
      })
    } catch (error) {
      lastError = error
      if (options.signal?.aborted) throw error
      if (attempt >= definition.retries || !TRANSIENT_ERROR.test(String(error))) throw error
      await new Promise((resolve) => setTimeout(resolve, 1200))
    } finally {
      releaseAiTaskSlot()
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI 任务失败')
}

/** 统一 AI 任务入口：模型选择、预算、超时、一次瞬时重试。 */
export async function runAiTask(options: RunAiTaskOptions): Promise<string> {
  const definition = AI_TASKS[options.task]
  const api = apiForTask(options.task, options.apis)
  return executeTask(options.task, api, definition, options)
}

/** 兼容只持有一套 API 的旧模块；任务预算、超时和重试仍统一。 */
export async function runApiTask(
  api: ApiConfig,
  options: Omit<RunAiTaskOptions, 'apis'>,
): Promise<string> {
  const definition = AI_TASKS[options.task]
  return executeTask(options.task, api, definition, options)
}
