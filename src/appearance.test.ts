import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APPEARANCE,
  DEFAULT_TYPOGRAPHY,
  normalizeAppearance,
  resolveTypography,
} from './appearance'

describe('normalizeAppearance', () => {
  it('returns defaults for invalid data', () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE)
    expect(normalizeAppearance({ mode: 'wat', accent: 'unknown' })).toEqual(DEFAULT_APPEARANCE)
  })

  it('keeps valid theme and accent', () => {
    const value = normalizeAppearance({ mode: 'light', accent: 'sage' })
    expect(value.mode).toBe('light')
    expect(value.accent).toBe('sage')
  })

  it('clamps background controls', () => {
    const value = normalizeAppearance({
      backgroundOpacity: 999,
      backgroundBlur: -4,
      backgroundScope: 'app',
    })
    expect(value.backgroundOpacity).toBe(100)
    expect(value.backgroundBlur).toBe(0)
    expect(value.backgroundScope).toBe('app')
  })

  it('normalizes image background mode', () => {
    const value = normalizeAppearance({
      backgroundKind: 'image',
      backgroundPreset: 'mountains',
      backgroundScope: 'home',
    })
    expect(value.backgroundKind).toBe('image')
    expect(value.backgroundPreset).toBe('mountains')
  })

  it('keeps saved custom accents and accepts the selected custom color', () => {
    const value = normalizeAppearance({
      accent: 'custom:user-1',
      customAccents: [
        { id: 'user-1', label: '赤霞', color: '#FF6B6B' },
        { id: 'user-2', label: '坏颜色', color: 'red' },
        { id: 'user-3', label: '三位', color: '#abc' },
      ],
    })
    expect(value.accent).toBe('custom:user-1')
    expect(value.customAccents).toEqual([
      { id: 'user-1', label: '赤霞', color: '#ff6b6b' },
      { id: 'user-3', label: '三位', color: '#aabbcc' },
    ])
  })

  it('falls back when a custom accent is no longer saved', () => {
    const value = normalizeAppearance({
      accent: 'custom:missing',
      customAccents: [{ id: 'user-1', label: '赤霞', color: '#ff6b6b' }],
    })
    expect(value.accent).toBe('amber')
  })

  it('accepts the new built-in accent colors', () => {
    expect(normalizeAppearance({ accent: 'violet' }).accent).toBe('violet')
    expect(normalizeAppearance({ accent: 'teal' }).accent).toBe('teal')
    expect(normalizeAppearance({ accent: 'coral' }).accent).toBe('coral')
    expect(normalizeAppearance({ accent: 'slate' }).accent).toBe('slate')
  })

  it('normalizes interface scale', () => {
    expect(normalizeAppearance({ uiScale: 125 }).uiScale).toBe(125)
    expect(normalizeAppearance({ uiScale: 87 }).uiScale).toBe(100)
    expect(normalizeAppearance({ uiScale: 'big' }).uiScale).toBe(100)
  })

  it('normalizes home layout', () => {
    expect(normalizeAppearance({ homeLayout: 'shelf' }).homeLayout).toBe('shelf')
    expect(normalizeAppearance({ homeLayout: 'unknown' }).homeLayout).toBe('studio')
  })

  it('normalizes typography areas and rejects unsafe font names', () => {
    const value = normalizeAppearance({
      typography: {
        ...DEFAULT_TYPOGRAPHY,
        writing: {
          ...DEFAULT_TYPOGRAPHY.writing,
          fontFamily: "bad'; font-family: url(x)",
          fontSize: 99,
          color: '#abc',
          lineHeight: 9,
        },
      },
    })
    expect(value.typography.writing.fontFamily).toBe(DEFAULT_TYPOGRAPHY.writing.fontFamily)
    expect(value.typography.writing.fontSize).toBe(24)
    expect(value.typography.writing.color).toBe('#aabbcc')
    expect(value.typography.writing.lineHeight).toBe(2.4)
  })

  it('resolves inheritance independently from line height and measure', () => {
    const settings = {
      ...DEFAULT_TYPOGRAPHY,
      global: { ...DEFAULT_TYPOGRAPHY.global, fontFamily: 'sans', fontSize: 15, color: '#ffffff' },
      reading: {
        ...DEFAULT_TYPOGRAPHY.reading,
        inherit: 'writing' as const,
        lineHeight: 2,
        measure: 800,
      },
    }
    const resolved = resolveTypography(settings)
    expect(resolved.reading.fontFamily).toBe(DEFAULT_TYPOGRAPHY.writing.fontFamily)
    expect(resolved.reading.fontSize).toBe(DEFAULT_TYPOGRAPHY.writing.fontSize)
    expect(resolved.reading.lineHeight).toBe(2)
    expect(resolved.reading.measure).toBe(800)
  })
})
