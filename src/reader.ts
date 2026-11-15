import type { Chapter } from './types'
import { countWords } from './utils'

export type ReaderTheme = 'night' | 'paper' | 'sepia' | 'green'
export type ReaderFont = 'serif' | 'sans'

export interface ReaderSettings {
  theme: ReaderTheme
  fontFamily: ReaderFont
  fontSize: number
  lineHeight: number
  pageWidth: number
  paragraphGap: number
  showEntityColors: boolean
}

export interface ReaderPosition {
  chapterId: string
  scrollRatio: number
  updatedAt: number
}

export const READER_SETTINGS_KEY = 'shuoxi.reader.settings.v1'
export const READER_POSITION_KEY = 'shuoxi.reader.position.v1'

export const READER_THEME_META: Record<
  ReaderTheme,
  { label: string; background: string; text: string; muted: string }
> = {
  night: {
    label: '夜间',
    background: '#0f1012',
    text: '#d7d0c4',
    muted: '#7b7469',
  },
  paper: {
    label: '纸白',
    background: '#f3efe6',
    text: '#2b2925',
    muted: '#80786b',
  },
  sepia: {
    label: '米黄',
    background: '#e9dcc4',
    text: '#342b20',
    muted: '#7d6f5b',
  },
  green: {
    label: '护眼',
    background: '#dfe8da',
    text: '#263328',
    muted: '#65745f',
  },
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'night',
  fontFamily: 'serif',
  fontSize: 19,
  lineHeight: 1.95,
  pageWidth: 760,
  paragraphGap: 0.9,
  showEntityColors: false,
}

export function normalizeReaderSettings(raw: unknown): ReaderSettings {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const number = (input: unknown, fallback: number, min: number, max: number) =>
    typeof input === 'number' && Number.isFinite(input)
      ? Math.min(max, Math.max(min, input))
      : fallback
  const theme: ReaderTheme =
    value.theme === 'paper' || value.theme === 'sepia' || value.theme === 'green'
      ? value.theme
      : 'night'
  const fontFamily: ReaderFont = value.fontFamily === 'sans' ? 'sans' : 'serif'
  return {
    theme,
    fontFamily,
    fontSize: Math.round(number(value.fontSize, DEFAULT_READER_SETTINGS.fontSize, 16, 30)),
    lineHeight: Math.round(number(value.lineHeight, DEFAULT_READER_SETTINGS.lineHeight, 1.5, 2.4) * 100) / 100,
    pageWidth: Math.round(number(value.pageWidth, DEFAULT_READER_SETTINGS.pageWidth, 620, 1100)),
    paragraphGap: Math.round(number(value.paragraphGap, DEFAULT_READER_SETTINGS.paragraphGap, 0.4, 1.6) * 10) / 10,
    showEntityColors: value.showEntityColors === true,
  }
}

export function readingProgress(
  chapters: Chapter[],
  chapterIndex: number,
  scrollRatio: number,
): number {
  if (chapters.length === 0) return 0
  const weights = chapters.map((chapter) => Math.max(1, chapter.wordCount ?? countWords(chapter.content)))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const before = weights.slice(0, Math.max(0, chapterIndex)).reduce((sum, weight) => sum + weight, 0)
  const ratio = Math.min(1, Math.max(0, scrollRatio))
  const current = (weights[chapterIndex] ?? 0) * ratio
  return total > 0 ? Math.min(100, Math.round(((before + current) / total) * 100)) : 0
}

export function loadReaderPosition(workId: string): ReaderPosition | null {
  try {
    const raw = localStorage.getItem(READER_POSITION_KEY)
    if (!raw) return null
    const map = JSON.parse(raw) as Record<string, ReaderPosition>
    const position = map[workId]
    if (!position || typeof position.chapterId !== 'string') return null
    return {
      chapterId: position.chapterId,
      scrollRatio: Math.min(1, Math.max(0, Number(position.scrollRatio) || 0)),
      updatedAt: Number(position.updatedAt) || 0,
    }
  } catch {
    return null
  }
}

export function saveReaderPosition(
  workId: string,
  chapterId: string,
  scrollRatio: number,
): void {
  try {
    const raw = localStorage.getItem(READER_POSITION_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, ReaderPosition>) : {}
    map[workId] = {
      chapterId,
      scrollRatio: Math.min(1, Math.max(0, scrollRatio)),
      updatedAt: Date.now(),
    }
    localStorage.setItem(READER_POSITION_KEY, JSON.stringify(map))
  } catch {
    // 阅读位置只是便利功能，存储失败不能阻断阅读
  }
}
