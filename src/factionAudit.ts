import type { FactionConsistencyIssue, WorkDetail } from './types'

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s“”「」'"'，。！？、：；,.!?;:（）()]/g, '')
}

export function factionIssueKey(issue: FactionConsistencyIssue): string {
  return [
    normalize(issue.factionName),
    issue.type,
    normalize(issue.quote || issue.reason),
  ].join('|')
}

export function collectDismissedFactionIssues(
  detail: WorkDetail,
): FactionConsistencyIssue[] {
  const seen = new Set<string>()
  const issues: FactionConsistencyIssue[] = []
  for (const event of detail.storyStateEvents ?? []) {
    for (const issue of event.factionIssues ?? []) {
      if (!issue.dismissed) continue
      const key = factionIssueKey(issue)
      if (seen.has(key)) continue
      seen.add(key)
      issues.push(issue)
    }
  }
  return issues
}

export function filterDismissedFactionIssues(
  detail: WorkDetail,
  issues: FactionConsistencyIssue[],
): FactionConsistencyIssue[] {
  const dismissed = new Set(
    collectDismissedFactionIssues(detail).map(factionIssueKey),
  )
  return issues.filter((issue) => !dismissed.has(factionIssueKey(issue)))
}
