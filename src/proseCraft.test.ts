import { describe, expect, it } from 'vitest'
import { buildGenerationMessages } from './ai'
import {
  buildProsePolishMessages,
  buildStyleAnchorSection,
  buildProseVoiceSection,
} from './proseCraft'
import { createEmptyDetail } from './data'
import { emptyCharacterProfile } from './characterProfile'
import type { Chapter, Work } from './types'

const work: Work = {
  id: 'w1',
  title: '测试书',
  synopsis: '',
  theme: '',
  genres: ['悬疑'],
  outlineMode: 'traditional',
  perspective: 'third-limited',
  characterCount: 2,
  targetWords: 100000,
  promptIds: [],
  status: '草稿',
  chapters: 2,
  words: 1000,
  updatedAt: 1,
  coverIndex: 0,
}

const chapters: Chapter[] = [
  {
    id: 'c1',
    title: '第一章',
    content:
      '雨落在旧书店的窗上，门轴响了一声。林夏没有立刻进去，只把伞靠在门边，听着柜台后面那盏旧灯发出细小的电流声。\n\n“你回来了。”姐姐说。\n\n她没有回答，只把伞靠在门边。',
    updatedAt: 1,
    status: 'writing',
    wordCount: 80,
  },
  {
    id: 'c2',
    title: '第二章',
    content: '柜台后的灯还亮着。',
    updatedAt: 2,
    status: 'writing',
    wordCount: 10,
  },
]

describe('prose craft', () => {
  it('builds a scene contract into generation prompts', () => {
    const messages = buildGenerationMessages({
      work,
      detail: createEmptyDetail(),
      chapters,
      chapter: chapters[1],
      baseContent: '',
      directive: '继续写',
      prompts: [],
      reasoningEffort: 'balanced',
    })
    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('【文笔要求】')
    expect(text).toContain('场景合同')
    expect(text).toContain('【语感锚点】')
    expect(text).toContain('不要照抄内容')
  })

  it('uses prior prose as anchors, not the current chapter', () => {
    const anchors = buildStyleAnchorSection(chapters, 'c2')
    expect(anchors).toContain('【语感锚点】')
    expect(anchors).toContain('你回来了')
    expect(anchors).not.toContain('柜台后的灯还亮着')
  })

  it('builds a polish prompt that preserves story facts', () => {
    const messages = buildProsePolishMessages({
      workTitle: work.title,
      chapterTitle: '第一章',
      content: chapters[0].content,
      style: createEmptyDetail().style,
      anchors: '【语感锚点】\n1. 参考句。',
      voice: '【角色声音卡】\n- 姐姐｜短句',
    })
    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('只做文笔精修，不改剧情')
    expect(text).toContain('必须保留')
    expect(text).toContain('【待精修正文】')
  })

  it('formats character voice cards from profiles', () => {
    const detail = createEmptyDetail()
    detail.characters = [
      {
        id: 'c1',
        name: '姐姐',
        role: '配角',
        identity: '',
        personality: '',
        goal: '',
        profile: {
          ...emptyCharacterProfile(),
          voice: {
            ...emptyCharacterProfile().voice,
            register: '口语',
            sentenceLength: '短句',
            samples: ['你回来了。'],
          },
        },
      } as never,
    ]
    expect(buildProseVoiceSection(detail)).toContain('角色声音卡')
  })
})
