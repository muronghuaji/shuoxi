import { useRef, useState } from 'react'
import type {
  ApiConfig,
  CustomFeatureDefinition,
  CustomFeatureScope,
  TemplateField,
  TemplateFieldType,
  TemplateTerms,
  WorldTemplate,
} from '../types'
import {
  BUILTIN_TEMPLATES,
  cloneTemplate,
  getTemplateFeatureOptions,
  parseGeneratedTemplate,
  validateWorldTemplate,
} from '../worldTemplates'
import { GENERIC_MODULE_IDS, MODULE_CATALOG } from '../moduleCatalog'
import { runApiTask } from '../aiTask'
import { IconPlus, IconTrash } from './Icons'
import { Modal } from './Modal'

interface WorldTemplateModalProps {
  template: WorldTemplate
  api: ApiConfig
  apiReady: boolean
  onClose: () => void
  onSave: (template: WorldTemplate) => void
  onToast: (message: string) => void
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

const TERM_LABELS: { key: keyof TemplateTerms; label: string; hint: string }[] = [
  { key: 'faction', label: '势力称呼', hint: '宗门 / 国家 / 公司 / 军团' },
  { key: 'leader', label: '势力领袖', hint: '宗主 / 总统 / 老板 / 统帅' },
  { key: 'member', label: '成员称呼', hint: '弟子 / 员工 / 士兵' },
  { key: 'factionUnit', label: '下属单位', hint: '峰堂 / 部门 / 基地 / 州郡' },
  { key: 'position', label: '职位称呼', hint: '宗门职位 / 职级 / 职务' },
  { key: 'rank', label: '等级体系', hint: '修为 / 职级 / 义体等级 / 军衔' },
  { key: 'ability', label: '能力称呼', hint: '功法 / 技能 / 科技 / 兵法' },
  { key: 'item', label: '物品称呼', hint: '法宝 / 装备 / 兵器' },
  { key: 'currency', label: '货币称呼', hint: '灵石 / 资金 / 信用点 / 粮饷' },
]

export function WorldTemplateModal({
  template,
  api,
  apiReady,
  onClose,
  onSave,
  onToast,
}: WorldTemplateModalProps) {
  const [draft, setDraft] = useState<WorldTemplate>(() => {
    const next = cloneTemplate(template)
    if (!next.modules?.length) next.modules = [...GENERIC_MODULE_IDS]
    return next
  })
  const [moduleToAdd, setModuleToAdd] = useState('')
  const [fieldScope, setFieldScope] = useState<'character' | 'faction'>('character')
  const [fieldLabel, setFieldLabel] = useState('')
  const [fieldType, setFieldType] = useState<TemplateFieldType>('text')
  const [fieldOptions, setFieldOptions] = useState('')
  const [featureDraft, setFeatureDraft] = useState<CustomFeatureDefinition | null>(null)
  const [featureFieldLabel, setFeatureFieldLabel] = useState('')
  const [featureFieldType, setFeatureFieldType] = useState<TemplateFieldType>('text')
  const [featureFieldOptions, setFeatureFieldOptions] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [aiError, setAiError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const featureOptions = getTemplateFeatureOptions(draft)

  const updateTerm = (key: keyof TemplateTerms, value: string) => {
    setDraft((prev) => ({
      ...prev,
      terms: { ...prev.terms, [key]: value },
    }))
  }

  const updateFeature = (key: keyof WorldTemplate['features'], value: boolean) => {
    setDraft((prev) => ({
      ...prev,
      features: { ...prev.features, [key]: value },
    }))
  }

  const addField = () => {
    const label = fieldLabel.trim()
    if (!label) {
      onToast('先填写字段名称')
      return
    }
    const field: TemplateField = {
      id: uid('field'),
      label,
      type: fieldType,
      options:
        fieldType === 'select'
          ? fieldOptions
              .split(/[,，、]/)
              .map((item) => item.trim())
              .filter(Boolean)
          : undefined,
    }
    setDraft((prev) => ({
      ...prev,
      [fieldScope === 'character' ? 'characterFields' : 'factionFields']: [
        ...(fieldScope === 'character' ? prev.characterFields : prev.factionFields),
        field,
      ],
    }))
    setFieldLabel('')
    setFieldOptions('')
    onToast(`已添加字段：${label}`)
  }

  const removeField = (scope: 'character' | 'faction', id: string) => {
    setDraft((prev) => ({
      ...prev,
      [scope === 'character' ? 'characterFields' : 'factionFields']:
        scope === 'character'
          ? prev.characterFields.filter((field) => field.id !== id)
          : prev.factionFields.filter((field) => field.id !== id),
    }))
  }

  const startCustomFeature = () => {
    setFeatureDraft({
      id: uid('feature'),
      name: '',
      scope: 'character',
      fields: [],
      includeInContext: true,
    })
    setFeatureFieldLabel('')
    setFeatureFieldOptions('')
  }

  const editCustomFeature = (feature: CustomFeatureDefinition) => {
    setFeatureDraft(JSON.parse(JSON.stringify(feature)) as CustomFeatureDefinition)
  }

  const addFeatureField = () => {
    const label = featureFieldLabel.trim()
    if (!label || !featureDraft) return
    const options =
      featureFieldType === 'select'
        ? featureFieldOptions
            .split(/[,，、]/)
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined
    setFeatureDraft((prev) =>
      prev
        ? {
            ...prev,
            fields: [
              ...prev.fields,
              {
                id: uid('feature-field'),
                label,
                type: featureFieldType,
                options,
              },
            ],
          }
        : prev,
    )
    setFeatureFieldLabel('')
    setFeatureFieldOptions('')
    setFeatureFieldType('text')
  }

  const removeFeatureField = (id: string) => {
    setFeatureDraft((prev) =>
      prev ? { ...prev, fields: prev.fields.filter((field) => field.id !== id) } : prev,
    )
  }

  const saveCustomFeature = () => {
    if (!featureDraft) return
    if (!featureDraft.name.trim()) {
      onToast('先填写功能名称')
      return
    }
    if (featureDraft.fields.length === 0) {
      onToast('至少添加一个字段')
      return
    }
    setDraft((prev) => {
      const current = prev.customFeatures ?? []
      const exists = current.some((feature) => feature.id === featureDraft.id)
      return {
        ...prev,
        customFeatures: exists
          ? current.map((feature) =>
              feature.id === featureDraft.id ? { ...featureDraft, name: featureDraft.name.trim() } : feature,
            )
          : [...current, { ...featureDraft, name: featureDraft.name.trim() }],
      }
    })
    setFeatureDraft(null)
    onToast('自定义功能块已添加，保存模板后生效')
  }

  const removeCustomFeature = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      customFeatures: (prev.customFeatures ?? []).filter((feature) => feature.id !== id),
    }))
  }

  const exportTemplate = () => {
    const payload = JSON.stringify({ ...draft, builtin: false }, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${draft.name || 'world-template'}.world.json`
    link.click()
    URL.revokeObjectURL(url)
    onToast('模板已导出')
  }

  const importTemplate = async (file: File | undefined) => {
    if (!file) return
    try {
      const text = await file.text()
      const parsed = validateWorldTemplate(JSON.parse(text))
      if (!parsed) throw new Error('模板结构不完整')
      setDraft({ ...parsed, builtin: false })
      onToast(`已导入模板：${parsed.name}`)
    } catch (error) {
      onToast(`导入失败：${error instanceof Error ? error.message : '文件格式不支持'}`)
    }
  }

  const generateTemplate = async () => {
    if (!apiReady) {
      setAiError('请先在设置中配置 AI 模型和 API Key')
      return
    }
    if (!aiPrompt.trim()) {
      setAiError('先写一句世界/题材描述')
      return
    }
    setGenerating(true)
    setAiError('')
    try {
      const system = [
        '你是小说世界模板设计师。根据用户描述，生成一个可供写作软件使用的世界模板。',
        '只输出一个 JSON 对象，不要 markdown 代码块、解释或前后缀。',
        'JSON 结构：',
        '{"name":"模板名","description":"一句话说明","terms":{"faction":"势力称呼","factionUnit":"下属单位称呼","rank":"等级称呼","ability":"能力称呼","item":"物品称呼","currency":"货币称呼","member":"成员称呼","leader":"领袖称呼","position":"职位称呼"},"features":{"cultivation":false,"equipment":false,"hierarchy":false,"ranks":false,"system":false},"characterFields":[{"label":"字段名","type":"text|textarea|number|select","options":["选项"]}],"factionFields":[{"label":"字段名","type":"text|textarea|number|select","options":["选项"]}]}',
        '字段数量控制在角色 0–8、势力 0–8；字段名要具体、可填写；不要编造用户没有提到的设定。',
      ].join('\n')
      const user = `题材/世界描述：${aiPrompt.trim()}\n请生成一个适配这个世界的模板。`
      const result = await runApiTask(api, {
        task: 'analysis.plan',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.45,
        maxTokens: 2200,
      })
      const parsed = parseGeneratedTemplate(result)
      if (!parsed) throw new Error('模型没有返回可用的模板 JSON，请重试或换一个描述')
      setDraft({ ...parsed, builtin: false })
      onToast(`已生成模板：${parsed.name}`)
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error))
    } finally {
      setGenerating(false)
    }
  }

  const saveTemplate = () => {
    if (draft.modules.length < 4) {
      onToast('每个模板至少保留 4 个设定模块')
      return
    }
    const cleaned = validateWorldTemplate({ ...draft, name: draft.name.trim() || '自定义世界' })
    if (!cleaned) {
      onToast('模板名不能为空')
      return
    }
    onSave({ ...cleaned, builtin: false })
  }

  const activeFields = fieldScope === 'character' ? draft.characterFields : draft.factionFields
  const selectedModules = draft.modules
    .map((id) => MODULE_CATALOG.find((module) => module.id === id))
    .filter((module): module is NonNullable<typeof module> => Boolean(module))
  const availableModules = MODULE_CATALOG.filter((module) => !draft.modules.includes(module.id))

  const addModule = () => {
    if (!moduleToAdd || draft.modules.includes(moduleToAdd)) return
    setDraft((prev) => ({ ...prev, modules: [...prev.modules, moduleToAdd] }))
    setModuleToAdd('')
  }

  const removeModule = (id: string) => {
    setDraft((prev) => ({ ...prev, modules: prev.modules.filter((item) => item !== id) }))
  }

  return (
    <Modal
      title="世界模板"
      subtitle="术语、字段与 AI 一键生成"
      onClose={onClose}
      size="lg"
      footer={
        <div className="record-modal-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveTemplate}>
            保存模板
          </button>
        </div>
      }
    >
      <div className="world-template-editor">
        <section className="template-section">
          <div className="template-section-head">
            <span>选择基础模板</span>
            <small>选内置模板，再加自己的字段</small>
          </div>
          <div className="template-picker">
            {BUILTIN_TEMPLATES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`template-choice ${draft.id === item.id ? 'active' : ''}`}
                onClick={() => setDraft(cloneTemplate(item))}
              >
                <strong>{item.name}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="template-section">
          <div className="template-section-head">
            <span>模板信息</span>
          </div>
          <div className="record-form-grid">
            <label className="record-field">
              <span>模板名称</span>
              <input
                className="input drawer-input"
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="例如：九州修仙 / 赛博港城"
              />
            </label>
            <label className="record-field record-field-wide">
              <span>说明</span>
              <input
                className="input drawer-input"
                value={draft.description}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="这个模板适用于什么世界？"
              />
            </label>
          </div>
        </section>

        <section className="template-section">
          <div className="template-section-head">
            <span>术语映射</span>
            <small>界面会使用这些称呼</small>
          </div>
          <div className="template-terms-grid">
            {TERM_LABELS.map((item) => (
              <label className="record-field" key={item.key}>
                <span>{item.label} · {item.hint}</span>
                <input
                  className="input drawer-input"
                  value={draft.terms[item.key]}
                  onChange={(event) => updateTerm(item.key, event.target.value)}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="template-section">
          <div className="template-section-head">
            <span>功能开关</span>
            <small>只显示当前模板支持的专属块；关闭只隐藏，不删除已有数据</small>
          </div>
          {featureOptions.length === 0 ? (
            <p className="template-feature-empty">
              通用模板没有专属功能开关；角色、势力、关系、章节和伏笔仍可正常使用。
            </p>
          ) : (
            <div className="template-toggle-grid">
              {featureOptions.map((option) => (
                <label className="template-toggle" key={option.key}>
                  <input
                    type="checkbox"
                    checked={draft.features[option.key]}
                    onChange={(event) => updateFeature(option.key, event.target.checked)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.hint}</small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="template-section">
          <div className="template-section-head">
            <span>设定模块</span>
            <small>{draft.modules.length} 个 · 建议保留 4 个以上，作品里可继续启用</small>
          </div>
          <div className="template-module-grid">
            {selectedModules.map((module) => (
              <div className="template-module-card" key={module.id}>
                <div>
                  <strong>{module.name}</strong>
                  <span>{module.description}</span>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`移除模块 ${module.name}`}
                  onClick={() => removeModule(module.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="template-add-module">
            <select
              className="input select drawer-input"
              value={moduleToAdd}
              onChange={(event) => setModuleToAdd(event.target.value)}
            >
              <option value="">选择要添加的设定模块</option>
              {availableModules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.name} · {module.description}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!moduleToAdd}
              onClick={addModule}
            >
              <IconPlus size={14} />
              添加模块
            </button>
          </div>
        </section>

        <section className="template-section">
          <div className="template-section-head">
            <span>自定义字段</span>
            <small>角色 / 势力档案会多出这些字段</small>
          </div>
          <div className="template-scope-tabs">
            <button
              type="button"
              className={fieldScope === 'character' ? 'active' : ''}
              onClick={() => setFieldScope('character')}
            >
              角色字段
            </button>
            <button
              type="button"
              className={fieldScope === 'faction' ? 'active' : ''}
              onClick={() => setFieldScope('faction')}
            >
              势力字段
            </button>
          </div>
          <div className="template-field-list">
            {activeFields.length === 0 ? (
              <p className="drawer-empty">还没有自定义字段。可以加“道号”“军衔”“义体等级”等。</p>
            ) : (
              activeFields.map((field) => (
                <div className="template-field-row" key={field.id}>
                  <strong>{field.label}</strong>
                  <span>{field.type}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`删除字段 ${field.label}`}
                    onClick={() => removeField(fieldScope, field.id)}
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="template-add-field">
            <input
              className="input drawer-input"
              value={fieldLabel}
              onChange={(event) => setFieldLabel(event.target.value)}
              placeholder="字段名，例如：道号 / 军衔 / 义体等级"
            />
            <select
              className="input select drawer-input"
              value={fieldType}
              onChange={(event) => setFieldType(event.target.value as TemplateFieldType)}
            >
              <option value="text">单行文本</option>
              <option value="textarea">长文本</option>
              <option value="number">数字</option>
              <option value="select">单选</option>
            </select>
            {fieldType === 'select' ? (
              <input
                className="input drawer-input"
                value={fieldOptions}
                onChange={(event) => setFieldOptions(event.target.value)}
                placeholder="选项，用顿号分隔"
              />
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={addField}>
              <IconPlus size={14} />
              添加字段
            </button>
          </div>
        </section>

        <section className="template-section">
          <div className="template-section-head">
            <span>自定义功能</span>
            <small>给角色 / 势力添加自己的功能块；会进入对应档案和 AI 上下文</small>
          </div>
          <div className="template-custom-features">
            {(draft.customFeatures ?? []).length === 0 ? (
              <p className="drawer-empty">还没有自定义功能块。例如：灵兽、资产、证据链、军衔档案。</p>
            ) : (
              (draft.customFeatures ?? []).map((feature) => (
                <div className="template-custom-feature-row" key={feature.id}>
                  <div>
                    <strong>{feature.name}</strong>
                    <span>
                      {feature.scope === 'faction' ? '势力' : '角色'} · {feature.fields.length} 个字段
                      {feature.includeInContext ? ' · 进入 AI 上下文' : ''}
                    </span>
                  </div>
                  <div className="template-custom-feature-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => editCustomFeature(feature)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`删除功能 ${feature.name}`}
                      onClick={() => removeCustomFeature(feature.id)}
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {featureDraft ? (
            <div className="template-custom-feature-editor">
              <div className="template-custom-feature-row">
                <input
                  className="input drawer-input"
                  value={featureDraft.name}
                  placeholder="功能名称，例如：灵兽 / 公司项目 / 证据链"
                  onChange={(event) =>
                    setFeatureDraft((prev) =>
                      prev ? { ...prev, name: event.target.value } : prev,
                    )
                  }
                  autoFocus
                />
                <select
                  className="input select drawer-input"
                  value={featureDraft.scope}
                  onChange={(event) =>
                    setFeatureDraft((prev) =>
                      prev
                        ? { ...prev, scope: event.target.value as CustomFeatureScope }
                        : prev,
                    )
                  }
                >
                  <option value="character">作用于角色</option>
                  <option value="faction">作用于势力</option>
                </select>
              </div>
              <label className="template-custom-feature-context">
                <input
                  type="checkbox"
                  checked={featureDraft.includeInContext}
                  onChange={(event) =>
                    setFeatureDraft((prev) =>
                      prev ? { ...prev, includeInContext: event.target.checked } : prev,
                    )
                  }
                />
                这个功能块的字段进入 AI 上下文
              </label>

              <div className="template-custom-feature-fields">
                {featureDraft.fields.length === 0 ? (
                  <p className="drawer-empty">还没有字段，至少添加一个。</p>
                ) : (
                  featureDraft.fields.map((field) => (
                    <div className="template-custom-feature-field" key={field.id}>
                      <strong>{field.label}</strong>
                      <span>{field.type}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`删除字段 ${field.label}`}
                        onClick={() => removeFeatureField(field.id)}
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="template-add-field">
                <input
                  className="input drawer-input"
                  value={featureFieldLabel}
                  onChange={(event) => setFeatureFieldLabel(event.target.value)}
                  placeholder="字段名，例如：名称 / 等级 / 忠诚度"
                />
                <select
                  className="input select drawer-input"
                  value={featureFieldType}
                  onChange={(event) => setFeatureFieldType(event.target.value as TemplateFieldType)}
                >
                  <option value="text">单行文本</option>
                  <option value="textarea">长文本</option>
                  <option value="number">数字</option>
                  <option value="select">单选</option>
                </select>
                {featureFieldType === 'select' ? (
                  <input
                    className="input drawer-input"
                    value={featureFieldOptions}
                    onChange={(event) => setFeatureFieldOptions(event.target.value)}
                    placeholder="选项，用顿号分隔"
                  />
                ) : null}
                <button type="button" className="btn btn-ghost btn-sm" onClick={addFeatureField}>
                  <IconPlus size={14} />
                  添加字段
                </button>
              </div>

              <div className="template-custom-feature-footer">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFeatureDraft(null)}>
                  取消
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={saveCustomFeature}>
                  保存功能块
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={startCustomFeature}>
              <IconPlus size={14} />
              新建自定义功能
            </button>
          )}
        </section>

        <section className="template-section template-transfer">
          <div className="template-section-head">
            <span>导入 / 导出</span>
            <small>模板是 JSON，可以备份或分享</small>
          </div>
          <div className="template-transfer-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={exportTemplate}>
              导出 JSON
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
              导入 JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                void importTemplate(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>
        </section>

        <section className="template-section template-ai">
          <div className="template-section-head">
            <span>一键生成模板</span>
            <small>用 AI 从一句世界描述生成术语和字段</small>
          </div>
          <textarea
            className="input drawer-textarea"
            rows={3}
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder="例如：一个被海水淹没的赛博港城，城市由几个财团控制，角色有义体等级和所属舰队……"
          />
          <div className="template-ai-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={generating || !apiReady}
              onClick={() => void generateTemplate()}
              title={apiReady ? '让 AI 生成模板' : '请先配置 AI 模型'}
            >
              {generating ? '生成中…' : 'AI 生成模板'}
            </button>
            {!apiReady ? <span className="drawer-hint">配置 AI 后可用</span> : null}
            {aiError ? <span className="director-error">{aiError}</span> : null}
          </div>
        </section>
      </div>
    </Modal>
  )
}
