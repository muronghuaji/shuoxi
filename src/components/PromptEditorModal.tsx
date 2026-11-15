import { useState } from 'react'
import type { Prompt, PromptCategory } from '../types'
import { PROMPT_CATEGORIES } from '../data'
import { IconCheck } from './Icons'
import { Modal } from './Modal'

export interface PromptDraftInput {
  title: string
  category: PromptCategory
  content: string
  tags: string[]
}

interface PromptEditorModalProps {
  prompt: Prompt | null
  draft?: PromptDraftInput | null
  onClose: () => void
  onSave: (prompt: Prompt) => void
  onRequestDelete: (prompt: Prompt) => void
}

interface Errors {
  title?: string
  content?: string
}

export function PromptEditorModal({
  prompt,
  draft,
  onClose,
  onSave,
  onRequestDelete,
}: PromptEditorModalProps) {
  const initial = prompt ?? draft
  const [title, setTitle] = useState(initial?.title ?? '')
  const [category, setCategory] = useState<PromptCategory>(initial?.category ?? '通用')
  const [content, setContent] = useState(initial?.content ?? '')
  const [tagsText, setTagsText] = useState(initial?.tags.join('，') ?? '')
  const [errors, setErrors] = useState<Errors>({})

  const tags = tagsText
    .split(/[，,]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8)

  const save = () => {
    const next: Errors = {}
    if (!title.trim()) next.title = '请填写提示词标题'
    if (!content.trim()) next.content = '请填写提示词内容'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const now = Date.now()
    if (prompt) {
      onSave({
        ...prompt,
        title: title.trim(),
        category,
        content: content.trim(),
        tags,
        updatedAt: now,
      })
    } else {
      onSave({
        id: `p-${now.toString(36)}`,
        title: title.trim(),
        category,
        content: content.trim(),
        tags,
        favorite: false,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  return (
    <Modal
      title={prompt ? '编辑提示词' : '新建提示词'}
      subtitle="写清一条可复用的写作要求，之后可以在任何作品里启用。"
      onClose={onClose}
      footer={
        <>
          {prompt ? (
            <button type="button" className="btn btn-danger-ghost" onClick={() => onRequestDelete(prompt)}>
              删除
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            <IconCheck size={16} />
            保存
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="prompt-title">
          <span className="req">*</span>标题
        </label>
        <input
          id="prompt-title"
          className={`input ${errors.title ? 'invalid' : ''}`}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            setErrors((prev) => ({ ...prev, title: undefined }))
          }}
          placeholder="比如：每场结尾留钩子"
          maxLength={60}
        />
        {errors.title ? <p className="field-error">{errors.title}</p> : null}
      </div>

      <div className="field">
        <span className="label">分类</span>
        <div className="chip-row" role="group" aria-label="提示词分类">
          {PROMPT_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              className={`chip ${category === item ? 'chip-active' : ''}`}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="prompt-content">
          <span className="req">*</span>提示词内容
        </label>
        <textarea
          id="prompt-content"
          className={`input textarea prompt-content-input ${errors.content ? 'invalid' : ''}`}
          value={content}
          onChange={(event) => {
            setContent(event.target.value)
            setErrors((prev) => ({ ...prev, content: undefined }))
          }}
          rows={8}
          maxLength={2000}
          placeholder="写清你希望 AI 遵守的写作要求，越具体越好。"
        />
        <div className="field-foot">
          <span className="hint-line">写清要什么、不要什么、在什么场景下用。</span>
          <span className="counter">{content.length} / 2000</span>
        </div>
        {errors.content ? <p className="field-error">{errors.content}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="prompt-tags">标签</label>
        <input
          id="prompt-tags"
          className="input"
          value={tagsText}
          onChange={(event) => setTagsText(event.target.value)}
          placeholder="用逗号分隔，比如：白描，克制，对话"
          maxLength={80}
        />
        <div className="field-foot">
          <span className="hint-line">最多 8 个标签，方便搜索和归类。</span>
          <span className="counter">已识别 {tags.length} 个</span>
        </div>
        {tags.length > 0 ? (
          <div className="prompt-tags prompt-tag-preview">
            {tags.map((tag) => (
              <span key={tag} className="prompt-tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
