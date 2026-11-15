import type { EntityLifecycle, WorkDetail } from './types'

export const DEAD_PATTERN =
  /死亡|已死|身亡|殒命|陨落|阵亡|战死|毙命|下线|退场|离世|身死|魂飞魄散/i
export const REVIVE_PATTERN = /复活|重生|归来|回归|重新出现|再度现身|死而复生/i
export const DISSOLVED_PATTERN = /覆灭|灭门|解散|瓦解|衰败|名存实亡|除名/i
export const DESTROYED_PATTERN = /毁坏|碎裂|销毁|丢失|失传|损毁|化为灰烬/i
export const EXTINCT_PATTERN = /灭绝|绝迹|消亡|不复存在/i

function namesOf(value: { name: string; aliases?: string[] }): string[] {
  return [value.name, ...(value.aliases ?? [])].map((name) => name.trim()).filter(Boolean)
}

function withLifecycle<T extends { lifecycle?: EntityLifecycle }>(
  item: T,
  lifecycle: EntityLifecycle,
): T {
  return item.lifecycle === lifecycle ? item : { ...item, lifecycle }
}

function appearsInContent(names: string[], content: string): boolean {
  return names.some((name) => content.includes(name))
}

function appearsWithPattern(names: string[], content: string, pattern: RegExp): boolean {
  return names.some((name) => {
    let index = content.indexOf(name)
    while (index >= 0) {
      const context = content.slice(Math.max(0, index - 60), index + name.length + 90)
      if (pattern.test(context)) return true
      index = content.indexOf(name, index + 1)
    }
    return false
  })
}

/**
 * 正文同步后的上线状态推断：
 * - 名字出现在本章正文中，默认视为已上线；
 * - 正文明确死亡 / 退场 / 覆灭 / 毁坏 / 灭绝时，转为已下线；
 * - 已下线的角色再次出现并使用复活 / 重生 / 归来等词时，回到已上线。
 * 没有出现在本章正文中的实体保持原状态；新生成实体默认未上线。
 */
export function applyLifecycleFromChapter(detail: WorkDetail, content: string): WorkDetail {
  const text = content.trim()
  if (!text) return detail
  const characters = detail.characters.map((character) => {
    const names = namesOf({
      name: character.name,
      aliases: character.profile?.aliases,
    })
    if (!appearsInContent(names, text)) {
      // 本章没有同步到、也没有再出现：默认未上线；明确下线的角色保持下线。
      return character.lifecycle === '已下线'
        ? character
        : withLifecycle(character, '未上线')
    }
    if (appearsWithPattern(names, text, REVIVE_PATTERN)) {
      return withLifecycle(character, '已上线')
    }
    if (
      appearsWithPattern(names, text, DEAD_PATTERN) ||
      (character.status && DEAD_PATTERN.test(character.status))
    ) {
      return withLifecycle(character, '已下线')
    }
    return withLifecycle(character, '已上线')
  })
  const factions = detail.factions.map((faction) => {
    if (!appearsInContent([faction.name], text)) {
      return faction.lifecycle === '已下线'
        ? faction
        : withLifecycle(faction, '未上线')
    }
    if (appearsWithPattern([faction.name], text, DISSOLVED_PATTERN)) {
      return withLifecycle(faction, '已下线')
    }
    return withLifecycle(faction, '已上线')
  })
  const items = (detail.items ?? []).map((item) => {
    if (!appearsInContent([item.name], text)) {
      return item.lifecycle === '已下线' ? item : withLifecycle(item, '未上线')
    }
    if (appearsWithPattern([item.name], text, DESTROYED_PATTERN)) {
      return withLifecycle(item, '已下线')
    }
    return withLifecycle(item, '已上线')
  })
  const species = (detail.species ?? []).map((item) => {
    if (!appearsInContent([item.name], text)) {
      return item.lifecycle === '已下线' ? item : withLifecycle(item, '未上线')
    }
    if (appearsWithPattern([item.name], text, EXTINCT_PATTERN)) {
      return withLifecycle(item, '已下线')
    }
    return withLifecycle(item, '已上线')
  })
  return { ...detail, characters, factions, items, species }
}
