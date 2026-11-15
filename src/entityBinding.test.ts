import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import { emptyCharacterProfile } from './characterProfile'
import {
  bindCharacterAlias,
  cleanAlias,
  findCharacterAliasOwner,
  isGenericAddressTerm,
  mergeTemporaryAliases,
  type TemporaryEntityAlias,
} from './entityBinding'
import { buildEntityIndex } from './entityIndex'

function character(id: string, name: string, aliases: string[] = []) {
  return {
    id,
    name,
    role: '主角',
    identity: '',
    personality: '',
    goal: '',
    profile: { ...emptyCharacterProfile(), aliases },
  }
}

describe('character alias binding', () => {
  it('cleans punctuation and rejects empty or long selections', () => {
    expect(cleanAlias('「薰儿」')).toBe('薰儿')
    expect(cleanAlias('   ')).toBe('')
    expect(cleanAlias('这是一段非常非常长的选中文字内容不应该被绑定')).toBe('')
  })

  it('binds an alias and removes it from the old owner', () => {
    const detail = createEmptyDetail()
    detail.characters = [character('c1', '萧薰儿', ['薰儿']), character('c2', '萧炎')]
    expect(findCharacterAliasOwner(detail, '薰儿')?.name).toBe('萧薰儿')
    const next = bindCharacterAlias(detail, 'c2', '薰儿')
    expect(findCharacterAliasOwner(next, '薰儿')?.name).toBe('萧炎')
    expect(next.characters[0].profile?.aliases).not.toContain('薰儿')
    expect(next.characters[1].profile?.aliases).toContain('薰儿')
  })

  it('does not duplicate an existing alias', () => {
    const detail = createEmptyDetail()
    detail.characters = [character('c1', '萧薰儿', ['薰儿'])]
    const next = bindCharacterAlias(detail, 'c1', '薰儿')
    expect(next.characters[0].profile?.aliases).toEqual(['薰儿'])
  })

  it('recognizes generic address terms', () => {
    expect(isGenericAddressTerm('师兄')).toBe(true)
    expect(isGenericAddressTerm('老师')).toBe(true)
    expect(isGenericAddressTerm('薰儿')).toBe(false)
  })

  it('merges temporary aliases for chat highlighting', () => {
    const detail = createEmptyDetail()
    detail.characters = [character('c1', '萧薰儿')]
    const entries = buildEntityIndex(detail)
    const bindings: TemporaryEntityAlias[] = [
      { alias: '薰儿', entityId: 'c1', category: 'character' },
    ]
    const merged = mergeTemporaryAliases(entries, bindings)
    expect(merged[0].aliases).toContain('薰儿')
  })
})
