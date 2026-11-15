import { describe, expect, it } from 'vitest'
import type { ImportedNovel } from './novelImport'
import {
  buildImportStyleSamples,
  importedStylePromptTitle,
  joinImportStyleSamples,
} from './importStyle'

function novel(count: number): ImportedNovel {
  return {
    title: '照雪问剑',
    mode: 'chapter',
    words: count * 100,
    chapters: Array.from({ length: count }, (_, index) => ({
      title: `第 ${index + 1} 章`,
      content: `这是第 ${index + 1} 章的正文。雨声落下来，人物走进屋里。`,
      wordCount: 100,
    })),
  }
}

describe('import style samples', () => {
  it('takes beginning, middle and end samples', () => {
    const samples = buildImportStyleSamples(novel(10))
    expect(samples).toHaveLength(3)
    expect(samples[0].chapterIndex).toBe(0)
    expect(samples[1].chapterIndex).toBe(4)
    expect(samples[2].chapterIndex).toBe(9)
    expect(samples[0].text).toContain('第 1 章')
  })

  it('dedupes samples for short books and skips empty chapters', () => {
    const shortNovel = novel(1)
    expect(buildImportStyleSamples(shortNovel)).toHaveLength(1)
    const empty = novel(3)
    empty.chapters.forEach((chapter) => {
      chapter.content = ''
    })
    expect(buildImportStyleSamples(empty)).toEqual([])
  })

  it('joins sample labels and builds a prompt title', () => {
    const joined = joinImportStyleSamples(buildImportStyleSamples(novel(5)))
    expect(joined).toContain('【开头样文')
    expect(joined).toContain('【结尾样文')
    expect(importedStylePromptTitle('照雪问剑')).toBe('照雪问剑 · 导入文风')
  })
})
