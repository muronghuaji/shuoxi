import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import type { AiUsageEntry, Chapter, Work } from './types'
import {
  addUsageToDaily,
  aiContribution,
  budgetSnapshot,
  buildUsageDailyFromEntries,
  computeWorkStats,
  dailyUsageSeries,
  localDateKey,
  monthCost,
  normalizeBudget,
  requestQuality,
  sumUsageBuckets,
  upsertWritingSnapshot,
  writingDailyWords,
  writingDaySeries,
  writingSessions,
  writingStreak,
} from './stats'

function entry(overrides: Partial<AiUsageEntry> = {}): AiUsageEntry {
  return {
    id: `u-${Math.random()}`,
    at: Date.now(),
    kind: '续写',
    model: 'deepseek-flash',
    inputTokens: 1000,
    outputTokens: 500,
    cost: 0.1,
    actual: true,
    workId: 'w1',
    ...overrides,
  }
}

const work: Work = {
  id: 'w1',
  title: '测试书',
  synopsis: '',
  theme: '',
  genres: [],
  outlineMode: 'fine',
  perspective: 'third-limited',
  characterCount: 1,
  targetWords: 10000,
  promptIds: [],
  status: '连载中',
  chapters: 2,
  words: 2000,
  updatedAt: Date.now(),
  coverIndex: 0,
}

describe('stats data layer', () => {
  it('aggregates usage into daily buckets without losing actual/estimated split', () => {
    const first = entry()
    const second = entry({ actual: false, cost: undefined, outputTokens: 300 })
    const buckets = [first, second].reduce(
      (current, currentEntry) => addUsageToDaily(current, currentEntry),
      buildUsageDailyFromEntries([]),
    )
    expect(buckets).toHaveLength(1)
    expect(buckets[0].calls).toBe(2)
    expect(buckets[0].actualCalls).toBe(1)
    expect(buckets[0].estimatedCalls).toBe(1)
    expect(buckets[0].unknownCostCalls).toBe(1)
    const totals = sumUsageBuckets(buckets)
    expect(totals.inputTokens).toBe(2000)
    expect(totals.outputTokens).toBe(800)
    expect(totals.cost).toBe(0.1)
  })

  it('builds daily cost series and handles empty dates', () => {
    const today = localDateKey()
    const buckets = buildUsageDailyFromEntries([entry()])
    const series = dailyUsageSeries(buckets, today, today)
    expect(series).toHaveLength(1)
    expect(series[0].value).toBe(0.1)
  })

  it('computes per-book words, cost and cost per thousand words', () => {
    const chapters: Chapter[] = [
      { id: 'c1', title: '第一章', content: '一二三四五', updatedAt: 1, status: 'done' },
      { id: 'c2', title: '第二章', content: '六七八', updatedAt: 2, status: 'writing' },
    ]
    const buckets = buildUsageDailyFromEntries([entry({ workId: 'w1', cost: 0.2 })])
    const stats = computeWorkStats({
      works: [{ ...work, words: 20 }],
      chaptersByWork: { w1: chapters },
      detailsByWork: { w1: createEmptyDetail() },
      buckets,
    })
    expect(stats[0].words).toBe(20)
    expect(stats[0].completedChapters).toBe(1)
    expect(stats[0].cost).toBe(0.2)
    expect(stats[0].costPerThousandWords).toBe(10)
  })

  it('tracks daily word deltas and streak from snapshots', () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const snapshots = upsertWritingSnapshot(
      upsertWritingSnapshot([], {
        date: localDateKey(yesterday),
        works: { w1: { words: 100, chapters: 1, completed: 0 } },
      }),
      { date: localDateKey(today), works: { w1: { words: 300, chapters: 1, completed: 0 } } },
    )
    const daily = writingDailyWords(snapshots)
    expect(daily.get(localDateKey())).toBe(200)
    expect(writingStreak(snapshots)).toBeGreaterThanOrEqual(1)
    expect(writingDaySeries(snapshots, 2)).toHaveLength(2)
  })

  it('clusters writing activity into sessions', () => {
    const now = Date.now()
    const sessions = writingSessions([
      { at: now, workId: 'w1', words: 100 },
      { at: now + 60_000, workId: 'w1', words: 80 },
      { at: now + 20 * 60_000, workId: 'w1', words: 50 },
    ])
    expect(sessions).toHaveLength(2)
    expect(sessions[0].words).toBe(180)
    expect(sessions[1].words).toBe(50)
  })

  it('summarizes request failures and budget forecast', () => {
    const quality = requestQuality([
      { ok: true, latencyMs: 100 },
      { ok: false, latencyMs: 300 },
    ])
    expect(quality.total).toBe(2)
    expect(quality.failed).toBe(1)
    expect(quality.failureRate).toBe(50)
    expect(quality.averageLatencyMs).toBe(200)
    const budget = budgetSnapshot([], { monthlyBudget: 10, currency: 'CNY' })
    expect(budget.spent).toBe(0)
    expect(budget.remaining).toBe(10)
    expect(normalizeBudget({ monthlyBudget: 12, currency: 'CNY', budgetMode: 'block' })).toEqual({
      monthlyBudget: 12,
      currency: 'CNY',
      budgetMode: 'block',
    })
    expect(
      monthCost([
        { date: localDateKey(), cost: 3, calls: 1, inputTokens: 0, outputTokens: 0, workId: '', chapterId: '', kind: '', model: '', actualCalls: 0, estimatedCalls: 1, unknownCostCalls: 0 },
      ]),
    ).toBe(3)
    expect(aiContribution({ totalWords: 1000, outputTokens: 500 }).estimatedWords).toBe(375)
  })
})
