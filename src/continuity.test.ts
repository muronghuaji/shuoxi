import { describe, expect, it } from 'vitest'
import { checkContinuity } from './continuity'
import type { Chapter, WorkDetail } from './types'

function chapter(id: string, title: string, content: string): Chapter {
  return { id, title, content, updatedAt: Date.now() }
}

function detail(): WorkDetail {
  return {
    worldview: '',
    style: { tone: [], pace: '中', dialogue: '中', description: '适中', taboos: '', notes: '' },
    characters: [
      {
        id: 'c1',
        name: '陆照雪',
        role: '',
        identity: '',
        personality: '',
        goal: '',
        status: '死亡',
        weapons: [],
        currency: '',
      },
    ],
    factions: [],
    relationships: [],
    foreshadowings: [],
    analysis: '',
    storyStateEvents: [
      {
        id: 'e1',
        chapterId: 'ch1',
        chapterTitle: '第一章',
        createdAt: new Date().toISOString(),
        summary: '陆照雪死亡',
        changes: [
          {
            entityType: 'character',
            entityId: 'c1',
            field: 'status',
            action: 'set',
            value: '死亡',
          },
        ],
        events: [],
        openThreads: [],
      },
      {
        id: 'e2',
        chapterId: 'ch2',
        chapterTitle: '第二章',
        createdAt: new Date().toISOString(),
        summary: '旧剑掉落',
        changes: [
          {
            entityType: 'character',
            entityId: 'c1',
            field: 'weapons',
            action: 'remove',
            value: '照雪剑',
          },
        ],
        events: [],
        openThreads: [],
      },
    ],
  }
}

describe('continuity', () => {
  it('warns when a dead character appears later', () => {
    const warnings = checkContinuity(detail(), [
      chapter('ch1', '第一章', '陆照雪出场。'),
      chapter('ch2', '第二章', '陆照雪又站了起来。'),
    ])
    expect(warnings.some((warning) => warning.type === 'dead-character')).toBe(true)
  })

  it('warns when a lost item is used later', () => {
    const warnings = checkContinuity(detail(), [
      chapter('ch1', '第一章', '照雪剑还在。'),
      chapter('ch2', '第二章', '照雪剑被收起。'),
      chapter('ch3', '第三章', '陆照雪拔出照雪剑。'),
    ])
    expect(warnings.some((warning) => warning.type === 'lost-item')).toBe(true)
  })

  it('does not warn before the death or loss chapter', () => {
    const warnings = checkContinuity(detail(), [
      chapter('ch1', '第一章', '陆照雪还活着。'),
      chapter('ch2', '第二章', '一切正常。'),
    ])
    expect(warnings).toHaveLength(0)
  })
})
