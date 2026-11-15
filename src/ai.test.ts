import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildCompactStateUpdateMessages,
  parseEntityFill,
  parseProjectSetup,
  parseTitleSuggestions,
  setAiBudgetGuard,
  streamChat,
} from './ai'
import { createEmptyDetail, SEED_WORKS } from './data'
import type { ApiConfig, Chapter } from './types'

const api: ApiConfig = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'test-key',
  model: 'deepseek-flash',
}

describe('compact state update prompt', () => {
  it('asks for a short closed JSON and includes focused entities', () => {
    const detail = createEmptyDetail()
    detail.characters = [
      {
        id: 'c1',
        name: '陆照雪',
        role: '主角',
        identity: '调查者',
        personality: '克制',
        goal: '查清遗书',
      },
    ]
    const chapter = {
      id: 'ch-1',
      title: '第1章',
      content: '陆照雪走进旧书店。',
      updatedAt: 0,
    } as Chapter
    const messages = buildCompactStateUpdateMessages({
      work: SEED_WORKS[0],
      detail,
      chapter,
      chapters: [chapter],
      content: chapter.content,
    })
    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('紧凑 JSON')
    expect(text).toContain('events 最多 3 条')
    expect(text).toContain('陆照雪')
    expect(text).toContain('本章正文')
  })
})

describe('title suggestions', () => {  it('parses a JSON title array', () => {
    expect(parseTitleSuggestions('["旧案重开","剑匣夜鸣","雪落问剑峰"]')).toEqual([
      '旧案重开',
      '剑匣夜鸣',
      '雪落问剑峰',
    ])
  })

  it('parses fallback line titles', () => {
    expect(parseTitleSuggestions('1. 旧案重开\n- 剑匣夜鸣\n雪落问剑峰')).toEqual([
      '旧案重开',
      '剑匣夜鸣',
      '雪落问剑峰',
    ])
  })
})

describe('entity JSON parsing', () => {
  it('repairs fenced JSON and trailing commas', () => {
    expect(
      parseEntityFill('说明文字\n```json\n{"name":"青云宗","type":"宗门",}\n```\n'),
    ).toEqual({ name: '青云宗', type: '宗门' })
    expect(parseEntityFill('没有对象')).toBeNull()
  })
})

describe('project setup', () => {  it('parses title, synopsis, factions and characters', () => {
    const setup = parseProjectSetup(
      JSON.stringify({
        title: '照雪问剑',
        synopsis: '外门弟子追查旧案。',
        theme: '旧案与选择',
        factions: [
          { name: '太玄剑宗', type: '宗门', leader: '顾长风', description: '太玄山剑宗。' },
        ],
        characters: [
          { name: '陆青崖', role: '主角', identity: '外门弟子', sectName: '太玄剑宗', personality: '倔强', goal: '追查旧案' },
          { name: '沈照雪', role: '配角', identity: '照雪峰弟子', sectName: '太玄剑宗', personality: '冷静', goal: '等一个答案' },
        ],
        relationships: [
          { fromName: '陆青崖', toName: '沈照雪', type: '同门', note: '共同查案' },
        ],
      }),
    )
    expect(setup).not.toBeNull()
    expect(setup?.title).toBe('照雪问剑')
    expect(setup?.factions).toHaveLength(1)
    expect(setup?.characters).toHaveLength(2)
    expect(setup?.relationships).toHaveLength(1)
  })

  it('rejects empty setup', () => {
    expect(parseProjectSetup('{}')).toBeNull()
  })
})

describe('streamChat usage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks the proxy for an SSE stream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await streamChat(api, [{ role: 'user', content: '测试' }])
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).accept).toBe('text/event-stream')
  })

  it('reads real usage from the final SSE chunk', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"，世界"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":12,"completion_tokens":7,"total_tokens":19},"choices":[]}\n\n',
      'data: [DONE]\n\n',
    ]
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    )
    let usage: { inputTokens: number; outputTokens: number } | null = null
    const text = await streamChat(api, [{ role: 'user', content: '写一句' }], {
      onUsage: (value) => {
        usage = value
      },
    })
    expect(text).toBe('你好，世界')
    expect(usage).toMatchObject({ inputTokens: 12, outputTokens: 7 })
  })

  it('reports finish reason from the stream', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"半句"}}]}\n\n' +
              'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n' +
              'data: [DONE]\n\n',
          ),
        )
        controller.close()
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    )
    let finishReason = ''
    const text = await streamChat(api, [{ role: 'user', content: '测试' }], {
      onFinishReason: (reason) => {
        finishReason = reason
      },
    })
    expect(text).toBe('半句')
    expect(finishReason).toBe('length')
  })

  it('falls back to non-streaming when a JSON response is empty', async () => {
    const empty = new Response(
      JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
    const complete = new Response(
      JSON.stringify({ choices: [{ message: { content: '恢复后的正文' } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(empty).mockResolvedValueOnce(complete),
    )
    const text = await streamChat(api, [{ role: 'user', content: '测试' }], {
      maxTokens: 1800,
    })
    expect(text).toBe('恢复后的正文')
  })

  it('retries empty non-streaming output with a larger token budget', async () => {
    const emptyResponse = () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    const complete = new Response(
      JSON.stringify({ choices: [{ message: { content: '更大的预算正文' } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(emptyResponse())
      .mockResolvedValueOnce(emptyResponse())
      .mockResolvedValueOnce(complete)
    vi.stubGlobal('fetch', fetchMock)
    const text = await streamChat(api, [{ role: 'user', content: '测试' }], {
      maxTokens: 1800,
    })
    expect(text).toBe('更大的预算正文')
    const thirdBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body ?? '{}'))
    expect(thirdBody.max_tokens).toBe(6000)
  })

  it('falls back to non-streaming when the stream has no content', async () => {
    const emptyStream = new Response(
      'data: {"choices":[{"delta":{}}]}\n\ndata: [DONE]\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    )
    const complete = new Response(
      JSON.stringify({
        choices: [{ message: { content: '非流式兜底正文' } }],
        usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(emptyStream).mockResolvedValueOnce(complete),
    )
    let usage: { inputTokens: number; outputTokens: number } | null = null
    const text = await streamChat(api, [{ role: 'user', content: '测试' }], {
      onUsage: (value) => {
        usage = value
      },
    })
    expect(text).toBe('非流式兜底正文')
    expect(usage).toMatchObject({ inputTokens: 5, outputTokens: 6 })
  })

  it('reads usage from a non-streaming JSON fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '完整回答' } }],
            usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )
    let usage: { inputTokens: number; outputTokens: number } | null = null
    const text = await streamChat(api, [{ role: 'user', content: '测试' }], {
      onUsage: (value) => {
        usage = value
      },
    })
    expect(text).toBe('完整回答')
    expect(usage).toMatchObject({ inputTokens: 3, outputTokens: 4 })
  })

  it('blocks requests when the budget guard returns a message', async () => {
    setAiBudgetGuard(() => '本月 AI 预算已用完')
    await expect(
      streamChat(api, [{ role: 'user', content: '测试' }], { maxTokens: 200 }),
    ).rejects.toThrow('预算已用完')
    setAiBudgetGuard(null)
  })
})
