import type { CharacterCard, WorkDetail } from './types'
import { emptyCharacterProfile } from './characterProfile'
import type { EntityIndexEntry } from './entityIndex'

export interface CharacterAliasOwner {
  id: string
  name: string
  alias: string
}

export interface TemporaryEntityAlias {
  alias: string
  entityId: string
  category: EntityIndexEntry['category']
}

const GENERIC_ADDRESS_TERMS = new Set([
  '师兄',
  '师姐',
  '师弟',
  '师妹',
  '师父',
  '师傅',
  '老师',
  '前辈',
  '晚辈',
  '长老',
  '掌门',
  '宗主',
  '大人',
  '公子',
  '小姐',
  '少爷',
  '姑娘',
  '夫人',
  '先生',
  '主人',
  '陛下',
  '殿下',
  '阁下',
  '道友',
  '阁下',
  '小家伙',
  '小子',
])

function uniqueAliases(aliases: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const alias of aliases) {
    const value = alias.trim()
    const key = value.toLowerCase()
    if (!value || seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function characterAliases(character: CharacterCard): string[] {
  return uniqueAliases(character.profile?.aliases ?? [])
}

function withAliases(character: CharacterCard, aliases: string[]): CharacterCard {
  return {
    ...character,
    profile: {
      ...(character.profile ?? emptyCharacterProfile()),
      aliases,
    },
  }
}

/**
 * 将选中的文字加入目标角色的别名，并从其他角色上移除同一个别名。
 * 返回新的作品详情；调用方保存旧 characters 即可撤销。
 */
export function bindCharacterAlias(
  detail: WorkDetail,
  characterId: string,
  rawAlias: string,
): WorkDetail {
  const alias = cleanAlias(rawAlias)
  if (!alias) return detail
  const target = detail.characters.find((character) => character.id === characterId)
  if (!target) return detail
  const characters = detail.characters.map((character) => {
    const aliases = characterAliases(character)
    const hasAlias = aliases.some((item) => item.toLowerCase() === alias.toLowerCase())
    if (character.id === characterId) {
      return hasAlias ? character : withAliases(character, [...aliases, alias])
    }
    if (!hasAlias) return character
    return withAliases(
      character,
      aliases.filter((item) => item.toLowerCase() !== alias.toLowerCase()),
    )
  })
  return { ...detail, characters }
}

export function removeCharacterAlias(
  detail: WorkDetail,
  characterId: string,
  alias: string,
): WorkDetail {
  const key = alias.trim().toLowerCase()
  return {
    ...detail,
    characters: detail.characters.map((character) => {
      if (character.id !== characterId) return character
      const aliases = characterAliases(character)
      if (!aliases.some((item) => item.toLowerCase() === key)) return character
      return withAliases(
        character,
        aliases.filter((item) => item.toLowerCase() !== key),
      )
    }),
  }
}

export function findCharacterAliasOwner(
  detail: WorkDetail,
  rawAlias: string,
): CharacterAliasOwner | null {
  const alias = cleanAlias(rawAlias)
  if (!alias) return null
  const key = alias.toLowerCase()
  for (const character of detail.characters) {
    const aliases = characterAliases(character)
    if (
      character.name.toLowerCase() === key ||
      aliases.some((item) => item.toLowerCase() === key)
    ) {
      return { id: character.id, name: character.name, alias }
    }
  }
  return null
}

export function cleanAlias(raw: string): string {
  const value = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/^[\s"'“”‘’《》「」【】（）()，。！？、；：]+/, '')
    .replace(/[\s"'“”‘’《》「」【】（）()，。！？、；：]+$/, '')
    .trim()
  if (!value || value.length > 20) return ''
  return value
}

export function isGenericAddressTerm(raw: string): boolean {
  return GENERIC_ADDRESS_TERMS.has(cleanAlias(raw))
}

export function mergeTemporaryAliases(
  entries: EntityIndexEntry[],
  bindings: TemporaryEntityAlias[],
): EntityIndexEntry[] {
  if (bindings.length === 0) return entries
  const targets: EntityIndexEntry[] = []
  const targetKeys = new Set<string>()
  for (const binding of bindings) {
    const key = `${binding.category}:${binding.entityId}`
    if (targetKeys.has(key)) continue
    const entry = entries.find(
      (item) => item.category === binding.category && item.id === binding.entityId,
    )
    if (!entry) continue
    targetKeys.add(key)
    targets.push({
      ...entry,
      aliases: uniqueAliases([...entry.aliases, binding.alias]),
    })
  }
  return [...targets, ...entries.filter((entry) => !targetKeys.has(`${entry.category}:${entry.id}`))]
}
