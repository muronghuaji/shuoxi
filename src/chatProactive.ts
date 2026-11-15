import type {
  CharacterChatProactiveState,
  CharacterChatSession,
  CharacterChatSettings,
} from './types'

export const PROACTIVE_OPENING_DELAY_MS = 1500
export const PROACTIVE_RETURN_IDLE_MS = 6 * 60 * 60 * 1000
export const PROACTIVE_MIN_GAP_MS = 2 * 60 * 1000
export const PROACTIVE_FOLLOW_UP_DELAYS_MS = [
  5 * 60 * 1000,
  10 * 60 * 1000,
  20 * 60 * 1000,
  40 * 60 * 1000,
  60 * 60 * 1000,
]
export const PROACTIVE_DAILY_LIMIT_OPTIONS = [4, 8, 12]
export const PROACTIVE_FOLLOW_UP_LIMIT_OPTIONS = [3, 5]

export type ProactiveReason = 'opening' | 'return' | 'followup'

export interface ProactivePlan {
  reason: ProactiveReason
  delayMs: number
  followUpIndex: number
}

export function localDayKey(timestamp = Date.now()): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function normalizeProactiveState(raw: unknown): CharacterChatProactiveState {
  const input = raw && typeof raw === 'object' ? (raw as Partial<CharacterChatProactiveState>) : {}
  const followUpCount = Math.max(0, Math.min(5, Math.round(Number(input.followUpCount ?? 0))))
  const dailyCount = Math.max(0, Math.round(Number(input.dailyCount ?? 0)))
  return {
    dayKey: typeof input.dayKey === 'string' ? input.dayKey : localDayKey(),
    dailyCount,
    followUpCount,
    ...(typeof input.lastProactiveAt === 'number' ? { lastProactiveAt: input.lastProactiveAt } : {}),
    ...(input.away === true ? { away: true } : {}),
    ...(typeof input.awayAt === 'number' ? { awayAt: input.awayAt } : {}),
  }
}

/** 用户明确说要离开时，停止本轮后续追问。 */
export function isUserLeaving(text: string): boolean {
  const value = text.trim()
  if (!value) return false
  if (/不走|别走|不要走|不离开|没说要走|不会走|不赶你走/.test(value)) return false
  return /(我有事|有点事|有事要|有事得|得去忙|要去忙|先去忙|去忙了|先走了|我先走|那我走了|我走了|得走了|该走了|先撤|我先撤|溜了|下线|回头聊|改天聊|下次聊|晚点聊|有空再聊|先这样|不聊了|先不聊|拜拜|再见|晚安|睡觉了|去睡了|先睡|忙去了|有事离开)/.test(
    value,
  )
}

export function proactiveTodayCount(state: CharacterChatProactiveState, now = Date.now()): number {
  return state.dayKey === localDayKey(now) ? state.dailyCount : 0
}

export function planProactiveChat(
  session: CharacterChatSession,
  settings: CharacterChatSettings,
  now = Date.now(),
): ProactivePlan | null {
  if (!settings.proactiveEnabled) return null
  const messages = session.messages.filter((message) => message.content.trim())
  const state = normalizeProactiveState(session.proactive)
  if (state.away) return null
  if (proactiveTodayCount(state, now) >= settings.proactiveDailyLimit) return null

  if (messages.length === 0) {
    const wait = PROACTIVE_OPENING_DELAY_MS - Math.max(0, now - session.createdAt)
    return { reason: 'opening', delayMs: Math.max(0, wait), followUpIndex: 0 }
  }

  const last = messages[messages.length - 1]
  if (last.role === 'user') return null

  const idleFor = Math.max(0, now - last.at)
  const lastProactiveAt = state.lastProactiveAt ?? 0
  if (lastProactiveAt > last.at && now - lastProactiveAt < PROACTIVE_MIN_GAP_MS) return null

  if (
    idleFor >= PROACTIVE_RETURN_IDLE_MS &&
    lastProactiveAt <= last.at &&
    state.followUpCount < settings.proactiveFollowUpLimit
  ) {
    return { reason: 'return', delayMs: 0, followUpIndex: state.followUpCount }
  }

  if (state.followUpCount >= settings.proactiveFollowUpLimit) return null
  const delay = PROACTIVE_FOLLOW_UP_DELAYS_MS[state.followUpCount]
  if (delay === undefined) return null
  if (idleFor < delay) {
    return {
      reason: 'followup',
      delayMs: delay - idleFor,
      followUpIndex: state.followUpCount,
    }
  }
  return { reason: 'followup', delayMs: 0, followUpIndex: state.followUpCount }
}

export function applyProactiveState(
  stateRaw: unknown,
  reason: ProactiveReason,
  now = Date.now(),
): CharacterChatProactiveState {
  const current = normalizeProactiveState(stateRaw)
  const today = localDayKey(now)
  const dailyCount = current.dayKey === today ? current.dailyCount + 1 : 1
  return {
    dayKey: today,
    dailyCount,
    followUpCount:
      reason === 'followup' ? Math.min(5, current.followUpCount + 1) : current.followUpCount,
    lastProactiveAt: now,
    ...(current.away ? { away: true, awayAt: current.awayAt } : {}),
  }
}

/** 用户发消息时重置追问计数；如果用户说要离开，暂停这一轮主动追问。 */
export function markUserActivity(
  stateRaw: unknown,
  text: string,
  now = Date.now(),
): CharacterChatProactiveState {
  const current = normalizeProactiveState(stateRaw)
  const leaving = isUserLeaving(text)
  return {
    dayKey: current.dayKey,
    dailyCount: current.dailyCount,
    followUpCount: 0,
    ...(current.lastProactiveAt ? { lastProactiveAt: current.lastProactiveAt } : {}),
    ...(leaving ? { away: true, awayAt: now } : {}),
  }
}

export function proactiveInstruction(
  reason: ProactiveReason,
  followUpIndex: number,
  followUpLimit: number,
): string {
  const reasonText =
    reason === 'opening'
      ? '这是角色第一次见到用户，角色先开口。'
      : reason === 'return'
        ? '用户隔了很久才回来，角色主动说一句。'
        : `用户没有回复，角色等了一会儿，进行第 ${followUpIndex + 1}/${followUpLimit} 次低压力跟进。`
  return [
    '【主动消息模式】',
    reasonText,
    '这不是用户发言，而是角色主动发来的一条消息。只输出角色自己的一段话，通常 1–2 句、不超过 60 字。',
    '可以写招呼、动作、情绪或对上次话题的低压力跟进；不要替用户说话，不要编造用户做过的事，不要推进重大剧情，不要制造紧急事件。',
    '不要问“你为什么不回”，不要表达被冷落的指责，不要用内疚感逼用户回复，不要索要礼物或钱。',
    '如果用户之前明确说要离开，现在不能追问。只输出主动消息正文，不要输出解释、标签或 JSON。',
  ].join('\n')
}
