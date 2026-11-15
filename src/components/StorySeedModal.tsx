import { useEffect, useRef, useState } from 'react'
import type { AiUsageEntry, ApiConfig } from '../types'
import type { ChatUsage } from '../ai'
import { runApiTask } from '../aiTask'
import { estimateTokens } from '../utils'
import { buildStorySeedMessages, parseStorySeed, type StorySeedDraft, type StorySeedRequest } from '../storySeed'
import { IconArrowRight, IconSparkles } from './Icons'
import { Modal } from './Modal'

interface StorySeedModalProps {
  request: StorySeedRequest
  styleLabel: string
  api: ApiConfig
  apiReady: boolean
  onRecordUsage?: (entry: AiUsageEntry) => void
  onClose: () => void
  onConfirm: (seed: StorySeedDraft | null) => void
}

export function StorySeedModal({
  request,
  styleLabel,
  api,
  apiReady,
  onRecordUsage,
  onClose,
  onConfirm,
}: StorySeedModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<StorySeedDraft | null>(null)
  const startedRef = useRef(false)

  const generate = async () => {
    if (!apiReady || loading) {
      if (!apiReady) setError('先在设置里配置 AI 模型和 API Key，才能生成故事草案。也可以直接进入作品设置。')
      return
    }
    setLoading(true)
    setError('')
    try {
      let actualUsage: ChatUsage | undefined
      const messages = buildStorySeedMessages(request, styleLabel)
      const result = await runApiTask(api, { task: 'analysis.plan', messages,
        temperature: 0.8,
        maxTokens: 3800,
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      const parsed = parseStorySeed(result)
      if (!parsed) throw new Error('模型没有返回完整的故事草案，请重试或直接进入作品设置。')
      setDraft(parsed)
      if (onRecordUsage) {
        const inputText = messages.map((message) => message.content).join('\n')
        onRecordUsage({
          id: `usage-seed-${Date.now().toString(36)}`,
          at: Date.now(),
          kind: '项目生成',
          profile: 'general',
          model: api.model,
          inputTokens: actualUsage?.inputTokens ?? estimateTokens(inputText),
          outputTokens: actualUsage?.outputTokens ?? estimateTokens(result),
          actual: Boolean(actualUsage),
          note: '故事种子预览',
        })
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '故事草案生成失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    if (apiReady) void generate()
    // 只在首次打开时自动生成一次；重试由按钮触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Modal
      title="故事草案"
      subtitle="先看 AI 理解成了什么，再决定要不要继续设置作品"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          {draft ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void generate()}
              disabled={loading}
            >
              {loading ? '生成中…' : '重新生成'}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onConfirm(draft)}
            disabled={loading}
          >
            {draft ? '用这个草案继续' : '直接进入作品设置'}
            <IconArrowRight size={14} />
          </button>
        </>
      }
    >
      <div className="story-seed-view">
        <div className="story-seed-input-summary">
          <span>你的起戏句</span>
          <p>{request.premise}</p>
          <small>
            {request.genres.join(' / ') || '题材未定'} · 目标 {request.targetWords.toLocaleString()} 字
            {styleLabel ? ` · ${styleLabel}` : ''}
          </small>
        </div>

        {loading ? (
          <div className="story-seed-loading">
            <span className="status-dot" />
            <span>正在把这句话展开成故事草案…</span>
          </div>
        ) : null}

        {error ? <p className="field-error">{error}</p> : null}

        {draft ? (
          <article className="story-seed-draft">
            <header>
              <div>
                <span className="story-seed-kicker">建议书名</span>
                <h2>{draft.title || '未命名故事'}</h2>
              </div>
              <span className="story-seed-badge">
                <IconSparkles size={13} /> 草案
              </span>
            </header>

            <p className="story-seed-synopsis">{draft.synopsis}</p>
            {draft.theme ? (
              <p className="story-seed-theme">
                <strong>主题</strong>
                {draft.theme}
              </p>
            ) : null}

            {draft.opening ? (
              <section>
                <h3>开场画面</h3>
                <p>{draft.opening}</p>
              </section>
            ) : null}

            {draft.hooks.length > 0 ? (
              <section>
                <h3>前三章钩子</h3>
                <ol>
                  {draft.hooks.map((hook, index) => (
                    <li key={`${hook}-${index}`}>{hook}</li>
                  ))}
                </ol>
              </section>
            ) : null}

            <section className="story-seed-cast">
              <h3>人物与势力</h3>
              <div className="story-seed-cast-grid">
                <div>
                  <span>人物</span>
                  <p>
                    {draft.setup.characters.length
                      ? draft.setup.characters
                          .map((character) => `${character.name}（${character.role}）`)
                          .join('、')
                      : '待补充'}
                  </p>
                </div>
                <div>
                  <span>势力</span>
                  <p>
                    {draft.setup.factions.length
                      ? draft.setup.factions.map((faction) => faction.name).join('、')
                      : '待补充'}
                  </p>
                </div>
              </div>
            </section>

            {draft.styleHint ? (
              <p className="story-seed-style-hint">
                <strong>建议文风</strong>
                {draft.styleHint}
              </p>
            ) : null}
          </article>
        ) : !loading ? (
          <div className="story-seed-fallback">
            <p>
              还没有生成草案。可以继续让 AI 生成，也可以直接用这句话进入作品设置，之后再补书名、主题和人物。
            </p>
            {apiReady ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void generate()}>
                重试生成
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
