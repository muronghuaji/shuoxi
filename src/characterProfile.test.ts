import { describe, expect, it } from 'vitest'
import type { CharacterCard, CharacterProfile, Chapter, Work, WorkDetail } from './types'
import { createEmptyDetail } from './data'
import { buildEntityGenerateMessages, buildGenerationMessages } from './ai'
import {
  buildCharacterProfilePrompt,
  characterQuickLine,
  emptyCharacterProfile,
  extractVoiceSamples,
  normalizeCharacterProfile,
  profileCompleteness,
  selectFocusCharacters,
} from './characterProfile'

function character(id: string, name: string, profile?: Partial<CharacterProfile>): CharacterCard {
  return {
    id,
    name,
    role: '配角',
    identity: '外门弟子',
    personality: '安静',
    goal: '',
    profile: profile ? { ...emptyCharacterProfile(), ...profile } : undefined,
  }
}

function detailWith(characters: CharacterCard[]): WorkDetail {
  const detail = createEmptyDetail()
  detail.characters = characters
  return detail
}

describe('character profile', () => {
  it('normalizes missing profile into a complete empty shape', () => {
    const profile = normalizeCharacterProfile(undefined)
    expect(profile.voice.samples).toEqual([])
    expect(profile.meta.importance).toBe('major')
    expect(profile.dynamic).toBeDefined()
  })

  it('normalizes nested fields and clamps invalid values', () => {
    const profile = normalizeCharacterProfile({
      aliases: ['阿雪', '', 3],
      coreContradiction: '想被理解，但绝不解释',
      voice: { samples: ['“行。”', '“随你。”'], register: '冷淡' },
      knowledge: { knows: ['剑匣少半页'] },
      meta: { importance: 'core', pov: true },
    })
    expect(profile.aliases).toEqual(['阿雪'])
    expect(profile.voice.samples).toHaveLength(2)
    expect(profile.knowledge.knows).toEqual(['剑匣少半页'])
    expect(profile.meta.importance).toBe('core')
    expect(profile.meta.pov).toBe(true)
  })

  it('scores a filled profile higher than an empty one', () => {
    const empty = emptyCharacterProfile()
    const filled: CharacterProfile = {
      ...empty,
      coreContradiction: '想被理解，但绝不解释',
      surfacePersonality: '表面冷静',
      values: ['承诺'],
      fears: ['被抛下'],
      voice: { ...empty.voice, register: '短句', samples: ['“行。”'], neverSays: ['相信我'] },
      behavior: { ...empty.behavior, habits: ['看出口'], nervousTells: ['摸袖口'] },
      preferences: { ...empty.preferences, likes: ['雨'] },
      knowledge: { ...empty.knowledge, knows: ['旧案'] },
      dynamic: { ...empty.dynamic, mood: '警惕' },
    }
    expect(profileCompleteness(filled).score).toBeGreaterThan(profileCompleteness(empty).score)
    expect(profileCompleteness(filled).missing).not.toContain('语气样本')
  })

  it('falls back to basic personality for legacy characters without a profile', () => {
    const prompt = buildCharacterProfilePrompt(character('c1', '林夏'), { mode: 'writing' })
    expect(prompt).toContain('基础性格：安静')
    expect(prompt).toContain('身份：外门弟子')
  })

  it('selects the character stage by chapter number', () => {
    const profile = emptyCharacterProfile()
    profile.stages = [
      {
        id: 's1',
        label: '第一卷',
        fromChapter: '1',
        toChapter: '5',
        goal: '活下来',
        traits: '隐忍',
        voiceNote: '话少',
      },
      {
        id: 's2',
        label: '第二卷',
        fromChapter: '6',
        toChapter: '20',
        goal: '掌权',
        traits: '冷酷',
        voiceNote: '语速慢',
      },
    ]
    const first = buildCharacterProfilePrompt(character('c1', '林夏', profile), {
      mode: 'writing',
      chapterNumber: 2,
    })
    const second = buildCharacterProfilePrompt(character('c1', '林夏', profile), {
      mode: 'writing',
      chapterNumber: 10,
    })
    expect(first).toContain('当前阶段：第一卷')
    expect(second).toContain('当前阶段：第二卷')
  })

  it('extracts quoted voice samples near the character name', () => {
    const samples = extractVoiceSamples(character('c1', '林夏'), [
      {
        content: '林夏推门进来：“行。”\n\n柜台后的人说：“谁？”\n\n林夏说：“随你。”',
      },
    ])
    expect(samples).toContain('行。')
    expect(samples).toContain('随你。')
    expect(samples).not.toContain('谁？')
  })

  it('requests a deep profile in one-click character generation schema', () => {
    const messages = buildEntityGenerateMessages({
      kind: 'character',
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
      detail: detailWith([]),
    })
    const content = messages.map((message) => message.content).join('\n')
    expect(content).toContain('"profile"')
    expect(content).toContain('coreContradiction')
    expect(content).toContain('neverSays')
    expect(content).toContain('voice')
    const schema = content.split('只输出这些字段：')[1]?.split('\n')[0]?.trim() ?? ''
    const parsed = JSON.parse(schema) as { profile?: { voice?: unknown } }
    expect(parsed.profile?.voice).toBeTruthy()
  })

  it('builds a prompt with voice samples, never-say and knowledge boundary', () => {
    const profile = emptyCharacterProfile()
    profile.coreContradiction = '想被理解，但绝不解释'
    profile.voice.samples = ['“行。”', '“随你。”']
    profile.voice.neverSays = ['相信我']
    profile.knowledge.knows = ['剑匣少半页']
    profile.knowledge.believes = ['以为是陆照雪偷的']
    profile.meta.aiNotes = '不要主动解释自己'
    const prompt = buildCharacterProfilePrompt(character('c1', '林夏', profile), {
      mode: 'chat',
      detail: detailWith([character('c1', '林夏', profile)]),
    })
    expect(prompt).toContain('核心矛盾：想被理解，但绝不解释')
    expect(prompt).toContain('“行。”')
    expect(prompt).toContain('绝不说：相信我')
    expect(prompt).toContain('剑匣少半页')
    expect(prompt).toContain('不要主动解释自己')
    expect(prompt).toContain('不要把他写成设定清单')
  })

  it('selects mentioned and POV characters and keeps others out of deep focus', () => {
    const profile = emptyCharacterProfile()
    profile.aliases = ['阿雪']
    profile.meta.pov = true
    const a = character('c1', '沈照雪', profile)
    const b = character('c2', '陆青崖')
    const c = character('c3', '顾长风')
    const detail = detailWith([a, b, c])
    const focus = selectFocusCharacters(detail, '阿雪站在试剑台上。')
    expect(focus.some((item) => item.id === 'c1')).toBe(true)
    expect(characterQuickLine(b)).toContain('陆青崖')
    expect(characterQuickLine(b)).toContain('性格')
  })

  it('puts active character voice into writing context and leaves unrelated characters compact', () => {
    const profile = emptyCharacterProfile()
    profile.aliases = ['阿雪']
    profile.coreContradiction = '想被理解，但绝不解释'
    profile.voice.samples = ['“行。”', '“随你。”']
    profile.voice.neverSays = ['相信我']
    const active = character('c1', '沈照雪', profile)
    const other = character('c2', '陆青崖')
    const detail = detailWith([active, other])
    const work: Work = {
      id: 'w1',
      title: '照雪问剑',
      synopsis: '旧案。',
      theme: '选择',
      genres: ['悬疑'],
      outlineMode: 'fine',
      perspective: 'third-limited',
      characterCount: 2,
      targetWords: 100000,
      promptIds: [],
      status: '连载中',
      chapters: 1,
      words: 0,
      updatedAt: 1,
      coverIndex: 0,
    }
    const chapter: Chapter = {
      id: 'ch1',
      title: '第一章',
      content: '',
      updatedAt: 1,
      status: 'writing',
      titleSource: 'manual',
    }
    const messages = buildGenerationMessages({
      work,
      detail,
      chapters: [chapter],
      chapter,
      baseContent: '',
      directive: '阿雪走进试剑台。',
      prompts: [],
    })
    const content = messages.map((message) => message.content).join('\n')
    expect(content).toContain('想被理解，但绝不解释')
    expect(content).toContain('“行。”')
    expect(content).toContain('绝不说：相信我')
    expect(content).toContain('其他角色概览')
    expect(content).toContain('陆青崖')
  })

  it('normalizes self reference and address variants into prompts', () => {
    const other = character('c2', '陆青崖')
    const profile = normalizeCharacterProfile({
      voice: { selfReference: '本座', samples: ['“随你。”'] },
      relationNotes: [
        {
          characterId: 'c2',
          address: '青崖',
          addressFormal: '陆公子',
          addressIntimate: '阿崖',
          addressAngry: '陆青崖',
          attitude: '旧友',
          unspoken: '',
          trust: '高',
          dynamic: '',
        },
      ],
    })
    const prompt = buildCharacterProfilePrompt(
      { ...character('c1', '林夏'), profile },
      { mode: 'writing', detail: detailWith([other]) },
    )
    expect(prompt).toContain('自称：本座')
    expect(prompt).toContain('正式称呼陆公子')
    expect(prompt).toContain('亲密称呼阿崖')
    expect(prompt).toContain('生气时称呼陆青崖')
  })
})
