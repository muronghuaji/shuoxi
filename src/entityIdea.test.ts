import { describe, expect, it } from 'vitest'
import {
  ENTITY_IDEA_EXAMPLES,
  buildEntityIdeaAnalysisMessages,
  buildEntityIdeaHint,
  parseEntityIdeaAnalysis,
} from './entityIdea'
import { createEmptyDetail } from './data'
import type { Work } from './types'

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
  chapters: 1,
  words: 0,
  updatedAt: 1,
  coverIndex: 0,
}

describe('entity idea analysis', () => {
  it('builds an analysis prompt around the user idea', () => {
    const detail = createEmptyDetail()
    detail.characters = [
      {
        id: 'c1',
        name: '林夏',
        role: '主角',
        identity: '',
        personality: '',
        goal: '',
      },
    ]
    const messages = buildEntityIdeaAnalysisMessages({
      kind: 'character',
      work,
      detail,
      idea: '一个表面温和、实际在利用主角的旧友',
    })
    expect(messages[0].content).toContain('只分析想法')
    expect(messages[1].content).toContain('表面温和')
    expect(messages[1].content).toContain('林夏')
  })

  it('parses a structured idea analysis and makes a generation hint', () => {
    const analysis = parseEntityIdeaAnalysis(
      JSON.stringify({
        understanding: '你想让旧友成为隐藏利用者。',
        mustKeep: ['表面温和', '有旧友情分'],
        avoid: ['不要写成纯反派'],
        direction: '放在旧书店重逢场景',
      }),
    )
    expect(analysis?.understanding).toContain('隐藏利用者')
    expect(analysis?.mustKeep).toHaveLength(2)
    const hint = buildEntityIdeaHint({
      idea: '一个表面温和、实际在利用主角的旧友',
      analysis: analysis!,
      extra: '物品分类：信物',
    })
    expect(hint).toContain('作者原始想法')
    expect(hint).toContain('必须保留')
    expect(hint).toContain('物品分类')
    expect(hint).toContain('不要改写成无关设定')
  })

  it('rejects empty analysis and has examples for every entity kind', () => {
    expect(parseEntityIdeaAnalysis('')).toBeNull()
    for (const kind of ['character', 'faction', 'item', 'location', 'species'] as const) {
      expect(ENTITY_IDEA_EXAMPLES[kind].length).toBeGreaterThan(0)
    }
  })

  it('repairs trailing commas and falls back to markdown-like analysis', () => {
    const repaired = parseEntityIdeaAnalysis(
      '```json\n{"understanding":"保留旧友关系","mustKeep":["表面温和",],"avoid":["纯反派",],"direction":"旧书店重逢",}\n```',
    )
    expect(repaired?.understanding).toBe('保留旧友关系')
    expect(repaired?.mustKeep).toEqual(['表面温和'])

    const fallback = parseEntityIdeaAnalysis(
      '理解：他想写一个表面温和的旧友。\n必须保留：旧友关系\n避免：写成纯反派\n设定落点：旧书店重逢',
    )
    expect(fallback?.understanding).toContain('表面温和')
    expect(fallback?.mustKeep.join('')).toContain('旧友关系')
    expect(fallback?.avoid.join('')).toContain('写成纯反派')
  })
})
