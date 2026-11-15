import { describe, expect, it } from 'vitest'
import type {
  Chapter,
  CharacterCard,
  CharacterChatMemory,
  CharacterChatSession,
  Work,
  WorkDetail,
} from './types'
import {
  buildCharacterChatMemoryMessages,
  buildCharacterChatMessages,
  buildGroupCharacterChatMessages,
  chapterCutoffLabel,
  parseChatMemoryUpdate,
  parseChatPlotSuggestions,
  parseGroupChatReply,
} from './characterChat'
import { emptyCharacterProfile } from './characterProfile'

const work: Work = {
  id: 'w1',
  title: '雾港来信',
  synopsis: '雨夜来信。',
  theme: '等待',
  genres: ['悬疑'],
  outlineMode: 'fine',
  perspective: 'third-limited',
  characterCount: 2,
  targetWords: 100000,
  promptIds: [],
  status: '连载中',
  chapters: 2,
  words: 100,
  updatedAt: 1,
  coverIndex: 0,
}

const character: CharacterCard = {
  id: 'c1',
  name: '林夏',
  role: '主角',
  identity: '旧书店店主',
  personality: '克制',
  goal: '找到姐姐',
  background: '三年前姐姐失踪。',
  profile: {
    ...emptyCharacterProfile(),
    coreContradiction: '想被理解，但绝不解释',
    voice: {
      ...emptyCharacterProfile().voice,
      samples: ['“行。”', '“随你。”'],
      neverSays: ['相信我'],
    },
    knowledge: {
      ...emptyCharacterProfile().knowledge,
      knows: ['姐姐三年前失踪'],
    },
  },
}

const detail: WorkDetail = {
  worldview: '旧城。',
  style: { tone: ['冷'], pace: '中', dialogue: '中', description: '克制', taboos: '', notes: '' },
  characters: [character],
  factions: [],
  relationships: [],
  foreshadowings: [],
  analysis: '',
}

const chapters: Chapter[] = [
  {
    id: 'ch1',
    title: '第一章 雨夜',
    content: '林夏推门，柜台后有人。',
    updatedAt: 1,
    status: 'writing',
    titleSource: 'manual',
  },
  {
    id: 'ch2',
    title: '第二章 真相',
    content: '未来才揭晓：姐姐一直在楼上。',
    updatedAt: 2,
    status: 'writing',
    titleSource: 'manual',
  },
]

const session: CharacterChatSession = {
  id: 's1',
  workId: 'w1',
  characterId: 'c1',
  title: '与林夏的对话',
  chapterCutoff: 1,
  createdAt: 1,
  updatedAt: 2,
  messages: [
    { id: 'm1', role: 'user', content: '你姐姐在哪？', at: 1 },
    { id: 'm2', role: 'assistant', content: '我不知道。', at: 2 },
  ],
}

const memories: CharacterChatMemory[] = [
  {
    id: 'mem1',
    workId: 'w1',
    characterId: 'c1',
    text: '你答应帮我找姐姐。',
    createdAt: 1,
    pinned: true,
  },
]

describe('buildCharacterChatMessages', () => {
  it('includes character, memory and recent history', () => {
    const messages = buildCharacterChatMessages({ work, detail, character, chapters, session, memories })
    const content = messages.map((message) => message.content).join('\n')
    expect(content).toContain('林夏')
    expect(content).toContain('你答应帮我找姐姐')
    expect(content).toContain('你姐姐在哪')
    expect(content).toContain('第一章 雨夜')
  })

  it('includes deep voice samples and knowledge boundary', () => {
    const messages = buildCharacterChatMessages({ work, detail, character, chapters, session, memories })
    const content = messages.map((message) => message.content).join('\n')
    expect(content).toContain('想被理解，但绝不解释')
    expect(content).toContain('“行。”')
    expect(content).toContain('绝不说：相信我')
    expect(content).toContain('姐姐三年前失踪')
  })

  it('does not include chapters after the cutoff', () => {
    const messages = buildCharacterChatMessages({ work, detail, character, chapters, session, memories })
    const content = messages.map((message) => message.content).join('\n')
    expect(content).not.toContain('未来才揭晓')
  })

  it('labels the character knowledge boundary', () => {
    expect(chapterCutoffLabel(chapters, 1)).toContain('第 1 章')
    expect(chapterCutoffLabel([], 3)).toBe('尚未开始连载')
  })
})

describe('character chat memory update', () => {
  it('builds a memory request with existing summary and new messages', () => {
    const longSession: CharacterChatSession = {
      ...session,
      summary: '之前聊过旧书店。',
      memoryCursor: 1,
    }
    const messages = buildCharacterChatMemoryMessages({
      work,
      detail,
      character,
      chapters,
      session: longSession,
      memories,
    })
    const content = messages.map((message) => message.content).join('\n')
    expect(content).toContain('之前聊过旧书店')
    expect(content).toContain('你答应帮我找姐姐')
    expect(content).toContain('我不知道')
    expect(content).not.toContain('你姐姐在哪')
  })

  it('parses JSON and falls back unknown kinds', () => {
    const parsed = parseChatMemoryUpdate(
      '```json\n{"summary":"聊过近况。","memories":[{"text":"她记得旧剑冢。","kind":"promise"},{"text":"用户怕冷。","kind":"unknown"}]}\n```',
    )
    expect(parsed?.summary).toBe('聊过近况。')
    expect(parsed?.memories).toHaveLength(2)
    expect(parsed?.memories[0].kind).toBe('promise')
    expect(parsed?.memories[1].kind).toBe('fact')
  })

  it('rejects empty or malformed output', () => {
    expect(parseChatMemoryUpdate('not json')).toBeNull()
    expect(parseChatMemoryUpdate('{"summary":"","memories":[]}')).toBeNull()
  })
})

describe('group character chat', () => {
  const second: CharacterCard = {
    id: 'c2',
    name: '沈玄清',
    role: '掌门',
    identity: '问剑峰掌门',
    personality: '寡言',
    goal: '守住剑冢',
  }
  const groupSession: CharacterChatSession = {
    ...session,
    characterId: 'c1',
    participantIds: ['c1', 'c2'],
    messages: [
      { id: 'g1', role: 'user', content: '你们怎么看？', at: 1 },
      {
        id: 'g2',
        role: 'assistant',
        content: '先听她说。',
        at: 2,
        speakerId: 'c2',
        speakerName: '沈玄清',
      },
    ],
  }

  it('builds one context for all participants and only known chapters', () => {
    const messages = buildGroupCharacterChatMessages({
      work,
      detail: { ...detail, characters: [character, second] },
      characters: [character, second],
      chapters,
      session: groupSession,
      memories,
    })
    const content = messages.map((message) => message.content).join('\n')
    expect(content).toContain('林夏')
    expect(content).toContain('沈玄清')
    expect(content).toContain('沈玄清：先听她说。')
    expect(content).not.toContain('未来才揭晓')
  })

  it('parses JSON lines and ignores unknown speakers', () => {
    const lines = parseGroupChatReply(
      '```json\n{"lines":[{"character":"林夏","content":"我听见了。"},{"character":"未知","content":"忽略"}]}\n```',
      [character, second],
    )
    expect(lines).toEqual([{ character: '林夏', content: '我听见了。' }])
  })

  it('parses plot suggestions', () => {
    const parsed = parseChatPlotSuggestions(
      '{"events":["沈玄清注意到异常"],"relationships":["两人互相试探"],"hooks":["钟声为何提前"]}',
    )
    expect(parsed?.events[0]).toContain('异常')
    expect(parsed?.hooks[0]).toContain('钟声')
    expect(parseChatPlotSuggestions('not json')).toBeNull()
  })
})
