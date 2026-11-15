import { useMemo, useState } from 'react'
import type { AiUsageEntry, Chapter, Work, WorkDetail } from '../types'
import type { AiRequestObservation } from '../ai'
import { formatWords } from '../utils'
import { downloadTextFile } from '../backup'
import {
  activityHourHistogram,
  aggregateDimension,
  aiContribution,
  budgetSnapshot,
  buildUsageDailyFromEntries,
  chapterCostStats,
  completionForecast,
  computeWorkStats,
  dailyUsageSeries,
  dateKeysBack,
  dateRangeKeys,
  filterUsageBuckets,
  formatCompactNumber,
  formatMoney,
  localDateKey,
  monthCost,
  requestQuality,
  shortDateLabel,
  sumUsageBuckets,
  writingDaySeries,
  writingSessions,
  writingStreak,
  type DailyPoint,
  type DimensionStat,
  type StatsBudget,
  type UsageDailyBucket,
  type WritingActivityEntry,
  type WritingDailySnapshot,
} from '../stats'
import { IconArrowLeft, IconDownload } from './Icons'

interface StatsViewProps {
  works: Work[]
  chaptersByWork: Record<string, Chapter[]>
  detailsByWork: Record<string, WorkDetail>
  usage: AiUsageEntry[]
  usageDaily: UsageDailyBucket[]
  writingDaily: WritingDailySnapshot[]
  writingActivity: WritingActivityEntry[]
  aiRequests: AiRequestObservation[]
  budget: StatsBudget
  onBudgetChange: (budget: StatsBudget) => void
  onOpenWork: (id: string) => void
  onBack: () => void
}

type RangeOption = 7 | 30 | 90 | 365 | 0

const RANGE_OPTIONS: { value: RangeOption; label: string }[] = [
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
  { value: 365, label: '近一年' },
  { value: 0, label: '全部' },
]

const CHART_COLORS = ['#d9a35f', '#73a5c6', '#8fbd8a', '#c68b9d', '#a99ac7', '#c9a878', '#8f9aab']
const LINE_COLORS = { cost: '#d9a35f', tokens: '#73a5c6', words: '#8fbd8a' }

function csvEscape(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function LineChart({
  data,
  color,
  formatValue,
  height = 170,
}: {
  data: DailyPoint[]
  color: string
  formatValue: (value: number) => string
  height?: number
}) {
  const width = 720
  const padding = { top: 12, right: 10, bottom: 22, left: 48 }
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const max = Math.max(1, ...data.map((point) => point.value))
  const points = data.map((point, index) => {
    const x = padding.left + (data.length <= 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth)
    const y = padding.top + innerHeight - (point.value / max) * innerHeight
    return { ...point, x, y }
  })
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
  const areaPath = points.length
    ? `${path} L ${points[points.length - 1].x.toFixed(2)} ${padding.top + innerHeight} L ${points[0].x.toFixed(2)} ${padding.top + innerHeight} Z`
    : ''
  const labelStep = Math.max(1, Math.ceil(points.length / 6))
  const yLabels = [0, 0.5, 1]

  return (
    <svg
      className="stats-line-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="趋势折线图"
    >
      {yLabels.map((ratio) => {
        const y = padding.top + innerHeight - ratio * innerHeight
        return (
          <g key={ratio}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="3 5"
            />
            <text x={padding.left - 8} y={y + 3} textAnchor="end">
              {formatValue(max * ratio)}
            </text>
          </g>
        )
      })}
      {areaPath ? (
        <defs>
          <linearGradient id={`stats-fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      ) : null}
      {areaPath ? (
        <path d={areaPath} fill={`url(#stats-fill-${color.replace('#', '')})`} />
      ) : null}
      {points.length > 0 ? (
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      ) : null}
      {points.map((point) => (
        <circle key={point.date} cx={point.x} cy={point.y} r="2" fill={color}>
          <title>
            {point.date} · {formatValue(point.value)}
          </title>
        </circle>
      ))}
      {points.map((point, index) =>
        index % labelStep === 0 || index === points.length - 1 ? (
          <text key={`label-${point.date}`} x={point.x} y={height - 4} textAnchor="middle">
            {shortDateLabel(point.date)}
          </text>
        ) : null,
      )}
    </svg>
  )
}

function HorizontalBars({
  items,
  formatValue,
}: {
  items: DimensionStat[]
  formatValue: (value: number) => string
}) {
  const max = Math.max(1, ...items.map((item) => item.cost))
  if (items.length === 0) return <p className="stats-empty">暂无数据</p>
  return (
    <div className="stats-bars">
      {items.slice(0, 8).map((item, index) => (
        <div className="stats-bar-row" key={item.key}>
          <span title={item.label}>{item.label}</span>
          <div className="stats-bar-track">
            <i style={{ width: `${Math.max(2, (item.cost / max) * 100)}%`, background: CHART_COLORS[index % CHART_COLORS.length] }} />
          </div>
          <strong>{formatValue(item.cost)}</strong>
        </div>
      ))}
    </div>
  )
}

function DonutChart({ items, formatValue }: { items: DimensionStat[]; formatValue: (value: number) => string }) {
  const total = items.reduce((sum, item) => sum + item.cost, 0)
  if (items.length === 0 || total <= 0) return <p className="stats-empty">暂无费用数据</p>
  let cursor = 0
  const gradient = items
    .slice(0, 7)
    .map((item, index) => {
      const start = cursor
      cursor += (item.cost / total) * 100
      return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${cursor}%`
    })
    .join(', ')
  return (
    <div className="stats-donut-wrap">
      <div className="stats-donut" style={{ background: `conic-gradient(${gradient})` }}>
        <div>
          <strong>{formatValue(total)}</strong>
          <span>总费用</span>
        </div>
      </div>
      <div className="stats-legend">
        {items.slice(0, 7).map((item, index) => (
          <div key={item.key}>
            <i style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
            <span>{item.label}</span>
            <strong>{formatValue(item.cost)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function Heatmap({ data }: { data: DailyPoint[] }) {
  const max = Math.max(1, ...data.map((point) => point.value))
  return (
    <div className="stats-heatmap-wrap">
      <div className="stats-heatmap">
        {data.map((point) => {
          const ratio = point.value / max
          return (
            <span
              key={point.date}
              className={point.value > 0 ? 'active' : ''}
              style={{ opacity: point.value > 0 ? 0.2 + ratio * 0.8 : 0.12 }}
              title={`${point.date} · ${point.value} 字`}
            />
          )
        })}
      </div>
      <div className="stats-heatmap-legend">
        <span>少</span>
        {[0.2, 0.4, 0.6, 0.8, 1].map((value) => (
          <i key={value} style={{ opacity: value }} />
        ))}
        <span>多</span>
      </div>
    </div>
  )
}

export function StatsView({
  works,
  chaptersByWork,
  detailsByWork,
  usage,
  usageDaily,
  writingDaily,
  writingActivity,
  aiRequests,
  budget,
  onBudgetChange,
  onOpenWork,
  onBack,
}: StatsViewProps) {
  const [range, setRange] = useState<RangeOption>(30)
  const [workFilter, setWorkFilter] = useState('all')
  const [budgetDraft, setBudgetDraft] = useState(String(budget.monthlyBudget || ''))

  const effectiveDaily = useMemo(
    () => (usageDaily.length > 0 ? usageDaily : buildUsageDailyFromEntries(usage)),
    [usage, usageDaily],
  )
  const toDate = localDateKey()
  const allDates = [...effectiveDaily.map((bucket) => bucket.date), ...writingDaily.map((snapshot) => snapshot.date)]
  const allFromDate = allDates.length > 0 ? [...allDates].sort()[0] : localDateKey(Date.now() - 365 * 86400000)
  const rangeDays =
    range === 0
      ? Math.max(1, dateRangeKeys(allFromDate, toDate).length)
      : Math.min(366, range)
  const fromDate = range === 0 ? allFromDate : dateKeysBack(range, Date.now())[0]
  const selectedWork = workFilter === 'all' ? undefined : workFilter

  const filteredBuckets = useMemo(
    () => filterUsageBuckets(effectiveDaily, { fromDate, toDate, workId: selectedWork }),
    [effectiveDaily, fromDate, selectedWork, toDate],
  )
  const allTimeBuckets = useMemo(
    () => (selectedWork ? effectiveDaily.filter((bucket) => bucket.workId === selectedWork) : effectiveDaily),
    [effectiveDaily, selectedWork],
  )
  const totals = useMemo(() => sumUsageBuckets(filteredBuckets), [filteredBuckets])
  const allTotals = useMemo(() => sumUsageBuckets(allTimeBuckets), [allTimeBuckets])
  const workStats = useMemo(
    () =>
      computeWorkStats({
        works,
        chaptersByWork,
        detailsByWork,
        buckets: filteredBuckets,
      }),
    [chaptersByWork, detailsByWork, filteredBuckets, works],
  )
  const visibleWorkStats = selectedWork
    ? workStats.filter((item) => item.work.id === selectedWork)
    : workStats
  const totalWords = visibleWorkStats.reduce((sum, item) => sum + item.words, 0)
  const totalChapters = visibleWorkStats.reduce((sum, item) => sum + item.chapters, 0)
  const completedChapters = visibleWorkStats.reduce((sum, item) => sum + item.completedChapters, 0)
  const totalCost = totals.cost
  const costPerThousand = totalWords > 0 ? (totalCost / totalWords) * 1000 : 0
  const dailyCost = useMemo(
    () => dailyUsageSeries(filteredBuckets, fromDate, toDate),
    [filteredBuckets, fromDate, toDate],
  )
  const dailyTokens = useMemo(() => {
    const map = new Map<string, number>()
    for (const key of dateRangeKeys(fromDate, toDate)) map.set(key, 0)
    for (const bucket of filteredBuckets) {
      map.set(bucket.date, (map.get(bucket.date) ?? 0) + bucket.inputTokens + bucket.outputTokens)
    }
    return [...map.entries()].map(([date, value]) => ({ date, value }))
  }, [filteredBuckets, fromDate, toDate])
  const wordsSeries = useMemo(
    () => writingDaySeries(writingDaily, Math.min(366, rangeDays), selectedWork),
    [rangeDays, selectedWork, writingDaily],
  )
  const totalRangeWords = wordsSeries.reduce((sum, point) => sum + point.value, 0)
  const activeDays = wordsSeries.filter((point) => point.value > 0).length
  const avgWordsPerActiveDay = activeDays > 0 ? Math.round(totalRangeWords / activeDays) : 0
  const streak = writingStreak(writingDaily, selectedWork)
  const featureStats = useMemo(() => aggregateDimension(filteredBuckets, 'kind'), [filteredBuckets])
  const modelStats = useMemo(() => aggregateDimension(filteredBuckets, 'model'), [filteredBuckets])
  const chapters = useMemo(
    () => chapterCostStats({ works, chaptersByWork, buckets: filteredBuckets }),
    [chaptersByWork, filteredBuckets, works],
  )
  const sessions = useMemo(() => {
    const from = new Date(`${fromDate}T00:00:00`).getTime()
    const to = new Date(`${toDate}T23:59:59`).getTime()
    return writingSessions(
      writingActivity.filter(
        (event) =>
          event.at >= from &&
          event.at <= to &&
          (!selectedWork || event.workId === selectedWork),
      ),
    )
  }, [fromDate, selectedWork, toDate, writingActivity])
  const activeMinutes = sessions.reduce((sum, session) => sum + session.minutes, 0)
  const hourly = useMemo(
    () =>
      activityHourHistogram(
        writingActivity.filter((event) => !selectedWork || event.workId === selectedWork),
      ),
    [selectedWork, writingActivity],
  )
  const monthSpent = monthCost(effectiveDaily)
  const budgetState = budgetSnapshot(effectiveDaily, budget)
  const wordsPerDay = rangeDays > 0 ? totalRangeWords / Math.max(1, activeDays || rangeDays) : 0
  const forecast = completionForecast({
    words: visibleWorkStats.reduce((sum, item) => sum + item.words, 0),
    targetWords: visibleWorkStats.reduce((sum, item) => sum + item.targetWords, 0),
    wordsPerDay,
    costPerThousandWords: costPerThousand,
  })
  const contribution = aiContribution({
    totalWords,
    outputTokens: allTotals.outputTokens,
  })
  const rangeStart = new Date(`${fromDate}T00:00:00`).getTime()
  const rangeEnd = new Date(`${toDate}T23:59:59`).getTime()
  const rangeRequests = aiRequests.filter(
    (request) => request.at >= rangeStart && request.at <= rangeEnd,
  )
  const quality = requestQuality(rangeRequests)
  const actualRatio =
    totals.calls > 0 ? Math.round((totals.actualCalls / totals.calls) * 100) : 0
  const tokensTotal = totals.inputTokens + totals.outputTokens
  const heatmapData = useMemo(
    () => writingDaySeries(writingDaily, range === 0 ? 365 : Math.min(365, Math.max(90, rangeDays)), selectedWork),
    [range, rangeDays, selectedWork, writingDaily],
  )

  const saveBudget = () => {
    const value = Math.max(0, Number(budgetDraft) || 0)
    onBudgetChange({ ...budget, monthlyBudget: Math.round(value * 100) / 100 })
  }

  const exportDaily = () => {
    const header = ['date', 'cost', 'tokens', 'words']
    const tokenMap = new Map(dailyTokens.map((point) => [point.date, point.value]))
    const wordMap = new Map(wordsSeries.map((point) => [point.date, point.value]))
    const rows = dateRangeKeys(fromDate, toDate).map((date) => [
      date,
      dailyCost.find((point) => point.date === date)?.value ?? 0,
      tokenMap.get(date) ?? 0,
      wordMap.get(date) ?? 0,
    ])
    downloadTextFile(
      `shuoxi-stats-daily-${toDate}.csv`,
      [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n'),
      'text/csv',
    )
  }

  const exportBooks = () => {
    const header = ['书名', '字数', '章节', '完成章节', '计划章节', '目标字数', '进度', 'tokens', '费用', '每千字费用']
    const rows = visibleWorkStats.map((item) => [
      item.work.title,
      item.words,
      item.chapters,
      item.completedChapters,
      item.plannedChapters,
      item.targetWords,
      `${item.progress}%`,
      item.tokens,
      item.cost,
      item.costPerThousandWords,
    ])
    downloadTextFile(
      `shuoxi-stats-books-${toDate}.csv`,
      [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n'),
      'text/csv',
    )
  }

  const exportUsage = () => {
    const header = ['time', 'book', 'chapter', 'kind', 'model', 'input', 'output', 'cost', 'actual']
    const workNames = new Map(works.map((work) => [work.id, work.title]))
    const chapterNames = new Map<string, string>()
    for (const work of works) {
      for (const chapter of chaptersByWork[work.id] ?? []) {
        chapterNames.set(`${work.id}:${chapter.id}`, chapter.title)
      }
    }
    const rows = usage
      .filter((entry) => {
        if (selectedWork && entry.workId !== selectedWork) return false
        const date = localDateKey(entry.at)
        return date >= fromDate && date <= toDate
      })
      .slice(0, 2000)
      .map((entry) => [
        new Date(entry.at).toISOString(),
        entry.workId ? workNames.get(entry.workId) ?? entry.workId : '',
        entry.workId && entry.chapterId
          ? chapterNames.get(`${entry.workId}:${entry.chapterId}`) ?? entry.chapterId
          : '',
        entry.kind,
        entry.model,
        entry.inputTokens,
        entry.outputTokens,
        entry.cost ?? '',
        entry.actual ? 'actual' : 'estimated',
      ])
    downloadTextFile(
      `shuoxi-stats-usage-${toDate}.csv`,
      [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n'),
      'text/csv',
    )
  }

  return (
    <div className="stats-page">
      <header className="stats-topbar">
        <button type="button" className="stats-back" onClick={onBack}>
          <IconArrowLeft size={16} />
          书库
        </button>
        <div>
          <span className="stats-eyebrow">创作总览</span>
          <h1>创作统计</h1>
          <p>写作进度、AI 成本、模型与每日趋势都在这里。</p>
        </div>
        <div className="stats-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportDaily}>
            <IconDownload size={14} />
            每日 CSV
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportBooks}>
            <IconDownload size={14} />
            书目 CSV
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportUsage}>
            <IconDownload size={14} />
            明细 CSV
          </button>
        </div>
      </header>

      <div className="stats-filterbar">
        <div className="stats-range-tabs">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={range === option.value ? 'active' : ''}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <select
          className="input select"
          value={workFilter}
          onChange={(event) => setWorkFilter(event.target.value)}
          aria-label="筛选作品"
        >
          <option value="all">全部作品</option>
          {works.map((work) => (
            <option key={work.id} value={work.id}>
              {work.title}
            </option>
          ))}
        </select>
        <span className="stats-filter-note">
          {fromDate} 至 {toDate} · {filteredBuckets.reduce((sum, bucket) => sum + bucket.calls, 0)} 次 AI 调用
        </span>
      </div>

      <div className="stats-kpis">
        <div>
          <span>总字数</span>
          <strong>{formatWords(totalWords)}</strong>
          <small>{totalChapters} 章 · {completedChapters} 章已完成</small>
        </div>
        <div>
          <span>区间写作</span>
          <strong>{formatWords(totalRangeWords)}</strong>
          <small>{activeDays} 个活跃日 · 日均 {formatWords(avgWordsPerActiveDay)}</small>
        </div>
        <div>
          <span>连续写作</span>
          <strong>{streak} 天</strong>
          <small>按每日净增字数</small>
        </div>
        <div>
          <span>区间写作费用</span>
          <strong>{formatMoney(totalCost, budget.currency)}</strong>
          <small>{tokensTotal.toLocaleString()} tokens · 仅写作 AI</small>
        </div>
        <div>
          <span>每千字成本</span>
          <strong>{formatMoney(costPerThousand, budget.currency)}</strong>
          <small>按当前区间和筛选</small>
        </div>
        <div>
          <span>本月费用</span>
          <strong>{formatMoney(monthSpent, budget.currency)}</strong>
          <small>{budget.monthlyBudget > 0 ? `预算 ${formatMoney(budget.monthlyBudget, budget.currency)}` : '未设置预算'}</small>
        </div>
        <div>
          <span>AI 产出估算</span>
          <strong>{formatCompactNumber(contribution.estimatedWords)}</strong>
          <small>按输出 token 估算，含重试与未采用内容</small>
        </div>
        <div>
          <span>实际 usage</span>
          <strong>{actualRatio}%</strong>
          <small>{totals.estimatedCalls} 次为本地估算</small>
        </div>
      </div>

      <div className="stats-grid stats-grid-2">
        <section className="stats-card">
          <header>
            <div>
              <h2>每日费用</h2>
              <span>按请求发生时间汇总 · {budget.currency}</span>
            </div>
            <strong>{formatMoney(totalCost, budget.currency)}</strong>
          </header>
          <LineChart data={dailyCost} color={LINE_COLORS.cost} formatValue={(value) => formatMoney(value, budget.currency)} />
        </section>

        <section className="stats-card">
          <header>
            <div>
              <h2>每日 tokens</h2>
              <span>输入 + 输出</span>
            </div>
            <strong>{formatCompactNumber(tokensTotal)}</strong>
          </header>
          <LineChart data={dailyTokens} color={LINE_COLORS.tokens} formatValue={formatCompactNumber} />
        </section>

        <section className="stats-card">
          <header>
            <div>
              <h2>每日写作字数</h2>
              <span>按作品日快照计算净增</span>
            </div>
            <strong>{formatWords(totalRangeWords)}</strong>
          </header>
          <LineChart data={wordsSeries} color={LINE_COLORS.words} formatValue={formatCompactNumber} />
        </section>

        <section className="stats-card">
          <header>
            <div>
              <h2>AI 费用构成</h2>
              <span>按功能拆分</span>
            </div>
          </header>
          <DonutChart items={featureStats} formatValue={(value) => formatMoney(value, budget.currency)} />
        </section>
      </div>

      <div className="stats-grid stats-grid-3">
        <section className="stats-card stats-budget-card">
          <header>
            <div>
              <h2>月度预算</h2>
              <span>本地计算，不调用 AI</span>
            </div>
          </header>
          <div className="stats-budget-input">
            <span>{budget.currency}</span>
            <input
              className="input"
              type="number"
              min={0}
              value={budgetDraft}
              onChange={(event) => setBudgetDraft(event.target.value)}
              placeholder="例如 50"
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={saveBudget}>
              保存
            </button>
          </div>
          <label className="stats-budget-mode">
            <span>超限行为</span>
            <select
              className="input select"
              value={budget.budgetMode ?? 'off'}
              onChange={(event) =>
                onBudgetChange({
                  ...budget,
                  budgetMode: event.target.value as StatsBudget['budgetMode'],
                })
              }
            >
              <option value="off">只统计</option>
              <option value="warn">提醒</option>
              <option value="block">硬停止</option>
            </select>
          </label>
          <div className="stats-budget-track">
            <span style={{ width: `${budgetState.ratio}%` }} />
          </div>
          <div className="stats-budget-meta">
            <span>{formatMoney(budgetState.spent, budget.currency)} 已用</span>
            <span>{budget.monthlyBudget > 0 ? `${budgetState.ratio.toFixed(0)}%` : '未设置'}</span>
          </div>
          {budget.monthlyBudget > 0 ? (
            <p className={`stats-budget-hint ${budgetState.overBudget ? 'warn' : ''}`}>
              按当前速度预计本月 {formatMoney(budgetState.projected, budget.currency)}
              {budgetState.overBudget ? '，可能超出预算' : '，在预算内'}
            </p>
          ) : (
            <p className="stats-budget-hint">设置预算后可以看到月底预测和超支提醒。</p>
          )}
        </section>

        <section className="stats-card">
          <header>
            <div>
              <h2>完本预测</h2>
              <span>按当前区间速度估算</span>
            </div>
          </header>
          <div className="stats-forecast">
            <strong>
              {forecast.days === null ? '还缺写作数据' : forecast.days === 0 ? '已达到目标' : `${forecast.days} 天`}
            </strong>
            <span>预计完本时间</span>
            <p>
              还需 {formatWords(forecast.remainingWords)}
              {forecast.cost === null ? '' : ` · 约 ${formatMoney(forecast.cost, budget.currency)}`}
            </p>
          </div>
        </section>

        <section className="stats-card">
          <header>
            <div>
              <h2>写作时段</h2>
              <span>按本地时间统计</span>
            </div>
          </header>
          <div className="stats-hour-bars">
            {hourly.map((point) => {
              const max = Math.max(1, ...hourly.map((item) => item.value))
              return (
                <div key={point.date} title={`${point.date}:00 · ${point.value} 字`}>
                  <i style={{ height: `${Math.max(3, (point.value / max) * 100)}%` }} />
                  <span>{Number(point.date) % 6 === 0 ? point.date : ''}</span>
                </div>
              )
            })}
          </div>
          <p className="stats-footnote">累计写作 {activeMinutes} 分钟 · {sessions.length} 个写作片段</p>
        </section>
      </div>

      <div className="stats-grid stats-grid-2">
        <section className="stats-card">
          <header>
            <div>
              <h2>模型费用</h2>
              <span>按模型汇总</span>
            </div>
          </header>
          <HorizontalBars items={modelStats} formatValue={(value) => formatMoney(value, budget.currency)} />
        </section>

        <section className="stats-card">
          <header>
            <div>
              <h2>调用质量</h2>
              <span>usage 与估算来源</span>
            </div>
          </header>
          <div className="stats-quality">
            <div>
              <strong>{totals.calls}</strong>
              <span>成功用量</span>
            </div>
            <div>
              <strong>{quality.total}</strong>
              <span>请求总数</span>
            </div>
            <div>
              <strong>{quality.failed}</strong>
              <span>失败请求</span>
            </div>
            <div>
              <strong>{quality.failureRate.toFixed(1)}%</strong>
              <span>失败率</span>
            </div>
            <div>
              <strong>{Math.round(quality.averageLatencyMs)}ms</strong>
              <span>平均延迟</span>
            </div>
            <div>
              <strong>{totals.actualCalls}</strong>
              <span>真实 usage</span>
            </div>
            <div>
              <strong>
                {totals.inputTokens > 0
                  ? `${Math.round((totals.cachedInputTokens / totals.inputTokens) * 100)}%`
                  : '—'}
              </strong>
              <span>缓存命中</span>
            </div>
            <div>
              <strong>{totals.estimatedCalls}</strong>
              <span>本地估算</span>
            </div>
            <div>
              <strong>{totals.unknownCostCalls}</strong>
              <span>未配置价格</span>
            </div>
          </div>
          <p className="stats-footnote">
            请求总数来自 AI 请求层观察器；失败请求通常没有 usage，暂不计入费用。重试会在请求层显示为多次请求。
          </p>
        </section>
      </div>

      <section className="stats-card stats-card-wide">
        <header>
          <div>
            <h2>写作日历</h2>
            <span>颜色越亮表示当天净增字数越多</span>
          </div>
          <strong>{streak} 天连续</strong>
        </header>
        <Heatmap data={heatmapData} />
      </section>

      <section className="stats-card stats-card-wide">
        <header>
          <div>
            <h2>每本书</h2>
            <span>进度、费用和每千字成本</span>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportBooks}>
            <IconDownload size={14} />
            导出
          </button>
        </header>
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>书名</th>
                <th>字数</th>
                <th>章节</th>
                <th>完成</th>
                <th>计划</th>
                <th>目标进度</th>
                <th>tokens</th>
                <th>费用</th>
                <th>每千字</th>
                <th>最近更新</th>
              </tr>
            </thead>
            <tbody>
              {visibleWorkStats
                .sort((a, b) => b.cost - a.cost || b.words - a.words)
                .map((item) => (
                  <tr key={item.work.id} onClick={() => onOpenWork(item.work.id)}>
                    <td>
                      <strong>{item.work.title}</strong>
                      <small>{item.work.status}</small>
                    </td>
                    <td>{formatWords(item.words)}</td>
                    <td>{item.chapters}</td>
                    <td>{item.completedChapters}</td>
                    <td>{item.plannedChapters || '—'}</td>
                    <td>
                      <span className="stats-progress">
                        <i style={{ width: `${item.progress}%` }} />
                      </span>
                      {item.progress}%
                    </td>
                    <td>{formatCompactNumber(item.tokens)}</td>
                    <td>{formatMoney(item.cost, budget.currency)}</td>
                    <td>{formatMoney(item.costPerThousandWords, budget.currency)}</td>
                    <td>{new Date(item.lastUpdated).toLocaleDateString('zh-CN')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stats-card stats-card-wide">
        <header>
          <div>
            <h2>章节成本</h2>
            <span>只有带章节归属的调用能计入；未归属调用保留在作品总费用里</span>
          </div>
          <small>{chapters.length} 章有记录</small>
        </header>
        {chapters.length === 0 ? (
          <p className="stats-empty">当前区间还没有带章节归属的 AI 调用。</p>
        ) : (
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>作品</th>
                  <th>章节</th>
                  <th>字数</th>
                  <th>费用</th>
                  <th>tokens</th>
                  <th>调用</th>
                </tr>
              </thead>
              <tbody>
                {chapters.slice(0, 20).map((item) => (
                  <tr key={`${item.workId}-${item.chapterId}`}>
                    <td>{item.workTitle}</td>
                    <td>{item.chapterTitle}</td>
                    <td>{formatWords(item.words)}</td>
                    <td>{formatMoney(item.cost, budget.currency)}</td>
                    <td>{formatCompactNumber(item.tokens)}</td>
                    <td>{item.calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="stats-footnote stats-footnote-bottom">
        全部统计均在本地计算。费用按调用时配置的输入 / 输出价格估算；未配置价格或服务商未返回 usage 的调用会单独标记，不会伪装成 0 元。
      </p>
    </div>
  )
}
