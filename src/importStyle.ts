import type { ImportedNovel } from './novelImport'

export interface ImportStyleSample {
  id: string
  label: string
  chapterTitle: string
  chapterIndex: number
  text: string
}

function clip(text: string, limit: number): string {
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (clean.length <= limit) return clean
  const cut = clean.slice(0, limit)
  const sentenceEnd = Math.max(
    cut.lastIndexOf('。'),
    cut.lastIndexOf('！'),
    cut.lastIndexOf('？'),
    cut.lastIndexOf('\n'),
  )
  return sentenceEnd > limit * 0.55 ? cut.slice(0, sentenceEnd + 1) : `${cut}…`
}

function sampleText(content: string, limit = 900): string {
  const paragraphs = content
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
  return clip(paragraphs.slice(0, 4).join('\n'), limit)
}

export function buildImportStyleSamples(novel: ImportedNovel): ImportStyleSample[] {
  const candidates = novel.chapters.filter((chapter) => chapter.content.trim())
  if (candidates.length === 0) return []
  const indexes = [
    { index: 0, label: '开头样文' },
    { index: Math.floor((novel.chapters.length - 1) / 2), label: '中段样文' },
    { index: novel.chapters.length - 1, label: '结尾样文' },
  ]
  const seen = new Set<number>()
  const samples: ImportStyleSample[] = []
  for (const item of indexes) {
    if (seen.has(item.index)) continue
    const chapter = novel.chapters[item.index]
    if (!chapter || !chapter.content.trim()) continue
    seen.add(item.index)
    samples.push({
      id: `import-sample-${item.index}`,
      label: item.label,
      chapterTitle: chapter.title || `第 ${item.index + 1} 章`,
      chapterIndex: item.index,
      text: sampleText(chapter.content),
    })
  }
  return samples
}

export function joinImportStyleSamples(samples: ImportStyleSample[]): string {
  return samples
    .filter((sample) => sample.text.trim())
    .map((sample) => `【${sample.label} · ${sample.chapterTitle}】\n${sample.text.trim()}`)
    .join('\n\n')
    .slice(0, 6000)
}

export function importedStylePromptTitle(title: string): string {
  return `${title || '导入作品'} · 导入文风`
}
