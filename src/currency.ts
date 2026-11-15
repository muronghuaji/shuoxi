import type { CurrencySettings, CurrencyTier, ItemPrice } from './types'

const TIER_NAMES = [
  '一级货币',
  '二级货币',
  '三级货币',
  '四级货币',
  '五级货币',
  '六级货币',
  '七级货币',
  '八级货币',
  '九级货币',
  '十级货币',
]

export function defaultCurrencyTiers(): CurrencyTier[] {
  return TIER_NAMES.map((name, index) => ({
    id: `currency-${index + 1}`,
    name,
    rateToBase: 10 ** index,
  }))
}

export function defaultCurrencySettings(): CurrencySettings {
  return { enabled: true, tiers: defaultCurrencyTiers() }
}

export function normalizeCurrency(value: CurrencySettings | undefined): CurrencySettings {
  if (!value || !Array.isArray(value.tiers) || value.tiers.length === 0) {
    return defaultCurrencySettings()
  }
  const tiers = value.tiers
    .map((tier, index) => {
      const name = typeof tier?.name === 'string' ? tier.name.trim() : ''
      const rate = Number(tier?.rateToBase)
      return {
        id:
          typeof tier?.id === 'string' && tier.id.trim()
            ? tier.id
            : `currency-${index + 1}`,
        name: name || `第${index + 1}级货币`,
        rateToBase: Number.isFinite(rate) && rate > 0 ? rate : 10 ** index,
      }
    })
    .filter((tier, index, all) => all.findIndex((item) => item.id === tier.id) === index)
  return { enabled: value.enabled !== false, tiers }
}

export function addCurrencyTier(settings: CurrencySettings): CurrencySettings {
  const normalized = normalizeCurrency(settings)
  const last = normalized.tiers[normalized.tiers.length - 1]
  return {
    ...normalized,
    tiers: [
      ...normalized.tiers,
      {
        id: `currency-${Date.now().toString(36)}-${normalized.tiers.length + 1}`,
        name: `第${normalized.tiers.length + 1}级货币`,
        rateToBase: Math.max(1, Math.round((last?.rateToBase ?? 1) * 10)),
      },
    ],
  }
}

export function currencyTier(
  settings: CurrencySettings | undefined,
  tierId: string | undefined,
): CurrencyTier | undefined {
  if (!tierId) return undefined
  return normalizeCurrency(settings).tiers.find((tier) => tier.id === tierId)
}

export function formatItemPrice(
  price: ItemPrice | undefined,
  settings: CurrencySettings | undefined,
): string {
  if (!price || !Number.isFinite(price.amount) || price.amount <= 0) return '未定价'
  const tier = currencyTier(settings, price.tierId)
  return tier ? `${price.amount.toLocaleString('zh-CN')} ${tier.name}` : '未定价'
}

export function priceToBase(
  price: ItemPrice | undefined,
  settings: CurrencySettings | undefined,
): number | null {
  if (!price || !Number.isFinite(price.amount) || price.amount <= 0) return null
  const tier = currencyTier(settings, price.tierId)
  return tier ? price.amount * tier.rateToBase : null
}
