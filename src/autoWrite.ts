import type {
  AiUsageEntry,
  ApiConfig,
  Chapter,
  FactionCard,
  Prompt,
  Work,
  WorkDetail,
} from './types'
import { buildGenerationMessages, type ChatUsage } from './ai'
import { runApiTask } from './aiTask'
import { characterFromGenerated, requestEntityGenerate } from './entityFill'
import { normalizeFactionProfile } from './factionProfile'
import { normalizeFacilities } from './factionFacilities'
import { requestLinkedItems } from './linkedItems'
import { auditGeneratedText } from './storyAudit'
import { createChapter } from './data'
import { countWords, estimateTokens } from './utils'

export interface AutoWriteReport {
  newCharacters: number
  newFactions: number
  newItems: number
  words: number
  warnings: string[]
  chapterTitle: string
  chapterNumber: number
}

export interface AutoWriteResult {
  detail: WorkDetail
  chapter: Chapter
  isNewChapter: boolean
  report: AutoWriteReport
}

interface AutoWriteInput {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  writingApi: ApiConfig
  generalApi: ApiConfig
  prompts?: Prompt[]
  targetWords?: number
  signal?: AbortSignal
  onChapterStart?: (chapter: Chapter, isNewChapter: boolean) => void
  onChapterDelta?: (chapterId: string, text: string) => void
  onProgress?: (message: string) => void
  onRecordUsage?: (entry: AiUsageEntry) => void
}

function recordUsage(
  api: ApiConfig,
  kind: AiUsageEntry['kind'],
  messages: { content: string }[],
  result: string,
  usage: ChatUsage | undefined,
  onRecordUsage?: (entry: AiUsageEntry) => void,
) {
  if (!onRecordUsage) return
  const inputTokens = usage?.inputTokens ?? estimateTokens(messages.map((message) => message.content).join('\n'))
  const outputTokens = usage?.outputTokens ?? estimateTokens(result)
  const inputPrice = api.inputPrice ?? 0
  const outputPrice = api.outputPrice ?? 0
  const cost =
    (inputPrice > 0 || outputPrice > 0)
      ? (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice
      : undefined
  onRecordUsage({
    id: `auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    at: Date.now(),
    kind,
    model: api.model,
    inputTokens,
    outputTokens,
    cachedInputTokens: usage?.cachedInputTokens,
    cacheWriteTokens: usage?.cacheWriteTokens,
    uncachedInputTokens: usage?.uncachedInputTokens,
    actual: Boolean(usage),
    cost,
    note: '自动写一章',
  })
}

function worldMessages(work: Work): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content:
        '你是长篇小说的世界观设定师。只输出 300–600 字的中文世界观正文，不要标题、不要 JSON、不要分点说明。要写清时代、地点、力量/行业规则、社会结构和当前冲突，必须能直接约束后续剧情。',
    },
    {
      role: 'user',
      content: [
        `作品名：《${work.title}》`,
        work.genres.length ? `题材：${work.genres.join('、')}` : '',
        work.theme ? `主题：${work.theme}` : '',
        work.synopsis ? `简介：${work.synopsis}` : '',
        '请建立这个世界的基本规则。',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ]
}

function factionFromGenerated(
  generated: Record<string, unknown>,
  terms: string,
): FactionCard {
  const stringValue = (key: string, fallback = '') =>
    typeof generated[key] === 'string' ? String(generated[key]).trim() : fallback
  const numberValue = (key: string) =>
    typeof generated[key] === 'number' && generated[key] > 0 ? Math.floor(generated[key] as number) : 0
  const listValue = (key: string): string[] =>
    Array.isArray(generated[key])
      ? generated[key].map((item) => String(item).trim()).filter(Boolean)
      : []
  const members = (key: string): FactionCard['elders'] =>
    Array.isArray(generated[key])
      ? generated[key]
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return null
            const raw = entry as Record<string, unknown>
            const name = typeof raw.name === 'string' ? raw.name.trim() : ''
            if (!name) return null
            return {
              name,
              title: typeof raw.title === 'string' ? raw.title.trim() : '',
              cultivation: typeof raw.cultivation === 'string' ? raw.cultivation.trim() : '',
              description: typeof raw.description === 'string' ? raw.description.trim() : undefined,
              itemNames: Array.isArray(raw.items)
                ? raw.items.map((item) => String(item).trim()).filter(Boolean)
                : [],
            }
          })
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      : []
  return {
    id: `f-auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    name: stringValue('name', `未命名${terms}`),
    type: stringValue('type', terms),
    lifecycle: '未上线',
    tierLevel: 1,
    leader: stringValue('leader'),
    goal: stringValue('goal'),
    description: stringValue('description'),
    location: stringValue('location'),
    founded: stringValue('founded'),
    motto: stringValue('motto'),
    elders: members('elders'),
    mainDisciples: members('mainDisciples'),
    innerDisciples: numberValue('innerDisciples'),
    outerDisciples: numberValue('outerDisciples'),
    menialDisciples: numberValue('menialDisciples'),
    peaks: [],
    facilities: normalizeFacilities(generated.facilities),
    techniques: listValue('techniques'),
    assets: listValue('assets'),
    profile: normalizeFactionProfile(generated.profile),
  }
}

export async function runAutoWriteChapter(input: AutoWriteInput): Promise<AutoWriteResult> {
  const { work, writingApi, generalApi, signal, onProgress, onRecordUsage } = input
  const progress = (message: string) => onProgress?.(message)
  const throwIfAborted = () => {
    if (signal?.aborted) throw new Error('已停止自动写章')
  }

  let detail: WorkDetail = {
    ...input.detail,
    characters: [...(input.detail.characters ?? [])],
    factions: [...(input.detail.factions ?? [])],
    items: [...(input.detail.items ?? [])],
    itemCategories: [...(input.detail.itemCategories ?? [])],
  }
  const newCharacterNames: string[] = []
  const newFactionNames: string[] = []
  let newItems = 0

  progress('检查作品基础设定…')
  if (!detail.worldview.trim()) {
    progress('生成世界观背景…')
    const messages = worldMessages(work)
    let usage: ChatUsage | undefined
    const world = await runApiTask(generalApi, { task: 'writing.continue', messages,
      maxTokens: 1400,
      temperature: 0.75,
      signal,
      onUsage: (value) => {
        usage = value
      },
    })
    throwIfAborted()
    if (world.trim()) {
      detail = { ...detail, worldview: world.trim() }
      recordUsage(generalApi, '实体生成', messages, world, usage, onRecordUsage)
    }
  }

  const targetCharacters = Math.max(2, Math.min(4, work.characterCount || 3))
  while (detail.characters.length < targetCharacters) {
    throwIfAborted()
    progress(`补全角色 ${detail.characters.length + 1} / ${targetCharacters}…`)
    const generated = await requestEntityGenerate({
      kind: 'character',
      work,
      detail,
      hint: [
        `这是自动写作模式，请补全作品《${work.title}》的一位核心角色。`,
        detail.worldview ? `已有世界观：${detail.worldview.slice(0, 1200)}` : '',
        detail.characters.length
          ? `已有角色：${detail.characters.map((character) => character.name).join('、')}；请避免重复，并建立关系。`
          : '这是第一位角色，请让他成为故事主视角。',
        '请一次生成完整档案，必须包含姓名、身份、性格、目标、外貌、背景和 profile 深度档案。',
      ]
        .filter(Boolean)
        .join('\n'),
      api: generalApi,
      onRecordUsage,
    })
    const name =
      typeof generated.name === 'string' && generated.name.trim()
        ? generated.name.trim()
        : `角色 ${detail.characters.length + 1}`
    const character = characterFromGenerated(generated, detail, {
      name,
      lifecycle: '未上线',
    })
    detail = { ...detail, characters: [...detail.characters, character] }
    newCharacterNames.push(character.name)
  }

  if (detail.factions.length === 0) {
    throwIfAborted()
    progress('补全势力…')
    const generated = await requestEntityGenerate({
      kind: 'faction',
      work,
      detail,
      hint: [
        `这是自动写作模式，请为作品《${work.title}》生成一个与现有角色有关联的势力。`,
        detail.worldview ? `已有世界观：${detail.worldview.slice(0, 1200)}` : '',
        detail.characters.length
          ? `已有角色：${detail.characters.map((character) => `${character.name}（${character.identity}）`).join('、')}`
          : '',
        '必须生成 elders 2-4 名、mainDisciples 3-6 名，每人写 name/title/cultivation/description/items；设施 3-6 处。',
      ]
        .filter(Boolean)
        .join('\n'),
      api: generalApi,
      onRecordUsage,
    })
    const faction = factionFromGenerated(generated, work.genres[0] || '势力')
    detail = { ...detail, factions: [...detail.factions, faction] }
    newFactionNames.push(faction.name)
  }

  const itemOwners = detail.characters
    .map((character) => ({
      type: 'character' as const,
      id: character.id,
      name: character.name,
      itemNames: [...(character.weapons ?? []), ...(character.treasures ?? [])].filter(Boolean),
    }))
    .filter((owner) => owner.itemNames.length > 0)
  if (itemOwners.length > 0) {
    throwIfAborted()
    progress('补全随身物品…')
    try {
      const linked = await requestLinkedItems({
        work,
        detail,
        owners: itemOwners,
        api: generalApi,
        onRecordUsage,
      })
      if (linked) {
        newItems = Math.max(0, linked.items.length - (detail.items ?? []).length)
        detail = {
          ...detail,
          items: linked.items,
          itemCategories: linked.categories,
          characters: linked.characters,
          factions: linked.factions,
        }
      }
    } catch {
      // 物品补全失败不阻塞自动写章。
    }
  }

  throwIfAborted()
  const lastChapter = input.chapters.at(-1)
  const isNewChapter = !lastChapter || lastChapter.content.trim().length >= 80
  const chapterNumber = isNewChapter ? input.chapters.length + 1 : input.chapters.length
  const chapter: Chapter = isNewChapter
    ? createChapter(`第 ${chapterNumber} 章`)
    : { ...lastChapter }
  const chapterList = isNewChapter ? [...input.chapters, chapter] : input.chapters
  const directive = [
    `自动推进第 ${chapterNumber} 章：继续当前主线，给本章一个明确推进、一个重要揭示、一个结尾钩子。`,
    input.targetWords ? `本章目标字数：约 ${input.targetWords} 字，允许上下浮动 15%。` : '',
    '不要总结前文，不要重复上一章结尾，不要写标题和说明，直接写正文。',
    '本章必须出现至少一次具体行动、一次人物关系变化和一个未解决的问题。',
  ]
    .filter(Boolean)
    .join('\n')
  progress(`生成第 ${chapterNumber} 章正文…`)
  const messages = buildGenerationMessages({
    work,
    detail,
    chapters: chapterList,
    chapter,
    baseContent: chapter.content,
    directive,
    prompts: input.prompts ?? [],
    reasoningEffort: 'balanced',
    api: writingApi,
  })
  input.onChapterStart?.(chapter, isNewChapter)
  let chapterUsage: ChatUsage | undefined
  let streamedContent = ''
  const content = await runApiTask(writingApi, { task: 'writing.continue', messages,
    maxTokens: input.targetWords
      ? Math.min(16000, Math.max(6000, Math.ceil(input.targetWords * 2.4) + 2400))
      : 8000,
    temperature: 0.85,
    signal,
    onUsage: (value) => {
      chapterUsage = value
    },
    onDelta: (delta) => {
      streamedContent += delta
      input.onChapterDelta?.(chapter.id, streamedContent)
    },
  })
  throwIfAborted()
  const clean = (streamedContent || content).trim()
  if (!clean) throw new Error('模型没有返回本章正文')
  recordUsage(writingApi, '续写', messages, clean, chapterUsage, onRecordUsage)
  const updatedChapter: Chapter = {
    ...chapter,
    content: clean,
    wordCount: countWords(clean),
    summary: clean.replace(/\s+/g, ' ').slice(0, 160),
    status: 'writing',
    updatedAt: Date.now(),
  }
  const warnings = auditGeneratedText({
    text: clean,
    baseContent: chapter.content,
    detail,
    chapters: chapterList,
    chapterId: updatedChapter.id,
  }).map((issue) => issue.title)
  progress('生成完成，正在整理报告…')
  return {
    detail,
    chapter: updatedChapter,
    isNewChapter,
    report: {
      newCharacters: newCharacterNames.length,
      newFactions: newFactionNames.length,
      newItems,
      words: countWords(clean),
      warnings: warnings.slice(0, 5),
      chapterTitle: updatedChapter.title,
      chapterNumber,
    },
  }
}
