import type { ApiConfig, CharacterCard, FactionCard, Work, WorkDetail } from './types'
import {
  mergeCharacterBasicArchive,
  mergeCharacterDeepArchive,
  mergeFactionDeepArchive,
  requestEntityDeepFill,
  requestEntityFill,
} from './entityFill'
import { normalizeCharacterProfile, profileCompleteness } from './characterProfile'
import { factionProfileCompleteness, normalizeFactionProfile } from './factionProfile'

export type ArchiveKind = 'character' | 'faction'
export type ArchiveStatus = 'placeholder' | 'partial' | 'complete'

/** 统一判断实体是否还需要补深度档案。 */
export function needsArchiveCompletion(
  kind: ArchiveKind,
  entity: CharacterCard | FactionCard,
): boolean {
  if ('archiveStatus' in entity && entity.archiveStatus === 'complete') return false
  if (kind === 'character') {
    return profileCompleteness(normalizeCharacterProfile((entity as CharacterCard).profile)).score < 60
  }
  return (
    factionProfileCompleteness(normalizeFactionProfile((entity as FactionCard).profile)).score < 60
  )
}

/** 应用到最新实体时只补空白，避免补档过程中用户手写的内容被覆盖。 */
export function applyArchivePatch(
  kind: ArchiveKind,
  current: CharacterCard | FactionCard,
  patch: Partial<CharacterCard> | Partial<FactionCard>,
): Partial<CharacterCard> | Partial<FactionCard> {
  if (!('profile' in patch) || !patch.profile) return patch
  if (kind === 'character') {
    return {
      ...patch,
      ...mergeCharacterDeepArchive(current as CharacterCard, { profile: patch.profile }),
    } as Partial<CharacterCard>
  }
  return {
    ...patch,
    ...mergeFactionDeepArchive(current as FactionCard, { profile: patch.profile }),
  } as Partial<FactionCard>
}

/** 统一实体深度档案补全入口，供手动补全和后台补档共用。 */
export async function completeEntityArchive(input: {
  kind: ArchiveKind
  work: Work
  detail: WorkDetail
  entity: CharacterCard | FactionCard
  api: ApiConfig
  background?: boolean
  onRecordUsage?: Parameters<typeof requestEntityDeepFill>[0]['onRecordUsage']
}): Promise<Partial<CharacterCard> | Partial<FactionCard>> {
  const generated = await requestEntityDeepFill({
    kind: input.kind,
    work: input.work,
    detail: input.detail,
    entity: input.entity as unknown as Record<string, unknown>,
    api: input.api,
    background: input.background,
    onRecordUsage: input.onRecordUsage,
  })
  if (input.kind === 'character') {
    return mergeCharacterDeepArchive(input.entity as CharacterCard, generated)
  }
  return mergeFactionDeepArchive(input.entity as FactionCard, generated)
}

/** 一次补全角色的普通档案 + 深度档案；只填空，不覆盖已有内容。 */
export async function completeCharacterFullArchive(input: {
  work: Work
  detail: WorkDetail
  character: CharacterCard
  api: ApiConfig
  background?: boolean
  onRecordUsage?: Parameters<typeof requestEntityDeepFill>[0]['onRecordUsage']
}): Promise<Partial<CharacterCard>> {
  let current = input.character
  let patch: Partial<CharacterCard> = {}
  const basicMissing = [
    current.role,
    current.identity,
    current.personality,
    current.goal,
    current.appearance,
    current.background,
    current.gender,
    current.age,
    current.position,
  ].some((value) => !String(value ?? '').trim()) ||
    ((current.weapons?.length ?? 0) +
      (current.techniques?.length ?? 0) +
      (current.treasures?.length ?? 0) ===
      0)
  if (basicMissing) {
    const generated = await requestEntityFill({
      kind: 'character',
      work: input.work,
      detail: input.detail,
      entity: input.character as unknown as Record<string, unknown>,
      api: input.api,
      background: input.background,
      onRecordUsage: input.onRecordUsage,
    })
    patch = mergeCharacterBasicArchive(current, generated)
    current = { ...current, ...patch }
  }
  if (profileCompleteness(normalizeCharacterProfile(current.profile)).score < 100) {
    const deepPatch = await completeEntityArchive({
      kind: 'character',
      work: input.work,
      detail: input.detail,
      entity: current,
      api: input.api,
      background: input.background,
      onRecordUsage: input.onRecordUsage,
    })
    patch = { ...patch, ...(deepPatch as Partial<CharacterCard>) }
  }
  return patch
}
