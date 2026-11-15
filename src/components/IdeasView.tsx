import { useEffect, useMemo, useState } from 'react'
import type { Chapter, Idea, IdeaStatus, IdeaType, Work } from '../types'
import {
  IDEA_STATUS_LABELS,
  IDEA_TYPE_LABELS,
  createIdea,
  ideaMatches,
  ideaTagsOf,
} from '../ideas'
import { copyTextToClipboard } from '../clipboard'
import { IconArrowLeft, IconCheck, IconCopy, IconPlus, IconSearch, IconSparkles, IconTrash } from './Icons'

interface IdeasViewProps {
  ideas: Idea[]
  works: Work[]
  chaptersByWork: Record<string, Chapter[]>
  initialWorkId?: string | null
  onChange: (ideas: Idea[]) => void
  onInsert: (workId: string, chapterId: string, text: string) => void
  onToast: (message: string) => void
  onBack: () => void
}

const TYPE_OPTIONS = Object.keys(IDEA_TYPE_LABELS) as IdeaType[]
const STATUS_OPTIONS = Object.keys(IDEA_STATUS_LABELS) as IdeaStatus[]

export function IdeasView({
  ideas,
  works,
  chaptersByWork,
  initialWorkId,
  onChange,
  onInsert,
  onToast,
  onBack,
}: IdeasViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<IdeaType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<IdeaStatus | 'all'>('inbox')
  const [workFilter, setWorkFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [quickText, setQuickText] = useState('')
  const [quickType, setQuickType] = useState<IdeaType>('scene')
  const [quickWorkId, setQuickWorkId] = useState(initialWorkId ?? '')
  const [tagDraft, setTagDraft] = useState('')

  const selected = ideas.find((idea) => idea.id === selectedId) ?? null
  const tags = useMemo(() => ideaTagsOf(ideas), [ideas])
  const filtered = useMemo(
    () =>
      ideas
        .filter((idea) => {
          if (tagFilter !== 'all' && !idea.tags.includes(tagFilter)) return false
          return ideaMatches(idea, {
            query,
            type: typeFilter,
            status: statusFilter,
            workId: workFilter,
          })
        })
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [ideas, query, statusFilter, tagFilter, typeFilter, workFilter],
  )

  useEffect(() => {
    if (selectedId && ideas.some((idea) => idea.id === selectedId)) return
    setSelectedId(filtered[0]?.id ?? ideas[0]?.id ?? null)
  }, [filtered, ideas, selectedId])

  useEffect(() => {
    if (selected) setTagDraft(selected.tags.join(', '))
  }, [selected?.id])

  const updateIdea = (id: string, patch: Partial<Idea>) => {
    onChange(
      ideas.map((idea) =>
        idea.id === id ? { ...idea, ...patch, updatedAt: Date.now() } : idea,
      ),
    )
  }

  const addQuickIdea = () => {
    const body = quickText.trim()
    if (!body) return
    const firstLine = body.split(/\n/)[0]?.trim() ?? ''
    const idea = createIdea({
      title: firstLine.slice(0, 48),
      body,
      type: quickType,
      workId: quickWorkId || undefined,
      source: 'manual',
    })
    onChange([idea, ...ideas])
    setSelectedId(idea.id)
    setQuickText('')
    setStatusFilter('inbox')
    setQuery('')
    setTypeFilter('all')
    setWorkFilter('all')
    setTagFilter('all')
    onToast('已收进灵感库')
  }

  const deleteIdea = (idea: Idea) => {
    if (!window.confirm(`删除灵感「${idea.title}」？`)) return
    const next = ideas.filter((item) => item.id !== idea.id)
    onChange(next)
    setSelectedId(next[0]?.id ?? null)
    onToast('已删除灵感')
  }

  const copyIdea = (idea: Idea) => {
    void copyTextToClipboard(idea.body)
    onToast('灵感已复制')
  }

  const insertIdea = (idea: Idea) => {
    if (!idea.workId || !idea.chapterId) {
      onToast('先给灵感选择作品和章节')
      return
    }
    onInsert(idea.workId, idea.chapterId, idea.body)
    updateIdea(idea.id, { status: 'used', usedAt: Date.now() })
    onToast('已插入章节末尾，并标记为已使用')
  }

  const saveTags = (idea: Idea) => {
    const nextTags = tagDraft
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12)
    updateIdea(idea.id, { tags: nextTags })
    onToast('标签已保存')
  }

  const chapterOptions = selected?.workId ? chaptersByWork[selected.workId] ?? [] : []

  return (
    <div className="ideas-view">
      <header className="ideas-topbar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <IconArrowLeft size={16} />
          书库
        </button>
        <div className="ideas-title">
          <span>灵感库</span>
          <small>{ideas.length} 条灵感 · 随手收下，之后再用</small>
        </div>
        <div className="ideas-topbar-actions">
          <label className="ideas-search">
            <IconSearch size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索灵感…"
              aria-label="搜索灵感"
            />
          </label>
        </div>
      </header>

      <div className="ideas-layout">
        <aside className="ideas-filters">
          <section>
            <strong>状态</strong>
            <div className="ideas-filter-list">
              <button
                type="button"
                className={statusFilter === 'all' ? 'active' : ''}
                onClick={() => setStatusFilter('all')}
              >
                全部 <span>{ideas.length}</span>
              </button>
              {STATUS_OPTIONS.map((status) => {
                const count = ideas.filter((idea) => idea.status === status).length
                return (
                  <button
                    key={status}
                    type="button"
                    className={statusFilter === status ? 'active' : ''}
                    onClick={() => setStatusFilter(status)}
                  >
                    {IDEA_STATUS_LABELS[status]} <span>{count}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <strong>类型</strong>
            <div className="ideas-filter-list">
              <button
                type="button"
                className={typeFilter === 'all' ? 'active' : ''}
                onClick={() => setTypeFilter('all')}
              >
                全部类型
              </button>
              {TYPE_OPTIONS.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={typeFilter === type ? 'active' : ''}
                  onClick={() => setTypeFilter(type)}
                >
                  {IDEA_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </section>

          <section>
            <strong>作品</strong>
            <div className="ideas-filter-list">
              <button
                type="button"
                className={workFilter === 'all' ? 'active' : ''}
                onClick={() => setWorkFilter('all')}
              >
                全部作品
              </button>
              <button
                type="button"
                className={workFilter === 'unlinked' ? 'active' : ''}
                onClick={() => setWorkFilter('unlinked')}
              >
                未关联
              </button>
              {works.map((work) => (
                <button
                  key={work.id}
                  type="button"
                  className={workFilter === work.id ? 'active' : ''}
                  onClick={() => setWorkFilter(work.id)}
                >
                  {work.title}
                </button>
              ))}
            </div>
          </section>

          {tags.length > 0 ? (
            <section>
              <strong>标签</strong>
              <div className="ideas-tag-cloud">
                <button
                  type="button"
                  className={tagFilter === 'all' ? 'active' : ''}
                  onClick={() => setTagFilter('all')}
                >
                  全部
                </button>
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={tagFilter === tag ? 'active' : ''}
                    onClick={() => setTagFilter(tag)}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </aside>

        <main className="ideas-main">
          <div className="ideas-quick">
            <div className="ideas-quick-head">
              <strong>记下一句</strong>
              <span>Ctrl / Cmd + Enter 收下</span>
            </div>
            <textarea
              value={quickText}
              autoFocus
              onChange={(event) => setQuickText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  addQuickIdea()
                }
              }}
              placeholder="一个场景、一句台词、一个反转…先收下，不用整理。"
              rows={3}
            />
            <div className="ideas-quick-foot">
              <select
                value={quickType}
                onChange={(event) => setQuickType(event.target.value as IdeaType)}
                aria-label="灵感类型"
              >
                {TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {IDEA_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <select
                value={quickWorkId}
                onChange={(event) => setQuickWorkId(event.target.value)}
                aria-label="关联作品"
              >
                <option value="">不关联作品</option>
                {works.map((work) => (
                  <option key={work.id} value={work.id}>
                    {work.title}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-primary btn-sm" onClick={addQuickIdea}>
                <IconPlus size={13} />
                收下
              </button>
            </div>
          </div>

          <div className="ideas-list-head">
            <strong>{statusFilter === 'all' ? '全部灵感' : IDEA_STATUS_LABELS[statusFilter]}</strong>
            <span>{filtered.length} 条</span>
          </div>

          {filtered.length === 0 ? (
            <div className="ideas-empty">
              <IconSparkles size={22} />
              <strong>这里还很安静</strong>
              <span>把刚才想到的一句话收进来，不用急着用。</span>
            </div>
          ) : (
            <div className="ideas-grid">
              {filtered.map((idea) => {
                const work = works.find((item) => item.id === idea.workId)
                return (
                  <button
                    key={idea.id}
                    type="button"
                    className={`idea-card ${idea.id === selectedId ? 'active' : ''}`}
                    onClick={() => setSelectedId(idea.id)}
                  >
                    <span className="idea-card-top">
                      <span className={`idea-card-type ${idea.type}`}>{IDEA_TYPE_LABELS[idea.type]}</span>
                      <span className={`idea-card-status ${idea.status}`}>
                        {IDEA_STATUS_LABELS[idea.status]}
                      </span>
                    </span>
                    <strong>{idea.title || '未命名灵感'}</strong>
                    <p>{idea.body.slice(0, 120)}</p>
                    <span className="idea-card-foot">
                      <span>{work?.title ?? '未关联作品'}</span>
                      {idea.tags.length > 0 ? <span>#{idea.tags.slice(0, 2).join(' #')}</span> : null}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </main>

        <aside className="ideas-detail">
          {selected ? (
            <>
              <div className="ideas-detail-head">
                <span>灵感详情</span>
                <button
                  type="button"
                  className="btn btn-danger-ghost btn-sm"
                  onClick={() => deleteIdea(selected)}
                >
                  <IconTrash size={13} />
                  删除
                </button>
              </div>
              <input
                className="input ideas-title-input"
                value={selected.title}
                onChange={(event) => updateIdea(selected.id, { title: event.target.value })}
                placeholder="标题"
                aria-label="灵感标题"
              />
              <textarea
                className="ideas-body-input"
                value={selected.body}
                onChange={(event) => updateIdea(selected.id, { body: event.target.value })}
                rows={9}
                placeholder="灵感正文…"
                aria-label="灵感正文"
              />
              <div className="ideas-detail-row">
                <label>
                  <span>类型</span>
                  <select
                    value={selected.type}
                    onChange={(event) =>
                      updateIdea(selected.id, { type: event.target.value as IdeaType })
                    }
                  >
                    {TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {IDEA_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>状态</span>
                  <select
                    value={selected.status}
                    onChange={(event) =>
                      updateIdea(selected.id, { status: event.target.value as IdeaStatus })
                    }
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {IDEA_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="ideas-detail-field">
                <span>关联作品</span>
                <select
                  value={selected.workId ?? ''}
                  onChange={(event) =>
                    updateIdea(selected.id, {
                      workId: event.target.value || undefined,
                      chapterId: undefined,
                    })
                  }
                >
                  <option value="">不关联作品</option>
                  {works.map((work) => (
                    <option key={work.id} value={work.id}>
                      {work.title}
                    </option>
                  ))}
                </select>
              </label>
              {selected.workId ? (
                <label className="ideas-detail-field">
                  <span>目标章节</span>
                  <select
                    value={selected.chapterId ?? ''}
                    onChange={(event) =>
                      updateIdea(selected.id, { chapterId: event.target.value || undefined })
                    }
                  >
                    <option value="">暂不选择</option>
                    {chapterOptions.map((chapter, index) => (
                      <option key={chapter.id} value={chapter.id}>
                        第 {index + 1} 章 · {chapter.title || '未命名章节'}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="ideas-detail-field">
                <span>标签（逗号分隔）</span>
                <div className="ideas-tags-edit">
                  <input
                    className="input"
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    placeholder="例如：雨夜, 重逢, 反转"
                  />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => saveTags(selected)}>
                    保存标签
                  </button>
                </div>
              </label>
              <div className="ideas-detail-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyIdea(selected)}>
                  <IconCopy size={13} />
                  复制
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => updateIdea(selected.id, { status: 'used', usedAt: Date.now() })}
                >
                  <IconCheck size={13} />
                  标记已用
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!selected.workId || !selected.chapterId}
                  onClick={() => insertIdea(selected)}
                >
                  插入章节末尾
                </button>
              </div>
              <p className="ideas-detail-meta">
                创建于 {new Date(selected.createdAt).toLocaleString('zh-CN')}
                {selected.usedAt ? ` · 已用于 ${new Date(selected.usedAt).toLocaleDateString('zh-CN')}` : ''}
              </p>
            </>
          ) : (
            <div className="ideas-detail-empty">
              <IconSparkles size={22} />
              <strong>选中一条灵感</strong>
              <span>或者先在左边收下一条。</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
