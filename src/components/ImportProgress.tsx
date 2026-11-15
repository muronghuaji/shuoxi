import { IconFileText } from './Icons'

export interface ImportJobState {
  fileName: string
  fileSize: number
  percent: number
  stage: string
  chapters?: number
  words?: number
  error?: string
}

interface ImportProgressProps {
  job: ImportJobState
  onCancel: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ImportProgress({ job, onCancel }: ImportProgressProps) {
  return (
    <div className="import-progress-backdrop" role="dialog" aria-modal="true" aria-label="导入小说">
      <div className="import-progress-card">
        <div className="import-progress-head">
          <span className="import-progress-icon">
            <IconFileText size={20} />
          </span>
          <div>
            <span>导入小说</span>
            <h3>{job.error ? '导入失败' : '正在本地拆分章节'}</h3>
            <p>{job.fileName} · {formatSize(job.fileSize)}</p>
          </div>
        </div>

        <div className={`import-progress-bar ${job.error ? 'error' : ''}`}>
          <span style={{ width: `${Math.min(100, Math.max(4, job.percent))}%` }} />
        </div>

        <div className="import-progress-meta">
          <span>{job.error ?? job.stage}</span>
          <strong>{job.error ? '!' : `${Math.round(job.percent)}%`}</strong>
        </div>

        <div className="import-progress-stats">
          <div>
            <span>已识别章节</span>
            <strong>{job.chapters ?? 0}</strong>
          </div>
          <div>
            <span>识别字数</span>
            <strong>{job.words ? job.words.toLocaleString() : '—'}</strong>
          </div>
        </div>

        <p className="import-progress-note">
          章节识别完全在本地按「第 X 章 / Chapter / 序章 / 番外」等标题规则完成，
          <strong>不调用 AI</strong>。自动识别 UTF-8 / GB18030 编码；大文件交给后台线程处理，不会卡住界面。
        </p>

        <div className="import-progress-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            {job.error ? '关闭' : '取消导入'}
          </button>
        </div>
      </div>
    </div>
  )
}
