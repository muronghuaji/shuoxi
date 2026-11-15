import { IconCheck, IconDownload, IconTrash, IconX } from './Icons'

interface BatchActionBarProps {
  selectedCount: number
  totalCount: number
  label: string
  onSelectAll: () => void
  onClear: () => void
  onExport: () => void
  onDelete: () => void
  onExit: () => void
}

export function BatchActionBar({
  selectedCount,
  totalCount,
  label,
  onSelectAll,
  onClear,
  onExport,
  onDelete,
  onExit,
}: BatchActionBarProps) {
  return (
    <div className="batch-action-bar" role="region" aria-label={`${label}批量操作`}>
      <span className="batch-action-count">
        已选 <strong>{selectedCount}</strong> / {totalCount} {label}
      </span>
      <div className="batch-action-buttons">
        <button type="button" onClick={onSelectAll}>
          <IconCheck size={13} />
          全选
        </button>
        <button type="button" onClick={onClear} disabled={selectedCount === 0}>
          清空
        </button>
        <button
          type="button"
          className="batch-export"
          onClick={onExport}
          disabled={selectedCount === 0}
          title="导出选中项为 JSON"
        >
          <IconDownload size={13} />
          导出 JSON
        </button>
        <button
          type="button"
          className="batch-delete"
          onClick={onDelete}
          disabled={selectedCount === 0}
        >
          <IconTrash size={13} />
          删除选中
        </button>
        <button type="button" className="batch-exit" onClick={onExit} title="退出多选（Esc）">
          <IconX size={13} />
          退出
        </button>
      </div>
    </div>
  )
}
