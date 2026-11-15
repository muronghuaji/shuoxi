import type { WorkDetail } from './types'
import { characterRealmScheme, factionTierScheme, schemeById, speciesCategoryScheme } from './tiers'

export type EntityCategory =
  | 'character'
  | 'species'
  | 'faction'
  | 'location'
  | 'item'
  | 'foreshadow'
  | 'weapon'
  | 'technique'

export interface EntityIndexEntry {
  id: string
  category: EntityCategory
  name: string
  aliases: string[]
  tab: string
  subtitle: string
  fields: (string | undefined)[]
  facts: string[]
  summary: string
  tierColor?: string
  tierLabel?: string
}

const COMPOUND_SURNAMES = [
  '欧阳',
  '司马',
  '上官',
  '诸葛',
  '东方',
  '皇甫',
  '尉迟',
  '公孙',
  '慕容',
  '南宫',
  '独孤',
  '令狐',
  '夏侯',
  '长孙',
  '宇文',
  '司徒',
  '端木',
  '轩辕',
  '百里',
  '呼延',
  '西门',
  '纳兰',
]

/**
 * 从一个中文全名里提取最常见的“去姓称呼”。
 * 例如：萧薰儿 -> 薰儿，纳兰嫣然 -> 嫣然。
 * 只用于实体识别，不写回角色档案。
 */
export function characterShortNames(name: string): string[] {
  const value = name.trim()
  if (!/^[\u4e00-\u9fff]{3,5}$/.test(value)) return []
  const surnameLength = COMPOUND_SURNAMES.some((surname) => value.startsWith(surname)) ? 2 : 1
  const given = value.slice(surnameLength)
  return given.length >= 2 && given.length <= 3 ? [given] : []
}

function attachCharacterShortNames(entries: EntityIndexEntry[]): void {
  const known = new Set<string>()
  for (const entry of entries) {
    for (const name of [entry.name, ...entry.aliases]) {
      const value = name.trim().toLowerCase()
      if (value) known.add(value)
    }
  }
  const added = new Set<string>()
  for (const entry of entries) {
    if (entry.category !== 'character') continue
    for (const shortName of characterShortNames(entry.name)) {
      const key = shortName.toLowerCase()
      if (known.has(key) || added.has(key)) continue
      entry.aliases = [...entry.aliases, shortName]
      added.add(key)
    }
  }
}

export function buildEntityIndex(detail: WorkDetail): EntityIndexEntry[] {
  const entries: EntityIndexEntry[] = []

  for (const character of detail.characters) {
    const aliases = character.profile?.aliases ?? []
    const characterSpecies = detail.species?.find((species) => species.id === character.speciesId)
    const realmScheme = characterRealmScheme(detail, character.realmSchemeId)
    const realmLevel = character.realmLevel ? realmScheme?.levels[character.realmLevel - 1] : undefined
    const realmSublevel =
      character.realmSublevel && realmLevel
        ? realmLevel.sublevels?.[character.realmSublevel - 1]
        : undefined
    const fields = [
      character.name,
      ...aliases,
      character.identity,
      character.personality,
      character.goal,
      character.background,
      character.appearance,
      character.position,
      characterSpecies?.name,
      characterSpecies?.category,
      realmSublevel,
      realmLevel?.name,
      realmScheme?.name,
      character.profile?.coreContradiction,
      character.profile?.surfacePersonality,
      character.profile?.truePersonality,
    ]
    entries.push({
      id: character.id,
      category: 'character',
      name: character.name || '未命名人物',
      aliases,
      tab: 'characters',
      subtitle: `人物 · ${character.role || character.identity || '未填身份'}`,
      fields,
      facts: [
        character.role ? `定位：${character.role}` : '',
        character.identity ? `身份：${character.identity}` : '',
        characterSpecies ? `物种：${characterSpecies.name}` : '',
        realmLevel
          ? `境界：${[realmLevel.name, realmSublevel].filter(Boolean).join(' · ')}`
          : '',
        character.goal ? `目标：${character.goal}` : '',
        character.status ? `状态：${character.status}` : '',
      ].filter(Boolean),
      summary:
        character.personality ||
        character.background ||
        character.goal ||
        character.profile?.coreContradiction ||
        '还没有补充人物信息。',
      tierColor: realmLevel?.color,
      tierLabel: [realmLevel?.name, realmSublevel].filter(Boolean).join(' · '),
    })
  }

  for (const species of detail.species ?? []) {
    const speciesCategory = detail.speciesCategories?.find(
      (category) => category.id === species.categoryId || category.name === species.category,
    )
    const speciesScheme = speciesCategoryScheme(detail, speciesCategory)
    const speciesTier = species.tierLevel
      ? speciesScheme?.levels[species.tierLevel - 1]
      : undefined
    const fields = [
      species.name,
      ...species.aliases,
      species.category,
      species.origin,
      species.habitat,
      species.appearance,
      species.physiology,
      species.lifespan,
      ...species.abilities,
      ...species.weaknesses,
      species.society,
      species.language,
      species.culture,
      species.relations,
      ...species.variants,
      species.notes,
      ...(species.tags ?? []),
    ]
    entries.push({
      id: species.id,
      category: 'species',
      name: species.name || '未命名物种',
      aliases: species.aliases ?? [],
      tab: 'species',
      subtitle: `物种 · ${species.category || '未分类'}`,
      fields,
      facts: [
        species.category ? `大类：${species.category}` : '',
        speciesTier ? `阶位：${speciesTier.name}` : '',
        species.habitat ? `栖息地：${species.habitat}` : '',
        species.abilities.length ? `能力：${species.abilities.slice(0, 2).join('、')}` : '',
        species.weaknesses.length ? `弱点：${species.weaknesses.slice(0, 2).join('、')}` : '',
      ].filter(Boolean),
      summary:
        species.appearance ||
        species.physiology ||
        species.society ||
        species.notes ||
        '还没有补充物种信息。',
      tierColor: speciesTier?.color,
      tierLabel: speciesTier?.name,
    })
  }

  for (const faction of detail.factions) {
    const factionLevel = factionTierScheme(detail)?.levels[(faction.tierLevel ?? 0) - 1]
    const fields = [
      faction.name,
      faction.type,
      factionLevel?.name ?? '',
      faction.leader,
      faction.goal,
      faction.description,
      faction.location,
      faction.motto,
      faction.profile?.coreContradiction,
      faction.profile?.publicFace,
      faction.profile?.trueFace,
    ]
    entries.push({
      id: faction.id,
      category: 'faction',
      name: faction.name || '未命名势力',
      aliases: [],
      tab: 'factions',
      subtitle: `势力 · ${faction.type || '未填类型'}`,
      fields,
      facts: [
        faction.type ? `类型：${faction.type}` : '',
        factionLevel?.name ? `层级：${factionLevel.name}` : '',
        faction.leader ? `首领：${faction.leader}` : '',
        faction.location ? `驻地：${faction.location}` : '',
        faction.goal ? `目标：${faction.goal}` : '',
      ].filter(Boolean),
      summary:
        faction.description ||
        faction.goal ||
        faction.profile?.coreContradiction ||
        '还没有补充势力信息。',
      tierColor: factionLevel?.color,
      tierLabel: factionLevel?.name,
    })
  }

  for (const location of detail.locations ?? []) {
    const fields = [location.name, location.type, location.description, location.notes]
    entries.push({
      id: location.id,
      category: 'location',
      name: location.name || '未命名地点',
      aliases: [],
      tab: 'locations',
      subtitle: `地点 · ${location.type || '未填类型'}`,
      fields,
      facts: [
        location.type ? `类型：${location.type}` : '',
        location.description ? `描述：${location.description.slice(0, 60)}` : '',
      ].filter(Boolean),
      summary: location.description || location.notes || '还没有补充地点信息。',
    })
  }

  for (const item of detail.items ?? []) {
    const itemCategory = detail.itemCategories?.find(
      (category) => category.id === item.categoryId,
    )
    const itemScheme = schemeById(detail.tierSchemes, itemCategory?.tierSchemeId)
    const itemTier = itemScheme?.levels[item.grade - 1]
    const fields = [item.name, item.description, item.notes]
    entries.push({
      id: item.id,
      category: 'item',
      name: item.name || '未命名物品',
      aliases: [],
      tab: 'items',
      subtitle: '物品',
      fields,
      facts: [
        itemTier?.name ? `品阶：${itemTier.name}` : '',
        itemCategory?.name ? `分类：${itemCategory.name}` : '',
        item.description ? `描述：${item.description.slice(0, 70)}` : '',
      ].filter(Boolean),
      summary: item.description || item.notes || '还没有补充物品信息。',
      tierColor: itemTier?.color,
      tierLabel: itemTier?.name,
    })
  }

  for (const foreshadow of detail.foreshadowings) {
    const fields = [foreshadow.title, foreshadow.note, foreshadow.truth, ...(foreshadow.clues ?? [])]
    entries.push({
      id: foreshadow.id,
      category: 'foreshadow',
      name: foreshadow.title || '未命名伏笔',
      aliases: [],
      tab: 'foreshadow',
      subtitle: `伏笔 · ${foreshadow.status}`,
      fields,
      facts: [
        `状态：${foreshadow.status}`,
        foreshadow.plantedIn ? `埋设在：${foreshadow.plantedIn}` : '',
        foreshadow.importance ? `重要度：${foreshadow.importance}` : '',
      ].filter(Boolean),
      summary:
        foreshadow.note ||
        foreshadow.truth ||
        foreshadow.clues?.[0] ||
        '还没有补充伏笔信息。',
    })
  }

  const mentions = new Map<string, EntityIndexEntry>()
  const itemTierByName = new Map<string, { color?: string; label?: string }>()
  for (const item of detail.items ?? []) {
    const category = detail.itemCategories?.find((current) => current.id === item.categoryId)
    const scheme = schemeById(detail.tierSchemes, category?.tierSchemeId)
    const tier = scheme?.levels[item.grade - 1]
    if (tier) itemTierByName.set(item.name, { color: tier.color, label: tier.name })
  }
  const addMention = (
    category: 'weapon' | 'technique',
    name: string,
    owner: string,
    tab: string,
  ) => {
    const value = name.trim()
    if (!value) return
    if (/^(无|暂无|未定|没有|无武器|无功法|无物品)$/.test(value)) return
    const key = `${category}:${value.toLowerCase()}`
    const existing = mentions.get(key)
    if (existing) {
      if (owner && !existing.subtitle.includes(owner)) {
        existing.subtitle = `${existing.subtitle}、${owner}`
        existing.facts = [`关联：${existing.subtitle.split(' · ')[1] ?? owner}`]
      }
      return
    }
    const categoryLabel = category === 'weapon' ? '武器' : '功法 / 技术'
    const tier = itemTierByName.get(value)
    mentions.set(key, {
      id: `${category}-${value.toLowerCase().replace(/\s+/g, '-')}`,
      category,
      name: value,
      aliases: [],
      tab,
      subtitle: `${categoryLabel} · ${owner || '未标注归属'}`,
      fields: [value, owner],
      facts: [
        tier?.label ? `品阶：${tier.label}` : '',
        owner ? `关联：${owner}` : '还没有标注归属。',
      ].filter(Boolean),
      summary: `${categoryLabel}，出现在${owner || '作品中'}的相关记录里。`,
      tierColor: tier?.color,
      tierLabel: tier?.label,
    })
  }

  for (const character of detail.characters) {
    for (const weapon of character.weapons ?? []) {
      addMention('weapon', weapon, character.name, 'characters')
    }
    for (const technique of character.techniques ?? []) {
      addMention('technique', technique, character.name, 'characters')
    }
  }
  for (const faction of detail.factions) {
    for (const technique of faction.techniques ?? []) {
      addMention('technique', technique, faction.name, 'factions')
    }
  }

  entries.push(...mentions.values())
  attachCharacterShortNames(entries)
  return entries
}

export function entityIndexMatches(entry: EntityIndexEntry, query: string): boolean {
  const lower = query.trim().toLowerCase()
  if (!lower) return false
  return entry.fields.some((field) => field?.toLowerCase().includes(lower))
}
