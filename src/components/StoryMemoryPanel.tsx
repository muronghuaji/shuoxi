import { useEffect, useMemo, useState } from 'react'
import type {
  ApiConfig,
  Chapter,
  StoryFact,
  StoryHealthIssue,
  StoryKnowledgeEntry,
  StoryMemoryData,
  StoryPromise,
  WorkDetail,
} from '../types'
import {
  activeFactsAtChapter,
  buildStoryMemory,
  currentVolume,
  ensureStoryMemory,
} from '../storyMemory'
import { buildMemoryContextSections } from '../storyRetrieval'
import { getStorySqliteStatus, indexStoryWork } from '../storySqlite'
import { hasEmbeddingModel } from '../semantic'

interface StoryMemoryPanelProps {
  workId: string
  workTitle: string
  api: ApiConfig
  detail: WorkDetail
  chapters: Chapter[]
  activeChapterId: string
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onToast: (message: string) => void
}

type MemoryTab = 'overview' | 'facts' | 'promises' | 'knowledge' | 'context'

const TAB_LABELS: { id: MemoryTab; label: string }[] = [
  { id: 'overview', label: '总览与健康' },
  { id: 'facts', label: '事实库' },
  { id: 'promises', label: '剧情账本' },
  { id: 'knowledge', label: '认知矩阵' },
  { id: 'context', label: '上下文' },
]

function severityClass(issue: StoryHealthIssue): string {
  return `memory-issue severity-${issue.severity}`
}

function FactStatusButton({
  fact,
  onChange,
}: {
  fact: StoryFact
  onChange: (status: StoryFact['status']) => void
}) {
  if (fact.status === 'retconned') {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('canon')}>
        恢复正史
      </button>
    )
  }
  return (
    <button
      type="button"
      className="btn btn-danger-ghost btn-sm"
      onClick={() => onChange('retconned')}
    >
      撤回
    </button>
  )
}

function PromiseStatusActions({
  promise,
  onChange,
}: {
  promise: StoryPromise
  onChange: (status: StoryPromise['status']) => void
}) {
  return (
    <div className="memory-promise-actions">
      {promise.status === 'open' || promise.status === 'advanced' ? (
        <>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onChange('advanced')}
          >
            推进
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onChange('resolved')}
          >
            回收
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onChange('abandoned')}
          >
            放弃
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('open')}>
          重新打开
        </button>
      )}
    </div>
  )
}

export function StoryMemoryPanel({
  workId,
  workTitle,
  api,
  detail,
  chapters,
  activeChapterId,
  onUpdateDetail,
  onToast,
}: StoryMemoryPanelProps) {
  const memory = useMemo(() => ensureStoryMemory(detail, chapters), [detail, chapters])
  const [tab, setTab] = useState<MemoryTab>('overview')
  const [factQuery, setFactQuery] = useState('')
  const [knowledgeCharacter, setKnowledgeCharacter] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [indexingSqlite, setIndexingSqlite] = useState(false)
  const [sqliteStatus, setSqliteStatus] = useState<{
    ready: boolean
    documents: number
    terms: number
    vectors: number
    sizeBytes: number
    indexedAt: number | null
  }>({ ready: false, documents: 0, terms: 0, vectors: 0, sizeBytes: 0, indexedAt: null })

  useEffect(() => {
    let cancelled = false
    void getStorySqliteStatus(workId).then((status) => {
      if (!cancelled) setSqliteStatus(status)
    })
    return () => {
      cancelled = true
    }
  }, [workId])

  const indexSqlite = async () => {
    if (indexingSqlite) return
    setIndexingSqlite(true)
    try {
      const result = await indexStoryWork({
        workId,
        title: workTitle,
        detail,
        chapters,
        memory,
        api,
      })
      const status = await getStorySqliteStatus(workId)
      setSqliteStatus(status)
      onToast(
        `SQLite 故事索引已更新：${result.documents} 个文档 / ${result.terms} 个检索词${result.semantic ? ' / 含语义向量' : ' / 仅关键词索引'}`,
      )
    } catch (error) {
      onToast(`SQLite 索引失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIndexingSqlite(false)
    }
  }
  const [newPromise, setNewPromise] = useState({
    title: '',
    detail: '',
    kind: 'promise' as StoryPromise['kind'],
    priority: 'side' as StoryPromise['priority'],
    dueChapterId: '',
  })

  const currentFactList = activeFactsAtChapter(memory, chapters, activeChapterId || chapters[0]?.id)
    .filter((fact) => fact.status !== 'retconned')
    .filter((fact) => {
      if (!factQuery.trim()) return true
      const query = factQuery.trim().toLowerCase()
      return `${fact.subjectName} ${fact.field} ${fact.displayValue}`.toLowerCase().includes(query)
    })
    .sort((left, right) => left.subjectName.localeCompare(right.subjectName))

  const lastAudit = memory.lastAudit
  const activeVolume = currentVolume(memory, chapters, activeChapterId || chapters[0]?.id || '')
  const contextSections = useMemo(() => {
    const activeChapter =
      chapters.find((chapter) => chapter.id === activeChapterId) ?? chapters[0]
    if (!activeChapter) return []
    return buildMemoryContextSections({
      detail,
      chapters,
      chapter: activeChapter,
      focusText: [activeChapter.title, activeChapter.content.slice(-2000)].join('\n'),
      memory,
    })
  }, [activeChapterId, chapters, detail, memory])

  const updateMemory = (patch: Partial<StoryMemoryData>) => {
    onUpdateDetail({ memory: { ...memory, ...patch } })
  }

  const refresh = () => {
    const next = buildStoryMemory(detail, chapters)
    onUpdateDetail({ memory: next })
    onToast(`故事记忆已刷新：${next.volumes.length} 卷 / ${next.facts.length} 条事实 / ${next.promises.length} 个承诺`)
  }

  const updateFactStatus = (factId: string, status: StoryFact['status']) => {
    updateMemory({
      facts: memory.facts.map((fact) => (fact.id === factId ? { ...fact, status } : fact)),
    })
  }

  const updatePromiseStatus = (promiseId: string, status: StoryPromise['status']) => {
    updateMemory({
      promises: memory.promises.map((promise) =>
        promise.id === promiseId
          ? { ...promise, status, updatedAt: new Date().toISOString() }
          : promise,
      ),
    })
  }

  const addPromise = () => {
    const title = newPromise.title.trim()
    if (!title) {
      onToast('剧情承诺需要标题')
      return
    }
    const dueIndex = newPromise.dueChapterId
      ? chapters.findIndex((chapter) => chapter.id === newPromise.dueChapterId)
      : -1
    const now = new Date().toISOString()
    const promise: StoryPromise = {
      id: `promise-manual-${Date.now().toString(36)}`,
      kind: newPromise.kind,
      title,
      detail: newPromise.detail.trim(),
      openedChapterId: activeChapterId || chapters[0]?.id,
      openedChapterNumber: activeChapterId
        ? Math.max(0, chapters.findIndex((chapter) => chapter.id === activeChapterId)) + 1
        : 1,
      dueChapterId: newPromise.dueChapterId || undefined,
      dueChapterNumber: dueIndex >= 0 ? dueIndex + 1 : undefined,
      status: 'open',
      priority: newPromise.priority,
      characters: [],
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    }
    updateMemory({ promises: [promise, ...memory.promises] })
    setNewPromise({
      title: '',
      detail: '',
      kind: 'promise',
      priority: 'side',
      dueChapterId: '',
    })
    onToast('剧情承诺已加入账本')
  }

  const visiblePromises = memory.promises
    .filter((promise) => showResolved || (promise.status !== 'resolved' && promise.status !== 'abandoned'))
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === 'open' ? -1 : 1
      return (left.dueChapterNumber ?? 9999) - (right.dueChapterNumber ?? 9999)
    })

  const knowledgeEntries = memory.knowledge
    .filter((entry) => !knowledgeCharacter || entry.characterId === knowledgeCharacter)
    .filter((entry) => entry.state === '不知道' || entry.state === '误以为' || entry.state === '知道')
  const groupedKnowledge = new Map<string, StoryKnowledgeEntry[]>()
  for (const entry of knowledgeEntries) {
    const values = groupedKnowledge.get(entry.characterId) ?? []
    values.push(entry)
    groupedKnowledge.set(entry.characterId, values)
  }

  return (
    <div className="story-memory-panel">
      <header className="story-memory-head">
        <div>
          <strong>故事记忆与连续性</strong>
          <span>
            分层卷摘要、事实库、剧情账本、人物认知、上下文编译与健康检查。记忆会保存到作品备份。
          </span>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={refresh}>
          刷新记忆
        </button>
      </header>

      <div className="story-memory-tabs">
        {TAB_LABELS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id === 'facts' ? <small>{memory.facts.length}</small> : null}
            {item.id === 'promises' ? (
              <small>{memory.promises.filter((promise) => promise.status === 'open').length}</small>
            ) : null}
            {item.id === 'knowledge' ? <small>{memory.knowledge.length}</small> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="memory-overview">
          <div className="memory-score-row">
            <div className={`memory-score score-${memory.health.score >= 80 ? 'good' : memory.health.score >= 50 ? 'warn' : 'bad'}`}>
              <strong>{memory.health.score}</strong>
              <span>连续性健康分</span>
            </div>
            <div>
              <strong>{memory.volumes.length}</strong>
              <span>卷记忆</span>
            </div>
            <div>
              <strong>{memory.facts.length}</strong>
              <span>事实</span>
            </div>
            <div>
              <strong>{memory.promises.filter((promise) => promise.status === 'open').length}</strong>
              <span>未回收</span>
            </div>
            <div>
              <strong>{memory.knowledge.length}</strong>
              <span>认知条目</span>
            </div>
          </div>

          <section className="memory-block">
            <h4>SQLite 故事库与语义索引</h4>
            <p>
              {sqliteStatus.ready
                ? `已就绪：${sqliteStatus.documents} 个文档 / ${sqliteStatus.terms} 个检索词 / ${sqliteStatus.vectors} 个语义向量 / ${(sqliteStatus.sizeBytes / 1024 / 1024).toFixed(1)} MB`
                : '尚未建立本地 SQLite 索引。建立后写作检索会优先走 SQLite；配置 Embedding 模型后支持向量语义检索。'}
            </p>
            <div className="memory-sqlite-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={indexingSqlite}
                onClick={() => void indexSqlite()}
              >
                {indexingSqlite ? '建立索引…' : sqliteStatus.ready ? '同步 SQLite 索引' : '建立 SQLite 索引'}
              </button>
              <span>
                {hasEmbeddingModel(api)
                  ? `语义模型：${api.embeddingModel}`
                  : '未配置 Embedding 模型：当前使用 SQLite 关键词索引'}
              </span>
            </div>
            {sqliteStatus.indexedAt ? (
              <small>上次索引：{new Date(sqliteStatus.indexedAt).toLocaleString()}</small>
            ) : null}
          </section>

          {activeVolume ? (
            <section className="memory-block">
              <h4>当前卷记忆</h4>
              <p>{activeVolume.title}：{activeVolume.summary}</p>
              {activeVolume.openThreads.length > 0 ? (
                <small>未解决：{activeVolume.openThreads.join('；')}</small>
              ) : null}
            </section>
          ) : null}

          {lastAudit ? (
            <section className="memory-block">
              <h4>最近生成审计：第 {lastAudit.chapterNumber} 章</h4>
              {lastAudit.issues.length === 0 ? (
                <p className="memory-ok">未发现明显连续性问题。</p>
              ) : (
                <div className="memory-issue-list">
                  {lastAudit.issues.map((issue) => (
                    <div className={severityClass(issue)} key={issue.id}>
                      <strong>{issue.title}</strong>
                      <p>{issue.detail}</p>
                      {issue.suggestion ? <small>{issue.suggestion}</small> : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <section className="memory-block">
            <h4>健康检查</h4>
            {memory.health.issues.length === 0 ? (
              <p className="memory-ok">没有发现结构性问题。</p>
            ) : (
              <div className="memory-issue-list">
                {memory.health.issues.slice(0, 12).map((issue) => (
                  <div className={severityClass(issue)} key={issue.id}>
                    <strong>{issue.title}</strong>
                    <p>{issue.detail}</p>
                    {issue.suggestion ? <small>{issue.suggestion}</small> : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="memory-block">
            <h4>卷级记忆</h4>
            <div className="memory-volume-list">
              {memory.volumes.map((volume) => (
                <div key={volume.id}>
                  <strong>{volume.title}</strong>
                  <span>{volume.chapterCount} 章 · {volume.keyEvents.length} 个关键事件</span>
                  <p>{volume.summary.slice(0, 300)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {tab === 'facts' ? (
        <div className="memory-facts">
          <div className="memory-toolbar">
            <input
              className="input"
              placeholder="按人物 / 势力 / 字段 / 值搜索"
              value={factQuery}
              onChange={(event) => setFactQuery(event.target.value)}
            />
            <span>当前章节有效事实 {currentFactList.length} 条</span>
          </div>
          <div className="memory-fact-list">
            {currentFactList.slice(0, 120).map((fact) => (
              <article className="memory-fact" key={fact.id}>
                <div>
                  <strong>
                    {fact.subjectName} · {fact.field}
                  </strong>
                  <span>
                    第 {fact.validFromChapterNumber} 章 · {fact.status === 'retconned' ? '已撤回' : fact.status === 'rumor' ? '传闻' : '正史'} · {fact.confidence}
                  </span>
                </div>
                <p>{fact.displayValue}</p>
                <FactStatusButton
                  fact={fact}
                  onChange={(status) => updateFactStatus(fact.id, status)}
                />
              </article>
            ))}
            {currentFactList.length === 0 ? <p className="drawer-empty">没有匹配事实。</p> : null}
          </div>
        </div>
      ) : null}

      {tab === 'promises' ? (
        <div className="memory-promises">
          <div className="memory-promise-form">
            <strong>新增剧情承诺</strong>
            <input
              className="input"
              placeholder="标题：例如 母亲遗书的真相"
              value={newPromise.title}
              onChange={(event) => setNewPromise({ ...newPromise, title: event.target.value })}
            />
            <input
              className="input"
              placeholder="说明 / 承诺内容"
              value={newPromise.detail}
              onChange={(event) => setNewPromise({ ...newPromise, detail: event.target.value })}
            />
            <select
              className="input select"
              value={newPromise.kind}
              onChange={(event) =>
                setNewPromise({ ...newPromise, kind: event.target.value as StoryPromise['kind'] })
              }
            >
              <option value="promise">承诺</option>
              <option value="foreshadow">伏笔</option>
              <option value="threat">威胁</option>
              <option value="goal">目标</option>
              <option value="mystery">谜团</option>
            </select>
            <select
              className="input select"
              value={newPromise.priority}
              onChange={(event) =>
                setNewPromise({ ...newPromise, priority: event.target.value as StoryPromise['priority'] })
              }
            >
              <option value="main">主线</option>
              <option value="side">支线</option>
              <option value="background">氛围</option>
            </select>
            <select
              className="input select"
              value={newPromise.dueChapterId}
              onChange={(event) => setNewPromise({ ...newPromise, dueChapterId: event.target.value })}
            >
              <option value="">无回收期限</option>
              {chapters.map((chapter, index) => (
                <option value={chapter.id} key={chapter.id}>
                  第 {index + 1} 章前回收
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-primary btn-sm" onClick={addPromise}>
              加入账本
            </button>
          </div>
          <label className="memory-check">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(event) => setShowResolved(event.target.checked)}
            />
            显示已回收 / 已放弃
          </label>
          <div className="memory-promise-list">
            {visiblePromises.map((promise) => (
              <article
                className={`memory-promise status-${promise.status}`}
                key={promise.id}
              >
                <header>
                  <div>
                    <strong>{promise.title}</strong>
                    <span>
                      {promise.priority === 'main' ? '主线' : promise.priority === 'side' ? '支线' : '氛围'}
                      {promise.dueChapterNumber ? ` · 计划第 ${promise.dueChapterNumber} 章处理` : ' · 无期限'}
                      {' · '}
                      {promise.status === 'open' ? '未回收' : promise.status === 'advanced' ? '已推进' : promise.status === 'resolved' ? '已回收' : '已放弃'}
                    </span>
                  </div>
                  <PromiseStatusActions
                    promise={promise}
                    onChange={(status) => updatePromiseStatus(promise.id, status)}
                  />
                </header>
                {promise.detail ? <p>{promise.detail}</p> : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'knowledge' ? (
        <div className="memory-knowledge">
          <select
            className="input select"
            value={knowledgeCharacter}
            onChange={(event) => setKnowledgeCharacter(event.target.value)}
          >
            <option value="">全部角色</option>
            {detail.characters.map((character) => (
              <option value={character.id} key={character.id}>
                {character.name}
              </option>
            ))}
          </select>
          <div className="memory-knowledge-list">
            {[...groupedKnowledge.entries()].map(([characterId, entries]) => {
              const character = detail.characters.find((item) => item.id === characterId)
              return (
                <section className="memory-knowledge-card" key={characterId}>
                  <h4>{character?.name ?? entries[0]?.characterName ?? characterId}</h4>
                  <div className="memory-knowledge-tags">
                    {entries
                      .filter((entry) => entry.state === '知道')
                      .slice(0, 12)
                      .map((entry) => (
                        <span className="knows" key={entry.id}>知道：{entry.topic}</span>
                      ))}
                    {entries
                      .filter((entry) => entry.state === '误以为')
                      .slice(0, 10)
                      .map((entry) => (
                        <span className="believes" key={entry.id}>误以为：{entry.topic}</span>
                      ))}
                    {entries
                      .filter((entry) => entry.state === '不知道')
                      .slice(0, 12)
                      .map((entry) => (
                        <span className="unknown" key={entry.id}>不知道：{entry.topic}</span>
                      ))}
                  </div>
                </section>
              )
            })}
            {groupedKnowledge.size === 0 ? <p className="drawer-empty">还没有认知条目。</p> : null}
          </div>
        </div>
      ) : null}

      {tab === 'context' ? (
        <div className="memory-context">
          <p className="memory-context-note">
            以下内容会按预算进入 AI 写作上下文。它是“候选记忆”，不一定全部进入；正式上下文仍由生成器按预算裁剪。
          </p>
          {contextSections.length === 0 ? (
            <p className="drawer-empty">当前章节没有额外记忆上下文。</p>
          ) : (
            <pre className="memory-context-preview">{contextSections.join('\n\n')}</pre>
          )}
        </div>
      ) : null}
    </div>
  )
}
