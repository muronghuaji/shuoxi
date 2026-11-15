import type { StoryStateNewEntity } from './types'

export type ArchiveJobStatus = 'queued' | 'running' | 'done' | 'failed'

export interface ArchiveJob {
  id: string
  chapterId: string
  kind: 'character' | 'faction'
  name: string
  status: ArchiveJobStatus
  attempts: number
  error?: string
  createdAt: number
  /** 手动“整势力补全”时即使档案看起来完整也强制跑一遍。 */
  force?: boolean
}

export function createArchiveJob(
  kind: 'character' | 'faction',
  name: string,
  chapterId = '',
  force = false,
): ArchiveJob {
  return {
    id: `archive-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    chapterId,
    kind,
    name,
    status: 'queued',
    attempts: 0,
    createdAt: Date.now(),
    force,
  }
}

export function createArchiveCandidates(
  entities: StoryStateNewEntity[],
  chapterId: string,
  input: { limit: number; onlyImportant: boolean },
): ArchiveJob[] {
  return entities
    .filter(
      (entity) =>
        (entity.entityType === 'character' || entity.entityType === 'faction') &&
        entity.name.trim() &&
        (!input.onlyImportant ||
          entity.entityType === 'faction' ||
          /主角|反派|重要|核心|首领|掌门|长老|关键/.test(entity.role ?? '')),
    )
    .slice(0, input.limit)
    .map((entity) => ({
      id: `archive-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      chapterId,
      kind: entity.entityType as 'character' | 'faction',
      name: entity.name,
      status: 'queued',
      attempts: 0,
      createdAt: Date.now(),
    }))
}

export function mergeArchiveJobs(current: ArchiveJob[], incoming: ArchiveJob[]): ArchiveJob[] {
  const result = [...current]
  for (const job of incoming) {
    const existing = result.find(
      (item) =>
        item.kind === job.kind &&
        item.name === job.name &&
        item.status !== 'failed' &&
        item.status !== 'done',
    )
    if (!existing) result.push(job)
  }
  return result.sort((left, right) => left.createdAt - right.createdAt)
}

export function nextArchiveJob(jobs: ArchiveJob[]): ArchiveJob | undefined {
  return jobs
    .filter((job) => job.status === 'queued')
    .sort((left, right) => left.createdAt - right.createdAt)[0]
}

export function updateArchiveJob(
  jobs: ArchiveJob[],
  id: string,
  patch: Partial<ArchiveJob>,
): ArchiveJob[] {
  return jobs.map((job) => (job.id === id ? { ...job, ...patch } : job))
}
