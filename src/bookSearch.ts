import type { Chapter, WorkDetail } from './types'
import { buildEntityIndex, entityIndexMatches } from './entityIndex'

export type BookSearchKind =
  | 'chapter'
  | 'character'
  | 'species'
  | 'faction'
  | 'location'
  | 'item'
  | 'foreshadow'
  | 'weapon'
  | 'technique'
  | 'event'

export interface BookSearchResult {
  kind: BookSearchKind
  id: string
  title: string
  subtitle: string
  snippet: string
  chapterId?: string
  tab?: string
}

export const BOOK_SEARCH_KIND_LABELS: Record<BookSearchKind, string> = {
  chapter: '章节',
  character: '人物',
  species: '物种',
  faction: '势力',
  location: '地点',
  item: '物品',
  foreshadow: '伏笔',
  weapon: '武器',
  technique: '功法',
  event: '事件',
}

export const BOOK_SEARCH_TAB: Record<BookSearchKind, string | undefined> = {
  chapter: undefined,
  character: 'characters',
  species: 'species',
  faction: 'factions',
  location: 'locations',
  item: 'items',
  foreshadow: 'foreshadow',
  weapon: 'characters',
  technique: 'characters',
  event: 'events',
}

function compact(value: string | undefined | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function snippetAround(text: string, query: string, radius = 44): string {
  const clean = compact(text)
  if (!clean) return ''
  const index = clean.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) return clean.slice(0, radius * 2)
  const start = Math.max(0, index - radius)
  const end = Math.min(clean.length, index + query.length + radius)
  return `${start > 0 ? '…' : ''}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`
}

function includesQuery(text: string | undefined, query: string): boolean {
  return Boolean(text && text.toLowerCase().includes(query))
}

function firstSnippet(fields: (string | undefined)[], query: string): string {
  const hit = fields.find((field) => includesQuery(field, query))
  return snippetAround(hit ?? fields.find(Boolean) ?? '', query)
}

export function searchBook(input: {
  query: string
  chapters: Chapter[]
  detail: WorkDetail
  liveChapterId?: string
  liveContent?: string
  limit?: number
}): BookSearchResult[] {
  const query = input.query.trim()
  if (!query) return []
  const lower = query.toLowerCase()
  const limit = input.limit ?? 60
  const results: BookSearchResult[] = []
  const push = (result: BookSearchResult) => {
    if (results.length < limit) results.push(result)
  }

  for (let index = 0; index < input.chapters.length; index += 1) {
    const chapter = input.chapters[index]
    const content =
      chapter.id === input.liveChapterId ? (input.liveContent ?? chapter.content) : chapter.content
    const titleHit = includesQuery(chapter.title, lower)
    const contentHit = includesQuery(content, lower)
    if (!titleHit && !contentHit) continue
    push({
      kind: 'chapter',
      id: chapter.id,
      title: chapter.title || `第 ${index + 1} 章`,
      subtitle: `第 ${index + 1} 章 · ${chapter.content.length.toLocaleString()} 字`,
      snippet: contentHit
        ? snippetAround(content, query)
        : '章节标题命中，点击打开本章。',
      chapterId: chapter.id,
    })
    if (results.length >= limit) return results
  }

  for (const entity of buildEntityIndex(input.detail)) {
    if (!entityIndexMatches(entity, query)) continue
    push({
      kind: entity.category,
      id: entity.id,
      title: entity.name,
      subtitle: entity.subtitle,
      snippet: firstSnippet(entity.fields, query),
      tab: entity.tab,
    })
    if (results.length >= limit) return results
  }

  for (const event of input.detail.storyStateEvents ?? []) {
    for (const item of event.events ?? []) {
      const fields = [
        item.title,
        item.summary,
        item.cause,
        item.result,
        ...item.participants,
        ...item.consequences,
      ]
      if (!fields.some((field) => includesQuery(field, lower))) continue
      push({
        kind: 'event',
        id: `${event.id}-${item.id}`,
        title: item.title || '未命名事件',
        subtitle: `事件 · ${event.chapterTitle || '未命名章节'}`,
        snippet: firstSnippet(fields, query),
        chapterId: event.chapterId,
        tab: BOOK_SEARCH_TAB.event,
      })
      if (results.length >= limit) return results
    }
  }

  return results
}
