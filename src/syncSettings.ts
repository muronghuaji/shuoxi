import type { Chapter, SyncSettings, WorkDetail } from './types'

export const SYNC_SETTINGS_KEY = 'shuoxi.syncSettings.v1'

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  afterGeneration: false,
  chapterInterval: 10,
  strategy: 'current',
  localChapterSummary: true,
  importantChapterAutoSync: true,
  coverageDeepSync: true,
  autoArchiveComplete: true,
  archiveCompleteLimit: 2,
  archiveOnlyImportant: false,
  aiBackgroundPaused: false,
}

export function normalizeSyncSettings(raw: unknown): SyncSettings {
  const value =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const interval =
    typeof value.chapterInterval === 'number' && Number.isFinite(value.chapterInterval)
      ? Math.max(1, Math.min(100, Math.round(value.chapterInterval)))
      : DEFAULT_SYNC_SETTINGS.chapterInterval
  return {
    afterGeneration:
      typeof value.afterGeneration === 'boolean'
        ? value.afterGeneration
        : DEFAULT_SYNC_SETTINGS.afterGeneration,
    chapterInterval: interval,
    strategy: value.strategy === 'backfill' ? 'backfill' : 'current',
    localChapterSummary:
      typeof value.localChapterSummary === 'boolean'
        ? value.localChapterSummary
        : DEFAULT_SYNC_SETTINGS.localChapterSummary,
    importantChapterAutoSync:
      typeof value.importantChapterAutoSync === 'boolean'
        ? value.importantChapterAutoSync
        : DEFAULT_SYNC_SETTINGS.importantChapterAutoSync,
    coverageDeepSync:
      typeof value.coverageDeepSync === 'boolean'
        ? value.coverageDeepSync
        : DEFAULT_SYNC_SETTINGS.coverageDeepSync,
    autoArchiveComplete:
      typeof value.autoArchiveComplete === 'boolean'
        ? value.autoArchiveComplete
        : DEFAULT_SYNC_SETTINGS.autoArchiveComplete,
    archiveCompleteLimit:
      typeof value.archiveCompleteLimit === 'number' && Number.isFinite(value.archiveCompleteLimit)
        ? Math.max(1, Math.min(5, Math.round(value.archiveCompleteLimit)))
        : DEFAULT_SYNC_SETTINGS.archiveCompleteLimit,
    archiveOnlyImportant:
      typeof value.archiveOnlyImportant === 'boolean'
        ? value.archiveOnlyImportant
        : DEFAULT_SYNC_SETTINGS.archiveOnlyImportant,
    aiBackgroundPaused:
      typeof value.aiBackgroundPaused === 'boolean'
        ? value.aiBackgroundPaused
        : DEFAULT_SYNC_SETTINGS.aiBackgroundPaused,
  }
}

const IMPORTANT_PATTERNS = [
  /死亡|身亡|陨落|咽气|断气|气绝/,
  /杀死|刺杀|处死|灭门|屠城|血洗/,
  /重伤|残疾|断臂|断腿|失明|毁容|废去修为/,
  /背叛|叛变|出卖|反目|决裂|倒戈/,
  /退位|夺权|篡位|政变|逼宫|易主/,
  /宣战|开战|战争爆发|停战|议和|结盟|盟约/,
  /灭宗|灭国|亡国|覆灭|崩塌/,
  /失去.{0,6}(城|领地|矿脉|山门|据点)/,
  /时间跳跃|三年后|十年后|数年后|多年后/,
  /真相|秘密.{0,8}(揭开|暴露|说出|公开)|身世/,
  /伏笔.{0,6}(回收|兑现)/,
]

const IMPORTANT_TITLE_PATTERNS = [
  /死|亡|陨|葬|杀|刺|战|叛|决裂|真相|秘密|卷终|终章|灭|毁|夺权|易主/,
]

export function isImportantChapter(chapter: Chapter, content = chapter.content): boolean {
  if (!content.trim()) return false
  if (IMPORTANT_TITLE_PATTERNS.some((pattern) => pattern.test(chapter.title))) return true
  let hits = 0
  for (const pattern of IMPORTANT_PATTERNS) {
    if (pattern.test(content)) hits += 1
  }
  return hits >= 2
}

export function shouldAutoSyncChapter(input: {
  chapterIndex: number
  lastSyncedIndex: number
  interval: number
  important?: boolean
}): boolean {
  if (input.important) return true
  return input.chapterIndex - input.lastSyncedIndex >= Math.max(1, input.interval)
}

function clip(text: string, limit: number): string {
  const value = text.replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

export interface LocalChapterSummary {
  summary: string
  keywords: string[]
}

/**
 * 不调用 AI 的抽句式章节摘要：取开头、关键命中句和结尾，
 * 只用于让下一次写作知道“这一章大概发生了什么”。
 */
export function createLocalChapterSummary(
  chapter: Chapter,
  detail?: WorkDetail,
): LocalChapterSummary {
  const sentences = chapter.content
    .replace(/\r\n/g, '\n')
    .split(/(?<=[。！？!?…])|\n+/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 6)
  if (sentences.length === 0) return { summary: '', keywords: [] }

  const keywordCandidates = [
    ...(detail?.characters ?? []).map((item) => item.name),
    ...(detail?.factions ?? []).map((item) => item.name),
    ...(detail?.locations ?? []).map((item) => item.name),
    ...(detail?.items ?? []).map((item) => item.name),
  ].filter(Boolean)
  const keywords = [...new Set(keywordCandidates.filter((name) => chapter.content.includes(name)))].slice(0, 12)

  const head = sentences.slice(0, 2)
  const important = sentences.filter((sentence) => IMPORTANT_PATTERNS.some((pattern) => pattern.test(sentence)))
  const tail = sentences.slice(-1)
  const picked: string[] = []
  for (const sentence of [...head, ...important, ...tail]) {
    if (picked.includes(sentence)) continue
    picked.push(sentence)
    if (picked.length >= 4) break
  }
  const prefix = keywords.length ? `人物 / 势力：${keywords.join('、')}。` : ''
  return {
    summary: clip(`${prefix}${picked.join('')}`, 260),
    keywords,
  }
}
