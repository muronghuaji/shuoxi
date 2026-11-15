import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  AiUsageEntry,
  ApiConfig,
  Chapter,
  ModuleDefinition,
  ModuleField,
  ModuleRecord,
  ModuleView,
  Work,
  WorkDetail,
} from '../types'
import { resolveModuleFields, moduleDefaultView, moduleViewOptions } from '../moduleCatalog'
import { estimateTokens, formatRelative } from '../utils'
import { type ChatUsage } from '../ai'
import { runApiTask } from '../aiTask'
import {
  buildModuleAuditMessages,
  buildModuleFillMessages,
  buildModuleGenerateMessages,
  parseModuleAuditResult,
  parseModuleFillResult,
  parseModuleGenerateResult,
  type ModuleAuditIssue,
} from '../moduleAi'
import { Modal } from './Modal'
import { NumberInput } from './NumberInput'
import {
  IconPencil,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconTrash,
  IconX,
} from './Icons'
import { useContextMenu, type ContextMenuEntry } from './ContextMenuProvider'
import { copyTextToClipboard } from '../clipboard'

interface ModuleWorkspaceProps {
  modules: ModuleDefinition[]
  initialModuleId: string
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  api: ApiConfig
  apiReady: boolean
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onRecordUsage?: (entry: AiUsageEntry) => void
  onToast: (message: string) => void
  onClose: () => void
}

const VIEW_LABELS: Record<ModuleView, string> = {
  table: '表格',
  board: '看板',
  timeline: '时间轴',
  checklist: '清单',
  ladder: '阶梯',
}

const DEFAULT_STATUSES = ['未定', '进行中', '已完成', '已放弃']

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function blankRecord(module: ModuleDefinition, fields: ModuleField[]): ModuleRecord {
  return {
    id: createId('record'),
    title: '',
    summary: '',
    status: module.statuses?.[0] ?? '未定',
    fields: Object.fromEntries(fields.map((field) => [field.id, ''])),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function timeField(fields: ModuleField[]): ModuleField | null {
  return (
    fields.find((field) => /时间|年号|日期|阶段/.test(field.label)) ??
    fields[0] ??
    null
  )
}

export function ModuleWorkspace({
  modules,
  initialModuleId,
  work,
  detail,
  chapters,
  api,
  apiReady,
  onUpdateDetail,
  onRecordUsage,
  onToast,
  onClose,
}: ModuleWorkspaceProps) {
  const [moduleId, setModuleId] = useState(initialModuleId)
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const { openContextMenu } = useContextMenu()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('全部')
  const [sortBy, setSortBy] = useState<'updated' | 'title' | 'status'>('updated')
  const [customOpen, setCustomOpen] = useState(false)
  const [fieldModalOpen, setFieldModalOpen] = useState(false)
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldType, setNewFieldType] = useState<ModuleField['type']>('text')
  const [newFieldOptions, setNewFieldOptions] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [generateBusy, setGenerateBusy] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generateRequest, setGenerateRequest] = useState('')
  const [generateCount, setGenerateCount] = useState(5)
  const [generateError, setGenerateError] = useState('')
  const [aiFill, setAiFill] = useState<Record<string, string> | null>(null)
  const [aiIssues, setAiIssues] = useState<ModuleAuditIssue[] | null>(null)
  const [aiError, setAiError] = useState('')
  const workbenchRef = useRef<HTMLDivElement | null>(null)
  const onCloseRef = useRef(onClose)
  const overlayOpenRef = useRef(false)
  onCloseRef.current = onClose
  overlayOpenRef.current = fieldModalOpen || customOpen || generateOpen

  const module = modules.find((item) => item.id === moduleId) ?? modules[0] ?? null

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = workbenchRef.current
    dialog?.focus()
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (overlayOpenRef.current) return
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    if (!fieldModalOpen && !customOpen && !generateOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFieldModalOpen(false)
        setCustomOpen(false)
        setGenerateOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fieldModalOpen, customOpen, generateOpen])

  useEffect(() => {
    setSelectedRecordId(null)
    setQuery('')
    setStatusFilter('全部')
    setAiFill(null)
    setAiIssues(null)
    setAiError('')
  }, [moduleId])

  const records = module ? detail.moduleData?.[module.id] ?? [] : []
  const customFields = module ? detail.moduleCustomFields?.[module.id] ?? [] : []
  const fields = module ? resolveModuleFields(module, detail) : []
  const statuses = module?.statuses ?? DEFAULT_STATUSES
  const views = module ? moduleViewOptions(module) : (['table'] as ModuleView[])
  const view = module
    ? detail.moduleViews?.[module.id] ?? moduleDefaultView(module)
    : 'table'
  const activeView: ModuleView = views.includes(view) ? view : 'table'
  const selectedRecord =
    records.find((record) => record.id === selectedRecordId) ?? records[0] ?? null

  useEffect(() => {
    setAiFill(null)
    setAiError('')
  }, [selectedRecord?.id])

  const displayFields = fields.filter(
    (field) =>
      field.label !== '状态' ||
      Boolean(selectedRecord?.fields[field.id]?.trim()),
  )

  const characterNames = useMemo(
    () => new Map((detail.characters ?? []).map((character) => [character.id, character.name])),
    [detail.characters],
  )
  const locationNames = useMemo(
    () => new Map((detail.locations ?? []).map((location) => [location.id, location.name])),
    [detail.locations],
  )
  const chapterNames = useMemo(
    () => new Map(chapters.map((chapter) => [chapter.id, chapter.title])),
    [chapters],
  )

  const saveRecords = (next: ModuleRecord[]) => {
    if (!module) return
    onUpdateDetail({
      moduleData: { ...(detail.moduleData ?? {}), [module.id]: next },
    })
  }

  const updateRecord = (recordId: string, patch: Partial<ModuleRecord>) => {
    saveRecords(
      records.map((record) =>
        record.id === recordId
          ? { ...record, ...patch, updatedAt: new Date().toISOString() }
          : record,
      ),
    )
  }

  const updateField = (recordId: string, fieldId: string, value: string) => {
    saveRecords(
      records.map((record) =>
        record.id === recordId
          ? {
              ...record,
              fields: { ...record.fields, [fieldId]: value },
              updatedAt: new Date().toISOString(),
            }
          : record,
      ),
    )
  }

  const addRecord = () => {
    if (!module) return
    const record = blankRecord(module, fields)
    saveRecords([record, ...records])
    setSelectedRecordId(record.id)
  }

  const removeRecord = (recordId: string) => {
    if (!module) return
    if (!window.confirm('删除这条记录？')) return
    saveRecords(records.filter((record) => record.id !== recordId))
    setSelectedRecordId(null)
  }

  const recordContextMenu = (record: ModuleRecord): ContextMenuEntry[] => {
    const statuses = module?.statuses ?? []
    const done = record.status === '已完成'
    return [
      { type: 'label', label: recordLabel(record) },
      { label: '打开记录', onSelect: () => setSelectedRecordId(record.id) },
      {
        label: '复制记录内容',
        onSelect: () => {
          const text = [
            record.title,
            record.summary,
            ...Object.values(record.fields).filter(
              (value): value is string => typeof value === 'string' && Boolean(value.trim()),
            ),
          ]
            .filter(Boolean)
            .join('\n')
          void copyTextToClipboard(text).then((ok) =>
            onToast(ok ? '已复制记录内容' : '复制失败'),
          )
        },
      },
      { type: 'separator' },
      {
        label: done ? '标记为未完成' : '标记为已完成',
        disabled: statuses.length === 0,
        onSelect: () =>
          updateRecord(record.id, { status: done ? statuses[0] ?? '未定' : '已完成' }),
      },
      { type: 'separator' },
      {
        label: '删除记录…',
        danger: true,
        onSelect: () => removeRecord(record.id),
      },
    ]
  }

  const moveRecord = (recordId: string, direction: -1 | 1) => {
    const index = records.findIndex((record) => record.id === recordId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= records.length) return
    const next = [...records]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    saveRecords(next)
  }

  const changeView = (nextView: ModuleView) => {
    if (!module) return
    onUpdateDetail({
      moduleViews: { ...(detail.moduleViews ?? {}), [module.id]: nextView },
    })
  }

  const recordLabel = (record: ModuleRecord) =>
    record.title || module?.recordLabel || '未命名'

  const filteredRecords = useMemo(() => {
    if (!module) return []
    const keyword = query.trim().toLowerCase()
    return records.filter((record) => {
      if (statusFilter !== '全部' && record.status !== statusFilter) return false
      if (!keyword) return true
      const linked = [
        ...(record.characterIds ?? []).map((id) => characterNames.get(id) ?? ''),
        ...(record.locationIds ?? []).map((id) => locationNames.get(id) ?? ''),
        ...(record.chapterIds ?? []).map((id) => chapterNames.get(id) ?? ''),
      ]
      return `${record.title} ${record.summary} ${record.status} ${Object.values(record.fields).join(' ')} ${linked.join(' ')}`
        .toLowerCase()
        .includes(keyword)
    })
  }, [records, module, query, statusFilter, characterNames, locationNames, chapterNames])

  const matchingRecords = useMemo(
    () =>
      [...filteredRecords].sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title, 'zh-CN')
        if (sortBy === 'status') return a.status.localeCompare(b.status, 'zh-CN')
        return (
          new Date(b.updatedAt ?? b.createdAt).getTime() -
          new Date(a.updatedAt ?? a.createdAt).getTime()
        )
      }),
    [filteredRecords, sortBy],
  )

  const recordUsage = (
    kind: '模块补全' | '模块审查' | '模块生成',
    input: string,
    output: string,
    usage?: ChatUsage,
  ) => {
    if (!onRecordUsage) return
    const inputTokens = usage?.inputTokens ?? estimateTokens(input)
    const outputTokens = usage?.outputTokens ?? estimateTokens(output)
    const priceInput = api.inputPrice ?? 0
    const priceOutput = api.outputPrice ?? 0
    onRecordUsage({
      id: `usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      at: Date.now(),
      kind,
      profile: 'general',
      model: api.model,
      inputTokens,
      outputTokens,
      note: module ? `模块：${module.name}` : undefined,
      actual: Boolean(usage),
      cost:
        usage && (priceInput > 0 || priceOutput > 0)
          ? (inputTokens / 1_000_000) * priceInput + (outputTokens / 1_000_000) * priceOutput
          : undefined,
    })
  }

  const runAiFill = async () => {
    if (!module || !selectedRecord || !apiReady || aiBusy) {
      if (!apiReady) onToast('请先配置通用 AI')
      return
    }
    setAiBusy(true)
    setAiError('')
    try {
      const messages = buildModuleFillMessages({
        work,
        detail,
        chapters,
        module,
        fields,
        records,
        record: selectedRecord,
      })
      let actualUsage: ChatUsage | undefined
      const raw = await runApiTask(api, { task: 'analysis.plan', messages,
        temperature: 0.35,
        maxTokens: 900,
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      const parsed = parseModuleFillResult(
        raw,
        fields.map((field) => field.id),
      )
      if (!parsed) throw new Error('AI 没有返回可应用的字段')
      setAiFill(parsed.fields)
      recordUsage(
        '模块补全',
        messages.map((message) => message.content).join('\n'),
        raw,
        actualUsage,
      )
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '补全失败'
      setAiError(message)
      onToast(`模块补全失败：${message}`)
    } finally {
      setAiBusy(false)
    }
  }

  const runModuleGenerate = async (request: string, count: number) => {
    if (!module || !apiReady || generateBusy) {
      if (!apiReady) onToast('请先配置通用 AI')
      return
    }
    setGenerateBusy(true)
    setGenerateError('')
    let lastError = ''
    try {
      const attempts = [
        { count, maxTokens: Math.min(9000, 2200 + count * 1100) },
        {
          count: Math.max(1, Math.min(3, Math.floor(count / 2) || 1)),
          maxTokens: 5600,
        },
      ]
      for (let attempt = 0; attempt < attempts.length; attempt += 1) {
        const current = attempts[attempt]
        const messages = buildModuleGenerateMessages({
          work,
          detail,
          chapters,
          module,
          fields,
          records,
          count: current.count,
          request:
            attempt === 0
              ? request
              : `${request}\n\n上一次输出可能被截断。请减少每条字段长度，只生成 ${current.count} 条，并确保 JSON 完整闭合。`,
        })
        let actualUsage: ChatUsage | undefined
        const raw = await runApiTask(api, { task: 'analysis.plan', messages,
          temperature: attempt === 0 ? 0.45 : 0.25,
          maxTokens: current.maxTokens,
          onUsage: (usage) => {
            actualUsage = usage
          },
        })
        const generated = parseModuleGenerateResult(raw, module, fields, current.count)
        if (generated?.length) {
          saveRecords([...generated, ...records])
          setSelectedRecordId(generated[0].id)
          setGenerateOpen(false)
          recordUsage(
            '模块生成',
            messages.map((message) => message.content).join('\n'),
            raw,
            actualUsage,
          )
          onToast(`AI 已生成 ${generated.length} 条${module.recordLabel}`)
          return
        }
        lastError =
          raw.trim().length === 0
            ? '模型没有返回内容'
            : '模型输出被截断或不是完整 JSON（已自动缩小数量重试）'
      }
      throw new Error(lastError || 'AI 没有返回可用的模块记录')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '请稍后重试'
      setGenerateError(message)
      onToast(`模块生成失败：${message}`)
    } finally {
      setGenerateBusy(false)
    }
  }

  const applyAiFill = (overwriteExisting: boolean) => {
    if (!selectedRecord || !aiFill) return
    const nextFields = { ...selectedRecord.fields }
    for (const [id, value] of Object.entries(aiFill)) {
      if (overwriteExisting || !nextFields[id]?.trim()) nextFields[id] = value
    }
    updateRecord(selectedRecord.id, { fields: nextFields })
    setAiFill(null)
    onToast(overwriteExisting ? '已覆盖应用 AI 补全' : '已补全空白字段')
  }

  const runAiAudit = async () => {
    if (!module || !apiReady || aiBusy) {
      if (!apiReady) onToast('请先配置通用 AI')
      return
    }
    setAiBusy(true)
    setAiError('')
    setAiIssues(null)
    try {
      const messages = buildModuleAuditMessages({
        work,
        detail,
        chapters,
        module,
        fields,
        records,
        record: selectedRecord ?? blankRecord(module, fields),
      })
      let actualUsage: ChatUsage | undefined
      const raw = await runApiTask(api, { task: 'analysis.plan', messages,
        temperature: 0.2,
        maxTokens: 900,
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      const parsed = parseModuleAuditResult(raw)
      if (!parsed) throw new Error('AI 没有返回可解析的检查结果')
      setAiIssues(parsed)
      recordUsage(
        '模块审查',
        messages.map((message) => message.content).join('\n'),
        raw,
        actualUsage,
      )
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '检查失败'
      setAiError(message)
      onToast(`模块检查失败：${message}`)
    } finally {
      setAiBusy(false)
    }
  }

  const addCustomField = () => {
    if (!module) return
    const label = newFieldLabel.trim()
    if (!label) {
      setFieldError('请填写字段名称')
      return
    }
    if (fields.some((field) => field.label === label)) {
      setFieldError('字段名称已存在')
      return
    }
    const field: ModuleField = {
      id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`,
      label,
      type: newFieldType,
      options:
        newFieldType === 'select'
          ? newFieldOptions
              .split(/[，,]/)
              .map((item) => item.trim())
              .filter(Boolean)
          : undefined,
    }
    onUpdateDetail({
      moduleCustomFields: {
        ...(detail.moduleCustomFields ?? {}),
        [module.id]: [...(detail.moduleCustomFields?.[module.id] ?? []), field],
      },
    })
    setNewFieldLabel('')
    setNewFieldOptions('')
    setFieldError('')
  }

  const removeCustomField = (fieldId: string) => {
    if (!module) return
    if (!window.confirm('删除这个自定义字段？字段值会从记录中隐藏。')) return
    onUpdateDetail({
      moduleCustomFields: {
        ...(detail.moduleCustomFields ?? {}),
        [module.id]: (detail.moduleCustomFields?.[module.id] ?? []).filter(
          (field) => field.id !== fieldId,
        ),
      },
    })
  }

  if (!module) return null

  const toggleLink = (
    record: ModuleRecord,
    kind: 'chapterIds' | 'characterIds' | 'locationIds',
    id: string,
  ) => {
    const current = record[kind] ?? []
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    updateRecord(record.id, { [kind]: next })
  }

  const renderLinks = (record: ModuleRecord) => (
    <div className="module-links">
      <details>
        <summary>关联角色 ({(record.characterIds ?? []).length})</summary>
        <div className="module-link-options">
          {(detail.characters ?? []).map((character) => (
            <label key={character.id}>
              <input
                type="checkbox"
                checked={(record.characterIds ?? []).includes(character.id)}
                onChange={() => toggleLink(record, 'characterIds', character.id)}
              />
              {character.name}
            </label>
          ))}
        </div>
      </details>
      <details>
        <summary>关联地点 ({(record.locationIds ?? []).length})</summary>
        <div className="module-link-options">
          {(detail.locations ?? []).map((location) => (
            <label key={location.id}>
              <input
                type="checkbox"
                checked={(record.locationIds ?? []).includes(location.id)}
                onChange={() => toggleLink(record, 'locationIds', location.id)}
              />
              {location.name}
            </label>
          ))}
        </div>
      </details>
      <details>
        <summary>关联章节 ({(record.chapterIds ?? []).length})</summary>
        <div className="module-link-options">
          {chapters.map((chapter) => (
            <label key={chapter.id}>
              <input
                type="checkbox"
                checked={(record.chapterIds ?? []).includes(chapter.id)}
                onChange={() => toggleLink(record, 'chapterIds', chapter.id)}
              />
              {chapter.title}
            </label>
          ))}
        </div>
      </details>
    </div>
  )

  const renderStatus = (record: ModuleRecord) => (
    <select
      className="module-status-select"
      value={record.status}
      onChange={(event) => updateRecord(record.id, { status: event.target.value })}
      onClick={(event) => event.stopPropagation()}
      aria-label="记录状态"
    >
      {statuses.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  )

  const renderTable = () => {
    const columns = fields.slice(0, 2)
    return (
      <div className="module-table-wrap">
        <table className="module-table">
          <thead>
            <tr>
              <th>{module.recordLabel}</th>
              <th>状态</th>
              {columns.map((field) => (
                <th key={field.id}>{field.label}</th>
              ))}
              <th>关联</th>
              <th>更新</th>
            </tr>
          </thead>
          <tbody>
            {matchingRecords.map((record) => (
              <tr
                key={record.id}
                className={record.id === selectedRecord?.id ? 'active' : ''}
                onClick={() => setSelectedRecordId(record.id)}
                onContextMenu={(event) =>
                  openContextMenu(event, recordContextMenu(record))
                }
              >
                <td>
                  <strong>{recordLabel(record)}</strong>
                  {record.summary ? <small>{record.summary}</small> : null}
                </td>
                <td>{renderStatus(record)}</td>
                {columns.map((field) => (
                  <td key={field.id}>{record.fields[field.id] || '—'}</td>
                ))}
                <td>
                  {(record.characterIds?.length ?? 0) +
                    (record.locationIds?.length ?? 0) +
                    (record.chapterIds?.length ?? 0)}
                </td>
                <td>{formatRelative(new Date(record.updatedAt ?? record.createdAt).getTime())}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {matchingRecords.length === 0 ? (
          <p className="module-empty">没有匹配的记录，换个搜索或筛选条件试试。</p>
        ) : null}
      </div>
    )
  }

  const renderBoard = () => (
    <div className="module-board">
      {statuses.map((status) => {
        const items = matchingRecords.filter((record) => record.status === status)
        return (
          <section className="module-board-column" key={status}>
            <header>
              <span>{status}</span>
              <small>{items.length}</small>
            </header>
            {items.map((record) => (
              <button
                type="button"
                key={record.id}
                className={`module-board-card ${record.id === selectedRecord?.id ? 'active' : ''}`}
                onClick={() => setSelectedRecordId(record.id)}
              >
                <strong>{recordLabel(record)}</strong>
                <small>{record.summary || '暂无摘要'}</small>
                <span>{formatRelative(new Date(record.updatedAt ?? record.createdAt).getTime())}</span>
              </button>
            ))}
          </section>
        )
      })}
    </div>
  )

  const renderTimeline = () => {
    const field = timeField(fields)
    const timelineRecords = [...filteredRecords].sort((a, b) => {
      const left = field ? a.fields[field.id] ?? '' : ''
      const right = field ? b.fields[field.id] ?? '' : ''
      return left.localeCompare(right, 'zh-CN')
    })
    return (
      <div className="module-timeline">
        {timelineRecords.map((record) => (
          <button
            type="button"
            key={record.id}
            className={`module-timeline-item ${record.id === selectedRecord?.id ? 'active' : ''}`}
            onClick={() => setSelectedRecordId(record.id)}
            onContextMenu={(event) => openContextMenu(event, recordContextMenu(record))}
          >
            <span>{field ? record.fields[field.id] || '未填时间' : '未填时间'}</span>
            <div>
              <strong>{recordLabel(record)}</strong>
              <small>{record.summary || '暂无摘要'}</small>
            </div>
            <em>{record.status}</em>
          </button>
        ))}
        {timelineRecords.length === 0 ? <p className="module-empty">暂无时间线记录。</p> : null}
      </div>
    )
  }

  const renderChecklist = () => (
    <div className="module-checklist">
      {matchingRecords.map((record) => {
        const done = record.status === '已完成'
        return (
          <div
            className={`module-check-row ${done ? 'done' : ''} ${record.id === selectedRecord?.id ? 'active' : ''}`}
            key={record.id}
            onClick={() => setSelectedRecordId(record.id)}
            onContextMenu={(event) => openContextMenu(event, recordContextMenu(record))}
          >
            <input
              type="checkbox"
              checked={done}
              onChange={() =>
                updateRecord(record.id, { status: done ? statuses[0] ?? '未定' : '已完成' })
              }
              onClick={(event) => event.stopPropagation()}
            />
            <span>
              <strong>{recordLabel(record)}</strong>
              <small>{record.summary || '暂无说明'}</small>
            </span>
          </div>
        )
      })}
      {matchingRecords.length === 0 ? <p className="module-empty">暂无检查项。</p> : null}
    </div>
  )

  const renderLadder = () => (
    <div className="module-ladder">
      {filteredRecords.map((record, index) => (
        <div
          key={record.id}
          className={`module-ladder-row ${record.id === selectedRecord?.id ? 'active' : ''}`}
          onClick={() => setSelectedRecordId(record.id)}
          onContextMenu={(event) => openContextMenu(event, recordContextMenu(record))}
        >
          <span className="module-ladder-index">{index + 1}</span>
          <div>
            <strong>{recordLabel(record)}</strong>
            <small>
              {fields
                .slice(0, 2)
                .map((field) => `${field.label}：${record.fields[field.id] || '—'}`)
                .join(' · ')}
            </small>
          </div>
          <em>{record.status}</em>
        </div>
      ))}
      {filteredRecords.length === 0 ? <p className="module-empty">暂无阶梯数据。</p> : null}
    </div>
  )

  const renderView = () => {
    if (activeView === 'board') return renderBoard()
    if (activeView === 'timeline') return renderTimeline()
    if (activeView === 'checklist') return renderChecklist()
    if (activeView === 'ladder') return renderLadder()
    return renderTable()
  }

  return createPortal(
    <div
      className="module-workbench"
      role="dialog"
      aria-modal="true"
      aria-label="设定模块工作区"
      ref={workbenchRef}
      tabIndex={-1}
    >
      <header className="module-workbench-top">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          <IconX size={16} />
          关闭
        </button>
        <div>
          <span>设定模块 · {MODULE_SCOPE_LABEL(module.scope)}</span>
          <h2>{module.name}</h2>
          <p>{module.description}</p>
        </div>
        <div className="module-workbench-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void runModuleGenerate('', 3)}
            disabled={generateBusy || !apiReady}
            title="根据作品和模块设定自动生成 3 条记录"
          >
            <IconSparkles size={14} />
            {generateBusy ? '生成中…' : 'AI 一键生成'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setGenerateOpen(true)}
            disabled={generateBusy || !apiReady}
          >
            自定义生成
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void runAiAudit()} disabled={aiBusy || !apiReady}>
            <IconSparkles size={14} />
            {aiBusy ? '检查中…' : 'AI 检查'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={addRecord}>
            <IconPlus size={14} />
            新建{module.recordLabel}
          </button>
        </div>
      </header>

      {generateError && !generateOpen ? (
        <div className="module-generate-error">
          <span>模块生成失败：{generateError}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void runModuleGenerate(generateRequest, generateCount)}
            disabled={generateBusy}
          >
            重试
          </button>
        </div>
      ) : null}

      <div className="module-workbench-body">
        <aside className="module-nav">
          {modules.map((item) => {
            const count = detail.moduleData?.[item.id]?.length ?? 0
            return (
              <button
                type="button"
                key={item.id}
                className={`module-nav-item ${item.id === module.id ? 'active' : ''}`}
                onClick={() => setModuleId(item.id)}
              >
                <span>{item.name}</span>
                <small>{count}</small>
              </button>
            )
          })}
        </aside>

        <main className="module-main">
          <div className="module-toolbar">
            <label className="module-search">
              <IconSearch size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索记录、字段或关联对象"
                aria-label="搜索模块记录"
              />
            </label>
            <select
              className="input select module-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="状态筛选"
            >
              <option value="全部">全部状态</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              className="input select module-filter"
              value={sortBy}
              onChange={(event) =>
                setSortBy(event.target.value as 'updated' | 'title' | 'status')
              }
              aria-label="排序"
            >
              <option value="updated">最近更新</option>
              <option value="title">按名称</option>
              <option value="status">按状态</option>
            </select>
            <div className="module-view-switch">
              {views.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={activeView === item ? 'active' : ''}
                  onClick={() => changeView(item)}
                >
                  {VIEW_LABELS[item]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setFieldModalOpen(true)}
            >
              自定义字段
            </button>
          </div>

          {aiIssues ? (
            <div className="module-ai-issues">
              <div>
                <strong>AI 检查结果</strong>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAiIssues(null)}>
                  关闭
                </button>
              </div>
              {aiIssues.length === 0 ? (
                <p>没有发现明显问题。</p>
              ) : (
                aiIssues.map((issue) => (
                  <article key={`${issue.title}-${issue.issue}`}>
                    <strong>{issue.title}</strong>
                    <p>{issue.issue}</p>
                    {issue.suggestion ? <small>建议：{issue.suggestion}</small> : null}
                  </article>
                ))
              )}
            </div>
          ) : null}
          {aiError ? <p className="module-ai-error">{aiError}</p> : null}

          {renderView()}
        </main>

        <aside className="module-detail">
          {!selectedRecord ? (
            <div className="module-detail-empty">
              <p>选择一条{module.recordLabel}查看详情。</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={addRecord}>
                新建{module.recordLabel}
              </button>
            </div>
          ) : (
            <>
              <div className="module-detail-head">
                <div>
                  <span>{module.recordLabel}</span>
                  <input
                    className="module-title-input"
                    value={selectedRecord.title}
                    onChange={(event) => updateRecord(selectedRecord.id, { title: event.target.value })}
                    placeholder="未命名"
                    aria-label="记录标题"
                  />
                </div>
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={() => removeRecord(selectedRecord.id)}
                  title="删除记录"
                >
                  <IconTrash size={15} />
                </button>
              </div>

              <div className="module-detail-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void runAiFill()}
                  disabled={aiBusy || !apiReady}
                >
                  <IconSparkles size={14} />
                  {aiBusy ? '处理中…' : 'AI 补全'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCustomOpen((open) => !open)}
                >
                  <IconPencil size={13} />
                  关联对象
                </button>
              </div>

              {aiFill ? (
                <div className="module-ai-fill">
                  <strong>AI 建议字段</strong>
                  {Object.entries(aiFill).map(([id, value]) => (
                    <p key={id}>
                      <span>{fields.find((field) => field.id === id)?.label ?? id}</span>
                      {value}
                    </p>
                  ))}
                  <div>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => applyAiFill(false)}>
                      补空白字段
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyAiFill(true)}>
                      全部覆盖
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAiFill(null)}>
                      取消
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="module-detail-form">
                <label>
                  <span>状态</span>
                  {renderStatus(selectedRecord)}
                </label>
                <label>
                  <span>摘要</span>
                  <textarea
                    className="input textarea"
                    rows={4}
                    value={selectedRecord.summary}
                    onChange={(event) =>
                      updateRecord(selectedRecord.id, { summary: event.target.value })
                    }
                    placeholder="这条记录对剧情意味着什么？"
                  />
                </label>
                {displayFields.map((field) => (
                  <label key={field.id}>
                    <span>
                      {field.label}
                      {customFields.some((item) => item.id === field.id) ? (
                        <button
                          type="button"
                          className="module-field-remove"
                          onClick={() => removeCustomField(field.id)}
                          title="删除自定义字段"
                        >
                          <IconX size={10} />
                        </button>
                      ) : null}
                    </span>
                    {field.type === 'select' ? (
                      <select
                        className="input select"
                        value={selectedRecord.fields[field.id] ?? ''}
                        onChange={(event) => updateField(selectedRecord.id, field.id, event.target.value)}
                      >
                        <option value="">未选择</option>
                        {(field.options ?? []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        className="input textarea"
                        rows={3}
                        value={selectedRecord.fields[field.id] ?? ''}
                        onChange={(event) => updateField(selectedRecord.id, field.id, event.target.value)}
                        placeholder={field.placeholder}
                      />
                    ) : (
                      <input
                        className="input"
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={selectedRecord.fields[field.id] ?? ''}
                        onChange={(event) => updateField(selectedRecord.id, field.id, event.target.value)}
                        placeholder={field.placeholder}
                      />
                    )}
                  </label>
                ))}
              </div>

              {customOpen ? renderLinks(selectedRecord) : null}

              <div className="module-detail-foot">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => moveRecord(selectedRecord.id, -1)}
                  disabled={records[0]?.id === selectedRecord.id}
                >
                  上移
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => moveRecord(selectedRecord.id, 1)}
                  disabled={records[records.length - 1]?.id === selectedRecord.id}
                >
                  下移
                </button>
                <span>{selectedRecord.updatedAt ? formatRelative(new Date(selectedRecord.updatedAt).getTime()) : ''}</span>
              </div>
            </>
          )}
        </aside>
      </div>

      {generateOpen ? (
        <Modal
          title={`AI 生成${module.recordLabel}`}
          subtitle="可指定数量和要求；生成结果会追加到当前模块"
          size="md"
          onClose={() => setGenerateOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setGenerateOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={generateBusy}
                onClick={() => void runModuleGenerate(generateRequest, generateCount)}
              >
                {generateBusy ? '生成中…' : '开始生成'}
              </button>
            </>
          }
        >
          <div className="module-generate-form">
            <label className="record-field">
              <span>生成要求</span>
              <textarea
                className="input drawer-textarea"
                rows={4}
                value={generateRequest}
                onChange={(event) => setGenerateRequest(event.target.value)}
                placeholder={`例如：补全${module.name}的核心设定，和已有记录互补，不要重复。`}
              />
            </label>
            <label className="record-field">
              <span>生成数量</span>
              <NumberInput
                className="input"
                min={1}
                max={8}
                value={generateCount}
                fallback={1}
                onValueChange={setGenerateCount}
              />
            </label>
            {generateError ? <p className="module-ai-error">{generateError}</p> : null}
            <p className="drawer-hint">
              会参考作品简介、世界观、已有记录、模块字段和当前章节。AI 结果会直接追加，不会覆盖已有记录。
              如果输出被截断会自动减少数量重试一次。
            </p>
          </div>
        </Modal>
      ) : null}

      {fieldModalOpen ? (
        <div className="module-field-modal" role="dialog" aria-modal="true">
          <div className="module-field-modal-card">
            <header>
              <div>
                <span>字段设计</span>
                <h3>自定义字段</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setFieldModalOpen(false)}>
                <IconX size={16} />
              </button>
            </header>
            <div className="module-field-list">
              {fields.map((field) => (
                <div key={field.id}>
                  <span>{field.label}</span>
                  <small>{field.type}</small>
                  {customFields.some((item) => item.id === field.id) ? (
                    <button type="button" onClick={() => removeCustomField(field.id)}>
                      <IconTrash size={13} />
                    </button>
                  ) : (
                    <small>基础字段</small>
                  )}
                </div>
              ))}
            </div>
            <div className="module-field-form">
              <label>
                <span>字段名称</span>
                <input
                  className="input"
                  value={newFieldLabel}
                  onChange={(event) => setNewFieldLabel(event.target.value)}
                  placeholder="例如：关联势力 / 代价"
                />
              </label>
              <label>
                <span>字段类型</span>
                <select
                  className="input select"
                  value={newFieldType}
                  onChange={(event) => setNewFieldType(event.target.value as ModuleField['type'])}
                >
                  <option value="text">单行文本</option>
                  <option value="textarea">多行文本</option>
                  <option value="number">数字</option>
                  <option value="select">下拉选项</option>
                </select>
              </label>
              {newFieldType === 'select' ? (
                <label>
                  <span>选项（逗号分隔）</span>
                  <input
                    className="input"
                    value={newFieldOptions}
                    onChange={(event) => setNewFieldOptions(event.target.value)}
                    placeholder="选项一，选项二"
                  />
                </label>
              ) : null}
              {fieldError ? <p className="module-ai-error">{fieldError}</p> : null}
              <div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFieldModalOpen(false)}>
                  完成
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={addCustomField}>
                  添加字段
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

function MODULE_SCOPE_LABEL(scope: ModuleDefinition['scope']): string {
  return (
    {
      world: '世界',
      character: '人物',
      faction: '势力',
      story: '故事',
      economy: '资源',
    }[scope] ?? scope
  )
}
