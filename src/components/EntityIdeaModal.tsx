import { useState } from 'react'
import type { AiUsageEntry, ApiConfig, Work, WorkDetail } from '../types'
import type { EntityFillKind } from '../ai'
import type { ChatUsage } from '../ai'
import { runApiTask } from '../aiTask'
import { estimateTokens } from '../utils'
import {
  ENTITY_IDEA_EXAMPLES,
  ENTITY_KIND_LABELS,
  buildEntityIdeaAnalysisMessages,
  buildEntityIdeaHint,
  parseEntityIdeaAnalysis,
  type EntityIdeaAnalysis,
} from '../entityIdea'
import { Modal } from './Modal'
import { IconChevronRight, IconSparkles } from './Icons'

interface EntityIdeaModalProps {
  kind: EntityFillKind
  work: Work
  detail: WorkDetail
  api: ApiConfig
  apiReady: boolean
  baseHint?: string
  onRecordUsage?: (entry: AiUsageEntry) => void
  onGenerate: (hint: string) => Promise<boolean>
  onToast: (message: string) => void
  onClose: () => void
}

export function EntityIdeaModal({
  kind,
  work,
  detail,
  api,
  apiReady,
  baseHint,
  onRecordUsage,
  onGenerate,
  onToast,
  onClose,
}: EntityIdeaModalProps) {
  const label = ENTITY_KIND_LABELS[kind]
  const [idea, setIdea] = useState('')
  const [analysis, setAnalysis] = useState<EntityIdeaAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const busy = analyzing || generating

  const analyze = async () => {
    if (!idea.trim() || !apiReady || busy) return
    setAnalyzing(true)
    setError('')
    try {
      const messages = buildEntityIdeaAnalysisMessages({ kind, work, detail, idea })
      let usage: ChatUsage | undefined
      let response = await runApiTask(api, { task: 'analysis.plan', messages,
        temperature: 0.35,
        maxTokens: 1800,
        onUsage: (next) => {
          usage = next
        },
      })
      let parsed = parseEntityIdeaAnalysis(response)
      if (!parsed) {
        // 兼容不支持 JSON 模式的模型：再要求一次只输出 JSON。
        response = await runApiTask(api, {
          task: 'analysis.plan',
          messages: [
            ...messages,
            {
              role: 'user',
              content:
                '上次输出无法解析。请只输出一个合法 JSON 对象，字段为 understanding、mustKeep、avoid、direction；不要 Markdown、不要解释。',
            },
          ],
          temperature: 0.15,
          maxTokens: 2200,
          onUsage: (next) => {
            usage = next
          },
        })
        parsed = parseEntityIdeaAnalysis(response)
      }
      if (!parsed) throw new Error('AI 没有返回可解析的想法分析，请重试')
      if (!response.trim()) throw new Error('AI 没有返回内容，请检查模型和 API 配置')
      setAnalysis(parsed)
      onRecordUsage?.({
        id: `entity-idea-${Date.now().toString(36)}`,
        at: Date.now(),
        kind: '实体想法分析',
        model: api.model,
        inputTokens:
          usage?.inputTokens ?? estimateTokens(messages.map((message) => message.content).join('\n')),
        outputTokens: usage?.outputTokens ?? estimateTokens(response),
        note: `${label}想法：${idea.trim().slice(0, 40)}`,
        actual: Boolean(usage),
        workId: work.id,
      })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '想法分析失败'
      setError(message)
      onToast(`想法分析失败：${message}`)
    } finally {
      setAnalyzing(false)
    }
  }

  const generate = async () => {
    if (!analysis || busy) return
    setGenerating(true)
    setError('')
    try {
      const hint = buildEntityIdeaHint({
        idea,
        analysis,
        extra: baseHint,
      })
      const ok = await onGenerate(hint)
      if (!ok) {
        setError('生成失败，请重试或修改想法')
        return
      }
      onToast(`已按你的想法生成${label}`)
      onClose()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '生成失败'
      setError(message)
      onToast(`生成失败：${message}`)
    } finally {
      setGenerating(false)
    }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
        取消
      </button>
      {analysis ? (
        <>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => setAnalysis(null)}
          >
            修改想法
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy || !apiReady}
            onClick={() => void analyze()}
          >
            重新分析
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !apiReady}
            onClick={() => void generate()}
          >
            {generating ? '生成中…' : '按这个方向生成'}
            {!generating ? <IconChevronRight size={14} /> : null}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!idea.trim() || analyzing || !apiReady}
          onClick={() => void analyze()}
        >
          <IconSparkles size={14} />
          {analyzing ? '分析中…' : '分析想法'}
        </button>
      )}
    </>
  )

  return (
    <Modal
      title={`生成${label} · 先说说你的想法`}
      subtitle="AI 会先理解你的意图，再按当前作品设定生成，不再随机发挥"
      size="lg"
      onClose={onClose}
      footer={footer}
    >
      <div className="entity-idea-modal">
        {!apiReady ? (
          <div className="entity-idea-warning">请先在设置中配置通用 AI 模型，才能分析想法。</div>
        ) : null}

        <label className="entity-idea-field">
          <span>你想要的{label}是什么样的？</span>
          <textarea
            className="input drawer-textarea entity-idea-input"
            rows={4}
            value={idea}
            autoFocus
            placeholder={`例如：${ENTITY_IDEA_EXAMPLES[kind][0]}。可以写身份、气质、关系、秘密、想要制造的剧情效果。`}
            onChange={(event) => {
              setIdea(event.target.value)
              if (analysis) setAnalysis(null)
              setError('')
            }}
          />
        </label>

        <div className="entity-idea-examples">
          <span>可以这样开头</span>
          <div>
            {ENTITY_IDEA_EXAMPLES[kind].map((example) => (
              <button
                type="button"
                key={example}
                className="entity-idea-chip"
                onClick={() => {
                  setIdea(example)
                  setAnalysis(null)
                  setError('')
                }}
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="entity-idea-error" role="alert">
            {error}
          </div>
        ) : null}

        {analysis ? (
          <div className="entity-idea-analysis">
            <div className="entity-idea-analysis-head">
              <span>AI 这样理解你的想法</span>
              <small>确认后再生成</small>
            </div>
            <p className="entity-idea-understanding">{analysis.understanding}</p>
            {analysis.mustKeep.length > 0 ? (
              <div className="entity-idea-points">
                <span>必须保留</span>
                <ul>
                  {analysis.mustKeep.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {analysis.avoid.length > 0 ? (
              <div className="entity-idea-points avoid">
                <span>避免写偏</span>
                <ul>
                  {analysis.avoid.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {analysis.direction ? (
              <div className="entity-idea-direction">
                <span>设定落点</span>
                <p>{analysis.direction}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="entity-idea-hint">
            生成不会直接覆盖现有设定；先分析想法，再按确认的方向生成一个{label}。
          </p>
        )}

        {busy ? (
          <div className="entity-idea-progress">
            <span />
            {analyzing ? '正在理解你的想法…' : `正在生成${label}…`}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
