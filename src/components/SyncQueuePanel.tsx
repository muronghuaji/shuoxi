import type { SyncJob } from '../syncQueue'
import type { ArchiveJob } from '../archiveQueue'
import { Modal } from './Modal'

interface SyncQueuePanelProps {
  jobs: SyncJob[]
  archiveJobs: ArchiveJob[]
  paused: boolean
  onPause: () => void
  onResume: () => void
  onCancelJob: (id: string) => void
  onRetryJob: (id: string) => void
  onClearFinished: () => void
  onClose: () => void
}

const STATUS_LABEL: Record<SyncJob['status'], string> = {
  queued: '等待',
  running: '同步中',
  done: '完成',
  failed: '失败',
  cancelled: '已取消',
}

export function SyncQueuePanel({
  jobs,
  archiveJobs,
  paused,
  onPause,
  onResume,
  onCancelJob,
  onRetryJob,
  onClearFinished,
  onClose,
}: SyncQueuePanelProps) {
  const done = jobs.filter((job) => job.status === 'done').length
  const failed = jobs.filter((job) => job.status === 'failed').length
  const waiting = jobs.filter((job) => job.status === 'queued').length
  const running = jobs.find((job) => job.status === 'running')
  return (
    <Modal
      title="同步队列"
      subtitle="章节同步按章节顺序写入；可以暂停、取消或重试"
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClearFinished}>
            清理已完成
          </button>
          {paused ? (
            <button type="button" className="btn btn-primary" onClick={onResume}>
              继续同步
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={onPause} disabled={waiting === 0 && !running}>
              暂停队列
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            关闭
          </button>
        </>
      }
    >
      <div className="sync-queue">
        <div className="sync-queue-summary">
          <span>完成 {done}</span>
          <span>等待 {waiting}</span>
          <span>失败 {failed}</span>
          <span className={paused ? 'paused' : ''}>{paused ? '已暂停' : running ? '运行中' : '空闲'}</span>
        </div>
        {running ? (
          <p className="sync-queue-current">
            当前：{running.chapterTitle || '未命名章节'}
          </p>
        ) : null}
        {jobs.length === 0 ? (
          <p className="hint-line">队列为空。自动同步、手动同步和补同步都会进入这里。</p>
        ) : (
          <div className="sync-queue-list">
            {jobs.slice(0, 80).map((job) => (
              <div className={`sync-queue-row ${job.status}`} key={job.id}>
                <span className="sync-queue-status">{STATUS_LABEL[job.status]}</span>
                <span className="sync-queue-title">{job.chapterTitle || job.chapterId}</span>
                <small>{job.source === 'manual' ? '手动' : job.source === 'auto' ? '自动' : '补同步'}</small>
                <small>{job.mode === 'full' ? '深度' : '快速'}</small>
                {job.error ? <small className="sync-queue-error">{job.error.slice(0, 120)}</small> : null}
                <span className="sync-queue-actions">
                  {job.status === 'queued' ? (
                    <button type="button" onClick={() => onCancelJob(job.id)}>
                      取消
                    </button>
                  ) : null}
                  {job.status === 'failed' ? (
                    <button type="button" onClick={() => onRetryJob(job.id)}>
                      重试
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
        {archiveJobs.length > 0 ? (
          <div className="sync-queue-archive">
            <div className="sync-queue-summary">
              <span>档案补全</span>
              <span>等待 {archiveJobs.filter((job) => job.status === 'queued').length}</span>
              <span>完成 {archiveJobs.filter((job) => job.status === 'done').length}</span>
              <span>失败 {archiveJobs.filter((job) => job.status === 'failed').length}</span>
            </div>
            <div className="sync-queue-list">
              {archiveJobs.slice(0, 40).map((job) => (
                <div className={`sync-queue-row ${job.status}`} key={job.id}>
                  <span className="sync-queue-status">
                    {job.status === 'running' ? '补档中' : job.status === 'queued' ? '等待' : job.status === 'done' ? '完成' : '失败'}
                  </span>
                  <span className="sync-queue-title">{job.name}</span>
                  <small>{job.kind === 'character' ? '角色' : '势力'}</small>
                  {job.error ? <small className="sync-queue-error">{job.error.slice(0, 120)}</small> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
