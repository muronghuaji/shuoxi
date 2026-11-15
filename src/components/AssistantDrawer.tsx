import { useEffect, useRef, useState } from 'react'
import type { AiUsageEntry, ApiConfig, Chapter, Work, WorkDetail } from '../types'
import { buildAssistantMessages, type ChatUsage } from '../ai'
import { runApiTask } from '../aiTask'
import { estimateTokens } from '../utils'
import { IconArrowRight, IconSparkles, IconX } from './Icons'

interface AssistantDrawerProps {
  open: boolean
  onClose: () => void
  work: Work
  detail: WorkDetail
  chapter?: Chapter
  content: string
  api: ApiConfig
  apiReady: boolean
  seedPrompt?: { id: string; text: string } | null
  onRecordUsage?: (entry: AiUsageEntry) => void
}

interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const QUICK_PROMPTS = [
  '卡文了，接下来怎么发展？',
  '给我三个剧情反转',
  '制造一个更尖锐的冲突',
  '分析当前人物关系',
]

function createId() {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
}

export function AssistantDrawer({
  open,
  onClose,
  work,
  detail,
  chapter,
  content,
  api,
  apiReady,
  seedPrompt,
  onRecordUsage,
}: AssistantDrawerProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 180)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open || !seedPrompt) return
    setInput(seedPrompt.text)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 220)
    return () => window.clearTimeout(timer)
  }, [open, seedPrompt?.id])

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages, loading, open])

  const sendText = async (raw: string) => {
    const text = raw.trim()
    if (!text || loading) return
    if (!apiReady) return

    const userMessage: AssistantMessage = { id: createId(), role: 'user', content: text }
    const assistantId = createId()
    const history = [...messages, userMessage].map(({ role, content: messageContent }) => ({
      role,
      content: messageContent,
    }))
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: 'assistant', content: '' },
    ])
    setInput('')
    setLoading(true)

    try {
      const requestMessages = buildAssistantMessages({
        work,
        detail,
        chapter,
        content,
        history,
      })
      let actualUsage: ChatUsage | undefined
      let full = ''
      const result = await runApiTask(api, { task: 'analysis.plan', messages: requestMessages,
        temperature: 0.78,
        maxTokens: 1800,
        onUsage: (usage) => {
          actualUsage = usage
        },
        onDelta: (delta) => {
          full += delta
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + delta }
                : message,
            ),
          )
        },
      })
      if (!full.trim()) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content: result || '没有返回内容。' } : message,
          ),
        )
        full = result
      }
      if (onRecordUsage) {
        const inputText = requestMessages.map((message) => message.content).join('\n')
        const inputTokens = actualUsage?.inputTokens ?? estimateTokens(inputText)
        const outputTokens = actualUsage?.outputTokens ?? estimateTokens(full)
        const priceInput = api.inputPrice ?? 0
        const priceOutput = api.outputPrice ?? 0
        const cost =
          actualUsage && (priceInput > 0 || priceOutput > 0)
            ? (inputTokens / 1_000_000) * priceInput +
              (outputTokens / 1_000_000) * priceOutput
            : undefined
        onRecordUsage({
          id: `usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          at: Date.now(),
          kind: 'AI 助手',
          profile: 'writing',
          model: api.model,
          inputTokens,
          outputTokens,
          actual: Boolean(actualUsage),
          cost,
        })
      }
    } catch (caught) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: `生成失败：${caught instanceof Error ? caught.message : '请检查模型配置'}`,
              }
            : message,
        ),
      )
    } finally {
      setLoading(false)
    }
  }

  const send = () => {
    if (!input.trim() || loading || !apiReady) return
    void sendText(input)
  }

  return (
    <aside className={`ai-assistant ${open ? 'open' : ''}`} aria-hidden={!open}>
      <header className="ai-assistant-head">
        <div>
          <span>
            <IconSparkles size={15} />
            AI 灵感助手
          </span>
          <small>
            {chapter
              ? `${chapter.title || '当前章节'} · 基于当前章节上下文`
              : `${work.title} · 基于作品设定`}
          </small>
        </div>
        <div className="ai-assistant-head-actions">
          {messages.length > 0 ? (
            <button type="button" onClick={() => setMessages([])}>
              清空
            </button>
          ) : null}
          <button type="button" aria-label="关闭 AI 助手" onClick={onClose}>
            <IconX size={15} />
          </button>
        </div>
      </header>

      <div className="ai-assistant-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="ai-assistant-welcome">
            <span>
              <IconSparkles size={19} />
            </span>
            <strong>卡文了？</strong>
            <p>可以问我下一章怎么走、哪里可以制造冲突、给几个反转，或者分析人物关系。我不会直接改正文。</p>
            <div className="ai-quick-prompts">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={!apiReady || loading}
                  onClick={() => void sendText(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`ai-message ${message.role}`}>
              <span>{message.role === 'user' ? '你' : '灵感助手'}</span>
              <p>
                {message.content ||
                  (message.role === 'assistant' && loading ? '正在想…' : '')}
              </p>
            </div>
          ))
        )}
      </div>

      {!apiReady ? (
        <p className="ai-assistant-hint">还没有配置模型，去设置里填写 API Key 后就能对话。</p>
      ) : null}

      <div className="ai-assistant-quicks">
        {messages.length > 0
          ? QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={!apiReady || loading}
                onClick={() => void sendText(prompt)}
              >
                {prompt}
              </button>
            ))
          : null}
      </div>

      <div className="ai-assistant-compose">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
          placeholder={apiReady ? '和 AI 聊聊接下来怎么写…' : '先配置 AI 模型和 API Key'}
          rows={2}
          disabled={!apiReady}
          aria-label="和 AI 灵感助手对话"
        />
        <button
          type="button"
          className="ai-assistant-send"
          disabled={!apiReady || loading || !input.trim()}
          onClick={send}
          aria-label="发送"
        >
          <IconArrowRight size={16} />
        </button>
      </div>
    </aside>
  )
}
