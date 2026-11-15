import type { Idea, IdeaStatus, IdeaType } from './types'

export const IDEAS_KEY = 'shuoxi.ideas.v1'
export const MAX_IDEAS = 1000

export const IDEA_TYPE_LABELS: Record<IdeaType, string> = {
  scene: '场景',
  dialogue: '台词',
  character: '人物',
  setting: '设定',
  conflict: '冲突',
  image: '意象',
  twist: '反转',
  other: '其他',
}

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  inbox: '收件箱',
  incubating: '发酵中',
  used: '已使用',
  archived: '已归档',
}

export function newIdeaId(): string {
  return `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function createIdea(partial: Partial<Idea> = {}): Idea {
  const now = Date.now()
  const title = (partial.title ?? '').trim()
  const body = (partial.body ?? '').trim()
  return {
    id: partial.id ?? newIdeaId(),
    title: title || body.slice(0, 42) || '未命名灵感',
    body,
    type: partial.type ?? 'scene',
    tags: partial.tags ?? [],
    status: partial.status ?? 'inbox',
    source: partial.source ?? 'manual',
    workId: partial.workId,
    chapterId: partial.chapterId,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    usedAt: partial.usedAt,
    note: partial.note,
  }
}

function normalizeIdea(raw: unknown): Idea | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  const body = typeof value.body === 'string' ? value.body.trim() : ''
  if (!id || (!title && !body)) return null
  const type = value.type
  const status = value.status
  return createIdea({
    id,
    title: title || body.slice(0, 42),
    body,
    type: typeof type === 'string' && type in IDEA_TYPE_LABELS ? (type as IdeaType) : 'other',
    tags: Array.isArray(value.tags)
      ? value.tags.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12)
      : [],
    status:
      status === 'incubating' || status === 'used' || status === 'archived'
        ? (status as IdeaStatus)
        : 'inbox',
    source:
      value.source === 'selection' || value.source === 'ai' || value.source === 'import'
        ? value.source
        : 'manual',
    workId: typeof value.workId === 'string' && value.workId ? value.workId : undefined,
    chapterId:
      typeof value.chapterId === 'string' && value.chapterId ? value.chapterId : undefined,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    usedAt: typeof value.usedAt === 'number' ? value.usedAt : undefined,
    note: typeof value.note === 'string' ? value.note : undefined,
  })
}

export function normalizeIdeas(raw: unknown): Idea[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(normalizeIdea)
    .filter((item): item is Idea => Boolean(item))
    .slice(0, MAX_IDEAS)
}

export function loadIdeas(): Idea[] {
  try {
    const raw = localStorage.getItem(IDEAS_KEY)
    if (!raw) return []
    return normalizeIdeas(JSON.parse(raw))
  } catch {
    return []
  }
}

export function saveIdeas(ideas: Idea[]): void {
  try {
    localStorage.setItem(IDEAS_KEY, JSON.stringify(ideas.slice(0, MAX_IDEAS)))
  } catch {
    // 灵感只是辅助数据，存储失败不影响写作
  }
}

export function ideaTagsOf(ideas: Idea[]): string[] {
  const tags = new Set<string>()
  for (const idea of ideas) {
    for (const tag of idea.tags) tags.add(tag)
  }
  return [...tags].sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

export function ideaMatches(
  idea: Idea,
  options: { query: string; type: IdeaType | 'all'; status: IdeaStatus | 'all'; workId: string },
): boolean {
  if (options.type !== 'all' && idea.type !== options.type) return false
  if (options.status !== 'all' && idea.status !== options.status) return false
  if (options.workId === 'unlinked' && idea.workId) return false
  if (options.workId !== 'all' && options.workId !== 'unlinked' && idea.workId !== options.workId) {
    return false
  }
  const query = options.query.trim().toLowerCase()
  if (!query) return true
  return `${idea.title}\n${idea.body}\n${idea.tags.join(' ')}`.toLowerCase().includes(query)
}
