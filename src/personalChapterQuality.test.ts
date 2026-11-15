import { describe, expect, it } from 'vitest'
import type { ApiConfig } from './types'
import { preparePersonalChapterContent } from './personalChapterQuality'

const api = {} as ApiConfig

describe('personal chapter quality', () => {
  it('accepts a complete chapter without a retry', async () => {
    const text = '雨停了。她推开门，走进巷子。'.repeat(60)
    const result = await preparePersonalChapterContent({
      text,
      messages: [],
      targetWords: 1500,
      writingApi: api,
      chapterTitle: '雨停之后',
      chapterNumber: 1,
    })
    expect(result.retried).toBe(false)
    expect(result.quality.shouldRetry).toBe(false)
  })

  it('removes exactly repeated long paragraphs locally', async () => {
    const paragraph =
      '雨从黄昏开始下，邮局门口的积水映着路灯光。她把信封收进内袋，沿着旧街往前走。'.repeat(8)
    const result = await preparePersonalChapterContent({
      text: `${paragraph}\n${paragraph}\n她停在旧邮局门口。`,
      messages: [],
      targetWords: 500,
      writingApi: api,
      chapterTitle: '旧邮局',
      chapterNumber: 1,
    })
    expect(result.removedRepeatedParagraphs).toBeGreaterThan(0)
    expect(result.content.split(paragraph).length - 1).toBe(1)
  })
})
