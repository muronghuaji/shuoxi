import { useMemo, useRef, useState } from 'react'
import type { AiUsageEntry, ApiConfig, Prompt, PromptCategory } from '../types'
import { PROMPT_CATEGORIES } from '../data'
import { formatRelative } from '../utils'
import { requestPromptGeneration } from '../promptGenerate'
import {
  IconCopy,
  IconFileText,
  IconPencil,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconStar,
  IconTrash,
} from './Icons'
import { Modal } from './Modal'
import { PromptEditorModal, type PromptDraftInput } from './PromptEditorModal'
import { useContextMenu, type ContextMenuEntry } from './ContextMenuProvider'
import { copyTextToClipboard } from '../clipboard'

interface PromptManagerViewProps {
  prompts: Prompt[]
  api: ApiConfig
  apiReady: boolean
  onSavePrompt: (prompt: Prompt) => void
  onDeletePrompt: (id: string) => void
  onToggleFavorite: (id: string) => void
  onDuplicatePrompt: (prompt: Prompt) => void
  onImportPrompts: (prompts: Prompt[]) => void
  onRecordUsage?: (entry: AiUsageEntry) => void
  onToast: (message: string) => void
}

interface PromptCardProps {
  prompt: Prompt
  onEdit: (prompt: Prompt) => void
  onDelete: (prompt: Prompt) => void
  onToggleFavorite: (id: string) => void
  onDuplicate: (prompt: Prompt) => void
  onToast: (message: string) => void
}

function PromptCard({
  prompt,
  onEdit,
  onDelete,
  onToggleFavorite,
  onDuplicate,
  onToast,
}: PromptCardProps) {
  const { openContextMenu } = useContextMenu()
  const contextMenu = (): ContextMenuEntry[] => [
    { type: 'label', label: prompt.title || '未命名提示词' },
    { label: '编辑提示词', onSelect: () => onEdit(prompt) },
    {
      label: '复制为新提示词',
      onSelect: () => onDuplicate(prompt),
    },
    {
      label: '复制提示词内容',
      onSelect: () => {
        void copyTextToClipboard(prompt.content).then((ok) =>
          onToast(ok ? '已复制提示词内容' : '复制失败'),
        )
      },
    },
    { type: 'separator' },
    {
      label: prompt.favorite ? '取消收藏' : '收藏',
      checked: prompt.favorite,
      onSelect: () => onToggleFavorite(prompt.id),
    },
    { type: 'separator' },
    {
      label: '删除提示词…',
      danger: true,
      onSelect: () => onDelete(prompt),
    },
  ]
  return (
    <article
      className="prompt-card"
      onContextMenu={(event) => openContextMenu(event, contextMenu())}
    >
      <div className="prompt-card-head">
        <span className="prompt-cat">{prompt.category}</span>
        <div className="prompt-card-tools">
          <button
            type="button"
            className={`icon-btn prompt-star ${prompt.favorite ? 'active' : ''}`}
            aria-label={prompt.favorite ? '取消收藏' : '收藏'}
            aria-pressed={prompt.favorite}
            title={prompt.favorite ? '取消收藏' : '收藏'}
            onClick={() => onToggleFavorite(prompt.id)}
          >
            <IconStar size={15} filled={prompt.favorite} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="编辑"
            title="编辑"
            onClick={() => onEdit(prompt)}
          >
            <IconPencil size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="复制"
            title="复制"
            onClick={() => onDuplicate(prompt)}
          >
            <IconCopy size={15} />
          </button>
          <button
            type="button"
            className="icon-btn danger"
            aria-label="删除"
            title="删除"
            onClick={() => onDelete(prompt)}
          >
            <IconTrash size={15} />
          </button>
        </div>
      </div>

      <button type="button" className="prompt-title-btn" onClick={() => onEdit(prompt)}>
        <span className="prompt-title">{prompt.title}</span>
        <span className="prompt-content">{prompt.content}</span>
      </button>

      <div className="prompt-tags">
        {prompt.tags.map((tag) => (
          <span key={tag} className="prompt-tag">
            {tag}
          </span>
        ))}
      </div>

      <footer className="prompt-card-foot">
        <span>{formatRelative(prompt.updatedAt)}</span>
        <button type="button" className="prompt-edit-link" onClick={() => onEdit(prompt)}>
          编辑
        </button>
      </footer>
    </article>
  )
}

export function PromptManagerView({
  prompts,
  api,
  apiReady,
  onSavePrompt,
  onDeletePrompt,
  onToggleFavorite,
  onDuplicatePrompt,
  onImportPrompts,
  onRecordUsage,
  onToast,
}: PromptManagerViewProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'全部' | PromptCategory>('全部')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)
  const [generatedDraft, setGeneratedDraft] = useState<PromptDraftInput | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiRequirement, setAiRequirement] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Prompt | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const favoriteCount = prompts.filter((prompt) => prompt.favorite).length

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return prompts
      .filter((prompt) => (favoritesOnly ? prompt.favorite : true))
      .filter((prompt) => (category === '全部' ? true : prompt.category === category))
      .filter((prompt) =>
        !keyword
          ? true
          : `${prompt.title} ${prompt.content} ${prompt.category} ${prompt.tags.join(' ')}`
              .toLowerCase()
              .includes(keyword),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [prompts, query, category, favoritesOnly])

  const openNew = () => {
    setGeneratedDraft(null)
    setEditingPrompt(null)
    setEditorOpen(true)
  }

  const openEdit = (prompt: Prompt) => {
    setGeneratedDraft(null)
    setEditingPrompt(prompt)
    setEditorOpen(true)
  }

  const exportPrompts = () => {
    if (prompts.length === 0) {
      onToast('提示词库为空，没有可导出的内容')
      return
    }
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      prompts,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `shuoxi-prompts-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    onToast(`已导出 ${prompts.length} 条提示词`)
  }

  const importPrompts = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      const rawList = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { prompts?: unknown }).prompts)
          ? (parsed as { prompts: unknown[] }).prompts
          : null
      if (!rawList) throw new Error('没有找到 prompts 数组')
      const now = Date.now()
      const seen = new Set(
        prompts.map((prompt) => `${prompt.title.trim()}\u0000${prompt.content.trim()}`),
      )
      const imported: Prompt[] = []
      for (const [index, item] of rawList.entries()) {
        if (!item || typeof item !== 'object') continue
        const raw = item as Record<string, unknown>
        const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 60) : ''
        const content = typeof raw.content === 'string' ? raw.content.trim().slice(0, 2000) : ''
        if (!title || !content) continue
        const key = `${title}\u0000${content}`
        if (seen.has(key)) continue
        seen.add(key)
        const rawCategory = typeof raw.category === 'string' ? raw.category : ''
        const category = PROMPT_CATEGORIES.includes(rawCategory as PromptCategory)
          ? (rawCategory as PromptCategory)
          : '其他'
        const tags = Array.isArray(raw.tags)
          ? raw.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim())
              .filter(Boolean)
              .slice(0, 8)
          : []
        imported.push({
          id: `p-import-${now.toString(36)}-${index}-${Math.random().toString(36).slice(2, 5)}`,
          title,
          content,
          category,
          tags,
          favorite: raw.favorite === true,
          createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
          updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
        })
      }
      if (imported.length === 0) {
        onToast('没有找到可导入的新提示词（可能已存在）')
        return
      }
      onImportPrompts(imported)
      onToast(`已导入 ${imported.length} 条提示词${rawList.length > imported.length ? `，跳过 ${rawList.length - imported.length} 条重复/无效项` : ''}`)
    } catch (error) {
      onToast(`导入失败：${error instanceof Error ? error.message : 'JSON 格式不正确'}`)
    }
  }

  const generatePrompt = async () => {
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return
    }
    if (!aiRequirement.trim()) {
      onToast('先说说这条提示词想要什么作用')
      return
    }
    setAiGenerating(true)
    try {
      const draft = await requestPromptGeneration({
        requirement: aiRequirement,
        categories: PROMPT_CATEGORIES,
        api,
        onRecordUsage,
      })
      setGeneratedDraft({
        title: draft.title,
        content: draft.content,
        category: draft.category as PromptCategory,
        tags: draft.tags,
      })
      setAiOpen(false)
      setEditingPrompt(null)
      setEditorOpen(true)
    } catch (error) {
      onToast(`提示词生成失败：${error instanceof Error ? error.message : '请稍后重试'}`)
    } finally {
      setAiGenerating(false)
    }
  }

  const requestDelete = (prompt: Prompt) => {
    setEditorOpen(false)
    setDeleteTarget(prompt)
  }

  const savePrompt = (prompt: Prompt) => {
    onSavePrompt(prompt)
    setEditorOpen(false)
    setGeneratedDraft(null)
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    onDeletePrompt(deleteTarget.id)
    setDeleteTarget(null)
  }

  const clearFilters = () => {
    setQuery('')
    setCategory('全部')
    setFavoritesOnly(false)
  }

  return (
    <div className="prompts-view">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="hello-block">
            <p className="hello">提示词库</p>
            <p className="hello-sub">
              {prompts.length} 条提示词 · {favoriteCount} 条收藏 · 写哪本书都能调用
            </p>
          </div>
          <div className="topbar-actions">
            <label className="search">
              <IconSearch size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、内容或标签"
                aria-label="搜索提示词"
              />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={exportPrompts}>
              导出
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => importRef.current?.click()}
            >
              导入
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void importPrompts(file)
                event.target.value = ''
              }}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setAiOpen(true)}
            >
              <IconSparkles size={14} />
              AI 生成
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>
              <IconPlus size={15} />
              新建提示词
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        <div className="prompt-toolbar">
          <div className="chip-row" role="group" aria-label="分类筛选">
            <button
              type="button"
              className={`chip ${category === '全部' ? 'chip-active' : ''}`}
              onClick={() => setCategory('全部')}
            >
              全部
            </button>
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
          <div className="prompt-toolbar-right">
            <button
              type="button"
              className={`chip prompt-fav-filter ${favoritesOnly ? 'chip-active' : ''}`}
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((prev) => !prev)}
            >
              <IconStar size={13} filled={favoritesOnly} />
              仅收藏
            </button>
            <span className="prompt-count">共 {filtered.length} 条</span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="prompt-empty">
            <span className="prompt-empty-icon">
              <IconFileText size={24} />
            </span>
            <p className="prompt-empty-title">
              {prompts.length === 0 ? '还没有提示词' : '没有找到匹配的提示词'}
            </p>
            <p className="prompt-empty-sub">
              {prompts.length === 0
                ? '把你写小说的要求存成提示词，写任何作品时都能一键启用。'
                : '换个关键词或分类试试，也可以清除全部筛选。'}
            </p>
            <button
              type="button"
              className={prompts.length === 0 ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={prompts.length === 0 ? openNew : clearFilters}
            >
              {prompts.length === 0 ? '新建第一条提示词' : '清除筛选'}
            </button>
          </div>
        ) : (
          <div className="prompt-grid">
            {filtered.map((prompt) => (
              <PromptCard
                key={prompt.id}
                prompt={prompt}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onToggleFavorite={onToggleFavorite}
                onDuplicate={onDuplicatePrompt}
                onToast={onToast}
              />
            ))}
          </div>
        )}

        <p className="prompt-note">
          在写作页右侧「作品详情 → 提示词」中勾选启用；生成时会随导演指令一起交给 AI。
        </p>
      </main>

      {aiOpen ? (
        <Modal
          title="AI 生成提示词"
          subtitle="描述你想要的作用，AI 会生成一条可保存、可复用的写作规则"
          onClose={() => {
            if (!aiGenerating) setAiOpen(false)
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setAiOpen(false)}
                disabled={aiGenerating}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void generatePrompt()}
                disabled={aiGenerating || !aiRequirement.trim()}
              >
                <IconSparkles size={15} />
                {aiGenerating ? '生成中…' : '生成提示词'}
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="prompt-ai-requirement">你想要这条提示词起什么作用？</label>
            <textarea
              id="prompt-ai-requirement"
              className="input textarea prompt-ai-requirement"
              rows={6}
              value={aiRequirement}
              onChange={(event) => setAiRequirement(event.target.value)}
              placeholder="例如：每章结尾留一个钩子，但不要用“欲知后事如何”这种套话；钩子要来自本章已经出现的物品或人物动作。"
              maxLength={1000}
              autoFocus
            />
            <p className="hint-line">
              写清使用场景、要约束什么、不要出现什么。生成后会打开编辑器，保存前可以修改。
            </p>
            {!apiReady ? (
              <p className="warn-line">还没有配置 AI 模型和 API Key，先在设置里配置。</p>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {editorOpen ? (
        <PromptEditorModal
          prompt={editingPrompt}
          draft={generatedDraft}
          onClose={() => {
            setEditorOpen(false)
            setGeneratedDraft(null)
          }}
          onSave={savePrompt}
          onRequestDelete={requestDelete}
        />
      ) : null}

      {deleteTarget ? (
        <Modal
          title="删除提示词"
          subtitle="删除后不可恢复，已启用它的作品会自动移除。"
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>
                取消
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete}>
                删除
              </button>
            </>
          }
        >
          <p className="confirm-text">确定删除「{deleteTarget.title}」？</p>
        </Modal>
      ) : null}
    </div>
  )
}
