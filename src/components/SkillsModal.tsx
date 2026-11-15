import { useRef, useState } from 'react'
import type { AiUsageEntry, Chapter, Work, WorkDetail } from '../types'
import type { AiTaskApis } from '../aiTask'
import { runAiTask } from '../aiTask'
import type { ChatUsage } from '../ai'
import { estimateTokens } from '../utils'
import {
  SKILL_TOOL_LABELS,
  allSkills,
  buildSkillMessages,
  exportSkills,
  loadCustomSkills,
  normalizeSkill,
  renameCustomSkill,
  saveCustomSkills,
  setSkillsEnabled,
  type SkillDefinition,
} from '../skills'
import { buildSkillZip, importSkillPackageFile } from '../skillPackage'
import { downloadTextFile } from '../backup'
import { IconPlus, IconSparkles, IconTrash } from './Icons'
import { Modal } from './Modal'

interface SkillsModalProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  currentChapter?: Chapter
  apis: AiTaskApis
  onRecordUsage?: (entry: AiUsageEntry) => void
  onToast: (message: string) => void
  onClose: () => void
}

export function SkillsModal({
  work,
  detail,
  chapters,
  currentChapter,
  apis,
  onRecordUsage,
  onToast,
  onClose,
}: SkillsModalProps) {
  const [skills, setSkills] = useState<SkillDefinition[]>(() => allSkills())
  const [selectedId, setSelectedId] = useState(skills[0]?.id ?? '')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [nameEditing, setNameEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const selected = skills.find((skill) => skill.id === selectedId) ?? skills[0]

  const reload = () => {
    const next = allSkills()
    setSkills(next)
    setSelectedIds((current) => new Set([...current].filter((id) => next.some((skill) => skill.id === id))))
    if (!next.some((skill) => skill.id === selectedId)) setSelectedId(next[0]?.id ?? '')
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const applyEnabled = (enabled: boolean) => {
    if (selectedIds.size === 0) return
    setSkillsEnabled([...selectedIds], enabled)
    reload()
    onToast(`${enabled ? '已启用' : '已停用'} ${selectedIds.size} 个技能`)
  }

  const startRename = () => {
    if (!selected || selected.builtin) return
    setNameDraft(selected.name)
    setNameEditing(true)
  }

  const saveRename = () => {
    if (!selected || selected.builtin) return
    const nextName = nameDraft.trim()
    if (!nextName) {
      onToast('技能名不能为空')
      return
    }
    renameCustomSkill(selected.id, nextName)
    setNameEditing(false)
    reload()
    setSelectedId(selected.id)
    onToast('技能已重命名')
  }

  const run = async () => {
    if (!selected || !currentChapter || running) return
    if (selected.enabled === false) {
      onToast('这个技能已停用，先启用再运行')
      return
    }
    setRunning(true)
    setResult('')
    setError('')
    try {
      const task = selected.profile === 'general' ? 'analysis.plan' : 'writing.selection-edit'
      const api = selected.profile === 'general' ? apis.general : apis.writing
      let actualUsage: ChatUsage | undefined
      let generated = ''
      const messages = buildSkillMessages({
        skill: selected,
        work,
        detail,
        chapters,
        currentChapter,
        selectedText: window.getSelection()?.toString() ?? '',
      })
      const text = await runAiTask({
        task,
        apis,
        messages,
        maxTokens: selected.output === 'rewrite' ? 5000 : 3000,
        onDelta: (delta) => {
          generated += delta
          setResult(generated)
        },
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      if (!text.trim()) throw new Error('模型没有返回内容')
      setResult(text.trim())
      onRecordUsage?.({
        id: `skill-usage-${Date.now().toString(36)}`,
        at: Date.now(),
        kind: '写作技能',
        model: api.model,
        inputTokens: actualUsage?.inputTokens ?? estimateTokens(messages.map((item) => item.content).join('\n')),
        outputTokens: actualUsage?.outputTokens ?? estimateTokens(text),
        cachedInputTokens: actualUsage?.cachedInputTokens,
        cacheWriteTokens: actualUsage?.cacheWriteTokens,
        uncachedInputTokens: actualUsage?.uncachedInputTokens,
        actual: Boolean(actualUsage),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '技能运行失败')
    } finally {
      setRunning(false)
    }
  }

  const importSkills = async (file: File) => {
    try {
      const lower = file.name.toLowerCase()
      let candidates: unknown[]
      if (lower.endsWith('.zip') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
        candidates = await importSkillPackageFile(file)
      } else {
        const raw = JSON.parse(await file.text()) as unknown
        candidates = Array.isArray(raw)
          ? raw
          : raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).skills)
            ? ((raw as Record<string, unknown>).skills as unknown[])
            : [raw]
      }
      const parsed = candidates
        .map(normalizeSkill)
        .filter((skill): skill is SkillDefinition => Boolean(skill))
        .map((skill, index) => ({
          ...skill,
          id: skill.id.startsWith('custom.') ? skill.id : `custom.${Date.now().toString(36)}-${index}`,
          builtin: false,
        }))
      if (parsed.length === 0) throw new Error('没有可识别的技能')
      const current = loadCustomSkills()
      const merged = [...current.filter((item) => !parsed.some((next) => next.id === item.id)), ...parsed]
      saveCustomSkills(merged)
      reload()
      onToast(`已导入 ${parsed.length} 个技能`)
    } catch (caught) {
      onToast(`技能导入失败：${caught instanceof Error ? caught.message : '文件格式不对'}`)
    }
  }

  const exportPackage = () => {
    if (!selected) return
    const bytes = buildSkillZip(selected)
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selected.name || 'skill'}.zip`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    onToast(`已导出技能包：${selected.name}`)
  }

  const removeCustom = (skill: SkillDefinition) => {
    saveCustomSkills(loadCustomSkills().filter((item) => item.id !== skill.id))
    reload()
    onToast('已删除自定义技能')
  }

  return (
    <Modal
      title="写作技能"
      subtitle="内置检查与润色流程；支持 JSON、SKILL.md 和 .zip 技能包"
      size="lg"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          关闭
        </button>
      }
    >
      <div className="skills-layout">
        <aside className="skills-list">
          <div className="skills-toolbar">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => importRef.current?.click()}
            >
              <IconPlus size={13} />
              导入技能包
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!selected}
              onClick={exportPackage}
            >
              导出当前包
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={skills.every((skill) => skill.builtin)}
              onClick={() => {
                const custom = skills.filter((skill) => !skill.builtin)
                downloadTextFile('shuoxi-skills.json', exportSkills(custom))
                onToast(`已导出 ${custom.length} 个自定义技能`)
              }}
            >
              导出
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSelectedIds((current) =>
                  current.size === skills.length ? new Set() : new Set(skills.map((skill) => skill.id)),
                )
              }}
            >
              {selectedIds.size === skills.length && skills.length > 0 ? '取消全选' : '全选'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={selectedIds.size === 0}
              onClick={() => applyEnabled(true)}
            >
              启用
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={selectedIds.size === 0}
              onClick={() => applyEnabled(false)}
            >
              停用
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json,.zip,.md,.markdown,application/json,application/zip,text/markdown"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void importSkills(file)
              }}
            />
          </div>
          {skills.map((skill) => (
            <div
              key={skill.id}
              className={`skill-row ${skill.enabled === false ? 'is-disabled' : ''}`}
            >
              <input
                type="checkbox"
                className="skill-check"
                checked={selectedIds.has(skill.id)}
                aria-label={`选择 ${skill.name}`}
                onChange={() => toggleSelected(skill.id)}
              />
              <button
                type="button"
                className={`skill-item ${skill.id === selected?.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedId(skill.id)
                  setNameEditing(false)
                  setResult('')
                  setError('')
                }}
              >
                <span>
                  <strong>{skill.name}</strong>
                  <small>{skill.description || skill.category}</small>
                </span>
                <em>
                  {skill.builtin ? '内置' : '自定义'} · {skill.enabled === false ? '停用' : '启用'}
                </em>
              </button>
            </div>
          ))}
        </aside>

        <main className="skills-main">
          {selected ? (
            <>
              <div className="skills-head">
                <div className="skills-head-main">
                  {nameEditing ? (
                    <div className="skill-name-edit">
                      <input
                        className="input"
                        value={nameDraft}
                        autoFocus
                        aria-label="技能名称"
                        onChange={(event) => setNameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveRename()
                          if (event.key === 'Escape') setNameEditing(false)
                        }}
                      />
                      <button type="button" className="btn btn-primary btn-sm" onClick={saveRename}>
                        保存
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setNameEditing(false)}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <h3>{selected.name}</h3>
                  )}
                  <p>{selected.description}</p>
                </div>
                <div className="skills-head-actions">
                  {!selected.builtin && !nameEditing ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={startRename}>
                      重命名
                    </button>
                  ) : null}
                  {!selected.builtin ? (
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-sm"
                      onClick={() => removeCustom(selected)}
                    >
                      <IconTrash size={13} />
                      删除
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="skill-meta">
                <span>{selected.category}</span>
                <span>{selected.output === 'rewrite' ? '输出改写文本' : '只输出检查建议'}</span>
                <span>模型：{selected.profile === 'general' ? '通用 AI' : '写作 AI'}</span>
                <span>{selected.enabled === false ? '已停用' : '已启用'}</span>
              </div>
              <div className="skill-tools">
                {selected.tools.length === 0 ? (
                  <small>这个技能不读取工具数据，只按指令工作。</small>
                ) : (
                  selected.tools.map((tool) => <span key={tool}>{SKILL_TOOL_LABELS[tool]}</span>)
                )}
              </div>
              <details className="skill-instructions">
                <summary>查看技能指令</summary>
                <pre>{selected.instructions}</pre>
              </details>
              <div className="skill-run">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={running || !currentChapter || selected.enabled === false}
                  onClick={() => void run()}
                >
                  <IconSparkles size={14} />
                  {selected.enabled === false
                    ? '技能已停用'
                    : running
                      ? '运行中…'
                      : '运行技能'}
                </button>
                <span>有选中文本时优先处理选中文本；没有选中文本按技能说明处理本章。</span>
              </div>
              {error ? <p className="skill-error">{error}</p> : null}
              {result ? (
                <div className="skill-result">
                  <div className="skill-result-head">
                    <strong>运行结果</strong>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        void navigator.clipboard?.writeText(result)
                        onToast('结果已复制')
                      }}
                    >
                      复制
                    </button>
                  </div>
                  <pre>{result}</pre>
                </div>
              ) : null}
            </>
          ) : (
            <p className="hint-line">还没有技能，先导入一个技能文件。</p>
          )}
        </main>
      </div>
    </Modal>
  )
}
