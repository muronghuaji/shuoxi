import type { AiUsageEntry } from './types'

export interface UsageTotals {
  calls: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  totalTokens: number
  actualTokens: number
  estimatedTokens: number
  actualCalls: number
  estimatedCalls: number
  cost: number
  pricedCalls: number
  unpricedCalls: number
}

export function emptyUsageTotals(): UsageTotals {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    actualTokens: 0,
    estimatedTokens: 0,
    actualCalls: 0,
    estimatedCalls: 0,
    cost: 0,
    pricedCalls: 0,
    unpricedCalls: 0,
  }
}

export function calculateUsageCost(
  entry: Pick<
    AiUsageEntry,
    | 'inputTokens'
    | 'outputTokens'
    | 'cachedInputTokens'
    | 'cacheWriteTokens'
    | 'uncachedInputTokens'
    | 'cost'
  >,
  inputPrice: number,
  outputPrice: number,
  cacheHitPrice = inputPrice,
  cacheWritePrice = 0,
  force = false,
): number | undefined {
  if (!force && typeof entry.cost === 'number' && Number.isFinite(entry.cost)) return entry.cost
  if (inputPrice <= 0 && outputPrice <= 0 && cacheHitPrice <= 0) return undefined
  const input = Math.max(0, entry.inputTokens || 0)
  const cached = Math.max(0, entry.cachedInputTokens || 0)
  const cacheWrite = Math.max(0, entry.cacheWriteTokens || 0)
  const uncached = Math.max(
    0,
    entry.uncachedInputTokens ?? Math.max(0, input - cached - cacheWrite),
  )
  return (
    (uncached / 1_000_000) * inputPrice +
    (cached / 1_000_000) * cacheHitPrice +
    (cacheWrite / 1_000_000) * cacheWritePrice +
    (entry.outputTokens / 1_000_000) * outputPrice
  )
}

export function addUsageTotals(
  totals: UsageTotals,
  entry: Pick<
    AiUsageEntry,
    | 'inputTokens'
    | 'outputTokens'
    | 'cachedInputTokens'
    | 'cacheWriteTokens'
    | 'actual'
    | 'cost'
  >,
): UsageTotals {
  const inputTokens = Math.max(0, entry.inputTokens || 0)
  const outputTokens = Math.max(0, entry.outputTokens || 0)
  const tokens = inputTokens + outputTokens
  const actual = Boolean(entry.actual)
  const cost = typeof entry.cost === 'number' && Number.isFinite(entry.cost) ? entry.cost : undefined
  return {
    calls: totals.calls + 1,
    inputTokens: totals.inputTokens + inputTokens,
    outputTokens: totals.outputTokens + outputTokens,
    cachedInputTokens: totals.cachedInputTokens + Math.max(0, entry.cachedInputTokens || 0),
    cacheWriteTokens: totals.cacheWriteTokens + Math.max(0, entry.cacheWriteTokens || 0),
    totalTokens: totals.totalTokens + tokens,
    actualTokens: totals.actualTokens + (actual ? tokens : 0),
    estimatedTokens: totals.estimatedTokens + (actual ? 0 : tokens),
    actualCalls: totals.actualCalls + (actual ? 1 : 0),
    estimatedCalls: totals.estimatedCalls + (actual ? 0 : 1),
    cost: totals.cost + (cost ?? 0),
    pricedCalls: totals.pricedCalls + (cost === undefined ? 0 : 1),
    unpricedCalls: totals.unpricedCalls + (cost === undefined ? 1 : 0),
  }
}

export function summarizeUsage(entries: AiUsageEntry[]): UsageTotals {
  return entries.reduce(addUsageTotals, emptyUsageTotals())
}

export function formatTokenCount(value: number): string {
  const tokens = Math.max(0, Math.round(value))
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(tokens)
}

export function formatCost(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  if (value === 0) return '¥0'
  if (value >= 1) return `¥${value.toFixed(2)}`
  return `¥${value.toFixed(4)}`
}
