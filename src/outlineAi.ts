import type {
  Chapter,
  GlobalOutline,
  OutlineCard,
  Work,
  WorkDetail,
} from './types'
import type { ChatMessage } from './ai'
import { resolveWorldTemplate } from './worldTemplates'

export interface GeneratedChapterOutline {
  title: string
  summary: string
  goal: string
  conflict: string
  targetWords: number
  arcIndex: number
  povName: string
  locationName: string
  foreshadowName: string
}

export interface GeneratedOutline {
  globalOutline: GlobalOutline
  chapters: GeneratedChapterOutline[]
}

function compact(value: string, limit: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, limit)
}

export function buildOutlineGenerateMessages(input: {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  requirement: string
  chapterCount: number
}): ChatMessage[] {
  const { work, detail, chapters, requirement, chapterCount } = input
  const template = resolveWorldTemplate(detail)
  return [
    {
      role: 'system',
      content: [
        '你是中文长篇小说的大纲策划。根据作品设定生成可执行的分卷结构和章节大纲。',
        '只输出一个合法 JSON 对象，不要 Markdown、不要解释。',
        '必须尊重已有设定和角色，不要凭空改世界观；不要写正文。',
        '格式：',
        '{"global":{"premise":"一句话主线","theme":"主题","conflict":"主要矛盾","structure":"结构","arcs":[{"title":"卷/阶段名","goal":"阶段目标","keyEvents":"关键事件","endState":"阶段结束状态"}],"turningPoints":"关键转折","ending":"结局方向","mustResolve":"必须回收的线","rules":"不能违背的规则","notes":"计划备注"},"chapters":[{"title":"章节名","summary":"本章发生什么","goal":"本章目标","conflict":"核心冲突","targetWords":2000,"arcIndex":1,"pov":"视角人物名","location":"主要地点名","foreshadow":"关联伏笔名"}]}',
        '章节卡必须能直接指导正文写作：summary 具体、有事件和转折；goal 是本章必须完成的推进；conflict 是人与人的冲突和代价。',
        'arcIndex 从 1 开始，对应 global.arcs 的顺序；没有明确分卷时也要给 1。',
        'pov / location / foreshadow 只能用已有实体名称，没有就填空字符串。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】《${work.title}》｜${work.genres.join('、') || '未定题材'}｜${work.theme || '主题未定'}｜${work.status}`,
        `【简介】${work.synopsis || '未填写'}`,
        `【世界观】${compact(detail.worldview, 1200) || '未填写'}`,
        `【人物】${detail.characters.map((item) => `${item.name}（${item.role || '角色'}）`).join('、') || '暂无'}`,
        `【势力】${detail.factions.map((item) => item.name).join('、') || '暂无'}`,
        `【已有章节】${chapters.slice(-30).map((item, index) => `${index + 1}.${item.title || '未命名'}`).join('、') || '暂无'}`,
        `【已有大纲】${(detail.outline ?? []).length} 章；已有分卷：${(detail.globalOutline?.arcs ?? []).map((arc) => arc.title).join('、') || '无'}`,
        template.story
          ? `【题材模板】${template.name}；故事引擎：${template.story.engine}；承诺：${template.story.promise}；角色功能：${template.story.roleSlots.join('、')}；节奏节点：${template.story.beats.join('、')}；禁忌：${template.story.pitfalls.join('、')}`
          : `【题材模板】${template.name}`,
        `【本次要求】${requirement.trim() || '按作品设定生成完整可写的卷结构和章节大纲。'}`,
        `【生成章节数】${Math.max(3, Math.min(30, chapterCount))} 章`,
        '请输出 JSON。',
      ].join('\n\n'),
    },
  ]
}

function jsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = cleaned.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  let end = -1
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  if (end <= start) return null
  const raw = cleaned.slice(start, end + 1)
  for (const attempt of [raw, raw.replace(/,\s*([}\]])/g, '$1')]) {
    try {
      const value = JSON.parse(attempt)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>
      }
    } catch {
      // 尝试修复尾逗号。
    }
  }
  return null
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function arcList(value: unknown): GlobalOutline['arcs'] {
  if (!Array.isArray(value)) return []
  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      const title = text(raw.title, 80)
      if (!title) return null
      return {
        id: `arc-gen-${Date.now().toString(36)}-${index}`,
        title,
        goal: text(raw.goal, 300),
        keyEvents: text(raw.keyEvents, 500),
        endState: text(raw.endState, 300),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 12)
}

export function parseGeneratedOutline(textValue: string): GeneratedOutline | null {
  const value = jsonObject(textValue)
  if (!value) return null
  const global = value.global && typeof value.global === 'object'
    ? (value.global as Record<string, unknown>)
    : {}
  const arcs = arcList(global.arcs)
  const globalOutline: GlobalOutline = {
    premise: text(global.premise, 600),
    theme: text(global.theme, 200),
    conflict: text(global.conflict, 500),
    structure: text(global.structure, 800),
    arcs,
    turningPoints: text(global.turningPoints, 800),
    ending: text(global.ending, 600),
    mustResolve: text(global.mustResolve, 600),
    rules: text(global.rules, 600),
    notes: text(global.notes, 800),
  }
  const chaptersRaw = Array.isArray(value.chapters) ? value.chapters : []
  const chapters = chaptersRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      const title = text(raw.title, 100)
      const summary = text(raw.summary, 500)
      if (!title && !summary) return null
      return {
        title: title || '未命名章节',
        summary,
        goal: text(raw.goal, 500),
        conflict: text(raw.conflict, 400),
        targetWords:
          typeof raw.targetWords === 'number' && raw.targetWords > 0
            ? Math.min(20000, Math.round(raw.targetWords))
            : 2000,
        arcIndex:
          typeof raw.arcIndex === 'number' && raw.arcIndex > 0
            ? Math.min(arcs.length || 1, Math.round(raw.arcIndex))
            : 1,
        povName: text(raw.pov, 80),
        locationName: text(raw.location, 80),
        foreshadowName: text(raw.foreshadow, 100),
      }
    })
    .filter((item): item is GeneratedChapterOutline => item !== null)
    .slice(0, 30)
  if (!globalOutline.premise && chapters.length === 0) return null
  return { globalOutline, chapters }
}

export function generatedOutlineToCards(
  generated: GeneratedOutline,
  detail: WorkDetail,
): OutlineCard[] {
  const arcIds = generated.globalOutline.arcs.map((arc) => arc.id)
  return generated.chapters.map((chapter, index) => {
    const arcId = arcIds[Math.min(arcIds.length - 1, Math.max(0, chapter.arcIndex - 1))]
    const character = detail.characters.find((item) => item.name === chapter.povName)
    const location = (detail.locations ?? []).find((item) => item.name === chapter.locationName)
    const foreshadow = detail.foreshadowings.find((item) => item.title === chapter.foreshadowName)
    return {
      id: `o-gen-${Date.now().toString(36)}-${index}`,
      title: chapter.title,
      summary: chapter.summary,
      goal: chapter.goal,
      conflict: chapter.conflict,
      status: '待写',
      targetWords: chapter.targetWords,
      arcId,
      povCharacterId: character?.id,
      locationIds: location ? [location.id] : [],
      foreshadowingIds: foreshadow ? [foreshadow.id] : [],
    }
  })
}

export function mergeGlobalOutline(
  current: GlobalOutline,
  generated: GlobalOutline,
): GlobalOutline {
  const nonEmpty = (existing: string, next: string) => existing.trim() || next
  return {
    premise: nonEmpty(current.premise, generated.premise),
    theme: nonEmpty(current.theme, generated.theme),
    conflict: nonEmpty(current.conflict, generated.conflict),
    structure: nonEmpty(current.structure, generated.structure),
    arcs: [...current.arcs, ...generated.arcs],
    turningPoints: nonEmpty(current.turningPoints, generated.turningPoints),
    ending: nonEmpty(current.ending, generated.ending),
    mustResolve: nonEmpty(current.mustResolve, generated.mustResolve),
    rules: nonEmpty(current.rules, generated.rules),
    notes: nonEmpty(current.notes, generated.notes),
  }
}
