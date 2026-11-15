import type { PlatformBalance } from './types'

export interface BalanceResult {
  ok: boolean
  balance?: PlatformBalance
  reason?: string
  message?: string
}

export async function fetchPlatformBalance(
  baseUrl: string,
  apiKey: string,
  provider: string,
  force = false,
): Promise<BalanceResult> {
  const bridge = typeof window !== 'undefined' ? window.shuoxiWindow : undefined
  if (!bridge?.getBalance) return { ok: false, reason: 'unsupported' }
  try {
    return (await bridge.getBalance({ baseUrl, apiKey, provider, force })) as BalanceResult
  } catch (error) {
    return {
      ok: false,
      reason: 'network',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export function balanceMoney(value: number, currency: string): string {
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : `${currency} `
  return `${symbol}${value.toFixed(2)}`
}
