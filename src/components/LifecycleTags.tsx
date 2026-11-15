import type { EntityLifecycle } from '../types'

export const LIFECYCLE_OPTIONS: EntityLifecycle[] = ['已上线', '已下线', '未上线']

export function effectiveLifecycle(value: EntityLifecycle | undefined): EntityLifecycle {
  return value ?? '未上线'
}

export function LifecycleBadge({ value }: { value?: EntityLifecycle }) {
  const lifecycle = effectiveLifecycle(value)
  return <span className={`lifecycle-badge lifecycle-${lifecycle}`}>{lifecycle}</span>
}

export function LifecycleTags({
  value,
  onChange,
  compact = false,
}: {
  value?: EntityLifecycle
  onChange?: (value: EntityLifecycle) => void
  compact?: boolean
}) {
  const current = effectiveLifecycle(value)
  return (
    <span className={`lifecycle-tags ${compact ? 'compact' : ''}`} aria-label="上线状态">
      {LIFECYCLE_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={`lifecycle-tag lifecycle-${option} ${current === option ? 'active' : ''}`}
          onClick={() => onChange?.(option)}
          disabled={!onChange}
        >
          {option}
        </button>
      ))}
    </span>
  )
}
