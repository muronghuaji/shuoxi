import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import type { TierScheme } from './types'
import { buildEntityIndex } from './entityIndex'

const realm: TierScheme = {
  id: 'realm',
  name: '境界',
  levels: [{ id: 'realm-1', name: '金丹', color: '#6fa8dc' }],
}
const factionTier: TierScheme = {
  id: 'faction-tier',
  name: '势力层级',
  levels: [{ id: 'faction-1', name: '一流', color: '#d8a45c' }],
}
const itemTier: TierScheme = {
  id: 'item-tier',
  name: '法宝品阶',
  levels: [{ id: 'item-1', name: '三阶', color: '#b58ae0' }],
}
const speciesTier: TierScheme = {
  id: 'species-tier',
  name: '物种阶位',
  levels: [{ id: 'species-1', name: '首领', color: '#d98ab5' }],
}

describe('entity tier colors', () => {
  it('attaches tier color and label to ranked entities only', () => {
    const detail = createEmptyDetail()
    detail.realmSchemes = [realm]
    detail.activeRealmSchemeId = realm.id
    detail.characters = [
      {
        id: 'c1',
        name: '陆照雪',
        role: '主角',
        identity: '',
        personality: '',
        goal: '',
        realmSchemeId: realm.id,
        realmLevel: 1,
      },
      {
        id: 'c2',
        name: '无名路人',
        role: '配角',
        identity: '',
        personality: '',
        goal: '',
      },
    ]
    detail.factions = [
      {
        id: 'f1',
        name: '太虚剑宗',
        type: '宗门',
        leader: '',
        goal: '',
        description: '',
        tierLevel: 1,
      },
    ]
    detail.tierSchemes = [factionTier, itemTier, speciesTier]
    detail.factionTierSchemeId = factionTier.id
    detail.itemCategories = [{ id: 'cat', name: '法宝', order: 0, tierSchemeId: itemTier.id }]
    detail.items = [
      { id: 'i1', name: '照雪剑', categoryId: 'cat', grade: 1, description: '' },
    ]
    detail.speciesCategories = [{ id: 'sc', name: '灵兽', order: 0, tierSchemeId: speciesTier.id }]
    detail.species = [
      {
        id: 's1',
        name: '雪鸾',
        aliases: [],
        category: '灵兽',
        categoryId: 'sc',
        tierLevel: 1,
        origin: '',
        habitat: '',
        appearance: '',
        physiology: '',
        lifespan: '',
        abilities: [],
        weaknesses: [],
        society: '',
        language: '',
        culture: '',
        relations: '',
        variants: [],
        notes: '',
      },
    ]
    detail.locations = [{ id: 'l1', name: '问剑峰', type: '山峰', description: '' }]

    const index = buildEntityIndex(detail)
    expect(index.find((entry) => entry.name === '陆照雪')?.tierColor).toBe('#6fa8dc')
    expect(index.find((entry) => entry.name === '陆照雪')?.tierLabel).toBe('金丹')
    expect(index.find((entry) => entry.name === '无名路人')?.tierColor).toBeUndefined()
    expect(index.find((entry) => entry.name === '太虚剑宗')?.tierColor).toBe('#d8a45c')
    expect(index.find((entry) => entry.name === '照雪剑')?.tierColor).toBe('#b58ae0')
    expect(index.find((entry) => entry.name === '雪鸾')?.tierColor).toBe('#d98ab5')
    expect(index.find((entry) => entry.name === '问剑峰')?.tierColor).toBeUndefined()
  })
})
