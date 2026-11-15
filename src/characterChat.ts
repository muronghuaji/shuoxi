import type {
  Chapter,
  CharacterCard,
  CharacterChatMemory,
  CharacterChatMessage,
  CharacterChatSession,
  CharacterChatSettings,
  CharacterMemoryKind,
  Work,
  WorkDetail,
} from './types'
import type { ChatMessage } from './ai'
import { buildCharacterProfilePrompt } from './characterProfile'
import { emotionPromptSection } from './chatEmotion'
import { buildChatContentPolicy } from './chatContent'
import { proactiveInstruction, type ProactiveReason } from './chatProactive'
import { personaPromptSection } from './chatPersona'

export const CHAT_MEMORY_THRESHOLD = 6
export const MEMORY_KIND_LABELS: Record<CharacterMemoryKind, string> = {
  fact: '事实',
  promise: '约定',
  emotion: '情绪',
  relationship: '关系',
  user: '关于你',
}

function clip(text: string, limit: number): string {
  const value = text.trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

function bullets(items: string[]): string {
  return items.filter(Boolean).map((item) => `- ${item}`).join('\n')
}

export interface CharacterChatContext {
  work: Work
  detail: WorkDetail
  character: CharacterCard
  chapters: Chapter[]
  session: CharacterChatSession
  memories: CharacterChatMemory[]
}

export function chapterCutoffLabel(chapters: Chapter[], cutoff: number): string {
  if (chapters.length === 0) return '尚未开始连载'
  const safe = Math.max(1, Math.min(chapters.length, cutoff))
  return `第 ${safe} 章之前（含第 ${safe} 章）`
}

export function buildCharacterChatMessages(
  context: CharacterChatContext,
  historyLimit = 20,
  contentSettings?: CharacterChatSettings,
  proactive?: { reason: ProactiveReason; followUpIndex: number; followUpLimit: number },
): ChatMessage[] {
  const { work, detail, character, chapters, session, memories } = context
  const safeCutoff = Math.max(1, Math.min(chapters.length || 1, session.chapterCutoff))
  const knownChapters = chapters.slice(0, safeCutoff)
  const recentChapters = knownChapters.slice(-3)
  const knownChapterIds = new Set(knownChapters.map((chapter) => chapter.id))
  const chapterMemories = (detail.chapterMemories ?? [])
    .filter((memory) => knownChapterIds.has(memory.chapterId))
    .slice(-16)
    .map(
      (memory) =>
        `${memory.chapterTitle}：${memory.summary}${
          memory.keyEvents.length ? `；关键事件：${memory.keyEvents.slice(0, 3).join('、')}` : ''
        }`,
    )
  const relatedCharacters = (detail.relationships ?? [])
    .filter((relation) => relation.fromId === character.id || relation.toId === character.id)
    .map((relation) => {
      const otherId = relation.fromId === character.id ? relation.toId : relation.fromId
      const other = (detail.characters ?? []).find((item) => item.id === otherId)
      return `${character.name}与${other?.name ?? '某人'}：${relation.type}${
        relation.note ? `（${relation.note}）` : ''
      }`
    })
  const factions = (detail.factions ?? [])
    .filter((faction) =>
      (detail.characters ?? []).some(
        (item) =>
          item.id === character.id &&
          (item.sectId === faction.id ||
            item.background?.includes(faction.name) ||
            item.identity?.includes(faction.name)),
      ),
    )
    .map((faction) => `${faction.name}（${faction.type}，首领：${faction.leader}）`)
  const memoryText = memories
    .filter((memory) => memory.workId === work.id && memory.characterId === character.id)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
    .slice(0, 30)
    .map((memory) => memory.text)

  const system = [
    `你是《${work.title}》中的角色「${character.name}」，不是 AI 助手，也不是作者。`,
    '始终以角色本人的第一人称说话。不要使用“作为 AI”“根据设定”等出戏表达，不要用 markdown 标题。',
    '保持角色卡中的身份、性格、目标、说话方式、弱点和立场。不要为了讨好对方而放弃角色逻辑；可以拒绝、误解、沉默或生气。',
    '不要替对方行动、不要替对方说话、不要写小说旁白，也不要替作者总结剧情。回复以自然的对话为主，通常 1–3 段。',
    `你的知识截止到：${chapterCutoffLabel(chapters, safeCutoff)}。之后的剧情、结局、作者大纲和你不可能知道的秘密，你都不知道，也不能假装知道。`,
    '如果对方问到超出你认知范围的事，按你的性格追问、回避或给出角色自己的猜测；不要编造“剧情真相”。',
    '记住你们之前聊过的内容，并在合适的时候自然提起；不要机械复述记忆列表。',
    '除非角色卡明确写了，否则不要主动暴露隐藏秘密、未来伏笔或作者视角的信息。',
    '严格按【角色深度档案】里的说话方式、行为习惯和认知边界表演；不要把所有角色写成同一种语气。',
    emotionPromptSection(session.emotion),
    personaPromptSection(session.persona, detail.characters),
    buildChatContentPolicy(contentSettings),
    proactive
      ? proactiveInstruction(proactive.reason, proactive.followUpIndex, proactive.followUpLimit)
      : '',
  ].join('\n')

  const profile = [
    `【作品】《${work.title}》`,
    work.genres.length ? `【题材】${work.genres.join('、')}` : '',
    work.theme ? `【主题】${work.theme}` : '',
    work.synopsis ? `【简介】${clip(work.synopsis, 380)}` : '',
    detail.worldview ? `【世界观】${clip(detail.worldview, 900)}` : '',
    detail.style.tone.length ? `【文风】${detail.style.tone.join('、')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const card = [
    buildCharacterProfilePrompt(character, {
      mode: 'chat',
      detail,
      includeKnowledge: true,
      maxSamples: 5,
      chapterNumber: safeCutoff,
    }),
  ]
    .filter(Boolean)
    .join('\n')

  const knowledge = [
    recentChapters.length
      ? `【最近发生的章节】\n${recentChapters
          .map((chapter) => `${chapter.title || '未命名章节'}：${clip(chapter.content, 1800)}`)
          .join('\n\n')}`
      : '',
    chapterMemories.length ? `【章节记忆】\n${bullets(chapterMemories)}` : '',
    `【当前对话章节】${chapterCutoffLabel(chapters, safeCutoff)}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const relations = [
    relatedCharacters.length ? `【关系】\n${bullets(relatedCharacters)}` : '',
    factions.length ? `【所属势力】\n${bullets(factions)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const memoryBlock = memoryText.length
    ? `【你们之间值得记住的事】\n${bullets(memoryText)}`
    : '【你们之间还没有额外的长期记忆】'

  const history: ChatMessage[] = session.messages
    .filter((message) => message.content.trim())
    .slice(-Math.max(4, historyLimit))
    .map((message) => ({ role: message.role, content: message.content }))

  return [
    {
      role: 'system',
      content: [system, profile, card, knowledge, relations, memoryBlock].join('\n\n'),
    },
    ...history,
  ]
}

export function createCharacterChatMessage(
  role: CharacterChatMessage['role'],
  content: string,
): CharacterChatMessage {
  return {
    id: `chat-${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    role,
    content,
    at: Date.now(),
  }
}

export const CHARACTER_CHAT_STARTERS = [
  '最近过得怎么样？',
  '你心里最放不下的事是什么？',
  '如果我不插手，你接下来会怎么做？',
  '有件事我一直没敢问你。',
]

export interface GroupCharacterChatContext extends Omit<CharacterChatContext, 'character'> {
  characters: CharacterCard[]
  nextSpeakerName?: string
}

export function buildGroupCharacterChatMessages(
  context: GroupCharacterChatContext,
  historyLimit = 20,
  contentSettings?: CharacterChatSettings,
): ChatMessage[] {
  const { work, detail, characters, chapters, session, memories, nextSpeakerName } = context
  const safeCutoff = Math.max(1, Math.min(chapters.length || 1, session.chapterCutoff))
  const knownChapters = chapters.slice(0, safeCutoff)
  const recentChapters = knownChapters.slice(-3)
  const nameList = characters.map((character) => character.name)
  const cards = characters
    .map((character) =>
      buildCharacterProfilePrompt(character, {
        mode: 'chat',
        detail,
        includeKnowledge: true,
        maxSamples: 2,
        chapterNumber: safeCutoff,
      }),
    )
    .join('\n\n')
  const relations = (detail.relationships ?? [])
    .filter(
      (relation) =>
        characters.some((character) => character.id === relation.fromId) &&
        characters.some((character) => character.id === relation.toId),
    )
    .map((relation) => {
      const from = characters.find((character) => character.id === relation.fromId)?.name ?? '某人'
      const to = characters.find((character) => character.id === relation.toId)?.name ?? '某人'
      return `${from}→${to}：${relation.type}${relation.note ? `（${relation.note}）` : ''}`
    })
  const relevantMemories = memories
    .filter(
      (memory) =>
        memory.workId === work.id &&
        characters.some((character) => character.id === memory.characterId),
    )
    .slice(0, 24)
    .map((memory) => {
      const name = characters.find((character) => character.id === memory.characterId)?.name
      return name ? `${name}记得：${memory.text}` : memory.text
    })

  const history: ChatMessage[] = session.messages
    .filter((message) => message.content.trim())
    .slice(-Math.max(6, historyLimit))
    .map((message) => ({
      role: message.role,
      content:
        message.role === 'assistant' && message.speakerName
          ? `${message.speakerName}：${message.content}`
          : message.content,
    }))

  const system = [
    `你是《${work.title}》的多角色会客厅导演，负责让这些角色自然互动。`,
    `参与者：${nameList.join('、')}。`,
    '只输出一个 JSON 对象，不要 markdown、不要解释。格式：{"lines":[{"character":"角色名","content":"台词或动作"}]}。',
    '一次回复最多 3 个角色发言，每个角色 1–2 句；不要每次都让所有人说话。',
    '每个角色只能以自己第一人称说话，保持自己的身份、性格、目标和说话方式；可以互相打断、沉默或反对。',
    '不要替用户说话、不要替用户行动、不要写作者旁白，也不要解释作者意图。',
    `角色们只知道到：${chapterCutoffLabel(chapters, safeCutoff)}。之后的剧情、结局、大纲和秘密，他们都不知道。`,
    '如果某角色不知道，就按角色自己的方式回避、追问或猜测，不要编造剧情真相。',
    nextSpeakerName ? `这一轮优先让「${nextSpeakerName}」先开口，其他角色按自然反应接话。` : '',
    '只输出 JSON，不要输出 JSON 之外的任何文字。',
    personaPromptSection(session.persona, detail.characters),
    buildChatContentPolicy(contentSettings),
  ]
    .filter(Boolean)
    .join('\n')

  const contextBlock = [
    `【作品】《${work.title}》｜${work.genres.join('、') || '未设置题材'}`,
    work.synopsis ? `【简介】${clip(work.synopsis, 300)}` : '',
    detail.worldview ? `【世界观】${clip(detail.worldview, 700)}` : '',
    `【角色卡】\n${cards}`,
    relations.length ? `【角色关系】\n${bullets(relations)}` : '',
    recentChapters.length
      ? `【最近章节】\n${recentChapters
          .map((chapter) => `${chapter.title}：${clip(chapter.content, 1300)}`)
          .join('\n\n')}`
      : '',
    relevantMemories.length ? `【已有记忆】\n${bullets(relevantMemories)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  return [
    { role: 'system', content: `${system}\n\n${contextBlock}` },
    ...history,
  ]
}

export interface GroupChatLine {
  character: string
  content: string
}

export function parseGroupChatReply(text: string, characters: CharacterCard[]): GroupChatLine[] | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const names = new Map(characters.map((character) => [character.name.trim(), character.name.trim()]))
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const raw = JSON.parse(cleaned.slice(start, end + 1)) as { lines?: unknown }
      if (Array.isArray(raw.lines)) {
        const lines = raw.lines
          .map((item) => {
            if (!item || typeof item !== 'object') return null
            const value = item as Record<string, unknown>
            const character = typeof value.character === 'string' ? value.character.trim() : ''
            const content = typeof value.content === 'string' ? value.content.trim() : ''
            if (!names.has(character) || !content) return null
            return { character, content: content.slice(0, 1200) }
          })
          .filter((item): item is GroupChatLine => item !== null)
          .slice(0, 3)
        if (lines.length > 0) return lines
      }
    } catch {
      // 回退到逐行解析
    }
  }
  const fallback = cleaned
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*([^：:]{1,12})[：:]\s*(.+)$/)
      if (!match) return null
      const character = match[1].trim()
      if (!names.has(character)) return null
      return { character, content: match[2].trim().slice(0, 1200) }
    })
    .filter((item): item is GroupChatLine => item !== null)
    .slice(0, 3)
  return fallback.length > 0 ? fallback : null
}

export interface ChatPlotSuggestions {
  events: string[]
  relationships: string[]
  hooks: string[]
}

export function buildChatPlotMessages(input: {
  work: Work
  characters: CharacterCard[]
  session: CharacterChatSession
}): ChatMessage[] {
  const { work, characters, session } = input
  const names = characters.map((character) => character.name)
  const transcript = session.messages
    .slice(-40)
    .map((message) =>
      message.role === 'user'
        ? `我：${message.content}`
        : `${message.speakerName ?? names[0] ?? '角色'}：${message.content}`,
    )
    .join('\n')
  return [
    {
      role: 'system',
      content: [
        '你是小说剧情提炼助手。',
        '请从下面的角色对话中提取可用的剧情候选，但不要写正文，也不要发明对话中没有出现的关键事实。',
        '只输出一个 JSON 对象，不要 markdown、不要解释。',
        '格式：{"events":["..."],"relationships":["..."],"hooks":["..."]}',
        'events 最多 5 条：可能值得写入事件簿的事件（谁做了什么、结果或风险）。',
        'relationships 最多 3 条：角色关系可能发生的变化或张力。',
        'hooks 最多 3 条：可以带进下一场戏的问题、秘密或未完成动作。',
        '所有内容用中文短句，不替作者决定正典，只作为候选。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `【作品】《${work.title}》\n【参与角色】${names.join('、')}\n【对话】\n${transcript}`,
    },
  ]
}

export function parseChatPlotSuggestions(text: string): ChatPlotSuggestions | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const readList = (value: unknown, max: number): string[] => {
    if (!Array.isArray(value)) return []
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, max)
  }
  try {
    const raw = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
    const result = {
      events: readList(raw.events, 5),
      relationships: readList(raw.relationships, 3),
      hooks: readList(raw.hooks, 3),
    }
    if (result.events.length + result.relationships.length + result.hooks.length === 0) {
      return null
    }
    return result
  } catch {
    return null
  }
}

export interface ChatMemoryDraft {
  text: string
  kind: CharacterMemoryKind
}

export interface ChatMemoryUpdate {
  summary: string
  memories: ChatMemoryDraft[]
}

export function buildCharacterChatMemoryMessages(context: CharacterChatContext): ChatMessage[] {
  const { work, character, session, memories } = context
  const cursor = Math.max(0, session.memoryCursor ?? 0)
  const newMessages = session.messages.slice(cursor).slice(-30)
  const existingMemories = memories
    .filter((memory) => memory.workId === work.id && memory.characterId === character.id)
    .slice(0, 30)
    .map((memory) => memory.text)

  return [
    {
      role: 'system',
      content: [
        '你是「角色会客厅」的会话记忆整理器。',
        '你的任务不是写小说，也不是替角色回复，而是整理已经发生的对话。',
        '只输出一个合法 JSON 对象，不要 markdown、不要解释、不要前后缀。',
        'JSON 结构：{"summary":"...","memories":[{"text":"...","kind":"fact|promise|emotion|relationship|user"}]}',
        'summary 用 1–3 句概括本次对话和角色当前的态度，不超过 300 字。',
        'memories 只记录对话里明确出现、以后值得角色记住的事，最多 5 条，每条不超过 80 字。',
        'kind 含义：fact=事实，promise=约定，emotion=情绪变化，relationship=关系变化，user=关于用户的信息。',
        '不要记录寒暄、重复内容、作者设定或模型自己的猜测；不要把作品正典改写成聊天记忆。',
        '如果对话里没有新的长期记忆，memories 返回空数组。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】《${work.title}》`,
        `【角色】${character.name}（${character.role || character.identity || '角色'}）`,
        session.summary ? `【已有摘要】\n${session.summary}` : '【已有摘要】无',
        existingMemories.length
          ? `【已有长期记忆】\n${bullets(existingMemories)}`
          : '【已有长期记忆】无',
        `【需要整理的新对话】\n${newMessages
          .map((message) => `${message.role === 'user' ? '用户' : character.name}：${message.content}`)
          .join('\n')}`,
      ].join('\n\n'),
    },
  ]
}

const MEMORY_KINDS: CharacterMemoryKind[] = ['fact', 'promise', 'emotion', 'relationship', 'user']

export function parseChatMemoryUpdate(text: string): ChatMemoryUpdate | null {
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
    const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 1200) : ''
    const memories = Array.isArray(raw.memories)
      ? raw.memories
          .map((item) => {
            if (!item || typeof item !== 'object') return null
            const value = item as Record<string, unknown>
            const memoryText = typeof value.text === 'string' ? value.text.trim().slice(0, 220) : ''
            if (!memoryText) return null
            const kind = MEMORY_KINDS.includes(value.kind as CharacterMemoryKind)
              ? (value.kind as CharacterMemoryKind)
              : 'fact'
            return { text: memoryText, kind }
          })
          .filter((item): item is ChatMemoryDraft => item !== null)
          .slice(0, 5)
      : []
    if (!summary && memories.length === 0) return null
    return { summary, memories }
  } catch {
    return null
  }
}

export interface CharacterVoiceCheckInput {
  work: Work
  detail: WorkDetail
  character: CharacterCard
  chapters: Chapter[]
  session: CharacterChatSession
}

export function buildCharacterVoiceCheckMessages(
  input: CharacterVoiceCheckInput,
): ChatMessage[] {
  const { work, detail, character, chapters, session } = input
  const cutoff = Math.max(1, Math.min(chapters.length || 1, session.chapterCutoff))
  const profile = buildCharacterProfilePrompt(character, {
    mode: 'chat',
    detail,
    includeKnowledge: true,
    maxSamples: 4,
    chapterNumber: cutoff,
  })
  const recent = session.messages
    .filter((message) => message.content.trim())
    .slice(-6)
    .map((message) => {
      const speaker =
        message.role === 'user' ? 'Óû§' : message.speakerName || character.name
      return `${speaker}：${clip(message.content, 800)}`
    })
    .join('\n\n')
  return [
    {
      role: 'system',
      content: [
        '你是С˵角ɫ语气审稿Ա，ֻ检查最后һ条角ɫ»ظ词Ƿ裣窀ýÇɫ±¾Èˡ£',
        'Öص慵觳飺˵话方ʽ¡¢³ƺ簟⑿Ըñ¡¢Ŀ±ꡢ当ǰ情绪、认֪±߽硢ÊǷ裉嬗û§Ðж¯¡¢ÊǷñOOC¡¢ÊǷñͻȻ֪道不该֪µÀµÄÊ¡£',
        '不Ҫ重д̨´ʣ¬²»Ҫ续д。输出 2¨C5 Ìõ¶ÌÎÊÌ⣻如果ûÓÐÃ÷ÏÔÎÊÌ⣬ֻ输出“δ发现明显OOC”。',
        'ÿ条д£ºÎÊÌ⡢ÒÀ¾ݡ⒔ㄒ飨һ¾仰）。不Ҫ输出 JSON。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作Ʒ】《${work.title}》`,
        `【角ɫ】${character.name}`,
        `【角ɫ档案】\n${profile}`,
        `【֪ʶ截ֹ】${chapterCutoffLabel(chapters, cutoff)}`,
        `¡¾×î½ü¶Ի°¡¿\n${recent || '£¨Îޣ©'}`,
        '请检查最后һ条角ɫ»ظ´µÄÓïÆøÓëÈÏ֪һÖÂÐԡ£',
      ].join('\n\n'),
    },
  ]
}
