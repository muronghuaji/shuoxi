import type { Chapter, StoryFact, StoryPromise, StoryVolumeMemory, WorkDetail } from './types'
import {
  activeFactsAtChapter,
  currentVolume,
  previousVolume,
  summarizeFact,
} from './storyMemory'
import { normalizeCharacterExperiences } from './characterExperience'
import { normalizeCharacterProfile } from './characterProfile'
import type { StoryMemoryData } from './types'

export interface RetrievedMemory {
  id: string
  kind: 'event' | 'experience' | 'chapter' | 'fact' | 'promise' | 'volume'
  chapterId?: string
  chapterNumber?: number
  title: string
  text: string
  score: number
  source: string
}

export interface StorySearchDocument {
  id: string
  kind: RetrievedMemory['kind']
  chapterId?: string
  chapterNumber?: number
  title: string
  text: string
  importance: number
  chapterIndex: number
}

function makeDoc(
  input: Omit<StorySearchDocument, 'id' | 'chapterIndex'> & {
    id: string
    chapterIndex?: number
  },
): StorySearchDocument {
  return {
    ...input,
    chapterIndex: input.chapterIndex ?? -1,
  }
}

const STOPWORDS = new Set([
  '的',
  '了',
  '在',
  '是',
  '和',
  '与',
  '及',
  '或',
  '他',
  '她',
  '它',
  '我',
  '你',
  '这',
  '那',
  '一个',
  '没有',
  '已经',
  '什么',
  '因为',
  '所以',
  '但是',
  '然后',
  '如果',
  '可以',
  '这一',
  '一次',
  '自己',
])

export function tokenizeStoryText(value: string): string[] {
  const text = value.toLowerCase().replace(/[^\p{Script=Han}a-z0-9]+/gu, ' ')
  const tokens: string[] = []
  for (const part of text.split(/\s+/)) {
    if (!part) continue
    if (/^[a-z0-9]+$/.test(part)) {
      if (part.length > 1) tokens.push(part)
      continue
    }
    const chars = [...part]
    if (chars.length <= 2) {
      tokens.push(part)
      continue
    }
    for (let index = 0; index < chars.length - 1; index += 1) {
      const bigram = `${chars[index]}${chars[index + 1]}`
      if (!STOPWORDS.has(bigram)) tokens.push(bigram)
    }
    for (const char of chars) {
      if (!STOPWORDS.has(char)) tokens.push(char)
    }
  }
  return [...new Set(tokens)]
}

function chapterIndexOf(chapters: Chapter[], id?: string): number {
  if (!id) return -1
  return chapters.findIndex((chapter) => chapter.id === id)
}

export function buildStorySearchDocuments(
  detail: WorkDetail,
  chapters: Chapter[],
  memory: StoryMemoryData,
): StorySearchDocument[] {
  const docs: StorySearchDocument[] = []
  const chapterIndex = new Map(chapters.map((chapter, index) => [chapter.id, index]))
  docs.push(
    ...memory.volumes.map((volume) =>
      makeDoc({
        id: volume.id,
        kind: 'volume',
        chapterId: volume.startChapterId,
        chapterNumber: volume.startIndex + 1,
        title: volume.title,
        text: [
          volume.summary,
          ...volume.keyEvents,
          ...volume.characterChanges,
          ...volume.openThreads,
        ].join('\n'),
        importance: 8,
        chapterIndex: volume.startIndex,
      }),
    ),
  )
  for (const chapter of chapters) {
    const index = chapters.indexOf(chapter)
    if (!chapter.content.trim()) continue
    docs.push(
      makeDoc({
        id: `retrieval-chapter-${chapter.id}`,
        kind: 'chapter',
        chapterId: chapter.id,
        chapterNumber: index + 1,
        title: chapter.title || `第 ${index + 1} 章`,
        text: [chapter.title, chapter.summary, chapter.content.slice(0, 1800)]
          .filter(Boolean)
          .join('\n'),
        importance: 3,
        chapterIndex: index,
      }),
    )
  }
  for (const event of detail.storyStateEvents ?? []) {
    const index = chapterIndex.get(event.chapterId) ?? -1
    docs.push(
      makeDoc({
        id: `retrieval-event-${event.id}`,
        kind: 'event',
        chapterId: event.chapterId,
        chapterNumber: index >= 0 ? index + 1 : undefined,
        title: event.chapterTitle || '剧情事件',
        text: [
          event.summary,
          ...(event.events ?? []).map(
            (item) =>
              `${item.title}：${item.summary}${item.participants.length ? `；参与：${item.participants.join('、')}` : ''}${item.consequences.length ? `；后果：${item.consequences.join('、')}` : ''}`,
          ),
          ...(event.openThreads ?? []),
        ].join('\n'),
        importance:
          Math.max(
            0,
            ...(event.events ?? []).map((item) =>
              item.importance === 'high' ? 3 : item.importance === 'low' ? 0 : 2,
            ),
          ) + 1,
        chapterIndex: index,
      }),
    )
  }
  for (const character of detail.characters) {
    for (const experience of normalizeCharacterExperiences(character.experiences)) {
      if (experience.status === 'retconned') continue
      const index = chapterIndexOf(chapters, experience.chapterId)
      docs.push(
        makeDoc({
          id: `retrieval-exp-${experience.id}`,
          kind: 'experience',
          chapterId: experience.chapterId,
          chapterNumber: index >= 0 ? index + 1 : experience.chapterNumber,
          title: `${character.name} · ${experience.title}`,
          text: [
            experience.summary,
            ...experience.learned,
            ...experience.relationshipChanges.map((item) => `${item.targetName}：${item.change}`),
            experience.location,
          ]
            .filter(Boolean)
            .join('\n'),
          importance:
            experience.importance === 'core' ? 4 : experience.importance === 'major' ? 2 : 1,
          chapterIndex: index,
        }),
      )
    }
  }
  for (const promise of memory.promises) {
    docs.push(
      makeDoc({
        id: `retrieval-promise-${promise.id}`,
        kind: 'promise',
        chapterId: promise.openedChapterId,
        chapterNumber: promise.openedChapterNumber,
        title: promise.title,
        text: [promise.detail, promise.kind, promise.status].filter(Boolean).join('\n'),
        importance: promise.priority === 'main' ? 5 : promise.priority === 'side' ? 2 : 1,
        chapterIndex: chapterIndexOf(chapters, promise.openedChapterId),
      }),
    )
  }
  return docs
}

function scoreDoc(doc: StorySearchDocument, queryTokens: string[], focusNames: string[]): number {
  const text = `${doc.title}\n${doc.text}`.toLowerCase()
  let score = 0
  for (const token of queryTokens) {
    if (text.includes(token)) score += token.length >= 2 ? 2 : 1
  }
  for (const name of focusNames) {
    if (name && text.includes(name.toLowerCase())) score += 5
  }
  score += doc.importance
  return score
}

function dedupeHits(hits: RetrievedMemory[]): RetrievedMemory[] {
  const seen = new Set<string>()
  const output: RetrievedMemory[] = []
  for (const hit of hits) {
    const key = `${hit.kind}:${hit.chapterId ?? ''}:${hit.title}:${hit.text.slice(0, 80)}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(hit)
  }
  return output
}

export function retrieveStoryMemory(
  detail: WorkDetail,
  chapters: Chapter[],
  currentChapterId: string,
  focusText: string,
  memory: StoryMemoryData,
  limit = 8,
): RetrievedMemory[] {
  const currentIndex = Math.max(0, chapterIndexOf(chapters, currentChapterId))
  const queryTokens = tokenizeStoryText(focusText)
  const names = [
    ...detail.characters.flatMap((character) => [
      character.name,
      ...(normalizeCharacterProfile(character.profile).aliases ?? []),
    ]),
    ...detail.factions.map((faction) => faction.name),
    ...(detail.locations ?? []).map((location) => location.name),
    ...(detail.items ?? []).map((item) => item.name),
    ...(detail.species ?? []).map((species) => species.name),
  ].filter((name) => name.trim() && focusText.includes(name))
  const docs = buildStorySearchDocuments(detail, chapters, memory)
    .filter((doc) => doc.chapterIndex < 0 || doc.chapterIndex <= currentIndex)
    .map((doc) => ({
      doc,
      score: scoreDoc(doc, queryTokens, names) + Math.max(0, 5 - Math.abs(currentIndex - doc.chapterIndex)),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
  return dedupeHits(
    docs.slice(0, Math.max(1, Math.min(30, limit * 3))).map(({ doc, score }) => ({
      id: doc.id,
      kind: doc.kind,
      chapterId: doc.chapterId,
      chapterNumber: doc.chapterNumber,
      title: doc.title,
      text: doc.text.slice(0, 700),
      score,
      source: '关键词 + 实体检索',
    })),
  ).slice(0, limit)
}

export function formatRetrievedMemory(hits: RetrievedMemory[]): string {
  if (hits.length === 0) return ''
  return hits
    .map((hit) => {
      const location =
        hit.chapterNumber !== undefined ? `第${hit.chapterNumber}章 ` : ''
      return `- ${location}${hit.title}｜${hit.text.replace(/\s+/g, ' ').slice(0, 260)}`
    })
    .join('\n')
}

export function buildMemoryContextSections(input: {
  detail: WorkDetail
  chapters: Chapter[]
  chapter: Chapter
  focusText: string
  memory: StoryMemoryData
  retrievedMemories?: RetrievedMemory[]
}): string[] {
  const { detail, chapters, chapter, focusText, memory } = input
  const sections: string[] = []
  const current = currentVolume(memory, chapters, chapter.id)
  const previous = previousVolume(memory, chapters, chapter.id)
  if (current) {
    const keyEvents = [...new Set(current.keyEvents)].slice(0, 5)
    sections.push(
      `【当前卷记忆】\n${current.title}：${current.summary}${keyEvents.length ? `\n关键事件：${keyEvents.join('；')}` : ''}`,
    )
  }
  if (previous && previous.id !== current?.id) {
    sections.push(`【上一卷记忆】\n${previous.title}：${previous.summary.slice(0, 300)}`)
  }
  const hits =
    input.retrievedMemories && input.retrievedMemories.length > 0
      ? input.retrievedMemories
      : retrieveStoryMemory(detail, chapters, chapter.id, focusText, memory, 7)
  if (hits.length > 0) {
    sections.push(`【相关历史记忆】\n${formatRetrievedMemory(hits)}\n写作时只使用这些已发生的信息，不要改写方向。`)
  }
  const currentIndex = chapterIndexOf(chapters, chapter.id)
  const relevantPromises = memory.promises
    .filter((promise) => promise.status === 'open' || promise.status === 'advanced')
    .filter((promise) => {
      const due =
        promise.dueChapterNumber !== undefined ? promise.dueChapterNumber - 1 : Infinity
      return due >= Math.max(0, currentIndex - 1) && due <= currentIndex + 5
    })
    .sort((left, right) => (left.dueChapterNumber ?? 0) - (right.dueChapterNumber ?? 0))
    .slice(0, 5)
  if (relevantPromises.length > 0) {
    sections.push(
      `【即将到期 / 应推进的承诺】\n${relevantPromises
        .map(
          (promise) =>
            `- ${promise.title}：${promise.detail || promise.kind}${promise.dueChapterNumber ? `（计划第 ${promise.dueChapterNumber} 章处理）` : ''}`,
        )
        .join('\n')}`,
    )
  }
  const activeFacts = activeFactsAtChapter(memory, chapters, chapter.id)
  const names = new Set(
    detail.characters
      .filter((character) => focusText.includes(character.name))
      .map((character) => character.id),
  )
  for (const faction of detail.factions) {
    if (focusText.includes(faction.name)) names.add(faction.id)
  }
  const focusFacts = activeFacts
    .filter((fact) => names.has(fact.subjectId))
    .filter((fact) =>
      ['status', 'cultivation', 'realmLevel', 'leader', 'facilities', 'warehouse', 'tierLevel'].includes(
        fact.field,
      ),
    )
    .slice(0, 8)
  if (focusFacts.length > 0) {
    sections.push(
      `【当前有效事实】\n${focusFacts.map((fact) => `- ${summarizeFact(fact)}`).join('\n')}`,
    )
  }
  return sections
}

export type { StoryFact, StoryPromise, StoryVolumeMemory }
