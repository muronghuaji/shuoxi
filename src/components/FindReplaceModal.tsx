import { useMemo, useState } from 'react'
import { findMatches, replaceAllMatches, replaceMatchAt } from '../findReplace'
import { IconArrowLeft, IconArrowRight, IconSearch } from './Icons'
import { Modal } from './Modal'

interface FindReplaceModalProps {
  content: string
  chapterTitle: string
  onApply: (nextText: string) => void
  onClose: () => void
}

export function FindReplaceModal({
  content,
  chapterTitle,
  onApply,
  onClose,
}: FindReplaceModalProps) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const matches = useMemo(
    () => findMatches(content, query, { caseSensitive }),
    [caseSensitive, content, query],
  )
  const activeMatch = matches[Math.min(activeIndex, Math.max(0, matches.length - 1))]
  const activeSafeIndex = matches.length ? Math.min(activeIndex, matches.length - 1) : 0

  const go = (delta: number) => {
    if (matches.length === 0) return
    setActiveIndex((current) => (current + delta + matches.length) % matches.length)
  }

  const replaceOne = () => {
    if (!activeMatch) return
    onApply(replaceMatchAt(content, activeMatch, replacement))
  }

  const replaceAll = () => {
    const result = replaceAllMatches(content, query, replacement, { caseSensitive })
    if (result.count === 0) return
    onApply(result.text)
    onClose()
  }

  return (
    <Modal
      title="查找替换"
      subtitle={`${chapterTitle || '当前章节'} · 只作用于当前章节正文`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={replaceOne}
            disabled={!activeMatch}
          >
            替换当前
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={replaceAll}
            disabled={matches.length === 0}
          >
            全部替换
          </button>
        </>
      }
    >
      <div className="find-replace">
        <label className="find-replace-field">
          <span>
            <IconSearch size={13} /> 查找
          </span>
          <input
            className="input"
            value={query}
            autoFocus
            placeholder="输入要查找的文字"
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
          />
        </label>
        <label className="find-replace-field">
          <span>替换为</span>
          <input
            className="input"
            value={replacement}
            placeholder="留空表示删除"
            onChange={(event) => setReplacement(event.target.value)}
          />
        </label>
        <div className="find-replace-options">
          <label>
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(event) => {
                setCaseSensitive(event.target.checked)
                setActiveIndex(0)
              }}
            />
            区分大小写
          </label>
          <div className="find-replace-nav">
            <span>{matches.length > 0 ? `${activeSafeIndex + 1} / ${matches.length}` : '0 个匹配'}</span>
            <button type="button" onClick={() => go(-1)} disabled={matches.length === 0} aria-label="上一个">
              <IconArrowLeft size={13} />
            </button>
            <button type="button" onClick={() => go(1)} disabled={matches.length === 0} aria-label="下一个">
              <IconArrowRight size={13} />
            </button>
          </div>
        </div>
        {matches.length > 0 && activeMatch ? (
          <div className="find-replace-preview">
            <span>匹配上下文</span>
            <p>
              {content.slice(Math.max(0, activeMatch.start - 42), activeMatch.start)}
              <mark>{activeMatch.text}</mark>
              {content.slice(activeMatch.end, activeMatch.end + 42)}
            </p>
          </div>
        ) : query ? (
          <p className="find-replace-empty">没有匹配。</p>
        ) : null}
      </div>
    </Modal>
  )
}
