import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import type { Chapter, OutlineCard } from './types'
import {
  chapterBeatProgress,
  chapterPlanWarnings,
  chapterStageOf,
  chapterStatusForStage,
  chapterTargetWords,
  outlineHealth,
} from './chapterMeta'

const chapter: Chapter = {
  id: 'ch1',
  title: '第一章',
  content: '第一段。\n\n第二段。',
  updatedAt: 1,
  status: 'writing',
  beats: { advance: '推进', reveal: '', hook: '' },
  targetWords: 1000,
}

const outline: OutlineCard = {
  id: 'o1',
  title: '第一章大纲',
  summary: '',
  goal: '',
  conflict: '',
  status: '待写',
  targetWords: 1200,
  chapterId: 'ch1',
}

describe('chapter meta', () => {
  it('derives stage, beats and target', () => {
    expect(chapterStageOf(chapter)).toBe('writing')
    expect(chapterStageOf({ ...chapter, stage: 'review' })).toBe('review')
    expect(chapterStatusForStage('published')).toBe('done')
    expect(chapterBeatProgress(chapter)).toBe(1)
    expect(chapterTargetWords(chapter, outline)).toBe(1200)
  })

  it('reports plan warnings and health', () => {
    const warnings = chapterPlanWarnings(chapter, outline)
    expect(warnings.some((item) => item.includes('字数偏少'))).toBe(true)
    expect(warnings.some((item) => item.includes('未填本章暴露'))).toBe(true)

    const detail = createEmptyDetail()
    detail.outline = [outline, { ...outline, id: 'o2', chapterId: undefined }]
    detail.globalOutline = {
      premise: '',
      theme: '',
      conflict: '',
      structure: '',
      arcs: [{ id: 'arc1', title: '第一卷', goal: '', keyEvents: '', endState: '' }],
      turningPoints: '',
      ending: '',
      mustResolve: '',
      rules: '',
      notes: '',
    }
    const health = outlineHealth([chapter], detail)
    expect(health.planned).toBe(2)
    expect(health.unbound).toBe(1)
    expect(health.arcCount).toBe(1)
  })
})
