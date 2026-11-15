import { useState } from 'react'
import type { AiUsageEntry, ApiConfig, Chapter, LocationTerrainShape, Work, WorkDetail } from '../types'
import { type ChatUsage } from '../ai'
import { runApiTask } from '../aiTask'
import { estimateTokens } from '../utils'
import { buildTerrainAiMessages, parseTerrainAiResult, type TerrainAiResult } from '../terrainAi'
import { Modal } from './Modal'
import { IconSparkles } from './Icons'

interface TerrainAiModalProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  activeChapterId: string
  api: ApiConfig
  apiReady: boolean
  onRecordUsage?: (entry: AiUsageEntry) => void
  onApply: (shapes: LocationTerrainShape[], summary: string) => void
  onToast: (message: string) => void
  onClose: () => void
}

const KIND_LABEL: Record<LocationTerrainShape['kind'], string> = {
  mountain: '山脉',
  forest: '森林',
  water: '水域',
  road: '道路',
  river: '河流',
  ravine: '沟壑',
  custom: '自定义区域',
  brush: '地形笔刷',
  label: '地名标注',
}

export function TerrainAiModal({
  work,
  detail,
  chapters,
  activeChapterId,
  api,
  apiReady,
  onRecordUsage,
  onApply,
  onToast,
  onClose,
}: TerrainAiModalProps) {
  const [request, setRequest] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<TerrainAiResult | null>(null)

  const generate = async () => {
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return
    }
    setGenerating(true)
    setError('')
    setResult(null)
    try {
      const messages = buildTerrainAiMessages({
        work,
        detail,
        chapters,
        activeChapterId,
        request,
      })
      let actualUsage: ChatUsage | undefined
      const text = await runApiTask(api, { task: 'analysis.plan', messages,
        temperature: 0.5,
        maxTokens: 1800,
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      const parsed = parseTerrainAiResult(text)
      if (!parsed) throw new Error('模型没有返回可解析的地图布局')
      setResult(parsed)
      onRecordUsage?.({
        id: `usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        at: Date.now(),
        kind: '地形生成',
        model: api.model,
        inputTokens: actualUsage?.inputTokens ?? estimateTokens(messages.map((message) => message.content).join('\n')),
        outputTokens: actualUsage?.outputTokens ?? estimateTokens(text),
        actual: Boolean(actualUsage),
        note: parsed.summary,
        workId: work.id,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '地形生成失败')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal
      title="AI 生成地形"
      subtitle="根据正文、地点列表和你的要求生成地图布局；应用前可以预览"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void generate()}
            disabled={generating || !apiReady}
          >
            {generating ? '生成中…' : result ? '重新生成' : '生成地形'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!result || result.shapes.length === 0}
            onClick={() => {
              if (!result) return
              onApply(result.shapes, result.summary)
              onClose()
            }}
          >
            应用地形
          </button>
        </>
      }
    >
      <div className="terrain-ai-modal">
        <label className="record-field">
          <span>你想让地图突出什么？</span>
          <textarea
            className="input drawer-textarea"
            rows={3}
            value={request}
            placeholder="例如：北境雪山夹着一条河谷，官道穿过山谷，森林在西侧，河流从北向南流入海。"
            onChange={(event) => setRequest(event.target.value)}
          />
        </label>
        <p className="drawer-hint">
          会参考作品简介、世界观、地点列表和当前章节。只生成地形建议，不自动修改正文和地点。
        </p>
        {!apiReady ? (
          <p className="warn-line">还没有配置 AI 模型，无法生成地形。</p>
        ) : null}
        {error ? <p className="field-error">{error}</p> : null}
        {result ? (
          <div className="terrain-ai-preview">
            <div className="terrain-ai-preview-head">
              <IconSparkles size={14} />
              <strong>地形预览</strong>
              <span>{result.shapes.length} 个形状</span>
            </div>
            <p>{result.summary}</p>
            <div className="terrain-ai-shape-list">
              {result.shapes.map((shape) => (
                <span key={shape.id}>
                  {KIND_LABEL[shape.kind]}
                  {shape.label ? ` · ${shape.label}` : ''}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
