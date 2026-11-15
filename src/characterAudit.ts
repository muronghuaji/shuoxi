import type { CharacterConsistencyIssue, WorkDetail } from './types'

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s“”「」'"'，。！？、：；,.!?;:（）()]/g, '')
}

/**
 * 豁免按「角色 + 类型 + 原句」匹配。原句为空时退回原因文本，
 * 这样作者标记“不是问题”后，模型再次报同一句不会重复打扰。
 */
export function characterIssueKey(issue: CharacterConsistencyIssue): string {
  return [
    normalize(issue.characterName),
    issue.type,
    normalize(issue.quote || issue.reason),
  ].join('|')
}

export function collectDismissedIssues(detail: WorkDetail): CharacterConsistencyIssue[] {
  const seen = new Set<string>()
  const issues: CharacterConsistencyIssue[] = []
  for (const event of detail.storyStateEvents ?? []) {
    for (const issue of event.characterIssues ?? []) {
      if (!issue.dismissed) continue
      const key = characterIssueKey(issue)
      if (seen.has(key)) continue
      seen.add(key)
      issues.push(issue)
    }
  }
  return issues
}

export function filterDismissedIssues(
  detail: WorkDetail,
  issues: CharacterConsistencyIssue[],
): CharacterConsistencyIssue[] {
  const dismissed = new Set(collectDismissedIssues(detail).map(characterIssueKey))
  return issues.filter((issue) => !dismissed.has(characterIssueKey(issue)))
}

export function activeCharacterIssues(
  detail: WorkDetail,
): CharacterConsistencyIssue[] {
  return (detail.storyStateEvents ?? []).flatMap((event) =>
    (event.characterIssues ?? []).filter((issue) => !issue.dismissed),
  )
}
