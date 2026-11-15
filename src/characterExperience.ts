import type {
  Chapter,
  CharacterCard,
  CharacterExperience,
  CharacterExperienceRelationChange,
  CharacterKnowledgeScope,
  StoryStateEvent,
  StoryEventEntry,
  WorkDetail,
} from './types'
import { normalizeCharacterProfile } from './characterProfile'

export const KNOWLEDGE_SCOPES: CharacterKnowledgeScope[] = [
  '亲身经历',
  '亲眼所见',
  '听别人说',
  '传闻',
  '自己推断',
  '秘密知情',
]

export const KNOWLEDGE_SCOPE_LABELS: Record<CharacterKnowledgeScope, string> = {
  亲身经历: '亲身经历',
  亲眼所见: '亲眼所见',
  听别人说: '听别人说',
  传闻: '传闻',
  自己推断: '自己推断',
  秘密知情: '秘密知情',
}

export const EXPERIENCE_IMPORTANCE_LABELS = {
  core: '核心',
  major: '重要',
  minor: '日常',
} as const

function experienceId(): string {
  return `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function stringList(value: unknown, max = 12, itemMax = 160): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => text(item, itemMax))
        .filter(Boolean)
        .slice(0, max)
    : []
}

function relationChanges(value: unknown): CharacterExperienceRelationChange[] {
  if (!Array.isArray(value)) return []
  const output: CharacterExperienceRelationChange[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    const targetName = text(raw.targetName ?? raw.name, 80)
    if (!targetName) continue
    output.push({
      targetId: text(raw.targetId, 100) || undefined,
      targetName,
      type: text(raw.type, 40) || '关系',
      change: text(raw.change ?? raw.note, 240),
    })
    if (output.length >= 12) break
  }
  return output
}

export function normalizeCharacterExperience(raw: unknown, _index = 0): CharacterExperience | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const title = text(value.title, 120)
  const summary = text(value.summary ?? value.note, 1000)
  if (!title && !summary) return null
  const knowledgeScope =
    typeof value.knowledgeScope === 'string' &&
    KNOWLEDGE_SCOPES.includes(value.knowledgeScope as CharacterKnowledgeScope)
      ? (value.knowledgeScope as CharacterKnowledgeScope)
      : '亲身经历'
  const importance =
    value.importance === 'core' || value.importance === 'minor' || value.importance === 'major'
      ? value.importance
      : 'major'
  const status =
    value.status === 'rumor' || value.status === 'retconned' ? value.status : 'canon'
  const source =
    value.source === 'sync' || value.source === 'backfill' ? value.source : 'manual'
  const now = new Date().toISOString()
  const chapterNumber = Number(value.chapterNumber)
  return {
    id: text(value.id, 120) || experienceId(),
    chapterId: text(value.chapterId, 120) || undefined,
    chapterNumber:
      Number.isFinite(chapterNumber) && chapterNumber > 0 ? Math.round(chapterNumber) : undefined,
    storyTime: text(value.storyTime, 120) || undefined,
    title: title || summary.slice(0, 32),
    summary: summary || title,
    participants: stringList(value.participants, 12, 80),
    location: text(value.location, 120) || undefined,
    cause: text(value.cause, 400) || undefined,
    result: text(value.result, 500) || undefined,
    knowledgeScope,
    learned: stringList(value.learned, 12, 300),
    relationshipChanges: relationChanges(value.relationshipChanges ?? value.relationships),
    injuries: text(value.injuries, 300) || undefined,
    possessions: text(value.possessions, 300) || undefined,
    emotionalImpact: text(value.emotionalImpact, 300) || undefined,
    importance,
    status,
    source,
    eventId: text(value.eventId, 120) || undefined,
    createdAt: text(value.createdAt, 80) || now,
    updatedAt: text(value.updatedAt, 80) || now,
  }
}

export function normalizeCharacterExperiences(raw: unknown): CharacterExperience[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item, index) => normalizeCharacterExperience(item, index))
    .filter((item): item is CharacterExperience => Boolean(item))
    .slice(-500)
}

export function experienceDedupeKey(experience: CharacterExperience): string {
  return [
    experience.chapterId ?? experience.chapterNumber ?? '',
    experience.title.trim().toLowerCase(),
    experience.summary.trim().toLowerCase(),
  ].join('|')
}

export function sortCharacterExperiences(
  experiences: CharacterExperience[],
  chapters: Chapter[] = [],
): CharacterExperience[] {
  const chapterIndex = new Map(chapters.map((chapter, index) => [chapter.id, index]))
  return [...experiences].sort((left, right) => {
    const leftIndex =
      left.chapterId && chapterIndex.has(left.chapterId)
        ? (chapterIndex.get(left.chapterId) as number)
        : left.chapterNumber ?? Number.MAX_SAFE_INTEGER
    const rightIndex =
      right.chapterId && chapterIndex.has(right.chapterId)
        ? (chapterIndex.get(right.chapterId) as number)
        : right.chapterNumber ?? Number.MAX_SAFE_INTEGER
    if (leftIndex !== rightIndex) return leftIndex - rightIndex
    return left.createdAt.localeCompare(right.createdAt)
  })
}

export function appendCharacterExperiences(
  existing: CharacterExperience[] | undefined,
  incoming: CharacterExperience[],
  chapters: Chapter[] = [],
): { experiences: CharacterExperience[]; added: number } {
  const next = sortCharacterExperiences(normalizeCharacterExperiences(existing), chapters)
  const keys = new Set(next.map(experienceDedupeKey))
  let added = 0
  for (const candidate of incoming) {
    const key = experienceDedupeKey(candidate)
    if (keys.has(key)) continue
    keys.add(key)
    next.push(candidate)
    added += 1
  }
  return {
    experiences: sortCharacterExperiences(next, chapters).slice(-500),
    added,
  }
}

export function updateCharacterExperiences(
  character: CharacterCard,
  incoming: CharacterExperience[],
  chapters: Chapter[] = [],
): { experiences: CharacterExperience[]; added: number } {
  return appendCharacterExperiences(character.experiences, incoming, chapters)
}

export function characterDisplayName(character: CharacterCard): string {
  return character.name.trim() || '未命名角色'
}

export function chapterLabelForExperience(
  experience: CharacterExperience,
  chapters: Chapter[] = [],
): string {
  const index = experience.chapterId
    ? chapters.findIndex((chapter) => chapter.id === experience.chapterId)
    : -1
  if (index >= 0) {
    return `第 ${index + 1} 章 ${chapters[index]?.title || '未命名章节'}`
  }
  if (experience.chapterNumber) return `第 ${experience.chapterNumber} 章`
  return '未标章节'
}

export function chapterIndexOfExperience(
  experience: CharacterExperience,
  chapters: Chapter[] = [],
): number {
  if (experience.chapterId) {
    const index = chapters.findIndex((chapter) => chapter.id === experience.chapterId)
    if (index >= 0) return index
  }
  if (experience.chapterNumber) return Math.max(0, experience.chapterNumber - 1)
  return -1
}

/**
 * P3 检索：只取当前章节之前、未被撤回的经历；优先近期、重要、与当前文本相关。
 * 最终仍按时间正序输出，避免 AI 把经历顺序看反。
 */
export function selectRelevantCharacterExperiences(
  character: CharacterCard,
  chapters: Chapter[],
  currentChapterId: string,
  focusText = '',
  limit = 8,
): CharacterExperience[] {
  const all = normalizeCharacterExperiences(character.experiences).filter(
    (experience) => experience.status !== 'retconned',
  )
  const currentIndex = Math.max(
    0,
    chapters.findIndex((chapter) => chapter.id === currentChapterId),
  )
  const actorNames = [character.name, ...(normalizeCharacterProfile(character.profile).aliases ?? [])]
    .map((name) => name.trim())
    .filter(Boolean)
  const lowerFocus = focusText.toLowerCase()
  const mentioned = (value: string) =>
    Boolean(value) && lowerFocus.includes(value.toLowerCase())
  const scored = all
    .map((experience) => {
      const index = chapterIndexOfExperience(experience, chapters)
      // 未标章节的旧经历不能证明发生在未来；保留。标了章节且在未来则排除。
      const future = index >= 0 && index > currentIndex
      if (future) return null
      let score = 0
      const age = index >= 0 ? Math.max(0, currentIndex - index) : 20
      if (age <= 2) score += 8
      else if (age <= 5) score += 5
      else if (age <= 12) score += 2
      if (experience.importance === 'core') score += 6
      else if (experience.importance === 'major') score += 3
      const haystack = [
        experience.title,
        experience.summary,
        experience.location ?? '',
        ...experience.participants,
        ...experience.learned,
        ...experience.relationshipChanges.map((item) => `${item.targetName} ${item.change}`),
      ].join('\n')
      if (mentioned(haystack)) score += 9
      if (actorNames.some((name) => haystack.includes(name))) score += 1
      if (experience.knowledgeScope === '秘密知情') score += 2
      return { experience, score, index }
    })
    .filter((item): item is { experience: CharacterExperience; score: number; index: number } =>
      Boolean(item),
    )
    .sort((left, right) => right.score - left.score || right.index - left.index)
    .slice(0, Math.max(1, Math.min(12, limit)))
  return sortCharacterExperiences(
    scored.map((item) => item.experience),
    chapters,
  )
}

function knowledgeLines(character: CharacterCard): string[] {
  const profile = normalizeCharacterProfile(character.profile)
  const lines: string[] = []
  if (profile.knowledge.knows.length) {
    lines.push(`- 知道：${profile.knowledge.knows.slice(0, 8).join('；')}`)
  }
  if (profile.knowledge.believes.length) {
    lines.push(`- 误以为 / 相信：${profile.knowledge.believes.slice(0, 6).join('；')}`)
  }
  if (profile.knowledge.blindSpots.length) {
    lines.push(`- 不知道：${profile.knowledge.blindSpots.slice(0, 8).join('；')}`)
  }
  return lines
}

export function formatCharacterExperiencePrompt(
  character: CharacterCard,
  chapters: Chapter[],
  currentChapterId: string,
  focusText = '',
): string {
  const selected = selectRelevantCharacterExperiences(
    character,
    chapters,
    currentChapterId,
    focusText,
    8,
  )
  const boundary = knowledgeLines(character)
  if (selected.length === 0 && boundary.length === 0) return ''
  const lines = [`【${characterDisplayName(character)} · 个人经历与认知边界】`]
  if (selected.length > 0) {
    lines.push('只可依据以下经历行动；未出现在经历或认知边界里的信息，角色不能知道：')
    for (const experience of selected) {
      lines.push(
        `- ${chapterLabelForExperience(experience, chapters)}｜${experience.title}｜${KNOWLEDGE_SCOPE_LABELS[experience.knowledgeScope]}`,
      )
      lines.push(`  ${experience.summary.slice(0, 260)}`)
      if (experience.learned.length) {
        lines.push(`  学到：${experience.learned.slice(0, 4).join('；')}`)
      }
      if (experience.relationshipChanges.length) {
        lines.push(
          `  关系变化：${experience.relationshipChanges
            .slice(0, 4)
            .map((item) => `${item.targetName}（${item.type}）${item.change}`)
            .join('；')}`,
        )
      }
      if (experience.injuries) lines.push(`  伤势：${experience.injuries}`)
      if (experience.possessions) lines.push(`  持有变化：${experience.possessions}`)
      if (experience.emotionalImpact) lines.push(`  情绪影响：${experience.emotionalImpact}`)
    }
  }
  if (boundary.length > 0) {
    lines.push('【当前认知边界】', ...boundary)
  }
  return lines.join('\n')
}

export function deriveExperiencesFromEvents(
  detail: WorkDetail,
  character: CharacterCard,
  chapters: Chapter[] = [],
): CharacterExperience[] {
  const names = new Set(
    [
      character.name,
      ...(normalizeCharacterProfile(character.profile).aliases ?? []),
    ]
      .map((name) => name.trim())
      .filter(Boolean),
  )
  const chapterIndex = new Map(chapters.map((chapter, index) => [chapter.id, index]))
  const experiences: CharacterExperience[] = []
  const push = (event: StoryStateEvent, item: StoryEventEntry) => {
    const participants = item.participants ?? []
    if (!participants.some((name: string) => names.has(name.trim()))) return
    const index = chapterIndex.get(event.chapterId)
    experiences.push({
      id: experienceId(),
      chapterId: event.chapterId,
      chapterNumber: typeof index === 'number' ? index + 1 : undefined,
      storyTime: undefined,
      title: item.title || '章节事件',
      summary: item.summary || event.summary || item.title || '章节事件',
      participants: participants.slice(0, 12),
      location: item.location || undefined,
      cause: item.cause || undefined,
      result: item.result || undefined,
      knowledgeScope: '亲身经历',
      learned: [],
      relationshipChanges: [],
      injuries: undefined,
      possessions: undefined,
      emotionalImpact: undefined,
      importance: item.importance === 'high' ? 'core' : item.importance === 'low' ? 'minor' : 'major',
      status: item.status === 'rumor' ? 'rumor' : 'canon',
      source: 'backfill',
      eventId: event.id,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    })
  }
  for (const event of detail.storyStateEvents ?? []) {
    for (const item of event.events ?? []) push(event, item)
  }
  return experiences
}
