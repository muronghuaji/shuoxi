import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import {
  generatedOutlineToCards,
  mergeGlobalOutline,
  parseGeneratedOutline,
} from './outlineAi'

describe('outline ai', () => {
  it('parses generated global outline and chapter cards', () => {
    const parsed = parseGeneratedOutline(
      JSON.stringify({
        global: {
          premise: '少年追查旧案',
          theme: '选择',
          arcs: [{ title: '第一卷', goal: '入门', keyEvents: '试炼', endState: '入门' }],
        },
        chapters: [
          {
            title: '第一章 雪夜',
            summary: '主角在雪夜入门',
            goal: '完成试炼',
            conflict: '与守门人冲突',
            targetWords: 2200,
            arcIndex: 1,
            pov: '陆照雪',
            location: '问剑峰',
          },
        ],
      }),
    )
    expect(parsed?.globalOutline.premise).toBe('少年追查旧案')
    expect(parsed?.chapters).toHaveLength(1)
    const detail = createEmptyDetail()
    detail.characters = [
      { id: 'c1', name: '陆照雪', role: '', identity: '', personality: '', goal: '' },
    ]
    const cards = generatedOutlineToCards(parsed!, detail)
    expect(cards[0].arcId).toBe(parsed?.globalOutline.arcs[0].id)
    expect(cards[0].povCharacterId).toBe('c1')
    expect(cards[0].targetWords).toBe(2200)
  })

  it('merges without overwriting existing fields and appends arcs', () => {
    const current = {
      premise: '已有主线',
      theme: '',
      conflict: '',
      structure: '',
      arcs: [{ id: 'arc-old', title: '旧卷', goal: '', keyEvents: '', endState: '' }],
      turningPoints: '',
      ending: '',
      mustResolve: '',
      rules: '',
      notes: '',
    }
    const generated = {
      ...current,
      premise: '新主线',
      theme: '新主题',
      arcs: [{ id: 'arc-new', title: '新卷', goal: '', keyEvents: '', endState: '' }],
    }
    const merged = mergeGlobalOutline(current, generated)
    expect(merged.premise).toBe('已有主线')
    expect(merged.theme).toBe('新主题')
    expect(merged.arcs.map((arc) => arc.id)).toEqual(['arc-old', 'arc-new'])
  })

  it('rejects malformed output', () => {
    expect(parseGeneratedOutline('not json')).toBeNull()
    expect(parseGeneratedOutline('{}')).toBeNull()
  })
})
