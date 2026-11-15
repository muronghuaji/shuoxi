import type { AiUsageEntry, ApiConfig, ArcSummary, Chapter, Work, WorkDetail } from './types'
import { buildArcSummaryMessages, type ChatUsage } from './ai'
import { runApiTask } from './aiTask'
import { estimateTokens } from './utils'

interface RequestArcSummaryInput {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  startIndex: number
  endIndex: number
  api: ApiConfig
  onRecordUsage?: (entry: AiUsageEntry) => void
}

export async function requestArcSummary(input: RequestArcSummaryInput): Promise<ArcSummary> {
  const messages = buildArcSummaryMessages({
    work: input.work,
    detail: input.detail,
    chapters: input.chapters,
    startIndex: input.startIndex,
    endIndex: input.endIndex,
  })
  let actualUsage: ChatUsage | undefined
  const summary = await runApiTask(input.api, { task: 'analysis.story', messages,
    temperature: 0.55,
    maxTokens: 1600,
    onUsage: (usage) => {
      actualUsage = usage
    },
  })
  const text = summary.trim()
  if (!text) throw new Error('模型没有返回卷摘要')
  if (input.onRecordUsage) {
    const inputText = messages.map((message) => message.content).join('\n')
    const inputTokens = actualUsage?.inputTokens ?? estimateTokens(inputText)
    const outputTokens = actualUsage?.outputTokens ?? estimateTokens(text)
    const priceInput = input.api.inputPrice ?? 0
    const priceOutput = input.api.outputPrice ?? 0
    input.onRecordUsage({
      id: `usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      at: Date.now(),
      kind: '卷摘要',
      profile: 'writing',
      model: input.api.model,
      inputTokens,
      outputTokens,
      actual: Boolean(actualUsage),
      cost:
        actualUsage && (priceInput > 0 || priceOutput > 0)
          ? (inputTokens / 1_000_000) * priceInput + (outputTokens / 1_000_000) * priceOutput
          : undefined,
    })
  }
  const starts = input.chapters[input.startIndex]
  const ends = input.chapters[input.endIndex]
  if (!starts || !ends) throw new Error('卷摘要区间无效')
  return {
    id: `arc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    title: `第 ${input.startIndex + 1}–${input.endIndex + 1} 章`,
    startChapterId: starts.id,
    endChapterId: ends.id,
    startIndex: input.startIndex,
    endIndex: input.endIndex,
    chapterCount: input.endIndex - input.startIndex + 1,
    summary: text,
    generatedAt: new Date().toISOString(),
  }
}
