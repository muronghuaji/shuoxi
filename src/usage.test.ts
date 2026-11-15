import { describe, expect, it } from 'vitest'
import type { AiUsageEntry } from './types'
import {
  addUsageTotals,
  calculateUsageCost,
  emptyUsageTotals,
  formatCost,
  formatTokenCount,
  summarizeUsage,
} from './usage'

function usage(overrides: Partial<AiUsageEntry> = {}): AiUsageEntry {
  return {
    id: `u-${Math.random()}`,
    at: 1,
    kind: '续写',
    model: 'test',
    inputTokens: 1000,
    outputTokens: 500,
    actual: true,
    cost: 0.02,
    ...overrides,
  }
}

describe('usage totals', () => {
  it('separates actual and estimated tokens', () => {
    const totals = summarizeUsage([
      usage(),
      usage({ actual: false, cost: undefined, inputTokens: 2000, outputTokens: 0 }),
    ])
    expect(totals.calls).toBe(2)
    expect(totals.totalTokens).toBe(3500)
    expect(totals.actualTokens).toBe(1500)
    expect(totals.estimatedTokens).toBe(2000)
    expect(totals.actualCalls).toBe(1)
    expect(totals.estimatedCalls).toBe(1)
    expect(totals.cost).toBe(0.02)
    expect(totals.unpricedCalls).toBe(1)
  })

  it('calculates cost when prices are configured and entry has no cost', () => {
    expect(
      calculateUsageCost({ inputTokens: 1_000_000, outputTokens: 500_000 }, 2, 8),
    ).toBe(2 + 4)
    expect(
      calculateUsageCost({ inputTokens: 100, outputTokens: 100, cost: 0.5 }, 2, 8),
    ).toBe(0.5)
    expect(calculateUsageCost({ inputTokens: 100, outputTokens: 100 }, 0, 0)).toBeUndefined()
  })

  it('prices cached and uncached input separately', () => {
    expect(
      calculateUsageCost(
        {
          inputTokens: 1_000_000,
          outputTokens: 500_000,
          cachedInputTokens: 600_000,
          uncachedInputTokens: 400_000,
          cacheWriteTokens: 0,
        },
        2,
        8,
        0.5,
        0,
        true,
      ),
    ).toBe(0.4 * 2 + 0.6 * 0.5 + 0.5 * 8)
  })

  it('keeps empty totals and adds entries without mutating input', () => {
    const initial = emptyUsageTotals()
    const next = addUsageTotals(initial, usage())
    expect(initial.calls).toBe(0)
    expect(next.calls).toBe(1)
    expect(next.totalTokens).toBe(1500)
  })

  it('formats compact tokens and costs', () => {
    expect(formatTokenCount(0)).toBe('0')
    expect(formatTokenCount(950)).toBe('950')
    expect(formatTokenCount(12_400)).toBe('12.4k')
    expect(formatTokenCount(1_200_000)).toBe('1.2m')
    expect(formatCost(0)).toBe('¥0')
    expect(formatCost(0.0042)).toBe('¥0.0042')
    expect(formatCost(1.2)).toBe('¥1.20')
    expect(formatCost(undefined)).toBe('—')
  })
})
