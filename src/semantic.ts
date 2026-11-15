import type { ApiConfig } from './types'

export interface EmbeddingResult {
  vectors: number[][]
  model: string
}

export function hasEmbeddingModel(api: ApiConfig): boolean {
  return Boolean(api.embeddingModel?.trim())
}

export async function requestEmbeddings(
  api: ApiConfig,
  texts: string[],
): Promise<EmbeddingResult | null> {
  const model = api.embeddingModel?.trim()
  const baseUrl = api.baseUrl.trim()
  const apiKey = api.apiKey.trim()
  if (!model || !baseUrl || !apiKey || texts.length === 0) return null
  const response = await fetch('/llm-api/embeddings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-llm-base-url': baseUrl,
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  })
  if (!response.ok) {
    throw new Error(`Embedding 请求失败：HTTP ${response.status}`)
  }
  const payload = (await response.json()) as {
    data?: { embedding?: number[]; index?: number }[]
  }
  const rows = payload.data ?? []
  if (rows.length === 0) throw new Error('Embedding 服务没有返回向量')
  const vectors = rows
    .slice()
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((row) => (Array.isArray(row.embedding) ? row.embedding : []))
  if (vectors.some((vector) => vector.length === 0)) {
    throw new Error('Embedding 向量为空')
  }
  return { vectors, model }
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] * left[index]
    rightNorm += right[index] * right[index]
  }
  if (leftNorm === 0 || rightNorm === 0) return 0
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}
