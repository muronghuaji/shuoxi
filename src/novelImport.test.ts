import { describe, expect, it } from 'vitest'
import { parseImportedNovel } from './novelImport'

describe('parseImportedNovel', () => {
  it('splits txt by chapter markers', () => {
    const imported = parseImportedNovel(
      '旧稿.txt',
      '第一章 开端\n这是第一章。\n\n第二章 转折\n这是第二章。',
    )
    expect(imported.title).toBe('旧稿')
    expect(imported.mode).toBe('chapter')
    expect(imported.chapters).toHaveLength(2)
    expect(imported.chapters[0].title).toContain('第一章')
    expect(imported.chapters[1].content).toContain('第二章')
    expect(imported.words).toBe(12)
  })

  it('uses markdown h1 as title and h2 as chapters', () => {
    const imported = parseImportedNovel(
      'book.md',
      '# 雾港来信\n\n## 第一章 雨夜\n林夏推门。\n\n## 第二章 旧书店\n柜台后有人。',
    )
    expect(imported.title).toBe('雾港来信')
    expect(imported.mode).toBe('markdown')
    expect(imported.chapters).toHaveLength(2)
    expect(imported.chapters[0].title).toContain('雨夜')
    expect(imported.chapters[1].content).toContain('柜台')
  })

  it('recognizes preface, separate title and extra chapters', () => {
    const imported = parseImportedNovel(
      '长夜.md',
      '# 长夜行\n\n## 序章\n雨夜。\n\n## 第一章 入门\n他推门。\n\n## 番外 后日谈\n多年以后。',
    )
    expect(imported.title).toBe('长夜行')
    expect(imported.chapters.map((chapter) => chapter.title)).toEqual([
      '序章',
      '第一章 入门',
      '番外 后日谈',
    ])
  })

  it('recognizes Chinese special markers and ignores volume headings when chapters exist', () => {
    const imported = parseImportedNovel(
      '卷宗.txt',
      '第一卷 风起\n第一章 开端\n正文一。\n第二章 转折\n正文二。\n番外 后日谈\n后来。',
    )
    expect(imported.chapters.map((chapter) => chapter.title)).toEqual([
      '序章',
      '第一章 开端',
      '第二章 转折',
      '番外 后日谈',
    ])
    expect(imported.chapters[0].content).toContain('第一卷 风起')
  })

  it('recognizes chapter markers with spaces and full-width indentation', () => {
    const imported = parseImportedNovel(
      '空格.txt',
      '\u3000第 1 章 开端\n正文一。\n第 2 章 转折\n正文二。',
    )
    expect(imported.chapters).toHaveLength(2)
    expect(imported.chapters[0].title).toContain('开端')
  })

  it('uses a book title header and does not turn it into a chapter', () => {
    const imported = parseImportedNovel(
      '斗破苍穹.txt',
      '《斗破苍穹》\n\n 第一章 陨落的天才\n正文一。\n 第二章 斗气大陆\n正文二。',
    )
    expect(imported.title).toBe('斗破苍穹')
    expect(imported.chapters.map((chapter) => chapter.title)).toEqual([
      '第一章 陨落的天才',
      '第二章 斗气大陆',
    ])
  })

  it('falls back to one full-text chapter', () => {
    const imported = parseImportedNovel('片段.txt', '没有章节标题的一整段正文。')
    expect(imported.title).toBe('片段')
    expect(imported.mode).toBe('plain')
    expect(imported.chapters).toHaveLength(1)
    expect(imported.chapters[0].title).toBe('全文')
    expect(imported.words).toBe(13)
  })

  it('handles many chapters without losing count', () => {
    const text = Array.from({ length: 1500 }, (_, index) => {
      return `第${index + 1}章 标题${index + 1}\n第 ${index + 1} 段正文。`
    }).join('\n')
    const imported = parseImportedNovel('大书.txt', text)
    expect(imported.mode).toBe('chapter')
    expect(imported.chapters).toHaveLength(1500)
    expect(imported.words).toBeGreaterThan(1500)
  })

  it('reports progress while splitting', () => {
    const steps: number[] = []
    const imported = parseImportedNovel(
      '进度.txt',
      '第一章 一\n正文。\n第二章 二\n正文。',
      (progress) => steps.push(progress.percent),
    )
    expect(imported.chapters).toHaveLength(2)
    expect(steps[steps.length - 1]).toBe(88)
  })
})

