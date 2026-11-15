import { PROVIDERS } from './data'
import type { ApiConfig } from './types'

function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

export function formatWords(count: number): string {
  if (count >= 10000) return `${trimZero(count / 10000)} 万字`
  return `${count} 字`
}

import type { Chapter } from './types'

export function countWords(text: string): number {
  return text.replace(/\s+/g, '').length
}

const chapterWordCache = new Map<string, { updatedAt: number; words: number }>()

/**
 * 章节列表 / 总字数使用缓存，避免每次渲染重新扫描整本书。
 * 新章节在创建和更新时写入 wordCount；旧数据首次读取时回退计算并缓存。
 */
export function chapterWords(chapter: Chapter): number {
  if (typeof chapter.wordCount === 'number') return chapter.wordCount
  const cached = chapterWordCache.get(chapter.id)
  if (cached && cached.updatedAt === chapter.updatedAt) return cached.words
  const words = countWords(chapter.content)
  if (chapterWordCache.size > 4000) chapterWordCache.clear()
  chapterWordCache.set(chapter.id, { updatedAt: chapter.updatedAt, words })
  return words
}

export function estimateTokens(text: string): number {
  const chinese = (text.match(/[\u3000-\u9fff]/g) ?? []).length
  const rest = Math.max(0, text.length - chinese)
  return Math.ceil(chinese * 1.15 + rest / 3.5)
}

export function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 2 * day) return '昨天'
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`

  const date = new Date(timestamp)
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

export function greeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 13) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

export function todayLabel(now = new Date()): string {
  return dateFormatter.format(now)
}

export function apiStatus(api: ApiConfig): { label: string; configured: boolean } {
  const name = PROVIDERS.find((provider) => provider.id === api.provider)?.name ?? '自定义'
  if (!api.apiKey.trim() || !api.baseUrl.trim() || !api.model.trim()) {
    return { label: '未配置 API', configured: false }
  }
  return { label: `${name} · 已配置`, configured: true }
}
