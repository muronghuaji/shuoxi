import type { ApiConfig } from './types'
import type { ChatMessage, ChatUsage } from './ai'
import { runApiTask } from './aiTask'
import {
  buildGenerationRetryInstruction,
  checkGenerationQuality,
  type GenerationQualityResult,
} from './generationQuality'
import { repairRepeatedParagraphs } from './storyAudit'
import { cleanPersonalChapterText } from './personalNovel'

export interface PersonalChapterQualityResult {
  content: string
  quality: GenerationQualityResult
  retried: boolean
  retryUsage?: ChatUsage
  retryMessages?: ChatMessage[]
  removedRepeatedParagraphs: number
}

export async function preparePersonalChapterContent(input: {
  text: string
  messages: ChatMessage[]
  targetWords: number
  writingApi: ApiConfig
  chapterTitle: string
  chapterNumber: number
}): Promise<PersonalChapterQualityResult> {
  let content = input.text.trim()
  const repaired = repairRepeatedParagraphs(content)
  content = repaired.text
  let quality = checkGenerationQuality({
    text: content,
    targetWords: input.targetWords,
  })
  let retried = false
  let retryUsage: ChatUsage | undefined
  let retryMessages: ChatMessage[] | undefined

  if (quality.shouldRetry) {
    retried = true
    retryMessages = [
      ...input.messages,
      { role: 'assistant', content },
      {
        role: 'user',
        content: buildGenerationRetryInstruction({
          quality,
          targetWords: input.targetWords,
          directive: `重写第 ${input.chapterNumber} 章《${input.chapterTitle}》，保持本章目标、冲突和已有设定，补全完整正文。`,
        }),
      },
    ]
    const retryRaw = await runApiTask(input.writingApi, {
      task: 'writing.continue',
      messages: retryMessages,
      maxTokens: Math.min(8000, Math.max(1800, input.targetWords * 2)),
      temperature: 0.82,
      onUsage: (usage) => {
        retryUsage = usage
      },
    })
    const candidate = cleanPersonalChapterText(retryRaw)
    if (candidate) content = candidate
    quality = checkGenerationQuality({
      text: content,
      targetWords: input.targetWords,
    })
  }

  return {
    content,
    quality,
    retried,
    retryUsage,
    retryMessages,
    removedRepeatedParagraphs: repaired.removed,
  }
}
