import { describe, expect, it } from 'vitest'
import type { Chapter } from './types'
import { createEmptyDetail } from './data'
import {
  createLocalChapterSummary,
  DEFAULT_SYNC_SETTINGS,
  isImportantChapter,
  normalizeSyncSettings,
  shouldAutoSyncChapter,
} from './syncSettings'

const chapter: Chapter = {
  id: 'ch1',
  title: '第一章 旧信',
  content:
    '林夏推开旧书店的门。\n雨声压低了整条街。\n柜台上放着一封没有署名的信。\n她拆开信，里面只有半页旧案的卷宗。',
  updatedAt: 1,
  status: 'done',
  titleSource: 'manual',
}

describe('sync settings', () => {
  it('defaults to no post-generation sync and clamps interval', () => {
    expect(DEFAULT_SYNC_SETTINGS.afterGeneration).toBe(false)
    expect(normalizeSyncSettings({ chapterInterval: 999 }).chapterInterval).toBe(100)
    expect(normalizeSyncSettings({ chapterInterval: -3 }).chapterInterval).toBe(1)
    expect(normalizeSyncSettings({ strategy: 'bad' }).strategy).toBe('current')
    expect(normalizeSyncSettings({ afterGeneration: true }).afterGeneration).toBe(true)
  })

  it('detects important chapters from title or multiple content signals', () => {
    expect(isImportantChapter({ ...chapter, title: '第 8 章 真相', content: '没有明显词' })).toBe(true)
    expect(
      isImportantChapter({
        ...chapter,
        title: '第 9 章',
        content: '掌门重伤，随后宗门背叛了他，旧案真相暴露。',
      }),
    ).toBe(true)
    expect(
      isImportantChapter({
        ...chapter,
        title: '第 10 章 散步',
        content: '两人沿着河边慢慢走，雨停了。',
      }),
    ).toBe(false)
  })

  it('triggers interval sync and important chapters', () => {
    expect(
      shouldAutoSyncChapter({ chapterIndex: 9, lastSyncedIndex: -1, interval: 10 }),
    ).toBe(true)
    expect(
      shouldAutoSyncChapter({ chapterIndex: 8, lastSyncedIndex: -1, interval: 10 }),
    ).toBe(false)
    expect(
      shouldAutoSyncChapter({
        chapterIndex: 11,
        lastSyncedIndex: 9,
        interval: 10,
      }),
    ).toBe(false)
    expect(
      shouldAutoSyncChapter({
        chapterIndex: 3,
        lastSyncedIndex: 2,
        interval: 10,
        important: true,
      }),
    ).toBe(true)
  })

  it('creates a local extractive summary without AI', () => {
    const detail = createEmptyDetail()
    detail.characters = [
      {
        id: 'c1',
        name: '林夏',
        role: '主角',
        identity: '',
        personality: '',
        goal: '',
      },
    ]
    const result = createLocalChapterSummary(chapter, detail)
    expect(result.summary).toContain('林夏')
    expect(result.summary).toContain('半页旧案')
    expect(result.keywords).toContain('林夏')
  })
})
