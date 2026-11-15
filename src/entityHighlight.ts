import type { EntityCategory, EntityIndexEntry } from './entityIndex'

export interface EntityHighlightSettings {
  enabled: boolean
  categories: Record<EntityCategory, boolean>
}

export const ENTITY_HIGHLIGHT_CATEGORIES: EntityCategory[] = [
  'character',
  'species',
  'faction',
  'location',
  'item',
  'weapon',
  'technique',
  'foreshadow',
]

export const ENTITY_CATEGORY_LABELS: Record<EntityCategory, string> = {
  character: '人物',
  species: '物种',
  faction: '势力',
  location: '地点',
  item: '物品',
  weapon: '武器',
  technique: '功法 / 技术',
  foreshadow: '伏笔',
}

export const ENTITY_CATEGORY_COLORS: Record<EntityCategory, string> = {
  character: '#86c79b',
  species: '#d6a2e8',
  faction: '#d8a45c',
  location: '#79a8e0',
  item: '#b38ae8',
  weapon: '#df7f6f',
  technique: '#67c9c2',
  foreshadow: '#e5c65f',
}

export const DEFAULT_ENTITY_HIGHLIGHT_SETTINGS: EntityHighlightSettings = {
  enabled: true,
  categories: {
    character: true,
    species: true,
    faction: true,
    location: true,
    item: true,
    weapon: true,
    technique: true,
    foreshadow: true,
  },
}

export function normalizeEntityHighlightSettings(raw: unknown): EntityHighlightSettings {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rawCategories =
    value.categories && typeof value.categories === 'object'
      ? (value.categories as Record<string, unknown>)
      : {}
  const categories = { ...DEFAULT_ENTITY_HIGHLIGHT_SETTINGS.categories }
  for (const category of ENTITY_HIGHLIGHT_CATEGORIES) {
    if (typeof rawCategories[category] === 'boolean') {
      categories[category] = rawCategories[category] as boolean
    }
  }
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    categories,
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface EntityTextSegment {
  text: string
  entity?: EntityIndexEntry
}

const segmentCache = new WeakMap<EntityIndexEntry[], Map<string, EntityTextSegment[]>>()

/**
 * 只匹配已知实体名 / 别名，长名优先；不做分词、不猜未知名词。
 * 实体数组不变时缓存结果，避免正文每帧重复构建正则。
 */
export function splitEntityText(
  text: string,
  entries: EntityIndexEntry[],
): EntityTextSegment[] {
  if (!text) return []
  let cache = segmentCache.get(entries)
  const cached = cache?.get(text)
  if (cached) return cached
  if (!cache) {
    cache = new Map()
    segmentCache.set(entries, cache)
  }
  const nameMap = new Map<string, EntityIndexEntry>()
  for (const entry of entries) {
    for (const name of [entry.name, ...entry.aliases]) {
      const value = name.trim()
      if (!value) continue
      const key = value.toLowerCase()
      if (!nameMap.has(key)) nameMap.set(key, entry)
    }
  }
  if (nameMap.size === 0) {
    const empty = [{ text }]
    cache.set(text, empty)
    return empty
  }
  const names = [...nameMap.keys()].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`(${names.map(escapeRegExp).join('|')})`, 'gi')
  const parts = text.split(pattern)
  const result = parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      entity: nameMap.get(part.toLowerCase()),
    }))
  if (cache.size > 400) cache.clear()
  cache.set(text, result)
  return result
}

export function categoryColor(category: EntityCategory): string {
  return ENTITY_CATEGORY_COLORS[category]
}
