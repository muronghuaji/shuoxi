import { describe, expect, it } from 'vitest'
import {
  buildStorySeedMessages,
  parseStorySeed,
  seedToWorkInput,
  type StorySeedRequest,
} from './storySeed'

const json = JSON.stringify({
  title: '雾港来信',
  synopsis: '失踪三年的姐姐在一个雨夜回到旧书店，林夏发现她带回来的寻人启事日期不对。',
  theme: '亲人归来的真相与选择',
  factions: [{ name: '雾港晚报', type: '媒体', leader: '陈默', description: '本地旧报社' }],
  characters: [
    {
      name: '林夏',
      role: '主角',
      identity: '记者',
      sectName: '雾港晚报',
      personality: '执拗，怕水',
      goal: '找到姐姐失踪的真相',
    },
  ],
  relationships: [],
  opening: '雨是傍晚开始下的。林夏推门时，门轴响了一声。',
  hooks: ['姐姐回来了', '寻人启事日期不对', '有人在跟踪她'],
  styleHint: '克制的悬疑，少解释',
})

const request: StorySeedRequest = {
  premise: '失踪三年的姐姐在一个雨夜回来。',
  genres: ['悬疑'],
  targetWords: 300000,
  stylePresetId: 'cold-suspense',
}

describe('story seed', () => {
  it('builds a preview request with opening and hooks', () => {
    const messages = buildStorySeedMessages(request, '冷硬悬疑')
    expect(messages[1].content).toContain('opening')
    expect(messages[1].content).toContain('hooks')
    expect(messages[1].content).toContain('300000')
  })

  it('parses a project setup plus preview fields', () => {
    const seed = parseStorySeed(json)
    expect(seed?.title).toBe('雾港来信')
    expect(seed?.opening).toContain('雨是傍晚')
    expect(seed?.hooks).toHaveLength(3)
    expect(seed?.setup.characters[0].name).toBe('林夏')
  })

  it('converts a seed into a work input', () => {
    const seed = parseStorySeed(json)
    expect(seed).not.toBeNull()
    const input = seedToWorkInput(seed!, request)
    expect(input.title).toBe('雾港来信')
    expect(input.genres).toEqual(['悬疑'])
    expect(input.targetWords).toBe(300000)
    expect(input.characters?.[0].name).toBe('林夏')
    expect(input.factions?.[0].name).toBe('雾港晚报')
  })

  it('rejects incomplete output', () => {
    expect(parseStorySeed('不是 JSON')).toBeNull()
  })
})
