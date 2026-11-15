import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import { mergeCharacterBasicArchive, mergeCharacterDeepArchive, mergeFactionDeepArchive } from './entityFill'
import { normalizeCharacterProfile, emptyCharacterProfile } from './characterProfile'
import { normalizeFactionProfile, emptyFactionProfile } from './factionProfile'
import type { CharacterCard, FactionCard } from './types'

describe('deep archive merge', () => {
  it('fills empty character profile fields without overwriting existing ones', () => {
    const character: CharacterCard = {
      id: 'c1',
      name: '陈平安',
      role: '主角',
      identity: '调查员',
      personality: '克制',
      goal: '',
    }
    character.profile = normalizeCharacterProfile({
      ...emptyCharacterProfile(),
      coreContradiction: '想躺平又不得不救人',
      truePersonality: '',
    })
    const merged = mergeCharacterDeepArchive(character, {
      profile: {
        coreContradiction: 'AI 不应覆盖',
        truePersonality: '嘴硬心软',
        fears: ['再次失去同伴'],
      },
    })
    expect(merged.profile?.coreContradiction).toBe('想躺平又不得不救人')
    expect(merged.profile?.truePersonality).toBe('嘴硬心软')
    expect(merged.profile?.fears).toContain('再次失去同伴')
  })

  it('accepts a profile object returned without the profile wrapper', () => {
    const character: CharacterCard = {
      id: 'c2',
      name: '范长庚',
      role: '配角',
      identity: '',
      personality: '',
      goal: '',
    }
    character.profile = normalizeCharacterProfile(emptyCharacterProfile())
    const merged = mergeCharacterDeepArchive(character, {
      truePersonality: '胆小但守底线',
      fears: ['被牵连'],
    })
    expect(merged.profile?.truePersonality).toBe('胆小但守底线')
    expect(merged.profile?.fears).toContain('被牵连')
  })

  it('fills empty basic archive fields without overwriting existing ones', () => {
    const character: CharacterCard = {
      id: 'c3',
      name: '测试角色',
      role: '主角',
      identity: '调查员',
      personality: '',
      goal: '',
      weapons: ['旧剑'],
    }
    const merged = mergeCharacterBasicArchive(character, {
      identity: '不应覆盖',
      personality: '克制',
      goal: '查清旧案',
      appearance: '清瘦',
      weapons: ['新剑'],
      techniques: ['听风'],
      treasures: [],
    })
    expect(merged.identity).toBeUndefined()
    expect(merged.personality).toBe('克制')
    expect(merged.goal).toBe('查清旧案')
    expect(merged.appearance).toBe('清瘦')
    expect(merged.weapons).toBeUndefined()
    expect(merged.techniques).toEqual(['听风'])
  })

  it('fills empty faction profile fields', () => {
    const detail = createEmptyDetail()
    const faction: FactionCard = {
      id: 'f1',
      name: '天诛殿',
      type: '宗门',
      leader: '',
      goal: '',
      description: '',
    }
    faction.profile = normalizeFactionProfile({
      ...emptyFactionProfile(),
      publicFace: '执法者',
      trueFace: '',
    })
    const merged = mergeFactionDeepArchive(faction, {
      profile: { trueFace: '清除异己', publicFace: '不应覆盖' },
    })
    expect(merged.profile?.publicFace).toBe('执法者')
    expect(merged.profile?.trueFace).toBe('清除异己')
    expect(detail).toBeTruthy()
  })
})
