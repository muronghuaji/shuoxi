import type {
  CharacterCard,
  CharacterConsistencyIssue,
  CharacterDynamicChange,
  CharacterDynamicField,
  CharacterExperience,
  CharacterStateTimelineEntry,
  FactionCard,
  FactionConsistencyIssue,
  FactionDynamicChange,
  FactionDynamicField,
  FactionStateTimelineEntry,
  ForeshadowingCard,
  LocationCard,
  RelationshipCard,
  StoryEventEntry,
  StoryEventImportance,
  StoryEventStatus,
  StoryStateChange,
  StoryStateEvent,
  StoryStateJsonValue,
  StoryStateNewEntity,
  StoryStateSnapshot,
  StoryThread,
  WorkDetail,
} from './types'
import { normalizeCharacterProfile } from './characterProfile'
import { normalizeFactionProfile } from './factionProfile'
import { normalizeFacilities } from './factionFacilities'
import { normalizeInventory } from './inventory'
import { emptySpecies, normalizeSpecies } from './species'
import {
  experienceDedupeKey,
  normalizeCharacterExperience,
  normalizeCharacterExperiences,
} from './characterExperience'
import { filterDismissedIssues } from './characterAudit'
import { filterDismissedFactionIssues } from './factionAudit'

export interface ParsedCharacterExperience {
  characterId?: string
  characterName?: string
  experience: CharacterExperience
}

export interface ParsedStateUpdate {
  summary: string
  changes: StoryStateChange[]
  events: StoryEventEntry[]
  openThreads: string[]
  resolvedThreads: string[]
  newEntities: StoryStateNewEntity[]
  characterExperiences: ParsedCharacterExperience[]
  characterIssues: CharacterConsistencyIssue[]
  factionIssues: FactionConsistencyIssue[]
}

export function deriveStoryThreads(events: StoryStateEvent[] | undefined): StoryThread[] {
  const threads: StoryThread[] = []
  const byText = new Map<string, StoryThread>()
  for (const event of events ?? []) {
    for (const text of event.openThreads ?? []) {
      const key = text.trim().toLowerCase()
      if (!key) continue
      const existing = byText.get(key)
      if (existing) {
        existing.lastTouchedChapterId = event.chapterId
        continue
      }
      const thread: StoryThread = {
        id: uid('thread'),
        text: text.trim(),
        status: 'open',
        priority: 'side',
        createdChapterId: event.chapterId,
        lastTouchedChapterId: event.chapterId,
        createdAt: event.createdAt,
      }
      byText.set(key, thread)
      threads.push(thread)
    }
  }
  return threads
}

export function resolveStoryThreads(detail: WorkDetail): StoryThread[] {
  return detail.storyThreads?.length
    ? detail.storyThreads
    : deriveStoryThreads(detail.storyStateEvents)
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function cleanJsonValue(raw: unknown, depth = 0): StoryStateJsonValue | undefined {
  if (depth > 6) return undefined
  if (raw === null) return null
  if (typeof raw === 'string') return raw.slice(0, 4000)
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined
  if (typeof raw === 'boolean') return raw
  if (Array.isArray(raw)) {
    const values = raw
      .slice(0, 80)
      .map((item) => cleanJsonValue(item, depth + 1))
      .filter((item): item is StoryStateJsonValue => item !== undefined)
    return values
  }
  if (typeof raw === 'object') {
    const output: { [key: string]: StoryStateJsonValue } = {}
    let count = 0
    for (const [key, item] of Object.entries(raw as Record<string, unknown>)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      const cleaned = cleanJsonValue(item, depth + 1)
      if (cleaned !== undefined) {
        output[key.slice(0, 100)] = cleaned
        count += 1
      }
      if (count >= 100) break
    }
    return output
  }
  return undefined
}

function cleanChange(raw: unknown): StoryStateChange | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const entityType = value.entityType
  if (
    entityType !== 'character' &&
    entityType !== 'faction' &&
    entityType !== 'location' &&
    entityType !== 'item' &&
    entityType !== 'species' &&
    entityType !== 'foreshadowing' &&
    entityType !== 'relationship' &&
    entityType !== 'system' &&
    entityType !== 'module'
  ) {
    return null
  }
  const entityId = typeof value.entityId === 'string' ? value.entityId.trim() : ''
  const field = typeof value.field === 'string' ? value.field.trim() : ''
  if (!entityId || !field) return null
  const action = value.action === 'add' || value.action === 'remove' ? value.action : 'set'
  const rawValue = value.value
  if (rawValue && typeof rawValue === 'object') {
    const structuredValue = cleanJsonValue(rawValue)
    if (structuredValue === undefined) return null
    return {
      entityType,
      entityId,
      field,
      action,
      value: JSON.stringify(structuredValue).slice(0, 4000),
      structuredValue,
      note: typeof value.note === 'string' ? value.note.trim().slice(0, 160) : undefined,
    }
  }
  if (
    typeof rawValue !== 'string' &&
    typeof rawValue !== 'number' &&
    typeof rawValue !== 'boolean'
  ) {
    return null
  }
  return {
    entityType,
    entityId,
    field,
    action,
    value: String(rawValue).trim(),
    note: typeof value.note === 'string' ? value.note.trim().slice(0, 160) : undefined,
  }
}

function cleanEvent(raw: unknown, index: number): StoryEventEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const title = typeof value.title === 'string' ? value.title.trim().slice(0, 80) : ''
  const summary = typeof value.summary === 'string' ? value.summary.trim().slice(0, 500) : ''
  if (!title && !summary) return null
  const participants = Array.isArray(value.participants)
    ? value.participants
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12)
    : []
  const consequences = Array.isArray(value.consequences)
    ? value.consequences
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
    : []
  const importance: StoryEventImportance =
    value.importance === 'high' || value.importance === 'low' ? value.importance : 'medium'
  const status: StoryEventStatus =
    value.status === 'rumor' || value.status === 'retconned' ? value.status : 'canon'
  return {
    id: `se-${index}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    title: title || summary.slice(0, 30),
    summary,
    participants,
    location: typeof value.location === 'string' ? value.location.trim().slice(0, 80) : '',
    cause: typeof value.cause === 'string' ? value.cause.trim().slice(0, 300) : '',
    result: typeof value.result === 'string' ? value.result.trim().slice(0, 300) : '',
    consequences,
    importance,
    status,
  }
}

function cleanCharacterIssue(raw: unknown): CharacterConsistencyIssue | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const characterName =
    typeof value.characterName === 'string' ? value.characterName.trim().slice(0, 80) : ''
  const reason = typeof value.reason === 'string' ? value.reason.trim().slice(0, 300) : ''
  const quote = typeof value.quote === 'string' ? value.quote.trim().slice(0, 300) : ''
  if (!characterName || !reason) return null
  const type =
    value.type === 'voice' ||
    value.type === 'behavior' ||
    value.type === 'knowledge'
      ? value.type
      : 'other'
  const severity =
    value.severity === 'high' || value.severity === 'low' ? value.severity : 'medium'
  return { characterName, type, quote, reason, severity }
}

function cleanFactionIssue(raw: unknown): FactionConsistencyIssue | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const factionName =
    typeof value.factionName === 'string' ? value.factionName.trim().slice(0, 80) : ''
  const reason = typeof value.reason === 'string' ? value.reason.trim().slice(0, 300) : ''
  const quote = typeof value.quote === 'string' ? value.quote.trim().slice(0, 300) : ''
  if (!factionName || !reason) return null
  const type =
    value.type === 'resources' ||
    value.type === 'knowledge' ||
    value.type === 'hierarchy' ||
    value.type === 'doctrine' ||
    value.type === 'behavior'
      ? value.type
      : 'other'
  const severity =
    value.severity === 'high' || value.severity === 'low' ? value.severity : 'medium'
  return { factionName, type, quote, reason, severity }
}

function cleanNewEntity(raw: unknown): StoryStateNewEntity | null {  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const entityType = value.entityType
  if (
    entityType !== 'character' &&
    entityType !== 'faction' &&
    entityType !== 'location' &&
    entityType !== 'item' &&
    entityType !== 'species' &&
    entityType !== 'foreshadowing' &&
    entityType !== 'relationship'
  ) {
    return null
  }
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const read = (key: string, max = 500) =>
    typeof value[key] === 'string' ? (value[key] as string).trim().slice(0, max) : ''
  const name =
    entityType === 'foreshadowing'
      ? read('title', 80) || read('name', 80)
      : read('name', 80) || read('title', 80)
  if (!name && entityType !== 'relationship') return null
  const gradeValue = Number(value.grade)
  return {
    entityType,
    id: id || `new-${entityType}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || read('relationType', 40) || '关系',
    role: read('role', 60) || undefined,
    identity: read('identity', 80) || undefined,
    personality: read('personality', 160) || undefined,
    sectId: read('sectId', 100) || undefined,
    factionId: read('factionId', 100) || undefined,
    type: read('type', 60) || undefined,
    description: read('description', 500) || undefined,
    leader: read('leader', 60) || undefined,
    location: read('location', 80) || undefined,
    title: read('title', 80) || undefined,
    plantedIn: read('plantedIn', 100) || undefined,
    note: read('note', 300) || undefined,
    fromId: read('fromId', 100) || undefined,
    toId: read('toId', 100) || undefined,
    relationType: read('relationType', 40) || undefined,
    categoryId: read('categoryId', 100) || undefined,
    grade:
      Number.isFinite(gradeValue) && gradeValue > 0
        ? Math.min(20, Math.round(gradeValue))
        : undefined,
    profile: value.profile === undefined ? undefined : cleanJsonValue(value.profile),
    data: value.data === undefined ? undefined : cleanJsonValue(value.data),
  }
}

function cleanCharacterExperience(raw: unknown, index: number): ParsedCharacterExperience | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const characterId =
    typeof value.characterId === 'string' ? value.characterId.trim().slice(0, 120) : ''
  const characterName =
    typeof value.characterName === 'string' ? value.characterName.trim().slice(0, 80) : ''
  if (!characterId && !characterName) return null
  const experience = normalizeCharacterExperience(
    {
      ...value,
      id: value.id,
      source: 'sync',
      chapterId: value.chapterId,
    },
    index,
  )
  if (!experience) return null
  return {
    characterId: characterId || undefined,
    characterName: characterName || undefined,
    experience,
  }
}

export function parseStoryStateUpdate(text: string): ParsedStateUpdate | null {
  const trimmed = text.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const raw = JSON.parse(withoutFence.slice(start, end + 1)) as Record<string, unknown>
    const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 500) : ''
    const changes = Array.isArray(raw.changes)
      ? raw.changes
          .map(cleanChange)
          .filter((change): change is StoryStateChange => Boolean(change))
          .slice(0, 40)
      : []
    const events = Array.isArray(raw.events)
      ? raw.events
          .map(cleanEvent)
          .filter((event): event is StoryEventEntry => Boolean(event))
          .slice(0, 8)
      : []
    const openThreads = Array.isArray(raw.openThreads)
      ? raw.openThreads
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().slice(0, 160))
          .filter(Boolean)
          .slice(0, 12)
      : []
    const resolvedThreads = Array.isArray(raw.resolvedThreads)
      ? raw.resolvedThreads
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().slice(0, 160))
          .filter(Boolean)
          .slice(0, 12)
      : []
    const newEntities = Array.isArray(raw.newEntities)
      ? raw.newEntities
          .map(cleanNewEntity)
          .filter((entity): entity is StoryStateNewEntity => Boolean(entity))
          .slice(0, 30)
      : []
    const characterExperiences = Array.isArray(raw.characterExperiences)
      ? raw.characterExperiences
          .map(cleanCharacterExperience)
          .filter((entry): entry is ParsedCharacterExperience => Boolean(entry))
          .slice(0, 40)
      : []
    const characterIssues = Array.isArray(raw.characterIssues)
      ? raw.characterIssues
          .map(cleanCharacterIssue)
          .filter((issue): issue is CharacterConsistencyIssue => Boolean(issue))
          .slice(0, 8)
      : []
    const factionIssues = Array.isArray(raw.factionIssues)
      ? raw.factionIssues
          .map(cleanFactionIssue)
          .filter((issue): issue is FactionConsistencyIssue => Boolean(issue))
          .slice(0, 8)
      : []
    if (
      !summary &&
      changes.length === 0 &&
      events.length === 0 &&
      openThreads.length === 0 &&
      resolvedThreads.length === 0 &&
      newEntities.length === 0 &&
      characterExperiences.length === 0 &&
      characterIssues.length === 0 &&
      factionIssues.length === 0
    ) {
      return null
    }
    return {
      summary,
      changes,
      events,
      openThreads,
      resolvedThreads,
      newEntities,
      characterExperiences,
      characterIssues,
      factionIssues,
    }
  } catch {
    return null
  }
}

const CHARACTER_SET_FIELDS = new Set([
  'status',
  'cultivation',
  'position',
  'sectId',
  'identity',
  'currency',
  'role',
  'personality',
  'goal',
  'appearance',
  'background',
  'gender',
  'age',
  'spiritRoot',
  'physique',
  'talent',
  'realmSchemeId',
  'speciesId',
  'lifecycle',
])
const CHARACTER_LIST_FIELDS = new Set(['techniques', 'weapons', 'treasures'])
const CHARACTER_DYNAMIC_FIELDS = new Set(['mood', 'currentGoal', 'injuries', 'location', 'possessions'])
const FACTION_DYNAMIC_FIELDS = new Set([
  'stage',
  'leaderState',
  'morale',
  'treasury',
  'forces',
  'territory',
  'diplomacy',
  'internalStruggle',
  'currentOperation',
  'publicImage',
])
const FACTION_SET_FIELDS = new Set([
  'leader',
  'type',
  'description',
  'goal',
  'location',
  'founded',
  'motto',
  'parentId',
  'leaderId',
  'lifecycle',
])
const LOCATION_SET_FIELDS = new Set(['name', 'description', 'notes', 'type', 'parentId'])
const FORESHADOW_SET_FIELDS = new Set([
  'status',
  'title',
  'note',
  'plantedIn',
  'type',
  'importance',
  'payoffChapterId',
])
const RELATIONSHIP_SET_FIELDS = new Set(['type', 'note'])
const SYSTEM_SET_FIELDS = new Set(['balance'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function mergeStructured(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeStructured(result[key], value)
    } else {
      result[key] = value
    }
  }
  return result
}

function changeStructuredValue(change: StoryStateChange): unknown {
  return change.structuredValue === undefined ? change.value : change.structuredValue
}

function numericValue(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
}

function changeList(values: string[] | undefined, action: 'set' | 'add' | 'remove', value: string): string[] {
  const current = [...(values ?? [])]
  if (action === 'set') {
    return value
      .split(/[、,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (action === 'add') {
    return value ? [...current, value] : current
  }
  return current.filter((item) => item !== value)
}

/**
 * 深度同步的幂等合并：快速同步已经写过事件和状态时，深度同步只补经历和审查，
 * 不再追加第二个事件，也不会用旧章节的状态覆盖后面的状态。
 */
export function mergeDeepStateUpdate(
  detail: WorkDetail,
  update: ParsedStateUpdate,
  chapterId: string,
): {
  detail: WorkDetail
  event: StoryStateEvent
  experiences: CharacterExperience[]
} {
  const existing = (detail.storyStateEvents ?? []).find((event) => event.chapterId === chapterId)
  if (!existing) return applyStoryStateUpdate(detail, update, chapterId, chapterId)

  const characters = detail.characters.map((character) => ({
    ...character,
    experiences: [...(character.experiences ?? [])],
  }))
  const experiences: CharacterExperience[] = []
  for (const entry of update.characterExperiences) {
    const character = characters.find(
      (item) => item.id === entry.characterId || item.name === entry.characterName,
    )
    if (!character) continue
    const experience = {
      ...entry.experience,
      chapterId: entry.experience.chapterId || chapterId,
    }
    const keys = new Set((character.experiences ?? []).map(experienceDedupeKey))
    if (keys.has(experienceDedupeKey(experience))) continue
    character.experiences = [...(character.experiences ?? []), experience].slice(-500)
    experiences.push(experience)
  }

  const mergeByKey = <T>(left: T[], right: T[], key: (value: T) => string): T[] => {
    const seen = new Set(left.map(key))
    return [...left, ...right.filter((value) => !seen.has(key(value)))]
  }
  const issues = mergeByKey(
    existing.characterIssues ?? [],
    update.characterIssues,
    (issue) => `${issue.characterName}|${issue.type}|${issue.quote}`,
  )
  const factionIssues = mergeByKey(
    existing.factionIssues ?? [],
    update.factionIssues,
    (issue) => `${issue.factionName}|${issue.type}|${issue.quote}`,
  )
  const mergedEvent: StoryStateEvent = {
    ...existing,
    summary: existing.summary || update.summary,
    events: mergeByKey(existing.events ?? [], update.events, (event) => `${event.title}|${event.summary}`),
    openThreads: [...new Set([...(existing.openThreads ?? []), ...update.openThreads])],
    characterIssues: issues,
    factionIssues,
  }
  return {
    detail: {
      ...detail,
      characters,
      currentSummary: detail.currentSummary || update.summary,
      storyStateEvents: (detail.storyStateEvents ?? []).map((event) =>
        event.id === existing.id ? mergedEvent : event,
      ),
    },
    event: mergedEvent,
    experiences,
  }
}

export function applyStoryStateUpdate(
  detail: WorkDetail,
  update: ParsedStateUpdate,
  chapterId: string,
  chapterTitle: string,
): {
  detail: WorkDetail
  event: StoryStateEvent
  snapshot: StoryStateSnapshot
  experiences: CharacterExperience[]
} {  const eventId = uid('state-event')
  const snapshot: StoryStateSnapshot = {
    id: uid('state-snapshot'),
    eventId,
    chapterId,
    chapterTitle,
    createdAt: new Date().toISOString(),
    previousSummary: detail.currentSummary ?? '',
    data: JSON.parse(
      JSON.stringify({
        characters: detail.characters,
        factions: detail.factions,
        locations: detail.locations ?? [],
        items: detail.items ?? [],
        species: detail.species ?? [],
        foreshadowings: detail.foreshadowings,
        relationships: detail.relationships,
        system: detail.system,
        moduleData: detail.moduleData,
        storyThreads: JSON.parse(JSON.stringify(resolveStoryThreads(detail))),
        characterStateTimeline: JSON.parse(
          JSON.stringify(detail.characterStateTimeline ?? []),
        ),
        factionStateTimeline: JSON.parse(
          JSON.stringify(detail.factionStateTimeline ?? []),
        ),
      }),
    ) as StoryStateSnapshot['data'],
  }

  const characters = detail.characters.map((character) => ({ ...character }))
  const factions = detail.factions.map((faction) => ({ ...faction }))
  const locations = (detail.locations ?? []).map((location) => ({ ...location }))
  const items = (detail.items ?? []).map((item) => ({ ...item }))
  const species = (detail.species ?? []).map((item) => ({ ...item }))
  const foreshadowings = detail.foreshadowings.map((item) => ({ ...item }))
  const relationships = (detail.relationships ?? []).map((item) => ({ ...item }))
  const system = detail.system ? JSON.parse(JSON.stringify(detail.system)) : undefined
  const moduleData = detail.moduleData
    ? (JSON.parse(JSON.stringify(detail.moduleData)) as WorkDetail['moduleData'])
    : undefined
  const applied: StoryStateChange[] = []
  const appliedExperiences: CharacterExperience[] = []
  const dynamicChanges = new Map<
    string,
    { character: CharacterCard; changes: CharacterDynamicChange[] }
  >()
  const factionDynamicChanges = new Map<
    string,
    { faction: FactionCard; changes: FactionDynamicChange[] }
  >()

  const entityIdMap = new Map<string, string>()
  const resolveItemRef = (ref: string): string => {
    const mapped = entityIdMap.get(ref)
    if (mapped) return mapped
    const byName = (detail.items ?? []).find((item) => nameKey(item.name) === nameKey(ref))
    return byName?.id ?? ref
  }
  const nameKey = (value: string) => value.trim().toLowerCase()
  const characterByName = new Map(
    characters.map((character) => [nameKey(character.name), character.id]),
  )
  const factionByName = new Map(factions.map((faction) => [nameKey(faction.name), faction.id]))
  const locationByName = new Map(locations.map((location) => [nameKey(location.name), location.id]))
  const foreshadowByName = new Map(
    foreshadowings.map((item) => [nameKey(item.title), item.id]),
  )
  const pendingRelationships: StoryStateNewEntity[] = []
  const pendingSectRefs: { character: CharacterCard; ref: string }[] = []
  const pendingFactionRefs: { location: LocationCard; ref: string }[] = []

  for (const entity of update.newEntities) {
    if (entity.entityType === 'relationship') {
      pendingRelationships.push(entity)
      continue
    }
    if (entity.entityType === 'character') {
      const existing = characterByName.get(nameKey(entity.name))
      if (existing) {
        entityIdMap.set(entity.id, existing)
        continue
      }
      const character: CharacterCard = {
        id: uid(`c-${Date.now().toString(36)}`),
        name: entity.name,
        role: entity.role ?? '',
        identity: entity.identity ?? '',
        personality: entity.personality ?? '',
        goal: '',
        archiveStatus: entity.profile ? 'partial' : 'placeholder',
        status: '正常',
        weapons: [],
        treasures: [],
        techniques: [],
        currency: '',
      }
      if (entity.profile && isPlainObject(entity.profile)) {
        character.profile = normalizeCharacterProfile(
          mergeStructured(normalizeCharacterProfile(character.profile), entity.profile),
        )
      }
      characters.push(character)
      characterByName.set(nameKey(character.name), character.id)
      entityIdMap.set(entity.id, character.id)
      if (entity.sectId) pendingSectRefs.push({ character, ref: entity.sectId })
      continue
    }
    if (entity.entityType === 'faction') {
      const existing = factionByName.get(nameKey(entity.name))
      if (existing) {
        entityIdMap.set(entity.id, existing)
        continue
      }
      const faction: FactionCard = {
        id: uid(`f-${Date.now().toString(36)}`),
        name: entity.name,
        type: entity.type ?? '宗门',
        leader: entity.leader ?? '',
        goal: '',
        description: entity.description ?? '',
        archiveStatus: entity.profile ? 'partial' : 'placeholder',
        location: entity.location ?? '',
      }
      if (entity.profile && isPlainObject(entity.profile)) {
        faction.profile = normalizeFactionProfile(
          mergeStructured(normalizeFactionProfile(faction.profile), entity.profile),
        )
      }
      if (isPlainObject(entity.data)) {
        if (Array.isArray(entity.data.facilities)) {
          faction.facilities = normalizeFacilities(entity.data.facilities)
        }
        if (Array.isArray(entity.data.warehouse)) {
          faction.warehouse = normalizeInventory(entity.data.warehouse)
        }
        if (typeof entity.data.tierLevel === 'number') {
          faction.tierLevel = Math.max(0, Math.round(entity.data.tierLevel))
        }
      }
      factions.push(faction)
      factionByName.set(nameKey(faction.name), faction.id)
      entityIdMap.set(entity.id, faction.id)
      continue
    }
    if (entity.entityType === 'item') {
      const existing = items.find((item) => nameKey(item.name) === nameKey(entity.name))
      if (existing) {
        entityIdMap.set(entity.id, existing.id)
        continue
      }
      const category = detail.itemCategories?.find(
        (entry) =>
          entry.id === entity.categoryId ||
          entry.name === entity.categoryId ||
          entry.name === entity.type,
      )
      const categoryId = category?.id ?? entity.categoryId ?? detail.itemCategories?.[0]?.id ?? ''
      const item = {
        id: uid(`i-${Date.now().toString(36)}`),
        name: entity.name,
        categoryId,
        grade: Math.max(1, Math.min(20, Math.round(entity.grade ?? 1))),
        description: entity.description ?? '',
        notes: entity.note ?? '',
      }
      items.push(item)
      entityIdMap.set(entity.id, item.id)
      continue
    }
    if (entity.entityType === 'species') {
      const existing = species.find((item) => nameKey(item.name) === nameKey(entity.name))
      if (existing) {
        entityIdMap.set(entity.id, existing.id)
        continue
      }
      const source =
        entity.profile && isPlainObject(entity.profile)
          ? entity.profile
          : entity.data && isPlainObject(entity.data)
            ? entity.data
            : {}
      const created = normalizeSpecies(mergeStructured(emptySpecies(), source))
      created.id = uid(`sp-${Date.now().toString(36)}`)
      created.name = entity.name
      const category = detail.speciesCategories?.find(
        (entry) =>
          entry.id === entity.categoryId ||
          entry.name === entity.categoryId ||
          entry.name === entity.type,
      )
      created.category = category?.name ?? entity.type ?? created.category
      if (category?.id ?? entity.categoryId) {
        created.categoryId = category?.id ?? entity.categoryId
      }
      species.push(created)
      entityIdMap.set(entity.id, created.id)
      continue
    }
    if (entity.entityType === 'location') {
      const existing = locationByName.get(nameKey(entity.name))
      if (existing) {
        entityIdMap.set(entity.id, existing)
        continue
      }
      const location: LocationCard = {
        id: uid(`l-${Date.now().toString(36)}`),
        name: entity.name,
        type: entity.type ?? '地点',
        description: entity.description ?? '',
        notes: entity.note ?? '',
      }
      locations.push(location)
      locationByName.set(nameKey(location.name), location.id)
      entityIdMap.set(entity.id, location.id)
      if (entity.factionId) pendingFactionRefs.push({ location, ref: entity.factionId })
      continue
    }
    if (entity.entityType === 'foreshadowing') {
      const existing = foreshadowByName.get(nameKey(entity.name))
      if (existing) {
        entityIdMap.set(entity.id, existing)
        continue
      }
      const item: ForeshadowingCard = {
        id: uid(`fs-${Date.now().toString(36)}`),
        title: entity.name,
        status: '未回收',
        plantedIn: entity.plantedIn ?? chapterTitle,
        note: entity.note ?? '',
      }
      foreshadowings.push(item)
      foreshadowByName.set(nameKey(item.title), item.id)
      entityIdMap.set(entity.id, item.id)
    }
  }

  for (const character of characters) {
    if (character.inventory?.length) {
      character.inventory = character.inventory.map((entry) => ({
        ...entry,
        itemId: resolveItemRef(entry.itemId),
      }))
    }
  }
  for (const faction of factions) {
    if (faction.facilities?.length) {
      faction.facilities = faction.facilities.map((facility) => ({
        ...facility,
        resources: (facility.resources ?? []).map((entry) => ({
          ...entry,
          itemId: resolveItemRef(entry.itemId),
        })),
      }))
    }
    if (faction.warehouse?.length) {
      faction.warehouse = faction.warehouse.map((entry) => ({
        ...entry,
        itemId: resolveItemRef(entry.itemId),
      }))
    }
  }

  for (const { character, ref } of pendingSectRefs) {
    character.sectId = entityIdMap.get(ref) ?? ref
  }
  for (const { location, ref } of pendingFactionRefs) {
    location.factionId = entityIdMap.get(ref) ?? ref
  }

  const resolvePerson = (ref?: string) => {
    if (!ref) return undefined
    const mapped = entityIdMap.get(ref)
    if (mapped) return mapped
    if (characters.some((character) => character.id === ref)) return ref
    return characters.find((character) => nameKey(character.name) === nameKey(ref))?.id
  }

  for (const relation of pendingRelationships) {
    const fromId = resolvePerson(relation.fromId)
    const toId = resolvePerson(relation.toId)
    if (!fromId || !toId) continue
    const existing = relationships.find(
      (item) =>
        item.fromId === fromId &&
        item.toId === toId &&
        item.type === (relation.relationType ?? '关系'),
    )
    if (existing) {
      entityIdMap.set(relation.id, existing.id)
      continue
    }
    const item: RelationshipCard = {
      id: uid(`r-${Date.now().toString(36)}`),
      fromId,
      toId,
      type: relation.relationType ?? '关系',
      note: relation.note ?? '',
    }
    relationships.push(item)
    entityIdMap.set(relation.id, item.id)
  }

  const resolvedChanges = update.changes.map((change) => ({
    ...change,
    entityId: entityIdMap.get(change.entityId) ?? change.entityId,
  }))

  for (const change of resolvedChanges) {
    if (change.entityType === 'character') {
      const character = characters.find((item) => item.id === change.entityId)
      if (!character) continue
      const structured = changeStructuredValue(change)
      if (change.field === 'profile' && isPlainObject(structured)) {
        character.profile = normalizeCharacterProfile(
          mergeStructured(normalizeCharacterProfile(character.profile), structured),
        )
        applied.push(change)
        continue
      }
      if (change.field === 'inventory') {
        character.inventory = normalizeInventory(structured).map((entry) => ({
          ...entry,
          itemId: resolveItemRef(entry.itemId),
        }))
        applied.push(change)
        continue
      }
      if (change.field === 'attributes' && isPlainObject(structured)) {
        character.attributes = {
          ...(character.attributes ?? {}),
          ...Object.fromEntries(
            Object.entries(structured)
              .filter(([, item]) => typeof item === 'string' || typeof item === 'number')
              .map(([key, item]) => [key, String(item)]),
          ),
        }
        applied.push(change)
        continue
      }
      if (change.field === 'realmLevel' || change.field === 'realmSublevel') {
        const number = numericValue(structured)
        if (number === undefined) continue
        character[change.field] = Math.max(0, Math.round(number))
        applied.push(change)
        continue
      }
      if (CHARACTER_SET_FIELDS.has(change.field)) {
        ;(character as unknown as Record<string, string>)[change.field] =
          change.action === 'remove' ? '' : stringValue(structured)
        applied.push(change)
      } else if (CHARACTER_LIST_FIELDS.has(change.field)) {
        if (change.field === 'techniques') {
          character.techniques = changeList(character.techniques, change.action, change.value)
        } else if (change.field === 'weapons') {
          character.weapons = changeList(character.weapons, change.action, change.value)
        } else if (change.field === 'treasures') {
          character.treasures = changeList(character.treasures, change.action, change.value)
        }
        applied.push(change)
      } else if (CHARACTER_DYNAMIC_FIELDS.has(change.field)) {
        const profile = normalizeCharacterProfile(character.profile)
        const field = change.field as CharacterDynamicField
        const previous = profile.dynamic[field]
        const nextValue = stringValue(structured)
        if (previous === nextValue) continue
        character.profile = {
          ...profile,
          dynamic: {
            ...profile.dynamic,
            [field]: nextValue,
            updatedAt: new Date().toISOString(),
          },
        }
        const record = dynamicChanges.get(character.id) ?? {
          character,
          changes: [],
        }
        record.changes.push({ field, from: previous, to: nextValue })
        dynamicChanges.set(character.id, record)
        applied.push(change)
      }
      continue
    }

    if (change.entityType === 'faction') {
      const faction = factions.find((item) => item.id === change.entityId)
      if (!faction) continue
      const structured = changeStructuredValue(change)
      if (change.field === 'profile' && isPlainObject(structured)) {
        faction.profile = normalizeFactionProfile(
          mergeStructured(normalizeFactionProfile(faction.profile), structured),
        )
        applied.push(change)
        continue
      }
      if (change.field === 'facilities') {
        faction.facilities = normalizeFacilities(structured).map((facility) => ({
          ...facility,
          resources: (facility.resources ?? []).map((entry) => ({
            ...entry,
            itemId: resolveItemRef(entry.itemId),
          })),
        }))
        applied.push(change)
        continue
      }
      if (change.field === 'warehouse') {
        faction.warehouse = normalizeInventory(structured).map((entry) => ({
          ...entry,
          itemId: resolveItemRef(entry.itemId),
        }))
        applied.push(change)
        continue
      }
      if (change.field === 'tierLevel') {
        const number = numericValue(structured)
        if (number === undefined) continue
        faction.tierLevel = Math.max(0, Math.round(number))
        applied.push(change)
        continue
      }
      if (
        change.field === 'outerDisciples' ||
        change.field === 'innerDisciples' ||
        change.field === 'menialDisciples'
      ) {
        const number = numericValue(structured)
        if (number === undefined) continue
        faction[change.field] = Math.max(0, Math.round(number))
        applied.push(change)
        continue
      }
      if (
        change.field === 'peaks' ||
        change.field === 'elders' ||
        change.field === 'mainDisciples'
      ) {
        if (!Array.isArray(structured)) continue
        ;(faction as unknown as Record<string, unknown>)[change.field] = structured
        applied.push(change)
        continue
      }
      if (
        change.field === 'speciesIds' ||
        change.field === 'assets' ||
        change.field === 'techniques'
      ) {
        if (!Array.isArray(structured)) continue
        ;(faction as unknown as Record<string, unknown>)[change.field] = structured
          .map((item) => stringValue(item))
          .filter(Boolean)
        applied.push(change)
        continue
      }
      if (change.field === 'attributes' && isPlainObject(structured)) {
        faction.attributes = {
          ...(faction.attributes ?? {}),
          ...Object.fromEntries(
            Object.entries(structured)
              .filter(([, item]) => typeof item === 'string' || typeof item === 'number')
              .map(([key, item]) => [key, String(item)]),
          ),
        }
        applied.push(change)
        continue
      }
      if (FACTION_SET_FIELDS.has(change.field)) {
        ;(faction as unknown as Record<string, string>)[change.field] =
          change.action === 'remove' ? '' : stringValue(structured)
        applied.push(change)
      } else if (FACTION_DYNAMIC_FIELDS.has(change.field)) {
        const profile = normalizeFactionProfile(faction.profile)
        const field = change.field as FactionDynamicField
        const previous = profile.dynamic[field]
        const nextValue = stringValue(structured)
        if (previous === nextValue) continue
        faction.profile = {
          ...profile,
          dynamic: {
            ...profile.dynamic,
            [field]: nextValue,
            updatedAt: new Date().toISOString(),
          },
        }
        const record = factionDynamicChanges.get(faction.id) ?? {
          faction,
          changes: [],
        }
        record.changes.push({ field, from: previous, to: nextValue })
        factionDynamicChanges.set(faction.id, record)
        applied.push(change)
      }
      continue
    }

    if (change.entityType === 'item') {
      const item = items.find((current) => current.id === change.entityId)
      if (!item) continue
      const structured = changeStructuredValue(change)
      if (change.field === 'grade') {
        const number = numericValue(structured)
        if (number === undefined) continue
        item.grade = Math.max(1, Math.min(20, Math.round(number)))
        applied.push(change)
        continue
      }
      if (
        change.field === 'name' ||
        change.field === 'description' ||
        change.field === 'notes' ||
        change.field === 'categoryId' ||
        change.field === 'lifecycle'
      ) {
        ;(item as unknown as Record<string, string>)[change.field] = stringValue(structured)
        applied.push(change)
      }
      continue
    }

    if (change.entityType === 'species') {
      const item = species.find((current) => current.id === change.entityId)
      if (!item) continue
      const structured = changeStructuredValue(change)
      if (change.field === 'profile' && isPlainObject(structured)) {
        Object.assign(
          item,
          normalizeSpecies(mergeStructured(normalizeSpecies(item), structured)),
        )
        applied.push(change)
        continue
      }
      if (change.field === 'tierLevel') {
        const number = numericValue(structured)
        if (number === undefined) continue
        item.tierLevel = Math.max(0, Math.round(number))
        applied.push(change)
        continue
      }
      if (change.field === 'abilities' || change.field === 'weaknesses' || change.field === 'variants' || change.field === 'tags') {
        if (!Array.isArray(structured)) continue
        ;(item as unknown as Record<string, unknown>)[change.field] = structured
          .map((entry) => stringValue(entry))
          .filter(Boolean)
        applied.push(change)
        continue
      }
      if (
        change.field === 'name' ||
        change.field === 'category' ||
        change.field === 'categoryId' ||
        change.field === 'origin' ||
        change.field === 'habitat' ||
        change.field === 'appearance' ||
        change.field === 'physiology' ||
        change.field === 'lifespan' ||
        change.field === 'society' ||
        change.field === 'language' ||
        change.field === 'culture' ||
        change.field === 'relations' ||
        change.field === 'notes' ||
        change.field === 'lifecycle'
      ) {
        ;(item as unknown as Record<string, string>)[change.field] = stringValue(structured)
        applied.push(change)
      }
      continue
    }

    if (change.entityType === 'location') {
      const location = locations.find((item) => item.id === change.entityId)
      if (!location || !LOCATION_SET_FIELDS.has(change.field)) continue
      ;(location as unknown as Record<string, string>)[change.field] = change.value
      applied.push(change)
      continue
    }

    if (change.entityType === 'foreshadowing') {
      const item = foreshadowings.find((foreshadowing) => foreshadowing.id === change.entityId)
      if (!item || !FORESHADOW_SET_FIELDS.has(change.field)) continue
      if (change.field === 'status') {
        if (change.value !== '未回收' && change.value !== '已回收') continue
        item.status = change.value
      } else {
        ;(item as unknown as Record<string, string>)[change.field] = stringValue(
          changeStructuredValue(change),
        )
      }
      applied.push(change)
      continue
    }

    if (change.entityType === 'relationship') {
      const item = relationships.find((relationship) => relationship.id === change.entityId)
      if (!item || !RELATIONSHIP_SET_FIELDS.has(change.field)) continue
      ;(item as unknown as Record<string, string>)[change.field] = change.value
      applied.push(change)
      continue
    }

    if (change.entityType === 'system') {
      if (!system || change.entityId !== 'system' || !SYSTEM_SET_FIELDS.has(change.field)) continue
      const amount = Number(change.value)
      if (!Number.isFinite(amount)) continue
      if (change.action === 'add') system.balance += amount
      else if (change.action === 'remove') system.balance -= amount
      else system.balance = amount
      applied.push(change)
      continue
    }

    if (change.entityType === 'module') {
      if (!moduleData) continue
      const record = Object.values(moduleData)
        .flat()
        .find((item) => item.id === change.entityId)
      if (!record) continue
      if (change.field === 'status') {
        record.status = change.value
      } else if (change.field.startsWith('fields.')) {
        record.fields[change.field.slice(7)] = change.value
      } else {
        continue
      }
      applied.push(change)
    }
  }

  for (const parsedExperience of update.characterExperiences) {
    const resolvedId =
      (parsedExperience.characterId && entityIdMap.get(parsedExperience.characterId)) ||
      parsedExperience.characterId
    const character =
      characters.find((item) => item.id === resolvedId) ??
      characters.find(
        (item) =>
          parsedExperience.characterName &&
          nameKey(item.name) === nameKey(parsedExperience.characterName),
      )
    if (!character) continue
    const experience: CharacterExperience = {
      ...parsedExperience.experience,
      chapterId: parsedExperience.experience.chapterId || chapterId,
      source: 'sync',
      updatedAt: new Date().toISOString(),
    }
    const existing = normalizeCharacterExperiences(character.experiences)
    const keys = new Set(existing.map(experienceDedupeKey))
    if (keys.has(experienceDedupeKey(experience))) continue
    character.experiences = [...existing, experience].slice(-500)
    appliedExperiences.push(experience)
    const learned = experience.learned
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12)
    if (learned.length > 0) {
      const profile = normalizeCharacterProfile(character.profile)
      const listKey =
        experience.knowledgeScope === '听别人说' ||
        experience.knowledgeScope === '传闻' ||
        experience.knowledgeScope === '自己推断'
          ? 'believes'
          : 'knows'
      character.profile = {
        ...profile,
        knowledge: {
          ...profile.knowledge,
          [listKey]: [...new Set([...profile.knowledge[listKey], ...learned])].slice(-80),
        },
      }
    }
  }

  const event: StoryStateEvent = {
    id: eventId,
    chapterId,
    chapterTitle,
    createdAt: new Date().toISOString(),
    summary: update.summary,
    changes: applied,
    events: update.events,
    openThreads:
      update.openThreads.length > 0
        ? update.openThreads
        : update.events.flatMap((item) => item.consequences).slice(0, 12),
    newEntities: update.newEntities,
    characterIssues: filterDismissedIssues(detail, update.characterIssues),
    factionIssues: filterDismissedFactionIssues(detail, update.factionIssues),
  }
  const characterStateTimeline: CharacterStateTimelineEntry[] = [
    ...(detail.characterStateTimeline ?? []),
    ...[...dynamicChanges.values()].map(({ character, changes }) => ({
      id: uid('char-state'),
      characterId: character.id,
      characterName: character.name,
      chapterId,
      chapterTitle,
      createdAt: event.createdAt,
      changes,
      state: normalizeCharacterProfile(character.profile).dynamic,
    })),
  ].slice(-500)
  const factionStateTimeline: FactionStateTimelineEntry[] = [
    ...(detail.factionStateTimeline ?? []),
    ...[...factionDynamicChanges.values()].map(({ faction, changes }) => ({
      id: uid('faction-state'),
      factionId: faction.id,
      factionName: faction.name,
      chapterId,
      chapterTitle,
      createdAt: event.createdAt,
      changes,
      state: normalizeFactionProfile(faction.profile).dynamic,
    })),
  ].slice(-500)
  const storyStateEvents = [...(detail.storyStateEvents ?? []), event].slice(-200)
  const storyStateSnapshots = [...(detail.storyStateSnapshots ?? []), snapshot].slice(-200)
  const storyThreads = resolveStoryThreads(detail).map((thread) => ({ ...thread }))
  const threadByText = new Map(
    storyThreads.map((thread) => [thread.text.trim().toLowerCase(), thread]),
  )
  const touchedAt = event.createdAt
  for (const text of event.openThreads ?? []) {
    const key = text.trim().toLowerCase()
    if (!key) continue
    const existing = threadByText.get(key)
    if (existing) {
      existing.status = 'open'
      existing.lastTouchedChapterId = chapterId
      continue
    }
    const thread: StoryThread = {
      id: uid('thread'),
      text: text.trim(),
      status: 'open',
      priority: 'side',
      createdChapterId: chapterId,
      lastTouchedChapterId: chapterId,
      createdAt: touchedAt,
    }
    threadByText.set(key, thread)
    storyThreads.push(thread)
  }
  for (const text of update.resolvedThreads) {
    const existing = threadByText.get(text.trim().toLowerCase())
    if (existing) {
      existing.status = 'resolved'
      existing.resolutionChapterId = chapterId
    }
  }
  const chapterMemory = {
    chapterId,
    chapterTitle,
    summary: event.summary,
    keyEvents: event.events?.map((item) => item.title).filter(Boolean).slice(0, 8) ?? [],
    openThreads: event.openThreads ?? [],
    resolvedThreads: update.resolvedThreads,
    updatedAt: event.createdAt,
  }
  const chapterMemories = [
    ...(detail.chapterMemories ?? []).filter((memory) => memory.chapterId !== chapterId),
    chapterMemory,
  ].slice(-1000)

  return {
    detail: {
      ...detail,
      characters,
      factions,
      locations,
      items,
      species,
      foreshadowings,
      relationships,
      system,
      moduleData,
      currentSummary: update.summary || detail.currentSummary,
      storyStateEvents,
      storyStateSnapshots,
      storyThreads,
      chapterMemories,
      characterStateTimeline,
      factionStateTimeline,
    },
    event,
    snapshot,
    experiences: appliedExperiences,
  }
}

export function rollbackStoryState(detail: WorkDetail, snapshotId: string): WorkDetail | null {
  const snapshots = detail.storyStateSnapshots ?? []
  const index = snapshots.findIndex((snapshot) => snapshot.id === snapshotId)
  if (index < 0) return null
  const snapshot = snapshots[index]
  const events = detail.storyStateEvents ?? []
  const eventIndex = events.findIndex((event) => event.id === snapshot.eventId)
  const remainingEvents = eventIndex >= 0 ? events.slice(0, eventIndex) : events
  return {
    ...detail,
    characters: JSON.parse(JSON.stringify(snapshot.data.characters)),
    factions: JSON.parse(JSON.stringify(snapshot.data.factions)),
    locations: JSON.parse(JSON.stringify(snapshot.data.locations)),
    items: snapshot.data.items
      ? JSON.parse(JSON.stringify(snapshot.data.items))
      : detail.items,
    species: snapshot.data.species
      ? JSON.parse(JSON.stringify(snapshot.data.species))
      : detail.species,
    foreshadowings: JSON.parse(JSON.stringify(snapshot.data.foreshadowings)),
    relationships: snapshot.data.relationships
      ? JSON.parse(JSON.stringify(snapshot.data.relationships))
      : detail.relationships,
    system: snapshot.data.system
      ? JSON.parse(JSON.stringify(snapshot.data.system))
      : detail.system,
    moduleData: snapshot.data.moduleData
      ? JSON.parse(JSON.stringify(snapshot.data.moduleData))
      : detail.moduleData,
    storyThreads: snapshot.data.storyThreads
      ? JSON.parse(JSON.stringify(snapshot.data.storyThreads))
      : detail.storyThreads,
    characterStateTimeline: snapshot.data.characterStateTimeline
      ? JSON.parse(JSON.stringify(snapshot.data.characterStateTimeline))
      : (detail.characterStateTimeline ?? []).filter((entry) =>
          remainingEvents.some((event) => event.chapterId === entry.chapterId),
        ),
    factionStateTimeline: snapshot.data.factionStateTimeline
      ? JSON.parse(JSON.stringify(snapshot.data.factionStateTimeline))
      : (detail.factionStateTimeline ?? []).filter((entry) =>
          remainingEvents.some((event) => event.chapterId === entry.chapterId),
        ),
    chapterMemories: (detail.chapterMemories ?? []).filter((memory) =>
      remainingEvents.some((event) => event.chapterId === memory.chapterId),
    ),
    currentSummary: snapshot.previousSummary,
    storyStateEvents: remainingEvents,
    storyStateSnapshots: snapshots.slice(0, index),
  }
}

// 仅供类型引用，避免未来扩展时忘记字段。
export type StoryStateEntity = CharacterCard | FactionCard | LocationCard | ForeshadowingCard
