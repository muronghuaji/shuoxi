export type SyncJobMode = 'fast' | 'full'
export type SyncJobSource = 'auto' | 'manual' | 'backfill'
export type SyncJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface SyncJob {
  id: string
  chapterId: string
  chapterTitle: string
  contentHash: string
  content: string
  mode: SyncJobMode
  source: SyncJobSource
  priority: number
  status: SyncJobStatus
  attempts: number
  error?: string
  createdAt: number
}

function hashContent(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${text.length}-${(hash >>> 0).toString(36)}`
}

export function createSyncJob(input: {
  chapterId: string
  chapterTitle: string
  content: string
  mode: SyncJobMode
  source: SyncJobSource
}): SyncJob {
  return {
    id: `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    contentHash: hashContent(input.content),
    content: input.content,
    mode: input.mode,
    source: input.source,
    priority: input.source === 'manual' ? 0 : input.source === 'auto' ? 1 : 2,
    status: 'queued',
    attempts: 0,
    createdAt: Date.now(),
  }
}

/** 去重后按优先级、创建时间排序；内容变了会替换同一章的旧任务。 */
export function mergeSyncJobs(current: SyncJob[], incoming: SyncJob[]): SyncJob[] {
  const result = [...current]
  for (const job of incoming) {
    const runningSameChapter = result.some(
      (item) => item.chapterId === job.chapterId && item.status === 'running',
    )
    if (runningSameChapter) continue
    const sameChapter = result.findIndex(
      (item) =>
        item.chapterId === job.chapterId &&
        item.status !== 'done' &&
        item.status !== 'cancelled',
    )
    if (sameChapter >= 0) result.splice(sameChapter, 1)
    if (
      result.some(
        (item) =>
          item.chapterId === job.chapterId &&
          item.contentHash === job.contentHash &&
          item.mode === job.mode &&
          item.status === 'done',
      )
    ) {
      continue
    }
    result.push(job)
  }
  return result.sort((left, right) => left.priority - right.priority || left.createdAt - right.createdAt)
}

export function nextSyncJob(jobs: SyncJob[]): SyncJob | undefined {
  return jobs
    .filter((job) => job.status === 'queued')
    .sort((left, right) => left.priority - right.priority || left.createdAt - right.createdAt)[0]
}

export function updateSyncJob(jobs: SyncJob[], id: string, patch: Partial<SyncJob>): SyncJob[] {
  return jobs.map((job) => (job.id === id ? { ...job, ...patch } : job))
}

export function syncJobProgress(jobs: SyncJob[]): {
  total: number
  done: number
  failed: number
  pending: number
  running: boolean
} {
  const done = jobs.filter((job) => job.status === 'done').length
  const failed = jobs.filter((job) => job.status === 'failed').length
  const pending = jobs.filter((job) => job.status === 'queued').length
  return {
    total: jobs.length,
    done,
    failed,
    pending,
    running: jobs.some((job) => job.status === 'running'),
  }
}
