import { useMemo, useRef, useState } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  BootstrapMode,
  BootstrapReport,
  Chapter,
  Work,
  WorkDetail,
} from '../types'
import { planBootstrap, runImportBootstrap } from '../importBootstrap'
import { IconSparkles, IconStop } from './Icons'
import { Modal } from './Modal'

interface BootstrapModalProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  api: ApiConfig
  apiReady: boolean
  onUpdateDetail: (detail: WorkDetail) => void
  onSnapshot: (reason: string) => void
  onRecordUsage?: (entry: AiUsageEntry) => void
  onToast: (message: string) => void
  onClose: () => void
}

const MODES: {
  id: BootstrapMode
  title: string
  description: string
}[] = [
  {
    id: 'quick',
    title: '快速建档',
    description: '最近 12 章 + 当前人物线索，约 3–4 次 AI 调用；优先让作者马上能写。',
  },
  {
    id: 'standard',
    title: '标准建档',
    description: '从全书抽取头尾和中间样本，覆盖主要人物 / 势力 / 事件；适合百万字级作品。',
  },
  {
    id: 'deep',
    title: '深度建档',
    description: '按批次扫描整本正文，最完整但调用最多、费用最高；长书请确认预算。',
  },
]

export function BootstrapModal({
  work,
  detail,
  chapters,
  api,
  apiReady,
  onUpdateDetail,
  onSnapshot,
  onRecordUsage,
  onToast,
  onClose,
}: BootstrapModalProps) {
  const [mode, setMode] = useState<BootstrapMode>('quick')
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState('')
  const [report, setReport] = useState<BootstrapReport | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const latestRef = useRef<WorkDetail>(detail)
  const plan = useMemo(() => planBootstrap(chapters, mode), [chapters, mode])

  const start = async () => {
    if (running) return
    if (!apiReady) {
      setError('请先在设置里配置 AI 模型和 API Key')
      return
    }
    if (chapters.length === 0) {
      setError('这本书还没有章节，无法建档')
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setError('')
    setReport(null)
    setLogs([])
    latestRef.current = detail
    onSnapshot(`导入建档前（${mode}）`)
    try {
      const result = await runImportBootstrap({
        work,
        detail,
        chapters,
        mode,
        api,
        signal: controller.signal,
        onProgress: (message) => setLogs((current) => [...current.slice(-7), message]),
        onPartial: (next) => {
          latestRef.current = next
          onUpdateDetail(next)
        },
        onRecordUsage,
      })
      latestRef.current = result.detail
      onUpdateDetail(result.detail)
      setReport(result.report)
      onToast(
        `建档完成：${result.report.characters} 角色 · ${result.report.factions} 势力 · ${result.report.events} 事件`,
      )
    } catch (caught) {
      const message = controller.signal.aborted
        ? '已停止建档，已完成的部分已保留'
        : caught instanceof Error
          ? caught.message
          : '建档失败'
      const current = latestRef.current
      const currentReport = current.bootstrap?.report
      onUpdateDetail({
        ...current,
        bootstrap: {
          status: 'partial',
          mode,
          report: currentReport ?? {
            characters: 0,
            factions: 0,
            items: 0,
            species: 0,
            events: 0,
            realms: 0,
            analyzedChapters: 0,
            totalChapters: chapters.length,
            warnings: [message],
          },
          updatedAt: Date.now(),
        },
      })
      setError(message)
    } finally {
      abortRef.current = null
      setRunning(false)
    }
  }

  return (
    <Modal
      title="导入建档"
      subtitle="分析正文，抽取人物、势力、物种、事件和境界；只补架构，不改原文"
      size="lg"
      onClose={running ? () => undefined : onClose}
      footer={
        <>
          {running ? (
            <button type="button" className="btn btn-ghost" onClick={() => abortRef.current?.abort()}>
              <IconStop size={14} />
              停止
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              关闭
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void start()}
            disabled={running || !apiReady || chapters.length === 0}
          >
            <IconSparkles size={14} />
            {running ? '建档中…' : report ? '重新建档' : '开始建档'}
          </button>
        </>
      }
    >
      <div className="bootstrap-modal">
        <div className="bootstrap-work">
          <span>当前作品</span>
          <strong>{work.title}</strong>
          <small>
            {chapters.length} 章 · {work.words.toLocaleString()} 字
          </small>
        </div>

        <div className="bootstrap-modes">
          {MODES.map((item) => (
            <button
              type="button"
              key={item.id}
              className={mode === item.id ? 'active' : ''}
              disabled={running}
              onClick={() => setMode(item.id)}
            >
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>

        <p className="bootstrap-estimate">
          本次预计约 {plan.estimatedCalls} 次 AI 调用，分析 {plan.chapters.length} 章
          {mode === 'deep' ? '；长书可能持续很久，请确认预算和网络。' : '。'}
        </p>

        {!apiReady ? <p className="bootstrap-error">请先配置 AI 模型和 API Key。</p> : null}

        {logs.length > 0 ? (
          <div className="bootstrap-log">
            {logs.map((line, index) => (
              <p key={`${line}-${index}`}>{line}</p>
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="bootstrap-error" role="alert">
            {error}
          </div>
        ) : null}

        {report ? (
          <div className="bootstrap-report">
            <strong>建档完成</strong>
            <span>角色 {report.characters}</span>
            <span>势力 {report.factions}</span>
            <span>物品 {report.items}</span>
            <span>物种 {report.species}</span>
            <span>事件 {report.events}</span>
            <span>境界 {report.realms}</span>
            {report.warnings.length > 0 ? (
              <ul>
                {report.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <p className="hint-line">
          建档会按批次写入当前作品，原文正文不会被修改。建议先做快速建档，够用即可；深度建档适合篇幅较小的书。
        </p>
      </div>
    </Modal>
  )
}
