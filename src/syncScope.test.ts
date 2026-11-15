import { describe, expect, it } from 'vitest'
import { selectScopedSyncDetail, syncScopeSummary } from './syncScope'
import { buildScopedStateUpdateMessages } from './ai'
import { createEmptyDetail } from './data'
import type { Work } from './types'

const work: Work = {
  id: 'w1',
  title: '测试书',
  synopsis: '',
  theme: '',
  genres: ['悬疑'],
  outlineMode: 'traditional',
  perspective: 'third-limited',
  characterCount: 2,
  targetWords: 100000,
  promptIds: [],
  status: '草稿',
  chapters: 1,
  words: 1000,
  updatedAt: 1,
  coverIndex: 0,
}

function detailWithEntities() {
  const detail = createEmptyDetail()
  detail.characters = [
    {
      id: 'c1',
      name: '林夏',
      role: '主角',
      identity: '调查员',
      personality: '',
      goal: '',
    },
    {
      id: 'c2',
      name: '顾长风',
      role: '配角',
      identity: '剑客',
      personality: '',
      goal: '',
    },
  ]
  detail.factions = [
    { id: 'f1', name: '旧书店', type: '店铺', leader: '林夏', goal: '', description: '' },
    { id: 'f2', name: '太虚剑宗', type: '宗门', leader: '顾长风', goal: '', description: '' },
  ]
  detail.items = [
    { id: 'i1', name: '铜钥匙', categoryId: 'cat1', grade: 1, description: '' },
    { id: 'i2', name: '照雪剑', categoryId: 'cat1', grade: 9, description: '' },
  ]
  detail.locations = [
    { id: 'l1', name: '旧书店', type: '建筑', description: '' },
    { id: 'l2', name: '太虚山门', type: '山门', description: '' },
  ]
  detail.relationships = [
    { id: 'r1', fromId: 'c1', toId: 'c2', type: '旧识', note: '' },
  ]
  return detail
}

describe('sync scope', () => {
  it('only keeps entities mentioned by the chapter', () => {
    const detail = detailWithEntities()
    const scoped = selectScopedSyncDetail(detail, '林夏推开旧书店的门，手里捏着铜钥匙。')
    expect(scoped.characters.map((item) => item.name)).toContain('林夏')
    expect(scoped.factions.map((item) => item.name)).toContain('旧书店')
    expect(scoped.factions.map((item) => item.name)).not.toContain('太虚剑宗')
    expect((scoped.items ?? []).map((item) => item.name)).toContain('铜钥匙')
    expect((scoped.items ?? []).map((item) => item.name)).not.toContain('照雪剑')
    expect((scoped.locations ?? []).map((item) => item.name)).toEqual(['旧书店'])
    expect(syncScopeSummary(scoped).characters).toBeLessThan(detail.characters.length + 1)
  })

  it('adds one-hop relationships for mentioned characters', () => {
    const detail = detailWithEntities()
    const scoped = selectScopedSyncDetail(detail, '林夏推开门。')
    expect(scoped.characters.some((item) => item.name === '顾长风')).toBe(true)
    expect(scoped.relationships).toHaveLength(1)
  })

  it('builds a scoped prompt that tells the model not to audit outside entities', () => {
    const messages = buildScopedStateUpdateMessages({
      work,
      detail: detailWithEntities(),
      chapter: {
        id: 'ch1',
        title: '第一章',
        content: '林夏拿起铜钥匙。',
        updatedAt: 1,
        status: 'writing',
        wordCount: 10,
      },
      chapters: [],
      content: '林夏拿起铜钥匙。',
      reasoningEffort: 'balanced',
    })
    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('本次是范围同步')
    expect(text).toContain('林夏')
    expect(text).not.toContain('太虚山门')
  })
})
