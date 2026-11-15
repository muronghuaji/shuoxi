import { describe, expect, it } from 'vitest'
import type { ModuleDefinition, WorkDetail, WorldTemplate } from './types'
import { moduleContext } from './ai'
import {
  MODULE_BY_ID,
  moduleDefaultView,
  moduleViewOptions,
  recommendedModuleIds,
  resolveEnabledModules,
  resolveHiddenModules,
  resolveModuleFields,
} from './moduleCatalog'

const template: WorldTemplate = {
  id: 'test-xianxia',
  name: '修仙测试',
  description: '',
  terms: {
    faction: '宗门',
    leader: '掌门',
    member: '弟子',
    factionUnit: '堂',
    position: '职位',
    rank: '境界',
    ability: '功法',
    item: '法宝',
    currency: '灵石',
  },
  features: {
    cultivation: true,
    equipment: true,
    hierarchy: true,
    ranks: true,
    system: true,
  },
  modules: ['realm-ladder', 'spirit-lineages', 'sect-lineage', 'artifact-codex', 'sect-missions'],
  characterFields: [],
  factionFields: [],
}

const detail: WorkDetail = {
  worldview: '',
  style: { tone: [], pace: '中', dialogue: '中', description: '适中', taboos: '', notes: '' },
  characters: [],
  factions: [],
  relationships: [],
  foreshadowings: [],
  analysis: '',
  moduleData: {
    'artifact-codex': [
      {
        id: 'r1',
        title: '旧剑',
        summary: '',
        status: '未定',
        fields: {},
        createdAt: new Date().toISOString(),
      },
    ],
  },
}

describe('module catalog', () => {
  it('defaults to four recommended modules plus modules with data', () => {
    const ids = recommendedModuleIds(template, detail.moduleData)
    expect(ids).toHaveLength(4)
    expect(ids).toContain('artifact-codex')
  })

  it('resolves enabled and hidden modules with data', () => {
    const enabled = resolveEnabledModules(detail, template)
    expect(enabled.map((module) => module.id)).toContain('realm-ladder')
    const hidden = resolveHiddenModules(
      { ...detail, enabledModuleIds: ['realm-ladder'] },
      template,
    )
    expect(hidden.map((module) => module.id)).toContain('artifact-codex')
    expect(hidden.map((module) => module.id)).not.toContain('sect-lineage')
  })

  it('provides specialized views', () => {
    const realm = MODULE_BY_ID.get('realm-ladder') as ModuleDefinition
    const board = MODULE_BY_ID.get('case-board') as ModuleDefinition
    const timeline = MODULE_BY_ID.get('timeline') as ModuleDefinition
    expect(moduleDefaultView(realm)).toBe('ladder')
    expect(moduleViewOptions(board)).toContain('board')
    expect(moduleViewOptions(timeline)).toContain('timeline')
  })

  it('adds custom fields after base fields', () => {
    const module = MODULE_BY_ID.get('world-rules') as ModuleDefinition
    const fields = resolveModuleFields(module, {
      ...detail,
      moduleCustomFields: {
        'world-rules': [{ id: 'custom-1', label: '关联势力', type: 'text' }],
      },
    })
    expect(fields[fields.length - 1].label).toBe('关联势力')
  })

  it('only sends enabled modules to the AI context', () => {
    const withTemplate: WorkDetail = {
      ...detail,
      worldTemplate: template,
      enabledModuleIds: ['realm-ladder'],
      characters: [
        {
          id: 'c1',
          name: '陆照雪',
          role: '主角',
          identity: '',
          personality: '',
          goal: '',
          appearance: '',
          background: '',
          position: '',
          cultivation: '',
          spiritRoot: '',
          physique: '',
          talent: '',
          currency: '',
          techniques: [],
          weapons: [],
          treasures: [],
          status: '正常',
        },
      ],
      moduleData: {
        'realm-ladder': [
          {
            id: 'r1',
            title: '炼气',
            summary: '引气入体',
            status: '进行中',
            fields: { f1: '炼气' },
            createdAt: new Date().toISOString(),
            characterIds: ['c1'],
          },
        ],
        'artifact-codex': [
          {
            id: 'r2',
            title: '旧剑',
            summary: '',
            status: '未定',
            fields: {},
            createdAt: new Date().toISOString(),
          },
        ],
      },
    }
    const context = moduleContext(withTemplate, [])
    expect(context).toContain('炼气')
    expect(context).toContain('陆照雪')
    expect(context).not.toContain('旧剑')
    expect(moduleContext({ ...withTemplate, enabledModuleIds: [] }, [])).toBe('')
  })
})
