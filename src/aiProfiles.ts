import type { AiProfileId, AiProfileSettings, AiProfilesConfig, ApiConfig } from './types'
import { DEFAULT_API, getProvider, migrateApiConfig, normalizeModelId } from './data'

export const AI_PROFILES_KEY = 'shuoxi.aiProfiles.v1'
export const LEGACY_API_KEY = 'shuoxi.api.v1'

export const AI_PROFILE_OPTIONS: {
  id: AiProfileId
  label: string
  short: string
  hint: string
}[] = [
  {
    id: 'general',
    label: '通用 AI',
    short: '通用',
    hint: '项目生成、实体/物品/地点补全、世界模板、提示词生成',
  },
  {
    id: 'writing',
    label: '写作 AI',
    short: '写作',
    hint: '正文续写、重拍、选段改写、标题、分析、连续性与灵感助手',
  },
  {
    id: 'chat',
    label: '角色聊天 AI',
    short: '聊天',
    hint: '角色单聊、群聊、会话摘要、长期记忆与剧情候选',
  },
]

function defaultProfile(model = DEFAULT_API.model): AiProfileSettings {
  return { model, reasoningEffort: DEFAULT_API.reasoningEffort }
}

export const DEFAULT_AI_PROFILES: AiProfilesConfig = {
  shared: {
    provider: DEFAULT_API.provider,
    baseUrl: DEFAULT_API.baseUrl,
    apiKey: DEFAULT_API.apiKey,
    inputPrice: 0,
    outputPrice: 0,
    embeddingModel: '',
    contextWindow: 0,
  },
  general: defaultProfile(),
  writing: defaultProfile(),
  chat: defaultProfile(),
}

export function profilesFromApiConfig(config: ApiConfig): AiProfilesConfig {
  return {
    shared: {
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      inputPrice: config.inputPrice ?? 0,
      outputPrice: config.outputPrice ?? 0,
      embeddingModel: config.embeddingModel ?? '',
      contextWindow: config.contextWindow,
    },
    general: {
      model: normalizeModelId(config.provider, config.model),
      reasoningEffort: config.reasoningEffort ?? 'auto',
    },
    writing: {
      model: normalizeModelId(config.provider, config.model),
      reasoningEffort: config.reasoningEffort ?? 'auto',
    },
    chat: {
      model: normalizeModelId(config.provider, config.model),
      reasoningEffort: config.reasoningEffort ?? 'auto',
    },
  }
}

function normalizeProfile(
  raw: unknown,
  fallback: AiProfileSettings,
  provider: string,
): AiProfileSettings {
  const value = raw && typeof raw === 'object' ? (raw as Partial<AiProfileSettings>) : {}
  const model =
    typeof value.model === 'string' && value.model.trim() ? value.model.trim() : fallback.model
  return {
    model: normalizeModelId(provider, model),
    reasoningEffort: value.reasoningEffort ?? fallback.reasoningEffort ?? 'auto',
  }
}

export function normalizeAiProfiles(raw: unknown): AiProfilesConfig {
  const value = raw && typeof raw === 'object' ? (raw as Partial<AiProfilesConfig>) : {}
  const sharedRaw =
    value.shared && typeof value.shared === 'object'
      ? (value.shared as Partial<AiProfilesConfig['shared']>)
      : {}
  const provider =
    typeof sharedRaw.provider === 'string' && sharedRaw.provider
      ? sharedRaw.provider
      : DEFAULT_AI_PROFILES.shared.provider
  return {
    shared: {
      provider,
      baseUrl:
        typeof sharedRaw.baseUrl === 'string'
          ? sharedRaw.baseUrl
          : getProvider(provider).baseUrl,
      apiKey: typeof sharedRaw.apiKey === 'string' ? sharedRaw.apiKey : '',
      inputPrice:
        typeof sharedRaw.inputPrice === 'number' ? sharedRaw.inputPrice : 0,
      outputPrice:
        typeof sharedRaw.outputPrice === 'number' ? sharedRaw.outputPrice : 0,
      embeddingModel:
        typeof sharedRaw.embeddingModel === 'string' ? sharedRaw.embeddingModel : '',
      contextWindow:
        typeof sharedRaw.contextWindow === 'number' && sharedRaw.contextWindow > 0
          ? sharedRaw.contextWindow
          : undefined,
    },
    general: normalizeProfile(value.general, DEFAULT_AI_PROFILES.general, provider),
    writing: normalizeProfile(value.writing, DEFAULT_AI_PROFILES.writing, provider),
    chat: normalizeProfile(value.chat, DEFAULT_AI_PROFILES.chat, provider),
  }
}

export function loadInitialAiProfiles(): AiProfilesConfig {
  try {
    const raw = window.localStorage.getItem(AI_PROFILES_KEY)
    if (raw) return normalizeAiProfiles(JSON.parse(raw))
  } catch {
    // 继续尝试旧配置
  }
  try {
    const legacy = window.localStorage.getItem(LEGACY_API_KEY)
    if (legacy) return profilesFromApiConfig(migrateApiConfig(JSON.parse(legacy)))
  } catch {
    // 使用默认配置
  }
  return DEFAULT_AI_PROFILES
}

export function resolveAiConfig(profiles: AiProfilesConfig, profile: AiProfileId): ApiConfig {
  const settings = profiles[profile]
  return {
    provider: profiles.shared.provider,
    baseUrl: profiles.shared.baseUrl,
    apiKey: profiles.shared.apiKey,
    model: settings.model,
    reasoningEffort: settings.reasoningEffort ?? 'auto',
    inputPrice: profiles.shared.inputPrice ?? 0,
    outputPrice: profiles.shared.outputPrice ?? 0,
    embeddingModel: profiles.shared.embeddingModel ?? '',
    contextWindow: profiles.shared.contextWindow,
  }
}

export function profileReady(profiles: AiProfilesConfig, profile: AiProfileId): boolean {
  const config = resolveAiConfig(profiles, profile)
  return Boolean(config.apiKey.trim() && config.baseUrl.trim() && config.model.trim())
}

export function profileLabel(profile: AiProfileId): string {
  return AI_PROFILE_OPTIONS.find((item) => item.id === profile)?.short ?? profile
}
