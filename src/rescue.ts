import type { ChatMessage } from './ai'
import type {
  Chapter,
  RescueAnalysis,
  RescueChapterDraft,
  RescuePlan,
  RescuePlanChapter,
  Work,
  WorkDetail,
} from './types'
import { countWords } from './utils'
import { formatStyleCard } from './styleProfile'

export interface RescueStats {
  chapters: number
  words: number
  lastChapterTitle: string
  lastChapterWords: number
  lastChapterTail: string
}

export interface RescueBatch {
  index: number
  startChapter: number
  endChapter: number
  chapters: Chapter[]
}

export type RescueDepth = 'quick' | 'full'

function clip(value: string, limit: number): string {
  const clean = value.replace(/\r\n/g, '\n').trim()
  if (clean.length <= limit) return clean
  return `${clean.slice(0, limit)}…`
}

function chapterWords(chapter: Chapter): number {
  return chapter.wordCount ?? countWords(chapter.content)
}

export function getRescueStats(chapters: Chapter[]): RescueStats {
  const withContent = chapters
    .map((chapter, index) => ({ chapter, index }))
    .filter((item) => item.chapter.content.trim())
  const lastItem = withContent.at(-1)
  const last = lastItem?.chapter ?? chapters.at(-1)
  return {
    chapters: chapters.length,
    words: chapters.reduce((sum, chapter) => sum + chapterWords(chapter), 0),
    lastChapterTitle: last?.title || (lastItem ? `第 ${lastItem.index + 1} 章` : ''),
    lastChapterWords: last ? chapterWords(last) : 0,
    lastChapterTail: last ? clip(last.content, 800) : '',
  }
}

export function buildRescueBatches(chapters: Chapter[], maxBatches = 20): RescueBatch[] {
  if (chapters.length === 0) return []
  const batchSize = Math.min(40, Math.max(6, Math.ceil(chapters.length / maxBatches)))
  const batches: RescueBatch[] = []
  for (let start = 0; start < chapters.length; start += batchSize) {
    const slice = chapters.slice(start, start + batchSize)
    batches.push({
      index: batches.length,
      startChapter: start + 1,
      endChapter: start + slice.length,
      chapters: slice,
    })
  }
  return batches
}

function chapterDigest(chapter: Chapter, index: number): string {
  return `【第 ${index + 1} 章 ${chapter.title || '未命名'}】\n${clip(chapter.content, 650)}`
}

function recentExcerpts(chapters: Chapter[], count = 5): string {
  return chapters
    .map((chapter, index) => ({ chapter, index }))
    .filter((item) => item.chapter.content.trim())
    .slice(-count)
    .map((item) => chapterDigest(item.chapter, item.index))
    .join('\n\n')
}

function titleIndex(chapters: Chapter[]): string {
  const titles = chapters.map((chapter, index) => `${index + 1}. ${chapter.title || '未命名章节'}`)
  if (titles.length <= 80) return titles.join('\n')
  return [...titles.slice(0, 40), `……共 ${titles.length} 章……`, ...titles.slice(-40)].join('\n')
}

function styleBrief(detail: WorkDetail): string {
  const style = detail.style
  if (!style) return '未设置写作风格'
  return formatStyleCard(style).slice(0, 1600)
}

function entityBrief(detail: WorkDetail): string {
  const characters = detail.characters.slice(0, 12).map((character) => {
    const species = detail.species?.find((item) => item.id === character.speciesId)?.name
    return `${character.name}（${character.role || character.identity || '角色'}${species ? `｜${species}` : ''}）：${clip(character.goal || character.personality || character.background || '未写当前目标', 120)}`
  })
  const factions = detail.factions.slice(0, 8).map(
    (faction) => `${faction.name}（${faction.type || '势力'}）：${clip(faction.goal || faction.description || '未写当前状态', 100)}`,
  )
  const foreshadows = detail.foreshadowings
    .filter((item) => item.status !== '已回收')
    .slice(0, 12)
    .map((item) => `${item.title}（${item.status}）`)
  const threads = (detail.storyThreads ?? [])
    .filter((item) => item.status === 'open')
    .slice(0, 12)
    .map((item) => item.text)
  const events = (detail.storyStateEvents ?? [])
    .slice(-20)
    .map((event) => `${event.chapterTitle}：${clip(event.summary, 100)}`)
  return [
    characters.length ? `人物：\n${characters.join('\n')}` : '',
    factions.length ? `势力：\n${factions.join('\n')}` : '',
    foreshadows.length ? `未回收伏笔：${foreshadows.join('、')}` : '',
    threads.length ? `未解决故事线：${threads.join('；')}` : '',
    events.length ? `最近事件：${events.join('；')}` : '',
    detail.currentSummary ? `已有当前剧情摘要：${clip(detail.currentSummary, 1000)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function buildRescueContext(input: {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  depth: RescueDepth
  fullSummaries?: string
}): string {
  const { work, detail, chapters, depth, fullSummaries } = input
  const stats = getRescueStats(chapters)
  return [
    `作品：《${work.title}》｜${work.genres.join('、') || '未定题材'}｜${work.theme || '主题未定'}`,
    work.synopsis ? `简介：${clip(work.synopsis, 500)}` : '',
    `规模：${stats.chapters} 章 / ${stats.words.toLocaleString()} 字`,
    `【章节标题索引】\n${titleIndex(chapters)}`,
    `【最近正文】\n${recentExcerpts(chapters)}`,
    `【人物与线索】\n${entityBrief(detail) || '暂无结构化设定'}`,
    `【文风】\n${styleBrief(detail)}`,
    depth === 'full' && fullSummaries
      ? `【全书分批梳理】\n${clip(fullSummaries, 16000)}`
      : '',
    `【最后一章结尾】\n${stats.lastChapterTail}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function buildRescueAnalysisMessages(input: {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  depth: RescueDepth
  fullSummaries?: string
}): ChatMessage[] {
  const schema =
    '{"currentSituation":"当前故事进行到哪里，主要人物现在在做什么","characters":[{"name":"","state":"","goal":""}],"openThreads":["未回收伏笔和未完成故事线"],"lastHook":"最后一章留下的钩子","voice":"叙事视角、句式、文风特征","risks":["继续写最容易崩的地方"],"direction":"最适合的续写方向，一到两句话"}'
  return [
    {
      role: 'system',
      content: [
        '你是中文长篇小说「续写救援」诊断师。你的任务不是写正文，而是先读懂作品，判断如何从最后一章自然续写。',
        '只输出一个合法 JSON 对象，不要 markdown、不要解释、不要前后缀。',
        '只根据提供的正文和设定判断，不要编造不存在的剧情。',
        'openThreads 必须具体，写清是谁 / 什么事 / 为什么还没结束。',
        'risks 写继续写会出现的具体问题，不要写空泛的“人物要立体”。',
        'direction 给出一个可执行的方向，不要给多个互相冲突的方案。',
        `字段格式：${schema}`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【分析深度】${input.depth === 'full' ? '全书分批梳理 + 最近正文' : '最近正文 + 全书标题索引'}`,
        buildRescueContext(input),
        '请输出续写救援诊断 JSON。',
      ].join('\n\n'),
    },
  ]
}

function jsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(/[；;\n]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

export function parseRescueAnalysis(
  text: string,
  depth: RescueDepth,
): RescueAnalysis | null {
  const value = jsonObject(text)
  if (!value) return null
  const characters = Array.isArray(value.characters)
    ? value.characters
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const record = item as Record<string, unknown>
          const name = stringValue(record.name)
          if (!name) return null
          return {
            name,
            state: stringValue(record.state),
            goal: stringValue(record.goal),
          }
        })
        .filter((item): item is RescueAnalysis['characters'][number] => Boolean(item))
        .slice(0, 12)
    : []
  const currentSituation = stringValue(value.currentSituation)
  if (!currentSituation) return null
  return {
    currentSituation,
    characters,
    openThreads: stringList(value.openThreads).slice(0, 16),
    lastHook: stringValue(value.lastHook),
    voice: stringValue(value.voice),
    risks: stringList(value.risks).slice(0, 10),
    direction: stringValue(value.direction),
    depth,
    createdAt: Date.now(),
  }
}

export function buildRescuePlanMessages(input: {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  analysis: RescueAnalysis
  direction?: string
}): ChatMessage[] {
  const schema =
    '{"chapters":[{"title":"","goal":"","conflict":"","reveal":"","hook":"","threads":["回收的伏笔或推进的线"]}]}'
  return [
    {
      role: 'system',
      content: [
        '你是中文长篇小说「续写救援」大纲师。根据现有作品和诊断，规划接下来的 3 章。',
        '只输出一个合法 JSON 对象，不要 markdown、不要解释。',
        '每章必须有明确目标、冲突、信息变化和章末钩子；不要连续三章都在铺垫。',
        '优先处理最危险的未回收线索，不要凭空引入大量新设定。',
        `字段格式：${schema}`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        buildRescueContext({ work: input.work, detail: input.detail, chapters: input.chapters, depth: 'quick' }),
        `【诊断】\n${JSON.stringify(input.analysis, null, 2)}`,
        input.direction ? `【作者方向】${input.direction}` : '【作者方向】自然延续当前主线。',
        '请输出 3 章救援大纲 JSON。',
      ].join('\n\n'),
    },
  ]
}

export function parseRescuePlan(text: string, direction: string): RescuePlan | null {
  const value = jsonObject(text)
  if (!value || !Array.isArray(value.chapters)) return null
  const chapters: RescuePlanChapter[] = value.chapters
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const title = stringValue(record.title)
      if (!title) return null
      return {
        title,
        goal: stringValue(record.goal),
        conflict: stringValue(record.conflict),
        reveal: stringValue(record.reveal),
        hook: stringValue(record.hook),
        threads: stringList(record.threads).slice(0, 6),
      }
    })
    .filter((item): item is RescuePlanChapter => Boolean(item))
    .slice(0, 4)
  if (chapters.length === 0) return null
  return { chapters, direction, createdAt: Date.now() }
}

export function buildRescueChapterMessages(input: {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  analysis: RescueAnalysis
  plan?: RescuePlan
  direction?: string
}): ChatMessage[] {
  const nextNumber = input.chapters.length + 1
  const plan = input.plan?.chapters[0]
  return [
    {
      role: 'system',
      content: [
        '你是中文小说续写作者。现在只写下一章，不写大纲、不写解释。',
        '第一行输出「标题：章节标题」，空一行后输出正文。不要 markdown、不要代码块。',
        '正文约 2000–2800 个汉字；保持原作叙事人称、语气、句式和对白习惯。',
        '必须承接最后一章的结尾钩子，优先推进诊断中最危险的未回收线索。',
        '不要重新介绍已经介绍过的人物，不要总结前文，不要写“本章完”。',
        '不要擅自让主要人物死亡、失忆、出国或时间跳跃，除非前文已经明确铺垫。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】《${input.work.title}》｜${input.work.genres.join('、') || '未定题材'}`,
        buildRescueContext({
          work: input.work,
          detail: input.detail,
          chapters: input.chapters,
          depth: 'quick',
        }),
        `【救援诊断】\n${JSON.stringify(input.analysis, null, 2)}`,
        plan ? `【本章救援大纲】\n${JSON.stringify(plan, null, 2)}` : '',
        input.direction ? `【作者方向】${input.direction}` : '',
        `【任务】写第 ${nextNumber} 章。第一行「标题：…」，空行后写正文。`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

export function parseRescueChapter(text: string, fallbackTitle: string): RescueChapterDraft | null {
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return null
  const lines = clean.split('\n')
  let title = fallbackTitle
  let contentStart = 0
  const first = lines[0]?.trim() ?? ''
  const titleMatch =
    first.match(/^(?:#+\s*)?标题[:：]\s*(.+)$/) ?? first.match(/^#{1,3}\s+(.+)$/)
  if (titleMatch) {
    title = titleMatch[1].trim()
    contentStart = lines.findIndex((line) => line.trim() === '') + 1
    if (contentStart <= 0) contentStart = 1
  }
  if (lines[contentStart]?.trim().match(/^正文[:：]\s*$/)) contentStart += 1
  const content = lines.slice(contentStart).join('\n').trim()
  if (!content) return null
  return { title: title || fallbackTitle, content }
}

export function buildRescueBatchMessages(input: {
  work: Work
  chapters: Chapter[]
  startChapter: number
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是中文小说长篇梳理器。把给定章节压缩成可供后续续写参考的事实摘要。',
        '只输出纯文本，不要 markdown 标题。',
        '每章一行或两行，保留：关键事件、人物状态变化、关系变化、新增伏笔、回收伏笔。',
        '不要评价文笔，不要写建议，不要编造。总字数控制在 500 字以内。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】《${input.work.title}》`,
        `【章节范围】第 ${input.startChapter}–${input.startChapter + input.chapters.length - 1} 章`,
        input.chapters
          .map((chapter, index) => chapterDigest(chapter, input.startChapter - 1 + index))
          .join('\n\n'),
      ].join('\n\n'),
    },
  ]
}

export function parseRescueBatchSummary(text: string): string {
  return clip(text, 4000)
}
