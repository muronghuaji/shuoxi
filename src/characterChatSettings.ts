import type { CharacterChatSettings } from './types'

export const CHARACTER_CHAT_SETTINGS_KEY = 'shuoxi.characterChatSettings.v1'

export const DEFAULT_CHARACTER_CHAT_SETTINGS: CharacterChatSettings = {
  autoMemoryDefault: true,
  autoMemoryInterval: 6,
  defaultCutoffMode: 'latest',
  contextMessageLimit: 20,
  replyLength: 'normal',
  languageOpenness: 'normal',
  allowProfanity: false,
  allowThreats: false,
  intimacyLevel: 'off',
  proactiveEnabled: true,
  proactiveDailyLimit: 8,
  proactiveFollowUpLimit: 5,
}

export function normalizeCharacterChatSettings(raw: unknown): CharacterChatSettings {
  const input = raw && typeof raw === 'object' ? (raw as Partial<CharacterChatSettings>) : {}
  const intervals = [4, 6, 8, 10]
  const limits = [10, 20, 30]
  const replyLengths = ['short', 'normal', 'long'] as const
  const languageLevels = ['gentle', 'normal', 'sharp', 'extreme'] as const
  const intimacyLevels = ['off', 'tension', 'fade', 'adult'] as const
  const proactiveDailyLimits = [4, 8, 12]
  const proactiveFollowUpLimits = [3, 5]
  return {
    autoMemoryDefault:
      typeof input.autoMemoryDefault === 'boolean'
        ? input.autoMemoryDefault
        : DEFAULT_CHARACTER_CHAT_SETTINGS.autoMemoryDefault,
    autoMemoryInterval: intervals.includes(input.autoMemoryInterval ?? -1)
      ? (input.autoMemoryInterval as number)
      : DEFAULT_CHARACTER_CHAT_SETTINGS.autoMemoryInterval,
    defaultCutoffMode: input.defaultCutoffMode === 'first' ? 'first' : 'latest',
    contextMessageLimit: limits.includes(input.contextMessageLimit ?? -1)
      ? (input.contextMessageLimit as number)
      : DEFAULT_CHARACTER_CHAT_SETTINGS.contextMessageLimit,
    replyLength: replyLengths.includes(input.replyLength as (typeof replyLengths)[number])
      ? (input.replyLength as CharacterChatSettings['replyLength'])
      : DEFAULT_CHARACTER_CHAT_SETTINGS.replyLength,
    languageOpenness: languageLevels.includes(
      input.languageOpenness as (typeof languageLevels)[number],
    )
      ? (input.languageOpenness as CharacterChatSettings['languageOpenness'])
      : DEFAULT_CHARACTER_CHAT_SETTINGS.languageOpenness,
    allowProfanity:
      typeof input.allowProfanity === 'boolean'
        ? input.allowProfanity
        : DEFAULT_CHARACTER_CHAT_SETTINGS.allowProfanity,
    allowThreats:
      typeof input.allowThreats === 'boolean'
        ? input.allowThreats
        : DEFAULT_CHARACTER_CHAT_SETTINGS.allowThreats,
    intimacyLevel: intimacyLevels.includes(
      input.intimacyLevel as (typeof intimacyLevels)[number],
    )
      ? (input.intimacyLevel as CharacterChatSettings['intimacyLevel'])
      : DEFAULT_CHARACTER_CHAT_SETTINGS.intimacyLevel,
    proactiveEnabled:
      typeof input.proactiveEnabled === 'boolean'
        ? input.proactiveEnabled
        : DEFAULT_CHARACTER_CHAT_SETTINGS.proactiveEnabled,
    proactiveDailyLimit: proactiveDailyLimits.includes(input.proactiveDailyLimit ?? -1)
      ? (input.proactiveDailyLimit as number)
      : DEFAULT_CHARACTER_CHAT_SETTINGS.proactiveDailyLimit,
    proactiveFollowUpLimit: proactiveFollowUpLimits.includes(input.proactiveFollowUpLimit ?? -1)
      ? (input.proactiveFollowUpLimit as number)
      : DEFAULT_CHARACTER_CHAT_SETTINGS.proactiveFollowUpLimit,
    ...(typeof input.backgroundImage === 'string' && input.backgroundImage.startsWith('data:image/')
      ? { backgroundImage: input.backgroundImage }
      : {}),
  }
}

export const CHAT_INTERVAL_OPTIONS = [4, 6, 8, 10]
export const CHAT_CONTEXT_OPTIONS = [10, 20, 30]
export const CHAT_REPLY_OPTIONS: { value: CharacterChatSettings['replyLength']; label: string }[] = [
  { value: 'short', label: '短' },
  { value: 'normal', label: '标准' },
  { value: 'long', label: '长' },
]

export const CHAT_PROACTIVE_DAILY_OPTIONS = [4, 8, 12]
export const CHAT_PROACTIVE_FOLLOW_UP_OPTIONS = [3, 5]

export const CHAT_LANGUAGE_OPTIONS: {
  value: CharacterChatSettings['languageOpenness']
  label: string
  hint: string
}[] = [
  { value: 'gentle', label: '温和', hint: '不主动骂人，最多冷淡、回避、反问。' },
  { value: 'normal', label: '正常', hint: '可以生气、讽刺，少量粗口。' },
  { value: 'sharp', label: '锋利', hint: '允许戏内骂人和狠话，但要符合角色与关系。' },
  { value: 'extreme', label: '极锋利', hint: '允许更重的戏内辱骂与威胁，仍然禁止真实攻击。' },
]

export const CHAT_INTIMACY_OPTIONS: {
  value: CharacterChatSettings['intimacyLevel']
  label: string
  hint: string
}[] = [
  { value: 'off', label: '关闭', hint: '不写亲密与性场景，遇到即淡出。' },
  { value: 'tension', label: '情感张力', hint: '可以写暧昧、欲望、靠近，但不写性行为。' },
  { value: 'fade', label: '情色留白', hint: '可以写亲密推进，性场景一律淡出，不写过程。' },
  {
    value: 'adult',
    label: '成人向',
    hint: '允许成人亲密主题，但仍禁止露骨性器官词、粗俗性俚语和色情动作清单。',
  },
]

export function replyMaxTokens(length: CharacterChatSettings['replyLength']): number {
  if (length === 'short') return 500
  if (length === 'long') return 1400
  return 900
}
