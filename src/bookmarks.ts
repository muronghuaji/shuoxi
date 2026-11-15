export interface Bookmark {
  id: string
  workId: string
  chapterId: string
  chapterTitle: string
  scrollRatio: number
  createdAt: number
}

const STORAGE_KEY = 'shuoxi.bookmarks.v1'

function readAll(): Bookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    return value
      .map((item) => {
        const record = item as Record<string, unknown>
        return {
          id: String(record.id ?? ''),
          workId: String(record.workId ?? ''),
          chapterId: String(record.chapterId ?? ''),
          chapterTitle: String(record.chapterTitle ?? ''),
          scrollRatio: Number(record.scrollRatio ?? 0),
          createdAt: Number(record.createdAt ?? 0),
        }
      })
      .filter((item) => item.id && item.workId && item.chapterId)
  } catch {
    return []
  }
}

function writeAll(items: Bookmark[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 300)))
  } catch {
    // 本地存储不可用时仅影响书签，不影响正文。
  }
}

export function loadBookmarks(workId: string): Bookmark[] {
  return readAll()
    .filter((item) => item.workId === workId)
    .sort((left, right) => right.createdAt - left.createdAt)
}

export function addBookmark(input: {
  workId: string
  chapterId: string
  chapterTitle: string
  scrollRatio?: number
}): Bookmark {
  const items = readAll()
  const existing = items.find(
    (item) => item.workId === input.workId && item.chapterId === input.chapterId,
  )
  const bookmark: Bookmark = {
    id: existing?.id ?? `bookmark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    workId: input.workId,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    scrollRatio: Math.max(0, Math.min(1, input.scrollRatio ?? existing?.scrollRatio ?? 0)),
    createdAt: existing?.createdAt ?? Date.now(),
  }
  writeAll([bookmark, ...items.filter((item) => item.id !== bookmark.id)])
  return bookmark
}

export function removeBookmark(id: string): void {
  writeAll(readAll().filter((item) => item.id !== id))
}

export function hasBookmark(workId: string, chapterId: string): boolean {
  return readAll().some((item) => item.workId === workId && item.chapterId === chapterId)
}
