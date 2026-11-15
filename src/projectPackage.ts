import type { Chapter, Work, WorkDetail } from './types'

export const PROJECT_PACKAGE_FORMAT = 'shuoxi-project'
export const PROJECT_PACKAGE_VERSION = 1

export interface ProjectPackage {
  format: typeof PROJECT_PACKAGE_FORMAT
  version: number
  exportedAt: string
  appVersion?: string
  work: Work
  chapters: Chapter[]
  detail: WorkDetail
}

export function createProjectPackage(
  work: Work,
  chapters: Chapter[],
  detail: WorkDetail,
  appVersion?: string,
): string {
  const payload: ProjectPackage = {
    format: PROJECT_PACKAGE_FORMAT,
    version: PROJECT_PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    work,
    chapters,
    detail,
  }
  return JSON.stringify(payload, null, 2)
}

export function projectPackageFileName(work: Work): string {
  const safe = (work.title || '未命名作品')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return `${safe || '未命名作品'}.shuoxi.json`
}

export function parseProjectPackage(raw: string): {
  work: Work
  chapters: Chapter[]
  detail: WorkDetail
} {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  if (!value || typeof value !== 'object') throw new Error('项目包内容为空')
  const record = value as Record<string, unknown>
  if (record.format !== PROJECT_PACKAGE_FORMAT) {
    throw new Error('不是说戏项目包：缺少 format 标记')
  }
  if (!record.work || typeof record.work !== 'object') throw new Error('项目包缺少作品信息')
  if (!Array.isArray(record.chapters)) throw new Error('项目包缺少章节数据')
  if (!record.detail || typeof record.detail !== 'object') throw new Error('项目包缺少设定数据')
  return {
    work: record.work as Work,
    chapters: record.chapters as Chapter[],
    detail: record.detail as WorkDetail,
  }
}
