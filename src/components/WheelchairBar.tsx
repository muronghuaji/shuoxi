import { useEffect, useRef, useState } from 'react'
import type { AiUsageEntry, ApiConfig, Chapter, Work, WorkDetail } from '../types'
import { runAutoWriteChapter } from '../autoWrite'
import { countWords } from '../utils'
import { IconChevronDown, IconSettings, IconSparkles, IconStop, IconX } from './Icons'
import { NumberInput } from './NumberInput'

interface WheelchairBarProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  writingApi: ApiConfig
  generalApi: ApiConfig
  apiReady: boolean
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onUpdateChapter: (chapterId: string, patch: Partial<Chapter>) => void
  onAddChapter: () => string
  onSnapshot: (reason: string) => void
  onToast: (message: string) => void
  onRecordUsage?: (entry: AiUsageEntry) => void
  onRunningChange: (running: boolean) => void
  onExit: () => void
}

interface WheelchairReport {
  chapters: number
  words: number
  newCharacters: number
  newFactions: number
  newItems: number
  warnings: string[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function WheelchairBar({
  work,
  detail,
  chapters,
  writingApi,
  generalApi,
  apiReady,
  onUpdateDetail,
  onUpdateChapter,
  onAddChapter,
  onSnapshot,
  onToast,
  onRecordUsage,
  onRunningChange,
  onExit,
}: WheelchairBarProps) {
  const [chapterCount, setChapterCount] = useState(1)
  const [singleWords, setSingleWords] = useState(2000)
  const [rangeMin, setRangeMin] = useState(1000)
  const [rangeMax, setRangeMax] = useState(2000)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState('')
  const [report, setReport] = useState<WheelchairReport | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pausedRef = useRef(false)
  const streamingChapterRef = useRef<{ id: string; isNew: boolean } | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const count = Math.max(1, Math.min(10, Math.floor(chapterCount) || 1))
  const min = Math.max(100, Math.min(8000, Math.floor(rangeMin) || 1000))
  const max = Math.max(min, Math.min(8000, Math.floor(rangeMax) || 2000))
  const single = Math.max(100, Math.min(8000, Math.floor(singleWords) || 2000))
  const estimatedTotal = count === 1 ? single : Math.round(((min + max) / 2) * count)
  const lastLog = logs.at(-1) ?? ''
  const progressPercent = count > 0 ? Math.round((progress / count) * 100) : 0

  const pause = () => {
    pausedRef.current = true
    setPaused(true)
  }

  const resume = () => {
    pausedRef.current = false
    setPaused(false)
  }

  const start = async () => {
    if (running) return
    if (!apiReady) {
      onToast('请先在设置里配置 AI 模型和 API Key')
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    pausedRef.current = false
    setPaused(false)
    setRunning(true)
    onRunningChange(true)
    setError('')
    setReport(null)
    setLogs([])
    setProgress(0)
    onSnapshot(`轮椅模式生成前（${count} 章）`)

    let currentDetail = detail
    let currentChapters = [...chapters]
    let completed = 0
    let words = 0
    let newCharacters = 0
    let newFactions = 0
    let newItems = 0
    const warnings: string[] = []

    try {
      for (let index = 0; index < count; index += 1) {
        if (controller.signal.aborted) throw new Error('已停止')
        while (pausedRef.current) {
          if (controller.signal.aborted) throw new Error('已停止')
          await sleep(200)
        }
        // 多章时区间值只决定“每章”目标，不是总字数。
        const targetWords =
          count === 1 ? single : min + Math.floor(Math.random() * (max - min + 1))
        setLogs((current) => [
          ...current.slice(-3),
          `第 ${index + 1} / ${count} 章：每章目标 ${targetWords} 字`,
        ])
        streamingChapterRef.current = null
        const result = await runAutoWriteChapter({
          work,
          detail: currentDetail,
          chapters: currentChapters,
          writingApi,
          generalApi,
          targetWords,
          signal: controller.signal,
          onProgress: (message) =>
            setLogs((current) => [...current.slice(-3), `　${message}`]),
          onChapterStart: (chapter, isNew) => {
            const id = isNew ? onAddChapter() : chapter.id
            streamingChapterRef.current = { id, isNew }
            onUpdateChapter(id, { ...chapter, id, content: isNew ? '' : chapter.content })
          },
          onChapterDelta: (_chapterId, text) => {
            const current = streamingChapterRef.current
            if (!current) return
            onUpdateChapter(current.id, {
              content: text,
              wordCount: countWords(text),
              updatedAt: Date.now(),
            })
          },
          onRecordUsage,
        })
        if (controller.signal.aborted) throw new Error('已停止')

        let appliedChapter: Chapter
        if (result.isNewChapter) {
          const streamed = streamingChapterRef.current as {
            id: string
            isNew: boolean
          } | null
          const id = streamed?.isNew ? streamed.id : onAddChapter()
          appliedChapter = { ...result.chapter, id }
          currentChapters = [...currentChapters, appliedChapter]
        } else {
          appliedChapter = result.chapter
          currentChapters = currentChapters.map((chapter) =>
            chapter.id === appliedChapter.id ? appliedChapter : chapter,
          )
        }
        streamingChapterRef.current = null
        currentDetail = result.detail
        onUpdateDetail(result.detail)
        onUpdateChapter(appliedChapter.id, appliedChapter)
        completed += 1
        words += result.report.words
        newCharacters += result.report.newCharacters
        newFactions += result.report.newFactions
        newItems += result.report.newItems
        warnings.push(...result.report.warnings)
        setProgress(completed)
        onSnapshot(`轮椅模式第 ${index + 1} 章完成后`)
        setLogs((current) => [
          ...current.slice(-3),
          `第 ${index + 1} 章完成：${result.report.words} 字`,
        ])
      }
      setReport({
        chapters: completed,
        words,
        newCharacters,
        newFactions,
        newItems,
        warnings: [...new Set(warnings)].slice(0, 8),
      })
      onToast(`轮椅模式完成 ${completed} 章，共 ${words.toLocaleString()} 字`)
    } catch (caught) {
      const message = controller.signal.aborted
        ? `已停止，已完成 ${completed} 章；已完成的章节会保留`
        : caught instanceof Error
          ? caught.message
          : '自动生成失败'
      setError(completed > 0 ? `${message}（已完成 ${completed} 章）` : message)
      if (completed > 0) {
        setReport({
          chapters: completed,
          words,
          newCharacters,
          newFactions,
          newItems,
          warnings: [...new Set(warnings)].slice(0, 8),
        })
      }
    } finally {
      abortRef.current = null
      pausedRef.current = false
      setPaused(false)
      setRunning(false)
      onRunningChange(false)
    }
  }

  const primaryLabel = running ? (paused ? '继续' : '暂停') : report ? '再生成' : '开始'
  const statusText = running
    ? paused
      ? '已暂停'
      : '自动推进中'
    : report
      ? '已完成'
      : '等待开始'

  return (
    <div className="wheelchair-bar wheelchair-dock">
      <div className="wheelchair-dock-main">
        <span className={`wheelchair-dot ${running ? (paused ? 'paused' : 'running') : ''}`} />
        <span className="wheelchair-status-text">{statusText}</span>
        <span className="wheelchair-progress-text">
          第 {Math.min(progress + (running ? 1 : 0), count)} / {count} 章
        </span>
        <span className="wheelchair-progress-bar" aria-hidden="true">
          <i style={{ width: `${progressPercent}%` }} />
        </span>
        <span className="wheelchair-estimate">
          每章 {count === 1 ? single : `${min}–${max}`} 字 · 预计总计约 {estimatedTotal.toLocaleString()} 字
        </span>
        <span className="wheelchair-last-log" title={logs.join('\n')}>
          {error || lastLog || reportSummary(report)}
        </span>
      </div>

      <div className="wheelchair-dock-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            if (running) {
              if (paused) resume()
              else pause()
            } else {
              void start()
            }
          }}
          disabled={!apiReady}
        >
          {!running ? <IconSparkles size={13} /> : null}
          {primaryLabel}
        </button>
        {running ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => abortRef.current?.abort()}
            title="停止并保留已完成章节"
          >
            <IconStop size={13} />
            停止
          </button>
        ) : null}
        <button
          type="button"
          className={`btn btn-ghost btn-sm ${settingsOpen ? 'active' : ''}`}
          onClick={() => setSettingsOpen((value) => !value)}
          title="轮椅模式设置"
          aria-expanded={settingsOpen}
        >
          <IconSettings size={14} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onExit}
          title="退出轮椅模式"
        >
          <IconX size={14} />
          退出
        </button>
      </div>

      {settingsOpen ? (
        <div className="wheelchair-settings-pop">
          <div className="wheelchair-settings-head">
            <strong>自动推进设置</strong>
            <button type="button" onClick={() => setSettingsOpen(false)} aria-label="关闭设置">
              <IconChevronDown size={14} />
            </button>
          </div>
          <label>
            <span>生成章数</span>
            <NumberInput
              className="input"
              min={1}
              max={10}
              value={chapterCount}
              fallback={1}
              disabled={running}
              onValueChange={setChapterCount}
            />
          </label>
          {count === 1 ? (
            <label>
              <span>每章目标字数</span>
              <NumberInput
                className="input"
                min={100}
                max={8000}
                step={100}
                value={singleWords}
                fallback={2000}
                disabled={running}
                onValueChange={setSingleWords}
              />
            </label>
          ) : (
            <label>
              <span>每章字数区间</span>
              <div className="wheelchair-settings-range">
                <NumberInput
                  className="input"
                  min={100}
                  max={8000}
                  step={100}
                  value={rangeMin}
                  fallback={1000}
                  disabled={running}
                  onValueChange={setRangeMin}
                />
                <em>—</em>
                <NumberInput
                  className="input"
                  min={100}
                  max={8000}
                  step={100}
                  value={rangeMax}
                  fallback={2000}
                  disabled={running}
                  onValueChange={setRangeMax}
                />
              </div>
            </label>
          )}
          <p>
            {count > 1
              ? `区间只决定每章目标，不是总字数；预计总计约 ${estimatedTotal.toLocaleString()} 字。`
              : '单章生成时的目标字数。'}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function reportSummary(report: WheelchairReport | null): string {
  if (!report) return ''
  return `完成 ${report.chapters} 章 · ${report.words.toLocaleString()} 字 · 新增角色 ${report.newCharacters}`
}
