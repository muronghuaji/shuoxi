import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Chapter } from './types'
import {
  DEFAULT_READER_SETTINGS,
  READER_POSITION_KEY,
  loadReaderPosition,
  normalizeReaderSettings,
  readingProgress,
  saveReaderPosition,
} from './reader'

function chapter(id: string, content: string, wordCount?: number): Chapter {
  return {
    id,
    title: id,
    content,
    wordCount: wordCount ?? content.length,
    updatedAt: 1,
    status: 'writing',
    titleSource: 'manual',
  }
}

describe('reader settings and progress', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalizes and clamps reader settings', () => {
    expect(normalizeReaderSettings(null)).toEqual(DEFAULT_READER_SETTINGS)
    const settings = normalizeReaderSettings({
      theme: 'paper',
      fontFamily: 'sans',
      fontSize: 99,
      lineHeight: 0.2,
      pageWidth: 200,
      paragraphGap: 8,
      showEntityColors: true,
    })
    expect(settings.theme).toBe('paper')
    expect(settings.fontFamily).toBe('sans')
    expect(settings.fontSize).toBe(30)
    expect(settings.lineHeight).toBe(1.5)
    expect(settings.pageWidth).toBe(620)
    expect(settings.paragraphGap).toBe(1.6)
    expect(settings.showEntityColors).toBe(true)
  })

  it('calculates weighted reading progress', () => {
    const chapters = [chapter('a', 'a'.repeat(100), 100), chapter('b', 'b'.repeat(300), 300)]
    expect(readingProgress(chapters, 0, 0)).toBe(0)
    expect(readingProgress(chapters, 0, 0.5)).toBe(13)
    expect(readingProgress(chapters, 1, 0)).toBe(25)
    expect(readingProgress(chapters, 1, 1)).toBe(100)
    expect(readingProgress([], 0, 2)).toBe(0)
  })

  it('persists per-work reading positions', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    })
    saveReaderPosition('w1', 'ch2', 0.42)
    expect(loadReaderPosition('w1')?.chapterId).toBe('ch2')
    expect(loadReaderPosition('w1')?.scrollRatio).toBeCloseTo(0.42)
    expect(store.has(READER_POSITION_KEY)).toBe(true)
    expect(loadReaderPosition('missing')).toBeNull()
  })
})
