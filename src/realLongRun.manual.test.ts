import { describe, expect, it } from 'vitest'
import { createEmptyDetail, SEED_WORKS } from './data'
import { emptyCharacterProfile } from './characterProfile'
import type { Chapter, Work, WorkDetail } from './types'
import {
  buildCompactStateUpdateMessages,
  buildGenerationMessages,
  buildStateUpdateMessages,
  streamChat,
  type ChatMessage,
} from './ai'
import { applyStoryStateUpdate, parseStoryStateUpdate } from './storyState'
import { buildStoryMemory } from './storyMemory'
import { auditGeneratedText } from './storyAudit'
import { writeFileSync } from 'node:fs'

const config = {
  baseUrl: process.env.REAL_LONGRUN_BASE_URL ?? '',
  apiKey: process.env.REAL_LONGRUN_API_KEY ?? '',
  model: process.env.REAL_LONGRUN_MODEL ?? '',
  chapters: Number(process.env.REAL_LONGRUN_CHAPTERS ?? 400),
  targetChars: Number(process.env.REAL_LONGRUN_TARGET_CHARS ?? 1_000_000),
  mock: process.env.REAL_LONGRUN_MOCK === '1',
  reportPath: process.env.REAL_LONGRUN_REPORT ?? 'longrun-report.json',
}

async function requestSync(messages: ChatMessage[], compactMessages: ChatMessage[]) {
  const request = async (attempt: ChatMessage[]) => {
    const result = await streamChat(
      {
        provider: 'custom',
        baseUrl: config.baseUrl || 'http://mock',
        apiKey: config.apiKey || 'mock',
        model: config.model || 'mock',
        reasoningEffort: 'auto',
      },
      attempt,
      { temperature: 0.15, maxTokens: 4000 },
    )
    return result
  }
  let result = await request(messages)
  let parsed = parseStoryStateUpdate(result)
  let retries = 0
  if (!parsed) {
    retries += 1
    result = await request(compactMessages)
    parsed = parseStoryStateUpdate(result)
  }
  if (!parsed) {
    retries += 1
    const retryMessages: ChatMessage[] = [
      ...compactMessages,
      {
        role: 'user',
        content:
          '上一次输出无法解析。请重新只输出一个完整、合法的 JSON 对象；不要 markdown、不要解释；必须包含 summary 和 events 数组；字段尽量短，确保括号完整闭合。',
      },
    ]
    result = await request(retryMessages)
    parsed = parseStoryStateUpdate(result)
  }
  return { parsed, result, retries }
}

function makeWork(): Work {
  return {
    ...SEED_WORKS[0],
    id: 'long-run-benchmark',
    title: '百万字连续性基准书',
    synopsis: '用于长跑压力测试的合成小说。',
    genres: ['悬疑', '推理'],
    targetWords: 1_000_000,
  }
}

function makeDetail(): WorkDetail {
  const detail = createEmptyDetail()
  detail.characters = [
    {
      id: 'c1',
      name: '陆照雪',
      role: '主角',
      identity: '调查者',
      personality: '克制',
      goal: '查清母亲遗书',
      lifecycle: '已上线',
      profile: {
        ...emptyCharacterProfile(),
        knowledge: {
          ...emptyCharacterProfile().knowledge,
          knows: ['母亲有一封遗书'],
          blindSpots: ['顾长风已经看过遗书'],
        },
      },
    },
    {
      id: 'c2',
      name: '顾长风',
      role: '配角',
      identity: '师父',
      personality: '沉稳',
      goal: '隐瞒真相',
      lifecycle: '已上线',
    },
  ]
  detail.factions = [
    {
      id: 'f1',
      name: '太虚剑宗',
      type: '宗门',
      leader: '顾长风',
      goal: '守山',
      description: '守着一封旧信',
    },
  ]
  detail.foreshadowings = [
    {
      id: 'fs1',
      title: '母亲遗书的真相',
      status: '未回收',
      plantedIn: '第1章',
      payoffChapterId: 'ch-300',
      importance: '主线',
      note: '',
    },
  ]
  return detail
}

function sseResponse(content: string): Response {
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {} }] })}\n\ndata: [DONE]\n\n`
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function installMockFetch(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.includes('/llm-api/chat/completions')) {
      return new Response('', { status: 404 })
    }
    const raw = String(init?.body ?? '')
    const isSync = raw.includes('设定同步器')
    if (isSync) {
      return sseResponse(
        JSON.stringify({
          summary: '合成测试：继续调查遗书。',
          events: [],
          openThreads: [],
          resolvedThreads: [],
          newEntities: [],
          characterIssues: [],
          factionIssues: [],
          characterExperiences: [],
          changes: [],
        }),
      )
    }
    return sseResponse('陆照雪在旧书店里继续调查那封遗书。她仍然只怀疑，不知道真相。')
  }) as typeof fetch
}

function installRealFetch(): void {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('/llm-api/chat/completions')) {
      const target = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`
      const headers = new Headers(init?.headers)
      headers.set('authorization', `Bearer ${config.apiKey}`)
      headers.delete('x-llm-base-url')
      return original(target, { ...init, headers })
    }
    return original(input, init)
  }) as typeof fetch
}

describe.skipIf(
  !config.mock && (!config.baseUrl || !config.apiKey || !config.model),
)('real model long-run benchmark (manual)', () => {
  it(`writes toward ${config.targetChars} chars across up to ${config.chapters} chapters`, async () => {
    if (config.mock) installMockFetch()
    else installRealFetch()
    const work = makeWork()
    let detail = makeDetail()
    const chapters: Chapter[] = []
    const report = {
      mode: config.mock ? 'mock' : 'real',
      model: config.model,
      targetChars: config.targetChars,
      chapters: [] as {
        number: number
        chars: number
        auditIssues: number
        highIssues: number
        syncParsed: boolean
        syncChanges: number
        syncRetries: number
        experiences: number
        generationRetries: number
      }[],
      generationRetries: 0,
      emptyGenerations: 0,
      syncParseFailures: 0,
      syncRetries: 0,
      generatedChars: 0,
      startedAt: new Date().toISOString(),
      finishedAt: '',
    }
    const api = {
      provider: 'custom',
      baseUrl: config.baseUrl || 'http://mock',
      apiKey: config.apiKey || 'mock',
      model: config.model || 'mock',
      reasoningEffort: 'auto' as const,
    }
    for (let number = 1; number <= config.chapters; number += 1) {
      if (report.generatedChars >= config.targetChars) break
      const chapter: Chapter = {
        id: `ch-${number}`,
        title: `第${number}章 旧案`,
        content: '',
        summary: '',
        status: 'writing',
        wordCount: 0,
        updatedAt: Date.now(),
      }
      chapters.push(chapter)
      const messages = buildGenerationMessages({
        work,
        detail,
        chapters,
        chapter,
        baseContent: '',
        directive: '继续调查母亲遗书，保持悬疑推进，不要提前揭晓真相。',
        prompts: [],
        reasoningEffort: 'auto',
      })
      const text = await streamChat(api, messages, {
        temperature: 0.8,
        maxTokens: 4000,
      })
      let content = text.trim()
      let generationRetries = 0
      while (content.length < 300 && generationRetries < 2) {
        generationRetries += 1
        report.generationRetries += 1
        const retry = await streamChat(api, messages, {
          temperature: 0.75,
          maxTokens: 4000,
        })
        if (retry.trim().length > content.length) content = retry.trim()
      }
      if (content.length < 300) {
        report.emptyGenerations += 1
        content = '陆照雪继续调查遗书。'
      }
      chapter.content = content
      chapter.summary = content.slice(0, 80)
      chapter.wordCount = content.replace(/\s/g, '').length
      chapter.status = 'done'
      report.generatedChars += chapter.wordCount ?? 0

      const syncMessages = buildStateUpdateMessages({
        work,
        detail,
        chapter,
        chapters,
        content,
        reasoningEffort: 'auto',
      })
      const compactSyncMessages = buildCompactStateUpdateMessages({
        work,
        detail,
        chapter,
        chapters,
        content,
        reasoningEffort: 'auto',
      })
      const syncResult = await requestSync(syncMessages, compactSyncMessages)
      const syncText = syncResult.result
      const parsed = syncResult.parsed
      report.syncRetries += syncResult.retries
      let syncChanges = 0
      let experiences = 0
      if (!parsed) report.syncParseFailures += 1
      if (!parsed) console.log(`SYNC_PARSE_FAIL chapter=${number} RAW=${syncText.slice(0, 1200)}`)
      if (parsed) {
        const applied = applyStoryStateUpdate(detail, parsed, chapter.id, chapter.title)
        detail = applied.detail
        syncChanges = applied.event.changes.length
        experiences = applied.experiences.length
      }
      const memory = buildStoryMemory(detail, chapters)
      const audit = auditGeneratedText({
        text: content,
        baseContent: '',
        detail,
        chapters,
        chapterId: chapter.id,
        memory,
      })
      report.chapters.push({
        number,
        chars: chapter.wordCount ?? 0,
        auditIssues: audit.length,
        highIssues: audit.filter((issue) => issue.severity === 'high').length,
        syncParsed: Boolean(parsed),
        syncChanges,
        syncRetries: syncResult.retries,
        experiences,
        generationRetries,
      })
      if (number % 10 === 0) {
        writeFileSync(config.reportPath, JSON.stringify(report, null, 2))
        console.log(
          `LONGRUN chapter=${number} chars=${report.generatedChars} issues=${audit.length}`,
        )
      }
    }
    report.finishedAt = new Date().toISOString()
    writeFileSync(config.reportPath, JSON.stringify(report, null, 2))
    expect(report.chapters.length).toBeGreaterThan(0)
    expect(report.generatedChars).toBeGreaterThan(0)
  }, 24 * 60 * 60 * 1000)
})
