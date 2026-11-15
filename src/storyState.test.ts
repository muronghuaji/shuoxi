import { describe, expect, it } from 'vitest'
import { applyStoryStateUpdate, parseStoryStateUpdate, rollbackStoryState } from './storyState'
import { buildStateUpdateMessages } from './ai'
import type { WorkDetail } from './types'

function baseDetail(): WorkDetail {
  return {
    worldview: '',
    style: { tone: [], pace: '中', dialogue: '中', description: '适中', taboos: '', notes: '' },
    characters: [
      {
        id: 'c1',
        name: '陆照雪',
        role: '主角',
        identity: '外门弟子',
        personality: '',
        goal: '',
        status: '正常',
        weapons: ['照雪剑'],
        currency: '十枚灵石',
      },
    ],
    factions: [],
    relationships: [],
    foreshadowings: [
      { id: 'f1', title: '旧案', status: '未回收', plantedIn: '第一章', note: '' },
    ],
    analysis: '',
  }
}

describe('storyState', () => {
  it('parses and applies state changes', () => {
    const parsed = parseStoryStateUpdate(
      JSON.stringify({
        summary: '陆照雪受伤，照雪剑断裂。',
        changes: [
          { entityType: 'character', entityId: 'c1', field: 'status', action: 'set', value: '重伤' },
          { entityType: 'character', entityId: 'c1', field: 'weapons', action: 'add', value: '断剑' },
          { entityType: 'foreshadowing', entityId: 'f1', field: 'status', action: 'set', value: '已回收' },
        ],
      }),
    )
    expect(parsed).not.toBeNull()
    const applied = applyStoryStateUpdate(baseDetail(), parsed!, 'ch1', '第一章')
    expect(applied.detail.characters[0].status).toBe('重伤')
    expect(applied.detail.characters[0].weapons).toContain('断剑')
    expect(applied.detail.foreshadowings[0].status).toBe('已回收')
    expect(applied.detail.currentSummary).toContain('照雪')
    expect(applied.detail.storyStateEvents).toHaveLength(1)
  })

  it('applies dynamic character state and parses consistency issues', () => {
    const parsed = parseStoryStateUpdate(
      JSON.stringify({
        summary: '陆照雪从试剑台退回柴房。',
        changes: [
          { entityType: 'character', entityId: 'c1', field: 'mood', action: 'set', value: '强撑冷静' },
          { entityType: 'character', entityId: 'c1', field: 'injuries', action: 'set', value: '左肩剑伤' },
          { entityType: 'character', entityId: 'c1', field: 'location', action: 'set', value: '柴房' },
        ],
        characterIssues: [
          {
            characterName: '陆照雪',
            type: 'knowledge',
            quote: '“我早知道剑匣里是空的。”',
            reason: '认知边界里只写了她不知道剑匣被调换。',
            severity: 'high',
          },
        ],
      }),
    )
    expect(parsed).not.toBeNull()
    const applied = applyStoryStateUpdate(baseDetail(), parsed!, 'ch1', '第一章')
    const character = applied.detail.characters[0]
    expect(character.profile?.dynamic.mood).toBe('强撑冷静')
    expect(character.profile?.dynamic.injuries).toBe('左肩剑伤')
    expect(character.profile?.dynamic.location).toBe('柴房')
    expect(applied.event.characterIssues).toHaveLength(1)
    expect(applied.event.characterIssues?.[0].type).toBe('knowledge')
    expect(applied.detail.characterStateTimeline).toHaveLength(1)
    expect(applied.detail.characterStateTimeline?.[0].characterId).toBe('c1')
    expect(applied.detail.characterStateTimeline?.[0].changes).toEqual([
      { field: 'mood', from: '', to: '强撑冷静' },
      { field: 'injuries', from: '', to: '左肩剑伤' },
      { field: 'location', from: '', to: '柴房' },
    ])
  })

  it('applies faction dynamic state, timeline and faction issues', () => {
    const detail = baseDetail()
    detail.factions = [
      {
        id: 'f1',
        name: '青崖剑宗',
        type: '宗门',
        leader: '顾长风',
        goal: '',
        description: '',
      },
    ]
    const parsed = parseStoryStateUpdate(
      JSON.stringify({
        summary: '青崖剑宗议事。',
        changes: [
          {
            entityType: 'faction',
            entityId: 'f1',
            field: 'morale',
            action: 'set',
            value: '低落',
          },
          {
            entityType: 'faction',
            entityId: 'f1',
            field: 'internalStruggle',
            action: 'set',
            value: '执法堂夺权',
          },
        ],
        factionIssues: [
          {
            factionName: '青崖剑宗',
            type: 'resources',
            quote: '“调动三千灵石。”',
            reason: '当前财政无法调动三千灵石。',
            severity: 'high',
          },
        ],
      }),
    )
    expect(parsed).not.toBeNull()
    const applied = applyStoryStateUpdate(detail, parsed!, 'ch1', '第一章')
    const faction = applied.detail.factions[0]
    expect(faction.profile?.dynamic.morale).toBe('低落')
    expect(faction.profile?.dynamic.internalStruggle).toBe('执法堂夺权')
    expect(applied.event.factionIssues).toHaveLength(1)
    expect(applied.detail.factionStateTimeline).toHaveLength(1)
    expect(applied.detail.factionStateTimeline?.[0].changes).toHaveLength(2)
    expect(applied.detail.factionStateTimeline?.[0].factionName).toBe('青崖剑宗')
    const rolledBack = rollbackStoryState(applied.detail, applied.snapshot.id)
    expect(rolledBack?.factionStateTimeline).toHaveLength(0)
    expect(rolledBack?.factions[0].profile?.dynamic.morale).toBeUndefined()

    const marked: WorkDetail = {
      ...applied.detail,
      storyStateEvents: (applied.detail.storyStateEvents ?? []).map((event) => ({
        ...event,
        factionIssues: event.factionIssues?.map((issue) => ({
          ...issue,
          dismissed: true,
        })),
      })),
    }
    const repeated = parseStoryStateUpdate(
      JSON.stringify({
        summary: '又一次议事。',
        factionIssues: [
          {
            factionName: '青崖剑宗',
            type: 'resources',
            quote: '“调动三千灵石。”',
            reason: '同一个误报。',
            severity: 'high',
          },
        ],
      }),
    )!
    const second = applyStoryStateUpdate(marked, repeated, 'ch2', '第二章')
    expect(second.event.factionIssues).toHaveLength(0)
    const messages = buildStateUpdateMessages({
      work: {
        id: 'w1',
        title: '照雪问剑',
        synopsis: '',
        theme: '',
        genres: ['悬疑'],
        outlineMode: 'fine',
        perspective: 'third-limited',
        characterCount: 1,
        targetWords: 100000,
        promptIds: [],
        status: '连载中',
        chapters: 2,
        words: 100,
        updatedAt: 1,
        coverIndex: 0,
      },
      detail: marked,
      chapter: { id: 'ch2', title: '第二章', content: '正文', updatedAt: 1 },
      content: '正文',
    })
    expect(messages.map((message) => message.content).join('\n')).toContain(
      '已豁免的势力一致性提示',
    )
  })

  it('filters issues the author dismissed and tells the model to skip them', () => {    const firstParsed = parseStoryStateUpdate(
      JSON.stringify({
        summary: '林夏说漏嘴。',
        characterIssues: [
          {
            characterName: '陆照雪',
            type: 'knowledge',
            quote: '“我早知道剑匣里是空的。”',
            reason: '认知边界里不知道剑匣被调换。',
            severity: 'high',
          },
        ],
      }),
    )
    const first = applyStoryStateUpdate(baseDetail(), firstParsed!, 'ch1', '第一章')
    const event = first.detail.storyStateEvents?.[0]
    expect(event?.characterIssues).toHaveLength(1)
    const marked: WorkDetail = {
      ...first.detail,
      storyStateEvents: (first.detail.storyStateEvents ?? []).map((item) =>
        item.id === event?.id
          ? {
              ...item,
              characterIssues: item.characterIssues?.map((issue) => ({
                ...issue,
                dismissed: true,
                dismissedAt: new Date().toISOString(),
              })),
            }
          : item,
      ),
    }
    const repeated = parseStoryStateUpdate(
      JSON.stringify({
        summary: '又一次提到剑匣。',
        characterIssues: [
          {
            characterName: '陆照雪',
            type: 'knowledge',
            quote: '“我早知道剑匣里是空的。”',
            reason: '同一个误报。',
            severity: 'high',
          },
        ],
      }),
    )
    const second = applyStoryStateUpdate(marked, repeated!, 'ch2', '第二章')
    expect(second.event.characterIssues).toHaveLength(0)
    const messages = buildStateUpdateMessages({
      work: {
        id: 'w1',
        title: '照雪问剑',
        synopsis: '',
        theme: '',
        genres: ['悬疑'],
        outlineMode: 'fine',
        perspective: 'third-limited',
        characterCount: 1,
        targetWords: 100000,
        promptIds: [],
        status: '连载中',
        chapters: 2,
        words: 100,
        updatedAt: 1,
        coverIndex: 0,
      },
      detail: marked,
      chapter: { id: 'ch2', title: '第二章', content: '正文', updatedAt: 1 },
      content: '正文',
    })
    expect(messages.map((message) => message.content).join('\n')).toContain(
      '已豁免的角色一致性提示',
    )
  })

  it('parses events and open threads', () => {
    const parsed = parseStoryStateUpdate(
      JSON.stringify({
        summary: '试剑台一战结束。',
        events: [
          {
            title: '照雪剑断裂',
            summary: '裴无咎一剑压断照雪剑。',
            participants: ['陆照雪', '裴无咎'],
            location: '试剑台',
            cause: '境界差距',
            result: '陆照雪重伤',
            consequences: ['照雪剑不能再使用', '陆照雪需要新的剑'],
            importance: 'high',
            status: 'canon',
          },
        ],
        openThreads: ['照雪剑需要修复或替换'],
        changes: [],
      }),
    )
    expect(parsed).not.toBeNull()
    expect(parsed!.events).toHaveLength(1)
    expect(parsed!.events[0].importance).toBe('high')
    const applied = applyStoryStateUpdate(baseDetail(), parsed!, 'ch1', '第一章')
    expect(applied.event.events).toHaveLength(1)
    expect(applied.event.openThreads).toContain('照雪剑需要修复或替换')
  })

  it('maintains global story threads across chapters', () => {
    const first = parseStoryStateUpdate(
      JSON.stringify({
        summary: '发现旧令牌。',
        openThreads: ['追查旧令牌来源'],
        changes: [],
      }),
    )
    const appliedFirst = applyStoryStateUpdate(baseDetail(), first!, 'ch1', '第一章')
    expect(appliedFirst.detail.storyThreads).toHaveLength(1)
    expect(appliedFirst.detail.chapterMemories?.[0].summary).toContain('旧令牌')
    expect(appliedFirst.detail.chapterMemories?.[0].openThreads).toContain('追查旧令牌来源')
    expect(appliedFirst.detail.storyThreads?.[0].status).toBe('open')

    const second = parseStoryStateUpdate(
      JSON.stringify({
        summary: '旧令牌来源查清，但引出新问题。',
        openThreads: ['寻找旧案卷宗'],
        resolvedThreads: ['追查旧令牌来源'],
        changes: [],
      }),
    )
    const appliedSecond = applyStoryStateUpdate(
      appliedFirst.detail,
      second!,
      'ch2',
      '第二章',
    )
    const threads = appliedSecond.detail.storyThreads ?? []
    expect(threads.find((thread) => thread.text === '追查旧令牌来源')?.status).toBe('resolved')
    expect(threads.find((thread) => thread.text === '寻找旧案卷宗')?.status).toBe('open')
  })

  it('applies relationship, system and module changes', () => {
    const detail = baseDetail()
    detail.relationships = [
      { id: 'r1', fromId: 'c1', toId: 'c2', type: '盟友', note: '旧识' },
    ]
    detail.system = {
      enabled: true,
      name: '长生系统',
      type: '任务',
      visibility: '仅宿主',
      tone: '',
      personality: '',
      rules: '',
      currencyName: '积分',
      balance: 10,
      tasks: [],
      rewards: [],
      logs: [],
    }
    detail.moduleData = {
      'module-test': [
        {
          id: 'm1',
          title: '旧案',
          summary: '',
          status: '进行中',
          fields: { clue: '半页剑谱' },
          createdAt: '',
        },
      ],
    }
    const parsed = parseStoryStateUpdate(
      JSON.stringify({
        summary: '关系、积分与模块都发生变化。',
        changes: [
          { entityType: 'relationship', entityId: 'r1', field: 'type', action: 'set', value: '宿敌' },
          { entityType: 'system', entityId: 'system', field: 'balance', action: 'add', value: '25' },
          { entityType: 'module', entityId: 'm1', field: 'status', action: 'set', value: '已破解' },
          { entityType: 'module', entityId: 'm1', field: 'fields.clue', action: 'set', value: '完整剑谱' },
        ],
      }),
    )
    expect(parsed).not.toBeNull()
    const applied = applyStoryStateUpdate(detail, parsed!, 'ch1', '第一章')
    expect(applied.detail.relationships[0].type).toBe('宿敌')
    expect(applied.detail.system?.balance).toBe(35)
    expect(applied.detail.moduleData?.['module-test'][0].status).toBe('已破解')
    expect(applied.detail.moduleData?.['module-test'][0].fields.clue).toBe('完整剑谱')
    expect(applied.event.changes).toHaveLength(4)
  })

  it('creates new characters, factions, locations, foreshadowings and relationships', () => {
    const detail = baseDetail()
    const parsed = parseStoryStateUpdate(
      JSON.stringify({
        summary: '新人物与新宗门出现。',
        newEntities: [
          { entityType: 'faction', id: 'new-f1', name: '太玄剑宗', type: '宗门', leader: '顾长风' },
          { entityType: 'character', id: 'new-c1', name: '陆青崖', role: '主角', identity: '外门弟子', sectId: 'new-f1' },
          { entityType: 'character', id: 'new-c2', name: '沈照雪', role: '配角', identity: '照雪峰弟子' },
          { entityType: 'location', id: 'new-l1', name: '试剑台', type: '宗门', factionId: 'new-f1' },
          { entityType: 'foreshadowing', id: 'new-fs1', title: '三百年前旧案', plantedIn: '第一章' },
          { entityType: 'relationship', id: 'new-r1', fromId: 'new-c1', toId: 'new-c2', relationType: '同门' },
        ],
        changes: [
          { entityType: 'character', entityId: 'new-c1', field: 'status', action: 'set', value: '受伤' },
        ],
      }),
    )
    expect(parsed).not.toBeNull()
    const applied = applyStoryStateUpdate(detail, parsed!, 'ch1', '第一章')
    const lu = applied.detail.characters.find((character) => character.name === '陆青崖')
    const sect = applied.detail.factions.find((faction) => faction.name === '太玄剑宗')
    expect(lu).toBeTruthy()
    expect(lu?.status).toBe('受伤')
    expect(lu?.sectId).toBe(sect?.id)
    expect(applied.detail.locations?.some((location) => location.name === '试剑台')).toBe(true)
    expect(applied.detail.foreshadowings.some((item) => item.title === '三百年前旧案')).toBe(true)
    expect(applied.detail.relationships.some((item) => item.type === '同门')).toBe(true)
    expect(applied.event.newEntities).toHaveLength(6)
  })

  it('rolls back dynamic state and events', () => {
    const parsed = parseStoryStateUpdate(
      JSON.stringify({
        summary: '状态变化',
        changes: [
          { entityType: 'character', entityId: 'c1', field: 'status', action: 'set', value: '重伤' },
        ],
      }),
    )!
    const applied = applyStoryStateUpdate(baseDetail(), parsed, 'ch1', '第一章')
    const restored = rollbackStoryState(applied.detail, applied.snapshot.id)
    expect(restored).not.toBeNull()
    expect(restored!.characters[0].status).toBe('正常')
    expect(restored!.storyStateEvents).toHaveLength(0)
    expect(restored!.storyStateSnapshots).toHaveLength(0)
  })

  it('rolls back the dynamic state timeline', () => {
    const parsed = parseStoryStateUpdate(
      JSON.stringify({
        summary: '角色位置变化。',
        changes: [
          { entityType: 'character', entityId: 'c1', field: 'location', action: 'set', value: '柴房' },
        ],
      }),
    )!
    const applied = applyStoryStateUpdate(baseDetail(), parsed, 'ch1', '第一章')
    expect(applied.detail.characterStateTimeline).toHaveLength(1)
    const restored = rollbackStoryState(applied.detail, applied.snapshot.id)
    expect(restored?.characterStateTimeline).toHaveLength(0)
    expect(restored?.characters[0].profile?.dynamic.location).toBeUndefined()
  })

  it('rejects malformed updates', () => {
    expect(parseStoryStateUpdate('not json')).toBeNull()
    expect(parseStoryStateUpdate('{"foo":1}')).toBeNull()
  })
})
