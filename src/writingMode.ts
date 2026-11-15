import type {
  GlobalOutline,
  OutlineCard,
  Work,
  WorkDetail,
  WritingContextOptions,
  WritingMode,
} from './types'

export function resolveWritingMode(work: Work, _detail?: WorkDetail): WritingMode {
  return work.writingMode === 'wheelchair' ? 'wheelchair' : 'director'
}

export function createGlobalOutline(): GlobalOutline {
  return {
    premise: '',
    theme: '',
    conflict: '',
    structure: '',
    arcs: [],
    turningPoints: '',
    ending: '',
    mustResolve: '',
    rules: '',
    notes: '',
  }
}

export function outlineToDirective(card: OutlineCard): string {
  const lines = [
    card.summary ? `本章概要：${card.summary}` : '',
    card.goal ? `本章目标：${card.goal}` : '',
    card.conflict ? `核心冲突：${card.conflict}` : '',
  ].filter(Boolean)
  return lines.join('\n')
}

export function writingModeLabel(mode: WritingMode): string {
  return mode === 'wheelchair' ? '轮椅模式' : '导演模式'
}

export function resolveContextOptions(work: Work): WritingContextOptions {
  return {
    globalOutline: work.contextOptions?.globalOutline ?? true,
    chapterOutline: work.contextOptions?.chapterOutline ?? true,
    events: work.contextOptions?.events ?? true,
    state: work.contextOptions?.state ?? true,
    foreshadowings: work.contextOptions?.foreshadowings ?? true,
  }
}
