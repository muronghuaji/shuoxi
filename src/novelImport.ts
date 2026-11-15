export interface ImportedNovelChapter {
  title: string
  content: string
  wordCount: number
}

export type NovelImportMode = 'markdown' | 'chapter' | 'volume' | 'plain'

export interface ImportedNovel {
  title: string
  chapters: ImportedNovelChapter[]
  mode: NovelImportMode
  words: number
}

export interface NovelImportProgress {
  percent: number
  stage: string
  chapters?: number
  words?: number
}

type ProgressHandler = (progress: NovelImportProgress) => void

interface MarkdownHeading {
  level: number
  title: string
  index: number
  end: number
}

interface ChapterMarker {
  index: number
  end: number
  title: string
}

const CHAPTER_MARKER =
  /^[ \t\u3000]*(第[ \t\u3000]*[0-9０-９零〇一二三四五六七八九十百千万两]+[ \t\u3000]*[章回节集幕][^\n]{0,60}|(?:Chapter|CHAPTER|Ch\.)[ \t]*[0-9IVXLCDM]+[^\n]{0,60})[ \t\u3000]*$/gim
const SPECIAL_MARKER =
  /^[ \t\u3000]*(序章|序言|楔子|引子|前言|后记|尾声|终章|大结局|番外[^\n]{0,40})[ \t\u3000]*$/gim
const VOLUME_MARKER =
  /^[ \t\u3000]*(第[ \t\u3000]*[0-9０-９零〇一二三四五六七八九十百千万两]+[ \t\u3000]*[卷部篇][^\n]{0,60}|卷[0-9０-９零〇一二三四五六七八九十百千万两]+[^\n]{0,40})[ \t\u3000]*$/gim

function cleanTitle(value: string, fallback: string): string {
  return value.replace(/^#+\s*/, '').trim().slice(0, 80) || fallback
}

function countChars(text: string): number {
  return text.replace(/\s+/g, '').length
}

function detectBookTitle(text: string, fallback: string): string {
  const firstLines = text
    .split('\n')
    .slice(0, 6)
    .map((line) => line.trim())
    .filter(Boolean)
  for (const line of firstLines) {
    const match = line.match(/^《([^》]{1,50})》$/)
    if (match) return match[1].trim() || fallback
  }
  return fallback
}

function isBookHeaderBlock(value: string): boolean {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return true
  if (lines.length > 4) return false
  return lines.every(
    (line) =>
      /^《[^》]{1,50}》$/.test(line) ||
      /^(作者|书名|简介|内容简介|标签|来源|状态|字数)[：:]/.test(line),
  )
}

function isChapterLike(title: string): boolean {
  return /^(第[ \t\u3000]*[0-9０-９零〇一二三四五六七八九十百千万两]+[ \t\u3000]*[章回节集幕卷部篇]|(?:Chapter|Ch\.)\s*[0-9IVXLCDM]+|序章|序言|楔子|引子|前言|后记|尾声|终章|大结局|番外)/i.test(
    title.trim(),
  )
}

function report(handler: ProgressHandler | undefined, progress: NovelImportProgress) {
  if (!handler) return
  try {
    handler(progress)
  } catch {
    // UI 进度回调不应影响解析
  }
}

function collectMarkdownHeadings(text: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = []
  const matcher = /^[ \t]*(#{1,3})[ \t]+(.+?)[ \t]*$/gm
  let match: RegExpExecArray | null
  while ((match = matcher.exec(text))) {
    headings.push({
      level: match[1].length,
      title: cleanTitle(match[2], ''),
      index: match.index,
      end: match.index + match[0].length,
    })
  }
  return headings
}

function chaptersFromHeadings(
  text: string,
  headings: MarkdownHeading[],
  baseName: string,
  onProgress?: ProgressHandler,
): ImportedNovel | null {
  if (headings.length < 2) return null
  const first = headings[0]
  const firstIsChapter = isChapterLike(first.title)
  const title = first.level === 1 && !firstIsChapter ? first.title : baseName
  let chapterHeadings = headings
  let contentStart = 0

  if (first.level === 1 && !firstIsChapter) {
    contentStart = first.end
    const later = headings.slice(1)
    if (later.length === 0) return null
    const minLevel = Math.min(...later.map((heading) => heading.level))
    chapterHeadings = later.filter((heading) => heading.level === minLevel)
  } else {
    const minLevel = Math.min(...headings.map((heading) => heading.level))
    chapterHeadings = headings.filter((heading) => heading.level === minLevel)
  }

  if (chapterHeadings.length === 0) return null
  const chapters: ImportedNovelChapter[] = []
  const preface = text.slice(contentStart, chapterHeadings[0].index).trim()
  if (preface && !isBookHeaderBlock(preface)) {
    chapters.push({ title: '序章', content: preface, wordCount: countChars(preface) })
  }

  for (let index = 0; index < chapterHeadings.length; index += 1) {
    const heading = chapterHeadings[index]
    const end = chapterHeadings[index + 1]?.index ?? text.length
    const content = text.slice(heading.end, end).trim()
    if (!content) continue
    chapters.push({
      title: cleanTitle(heading.title, `第 ${chapters.length + 1} 章`),
      content,
      wordCount: countChars(content),
    })
    if (index > 0 && index % 100 === 0) {
      report(onProgress, {
        percent: 65 + Math.min(20, Math.round((index / chapterHeadings.length) * 20)),
        stage: `整理章节 ${index} / ${chapterHeadings.length}`,
        chapters: chapters.length,
      })
    }
  }
  if (chapters.length === 0) return null
  const words = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0)
  return { title, chapters, mode: 'markdown', words }
}

function collectMarkers(text: string, matcher: RegExp): ChapterMarker[] {
  const markers: ChapterMarker[] = []
  matcher.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = matcher.exec(text))) {
    const title = cleanTitle(match[1], '')
    if (!title) continue
    markers.push({ index: match.index, end: match.index + match[0].length, title })
  }
  return markers
}

function chaptersFromMarkers(
  text: string,
  markers: ChapterMarker[],
  mode: NovelImportMode,
  onProgress?: ProgressHandler,
): ImportedNovelChapter[] {
  if (markers.length === 0) return []
  const sorted = [...markers].sort((a, b) => a.index - b.index)
  const chapters: ImportedNovelChapter[] = []
  const preface = text.slice(0, sorted[0].index).trim()
  if (preface && !isBookHeaderBlock(preface)) {
    chapters.push({ title: '序章', content: preface, wordCount: countChars(preface) })
  }
  for (let index = 0; index < sorted.length; index += 1) {
    const marker = sorted[index]
    const end = sorted[index + 1]?.index ?? text.length
    const content = text.slice(marker.end, end).trim()
    if (!content) continue
    chapters.push({
      title: cleanTitle(marker.title, `第 ${chapters.length + 1} 章`),
      content,
      wordCount: countChars(content),
    })
    if (mode === 'volume' && index % 50 === 0) {
      report(onProgress, {
        percent: 60 + Math.min(25, Math.round((index / sorted.length) * 25)),
        stage: `整理卷章 ${index} / ${sorted.length}`,
        chapters: chapters.length,
      })
    }
  }
  return chapters
}

export function parseImportedNovel(
  fileName: string,
  rawText: string,
  onProgress?: ProgressHandler,
): ImportedNovel {
  report(onProgress, { percent: 8, stage: '读取文本…' })
  const text = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const baseName = fileName.replace(/\.[^.]+$/, '').trim() || '导入作品'
  const bookTitle = detectBookTitle(text, baseName)
  report(onProgress, { percent: 18, stage: '识别书名与章节标记…' })

  const headings = collectMarkdownHeadings(text)
  report(onProgress, { percent: 30, stage: `发现 ${headings.length} 个 Markdown 标题` })
  const markdown = chaptersFromHeadings(text, headings, bookTitle, onProgress)
  if (markdown) {
    report(onProgress, {
      percent: 88,
      stage: `已识别 ${markdown.chapters.length} 章`,
      chapters: markdown.chapters.length,
      words: markdown.words,
    })
    return markdown
  }

  report(onProgress, { percent: 38, stage: '识别第 X 章 / Chapter 标题…' })
  const chapterMarkers = [
    ...collectMarkers(text, CHAPTER_MARKER),
    ...collectMarkers(text, SPECIAL_MARKER),
  ]
  if (chapterMarkers.length > 0) {
    const chapters = chaptersFromMarkers(text, chapterMarkers, 'chapter', onProgress)
    if (chapters.length > 0) {
      const words = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0)
      report(onProgress, {
        percent: 88,
        stage: `已识别 ${chapters.length} 章`,
        chapters: chapters.length,
        words,
      })
      return { title: bookTitle, chapters, mode: 'chapter', words }
    }
  }

  report(onProgress, { percent: 55, stage: '尝试识别卷 / 部标题…' })
  const volumeMarkers = [ ...collectMarkers(text, VOLUME_MARKER), ...collectMarkers(text, SPECIAL_MARKER) ]
  if (volumeMarkers.length > 0) {
    const chapters = chaptersFromMarkers(text, volumeMarkers, 'volume', onProgress)
    if (chapters.length > 0) {
      const words = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0)
      report(onProgress, {
        percent: 88,
        stage: `已识别 ${chapters.length} 个卷章`,
        chapters: chapters.length,
        words,
      })
      return { title: bookTitle, chapters, mode: 'volume', words }
    }
  }

  const body = text.trim()
  const chapters = body
    ? [{ title: '全文', content: body, wordCount: countChars(body) }]
    : []
  const words = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0)
  report(onProgress, {
    percent: 88,
    stage: chapters.length ? '未发现章节标题，按全文导入' : '没有找到正文',
    chapters: chapters.length,
    words,
  })
  return { title: bookTitle, chapters, mode: 'plain', words }
}
