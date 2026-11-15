import { useEffect, useRef, useState } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  ItemCard,
  ItemCategory,
  ItemPrice,
  Work,
  WorkDetail,
  WorldTemplate,
  TierScheme,
} from '../types'
import { requestEntityGenerate } from '../entityFill'
import {
  currencyTier,
  formatItemPrice,
  normalizeCurrency,
} from '../currency'
import { CurrencySettingsModal } from './CurrencySettingsModal'
import { IconPlus, IconSparkles } from './Icons'
import { Modal } from './Modal'
import { EntityIdeaModal } from './EntityIdeaModal'
import { TierSettingsModal } from './TierSettingsModal'
import { LifecycleBadge, LifecycleTags } from './LifecycleTags'
import { useContextMenu, type ContextMenuEntry } from './ContextMenuProvider'
import { ConfirmModal } from './ConfirmModal'
import { BatchActionBar } from './BatchActionBar'
import { useBatchSelection } from '../hooks/useBatchSelection'
import { batchExportEntities } from '../batchExport'
import { copyTextToClipboard } from '../clipboard'
import {
  defaultItemTierScheme,
  ensureItemTierData,
  itemCategoryColor,
  cloneTierScheme,
  schemeById,
} from '../tiers'
import type { CSSProperties } from 'react'

interface ItemsPanelProps {
  work: Work
  detail: WorkDetail
  worldTemplate: WorldTemplate
  api: ApiConfig
  apiReady: boolean
  onRecordUsage?: (entry: AiUsageEntry) => void
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onToast: (message: string) => void
  focusRequest?: { id: string; requestId: number } | null
}

const DEFAULT_GRADE_NAMES = ['一阶', '二阶', '三阶', '四阶', '五阶', '六阶', '七阶', '八阶', '九阶', '十阶']

const TEMPLATE_CATEGORY_NAMES: Record<string, string[]> = {
  xianxia: ['功法', '武器', '法宝', '丹药', '材料'],
  scifi: ['科技', '装备', '消耗品', '材料'],
  urban: ['资产', '项目', '资源'],
  mystery: ['物证', '装备', '线索物'],
  historical: ['兵器', '辎重', '粮饷'],
  romance: ['信物', '礼物'],
  generic: ['物品'],
  custom: ['物品'],
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function defaultCategories(templateId: string): ItemCategory[] {
  const names = TEMPLATE_CATEGORY_NAMES[templateId] ?? ['物品']
  return names.map((name, index) => ({
    id: uid('item-cat'),
    name,
    order: index,
  }))
}

export function ItemsPanel({
  work,
  detail,
  worldTemplate,
  api,
  apiReady,
  onRecordUsage,
  onUpdateDetail,
  onToast,
  focusRequest,
}: ItemsPanelProps) {
  const initializedRef = useRef(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [viewingItemId, setViewingItemId] = useState<string | null>(null)
  const [filling, setFilling] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryColor, setCategoryColor] = useState<string>('#8b9bb4')
  const [itemOpen, setItemOpen] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [itemName, setItemName] = useState('')
  const [itemCategoryId, setItemCategoryId] = useState('')
  const [itemGrade, setItemGrade] = useState(1)
  const [itemDescription, setItemDescription] = useState('')
  const [itemNotes, setItemNotes] = useState('')
  const [itemPriceTierId, setItemPriceTierId] = useState('')
  const [itemPriceAmount, setItemPriceAmount] = useState('')
  const [itemPriceNote, setItemPriceNote] = useState('')
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [tierCategoryId, setTierCategoryId] = useState<string | null>(null)
  const [ideaOpen, setIdeaOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ItemCard | null>(null)
  const { openContextMenu } = useContextMenu()

  useEffect(() => {
    if (!focusRequest?.id) return
    if (!(detail.items ?? []).some((item) => item.id === focusRequest.id)) return
    setViewingItemId(focusRequest.id)
  }, [focusRequest, detail.items])

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    const patch: Partial<WorkDetail> = {}
    if (!detail.itemGradeNames?.length) patch.itemGradeNames = [...DEFAULT_GRADE_NAMES]
    if (!detail.itemCategories) {
      patch.itemCategories = defaultCategories(worldTemplate.id)
    }
    if (!detail.items) patch.items = []
    if (Object.keys(patch).length > 0) onUpdateDetail(patch)
  }, [detail, onUpdateDetail, worldTemplate.id])

  useEffect(() => {
    const patch = ensureItemTierData(detail)
    if (patch) onUpdateDetail(patch)
  }, [detail, onUpdateDetail])

  const categories = [...(detail.itemCategories ?? [])].sort((a, b) => a.order - b.order)
  const items = detail.items ?? []
  const selection = useBatchSelection({
    allIds: items.map((item) => item.id),
    onDelete: (ids) => {
      const idsSet = new Set(ids)
      onUpdateDetail({ items: items.filter((item) => !idsSet.has(item.id)) })
      if (viewingItemId && idsSet.has(viewingItemId)) setViewingItemId(null)
      onToast(`已删除 ${ids.length} 件物品`)
    },
    onExport: (ids, format) => {
      const entityIds = new Set(ids)
      batchExportEntities(
        'item',
        work.title,
        items.filter((item) => entityIds.has(item.id)) as unknown as Record<string, unknown>[],
        format,
      )
      onToast(`已导出 ${ids.length} 件物品`)
    },
  })
  const currency = normalizeCurrency(detail.currency)
  const globalGradeNames = detail.itemGradeNames?.length === 10 ? detail.itemGradeNames : DEFAULT_GRADE_NAMES
  const schemeForCategory = (categoryId: string | undefined) => {
    const category = categories.find((item) => item.id === categoryId)
    return schemeById(detail.tierSchemes, category?.tierSchemeId)
  }
  const gradeName = (categoryId: string | undefined, grade: number) => {
    const scheme = schemeForCategory(categoryId)
    return scheme?.levels[grade - 1]?.name ?? globalGradeNames[grade - 1] ?? `${grade} 级`
  }
  const gradeColor = (categoryId: string | undefined, grade: number) => {
    const scheme = schemeForCategory(categoryId)
    return scheme?.levels[grade - 1]?.color ?? itemCategoryColor(grade - 1)
  }
  const colorOfCategory = (category: ItemCategory | undefined) =>
    category?.color ?? itemCategoryColor(categories.findIndex((item) => item.id === category?.id))
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null
  const visibleItems = selectedCategoryId
    ? items.filter((item) => item.categoryId === selectedCategoryId)
    : items
  const viewingItem = items.find((item) => item.id === viewingItemId) ?? null
  const categoryNameOf = (id: string) =>
    categories.find((category) => category.id === id)?.name ?? '未分类'
  const tierCategory = categories.find((category) => category.id === tierCategoryId) ?? null
  const tierScheme =
    tierCategory?.tierSchemeId
      ? schemeById(detail.tierSchemes, tierCategory.tierSchemeId)
      : undefined
  const tierDefaultScheme = tierCategory
    ? defaultItemTierScheme(tierCategory.name, detail.itemGradeNames)
    : undefined

  const openAddCategory = () => {
    setEditingCategoryId(null)
    setCategoryName('')
    setCategoryColor(itemCategoryColor(categories.length))
    setCategoryOpen(true)
  }

  const openEditCategory = (category: ItemCategory) => {
    setEditingCategoryId(category.id)
    setCategoryName(category.name)
    setCategoryColor(colorOfCategory(category))
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
        itemCategories: (detail.itemCategories ?? []).map((category) =>
          category.id === editingCategoryId ? { ...category, name, color: categoryColor } : category,
        ),
      })
      onToast('分类已更新')
    } else {
      const next: ItemCategory = {
        id: uid('item-cat'),
        name,
        order: categories.length,
        color: categoryColor,
      }
      onUpdateDetail({ itemCategories: [...(detail.itemCategories ?? []), next] })
      setSelectedCategoryId(next.id)
      onToast(`已添加分类：${name}`)
    }
    setCategoryOpen(false)
  }

  const removeCategory = (category: ItemCategory) => {
    const count = items.filter((item) => item.categoryId === category.id).length
    if (count > 0) {
      onToast('这个分类里还有物品，先移动或删除物品')
      return
    }
    onUpdateDetail({
      itemCategories: (detail.itemCategories ?? []).filter((item) => item.id !== category.id),
    })
    if (selectedCategoryId === category.id) setSelectedCategoryId(null)
    onToast(`已删除分类：${category.name}`)
  }

  const openAddItem = () => {
    if (categories.length === 0) {
      onToast('先添加一个物品分类')
      return
    }
    setEditingItemId(null)
    setItemName('')
    setItemCategoryId(selectedCategoryId ?? categories[0].id)
    setItemGrade(1)
    setItemDescription('')
    setItemNotes('')
    setItemPriceTierId(currency.tiers[0]?.id ?? '')
    setItemPriceAmount('')
    setItemPriceNote('')
    setItemOpen(true)
  }

  const openEditItem = (item: ItemCard) => {
    setEditingItemId(item.id)
    setItemName(item.name)
    setItemCategoryId(item.categoryId)
    setItemGrade(item.grade)
    setItemDescription(item.description)
    setItemNotes(item.notes ?? '')
    setItemPriceTierId(item.price?.tierId ?? currency.tiers[0]?.id ?? '')
    setItemPriceAmount(item.price?.amount ? String(item.price.amount) : '')
    setItemPriceNote(item.price?.note ?? '')
    setViewingItemId(null)
    setItemOpen(true)
  }

  const saveItem = () => {
    const name = itemName.trim()
    if (!name) {
      onToast('先填写物品名称')
      return
    }
    if (!itemCategoryId) {
      onToast('先选择分类')
      return
    }
    const amount = Math.max(0, Math.floor(Number(itemPriceAmount) || 0))
    const price: ItemPrice | undefined =
      amount > 0 && currencyTier(currency, itemPriceTierId)
        ? {
            tierId: itemPriceTierId,
            amount,
            note: itemPriceNote.trim() || undefined,
          }
        : undefined
    if (editingItemId) {
      onUpdateDetail({
        items: items.map((item) =>
          item.id === editingItemId
            ? {
                ...item,
                name,
                categoryId: itemCategoryId,
                grade: itemGrade,
                description: itemDescription.trim(),
                notes: itemNotes.trim(),
                price,
              }
            : item,
        ),
      })
      onToast('物品已更新')
    } else {
      onUpdateDetail({
        items: [
          ...items,
          {
            id: uid('item'),
            name,
            categoryId: itemCategoryId,
            grade: itemGrade,
            description: itemDescription.trim(),
            notes: itemNotes.trim(),
            price,
          },
        ],
      })
      onToast(`已添加物品：${name}`)
    }
    setItemOpen(false)
  }

  const removeItem = (item: ItemCard) => {
    onUpdateDetail({ items: items.filter((current) => current.id !== item.id) })
    setViewingItemId(null)
    onToast(`已删除物品：${item.name}`)
  }

  const openTierSettings = () => {
    const categoryId = selectedCategoryId ?? categories[0]?.id
    if (!categoryId) {
      onToast('先添加一个物品分类')
      return
    }
    setTierCategoryId(categoryId)
  }

  const saveTierSettings = (scheme: TierScheme, color: string) => {
    if (!tierCategory) return
    onUpdateDetail({
      tierSchemes: [
        ...(detail.tierSchemes ?? []).filter((item) => item.id !== scheme.id),
        scheme,
      ],
      itemCategories: (detail.itemCategories ?? []).map((category) =>
        category.id === tierCategory.id
          ? { ...category, tierSchemeId: scheme.id, color }
          : category,
      ),
    })
    setTierCategoryId(null)
    onToast(`已保存「${tierCategory.name}」品阶`)
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
      itemCategories: (detail.itemCategories ?? []).map((category) =>
        category.id === targetId ? { ...category, tierSchemeId: cloned.id, color } : category,
      ),
    })
    onToast(`已将品阶方案复制到「${target.name}」`)
  }

  const generateItem = async (hint?: string): Promise<boolean> => {
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return false
    }
    const categoryId = selectedCategoryId ?? categories[0]?.id
    if (!categoryId) {
      onToast('先添加一个物品分类')
      return false
    }
    setFilling(true)
    try {
      const categoryScheme = schemeForCategory(categoryId)
      const generated = await requestEntityGenerate({
        kind: 'item',
        work,
        detail,
        hint: [
          `物品分类：${categoryNameOf(categoryId)}`,
          categoryScheme
            ? `本分类品阶（grade 使用对应序号）：${categoryScheme.levels.map((level, index) => `${index + 1}=${level.name}`).join('、')}`
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
          : '新物品'
      const existingNames = items.map((item) => item.name)
      let name = baseName
      let suffix = 2
      while (existingNames.includes(name)) {
        name = `${baseName} ${suffix}`
        suffix += 1
      }
      const maxGrade = schemeForCategory(categoryId)?.levels.length ?? 10
      const grade =
        typeof generated.grade === 'number' && generated.grade >= 1 && generated.grade <= maxGrade
          ? Math.floor(generated.grade)
          : 1
      const item: ItemCard = {
        id: uid('item'),
        name,
        categoryId,
        grade,
        description:
          typeof generated.description === 'string' ? generated.description.trim() : '',
        notes: typeof generated.notes === 'string' ? generated.notes.trim() : '',
      }
      onUpdateDetail({ items: [...items, item] })
      setViewingItemId(item.id)
      onToast(`AI 已生成物品：${name}`)
      return true
    } catch (caught) {
      onToast(`物品生成失败：${caught instanceof Error ? caught.message : '请稍后重试'}`)
      return false
    } finally {
      setFilling(false)
    }
  }

  const itemContextMenu = (item: ItemCard): ContextMenuEntry[] => [
    {
      type: 'label',
      label: `${item.name || '未命名物品'} · ${categoryNameOf(item.categoryId)} · ${gradeName(item.categoryId, item.grade)}`,
    },
    ...(selection.selectMode
      ? [
          {
            type: 'label' as const,
            label: `已选 ${selection.selected.size} 件物品`,
          },
          {
            label: '导出选中物品（JSON）',
            disabled: selection.selected.size === 0,
            onSelect: () => selection.exportSelected('json'),
          },
          {
            label: '导出选中物品（Markdown）',
            disabled: selection.selected.size === 0,
            onSelect: () => selection.exportSelected('markdown'),
          },
          {
            label: '删除选中物品…',
            danger: true,
            disabled: selection.selected.size === 0,
            onSelect: () => selection.setConfirmDeleteOpen(true),
          },
          { label: '退出多选', onSelect: selection.exit },
          { type: 'separator' as const },
        ]
      : [
          {
            label: '多选此物品',
            onSelect: () => {
              selection.enter()
              selection.toggle(item.id)
            },
          },
          { label: '全选物品', onSelect: selection.selectAll },
          { type: 'separator' as const },
        ]),
    { label: '打开物品详情', onSelect: () => setViewingItemId(item.id) },
    { label: '编辑物品', onSelect: () => openEditItem(item) },
    {
      label: '复制名称',
      onSelect: () => {
        void copyTextToClipboard(item.name).then((ok) =>
          onToast(ok ? '已复制物品名称' : '复制失败'),
        )
      },
    },
    {
      label: '复制介绍',
      disabled: !item.description.trim(),
      onSelect: () => {
        void copyTextToClipboard(item.description).then((ok) =>
          onToast(ok ? '已复制物品介绍' : '复制失败'),
        )
      },
    },
    { type: 'separator' },
    {
      label: 'AI 按想法生成同类物品…',
      disabled: !apiReady || filling,
      hint: !apiReady ? '请先配置 AI' : filling ? '正在生成' : undefined,
      onSelect: () => {
        setSelectedCategoryId(item.categoryId)
        setIdeaOpen(true)
      },
    },
    {
      label: '编辑本分类品阶…',
      onSelect: () => setTierCategoryId(item.categoryId),
    },
    { type: 'separator' },
    {
      label: '删除物品…',
      danger: true,
      onSelect: () => {
        setDeleteTarget(item)
      },
    },
  ]

  const categoryContextMenu = (category: ItemCategory): ContextMenuEntry[] => {
    const count = items.filter((item) => item.categoryId === category.id).length
    return [
      { type: 'label', label: `${category.name} · ${count} 件` },
      { label: '只看这个分类', onSelect: () => setSelectedCategoryId(category.id) },
      { label: '编辑分类…', onSelect: () => openEditCategory(category) },
      { label: '分类品阶设置…', onSelect: () => setTierCategoryId(category.id) },
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
        disabled: count > 0,
        hint: count > 0 ? '先移动或删除该分类下的物品' : undefined,
        onSelect: () => {
          if (window.confirm(`删除分类「${category.name}」？`)) removeCategory(category)
        },
      },
    ]
  }

  return (
    <>
      <div className="drawer-section-head">
        <span>物品管理</span>
        <div className="item-manager-actions">
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${selection.selectMode ? 'active' : ''}`}
            onClick={selection.toggleMode}
            disabled={items.length === 0}
            title="多选物品，批量导出或删除（Ctrl+A 全选 / Delete 删除 / Ctrl+E 导出 / Esc 退出）"
          >
            {selection.selectMode
              ? `退出多选${selection.selected.size > 0 ? ` · ${selection.selected.size}` : ''}`
              : '多选'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setCurrencyOpen(true)}
            title="设置货币等级和名称，并给物品定价"
          >
            货币
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={openTierSettings}>
            分类品阶
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setIdeaOpen(true)}
            disabled={!apiReady || filling}
            title={apiReady ? '输入你的想法，AI 分析后按想法生成物品' : '请先配置 AI'}
          >
            <IconSparkles size={14} />
            {filling ? '生成中…' : '一键生成'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={openAddItem}>
            <IconPlus size={14} />
            添加物品
          </button>
        </div>
      </div>

      <div className="item-category-tabs">
        <button
          type="button"
          className={`item-category-tab ${selectedCategoryId === null ? 'active' : ''}`}
          onClick={() => setSelectedCategoryId(null)}
        >
          <span>全部</span>
          <small>{items.length}</small>
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`item-category-tab ${selectedCategoryId === category.id ? 'active' : ''}`}
            onClick={() => setSelectedCategoryId(category.id)}
            onContextMenu={(event) => openContextMenu(event, categoryContextMenu(category))}
          >
            <span>
              <i
                className="item-category-dot"
                style={{ background: colorOfCategory(category) }}
                aria-hidden="true"
              />
              {category.name}
            </span>
            <small>{items.filter((item) => item.categoryId === category.id).length}</small>
          </button>
        ))}
        <button type="button" className="item-category-add" onClick={openAddCategory}>
          <IconPlus size={13} />
          分类
        </button>
      </div>

      <div className="library-list-head">
        <div>
          <strong>{selectedCategory ? selectedCategory.name : '全部物品'}</strong>
          <small>{visibleItems.length} 件</small>
        </div>
        <div className="library-list-head-actions">
          {selectedCategory ? (
            <>
              <button type="button" onClick={() => openEditCategory(selectedCategory)}>
                编辑分类
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => removeCategory(selectedCategory)}
              >
                删除分类
              </button>
            </>
          ) : null}
          <span>点击物品查看详情</span>
        </div>
      </div>

      {visibleItems.length === 0 ? (
        <p className="drawer-empty">
          {selectedCategory
            ? `「${selectedCategory.name}」还没有物品。点「添加物品」开始添加。`
            : '还没有物品。先在顶部选择一个分类，再点「添加物品」。'}
        </p>
      ) : (
        <div className="library-card-list">
          {visibleItems.map((item) => (
            <button
              type="button"
              data-entity-kind="item"
              data-entity-id={item.id}
              className={`library-card ${selection.selectMode ? 'selectable' : ''} ${
                selection.selected.has(item.id) ? 'selected' : ''
              }`}
              key={item.id}
              style={
                {
                  '--tone': gradeColor(item.categoryId, item.grade),
                  '--tone-soft': `${gradeColor(item.categoryId, item.grade)}18`,
                } as CSSProperties
              }
              onClick={() => {
                if (selection.selectMode) selection.toggle(item.id)
                else setViewingItemId(item.id)
              }}
              onContextMenu={(event) => openContextMenu(event, itemContextMenu(item))}
            >
              {selection.selectMode ? (
                <span
                  className={`library-card-check ${selection.selected.has(item.id) ? 'active' : ''}`}
                  aria-hidden="true"
                >
                  {selection.selected.has(item.id) ? '✓' : ''}
                </span>
              ) : null}
              <div className="library-card-main">
                <div className="library-card-head">
                  <strong>{item.name}</strong>
                  <span
                    className="library-grade"
                    style={{
                      color: gradeColor(item.categoryId, item.grade),
                      borderColor: gradeColor(item.categoryId, item.grade),
                      background: `${gradeColor(item.categoryId, item.grade)}18`,
                    }}
                  >
                    {gradeName(item.categoryId, item.grade)}
                  </span>
                </div>
                <small>{categoryNameOf(item.categoryId)}</small>
                {item.price ? (
                  <span className="item-price-line">{formatItemPrice(item.price, currency)}</span>
                ) : null}
                {item.description ? <p>{item.description}</p> : null}
              </div>
              <span className="library-card-more">
                <LifecycleBadge value={item.lifecycle} />
                查看详情 →
              </span>
            </button>
          ))}
        </div>
      )}

      {categoryOpen ? (
        <Modal
          title={editingCategoryId ? '编辑分类' : '添加分类'}
          onClose={() => setCategoryOpen(false)}
          size="md"
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setCategoryOpen(false)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={saveCategory}>
                保存分类
              </button>
            </>
          }
        >
          <div className="drawer-form">
            <label className="drawer-row">
              <span>分类名称</span>
              <input
                className="input"
                value={categoryName}
                placeholder="例如：功法 / 武器 / 法宝"
                onChange={(event) => setCategoryName(event.target.value)}
                autoFocus
              />
            </label>
            <p className="drawer-hint">分类会显示在物品页顶部；点分类只显示该分类的物品。</p>
            <label className="drawer-row">
              <span>分类颜色</span>
              <input
                type="color"
                className="tier-color-input"
                value={categoryColor}
                aria-label="物品分类颜色"
                onChange={(event) => setCategoryColor(event.target.value)}
              />
            </label>
          </div>
        </Modal>
      ) : null}

      {currencyOpen ? (
        <CurrencySettingsModal
          currency={detail.currency}
          onChange={(next) => onUpdateDetail({ currency: next })}
          onClose={() => setCurrencyOpen(false)}
        />
      ) : null}

      {itemOpen ? (
        <Modal
          title={editingItemId ? '编辑物品' : '添加物品'}
          onClose={() => setItemOpen(false)}
          size="md"
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setItemOpen(false)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={saveItem}>
                保存物品
              </button>
            </>
          }
        >
          <div className="drawer-form">
            <label className="drawer-row">
              <span>物品名称</span>
              <input
                className="input"
                value={itemName}
                placeholder="例如：照雪剑"
                onChange={(event) => setItemName(event.target.value)}
                autoFocus
              />
            </label>
            <div className="drawer-row">
              <span>分类</span>
              <select
                className="input select"
                value={itemCategoryId}
                onChange={(event) => {
                  const nextCategory = event.target.value
                  setItemCategoryId(nextCategory)
                  const levels = schemeForCategory(nextCategory)?.levels.length ?? 10
                  setItemGrade((current) => Math.min(current, levels))
                }}
              >
                <option value="">选择分类</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="drawer-row">
              <span>品阶</span>
              <select
                className="input select"
                value={itemGrade}
                onChange={(event) => setItemGrade(Number(event.target.value))}
              >
                {(schemeForCategory(itemCategoryId)?.levels ?? globalGradeNames.map((name, index) => ({ id: `g${index}`, name, color: itemCategoryColor(index) }))).map((level, index) => (
                  <option key={level.id} value={index + 1}>
                    {index + 1} · {level.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="drawer-row">
              <span>价格</span>
              <div className="item-price-row">
                <select
                  className="input select"
                  value={itemPriceTierId}
                  onChange={(event) => setItemPriceTierId(event.target.value)}
                >
                  {currency.tiers.map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={itemPriceAmount}
                  placeholder="留空 = 未定价"
                  onChange={(event) => setItemPriceAmount(event.target.value)}
                />
                <input
                  className="input"
                  value={itemPriceNote}
                  placeholder="价格备注（可选）"
                  onChange={(event) => setItemPriceNote(event.target.value)}
                />
              </div>
            </div>
            <label className="drawer-row">
              <span>介绍</span>
              <textarea
                className="input textarea"
                rows={4}
                value={itemDescription}
                placeholder="外观、效果、来历或限制"
                onChange={(event) => setItemDescription(event.target.value)}
              />
            </label>
            <label className="drawer-row">
              <span>备注</span>
              <input
                className="input"
                value={itemNotes}
                placeholder="持有者、代价、未回收的线索"
                onChange={(event) => setItemNotes(event.target.value)}
              />
            </label>
          </div>
        </Modal>
      ) : null}

      {viewingItem ? (
        <Modal
          title="物品详情"
          subtitle={`${categoryNameOf(viewingItem.categoryId)} · ${gradeName(viewingItem.categoryId, viewingItem.grade)}`}
          tone={gradeColor(viewingItem.categoryId, viewingItem.grade)}
          onClose={() => setViewingItemId(null)}
          size="md"
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => removeItem(viewingItem)}
              >
                删除
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => openEditItem(viewingItem)}>
                编辑
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setViewingItemId(null)}>
                关闭
              </button>
            </>
          }
        >
          <div
            className="library-item-detail"
            style={
              {
                '--tone': gradeColor(viewingItem.categoryId, viewingItem.grade),
                '--tone-soft': `${gradeColor(viewingItem.categoryId, viewingItem.grade)}18`,
              } as CSSProperties
            }
          >
            <div className="library-item-hero">
              <div>
                <span>物品</span>
                <h3>{viewingItem.name}</h3>
                <p>
                  {categoryNameOf(viewingItem.categoryId)} · {gradeName(viewingItem.categoryId, viewingItem.grade)}
                </p>
              </div>
              <span
                className="library-grade"
                style={{
                  color: gradeColor(viewingItem.categoryId, viewingItem.grade),
                  borderColor: gradeColor(viewingItem.categoryId, viewingItem.grade),
                  background: `${gradeColor(viewingItem.categoryId, viewingItem.grade)}18`,
                }}
              >
                {gradeName(viewingItem.categoryId, viewingItem.grade)}
              </span>
            </div>

            <div className="entity-lifecycle-row">
              <span>上线状态</span>
              <LifecycleTags
                value={viewingItem.lifecycle}
                compact
                onChange={(lifecycle) =>
                  onUpdateDetail({
                    items: items.map((item) =>
                      item.id === viewingItem.id ? { ...item, lifecycle } : item,
                    ),
                  })
                }
              />
            </div>

            <div className="library-item-facts">
              <div>
                <span>分类</span>
                <strong>{categoryNameOf(viewingItem.categoryId)}</strong>
              </div>
              <div>
                <span>品阶</span>
                <strong>{gradeName(viewingItem.categoryId, viewingItem.grade)}</strong>
              </div>
              <div>
                <span>价格</span>
                <strong>{formatItemPrice(viewingItem.price, currency)}</strong>
              </div>
            </div>

            <section className="library-item-description">
              <span>介绍</span>
              <p>{viewingItem.description || '还没有填写介绍。'}</p>
            </section>

            {viewingItem.notes ? (
              <div className="library-item-detail-notes">
                <span>备注</span>
                <p>{viewingItem.notes}</p>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {tierCategory && (tierScheme || tierDefaultScheme) ? (
        <TierSettingsModal
          title={`${tierCategory.name} · 品阶设置`}
          subtitle="每个物品分类可以单独设置品阶名称和颜色；保存后本分类全部物品立即使用新名称"
          categoryName={tierCategory.name}
          categoryColor={colorOfCategory(tierCategory)}
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
          kind="item"
          work={work}
          detail={detail}
          api={api}
          apiReady={apiReady}
          baseHint={
            selectedCategoryId
              ? `物品分类：${categoryNameOf(selectedCategoryId)}`
              : undefined
          }
          onRecordUsage={onRecordUsage}
          onGenerate={generateItem}
          onToast={onToast}
          onClose={() => setIdeaOpen(false)}
        />
      ) : null}

      {selection.selectMode ? (
        <BatchActionBar
          selectedCount={selection.selected.size}
          totalCount={items.length}
          label="件物品"
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onExport={() => selection.exportSelected('json')}
          onDelete={() => selection.setConfirmDeleteOpen(true)}
          onExit={selection.exit}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="删除物品"
          danger
          confirmLabel="删除物品"
          message={
            <>
              <p>确定删除「{deleteTarget.name || '未命名物品'}」？</p>
              <p>只会从物品档案中移除，不会修改正文或其他分类。</p>
            </>
          }
          onConfirm={() => {
            removeItem(deleteTarget)
            setDeleteTarget(null)
          }}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}

      {selection.confirmDeleteOpen ? (
        <ConfirmModal
          title="批量删除物品"
          danger
          confirmLabel={`删除 ${selection.selected.size} 件物品`}
          message={
            <>
              <p>确定删除选中的 {selection.selected.size} 件物品？</p>
              <p>只会从物品档案中移除，不会修改正文或其他分类。</p>
            </>
          }
          onConfirm={selection.removeSelected}
          onClose={() => selection.setConfirmDeleteOpen(false)}
        />
      ) : null}
    </>
  )
}
