import { describe, expect, it } from 'vitest'
import { createEmptyDetail, SEED_CHAPTERS, SEED_WORKS } from './data'
import { emptyCharacterProfile } from './characterProfile'
import { emptyFactionProfile } from './factionProfile'
import { emptySpecies } from './species'
import { buildGenerationMessages, buildStateUpdateMessages } from './ai'
import { applyStoryStateUpdate, parseStoryStateUpdate, rollbackStoryState } from './storyState'

function fixture() {
  const detail = createEmptyDetail()
  detail.realmSchemes = [
    {
      id: 'realm',
      name: '修仙境界',
      levels: [
        { id: 'realm-1', name: '炼气', color: '#8b9bb4' },
        { id: 'realm-2', name: '筑基', color: '#76b58a' },
      ],
    },
  ]
  detail.activeRealmSchemeId = 'realm'
  detail.factionTierSchemeId = 'faction-tier'
  detail.tierSchemes = [
    {
      id: 'faction-tier',
      name: '势力层级',
      levels: [
        { id: 'faction-1', name: '三流', color: '#8b9bb4' },
        { id: 'faction-2', name: '一流', color: '#d8a45c' },
      ],
    },
    {
      id: 'item-tier',
      name: '法宝品阶',
      levels: [{ id: 'item-1', name: '三阶', color: '#b58ae0' }],
    },
    {
      id: 'species-tier',
      name: '物种阶位',
      levels: [{ id: 'species-1', name: '首领', color: '#d98ab5' }],
    },
  ]
  detail.itemCategories = [{ id: 'cat', name: '法宝', order: 0, tierSchemeId: 'item-tier' }]
  detail.speciesCategories = [{ id: 'sc', name: '灵兽', order: 0, tierSchemeId: 'species-tier' }]
  detail.items = [
    {
      id: 'i1',
      name: '照雪剑',
      categoryId: 'cat',
      grade: 1,
      description: '旧物品描述',
      notes: '旧物品备注',
    },
  ]
  detail.species = [
    {
      ...emptySpecies(),
      id: 's1',
      name: '雪鸾',
      category: '灵兽',
      categoryId: 'sc',
      tierLevel: 1,
      notes: '旧物种备注',
    },
  ]
  detail.characters = [
    {
      id: 'c1',
      name: '陆照雪',
      role: '主角',
      identity: '剑修',
      personality: '克制',
      goal: '查清旧案',
      speciesId: 's1',
      realmSchemeId: 'realm',
      realmLevel: 1,
      cultivation: '炼气一层',
      status: '已上线',
      profile: {
        ...emptyCharacterProfile(),
        coreContradiction: '旧的核心矛盾',
        surfacePersonality: '旧的外在性格',
        truePersonality: '旧的内在性格',
        dynamic: {
          ...emptyCharacterProfile().dynamic,
          mood: '旧的当前情绪',
        },
      },
    },
  ]
  detail.factions = [
    {
      id: 'f1',
      name: '太虚剑宗',
      type: '宗门',
      leader: '宗主',
      goal: '守山',
      description: '旧描述',
      tierLevel: 1,
      profile: {
        ...emptyFactionProfile(),
        coreContradiction: '旧的势力核心矛盾',
        publicFace: '旧的公开形象',
        trueFace: '旧的真实面目',
      },
      facilities: [
        {
          id: 'fac1',
          name: '藏锋堂',
          type: '殿堂',
          counts: { elder: 1, main: 2, inner: 3, outer: 4, menial: 5 },
          resources: [{ itemId: 'i1', quantity: 2 }],
        },
      ],
      warehouse: [{ itemId: 'i1', quantity: 7 }],
    },
  ]
  return detail
}

function updatePayload() {
  return {
    summary: '同步所有信息',
    events: [],
    openThreads: [],
    resolvedThreads: [],
    newEntities: [
      {
        entityType: 'item',
        id: 'new-i1',
        name: '新法器',
        categoryId: 'cat',
        grade: 1,
        description: '新物品',
      },
      {
        entityType: 'species',
        id: 'new-sp1',
        name: '新灵兽',
        type: '灵兽',
        categoryId: 'sc',
        description: '新物种',
      },
    ],
    characterIssues: [],
    factionIssues: [],
    changes: [
      {
        entityType: 'character',
        entityId: 'c1',
        field: 'profile',
        action: 'set',
        value: {
          coreContradiction: '新的核心矛盾',
          surfacePersonality: '新的外在性格',
          voice: { register: '新的说话方式' },
        },
      },
      {
        entityType: 'character',
        entityId: 'c1',
        field: 'realmLevel',
        action: 'set',
        value: 2,
      },
      {
        entityType: 'character',
        entityId: 'c1',
        field: 'mood',
        action: 'set',
        value: '新的当前情绪',
      },
      {
        entityType: 'faction',
        entityId: 'f1',
        field: 'profile',
        action: 'set',
        value: {
          publicFace: '新的公开形象',
          coreContradiction: '新的势力核心矛盾',
        },
      },
      {
        entityType: 'faction',
        entityId: 'f1',
        field: 'tierLevel',
        action: 'set',
        value: 2,
      },
      {
        entityType: 'faction',
        entityId: 'f1',
        field: 'facilities',
        action: 'set',
        value: [
          {
            id: 'fac1',
            name: '藏锋堂',
            type: '殿堂',
            counts: { elder: 2, main: 2, inner: 3, outer: 4, menial: 5 },
            resources: [{ itemId: 'new-i1', quantity: 9 }],
          },
        ],
      },
      {
        entityType: 'faction',
        entityId: 'f1',
        field: 'warehouse',
        action: 'set',
        value: [{ itemId: 'i1', quantity: 11 }],
      },
      {
        entityType: 'item',
        entityId: 'i1',
        field: 'grade',
        action: 'set',
        value: 1,
      },
      {
        entityType: 'item',
        entityId: 'i1',
        field: 'description',
        action: 'set',
        value: '新的物品描述',
      },
      {
        entityType: 'species',
        entityId: 's1',
        field: 'profile',
        action: 'set',
        value: { notes: '新的物种备注' },
      },
    ],
  }
}

describe('sync all information', () => {
  it('sends profiles, facilities, items and species into the sync prompt', () => {
    const detail = fixture()
    const work = SEED_WORKS[0]
    const chapter = { ...SEED_CHAPTERS[work.id][0], content: '陆照雪走进藏锋堂，看见太虚剑宗的人。' }
    const messages = buildStateUpdateMessages({
      work,
      detail,
      chapter,
      content: chapter.content,
      reasoningEffort: 'auto',
    })
    const system = messages.find((message) => message.role === 'system')?.content ?? ''
    const user = messages.find((message) => message.role === 'user')?.content ?? ''
    expect(system).toContain('facilities')
    expect(system).toContain('profile')
    expect(system).toContain('realmLevel')
    expect(system).toContain('species')
    expect(user).toContain('旧的核心矛盾')
    expect(user).toContain('藏锋堂')
    expect(user).toContain('照雪剑')
    expect(user).toContain('雪鸾')
  })

  it('applies structured profile, facilities, realm, item and species changes', () => {
    const detail = fixture()
    const work = SEED_WORKS[0]
    const chapter = SEED_CHAPTERS[work.id][0]
    const parsed = parseStoryStateUpdate(JSON.stringify(updatePayload()))
    expect(parsed).not.toBeNull()
    const result = applyStoryStateUpdate(detail, parsed!, chapter.id, chapter.title)
    const character = result.detail.characters.find((item) => item.id === 'c1')!
    const faction = result.detail.factions.find((item) => item.id === 'f1')!
    const item = result.detail.items?.find((entry) => entry.id === 'i1')!
    const species = result.detail.species?.find((entry) => entry.id === 's1')!

    expect(character.profile?.coreContradiction).toBe('新的核心矛盾')
    expect(character.profile?.surfacePersonality).toBe('新的外在性格')
    expect(character.profile?.voice.register).toBe('新的说话方式')
    expect(character.profile?.dynamic.mood).toBe('新的当前情绪')
    expect(character.realmLevel).toBe(2)
    expect(faction.profile?.publicFace).toBe('新的公开形象')
    expect(faction.profile?.coreContradiction).toBe('新的势力核心矛盾')
    expect(faction.tierLevel).toBe(2)
    expect(faction.facilities?.[0]?.counts?.elder).toBe(2)
    expect(faction.facilities?.[0]?.resources?.[0]?.quantity).toBe(9)
    const createdItem = result.detail.items?.find((entry) => entry.name === '新法器')
    expect(createdItem).toBeTruthy()
    expect(faction.facilities?.[0]?.resources?.[0]?.itemId).toBe(createdItem?.id)
    expect(faction.warehouse?.[0]?.quantity).toBe(11)
    expect(item.description).toBe('新的物品描述')
    expect(species.notes).toBe('新的物种备注')
    expect(result.detail.items?.some((entry) => entry.name === '新法器')).toBe(true)
    expect(result.detail.species?.some((entry) => entry.name === '新灵兽')).toBe(true)
    expect(result.event.changes.length).toBe(updatePayload().changes.length)
  })

  it('carries synced information into the next writing prompt', () => {
    const detail = fixture()
    const work = SEED_WORKS[0]
    const seedChapter = SEED_CHAPTERS[work.id][0]
    const parsed = parseStoryStateUpdate(JSON.stringify(updatePayload()))
    const result = applyStoryStateUpdate(detail, parsed!, seedChapter.id, seedChapter.title)
    const chapter = {
      ...seedChapter,
      content: '陆照雪走进藏锋堂，太虚剑宗的人正在清点照雪剑和雪鸾。',
    }
    const messages = buildGenerationMessages({
      work,
      detail: result.detail,
      chapters: [chapter],
      chapter,
      baseContent: chapter.content,
      directive: '继续写陆照雪在藏锋堂的戏',
      prompts: [],
      reasoningEffort: 'auto',
    })
    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('新的核心矛盾')
    expect(text).toContain('新的公开形象')
    expect(text).toContain('藏锋堂')
    expect(text).toContain('照雪剑')
    expect(text).toContain('雪鸾')
  })

  it('keeps item and species changes in the sync snapshot rollback', () => {
    const detail = fixture()
    const work = SEED_WORKS[0]
    const chapter = SEED_CHAPTERS[work.id][0]
    const parsed = parseStoryStateUpdate(JSON.stringify(updatePayload()))
    const result = applyStoryStateUpdate(detail, parsed!, chapter.id, chapter.title)
    const snapshotId = result.snapshot.id
    const rolledBack = rollbackStoryState(result.detail, snapshotId)
    expect(rolledBack?.items?.find((entry) => entry.id === 'i1')?.description).toBe('旧物品描述')
    expect(rolledBack?.species?.find((entry) => entry.id === 's1')?.notes).toBe('旧物种备注')
  })
})
