import { useMemo, useState } from 'react'
import type { AiUsageEntry, ApiConfig, Work, WorkStyle } from '../types'
import type { ImportedNovel } from '../novelImport'
import type { ChatUsage } from '../ai'
import { runApiTask } from '../aiTask'
import {
  buildStyleAnalysisMessages,
  createEmptyStyle,
  formatStyleCard,
  normalizeStyle,
  parseStyleAnalysis,
  STYLE_STRENGTH_OPTIONS,
} from '../styleProfile'
import {
  buildImportStyleSamples,
  joinImportStyleSamples,
  type ImportStyleSample,
} from '../importStyle'
import { estimateTokens } from '../utils'
import { Modal } from './Modal'

interface ImportStyleModalProps {
  work: Work
  novel: ImportedNovel
  api: ApiConfig
  apiReady: boolean
  onRecordUsage?: (entry: AiUsageEntry) => void
  onOpenSettings: () => void
  onToast: (message: string) => void
  onApply: (style: WorkStyle, createPrompt: boolean) => void
  onClose: () => void
}

function briefAnalysis(_style: WorkStyle): string {
  return '从导入样文提取；建议在风格页人工复核。'
}

export function ImportStyleModal({
  work,
  novel,
  api,
  apiReady,
  onRecordUsage,
  onOpenSettings,
  onToast,
  onApply,
  onClose,
}: ImportStyleModalProps) {
  const initialSamples = useMemo(() => buildImportStyleSamples(novel), [novel])
  const [samples, setSamples] = useState<ImportStyleSample[]>(initialSamples)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<WorkStyle | null>(null)
  const [error, setError] = useState('')
  const [createPrompt, setCreatePrompt] = useState(true)
  const sampleText = joinImportStyleSamples(samples)
  const estimatedInput = estimateTokens(sampleText)

  const updateSample = (id: string, text: string) => {
    setSamples((prev) => prev.map((sample) => (sample.id === id ? { ...sample, text } : sample)))
    setResult(null)
    setError('')
  }

  const analyze = async () => {
    if (!apiReady) {
      onToast('请先配置通用 AI 模型')
      onOpenSettings()
      return
    }
    if (!sampleText.trim()) {
      onToast('至少保留一段样文')
      return
    }
    setAnalyzing(true)
    setError('')
    try {
      let actualUsage: ChatUsage | undefined
      const response = await runApiTask(api, {
        task: 'analysis.plan',
        messages: buildStyleAnalysisMessages({
          workTitle: work.title,
          genres: work.genres,
          sample: sampleText,
        }),
        temperature: 0.2,
        maxTokens: 900,
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      const parsed = parseStyleAnalysis(response)
      if (!parsed) throw new Error('模型没有返回可解析的风格 JSON，可以重试')
      const normalized = normalizeStyle({ ...createEmptyStyle(), ...parsed } as WorkStyle)
      const next = {
        ...normalized,
        sampleText: sampleText.slice(0, 1200),
        sampleSource: 'chapters' as const,
        sampleAnalysis: briefAnalysis(normalized),
      }
      setResult(next)
      onRecordUsage?.({
        id: `import-style-${Date.now().toString(36)}`,
        at: Date.now(),
        kind: '风格分析',
        model: api.model,
        inputTokens: actualUsage?.inputTokens ?? estimatedInput,
        outputTokens: actualUsage?.outputTokens ?? estimateTokens(response),
        note: `导入作品：${novel.title}`,
        actual: Boolean(actualUsage),
        workId: work.id,
      })
      onToast('风格分析完成，确认后应用到作品')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '风格分析失败'
      setError(message)
      onToast(message)
    } finally {
      setAnalyzing(false)
    }
  }

  const footer = result ? (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
        跳过
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>
        重新分析
      </button>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => onApply(result, createPrompt)}
      >
        应用风格
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
        跳过
      </button>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={analyzing || !apiReady}
        onClick={() => void analyze()}
      >
        {analyzing ? '分析中…' : '分析文风'}
      </button>
    </>
  )

  return (
    <Modal
      title="导入完成：提取写作风格"
      subtitle={`《${work.title}》· ${novel.chapters.length} 章 · 本地导入，分析前不调用 AI`}
      size="lg"
      onClose={onClose}
      footer={footer}
    >
      <div className="import-style-modal">
        <div className="import-style-intro">
          <p>
            从导入的正文里抽取开头、中段、结尾三段样文，提取文风、叙事距离、句式、描写焦点和禁忌。分析结果只作为本作的风格卡，不复制原文。
          </p>
          <span>约 {estimatedInput.toLocaleString()} input tokens · 预计输出 ≤900 tokens</span>
        </div>

        {!apiReady ? (
          <div className="import-style-warning">
            还没有配置通用 AI 模型。
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenSettings}>
              去设置
            </button>
          </div>
        ) : null}

        <div className="import-style-samples">
          {samples.map((sample) => (
            <label className="import-style-sample" key={sample.id}>
              <span>
                {sample.label}
                <small>{sample.chapterTitle}</small>
              </span>
              <textarea
                className="input drawer-textarea"
                rows={4}
                value={sample.text}
                onChange={(event) => updateSample(sample.id, event.target.value)}
              />
            </label>
          ))}
        </div>

        {error ? <p className="import-style-error">{error}</p> : null}

        {result ? (
          <div className="import-style-result">
            <div className="import-style-result-head">
              <strong>分析结果</strong>
              <small>确认后才会写入作品风格</small>
            </div>
            <div className="import-style-tags">
              {result.tone.map((tone) => (
                <span key={tone}>{tone}</span>
              ))}
              {result.strength ? (
                <span>
                  强度：
                  {STYLE_STRENGTH_OPTIONS.find((option) => option.value === result.strength)?.label ??
                    result.strength}
                </span>
              ) : null}
            </div>
            <pre className="style-preview">{formatStyleCard(result)}</pre>
            <label className="import-style-save-prompt">
              <input
                type="checkbox"
                checked={createPrompt}
                onChange={(event) => setCreatePrompt(event.target.checked)}
              />
              <span>
                同时保存为「{work.title} · 导入文风」提示词
                <small>可在提示词库中继续编辑，不自动启用。</small>
              </span>
            </label>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
