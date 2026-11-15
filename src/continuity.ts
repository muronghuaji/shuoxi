import type { Chapter, WorkDetail } from './types'

export type ContinuityWarningType = 'dead-character' | 'lost-item'

export interface ContinuityWarning {
  id: string
  type: ContinuityWarningType
  title: string
  detail: string
  chapterId?: string
}

const DEAD_STATUS = /(已死|死亡|身亡|阵亡|殒命|陨落|身死|死了)/

function chapterIndexOf(chapters: Chapter[], chapterId: string): number {
  return chapters.findIndex((chapter) => chapter.id === chapterId)
}

export function checkContinuity(detail: WorkDetail, chapters: Chapter[]): ContinuityWarning[] {
  const warnings: ContinuityWarning[] = []
  const events = detail.storyStateEvents ?? []

  const deadAt = new Map<string, { chapterId: string; value: string }>()
  const lostAt = new Map<string, { chapterId: string; value: string }>()

  for (const event of events) {
    for (const change of event.changes) {
      if (change.entityType !== 'character') continue
      if (change.field === 'status' && DEAD_STATUS.test(change.value)) {
        deadAt.set(change.entityId, { chapterId: event.chapterId, value: change.value })
      }
      if (
        (change.field === 'weapons' || change.field === 'treasures') &&
        change.action === 'remove' &&
        change.value
      ) {
        lostAt.set(`${change.entityId}:${change.value}`, {
          chapterId: event.chapterId,
          value: change.value,
        })
      }
    }
  }

  for (const [characterId, death] of deadAt) {
    const character = detail.characters.find((item) => item.id === characterId)
    if (!character?.name) continue
    const deathIndex = chapterIndexOf(chapters, death.chapterId)
    if (deathIndex < 0) continue
    chapters.forEach((chapter, index) => {
      if (index <= deathIndex) return
      if (chapter.content.includes(character.name)) {
        warnings.push({
          id: `dead-${characterId}-${chapter.id}`,
          type: 'dead-character',
          title: `${character.name} 在死亡章节之后再次出现`,
          detail: `第 ${deathIndex + 1} 章记录“${death.value}”，但第 ${index + 1} 章正文仍出现该角色。`,
          chapterId: chapter.id,
        })
      }
    })
  }

  for (const [key, lost] of lostAt) {
    const characterId = key.split(':')[0]
    const character = detail.characters.find((item) => item.id === characterId)
    if (!character?.name) continue
    const lostIndex = chapterIndexOf(chapters, lost.chapterId)
    if (lostIndex < 0) continue
    chapters.forEach((chapter, index) => {
      if (index <= lostIndex) return
      if (chapter.content.includes(lost.value)) {
        warnings.push({
          id: `item-${key}-${chapter.id}`,
          type: 'lost-item',
          title: `${lost.value} 失去后再次出现`,
          detail: `第 ${lostIndex + 1} 章记录“${character.name} 移除 ${lost.value}”，但第 ${index + 1} 章仍出现该物品。`,
          chapterId: chapter.id,
        })
      }
    })
  }

  return warnings
}
