import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import { buildPersonalNovelChapterBrief } from './personalChapterBrief'
import type { Chapter, PersonalNovelPlan, WorkDetail } from './types'

const plan: PersonalNovelPlan = {
  title: '灯下无名',
  logline: '一个写名字的人发现自己的名字正在消失。',
  synopsis: '简介',
  protagonist: '沈砚',
  characters: [
    { name: '沈砚', role: '主角', goal: '找回名字' },
    { name: '老周', role: '守门人', goal: '守住档案' },
  ],
  factions: [
    { name: '守灯阁', type: '组织', goal: '维护名字秩序' },
  ],
  realmSchemeName: '照名',
  realmLevels: ['识名', '守名', '照名'],
  factionTierName: '阁内层级',
  factionTierLevels: ['外门', '内门', '长老'],
  chapters: [
    { title: '第一封信', goal: '收到信', conflict: '信上写着死者的名字', hook: '窗外有人' },
    { title: '档案室', goal: '查档案', conflict: '档案被篡改', hook: '父亲的名字不见了' },
  ],
}

const chapters: Chapter[] = [
  {
    id: 'ch-1',
    title: '第一封信',
    content: '沈砚收到了信。',
    summary: '沈砚收到一封写着死者的信。',
    updatedAt: Date.now(),
  },
]

describe('personal chapter brief', () => {
  it('collects canonical detail for the chapter prompt', () => {
    const detail = {
      ...createEmptyDetail(),
      characters: [
        {
          id: 'c1',
          name: '沈砚',
          role: '主角',
          identity: '抄写员',
          personality: '',
          goal: '找回名字',
          status: '正常',
          lifecycle: '已上线' as const,
        },
      ],
      factions: [
        {
          id: 'f1',
          name: '守灯阁',
          type: '组织',
          leader: '',
          goal: '维护名字秩序',
          description: '',
          lifecycle: '已上线' as const,
        },
      ],
      storyThreads: [
        {
          id: 't1',
          text: '谁在寄信',
          status: 'open' as const,
          priority: 'main' as const,
        },
      ],
      foreshadowings: [
        {
          id: 'fo1',
          title: '旧信',
          status: '未回收' as const,
          plantedIn: '第一章',
          note: '信封上的日期是明年',
        },
      ],
      storyStateEvents: [
        {
          id: 'e1',
          chapterId: 'ch-1',
          chapterTitle: '第一封信',
          createdAt: new Date().toISOString(),
          summary: '收到信',
          changes: [],
          events: [
            {
              id: 'ev1',
              title: '收到预言信',
              summary: '信上写着一个死者的名字',
              importance: 'high' as const,
              status: 'canon' as const,
            },
          ],
        },
      ],
      realmSchemes: [
        {
          id: 'r1',
          name: '照名',
          levels: [
            { id: 'r1-1', name: '识名', color: '#888' },
            { id: 'r1-2', name: '守名', color: '#999' },
            { id: 'r1-3', name: '照名', color: '#aaa' },
          ],
        },
      ],
      activeRealmSchemeId: 'r1',
    } as unknown as WorkDetail

    const brief = buildPersonalNovelChapterBrief({
      plan,
      detail,
      chapters,
      chapterIndex: 1,
      targetWords: 1500,
    })

    expect(brief).toContain('【本章写作简报】')
    expect(brief).toContain('沈砚')
    expect(brief).toContain('守灯阁')
    expect(brief).toContain('谁在寄信')
    expect(brief).toContain('信封上的日期是明年')
    expect(brief).toContain('收到预言信')
    expect(brief).toContain('识名、守名、照名')
    expect(brief).toContain('本章：第 2 章《档案室》')
  })

  it('caps the brief to a prompt-safe size', () => {
    const detail = {
      ...createEmptyDetail(),
      storyThreads: Array.from({ length: 30 }, (_, index) => ({
        id: `t-${index}`,
        text: '很长的未解决事项'.repeat(40),
        status: 'open' as const,
        priority: 'main' as const,
      })),
    }
    const brief = buildPersonalNovelChapterBrief({
      plan,
      detail,
      chapters,
      chapterIndex: 1,
    })
    expect(brief.length).toBeLessThanOrEqual(6000)
  })
})
