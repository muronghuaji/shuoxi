import type { Chapter, CharacterCard, WorkDetail } from './types'
import { characterMentioned, normalizeCharacterProfile } from './characterProfile'
import { resolveStoryThreads } from './storyState'

export interface WritingAnchors {
  section: string
  characterIds: Set<string>
  factionIds: Set<string>
}

function uniqueCharacters(characters: CharacterCard[]): CharacterCard[] {
  const seen = new Set<string>()
  return characters.filter((character) => {
    if (seen.has(character.id)) return false
    seen.add(character.id)
    return true
  })
}

/**
 * 长篇稳定性兜底：不管上下文预算怎么裁，都保留视角人物、上一章在场人物、
 * 当前所在地和主线。这个段落不参与低优先级裁剪。
 */
export function buildWritingAnchors(
  detail: WorkDetail,
  chapters: Chapter[],
  chapter: Chapter,
): WritingAnchors {
  const index = chapters.findIndex((item) => item.id === chapter.id)
  const previous = index > 0 ? chapters[index - 1] : undefined
  const profiles = detail.characters.map((character) => ({
    character,
    profile: normalizeCharacterProfile(character.profile),
  }))
  const pov = profiles
    .filter((item) => item.profile.meta.pov)
    .map((item) => item.character)
  const core = profiles
    .filter(
      (item) =>
        item.profile.meta.importance === 'core' &&
        !pov.some((character) => character.id === item.character.id),
    )
    .map((item) => item.character)
  const base = uniqueCharacters([...pov, ...core]).slice(0, pov.length > 0 ? 3 : 2)
  const previousParticipants = previous
    ? detail.characters.filter((character) => characterMentioned(character, previous.content)).slice(0, 6)
    : []
  const all = uniqueCharacters([...base, ...previousParticipants])
  const characterIds = new Set(all.map((character) => character.id))
  const factionIds = new Set(
    all
      .map((character) => character.sectId)
      .filter((id): id is string => Boolean(id)),
  )

  const lines: string[] = ['【连续性锚点】（每场都必须保持一致，不能遗忘）']
  if (base.length > 0) {
    lines.push('【视角 / 核心角色】')
    for (const character of base) {
      const profile = normalizeCharacterProfile(character.profile)
      const facts = [
        character.name || '未命名',
        character.status ? `状态：${character.status}` : '',
        profile.dynamic.mood ? `情绪：${profile.dynamic.mood}` : '',
        profile.dynamic.location ? `位置：${profile.dynamic.location}` : '',
        profile.dynamic.currentGoal || character.goal
          ? `当前目标：${profile.dynamic.currentGoal || character.goal}`
          : '',
        profile.dynamic.injuries ? `伤势：${profile.dynamic.injuries}` : '',
      ].filter(Boolean)
      lines.push(`- ${facts.join('｜')}`)
    }
  }
  const previousOnly = previousParticipants.filter(
    (character) => !base.some((item) => item.id === character.id),
  )
  if (previousOnly.length > 0) {
    lines.push('【上一章在场，不能突然不认识】')
    lines.push(`- ${previousOnly.map((character) => character.name || '未命名').join('、')}`)
  }

  const locations = new Set<string>()
  for (const character of all) {
    const location = normalizeCharacterProfile(character.profile).dynamic.location
    if (location) locations.add(location)
  }
  if (locations.size > 0) {
    lines.push('【当前地点】')
    lines.push(`- ${[...locations].slice(0, 3).join('、')}`)
  }

  const mainThreads = resolveStoryThreads(detail)
    .filter((thread) => thread.status === 'open' && thread.priority === 'main')
    .slice(0, 5)
  if (mainThreads.length > 0) {
    lines.push('【主线不能丢】')
    for (const thread of mainThreads) lines.push(`- ${thread.text}`)
  }

  return {
    section: lines.length > 1 ? lines.join('\n') : '',
    characterIds,
    factionIds,
  }
}
