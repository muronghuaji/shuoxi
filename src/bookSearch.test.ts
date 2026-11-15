import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import { searchBook } from './bookSearch'
import type { Chapter } from './types'

function chapter(id: string, title: string, content: string): Chapter {
  return { id, title, content, updatedAt: 1, status: 'writing' }
}

describe('book search', () => {
  it('searches chapter titles and content, including live content', () => {
    const chapters = [
      chapter('c1', '雨夜来客', '林夏推开旧书店的门。'),
      chapter('c2', '寻人启事', '照片上的眉眼已经泛黄。'),
    ]
    const results = searchBook({
      query: '旧书店',
      chapters,
      detail: createEmptyDetail(),
      liveChapterId: 'c2',
      liveContent: '她想起了旧书店。',
    })
    expect(results.filter((item) => item.kind === 'chapter')).toHaveLength(2)
    expect(results[0].chapterId).toBe('c1')
    expect(results.some((item) => item.snippet.includes('旧书店'))).toBe(true)
  })

  it('searches book entities and groups event results', () => {
    const detail = createEmptyDetail()
    detail.characters = [
      {
        id: 'p1',
        name: '林夏',
        role: '主角',
        identity: '旧书店店主',
        personality: '',
        goal: '找到姐姐',
      },
    ]
    detail.factions = [
      {
        id: 'f1',
        name: '雾港晚报',
        type: '媒体',
        leader: '陈默',
        goal: '',
        description: '地方小报。',
      },
    ]
    detail.locations = [
      { id: 'l1', name: '旧书店', type: '店铺', description: '街角二层。' },
    ]
    detail.items = [
      { id: 'i1', name: '旧铜钥匙', categoryId: 'cat1', grade: 1, description: '生锈的钥匙。' },
    ]
    detail.foreshadowings = [
      {
        id: 'fo1',
        title: '旧案卷宗',
        status: '未回收',
        plantedIn: '第 1 章',
        note: '姐姐留下的线索。',
      },
    ]
    detail.storyStateEvents = [
      {
        id: 'e1',
        chapterId: 'c1',
        chapterTitle: '雨夜来客',
        createdAt: '2026-01-01',
        summary: '林夏见到姐姐。',
        changes: [],
        events: [
          {
            id: 'ev1',
            title: '旧信出现',
            summary: '柜台上出现一封旧信。',
            participants: ['林夏'],
            location: '旧书店',
            cause: '',
            result: '',
            consequences: [],
            importance: 'high',
            status: 'canon',
          },
        ],
      },
    ]
    const results = searchBook({ query: '旧', chapters: [], detail })
    expect(results.some((item) => item.kind === 'character')).toBe(true)
    expect(results.some((item) => item.kind === 'faction' && item.title === '雾港晚报')).toBe(false)
    expect(results.some((item) => item.kind === 'location')).toBe(true)
    expect(results.some((item) => item.kind === 'item')).toBe(true)
    expect(results.some((item) => item.kind === 'foreshadow')).toBe(true)
    expect(results.some((item) => item.kind === 'event' && item.tab === 'events')).toBe(true)
  })

  it('returns nothing for empty query or missing text', () => {
    const detail = createEmptyDetail()
    const chapters = [chapter('c1', '第一章', '一些正文。')]
    expect(searchBook({ query: '   ', chapters, detail })).toEqual([])
    expect(searchBook({ query: '不存在', chapters, detail })).toEqual([])
  })
})
