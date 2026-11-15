import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import {
  buildSpeciesPrompt,
  emptySpecies,
  normalizeSpecies,
  normalizeSpeciesList,
  speciesCompleteness,
  speciesNameById,
  speciesQuickLine,
} from './species'
import { buildEntityGenerateMessages, buildGenerationMessages } from './ai'
import type { Work } from './types'

describe('species profile', () => {
  it('normalizes malformed records and accepts custom categories', () => {
    const species = normalizeSpecies({
      name: '霜裔',
      category: '自定义：霜裔',
      aliases: '霜民、白民',
      abilities: ['低温环境', '霜纹感知'],
      weaknesses: '干燥环境',
      variants: ['霜裔祭司'],
    })
    expect(species.name).toBe('霜裔')
    expect(species.category).toContain('自定义')
    expect(species.aliases).toEqual(['霜民', '白民'])
    expect(species.abilities).toHaveLength(2)
    expect(species.weaknesses).toEqual(['干燥环境'])
    expect(normalizeSpeciesList([species, { name: '' }])).toHaveLength(1)
  })

  it('scores completeness and builds a prompt', () => {
    const species = {
      ...emptySpecies(),
      name: '霜裔',
      category: '精灵',
      origin: '极北',
      habitat: '冻土',
      appearance: '皮肤像冰',
      physiology: '耐寒',
      abilities: ['霜纹'],
      weaknesses: ['火'],
      society: '部族',
      language: '霜语',
      culture: '尊重长者',
      relations: '与人类贸易',
    }
    expect(speciesCompleteness(species)).toBeGreaterThan(50)
    const prompt = buildSpeciesPrompt(species)
    expect(prompt).toContain('物种：霜裔')
    expect(prompt).toContain('大类：精灵')
    expect(prompt).toContain('能力：霜纹')
    expect(prompt).toContain('弱点：火')
    expect(speciesQuickLine(species)).toContain('栖息：冻土')
  })

  it('resolves species names from detail', () => {
    const detail = createEmptyDetail()
    detail.species = [{ ...emptySpecies(), id: 's1', name: '霜裔' }]
    expect(speciesNameById(detail, 's1')).toBe('霜裔')
    expect(speciesNameById(detail, 'missing')).toBe('')
  })

  it('puts active characters species into writing context and generation schema', () => {
    const work: Work = {
      id: 'w1',
      title: '照雪问剑',
      synopsis: '旧案。',
      theme: '选择',
      genres: ['悬疑'],
      outlineMode: 'fine',
      perspective: 'third-limited',
      characterCount: 1,
      targetWords: 100000,
      promptIds: [],
      status: '连载中',
      chapters: 1,
      words: 0,
      updatedAt: 1,
      coverIndex: 0,
    }
    const detail = createEmptyDetail()
    detail.species = [
      {
        ...emptySpecies(),
        id: 's1',
        name: '霜裔',
        category: '精灵',
        appearance: '皮肤像薄冰。',
      },
    ]
    detail.characters = [
      {
        id: 'c1',
        name: '林夏',
        role: '主角',
        identity: '',
        personality: '',
        goal: '',
        speciesId: 's1',
      },
    ]
    const chapter = {
      id: 'ch1',
      title: '第一章',
      content: '',
      updatedAt: 1,
      status: 'writing' as const,
      titleSource: 'manual' as const,
    }
    const messages = buildGenerationMessages({
      work,
      detail,
      chapters: [chapter],
      chapter,
      baseContent: '',
      directive: '林夏站在霜原上。',
      prompts: [],
    })
    const content = messages.map((message) => message.content).join('\n')
    expect(content).toContain('【当前场景相关物种】')
    expect(content).toContain('霜裔')
    const speciesMessages = buildEntityGenerateMessages({ kind: 'species', work, detail })
    const speciesContent = speciesMessages.map((message) => message.content).join('\n')
    expect(speciesContent).toContain('"abilities"')
    expect(speciesContent).toContain('物种 / 种族')
  })
})
