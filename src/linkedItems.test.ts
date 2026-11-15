import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import type { Work } from './types'
import { buildLinkedItemsMessages, parseLinkedItems } from './linkedItems'

const work: Work = {
  id: 'w1',
  title: '测试书',
  synopsis: '',
  theme: '',
  genres: [],
  outlineMode: 'fine',
  perspective: 'third-limited',
  characterCount: 1,
  targetWords: 10000,
  promptIds: [],
  status: '草稿',
  chapters: 0,
  words: 0,
  updatedAt: 0,
  coverIndex: 0,
}

describe('linked items', () => {
  it('builds owner prompts with existing categories and item names', () => {
    const detail = createEmptyDetail()
    detail.itemCategories = [{ id: 'c1', name: '法宝', order: 0 }]
    const messages = buildLinkedItemsMessages({
      work,
      detail,
      owners: [
        { type: 'character', id: 'ch1', name: '沈掌柜', itemNames: ['青玉算盘'] },
        { type: 'facility', id: 'fac1', name: '总仓', itemNames: ['雾港令牌'] },
      ],
    })
    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('沈掌柜')
    expect(text).toContain('青玉算盘')
    expect(text).toContain('设施资源仓库')
    expect(text).toContain('法宝')
  })

  it('parses item arrays and ignores prose', () => {
    const rows = parseLinkedItems(
      '```json\n{"items":[{"name":"青玉算盘","owner":"沈掌柜","category":"法宝","grade":3,"description":"算账"}]}\n```',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('青玉算盘')
    expect(parseLinkedItems('没有 JSON')).toEqual([])
  })
})
