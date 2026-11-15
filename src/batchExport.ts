import type { Chapter, Work } from './types'
import { downloadTextFile } from './backup'
import { exportWorkMarkdown } from './backup'

export type BatchExportFormat = 'markdown' | 'json'

function stamp(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 48) || 'shuoxi'
}

export function batchExportWorks(
  works: Work[],
  chaptersByWork: Record<string, Chapter[]>,
  format: BatchExportFormat = 'markdown',
): void {
  if (works.length === 0) return
  const date = new Date().toISOString()
  if (format === 'json') {
    const payload = {
      format: 'shuoxi-works-batch',
      version: 1,
      exportedAt: date,
      works: works.map((work) => ({
        work,
        chapters: chaptersByWork[work.id] ?? [],
      })),
    }
    downloadTextFile(
      `说戏-批量作品-${stamp()}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8',
    )
    return
  }
  const body = [
    `# 说戏 · 批量作品导出`,
    '',
    `导出时间：${new Date(date).toLocaleString('zh-CN')}`,
    `作品数量：${works.length}`,
    '',
    ...works.map((work) => {
      const chapters = chaptersByWork[work.id] ?? []
      return [
        `<a id="work-${work.id}"></a>`,
        exportWorkMarkdown(work, chapters),
        '',
        '---',
        '',
      ].join('\n')
    }),
  ].join('\n')
  downloadTextFile(`说戏-批量作品-${stamp()}.md`, body, 'text/markdown;charset=utf-8')
}

export type EntityExportKind = 'character' | 'faction' | 'item' | 'species'

const ENTITY_LABEL: Record<EntityExportKind, string> = {
  character: '角色',
  faction: '势力',
  item: '物品',
  species: '物种',
}

function entityValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map((item) => entityValue(item)).filter(Boolean).join('、')
  }
  return JSON.stringify(value)
}

function skipEntityKey(key: string): boolean {
  return ['id', 'attributes', 'profile', 'experiences', 'inventory'].includes(key)
}

export function batchExportEntities(
  kind: EntityExportKind,
  workTitle: string,
  entities: Record<string, unknown>[],
  format: BatchExportFormat = 'json',
): void {
  if (entities.length === 0) return
  const label = ENTITY_LABEL[kind]
  const safeTitle = safeName(workTitle)
  if (format === 'json') {
    const payload = {
      format: 'shuoxi-entities-batch',
      version: 1,
      kind,
      workTitle,
      exportedAt: new Date().toISOString(),
      entities,
    }
    downloadTextFile(
      `${safeTitle}-${label}-${stamp()}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8',
    )
    return
  }
  const lines = [
    `# 《${workTitle}》${label}导出`,
    '',
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    `数量：${entities.length}`,
    '',
  ]
  for (const entity of entities) {
    const name = entityValue(entity.name) || `未命名${label}`
    lines.push(`## ${name}`, '')
    for (const [key, value] of Object.entries(entity)) {
      if (skipEntityKey(key) || value === null || value === undefined) continue
      const text = entityValue(value).trim()
      if (!text) continue
      lines.push(`- **${key}**：${text}`)
    }
    lines.push('')
  }
  downloadTextFile(`${safeTitle}-${label}-${stamp()}.md`, lines.join('\n'), 'text/markdown;charset=utf-8')
}
