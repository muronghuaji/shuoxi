export interface ReaderHighlight {
  id: string
  workId: string
  chapterId: string
  start: number
  end: number
  text: string
  note: string
  color: 'amber' | 'sage' | 'blue' | 'rose'
  createdAt: number
}

const STORAGE_KEY = 'shuoxi.reader.highlights.v1'

const COLORS = new Set<ReaderHighlight['color']>(['amber', 'sage', 'blue', 'rose'])

function normalize(raw: unknown): ReaderHighlight | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const workId = typeof value.workId === 'string' ? value.workId : ''
  const chapterId = typeof value.chapterId === 'string' ? value.chapterId : ''
  const text = typeof value.text === 'string' ? value.text : ''
  const start = typeof value.start === 'number' ? Math.max(0, value.start) : -1
  const end = typeof value.end === 'number' ? Math.max(0, value.end) : -1
  if (!workId || !chapterId || !text || start < 0 || end <= start) return null
  return {
    id: typeof value.id === 'string' && value.id ? value.id : `hl-${start}-${end}`,
    workId,
    chapterId,
    start,
    end,
    text,
    note: typeof value.note === 'string' ? value.note : '',
    color: COLORS.has(value.color as ReaderHighlight['color'])
      ? (value.color as ReaderHighlight['color'])
      : 'amber',
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
  }
}

function readAll(): Record<string, ReaderHighlight[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const result: Record<string, ReaderHighlight[]> = {}
    for (const [workId, list] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue
      const normalized = list.map(normalize).filter((item): item is ReaderHighlight => Boolean(item))
      if (normalized.length > 0) result[workId] = normalized
    }
    return result
  } catch {
    return {}
  }
}

export function loadReaderHighlights(workId: string): ReaderHighlight[] {
  return readAll()[workId] ?? []
}

export function saveReaderHighlights(workId: string, highlights: ReaderHighlight[]): void {
  try {
    const all = readAll()
    all[workId] = highlights.slice(0, 2000)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // 阅读高亮只是辅助信息，存储失败不应阻塞阅读
  }
}
