import { describe, expect, it } from 'vitest'
import {
  addCurrencyTier,
  currencyTier,
  defaultCurrencySettings,
  formatItemPrice,
  normalizeCurrency,
  priceToBase,
} from './currency'

describe('currency', () => {
  it('creates ten default tiers with increasing rates', () => {
    const currency = defaultCurrencySettings()
    expect(currency.tiers).toHaveLength(10)
    expect(currency.tiers[0].rateToBase).toBe(1)
    expect(currency.tiers[9].rateToBase).toBe(1_000_000_000)
  })

  it('normalizes missing and duplicate tiers', () => {
    const currency = normalizeCurrency({
      enabled: true,
      tiers: [
        { id: 'a', name: '铜币', rateToBase: 1 },
        { id: 'a', name: '重复', rateToBase: 10 },
        { id: 'b', name: '', rateToBase: 0 },
      ],
    })
    expect(currency.tiers).toHaveLength(2)
    expect(currency.tiers[1].name).toBe('第3级货币')
    expect(currency.tiers[1].rateToBase).toBe(100)
  })

  it('formats and converts item prices', () => {
    const currency = defaultCurrencySettings()
    const tier = currencyTier(currency, 'currency-3')
    expect(formatItemPrice({ tierId: 'currency-3', amount: 12 }, currency)).toBe(
      `12 ${tier?.name}`,
    )
    expect(priceToBase({ tierId: 'currency-3', amount: 12 }, currency)).toBe(1200)
    expect(formatItemPrice(undefined, currency)).toBe('未定价')
  })

  it('adds a tier after the current last tier', () => {
    const currency = defaultCurrencySettings()
    const next = addCurrencyTier(currency)
    expect(next.tiers).toHaveLength(11)
    expect(next.tiers[10].rateToBase).toBe(10_000_000_000)
  })
})
