import { describe, expect, it } from 'vitest'
import type { FactionConsistencyIssue, WorkDetail } from './types'
import {
  collectDismissedFactionIssues,
  factionIssueKey,
  filterDismissedFactionIssues,
} from './factionAudit'

function issue(overrides: Partial<FactionConsistencyIssue> = {}): FactionConsistencyIssue {
  return {
    factionName: '青崖剑宗',
    type: 'resources',
    quote: '“调动三千灵石。”',
    reason: '当前财政无法调动三千灵石。',
    severity: 'high',
    ...overrides,
  }
}

function detailWithIssue(value: FactionConsistencyIssue): WorkDetail {
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
        factionIssues: [value],
      },
    ],
  }
}

describe('faction audit exemptions', () => {
  it('normalizes quote punctuation for matching', () => {
    expect(factionIssueKey(issue())).toBe(
      factionIssueKey(issue({ quote: '调动三千灵石' })),
    )
  })

  it('collects dismissed issues and filters repeats', () => {
    const dismissed = issue({ dismissed: true })
    const detail = detailWithIssue(dismissed)
    expect(collectDismissedFactionIssues(detail)).toHaveLength(1)
    expect(
      filterDismissedFactionIssues(detail, [issue(), issue({ quote: '完全不同的话' })]),
    ).toHaveLength(1)
  })
})
