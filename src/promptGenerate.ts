import type { AiUsageEntry, ApiConfig } from './types'
import {
  buildPromptGenerateMessages,
  parseGeneratedPrompt,
  type ChatUsage,
  type GeneratedPromptDraft,
} from './ai'
import { runApiTask } from './aiTask'
import { estimateTokens } from './utils'

interface RequestPromptGenerationInput {
  requirement: string
  categories: string[]
  api: ApiConfig
  onRecordUsage?: (entry: AiUsageEntry) => void
}

export async function requestPromptGeneration(
  input: RequestPromptGenerationInput,
): Promise<GeneratedPromptDraft> {
  const messages = buildPromptGenerateMessages({
    requirement: input.requirement,
    categories: input.categories,
  })
  let actualUsage: ChatUsage | undefined
  const raw = await runApiTask(input.api, { task: 'writing.selection-edit', messages,
    temperature: 0.7,
    maxTokens: 1200,
    onUsage: (usage) => {
      actualUsage = usage
    },
  })
  const parsed = parseGeneratedPrompt(raw)
  if (!parsed) throw new Error('模型没有返回可解析的提示词 JSON')
  const category = input.categories.includes(parsed.category) ? parsed.category : '其他'
  if (input.onRecordUsage) {
    const inputText = messages.map((message) => message.content).join('\n')
    const inputTokens = actualUsage?.inputTokens ?? estimateTokens(inputText)
    const outputTokens = actualUsage?.outputTokens ?? estimateTokens(raw)
    const priceInput = input.api.inputPrice ?? 0
    const priceOutput = input.api.outputPrice ?? 0
    input.onRecordUsage({
      id: `usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      at: Date.now(),
      kind: '提示词生成',
      profile: 'general',
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
  return { ...parsed, category }
}
