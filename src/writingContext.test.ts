import { describe, expect, it } from 'vitest'
import { buildGenerationMessages } from './ai'
import { createEmptyDetail } from './data'
import type { Chapter, Work } from './types'

const work: Work = {
  id: 'w1',
  title: '测试书',
  synopsis: '测试',
  theme: '',
  genres: ['悬疑'],
  outlineMode: 'traditional',
  perspective: 'third-limited',
  characterCount: 2,
  targetWords: 100000,
  promptIds: [],
  status: '草稿',
  chapters: 1,
  words: 1000,
  updatedAt: 1,
  coverIndex: 0,
}

function chapter(index: number): Chapter {
  return {
    id: `ch${index}`,
    title: `第 ${index} 章`,
    content: index === 1 ? '林夏走进旧书店，手里握着铜钥匙。' : '',
    updatedAt: 1,
    status: 'writing',
    wordCount: 20,
  }
}

function fixture() {
  const detail = createEmptyDetail()
  detail.characters = [
    { id: 'c1', name: '林夏', role: '主角', identity: '调查员', personality: '', goal: '' },
    { id: 'c2', name: '顾长风', role: '配角', identity: '剑客', personality: '', goal: '' },
    { id: 'c3', name: '王五', role: '路人', identity: '伙计', personality: '', goal: '' },
  ]
  detail.locations = [
    { id: 'l1', name: '旧书店', type: '店铺', description: '潮湿的书架' },
    { id: 'l2', name: '太虚山门', type: '山门', description: '遥远的山门' },
  ]
  detail.items = [
    { id: 'i1', name: '铜钥匙', categoryId: 'cat', grade: 1, description: '发黑的钥匙' },
    { id: 'i2', name: '照雪剑', categoryId: 'cat', grade: 9, description: '寒光' },
  ]
  detail.relationships = [
    { id: 'r1', fromId: 'c1', toId: 'c2', type: '旧识', note: '多年未见' },
    { id: 'r2', fromId: 'c2', toId: 'c3', type: '雇佣', note: '与林夏无关' },
  ]
  detail.foreshadowings = [
    {
      id: 'f1',
      title: '旧书店的暗门',
      status: '未回收',
      plantedIn: '第一章',
      note: '旧书店书架后有暗门',
      importance: '支线',
    },
    {
      id: 'f2',
      title: '太虚山门旧案',
      status: '未回收',
      plantedIn: '第三章',
      note: '太虚山门十年前的旧案',
      importance: '支线',
    },
    {
      id: 'f3',
      title: '父亲失踪真相',
      status: '未回收',
      plantedIn: '第一章',
      note: '主线必须回收',
      importance: '主线',
    },
  ]
  const chapters = Array.from({ length: 30 }, (_, index) => chapter(index + 1))
  return { detail, chapters, current: chapters[28] }
}

function section(text: string, title: string): string {
  const start = text.indexOf(`【${title}】`)
  if (start < 0) return ''
  const rest = text.slice(start + title.length + 2)
  const next = rest.indexOf('\n【')
  return next < 0 ? rest : rest.slice(0, next)
}

describe('writing context scope', () => {
  it('drops unrelated locations, items and relationships', () => {
    const { detail, chapters, current } = fixture()
    const messages = buildGenerationMessages({
      work,
      detail,
      chapters,
      chapter: current,
      baseContent: '',
      directive: '林夏回到旧书店，检查铜钥匙。',
      prompts: [],
      reasoningEffort: 'fast',
    })
    const text = messages.map((message) => message.content).join('\n')
    const locations = section(text, '地点关系')
    const items = section(text, '物品库')
    const relationships = section(text, '人物关系')
    const foreshadowings = section(text, '未回收伏笔')
    expect(locations).toContain('旧书店')
    expect(items).toContain('铜钥匙')
    expect(locations).not.toContain('太虚山门')
    expect(items).not.toContain('照雪剑')
    expect(relationships).not.toContain('雇佣')
    expect(relationships).toContain('旧识')
    expect(foreshadowings).toContain('父亲失踪真相')
    expect(foreshadowings).not.toContain('太虚山门旧案')
  })

  it('keeps only nearby chapters in the chapter structure', () => {
    const { detail, chapters, current } = fixture()
    const messages = buildGenerationMessages({
      work,
      detail,
      chapters,
      chapter: current,
      baseContent: '',
      directive: '林夏回到旧书店。',
      prompts: [],
      reasoningEffort: 'fast',
    })
    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('第 20 章')
    expect(text).toContain('第 30 章')
    expect(text).not.toContain('第 1 章（')
  })

  it('adds emotion and interiority guidance', () => {
    const { detail, chapters, current } = fixture()
    detail.style = {
      ...detail.style,
      emotionExpression: 'restrained',
      emotionIntensity: 'high',
    }
    const messages = buildGenerationMessages({
      work,
      detail,
      chapters,
      chapter: current,
      baseContent: '',
      directive: '林夏回到旧书店。',
      prompts: [],
      reasoningEffort: 'fast',
    })
    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('【情感与心理】')
    expect(text).toContain('自由间接')
    expect(text).toContain('2–3 次自由间接心理')
  })

  it('keeps the complete chapter when it is within 10000 characters', () => {
    const { detail, chapters, current } = fixture()
    const long = `开头标记：${'甲'.repeat(300)}${'乙'.repeat(5000)}结尾标记`
    const messages = buildGenerationMessages({
      work,
      detail,
      chapters,
      chapter: current,
      baseContent: long,
      directive: '继续写。',
      prompts: [],
      reasoningEffort: 'fast',
    })
    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('开头标记')
    expect(text).toContain('结尾标记')
  })

  it('summarizes an over-10000-character chapter and keeps its ending', () => {
    const { detail, chapters, current } = fixture()
    current.summary = '本章前半段的关键事件。'
    const long = `开头标记：${'甲'.repeat(300)}${'乙'.repeat(11000)}结尾标记`
    const messages = buildGenerationMessages({
      work,
      detail,
      chapters,
      chapter: current,
      baseContent: long,
      directive: '继续写。',
      prompts: [],
      reasoningEffort: 'fast',
    })
    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('【本章前文摘要】')
    expect(text).toContain('本章前半段的关键事件')
    expect(text).toContain('结尾标记')
  })
})
