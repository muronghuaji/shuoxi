import { useEffect, useRef, useState } from 'react'
import type { Genre } from '../types'
import { GENRE_CATEGORIES } from '../genres'
import { IconCheck, IconChevronDown, IconSearch, IconX } from './Icons'

interface GenrePickerProps {
  value: Genre[]
  onChange: (genres: Genre[]) => void
  invalid?: boolean
}

export function GenrePicker({ value, onChange, invalid = false }: GenrePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setSearch('')
      return
    }

    const timer = window.setTimeout(() => {
      searchRef.current?.focus()
      popRef.current?.scrollIntoView({ block: 'nearest' })
    }, 40)

    const handlePointer = (event: MouseEvent) => {
      if (!wrapRef.current || wrapRef.current.contains(event.target as Node)) return
      setOpen(false)
    }

    // 用 click 而不是 mousedown：避免点击弹窗外元素时面板先收起、
    // 弹窗高度变化导致这一次点击丢失（Windows 上表现为要点两次）。
    document.addEventListener('click', handlePointer)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('click', handlePointer)
    }
  }, [open])

  const toggle = (genre: Genre) => {
    onChange(
      value.includes(genre) ? value.filter((item) => item !== genre) : [...value, genre],
    )
  }

  const keyword = search.trim()
  const groups = GENRE_CATEGORIES.map((group) => ({
    name: group.name,
    genres: group.genres.filter((genre) => (keyword ? genre.includes(keyword) : true)),
  })).filter((group) => group.genres.length > 0)

  return (
    <div
      className={`genre-picker ${invalid ? 'is-invalid' : ''}`}
      ref={wrapRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <div className="genre-control">
        <div className="genre-selected">
          {value.length === 0 ? (
            <span className="genre-placeholder">选择题材（可多选）</span>
          ) : (
            value.map((genre) => (
              <span key={genre} className="genre-chip">
                {genre}
                <button
                  type="button"
                  className="genre-remove"
                  aria-label={`移除 ${genre}`}
                  onClick={() => toggle(genre)}
                >
                  <IconX size={11} />
                </button>
              </span>
            ))
          )}
        </div>
        <button
          type="button"
          className="genre-toggle"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={open ? '收起题材选择' : '展开题材选择'}
        >
          <IconChevronDown size={16} className={open ? 'rotated' : ''} />
        </button>
      </div>

      {open ? (
        <div className="genre-pop" ref={popRef}>
          <div className="genre-search">
            <IconSearch size={14} />
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索题材，比如：悬疑、种田、无限流"
              aria-label="搜索题材"
            />
          </div>

          <div className="genre-groups" role="listbox" aria-multiselectable="true">
            {groups.map((group) => (
              <div key={group.name} className="genre-group">
                <p className="genre-group-title">{group.name}</p>
                <div className="genre-options">
                  {group.genres.map((genre) => {
                    const selected = value.includes(genre)
                    return (
                      <button
                        key={genre}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`genre-option ${selected ? 'selected' : ''}`}
                        onClick={() => toggle(genre)}
                      >
                        <span className="genre-option-check">
                          {selected ? <IconCheck size={10} /> : null}
                        </span>
                        {genre}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {groups.length === 0 ? (
              <p className="genre-empty">没有找到「{keyword}」相关题材</p>
            ) : null}
          </div>

          <div className="genre-pop-foot">
            <span>已选 {value.length} 个</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              完成
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
