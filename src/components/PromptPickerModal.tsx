import { useMemo, useState } from 'react'
import type { Prompt } from '../types'
import { IconSearch, IconStar } from './Icons'
import { Modal } from './Modal'

interface PromptPickerModalProps {
  prompts: Prompt[]
  selectedIds: string[]
  onClose: () => void
  onSave: (ids: string[]) => void
}

export function PromptPickerModal({
  prompts,
  selectedIds,
  onClose,
  onSave,
}: PromptPickerModalProps) {
  const [selected, setSelected] = useState<string[]>(selectedIds)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return prompts
    return prompts.filter((prompt) =>
      `${prompt.title} ${prompt.content} ${prompt.category} ${prompt.tags.join(' ')}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [prompts, query])

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  return (
    <Modal
      title="本作提示词"
      subtitle="选中的提示词会随每次导戏一起交给 AI。"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(selected)}>
            保存（已选 {selected.length} 条）
          </button>
        </>
      }
    >
      {prompts.length === 0 ? (
        <div className="prompt-pick-empty">
          <p>还没有提示词。</p>
          <p>先去左侧导航的「提示词管理」新建几条，再回来启用。</p>
        </div>
      ) : (
        <>
          <label className="prompt-pick-search">
            <IconSearch size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索提示词"
              aria-label="搜索提示词"
            />
          </label>

          <div className="prompt-pick-list">
            {filtered.map((prompt) => {
              const checked = selected.includes(prompt.id)
              return (
                <label key={prompt.id} className={`prompt-pick-row ${checked ? 'selected' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(prompt.id)} />
                  <span className="prompt-pick-info">
                    <span className="prompt-pick-title">
                      {prompt.title}
                      {prompt.favorite ? (
                        <IconStar size={11} filled className="prompt-pick-star" />
                      ) : null}
                    </span>
                    <span className="prompt-pick-meta">
                      {prompt.category} · {prompt.content}
                    </span>
                  </span>
                </label>
              )
            })}
            {filtered.length === 0 ? (
              <p className="prompt-pick-empty-text">没有匹配的提示词</p>
            ) : null}
          </div>
        </>
      )}
    </Modal>
  )
}
