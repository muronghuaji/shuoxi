import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WRITING_PRICING,
  isOffPeak,
  normalizeWritingPricing,
  resolveWritingPrice,
  type WritingPriceRule,
} from './pricing'

const rule: WritingPriceRule = {
  id: 'r1',
  provider: 'deepseek',
  model: 'deepseek-flash',
  inputPrice: 2,
  outputPrice: 8,
  currency: 'CNY',
  offPeakEnabled: true,
  offPeakStart: '00:30',
  offPeakEnd: '08:30',
  offPeakDiscount: 50,
  timeZone: 'Asia/Shanghai',
  note: '',
}

describe('writing pricing', () => {
  it('matches provider and model, including prefix models', () => {
    const price = resolveWritingPrice([rule], 'deepseek', 'deepseek-flash', Date.parse('2026-11-11T12:00:00+08:00'))
    expect(price?.inputPrice).toBe(2)
    expect(price?.outputPrice).toBe(8)
    expect(price?.offPeak).toBe(false)
    expect(
      resolveWritingPrice([rule], 'deepseek', 'deepseek-flash-2026', Date.parse('2026-11-11T12:00:00+08:00'))
        ?.rule.id,
    ).toBe('r1')
  })

  it('applies DeepSeek off-peak window and discount in Asia/Shanghai', () => {
    const at = Date.parse('2026-11-11T03:00:00+08:00')
    expect(isOffPeak(rule, at)).toBe(true)
    const price = resolveWritingPrice([rule], 'deepseek', 'deepseek-flash', at)
    expect(price?.offPeak).toBe(true)
    expect(price?.inputPrice).toBe(1)
    expect(price?.outputPrice).toBe(4)
  })

  it('falls back safely and normalizes invalid settings', () => {
    expect(resolveWritingPrice([rule], 'qwen', 'qwen-plus')).toBeUndefined()
    const defaults = DEFAULT_WRITING_PRICING
    const normalized = normalizeWritingPricing({ rules: [] })
    expect(normalized.rules.length).toBe(defaults.rules.length)
    expect(normalizeWritingPricing(null)).toBe(DEFAULT_WRITING_PRICING)
  })
})
