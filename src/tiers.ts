import type {
  ItemCategory,
  RealmHistoryEntry,
  SpeciesCategory,
  TierLevel,
  TierScheme,
  WorkDetail,
} from './types'

export const TIER_PALETTE = [
  '#8b9bb4',
  '#76b58a',
  '#6fa8dc',
  '#b58ae0',
  '#d8a45c',
  '#df7f6f',
  '#67c9c2',
  '#e5c65f',
  '#d98ab5',
  '#9aa7d8',
  '#c7a37a',
  '#d0d4dc',
]

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function createTierScheme(
  name: string,
  names: string[],
  colors?: string[],
  sublevels?: string[][],
): TierScheme {
  const schemeId = uid('tier')
  return {
    id: schemeId,
    name,
    levels: names.map((levelName, index) => ({
      id: `${schemeId}-l${index + 1}`,
      name: levelName,
      color: colors?.[index] ?? TIER_PALETTE[index % TIER_PALETTE.length],
      ...(sublevels?.[index]?.length ? { sublevels: [...sublevels[index]] } : {}),
    })),
  }
}

export function normalizeTierScheme(raw: unknown): TierScheme | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!name || !Array.isArray(value.levels)) return null
  const levels: TierLevel[] = value.levels
    .map((item, index): TierLevel | null => {
      if (!item || typeof item !== 'object') return null
      const level = item as Record<string, unknown>
      const levelName = typeof level.name === 'string' ? level.name.trim() : ''
      if (!levelName) return null
      const sublevels = Array.isArray(level.sublevels)
        ? level.sublevels
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter(Boolean)
        : []
      return {
        id:
          typeof level.id === 'string' && level.id
            ? level.id
            : `level-${index + 1}-${Math.random().toString(36).slice(2, 6)}`,
        name: levelName,
        color:
          typeof level.color === 'string' && /^#[0-9a-f]{6}$/i.test(level.color)
            ? level.color
            : TIER_PALETTE[index % TIER_PALETTE.length],
        ...(sublevels.length ? { sublevels } : {}),
      }
    })
    .filter((level): level is TierLevel => Boolean(level))
  if (levels.length === 0) return null
  return {
    id: typeof value.id === 'string' && value.id ? value.id : uid('tier'),
    name,
    levels,
  }
}

export function normalizeTierSchemes(raw: unknown): TierScheme[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeTierScheme).filter((scheme): scheme is TierScheme => Boolean(scheme))
}

export function cloneTierScheme(scheme: TierScheme): TierScheme {
  const next = createTierScheme(
    scheme.name,
    scheme.levels.map((level) => level.name),
    scheme.levels.map((level) => level.color),
    scheme.levels.map((level) => level.sublevels ?? []),
  )
  return {
    ...next,
    name: scheme.name,
  }
}

export function itemTierNames(categoryName: string, fallback?: string[]): string[] {
  const name = categoryName.trim()
  if (/丹|药|符|阵|毒|散|膏/.test(name)) {
    return ['一品', '二品', '三品', '四品', '五品', '六品', '七品', '八品', '九品', '十品']
  }
  if (/武器|法器|法宝|灵器|装备|兵/.test(name)) {
    return ['一阶', '二阶', '三阶', '四阶', '五阶', '六阶', '七阶', '八阶', '九阶', '十阶']
  }
  if (/科技|义体|机甲|模块/.test(name)) {
    return ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']
  }
  if (/材|矿|草|木|皮|骨/.test(name)) {
    return ['普通', '良品', '精品', '珍品', '稀有', '史诗', '传说', '神话', '至宝', '唯一']
  }
  if (fallback?.length === 10) return [...fallback]
  return ['一级', '二级', '三级', '四级', '五级', '六级', '七级', '八级', '九级', '十级']
}

export function defaultItemTierScheme(categoryName: string, fallback?: string[]): TierScheme {
  return createTierScheme(`${categoryName || '物品'}品阶`, itemTierNames(categoryName, fallback))
}

export function defaultSpeciesTierScheme(categoryName: string): TierScheme {
  return createTierScheme(`${categoryName || '物种'}阶位`, [
    '普通',
    '精英',
    '首领',
    '传说',
    '神话',
  ])
}

export function defaultRealmScheme(templateId: string | undefined): TierScheme {
  if (templateId === 'xianxia') {
    return createTierScheme(
      '修仙境界',
      ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'],
      undefined,
      [
        ['一层', '二层', '三层', '四层', '五层', '六层', '七层', '八层', '九层'],
        ['初期', '中期', '后期'],
        ['初期', '中期', '后期'],
        ['初期', '中期', '后期'],
        ['初期', '中期', '后期'],
        ['初期', '中期', '后期'],
        ['初期', '中期', '后期'],
        ['初期', '中期', '后期'],
        ['初期', '中期', '后期'],
      ],
    )
  }
  if (templateId === 'scifi') {
    return createTierScheme('进化阶位', [
      '公民',
      '强化人',
      '新人类',
      '升华者',
      '星灵',
      '超越者',
    ])
  }
  return createTierScheme('角色境界', ['普通', '觉醒', '精英', '超凡', '传说', '神话'])
}

export const DEFAULT_SPECIES_CATEGORY_NAMES = [
  '神兽 / 妖兽',
  '精灵 / 妖精',
  '亡灵',
  '异族',
  '灵植',
  '未分类',
]

export function speciesCategoryColor(index: number): string {
  return TIER_PALETTE[index % TIER_PALETTE.length]
}

export function itemCategoryColor(index: number): string {
  return TIER_PALETTE[index % TIER_PALETTE.length]
}

function validScheme(detail: WorkDetail, id: string | undefined): boolean {
  return Boolean(id && (detail.tierSchemes ?? []).some((scheme) => scheme.id === id))
}

export function ensureItemTierData(detail: WorkDetail): Partial<WorkDetail> | null {
  const categories = detail.itemCategories ?? []
  if (categories.length === 0) return null
  const schemes = [...(detail.tierSchemes ?? [])]
  let changed = false
  const nextCategories = categories.map((category, index) => {
    let next = category
    if (!category.color) {
      next = { ...next, color: itemCategoryColor(index) }
      changed = true
    }
    if (!validScheme({ ...detail, tierSchemes: schemes }, category.tierSchemeId)) {
      const scheme = defaultItemTierScheme(category.name, detail.itemGradeNames)
      schemes.push(scheme)
      next = { ...next, tierSchemeId: scheme.id }
      changed = true
    }
    return next
  })
  if (!changed) return null
  return { tierSchemes: schemes, itemCategories: nextCategories }
}

export function ensureSpeciesTierData(detail: WorkDetail): Partial<WorkDetail> | null {
  const existing = detail.speciesCategories ?? []
  const schemes = [...(detail.tierSchemes ?? [])]
  let changed = false
  let categories = [...existing]
  if (categories.length === 0) {
    const names = new Set(
      (detail.species ?? []).map((species) => species.category.trim()).filter(Boolean),
    )
    const sourceNames = names.size > 0 ? [...names] : DEFAULT_SPECIES_CATEGORY_NAMES
    categories = sourceNames.map((name, index) => ({
      id: uid('species-cat'),
      name,
      order: index,
      color: speciesCategoryColor(index),
    }))
    changed = true
  }
  const nextCategories = categories.map((category, index) => {
    let next = category
    if (!category.color) {
      next = { ...next, color: speciesCategoryColor(index) }
      changed = true
    }
    if (!validScheme({ ...detail, tierSchemes: schemes }, category.tierSchemeId)) {
      const scheme = defaultSpeciesTierScheme(category.name)
      schemes.push(scheme)
      next = { ...next, tierSchemeId: scheme.id }
      changed = true
    }
    return next
  })
  const nameToId = new Map(nextCategories.map((category) => [category.name, category.id]))
  const fallbackCategory = nextCategories[0]
  const species = (detail.species ?? []).map((item) => {
    let next = item
    if (next.categoryId && nextCategories.some((category) => category.id === next.categoryId)) {
      // 已关联，保留
    } else {
      const matched = nameToId.get(next.category.trim()) ?? fallbackCategory?.id
      if (matched && matched !== next.categoryId) {
        next = { ...next, categoryId: matched }
        changed = true
      }
    }
    if (!Array.isArray(next.tags)) {
      next = { ...next, tags: [] }
      changed = true
    }
    return next
  })
  if (!changed) return null
  return {
    tierSchemes: schemes,
    speciesCategories: nextCategories,
    species,
  }
}

export function ensureRealmData(
  detail: WorkDetail,
  templateId: string | undefined,
): Partial<WorkDetail> | null {
  const schemes = normalizeTierSchemes(detail.realmSchemes)
  let changed = false
  if (schemes.length === 0) {
    schemes.push(defaultRealmScheme(templateId))
    changed = true
  }
  if (templateId === 'xianxia') {
    const defaults = defaultRealmScheme('xianxia')
    for (let index = 0; index < schemes.length; index += 1) {
      const scheme = schemes[index]
      if (scheme.name !== '修仙境界') continue
      if (scheme.levels.some((level) => level.sublevels?.length)) continue
      const levels = scheme.levels.map((level, levelIndex) => {
        if (level.sublevels?.length) return level
        const fallback = defaults.levels[levelIndex]
        if (!fallback?.sublevels?.length || fallback.name !== level.name) return level
        changed = true
        return { ...level, sublevels: [...fallback.sublevels] }
      })
      if (levels.some((level, levelIndex) => level !== scheme.levels[levelIndex])) {
        schemes[index] = { ...scheme, levels }
      }
    }
  }
  let activeId = detail.activeRealmSchemeId
  if (!activeId || !schemes.some((scheme) => scheme.id === activeId)) {
    activeId = schemes[0].id
    changed = true
  }
  if (!Array.isArray(detail.realmHistory)) changed = true
  if (!changed) return null
  return {
    realmSchemes: schemes,
    activeRealmSchemeId: activeId,
    realmHistory: detail.realmHistory ?? [],
  }
}

export function schemeById(schemes: TierScheme[] | undefined, id: string | undefined): TierScheme | undefined {
  return (schemes ?? []).find((scheme) => scheme.id === id)
}

export function levelOfScheme(
  scheme: TierScheme | undefined,
  level: number | undefined,
): TierLevel | undefined {
  if (!scheme || !level) return undefined
  return scheme.levels[level - 1]
}

export function itemCategoryScheme(
  detail: WorkDetail,
  category: ItemCategory | undefined,
): TierScheme | undefined {
  return schemeById(detail.tierSchemes, category?.tierSchemeId)
}

export function speciesCategoryScheme(
  detail: WorkDetail,
  category: SpeciesCategory | undefined,
): TierScheme | undefined {
  return schemeById(detail.tierSchemes, category?.tierSchemeId)
}

export function characterRealmScheme(
  detail: WorkDetail,
  schemeId: string | undefined,
): TierScheme | undefined {
  const schemes = detail.realmSchemes ?? []
  return schemeById(schemes, schemeId ?? detail.activeRealmSchemeId)
}

export function defaultFactionTierScheme(): TierScheme {
  return createTierScheme('势力层级', ['三流', '二流', '一流', '超一流', '顶尖'])
}

export function ensureFactionTierData(detail: WorkDetail): Partial<WorkDetail> | null {
  const schemes = [...(detail.tierSchemes ?? [])]
  let changed = false
  let schemeId = detail.factionTierSchemeId
  if (!schemeId || !schemes.some((scheme) => scheme.id === schemeId)) {
    const existing = schemes.find((scheme) => scheme.name === '势力层级')
    const scheme = existing ?? defaultFactionTierScheme()
    if (!existing) schemes.push(scheme)
    schemeId = scheme.id
    changed = true
  }
  if (!changed) return null
  return { tierSchemes: schemes, factionTierSchemeId: schemeId }
}

export function factionTierScheme(detail: WorkDetail): TierScheme | undefined {
  return schemeById(detail.tierSchemes, detail.factionTierSchemeId)
}

export function appendRealmHistory(
  detail: WorkDetail,
  entry: Omit<RealmHistoryEntry, 'id' | 'at'>,
): RealmHistoryEntry[] {
  const previous = detail.realmHistory ?? []
  return [
    { ...entry, id: uid('realm-history'), at: Date.now() },
    ...previous,
  ].slice(0, 100)
}
