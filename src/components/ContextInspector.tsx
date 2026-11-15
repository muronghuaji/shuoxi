import { useMemo } from 'react'
import type { ApiConfig, Chapter, Prompt, ReasoningEffort, Work, WorkDetail } from '../types'
import { buildGenerationContext } from '../ai'
import { Modal } from './Modal'
import { NumberInput } from './NumberInput'

interface ContextInspectorProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  chapter: Chapter
  content: string
  directive: string
  prompts: Prompt[]
  reasoningEffort: ReasoningEffort
  api: ApiConfig
  onUpdateWork: (patch: Partial<Work>) => void
  onClose: () => void
}

const BUDGET_PRESETS = [8000, 12000, 16000, 24000, 32000, 64000, 128000]

export function ContextInspector({
  work,
  detail,
  chapters,
  chapter,
  content,
  directive,
  prompts,
  reasoningEffort,
  api,
  onUpdateWork,
  onClose,
}: ContextInspectorProps) {
  const requested = work.contextBudget
  const unlimited = requested === 0
  const data = useMemo(() => {
    const { report } = buildGenerationContext({
      work,
      detail,
      chapters,
      chapter,
      baseContent: content,
      directive: directive.trim() || '（还没有导演指令）',
      prompts,
      reasoningEffort,
      api,
      outputReserve: 8192,
    })
    const sections = report.sections
      .map((section) => ({
        title: section.title,
        layer: section.layer,
        tokens: section.tokens,
        preview: '',
      }))
      .sort((a, b) => b.tokens - a.tokens)
    return {
      report,
      sections,
      promptTokens: report.sections
        .filter((section) => section.title.includes('写作提示词'))
        .reduce((sum, section) => sum + section.tokens, 0),
    }
  }, [work, detail, chapters, chapter, content, directive, prompts, reasoningEffort, api])

  const budget = data.report.budget.limit
  const percent = Math.min(100, (data.report.totalTokens / budget) * 100)
  const inputCostPerMillion = api.inputPrice ?? 0
  const estimatedCost =
    inputCostPerMillion > 0
      ? (data.report.totalTokens / 1_000_000) * inputCostPerMillion
      : null

  return (
    <Modal
      title="上下文预算"
      subtitle="估算值，按中文约 1.15 字 / token；真实计费以服务商为准"
      onClose={onClose}
      size="lg"
      footer={
        <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
          关闭
        </button>
      }
    >
      <div className="context-inspector">
        <div className="context-budget-control">
          <span>上下文上限</span>
          {unlimited ? (
            <button
              type="button"
              className="context-unlimited-badge"
              onClick={() => onUpdateWork({ contextBudget: 24000 })}
              title="点击恢复数值上限"
            >
              不限制
            </button>
          ) : (
            <NumberInput
              className="input context-budget-input"
              min={4000}
              max={128000}
              step={1000}
              value={requested && requested > 0 ? requested : 24000}
              fallback={24000}
              onValueChange={(value) => onUpdateWork({ contextBudget: value })}
              aria-label="上下文 token 上限"
            />
          )}
          {unlimited ? null : <span className="context-budget-unit">tokens</span>}
          <div className="context-budget-presets">
            {BUDGET_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset}
                className={
                  requested === preset ||
                  (requested === undefined && preset === 24000)
                    ? 'active'
                    : ''
                }
                onClick={() => onUpdateWork({ contextBudget: preset })}
              >
                {preset / 1000}k
              </button>
            ))}
            <button
              type="button"
              className={unlimited ? 'active' : ''}
              onClick={() => onUpdateWork({ contextBudget: 0 })}
            >
              不限制
            </button>
          </div>
          <small>
            {unlimited
              ? '不限制 = 不设置人为上限，但仍按模型窗口扣掉输出预留，避免直接发出超出模型硬上限的请求。'
              : '可自定义 4,000–128,000；超出时优先丢弃章节结构、物品、地点等低优先级段落。'}
          </small>
        </div>

        <div className="context-model-window">
          <span>模型窗口 {data.report.budget.modelWindow.toLocaleString()}</span>
          <span>输出预留 {data.report.budget.outputReserve.toLocaleString()}</span>
          <span>本次有效输入 {budget.toLocaleString()}</span>
        </div>

        {data.report.warnings.length > 0 ? (
          <div className="context-warning-list">
            <strong>上下文提醒</strong>
            {data.report.warnings.map((warning, index) => (
              <p key={`${warning}-${index}`}>⚠ {warning}</p>
            ))}
          </div>
        ) : null}

        {data.report.budget.clamped ? (
          <p className="warn-line">
            你设置的上限超过模型窗口，已按 {budget.toLocaleString()} tokens 作为本次有效输入上限。
          </p>
        ) : null}

        {!unlimited && data.promptTokens > budget * 0.25 ? (
          <p className="warn-line">
            启用的写作提示词约占 {Math.round((data.promptTokens / budget) * 100)}%
            的上下文预算，可能挤掉人物和设定；建议精简提示词，或提高上限。
          </p>
        ) : null}

        <div className="context-meter">
          <div>
            <strong>{data.report.totalTokens.toLocaleString()}</strong>
            <span>估算 tokens</span>
          </div>
          <div>
            <span>
              有效输入 {budget.toLocaleString()}
              {estimatedCost !== null ? ` · 输入约 $${estimatedCost.toFixed(4)}` : ''}
            </span>
            <small>
              系统 {data.report.systemTokens.toLocaleString()} · 资料{' '}
              {data.report.userTokens.toLocaleString()}
            </small>
          </div>
          <div className="context-meter-track">
            <span style={{ width: `${percent}%` }} data-over={percent >= 100} />
          </div>
        </div>

        {data.report.totalTokens >= budget ? (
          <p className="warn-line">
            上下文已达到有效输入上限，低优先级段落会被裁剪；可提高上限或精简角色、模块和前文。
          </p>
        ) : null}

        {data.report.dropped.length > 0 ? (
          <details className="context-dropped">
            <summary>本次被裁剪 {data.report.dropped.length} 段</summary>
            {data.report.dropped.map((section, index) => (
              <div className="context-section-row" key={`${section.title}-${index}`}>
                <div>
                  <strong>{section.title}</strong>
                  <small>
                    {section.layer} · {section.reason}
                  </small>
                </div>
                <span>{section.tokens.toLocaleString()} tokens</span>
              </div>
            ))}
          </details>
        ) : null}

        <div className="context-section-list">
          {data.sections.map((section, index) => (
            <div className="context-section-row" key={`${section.title}-${section.tokens}-${index}`}>
              <div>
                <strong>{section.title || '未命名段落'}</strong>
                <small>{section.layer}</small>
              </div>
              <span>
                {section.tokens.toLocaleString()} tokens
                {inputCostPerMillion > 0
                  ? ` · $${((section.tokens / 1_000_000) * inputCostPerMillion).toFixed(4)}`
                  : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
