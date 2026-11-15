import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearModelListCache, fetchModels } from './ai'
import type { ApiConfig } from './types'

const api: ApiConfig = {
  provider: 'custom',
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
  reasoningEffort: 'auto',
}

afterEach(() => {
  clearModelListCache()
  vi.unstubAllGlobals()
})

describe('provider model discovery', () => {
  it('loads the live model list from the provider', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: [{ id: 'live-a' }, { id: 'live-b' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const models = await fetchModels(api)
    expect(models).toEqual(['live-a', 'live-b'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('/llm-api/models')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>)['x-llm-base-url']).toBe(api.baseUrl)
  })

  it('does not invent model names without an API key', async () => {
    await expect(fetchModels({ ...api, apiKey: '' })).rejects.toThrow('API Key')
  })
})
