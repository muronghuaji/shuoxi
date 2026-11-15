import { useMemo, useState } from 'react'
import type { AiUsageEntry, ApiConfig, Chapter, Work, WorkDetail, WorldTemplate } from '../types'
import {
  MODULE_CATALOG,
  MODULE_SCOPE_LABELS,
  moduleViewOptions,
  recommendedModuleIds,
  resolveEnabledModules,
  resolveHiddenModules,
} from '../moduleCatalog'
import { IconCheck, IconPlus, IconSearch } from './Icons'
import { Modal } from './Modal'
import { ModuleWorkspace } from './ModuleWorkspace'

interface ModulesPanelProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  worldTemplate: WorldTemplate
  api: ApiConfig
  apiReady: boolean
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onRecordUsage?: (entry: AiUsageEntry) => void
  onToast: (message: string) => void
}

export function ModulesPanel({
  work,
  detail,
  chapters,
  worldTemplate,
  api,
  apiReady,
  onUpdateDetail,
  onRecordUsage,
  onToast,
}: ModulesPanelProps) {
  const enabledModules = resolveEnabledModules(detail, worldTemplate)
  const hiddenModules = resolveHiddenModules(detail, worldTemplate)
  const enabledIds = useMemo(
    () =>
      detail.enabledModuleIds ??
      recommendedModuleIds(worldTemplate, detail.moduleData),
    [detail.enabledModuleIds, detail.moduleData, worldTemplate],
  )
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [workspaceModuleId, setWorkspaceModuleId] = useState<string | null>(null)
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryScope, setLibraryScope] = useState('全部')

  const moduleData = detail.moduleData ?? {}
  const enabledSet = new Set(enabledIds)

  const setEnabled = (id: string, enabled: boolean) => {
    const next = enabled
      ? [...new Set([...enabledIds, id])]
      : enabledIds.filter((item) => item !== id)
    onUpdateDetail({ enabledModuleIds: next })
  }

  const filteredLibrary = MODULE_CATALOG.filter((module) => {
    if (libraryScope !== '全部' && MODULE_SCOPE_LABELS[module.scope] !== libraryScope) {
      return false
    }
    const keyword = libraryQuery.trim().toLowerCase()
    if (!keyword) return true
    return `${module.name} ${module.description} ${module.aiHint}`
      .toLowerCase()
      .includes(keyword)
  })

  const scopes = ['全部', ...Object.values(MODULE_SCOPE_LABELS)]

  if (workspaceModuleId) {
    return (
      <ModuleWorkspace
        modules={enabledModules}
        initialModuleId={workspaceModuleId}
        work={work}
        detail={detail}
        chapters={chapters}
        api={api}
        apiReady={apiReady}
        onUpdateDetail={onUpdateDetail}
        onRecordUsage={onRecordUsage}
        onToast={onToast}
        onClose={() => setWorkspaceModuleId(null)}
      />
    )
  }

  return (
    <div className="modules-panel">
      <div className="drawer-section-head">
        <span>设定模块</span>
        <span className="module-count">{enabledModules.length} 个已启用</span>
      </div>
      <p className="drawer-hint">
        当前作品启用的题材工具。每个模块进入独立工作台，支持表格、看板、时间轴、清单和阶梯视图；停用模块不会删除数据，也不会进入 AI 上下文。
      </p>

      <div className="module-hub-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLibraryOpen(true)}>
          <IconPlus size={14} />
          模块库
        </button>
        <span>{Object.values(moduleData).reduce((sum, list) => sum + list.length, 0)} 条记录</span>
      </div>

      <div className="module-card-grid">
        {enabledModules.map((module) => {
          const records = moduleData[module.id] ?? []
          const pending = records.filter(
            (record) => record.status !== '已完成' && record.status !== '已放弃',
          ).length
          return (
            <button
              key={module.id}
              type="button"
              className="module-card"
              onClick={() => setWorkspaceModuleId(module.id)}
            >
              <div className="module-card-head">
                <span>{MODULE_SCOPE_LABELS[module.scope]}</span>
                <strong>{records.length}</strong>
              </div>
              <h4>{module.name}</h4>
              <p>{module.description}</p>
              <div className="module-card-foot">
                <span>
                  {module.recordLabel} · {moduleViewOptions(module).length} 种视图
                </span>
                <span>{pending ? `${pending} 待处理` : '打开 →'}</span>
              </div>
            </button>
          )
        })}
        {enabledModules.length === 0 ? (
          <p className="module-empty">还没有启用设定模块，从模块库添加一个。</p>
        ) : null}
      </div>

      {hiddenModules.length > 0 ? (
        <section className="module-hidden-section">
          <div className="drawer-section-head">
            <span>已停用但有数据</span>
            <span>{hiddenModules.length}</span>
          </div>
          <div className="module-hidden-list">
            {hiddenModules.map((module) => (
              <div key={module.id}>
                <span>{module.name}</span>
                <small>
                  {moduleData[module.id]?.length ?? 0} 条 · 数据保留
                </small>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEnabled(module.id, true)}
                >
                  重新启用
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {libraryOpen ? (
        <Modal
          title="模块库"
          subtitle={`从 ${MODULE_CATALOG.length} 个题材工具中启用或停用；停用不会删除数据`}
          onClose={() => setLibraryOpen(false)}
          size="lg"
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setLibraryOpen(false)}>
              完成
            </button>
          }
        >
          <div className="module-library">
            <div className="module-library-toolbar">
              <label className="search">
                <IconSearch size={14} />
                <input
                  value={libraryQuery}
                  onChange={(event) => setLibraryQuery(event.target.value)}
                  placeholder="搜索模块名称或用途"
                />
              </label>
              <select
                className="input select"
                value={libraryScope}
                onChange={(event) => setLibraryScope(event.target.value)}
              >
                {scopes.map((scope) => (
                  <option key={scope} value={scope}>
                    {scope}
                  </option>
                ))}
              </select>
            </div>
            <div className="module-library-list">
              {filteredLibrary.map((module) => {
                const enabled = enabledSet.has(module.id)
                return (
                  <div className={`module-library-row ${enabled ? 'active' : ''}`} key={module.id}>
                    <div>
                      <strong>{module.name}</strong>
                      <span>
                        {MODULE_SCOPE_LABELS[module.scope]} · {module.description}
                      </span>
                    </div>
                    <small>{moduleData[module.id]?.length ?? 0} 条</small>
                    <button
                      type="button"
                      className={`module-enable-toggle ${enabled ? 'active' : ''}`}
                      onClick={() => setEnabled(module.id, !enabled)}
                    >
                      {enabled ? <IconCheck size={13} /> : <IconPlus size={13} />}
                      {enabled ? '已启用' : '启用'}
                    </button>
                  </div>
                )
              })}
              {filteredLibrary.length === 0 ? (
                <p className="module-empty">没有匹配的模块。</p>
              ) : null}
            </div>
          </div>
        </Modal>
      ) : null}

      {hiddenModules.length > 0 && enabledModules.length === 0 ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setLibraryOpen(true)}
        >
          <IconPlus size={14} />
          打开模块库
        </button>
      ) : null}
    </div>
  )
}
