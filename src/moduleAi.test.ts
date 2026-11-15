import { describe, expect, it } from 'vitest'
import {
  parseModuleAuditResult,
  parseModuleFillResult,
  parseModuleGenerateResult,
} from './moduleAi'
import type { ModuleDefinition, ModuleField } from './types'

describe('module AI parsing', () => {
  it('parses fill fields and filters unknown ids', () => {
    const result = parseModuleFillResult(
      '```json\n{"fields":{"f1":"炼气","f2":"引气入体","bad":"忽略"}}\n```',
      ['f1', 'f2'],
    )
    expect(result?.fields).toEqual({ f1: '炼气', f2: '引气入体' })
  })

  it('rejects a fill response without usable fields', () => {
    expect(parseModuleFillResult('{"fields":{"bad":"x"}}', ['f1'])).toBeNull()
    expect(parseModuleFillResult('not json', ['f1'])).toBeNull()
  })

  it('parses audit issues and caps the list', () => {
    const issues = parseModuleAuditResult(
      JSON.stringify({
        issues: [
          { title: '境界一', issue: '阶段缺失', suggestion: '补一个阶段' },
          { title: '', issue: '状态冲突', suggestion: '' },
          { title: '无效', issue: '' },
        ],
      }),
    )
    expect(issues).toHaveLength(2)
    expect(issues?.[0].title).toBe('境界一')
    expect(issues?.[1].title).toBe('模块记录')
  })

  it('returns null for malformed audit output', () => {
    expect(parseModuleAuditResult('oops')).toBeNull()
    expect(parseModuleAuditResult('{"issues":"bad"}')).toBeNull()
  })

  it('parses generated module records with valid fields and statuses', () => {
    const module = {
      id: 'm1',
      name: '势力',
      statuses: ['未定', '进行中'],
    } as ModuleDefinition
    const fields = [
      { id: 'f1', label: '目标', type: 'text' },
      { id: 'f2', label: '描述', type: 'textarea' },
    ] as ModuleField[]
    const records = parseModuleGenerateResult(
      JSON.stringify({
        records: [
          { title: '青云宗', status: '进行中', summary: '东域宗门', fields: { f1: '扩张', f2: '剑修' } },
          { title: '', fields: { f1: '无效' } },
          { title: '血河教', status: '未知', fields: { f1: '复仇', bad: '忽略' } },
        ],
      }),
      module,
      fields,
      5,
    )
    expect(records).toHaveLength(2)
    expect(records?.[0].status).toBe('进行中')
    expect(records?.[1].status).toBe('未定')
    expect(records?.[1].fields.bad).toBeUndefined()
  })

  it('rejects a module generation response without records', () => {
    const module = { id: 'm1', name: '势力', statuses: ['未定'] } as ModuleDefinition
    expect(parseModuleGenerateResult('{"records":[]}', module, [], 3)).toBeNull()
    expect(parseModuleGenerateResult('oops', module, [], 3)).toBeNull()
  })

  it('salvages complete records from a truncated JSON response', () => {
    const module = { id: 'm1', name: '势力', statuses: ['未定'] } as ModuleDefinition
    const fields = [{ id: 'f1', label: '目标', type: 'text' }] as ModuleField[]
    const truncated =
      '{"records":[{"title":"青云宗","status":"未定","fields":{"f1":"扩张"}},{"title":"血河教","fields":{"f1":"复仇"'
    const records = parseModuleGenerateResult(truncated, module, fields, 5)
    expect(records).toHaveLength(1)
    expect(records?.[0].title).toBe('青云宗')
  })
})
