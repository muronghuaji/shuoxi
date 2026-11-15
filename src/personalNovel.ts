import type { ChatMessage } from './ai'
import type {
  Chapter,
  PersonalNovelChapterPlan,
  PersonalNovelCharacter,
  PersonalNovelLength,
  PersonalNovelPlan,
} from './types'

export const PERSONAL_NOVEL_LENGTH_OPTIONS: {
  value: PersonalNovelLength
  label: string
  hint: string
}[] = [
  { value: 'short', label: '短篇', hint: '6 章左右，适合睡前一口气读完' },
  { value: 'medium', label: '中篇', hint: '10 章左右，有完整起承转合' },
  { value: 'serial', label: '连载', hint: '12 章起，先写前三章' },
]

export const PERSONAL_NOVEL_TONE_OPTIONS = ['爽', '虐', '悬疑', '治愈', '黑暗'] as const
export const PERSONAL_NOVEL_POV_OPTIONS = ['第三人称', '第一人称', '双视角'] as const
export const PERSONAL_NOVEL_CHAPTER_COUNT_OPTIONS = [1, 3, 5, 10]
export const PERSONAL_NOVEL_WORD_OPTIONS = [1500, 2000, 2888, 4000]

const CHAPTER_TARGETS: Record<PersonalNovelLength, number> = {
  short: 6,
  medium: 10,
  serial: 12,
}

export function personalNovelTargetChapters(length: PersonalNovelLength): number {
  return CHAPTER_TARGETS[length]
}

export function buildPersonalNovelPlanMessages(input: {
  idea: string
  length: PersonalNovelLength
  tone: string
  pov: string
  chapterCount?: number
  targetWords?: number
}): ChatMessage[] {
  const target = Math.max(1, Math.min(20, input.chapterCount ?? personalNovelTargetChapters(input.length)))
  const targetWords = input.targetWords ?? 1500
  return [
    {
      role: 'system',
      content: [
        '你是中文类型小说的故事策划。你只负责设计一个普通读者能读下去的故事方案，不写正文。',
        '只输出一个 JSON 对象，不要 markdown 代码块，不要解释。',
        'JSON 格式：',
        '{"title":"书名","logline":"一句话简介","synopsis":"200字以内故事简介","protagonist":"主角一句话","characters":[{"name":"姓名","role":"身份/定位","goal":"目标","hiddenName":"真实身份名（没有则留空）","revealChapter":0}],"factions":[{"name":"势力名","type":"类型","goal":"目标"}],"realmSchemeName":"境界体系名","realmLevels":["境界1","境界2","境界3"],"factionTierName":"势力层级名","factionTierLevels":["层级1","层级2","层级3"],"chapters":[{"title":"章节标题","goal":"本章目标","conflict":"核心冲突","hook":"章末钩子"}]}',
        `章节数：必须正好 ${target} 章。`,
        `每章目标字数：约 ${targetWords} 字。`,
        '主角必须有明确欲望，并且有一个具体阻力；每章必须有冲突和结尾钩子。',
        '不要写成设定说明，不要使用“系统流”“金手指”等空泛词代替具体情节。',
        '不要出现露骨色情、未成年性内容、真实人物、仇恨歧视或违法内容。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `我想看的故事：${input.idea.trim()}`,
        `篇幅：${input.length === 'short' ? '短篇' : input.length === 'medium' ? '中篇' : '连载'}`,
        `基调：${input.tone}`,
        `视角：${input.pov}`,
        `计划生成：${target} 章，每章约 ${targetWords} 字`,
      ].join('\n'),
    },
  ]
}

function readString(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

export function parsePersonalNovelPlan(text: string): PersonalNovelPlan | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const raw = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
    const chaptersRaw = Array.isArray(raw.chapters) ? raw.chapters : []
    const chapters: PersonalNovelChapterPlan[] = chaptersRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const value = item as Record<string, unknown>
        const title = readString(value.title, 60)
        if (!title) return null
        return {
          title,
          goal: readString(value.goal, 180),
          conflict: readString(value.conflict, 180),
          hook: readString(value.hook, 180),
        }
      })
      .filter((item): item is PersonalNovelChapterPlan => item !== null)
      .slice(0, 20)
    if (chapters.length < 1) return null
    const parsedCharacters = (Array.isArray(raw.characters) ? raw.characters : [])
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const value = item as Record<string, unknown>
        const name = readString(value.name, 40)
        if (!name) return null
        const hiddenName = readString(value.hiddenName, 40)
        const revealValue = Number(value.revealChapter)
        return {
          name,
          role: readString(value.role, 80),
          goal: readString(value.goal, 120),
          hiddenName: hiddenName || undefined,
          revealChapter:
            Number.isFinite(revealValue) && revealValue > 0
              ? Math.min(20, Math.round(revealValue))
              : undefined,
        }
      })
      .filter((item) => item !== null) as PersonalNovelCharacter[]
    const characters = parsedCharacters.slice(0, 8)
    const title = readString(raw.title, 60)
    const logline = readString(raw.logline, 160)
    if (!title || !logline) return null
    const factions = (Array.isArray(raw.factions) ? raw.factions : [])
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const value = item as Record<string, unknown>
        const name = readString(value.name, 40)
        if (!name) return null
        return {
          name,
          type: readString(value.type, 60),
          goal: readString(value.goal, 120),
        }
      })
      .filter((item): item is { name: string; type: string; goal: string } => item !== null)
      .slice(0, 8)
    const realmLevels = (Array.isArray(raw.realmLevels) ? raw.realmLevels : [])
      .map((item) => readString(item, 30))
      .filter(Boolean)
      .slice(0, 12)
    const factionTierLevels = (Array.isArray(raw.factionTierLevels) ? raw.factionTierLevels : [])
      .map((item) => readString(item, 30))
      .filter(Boolean)
      .slice(0, 12)
    return {
      title,
      logline,
      synopsis: readString(raw.synopsis, 500),
      protagonist: readString(raw.protagonist, 200),
      characters,
      factions,
      realmSchemeName: readString(raw.realmSchemeName, 40),
      realmLevels,
      factionTierName: readString(raw.factionTierName, 40),
      factionTierLevels,
      chapters,
    }
  } catch {
    return null
  }
}

export function buildPersonalNovelChapterMessages(input: {
  plan: PersonalNovelPlan
  chapterIndex: number
  previousChapters: Chapter[]
  targetWords?: number
  brief?: string
}): ChatMessage[] {
  const { plan, chapterIndex, previousChapters } = input
  const targetWords = input.targetWords ?? 1500
  const chapter = plan.chapters[chapterIndex]
  if (!chapter) throw new Error('章节计划不存在')
  const previous = previousChapters
    .slice(0, chapterIndex)
    .map(
      (item, index) =>
        `第 ${index + 1} 章《${item.title}》：${item.content.slice(-1200)}`,
    )
    .join('\n\n')
  return [
    {
      role: 'system',
      content: [
        '你是中文小说作者。请只输出本章正文，不要输出标题、章节号、说明、markdown 或“本章完”。',
        '要求：',
        '1. 直接写场景、动作、对白和人物反应，不要写大纲说明。',
        '2. 主角必须有行动，本章要推进一个具体冲突，并在结尾留下继续读的钩子。',
        '3. 人物称呼、关系和已发生事实必须一致。',
        `4. 本章目标字数约 ${targetWords} 字，允许上下浮动 15%，不要为了凑字数重复内容。`,
        '5. 不写露骨色情、未成年性内容、真实人物、仇恨歧视或违法内容。',
        '6. 不使用“作为一个 AI”“根据设定”等出戏表达。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【故事】《${plan.title}》`,
        `【一句话】${plan.logline}`,
        plan.synopsis ? `【简介】${plan.synopsis}` : '',
        plan.protagonist ? `【主角】${plan.protagonist}` : '',
        plan.characters.length
          ? `【人物】\n${plan.characters
              .map((item) => `${item.name}｜${item.role}｜${item.goal}`)
              .join('\n')}`
          : '',
        chapterIndex > 0 && previous
          ? `【前文结尾】\n${previous}`
          : '【前文】这是故事的第一章。',
        input.brief ? input.brief : '',
        `【本章计划】第 ${chapterIndex + 1} 章《${chapter.title}》`,
        `目标：${chapter.goal}`,
        `冲突：${chapter.conflict}`,
        `结尾钩子：${chapter.hook}`,
        `目标字数：约 ${targetWords} 字。`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

export function cleanPersonalChapterText(text: string): string {
  return text
    .trim()
    .replace(/^```(?:markdown|text)?\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/^#+\s*第\s*\d+\s*章.*$/gm, '')
    .replace(/^第\s*\d+\s*章[：:\s].*$/gm, '')
    .trim()
}

export function buildNextPersonalNovelChapterPlanMessages(input: {
  plan: PersonalNovelPlan
  chapters: Chapter[]
  chapterNumber: number
}): ChatMessage[] {
  const { plan, chapters, chapterNumber } = input
  const previous = chapters
    .slice(-2)
    .map((chapter) => `${chapter.title}：${chapter.content.slice(-1200)}`)
    .join('\n\n')
  return [
    {
      role: 'system',
      content: [
        '你是中文类型小说的故事策划。现在只需要规划下一章，不写正文。',
        '只输出一个 JSON 对象，不要 markdown、不要解释。',
        '格式：{"title":"章节标题","goal":"本章目标","conflict":"核心冲突","hook":"章末钩子"}',
        '这一章必须承接前文，推进主线，并在结尾留下继续读的钩子。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【故事】《${plan.title}》`,
        `【总纲】${plan.logline}`,
        plan.characters.length
          ? `【人物】${plan.characters.map((item) => `${item.name}（${item.role}）`).join('、')}`
          : '',
        previous ? `【最近剧情】\n${previous}` : '',
        `【下一章】第 ${chapterNumber} 章`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

export function parseNextPersonalNovelChapterPlan(
  text: string,
): PersonalNovelChapterPlan | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const raw = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
    const title = readString(raw.title, 60)
    if (!title) return null
    return {
      title,
      goal: readString(raw.goal, 180),
      conflict: readString(raw.conflict, 180),
      hook: readString(raw.hook, 180),
    }
  } catch {
    return null
  }
}
