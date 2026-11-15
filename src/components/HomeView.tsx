import { useEffect, useMemo, useRef, useState } from 'react'
import type { ApiConfig, PlatformBalance, Work } from '../types'
import { balanceMoney } from '../billing'
import { prepareImage } from '../imageAssets'
import type { StorySeedRequest } from '../storySeed'
import { apiStatus, formatRelative, formatWords, greeting, todayLabel } from '../utils'
import { formatMoney } from '../stats'
import { Composer } from './Composer'
import { NewWorkCard, WorkCard } from './WorkCard'
import { BatchActionBar } from './BatchActionBar'
import { ConfirmModal } from './ConfirmModal'
import { Modal } from './Modal'
import {
  IconArrowRight,
  IconBookOpen,
  IconChart,
  IconCheck,
  IconFeather,
  IconFileText,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconStar,
} from './Icons'
import { SupportModal } from './SupportModal'
import { DisclaimerModal } from './DisclaimerModal'
import { useBatchSelection } from '../hooks/useBatchSelection'
import { APP_VERSION } from '../version'

const COVER_CLASS = ['cover-ink', 'cover-rose', 'cover-gold', 'cover-blue', 'cover-slate']

interface HomeContextMenu {
  x: number
  y: number
  work: Work | null
}

interface HomeViewProps {
  works: Work[]
  api: ApiConfig
  onOpenWork: (id: string) => void
  onNewWork: () => void
  onOpenPersonalNovel: () => void
  onImportNovel: (file: File) => void
  onImportProjectPackage: (file: File) => void
  onExportProjectPackage: (workId: string) => void
  onExportWork: (id: string) => void
  onDeleteWork: (work: Work) => void
  onExportWorks: (works: Work[], format: 'markdown' | 'json') => void
  onDeleteWorks: (works: Work[]) => void
  onUpdateWork: (workId: string, patch: Partial<Work>) => void
  onOpenChat: () => void
  onOpenPrompts: () => void
  onOpenStats: () => void
  monthCost: number
  streak: number
  currency: string
  balance?: PlatformBalance | null
  balanceLoading?: boolean
  onRefreshBalance?: () => void
  onOpenSettings: () => void
  onToast: (message: string) => void
  onStart: (request: StorySeedRequest) => void
  homeLayout: 'studio' | 'shelf'
  onHomeLayoutChange: (layout: 'studio' | 'shelf') => void
}

export function HomeView({
  works,
  api,
  onOpenWork,
  onNewWork,
  onOpenPersonalNovel,
  onImportNovel,
  onImportProjectPackage,
  onExportProjectPackage,
  onExportWork,
  onDeleteWork,
  onExportWorks,
  onDeleteWorks,
  onUpdateWork,
  onOpenChat,
  onOpenPrompts,
  onOpenStats,
  monthCost,
  streak,
  currency,
  balance,
  balanceLoading,
  onRefreshBalance,
  onOpenSettings,
  onToast,
  onStart,
  homeLayout,
  onHomeLayoutChange,
}: HomeViewProps) {
  const [query, setQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<HomeContextMenu | null>(null)
  const projectImportRef = useRef<HTMLInputElement>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [disclaimerOpen, setDisclaimerOpen] = useState(false)
  const [supportHidden, setSupportHidden] = useState(() => {
    try {
      return localStorage.getItem('shuoxi.support.hidden.v1') === '1'
    } catch {
      return false
    }
  })
  const importRef = useRef<HTMLInputElement>(null)
  const status = apiStatus(api)
  const updateWorkCover = async (workId: string, file: File) => {
    try {
      const coverImage = await prepareImage(file, 'cover')
      onUpdateWork(workId, { coverImage })
      onToast('书籍封面已更新')
    } catch (error) {
      onToast(error instanceof Error ? error.message : '封面处理失败')
      throw error
    }
  }
  const removeWorkCover = (workId: string) => {
    onUpdateWork(workId, { coverImage: undefined })
    onToast('已恢复默认封面')
  }
  const totalWords = works.reduce((sum, work) => sum + work.words, 0)
  const totalChapters = works.reduce((sum, work) => sum + work.chapters, 0)
  const totalTarget = works.reduce((sum, work) => sum + work.targetWords, 0)
  const serializing = works.filter((work) => work.status === '连载中').length
  const completed = works.filter((work) => work.status === '已完结').length
  const overallProgress =
    totalTarget > 0 ? Math.min(100, Math.round((totalWords / totalTarget) * 100)) : 0
  const recentWorks = useMemo(
    () => [...works].sort((a, b) => b.updatedAt - a.updatedAt),
    [works],
  )
  const latestWork = recentWorks[0] ?? null
  const otherRecentWorks = recentWorks.slice(1, 4)

  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('.home-context-menu')) return
      setContextMenu(null)
    }
    const closeOnScroll = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('pointerdown', closeMenu)
    window.addEventListener('scroll', closeOnScroll, true)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      window.removeEventListener('scroll', closeOnScroll, true)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const openHomeContextMenu = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return
    event.preventDefault()
    const card = target.closest<HTMLElement>('[data-work-id]')
    const id = card?.dataset.workId
    const work = id ? works.find((item) => item.id === id) ?? null : null
    setContextMenu({
      x: Math.min(window.innerWidth - 230, event.clientX),
      y: Math.min(window.innerHeight - 520, event.clientY),
      work,
    })
  }

  const closeHomeMenu = () => setContextMenu(null)

  const copyText = (text: string, message: string) => {
    void navigator.clipboard?.writeText(text)
    closeHomeMenu()
    onToast(message)
  }

  const contextWork = contextMenu?.work ?? null

  const filteredWorks = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return works
    return works.filter((work) =>
      `${work.title} ${work.genres.join(' ')} ${work.synopsis} ${work.theme}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [works, query])

  const selection = useBatchSelection({
    allIds: filteredWorks.map((work) => work.id),
    onDelete: (ids) => {
      const selectedWorks = works.filter((work) => ids.includes(work.id))
      if (selectedWorks.length > 0) onDeleteWorks(selectedWorks)
    },
    onExport: (ids, format) => {
      const selectedWorks = works.filter((work) => ids.includes(work.id))
      if (selectedWorks.length > 0) onExportWorks(selectedWorks, format)
    },
  })
  const lastSelectedRef = useRef<string | null>(null)

  const toggleWorkSelection = (
    id: string,
    event?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean },
  ) => {
    if (event?.shiftKey && lastSelectedRef.current) {
      const start = filteredWorks.findIndex((work) => work.id === lastSelectedRef.current)
      const end = filteredWorks.findIndex((work) => work.id === id)
      if (start >= 0 && end >= 0) {
        selection.enter()
        const [from, to] = start <= end ? [start, end] : [end, start]
        const range = filteredWorks.slice(from, to + 1).map((work) => work.id)
        for (const rangeId of range) {
          if (!selection.selected.has(rangeId)) selection.toggle(rangeId)
        }
        lastSelectedRef.current = id
        return
      }
    }
    selection.toggle(id)
    lastSelectedRef.current = id
  }

  const openWork = (id: string) => {
    if (selection.selectMode) {
      toggleWorkSelection(id)
      return
    }
    onOpenWork(id)
  }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      if (typing) return
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        onNewWork()
        return
      }
      if (modifier && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        importRef.current?.click()
        return
      }
      if (modifier && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        const input = document.querySelector<HTMLInputElement>('input[aria-label="搜索作品"]')
        input?.focus()
        input?.select()
        return
      }
      if (!modifier && event.key.toLowerCase() === 'm') {
        event.preventDefault()
        selection.toggleMode()
        return
      }
      if (!modifier && event.key === '?') {
        event.preventDefault()
        setShortcutsOpen(true)
        return
      }
      if (event.key === 'Escape') {
        setShortcutsOpen(false)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  })

  return (
    <div className="home" data-home-layout={homeLayout} onContextMenu={openHomeContextMenu}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="hello-block">
            <p className="hello">{greeting()}，导演。</p>
            <p className="hello-sub">
              {todayLabel()} · 书架上有 {works.length} 部作品
            </p>
          </div>
          <div className="topbar-actions">
            <label className="search">
              <IconSearch size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索作品"
                aria-label="搜索作品"
                title="搜索作品（Ctrl / Cmd + F）"
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm home-layout-toggle"
              onClick={() => onHomeLayoutChange(homeLayout === 'studio' ? 'shelf' : 'studio')}
              title="切换首页布局：剧场版 / 书架版"
            >
              <IconBookOpen size={14} />
              {homeLayout === 'studio' ? '书架版' : '剧场版'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onOpenPersonalNovel}
              title="输入一句话，让 AI 给你写一个故事"
            >
              <IconSparkles size={14} />
              我想看故事
            </button>
            <button
              type="button"
              className={`btn btn-ghost btn-sm ${selection.selectMode ? 'active' : ''}`}
              onClick={selection.toggleMode}
              disabled={works.length === 0}
              title="多选作品，批量导出或删除（M / Ctrl+A 全选 / Delete 删除 / Ctrl+E 导出 / Esc 退出）"
            >
              <IconCheck size={14} />
              {selection.selectMode ? `退出多选${selection.selected.size > 0 ? ` · ${selection.selected.size}` : ''}` : '多选'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => importRef.current?.click()}
              title="导入 TXT / Markdown，本地按章节标题拆分，不调用 AI；大文件在后台解析（Ctrl / Cmd + I）"
            >
              <IconFileText size={14} />
              导入小说
            </button>
            {!supportHidden ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm home-support-btn"
                onClick={() => setSupportOpen(true)}
                title="支持说戏"
              >
                <IconStar size={14} />
                支持
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => projectImportRef.current?.click()}
              title="导入 .shuoxi.json 项目包，恢复一部作品及其设定"
            >
              <IconFileText size={14} />
              导入项目
            </button>
            <input
              ref={projectImportRef}
              type="file"
              accept=".json,.shuoxi,application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onImportProjectPackage(file)
                event.target.value = ''
              }}
            />
            <input
              ref={importRef}
              type="file"
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onImportNovel(file)
                event.target.value = ''
              }}
            />
            {balance && balance.balances[0] ? (
              <button
                type="button"
                className="status-chip balance-chip"
                title={[
                  `点击刷新余额`,
                  ...(balance.balances[0].toppedUp > 0
                    ? [`充值余额：${balanceMoney(balance.balances[0].toppedUp, balance.balances[0].currency)}`]
                    : []),
                  ...(balance.balances[0].granted > 0
                    ? [`赠送余额：${balanceMoney(balance.balances[0].granted, balance.balances[0].currency)}`]
                    : []),
                ].join('\n')}
                onClick={onRefreshBalance}
              >
                <span className="status-dot" />
                余额 {balanceMoney(balance.balances[0].total, balance.balances[0].currency)}
                {balanceLoading ? ' …' : ''}
              </button>
            ) : null}
            <button
              type="button"
              className={`status-chip ${status.configured ? 'ok' : ''}`}
              onClick={onOpenSettings}
            >
              <span className="status-dot" />
              {status.label}
            </button>
          </div>
        </div>
      </header>

      <main className={homeLayout === 'shelf' ? 'page page-shelf' : 'page'}>
        <section className="hero">
          <div className="hero-copy">
            <p className="hero-eyebrow">
              <span className="hero-spark" />
              导演模式 · 纯指令写作
            </p>
            <h1>
              把想看的戏，<span className="accent">说出来</span>。
            </h1>
            <p className="hero-lede">
              不用憋正文。交代清楚这场戏在哪儿、谁在场、人物想干什么——分镜、台词、节奏，交给 AI。
            </p>
            <div className="hero-meta">
              <span>本地优先</span>
              <span>自带模型</span>
              <span>全部设定留在本机</span>
            </div>
          </div>
          <div className="hero-compose">
            <Composer apiReady={status.configured} onStart={onStart} />
          </div>
        </section>

        <section className="home-desk">
          <div className="home-continue-panel">
            <div className="home-panel-head">
              <div>
                <span>最近在写</span>
                <h2>{latestWork?.title || '还没有作品'}</h2>
                <p>
                  {latestWork
                    ? `${latestWork.status} · ${latestWork.genres.join(' / ') || '未设置题材'} · ${formatRelative(latestWork.updatedAt)}更新`
                    : '写下一句话，第一场戏就会出现在这里。'}
                </p>
              </div>
              {latestWork ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onOpenWork(latestWork.id)}
                >
                  继续写
                  <IconArrowRight size={14} />
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={onNewWork}>
                  <IconPlus size={14} />
                  新建作品
                </button>
              )}
            </div>

            {latestWork ? (
              <button
                type="button"
                className={`home-continue-card ${
                  COVER_CLASS[latestWork.coverIndex % COVER_CLASS.length]
                }`}
                data-work-id={latestWork.id}
                onClick={() => onOpenWork(latestWork.id)}
              >
                <span className="home-continue-char" aria-hidden="true">
                  {latestWork.title.slice(0, 1)}
                </span>
                <span className="home-continue-content">
                  <span className="home-continue-tags">
                    <span className={`status-pill ${latestWork.status === '已完结' ? 'done' : latestWork.status === '草稿' ? 'draft' : ''}`}>
                      {latestWork.status}
                    </span>
                    <span>{latestWork.chapters} 章</span>
                    <span>{formatWords(latestWork.words)}</span>
                  </span>
                  <span className="home-continue-synopsis">
                    {latestWork.synopsis || latestWork.theme || '还没有填写简介，先写一场戏吧。'}
                  </span>
                  <span className="home-continue-progress">
                    <span
                      style={{
                        width: `${Math.min(100, Math.round((latestWork.words / Math.max(1, latestWork.targetWords)) * 100))}%`,
                      }}
                    />
                  </span>
                  <span className="home-continue-meta">
                    目标 {formatWords(latestWork.targetWords)} · 已完成{' '}
                    {Math.min(100, Math.round((latestWork.words / Math.max(1, latestWork.targetWords)) * 100))}%
                  </span>
                </span>
                <span className="home-continue-go">继续这一章 →</span>
              </button>
            ) : null}

            {otherRecentWorks.length > 0 ? (
              <div className="home-recent">
                <div className="home-recent-head">
                  <span>最近更新</span>
                  <small>继续上次的案头</small>
                </div>
                {otherRecentWorks.map((work) => (
                  <button
                    type="button"
                    className="home-recent-row"
                    key={work.id}
                    data-work-id={work.id}
                    onClick={() => onOpenWork(work.id)}
                  >
                    <span
                      className={`home-recent-dot ${
                        COVER_CLASS[work.coverIndex % COVER_CLASS.length]
                      }`}
                    >
                      {work.title.slice(0, 1)}
                    </span>
                    <span className="home-recent-info">
                      <strong>{work.title}</strong>
                      <small>
                        {work.status} · {formatRelative(work.updatedAt)}
                      </small>
                    </span>
                    <span className="home-recent-words">{formatWords(work.words)}</span>
                    <IconArrowRight size={13} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="home-overview">
            <div className="home-overview-head">
              <span>创作概览</span>
              <button type="button" className="home-overview-stats" onClick={onOpenStats}>
                <IconChart size={13} />
                完整统计
              </button>
            </div>
            <div className="home-stats-grid">
              <div>
                <span>总字数</span>
                <strong>{formatWords(totalWords)}</strong>
              </div>
              <div>
                <span>总章节</span>
                <strong>{totalChapters}</strong>
              </div>
              <div>
                <span>连载中</span>
                <strong>{serializing}</strong>
              </div>
              <div>
                <span>已完结</span>
                <strong>{completed}</strong>
              </div>
              <div>
                <span>本月写作费用</span>
                <strong>{formatMoney(monthCost, currency)}</strong>
              </div>
              <div>
                <span>连续写作</span>
                <strong>{streak} 天</strong>
              </div>
            </div>
            <div className="home-goal">
              <div>
                <span>全部目标进度</span>
                <strong>{overallProgress}%</strong>
              </div>
              <div className="home-goal-track">
                <span style={{ width: `${overallProgress}%` }} />
              </div>
              <small>
                {formatWords(totalWords)} / {formatWords(totalTarget || 0)}
              </small>
            </div>
            <div className="home-quick-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenPrompts}>
                提示词库
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenSettings}>
                <span className={`status-dot ${status.configured ? 'ok' : ''}`} />
                {status.configured ? '模型已连接' : '配置模型'}
              </button>
            </div>
          </aside>
        </section>

        <section className="chat-entry">
          <div>
            <span className="hero-eyebrow">
              <span className="hero-spark" />
              角色会客厅 · 和书中人聊聊
            </span>
            <h2>他/她，会怎么回答？</h2>
            <p>
              选一本书里的角色，以角色本人身份聊天。只带当前章节之前的记忆，长期记忆单独保存，不会自动改正文。
            </p>
            <div className="chat-entry-tags">
              <span>角色本人</span>
              <span>可见记忆</span>
              <span>不污染正典</span>
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={onOpenChat}>
            进入会客厅
            <IconArrowRight size={15} />
          </button>
        </section>

        {homeLayout === 'shelf' ? (
          <section className="shelf-landing">
            {latestWork ? (
              <>
                <div className="shelf-landing-copy">
                  <p className="shelf-landing-eyebrow">继续写</p>
                  <h1>{latestWork.title}</h1>
                  <p>
                    {latestWork.status} · {latestWork.chapters} 章 · {formatWords(latestWork.words)}
                    {' · '}
                    {formatRelative(latestWork.updatedAt)}更新
                  </p>
                  <p className="shelf-landing-synopsis">
                    {latestWork.synopsis || latestWork.theme || '下一章还在等你。'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary shelf-landing-button"
                  onClick={() => onOpenWork(latestWork.id)}
                >
                  继续写
                  <IconArrowRight size={15} />
                </button>
              </>
            ) : (
              <div className="shelf-landing-copy">
                <p className="shelf-landing-eyebrow">从一句戏开始</p>
                <h1>书架还是空的</h1>
                <p>新建一部作品，或者先导入一本小说。</p>
              </div>
            )}
            <div className="shelf-landing-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onNewWork}>
                <IconPlus size={14} />
                新建作品
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => importRef.current?.click()}
              >
                <IconFileText size={14} />
                导入小说
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenSettings}>
                外观与设置
              </button>
            </div>
          </section>
        ) : null}

        <section className="shelf">
          <div className="section-head">
            <div className="section-title">
              <h2>我的作品</h2>
              <span className="count">{works.length}</span>
            </div>
            <div className="section-actions">
              <span className="shelf-stat">共 {formatWords(totalWords)}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onNewWork} title="新建作品（Ctrl / Cmd + N）">
                <IconPlus size={15} />
                新建作品
              </button>
            </div>
          </div>

          {filteredWorks.length === 0 ? (
            <div className="shelf-empty">
              <IconFeather size={22} />
              <p>{query.trim() ? '没有找到匹配的作品' : '书架还是空的，从一句戏开始。'}</p>
              {query.trim() ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuery('')}>
                  清除搜索
                </button>
              ) : null}
            </div>
          ) : (
            <div className="work-grid">
              {query.trim() || selection.selectMode ? null : <NewWorkCard onClick={onNewWork} />}
              {filteredWorks.map((work) => (
                <WorkCard
                  key={work.id}
                  work={work}
                  onOpen={openWork}
                  onDelete={onDeleteWork}
                  onCoverChange={updateWorkCover}
                  onRemoveCover={removeWorkCover}
                  selectable={selection.selectMode}
                  selected={selection.selected.has(work.id)}
                  onToggleSelect={toggleWorkSelection}
                />
              ))}
            </div>
          )}
        </section>

        <footer className="page-foot">
          <span>说戏 · v{APP_VERSION}</span>
          <span>本地优先 · AI 直连你的模型 · 作品只保存在这台电脑上</span>
          <button
            type="button"
            className="home-disclaimer-link"
            onClick={() => setShortcutsOpen(true)}
          >
            快捷键
          </button>
          <button
            type="button"
            className="home-disclaimer-link"
            onClick={() => setDisclaimerOpen(true)}
          >
            免责声明
          </button>
        </footer>
      </main>

      {supportOpen ? (
        <SupportModal
          onClose={() => setSupportOpen(false)}
          onDelete={() => {
            try {
              localStorage.setItem('shuoxi.support.hidden.v1', '1')
            } catch {
              // 本地存储不可用时仅隐藏当前会话。
            }
            setSupportHidden(true)
            onToast('已永久隐藏支持入口')
          }}
        />
      ) : null}

      {disclaimerOpen ? <DisclaimerModal onClose={() => setDisclaimerOpen(false)} /> : null}

      {shortcutsOpen ? (
        <Modal
          title="快捷键"
          subtitle="书库和批量操作"
          onClose={() => setShortcutsOpen(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShortcutsOpen(false)}>
              关闭
            </button>
          }
        >
          <div className="shortcut-list">
            {[
              ['Ctrl / Cmd + N', '新建作品'],
              ['Ctrl / Cmd + I', '导入小说'],
              ['Ctrl / Cmd + F', '聚焦搜索框'],
              ['M', '进入 / 退出多选'],
              ['Ctrl / Cmd + A', '全选当前筛选作品'],
              ['Delete / Backspace', '删除选中作品（多选状态）'],
              ['Ctrl / Cmd + E', '导出选中作品 JSON（多选状态）'],
              ['Esc', '退出多选 / 关闭弹窗'],
              ['右键作品', '打开作品菜单：导出、批量选择、复制、删除'],
              ['?', '打开这个快捷键面板'],
            ].map(([key, description]) => (
              <div className="shortcut-row" key={key}>
                <kbd>{key}</kbd>
                <span>{description}</span>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}

      {selection.selectMode ? (
        <BatchActionBar
          selectedCount={selection.selected.size}
          totalCount={filteredWorks.length}
          label="部作品"
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onExport={() => selection.exportSelected('json')}
          onDelete={() => selection.setConfirmDeleteOpen(true)}
          onExit={selection.exit}
        />
      ) : null}

      {selection.confirmDeleteOpen ? (
        <ConfirmModal
          title="批量删除作品"
          danger
          confirmLabel={`移入最近删除（${selection.selected.size} 部）`}
          message={
            <>
              <p>确定删除选中的 {selection.selected.size} 部作品？</p>
              <p>会连同正文、设定、角色聊天和长期记忆一起移入「最近删除」，可在设置 → 数据中恢复。</p>
            </>
          }
          onConfirm={selection.removeSelected}
          onClose={() => selection.setConfirmDeleteOpen(false)}
        />
      ) : null}

      {contextMenu ? (
        <div
          className="manuscript-context-menu home-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          {selection.selectMode ? (
            <>
              <span className="context-menu-label">批量选择 · 已选 {selection.selected.size} 部</span>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  selection.selectAll()
                  closeHomeMenu()
                }}
              >
                全选当前筛选作品
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={selection.selected.size === 0}
                onClick={() => {
                  selection.exportSelected('markdown')
                  closeHomeMenu()
                }}
              >
                导出选中作品（Markdown）
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={selection.selected.size === 0}
                onClick={() => {
                  selection.exportSelected('json')
                  closeHomeMenu()
                }}
              >
                导出选中作品（JSON）
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                disabled={selection.selected.size === 0}
                onClick={() => {
                  closeHomeMenu()
                  selection.setConfirmDeleteOpen(true)
                }}
              >
                删除选中作品…
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  selection.exit()
                  closeHomeMenu()
                }}
              >
                退出多选
              </button>
              <span className="context-menu-separator" />
            </>
          ) : null}
          {contextWork ? (
            <>
              <span className="context-menu-label">{contextWork.title}</span>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeHomeMenu()
                  onOpenWork(contextWork.id)
                }}
              >
                打开作品
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeHomeMenu()
                  onOpenWork(contextWork.id)
                }}
              >
                继续写作
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => copyText(contextWork.title, '已复制书名')}
              >
                复制书名
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!contextWork.synopsis.trim()}
                onClick={() => copyText(contextWork.synopsis, '已复制简介')}
              >
                复制简介
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  selection.enter()
                  if (!selection.selected.has(contextWork.id)) selection.toggle(contextWork.id)
                  closeHomeMenu()
                }}
              >
                多选这部作品
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeHomeMenu()
                  onExportWork(contextWork.id)
                }}
              >
                导出作品…
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeHomeMenu()
                  onExportProjectPackage(contextWork.id)
                }}
              >
                导出项目包…
              </button>
              <span className="context-menu-separator" />
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  closeHomeMenu()
                  onDeleteWork(contextWork)
                }}
              >
                删除作品…
              </button>
              <span className="context-menu-separator" />
            </>
          ) : (
            <span className="context-menu-label">主页</span>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeHomeMenu()
              onNewWork()
            }}
          >
            新建作品
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeHomeMenu()
              importRef.current?.click()
            }}
          >
            导入小说
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeHomeMenu()
              onOpenChat()
            }}
          >
            角色会客厅
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeHomeMenu()
              onOpenPrompts()
            }}
          >
            打开提示词库
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeHomeMenu()
              onOpenSettings()
            }}
          >
            模型设置
          </button>
        </div>
      ) : null}
    </div>
  )
}
