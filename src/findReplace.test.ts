import { describe, expect, it } from 'vitest'
import { findMatches, replaceAllMatches, replaceMatchAt } from './findReplace'

describe('find replace', () => {
  it('finds non-overlapping matches and respects case', () => {
    expect(findMatches('雨停。雨停。', '雨停')).toHaveLength(2)
    expect(findMatches('Rain rain', 'rain', { caseSensitive: true })).toHaveLength(1)
    expect(findMatches('Rain rain', 'rain', { caseSensitive: false })).toHaveLength(2)
  })

  it('replaces one match at a time', () => {
    const text = '他推开门。他推开门。'
    const match = findMatches(text, '他推开门')[1]
    expect(replaceMatchAt(text, match, '她回头')).toBe('他推开门。她回头。')
  })

  it('replaces all matches with literal replacement text', () => {
    const result = replaceAllMatches('林夏走了。林夏回头。', '林夏', '她')
    expect(result).toEqual({ text: '她走了。她回头。', count: 2 })
  })

  it('returns empty for empty query', () => {
    expect(findMatches('文本', '')).toEqual([])
    expect(replaceAllMatches('文本', '', '替换')).toEqual({ text: '文本', count: 0 })
  })
})
