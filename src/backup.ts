import type {
  AiProfilesConfig,
  AiUsageEntry,
  Idea,
  AppearanceSettings,
  CharacterChatMemory,
  CharacterChatSession,
  CharacterChatSettings,
  Chapter,
  Prompt,
  SyncSettings,
  Work,
  WorkDetail,
} from './types'
import { DEFAULT_APPEARANCE, normalizeAppearance } from './appearance'
import { DEFAULT_AI_PROFILES, normalizeAiProfiles } from './aiProfiles'
import {
  DEFAULT_CHARACTER_CHAT_SETTINGS,
  normalizeCharacterChatSettings,
} from './characterChatSettings'
import { DEFAULT_SYNC_SETTINGS, normalizeSyncSettings } from './syncSettings'
import type { AiRequestObservation } from './ai'
import type { WritingPricingSettings } from './pricing'
import type {
  StatsBudget,
  UsageDailyBucket,
  WritingActivityEntry,
  WritingDailySnapshot,
} from './stats'
import { normalizeBudget } from './stats'

export interface ProjectBackupSettings {
  appearance: AppearanceSettings
  aiProfiles: AiProfilesConfig
  characterChatSettings: CharacterChatSettings
  aiUsage: AiUsageEntry[]
  lastBackupAt: number
  backgroundImage?: string
  syncSettings?: SyncSettings
  usageDaily?: UsageDailyBucket[]
  writingDaily?: WritingDailySnapshot[]
  writingActivity?: WritingActivityEntry[]
  aiRequests?: AiRequestObservation[]
  statsBudget?: StatsBudget
  writingPricing?: WritingPricingSettings
  ideas?: Idea[]
}

export interface ProjectBackup {
  format: 'shuoxi-project'
  version: 1 | 2
  exportedAt: string
  works: Work[]
  chapters: Record<string, Chapter[]>
  details: Record<string, WorkDetail>
  prompts: Prompt[]
  characterChats?: CharacterChatSession[]
  characterMemories?: CharacterChatMemory[]
  settings?: ProjectBackupSettings
}

export interface AutoSnapshot {
  id: string
  createdAt: string
  reason: string
  backup: ProjectBackup
}

export interface TrashEntry {
  id: string
  deletedAt: string
  work: Work
  chapters: Chapter[]
  detail?: WorkDetail
  chats: CharacterChatSession[]
  memories: CharacterChatMemory[]
}

export const MAX_AUTO_SNAPSHOTS = 3
export const MAX_TRASH_ENTRIES = 20
export const MAX_SNAPSHOT_BYTES = 24 * 1024 * 1024

function sanitizeAiProfiles(profiles: AiProfilesConfig | undefined): AiProfilesConfig {
  const normalized = normalizeAiProfiles(profiles ?? DEFAULT_AI_PROFILES)
  return {
    ...normalized,
    shared: { ...normalized.shared, apiKey: '' },
  }
}

export function createProjectBackup(input: {
  works: Work[]
  chapters: Record<string, Chapter[]>
  details: Record<string, WorkDetail>
  prompts: Prompt[]
  characterChats?: CharacterChatSession[]
  characterMemories?: CharacterChatMemory[]
  appearance?: AppearanceSettings
  aiProfiles?: AiProfilesConfig
  characterChatSettings?: CharacterChatSettings
  aiUsage?: AiUsageEntry[]
  lastBackupAt?: number
  backgroundImage?: string
  syncSettings?: SyncSettings
  usageDaily?: UsageDailyBucket[]
  writingDaily?: WritingDailySnapshot[]
  writingActivity?: WritingActivityEntry[]
  aiRequests?: AiRequestObservation[]
  statsBudget?: StatsBudget
  writingPricing?: WritingPricingSettings
  ideas?: Idea[]
}): ProjectBackup {
  const hasSettings =
    input.appearance !== undefined ||
    input.aiProfiles !== undefined ||
    input.characterChatSettings !== undefined ||
    input.aiUsage !== undefined ||
    input.backgroundImage !== undefined ||
    input.syncSettings !== undefined ||
    input.usageDaily !== undefined ||
    input.writingDaily !== undefined ||
    input.writingActivity !== undefined ||
    input.aiRequests !== undefined ||
    input.statsBudget !== undefined ||
    input.writingPricing !== undefined ||
    input.ideas !== undefined
  return {
    format: 'shuoxi-project',
    version: 2,
    exportedAt: new Date().toISOString(),
    works: input.works,
    chapters: input.chapters,
    details: input.details,
    prompts: input.prompts,
    characterChats: input.characterChats ?? [],
    characterMemories: input.characterMemories ?? [],
    ...(hasSettings
      ? {
          settings: {
            appearance: normalizeAppearance(input.appearance ?? DEFAULT_APPEARANCE),
            aiProfiles: sanitizeAiProfiles(input.aiProfiles),
            characterChatSettings: normalizeCharacterChatSettings(
              input.characterChatSettings ?? DEFAULT_CHARACTER_CHAT_SETTINGS,
            ),
            aiUsage: input.aiUsage ?? [],
            lastBackupAt: input.lastBackupAt ?? 0,
            backgroundImage: input.backgroundImage ?? '',
            syncSettings: normalizeSyncSettings(input.syncSettings ?? DEFAULT_SYNC_SETTINGS),
            usageDaily: input.usageDaily,
            writingDaily: input.writingDaily,
            writingActivity: input.writingActivity,
            aiRequests: input.aiRequests,
            statsBudget: input.statsBudget,
            writingPricing: input.writingPricing,
            ideas: input.ideas,
          },
        }
      : {}),
  }
}

export function createAutoSnapshot(input: {
  backup: ProjectBackup
  reason: string
}): AutoSnapshot {
  return {
    id: `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    createdAt: new Date().toISOString(),
    reason: input.reason,
    backup: input.backup,
  }
}

export function snapshotBytes(snapshot: AutoSnapshot): number {
  try {
    return new Blob([JSON.stringify(snapshot)]).size
  } catch {
    return 0
  }
}

export function pruneSnapshots(
  snapshots: AutoSnapshot[],
  maxCount = MAX_AUTO_SNAPSHOTS,
  maxBytes = MAX_SNAPSHOT_BYTES,
): AutoSnapshot[] {
  const kept: AutoSnapshot[] = []
  let total = 0
  for (const snapshot of snapshots) {
    if (kept.length >= Math.max(1, maxCount)) break
    const bytes = snapshotBytes(snapshot)
    if (kept.length > 0 && total + bytes > maxBytes) break
    kept.push(snapshot)
    total += bytes
  }
  return kept
}

export function createTrashEntry(input: {
  work: Work
  chapters: Chapter[]
  detail?: WorkDetail
  chats: CharacterChatSession[]
  memories: CharacterChatMemory[]
}): TrashEntry {
  return {
    id: `trash-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    deletedAt: new Date().toISOString(),
    work: input.work,
    chapters: input.chapters,
    detail: input.detail,
    chats: input.chats,
    memories: input.memories,
  }
}

export function downloadTextFile(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function downloadProjectBackup(backup: ProjectBackup): void {
  const date = new Date().toISOString().slice(0, 10)
  downloadTextFile(`shuoxi-backup-${date}.json`, JSON.stringify(backup, null, 2))
}

export function parseProjectBackup(text: string): ProjectBackup {
  const raw = JSON.parse(text) as Partial<ProjectBackup>
  if (raw?.format !== 'shuoxi-project' || (raw.version !== 1 && raw.version !== 2)) {
    throw new Error('不是说戏项目备份文件')
  }
  if (!Array.isArray(raw.works) || !raw.chapters || !raw.details || !Array.isArray(raw.prompts)) {
    throw new Error('备份文件缺少作品、章节或设定数据')
  }
  const backup: ProjectBackup = {
    format: 'shuoxi-project',
    version: raw.version === 2 ? 2 : 1,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
    works: raw.works as Work[],
    chapters: raw.chapters as Record<string, Chapter[]>,
    details: raw.details as Record<string, WorkDetail>,
    prompts: raw.prompts,
    characterChats: Array.isArray(raw.characterChats) ? raw.characterChats : [],
    characterMemories: Array.isArray(raw.characterMemories) ? raw.characterMemories : [],
  }
  if (raw.settings && typeof raw.settings === 'object') {
    const settings = raw.settings as Partial<ProjectBackupSettings>
    backup.settings = {
      appearance: normalizeAppearance(settings.appearance ?? DEFAULT_APPEARANCE),
      aiProfiles: sanitizeAiProfiles(settings.aiProfiles),
      characterChatSettings: normalizeCharacterChatSettings(
        settings.characterChatSettings ?? DEFAULT_CHARACTER_CHAT_SETTINGS,
      ),
      aiUsage: Array.isArray(settings.aiUsage) ? settings.aiUsage : [],
      lastBackupAt:
        typeof settings.lastBackupAt === 'number' && Number.isFinite(settings.lastBackupAt)
          ? settings.lastBackupAt
          : 0,
      backgroundImage:
        typeof settings.backgroundImage === 'string' ? settings.backgroundImage : '',
      syncSettings: normalizeSyncSettings(settings.syncSettings),
      usageDaily: Array.isArray(settings.usageDaily) ? settings.usageDaily : undefined,
      writingDaily: Array.isArray(settings.writingDaily) ? settings.writingDaily : undefined,
      writingActivity: Array.isArray(settings.writingActivity)
        ? settings.writingActivity
        : undefined,
      aiRequests: Array.isArray(settings.aiRequests) ? settings.aiRequests : undefined,
      statsBudget:
        settings.statsBudget && typeof settings.statsBudget === 'object'
          ? normalizeBudget(settings.statsBudget)
          : undefined,
      writingPricing:
        settings.writingPricing && typeof settings.writingPricing === 'object'
          ? settings.writingPricing
          : undefined,
      ideas: Array.isArray(settings.ideas) ? settings.ideas : undefined,
    }
  }
  return backup
}

export function getLocalStorageUsage(): { bytes: number; entries: { key: string; bytes: number }[] } {
  const entries: { key: string; bytes: number }[] = []
  let bytes = 0
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key) continue
      const value = localStorage.getItem(key) ?? ''
      const size = (key.length + value.length) * 2
      bytes += size
      if (key.startsWith('shuoxi.')) entries.push({ key, bytes: size })
    }
  } catch {
    return { bytes: 0, entries: [] }
  }
  entries.sort((a, b) => b.bytes - a.bytes)
  return { bytes, entries }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function exportWorkMarkdown(
  work: Work,
  chapters: Chapter[],
  detail?: WorkDetail,
): string {
  const lines: string[] = []
  lines.push(`# ${work.title}`, '')
  if (work.synopsis) lines.push(`> ${work.synopsis}`, '')
  if (work.theme) lines.push(`主题：${work.theme}`, '')
  if (detail?.worldview) lines.push(`世界观：${detail.worldview}`, '')
  lines.push('')
  chapters.forEach((chapter, index) => {
    const title = chapter.title.trim()
    const heading = /^第.+[章回节卷]/.test(title)
      ? title
      : `第 ${index + 1} 章 ${title || '未命名章节'}`
    lines.push(`## ${heading}`, '')
    lines.push(chapter.content.trim() || '（本章暂无正文）', '')
  })
  return lines.join('\n')
}
