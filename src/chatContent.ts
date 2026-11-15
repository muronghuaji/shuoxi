import type { CharacterChatSettings } from './types'

/**
 * 成人内容分级只负责“允许写到哪里”，不负责允许器官和粗俗性俚语。
 * 这些词始终在生成后拦截，避免成人向变成色情直写。
 */
const EXPLICIT_TERMS = [
  '鸡巴',
  '几把',
  '阴茎',
  '龟头',
  '阴蒂',
  '阴道',
  '奶子',
  '骚逼',
  '骚货',
  '淫水',
  '精液',
  '射精',
  '操你',
  '干你',
  '插进去',
  '舔逼',
  '露阴',
  '乳房',
  '乳头',
]

export function findExplicitTerms(text: string): string[] {
  const lower = text.toLowerCase()
  return EXPLICIT_TERMS.filter((term) => lower.includes(term))
}

export function containsExplicitTerms(text: string): boolean {
  return findExplicitTerms(text).length > 0
}

export function buildChatContentPolicy(settings?: CharacterChatSettings): string {
  if (!settings) return ''
  const language =
    settings.languageOpenness === 'gentle'
      ? '语言保持克制，不主动使用粗口或人身攻击。'
      : settings.languageOpenness === 'normal'
        ? '可以生气、讽刺和冷淡，但不主动使用高频粗口。'
        : settings.languageOpenness === 'sharp'
          ? '允许锋利冲突、戏内骂人和狠话；只有情绪和关系支持时才出现，不要每句都骂。'
          : '允许更重的戏内辱骂和威胁；仍然不能仇恨群体、歧视或真实攻击用户本人。'
  const profanity = settings.allowProfanity
    ? '允许符合角色的粗口，但不要堆砌。'
    : '不要使用脏话或粗俗性俚语。'
  const threats = settings.allowThreats
    ? '允许戏内威胁和狠话，但不能诱导真实自残或真实暴力。'
    : '不要使用死亡威胁、真实伤害威胁或鼓励自残。'
  const intimacy =
    settings.intimacyLevel === 'off'
      ? '不写亲密和性场景；遇到暧昧或性张力时自然淡出。'
      : settings.intimacyLevel === 'tension'
        ? '可以写暧昧、欲望、靠近和试探，但不写性行为。'
        : settings.intimacyLevel === 'fade'
          ? '可以写亲密关系的推进，但性场景一律淡出，不写过程。'
          : '允许成人向亲密主题，但必须克制：不写露骨性器官、粗俗性俚语和色情动作清单；用情绪、感官、停顿、视角切换、留白和事后余韵推进。禁止未成年、非自愿、真实人物和违法内容。'
  return [
    '【聊天内容边界（优先级高于角色表演）】',
    `语言开放度：${language}`,
    profanity,
    threats,
    `亲密内容：${intimacy}`,
    '生成结果禁止出现露骨性器官词和粗俗性俚语。',
    '如果角色不适合这种表达，宁可沉默、回避或换一种说法，不要为了“开放”而崩人设。',
    '你是在扮演戏内角色，不是在评价或攻击屏幕外的用户本人。',
  ].join('\n')
}
