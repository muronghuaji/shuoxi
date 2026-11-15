import type { AiUsageEntry, ApiConfig, Chapter, Work, WorkDetail } from './types'
import { type ChatUsage } from './ai'
import { runApiTask } from './aiTask'
import { estimateTokens } from './utils'
import {
  buildProsePolishMessages,
  buildProseVoiceSection,
  buildStyleAnchorSection,
} from './proseCraft'

export interface ProsePolishInput {
  work: Work
  detail: WorkDetail
  chapter: Chapter
  chapters: Chapter[]
  content: string
  api: ApiConfig
  signal?: AbortSignal
  onDelta?: (text: string) => void
  onRecordUsage?: (entry: AiUsageEntry) => void
}

function recordUsage(
  api: ApiConfig,
  messages: { content: string }[],
  result: string,
  usage: ChatUsage | undefined,
  onRecordUsage?: (entry: AiUsageEntry) => void,
) {
  if (!onRecordUsage) return
  const inputTokens =
    usage?.inputTokens ?? estimateTokens(messages.map((message) => message.content).join('\n'))
  const outputTokens = usage?.outputTokens ?? estimateTokens(result)
  const inputPrice = api.inputPrice ?? 0
  const outputPrice = api.outputPrice ?? 0
  const cost =
    inputPrice > 0 || outputPrice > 0
      ? (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice
      : undefined
  onRecordUsage({
    id: `prose-polish-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    at: Date.now(),
    kind: 'AI 改写',
    model: api.model,
    inputTokens,
    outputTokens,
    cachedInputTokens: usage?.cachedInputTokens,
    cacheWriteTokens: usage?.cacheWriteTokens,
    uncachedInputTokens: usage?.uncachedInputTokens,
    actual: Boolean(usage),
    cost,
    note: '文笔精修',
  })
}

export async function polishChapterProse(input: ProsePolishInput): Promise<string> {
  const content = input.content.trim()
  if (!content) throw new Error('本章还没有可精修的正文')
  const anchors = buildStyleAnchorSection(input.chapters, input.chapter.id, input.detail.style)
  const voice = buildProseVoiceSection(input.detail)
  const messages = buildProsePolishMessages({
    workTitle: input.work.title,
    chapterTitle: input.chapter.title,
    content,
    style: input.detail.style,
    anchors,
    voice,
  })
  let usage: ChatUsage | undefined
  let streamed = ''
  const revised = await runApiTask(input.api, { task: 'writing.selection-edit', messages,
    temperature: 0.45,
    maxTokens: Math.min(8000, Math.max(4000, Math.ceil(content.length * 1.4))),
    signal: input.signal,
    onUsage: (value) => {
      usage = value
    },
    onDelta: (delta) => {
      streamed += delta
      input.onDelta?.(streamed)
    },
  })
  const clean = (streamed || revised).trim()
  if (!clean) throw new Error('模型没有返回精修后的正文')
  recordUsage(input.api, messages, clean, usage, input.onRecordUsage)
  return clean
}
