import { useState } from 'react'
import type { Chapter, Work } from '../types'
import { addBookmark, loadBookmarks, removeBookmark, type Bookmark } from '../bookmarks'
import { IconBookmark, IconTrash } from './Icons'
import { Modal } from './Modal'

interface BookmarkModalProps {
  work: Work
  chapters: Chapter[]
  currentChapter?: Chapter
  currentScrollRatio?: number
  onJump: (chapterId: string, scrollRatio: number) => void
  onClose: () => void
}

export function BookmarkModal({
  work,
  chapters,
  currentChapter,
  currentScrollRatio = 0,
  onJump,
  onClose,
}: BookmarkModalProps) {
  const [items, setItems] = useState<Bookmark[]>(() => loadBookmarks(work.id))
  const [title, setTitle] = useState(currentChapter?.title ?? '')

  const refresh = () => setItems(loadBookmarks(work.id))

  const addCurrent = () => {
    if (!currentChapter) return
    addBookmark({
      workId: work.id,
      chapterId: currentChapter.id,
      chapterTitle: title.trim() || currentChapter.title || '未命名章节',
      scrollRatio: currentScrollRatio,
    })
    refresh()
  }

  return (
    <Modal
      title="书签"
      subtitle="收藏当前章节，阅读模式会记录滚动位置"
      size="md"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          关闭
        </button>
      }
    >
      <div className="bookmark-panel">
        {currentChapter ? (
          <div className="bookmark-add">
            <input
              className="input"
              value={title}
              placeholder="书签名称（默认章节名）"
              onChange={(event) => setTitle(event.target.value)}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={addCurrent}>
              <IconBookmark size={13} />
              收藏当前章
            </button>
          </div>
        ) : null}
        {items.length === 0 ? (
          <p className="hint-line">还没有书签。收藏后可以从这里跳回章节。</p>
        ) : (
          <div className="bookmark-list">
            {items.map((bookmark) => {
              const index = chapters.findIndex((chapter) => chapter.id === bookmark.chapterId)
              return (
                <div className="bookmark-row" key={bookmark.id}>
                  <button
                    type="button"
                    className="bookmark-jump"
                    disabled={index < 0}
                    onClick={() => onJump(bookmark.chapterId, bookmark.scrollRatio)}
                  >
                    <strong>{bookmark.chapterTitle || bookmark.chapterId}</strong>
                    <small>
                      {index >= 0 ? `第 ${index + 1} 章` : '章节已删除'}
                      {bookmark.scrollRatio > 0
                        ? ` · 读到 ${Math.round(bookmark.scrollRatio * 100)}%`
                        : ''}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="bookmark-delete"
                    title="删除书签"
                    onClick={() => {
                      removeBookmark(bookmark.id)
                      refresh()
                    }}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
