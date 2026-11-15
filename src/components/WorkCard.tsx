import type { KeyboardEvent, MouseEvent } from 'react'
import type { Work } from '../types'
import { formatRelative, formatWords } from '../utils'
import { IconArrowRight, IconCheck, IconPlus, IconTrash } from './Icons'
import { ImagePickerButton } from './ImagePickerButton'

const COVER_CLASS = ['cover-ink', 'cover-rose', 'cover-gold', 'cover-blue', 'cover-slate']

interface WorkCardProps {
  work: Work
  onOpen: (id: string) => void
  onDelete: (work: Work) => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string, event?: MouseEvent) => void
  onCoverChange?: (workId: string, file: File) => Promise<void> | void
  onRemoveCover?: (workId: string) => void
  onCoverError?: (message: string) => void
}

export function WorkCard({
  work,
  onOpen,
  onDelete,
  selectable = false,
  selected = false,
  onToggleSelect,
  onCoverChange,
  onRemoveCover,
  onCoverError,
}: WorkCardProps) {
  const coverClass = COVER_CLASS[work.coverIndex % COVER_CLASS.length]
  const badge = work.status === '草稿' ? 'draft' : work.status === '已完结' ? 'done' : ''

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (selectable) onToggleSelect?.(work.id)
      else onOpen(work.id)
    }
  }

  const handleDelete = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onDelete(work)
  }

  return (
    <div
      className={`work-card ${selectable ? 'selectable' : ''} ${selected ? 'selected' : ''}`}
      data-work-id={work.id}
      data-work-title={work.title}
      role="button"
      tabIndex={0}
      aria-pressed={selectable ? selected : undefined}
      onClick={(event) => {
        if (selectable) onToggleSelect?.(work.id, event)
        else onOpen(work.id)
      }}
      onKeyDown={handleKeyDown}
    >
      {selectable ? (
        <span className={`work-select-check ${selected ? 'active' : ''}`} aria-hidden="true">
          <IconCheck size={13} />
        </span>
      ) : null}
      <span className={`cover ${work.coverImage ? 'has-image' : coverClass}`}>
        {work.coverImage ? (
          <img className="cover-image" src={work.coverImage} alt="" draggable={false} />
        ) : null}
        <span className="cover-top">
          <span className={`status-pill ${badge}`}>{work.status}</span>
          <span className="cover-genre" title={work.genres.join(' · ')}>
            {work.genres.slice(0, 2).join(' / ')}
          </span>
        </span>
        {work.coverImage ? null : (
          <span className="cover-char" aria-hidden="true">
            {work.title.slice(0, 1)}
          </span>
        )}
        {work.coverImage ? <span className="cover-image-shade" aria-hidden="true" /> : null}
        <span className="cover-glow" aria-hidden="true" />
        {selectable ? null : onCoverChange ? (
          <span className="work-cover-actions">
            <ImagePickerButton
              label={work.coverImage ? '换封面' : '封面'}
              title={work.coverImage ? '更换书籍封面' : '设置书籍封面'}
              className="work-cover-action"
              onPick={(file) => onCoverChange(work.id, file)}
              onError={onCoverError}
            />
            {work.coverImage && onRemoveCover ? (
              <button
                type="button"
                className="work-cover-action danger"
                onClick={(event) => {
                  event.stopPropagation()
                  onRemoveCover(work.id)
                }}
              >
                移除
              </button>
            ) : null}
          </span>
        ) : null}
      </span>
      <span className="card-body">
        <span className="card-title">{work.title}</span>
        <span className="card-meta">
          <span>{work.chapters > 0 ? `第 ${work.chapters} 章` : '尚未起戏'}</span>
          <span className="dot-sep">·</span>
          <span>{formatWords(work.words)}</span>
        </span>
        <span className="card-foot">
          <span>{formatRelative(work.updatedAt)}</span>
          <span className="card-go">
            {selectable ? (selected ? '已选择' : '选择') : '继续写'}
            <IconArrowRight size={14} />
          </span>
          {selectable ? null : (
            <button
              type="button"
              className="work-card-delete"
              title="删除作品"
              aria-label={`删除作品《${work.title}》`}
              onClick={handleDelete}
            >
              <IconTrash size={13} />
            </button>
          )}
        </span>
      </span>
    </div>
  )
}

export function NewWorkCard({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="new-card" onClick={onClick}>
      <span className="new-plus">
        <IconPlus size={20} />
      </span>
      <span className="new-title">新建作品</span>
      <span className="new-sub">从一句戏开始</span>
    </button>
  )
}
