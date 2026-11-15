import type {
  Chapter,
  CharacterExperience,
  StoryFact,
  StoryHealthIssue,
  StoryHealthReport,
  StoryKnowledgeEntry,
  StoryMemoryData,
  StoryPromise,
  StoryVolumeMemory,
  WorkDetail,
} from './types'
import { normalizeCharacterProfile } from './characterProfile'
import { normalizeCharacterExperiences } from './characterExperience'
import { normalizeFacilities } from './factionFacilities'
import { resolveStoryThreads } from './storyState'

export const STORY_MEMORY_VERSION = 1 as const
export const VOLUME_SIZE = 20

const VOLUME_CHAPTER_SIZE = VOLUME_SIZE

function safeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function clip(value: string, max = 600): string {
  const text = value.trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function chapterNumber(chapters: Chapter[], id?: string): number | undefined {
  if (!id) return undefined
  const index = chapters.findIndex((chapter) => chapter.id === id)
  return index >= 0 ? index + 1 : undefined
}

function chapterByRef(chapters: Chapter[], ref?: string): Chapter | undefined {
  if (!ref) return undefined
  const value = ref.trim()
  return (
    chapters.find((chapter) => chapter.id === value) ??
    chapters.find((chapter) => chapter.title.trim() === value) ??
    chapters.find((chapter) => value.includes(chapter.title) && chapter.title.trim().length > 1)
  )
}

function lastChapterWithContent(chapters: Chapter[]): Chapter | undefined {
  for (let index = chapters.length - 1; index >= 0; index -= 1) {
    if (chapters[index].content.trim()) return chapters[index]
  }
  return chapters[chapters.length - 1]
}

function factId(
  subjectType: StoryFact['subjectType'],
  subjectId: string,
  field: string,
  source = '',
): string {
  return `fact-${safeId(subjectType)}-${safeId(subjectId)}-${safeId(field)}-${safeId(source)}`
}

function buildFact(input: Omit<StoryFact, 'id'> & { id?: string }): StoryFact {
  return {
    id:
      input.id ??
      factId(input.subjectType, input.subjectId, input.field, input.sourceChapterId ?? ''),
    ...input,
  }
}

function buildVolumeMemories(
  detail: WorkDetail,
  chapters: Chapter[],
  existing: StoryVolumeMemory[],
): StoryVolumeMemory[] {
  const existingById = new Map(existing.map((volume) => [volume.id, volume]))
  const eventByChapter = new Map<string, typeof detail.storyStateEvents>()
  for (const event of detail.storyStateEvents ?? []) {
    const values = eventByChapter.get(event.chapterId) ?? []
    eventByChapter.set(event.chapterId, [...values, event])
  }
  const timelineByChapter = new Map<string, typeof detail.characterStateTimeline>()
  for (const entry of detail.characterStateTimeline ?? []) {
    const values = timelineByChapter.get(entry.chapterId) ?? []
    timelineByChapter.set(entry.chapterId, [...values, entry])
  }

  const volumes: StoryVolumeMemory[] = []
  for (let start = 0; start < chapters.length; start += VOLUME_CHAPTER_SIZE) {
    const end = Math.min(chapters.length - 1, start + VOLUME_CHAPTER_SIZE - 1)
    if (end < start) continue
    const slice = chapters.slice(start, end + 1)
    const id = `volume-${chapters[start].id}-${chapters[end].id}`
    const current = existingById.get(id)
    if (current?.source === 'manual') {
      volumes.push(current)
      continue
    }
    const summaries = slice
      .map((chapter) => chapter.summary?.trim() ?? '')
      .filter(Boolean)
    const eventSummaries = slice.flatMap((chapter) =>
      (eventByChapter.get(chapter.id) ?? []).map((event) => event.summary).filter(Boolean),
    )
    const keyEvents = slice
      .flatMap((chapter) =>
        (eventByChapter.get(chapter.id) ?? []).flatMap((event) =>
          (event.events ?? []).map((item) => item.title || item.summary).filter(Boolean),
        ),
      )
      .slice(0, 8)
    const characterChanges = slice
      .flatMap((chapter) =>
        (timelineByChapter.get(chapter.id) ?? []).flatMap((entry) =>
          entry.changes.map(
            (change) => `${entry.characterName}：${change.field} 从「${change.from}」到「${change.to}」`,
          ),
        ),
      )
      .slice(0, 8)
    const openThreads = slice
      .flatMap((chapter) =>
        (eventByChapter.get(chapter.id) ?? []).flatMap((event) => event.openThreads ?? []),
      )
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(0, 8)
    const summary =
      summaries.length > 0
        ? clip(summaries.join(' / '), 800)
        : eventSummaries.length > 0
          ? clip(eventSummaries.join(' / '), 800)
          : clip(
              slice
                .map((chapter) => chapter.title.trim())
                .filter((title) => title && title !== '未命名章节')
                .filter((title, index, array) => array.indexOf(title) === index)
                .join(' / ') || `${slice.length} 章（暂无摘要）`,
              500,
            )
    volumes.push({
      id,
      title: `第 ${start + 1}–${end + 1} 章`,
      startChapterId: chapters[start].id,
      endChapterId: chapters[end].id,
      startIndex: start,
      endIndex: end,
      chapterCount: slice.length,
      summary,
      keyEvents,
      characterChanges,
      openThreads,
      source: 'auto',
      updatedAt: new Date().toISOString(),
    })
  }
  return volumes
}

function buildEventFacts(detail: WorkDetail, chapters: Chapter[]): StoryFact[] {
  const facts: StoryFact[] = []
  const chapterIndex = new Map(chapters.map((chapter, index) => [chapter.id, index]))
  const nameOf = (type: string, id: string): string => {
    if (type === 'character') return detail.characters.find((item) => item.id === id)?.name ?? id
    if (type === 'faction') return detail.factions.find((item) => item.id === id)?.name ?? id
    if (type === 'location') return detail.locations?.find((item) => item.id === id)?.name ?? id
    if (type === 'item') return detail.items?.find((item) => item.id === id)?.name ?? id
    if (type === 'species') return detail.species?.find((item) => item.id === id)?.name ?? id
    return id
  }
  for (const event of [...(detail.storyStateEvents ?? [])].sort(
    (left, right) =>
      (chapterIndex.get(left.chapterId) ?? 0) - (chapterIndex.get(right.chapterId) ?? 0),
  )) {
    const chapterNum = (chapterIndex.get(event.chapterId) ?? 0) + 1
    event.changes.forEach((change, changeIndex) => {
      if (change.entityType === 'system' || change.entityType === 'module') return
      const subjectType = change.entityType
      const subjectName = nameOf(subjectType, change.entityId)
      facts.push(
        buildFact({
          subjectType,
          subjectId: change.entityId,
          subjectName,
          field: change.field,
          value: change.value,
          displayValue: change.value,
          validFromChapterId: event.chapterId,
          validFromChapterNumber: chapterNum,
          sourceChapterId: event.chapterId,
          sourceEventId: event.id,
          status: 'canon',
          confidence: 'high',
          note: change.note,
        }),
      )
      // 同一个事件里重复字段只保留最后一个值。
      for (let index = facts.length - 2; index >= 0; index -= 1) {
        const earlier = facts[index]
        if (
          earlier.subjectType === subjectType &&
          earlier.subjectId === change.entityId &&
          earlier.field === change.field &&
          earlier.sourceEventId === event.id
        ) {
          facts.splice(index, 1)
          break
        }
      }
      void changeIndex
    })
  }
  return facts
}

function buildCurrentFacts(detail: WorkDetail, chapters: Chapter[]): StoryFact[] {
  const last = lastChapterWithContent(chapters) ?? chapters[chapters.length - 1]
  if (!last) return []
  const number = chapterNumber(chapters, last.id) ?? chapters.length
  const facts: StoryFact[] = []
  const add = (
    subjectType: StoryFact['subjectType'],
    subjectId: string,
    subjectName: string,
    field: string,
    value: string | number | undefined,
  ) => {
    if (value === undefined || value === null || String(value).trim() === '') return
    facts.push(
      buildFact({
        subjectType,
        subjectId,
        subjectName,
        field,
        value: String(value),
        displayValue: String(value),
        validFromChapterId: last.id,
        validFromChapterNumber: number,
        sourceChapterId: last.id,
        status: 'canon',
        confidence: 'medium',
        note: '从当前档案推导',
      }),
    )
  }
  for (const character of detail.characters) {
    add('character', character.id, character.name, 'status', character.status)
    add('character', character.id, character.name, 'cultivation', character.cultivation)
    add('character', character.id, character.name, 'position', character.position)
    add('character', character.id, character.name, 'identity', character.identity)
    add('character', character.id, character.name, 'realmLevel', character.realmLevel)
    add('character', character.id, character.name, 'lifecycle', character.lifecycle)
  }
  for (const faction of detail.factions) {
    add('faction', faction.id, faction.name, 'leader', faction.leader)
    add('faction', faction.id, faction.name, 'description', faction.description)
    add('faction', faction.id, faction.name, 'tierLevel', faction.tierLevel)
    const facilities = normalizeFacilities(faction.facilities)
    if (facilities.length > 0) {
      const total = facilities.reduce((sum, facility) => {
        const counts = facility.counts
        return (
          sum +
          (counts?.elder ?? 0) +
          (counts?.main ?? 0) +
          (counts?.inner ?? 0) +
          (counts?.outer ?? 0) +
          (counts?.menial ?? 0)
        )
      }, 0)
      add(
        'faction',
        faction.id,
        faction.name,
        'facilities',
        `${facilities.length} 处设施，共 ${total} 人；${facilities.map((item) => item.name).join('、')}`,
      )
    }
    const warehouseCount = (faction.warehouse ?? []).reduce(
      (sum, entry) => sum + entry.quantity,
      0,
    )
    add('faction', faction.id, faction.name, 'warehouse', `${warehouseCount} 件`)
  }
  for (const item of detail.items ?? []) {
    add('item', item.id, item.name, 'grade', item.grade)
    add('item', item.id, item.name, 'categoryId', item.categoryId)
    add('item', item.id, item.name, 'description', item.description)
  }
  for (const species of detail.species ?? []) {
    add('species', species.id, species.name, 'category', species.category)
    add('species', species.id, species.name, 'tierLevel', species.tierLevel)
    add('species', species.id, species.name, 'notes', species.notes)
  }
  for (const location of detail.locations ?? []) {
    add('location', location.id, location.name, 'type', location.type)
    add('location', location.id, location.name, 'description', location.description)
  }
  return facts
}

function buildFacts(
  detail: WorkDetail,
  chapters: Chapter[],
  existing: StoryFact[],
): StoryFact[] {
  const existingById = new Map(existing.map((fact) => [fact.id, fact]))
  const seen = new Set<string>()
  const facts: StoryFact[] = []
  for (const fact of [...buildEventFacts(detail, chapters), ...buildCurrentFacts(detail, chapters)]) {
    if (seen.has(fact.id)) continue
    seen.add(fact.id)
    const previous = existingById.get(fact.id)
    facts.push(
      previous
        ? {
            ...fact,
            status: previous.status,
            confidence: previous.confidence,
            note: previous.note ?? fact.note,
          }
        : fact,
    )
  }
  for (const fact of existing) {
    if (!seen.has(fact.id)) facts.push(fact)
  }
  return facts.slice(-2000)
}

function resolveForeshadowChapter(
  chapters: Chapter[],
  value: string | undefined,
): Chapter | undefined {
  return chapterByRef(chapters, value)
}

function buildPromises(
  detail: WorkDetail,
  chapters: Chapter[],
  existing: StoryPromise[],
): StoryPromise[] {
  const byId = new Map(existing.map((promise) => [promise.id, promise]))
  const promises: StoryPromise[] = []
  const now = new Date().toISOString()
  const push = (promise: StoryPromise) => {
    if (promises.some((item) => item.id === promise.id)) return
    const previous = byId.get(promise.id)
    promises.push(previous ? { ...promise, status: previous.status, updatedAt: previous.updatedAt } : promise)
  }
  for (const item of detail.foreshadowings) {
    const opened = resolveForeshadowChapter(chapters, item.plantedIn)
    const due = item.payoffChapterId
      ? chapters.find((chapter) => chapter.id === item.payoffChapterId)
      : undefined
    push({
      id: `promise-foreshadow-${item.id}`,
      kind: 'foreshadow',
      title: item.title,
      detail: [item.note, item.truth].filter(Boolean).join('｜'),
      openedChapterId: opened?.id,
      openedChapterNumber: opened ? chapterNumber(chapters, opened.id) : undefined,
      dueChapterId: due?.id,
      dueChapterNumber: due ? chapterNumber(chapters, due.id) : undefined,
      status: item.status === '已回收' ? 'resolved' : 'open',
      priority: item.importance === '主线' ? 'main' : item.importance === '氛围' ? 'background' : 'side',
      characters: [],
      source: 'derive',
      createdAt: now,
      updatedAt: now,
    })
  }
  for (const thread of resolveStoryThreads(detail)) {
    if (thread.status === 'resolved' || thread.status === 'abandoned') continue
    const opened = thread.createdChapterId
      ? chapters.find((chapter) => chapter.id === thread.createdChapterId)
      : undefined
    push({
      id: `promise-thread-${thread.id}`,
      kind: thread.priority === 'main' ? 'promise' : 'threat',
      title: thread.text,
      detail: '来自长期未解决事项',
      openedChapterId: opened?.id,
      openedChapterNumber: opened ? chapterNumber(chapters, opened.id) : undefined,
      status: thread.status === 'open' ? 'open' : 'advanced',
      priority: thread.priority,
      characters: [],
      source: 'derive',
      createdAt: thread.createdAt ?? now,
      updatedAt: now,
    })
  }
  for (const promise of existing) {
    if (!promises.some((item) => item.id === promise.id)) promises.push(promise)
  }
  return promises
}

function buildKnowledge(
  detail: WorkDetail,
  chapters: Chapter[],
  existing: StoryKnowledgeEntry[],
): StoryKnowledgeEntry[] {
  const byId = new Map(existing.map((entry) => [entry.id, entry]))
  const entries: StoryKnowledgeEntry[] = []
  const push = (entry: StoryKnowledgeEntry) => {
    if (
      entries.some(
        (item) =>
          item.characterId === entry.characterId &&
          item.topic === entry.topic &&
          item.state === entry.state,
      )
    ) {
      return
    }
    entries.push(entry)
  }
  for (const character of detail.characters) {
    const profile = normalizeCharacterProfile(character.profile)
    const last = lastChapterWithContent(chapters)
    const number = last ? chapterNumber(chapters, last.id) : undefined
    const add = (topic: string, state: StoryKnowledgeEntry['state'], source: StoryKnowledgeEntry['source']) => {
      const value = topic.trim()
      if (!value) return
      const id = `know-${safeId(character.id)}-${safeId(state)}-${safeId(value)}`
      const previous = byId.get(id)
      push(
        previous ?? {
          id,
          characterId: character.id,
          characterName: character.name,
          topic: value,
          state,
          source,
          chapterId: last?.id,
          chapterNumber: number,
          confidence: source === 'profile' ? 'medium' : 'high',
        },
      )
    }
    profile.knowledge.knows.slice(0, 40).forEach((topic) => add(topic, '知道', 'profile'))
    profile.knowledge.believes.slice(0, 30).forEach((topic) => add(topic, '误以为', 'profile'))
    profile.knowledge.blindSpots.slice(0, 40).forEach((topic) => add(topic, '不知道', 'profile'))
    for (const experience of normalizeCharacterExperiences(character.experiences)) {
      if (experience.status === 'retconned') continue
      const state: StoryKnowledgeEntry['state'] =
        experience.knowledgeScope === '听别人说' ||
        experience.knowledgeScope === '传闻' ||
        experience.knowledgeScope === '自己推断'
          ? '误以为'
          : '知道'
      for (const learned of experience.learned) {
        push({
          id: `know-${safeId(character.id)}-${safeId(learned)}-${safeId(experience.id)}`,
          characterId: character.id,
          characterName: character.name,
          topic: learned,
          state,
          source: 'experience',
          chapterId: experience.chapterId,
          chapterNumber: experience.chapterNumber,
          confidence: state === '知道' ? 'high' : 'medium',
        })
      }
    }
  }
  for (const entry of existing) {
    if (!entries.some((item) => item.id === entry.id)) entries.push(entry)
  }
  return entries.slice(-3000)
}

export function activeFactsAtChapter(
  memory: StoryMemoryData,
  chapters: Chapter[],
  chapterId: string,
): StoryFact[] {
  const currentIndex = chapters.findIndex((chapter) => chapter.id === chapterId)
  if (currentIndex < 0) return memory.facts
  const bySubjectField = new Map<string, StoryFact>()
  for (const fact of memory.facts) {
    if (fact.status === 'retconned') continue
    const index = fact.validFromChapterId
      ? chapters.findIndex((chapter) => chapter.id === fact.validFromChapterId)
      : -1
    if (index > currentIndex) continue
    const key = `${fact.subjectType}:${fact.subjectId}:${fact.field}`
    const previous = bySubjectField.get(key)
    if (!previous || (index > 0 && index > (chapters.findIndex((chapter) => chapter.id === previous.validFromChapterId) ?? -1))) {
      bySubjectField.set(key, fact)
    }
  }
  return [...bySubjectField.values()]
}

function buildHealth(
  detail: WorkDetail,
  chapters: Chapter[],
  volumes: StoryVolumeMemory[],
  facts: StoryFact[],
  promises: StoryPromise[],
  knowledge: StoryKnowledgeEntry[],
): StoryHealthReport {
  const issues: StoryHealthIssue[] = []
  const currentIndex = Math.max(0, chapters.length - 1)
  const add = (issue: Omit<StoryHealthIssue, 'id'>) =>
    issues.push({ ...issue, id: `health-${issues.length}-${issue.type}` })
  for (const promise of promises) {
    if (promise.status !== 'open') continue
    if (promise.dueChapterNumber !== undefined && promise.dueChapterNumber <= currentIndex + 1) {
      add({
        type: 'overdue-promise',
        severity: 'high',
        title: `承诺已到期：${promise.title}`,
        detail: `计划在第 ${promise.dueChapterNumber} 章处理，现在已到第 ${currentIndex + 1} 章。`,
        suggestion: '在剧情账本里推进、延长回收章节或标记放弃。',
      })
    } else if (
      promise.openedChapterNumber !== undefined &&
      currentIndex + 1 - promise.openedChapterNumber > 40
    ) {
      add({
        type: 'stale-thread',
        severity: 'medium',
        title: `长期未推进：${promise.title}`,
        detail: `从第 ${promise.openedChapterNumber} 章埋下，已经 ${currentIndex + 1 - promise.openedChapterNumber} 章没有明确推进。`,
        suggestion: '考虑在本卷安排一次回收或明确删除。',
      })
    }
  }
  for (const chapter of chapters) {
    if (chapter.content.trim() && !chapter.summary?.trim() && !volumes.some((volume) => volume.startIndex <= chapters.indexOf(chapter) && volume.endIndex >= chapters.indexOf(chapter) && volume.summary.trim())) {
      add({
        type: 'missing-summary',
        severity: 'low',
        title: `章节缺少摘要：${chapter.title || '未命名章节'}`,
        detail: '没有章节摘要会让后续检索缺少入口。',
        chapterId: chapter.id,
        suggestion: '同步本章或手动补一句摘要。',
      })
    }
  }
  const dead = detail.characters.filter((character) => character.lifecycle === '已下线')
  const latest = chapters[Math.max(0, chapters.length - 1)]
  for (const character of dead) {
    if (character.name && latest?.content.includes(character.name)) {
      add({
        type: 'dead-character',
        severity: 'high',
        title: `已下线角色仍出现在正文：${character.name}`,
        detail: `角色状态是已下线，但最近章节正文提到了该名字。`,
        chapterId: latest.id,
        entityName: character.name,
        suggestion: '检查是否复活 / 回忆 / 同名，必要时更新状态。',
      })
    }
  }
  const active = activeFactsAtChapter(
    { version: 1, generatedAt: '', volumes, facts, promises, knowledge, health: { score: 100, generatedAt: '', issues: [], counts: {} } },
    chapters,
    latest?.id ?? '',
  )
  const grouped = new Map<string, StoryFact[]>()
  for (const fact of active) {
    const key = `${fact.subjectType}:${fact.subjectId}:${fact.field}`
    grouped.set(key, [...(grouped.get(key) ?? []), fact])
  }
  for (const values of grouped.values()) {
    if (values.length > 1 && new Set(values.map((fact) => fact.displayValue)).size > 1) {
      add({
        type: 'canon-conflict',
        severity: 'high',
        title: `事实冲突：${values[0].subjectName} · ${values[0].field}`,
        detail: values.map((fact) => `${fact.displayValue}（第 ${fact.validFromChapterNumber} 章）`).join(' / '),
        entityName: values[0].subjectName,
        suggestion: '在事实库里把旧版本标记为已撤回，或重新同步。',
      })
    }
  }
  const high = issues.filter((issue) => issue.severity === 'high').length
  const medium = issues.filter((issue) => issue.severity === 'medium').length
  const low = issues.length - high - medium
  const score = Math.max(0, 100 - high * 12 - medium * 5 - low * 1)
  const counts = issues.reduce<Record<string, number>>((accumulator, issue) => {
    accumulator[issue.type] = (accumulator[issue.type] ?? 0) + 1
    return accumulator
  }, {})
  return {
    score,
    generatedAt: new Date().toISOString(),
    issues: issues.slice(0, 100),
    counts,
  }
}

export function buildStoryMemory(
  detail: WorkDetail,
  chapters: Chapter[],
): StoryMemoryData {
  const existing = detail.memory
  const volumes = buildVolumeMemories(detail, chapters, existing?.volumes ?? [])
  const facts = buildFacts(detail, chapters, existing?.facts ?? [])
  const promises = buildPromises(detail, chapters, existing?.promises ?? [])
  const knowledge = buildKnowledge(detail, chapters, existing?.knowledge ?? [])
  const health = buildHealth(detail, chapters, volumes, facts, promises, knowledge)
  return {
    version: STORY_MEMORY_VERSION,
    generatedAt: new Date().toISOString(),
    volumes,
    facts,
    promises,
    knowledge,
    health,
    lastAudit: existing?.lastAudit,
  }
}

export function ensureStoryMemory(detail: WorkDetail, chapters: Chapter[]): StoryMemoryData {
  return detail.memory?.version === 1 ? detail.memory : buildStoryMemory(detail, chapters)
}

export function activeFactsForSubject(
  memory: StoryMemoryData,
  chapters: Chapter[],
  chapterId: string,
  subjectIds: string[],
): StoryFact[] {
  const ids = new Set(subjectIds)
  return activeFactsAtChapter(memory, chapters, chapterId).filter((fact) =>
    ids.has(fact.subjectId),
  )
}

export function currentVolume(
  memory: StoryMemoryData,
  chapters: Chapter[],
  chapterId: string,
): StoryVolumeMemory | undefined {
  const index = chapters.findIndex((chapter) => chapter.id === chapterId)
  if (index < 0) return undefined
  return memory.volumes.find((volume) => index >= volume.startIndex && index <= volume.endIndex)
}

export function previousVolume(
  memory: StoryMemoryData,
  chapters: Chapter[],
  chapterId: string,
): StoryVolumeMemory | undefined {
  const current = currentVolume(memory, chapters, chapterId)
  if (!current) return undefined
  return memory.volumes.find((volume) => volume.endIndex === current.startIndex - 1)
}

export function summarizeFact(fact: StoryFact): string {
  return `${fact.subjectName} · ${fact.field}：${fact.displayValue}（第 ${fact.validFromChapterNumber} 章）`
}

export function experienceKnowledgeState(
  experience: CharacterExperience,
): StoryKnowledgeEntry['state'] {
  return experience.knowledgeScope === '听别人说' ||
    experience.knowledgeScope === '传闻' ||
    experience.knowledgeScope === '自己推断'
    ? '误以为'
    : '知道'
}
