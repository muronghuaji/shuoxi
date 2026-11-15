import { useDeferredValue, useMemo, useState } from 'react'
import type { Chapter, Work, WorkDetail } from '../types'
import { Modal } from './Modal'
import { useContextMenu } from './ContextMenuProvider'
import { copyTextToClipboard } from '../clipboard'

interface CommandPaletteProps {
  works: Work[]
  chaptersByWork: Record<string, Chapter[]>
  detailsByWork: Record<string, WorkDetail>
  onOpenWork: (workId: string) => void
  onOpenPrompts: () => void
  onClose: () => void
}

interface SearchResult {
  id: string
  kind: string
  title: string
  detail: string
  action: () => void
}

const MAX_RESULTS = 80

export function CommandPalette({
  works,
  chaptersByWork,
  detailsByWork,
  onOpenWork,
  onOpenPrompts,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const { openContextMenu } = useContextMenu()

  const results = useMemo<SearchResult[]>(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    const next: SearchResult[] = []
    const match = (text: string) => text.toLowerCase().includes(keyword)

    // 空查询只给作品和工具入口，不遍历整本书的章节。
    if (!keyword) {
      for (const work of works.slice(0, 12)) {
        next.push({
          id: `work-${work.id}`,
          kind: '作品',
          title: work.title,
          detail: work.synopsis || work.genres.join(' / ') || '未写简介',
          action: () => onOpenWork(work.id),
        })
      }
      next.push({
        id: 'prompts',
        kind: '工具',
        title: '提示词库',
        detail: '管理写作提示词',
        action: onOpenPrompts,
      })
      return next.slice(0, 12)
    }

    for (const work of works) {
      if (next.length >= MAX_RESULTS) break
      if (match(`${work.title} ${work.synopsis} ${work.theme} ${work.genres.join(' ')}`)) {
        next.push({
          id: `work-${work.id}`,
          kind: '作品',
          title: work.title,
          detail: work.synopsis || work.genres.join(' / ') || '未写简介',
          action: () => onOpenWork(work.id),
        })
      }
      for (const [index, chapter] of (chaptersByWork[work.id] ?? []).entries()) {
        if (next.length >= MAX_RESULTS) break
        if (match(`${chapter.title} ${chapter.content}`)) {
          next.push({
            id: `chapter-${chapter.id}`,
            kind: `第 ${index + 1} 章`,
            title: chapter.title || '未命名章节',
            detail: `${work.title} · ${chapter.content.slice(0, 80) || '暂无正文'}`,
            action: () => onOpenWork(work.id),
          })
        }
      }
      const detail = detailsByWork[work.id]
      if (!detail) continue
      for (const character of detail.characters) {
        if (next.length >= MAX_RESULTS) break
        if (match(`${character.name} ${character.identity} ${character.role}`)) {
          next.push({
            id: `character-${character.id}`,
            kind: '角色',
            title: character.name || '未命名角色',
            detail: `${work.title} · ${character.identity || character.role}`,
            action: () => onOpenWork(work.id),
          })
        }
      }
      for (const faction of detail.factions) {
        if (next.length >= MAX_RESULTS) break
        if (match(`${faction.name} ${faction.type} ${faction.description}`)) {
          next.push({
            id: `faction-${faction.id}`,
            kind: '势力',
            title: faction.name || '未命名势力',
            detail: `${work.title} · ${faction.type || '类型未定'}`,
            action: () => onOpenWork(work.id),
          })
        }
      }
      for (const location of detail.locations ?? []) {
        if (next.length >= MAX_RESULTS) break
        if (match(`${location.name} ${location.type} ${location.description}`)) {
          next.push({
            id: `location-${location.id}`,
            kind: '地点',
            title: location.name || '未命名地点',
            detail: `${work.title} · ${location.type || '类型未定'}`,
            action: () => onOpenWork(work.id),
          })
        }
      }
    }

    next.push({
      id: 'prompts',
      kind: '工具',
      title: '提示词库',
      detail: '管理写作提示词',
      action: onOpenPrompts,
    })
    return next.slice(0, 40)
  }, [
    deferredQuery,
    works,
    chaptersByWork,
    detailsByWork,
    onOpenWork,
    onOpenPrompts,
  ])

  return (
    <Modal title="全局搜索" subtitle="作品 / 章节 / 角色 / 势力 / 地点" onClose={onClose} size="lg">
      <div className="command-palette">
        <input
          className="input command-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索全书内容，或直接敲 Ctrl / Cmd + K"
          autoFocus
          aria-label="全局搜索"
        />
        <div className="command-results">
          {results.length === 0 ? (
            <p className="drawer-empty">没有匹配的内容。</p>
          ) : (
            results.map((result) => (
              <button
                type="button"
                className="command-result"
                key={result.id}
                onContextMenu={(event) =>
                  openContextMenu(event, [
                    { type: 'label', label: `${result.kind} · ${result.title}` },
                    {
                      label: '打开',
                      onSelect: () => {
                        result.action()
                        onClose()
                      },
                    },
                    {
                      label: '复制结果标题',
                      onSelect: () => {
                        void copyTextToClipboard(result.title)
                      },
                    },
                    {
                      label: '复制结果详情',
                      onSelect: () => {
                        void copyTextToClipboard([result.title, result.detail].join('\n'))
                      },
                    },
                  ])
                }
                onClick={() => {
                  result.action()
                  onClose()
                }}
              >
                <span>{result.kind}</span>
                <div>
                  <strong>{result.title}</strong>
                  <p>{result.detail}</p>
                </div>
                <small>↗</small>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
