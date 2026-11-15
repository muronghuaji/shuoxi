import { describe, expect, it } from 'vitest'
import {
  BUILTIN_TEMPLATES,
  cloneTemplate,
  getTemplateFeatureOptions,
  validateWorldTemplate,
} from './worldTemplates'

function template(id: string) {
  const item = BUILTIN_TEMPLATES.find((candidate) => candidate.id === id)
  if (!item) throw new Error(`missing template ${id}`)
  return item
}

describe('template feature isolation', () => {
  it('gives every story template a story guide', () => {
    expect(BUILTIN_TEMPLATES.filter((item) => item.id !== 'custom').every((item) => Boolean(item.story))).toBe(true)
    expect(BUILTIN_TEMPLATES.some((item) => item.id === 'rules')).toBe(true)
    expect(BUILTIN_TEMPLATES.some((item) => item.id === 'wasteland')).toBe(true)
    expect(BUILTIN_TEMPLATES.some((item) => item.id === 'wuxia')).toBe(true)
    expect(BUILTIN_TEMPLATES.some((item) => item.id === 'realism')).toBe(true)
    expect(BUILTIN_TEMPLATES.some((item) => item.id === 'entertainment')).toBe(true)
    expect(BUILTIN_TEMPLATES.some((item) => item.id === 'ensemble')).toBe(true)
  })

  it('gives every built-in template its own feature options', () => {
    expect(getTemplateFeatureOptions(template('xianxia')).map((item) => item.key)).toEqual([
      'cultivation',
      'equipment',
      'hierarchy',
      'ranks',
      'system',
    ])
    expect(getTemplateFeatureOptions(template('generic'))).toHaveLength(0)
    expect(getTemplateFeatureOptions(template('urban')).map((item) => item.key)).toEqual([
      'hierarchy',
      'ranks',
      'equipment',
      'system',
    ])
    expect(getTemplateFeatureOptions(template('mystery')).map((item) => item.key)).toEqual([
      'hierarchy',
      'ranks',
      'equipment',
    ])
    expect(getTemplateFeatureOptions(template('romance')).map((item) => item.key)).toEqual([
      'hierarchy',
      'ranks',
    ])
    expect(getTemplateFeatureOptions(template('scifi')).map((item) => item.key)).toEqual([
      'cultivation',
      'equipment',
      'hierarchy',
      'ranks',
      'system',
    ])
    expect(getTemplateFeatureOptions(template('historical')).map((item) => item.key)).toEqual([
      'hierarchy',
      'ranks',
      'equipment',
    ])
    expect(getTemplateFeatureOptions(template('custom'))).toHaveLength(5)
    expect(
      getTemplateFeatureOptions(template('urban')).every(
        (item) => item.label.length > 0 && item.hint.length > 0,
      ),
    ).toBe(true)
  })

  it('keeps feature options through clone and validation', () => {
    const cloned = cloneTemplate(template('mystery'))
    expect(getTemplateFeatureOptions(cloned)).toHaveLength(3)
    const legacyXianxia = { ...cloneTemplate(template('xianxia')), featureOptions: undefined }
    expect(
      getTemplateFeatureOptions(legacyXianxia).map((item) => item.label),
    ).toContain('灵根 / 体质 / 修为')
    const validated = validateWorldTemplate({
      name: '测试模板',
      terms: {},
      features: { ranks: true },
      modules: ['case-board'],
      featureOptions: [
        { key: 'ranks', label: '警衔', hint: '警局等级' },
        { key: 'unknown', label: '无效', hint: '' },
      ],
    })
    expect(validated?.featureOptions).toEqual([
      { key: 'ranks', label: '警衔', hint: '警局等级' },
    ])
  })

  it('validates custom feature blocks', () => {
    const validated = validateWorldTemplate({
      name: '自定义功能测试',
      terms: {},
      features: {},
      modules: [],
      customFeatures: [
        {
          name: '灵兽',
          scope: 'character',
          includeInContext: true,
          fields: [
            { label: '名称', type: 'text' },
            { label: '忠诚度', type: 'number' },
          ],
        },
      ],
    })
    expect(validated?.customFeatures).toHaveLength(1)
    expect(validated?.customFeatures?.[0].name).toBe('灵兽')
    expect(validated?.customFeatures?.[0].fields).toHaveLength(2)
  })
})
