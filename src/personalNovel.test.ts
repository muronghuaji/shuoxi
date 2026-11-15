import { describe, expect, it } from 'vitest'
import {
  buildPersonalNovelChapterMessages,
  buildPersonalNovelPlanMessages,
  cleanPersonalChapterText,
  parsePersonalNovelPlan,
} from './personalNovel'
import type { PersonalNovelPlan } from './types'

const plan: PersonalNovelPlan = {
  title: '灯下无名',
  logline: '一个写名字的人发现自己的名字消失了。',
  synopsis: '他在当铺里替人写名字，直到自己的那一页变空。',
  protagonist: '陈默',
  characters: [{ name: '陈默', role: '写契人', goal: '找回自己的名字' }],
  chapters: [
    { title: '空页', goal: '发现名字消失', conflict: '当铺不收无名契', hook: '老头认出纸的来历' },
    { title: '旧账', goal: '查旧账', conflict: '账本被人改过', hook: '账上出现自己的名字' },
    { title: '认名', goal: '找回名字', conflict: '要拿别人的名字来换', hook: '他写下了自己的名字' },
  ],
}

describe('personal novel', () => {
  it('parses a story plan from fenced JSON', () => {
    const parsed = parsePersonalNovelPlan(
      '```json\n' + JSON.stringify(plan) + '\n```',
    )
    expect(parsed?.title).toBe('灯下无名')
    expect(parsed?.chapters).toHaveLength(3)
  })

  it('rejects a plan without enough chapters', () => {
    expect(parsePersonalNovelPlan(JSON.stringify({ ...plan, chapters: [] }))).toBeNull()
  })

  it('builds a plan prompt with the reader request', () => {
    const messages = buildPersonalNovelPlanMessages({
      idea: '一个写名字的人发现自己的名字消失了。',
      length: 'short',
      tone: '悬疑',
      pov: '第一人称',
      chapterCount: 5,
      targetWords: 2888,
    })
    expect(messages[0].content).toContain('必须正好 5 章')
    expect(messages[0].content).toContain('2888')
    expect(messages[1].content).toContain('名字消失了')
    expect(messages[1].content).toContain('第一人称')
  })

  it('builds chapter context and strips headings', () => {
    const messages = buildPersonalNovelChapterMessages({
      plan,
      chapterIndex: 1,
      previousChapters: [
        {
          id: 'c1',
          title: '空页',
          content: '第一章正文。',
          updatedAt: Date.now(),
        },
      ],
    })
    expect(messages[1].content).toContain('第一章正文')
    expect(messages[1].content).toContain('旧账')
    expect(cleanPersonalChapterText('### 第 2 章 旧账\n\n正文开始。')).toBe('正文开始。')
  })
})
