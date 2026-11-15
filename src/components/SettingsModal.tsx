import { useEffect, useRef, useState } from 'react'
import type {
  AiProfileId,
  AiProfilesConfig,
  AiUsageEntry,
  AppearanceSettings,
  BackgroundImageRecord,
  BackgroundPreset,
  CharacterChatSettings,
  HomeLayout,
  PlatformBalance,
  SyncSettings,
  ThemeMode,
} from '../types'
import type { WritingPricingSettings } from '../pricing'
import { balanceMoney } from '../billing'
import type { AutoSnapshot, TrashEntry } from '../backup'
import { PROVIDERS, getProvider } from '../data'
import { clearModelListCache, fetchModels, pingModel } from '../ai'
import { aiTaskConcurrency, aiTaskUsageSummary } from '../aiTask'
import { NumberInput } from './NumberInput'
import {
  AI_PROFILE_OPTIONS,
  DEFAULT_AI_PROFILES,
  profileLabel,
  resolveAiConfig,
} from '../aiProfiles'
import { formatBytes, getLocalStorageUsage, downloadTextFile, snapshotBytes } from '../backup'
import { clearDiagnostics, diagnosticsJson, getDiagnostics } from '../diagnostics'
import { APP_STAGE, APP_VERSION } from '../version'
import {
  setLinkedGenerationSettings,
  useLinkedGenerationSettings,
} from '../linkedGeneration'
import {
  ACCENT_OPTIONS,
  BACKGROUND_OPTIONS,
  BACKGROUND_SCOPES,
  DEFAULT_APPEARANCE,
  HOME_LAYOUT_OPTIONS,
  THEME_OPTIONS,
  UI_SCALE_OPTIONS,
} from '../appearance'
import {
  CHAT_CONTEXT_OPTIONS,
  CHAT_INTIMACY_OPTIONS,
  CHAT_INTERVAL_OPTIONS,
  CHAT_LANGUAGE_OPTIONS,
  CHAT_PROACTIVE_DAILY_OPTIONS,
  CHAT_PROACTIVE_FOLLOW_UP_OPTIONS,
  CHAT_REPLY_OPTIONS,
  DEFAULT_CHARACTER_CHAT_SETTINGS,
} from '../characterChatSettings'
import { IconCheck, IconEye, IconEyeOff } from './Icons'
import { Modal } from './Modal'
import { ModelPicker } from './ModelPicker'
import { TypographySettingsPanel } from './TypographySettingsPanel'
import { WritingPriceSettings } from './WritingPriceSettings'

type SettingsTab = 'model' | 'appearance' | 'chat' | 'sync' | 'data' | 'usage'

interface SettingsModalProps {
  profiles: AiProfilesConfig
  lastBackupAt: number
  aiUsage: AiUsageEntry[]
  appearance: AppearanceSettings
  backgroundImage: string
  backgroundImages: BackgroundImageRecord[]
  chatSettings: CharacterChatSettings
  syncSettings: SyncSettings
  platformBalance?: PlatformBalance | null
  balanceLoading?: boolean
  onRefreshBalance?: () => void
  writingPricing: WritingPricingSettings
  onWritingPricingChange: (settings: WritingPricingSettings) => void
  onSyncSettingsChange: (settings: SyncSettings) => void
  chatSessionCount: number
  chatMemoryCount: number
  onChatSettingsChange: (settings: CharacterChatSettings) => void
  onExportChats: () => void
  onClearChats: () => void
  onClose: () => void
  onSave: (profiles: AiProfilesConfig) => void
  onClear: () => void
  onExportBackup: () => void
  onImportBackup: (file: File) => void
  autoSnapshots: AutoSnapshot[]
  onCreateSnapshot: () => void
  onRestoreSnapshot: (snapshot: AutoSnapshot) => void
  onRemoveSnapshot: (id: string) => void
  trash: TrashEntry[]
  onRestoreTrash: (entry: TrashEntry) => void
  onRemoveTrash: (id: string) => void
  onClearTrash: () => void
  onClearUsage: () => void
  onAppearanceChange: (patch: Partial<AppearanceSettings>) => void
  onUploadBackground: (file: File) => Promise<void>
  onRemoveBackground: () => void
  onSelectBackgroundImage: (record: BackgroundImageRecord) => void
  onDeleteBackgroundImage: (record: BackgroundImageRecord) => void
  onToast: (message: string) => void
}

const TABS: { id: SettingsTab; label: string; hint: string }[] = [
  { id: 'model', label: '模型', hint: '三档 AI 配置' },
  { id: 'appearance', label: '外观', hint: '主题、强调色、背景' },
  { id: 'chat', label: '角色聊天', hint: '默认行为与记忆' },
  { id: 'sync', label: '同步', hint: 'AI 频率与费用' },
  { id: 'data', label: '数据', hint: '备份与本地存储' },
  { id: 'usage', label: '用量', hint: 'token 与费用' },
]

const REASONING_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'fast', label: '快速' },
  { value: 'balanced', label: '标准' },
  { value: 'deep', label: '深度' },
] as const

export function SettingsModal({
  profiles,
  lastBackupAt,
  aiUsage,
  appearance,
  backgroundImage,
  backgroundImages,
  chatSettings,
  syncSettings,
  platformBalance,
  balanceLoading,
  onRefreshBalance,
  writingPricing,
  onWritingPricingChange,
  onSyncSettingsChange,
  chatSessionCount,
  chatMemoryCount,
  onChatSettingsChange,
  onExportChats,
  onClearChats,
  onClose,
  onSave,
  onClear,
  onExportBackup,
  onImportBackup,
  autoSnapshots,
  onCreateSnapshot,
  onRestoreSnapshot,
  onRemoveSnapshot,
  trash,
  onRestoreTrash,
  onRemoveTrash,
  onClearTrash,
  onClearUsage,
  onAppearanceChange,
  onUploadBackground,
  onRemoveBackground,
  onSelectBackgroundImage,
  onDeleteBackgroundImage,
  onToast,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('model')
  const [draft, setDraft] = useState<AiProfilesConfig>(profiles)
  const linkedGeneration = useLinkedGenerationSettings()
  const [showKey, setShowKey] = useState(false)
  const [testingProfile, setTestingProfile] = useState<AiProfileId | null>(null)
  const [testResults, setTestResults] = useState<
    Partial<Record<AiProfileId, { ok: boolean; message: string }>>
  >({})
  const [storage, setStorage] = useState(() => getLocalStorageUsage())
  const [originUsage, setOriginUsage] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [customColor, setCustomColor] = useState('#8aadd6')
  const [customName, setCustomName] = useState('')
  const [customError, setCustomError] = useState('')
  const [themeColorDraft, setThemeColorDraft] = useState(appearance.themeColor ?? '#8aadd6')
  const [themeColorError, setThemeColorError] = useState('')
  const [diagnosticsCount, setDiagnosticsCount] = useState(() => getDiagnostics().length)

  useEffect(() => {
    setThemeColorDraft(appearance.themeColor ?? '#8aadd6')
    setThemeColorError('')
  }, [appearance.themeColor])

  const saveCustomAccent = () => {
    const value = customColor.trim().toLowerCase()
    if (!/^#([0-9a-f]{6}|[0-9a-f]{3})$/.test(value)) {
      setCustomError('请输入有效的十六进制颜色，例如 #8aadd6')
      return
    }
    const color =
      value.length === 4
        ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
        : value
    const existing = appearance.customAccents.find((item) => item.color === color)
    if (existing) {
      onAppearanceChange({ accent: `custom:${existing.id}` })
      setCustomError('')
      return
    }
    if (appearance.customAccents.length >= 12) {
      setCustomError('最多保存 12 个自定义强调色')
      return
    }
    const id = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`
    const next = [
      ...appearance.customAccents,
      {
        id,
        label: customName.trim().slice(0, 24) || `自定义 ${appearance.customAccents.length + 1}`,
        color,
      },
    ]
    onAppearanceChange({ customAccents: next, accent: `custom:${id}` })
    setCustomName('')
    setCustomError('')
  }

  const removeCustomAccent = (id: string) => {
    const next = appearance.customAccents.filter((item) => item.id !== id)
    onAppearanceChange({
      customAccents: next,
      accent: appearance.accent === `custom:${id}` ? 'amber' : appearance.accent,
    })
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  const refreshOriginUsage = () => {
    if (!navigator.storage?.estimate) return
    void navigator.storage.estimate().then((estimate) => {
      setOriginUsage(estimate.usage ?? null)
    })
  }
  useEffect(() => {
    refreshOriginUsage()
  }, [])

  const usageInput = aiUsage.reduce((sum, entry) => sum + entry.inputTokens, 0)
  const usageOutput = aiUsage.reduce((sum, entry) => sum + entry.outputTokens, 0)
  const usageCost = aiUsage.reduce((sum, entry) => sum + (entry.cost ?? 0), 0)
  const actualCount = aiUsage.filter((entry) => entry.actual).length
  const provider = getProvider(draft.shared.provider)
  const hasApiConfig = Boolean(draft.shared.baseUrl.trim() && draft.shared.apiKey.trim())
  const [remoteModels, setRemoteModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!hasApiConfig) {
      setRemoteModels([])
      setModelsError('')
      setModelsLoading(false)
      return () => {
        cancelled = true
      }
    }
    setRemoteModels([])
    setModelsError('')
    setModelsLoading(true)
    const timer = window.setTimeout(() => {
      void fetchModels({
        provider: draft.shared.provider,
        baseUrl: draft.shared.baseUrl,
        apiKey: draft.shared.apiKey,
        model: draft.general.model,
      })
        .then((models) => {
          if (cancelled) return
          setRemoteModels(models)
          if (models.length === 0) setModelsError('服务商没有返回可用模型，可以手动填写模型 ID')
        })
        .catch((error) => {
          if (cancelled) return
          setModelsError(error instanceof Error ? error.message : '获取模型失败')
        })
        .finally(() => {
          if (!cancelled) setModelsLoading(false)
        })
    }, 420)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [draft.shared.provider, draft.shared.baseUrl, draft.shared.apiKey, hasApiConfig])

  const refreshModels = () => {
    clearModelListCache()
    if (!hasApiConfig) return
    setModelsLoading(true)
    setModelsError('')
    void fetchModels({
      provider: draft.shared.provider,
      baseUrl: draft.shared.baseUrl,
      apiKey: draft.shared.apiKey,
      model: draft.general.model,
    })
      .then((models) => {
        setRemoteModels(models)
        if (models.length === 0) setModelsError('服务商没有返回可用模型，可以手动填写模型 ID')
      })
      .catch((error) => {
        setModelsError(error instanceof Error ? error.message : '获取模型失败')
      })
      .finally(() => setModelsLoading(false))
  }

  const updateShared = (patch: Partial<AiProfilesConfig['shared']>) => {
    setDraft((prev) => ({ ...prev, shared: { ...prev.shared, ...patch } }))
    setTestResults({})
  }

  const updateProfile = (id: AiProfileId, patch: Partial<AiProfilesConfig['general']>) => {
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
    setTestResults((prev) => ({ ...prev, [id]: undefined }))
  }

  const handleProvider = (id: string) => {
    const next = getProvider(id)
    setDraft((prev) => ({
      ...prev,
      shared: { ...prev.shared, provider: id, baseUrl: next.baseUrl },
      general: { ...prev.general, model: next.model },
      writing: { ...prev.writing, model: next.model },
      chat: { ...prev.chat, model: next.model },
    }))
    setTestResults({})
  }

  const handleClear = () => {
    setDraft(DEFAULT_AI_PROFILES)
    setTestResults({})
    onClear()
  }

  const handleTest = async (profile: AiProfileId) => {
    setTestingProfile(profile)
    setTestResults((prev) => ({ ...prev, [profile]: undefined }))
    try {
      const reply = await pingModel(resolveAiConfig(draft, profile))
      setTestResults((prev) => ({
        ...prev,
        [profile]: { ok: true, message: `连接成功 · ${reply.slice(0, 20)}` },
      }))
    } catch (error) {
      setTestResults((prev) => ({
        ...prev,
        [profile]: {
          ok: false,
          message: error instanceof Error ? error.message : '连接失败',
        },
      }))
    } finally {
      setTestingProfile(null)
    }
  }

  const handleTestAll = async () => {
    for (const profile of AI_PROFILE_OPTIONS) {
      await handleTest(profile.id)
    }
  }

  const handleImage = async (file: File) => {
    setUploading(true)
    try {
      await onUploadBackground(file)
    } finally {
      setUploading(false)
    }
  }

  const copyStorageReport = async () => {
    const report = [
      '说戏本地存储报告',
      `时间：${new Date().toLocaleString()}`,
      `localStorage：${formatBytes(storage.bytes)}`,
      ...storage.entries.map((entry) => `${entry.key}: ${formatBytes(entry.bytes)}`),
      `IndexedDB 估算：${originUsage === null ? '不可用' : formatBytes(originUsage)}`,
      `上次备份：${lastBackupAt ? new Date(lastBackupAt).toLocaleString() : '无'}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // 剪贴板失败时保持界面稳定；用户可以手动从界面读取。
    }
  }

  const footer =
    tab === 'model' ? (
      <>
        <button type="button" className="btn btn-danger-ghost" onClick={handleClear}>
          清除配置
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          取消
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onSave(draft)}>
          <IconCheck size={16} />
          保存配置
        </button>
      </>
    ) : tab === 'appearance' ? (
      <>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            onRemoveBackground()
            onAppearanceChange(DEFAULT_APPEARANCE)
          }}
        >
          恢复默认外观
        </button>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          完成
        </button>
      </>
    ) : (
      <button type="button" className="btn btn-primary" onClick={onClose}>
        完成
      </button>
    )

  return (
    <Modal
      title="设置"
      subtitle="模型、外观、角色聊天、同步、本地数据与 AI 用量"
      onClose={onClose}
      size="lg"
      footer={footer}
    >
      <div className="settings-tabs" role="tablist" aria-label="设置分区">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.hint}</small>
          </button>
        ))}
      </div>

      {tab === 'model' ? (
        <div className="settings-pane">
          <section className="settings-section">
            <div className="settings-section-head">
              <strong>共用连接</strong>
              <span>三档 AI 默认共用同一服务商、Base URL 和 API Key</span>
            </div>
            <div className="field">
              <label htmlFor="provider">服务商</label>
              <div className="select-wrap">
                <select
                  id="provider"
                  className="input select"
                  value={draft.shared.provider}
                  onChange={(event) => handleProvider(event.target.value)}
                >
                  {PROVIDERS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="hint-line">{provider.hint}</p>
            </div>

            <div className="field">
              <label htmlFor="base-url">接口地址（Base URL）</label>
              <input
                id="base-url"
                className="input"
                value={draft.shared.baseUrl}
                onChange={(event) => updateShared({ baseUrl: event.target.value })}
                placeholder="https://api.deepseek.com/v1"
                spellCheck={false}
              />
            </div>

            <div className="field">
              <label htmlFor="api-key">API Key（三档共用）</label>
              <div className="key-wrap">
                <input
                  id="api-key"
                  className="input"
                  type={showKey ? 'text' : 'password'}
                  value={draft.shared.apiKey}
                  onChange={(event) => updateShared({ apiKey: event.target.value })}
                  placeholder="sk-..."
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="key-toggle"
                  onClick={() => setShowKey((value) => !value)}
                  aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                >
                  {showKey ? <IconEyeOff size={17} /> : <IconEye size={17} />}
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="embedding-model">语义检索 Embedding 模型（可选）</label>
              <input
                id="embedding-model"
                className="input"
                value={draft.shared.embeddingModel ?? ''}
                onChange={(event) => updateShared({ embeddingModel: event.target.value })}
                placeholder="例如 text-embedding-3-small / nomic-embed-text"
                spellCheck={false}
              />
              <p className="hint-line">
                填服务商支持的 OpenAI 兼容 /embeddings 模型后，故事记忆可用向量语义检索；留空则使用本地关键词 + 实体检索。
              </p>
            </div>

            <div className="field">
              <label htmlFor="context-window">模型上下文窗口（可选）</label>
              <input
                id="context-window"
                className="input"
                value={draft.shared.contextWindow ?? ''}
                onChange={(event) =>
                  updateShared({
                    contextWindow: Number(event.target.value.replace(/[^\d]/g, '')) || undefined,
                  })
                }
                placeholder="留空自动判断，例如 128000"
                inputMode="numeric"
                spellCheck={false}
              />
              <p className="hint-line">
                留空会按模型名自动判断。“不限制”会按这个窗口扣掉输出预留，避免请求直接超过服务商上限。
              </p>
            </div>

            <WritingPriceSettings
              settings={writingPricing}
              provider={draft.shared.provider}
              model={draft.writing.model}
              onChange={onWritingPricingChange}
            />
          </section>

          <div className="ai-profile-grid">
            {AI_PROFILE_OPTIONS.map((profile) => {
              const result = testResults[profile.id]
              return (
                <section className="ai-profile-card" key={profile.id}>
                  <div className="ai-profile-head">
                    <strong>{profile.label}</strong>
                    <span>{profile.hint}</span>
                  </div>
                  <div className="field">
                    <span className="label">模型</span>
                    {!hasApiConfig ? (
                      <div className="model-config-empty">配置接口地址和 API Key 后，自动获取可用模型</div>
                    ) : modelsLoading ? (
                      <div className="model-config-empty is-loading">正在从服务商获取模型…</div>
                    ) : (
                      <ModelPicker
                        value={draft[profile.id].model}
                        models={remoteModels}
                        onChange={(model) => updateProfile(profile.id, { model })}
                        ariaLabel={`${profile.label}模型`}
                      />
                    )}
                    {hasApiConfig && modelsError ? (
                      <div className="model-config-error">
                        <span>{modelsError}</span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={refreshModels}>
                          重新获取
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="field">
                    <label htmlFor={`reasoning-${profile.id}`}>推理等级</label>
                    <select
                      id={`reasoning-${profile.id}`}
                      className="input select"
                      value={draft[profile.id].reasoningEffort ?? 'auto'}
                      onChange={(event) =>
                        updateProfile(profile.id, {
                          reasoningEffort: event.target.value as
                            | 'auto'
                            | 'fast'
                            | 'balanced'
                            | 'deep',
                        })
                      }
                    >
                      {REASONING_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ai-profile-test">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void handleTest(profile.id)}
                      disabled={
                        testingProfile !== null ||
                        !draft.shared.apiKey.trim() ||
                        !draft.shared.baseUrl.trim() ||
                        !draft[profile.id].model.trim()
                      }
                    >
                      {testingProfile === profile.id ? '测试中…' : '测试连接'}
                    </button>
                    {result ? (
                      <span className={`test-result ${result.ok ? 'ok' : 'err'}`}>{result.message}</span>
                    ) : (
                      <small>当前：{resolveAiConfig(draft, profile.id).model || '未设置模型'}</small>
                    )}
                  </div>
                </section>
              )
            })}
          </div>

          <div className="settings-test">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void handleTestAll()}
              disabled={
                testingProfile !== null ||
                !draft.shared.apiKey.trim() ||
                !draft.shared.baseUrl.trim()
              }
            >
              测试三档连接
            </button>
            <span className="hint-line">
              三档共用连接，但可以分别选择模型；写作页只切换写作 AI，聊天页只切换聊天 AI。
            </span>
          </div>

          <section className="settings-section">
            <div className="settings-section-head">
              <strong>生成联动</strong>
              <span>控制 AI 生成实体后的连锁补全</span>
            </div>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={linkedGeneration.autoFillFactionRoster}
                onChange={(event) =>
                  setLinkedGenerationSettings({
                    autoFillFactionRoster: event.target.checked,
                  })
                }
              />
              <span>
                一键生成势力时补全长老 / 亲传 / 主要弟子
                <small>
                  开启后：AI 生成势力时同时生成名册，并把这些成员转成角色卡；关闭后只生成势力和首领，可在势力右键菜单里单独补全。
                </small>
              </span>
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={linkedGeneration.autoCreateLinkedItems}
                onChange={(event) =>
                  setLinkedGenerationSettings({
                    autoCreateLinkedItems: event.target.checked,
                  })
                }
              />
              <span>
                自动补全角色 / 势力携带的物品
                <small>
                  开启后：生成角色时把武器、法宝补成物品页条目；生成势力时先补关联角色，再补角色物品和势力仓库。每次会多一轮物品生成请求。
                </small>
              </span>
            </label>
          </section>
        </div>
      ) : null}
      {tab === 'appearance' ? (
        <div className="settings-pane">
          <div className={`appearance-preview theme-${appearance.mode}`}>
            <span className="appearance-preview-eyebrow">实时预览</span>
            <strong>把想看的戏，说出来。</strong>
            <p>主题、强调色与背景会立即应用，不需要保存。</p>
            <div className="appearance-preview-row">
              <span className="preview-button">继续写</span>
              <span className="preview-chip">连载中</span>
              <span className="preview-line" />
            </div>
          </div>

          <TypographySettingsPanel
            typography={appearance.typography}
            onChange={(typography) => onAppearanceChange({ typography })}
            onToast={onToast}
          />

          <section className="settings-section">
            <div className="settings-section-head">
              <strong>界面缩放</strong>
              <span>整个应用一起放大，适合高分辨率屏幕</span>
            </div>
            <div className="ui-scale-options">
              {UI_SCALE_OPTIONS.map((scale) => (
                <button
                  type="button"
                  key={scale}
                  className={`ui-scale-option ${appearance.uiScale === scale ? 'active' : ''}`}
                  onClick={() => onAppearanceChange({ uiScale: scale })}
                >
                  {scale}%
                </button>
              ))}
            </div>
            <p className="hint-line">
              如果系统已经开启 Windows 显示缩放，建议保持 100%；觉得字小可以试 110% 或 125%。
            </p>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <strong>主题</strong>
              <span>日间 / 夜间 / 跟随系统</span>
            </div>
            <div className="appearance-options">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`appearance-option ${appearance.mode === option.value ? 'active' : ''}`}
                  onClick={() => onAppearanceChange({ mode: option.value as ThemeMode })}
                >
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <strong>主题底色</strong>
              <span>调整整体背景和面板底色，不影响强调色</span>
            </div>
            <div className="theme-color-row">
              <label className="accent-color-wrap" title="打开调色板">
                <span
                  className="accent-dot"
                  style={{ background: appearance.themeColor ?? 'var(--panel)' }}
                />
                <input
                  type="color"
                  className="accent-color-input"
                  value={/^#[0-9a-f]{6}$/i.test(themeColorDraft) ? themeColorDraft : '#8aadd6'}
                  onChange={(event) => {
                    const value = event.target.value
                    setThemeColorDraft(value)
                    setThemeColorError('')
                    onAppearanceChange({ themeColor: value })
                  }}
                  aria-label="主题底色"
                />
              </label>
              <input
                className="input accent-hex-input"
                value={themeColorDraft}
                onChange={(event) => {
                  setThemeColorDraft(event.target.value)
                  setThemeColorError('')
                }}
                placeholder="#8aadd6"
                spellCheck={false}
                aria-label="主题底色十六进制"
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const value = themeColorDraft.trim()
                  if (!/^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(value)) {
                    setThemeColorError('请输入有效的十六进制颜色，例如 #8aadd6')
                    return
                  }
                  onAppearanceChange({ themeColor: value })
                  setThemeColorError('')
                }}
              >
                应用
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setThemeColorDraft('#8aadd6')
                  setThemeColorError('')
                  onAppearanceChange({ themeColor: undefined })
                }}
              >
                恢复默认
              </button>
            </div>
            {themeColorError ? <p className="accent-custom-error">{themeColorError}</p> : null}
            <p className="hint-line">例：#8aadd6 偏蓝，#d8b98a 偏暖，#b7a6c8 偏紫。</p>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <strong>强调色</strong>
              <span>按钮、链接和选中态</span>
            </div>
            <div className="accent-options">
              {ACCENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`accent-option ${appearance.accent === option.value ? 'active' : ''}`}
                  onClick={() => onAppearanceChange({ accent: option.value })}
                >
                  <span className="accent-dot" style={{ background: option.color }} />
                  {option.label}
                </button>
              ))}
              {appearance.customAccents.map((option) => (
                <span
                  key={option.id}
                  className={`accent-option accent-option-custom ${
                    appearance.accent === `custom:${option.id}` ? 'active' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="accent-option-main"
                    onClick={() => onAppearanceChange({ accent: `custom:${option.id}` })}
                  >
                    <span className="accent-dot" style={{ background: option.color }} />
                    {option.label}
                  </button>
                  <button
                    type="button"
                    className="accent-option-remove"
                    title="删除这个自定义强调色"
                    aria-label={`删除自定义强调色 ${option.label}`}
                    onClick={() => removeCustomAccent(option.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="accent-custom">
              <div className="accent-custom-head">
                <strong>自定义强调色</strong>
                <span>选一个颜色，保存后会出现在上面，随时切换</span>
              </div>
              <div className="accent-custom-row">
                <label className="accent-color-wrap" title="打开调色板">
                  <span className="accent-dot" style={{ background: customColor }} />
                  <input
                    type="color"
                    className="accent-color-input"
                    value={/^#[0-9a-f]{6}$/i.test(customColor) ? customColor : '#8aadd6'}
                    onChange={(event) => {
                      setCustomColor(event.target.value)
                      setCustomError('')
                    }}
                    aria-label="打开调色板"
                  />
                </label>
                <input
                  className="input accent-hex-input"
                  value={customColor}
                  onChange={(event) => {
                    setCustomColor(event.target.value)
                    setCustomError('')
                  }}
                  placeholder="#8aadd6"
                  spellCheck={false}
                  aria-label="十六进制颜色"
                />
                <input
                  className="input accent-name-input"
                  value={customName}
                  onChange={(event) => setCustomName(event.target.value)}
                  placeholder="名称（可选）"
                  maxLength={24}
                  aria-label="自定义强调色名称"
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={saveCustomAccent}
                >
                  保存并应用
                </button>
              </div>
              {customError ? <p className="accent-custom-error">{customError}</p> : null}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <strong>首页布局</strong>
              <span>剧场版保留完整入口，书架版更安静、更快进入写作</span>
            </div>
            <div className="appearance-options">
              {HOME_LAYOUT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`appearance-option ${appearance.homeLayout === option.value ? 'active' : ''}`}
                  onClick={() => onAppearanceChange({ homeLayout: option.value as HomeLayout })}
                >
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <strong>背景</strong>
              <span>建议只作用于主页，避免干扰正文</span>
            </div>
            <div className="background-options">
              {BACKGROUND_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`background-option ${appearance.backgroundKind === 'preset' && appearance.backgroundPreset === option.value ? 'active' : ''}`}
                  onClick={() =>
                    onAppearanceChange({
                      backgroundKind: 'preset',
                      backgroundPreset: option.value as BackgroundPreset,
                    })
                  }
                >
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>

            <div className="appearance-upload">
              <div>
                <strong>自定义图片</strong>
                <p>本地压缩后保存，不会上传到服务器。</p>
              </div>
              <div className="appearance-upload-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => imageRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? '处理中…' : backgroundImage ? '更换图片' : '上传图片'}
                </button>
                {backgroundImage ? (
                  <button type="button" className="btn btn-danger-ghost btn-sm" onClick={onRemoveBackground}>
                    移除背景
                  </button>
                ) : null}
                <input
                  ref={imageRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void handleImage(file)
                    event.target.value = ''
                  }}
                />
              </div>
            </div>

            {backgroundImage ? (
              <div className="background-preview">
                <span style={{ backgroundImage: `url("${backgroundImage}")` }} />
                <small>当前自定义背景</small>
              </div>
            ) : null}

            {backgroundImages.length > 0 ? (
              <div className="background-gallery-section">
                <strong>背景图库</strong>
                <p>点缩略图切换，不需要重新上传；再次切回预设后也能从这里换回图片。</p>
                <div className="background-gallery">
                  {backgroundImages.map((image) => {
                    const active =
                      appearance.backgroundKind === 'image' && backgroundImage === image.data
                    return (
                      <div
                        key={image.id}
                        className={`background-gallery-item ${active ? 'active' : ''}`}
                      >
                        <button
                          type="button"
                          className="background-gallery-pick"
                          onClick={() => onSelectBackgroundImage(image)}
                          title={`使用背景：${image.name}`}
                        >
                          <span style={{ backgroundImage: `url("${image.data}")` }} />
                          <small>{image.name}</small>
                        </button>
                        <button
                          type="button"
                          className="background-gallery-delete"
                          title={`从图库删除：${image.name}`}
                          aria-label={`从图库删除：${image.name}`}
                          onClick={() => onDeleteBackgroundImage(image)}
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="appearance-range">
              <label>
                <span>背景透明度</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={appearance.backgroundOpacity}
                  onChange={(event) => onAppearanceChange({ backgroundOpacity: Number(event.target.value) })}
                />
                <strong>{appearance.backgroundOpacity}%</strong>
              </label>
              <label>
                <span>背景模糊</span>
                <input
                  type="range"
                  min={0}
                  max={18}
                  value={appearance.backgroundBlur}
                  onChange={(event) => onAppearanceChange({ backgroundBlur: Number(event.target.value) })}
                />
                <strong>{appearance.backgroundBlur}px</strong>
              </label>
            </div>

            <div className="appearance-scope">
              <span>适用范围</span>
              <div className="export-scope-switch">
                {BACKGROUND_SCOPES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={appearance.backgroundScope === option.value ? 'active' : ''}
                    onClick={() => onAppearanceChange({ backgroundScope: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {tab === 'chat' ? (
        <div className="settings-pane">
          <section className="settings-section">
            <div className="settings-section-head">
              <strong>新对话默认行为</strong>
              <span>只影响新建会话，已有会话保留自己的设置</span>
            </div>
            <div className="chat-settings-grid">
              <label className="chat-setting-toggle">
                <span>
                  <strong>默认自动整理记忆</strong>
                  <small>新对话每 N 条消息自动生成摘要和记忆</small>
                </span>
                <input
                  type="checkbox"
                  checked={chatSettings.autoMemoryDefault}
                  onChange={(event) =>
                    onChatSettingsChange({
                      ...chatSettings,
                      autoMemoryDefault: event.target.checked,
                    })
                  }
                />
              </label>

              <label>
                <span>自动整理频率</span>
                <select
                  className="input select"
                  value={chatSettings.autoMemoryInterval}
                  onChange={(event) =>
                    onChatSettingsChange({
                      ...chatSettings,
                      autoMemoryInterval: Number(event.target.value),
                    })
                  }
                >
                  {CHAT_INTERVAL_OPTIONS.map((interval) => (
                    <option key={interval} value={interval}>
                      每 {interval} 条消息
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>默认知识截止</span>
                <select
                  className="input select"
                  value={chatSettings.defaultCutoffMode}
                  onChange={(event) =>
                    onChatSettingsChange({
                      ...chatSettings,
                      defaultCutoffMode: event.target.value === 'first' ? 'first' : 'latest',
                    })
                  }
                >
                  <option value="latest">最新章</option>
                  <option value="first">第 1 章</option>
                </select>
              </label>

              <label>
                <span>上下文消息数</span>
                <select
                  className="input select"
                  value={chatSettings.contextMessageLimit}
                  onChange={(event) =>
                    onChatSettingsChange({
                      ...chatSettings,
                      contextMessageLimit: Number(event.target.value),
                    })
                  }
                >
                  {CHAT_CONTEXT_OPTIONS.map((limit) => (
                    <option key={limit} value={limit}>
                      {limit} 条
                    </option>
                  ))}
                </select>
              </label>

              <div className="chat-setting-reply">
                <span>回复长度</span>
                <div className="export-scope-switch">
                  {CHAT_REPLY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={chatSettings.replyLength === option.value ? 'active' : ''}
                      onClick={() =>
                        onChatSettingsChange({ ...chatSettings, replyLength: option.value })
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <label>
                <span>语言开放度</span>
                <select
                  className="input select"
                  value={chatSettings.languageOpenness}
                  onChange={(event) =>
                    onChatSettingsChange({
                      ...chatSettings,
                      languageOpenness: event.target
                        .value as typeof chatSettings.languageOpenness,
                    })
                  }
                >
                  {CHAT_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="chat-setting-toggle">
                <span>
                  <strong>允许角色说粗口</strong>
                  <small>只在角色、关系和情绪都支持时出现，不堆砌脏话</small>
                </span>
                <input
                  type="checkbox"
                  checked={chatSettings.allowProfanity}
                  onChange={(event) =>
                    onChatSettingsChange({
                      ...chatSettings,
                      allowProfanity: event.target.checked,
                    })
                  }
                />
              </label>

              <label className="chat-setting-toggle">
                <span>
                  <strong>允许戏内威胁</strong>
                  <small>不能诱导真实自残或真实伤害</small>
                </span>
                <input
                  type="checkbox"
                  checked={chatSettings.allowThreats}
                  onChange={(event) =>
                    onChatSettingsChange({
                      ...chatSettings,
                      allowThreats: event.target.checked,
                    })
                  }
                />
              </label>

              <label>
                <span>亲密内容</span>
                <select
                  className="input select"
                  value={chatSettings.intimacyLevel}
                  onChange={(event) =>
                    onChatSettingsChange({
                      ...chatSettings,
                      intimacyLevel: event.target
                        .value as typeof chatSettings.intimacyLevel,
                    })
                  }
                >
                  {CHAT_INTIMACY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <p className="settings-data-note chat-content-note">
                {CHAT_INTIMACY_OPTIONS.find(
                  (option) => option.value === chatSettings.intimacyLevel,
                )?.hint}
                {' '}
                成人向默认关闭，仅限成年人使用；露骨性器官词和粗俗性俚语始终禁止，命中后会重写或拦截。
              </p>

              <label className="chat-setting-toggle">
                <span>
                  <strong>允许角色主动发消息</strong>
                  <small>进入会话、久别回来或用户未回复时，角色可主动开口</small>
                </span>
                <input
                  type="checkbox"
                  checked={chatSettings.proactiveEnabled}
                  onChange={(event) =>
                    onChatSettingsChange({
                      ...chatSettings,
                      proactiveEnabled: event.target.checked,
                    })
                  }
                />
              </label>

              <label>
                <span>每天主动消息上限</span>
                <select
                  className="input select"
                  value={chatSettings.proactiveDailyLimit}
                  disabled={!chatSettings.proactiveEnabled}
                  onChange={(event) =>
                    onChatSettingsChange({
                      ...chatSettings,
                      proactiveDailyLimit: Number(event.target.value),
                    })
                  }
                >
                  {CHAT_PROACTIVE_DAILY_OPTIONS.map((limit) => (
                    <option key={limit} value={limit}>
                      {limit} 条
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>每次未回复最多追问</span>
                <select
                  className="input select"
                  value={chatSettings.proactiveFollowUpLimit}
                  disabled={!chatSettings.proactiveEnabled}
                  onChange={(event) =>
                    onChatSettingsChange({
                      ...chatSettings,
                      proactiveFollowUpLimit: Number(event.target.value),
                    })
                  }
                >
                  {CHAT_PROACTIVE_FOLLOW_UP_OPTIONS.map((limit) => (
                    <option key={limit} value={limit}>
                      {limit} 次
                    </option>
                  ))}
                </select>
              </label>

              <p className="settings-data-note chat-content-note">
                主动消息每天最多 8 条，未回复最多追问 5 次；用户明确说“有事走了 / 不聊了 / 晚安”后，本轮不再追问。
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm chat-setting-reset"
              onClick={() => onChatSettingsChange(DEFAULT_CHARACTER_CHAT_SETTINGS)}
            >
              恢复聊天默认值
            </button>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <strong>角色聊天数据</strong>
              <span>
                {chatSessionCount} 个会话 · {chatMemoryCount} 条长期记忆
              </span>
            </div>
            <p className="settings-data-note">
              项目备份 v2 已包含聊天、记忆、外观、自定义色板和背景图（不含 API Key）；仍建议单独导出聊天做手动副本。
            </p>
            <div className="settings-data-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onExportChats}
                disabled={chatSessionCount === 0 && chatMemoryCount === 0}
              >
                导出全部聊天
              </button>
              <button
                type="button"
                className="btn btn-danger-ghost btn-sm"
                onClick={onClearChats}
                disabled={chatSessionCount === 0 && chatMemoryCount === 0}
              >
                清空聊天数据
              </button>
            </div>
          </section>

          <p className="hint-line">
            角色聊天不会自动改正文、角色卡或事件簿。自动整理只记录对话中明确出现的内容。
          </p>
        </div>
      ) : null}

      {tab === 'sync' ? (
        <div className="settings-pane">
          <section className="settings-section">
            <div className="settings-section-head">
              <strong>AI 同步</strong>
              <span>快速同步负责日常事件和状态；深度同步补角色经历与完整审查；本地保存和本地摘要永远不收费</span>
            </div>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={syncSettings.afterGeneration}
                onChange={(event) =>
                  onSyncSettingsChange({
                    ...syncSettings,
                    afterGeneration: event.target.checked,
                  })
                }
              />
              <span>
                AI 续写后自动快速同步
                <small>默认关闭。开启后每次续写会多一次快速同步请求；需要完整档案时仍用手动深度同步。</small>
              </span>
            </label>
            <div className="field">
              <label htmlFor="sync-interval">快速同步间隔</label>
              <div className="sync-interval-row">
                <NumberInput
                  id="sync-interval"
                  className="input"
                  min={1}
                  max={100}
                  value={syncSettings.chapterInterval}
                  fallback={1}
                  onValueChange={(value) =>
                    onSyncSettingsChange({ ...syncSettings, chapterInterval: value })
                  }
                />
                <span>章</span>
                <div className="sync-interval-presets">
                  {[1, 5, 10, 20, 50, 100].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={syncSettings.chapterInterval === value ? 'active' : ''}
                      onClick={() =>
                        onSyncSettingsChange({ ...syncSettings, chapterInterval: value })
                      }
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <p className="hint-line">
                范围 1–100 章。快速同步间隔越大越省费用，但中间章节的状态会滞后；补同步和手动同步随时可用。
              </p>
            </div>
            <div className="field">
              <label>达到间隔时</label>
              <div className="export-scope-switch">
                <button
                  type="button"
                  className={syncSettings.strategy === 'current' ? 'active' : ''}
                  onClick={() =>
                    onSyncSettingsChange({ ...syncSettings, strategy: 'current' })
                  }
                >
                  只同步当前章（省费）
                </button>
                <button
                  type="button"
                  className={syncSettings.strategy === 'backfill' ? 'active' : ''}
                  onClick={() =>
                    onSyncSettingsChange({ ...syncSettings, strategy: 'backfill' })
                  }
                >
                  回补未同步章
                </button>
              </div>
              <p className="hint-line">
                “只同步当前章”不会回补中间章节，费用最低；“回补”连续性完整，但会产生多章请求。
              </p>
            </div>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={syncSettings.localChapterSummary}
                onChange={(event) =>
                  onSyncSettingsChange({
                    ...syncSettings,
                    localChapterSummary: event.target.checked,
                  })
                }
              />
              <span>
                每章生成本地摘要
                <small>不调用 AI。用开头、关键句和结尾补足间隔同步的上下文。</small>
              </span>
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={syncSettings.importantChapterAutoSync}
                onChange={(event) =>
                  onSyncSettingsChange({
                    ...syncSettings,
                    importantChapterAutoSync: event.target.checked,
                  })
                }
              />
              <span>
                重要剧情立即快速同步
                <small>死亡、重伤、背叛、首领更替、战争、真相揭露等章节不等间隔，直接快速同步。</small>
              </span>
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={syncSettings.coverageDeepSync}
                onChange={(event) =>
                  onSyncSettingsChange({
                    ...syncSettings,
                    coverageDeepSync: event.target.checked,
                  })
                }
              />
              <span>
                快速同步信息不足时自动深度补全
                <small>快速同步发现事件 / 状态 / 新实体达到上限时，自动补一次角色经历与完整审查。</small>
              </span>
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={syncSettings.autoArchiveComplete}
                onChange={(event) =>
                  onSyncSettingsChange({
                    ...syncSettings,
                    autoArchiveComplete: event.target.checked,
                  })
                }
              />
              <span>
                同步新建实体后自动补全深度档案
                <small>新角色 / 势力先建档，再后台补全；失败保留占位，可手动补全。</small>
              </span>
            </label>
            <div className="field">
              <label htmlFor="archive-complete-limit">每章自动补全数量</label>
              <NumberInput
                id="archive-complete-limit"
                className="input"
                min={1}
                max={5}
                value={syncSettings.archiveCompleteLimit}
                fallback={1}
                onValueChange={(value) =>
                  onSyncSettingsChange({ ...syncSettings, archiveCompleteLimit: value })
                }
              />
              <p className="hint-line">范围 1–5 个。数量越多，同步后等待越久、费用越高。</p>
            </div>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={syncSettings.archiveOnlyImportant}
                onChange={(event) =>
                  onSyncSettingsChange({
                    ...syncSettings,
                    archiveOnlyImportant: event.target.checked,
                  })
                }
              />
              <span>
                只自动补全重要角色和势力
                <small>优先补主角、反派、核心成员、首领和势力；路人保持占位。</small>
              </span>
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={syncSettings.aiBackgroundPaused}
                onChange={(event) =>
                  onSyncSettingsChange({
                    ...syncSettings,
                    aiBackgroundPaused: event.target.checked,
                  })
                }
              />
              <span>
                暂停后台 AI 档案补全
                <small>同步仍然进行，只是不再自动补全角色/势力档案；手动补全不受影响。</small>
              </span>
            </label>
          </section>
          <section className="settings-section">
            <div className="settings-section-head">
              <strong>手动兜底</strong>
              <span>无论设置多省，写作页顶部的「快速 / 深度同步」、章节的「深度同步本章」和多章深度同步始终可用。</span>
            </div>
            <p className="hint-line">
              当前默认：续写后不同步；每 {syncSettings.chapterInterval} 章或重要剧情时快速同步一次；
              {syncSettings.coverageDeepSync ? '信息不足时自动深度补全' : '信息不足时不自动深度补全'}。
            </p>
          </section>
          <section className="settings-section">
            <div className="settings-section-head">
              <strong>AI 运行状态</strong>
              <span>本次应用运行期间的统一任务统计，不包含历史会话</span>
            </div>
            <p className="hint-line">
              并发 {aiTaskConcurrency().active}/{aiTaskConcurrency().max}，排队 {aiTaskConcurrency().queued}；
              共 {aiTaskUsageSummary().requests} 次请求，输入约 {aiTaskUsageSummary().inputTokens} tokens，输出约{' '}
              {aiTaskUsageSummary().outputTokens} tokens。
            </p>
            {Object.entries(aiTaskUsageSummary().byTask).length > 0 ? (
              <p className="hint-line">
                {Object.entries(aiTaskUsageSummary().byTask)
                  .sort((left, right) => right[1].requests - left[1].requests)
                  .slice(0, 6)
                  .map(([task, value]) => `${task} ${value.requests} 次`)
                  .join(' · ')}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {tab === 'data' ? (
        <div className="settings-pane">
          <div className="settings-data">
            <div className="settings-data-head">
              <div>
                <strong>本地数据与备份</strong>
                <p>
                  作品、章节、设定都保存在本机；正文与详情存放在 IndexedDB。换电脑或清理浏览器前请先导出。
                </p>
              </div>
              <span>{formatBytes(originUsage ?? storage.bytes)}</span>
            </div>
            <div className="settings-data-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  onExportBackup()
                  setStorage(getLocalStorageUsage())
                  refreshOriginUsage()
                }}
              >
                导出项目备份
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => fileRef.current?.click()}
              >
                导入项目备份
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onImportBackup(file)
                  event.target.value = ''
                }}
              />
            </div>
            <p className="settings-data-note">
              {lastBackupAt
                ? `上次导出：${new Date(lastBackupAt).toLocaleString()}`
                : '还没有导出过备份。'}
            </p>
          </div>

          <section className="settings-section">
            <div className="settings-section-head">
              <strong>本地快照</strong>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onCreateSnapshot}>
                立即快照
              </button>
            </div>
            <p className="hint-line">
              每天首次打开、导入备份或恢复快照前自动保存，最多保留 3 份或总计 24 MB；超出时优先保留最新快照。快照含正文、聊天和外观设置，不含 API Key。
            </p>
            {autoSnapshots.length === 0 ? (
              <p className="settings-data-note">还没有本地快照。</p>
            ) : (
              <div className="backup-snapshot-list">
                {autoSnapshots.map((snapshot) => (
                  <div className="backup-snapshot-row" key={snapshot.id}>
                    <div>
                      <strong>{snapshot.reason}</strong>
                      <small>
                        {new Date(snapshot.createdAt).toLocaleString()} ·{' '}
                        {snapshot.backup.works.length} 部作品 ·{' '}
                        {(snapshot.backup.characterChats ?? []).length} 个聊天 ·{' '}
                        {formatBytes(snapshotBytes(snapshot))}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => onRestoreSnapshot(snapshot)}
                    >
                      恢复
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-sm"
                      onClick={() => onRemoveSnapshot(snapshot.id)}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <strong>最近删除</strong>
              <button
                type="button"
                className="btn btn-danger-ghost btn-sm"
                onClick={onClearTrash}
                disabled={trash.length === 0}
              >
                清空
              </button>
            </div>
            <p className="hint-line">
              删除的作品会先进入这里，可恢复作品、章节、设定、角色聊天和长期记忆。
            </p>
            {trash.length === 0 ? (
              <p className="settings-data-note">最近删除是空的。</p>
            ) : (
              <div className="backup-trash-list">
                {trash.map((entry) => (
                  <div className="backup-trash-row" key={entry.id}>
                    <div>
                      <strong>{entry.work.title}</strong>
                      <small>
                        {new Date(entry.deletedAt).toLocaleString()} · {entry.chapters.length} 章 ·{' '}
                        {entry.chats.length} 个聊天
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => onRestoreTrash(entry)}
                    >
                      恢复
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-sm"
                      onClick={() => onRemoveTrash(entry.id)}
                    >
                      彻底删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="settings-section">
            <div className="settings-section-head">
              <strong>存储明细</strong>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyStorageReport()}>
                {copied ? '已复制' : '复制报告'}
              </button>
            </div>
            <div className="settings-storage-list">
              {storage.entries.map((entry) => (
                <div className="settings-data-row" key={entry.key}>
                  <span>{entry.key}</span>
                  <small>{formatBytes(entry.bytes)}</small>
                </div>
              ))}
            </div>
            <p className="settings-data-note">
              IndexedDB 估算：{originUsage === null ? '不可用' : formatBytes(originUsage)}
            </p>
          </div>

          <p className="warn-line">
            当前 API Key 仍保存在本机浏览器存储中；请不要在公共电脑上保存 Key。这个版本还没有自动云备份。
          </p>

          <section className="settings-section">
            <div className="settings-section-head">
              <strong>诊断与版本</strong>
              <span>
                说戏 v{APP_VERSION} · {APP_STAGE}
              </span>
            </div>
            <div className="settings-data-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  downloadTextFile(
                    `shuoxi-diagnostics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`,
                    diagnosticsJson(),
                  )
                }}
              >
                导出诊断信息
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  clearDiagnostics()
                  setDiagnosticsCount(0)
                }}
                disabled={diagnosticsCount === 0}
              >
                清除诊断（{diagnosticsCount}）
              </button>
            </div>
            <p className="settings-data-note">
              诊断只记录错误类型、时间和堆栈，不包含正文、聊天或 API Key。
            </p>
          </section>
        </div>
      ) : null}

      {tab === 'usage' ? (
        <div className="settings-pane">
          <div className="settings-data">
            <div className="settings-balance-card">
              <div>
                <strong>平台余额</strong>
                <p>
                  {platformBalance && platformBalance.balances[0]
                    ? `${platformBalance.isAvailable ? '可用' : '不可用'} · ${balanceMoney(
                        platformBalance.balances[0].total,
                        platformBalance.balances[0].currency,
                      )}`
                    : '未查询到余额（目前仅 DeepSeek 支持）'}
                </p>
                {platformBalance && platformBalance.balances[0] ? (
                  <small>
                    充值{' '}
                    {balanceMoney(
                      platformBalance.balances[0].toppedUp,
                      platformBalance.balances[0].currency,
                    )}
                    {' · '}
                    赠送{' '}
                    {balanceMoney(
                      platformBalance.balances[0].granted,
                      platformBalance.balances[0].currency,
                    )}
                    {platformBalance.cached ? ' · 缓存' : ''}
                  </small>
                ) : null}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={balanceLoading}
                onClick={onRefreshBalance}
              >
                {balanceLoading ? '查询中…' : '刷新余额'}
              </button>
            </div>
            <div className="settings-data-head">
              <div>
                <strong>AI 用量</strong>
                <p>
                  {aiUsage.length} 次调用 · {actualCount} 次实际 usage · 输入约{' '}
                  {usageInput.toLocaleString()} / 输出约 {usageOutput.toLocaleString()} tokens
                  {usageCost > 0 ? ` · 参考费用 ¥${usageCost.toFixed(4)}` : ''}
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClearUsage}>
                清空记录
              </button>
            </div>
            {aiUsage.length === 0 ? (
              <p className="settings-data-note">
                还没有调用记录。续写、分析和设定同步会记录估算 token，不保存正文。
              </p>
            ) : (
              <div className="settings-usage-list">
                {aiUsage.slice(0, 20).map((entry) => (
                  <div className="settings-data-row" key={entry.id}>
                    <span>
                      {entry.kind} · {entry.model} ·{' '}
                      {entry.profile ? `${profileLabel(entry.profile)} · ` : ''}
                      {entry.actual ? '实际' : '估算'}
                    </span>
                    <small>
                      入 {entry.inputTokens.toLocaleString()} / 出 {entry.outputTokens.toLocaleString()}
                      {entry.cost && entry.cost > 0 ? ` · ¥${entry.cost.toFixed(4)}` : ''}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="hint-line">
            用量明细保留最近 1000 次，长期按日聚合并用于创作统计；服务商未返回真实 usage 时使用本地估算。
          </p>
        </div>
      ) : null}
    </Modal>
  )
}
