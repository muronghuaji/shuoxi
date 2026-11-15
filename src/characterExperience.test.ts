import { describe, expect, it } from 'vitest'
import { createEmptyDetail, SEED_CHAPTERS, SEED_WORKS } from './data'
import { emptyCharacterProfile } from './characterProfile'
import type { CharacterExperience, StoryStateEvent } from './types'
import {
  appendCharacterExperiences,
  deriveExperiencesFromEvents,
  formatCharacterExperiencePrompt,
  normalizeCharacterExperience,
  selectRelevantCharacterExperiences,
  sortCharacterExperiences,
} from './characterExperience'
import { applyStoryStateUpdate, parseStoryStateUpdate, rollbackStoryState } from './storyState'
import { buildGenerationMessages, buildStateUpdateMessages } from './ai'

const work = SEED_WORKS[0]
const chapters = SEED_CHAPTERS[work.id].slice(0, 8)

function makeExperience(overrides: Partial<CharacterExperience>): CharacterExperience {
  return {
    ...normalizeCharacterExperience({
      title: '雪夜拾剑',
      summary: '在藏锋堂外捡到半页剑典。',
      knowledgeScope: '亲身经历',
      importance: 'major',
      ...overrides,
    })!,
    ...overrides,
  }
}

function fixture() {
  const detail = createEmptyDetail()
  detail.characters = [
    {
      id: 'c1',
      name: '陆照雪',
      role: '主角',
      identity: '剑修',
      personality: '克制',
      goal: '查清旧案',
      profile: {
        ...emptyCharacterProfile(),
        knowledge: {
          ...emptyCharacterProfile().knowledge,
          knows: ['宗门有人在找她'],
          believes: ['顾长风仍在隐瞒'],
          blindSpots: ['母亲遗书被换过'],
        },
      },
      experiences: [
        makeExperience({
          chapterId: chapters[0].id,
          title: '雪夜拾剑',
          summary: '在藏锋堂外捡到半页剑典。',
          learned: ['宗门里有人在找她'],
        }),
        makeExperience({
          chapterId: chapters[2].id,
          title: '试剑台受伤',
          summary: '败给裴无咎，左肩受伤。',
          importance: 'core',
          injuries: '左肩受伤',
        }),
        makeExperience({
          chapterId: chapters[6].id,
          title: '未来经历',
          summary: '这条经历发生在当前章之后。',
        }),
        makeExperience({
          chapterId: chapters[1].id,
          title: '已撤回经历',
          summary: '这条经历不应出现在上下文里。',
          status: 'retconned',
        }),
      ],
    },
  ]
  return detail
}

describe('character experiences', () => {
  it('normalizes, deduplicates and sorts experiences', () => {
    const normalized = normalizeCharacterExperience({
      title: '后山密谈',
      summary: '听到密谈，但没有完全听懂。',
      knowledgeScope: '听别人说',
      learned: ['顾长风知道遗书'],
      importance: 'core',
    })
    expect(normalized?.knowledgeScope).toBe('听别人说')
    expect(normalized?.learned).toContain('顾长风知道遗书')
    const first = makeExperience({ chapterId: chapters[0].id, title: 'A', summary: 'A' })
    const second = makeExperience({ chapterId: chapters[1].id, title: 'B', summary: 'B' })
    const merged = appendCharacterExperiences([second], [first, first], chapters)
    expect(merged.experiences.map((item) => item.title)).toEqual(['A', 'B'])
    expect(merged.added).toBe(1)
    expect(sortCharacterExperiences([second, first], chapters).map((item) => item.title)).toEqual([
      'A',
      'B',
    ])
  })

  it('selects relevant past experiences and excludes future or retconned ones', () => {
    const detail = fixture()
    const character = detail.characters[0]
    const selected = selectRelevantCharacterExperiences(
      character,
      chapters,
      chapters[5].id,
      '陆照雪在试剑台想起左肩的伤',
      8,
    )
    expect(selected.map((item) => item.title)).toContain('试剑台受伤')
    expect(selected.map((item) => item.title)).toContain('雪夜拾剑')
    expect(selected.map((item) => item.title)).not.toContain('未来经历')
    expect(selected.map((item) => item.title)).not.toContain('已撤回经历')
  })

  it('builds experience and knowledge boundary for the writing prompt', () => {
    const detail = fixture()
    const character = detail.characters[0]
    const text = formatCharacterExperiencePrompt(
      character,
      chapters,
      chapters[5].id,
      '陆照雪在试剑台',
    )
    expect(text).toContain('个人经历与认知边界')
    expect(text).toContain('试剑台受伤')
    expect(text).toContain('左肩受伤')
    expect(text).toContain('宗门有人在找她')
    expect(text).toContain('母亲遗书被换过')
    expect(text).not.toContain('未来经历')
  })

  it('injects experiences and the non-omniscience rule into writing context', () => {
    const detail = fixture()
    const chapter = {
      ...chapters[5],
      content: '陆照雪在试剑台按住左肩，想起雪夜拾剑。',
    }
    const messages = buildGenerationMessages({
      work,
      detail,
      chapters: [chapter],
      chapter,
      baseContent: chapter.content,
      directive: '写陆照雪在试剑台的戏',
      prompts: [],
      reasoningEffort: 'auto',
    })
    const system = messages.find((message) => message.role === 'system')?.content ?? ''
    const user = messages.find((message) => message.role === 'user')?.content ?? ''
    expect(system).toContain('个人经历与认知边界')
    expect(user).toContain('试剑台受伤')
    expect(user).toContain('母亲遗书被换过')
  })

  it('backfills experiences from event book entries', () => {
    const detail = fixture()
    detail.characters[0].experiences = []
    const event: StoryStateEvent = {
      id: 'evt-1',
      chapterId: chapters[1].id,
      chapterTitle: chapters[1].title,
      createdAt: new Date().toISOString(),
      summary: '第2章事件',
      changes: [],
      events: [
        {
          id: 'se-1',
          title: '后山密谈',
          summary: '听到顾长风与沈玄清密谈。',
          participants: ['陆照雪', '顾长风'],
          location: '后山',
          cause: '',
          result: '',
          consequences: [],
          importance: 'high',
          status: 'canon',
        },
      ],
    }
    detail.storyStateEvents = [event]
    const derived = deriveExperiencesFromEvents(detail, detail.characters[0], chapters)
    expect(derived).toHaveLength(1)
    expect(derived[0].title).toBe('后山密谈')
    expect(derived[0].eventId).toBe('evt-1')
    expect(derived[0].chapterId).toBe(chapters[1].id)
    expect(derived[0].importance).toBe('core')
  })

  it('injects existing experiences into the sync prompt for dedupe', () => {
    const detail = fixture()
    const chapter = chapters[5]
    const messages = buildStateUpdateMessages({
      work,
      detail,
      chapter,
      chapters,
      content: '陆照雪在试剑台按住左肩。',
      reasoningEffort: 'auto',
    })
    const user = messages.find((message) => message.role === 'user')?.content ?? ''
    expect(user).toContain('核心角色已有经历')
    expect(user).toContain('雪夜拾剑')
    expect(user).toContain('试剑台受伤')
    expect(user).not.toContain('未来经历')
  })

  it('applies sync experiences with dedupe and updates knowledge', () => {
    const detail = fixture()
    detail.characters[0].experiences = []
    const payload = {
      summary: '测试',
      events: [],
      openThreads: [],
      resolvedThreads: [],
      newEntities: [],
      characterIssues: [],
      factionIssues: [],
      changes: [],
      characterExperiences: [
        {
          characterId: 'c1',
          characterName: '陆照雪',
          chapterId: chapters[1].id,
          title: '藏锋堂认剑',
          summary: '在藏锋堂认出母亲留下的剑痕。',
          knowledgeScope: '亲眼所见',
          learned: ['母亲曾来过藏锋堂'],
          relationshipChanges: [
            { targetName: '顾长风', type: '师徒', change: '开始怀疑他' },
          ],
          importance: 'major',
        },
      ],
    }
    const parsed = parseStoryStateUpdate(JSON.stringify(payload))
    expect(parsed?.characterExperiences).toHaveLength(1)
    const result = applyStoryStateUpdate(detail, parsed!, chapters[1].id, chapters[1].title)
    expect(result.experiences).toHaveLength(1)
    expect(result.detail.characters[0].experiences?.[0]?.title).toBe('藏锋堂认剑')
    expect(result.detail.characters[0].profile?.knowledge.knows).toContain('母亲曾来过藏锋堂')
    const rolledBack = rollbackStoryState(result.detail, result.snapshot.id)
    expect(rolledBack?.characters[0].experiences).toEqual([])
    const again = applyStoryStateUpdate(
      result.detail,
      parsed!,
      chapters[1].id,
      chapters[1].title,
    )
    expect(again.experiences).toHaveLength(0)
    expect(again.detail.characters[0].experiences).toHaveLength(1)
  })
})
