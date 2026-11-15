import { describe, expect, it } from 'vitest'
import { analyzeProseQuality } from './proseQuality'

describe('prose quality', () => {
  it('returns neutral metrics for a short clean paragraph', () => {
    const report = analyzeProseQuality('他推开门。雨停了。灯还亮着。')
    expect(report.sentences).toBe(3)
    expect(report.paragraphs).toBe(1)
    expect(report.score).toBeGreaterThan(80)
  })

  it('detects abstract emotion and filter words', () => {
    const report = analyzeProseQuality(
      '他感到非常害怕，心里充满恐惧和紧张。仿佛空气凝固了，似乎所有人都看着他。',
    )
    expect(report.abstractEmotion.length).toBeGreaterThan(0)
    expect(report.filterWords.length).toBeGreaterThan(0)
    expect(report.issues.some((issue) => issue.title.includes('抽象情绪'))).toBe(true)
  })

  it('reports repeated clauses and low dialogue ratio', () => {
    const longNarrative =
      '他沿着旧港的石板路一直走，路灯把影子拉得很长，风从海面吹过来。' +
      '他沿着旧港的石板路一直走，路灯把影子拉得很长，风从海面吹过来。' +
      '他没有说话，只是把手插进口袋，继续往码头方向走。'
    const report = analyzeProseQuality(longNarrative)
    expect(report.repeatedClauses.length).toBeGreaterThan(0)
    expect(report.dialogueRatio).toBeLessThan(0.1)
  })

  it('counts dialogue ratio from Chinese quotes', () => {
    const report = analyzeProseQuality('“你来了。”他说。“嗯。”她答。')
    expect(report.dialogueRatio).toBeGreaterThan(0)
  })
})
