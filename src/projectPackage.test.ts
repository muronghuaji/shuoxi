import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import {
  createProjectPackage,
  parseProjectPackage,
  projectPackageFileName,
} from './projectPackage'
import type { Chapter, Work } from './types'

const work = {
  id: 'w1',
  title: '测试作品',
  genres: ['悬疑'],
  theme: '真相',
  status: '连载中',
  promptIds: [],
} as unknown as Work

const chapters: Chapter[] = [
  {
    id: 'ch1',
    title: '第一章',
    content: '测试正文。',
    updatedAt: 1,
    status: 'done',
  },
]

describe('project package', () => {
  it('round-trips a project package', () => {
    const raw = createProjectPackage(work, chapters, createEmptyDetail())
    const parsed = parseProjectPackage(raw)
    expect(parsed.work.title).toBe('测试作品')
    expect(parsed.chapters).toHaveLength(1)
    expect(parsed.detail).toBeTruthy()
  })

  it('rejects non-project JSON', () => {
    expect(() => parseProjectPackage('{"hello":1}')).toThrow(/format/)
    expect(() => parseProjectPackage('not json')).toThrow(/JSON/)
  })

  it('builds a safe file name', () => {
    expect(projectPackageFileName({ ...work, title: 'a/b:c*?' })).toBe('a_b_c__.shuoxi.json')
  })
})
