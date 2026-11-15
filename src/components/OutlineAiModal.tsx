import { useState } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  Chapter,
  GlobalOutline,
  OutlineCard,
  Work,
  WorkDetail,
} from '../types'
import { type ChatUsage } from '../ai'
import { runApiTask } from '../aiTask'
import { estimateTokens } from '../utils'
import {
  buildOutlineGenerateMessages,
  generatedOutlineToCards,
  parseGeneratedOutline,
  type GeneratedOutline,
} from '../outlineAi'
import { Modal } from './Modal'
import { IconSparkles } from './Icons'
import { NumberInput } from './NumberInput'

interface OutlineAiModalProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  api: ApiConfig
  apiReady: boolean
  onRecordUsage?: (entry: AiUsageEntry) => void
  onApply: (globalOutline: GlobalOutline, cards: OutlineCard[], replace: boolean) => void
  onToast: (message: string) => void
  onClose: () => void
}

export function OutlineAiModal({
  work,
  detail,
  chapters,
  api,
  apiReady,
  onRecordUsage,
  onApply,
  onToast,
  onClose,
}: OutlineAiModalProps) {
  const [requirement, setRequirement] = useState('')
  const [chapterCount, setChapterCount] = useState(12)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState<GeneratedOutline | null>(null)
  const [replace, setReplace] = useState(false)

  const generate = async () => {
    if (!apiReady) {
      onToast('请先配置通用 AI')
      return
    }
    setGenerating(true)
    setError('')
    setGenerated(null)
    try {
      const messages = buildOutlineGenerateMessages({
        work,
        detail,
        chapters,
        requirement,
        chapterCount,
      })
      let usage: ChatUsage | undefined
      let raw = await runApiTask(api, { task: 'analysis.plan', messages,
        temperature: 0.55,
        maxTokens: 6500,
        onUsage: (next) => {
          usage = next
        },
      })
      let parsed = parseGeneratedOutline(raw)
      if (!parsed) {
        raw = await runApiTask(api, {
          task: 'analysis.plan',
          messages: [
            ...messages,
            {
              role: 'user',
              content:
                '上次输出无法解析或可能被截断。请只输出一个完整合法 JSON；章节数量减少到 8 章以内，每章 summary / goal / conflict 保持短句，确保括号闭合。',
            },
          ],
          temperature: 0.3,
          maxTokens: 8000,
          onUsage: (next) => {
            usage = next
          },
        })
        parsed = parseGeneratedOutline(raw)
      }
      if (!parsed) throw new Error('AI 没有返回可解析的大纲 JSON')
      setGenerated(parsed)
      onRecordUsage?.({
        id: `outline-usage-${Date.now().toString(36)}`,
        at: Date.now(),
        kind: '大纲生成',
        model: api.model,
        inputTokens: usage?.inputTokens ?? estimateTokens(messages.map((item) => item.content).join('\n')),
        outputTokens: usage?.outputTokens ?? estimateTokens(raw),
        note: `生成 ${parsed.globalOutline.arcs.length} 卷 / ${parsed.chapters.length} 章`,
        actual: Boolean(usage),
        workId: work.id,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '大纲生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const apply = () => {
    if (!generated) return
    const cards = generatedOutlineToCards(generated, detail)
    onApply(generated.globalOutline, cards, replace)
    onClose()
  }

  return (
    <Modal
      title="AI 生成大纲"
      subtitle="先生成全局结构和章节卡，预览后再合并；默认不覆盖已有内容"
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
            {generating ? '生成中…' : generated ? '重新生成' : '生成大纲'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={apply}
            disabled={!generated}
          >
            应用大纲
          </button>
        </>
      }
    >
      <div className="outline-ai-modal">
        <label className="record-field">
          <span>想生成什么样的大纲？</span>
          <textarea
            className="input drawer-textarea"
            rows={3}
            value={requirement}
            onChange={(event) => setRequirement(event.target.value)}
            placeholder="例如：第一卷宗门试炼，第二卷下山查旧案；节奏前慢后快，结尾留一个背叛钩子。"
          />
        </label>
        <label className="record-field outline-ai-count">
          <span>章节数量</span>
          <NumberInput
            className="input"
            min={3}
            max={30}
            value={chapterCount}
            fallback={3}
            onValueChange={setChapterCount}
          />
        </label>
        {!apiReady ? <p className="warn-line">请先配置通用 AI 模型和 API Key。</p> : null}
        {error ? <p className="field-error">{error}</p> : null}

        {generated ? (
          <div className="outline-ai-preview">
            <div className="outline-ai-preview-head">
              <IconSparkles size={15} />
              <strong>{generated.globalOutline.premise || '已生成全局大纲'}</strong>
              <span>
                {generated.globalOutline.arcs.length} 卷 · {generated.chapters.length} 章
              </span>
            </div>
            {generated.globalOutline.theme ? (
              <p>主题：{generated.globalOutline.theme}</p>
            ) : null}
            {generated.globalOutline.conflict ? (
              <p>主要矛盾：{generated.globalOutline.conflict}</p>
            ) : null}
            <div className="outline-ai-chapter-list">
              {generated.chapters.map((chapter, index) => (
                <div key={`${chapter.title}-${index}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{chapter.title}</strong>
                  <small>{chapter.summary || chapter.goal || '没有概要'}</small>
                </div>
              ))}
            </div>
            <label className="outline-ai-replace">
              <input
                type="checkbox"
                checked={replace}
                onChange={(event) => setReplace(event.target.checked)}
              />
              <span>替换现有大纲和章节卡（默认只追加，不覆盖已有内容）</span>
            </label>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
