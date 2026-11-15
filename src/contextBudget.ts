import type { ApiConfig, Work } from './types'

/**
 * 保守的模型窗口登记表。未知模型按 128k 处理，避免“不限制”直接变成
 * 超出服务商硬上限的请求。用户仍可通过 ApiConfig.contextWindow 覆盖。
 */
const MODEL_WINDOWS: { pattern: RegExp; window: number }[] = [
  { pattern: /gemini/i, window: 1_000_000 },
  { pattern: /gpt-4\.1|gpt-5/i, window: 1_000_000 },
  { pattern: /claude/i, window: 200_000 },
  { pattern: /qwen|kimi|moonshot|glm|yi-|internlm/i, window: 131_072 },
  { pattern: /deepseek/i, window: 128_000 },
  { pattern: /gpt-4o|gpt-4-turbo|o1|o3|o4/i, window: 128_000 },
]

export const DEFAULT_OUTPUT_RESERVE = 8192
export const DEFAULT_CONTEXT_BUDGET = 24_000
export const MIN_CONTEXT_BUDGET = 4_000

export function modelContextWindow(api?: Pick<ApiConfig, 'model' | 'contextWindow'>): number {
  if (api?.contextWindow && api.contextWindow >= MIN_CONTEXT_BUDGET) return api.contextWindow
  const model = api?.model ?? ''
  for (const item of MODEL_WINDOWS) {
    if (item.pattern.test(model)) return item.window
  }
  return 128_000
}

export interface EffectiveContextBudget {
  /** 用户在作品里设置的值：undefined=默认，0=不限制，其他=明确上限 */
  requested: number | undefined
  /** 本次请求真正可用的输入 token 上限 */
  limit: number
  /** 模型物理窗口 */
  modelWindow: number
  /** 为输出预留的 token */
  outputReserve: number
  unlimited: boolean
  /** 明确上限被模型窗口压缩了 */
  clamped: boolean
}

export function resolveEffectiveContextBudget(
  work: Pick<Work, 'contextBudget'>,
  api?: Pick<ApiConfig, 'model' | 'contextWindow'>,
  outputReserve = DEFAULT_OUTPUT_RESERVE,
): EffectiveContextBudget {
  const requested = work.contextBudget
  const modelWindow = modelContextWindow(api)
  const reserve = Math.max(1024, Math.min(outputReserve, Math.floor(modelWindow * 0.5)))
  const physicalInput = Math.max(MIN_CONTEXT_BUDGET, modelWindow - reserve)
  if (requested === 0) {
    return {
      requested,
      limit: physicalInput,
      modelWindow,
      outputReserve: reserve,
      unlimited: true,
      clamped: false,
    }
  }
  const wanted =
    typeof requested === 'number' && requested > 0 ? requested : DEFAULT_CONTEXT_BUDGET
  return {
    requested,
    limit: Math.max(MIN_CONTEXT_BUDGET, Math.min(wanted, physicalInput)),
    modelWindow,
    outputReserve: reserve,
    unlimited: false,
    clamped: wanted > physicalInput,
  }
}
