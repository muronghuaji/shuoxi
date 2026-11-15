import { describe, expect, it } from 'vitest'
import type { WorkStyle } from './types'
import {
  analyzeStyleDrift,
  applyStylePreset,
  buildStyleAnalysisMessages,
  buildStylePreview,
  createEmptyStyle,
  formatStyleCard,
  normalizeStyle,
  parseStyleAnalysis,
  styleWarnings,
} from './styleProfile'

describe('style profile', () => {
  it('normalizes old styles and clamps advanced fields', () => {
    const normalized = normalizeStyle({
      tone: ['冷峻', '悬疑'],
      pace: '快',
      dialogue: '中',
      description: '克制',
      taboos: '',
      notes: '',
    })
    expect(normalized.narrationDistance).toBe('medium')
    expect(normalized.strength).toBe('medium')
    expect(normalized.descriptionFocus).toEqual([])
    expect(normalized.sampleText).toBe('')

    const clamped = normalizeStyle({
      ...createEmptyStyle(),
      descriptionFocus: ['action', 'objects', 'senses'],
    } as WorkStyle)
    expect(clamped.descriptionFocus).toHaveLength(2)
  })

  it('applies presets while preserving reference material', () => {
    const style = {
      ...createEmptyStyle(),
      sampleText: '一段参考。',
      sampleAnalysis: '短句，冷眼。',
    }
    const next = applyStylePreset(style, 'cold-suspense')
    expect(next.presetId).toBe('cold-suspense')
    expect(next.narrationDistance).toBe('camera')
    expect(next.descriptionFocus).toEqual(['action', 'objects'])
    expect(next.sampleText).toBe('一段参考。')
    expect(next.sampleAnalysis).toBe('短句，冷眼。')
  })

  it('builds a compact style card and merges chapter overrides', () => {
    const style = applyStylePreset(createEmptyStyle(), 'cinematic')
    style.sampleAnalysis = '镜头先给环境，再落到人物。'
    style.antiAi = ['不要每段都替人物总结情绪']
    const card = formatStyleCard(style, { pace: '快', notes: '这一章是追逐戏。' })
    expect(card).toContain('叙事距离：中距')
    expect(card).toContain('参考样文分析：镜头先给环境')
    expect(card).toContain('反 AI 味：不要每段都替人物总结情绪')
    expect(card).toContain('节奏：快')
    expect(card).toContain('这一章是追逐戏')
    expect(buildStylePreview(style)).toContain('AI 实际读到的文风卡')
  })

  it('parses a style analysis response and keeps defaults for bad fields', () => {
    const parsed = parseStyleAnalysis(
      '```json\n{"tone":["冷峻"],"pace":"快","dialogue":"多","description":"克制","strength":"strong","narrationDistance":"camera","sentenceRhythm":"short","paragraphDensity":"short","descriptionFocus":["action","objects"],"emotionExpression":"external","dialogueSubtext":"high","metaphorDensity":"low","metaphorSource":"industrial","hookType":"suspense","notes":"少解释"}\n```',
    )
    expect(parsed?.tone).toEqual(['冷峻'])
    expect(parsed?.strength).toBe('strong')
    expect(parsed?.descriptionFocus).toEqual(['action', 'objects'])
    expect(parsed?.notes).toBe('少解释')
  })

  it('detects local style drift without AI', () => {
    const baseline = Array.from({ length: 5 }, () => '他推门。雨停。灯亮。她抬头。').join('\n')
    const recent = '他推开门，看见雨已经停了，灯在很远的地方亮着，她慢慢抬起头，像是终于等到了一个不需要再解释的答案。'
    const report = analyzeStyleDrift([baseline, baseline, baseline, baseline, recent])
    expect(report).not.toBeNull()
    expect(report!.warnings.length).toBeGreaterThan(0)
    expect(report!.sampleChapters).toBe(5)
  })

  it('requests a JSON style extraction', () => {
    const messages = buildStyleAnalysisMessages({
      workTitle: '照雪问剑',
      genres: ['悬疑'],
      sample: '雨停之后，他没有立刻离开。',
    })
    expect(messages[0].content).toContain('narrationDistance')
    expect(messages[0].content).toContain('readerPromise')
    expect(messages[1].content).toContain('雨停之后')
  })

  it('normalizes web-novel style dimensions', () => {
    const normalized = normalizeStyle({
      ...createEmptyStyle(),
      readerPromise: ['爽感', '搞笑'],
      tropeMode: 'subvert',
      comedyType: 'deadpan',
      comedyDensity: 'medium',
      emotionIntensity: 'high',
      pacingMode: 'fast',
      satisfactionType: '智斗',
    })
    expect(normalized.readerPromise).toEqual(['爽感', '搞笑'])
    expect(normalized.tropeMode).toBe('subvert')
    expect(normalized.comedyType).toBe('deadpan')
    expect(normalized.comedyDensity).toBe('medium')
    expect(normalized.emotionIntensity).toBe('high')
    expect(normalized.pacingMode).toBe('fast')
    expect(normalized.satisfactionType).toBe('智斗')
  })

  it('applies a web-novel preset with anti-trope and comedy settings', () => {
    const next = applyStylePreset(createEmptyStyle(), 'anti-trope')
    expect(next.tropeMode).toBe('subvert')
    expect(next.comedyType).toBe('deadpan')
    expect(next.readerPromise).toEqual(['人物', '搞笑', '悬念'])
    expect(next.satisfactionType).toBe('none')
  })

  it('warns about incompatible style combinations', () => {
    const style = normalizeStyle({
      ...createEmptyStyle(),
      readerPromise: ['恐惧'],
      comedyType: 'absurd',
      comedyDensity: 'high',
    })
    expect(styleWarnings(style).length).toBeGreaterThan(0)
  })
})
