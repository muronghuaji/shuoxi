import { useState } from 'react'
import type { Chapter, Work, WorkDetail } from '../types'
import { chapterWords, formatWords } from '../utils'
import { downloadTextFile } from '../backup'
import { buildDocx, buildEpub } from '../exportFormats'
import { locationMapSvg } from '../locationMap'
import { Modal } from './Modal'

interface ExportNovelModalProps {
  work: Work
  chapters: Chapter[]
  detail?: WorkDetail
  initialChapterId?: string | null
  onClose: () => void
  onToast: (message: string) => void
}

type ExportFormat = 'markdown' | 'txt' | 'docx' | 'epub'
type TextExportFormat = 'markdown' | 'txt'

const FORMAT_LABEL: Record<ExportFormat, string> = {
  markdown: 'Markdown',
  txt: 'TXT',
  docx: 'DOCX',
  epub: 'EPUB',
}

function downloadBytes(filename: string, bytes: Uint8Array, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function chapterHeading(chapter: Chapter, index: number): string {
  if (/^第.+[章回节卷]/.test(chapter.title.trim())) return chapter.title.trim()
  return `第 ${index + 1} 章 ${chapter.title || '未命名章节'}`
}

function buildExport(work: Work, chapters: Chapter[], selected: Set<string>, format: TextExportFormat): string {
  const picked = chapters
    .map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter }) => selected.has(chapter.id))
  if (format === 'txt') {
    return [
      work.title,
      work.synopsis ? `\n${work.synopsis}` : '',
      ...picked.map(
        ({ chapter, index }) => `\n\n${chapterHeading(chapter, index)}\n\n${chapter.content.trim()}`,
      ),
    ].join('')
  }
  return [
    `# ${work.title}`,
    work.synopsis ? `> ${work.synopsis}` : '',
    work.theme ? `主题：${work.theme}` : '',
    ...picked.map(
      ({ chapter, index }) =>
        `## ${chapterHeading(chapter, index)}\n\n${chapter.content.trim()}`,
    ),
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function ExportNovelModal({
  work,
  chapters,
  detail,
  initialChapterId,
  onClose,
  onToast,
}: ExportNovelModalProps) {
  const [scope, setScope] = useState<'all' | 'selected'>(
    initialChapterId ? 'selected' : 'all',
  )
  const [format, setFormat] = useState<ExportFormat>('markdown')
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        initialChapterId && chapters.some((chapter) => chapter.id === initialChapterId)
          ? [initialChapterId]
          : chapters.map((chapter) => chapter.id),
      ),
  )

  const toggle = (chapterId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(chapterId)) next.delete(chapterId)
      else next.add(chapterId)
      return next
    })
  }

  const mapSvg = detail?.locationMap
    ? locationMapSvg(
        detail.locationMap,
        detail.locations ?? [],
        detail.locationLinks ?? [],
      )
    : undefined

  const exportNow = () => {
    if (chapters.length === 0) {
      onToast('还没有章节可导出')
      return
    }
    const ids = scope === 'all' ? new Set(chapters.map((chapter) => chapter.id)) : selected
    if (ids.size === 0) {
      onToast('至少选择一章')
      return
    }
    const picked = chapters.filter((chapter) => ids.has(chapter.id))
    const safeTitle = work.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || 'shuoxi'
    const suffix =
      scope === 'all' ? '全本' : ids.size === 1 ? '单章' : `选章-${ids.size}章`
    if (format === 'docx') {
      downloadBytes(
        `${safeTitle}-${suffix}.docx`,
        buildDocx(work, picked),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
    } else if (format === 'epub') {
      downloadBytes(
        `${safeTitle}-${suffix}.epub`,
        buildEpub(work, picked, mapSvg),
        'application/epub+zip',
      )
    } else {
      const content = buildExport(work, chapters, ids, format)
      downloadTextFile(
        `${safeTitle}-${suffix}.${format === 'markdown' ? 'md' : 'txt'}`,
        content,
        format === 'markdown'
          ? 'text/markdown;charset=utf-8'
          : 'text/plain;charset=utf-8',
      )
    }
    onToast(`已导出 ${ids.size} 章 · ${FORMAT_LABEL[format]}`)
    onClose()
  }

  return (
    <Modal
      title="导出小说"
      subtitle={`${work.title} · 共 ${chapters.length} 章 / ${formatWords(
        chapters.reduce((sum, chapter) => sum + chapterWords(chapter), 0),
      )}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={exportNow}>
            导出文件
          </button>
        </>
      }
    >
      <div className="export-novel">
        <div className="export-novel-options">
          <div>
            <span>导出范围</span>
            <div className="export-scope-switch">
              <button
                type="button"
                className={scope === 'all' ? 'active' : ''}
                onClick={() => setScope('all')}
              >
                整本
              </button>
              <button
                type="button"
                className={scope === 'selected' ? 'active' : ''}
                onClick={() => setScope('selected')}
              >
                选择章节
              </button>
            </div>
          </div>
          <div>
            <span>文件格式</span>
            <div className="export-scope-switch">
              <button
                type="button"
                className={format === 'markdown' ? 'active' : ''}
                onClick={() => setFormat('markdown')}
              >
                Markdown
              </button>
              <button
                type="button"
                className={format === 'txt' ? 'active' : ''}
                onClick={() => setFormat('txt')}
              >
                TXT
              </button>
              <button
                type="button"
                className={format === 'docx' ? 'active' : ''}
                onClick={() => setFormat('docx')}
              >
                DOCX
              </button>
              <button
                type="button"
                className={format === 'epub' ? 'active' : ''}
                onClick={() => setFormat('epub')}
              >
                EPUB
              </button>
            </div>
          </div>
        </div>

        {scope === 'selected' ? (
          <div className="export-chapter-picker">
            <div className="export-chapter-toolbar">
              <span>
                已选 {selected.size} / {chapters.length} 章
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelected(new Set(chapters.map((chapter) => chapter.id)))}
              >
                全选
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
                清空
              </button>
            </div>
            <div className="export-chapter-list">
              {chapters.map((chapter, index) => (
                <label className={`export-chapter-row ${selected.has(chapter.id) ? 'active' : ''}`} key={chapter.id}>
                  <input
                    type="checkbox"
                    checked={selected.has(chapter.id)}
                    onChange={() => toggle(chapter.id)}
                  />
                  <span className="export-chapter-index">第 {index + 1} 章</span>
                  <span className="export-chapter-title">{chapter.title || '未命名章节'}</span>
                  <small>{formatWords(chapterWords(chapter))}</small>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="drawer-hint">导出整本会按当前章节顺序写入全部正文。</p>
        )}
      </div>
    </Modal>
  )
}
