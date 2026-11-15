import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type {
  CharacterChatEmotion,
  ChatEmotionTendency,
  ChatEmotionTarget,
} from '../types'
import { CHAT_EMOTIONS, CHAT_EMOTION_MAP } from '../chatEmotion'

interface ChatEmotionBadgeProps {
  emotion: CharacterChatEmotion
  characterName: string
  open: boolean
  onToggle: () => void
  onClose: () => void
  onChange: (patch: Partial<CharacterChatEmotion>) => void
}

const TARGETS: { value: ChatEmotionTarget; label: string }[] = [
  { value: 'user', label: '对方' },
  { value: 'self', label: '自己' },
  { value: 'other', label: '其他在场者' },
  { value: 'situation', label: '当前处境' },
]

const TENDENCIES: { value: ChatEmotionTendency; label: string }[] = [
  { value: 'approach', label: '靠近' },
  { value: 'avoid', label: '回避' },
  { value: 'attack', label: '攻击' },
  { value: 'endure', label: '忍耐' },
  { value: 'probe', label: '试探' },
]

export function ChatEmotionBadge({
  emotion,
  characterName,
  open,
  onToggle,
  onClose,
  onChange,
}: ChatEmotionBadgeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const definition = CHAT_EMOTION_MAP[emotion.primary]
  const style = {
    '--emotion-color': definition.color,
  } as CSSProperties

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      setPosition({
        left: Math.max(10, Math.min(rect.left, window.innerWidth - 326)),
        top: Math.min(rect.bottom + 7, Math.max(10, window.innerHeight - 520)),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!ref.current?.contains(target) && !panelRef.current?.contains(target)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  return (
    <div className="chat-emotion-wrap" ref={ref} style={style}>
      <button
        type="button"
        className={`chat-emotion-badge ${open ? 'open' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
        title={`${characterName} 当前情绪：${definition.label} ${emotion.intensity}/100`}
      >
        <span className="chat-emotion-dot" aria-hidden="true" />
        <span>{definition.label}</span>
        <strong>{emotion.intensity}</strong>
      </button>

      {open ? createPortal(
        <div
          ref={panelRef}
          className="chat-emotion-panel"
          role="dialog"
          aria-label="角色情绪设置"
          style={{ ...style, left: position.left, top: position.top }}
        >
          <div className="chat-emotion-panel-head">
            <div>
              <span>当前情绪</span>
              <strong>{characterName}</strong>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭情绪面板">
              ×
            </button>
          </div>

          <div className="chat-emotion-options">
            {CHAT_EMOTIONS.map((emotionOption) => (
              <button
                type="button"
                key={emotionOption.id}
                className={emotion.primary === emotionOption.id ? 'active' : ''}
                style={{ '--emotion-color': emotionOption.color } as CSSProperties}
                onClick={() =>
                  onChange({
                    primary: emotionOption.id,
                    intensity: emotionOption.id === 'neutral' ? 0 : Math.max(35, emotion.intensity),
                    tendency:
                      emotionOption.id === 'anger'
                        ? 'attack'
                        : emotionOption.id === 'trust' || emotionOption.id === 'joy'
                          ? 'approach'
                          : emotionOption.id === 'neutral'
                            ? 'probe'
                            : 'avoid',
                    auto: false,
                  })
                }
              >
                <span className="chat-emotion-dot" />
                {emotionOption.label}
              </button>
            ))}
          </div>

          <label className="chat-emotion-field">
            <span>
              强度 <strong>{emotion.intensity}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={emotion.intensity}
              onChange={(event) =>
                onChange({ intensity: Number(event.target.value), auto: false })
              }
            />
          </label>

          <label className="chat-emotion-field">
            <span>触发原因</span>
            <input
              className="input"
              value={emotion.cause}
              onChange={(event) => onChange({ cause: event.target.value, auto: false })}
              placeholder="例如：对方提到了旧案"
              maxLength={120}
            />
          </label>

          <div className="chat-emotion-two-col">
            <label className="chat-emotion-field">
              <span>情绪指向</span>
              <select
                className="input select"
                value={emotion.target}
                onChange={(event) =>
                  onChange({ target: event.target.value as ChatEmotionTarget, auto: false })
                }
              >
                {TARGETS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="chat-emotion-field">
              <span>行为倾向</span>
              <select
                className="input select"
                value={emotion.tendency}
                onChange={(event) =>
                  onChange({ tendency: event.target.value as ChatEmotionTendency, auto: false })
                }
              >
                {TENDENCIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="chat-emotion-panel-foot">
            <label>
              <input
                type="checkbox"
                checked={emotion.auto}
                onChange={(event) => onChange({ auto: event.target.checked })}
              />
              自动评估
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                onChange({
                  primary: emotion.baseline,
                  intensity: emotion.baseline === 'neutral' ? 0 : 30,
                  cause: '',
                  target: 'user',
                  tendency: 'probe',
                  auto: true,
                })
              }
            >
              回到基线
            </button>
          </div>
          <p className="chat-emotion-hint">
            {definition.behavior}
          </p>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
