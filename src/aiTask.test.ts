import { describe, expect, it } from 'vitest'
import { AI_TASKS, aiTaskConcurrency, aiTaskUsageSummary, apiForTask, resetAiTaskUsage } from './aiTask'
import { createArchiveCandidates, mergeArchiveJobs, nextArchiveJob } from './archiveQueue'
import { needsArchiveCompletion } from './entityArchive'
import type { CharacterCard, FactionCard } from './types'
import { normalizeCharacterProfile, emptyCharacterProfile } from './characterProfile'
import { normalizeFactionProfile, emptyFactionProfile } from './factionProfile'

const apis = {
  writing: { provider: 'deepseek', baseUrl: 'x', apiKey: 'x', model: 'writing' },
  general: { provider: 'deepseek', baseUrl: 'x', apiKey: 'x', model: 'general' },
  chat: { provider: 'deepseek', baseUrl: 'x', apiKey: 'x', model: 'chat' },
} as const

describe('ai task routing', () => {
  it('routes task families to the intended model profile', () => {
    expect(apiForTask('writing.continue', apis).model).toBe('writing')
    expect(apiForTask('sync.fast', apis).model).toBe('general')
    expect(apiForTask('sync.deep', apis).model).toBe('writing')
    expect(apiForTask('chat.character', apis).model).toBe('chat')
    expect(AI_TASKS['sync.fast'].maxTokens).toBeGreaterThan(0)
  })
})

describe('archive queue', () => {
  it('creates candidates with limit and dedupes queued jobs', () => {
    const jobs = createArchiveCandidates(
      [
        { entityType: 'character', id: 'new-c1', name: '陈默', role: '主角' },
        { entityType: 'character', id: 'new-c2', name: '范长庚', role: '配角' },
        { entityType: 'faction', id: 'new-f1', name: '协进会', role: '' },
      ],
      'ch1',
      { limit: 2, onlyImportant: false },
    )
    expect(jobs).toHaveLength(2)
    const merged = mergeArchiveJobs(jobs, jobs)
    expect(merged).toHaveLength(2)
    expect(nextArchiveJob(merged)?.name).toBe('陈默')
  })
})

describe('archive completeness', () => {
  it('treats empty profiles as pending and complete profiles as done', () => {
    const empty: CharacterCard = {
      id: 'c1',
      name: '陈默',
      role: '主角',
      identity: '',
      personality: '',
      goal: '',
      profile: normalizeCharacterProfile(emptyCharacterProfile()),
    }
    expect(needsArchiveCompletion('character', empty)).toBe(true)
    empty.profile = { ...normalizeCharacterProfile(emptyCharacterProfile()), coreContradiction: 'x' }
    empty.archiveStatus = 'complete'
    expect(needsArchiveCompletion('character', empty)).toBe(false)

    const faction: FactionCard = {
      id: 'f1',
      name: '协进会',
      type: '组织',
      leader: '',
      goal: '',
      description: '',
      profile: normalizeFactionProfile(emptyFactionProfile()),
    }
    expect(needsArchiveCompletion('faction', faction)).toBe(true)
  })
})

describe('ai runtime counters', () => {
  it('exposes concurrency and usage counters', () => {
    expect(aiTaskConcurrency().max).toBe(2)
    resetAiTaskUsage()
    expect(aiTaskUsageSummary().inputTokens).toBe(0)
  })
})
