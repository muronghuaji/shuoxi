import { useMemo, useState } from 'react'
import type { Chapter } from '../types'
import { chapterWords, formatWords } from '../utils'
import { Modal } from './Modal'

interface SyncMultiChapterModalProps {
  chapters: Chapter[]
  initialChapterId?: string
  onConfirm: (chapterIds: string[]) => void
  onClose: () => void
}

export function SyncMultiChapterModal({
  chapters,
  initialChapterId,
  onConfirm,
  onClose,
}: SyncMultiChapterModalProps) {
  const selectable = useMemo(
    () => chapters.filter((chapter) => chapter.content.trim()),
    [chapters],
  )
  const [selected, setSelected] = useState<Set<string>>(() => {
    const initial = selectable.find((chapter) => chapter.id === initialChapterId)
    return new Set(initial ? [initial.id] : selectable.slice(-10).map((chapter) => chapter.id))
  })

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Modal
      title="多章深度同步"
      subtitle="选择章节后按章节顺序补全角色经历和完整审查；不会重复追加已有事件"
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={selected.size === 0}
            onClick={() => onConfirm([...selected])}
          >
            同步 {selected.size} 章
          </button>
        </>
      }
    >
      <div className="sync-multi">
        <div className="sync-multi-tools">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSelected(new Set(selectable.map((chapter) => chapter.id)))}
          >
            全选
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
            清空
          </button>
          <span>已选 {selected.size} / {selectable.length} 章</span>
        </div>
        <div className="sync-multi-list">
          {selectable.map((chapter, index) => (
            <label className="sync-multi-row" key={chapter.id}>
              <input
                type="checkbox"
                checked={selected.has(chapter.id)}
                onChange={() => toggle(chapter.id)}
              />
              <span className="sync-multi-title">
                {chapter.title || `第 ${index + 1} 章`}
              </span>
              <small>{formatWords(chapterWords(chapter))}</small>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  )
}
