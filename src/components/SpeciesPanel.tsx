import { useEffect, useState } from 'react'
import type { AiUsageEntry, ApiConfig, SpeciesCard, TierScheme, Work, WorkDetail } from '../types'
import { requestEntityGenerate } from '../entityFill'
import {
  emptySpecies,
  normalizeSpecies,
  speciesCompleteness,
  speciesQuickLine,
} from '../species'
import { IconPlus, IconSparkles, IconTrash } from './Icons'
import { Modal } from './Modal'
import { EntityIdeaModal } from './EntityIdeaModal'
import { TierSettingsModal } from './TierSettingsModal'
import { LifecycleBadge, LifecycleTags } from './LifecycleTags'
import { useContextMenu, type ContextMenuEntry } from './ContextMenuProvider'
import { copyTextToClipboard } from '../clipboard'
import {
  defaultSpeciesTierScheme,
  ensureSpeciesTierData,
  cloneTierScheme,
  schemeById,
  speciesCategoryColor,
} from '../tiers'

interface SpeciesPanelProps {
  work: Work
  detail: WorkDetail
  api: ApiConfig
  apiReady: boolean
  onRecordUsage?: (entry: AiUsageEntry) => void
  onToast: (message: string) => void
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onOpenTab?: (tab: 'characters') => void
  focusRequest?: { id: string; requestId: number } | null
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <label className="record-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          className="input drawer-textarea"
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className="input drawer-input"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  )
}

function ListField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
}) {
  return (
    <label className="record-field">
      <span>{label}</span>
      <textarea
        className="input drawer-textarea"
        rows={2}
        value={value.join('\n')}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(/[、,，\n]/)
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
      />
    </label>
  )
}

export function SpeciesPanel({
  work,
  detail,
  api,
  apiReady,
  onRecordUsage,
  onToast,
  onUpdateDetail,
  onOpenTab,
  focusRequest,
}: SpeciesPanelProps) {
  const species = detail.species ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [ideaOpen, setIdeaOpen] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryColor, setCategoryColor] = useState('#8b9bb4')
  const [tierCategoryId, setTierCategoryId] = useState<string | null>(null)
  const { openContextMenu } = useContextMenu()
  const selected = species.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    if (!focusRequest?.id) return
    if (!species.some((item) => item.id === focusRequest.id)) return
    setSelectedId(focusRequest.id)
  }, [focusRequest, species])

  useEffect(() => {
    const patch = ensureSpeciesTierData(detail)
    if (patch) onUpdateDetail(patch)
  }, [detail, onUpdateDetail])

  const categories = [...(detail.speciesCategories ?? [])].sort((a, b) => a.order - b.order)
  const schemeForCategory = (categoryId: string | undefined) => {
    const category = categories.find((item) => item.id === categoryId)
    return schemeById(detail.tierSchemes, category?.tierSchemeId)
  }
  const categoryOf = (item: SpeciesCard) =>
    categories.find((category) => category.id === item.categoryId) ??
    categories.find((category) => category.name === item.category)
  const colorOfCategory = (categoryId: string | undefined) =>
    categories.find((category) => category.id === categoryId)?.color ??
    speciesCategoryColor(categories.findIndex((category) => category.id === categoryId))
  const visibleSpecies = selectedCategoryId
    ? species.filter((item) => categoryOf(item)?.id === selectedCategoryId)
    : species
  const tierCategory = categories.find((category) => category.id === tierCategoryId) ?? null
  const tierScheme = tierCategory?.tierSchemeId
    ? schemeById(detail.tierSchemes, tierCategory.tierSchemeId)
    : undefined
  const tierDefaultScheme = tierCategory ? defaultSpeciesTierScheme(tierCategory.name) : undefined
  const finalCategory = selectedCategoryId
    ? categories.find((category) => category.id === selectedCategoryId)
    : categories[0]
  const finalScheme = schemeForCategory(finalCategory?.id)
  const selectedCategory = selected ? categoryOf(selected) : undefined
  const selectedScheme = schemeForCategory(selectedCategory?.id)
  const selectedLevel =
    selected?.tierLevel ? selectedScheme?.levels[selected.tierLevel - 1] : undefined
  const selectedTone = selectedLevel?.color ?? selectedCategory?.color ?? speciesCategoryColor(0)

  const updateSpecies = (id: string, patch: Partial<SpeciesCard>) => {
    onUpdateDetail({
      species: species.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })
  }

  const addSpecies = () => {
    const item = emptySpecies()
    if (finalCategory) {
      item.categoryId = finalCategory.id
      item.category = finalCategory.name
      item.tierLevel = 1
    }
    onUpdateDetail({ species: [...species, item] })
    setSelectedId(item.id)
  }

  const openAddCategory = () => {
    setEditingCategoryId(null)
    setCategoryName('')
    setCategoryColor(speciesCategoryColor(categories.length))
    setCategoryOpen(true)
  }

  const openEditCategory = (id: string) => {
    const category = categories.find((item) => item.id === id)
    if (!category) return
    setEditingCategoryId(id)
    setCategoryName(category.name)
    setCategoryColor(category.color ?? speciesCategoryColor(categories.indexOf(category)))
    setCategoryOpen(true)
  }

  const saveCategory = () => {
    const name = categoryName.trim()
    if (!name) {
      onToast('先填写分类名称')
      return
    }
    if (editingCategoryId) {
      onUpdateDetail({
        speciesCategories: (detail.speciesCategories ?? []).map((category) =>
          category.id === editingCategoryId
            ? { ...category, name, color: categoryColor }
            : category,
        ),
        species: species.map((item) =>
          item.categoryId === editingCategoryId ? { ...item, category: name } : item,
        ),
      })
      onToast('物种分类已更新')
    } else {
      const next = {
        id: `species-cat-${Date.now().toString(36)}`,
        name,
        order: categories.length,
        color: categoryColor,
      }
      onUpdateDetail({ speciesCategories: [...(detail.speciesCategories ?? []), next] })
      setSelectedCategoryId(next.id)
      onToast(`已添加物种分类：${name}`)
    }
    setCategoryOpen(false)
  }

  const deleteCategory = (id: string) => {
    if (categories.length <= 1) {
      onToast('至少保留一个物种分类')
      return
    }
    const category = categories.find((item) => item.id === id)
    if (!category) return
    const fallback = categories.find((item) => item.id !== id)
    onUpdateDetail({
      speciesCategories: (detail.speciesCategories ?? []).filter((item) => item.id !== id),
      species: species.map((item) =>
        item.categoryId === id
          ? { ...item, categoryId: fallback?.id, category: fallback?.name ?? '' }
          : item,
      ),
    })
    if (selectedCategoryId === id) setSelectedCategoryId(null)
    onToast(`已删除分类：${category.name}，物种已移到${fallback?.name ?? '未分类'}`)
  }

  const saveTierSettings = (scheme: TierScheme, color: string) => {
    if (!tierCategory) return
    onUpdateDetail({
      tierSchemes: [
        ...(detail.tierSchemes ?? []).filter((item) => item.id !== scheme.id),
        scheme,
      ],
      speciesCategories: (detail.speciesCategories ?? []).map((category) =>
        category.id === tierCategory.id
          ? { ...category, tierSchemeId: scheme.id, color }
          : category,
      ),
    })
    setTierCategoryId(null)
    onToast(`已保存「${tierCategory.name}」阶位`)
  }

  const copyTierToCategory = (targetId: string, scheme: TierScheme, color: string) => {
    const target = categories.find((category) => category.id === targetId)
    if (!target) return
    const cloned = cloneTierScheme(scheme)
    onUpdateDetail({
      tierSchemes: [
        ...(detail.tierSchemes ?? []).filter((item) => item.id !== cloned.id),
        cloned,
      ],
      speciesCategories: (detail.speciesCategories ?? []).map((category) =>
        category.id === targetId
          ? { ...category, tierSchemeId: cloned.id, color }
          : category,
      ),
    })
    onToast(`已将阶位方案复制到「${target.name}」`)
  }

  const deleteSpecies = (id: string) => {
    onUpdateDetail({
      species: species.filter((item) => item.id !== id),
      characters: detail.characters.map((character) =>
        character.speciesId === id ? { ...character, speciesId: undefined } : character,
      ),
      factions: detail.factions.map((faction) =>
        faction.speciesIds?.includes(id)
          ? { ...faction, speciesIds: faction.speciesIds.filter((speciesId) => speciesId !== id) }
          : faction,
      ),
    })
    setSelectedId(null)
  }

  const speciesContextMenu = (item: SpeciesCard): ContextMenuEntry[] => {
    const category = categoryOf(item)
    return [
      { type: 'label', label: item.name || '未命名物种' },
      { label: '打开物种档案', onSelect: () => setSelectedId(item.id) },
      {
        label: '复制名称',
        onSelect: () => {
          void copyTextToClipboard(item.name).then((ok) =>
            onToast(ok ? '已复制物种名称' : '复制失败'),
          )
        },
      },
      {
        label: '复制标签',
        disabled: !(item.tags?.length || item.abilities.length),
        onSelect: () => {
          void copyTextToClipboard([...(item.tags ?? []), ...item.abilities].join('、')).then(
            (ok) => onToast(ok ? '已复制物种标签' : '复制失败'),
          )
        },
      },
      { type: 'separator' },
      {
        label: 'AI 按想法生成物种…',
        disabled: !apiReady || generating,
        hint: !apiReady ? '请先配置 AI' : generating ? '正在生成' : undefined,
        onSelect: () => setIdeaOpen(true),
      },
      ...(onOpenTab
        ? [
            {
              label: '打开角色页',
              onSelect: () => onOpenTab('characters'),
            } satisfies ContextMenuEntry,
          ]
        : []),
      ...(category
        ? [
            {
              label: '设置分类阶位…',
              onSelect: () => setTierCategoryId(category.id),
            } satisfies ContextMenuEntry,
          ]
        : []),
      { type: 'separator' },
      {
        label: '删除物种…',
        danger: true,
        onSelect: () => {
          if (window.confirm(`删除「${item.name || '未命名物种'}」？角色会解除物种关联。`)) {
            deleteSpecies(item.id)
          }
        },
      },
    ]
  }

  const speciesCategoryContextMenu = (categoryId: string): ContextMenuEntry[] => {
    const category = categories.find((item) => item.id === categoryId)
    if (!category) return []
    return [
      { type: 'label', label: category.name },
      {
        label: '只看这个分类',
        onSelect: () => setSelectedCategoryId(category.id),
      },
      { label: '编辑分类…', onSelect: () => openEditCategory(category.id) },
      { label: '分类阶位设置…', onSelect: () => setTierCategoryId(category.id) },
      {
        label: '复制分类名称',
        onSelect: () => {
          void copyTextToClipboard(category.name).then((ok) =>
            onToast(ok ? '已复制分类名称' : '复制失败'),
          )
        },
      },
      { type: 'separator' },
      {
        label: '删除分类…',
        danger: true,
        disabled: categories.length <= 1,
        hint: categories.length <= 1 ? '至少保留一个分类' : undefined,
        onSelect: () => {
          if (window.confirm(`删除分类「${category.name}」？物种会自动转移到其他分类。`)) {
            deleteCategory(category.id)
          }
        },
      },
    ]
  }

  const generate = async (hint?: string): Promise<boolean> => {    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return false
    }
    setGenerating(true)
    try {
      const generated = await requestEntityGenerate({
        kind: 'species',
        work,
        detail,
        hint: [
          finalCategory ? `物种分类：${finalCategory.name}` : '',
          finalScheme
            ? `本分类阶位（tier 使用对应序号）：${finalScheme.levels.map((level, index) => `${index + 1}=${level.name}`).join('、')}`
            : '',
          hint,
        ]
          .filter(Boolean)
          .join('\n'),
        api,
        onRecordUsage,
      })
      const baseName =
        typeof generated.name === 'string' && generated.name.trim()
          ? generated.name.trim()
          : '未命名物种'
      const existingNames = new Set(species.map((item) => item.name))
      let name = baseName
      let suffix = 2
      while (existingNames.has(name)) {
        name = `${baseName} ${suffix}`
        suffix += 1
      }
      const generatedTier =
        typeof generated.tier === 'number' && Number.isFinite(generated.tier)
          ? Math.max(1, Math.floor(generated.tier))
          : 1
      const tierLevel = finalScheme
        ? Math.min(generatedTier, finalScheme.levels.length)
        : generatedTier
      const next = normalizeSpecies({
        ...generated,
        id: emptySpecies().id,
        name,
        categoryId: finalCategory?.id,
        category: finalCategory?.name ?? '',
        tierLevel,
        tags: Array.isArray(generated.tags)
          ? generated.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
      })
      onUpdateDetail({ species: [...species, next] })
      setSelectedId(next.id)
      onToast(`已生成物种：${next.name}`)
      return true
    } catch (caught) {
      onToast(`生成失败：${caught instanceof Error ? caught.message : '请稍后重试'}`)
      return false
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="species-panel">
      <div className="drawer-section-head species-head">
        <div>
          <span>物种 / 种族</span>
          <small>{species.length} 个物种 · 角色可以关联物种</small>
        </div>
        <div className="species-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={openAddCategory}>
            <IconPlus size={14} />
            分类
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (!finalCategory) {
                onToast('先添加一个物种分类')
                return
              }
              setTierCategoryId(finalCategory.id)
            }}
          >
            阶位设置
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={generating || !apiReady}
            onClick={() => setIdeaOpen(true)}
            title={apiReady ? '输入你的想法，AI 分析后按想法生成物种' : '请先配置 AI'}
          >
            <IconSparkles size={14} />
            {generating ? '生成中…' : '一键生成'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addSpecies}>
            <IconPlus size={14} />
            添加物种
          </button>
        </div>
      </div>

      <div className="species-category-tabs">
        <button
          type="button"
          className={`species-category-tab ${selectedCategoryId === null ? 'active' : ''}`}
          onClick={() => setSelectedCategoryId(null)}
        >
          <span>全部</span>
          <small>{species.length}</small>
        </button>
        {categories.map((category) => (
          <div className="species-category-tab-wrap" key={category.id}>
            <button
              type="button"
              className={`species-category-tab ${selectedCategoryId === category.id ? 'active' : ''}`}
              onClick={() => setSelectedCategoryId(category.id)}
              onContextMenu={(event) =>
                openContextMenu(event, speciesCategoryContextMenu(category.id))
              }
            >
              <span>
                <i
                  className="species-category-dot"
                  style={{ background: category.color ?? speciesCategoryColor(0) }}
                  aria-hidden="true"
                />
                {category.name}
              </span>
              <small>{species.filter((item) => categoryOf(item)?.id === category.id).length}</small>
            </button>
            <button
              type="button"
              className="species-category-edit"
              aria-label={`编辑分类 ${category.name}`}
              onClick={() => openEditCategory(category.id)}
            >
              ⋯
            </button>
          </div>
        ))}
      </div>

      {species.length === 0 ? (
        <div className="drawer-empty species-empty">
          <p>还没有物种。先建立一个物种，再把角色关联到它。</p>
          <p>可以是动物、神兽、精灵、亡灵、外星种族、AI 生命或自定义类型。</p>
        </div>
      ) : (
        <div className="species-grid">
          {visibleSpecies.map((item) => {
            const category = categoryOf(item)
            const scheme = schemeForCategory(category?.id)
            const level = item.tierLevel ? scheme?.levels[item.tierLevel - 1] : undefined
            const tone = level?.color ?? category?.color ?? speciesCategoryColor(0)
            return (
              <button
                key={item.id}
                type="button"
                data-entity-kind="species"
                data-entity-id={item.id}
                className={`species-card ${item.id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(item.id)}
                onContextMenu={(event) => openContextMenu(event, speciesContextMenu(item))}
                style={
                  {
                    '--species-category-color': category?.color ?? speciesCategoryColor(0),
                    '--tone': tone,
                    '--tone-soft': `${tone}18`,
                  } as React.CSSProperties
                }
              >
                <span className="species-card-top">
                  <span className="species-card-category">
                    <i
                      className="species-category-dot"
                      style={{ background: category?.color ?? speciesCategoryColor(0) }}
                      aria-hidden="true"
                    />
                    {category?.name || item.category || '未分类'}
                  </span>
                  {level ? (
                    <span
                      className="species-tier-badge"
                      style={{
                        color: level.color,
                        borderColor: level.color,
                        background: `${level.color}18`,
                      }}
                    >
                      {level.name}
                    </span>
                  ) : null}
                </span>
                <strong>{item.name || '未命名物种'}</strong>
                <small>{item.habitat || item.origin || '还没有写起源 / 栖息地'}</small>
                <p>{item.appearance || item.physiology || item.society || '还没有写物种特征。'}</p>
                <div className="species-card-badges">
                  {(item.tags ?? []).slice(0, 4).map((tag) => (
                    <span className="species-tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="species-card-tags">
                  {item.abilities.slice(0, 3).map((ability) => (
                    <span key={ability}>{ability}</span>
                  ))}
                  {item.weaknesses.slice(0, 2).map((weakness) => (
                    <span className="weak" key={weakness}>
                      弱点：{weakness}
                    </span>
                  ))}
                </span>
                <span className="species-card-foot">
                  <span>完整度 {speciesCompleteness(item)}%</span>
                  <LifecycleBadge value={item.lifecycle} />
                  <span>查看详情 →</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {selected ? (
        <Modal
          title={selected.name || '物种档案'}
          subtitle={speciesQuickLine(selected)}
          size="lg"
          tone={selectedTone}
          onClose={() => setSelectedId(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-danger-ghost"
                onClick={() => deleteSpecies(selected.id)}
              >
                <IconTrash size={14} />
                删除物种
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setSelectedId(null)}>
                完成
              </button>
            </>
          }
        >
          <div
            className="species-editor detail-accent-sheet"
            style={
              {
                '--tone': selectedTone,
                '--tone-soft': `${selectedTone}18`,
              } as React.CSSProperties
            }
          >
            <div className="entity-lifecycle-row">
              <span>上线状态</span>
              <LifecycleTags
                value={selected.lifecycle}
                compact
                onChange={(lifecycle) => updateSpecies(selected.id, { lifecycle })}
              />
            </div>
            <div className="record-form-grid">
              <Field
                label="名称"
                value={selected.name}
                onChange={(value) => updateSpecies(selected.id, { name: value })}
                placeholder="例如：霜裔 / 雾灵 / 铁血虫族"
              />
              <label className="record-field">
                <span>物种分类</span>
                <select
                  className="input select drawer-input"
                  value={selected.categoryId ?? ''}
                  onChange={(event) => {
                    const category = categories.find((item) => item.id === event.target.value)
                    updateSpecies(selected.id, {
                      categoryId: category?.id,
                      category: category?.name ?? '',
                      tierLevel: 1,
                    })
                  }}
                >
                  <option value="">未分类</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="record-field">
                <span>阶位</span>
                <select
                  className="input select drawer-input"
                  value={selected.tierLevel ?? ''}
                  onChange={(event) =>
                    updateSpecies(selected.id, {
                      tierLevel: event.target.value ? Number(event.target.value) : undefined,
                    })
                  }
                >
                  <option value="">未设置</option>
                  {(schemeForCategory(selected.categoryId)?.levels ?? []).map((level, index) => (
                    <option key={level.id} value={index + 1}>
                      {index + 1} · {level.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="自定义标签"
                value={(selected.tags ?? []).join('、')}
                onChange={(value) =>
                  updateSpecies(selected.id, {
                    tags: value
                      .split(/[、,，\n]/)
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="龙族、远古、可驯化；多个用、分隔"
              />
              <Field
                label="别名"
                value={selected.aliases.join('、')}
                onChange={(value) =>
                  updateSpecies(selected.id, {
                    aliases: value
                      .split(/[、,，\n]/)
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="多个别名用、分隔"
              />
              <Field
                label="起源"
                value={selected.origin}
                onChange={(value) => updateSpecies(selected.id, { origin: value })}
                placeholder="自然演化 / 实验 / 神造 / 变异"
              />
              <Field
                label="栖息地"
                value={selected.habitat}
                onChange={(value) => updateSpecies(selected.id, { habitat: value })}
                placeholder="极北冻土 / 深海 / 轨道城"
              />
              <Field
                label="寿命"
                value={selected.lifespan}
                onChange={(value) => updateSpecies(selected.id, { lifespan: value })}
                placeholder="短暂 / 百年 / 近乎不死"
              />
            </div>

            <div className="species-section">
              <strong>外观与生理</strong>
              <Field
                label="外观特征"
                value={selected.appearance}
                onChange={(value) => updateSpecies(selected.id, { appearance: value })}
                placeholder="体型、皮肤、发光、翼、角、气味……"
                multiline
              />
              <Field
                label="生理特征"
                value={selected.physiology}
                onChange={(value) => updateSpecies(selected.id, { physiology: value })}
                placeholder="呼吸、代谢、繁殖、对环境的要求、不能做什么……"
                multiline
              />
              <ListField
                label="能力"
                value={selected.abilities}
                onChange={(value) => updateSpecies(selected.id, { abilities: value })}
                placeholder="每行一个能力"
              />
              <ListField
                label="弱点"
                value={selected.weaknesses}
                onChange={(value) => updateSpecies(selected.id, { weaknesses: value })}
                placeholder="每行一个弱点；必须真的会影响剧情"
              />
            </div>

            <div className="species-section">
              <strong>社会与文化</strong>
              <Field
                label="社会结构"
                value={selected.society}
                onChange={(value) => updateSpecies(selected.id, { society: value })}
                placeholder="群居 / 独居 / 阶级 / 母巢 / 网络"
                multiline
              />
              <Field
                label="语言"
                value={selected.language}
                onChange={(value) => updateSpecies(selected.id, { language: value })}
                placeholder="声音 / 光 / 气味 / 心灵感应"
                multiline
              />
              <Field
                label="文化"
                value={selected.culture}
                onChange={(value) => updateSpecies(selected.id, { culture: value })}
                placeholder="仪式、禁忌、审美、对死亡的态度"
                multiline
              />
              <Field
                label="与其他种族的关系"
                value={selected.relations}
                onChange={(value) => updateSpecies(selected.id, { relations: value })}
                placeholder="敌对 / 共生 / 被奴役 / 互相不理解"
                multiline
              />
              <ListField
                label="亚种 / 变体"
                value={selected.variants}
                onChange={(value) => updateSpecies(selected.id, { variants: value })}
                placeholder="每行一个亚种"
              />
            </div>

            <div className="species-section">
              <strong>写作注意</strong>
              <Field
                label="补充说明"
                value={selected.notes}
                onChange={(value) => updateSpecies(selected.id, { notes: value })}
                placeholder="这个物种在正文里应该如何表现，避免写成什么"
                multiline
              />
            </div>
          </div>
        </Modal>
      ) : null}

      {categoryOpen ? (
        <Modal
          title={editingCategoryId ? '编辑物种分类' : '添加物种分类'}
          subtitle="分类可自定义名称、颜色和独立阶位"
          size="md"
          onClose={() => setCategoryOpen(false)}
          footer={
            <>
              {editingCategoryId ? (
                <button
                  type="button"
                  className="btn btn-danger-ghost"
                  onClick={() => {
                    deleteCategory(editingCategoryId)
                    setCategoryOpen(false)
                  }}
                >
                  <IconTrash size={14} />
                  删除分类
                </button>
              ) : null}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCategoryOpen(false)}>
                取消
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={saveCategory}>
                保存分类
              </button>
            </>
          }
        >
          <div className="record-form-grid">
            <Field
              label="分类名称"
              value={categoryName}
              onChange={setCategoryName}
              placeholder="例如：神兽 / 灵植 / 异族"
            />
            <label className="record-field">
              <span>分类颜色</span>
              <div className="tier-category-color">
                <input
                  type="color"
                  className="tier-color-input"
                  value={categoryColor}
                  aria-label="物种分类颜色"
                  onChange={(event) => setCategoryColor(event.target.value)}
                />
                <span>{categoryColor}</span>
              </div>
            </label>
          </div>
        </Modal>
      ) : null}

      {tierCategory && (tierScheme || tierDefaultScheme) ? (
        <TierSettingsModal
          title={`${tierCategory.name} · 阶位设置`}
          subtitle="物种分类可以拥有自己的阶位命名和颜色；保存后本分类全部物种立即使用新阶位"
          categoryName={tierCategory.name}
          categoryColor={colorOfCategory(tierCategory.id)}
          scheme={tierScheme ?? tierDefaultScheme!}
          defaultScheme={tierDefaultScheme}
          copyTargets={categories
            .filter((category) => category.id !== tierCategory.id)
            .map((category) => ({ id: category.id, name: category.name }))}
          onCopy={copyTierToCategory}
          onSave={saveTierSettings}
          onClose={() => setTierCategoryId(null)}
        />
      ) : null}

      {ideaOpen ? (
        <EntityIdeaModal
          kind="species"
          work={work}
          detail={detail}
          api={api}
          apiReady={apiReady}
          baseHint={[
            finalCategory ? `物种分类：${finalCategory.name}` : '',
            finalScheme
              ? `本分类阶位：${finalScheme.levels.map((level) => level.name).join('、')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n')}
          onRecordUsage={onRecordUsage}
          onGenerate={generate}
          onToast={onToast}
          onClose={() => setIdeaOpen(false)}
        />
      ) : null}
    </div>
  )
}
