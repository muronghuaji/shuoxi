import type { WorkDetail } from './types'
import { selectFocusCharacters } from './characterProfile'
import { factionMentioned } from './factionProfile'

export interface SyncScopeSummary {
  characters: number
  factions: number
  items: number
  species: number
  locations: number
  foreshadowings: number
  relationships: number
}

function mention(text: string, value: string | undefined): boolean {
  const name = value?.trim()
  return Boolean(name && name.length >= 2 && text.includes(name))
}

/**
 * 日常同步只带本章相关实体，避免把全书设定全部塞进上下文。
 * 这里仍然保留一跳关系、所属势力、相关物品和伏笔，避免裁得太狠漏关键状态。
 */
export function selectScopedSyncDetail(detail: WorkDetail, content: string): WorkDetail {
  const focusCharacters = selectFocusCharacters(detail, content, 12)
  const fallbackCharacters =
    focusCharacters.length > 0 ? focusCharacters : detail.characters.slice(-5)
  const directCharacterIds = new Set(fallbackCharacters.map((character) => character.id))
  const characterIds = new Set(directCharacterIds)
  for (const relationship of detail.relationships ?? []) {
    if (characterIds.has(relationship.fromId)) characterIds.add(relationship.toId)
    if (characterIds.has(relationship.toId)) characterIds.add(relationship.fromId)
  }
  const characters = detail.characters.filter((character) => characterIds.has(character.id))

  const factionIds = new Set<string>()
  for (const faction of detail.factions) {
    if (factionMentioned(faction, content)) factionIds.add(faction.id)
  }
  for (const character of characters) {
    if (directCharacterIds.has(character.id) && character.sectId) factionIds.add(character.sectId)
  }
  const factions = detail.factions.filter((faction) => factionIds.has(faction.id))

  const itemIds = new Set<string>()
  for (const character of characters) {
    if (!directCharacterIds.has(character.id)) continue
    for (const entry of character.inventory ?? []) itemIds.add(entry.itemId)
  }
  const items = (detail.items ?? []).filter(
    (item) => itemIds.has(item.id) || mention(content, item.name),
  )

  const speciesIds = new Set(
    characters
      .filter((character) => directCharacterIds.has(character.id))
      .map((character) => character.speciesId)
      .filter((id): id is string => Boolean(id)),
  )
  const species = (detail.species ?? []).filter(
    (entry) => speciesIds.has(entry.id) || mention(content, entry.name),
  )

  const locations = (detail.locations ?? []).filter((location) => mention(content, location.name))

  const matchedForeshadowings = detail.foreshadowings.filter(
    (item) => mention(content, item.title) || (item.note ? mention(content, item.note.slice(0, 20)) : false),
  )
  const unresolved = detail.foreshadowings
    .filter((item) => item.status === '未回收' && !matchedForeshadowings.includes(item))
    .slice(-6)
  const foreshadowings = [...matchedForeshadowings, ...unresolved]

  const relationships = (detail.relationships ?? []).filter(
    (relationship) =>
      characterIds.has(relationship.fromId) && characterIds.has(relationship.toId),
  )

  const moduleData = Object.fromEntries(
    Object.entries(detail.moduleData ?? {}).map(([moduleId, records]) => [
      moduleId,
      records.filter((record) => mention(content, record.title)).slice(0, 20),
    ]),
  )

  return {
    ...detail,
    characters,
    factions,
    items,
    species,
    locations,
    foreshadowings,
    relationships,
    moduleData,
  }
}

export function syncScopeSummary(detail: WorkDetail): SyncScopeSummary {
  return {
    characters: detail.characters.length,
    factions: detail.factions.length,
    items: (detail.items ?? []).length,
    species: (detail.species ?? []).length,
    locations: (detail.locations ?? []).length,
    foreshadowings: detail.foreshadowings.length,
    relationships: (detail.relationships ?? []).length,
  }
}
