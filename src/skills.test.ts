import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import {
  BUILTIN_SKILLS,
  buildSkillMessages,
  buildSkillToolSections,
  exportSkills,
  normalizeSkill,
} from './skills'
import type { Chapter, Work } from './types'

const work = {
  id: 'w1',
  title: '测试小说',
  genres: ['悬疑'],
  theme: '真相',
} as Work

const chapter: Chapter = {
  id: 'ch1',
  title: '第一章',
  content: '陈默推开门。\n“你来了。”范长庚说。\n陈默没有回答。',
  updatedAt: 1,
  status: 'done',
}

describe('skills', () => {
  it('normalizes imported skills and filters unknown tools', () => {
    const skill = normalizeSkill({
      id: 'custom.test',
      name: '测试技能',
      instructions: '检查连续性。',
      tools: ['chapter', 'unknown-tool', 'characters'],
      output: 'advice',
      profile: 'general',
      version: 2,
    })
    expect(skill?.tools).toEqual(['chapter', 'characters'])
    expect(skill?.profile).toBe('general')
    expect(skill?.version).toBe(2)
  })

  it('builds tool sections and messages for a built-in skill', () => {
    const detail = createEmptyDetail()
    detail.currentSummary = '陈默开始调查。'
    detail.characters = [
      {
        id: 'c1',
        name: '陈默',
        role: '主角',
        identity: '调查员',
        personality: '',
        goal: '',
      },
    ]
    const skill = BUILTIN_SKILLS[0]
    const sections = buildSkillToolSections(skill, {
      chapters: [chapter],
      currentChapter: chapter,
      detail,
      selectedText: '',
    })
    expect(sections.join('\n')).toContain('本章正文')
    const messages = buildSkillMessages({
      skill,
      work,
      detail,
      chapters: [chapter],
      currentChapter: chapter,
    })
    expect(messages[0].content).toContain('场景诊断')
    expect(messages[1].content).toContain('陈默')
  })

  it('enabled state defaults to true and can be preserved', () => {
    const enabled = normalizeSkill({
      id: 'custom.enabled',
      name: '启用测试',
      instructions: '测试',
    })
    const disabled = normalizeSkill({
      id: 'custom.disabled',
      name: '停用测试',
      instructions: '测试',
      enabled: false,
    })
    expect(enabled?.enabled).toBe(true)
    expect(disabled?.enabled).toBe(false)
  })

  it('includes the body-language reduction skill', () => {
    const skill = BUILTIN_SKILLS.find((item) => item.id === 'builtin.reduce-body-language')
    expect(skill?.output).toBe('rewrite')
    expect(skill?.tools).toEqual(['selection', 'chapter', 'characters', 'stats'])
    expect(skill?.instructions).toContain('每 3 个自然段')
    expect(skill?.instructions).toContain('勾唇')
  })

  it('exports custom skills as JSON', () => {
    const custom = { ...BUILTIN_SKILLS[0], id: 'custom.1', builtin: false }
    const parsed = JSON.parse(exportSkills([custom])) as { skills: { id: string }[] }
    expect(parsed.skills[0].id).toBe('custom.1')
  })
})
