import { describe, expect, it } from 'vitest'
import { buildGenerationMessages } from './ai'
import { buildWritingAnchors } from './writingAnchors'
import { createEmptyDetail } from './data'
import type { Chapter, CharacterCard, CharacterProfile, Work } from './types'

const work: Work = {
  id: 'w1',
  title: '长篇测试',
  synopsis: '',
  theme: '',
  genres: ['悬疑'],
  outlineMode: 'traditional',
  perspective: 'third-limited',
  characterCount: 1,
  targetWords: 1000000,
  promptIds: [],
  status: '连载中',
  chapters: 30,
  words: 1000,
  updatedAt: 1,
  coverIndex: 0,
}

function profile(pov = false, importance: 'core' | 'major' = 'core'): CharacterProfile {
  return {
    meta: { pov, importance, firstAppearance: '', plotArmor: '', aiNotes: '' },
    dynamic: { mood: '警惕', currentGoal: '查清档案', injuries: '', location: '旧书店', possessions: '', arc: '', updatedAt: '' },
  } as unknown as CharacterProfile
}

function chapters(): Chapter[] {
  return Array.from({ length: 30 }, (_, index) => ({
    id: `ch${index + 1}`,
    title: `第 ${index + 1} 章`,
    content: index === 28 ? '陈默回到旧书店。' : index === 29 ? '' : `第 ${index + 1} 章正文。`,
    updatedAt: 1,
    status: 'writing',
    wordCount: 20,
  }))
}

function fixture() {
  const detail = createEmptyDetail()
  const chen: CharacterCard = {
    id: 'c1',
    name: '陈默',
    role: '主角',
    identity: '调查员',
    personality: '克制',
    goal: '查清父亲失踪',
    profile: profile(true),
  }
  const fan: CharacterCard = {
    id: 'c2',
    name: '范长庚',
    role: '配角',
    identity: '档案员',
    personality: '圆滑',
    goal: '保住职位',
  }
  detail.characters = [chen, fan]
  detail.storyThreads = [
    {
      id: 't1',
      text: '父亲失踪档案的真相',
      status: 'open',
      priority: 'main',
    },
  ]
  const list = chapters()
  list[28].content = '陈默和范长庚在档案室对峙。'
  list[29].content = ''
  return { detail, chapters: list, current: list[29] }
}

describe('writing anchors', () => {
  it('keeps POV, previous chapter cast, location and main thread', () => {
    const { detail, chapters: list, current } = fixture()
    const anchors = buildWritingAnchors(detail, list, current)
    expect(anchors.section).toContain('陈默')
    expect(anchors.section).toContain('范长庚')
    expect(anchors.section).toContain('旧书店')
    expect(anchors.section).toContain('父亲失踪档案的真相')
    expect(anchors.characterIds.has('c1')).toBe(true)
    expect(anchors.characterIds.has('c2')).toBe(true)
  })

  it('stays in the prompt even when the budget is tight', () => {
    const { detail, chapters: list, current } = fixture()
    for (let index = 0; index < 80; index += 1) {
      detail.characters.push({
        id: `extra-${index}`,
        name: `路人${index}`,
        role: '路人',
        identity: '居民',
        personality: '',
        goal: '',
      })
    }
    const messages = buildGenerationMessages({
      work: { ...work, contextBudget: 4000 },
      detail,
      chapters: list,
      chapter: current,
      baseContent: '',
      directive: '陈默回到旧书店。',
      prompts: [],
      reasoningEffort: 'fast',
    })
    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('【连续性锚点】')
    expect(text).toContain('陈默')
  })

  it('keeps a side foreshadowing planted recently', () => {
    const { detail, chapters: list, current } = fixture()
    detail.foreshadowings = [
      {
        id: 'f-side',
        title: '旧城蓝戳',
        status: '未回收',
        plantedIn: '第 27 章',
        plantedChapterId: 'ch27',
        note: '蓝戳的来源',
        importance: '支线',
      },
    ]
    const messages = buildGenerationMessages({
      work,
      detail,
      chapters: list,
      chapter: current,
      baseContent: '',
      directive: '陈默继续调查。',
      prompts: [],
      reasoningEffort: 'fast',
    })
    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('旧城蓝戳')
  })
})
