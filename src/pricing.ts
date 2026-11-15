export interface WritingPriceRule {
  id: string
  provider: string
  model: string
  inputPrice: number
  outputPrice: number
  cacheHitPrice?: number
  cacheWritePrice?: number
  currency: 'CNY'
  offPeakEnabled: boolean
  offPeakStart: string
  offPeakEnd: string
  offPeakDiscount: number
  timeZone: string
  note: string
}

export interface WritingPricingSettings {
  rules: WritingPriceRule[]
  updatedAt: number
}

export interface EffectiveWritingPrice {
  inputPrice: number
  outputPrice: number
  cacheHitPrice: number
  cacheWritePrice: number
  offPeak: boolean
  rule: WritingPriceRule
}

const PRICING_STORAGE_KEY = 'shuoxi.writingPricing.v1'

/**
 * 这些是“示例基准价”，用来让第一次打开就有结果；
 * 服务商调价后请在设置页按官方账单修改。DeepSeek 空闲期窗口
 * 默认按北京时间 00:30–08:30、五折计算，也可以逐条关闭/调整。
 */
export const DEFAULT_WRITING_PRICING: WritingPricingSettings = {
  updatedAt: 0,
  rules: [
    {
      id: 'price-deepseek-flash',
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
      note: '示例基准价：请按 DeepSeek 官方价格页核对；空闲期折扣可改。',
    },
    {
      id: 'price-deepseek-v4-pro',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      inputPrice: 4,
      outputPrice: 16,
      currency: 'CNY',
      offPeakEnabled: true,
      offPeakStart: '00:30',
      offPeakEnd: '08:30',
      offPeakDiscount: 50,
      timeZone: 'Asia/Shanghai',
      note: '示例基准价：请按 DeepSeek 官方价格页核对；空闲期折扣可改。',
    },
  ],
}

function sanitizeRule(raw: unknown, index: number): WritingPriceRule | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const provider = typeof value.provider === 'string' ? value.provider.trim() : ''
  const model = typeof value.model === 'string' ? value.model.trim() : ''
  if (!provider || !model) return null
  const number = (key: string, fallback = 0) => {
    const parsed = typeof value[key] === 'number' ? value[key] : Number(value[key])
    return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback
  }
  const time = (key: string, fallback: string) => {
    const rawTime = typeof value[key] === 'string' ? value[key].trim() : ''
    return /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : fallback
  }
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : `price-${index}`,
    provider,
    model,
    inputPrice: number('inputPrice'),
    outputPrice: number('outputPrice'),
    cacheHitPrice:
      value.cacheHitPrice === undefined ? undefined : number('cacheHitPrice'),
    cacheWritePrice:
      value.cacheWritePrice === undefined ? undefined : number('cacheWritePrice'),
    currency: 'CNY',
    offPeakEnabled: Boolean(value.offPeakEnabled),
    offPeakStart: time('offPeakStart', '00:30'),
    offPeakEnd: time('offPeakEnd', '08:30'),
    offPeakDiscount: Math.min(100, number('offPeakDiscount', 50)),
    timeZone:
      typeof value.timeZone === 'string' && value.timeZone.trim()
        ? value.timeZone.trim()
        : 'Asia/Shanghai',
    note: typeof value.note === 'string' ? value.note.trim() : '',
  }
}

export function normalizeWritingPricing(raw: unknown): WritingPricingSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_WRITING_PRICING
  const value = raw as Record<string, unknown>
  if (!Array.isArray(value.rules)) return DEFAULT_WRITING_PRICING
  const rules = value.rules
    .map((rule, index) => sanitizeRule(rule, index))
    .filter((rule): rule is WritingPriceRule => Boolean(rule))
  return {
    rules: rules.length > 0 ? rules : DEFAULT_WRITING_PRICING.rules,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
  }
}

export function loadWritingPricing(): WritingPricingSettings {
  if (typeof window === 'undefined') return DEFAULT_WRITING_PRICING
  try {
    const raw = window.localStorage.getItem(PRICING_STORAGE_KEY)
    if (!raw) return DEFAULT_WRITING_PRICING
    return normalizeWritingPricing(JSON.parse(raw))
  } catch {
    return DEFAULT_WRITING_PRICING
  }
}

export function saveWritingPricing(settings: WritingPricingSettings): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PRICING_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 存储失败不影响写作。
  }
}

export const WRITING_PRICING_KEY = PRICING_STORAGE_KEY

function parseClock(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return (hour || 0) * 60 + (minute || 0)
}

function timeInZone(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date)
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
    return hour * 60 + minute
  } catch {
    return date.getHours() * 60 + date.getMinutes()
  }
}

export function isOffPeak(rule: WritingPriceRule, at = Date.now()): boolean {
  if (!rule.offPeakEnabled) return false
  const start = parseClock(rule.offPeakStart)
  const end = parseClock(rule.offPeakEnd)
  if (start === end) return false
  const now = timeInZone(new Date(at), rule.timeZone)
  if (start < end) return now >= start && now < end
  return now >= start || now < end
}

function matchesRule(rule: WritingPriceRule, provider: string, model: string): boolean {
  const providerMatch = rule.provider === '*' || rule.provider.toLowerCase() === provider.toLowerCase()
  if (!providerMatch) return false
  const expected = rule.model.toLowerCase()
  const actual = model.toLowerCase()
  return expected === '*' || expected === actual || actual.startsWith(expected)
}

export function resolveWritingPrice(
  rules: WritingPriceRule[],
  provider: string,
  model: string,
  at = Date.now(),
): EffectiveWritingPrice | undefined {
  const likely = [...rules]
    .filter((rule) => matchesRule(rule, provider, model))
    .sort((left, right) => {
      const leftExact = left.model.toLowerCase() === model.toLowerCase() ? 1 : 0
      const rightExact = right.model.toLowerCase() === model.toLowerCase() ? 1 : 0
      return rightExact - leftExact || right.model.length - left.model.length
    })
  const rule = likely[0]
  if (!rule) return undefined
  const offPeak = isOffPeak(rule, at)
  const factor = offPeak ? 1 - rule.offPeakDiscount / 100 : 1
  return {
    inputPrice: rule.inputPrice * factor,
    outputPrice: rule.outputPrice * factor,
    cacheHitPrice: (rule.cacheHitPrice ?? rule.inputPrice) * factor,
    cacheWritePrice: (rule.cacheWritePrice ?? 0) * factor,
    offPeak,
    rule,
  }
}
