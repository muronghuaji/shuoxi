import type { AiUsageEntry, Chapter, Work, WorkDetail } from './types'
import { chapterWords } from './utils'

export interface UsageDailyBucket {
  date: string
  workId?: string
  chapterId?: string
  kind: string
  model: string
  calls: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  cacheWriteTokens?: number
  cost: number
  actualCalls: number
  estimatedCalls: number
  unknownCostCalls: number
}

export interface UsageTotals {
  calls: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  cost: number
  actualCalls: number
  estimatedCalls: number
  unknownCostCalls: number
}

export interface WritingDailySnapshot {
  date: string
  works: Record<string, { words: number; chapters: number; completed: number }>
}

export interface WritingActivityEntry {
  at: number
  workId: string
  words: number
}

export type BudgetMode = 'off' | 'warn' | 'block'

export interface StatsBudget {
  monthlyBudget: number
  currency: string
  budgetMode?: BudgetMode
}

export interface WorkStats {
  work: Work
  chapters: number
  completedChapters: number
  plannedChapters: number
  words: number
  targetWords: number
  progress: number
  tokens: number
  cost: number
  calls: number
  costPerThousandWords: number
  lastUpdated: number
}

export interface DimensionStat {
  key: string
  label: string
  calls: number
  tokens: number
  cost: number
}

export interface DailyPoint {
  date: string
  value: number
  secondary?: number
}

export interface WritingSession {
  start: number
  end: number
  minutes: number
  words: number
}

export interface ChapterCostStat {
  workId: string
  workTitle: string
  chapterId: string
  chapterTitle: string
  words: number
  cost: number
  tokens: number
  calls: number
}

export interface AiRequestQuality {
  total: number
  failed: number
  failureRate: number
  averageLatencyMs: number
}

export function requestQuality(
  requests: { ok: boolean; latencyMs: number }[],
): AiRequestQuality {
  const total = requests.length
  const failed = requests.filter((request) => !request.ok).length
  const averageLatencyMs =
    total > 0
      ? requests.reduce((sum, request) => sum + Math.max(0, request.latencyMs), 0) / total
      : 0
  return {
    total,
    failed,
    failureRate: total > 0 ? (failed / total) * 100 : 0,
    averageLatencyMs,
  }
}

export const DEFAULT_STATS_BUDGET: StatsBudget = {
  monthlyBudget: 0,
  currency: 'CNY',
  budgetMode: 'off',
}

export function localDateKey(value: number | Date = Date.now()): string {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateKeysBack(days: number, end: number | Date = Date.now()): string[] {
  const result: string[] = []
  const cursor = new Date(end)
  cursor.setHours(12, 0, 0, 0)
  for (let index = days - 1; index >= 0; index -= 1) {
    const value = new Date(cursor)
    value.setDate(cursor.getDate() - index)
    result.push(localDateKey(value))
  }
  return result
}

export function shortDateLabel(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

export function emptyUsageTotals(): UsageTotals {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    cost: 0,
    actualCalls: 0,
    estimatedCalls: 0,
    unknownCostCalls: 0,
  }
}

export function normalizeBudget(value: unknown): StatsBudget {
  if (!value || typeof value !== 'object') return { ...DEFAULT_STATS_BUDGET }
  const raw = value as Record<string, unknown>
  const monthlyBudget =
    typeof raw.monthlyBudget === 'number' && Number.isFinite(raw.monthlyBudget)
      ? Math.max(0, Math.round(raw.monthlyBudget * 100) / 100)
      : 0
  return {
    monthlyBudget,
    currency: typeof raw.currency === 'string' && raw.currency.trim() ? raw.currency : 'CNY',
    budgetMode:
      raw.budgetMode === 'warn' || raw.budgetMode === 'block' ? raw.budgetMode : 'off',
  }
}

export function usageEntryToBucket(entry: AiUsageEntry): UsageDailyBucket {
  const cost = typeof entry.cost === 'number' && Number.isFinite(entry.cost) ? entry.cost : 0
  return {
    date: localDateKey(entry.at),
    workId: entry.workId,
    chapterId: entry.chapterId,
    kind: entry.kind,
    model: entry.model || '未知模型',
    calls: 1,
    inputTokens: Math.max(0, entry.inputTokens || 0),
    outputTokens: Math.max(0, entry.outputTokens || 0),
    cachedInputTokens: Math.max(0, entry.cachedInputTokens || 0),
    cacheWriteTokens: Math.max(0, entry.cacheWriteTokens || 0),
    cost,
    actualCalls: entry.actual ? 1 : 0,
    estimatedCalls: entry.actual ? 0 : 1,
    unknownCostCalls: cost > 0 ? 0 : 1,
  }
}

function bucketKey(bucket: UsageDailyBucket): string {
  return [
    bucket.date,
    bucket.workId ?? '',
    bucket.chapterId ?? '',
    bucket.kind,
    bucket.model,
  ].join('|')
}

export function addUsageToDaily(
  buckets: UsageDailyBucket[],
  entry: AiUsageEntry,
): UsageDailyBucket[] {
  const incoming = usageEntryToBucket(entry)
  const key = bucketKey(incoming)
  const existing = buckets.find((bucket) => bucketKey(bucket) === key)
  if (!existing) return [...buckets, incoming]
  return buckets.map((bucket) =>
    bucketKey(bucket) === key
      ? {
          ...bucket,
          calls: bucket.calls + incoming.calls,
          inputTokens: bucket.inputTokens + incoming.inputTokens,
          outputTokens: bucket.outputTokens + incoming.outputTokens,
          cachedInputTokens:
            (bucket.cachedInputTokens ?? 0) + (incoming.cachedInputTokens ?? 0),
          cacheWriteTokens:
            (bucket.cacheWriteTokens ?? 0) + (incoming.cacheWriteTokens ?? 0),
          cost: bucket.cost + incoming.cost,
          actualCalls: bucket.actualCalls + incoming.actualCalls,
          estimatedCalls: bucket.estimatedCalls + incoming.estimatedCalls,
          unknownCostCalls: bucket.unknownCostCalls + incoming.unknownCostCalls,
        }
      : bucket,
  )
}

export function buildUsageDailyFromEntries(entries: AiUsageEntry[]): UsageDailyBucket[] {
  return entries.reduce((buckets, entry) => addUsageToDaily(buckets, entry), [] as UsageDailyBucket[])
}

export function mergeUsageDaily(
  first: UsageDailyBucket[],
  second: UsageDailyBucket[],
): UsageDailyBucket[] {
  let result = [...first]
  for (const bucket of second) {
    const key = bucketKey(bucket)
    const existing = result.find((item) => bucketKey(item) === key)
    if (!existing) {
      result.push(bucket)
      continue
    }
    result = result.map((item) =>
      bucketKey(item) === key
        ? {
            ...item,
            calls: item.calls + bucket.calls,
            inputTokens: item.inputTokens + bucket.inputTokens,
            outputTokens: item.outputTokens + bucket.outputTokens,
            cachedInputTokens:
              (item.cachedInputTokens ?? 0) + (bucket.cachedInputTokens ?? 0),
            cacheWriteTokens:
              (item.cacheWriteTokens ?? 0) + (bucket.cacheWriteTokens ?? 0),
            cost: item.cost + bucket.cost,
            actualCalls: item.actualCalls + bucket.actualCalls,
            estimatedCalls: item.estimatedCalls + bucket.estimatedCalls,
            unknownCostCalls: item.unknownCostCalls + bucket.unknownCostCalls,
          }
        : item,
    )
  }
  return result
}

export function sumUsageBuckets(buckets: UsageDailyBucket[]): UsageTotals {
  return buckets.reduce((totals, bucket) => ({
    calls: totals.calls + bucket.calls,
    inputTokens: totals.inputTokens + bucket.inputTokens,
    outputTokens: totals.outputTokens + bucket.outputTokens,
    cachedInputTokens:
      totals.cachedInputTokens + (bucket.cachedInputTokens ?? 0),
    cacheWriteTokens:
      totals.cacheWriteTokens + (bucket.cacheWriteTokens ?? 0),
    cost: totals.cost + bucket.cost,
    actualCalls: totals.actualCalls + bucket.actualCalls,
    estimatedCalls: totals.estimatedCalls + bucket.estimatedCalls,
    unknownCostCalls: totals.unknownCostCalls + bucket.unknownCostCalls,
  }), emptyUsageTotals())
}

export function filterUsageBuckets(
  buckets: UsageDailyBucket[],
  options: { fromDate: string; toDate: string; workId?: string },
): UsageDailyBucket[] {
  return buckets.filter((bucket) => {
    if (bucket.date < options.fromDate || bucket.date > options.toDate) return false
    if (options.workId && bucket.workId !== options.workId) return false
    return true
  })
}

export function dailyUsageSeries(
  buckets: UsageDailyBucket[],
  fromDate: string,
  toDate: string,
): DailyPoint[] {
  const map = new Map<string, DailyPoint>()
  for (const date of dateRangeKeys(fromDate, toDate)) {
    map.set(date, { date, value: 0, secondary: 0 })
  }
  for (const bucket of buckets) {
    const point = map.get(bucket.date)
    if (!point) continue
    point.value += bucket.cost
    point.secondary = (point.secondary ?? 0) + bucket.inputTokens + bucket.outputTokens
  }
  return [...map.values()]
}

export function dateRangeKeys(fromDate: string, toDate: string): string[] {
  const keys: string[] = []
  const start = new Date(`${fromDate}T12:00:00`)
  const end = new Date(`${toDate}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return keys
  const cursor = new Date(start)
  while (cursor <= end) {
    keys.push(localDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

export function aggregateDimension(
  buckets: UsageDailyBucket[],
  dimension: 'kind' | 'model' | 'workId',
): DimensionStat[] {
  const map = new Map<string, DimensionStat>()
  for (const bucket of buckets) {
    const key = bucket[dimension] || '未归属'
    const current = map.get(key) ?? {
      key,
      label: key,
      calls: 0,
      tokens: 0,
      cost: 0,
    }
    current.calls += bucket.calls
    current.tokens += bucket.inputTokens + bucket.outputTokens
    current.cost += bucket.cost
    map.set(key, current)
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost || b.calls - a.calls)
}

export function computeWorkStats(input: {
  works: Work[]
  chaptersByWork: Record<string, Chapter[]>
  detailsByWork: Record<string, WorkDetail>
  buckets: UsageDailyBucket[]
}): WorkStats[] {
  const costByWork = new Map<string, { cost: number; tokens: number; calls: number }>()
  for (const bucket of input.buckets) {
    if (!bucket.workId) continue
    const current = costByWork.get(bucket.workId) ?? { cost: 0, tokens: 0, calls: 0 }
    current.cost += bucket.cost
    current.tokens += bucket.inputTokens + bucket.outputTokens
    current.calls += bucket.calls
    costByWork.set(bucket.workId, current)
  }
  return input.works.map((work) => {
    const chapters = input.chaptersByWork[work.id] ?? []
    const detail = input.detailsByWork[work.id]
    const chapterWordCount = chapters.reduce((sum, chapter) => sum + chapterWords(chapter), 0)
    const words = Math.max(work.words, chapterWordCount)
    const completedChapters = chapters.filter((chapter) => chapter.status === 'done').length
    const usage = costByWork.get(work.id) ?? { cost: 0, tokens: 0, calls: 0 }
    return {
      work,
      chapters: chapters.length || work.chapters,
      completedChapters,
      plannedChapters: detail?.outline?.length ?? 0,
      words,
      targetWords: work.targetWords,
      progress: work.targetWords > 0 ? Math.min(100, Math.round((words / work.targetWords) * 100)) : 0,
      tokens: usage.tokens,
      cost: usage.cost,
      calls: usage.calls,
      costPerThousandWords: words > 0 ? (usage.cost / words) * 1000 : 0,
      lastUpdated: work.updatedAt,
    }
  })
}

export function buildWritingDailySnapshot(input: {
  works: Work[]
  chaptersByWork: Record<string, Chapter[]>
  date?: string
}): WritingDailySnapshot {
  const date = input.date ?? localDateKey()
  const works: WritingDailySnapshot['works'] = {}
  for (const work of input.works) {
    const chapters = input.chaptersByWork[work.id] ?? []
    works[work.id] = {
      words: chapters.reduce((sum, chapter) => sum + chapterWords(chapter), 0) || work.words,
      chapters: chapters.length,
      completed: chapters.filter((chapter) => chapter.status === 'done').length,
    }
  }
  return { date, works }
}

export function upsertWritingSnapshot(
  snapshots: WritingDailySnapshot[],
  next: WritingDailySnapshot,
): WritingDailySnapshot[] {
  return [...snapshots.filter((snapshot) => snapshot.date !== next.date), next]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-400)
}

export function writingDailyWords(
  snapshots: WritingDailySnapshot[],
  workId?: string,
): Map<string, number> {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  const result = new Map<string, number>()
  const previous = new Map<string, number>()
  for (const snapshot of sorted) {
    let total = 0
    for (const [id, value] of Object.entries(snapshot.works)) {
      if (workId && id !== workId) continue
      const prior = previous.get(id)
      if (prior !== undefined && value.words > prior) {
        const delta = value.words - prior
        total += delta
        result.set(snapshot.date, (result.get(snapshot.date) ?? 0) + delta)
      }
      previous.set(id, value.words)
    }
    if (total === 0 && !result.has(snapshot.date)) result.set(snapshot.date, 0)
  }
  return result
}

export function writingDaySeries(
  snapshots: WritingDailySnapshot[],
  days: number,
  workId?: string,
): DailyPoint[] {
  const map = writingDailyWords(snapshots, workId)
  return dateKeysBack(days).map((date) => ({
    date,
    value: map.get(date) ?? 0,
  }))
}

export function writingStreak(snapshots: WritingDailySnapshot[], workId?: string): number {
  const map = writingDailyWords(snapshots, workId)
  let streak = 0
  const cursor = new Date()
  cursor.setHours(12, 0, 0, 0)
  for (let index = 0; index < 400; index += 1) {
    const key = localDateKey(cursor)
    if ((map.get(key) ?? 0) > 0) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    } else if (index === 0) {
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

export function writingSessions(
  events: WritingActivityEntry[],
  gapMinutes = 10,
): WritingSession[] {
  const sorted = [...events].sort((a, b) => a.at - b.at)
  const sessions: WritingSession[] = []
  for (const event of sorted) {
    if (event.words <= 0) continue
    const last = sessions[sessions.length - 1]
    if (last && event.at - last.end <= gapMinutes * 60 * 1000) {
      last.end = event.at
      last.words += event.words
      last.minutes = Math.max(1, Math.round((last.end - last.start) / 60000))
    } else {
      sessions.push({
        start: event.at,
        end: event.at,
        minutes: 1,
        words: event.words,
      })
    }
  }
  return sessions
}

export function activityHourHistogram(events: WritingActivityEntry[]): DailyPoint[] {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    date: String(hour),
    value: 0,
  }))
  for (const event of events) {
    if (event.words <= 0) continue
    hours[new Date(event.at).getHours()].value += event.words
  }
  return hours
}

export function chapterCostStats(input: {
  works: Work[]
  chaptersByWork: Record<string, Chapter[]>
  buckets: UsageDailyBucket[]
}): ChapterCostStat[] {
  const workById = new Map(input.works.map((work) => [work.id, work]))
  const chapterById = new Map<string, { work: Work; chapter: Chapter }>()
  for (const work of input.works) {
    for (const chapter of input.chaptersByWork[work.id] ?? []) {
      chapterById.set(`${work.id}:${chapter.id}`, { work, chapter })
    }
  }
  const map = new Map<string, ChapterCostStat>()
  for (const bucket of input.buckets) {
    if (!bucket.workId || !bucket.chapterId) continue
    const found = chapterById.get(`${bucket.workId}:${bucket.chapterId}`)
    if (!found) continue
    const key = `${bucket.workId}:${bucket.chapterId}`
    const current = map.get(key) ?? {
      workId: bucket.workId,
      workTitle: workById.get(bucket.workId)?.title ?? '未知作品',
      chapterId: bucket.chapterId,
      chapterTitle: found.chapter.title || '未命名章节',
      words: chapterWords(found.chapter),
      cost: 0,
      tokens: 0,
      calls: 0,
    }
    current.cost += bucket.cost
    current.tokens += bucket.inputTokens + bucket.outputTokens
    current.calls += bucket.calls
    map.set(key, current)
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost)
}

export function monthCost(buckets: UsageDailyBucket[], now = Date.now()): number {
  const date = new Date(now)
  const prefix = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  return buckets
    .filter((bucket) => bucket.date.startsWith(prefix))
    .reduce((sum, bucket) => sum + bucket.cost, 0)
}

export function budgetSnapshot(
  buckets: UsageDailyBucket[],
  budget: StatsBudget,
  now = Date.now(),
): {
  spent: number
  remaining: number
  ratio: number
  projected: number
  overBudget: boolean
} {
  const date = new Date(now)
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const dayOfMonth = date.getDate()
  const spent = monthCost(buckets, now)
  const projected = dayOfMonth > 0 ? (spent / dayOfMonth) * daysInMonth : spent
  return {
    spent,
    remaining: Math.max(0, budget.monthlyBudget - spent),
    ratio: budget.monthlyBudget > 0 ? Math.min(100, (spent / budget.monthlyBudget) * 100) : 0,
    projected,
    overBudget: budget.monthlyBudget > 0 && projected > budget.monthlyBudget,
  }
}

export function completionForecast(input: {
  words: number
  targetWords: number
  wordsPerDay: number
  costPerThousandWords: number
}): {
  remainingWords: number
  days: number | null
  cost: number | null
} {
  const remainingWords = Math.max(0, input.targetWords - input.words)
  if (remainingWords === 0) return { remainingWords: 0, days: 0, cost: 0 }
  if (input.wordsPerDay <= 0) return { remainingWords, days: null, cost: null }
  const days = Math.ceil(remainingWords / input.wordsPerDay)
  return {
    remainingWords,
    days,
    cost: input.costPerThousandWords > 0 ? (remainingWords / 1000) * input.costPerThousandWords : null,
  }
}

export function aiContribution(input: {
  totalWords: number
  outputTokens: number
}): {
  estimatedWords: number
  ratio: number
} {
  // 中文输出 token 与字数不是一比一，这里只做量级估算并在界面明确标注。
  const estimatedWords = Math.round(input.outputTokens * 0.75)
  return {
    estimatedWords,
    ratio: input.totalWords > 0 ? Math.min(999, (estimatedWords / input.totalWords) * 100) : 0,
  }
}

export function formatMoney(value: number, currency = 'CNY'): string {
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : `${currency} `
  if (value === 0) return `${symbol}0`
  if (Math.abs(value) < 0.01) return `${symbol}${value.toFixed(4)}`
  if (Math.abs(value) < 1) return `${symbol}${value.toFixed(3)}`
  return `${symbol}${value.toFixed(2)}`
}

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(Math.round(value))
}
