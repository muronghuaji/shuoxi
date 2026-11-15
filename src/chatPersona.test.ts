import { describe, expect, it } from 'vitest'
import type { CharacterCard } from './types'
import {
  createCharacterPersona,
  normalizeChatPersona,
  personaLabel,
  personaPromptSection,
} from './chatPersona'

const character: CharacterCard = {
  id: 'c1',
  name: '陆青禾',
  role: '主角',
  identity: '守灯阁第七代守灯人',
  personality: '认死理',
  goal: '救父亲',
}

describe('chat persona', () => {
  it('defaults to an invisible visitor', () => {
    const persona = normalizeChatPersona(null, [character])
    expect(persona.kind).toBe('visitor')
    expect(personaLabel(persona)).toBe('无形访客')
    expect(personaPromptSection(persona)).toContain('没有名字的访客')
  })

  it('keeps custom identity fields and only known information', () => {
    const persona = normalizeChatPersona(
      {
        kind: 'custom',
        name: '沈砚',
        identity: '守灯阁新来的杂役',
        relation: '陆青禾的下属',
        known: '名字、杂役身份',
        hidden: '见过她父亲发病',
      },
      [character],
    )
    expect(personaLabel(persona)).toBe('沈砚')
    const prompt = personaPromptSection(persona)
    expect(prompt).toContain('守灯阁新来的杂役')
    expect(prompt).toContain('对方已经知道')
    expect(prompt).toContain('用户想隐瞒')
    expect(prompt).toContain('不要替用户说话')
  })

  it('supports playing a canon character and drops stale character ids', () => {
    const playing = createCharacterPersona(character)
    expect(playing.characterId).toBe('c1')
    expect(personaPromptSection(playing, [character])).toContain('扮演作品角色')

    const stale = normalizeChatPersona({ kind: 'character', characterId: 'missing' }, [character])
    expect(stale.kind).toBe('visitor')
  })
})
