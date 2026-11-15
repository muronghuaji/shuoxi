import { describe, expect, it } from 'vitest'
import {
  resolveWritingMode,
  createGlobalOutline,
  outlineToDirective,
  resolveContextOptions,
} from './writingMode'
import type { Work, WorkDetail } from './types'

function work(partial: Partial<Work> = {}): Work {
  return {
    id: 'w1',
    title: '测试',
    synopsis: '',
    theme: '',
    genres: ['仙侠'],
    outlineMode: 'fine',
    perspective: 'third-limited',
    characterCount: 1,
    targetWords: 100000,
    promptIds: [],
    status: '草稿',
    chapters: 1,
    words: 0,
    updatedAt: Date.now(),
    coverIndex: 0,
    ...partial,
  }
}

function detail(partial: Partial<WorkDetail> = {}): WorkDetail {
  return {
    worldview: '',
    style: { tone: [], pace: '中', dialogue: '中', description: '适中', taboos: '', notes: '' },
    characters: [],
    factions: [],
    relationships: [],
    foreshadowings: [],
    analysis: '',
    ...partial,
  }
}

describe('writingMode', () => {
  it('uses explicit writing mode first', () => {
    expect(resolveWritingMode(work({ writingMode: 'director' }), detail({ outline: [{ id: 'o', title: '', summary: '', goal: '', conflict: '', status: '待写', targetWords: 1000 }] }))).toBe('director')
  })

  it('keeps director mode even when an outline exists', () => {
    expect(
      resolveWritingMode(
        work(),
        detail({
          outline: [
            { id: 'o', title: '第一章', summary: '', goal: '', conflict: '', status: '待写', targetWords: 1000 },
          ],
        }),
      ),
    ).toBe('director')
  })

  it('defaults to director mode', () => {
    expect(resolveWritingMode(work({ outlineMode: 'fine' }), detail())).toBe('director')
  })

  it('builds a directive from chapter plan', () => {
    expect(
      outlineToDirective({
        id: 'o',
        title: '第一章',
        summary: '进入试剑台',
        goal: '赢下比试',
        conflict: '外门对首席',
        status: '待写',
        targetWords: 1000,
      }),
    ).toContain('本章目标：赢下比试')
  })

  it('creates a global outline shape', () => {
    expect(createGlobalOutline().arcs).toEqual([])
  })

  it('resolves context options with safe defaults', () => {
    expect(resolveContextOptions(work()).events).toBe(true)
    expect(
      resolveContextOptions(work({ contextOptions: { events: false, state: false } })).events,
    ).toBe(false)
    expect(
      resolveContextOptions(work({ contextOptions: { events: false, state: false } })).state,
    ).toBe(false)
  })
})
