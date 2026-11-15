import type { ChatMessage } from './ai'
import { buildProjectSetupMessages, parseProjectSetup, type ProjectSetupDraft } from './ai'
import type {
  CharacterCard,
  CreateWorkInput,
  FactionCard,
  Genre,
  RelationshipCard,
} from './types'

export interface StorySeedRequest {
  premise: string
  genres: Genre[]
  targetWords: number
  stylePresetId?: string
}

export interface StorySeedDraft {
  title: string
  synopsis: string
  theme: string
  opening: string
  hooks: string[]
  styleHint: string
  setup: ProjectSetupDraft
}

export function buildStorySeedMessages(
  request: StorySeedRequest,
  styleLabel: string,
): ChatMessage[] {
  return buildProjectSetupMessages({
    synopsis: request.premise,
    theme: '',
    genres: request.genres,
    perspective: '第三人称 限知',
    requirement: [
      `目标篇幅约 ${request.targetWords} 字。`,
      styleLabel ? `希望的整体风格：${styleLabel}。` : '',
      '除了既有字段，再在 JSON 中增加 opening 和 hooks：',
      'opening 是一段 80-160 字的开场画面，不写标题，不使用“未完待续”。',
      'hooks 是前三章各一句钩子，必须具体，不要泛泛而谈。',
      'styleHint 用一句 10-30 字概括建议文风。',
    ]
      .filter(Boolean)
      .join('\n'),
  })
}

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

export function parseStorySeed(text: string): StorySeedDraft | null {
  const setup = parseProjectSetup(text)
  if (!setup) return null
  const raw = extractJson(text)
  const opening = typeof raw?.opening === 'string' ? raw.opening.trim().slice(0, 500) : ''
  const hooks = Array.isArray(raw?.hooks)
    ? raw.hooks
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().slice(0, 160))
        .filter(Boolean)
        .slice(0, 3)
    : []
  const styleHint = typeof raw?.styleHint === 'string' ? raw.styleHint.trim().slice(0, 80) : ''
  return {
    title: setup.title,
    synopsis: setup.synopsis,
    theme: setup.theme,
    opening,
    hooks,
    styleHint,
    setup,
  }
}

export function seedToWorkInput(
  seed: StorySeedDraft,
  request: StorySeedRequest,
): CreateWorkInput {
  const stamp = Date.now().toString(36)
  const factionIds = new Map<string, string>()
  const factions: FactionCard[] = seed.setup.factions.map((faction, index) => {
    const id = `f-seed-${stamp}-${index}`
    factionIds.set(faction.name, id)
    return {
      id,
      name: faction.name,
      type: faction.type,
      leader: faction.leader,
      goal: '',
      description: faction.description,
    }
  })
  const characters: CharacterCard[] = seed.setup.characters.map((character, index) => ({
    id: `c-seed-${stamp}-${index}`,
    name: character.name,
    role: character.role,
    identity: character.identity,
    personality: character.personality,
    goal: character.goal,
    sectId: character.sectName ? factionIds.get(character.sectName) : undefined,
    status: '正常',
    weapons: [],
    treasures: [],
    techniques: [],
    currency: '',
  }))
  const characterIds = new Map(characters.map((character) => [character.name, character.id]))
  const relationships: RelationshipCard[] = seed.setup.relationships
    .map((relationship, index) => {
      const fromId = characterIds.get(relationship.fromName)
      const toId = characterIds.get(relationship.toName)
      if (!fromId || !toId) return null
      return {
        id: `r-seed-${stamp}-${index}`,
        fromId,
        toId,
        type: relationship.type,
        note: relationship.note,
      }
    })
    .filter((relationship): relationship is RelationshipCard => Boolean(relationship))
  return {
    title: seed.title,
    synopsis: seed.synopsis,
    theme: seed.theme,
    genres: request.genres,
    outlineMode: 'fine',
    writingMode: 'director',
    perspective: 'third-limited',
    characterCount: Math.max(1, characters.length),
    targetWords: request.targetWords,
    characters,
    factions,
    relationships,
  }
}
