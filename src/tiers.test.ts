import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import {
  appendRealmHistory,
  createTierScheme,
  defaultRealmScheme,
  ensureFactionTierData,
  ensureItemTierData,
  ensureRealmData,
  ensureSpeciesTierData,
  factionTierScheme,
  itemTierNames,
  normalizeTierScheme,
} from './tiers'
import type { ItemCategory } from './types'

describe('tier systems', () => {
  it('uses different default labels for weapons and pills', () => {
    expect(itemTierNames('武器').slice(0, 3)).toEqual(['一阶', '二阶', '三阶'])
    expect(itemTierNames('丹药').slice(0, 3)).toEqual(['一品', '二品', '三品'])
    expect(itemTierNames('科技').slice(0, 2)).toEqual(['T1', 'T2'])
  })

  it('normalizes custom tier schemes', () => {
    const scheme = createTierScheme('品级', ['下品', '中品', '上品'], ['#111111', '#222222'])
    expect(scheme.levels).toHaveLength(3)
    const normalized = normalizeTierScheme(scheme)
    expect(normalized?.levels[2].color).toBeTruthy()
    expect(normalizeTierScheme({ name: '坏' })).toBeNull()
  })

  it('supports realms with sublevels and faction tiers', () => {
    const realm = defaultRealmScheme('xianxia')
    expect(realm.levels[0].name).toBe('炼气')
    expect(realm.levels[0].sublevels?.[0]).toBe('一层')
    expect(realm.levels[4].sublevels).toEqual(['初期', '中期', '后期'])

    const detail = createEmptyDetail()
    const patch = ensureFactionTierData(detail)
    expect(patch?.factionTierSchemeId).toBeTruthy()
    const scheme = factionTierScheme({ ...detail, ...patch })
    expect(scheme?.levels.map((level) => level.name)).toContain('一流')
    expect(ensureFactionTierData({ ...detail, ...patch })).toBeNull()
  })

  it('adds per-category item schemes without touching existing data', () => {
    const detail = createEmptyDetail()
    detail.itemCategories = [
      { id: 'weapons', name: '武器', order: 0 },
      { id: 'pills', name: '丹药', order: 1 },
    ] satisfies ItemCategory[]
    const patch = ensureItemTierData(detail)
    expect(patch?.tierSchemes).toHaveLength(2)
    expect(patch?.itemCategories?.every((category) => Boolean(category.tierSchemeId))).toBe(true)
    const names = (patch?.tierSchemes ?? []).map((scheme) => scheme.levels[0].name)
    expect(names).toEqual(['一阶', '一品'])
    expect(ensureItemTierData({ ...detail, ...patch })).toBeNull()
  })

  it('migrates species category strings into managed categories and schemes', () => {
    const detail = createEmptyDetail()
    detail.species = [
      {
        id: 's1',
        name: '霜裔',
        aliases: [],
        category: '精灵',
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
    const patch = ensureSpeciesTierData(detail)
    expect(patch?.speciesCategories?.[0].name).toBe('精灵')
    expect(patch?.species?.[0].categoryId).toBeTruthy()
    expect(patch?.tierSchemes?.length).toBe(1)
  })

  it('creates a realm scheme and records realm history', () => {
    const detail = createEmptyDetail()
    const patch = ensureRealmData(detail, 'xianxia')
    expect(patch?.realmSchemes?.[0].levels[0].name).toBe('炼气')
    expect(patch?.activeRealmSchemeId).toBe(patch?.realmSchemes?.[0].id)
    const history = appendRealmHistory(
      { ...detail, ...patch },
      {
        characterId: 'c1',
        characterName: '林夏',
        schemeId: patch!.realmSchemes![0].id,
        schemeName: patch!.realmSchemes![0].name,
        level: 2,
        levelName: '筑基',
        sublevel: 2,
        sublevelName: '中期',
      },
    )
    expect(history[0].levelName).toBe('筑基')
    expect(history[0].sublevelName).toBe('中期')
    expect(history[0].characterName).toBe('林夏')
    expect(defaultRealmScheme('scifi').levels.length).toBeGreaterThan(0)
  })
})
