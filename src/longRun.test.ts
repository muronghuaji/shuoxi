import { describe, expect, it } from 'vitest'
import { createEmptyDetail, SEED_WORKS } from './data'
import type { Chapter } from './types'
import { emptyCharacterProfile } from './characterProfile'
import { buildStoryMemory } from './storyMemory'
import { retrieveStoryMemory } from './storyRetrieval'
import { auditGeneratedText, repairRepeatedParagraphs } from './storyAudit'
import { buildGenerationMessages } from './ai'

function makeLongWork() {
  const detail = createEmptyDetail()
  const chapters: Chapter[] = Array.from({ length: 400 }, (_, index) => ({
    id: `ch-${index + 1}`,
    title: `第${index + 1}章 节点${index + 1}`,
    content: `第${index + 1}章正文。陆照雪在旧书店调查母亲的遗书，线索指向第${index + 1}个旧案。`,
    summary: `第${index + 1}章：陆照雪调查遗书，发现第${index + 1}条线索。`,
    status: 'done',
    words: 2000,
    createdAt: '',
    updatedAt: 0,
  })) as unknown as Chapter[]
  detail.characters = [
    {
      id: 'c1',
      name: '陆照雪',
      role: '主角',
      identity: '剑修',
      personality: '克制',
      goal: '查清遗书',
      lifecycle: '已上线',
      profile: {
        ...emptyCharacterProfile(),
        knowledge: {
          ...emptyCharacterProfile().knowledge,
          knows: ['母亲有一封遗书'],
          blindSpots: ['顾长风已经看过遗书'],
        },
      },
    },
    {
      id: 'c2',
      name: '顾长风',
      role: '配角',
      identity: '师父',
      personality: '沉稳',
      goal: '隐瞒真相',
      lifecycle: '已下线',
    },
  ]
  detail.factions = [
    {
      id: 'f1',
      name: '太虚剑宗',
      type: '宗门',
      leader: '顾长风',
      goal: '守山',
      description: '守着一封旧信',
      tierLevel: 2,
      facilities: [
        {
          id: 'fac1',
          name: '藏锋堂',
          type: '殿堂',
          counts: { elder: 1, main: 2, inner: 3, outer: 4, menial: 5 },
        },
      ],
    },
  ]
  detail.foreshadowings = [
    {
      id: 'fs1',
      title: '母亲遗书的真相',
      status: '未回收',
      plantedIn: '第1章',
      payoffChapterId: 'ch-300',
      importance: '主线',
      note: '',
    },
  ]
  detail.storyStateEvents = Array.from({ length: 80 }, (_, index) => {
    const chapterNumber = index * 5 + 1
    return {
      id: `evt-${index + 1}`,
      chapterId: `ch-${chapterNumber}`,
      chapterTitle: `第${chapterNumber}章`,
      createdAt: new Date(1780000000000 + index * 100000).toISOString(),
      summary: `第${chapterNumber}章事件：调查遗书，发现线索${index + 1}`,
      changes: [],
      events: [
        {
          id: `se-${index + 1}`,
          title: `遗书线索${index + 1}`,
          summary: `陆照雪在第${chapterNumber}章找到一条遗书线索。`,
          participants: ['陆照雪'],
          location: '旧书店',
          cause: '调查',
          result: '得到线索',
          consequences: ['真相仍未解开'],
          importance: 'high',
          status: 'canon',
        },
      ],
      openThreads: ['遗书真相'],
    }
  })
  return { detail, chapters }
}

describe('400-chapter long-run stress', () => {
  it('builds a 400-chapter story memory and keeps retrieval usable', () => {
    const { detail, chapters } = makeLongWork()
    const start = Date.now()
    const memory = buildStoryMemory(detail, chapters)
    const built = Date.now() - start
    expect(memory.volumes.length).toBe(20)
    expect(memory.facts.length).toBeGreaterThan(5)
    expect(memory.promises.some((promise) => promise.title === '母亲遗书的真相')).toBe(true)
    expect(memory.knowledge.some((entry) => entry.topic === '顾长风已经看过遗书')).toBe(true)
    const hits = retrieveStoryMemory(
      detail,
      chapters,
      'ch-390',
      '陆照雪调查母亲遗书和旧书店的线索',
      memory,
      8,
    )
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((hit) => hit.text.includes('遗书'))).toBe(true)
    const chapter = chapters[350]
    const prompt = buildGenerationMessages({
      work: SEED_WORKS[0],
      detail,
      chapters,
      chapter,
      baseContent: chapter.content,
      directive: '继续写陆照雪调查遗书',
      prompts: [],
      reasoningEffort: 'auto',
    })
    const promptText = prompt.map((message) => message.content).join('\n')
    expect(promptText).toContain('当前卷记忆')
    expect(promptText).toContain('相关历史记忆')
    expect(built).toBeLessThan(5000)
    console.log('LONG_RUN_MEMORY_MS', built, 'FACTS', memory.facts.length, 'PROMPT_CHARS', promptText.length)
  })

  it('audits a 400-chapter story and auto-removes exact repeated paragraphs', () => {
    const { detail, chapters } = makeLongWork()
    const memory = buildStoryMemory(detail, chapters)
    const repeatedText =
      '陆照雪走进旧书店，在柜台后面发现那封被藏起来的母亲遗书。\n陆照雪走进旧书店，在柜台后面发现那封被藏起来的母亲遗书。'
    const issues = auditGeneratedText({
      text: repeatedText,
      baseContent:
        '陆照雪走进旧书店，在柜台后面发现那封被藏起来的母亲遗书。',
      detail,
      chapters,
      chapterId: 'ch-390',
      memory,
    })
    expect(issues.some((issue) => issue.type === 'repetition')).toBe(true)
    const repaired = repairRepeatedParagraphs(repeatedText, '')
    expect(repaired.removed).toBe(1)
    expect(repaired.text.split('\n').filter(Boolean)).toHaveLength(1)
  })
})
