import { useEffect, useRef, useState } from 'react'
import { displayModelName } from '../data'
import { IconChevronDown } from './Icons'

interface ModelPickerProps {
  value: string
  models: string[]
  onChange: (model: string) => void
  allowCustom?: boolean
  compact?: boolean
  ariaLabel?: string
}

export function ModelPicker({
  value,
  models,
  onChange,
  allowCustom = true,
  compact = false,
  ariaLabel = '选择模型',
}: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (value && !models.includes(value)) setCustom(true)
  }, [value, models])

  return (
    <div className={`model-picker ${compact ? 'compact' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`input select model-picker-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={value}
      >
        <span>{value || '选择模型'}</span>
        <IconChevronDown size={12} />
      </button>
      {open ? (
        <div className="model-picker-menu" role="listbox" aria-label={ariaLabel}>
          <div className="model-picker-head">可用模型</div>
          {models.map((model) => (
            <button
              key={model}
              type="button"
              role="option"
              aria-selected={model === value}
              className={model === value ? 'active' : ''}
              onClick={() => {
                onChange(model)
                setCustom(false)
                setOpen(false)
              }}
            >
              <span>{model}</span>
              {displayModelName(model) !== model ? <small>{displayModelName(model)}</small> : null}
            </button>
          ))}
          {models.length === 0 ? <p className="model-picker-empty">自定义服务商，请手动输入模型 ID</p> : null}
          {allowCustom ? (
            <>
              <div className="model-picker-separator" />
              {custom ? (
                <input
                  className="input model-picker-input"
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  placeholder="输入模型 ID"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className="model-picker-custom"
                  onClick={() => setCustom(true)}
                >
                  手动输入模型 ID…
                </button>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
