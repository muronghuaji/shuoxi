import type {
  CharacterCard,
  CharacterChatEmotion,
  ChatEmotionTendency,
  ChatEmotionTarget,
  CoreEmotion,
} from './types'

export interface ChatEmotionDefinition {
  id: CoreEmotion
  label: string
  color: string
  behavior: string
  baselineHint: string
}

export const CHAT_EMOTIONS: ChatEmotionDefinition[] = [
  {
    id: 'neutral',
    label: '平静',
    color: '#9aa7b8',
    behavior: '按角色平时的语气回应，不刻意放大情绪。',
    baselineHint: '平静 / 冷淡 / 温和',
  },
  {
    id: 'joy',
    label: '快乐',
    color: '#e6b84a',
    behavior: '更愿意接话、分享和靠近；句子可能变短，语气变轻。',
    baselineHint: '轻快 / 爱笑 / 松弛',
  },
  {
    id: 'sadness',
    label: '悲伤',
    color: '#6f9bd1',
    behavior: '回避热闹，句子变慢或变短；容易停顿、绕开某个人或某件事。',
    baselineHint: '低落 / 安静 / 怀旧',
  },
  {
    id: 'fear',
    label: '恐惧',
    color: '#8b6fc9',
    behavior: '更警觉、更容易试探和确认安全；会回避风险，注意出口和退路。',
    baselineHint: '谨慎 / 警觉 / 胆小',
  },
  {
    id: 'anger',
    label: '愤怒',
    color: '#e05a3f',
    behavior: '语气变硬，反问和短句增加；可能攻击、逼问，也可能压着不发作。',
    baselineHint: '易怒 / 倔强 / 记仇',
  },
  {
    id: 'surprise',
    label: '惊讶',
    color: '#4fb3c7',
    behavior: '先停顿、确认信息；会出现反问、重复对方的关键词。',
    baselineHint: '好奇心强 / 容易出神',
  },
  {
    id: 'disgust',
    label: '厌恶',
    color: '#7b9a5b',
    behavior: '拉开距离，减少回应；用词变冷，避免直接接触。',
    baselineHint: '挑剔 / 冷感 / 洁癖',
  },
  {
    id: 'trust',
    label: '信任',
    color: '#5aa98a',
    behavior: '更愿意交底、托付和靠近；会主动解释，减少试探。',
    baselineHint: '温和 / 可靠 / 重承诺',
  },
  {
    id: 'anticipation',
    label: '期待',
    color: '#d18a3f',
    behavior: '会追问下一步、提前计划；注意力放在将要发生的事上。',
    baselineHint: '有目标 / 急切 / 好奇',
  },
]

export const CHAT_EMOTION_MAP: Record<CoreEmotion, ChatEmotionDefinition> = Object.fromEntries(
  CHAT_EMOTIONS.map((emotion) => [emotion.id, emotion]),
) as Record<CoreEmotion, ChatEmotionDefinition>

const EMOTION_KEYWORDS: { emotion: CoreEmotion; words: RegExp }[] = [
  { emotion: 'anger', words: /生气|愤怒|发火|怒|恨|滚|闭嘴|凭什么|骗|背叛|威胁|混账|可恶/ },
  { emotion: 'fear', words: /害怕|恐惧|危险|杀|逃|不敢|救命|威胁|可怕|颤|恐怖/ },
  { emotion: 'sadness', words: /难过|悲伤|哭|失去|离开|死|遗憾|对不起|想念|心痛|孤独/ },
  { emotion: 'joy', words: /开心|高兴|快乐|喜欢|谢谢|愿意|笑|爱|太好了|哈哈/ },
  { emotion: 'surprise', words: /什么|居然|竟然|没想到|怎么会|不可能|真的|惊/ },
  { emotion: 'disgust', words: /恶心|厌恶|龌龊|脏|恶心|嫌弃|讨厌/ },
  { emotion: 'trust', words: /相信|信任|托付|拜托|交给你|放心|可靠/ },
  { emotion: 'anticipation', words: /接下来|以后|将来|期待|等|计划|下一步|会怎样/ },
]

const TENDENCY_BY_EMOTION: Record<CoreEmotion, ChatEmotionTendency> = {
  neutral: 'probe',
  joy: 'approach',
  sadness: 'avoid',
  fear: 'avoid',
  anger: 'attack',
  surprise: 'probe',
  disgust: 'avoid',
  trust: 'approach',
  anticipation: 'approach',
}

export function defaultChatEmotion(character?: CharacterCard): CharacterChatEmotion {
  const mood = character?.profile?.dynamic?.mood?.trim() ?? ''
  const baseline: CoreEmotion =
    /怒|烦|恼/.test(mood)
      ? 'anger'
      : /悲|低|哀/.test(mood)
        ? 'sadness'
        : /怕|惧|警觉/.test(mood)
          ? 'fear'
          : /喜|轻快|开心/.test(mood)
            ? 'joy'
            : 'neutral'
  return {
    primary: baseline,
    intensity: baseline === 'neutral' ? 0 : 30,
    cause: '',
    target: 'user',
    tendency: TENDENCY_BY_EMOTION[baseline],
    baseline,
    updatedAt: Date.now(),
    auto: true,
  }
}

export function normalizeChatEmotion(
  raw: unknown,
  character?: CharacterCard,
): CharacterChatEmotion {
  const fallback = defaultChatEmotion(character)
  if (!raw || typeof raw !== 'object') return fallback
  const value = raw as Partial<CharacterChatEmotion>
  const primary = CHAT_EMOTION_MAP[value.primary as CoreEmotion] ? (value.primary as CoreEmotion) : fallback.primary
  const baseline = CHAT_EMOTION_MAP[value.baseline as CoreEmotion]
    ? (value.baseline as CoreEmotion)
    : fallback.baseline
  const intensity = Math.max(0, Math.min(100, Math.round(Number(value.intensity ?? 0))))
  return {
    primary,
    intensity,
    cause: typeof value.cause === 'string' ? value.cause.slice(0, 120) : '',
    target: ['user', 'self', 'other', 'situation'].includes(String(value.target))
      ? (value.target as ChatEmotionTarget)
      : 'user',
    tendency: ['approach', 'avoid', 'attack', 'endure', 'probe'].includes(String(value.tendency))
      ? (value.tendency as ChatEmotionTendency)
      : TENDENCY_BY_EMOTION[primary],
    baseline,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    auto: value.auto !== false,
  }
}

/** 无需额外 AI 调用：根据用户这句话做一次轻量情绪评估。 */
export function appraiseChatEmotion(
  current: CharacterChatEmotion | undefined,
  input: string,
  character?: CharacterCard,
): CharacterChatEmotion {
  const base = normalizeChatEmotion(current, character)
  const text = input.trim()
  let matched: CoreEmotion | null = null
  let score = 0
  for (const item of EMOTION_KEYWORDS) {
    const matches = text.match(new RegExp(item.words.source, 'g'))
    const weight = matches?.length ?? 0
    if (weight > score) {
      score = weight
      matched = item.emotion
    }
  }
  if (matched && score > 0) {
    const same = base.primary === matched
    const intensity = Math.min(100, (same ? base.intensity : 28) + 18 + score * 4)
    return {
      ...base,
      primary: matched,
      intensity,
      cause: text.slice(0, 60),
      target: 'user',
      tendency: TENDENCY_BY_EMOTION[matched],
      updatedAt: Date.now(),
      auto: true,
    }
  }
  const nextIntensity = Math.max(0, base.intensity - 8)
  return {
    ...base,
    intensity: nextIntensity,
    primary: nextIntensity <= 4 ? 'neutral' : base.primary,
    tendency: TENDENCY_BY_EMOTION[nextIntensity <= 4 ? 'neutral' : base.primary],
    updatedAt: Date.now(),
    auto: true,
  }
}

export function emotionPromptSection(emotion: CharacterChatEmotion | undefined): string {
  const value = emotion ?? defaultChatEmotion()
  const definition = CHAT_EMOTION_MAP[value.primary]
  return [
    '【当前情绪状态（导演备注，不要直接向对方报出情绪标签）】',
    `主情绪：${definition.label}，强度 ${value.intensity}/100。`,
    value.cause ? `触发原因：${value.cause}` : '',
    `情绪指向：${
      value.target === 'user'
        ? '对方'
        : value.target === 'self'
          ? '自己'
          : value.target === 'other'
            ? '其他在场者'
            : '当前处境'
    }。`,
    `行为倾向：${definition.behavior}`,
    `基线：${CHAT_EMOTION_MAP[value.baseline].label}。`,
    '只让情绪影响语气、停顿、动作、潜台词和愿意说多少；不要改变人物核心性格、认知边界和已发生事实。不要写“他愤怒地说”或“我现在很悲伤”这类说明。',
  ]
    .filter(Boolean)
    .join('\n')
}
