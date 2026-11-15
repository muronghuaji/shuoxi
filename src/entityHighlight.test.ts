import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ENTITY_HIGHLIGHT_SETTINGS,
  ENTITY_CATEGORY_COLORS,
  ENTITY_CATEGORY_LABELS,
  normalizeEntityHighlightSettings,
  splitEntityText,
} from './entityHighlight'
import type { EntityIndexEntry } from './entityIndex'

function entry(overrides: Partial<EntityIndexEntry>): EntityIndexEntry {
  return {
    id: 'c1',
    category: 'character',
    name: '林夏',
    aliases: [],
    tab: 'characters',
    subtitle: '人物',
    fields: ['林夏'],
    facts: [],
    summary: '',
    ...overrides,
  }
}

describe('entity highlight', () => {
  it('defaults to enabled and normalizes category switches', () => {
    expect(DEFAULT_ENTITY_HIGHLIGHT_SETTINGS.enabled).toBe(true)
    const settings = normalizeEntityHighlightSettings({
      enabled: false,
      categories: { character: false, weapon: true },
    })
    expect(settings.enabled).toBe(false)
    expect(settings.categories.character).toBe(false)
    expect(settings.categories.weapon).toBe(true)
    expect(settings.categories.faction).toBe(true)
  })

  it('splits known names and aliases, preferring the longest match', () => {
    const entries = [
      entry({ id: 'c1', name: '林夏', aliases: ['小夏'] }),
      entry({ id: 'c2', name: '林夏的姐姐', category: 'character' }),
    ]
    const segments = splitEntityText('林夏的姐姐看着小夏，林夏没有说话。', entries)
    expect(segments.filter((segment) => segment.entity).map((segment) => segment.text)).toEqual([
      '林夏的姐姐',
      '小夏',
      '林夏',
    ])
    expect(segments.map((segment) => segment.text).join('')).toBe(
      '林夏的姐姐看着小夏，林夏没有说话。',
    )
  })

  it('matches Latin names case-insensitively and has category metadata', () => {
    const entries = [entry({ name: 'Lin Xia', aliases: [] })]
    expect(splitEntityText('LIN XIA nodded.', entries)[0].entity?.id).toBe('c1')
    expect(ENTITY_CATEGORY_LABELS.weapon).toBe('武器')
    expect(ENTITY_CATEGORY_COLORS.technique).toBeTruthy()
  })

  it('leaves text unchanged when there are no entities', () => {
    expect(splitEntityText('没有实体的正文。', [])).toEqual([{ text: '没有实体的正文。' }])
  })
})
