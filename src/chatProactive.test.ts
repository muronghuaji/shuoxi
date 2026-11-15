import { describe, expect, it } from 'vitest'
import type { CharacterChatSession } from './types'
import { DEFAULT_CHARACTER_CHAT_SETTINGS } from './characterChatSettings'
import {
  applyProactiveState,
  isUserLeaving,
  markUserActivity,
  normalizeProactiveState,
  planProactiveChat,
  proactiveTodayCount,
} from './chatProactive'

const settings = DEFAULT_CHARACTER_CHAT_SETTINGS
const now = new Date('2026-11-14T12:00:00+08:00').getTime()

function session(messages: CharacterChatSession['messages'], proactive = {}): CharacterChatSession {
  return {
    id: 's',
    workId: 'w',
    characterId: 'c',
    title: 't',
    chapterCutoff: 1,
    createdAt: now,
    updatedAt: now,
    messages,
    proactive: normalizeProactiveState(proactive),
  }
}

describe('proactive chat rules', () => {
  it('opens an empty session once', () => {
    const plan = planProactiveChat(session([]), settings, now)
    expect(plan?.reason).toBe('opening')
  })

  it('does not follow up when the last message is from the user', () => {
    const plan = planProactiveChat(
      session([{ id: 'u', role: 'user', content: '在吗', at: now }]),
      settings,
      now,
    )
    expect(plan).toBeNull()
  })

  it('schedules follow-ups with cap and daily cap', () => {
    const value = session(
      [{ id: 'a', role: 'assistant', content: '嗯。', at: now - 6 * 60 * 1000 }],
      { lastProactiveAt: now - 20 * 60 * 1000, followUpCount: 1 },
    )
    expect(planProactiveChat(value, settings, now)?.reason).toBe('followup')
    const capped = session(
      [{ id: 'a', role: 'assistant', content: '嗯。', at: now - 6 * 60 * 1000 }],
      { lastProactiveAt: now - 4 * 60 * 60 * 1000, followUpCount: 5 },
    )
    expect(planProactiveChat(capped, settings, now)).toBeNull()
    const daily = session(
      [{ id: 'a', role: 'assistant', content: '嗯。', at: now - 6 * 60 * 1000 }],
      { dailyCount: 8, dayKey: '2026-11-14', followUpCount: 0 },
    )
    expect(planProactiveChat(daily, settings, now)).toBeNull()
  })

  it('returns after a long absence and stops after user leaves', () => {
    const longIdle = session(
      [{ id: 'a', role: 'assistant', content: '嗯。', at: now - 7 * 60 * 60 * 1000 }],
      { followUpCount: 0 },
    )
    expect(planProactiveChat(longIdle, settings, now)?.reason).toBe('return')
    const away = { ...longIdle, proactive: normalizeProactiveState({ away: true }) }
    expect(planProactiveChat(away, settings, now)).toBeNull()
  })

  it('detects explicit leave phrases and resets follow-up count', () => {
    expect(isUserLeaving('我有事走了，回头聊')).toBe(true)
    expect(isUserLeaving('我先去忙了')).toBe(true)
    expect(isUserLeaving('我不走，别赶我')).toBe(false)
    const state = markUserActivity(
      { dayKey: '2026-11-14', dailyCount: 2, followUpCount: 3 },
      '我先走了',
      now,
    )
    expect(state.away).toBe(true)
    expect(state.followUpCount).toBe(0)
  })

  it('counts only today and increments follow-up after a proactive message', () => {
    expect(proactiveTodayCount({ dayKey: '2026-11-13', dailyCount: 7, followUpCount: 0 }, now)).toBe(0)
    const next = applyProactiveState({ dayKey: '2026-11-14', dailyCount: 2, followUpCount: 1 }, 'followup', now)
    expect(next.dailyCount).toBe(3)
    expect(next.followUpCount).toBe(2)
  })
})
