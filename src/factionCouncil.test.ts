import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import { emptyFactionProfile } from './factionProfile'
import { buildFactionCouncilMessages, parseFactionCouncil } from './factionCouncil'
import type { Work } from './types'

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

describe('faction council', () => {
  it('parses council JSON and filters malformed positions', () => {
    const parsed = parseFactionCouncil(
      JSON.stringify({
        situation: '太玄剑宗要求交出旧案卷宗。',
        positions: [
          { faction: '守旧派', stance: '拒绝', interests: '保住旧案', risk: '开战' },
          { faction: '', stance: '忽略' },
        ],
        decision: '先拖延三日，暗中转移卷宗。',
        dissent: '少壮派主张直接开战。',
        risks: ['太玄剑宗可能提前动手'],
        nextMoves: ['封锁山门', '联络第三方'],
        sceneHook: '议事结束时，执法堂主留下掌门密令。',
      }),
    )
    expect(parsed?.decision).toContain('拖延')
    expect(parsed?.positions).toHaveLength(1)
    expect(parsed?.nextMoves).toHaveLength(2)
    expect(parsed?.sceneHook).toContain('密令')
  })

  it('builds a collective council prompt', () => {
    const detail = createEmptyDetail()
    const profile = emptyFactionProfile()
    profile.publicFace = '名门正派'
    profile.trueFace = '靠旧案起家'
    profile.governance.internalGroups = [
      { id: 'g1', name: '守旧派', goal: '维持旧规', stance: '反对改革', power: '强', secret: '' },
    ]
    detail.factions = [
      {
        id: 'f1',
        name: '青崖剑宗',
        type: '宗门',
        leader: '顾长风',
        goal: '',
        description: '',
        profile,
      },
    ]
    const messages = buildFactionCouncilMessages({
      work,
      detail,
      faction: detail.factions[0],
      topic: '太玄剑宗索要旧案卷宗，怎么办？',
    })
    const content = messages.map((message) => message.content).join('\n')
    expect(content).toContain('青崖剑宗')
    expect(content).toContain('靠旧案起家')
    expect(content).toContain('守旧派')
    expect(content).toContain('组织像组织')
    expect(content).toContain('太玄剑宗索要旧案卷宗')
  })
})
