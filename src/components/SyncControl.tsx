import { useEffect, useRef, useState } from 'react'
import { IconChevronDown, IconSparkles } from './Icons'

interface SyncControlProps {
  onSync: (mode: 'fast' | 'full') => void
  onMultiChapter?: () => void
  disabled?: boolean
  compact?: boolean
}

export function SyncControl({
  onSync,
  onMultiChapter,
  disabled = false,
  compact = false,
}: SyncControlProps) {
  const [mode, setMode] = useState<'fast' | 'full'>('fast')
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  return (
    <div ref={rootRef} className={`sync-control ${compact ? 'compact' : ''}`}>
      <button
        type="button"
        className="sync-control-mode"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="选择同步模式"
        onClick={() => setMenuOpen((open) => !open)}
        disabled={disabled}
      >
        {mode === 'full' ? '深度' : '快速'}
        <IconChevronDown size={11} />
      </button>
      {menuOpen ? (
        <div className="sync-control-menu" role="menu">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={mode === 'fast'}
            className={mode === 'fast' ? 'active' : ''}
            onClick={() => {
              setMode('fast')
              setMenuOpen(false)
            }}
          >
            <strong>快速</strong>
            <small>事件 / 状态 / 新实体，约 8–10 秒</small>
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={mode === 'full'}
            className={mode === 'full' ? 'active' : ''}
            onClick={() => {
              setMode('full')
              setMenuOpen(false)
            }}
          >
            <strong>深度</strong>
            <small>补角色经历与完整审查，较慢</small>
          </button>
          {onMultiChapter ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                onMultiChapter()
              }}
            >
              <strong>多章深度同步…</strong>
              <small>选择多章，按顺序补全</small>
            </button>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className="sync-control-run"
        disabled={disabled}
        onClick={() => onSync(mode)}
        title={mode === 'full' ? '深度同步当前章节' : '快速同步当前章节'}
      >
        <IconSparkles size={13} />
        同步
      </button>
    </div>
  )
}
