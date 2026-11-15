import { useEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { EntityIndexEntry } from '../entityIndex'
import { ENTITY_CATEGORY_LABELS } from '../entityHighlight'
import { IconX } from './Icons'
import { useContextMenu } from './ContextMenuProvider'
import { copyTextToClipboard } from '../clipboard'

interface EntityInfoCardProps {
  entry: EntityIndexEntry
  position: { left: number; top: number }
  onClose: () => void
  onOpenDetails: (entry: EntityIndexEntry) => void
}

export function EntityInfoCard({
  entry,
  position,
  onClose,
  onOpenDetails,
}: EntityInfoCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { openContextMenu } = useContextMenu()

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className={`entity-info-card entity-info-${entry.category} ${entry.tierColor ? 'has-tier' : 'no-tier'}`}
      style={
        {
          left: position.left,
          top: position.top,
          '--entity-color': entry.tierColor ?? '#9aa7b8',
        } as CSSProperties
      }
      role="dialog"
      aria-label={`${ENTITY_CATEGORY_LABELS[entry.category]}：${entry.name}`}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) =>
        openContextMenu(event, [
          { type: 'label', label: entry.name },
          { label: '打开完整档案', onSelect: () => onOpenDetails(entry) },
          {
            label: '复制名称',
            onSelect: () => {
              void copyTextToClipboard(entry.name)
            },
          },
          {
            label: '复制词条摘要',
            onSelect: () => {
              void copyTextToClipboard([entry.name, entry.subtitle, entry.summary].join('\n'))
            },
          },
        ])
      }
    >
      <div className="entity-info-head">
        <span className="entity-info-dot" aria-hidden="true" />
        <div>
          <strong>{entry.name}</strong>
          <small>
            {entry.subtitle}
            {entry.tierLabel ? ` · ${entry.tierLabel}` : ''}
          </small>
        </div>
        <button type="button" className="entity-info-close" onClick={onClose} aria-label="关闭实体信息">
          <IconX size={13} />
        </button>
      </div>
      {entry.facts.length > 0 ? (
        <div className="entity-info-facts">
          {entry.facts.slice(0, 3).map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </div>
      ) : null}
      <p className="entity-info-summary">{entry.summary}</p>
      <button
        type="button"
        className="entity-info-open"
        onClick={() => onOpenDetails(entry)}
      >
        打开完整档案
      </button>
    </div>,
    document.body,
  )
}
