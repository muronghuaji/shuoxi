import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import {
  applyStoryStateUpdate,
  mergeDeepStateUpdate,
  type ParsedStateUpdate,
} from './storyState'

function emptyUpdate(): ParsedStateUpdate {
  return {
    summary: '',
    changes: [],
    events: [],
    openThreads: [],
    resolvedThreads: [],
    newEntities: [],
    characterExperiences: [],
    characterIssues: [],
    factionIssues: [],
  }
}

describe('deep sync merge', () => {
  it('does not append a second chapter event', () => {
    const detail = createEmptyDetail()
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
    const fast = emptyUpdate()
    fast.summary = '陈默发现档案被改。'
    fast.events = [
      {
        id: 'e1',
        title: '档案室',
        summary: '陈默发现档案被改。',
        participants: ['陈默'],
        location: '档案室',
        cause: '',
        result: '',
        consequences: [],
        importance: 'high',
        status: 'canon',
      },
    ]
    const applied = applyStoryStateUpdate(detail, fast, 'ch1', '第一章')
    const deep = emptyUpdate()
    deep.characterExperiences = [
      {
        characterId: 'c1',
        characterName: '陈默',
        experience: {
          id: 'exp1',
          title: '发现涂改',
          summary: '陈默发现底册被涂改。',
          participants: ['陈默'],
          knowledgeScope: '亲眼所见',
          learned: ['底册被改过'],
          relationshipChanges: [],
          importance: 'major',
          status: 'canon',
          source: 'sync',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    ]
    const merged = mergeDeepStateUpdate(applied.detail, deep, 'ch1')
    expect(merged.detail.storyStateEvents).toHaveLength(1)
    expect(merged.detail.storyStateEvents?.[0].events).toHaveLength(1)
    expect(merged.experiences).toHaveLength(1)

    const mergedAgain = mergeDeepStateUpdate(merged.detail, deep, 'ch1')
    expect(mergedAgain.detail.storyStateEvents).toHaveLength(1)
    expect(mergedAgain.experiences).toHaveLength(0)
    expect(mergedAgain.detail.characters[0].experiences).toHaveLength(1)
  })
})
