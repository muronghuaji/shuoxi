import { describe, expect, it } from 'vitest'
import { createEmptyDetail, SEED_WORKS } from './data'
import type { Chapter, StoryStateEvent } from './types'
import { emptyCharacterProfile } from './characterProfile'
import { normalizeCharacterExperience } from './characterExperience'
import {
  activeFactsAtChapter,
  buildStoryMemory,
  currentVolume,
} from './storyMemory'
import {
  buildMemoryContextSections,
  retrieveStoryMemory,
} from './storyRetrieval'
import { auditGeneratedText } from './storyAudit'
import { buildGenerationMessages } from './ai'
import { buildContinuityAuditMessages, buildContinuityRepairMessages } from './ai'
import { applyParagraphRepairEdits, parseParagraphRepairEdits } from './ai'

function chapters(): Chapter[] {
  return Array.from({ length: 24 }, (_, index) => ({
    id: `ch-${index + 1}`,
    title: `第${index + 1}章`,
    content:
      index === 1
        ? '陆照雪在旧书店听见顾长风提到母亲遗书，但她没有看见信。'
        : index < 5
          ? `第${index + 1}章正文：陆照雪调查旧事。`
          : '',
    summary: index < 5 ? `第${index + 1}章摘要：调查旧事，发现线索。` : '',
    status: index < 5 ? 'done' : 'draft',
    words: index < 5 ? 2000 : 0,
    createdAt: '',
    updatedAt: '',
  })) as unknown as Chapter[]
}

function fixture() {
  const detail = createEmptyDetail()
  const chapterList = chapters()
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
          believes: ['顾长风在撒谎'],
        },
      },
      experiences: [
        normalizeCharacterExperience({
          chapterId: 'ch-2',
          chapterNumber: 2,
          title: '旧书店偷听',
          summary: '听见顾长风提到母亲遗书，但没有看到信。',
          knowledgeScope: '听别人说',
          learned: ['顾长风知道遗书'],
          importance: 'core',
        })!,
      ],
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
      description: '旧描述',
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
      plantedIn: '第2章',
      payoffChapterId: 'ch-8',
      importance: '主线',
      note: '必须在第一卷回收',
    },
  ]
  const event: StoryStateEvent = {
    id: 'evt-1',
    chapterId: 'ch-2',
    chapterTitle: '第2章',
    createdAt: new Date().toISOString(),
    summary: '陆照雪在旧书店听见顾长风提到母亲遗书。',
    changes: [],
    events: [
      {
        id: 'se-1',
        title: '旧书店偷听',
        summary: '陆照雪听见顾长风提到母亲遗书，但没有看见信。',
        participants: ['陆照雪', '顾长风'],
        location: '旧书店',
        cause: '调查',
        result: '得到线索',
        consequences: ['遗书真相未解'],
        importance: 'high',
        status: 'canon',
      },
    ],
    openThreads: ['遗书真相'],
  }
  detail.storyStateEvents = [event]
  return { detail, chapters: chapterList }
}

describe('story memory and context', () => {
  it('builds volumes, facts, promises and health', () => {
    const { detail, chapters } = fixture()
    const memory = buildStoryMemory(detail, chapters)
    expect(memory.volumes.length).toBe(2)
    expect(memory.volumes[0].chapterCount).toBe(20)
    expect(memory.facts.some((fact) => fact.subjectName === '藏锋堂' || fact.field === 'facilities')).toBe(true)
    expect(memory.promises.some((promise) => promise.title === '母亲遗书的真相')).toBe(true)
    expect(memory.knowledge.some((entry) => entry.topic === '顾长风已经看过遗书' && entry.state === '不知道')).toBe(true)
    expect(memory.health.score).toBeGreaterThan(0)
    expect(memory.health.issues.some((issue) => issue.type === 'overdue-promise')).toBe(true)
  })

  it('keeps temporal facts and manual fact status', () => {
    const { detail, chapters } = fixture()
    const first = buildStoryMemory(detail, chapters)
    const fact = first.facts.find((item) => item.field === 'facilities')
    expect(fact).toBeTruthy()
    detail.memory = {
      ...first,
      facts: first.facts.map((item) =>
        item.id === fact?.id ? { ...item, status: 'retconned' } : item,
      ),
    }
    const second = buildStoryMemory(detail, chapters)
    expect(second.facts.find((item) => item.id === fact?.id)?.status).toBe('retconned')
    const active = activeFactsAtChapter(second, chapters, 'ch-5')
    expect(active.some((item) => item.id === fact?.id)).toBe(false)
  })

  it('retrieves relevant old memories and builds context sections', () => {
    const { detail, chapters } = fixture()
    const memory = buildStoryMemory(detail, chapters)
    const hits = retrieveStoryMemory(
      detail,
      chapters,
      'ch-6',
      '陆照雪在旧书店想起母亲遗书',
      memory,
      8,
    )
    expect(hits.some((hit) => hit.text.includes('遗书'))).toBe(true)
    const sections = buildMemoryContextSections({
      detail,
      chapters,
      chapter: chapters[5],
      focusText: '陆照雪在旧书店想起母亲遗书',
      memory,
    })
    expect(sections.join('\n')).toContain('当前卷记忆')
    expect(sections.join('\n')).toContain('相关历史记忆')
    expect(sections.join('\n')).toContain('母亲遗书')
    expect(currentVolume(memory, chapters, 'ch-5')?.startIndex).toBe(0)
  })

  it('audits dead characters, knowledge leaks and repetition', () => {
    const { detail, chapters } = fixture()
    const memory = buildStoryMemory(detail, chapters)
    const issues = auditGeneratedText({
      text: '陆照雪站在旧书店里，顾长风说：“顾长风已经看过遗书。”\n陆照雪站在旧书店里，顾长风说：“顾长风已经看过遗书。”',
      baseContent: '陆照雪站在旧书店里，顾长风说：“顾长风已经看过遗书。”',
      detail,
      chapters,
      chapterId: 'ch-5',
      memory,
    })
    expect(issues.some((issue) => issue.type === 'dead-character')).toBe(true)
    expect(issues.some((issue) => issue.type === 'knowledge-leak')).toBe(true)
    expect(issues.some((issue) => issue.type === 'repetition')).toBe(true)
  })

  it('injects compiled volume and retrieval memory into writing context', () => {
    const { detail, chapters } = fixture()
    const chapter = chapters[5]
    const messages = buildGenerationMessages({
      work: SEED_WORKS[0],
      detail,
      chapters,
      chapter,
      baseContent: chapter.content,
      directive: '继续写陆照雪调查遗书的线索，提起旧书店。',
      prompts: [],
      reasoningEffort: 'auto',
    })
    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('当前卷记忆')
    expect(text).toContain('相关历史记忆')
    expect(text).toContain('母亲遗书')
  })

  it('feeds memory into AI continuity audit and builds repair preview prompt', () => {
    const { detail, chapters } = fixture()
    const memory = buildStoryMemory(detail, chapters)
    const chapter = chapters[4]
    const audit = buildContinuityAuditMessages({
      work: SEED_WORKS[0],
      detail,
      chapters,
      chapter,
      content: '陆照雪在旧书店听顾长风提到母亲遗书。',
      memory,
    })
    const auditText = audit.map((message) => message.content).join('\n')
    expect(auditText).toContain('当前有效事实')
    expect(auditText).toContain('认知矩阵')
    expect(auditText).toContain('剧情承诺')
    const repair = buildContinuityRepairMessages({
      work: SEED_WORKS[0],
      detail,
      chapters,
      chapter,
      content: '陆照雪在旧书店听顾长风提到母亲遗书。',
      memory,
      report: '有风险：陆照雪不应知道遗书被换过。',
    })
    const repairText = repair.map((message) => message.content).join('\n')
    expect(repairText).toContain('审查报告')
    expect(repairText).toContain('遗书被换过')
    expect(repairText).toContain('只改必要段落')
  })

  it('applies only unique paragraph repair edits', () => {
    const edits = parseParagraphRepairEdits(
      '{"edits":[{"quote":"陆照雪知道遗书被换过。","replacement":"陆照雪怀疑遗书有问题。","reason":"认知越界"}]}',
    )
    expect(edits).toHaveLength(1)
    const applied = applyParagraphRepairEdits(
      '陆照雪知道遗书被换过。\n她走进旧书店。',
      edits,
    )
    expect(applied.applied).toBe(1)
    expect(applied.text).toContain('陆照雪怀疑遗书有问题')
    const duplicate = applyParagraphRepairEdits(
      '陆照雪知道遗书被换过。\n陆照雪知道遗书被换过。',
      edits,
    )
    expect(duplicate.applied).toBe(0)
    expect(duplicate.rejected).toBe(1)
  })
})
