import { describe, expect, it } from 'vitest'
import {
  createAutoSnapshot,
  createProjectBackup,
  createTrashEntry,
  parseProjectBackup,
  pruneSnapshots,
} from './backup'
import { BUILTIN_TEMPLATES } from './worldTemplates'
import { DEFAULT_APPEARANCE } from './appearance'
import { DEFAULT_AI_PROFILES } from './aiProfiles'
import { DEFAULT_CHARACTER_CHAT_SETTINGS } from './characterChatSettings'
import { resolveModules } from './moduleCatalog'
import { estimateTokens } from './utils'
import type { Chapter, Prompt, Work, WorkDetail } from './types'

describe('backup', () => {
  it('round-trips a project backup', () => {
    const backup = createProjectBackup({
      works: [] as Work[],
      chapters: {} as Record<string, Chapter[]>,
      details: {} as Record<string, WorkDetail>,
      prompts: [] as Prompt[],
    })
    const parsed = parseProjectBackup(JSON.stringify(backup))
    expect(parsed.format).toBe('shuoxi-project')
    expect(parsed.works).toEqual([])
    expect(parsed.version).toBe(2)
  })

  it('round-trips chats, appearance and custom accents without API key', () => {
    const backup = createProjectBackup({
      works: [],
      chapters: {},
      details: {},
      prompts: [],
      characterChats: [],
      characterMemories: [],
      appearance: {
        ...DEFAULT_APPEARANCE,
        accent: 'custom:user-1',
        customAccents: [{ id: 'user-1', label: '赤霞', color: '#ff6b6b' }],
        uiScale: 125,
      },
      aiProfiles: {
        ...DEFAULT_AI_PROFILES,
        shared: { ...DEFAULT_AI_PROFILES.shared, apiKey: 'sk-secret' },
      },
      characterChatSettings: DEFAULT_CHARACTER_CHAT_SETTINGS,
      aiUsage: [],
      lastBackupAt: 123,
    })
    expect(backup.settings?.aiProfiles.shared.apiKey).toBe('')
    const parsed = parseProjectBackup(JSON.stringify(backup))
    expect(parsed.settings?.appearance.customAccents[0].color).toBe('#ff6b6b')
    expect(parsed.settings?.appearance.uiScale).toBe(125)
    expect(parsed.settings?.aiProfiles.shared.apiKey).toBe('')
    expect(parsed.settings?.lastBackupAt).toBe(123)
  })

  it('reads legacy version 1 backups', () => {
    const legacy = {
      format: 'shuoxi-project',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      works: [],
      chapters: {},
      details: {},
      prompts: [],
    }
    const parsed = parseProjectBackup(JSON.stringify(legacy))
    expect(parsed.version).toBe(1)
    expect(parsed.characterChats).toEqual([])
    expect(parsed.settings).toBeUndefined()
  })

  it('rejects wrong files', () => {
    expect(() => parseProjectBackup('{}')).toThrow()
  })

  it('creates auto snapshots and trash entries with stable shape', () => {
    const backup = createProjectBackup({
      works: [],
      chapters: {},
      details: {},
      prompts: [],
    })
    const snapshot = createAutoSnapshot({ backup, reason: '测试快照' })
    expect(snapshot.reason).toBe('测试快照')
    expect(snapshot.backup.version).toBe(2)
    const snapshots = [
      createAutoSnapshot({ backup, reason: '最新' }),
      createAutoSnapshot({ backup, reason: '第二份' }),
      createAutoSnapshot({ backup, reason: '第三份' }),
    ]
    expect(pruneSnapshots(snapshots, 2)).toHaveLength(2)
    expect(pruneSnapshots(snapshots, 3, 1)).toHaveLength(1)
    const trash = createTrashEntry({
      work: { id: 'w1' } as Work,
      chapters: [],
      chats: [],
      memories: [],
    })
    expect(trash.work.id).toBe('w1')
    expect(trash.id).toContain('trash-')
  })
})

describe('templates and modules', () => {
  it('every builtin template has at least 9 modules', () => {
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(8)
    for (const template of BUILTIN_TEMPLATES) {
      expect(template.modules.length).toBeGreaterThanOrEqual(9)
      expect(resolveModules(template).length).toBe(template.modules.length)
    }
  })

  it('does not include a system template in the picker', () => {
    expect(BUILTIN_TEMPLATES.some((template) => template.id === 'system')).toBe(false)
  })
})

describe('utils', () => {
  it('estimates Chinese tokens reasonably', () => {
    expect(estimateTokens('你好世界')).toBeGreaterThan(0)
    expect(estimateTokens('')).toBe(0)
  })
})
