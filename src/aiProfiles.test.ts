import { describe, expect, it } from 'vitest'
import type { ApiConfig } from './types'
import {
  DEFAULT_AI_PROFILES,
  normalizeAiProfiles,
  profileReady,
  profilesFromApiConfig,
  resolveAiConfig,
} from './aiProfiles'

const legacy: ApiConfig = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-test',
  model: 'deepseek-reasoner',
  reasoningEffort: 'deep',
  inputPrice: 1,
  outputPrice: 2,
}

describe('AI profiles', () => {
  it('migrates an old single config into all three profiles', () => {
    const profiles = profilesFromApiConfig(legacy)
    expect(profiles.shared.apiKey).toBe('sk-test')
    expect(profiles.general.model).toBe('deepseek-v4-pro')
    expect(profiles.writing.model).toBe('deepseek-v4-pro')
    expect(profiles.chat.model).toBe('deepseek-v4-pro')
    expect(profiles.writing.reasoningEffort).toBe('deep')
  })

  it('resolves each profile with shared connection and own model', () => {
    const profiles = {
      ...DEFAULT_AI_PROFILES,
      shared: { ...DEFAULT_AI_PROFILES.shared, apiKey: 'sk-test' },
      general: { model: 'flash' },
      writing: { model: 'pro', reasoningEffort: 'deep' as const },
      chat: { model: 'chat-model' },
    }
    expect(resolveAiConfig(profiles, 'general').model).toBe('flash')
    expect(resolveAiConfig(profiles, 'writing').model).toBe('pro')
    expect(resolveAiConfig(profiles, 'writing').reasoningEffort).toBe('deep')
    expect(resolveAiConfig(profiles, 'chat').model).toBe('chat-model')
    expect(resolveAiConfig(profiles, 'chat').apiKey).toBe('sk-test')
  })

  it('normalizes missing and invalid values safely', () => {
    const normalized = normalizeAiProfiles({ general: { model: '' }, writing: null })
    expect(normalized.general.model).toBe(DEFAULT_AI_PROFILES.general.model)
    expect(normalized.writing.model).toBe(DEFAULT_AI_PROFILES.writing.model)
    expect(normalized.shared.provider).toBe('deepseek')
  })

  it('checks readiness per profile', () => {
    const profiles = {
      ...DEFAULT_AI_PROFILES,
      shared: { ...DEFAULT_AI_PROFILES.shared, apiKey: '' },
    }
    expect(profileReady(profiles, 'general')).toBe(false)
    const ready = { ...profiles, shared: { ...profiles.shared, apiKey: 'sk-test' } }
    expect(profileReady(ready, 'writing')).toBe(true)
  })
})
