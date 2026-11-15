import { describe, expect, it } from 'vitest'
import { buildChatContentPolicy, containsExplicitTerms, findExplicitTerms } from './chatContent'
import { DEFAULT_CHARACTER_CHAT_SETTINGS } from './characterChatSettings'

describe('chat content guard', () => {
  it('detects explicit anatomical and crude terms', () => {
    expect(containsExplicitTerms('这就是普通的对话。')).toBe(false)
    expect(findExplicitTerms('不要写鸡巴和骚逼。')).toEqual(['鸡巴', '骚逼'])
  })

  it('describes restrained adult content without explicit terms', () => {
    const policy = buildChatContentPolicy({
      ...DEFAULT_CHARACTER_CHAT_SETTINGS,
      intimacyLevel: 'adult',
      allowProfanity: true,
    })
    expect(policy).toContain('允许成人向亲密主题')
    expect(policy).toContain('不写露骨性器官')
    expect(policy).toContain('禁止未成年')
    expect(policy).not.toContain('鸡巴')
  })

  it('turns intimacy off by default', () => {
    const policy = buildChatContentPolicy(DEFAULT_CHARACTER_CHAT_SETTINGS)
    expect(policy).toContain('不写亲密和性场景')
    expect(policy).toContain('不要使用脏话')
  })
})
