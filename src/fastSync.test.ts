import { describe, expect, it } from 'vitest'
import { buildFastScopedStateUpdateMessages } from './ai'
import { createEmptyDetail } from './data'
import { parseStoryStateUpdate } from './storyState'
import type { Chapter, Work } from './types'

const work: Work = {
  id: 'w1',
  title: '快速同步测试',
  synopsis: '',
  theme: '',
  genres: ['悬疑'],
  outlineMode: 'traditional',
  perspective: 'third-limited',
  characterCount: 1,
  targetWords: 100000,
  promptIds: [],
  status: '连载中',
  chapters: 1,
  words: 1000,
  updatedAt: 1,
  coverIndex: 0,
}

const chapter: Chapter = {
  id: 'c1',
  title: '第一章',
  content: '陈默走进旧书店，手里握着铜钥匙。',
  updatedAt: 1,
  status: 'writing',
  wordCount: 20,
}

function fixture() {
  const detail = createEmptyDetail()
  detail.characters = [
    {
      id: 'ch1',
      name: '陈默',
      role: '主角',
      identity: '调查员',
      personality: '克制',
      goal: '查清真相',
      status: '正常',
    },
  ]
  detail.locations = [{ id: 'l1', name: '旧书店', type: '店铺', description: '' }]
  detail.items = [{ id: 'i1', name: '铜钥匙', categoryId: 'cat', grade: 1, description: '' }]
  return detail
}

describe('fast sync schema', () => {
  it('asks for compact state updates without full audits', () => {
    const messages = buildFastScopedStateUpdateMessages({
      work,
      detail: fixture(),
      chapter,
      chapters: [chapter],
      content: chapter.content,
      reasoningEffort: 'fast',
    })
    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('changes')
    expect(text).toContain('newEntities')
    expect(text).toContain('openThreads')
    expect(text).not.toContain('"characterExperiences"')
    expect(text).not.toContain('"characterIssues"')
    expect(text).not.toContain('"factionIssues"')
    expect(text).toContain('旧书店')
    expect(text).toContain('铜钥匙')
  })

  it('parses a valid fast payload', () => {
    const parsed = parseStoryStateUpdate(
      JSON.stringify({
        summary: '陈默在旧书店找到铜钥匙。',
        events: [{ title: '旧书店', summary: '陈默找到钥匙', participants: ['陈默'] }],
        changes: [{ entityType: 'character', entityId: 'ch1', field: 'status', action: 'set', value: '正常' }],
        newEntities: [],
        openThreads: [],
        resolvedThreads: [],
        characterExperiences: [],
      }),
    )
    expect(parsed?.summary).toContain('旧书店')
    expect(parsed?.events).toHaveLength(1)
    expect(parsed?.changes).toHaveLength(1)
  })
})
