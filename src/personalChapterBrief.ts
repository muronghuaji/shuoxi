import type { Chapter, PersonalNovelPlan, WorkDetail } from './types'
import { buildCharacterAddressBook } from './characterAddress'

export function buildPersonalNovelChapterBrief(input: {
  plan: PersonalNovelPlan
  detail: WorkDetail
  chapters: Chapter[]
  chapterIndex: number
  targetWords?: number
}): string {
  const { plan, detail, chapters, chapterIndex, targetWords } = input
  const chapter = plan.chapters[chapterIndex]
  if (!chapter) return ''

  const recent = chapters
    .slice(Math.max(0, chapterIndex - 3), chapterIndex)
    .map((item) => `- ${item.title}：${item.summary?.trim() || item.content.slice(-500)}`)
    .join('\n')

  const events = (detail.storyStateEvents ?? [])
    .flatMap((entry) => entry.events ?? [])
    .slice(-6)
    .map((event) => `- ${event.title}${event.summary ? '：' + event.summary : ''}`)
    .join('\n')

  const threads = (detail.storyThreads ?? [])
    .filter((thread) => thread.status !== 'resolved')
    .slice(-6)
    .map((thread) => `- ${thread.text}`)
    .join('\n')

  const foreshadows = (detail.foreshadowings ?? [])
    .filter((item) => item.status !== '已回收')
    .slice(-5)
    .map((item) => `- ${item.note || item.title || '未命名伏笔'}`)
    .join('\n')

  const addressBook = buildCharacterAddressBook(detail, chapterIndex)
  const addressById = new Map(addressBook.map((entry) => [entry.id, entry]))
  const characters = detail.characters
    .slice(0, 8)
    .map((character) => {
      const address = addressById.get(character.id)
      return `- ${address?.activeName || character.name}｜${character.role || character.identity || '身份未定'}｜当前目标：${character.goal || '未定'}｜状态：${character.status || '正常'}｜${character.lifecycle ?? '未上线'}`
    })
    .join('\n')

  const addressLines = addressBook
    .filter((entry) => entry.activeName !== entry.name || entry.aliases.length > 0)
    .slice(0, 8)
    .map((entry) => {
      const parts = [`- 旁白当前称「${entry.activeName}」`]
      if (entry.aliases.length) parts.push(`其他称呼：${entry.aliases.join('、')}`)
      if (entry.futureNames.length) parts.push(`未揭露名字：${entry.futureNames.join('、')}（不得提前使用）`)
      return parts.join('；')
    })
    .join('\n')

  const factions = (detail.factions ?? [])
    .slice(0, 6)
    .map(
      (faction) =>
        `- ${faction.name}｜${faction.type || '类型未定'}｜目标：${faction.goal || '未定'}｜${faction.lifecycle ?? '未上线'}`,
    )
    .join('\n')

  const realmScheme = (detail.realmSchemes ?? []).find(
    (scheme) => scheme.id === detail.activeRealmSchemeId,
  )
  const realmText = realmScheme
    ? realmScheme.levels.map((level) => level.name).join('、')
    : ''

  return [
    '【本章写作简报】',
    '这是根据作品详情、已同步事件和前文整理的本章上下文，不是另一份故事方案。',
    '',
    `本章：第 ${chapterIndex + 1} 章《${chapter.title}》`,
    `本章目标：${chapter.goal}`,
    `核心冲突：${chapter.conflict}`,
    `章末钩子：${chapter.hook}`,
    `目标字数：约 ${targetWords ?? 1500} 字`,
    '',
    realmText ? `境界体系：${realmText}` : '',
    characters ? `主要人物：\n${characters}` : '',
    addressLines ? `称呼规范：\n${addressLines}` : '',
    factions ? `势力：\n${factions}` : '',
    recent ? `最近三章摘要：\n${recent}` : '',
    events ? `已发生事件：\n${events}` : '',
    threads ? `未解决事项：\n${threads}` : '',
    foreshadows ? `未回收伏笔：\n${foreshadows}` : '',
    '写作要求：',
    '- 必须遵守以上人物身份、状态和已发生事件。',
    '- 本章只推进本章目标，不要提前解决后续大纲里的核心悬念。',
    '- 保持前文的称呼、语气和世界观，不要复活已死亡角色。',
    '- 如果本章需要新增设定，只能补充，不能推翻已有设定。',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 6000)
}
