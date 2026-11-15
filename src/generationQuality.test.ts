import { describe, expect, it } from 'vitest'
import {
  buildGenerationRetryInstruction,
  checkGenerationQuality,
  resolveMinimumGeneratedChars,
} from './generationQuality'

describe('generation quality thresholds', () => {
  it('uses a dynamic minimum based on chapter target', () => {
    expect(resolveMinimumGeneratedChars(0)).toBe(300)
    expect(resolveMinimumGeneratedChars(2000)).toBe(600)
    expect(resolveMinimumGeneratedChars(3000)).toBe(900)
    expect(resolveMinimumGeneratedChars(8000)).toBe(1200)
  })

  it('accepts a normal completed paragraph', () => {
    const result = checkGenerationQuality({
      text: '雨停了。她推开门。'.repeat(80),
      targetWords: 2000,
      finishReason: 'stop',
    })
    expect(result.shouldRetry).toBe(false)
    expect(result.issues).toHaveLength(0)
  })

  it('detects short, truncated and unfinished text', () => {
    const short = checkGenerationQuality({
      text: '她推开门。',
      targetWords: 2000,
      finishReason: 'stop',
    })
    expect(short.issues).toContain('too-short')

    const truncated = checkGenerationQuality({
      text: '她推开门。'.repeat(100),
      targetWords: 2000,
      finishReason: 'length',
    })
    expect(truncated.issues).toContain('finish-length')

    const unfinished = checkGenerationQuality({
      text: '她推开门，'.repeat(80),
      targetWords: 2000,
      finishReason: 'stop',
    })
    expect(unfinished.issues).toContain('mid-sentence')
  })

  it('detects unclosed quotes', () => {
    const result = checkGenerationQuality({
      text: '“你回来了。'.repeat(40),
      targetWords: 2000,
      finishReason: 'stop',
    })
    expect(result.issues).toContain('unclosed-quote')
  })

  it('builds a retry instruction with target and reason', () => {
    const quality = checkGenerationQuality({
      text: '只有一句话。',
      targetWords: 2000,
      finishReason: 'length',
    })
    const text = buildGenerationRetryInstruction({
      quality,
      targetWords: 2000,
      directive: '继续调查遗书',
    })
    expect(text).toContain('本章目标约 2000 字')
    expect(text).toContain('输出被截断')
    expect(text).toContain('不要重复已有段落')
  })
})
