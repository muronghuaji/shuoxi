import type {
  Chapter,
  ChapterStage,
  GlobalOutlineArc,
  OutlineCard,
  WorkDetail,
} from './types'
import { chapterWords } from './utils'

export const CHAPTER_STAGE_LABELS: Record<ChapterStage, string> = {
  draft: '草稿',
  writing: '写作中',
  review: '待修',
  done: '已完成',
  published: '已发布',
}

export const CHAPTER_STAGE_OPTIONS: ChapterStage[] = [
  'draft',
  'writing',
  'review',
  'done',
  'published',
]

export function chapterStageOf(chapter: Chapter): ChapterStage {
  if (chapter.stage) return chapter.stage
  return chapter.status === 'done' ? 'done' : 'writing'
}

export function chapterStatusForStage(stage: ChapterStage): 'writing' | 'done' {
  return stage === 'done' || stage === 'published' ? 'done' : 'writing'
}

export function outlineForChapter(
  detail: WorkDetail,
  chapterId: string,
): OutlineCard | undefined {
  return (detail.outline ?? []).find((card) => card.chapterId === chapterId)
}

export function arcForOutline(
  detail: WorkDetail,
  card: OutlineCard | undefined,
): GlobalOutlineArc | undefined {
  if (!card?.arcId) return undefined
  return (detail.globalOutline?.arcs ?? []).find((arc) => arc.id === card.arcId)
}

export function chapterTargetWords(chapter: Chapter, outline: OutlineCard | undefined): number {
  return outline?.targetWords || chapter.targetWords || 0
}

export function chapterPlanWarnings(
  chapter: Chapter,
  outline: OutlineCard | undefined,
): string[] {
  const warnings: string[] = []
  const words = chapterWords(chapter)
  const target = chapterTargetWords(chapter, outline)
  if (target > 0) {
    if (words < target * 0.6) warnings.push(`字数偏少：${words} / ${target}`)
    else if (words > target * 1.6) warnings.push(`字数超出：${words} / ${target}`)
  }
  if (outline?.status === '偏离') warnings.push('大纲标记为偏离')
  if (outline && !outline.chapterId) warnings.push('大纲未绑定正文')
  if (outline) {
    const beats = chapter.beats
    if (beats) {
      if (!beats.advance.trim()) warnings.push('未填本章推进')
      if (!beats.reveal.trim()) warnings.push('未填本章暴露')
      if (!beats.hook.trim()) warnings.push('未填结尾钩子')
    }
  }
  return warnings
}

export function chapterBeatProgress(chapter: Chapter): number {
  const beats = chapter.beats
  if (!beats) return 0
  return [beats.advance, beats.reveal, beats.hook].filter((item) => item.trim()).length
}

export interface OutlineHealth {
  planned: number
  unbound: number
  orphanChapters: number
  offPlan: number
  totalTarget: number
  totalActual: number
  completed: number
  arcCount: number
}

export function outlineHealth(chapters: Chapter[], detail: WorkDetail): OutlineHealth {
  const outline = detail.outline ?? []
  const boundChapterIds = new Set(outline.map((card) => card.chapterId).filter(Boolean))
  return {
    planned: outline.length,
    unbound: outline.filter((card) => !card.chapterId).length,
    orphanChapters: chapters.filter((chapter) => !boundChapterIds.has(chapter.id)).length,
    offPlan: outline.filter((card) => card.status === '偏离').length,
    totalTarget: outline.reduce((sum, card) => sum + Math.max(0, card.targetWords || 0), 0),
    totalActual: outline.reduce((sum, card) => {
      const chapter = chapters.find((item) => item.id === card.chapterId)
      return sum + (chapter ? chapterWords(chapter) : 0)
    }, 0),
    completed: outline.filter((card) => card.status === '已完成').length,
    arcCount: detail.globalOutline?.arcs.length ?? 0,
  }
}
