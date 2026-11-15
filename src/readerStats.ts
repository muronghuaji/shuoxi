export interface ReaderStats {
  seconds: number
  words: number
  sessions: number
  lastAt: number
}

const STORAGE_KEY = 'shuoxi.reader.stats.v1'

function normalize(raw: unknown): ReaderStats {
  if (!raw || typeof raw !== 'object') return { seconds: 0, words: 0, sessions: 0, lastAt: 0 }
  const value = raw as Record<string, unknown>
  const number = (input: unknown): number =>
    typeof input === 'number' && Number.isFinite(input) && input >= 0 ? Math.round(input) : 0
  return {
    seconds: number(value.seconds),
    words: number(value.words),
    sessions: number(value.sessions),
    lastAt: number(value.lastAt),
  }
}

function readAll(): Record<string, ReaderStats> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const result: Record<string, ReaderStats> = {}
    for (const [workId, value] of Object.entries(parsed as Record<string, unknown>)) {
      result[workId] = normalize(value)
    }
    return result
  } catch {
    return {}
  }
}

export function loadReaderStats(workId: string): ReaderStats {
  return readAll()[workId] ?? { seconds: 0, words: 0, sessions: 0, lastAt: 0 }
}

export function recordReaderStats(workId: string, seconds: number, words: number): ReaderStats {
  const all = readAll()
  const previous = all[workId] ?? { seconds: 0, words: 0, sessions: 0, lastAt: 0 }
  const next: ReaderStats = {
    seconds: previous.seconds + Math.max(0, Math.round(seconds)),
    words: previous.words + Math.max(0, Math.round(words)),
    sessions: previous.sessions + 1,
    lastAt: Date.now(),
  }
  all[workId] = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // 阅读统计只是辅助信息
  }
  return next
}

export function formatReaderDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total} 秒`
  const minutes = Math.round(total / 60)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}
