import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import { emptyCharacterProfile } from './characterProfile'
import { emptySpecies } from './species'
import { buildEntityIndex, characterShortNames, entityIndexMatches } from './entityIndex'

describe('shared entity index', () => {
  it('collects characters, factions, locations, items and foreshadows', () => {
    const detail = createEmptyDetail()
    detail.characters = [
      {
        id: 'c1',
        name: '林夏',
        role: '主角',
        identity: '旧书店店主',
        personality: '',
        goal: '',
        weapons: ['照雪剑'],
        techniques: ['太玄剑法'],
        speciesId: 's1',
        profile: {
          ...emptyCharacterProfile(),
          aliases: ['小夏'],
        },
      },
    ]
    detail.species = [{ ...emptySpecies(), id: 's1', name: '霜裔', category: '精灵' }]
    detail.factions = [
      {
        id: 'f1',
        name: '雾港晚报',
        type: '媒体',
        leader: '陈默',
        goal: '',
        description: '',
        techniques: ['镇山诀'],
      },
    ]
    detail.locations = [{ id: 'l1', name: '旧书店', type: '店铺', description: '' }]
    detail.items = [
      { id: 'i1', name: '铜钥匙', categoryId: 'cat', grade: 1, description: '' },
    ]
    detail.foreshadowings = [
      {
        id: 'fo1',
        title: '旧案卷宗',
        status: '未回收',
        plantedIn: '',
        note: '',
      },
    ]
    const index = buildEntityIndex(detail)
    expect(index).toHaveLength(9)
    expect(index[0].aliases).toContain('小夏')
    expect(index.find((item) => item.category === 'species')?.name).toBe('霜裔')
    expect(index.find((item) => item.category === 'species')?.subtitle).toContain('精灵')
    expect(index[0].facts.some((fact) => fact.includes('霜裔'))).toBe(true)
    expect(index.find((item) => item.category === 'location')?.tab).toBe('locations')
    expect(index.find((item) => item.category === 'item')?.name).toBe('铜钥匙')
    expect(index.find((item) => item.category === 'weapon')?.name).toBe('照雪剑')
    expect(index.find((item) => item.category === 'technique')?.name).toBe('太玄剑法')
    expect(index.find((item) => item.name === '镇山诀')?.subtitle).toContain('雾港晚报')
  })

  it('matches fields and aliases case-insensitively', () => {
    const detail = createEmptyDetail()
    detail.characters = [
      {
        id: 'c1',
        name: 'Lin Xia',
        role: '主角',
        identity: '',
        personality: '',
        goal: '找回姐姐',
        profile: {
          ...emptyCharacterProfile(),
          aliases: ['小夏'],
        },
      },
    ]
    const index = buildEntityIndex(detail)
    expect(entityIndexMatches(index[0], 'lin')).toBe(true)
    expect(entityIndexMatches(index[0], '小夏')).toBe(true)
    expect(entityIndexMatches(index[0], '姐姐')).toBe(true)
    expect(entityIndexMatches(index[0], '不存在')).toBe(false)
  })

  it('returns empty index for empty detail', () => {
    expect(buildEntityIndex(createEmptyDetail())).toEqual([])
  })

  it('adds common short names for recognition without changing the character name', () => {
    expect(characterShortNames('萧薰儿')).toEqual(['薰儿'])
    expect(characterShortNames('纳兰嫣然')).toEqual(['嫣然'])
    expect(characterShortNames('萧炎')).toEqual([])
    const detail = createEmptyDetail()
    detail.characters = [
      {
        id: 'c1',
        name: '萧薰儿',
        role: '女主',
        identity: '',
        personality: '',
        goal: '',
        profile: { ...emptyCharacterProfile(), aliases: [] },
      },
    ]
    const index = buildEntityIndex(detail)
    expect(index[0].name).toBe('萧薰儿')
    expect(index[0].aliases).toContain('薰儿')
    expect(entityIndexMatches(index[0], '薰儿')).toBe(true)
  })
})
