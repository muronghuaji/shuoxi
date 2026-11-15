import { describe, expect, it } from 'vitest'
import type { FactionCard, WorkDetail } from './types'
import { createEmptyDetail } from './data'
import {
  buildFactionProfilePrompt,
  emptyFactionProfile,
  factionHierarchyLabels,
  factionMemberRecords,
  factionProfileCompleteness,
  factionQuickLine,
  normalizeFactionProfile,
  selectFocusFactions,
} from './factionProfile'
import { buildEntityGenerateMessages, buildGenerationMessages } from './ai'

function faction(
  id: string,
  name: string,
  profile = emptyFactionProfile(),
): FactionCard {
  return {
    id,
    name,
    type: '宗门',
    leader: '顾长风',
    goal: '守住旧案',
    description: '太玄山剑宗。',
    profile,
  }
}

function detailWith(factions: FactionCard[], characters: WorkDetail['characters'] = []): WorkDetail {
  const detail = createEmptyDetail()
  detail.factions = factions
  detail.characters = characters
  return detail
}

describe('faction profile', () => {
  it('normalizes missing and malformed profiles', () => {
    const profile = normalizeFactionProfile(undefined)
    expect(profile.governance.internalGroups).toEqual([])
    expect(profile.meta.importance).toBe('major')
    const malformed = normalizeFactionProfile({
      publicFace: '名门正派',
      governance: {
        decisionProcess: '长老会三票',
        internalGroups: [{ name: '守旧派', goal: '维持旧规' }, { goal: '没有名字' }],
      },
      relations: [{ targetId: 'f2', targetType: 'faction', publicStance: '盟友' }],
      meta: { importance: 'core', role: 'antagonist' },
    })
    expect(malformed.publicFace).toBe('名门正派')
    expect(malformed.governance.decisionProcess).toBe('长老会三票')
    expect(malformed.governance.internalGroups).toHaveLength(1)
    expect(malformed.relations[0].targetId).toBe('f2')
    expect(malformed.meta.role).toBe('antagonist')
  })

  it('scores filled profiles and builds a collective prompt', () => {
    const profile = emptyFactionProfile()
    profile.publicFace = '名门正派'
    profile.trueFace = '靠旧案起家'
    profile.coreContradiction = '靠规矩维持秩序，但规矩本身是假的'
    profile.governance.decisionProcess = '长老会三票通过'
    profile.governance.internalGroups = [
      { id: 'g1', name: '守旧派', goal: '维持旧规', stance: '反对改革', power: '强', secret: '' },
    ]
    profile.behavior.threatResponse = '先谈判，再联合第三方'
    profile.behavior.crisis = '牺牲外围保住核心'
    profile.culture.slogans = ['剑宗不跪。']
    profile.resources.bottlenecks = ['缺少丹药']
    profile.knowledge.hides = ['掌门与旧案有关']
    profile.relations = [
      {
        targetType: 'faction',
        targetId: 'f2',
        publicStance: '盟友',
        trueStance: '等待对方内乱',
        secretDeal: '已策反一名长老',
        history: '',
        tension: '边境摩擦',
      },
    ]
    profile.dynamic.currentOperation = '封锁旧案卷宗'
    const f = faction('f1', '青崖剑宗', profile)
    const other = faction('f2', '太玄剑宗')
    const detail = detailWith([f, other])
    expect(factionProfileCompleteness(profile).score).toBeGreaterThan(50)
    const prompt = buildFactionProfilePrompt(f, { mode: 'writing', detail, chapterNumber: 2 })
    expect(prompt).toContain('公开形象：名门正派')
    expect(prompt).toContain('核心矛盾：靠规矩维持秩序，但规矩本身是假的')
    expect(prompt).toContain('长老会三票通过')
    expect(prompt).toContain('守旧派')
    expect(prompt).toContain('先谈判，再联合第三方')
    expect(prompt).toContain('剑宗不跪')
    expect(prompt).toContain('缺少丹药')
    expect(prompt).toContain('太玄剑宗')
    expect(prompt).toContain('势力是集体，不是一个人')
  })

  it('derives members from character factions and extra memberships', () => {
    const f = faction('f1', '青崖剑宗')
    const detail = detailWith([f], [
      {
        id: 'c1',
        name: '陆照雪',
        role: '主角',
        identity: '外门弟子',
        personality: '',
        goal: '',
        sectId: 'f1',
        position: '外门弟子',
        status: '正常',
      },
      {
        id: 'c2',
        name: '沈玄清',
        role: '掌门',
        identity: '',
        personality: '',
        goal: '',
      },
    ])
    detail.factionMemberships = [
      {
        id: 'm1',
        factionId: 'f1',
        characterId: 'c2',
        role: '秘密供奉',
        publicRole: '散修',
        secret: true,
        loyalty: '中',
        status: '正常',
      },
    ]
    const members = factionMemberRecords(detail, f)
    expect(members.find((member) => member.character.id === 'c1')?.derived).toBe(true)
    expect(members.find((member) => member.character.id === 'c2')?.secret).toBe(true)
    expect(factionQuickLine(f)).toContain('青崖剑宗')
  })

  it('selects mentioned and character-affiliated factions', () => {
    const f1 = faction('f1', '青崖剑宗')
    const f2 = faction('f2', '太玄剑宗')
    const f3 = faction('f3', '第三个势力')
    const detail = detailWith([f1, f2, f3], [
      {
        id: 'c1',
        name: '陆照雪',
        role: '主角',
        identity: '',
        personality: '',
        goal: '',
        sectId: 'f2',
      },
    ])
    const focus = selectFocusFactions(detail, '陆照雪站在太玄剑宗山门前。')
    expect(focus.some((item) => item.id === 'f2')).toBe(true)
    expect(focus.length).toBeLessThanOrEqual(3)
  })

  it('adapts hierarchy labels by genre', () => {
    expect(factionHierarchyLabels({ id: 'xianxia' } as never).elderGroup).toBe('长老会')
    expect(factionHierarchyLabels({ id: 'urban' } as never).elderGroup).toBe('董事会')
    expect(factionHierarchyLabels({ id: 'scifi' } as never).unitGroup).toContain('舰队')
    expect(factionHierarchyLabels({ id: 'generic' } as never).inner).toBe('正式成员')
  })

  it('puts faction behavior into writing context and requests a generated faction profile', () => {    const profile = emptyFactionProfile()
    profile.publicFace = '名门正派'
    profile.coreContradiction = '规矩是假的'
    profile.governance.decisionProcess = '长老会三票'
    const f = faction('f1', '青崖剑宗', profile)
    const work: WorkDetail['characters'] = []
    const detail = detailWith([f], work)
    const messages = buildGenerationMessages({
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
        chapters: 1,
        words: 0,
        updatedAt: 1,
        coverIndex: 0,
      },
      detail,
      chapters: [
        { id: 'ch1', title: '第一章', content: '', updatedAt: 1, status: 'writing', titleSource: 'manual' },
      ],
      chapter: { id: 'ch1', title: '第一章', content: '', updatedAt: 1, status: 'writing', titleSource: 'manual' },
      baseContent: '',
      directive: '青崖剑宗召开长老会。',
      prompts: [],
    })
    expect(messages.map((message) => message.content).join('\n')).toContain('青崖剑宗')
    const factionMessages = buildEntityGenerateMessages({ kind: 'faction', work: {
      id: 'w1', title: '照雪问剑', synopsis: '', theme: '', genres: ['悬疑'],
      outlineMode: 'fine', perspective: 'third-limited', characterCount: 1, targetWords: 100000,
      promptIds: [], status: '连载中', chapters: 1, words: 0, updatedAt: 1, coverIndex: 0,
    }, detail })
    const content = factionMessages.map((message) => message.content).join('\n')
    expect(content).toContain('"profile"')
    expect(content).toContain('governance')
    expect(content).toContain('behavior')
    expect(content).toContain('publicFace')
    expect(content).toContain('名册必须具体')
    expect(content).toContain('"items"')
  })
})
