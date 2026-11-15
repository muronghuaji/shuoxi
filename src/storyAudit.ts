import type {
  Chapter,
  StoryHealthIssue,
  StoryMemoryData,
  WorkDetail,
} from './types'
import { normalizeCharacterProfile } from './characterProfile'
import { activeFactsAtChapter } from './storyMemory'

export interface StoryTextAuditInput {
  text: string
  baseContent?: string
  detail: WorkDetail
  chapters: Chapter[]
  chapterId: string
  memory?: StoryMemoryData
}

function snippets(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 24)
}

export function auditGeneratedText(input: StoryTextAuditInput): StoryHealthIssue[] {
  const text = input.text.trim()
  if (!text) return []
  const issues: StoryHealthIssue[] = []
  const add = (issue: Omit<StoryHealthIssue, 'id'>) =>
    issues.push({ ...issue, id: `audit-${issues.length}-${issue.type}` })
  const chapterIndex = Math.max(
    0,
    input.chapters.findIndex((chapter) => chapter.id === input.chapterId),
  )
  const chapterNumber = chapterIndex + 1

  for (const character of input.detail.characters) {
    if (character.lifecycle === '已下线' && character.name && text.includes(character.name)) {
      add({
        type: 'dead-character',
        severity: 'high',
        title: `已下线角色出现：${character.name}`,
        detail: '最新生成正文包含一个已下线角色的名字。',
        chapterId: input.chapterId,
        chapterNumber,
        entityName: character.name,
        suggestion: '确认是复活、回忆、同名，还是连续性错误。',
      })
    }
  }

  for (const character of input.detail.characters) {
    if (!character.name || !text.includes(character.name)) continue
    const profile = normalizeCharacterProfile(character.profile)
    const blindSpots = [
      ...profile.knowledge.blindSpots,
      ...profile.knowledge.secrets,
    ]
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
      .slice(0, 20)
    for (const topic of blindSpots) {
      if (!text.includes(topic)) continue
      add({
        type: 'knowledge-leak',
        severity: 'medium',
        title: `可能的认知越界：${character.name}`,
        detail: `正文出现了「${topic}」，但它在该角色的「不知道 / 秘密」边界里。可能是误解、猜测或泄漏，建议人工确认。`,
        chapterId: input.chapterId,
        chapterNumber,
        entityName: character.name,
        suggestion: '检查该角色是否真的知道；不知道就改为怀疑、试探或删除。',
      })
      break
    }
  }

  const previousSnippets = new Set(snippets(input.baseContent ?? ''))
  const repeated = snippets(text).filter((line) => previousSnippets.has(line))
  if (repeated.length > 0) {
    add({
      type: 'repetition',
      severity: 'low',
      title: `检测到 ${repeated.length} 段重复`,
      detail: repeated[0].slice(0, 160),
      chapterId: input.chapterId,
      chapterNumber,
      suggestion: '删除重复段落，或让 AI 只重写重复段。',
    })
  }

  if (input.memory) {
    const facts = activeFactsAtChapter(input.memory, input.chapters, input.chapterId)
    const conflicts = new Map<string, string[]>()
    for (const fact of facts) {
      const key = `${fact.subjectType}:${fact.subjectId}:${fact.field}`
      conflicts.set(key, [...(conflicts.get(key) ?? []), fact.displayValue])
    }
    for (const values of conflicts.values()) {
      const unique = [...new Set(values)]
      if (unique.length > 1) {
        add({
          type: 'canon-conflict',
          severity: 'medium',
          title: '记忆库中存在同字段多版本',
          detail: unique.slice(0, 3).join(' / '),
          chapterId: input.chapterId,
          chapterNumber,
          suggestion: '打开事实库，撤回旧版本或确认哪个是正史。',
        })
        break
      }
    }
  }

  return issues.slice(0, 20)
}

export function auditSeverityScore(issues: StoryHealthIssue[]): number {
  return issues.reduce((score, issue) => {
    if (issue.severity === 'high') return score + 12
    if (issue.severity === 'medium') return score + 5
    return score + 1
  }, 0)
}

/**
 * 只做确定安全的本地修复：删除与已有正文或前文完全重复的长段落。
 * 不做语义改写，避免自动修复把正文改坏。
 */
export function repairRepeatedParagraphs(
  generated: string,
  baseContent = '',
): { text: string; removed: number } {
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
  const existing = new Set(
    baseContent
      .split(/\n+/)
      .map(normalize)
      .filter((line) => line.length >= 24),
  )
  const seen = new Set<string>()
  const output: string[] = []
  let removed = 0
  for (const paragraph of generated.split(/\n+/)) {
    const normalized = normalize(paragraph)
    if (
      normalized.length >= 24 &&
      (existing.has(normalized) || seen.has(normalized))
    ) {
      removed += 1
      continue
    }
    if (normalized.length >= 24) seen.add(normalized)
    output.push(paragraph.trimEnd())
  }
  return {
    text: output.join('\n\n').trim(),
    removed,
  }
}
