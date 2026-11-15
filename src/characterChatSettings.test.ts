import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHARACTER_CHAT_SETTINGS,
  normalizeCharacterChatSettings,
  replyMaxTokens,
} from './characterChatSettings'

describe('normalizeCharacterChatSettings', () => {
  it('returns defaults for invalid data', () => {
    expect(normalizeCharacterChatSettings(null)).toEqual(DEFAULT_CHARACTER_CHAT_SETTINGS)
  })

  it('keeps supported options and clamps choices', () => {
    const value = normalizeCharacterChatSettings({
      autoMemoryDefault: false,
      autoMemoryInterval: 8,
      defaultCutoffMode: 'first',
      contextMessageLimit: 30,
      replyLength: 'long',
    })
    expect(value).toEqual({
      autoMemoryDefault: false,
      autoMemoryInterval: 8,
      defaultCutoffMode: 'first',
      contextMessageLimit: 30,
      replyLength: 'long',
      languageOpenness: 'normal',
      allowProfanity: false,
      allowThreats: false,
      intimacyLevel: 'off',
      proactiveEnabled: true,
      proactiveDailyLimit: 8,
      proactiveFollowUpLimit: 5,
    })
    expect(normalizeCharacterChatSettings({ autoMemoryInterval: 5 }).autoMemoryInterval).toBe(6)
    expect(normalizeCharacterChatSettings({ contextMessageLimit: 99 }).contextMessageLimit).toBe(20)
  })

  it('maps reply length to token budget', () => {
    expect(replyMaxTokens('short')).toBe(500)
    expect(replyMaxTokens('normal')).toBe(900)
    expect(replyMaxTokens('long')).toBe(1400)
  })
})
