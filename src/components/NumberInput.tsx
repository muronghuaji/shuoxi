import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'

interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'> {
  value: number
  min?: number
  max?: number
  step?: number
  fallback?: number
  onValueChange: (value: number) => void
}

function clampNumber(value: number, min?: number, max?: number): number {
  let next = value
  if (typeof min === 'number') next = Math.max(min, next)
  if (typeof max === 'number') next = Math.min(max, next)
  return next
}

/**
 * 数字输入框：聚焦时保留用户草稿，允许清空；失焦/回车时才解析并夹紧。
 * 避免受控 number 输入框“删空后立刻回填最小值”的问题。
 */
export function NumberInput({
  value,
  min,
  max,
  step,
  fallback,
  onValueChange,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: NumberInputProps) {
  const [draft, setDraft] = useState(String(value))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value))
  }, [value])

  const commit = () => {
    const parsed = Number(draft.trim())
    const next = Number.isFinite(parsed) && draft.trim() !== ''
      ? clampNumber(parsed, min, max)
      : clampNumber(fallback ?? min ?? 0, min, max)
    setDraft(String(next))
    if (next !== value) onValueChange(next)
  }

  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      onFocus={(event) => {
        focusedRef.current = true
        onFocus?.(event)
      }}
      onChange={(event) => {
        focusedRef.current = true
        setDraft(event.target.value)
      }}
      onBlur={(event) => {
        focusedRef.current = false
        commit()
        onBlur?.(event)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
        onKeyDown?.(event)
      }}
    />
  )
}
