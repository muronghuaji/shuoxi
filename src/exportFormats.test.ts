import { describe, expect, it } from 'vitest'
import type { Chapter, Work } from './types'
import { buildDocx, buildEpub } from './exportFormats'

const work = {
  id: 'w-test',
  title: '雾港来信 & 旧案',
  synopsis: '林夏追查一封<旧信>。',
  theme: '旧案',
  genres: ['悬疑'],
  words: 100,
  chapters: 2,
  targetWords: 100000,
  promptIds: [],
  status: '草稿',
  updatedAt: Date.now(),
  coverIndex: 0,
  outlineMode: 'fine',
  perspective: 'third-limited',
  characterCount: 2,
} as unknown as Work

const chapters = [
  {
    id: 'c1',
    title: '第一章 雨夜',
    content: '林夏推门。\n\n柜台后有人。',
    updatedAt: Date.now(),
  },
  {
    id: 'c2',
    title: '第二章 旧书店',
    content: '信纸已经泛黄。',
    updatedAt: Date.now(),
  },
] as Chapter[]

interface ZipName {
  name: string
  dataStart: number
  size: number
}

function readLocalEntries(bytes: Uint8Array): ZipName[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries: ZipName[] = []
  let offset = 0
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength))
    entries.push({ name, dataStart: offset + 30 + nameLength + extraLength, size })
    offset += 30 + nameLength + extraLength + size
  }
  return entries
}

describe('office export formats', () => {
  it('builds a DOCX zip with document xml', () => {
    const bytes = buildDocx(work, chapters)
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    const entries = readLocalEntries(bytes)
    expect(entries.map((entry) => entry.name)).toContain('word/document.xml')
    const document = entries.find((entry) => entry.name === 'word/document.xml')
    expect(document).toBeTruthy()
    const xml = new TextDecoder().decode(
      bytes.slice(document!.dataStart, document!.dataStart + document!.size),
    )
    expect(xml).toContain('雾港来信 &amp; 旧案')
    expect(xml).toContain('第一章 雨夜')
    expect(xml).toContain('林夏推门。')
  })

  it('builds an EPUB zip with mimetype first and chapters', () => {
    const bytes = buildEpub(work, chapters)
    const entries = readLocalEntries(bytes)
    expect(entries[0].name).toBe('mimetype')
    expect(
      new TextDecoder().decode(bytes.slice(entries[0].dataStart, entries[0].dataStart + entries[0].size)),
    ).toBe('application/epub+zip')
    expect(entries.map((entry) => entry.name)).toContain('OEBPS/content.opf')
    expect(entries.some((entry) => entry.name.startsWith('OEBPS/chapter-'))).toBe(true)
  })
})
