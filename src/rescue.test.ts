import { describe, expect, it } from 'vitest'
import {
  buildRescueAnalysisMessages,
  buildRescueBatches,
  buildRescueChapterMessages,
  buildRescueContext,
  buildRescuePlanMessages,
  getRescueStats,
  parseRescueAnalysis,
  parseRescueChapter,
  parseRescuePlan,
} from './rescue'
import type { Chapter, Work, WorkDetail } from './types'
import { createEmptyDetail } from './data'

const work: Work = {
  id: 'w1',
  title: '照雪问剑',
  synopsis: '旧案。',
  theme: '选择',
  genres: ['悬疑'],
  outlineMode: 'fine',
  perspective: 'third-limited',
  characterCount: 1,
  targetWords: 100000,
  promptIds: [],
  status: '连载中',
  chapters: 12,
  words: 12000,
  updatedAt: 1,
  coverIndex: 0,
}

function chapter(index: number, content = `第 ${index} 章正文。林夏推门，雨声落下来。`): Chapter {
  return {
    id: `ch${index}`,
    title: `第 ${index} 章`,
    content,
    wordCount: content.length,
    updatedAt: 1,
    status: 'writing',
    titleSource: 'manual',
  }
}

const chapters = Array.from({ length: 12 }, (_, index) => chapter(index + 1))
const detail: WorkDetail = createEmptyDetail()

describe('rescue mode', () => {
  it('reads local stats without timestamps', () => {
    const stats = getRescueStats(chapters)
    expect(stats.chapters).toBe(12)
    expect(stats.lastChapterTitle).toBe('第 12 章')
    expect(stats.lastChapterTail).toContain('林夏推门')
  })

  it('batches the whole book with finite calls', () => {
    const batches = buildRescueBatches(chapters)
    expect(batches.length).toBeLessThanOrEqual(20)
    expect(batches.flatMap((batch) => batch.chapters)).toHaveLength(12)
    expect(batches[0].startChapter).toBe(1)
    expect(batches.at(-1)?.endChapter).toBe(12)
  })

  it('builds analysis context and messages from titles, tail and settings', () => {
    const context = buildRescueContext({ work, detail, chapters, depth: 'quick' })
    expect(context).toContain('第 1 章')
    expect(context).toContain('最后一章结尾')
    expect(context).not.toContain('断更')
    const messages = buildRescueAnalysisMessages({ work, detail, chapters, depth: 'quick' })
    expect(messages[0].content).toContain('currentSituation')
    expect(messages[1].content).toContain('照雪问剑')
  })

  it('parses diagnosis, plan and chapter output', () => {
    const analysis = parseRescueAnalysis(
      JSON.stringify({
        currentSituation: '林夏在旧书店查姐姐失踪的线索。',
        characters: [{ name: '林夏', state: '在旧书店', goal: '找到姐姐' }],
        openThreads: ['姐姐失踪', '旧照片'],
        lastHook: '楼上传来脚步声',
        voice: '第三人称冷叙事',
        risks: ['不要过早揭示真相'],
        direction: '先追脚步声',
      }),
      'quick',
    )
    expect(analysis?.characters[0].name).toBe('林夏')
    expect(analysis?.openThreads).toHaveLength(2)

    const plan = parseRescuePlan(
      JSON.stringify({
        chapters: [
          {
            title: '门后的人',
            goal: '确认楼上是谁',
            conflict: '林夏不敢开门',
            reveal: '对方认识姐姐',
            hook: '找到半张照片',
            threads: ['姐姐失踪'],
          },
        ],
      }),
      '先追脚步声',
    )
    expect(plan?.chapters[0].title).toBe('门后的人')
    expect(plan?.direction).toBe('先追脚步声')

    const draft = parseRescueChapter('标题：门后的人\n\n林夏握紧钥匙，走上楼梯。', '第 13 章')
    expect(draft?.title).toBe('门后的人')
    expect(draft?.content).toContain('走上楼梯')
  })

  it('builds plan and chapter prompts with diagnosis and style', () => {
    const analysis = parseRescueAnalysis(
      JSON.stringify({
        currentSituation: '当前局面',
        characters: [],
        openThreads: [],
        lastHook: '',
        voice: '',
        risks: [],
        direction: '继续',
      }),
      'quick',
    )
    if (!analysis) throw new Error('analysis should parse')
    const planMessages = buildRescuePlanMessages({ work, detail, chapters, analysis, direction: '继续' })
    expect(planMessages[0].content).toContain('3 章')
    const chapterMessages = buildRescueChapterMessages({ work, detail, chapters, analysis })
    expect(chapterMessages[0].content).toContain('标题：')
    expect(chapterMessages[1].content).toContain('第 13 章')
  })
})
