import { describe, expect, it } from 'vitest'
import type { CharacterConsistencyIssue, WorkDetail } from './types'
import {
  characterIssueKey,
  collectDismissedIssues,
  filterDismissedIssues,
} from './characterAudit'

function issue(overrides: Partial<CharacterConsistencyIssue> = {}): CharacterConsistencyIssue {
  return {
    characterName: '陆照雪',
    type: 'knowledge',
    quote: '“我早知道剑匣里是空的。”',
    reason: '认知边界里不知道剑匣被调换。',
    severity: 'high',
    ...overrides,
  }
}

function detailWithIssue(value: CharacterConsistencyIssue): WorkDetail {
  return {
    worldview: '',
    style: { tone: [], pace: '中', dialogue: '中', description: '适中', taboos: '', notes: '' },
    characters: [],
    factions: [],
    relationships: [],
    foreshadowings: [],
    analysis: '',
    storyStateEvents: [
      {
        id: 'e1',
        chapterId: 'ch1',
        chapterTitle: '第一章',
        createdAt: new Date().toISOString(),
        summary: '',
        changes: [],
        characterIssues: [value],
      },
    ],
  }
}

describe('character audit exemptions', () => {
  it('matches quoted issues regardless of punctuation and whitespace', () => {
    expect(characterIssueKey(issue())).toBe(
      characterIssueKey(issue({ quote: '我早知道剑匣里是空的', reason: '不同原因' })),
    )
  })

  it('collects dismissed issues and filters repeats', () => {
    const dismissed = issue({ dismissed: true, dismissedAt: new Date().toISOString() })
    const detail = detailWithIssue(dismissed)
    expect(collectDismissedIssues(detail)).toHaveLength(1)
    expect(filterDismissedIssues(detail, [issue(), issue({ quote: '完全不同的话' })])).toEqual([
      issue({ quote: '完全不同的话' }),
    ])
  })
})
