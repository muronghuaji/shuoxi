import type { CharacterCard, ChatPersona, ChatPersonaKind } from './types'

export const DEFAULT_CHAT_PERSONA: ChatPersona = {
  kind: 'visitor',
  name: '',
  identity: '',
  relation: '',
  known: '',
  hidden: '',
}

export function normalizeChatPersona(
  raw: unknown,
  characters: CharacterCard[] = [],
): ChatPersona {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CHAT_PERSONA }
  const input = raw as Partial<ChatPersona>
  const kind: ChatPersonaKind =
    input.kind === 'custom' || input.kind === 'character' ? input.kind : 'visitor'
  const character = characters.find((item) => item.id === input.characterId)
  if (kind === 'character' && !character) return { ...DEFAULT_CHAT_PERSONA }
  return {
    kind,
    name: typeof input.name === 'string' ? input.name.trim().slice(0, 40) : '',
    identity: typeof input.identity === 'string' ? input.identity.trim().slice(0, 200) : '',
    relation: typeof input.relation === 'string' ? input.relation.trim().slice(0, 200) : '',
    known: typeof input.known === 'string' ? input.known.trim().slice(0, 300) : '',
    hidden: typeof input.hidden === 'string' ? input.hidden.trim().slice(0, 300) : '',
    ...(kind === 'character' && character ? { characterId: character.id } : {}),
  }
}

export function createCharacterPersona(
  character: CharacterCard,
  current?: ChatPersona,
): ChatPersona {
  return {
    kind: 'character',
    characterId: character.id,
    name: character.name,
    identity: [character.role, character.identity].filter(Boolean).join(' · '),
    relation: current?.relation ?? '',
    known: current?.known ?? '',
    hidden: current?.hidden ?? '',
  }
}

export function personaLabel(persona: ChatPersona | undefined): string {
  if (!persona || persona.kind === 'visitor') return '无形访客'
  if (persona.kind === 'character') return persona.name || '书中角色'
  return persona.name || '自定义身份'
}

export function personaPromptSection(
  personaRaw: ChatPersona | undefined,
  characters: CharacterCard[] = [],
): string {
  const persona = normalizeChatPersona(personaRaw, characters)
  if (persona.kind === 'visitor') {
    return [
      '【用户在这场对话中的身份】',
      '用户是一个没有名字的访客。角色不知道用户的姓名、来历、身份和与作品中人物的关系。',
      '不要假设用户是主角、故人、作者或全知者；需要时可以让角色询问，但不要替用户编造身份。',
      '不要替用户说话、行动或决定用户知道什么。',
    ].join('\n')
  }

  if (persona.kind === 'character') {
    const character = characters.find((item) => item.id === persona.characterId)
    return [
      '【用户在这场对话中的身份】',
      `用户在这场对话中扮演作品角色「${character?.name ?? persona.name}」。`,
      character?.identity ? `角色公开身份：${character.identity}` : '',
      persona.relation ? `与对方的关系：${persona.relation}` : '',
      persona.known ? `对方知道：${persona.known}` : '',
      persona.hidden ? `对方不知道 / 用户想隐瞒：${persona.hidden}` : '',
      '对方会按这个角色的身份和原作关系对待用户；但用户不自动拥有该角色的秘密和全知视角。',
      '不要替用户说话、行动或决定用户是否知道某个秘密。',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    '【用户在这场对话中的身份】',
    persona.name ? `姓名：${persona.name}` : '姓名：未告诉对方',
    persona.identity ? `身份：${persona.identity}` : '',
    persona.relation ? `与对方的关系：${persona.relation}` : '',
    persona.known ? `对方已经知道：${persona.known}` : '',
    persona.hidden ? `对方不知道 / 用户想隐瞒：${persona.hidden}` : '',
    '角色只能使用“对方已经知道”的信息，不要假设自己知道用户隐瞒的事。',
    '不要替用户说话、行动或决定用户知道什么。',
  ]
    .filter(Boolean)
    .join('\n')
}
