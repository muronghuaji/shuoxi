import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  Chapter,
  RescueAnalysis,
  RescueChapterDraft,
  RescuePlan,
  Work,
  WorkDetail,
} from '../types'
import { type ChatUsage } from '../ai'
import { runApiTask } from '../aiTask'
import {
  buildRescueAnalysisMessages,
  buildRescueBatchMessages,
  buildRescueBatches,
  buildRescueChapterMessages,
  buildRescueContext,
  buildRescuePlanMessages,
  getRescueStats,
  parseRescueAnalysis,
  parseRescueBatchSummary,
  parseRescueChapter,
  parseRescuePlan,
  type RescueDepth,
} from '../rescue'
import { estimateTokens, countWords } from '../utils'
import { Modal } from './Modal'
import { IconChevronRight, IconSparkles, IconStop } from './Icons'

interface RescueModalProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  analysisApi: ApiConfig
  analysisApiReady: boolean
  writingApi: ApiConfig
  writingApiReady: boolean
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onAddChapter: (draft: RescueChapterDraft) => void
  onSnapshot: (reason: string) => void
  onOpenSettings: () => void
  onToast: (message: string) => void
  onRecordUsage?: (entry: AiUsageEntry) => void
  onClose: () => void
}

type RescueStep = 'analysis' | 'plan' | 'draft'

function usageEntry(
  api: ApiConfig,
  kind: AiUsageEntry['kind'],
  inputTokens: number,
  outputTokens: number,
  actual: boolean,
  note: string,
): AiUsageEntry {
  return {
    id: `rescue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    at: Date.now(),
    kind,
    model: api.model,
    inputTokens,
    outputTokens,
    note,
    actual,
  }
}

function RescueStatsGrid({ chapters }: { chapters: Chapter[] }) {
  const stats = useMemo(() => getRescueStats(chapters), [chapters])
  return (
    <div className="rescue-stats">
      <div>
        <span>章节</span>
        <strong>{stats.chapters}</strong>
      </div>
      <div>
        <span>总字数</span>
        <strong>{stats.words.toLocaleString()}</strong>
      </div>
      <div>
        <span>最后有正文的一章</span>
        <strong>{stats.lastChapterTitle || '暂无'}</strong>
      </div>
      <div>
        <span>结尾</span>
        <strong>{stats.lastChapterTail ? '已读取' : '无正文'}</strong>
      </div>
    </div>
  )
}

function AnalysisReport({ analysis }: { analysis: RescueAnalysis }) {
  return (
    <div className="rescue-report">
      <section className="rescue-report-card rescue-report-main">
        <span>当前故事进行到哪</span>
        <p>{analysis.currentSituation}</p>
      </section>
      {analysis.characters.length > 0 ? (
        <section className="rescue-report-card">
          <span>主要人物现在</span>
          <div className="rescue-character-grid">
            {analysis.characters.map((character) => (
              <div key={character.name} className="rescue-character">
                <strong>{character.name}</strong>
                <p>{character.state}</p>
                {character.goal ? <small>目标：{character.goal}</small> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {analysis.openThreads.length > 0 ? (
        <section className="rescue-report-card">
          <span>未回收线索</span>
          <ul className="rescue-list">
            {analysis.openThreads.map((thread) => (
              <li key={thread}>{thread}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="rescue-report-columns">
        {analysis.lastHook ? (
          <section className="rescue-report-card">
            <span>最后一章的钩子</span>
            <p>{analysis.lastHook}</p>
          </section>
        ) : null}
        {analysis.voice ? (
          <section className="rescue-report-card">
            <span>叙事与语言</span>
            <p>{analysis.voice}</p>
          </section>
        ) : null}
      </div>
      {analysis.risks.length > 0 ? (
        <section className="rescue-report-card rescue-risks">
          <span>继续写最容易崩的地方</span>
          <ul className="rescue-list">
            {analysis.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {analysis.direction ? (
        <section className="rescue-report-card rescue-direction">
          <span>建议的续写方向</span>
          <p>{analysis.direction}</p>
        </section>
      ) : null}
    </div>
  )
}

export function RescueModal({
  work,
  detail,
  chapters,
  analysisApi,
  analysisApiReady,
  writingApi,
  writingApiReady,
  onUpdateDetail,
  onAddChapter,
  onSnapshot,
  onOpenSettings,
  onToast,
  onRecordUsage,
  onClose,
}: RescueModalProps) {
  const [step, setStep] = useState<RescueStep>('analysis')
  const [depth, setDepth] = useState<RescueDepth>('quick')
  const [analysis, setAnalysis] = useState<RescueAnalysis | undefined>(detail.rescue?.analysis)
  const [plan, setPlan] = useState<RescuePlan | undefined>(detail.rescue?.plan)
  const [direction, setDirection] = useState(detail.rescue?.plan?.direction ?? '')
  const [editingPlan, setEditingPlan] = useState(false)
  const [draft, setDraft] = useState<RescueChapterDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const appliedRef = useRef(false)
  const batchCount = useMemo(() => buildRescueBatches(chapters).length, [chapters])
  const estimatedInput = useMemo(
    () =>
      estimateTokens(
        buildRescueContext({ work, detail, chapters, depth: 'quick' }),
      ),
    [work, detail, chapters],
  )

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const recording = (entry: AiUsageEntry) => onRecordUsage?.(entry)

  const saveAnalysis = (next: RescueAnalysis) => {
    setAnalysis(next)
    onUpdateDetail({
      rescue: {
        ...(detail.rescue ?? { updatedAt: Date.now() }),
        analysis: next,
        plan,
        updatedAt: Date.now(),
      },
    })
  }

  const savePlan = (next: RescuePlan) => {
    setPlan(next)
    onUpdateDetail({
      rescue: {
        ...(detail.rescue ?? { updatedAt: Date.now() }),
        analysis,
        plan: next,
        updatedAt: Date.now(),
      },
    })
  }

  const updatePlanChapter = (index: number, patch: Partial<RescuePlan['chapters'][number]>) => {
    if (!plan) return
    savePlan({
      ...plan,
      chapters: plan.chapters.map((chapter, chapterIndex) =>
        chapterIndex === index ? { ...chapter, ...patch } : chapter,
      ),
    })
  }

  const analyze = async () => {
    if (busy) return
    if (!analysisApiReady) {
      onToast('请先配置通用 AI 模型')
      onOpenSettings()
      return
    }
    setBusy(true)
    setError('')
    setProgress('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      let summaries = ''
      if (depth === 'full') {
        const batches = buildRescueBatches(chapters)
        for (let index = 0; index < batches.length; index += 1) {
          const batch = batches[index]
          setProgress(`全书梳理 ${index + 1} / ${batches.length}：第 ${batch.startChapter}–${batch.endChapter} 章`)
          let actualUsage: ChatUsage | undefined
          const batchMessages = buildRescueBatchMessages({
            work,
            chapters: batch.chapters,
            startChapter: batch.startChapter,
          })
          const summary = await runApiTask(analysisApi, {
            task: 'analysis.rescue',
            messages: batchMessages,
            signal: controller.signal,
            temperature: 0.2,
            maxTokens: 700,
            onUsage: (usage) => {
              actualUsage = usage
            },
          })
          summaries += `\n\n【第 ${batch.startChapter}–${batch.endChapter} 章】\n${parseRescueBatchSummary(summary)}`
          recording(
            usageEntry(
              analysisApi,
              '救书梳理',
              actualUsage?.inputTokens ??
                estimateTokens(batchMessages.map((message) => message.content).join('\n')),
              actualUsage?.outputTokens ?? estimateTokens(summary),
              Boolean(actualUsage),
              `《${work.title}》第 ${batch.startChapter}–${batch.endChapter} 章`,
            ),
          )
        }
      }
      setProgress('正在做续写诊断…')
      const messages = buildRescueAnalysisMessages({
        work,
        detail,
        chapters,
        depth,
        fullSummaries: summaries,
      })
      let analysisUsage: ChatUsage | undefined
      const response = await runApiTask(analysisApi, { task: 'analysis.rescue', messages,
        signal: controller.signal,
        temperature: 0.35,
        maxTokens: 1800,
        onUsage: (usage) => {
          analysisUsage = usage
        },
      })
      const parsed = parseRescueAnalysis(response, depth)
      if (!parsed) throw new Error('模型没有返回可解析的救援诊断 JSON，可以重试')
      saveAnalysis(parsed)
      recording(
        usageEntry(
          analysisApi,
          '救书诊断',
          analysisUsage?.inputTokens ??
            estimateTokens(messages.map((message) => message.content).join('\n')),
          analysisUsage?.outputTokens ?? estimateTokens(response),
          Boolean(analysisUsage),
          `《${work.title}》${depth === 'full' ? '全书分析' : '快速分析'}`,
        ),
      )
      onToast('续写诊断完成，请确认后生成方案')
    } catch (caught) {
      const message = controller.signal.aborted
        ? '已取消'
        : caught instanceof Error
          ? caught.message
          : '诊断失败'
      setError(message)
      if (message !== '已取消') onToast(`救书诊断失败：${message}`)
    } finally {
      abortRef.current = null
      setBusy(false)
      setProgress('')
    }
  }

  const generatePlan = async () => {
    if (busy) return
    if (!analysis || !analysisApiReady) {
      if (!analysisApiReady) onOpenSettings()
      return
    }
    setBusy(true)
    setError('')
    setProgress('正在制定 3 章救援方案…')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const messages = buildRescuePlanMessages({
        work,
        detail,
        chapters,
        analysis,
        direction,
      })
      let usage: ChatUsage | undefined
      const response = await runApiTask(analysisApi, { task: 'analysis.rescue', messages,
        signal: controller.signal,
        temperature: 0.45,
        maxTokens: 1600,
        onUsage: (next) => {
          usage = next
        },
      })
      const parsed = parseRescuePlan(response, direction)
      if (!parsed) throw new Error('模型没有返回可解析的救援大纲 JSON，可以重试')
      savePlan(parsed)
      recording(
        usageEntry(
          analysisApi,
          '救书方案',
          usage?.inputTokens ?? estimateTokens(messages.map((message) => message.content).join('\n')),
          usage?.outputTokens ?? estimateTokens(response),
          Boolean(usage),
          `《${work.title}》3 章救援大纲`,
        ),
      )
      setStep('plan')
      onToast('救援大纲已生成')
    } catch (caught) {
      const message = controller.signal.aborted
        ? '已取消'
        : caught instanceof Error
          ? caught.message
          : '方案生成失败'
      setError(message)
      if (message !== '已取消') onToast(`救援方案失败：${message}`)
    } finally {
      abortRef.current = null
      setBusy(false)
      setProgress('')
    }
  }

  const generateChapter = async () => {
    if (busy) return
    if (!analysis) return
    if (!writingApiReady) {
      onToast('请先配置写作 AI 模型')
      onOpenSettings()
      return
    }
    setBusy(true)
    setError('')
    setProgress('正在写下一章…')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const messages = buildRescueChapterMessages({
        work,
        detail,
        chapters,
        analysis,
        plan,
        direction,
      })
      let usage: ChatUsage | undefined
      const response = await runApiTask(writingApi, { task: 'writing.continue', messages,
        signal: controller.signal,
        temperature: 0.75,
        maxTokens: 5000,
        onUsage: (next) => {
          usage = next
        },
      })
      const parsed = parseRescueChapter(
        response,
        `第 ${chapters.length + 1} 章`,
      )
      if (!parsed) throw new Error('模型没有返回可用的章节正文，可以重试')
      setDraft(parsed)
      setStep('draft')
      recording(
        usageEntry(
          writingApi,
          '救书续写',
          usage?.inputTokens ?? estimateTokens(messages.map((message) => message.content).join('\n')),
          usage?.outputTokens ?? estimateTokens(response),
          Boolean(usage),
          `《${work.title}》救书续写`,
        ),
      )
      onToast('下一章草稿已生成，请确认后加入作品')
    } catch (caught) {
      const message = controller.signal.aborted
        ? '已取消'
        : caught instanceof Error
          ? caught.message
          : '续写失败'
      setError(message)
      if (message !== '已取消') onToast(`续写失败：${message}`)
    } finally {
      abortRef.current = null
      setBusy(false)
      setProgress('')
    }
  }

  const applyDraft = () => {
    if (!draft || appliedRef.current) return
    const content = draft.content.trim()
    if (!content) {
      onToast('草稿没有正文')
      return
    }
    appliedRef.current = true
    onSnapshot('救书续写前快照')
    onAddChapter({ ...draft, content })
    onToast(`已新增：${draft.title}（${countWords(content).toLocaleString()} 字）`)
    onClose()
  }

  const cancel = () => {
    abortRef.current?.abort()
    setBusy(false)
    setProgress('')
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
        退出
      </button>
      {busy ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={cancel}>
          <IconStop size={13} />
          取消生成
        </button>
      ) : null}
      {step === 'analysis' && analysis ? (
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={analyze}>
            重新分析
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void generatePlan()}>
            生成续写方案
            <IconChevronRight size={14} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void generateChapter()}>
            直接写下一章
          </button>
        </>
      ) : step === 'plan' ? (
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('analysis')}>
            返回诊断
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void generatePlan()}>
            重新生成
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void generateChapter()}>
            写下一章
            <IconChevronRight size={14} />
          </button>
        </>
      ) : step === 'draft' && draft ? (
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('analysis')}>
            返回诊断
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void generateChapter()}>
            重新生成
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={applyDraft}>
            加入作品
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !analysisApiReady}
          onClick={() => void analyze()}
        >
          {busy ? '分析中…' : '开始分析'}
        </button>
      )}
    </>
  )

  return (
    <Modal
      title="续写救援"
      subtitle={`《${work.title}》· 从最后一章继续，不覆盖已有正文`}
      size="lg"
      onClose={onClose}
      footer={footer}
    >
      <div className="rescue-modal">
        <div className="rescue-steps">
          {[
            ['analysis', '1', '故事诊断'],
            ['plan', '2', '续写方案'],
            ['draft', '3', '生成章节'],
          ].map(([id, number, label]) => (
            <button
              type="button"
              key={id}
              className={`rescue-step ${step === id ? 'active' : ''}`}
              onClick={() => {
                if (id === 'analysis' || (id === 'plan' && analysis) || (id === 'draft' && draft)) {
                  setStep(id as RescueStep)
                }
              }}
            >
              <span>{number}</span>
              {label}
            </button>
          ))}
        </div>

        {progress ? (
          <div className="rescue-progress">
            <span />
            <p>{progress}</p>
          </div>
        ) : null}
        {error ? (
          <div className="rescue-error" role="alert">
            <span>{error}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setError('')}>
              知道了
            </button>
          </div>
        ) : null}

        {step === 'analysis' ? (
          <div className="rescue-analysis">
            <RescueStatsGrid chapters={chapters} />
            {!analysis ? (
              <>
                <div className="rescue-depth">
                  <button
                    type="button"
                    className={depth === 'quick' ? 'active' : ''}
                    onClick={() => setDepth('quick')}
                  >
                    <strong>快速分析</strong>
                    <span>最后 5 章正文 + 全书标题索引 + 设定</span>
                    <small>适合先快速判断怎么续</small>
                  </button>
                  <button
                    type="button"
                    className={depth === 'full' ? 'active' : ''}
                    onClick={() => setDepth('full')}
                  >
                    <strong>全书深读</strong>
                    <span>分批梳理全部章节，再做诊断</span>
                    <small>{batchCount} 次梳理调用，较慢，费用更高</small>
                  </button>
                </div>
                <p className="rescue-hint">
                  分析只读取作品正文和设定，不修改内容。没有文风卡时会根据正文判断语气；没有结构化人物时只从正文推断。
                  <br />
                  快速分析预计输入约 {estimatedInput.toLocaleString()} tokens；实际用量以模型返回为准。
                </p>
                <button
                  type="button"
                  className="btn btn-primary rescue-analyze-btn"
                  disabled={busy || !analysisApiReady}
                  onClick={() => void analyze()}
                >
                  <IconSparkles size={15} />
                  {busy ? '分析中…' : analysisApiReady ? '开始诊断' : '先配置通用 AI'}
                </button>
              </>
            ) : (
              <AnalysisReport analysis={analysis} />
            )}
          </div>
        ) : null}

        {step === 'plan' ? (
          <div className="rescue-plan">
            {analysis ? <AnalysisReport analysis={analysis} /> : null}
            <label className="rescue-direction-field">
              <span>你希望往哪个方向续写？（可选）</span>
              <textarea
                className="input drawer-textarea"
                rows={2}
                value={direction}
                placeholder="例如：继续查旧案，不要急着揭开真相；这一卷先把姐姐的线收回来。"
                onChange={(event) => setDirection(event.target.value)}
              />
            </label>
            {plan ? (
              <>
                <div className="rescue-plan-head">
                  <span>未来 {plan.chapters.length} 章</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditingPlan((prev) => !prev)}
                  >
                    {editingPlan ? '完成编辑' : '编辑方案'}
                  </button>
                </div>
                <div className="rescue-plan-list">
                  {plan.chapters.map((chapter, index) =>
                    editingPlan ? (
                      <article className="rescue-plan-card rescue-plan-card-edit" key={`${chapter.title}-${index}`}>
                        <input
                          className="input drawer-input"
                          value={chapter.title}
                          aria-label={`第 ${index + 1} 章标题`}
                          onChange={(event) => updatePlanChapter(index, { title: event.target.value })}
                        />
                        <textarea
                          className="input drawer-textarea"
                          rows={2}
                          value={chapter.goal}
                          placeholder="本章目标"
                          onChange={(event) => updatePlanChapter(index, { goal: event.target.value })}
                        />
                        <textarea
                          className="input drawer-textarea"
                          rows={2}
                          value={chapter.conflict}
                          placeholder="核心冲突"
                          onChange={(event) => updatePlanChapter(index, { conflict: event.target.value })}
                        />
                        <textarea
                          className="input drawer-textarea"
                          rows={2}
                          value={chapter.reveal}
                          placeholder="关键信息 / 反转"
                          onChange={(event) => updatePlanChapter(index, { reveal: event.target.value })}
                        />
                        <textarea
                          className="input drawer-textarea"
                          rows={2}
                          value={chapter.hook}
                          placeholder="章末钩子"
                          onChange={(event) => updatePlanChapter(index, { hook: event.target.value })}
                        />
                      </article>
                    ) : (
                      <article className="rescue-plan-card" key={`${chapter.title}-${index}`}>
                        <strong>{chapter.title}</strong>
                        <p>{chapter.goal}</p>
                        <small>冲突：{chapter.conflict}</small>
                        <small>信息变化：{chapter.reveal}</small>
                        <small>章末钩子：{chapter.hook}</small>
                        {chapter.threads.length > 0 ? (
                          <div className="rescue-plan-threads">
                            {chapter.threads.map((thread) => (
                              <span key={thread}>{thread}</span>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ),
                  )}
                </div>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void generatePlan()}
              >
                生成 3 章方案
              </button>
            )}
          </div>
        ) : null}

        {step === 'draft' && draft ? (
          <div className="rescue-draft">
            <div className="rescue-draft-head">
              <div>
                <span>下一章预览</span>
                <p>确认后才会新增章节；不会覆盖最后一章。</p>
              </div>
              <strong>{countWords(draft.content).toLocaleString()} 字</strong>
            </div>
            <label className="rescue-draft-field">
              <span>章节标题</span>
              <input
                className="input drawer-input"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>
            <label className="rescue-draft-field">
              <span>正文</span>
              <textarea
                className="input drawer-textarea rescue-draft-text"
                value={draft.content}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
              />
            </label>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
