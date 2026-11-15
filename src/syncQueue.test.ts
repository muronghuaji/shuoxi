import { describe, expect, it } from 'vitest'
import {
  createSyncJob,
  mergeSyncJobs,
  nextSyncJob,
  syncJobProgress,
  updateSyncJob,
} from './syncQueue'

function job(chapterId: string, content: string, source: 'auto' | 'manual' | 'backfill' = 'auto') {
  return createSyncJob({
    chapterId,
    chapterTitle: chapterId,
    content,
    mode: 'fast',
    source,
  })
}

describe('sync queue', () => {
  it('deduplicates the same chapter and removes stale queued jobs', () => {
    const first = job('c1', 'old')
    const merged = mergeSyncJobs([first], [job('c1', 'new')])
    expect(merged).toHaveLength(1)
    expect(merged[0].content).toBe('new')
  })

  it('does not re-add an already completed identical job', () => {
    const done = { ...job('c1', 'text'), status: 'done' as const }
    const merged = mergeSyncJobs([done], [job('c1', 'text')])
    expect(merged).toHaveLength(1)
    expect(merged[0].status).toBe('done')
  })

  it('picks high priority first', () => {
    const auto = job('c1', 'a', 'auto')
    const manual = job('c2', 'b', 'manual')
    expect(nextSyncJob([auto, manual])?.chapterId).toBe('c2')
  })

  it('reports progress', () => {
    const running = { ...job('c1', 'a', 'auto'), status: 'running' as const }
    const done = { ...job('c2', 'b', 'auto'), status: 'done' as const }
    const failed = { ...job('c3', 'c', 'auto'), status: 'failed' as const }
    expect(syncJobProgress([running, done, failed])).toMatchObject({
      total: 3,
      done: 1,
      failed: 1,
      running: true,
    })
  })

  it('updates a job by id', () => {
    const item = job('c1', 'a', 'auto')
    const next = updateSyncJob([item], item.id, { status: 'done' })
    expect(next[0].status).toBe('done')
  })
})
