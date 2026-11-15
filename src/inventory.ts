import type {
  EntityInventoryEntry,
  ItemCard,
  ItemCategory,
} from './types'

export interface InventoryGroup {
  categoryId: string
  categoryName: string
  path: string
  entries: EntityInventoryEntry[]
  quantity: number
}

export function normalizeInventory(value: unknown): EntityInventoryEntry[] {
  if (!Array.isArray(value)) return []
  const seen = new Map<string, EntityInventoryEntry>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    const itemId = typeof raw.itemId === 'string' ? raw.itemId.trim() : ''
    if (!itemId) continue
    const quantity =
      typeof raw.quantity === 'number' && Number.isFinite(raw.quantity)
        ? Math.max(1, Math.round(raw.quantity))
        : 1
    const existing = seen.get(itemId)
    if (existing) existing.quantity += quantity
    else {
      seen.set(itemId, {
        itemId,
        quantity,
        note: typeof raw.note === 'string' ? raw.note.trim() : undefined,
      })
    }
  }
  return [...seen.values()]
}

export function inventoryQuantity(inventory: EntityInventoryEntry[] | undefined): number {
  return normalizeInventory(inventory).reduce((sum, entry) => sum + entry.quantity, 0)
}

export function upsertInventory(
  inventory: EntityInventoryEntry[] | undefined,
  itemId: string,
  quantity = 1,
): EntityInventoryEntry[] {
  const next = normalizeInventory(inventory)
  const existing = next.find((entry) => entry.itemId === itemId)
  if (existing) return next.map((entry) => (entry === existing ? { ...entry, quantity } : entry))
  return [...next, { itemId, quantity: Math.max(1, quantity) }]
}

export function removeInventory(
  inventory: EntityInventoryEntry[] | undefined,
  itemId: string,
): EntityInventoryEntry[] {
  return normalizeInventory(inventory).filter((entry) => entry.itemId !== itemId)
}

export function categoryPath(categories: ItemCategory[], categoryId: string): string {
  const category = categories.find((item) => item.id === categoryId)
  if (!category) return '未分类'
  const names = [category.name]
  let parentId = category.parentId
  const guard = new Set<string>()
  while (parentId && !guard.has(parentId)) {
    guard.add(parentId)
    const parent = categories.find((item) => item.id === parentId)
    if (!parent) break
    names.unshift(parent.name)
    parentId = parent.parentId
  }
  return names.join(' / ')
}

export function groupInventory(
  inventory: EntityInventoryEntry[] | undefined,
  items: ItemCard[],
  categories: ItemCategory[],
): InventoryGroup[] {
  const itemById = new Map(items.map((item) => [item.id, item]))
  const groups = new Map<string, InventoryGroup>()
  for (const entry of normalizeInventory(inventory)) {
    const item = itemById.get(entry.itemId)
    const categoryId = item?.categoryId ?? ''
    const categoryName =
      categories.find((category) => category.id === categoryId)?.name ?? '已失效物品'
    const path = categoryId ? categoryPath(categories, categoryId) : categoryName
    const group = groups.get(categoryId) ?? {
      categoryId,
      categoryName,
      path,
      entries: [],
      quantity: 0,
    }
    group.entries.push(entry)
    group.quantity += entry.quantity
    groups.set(categoryId, group)
  }
  return [...groups.values()].sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
}

const CATEGORY_KEYWORDS: { pattern: RegExp; names: string[] }[] = [
  {
    pattern: /剑|刀|枪|弓|戟|斧|鞭|匕首|暗器|武器|兵器/,
    names: ['武器', '兵器', '装备'],
  },
  {
    pattern: /丹|药丸|药散|灵药|解药|毒药|丹药/,
    names: ['丹药', '消耗品', '药品'],
  },
  {
    pattern: /功法|秘籍|心法|剑诀|法典|术法|神通/,
    names: ['功法', '秘籍', '术法'],
  },
  {
    pattern: /材料|矿石|灵草|草药|兽皮|晶核|木材/,
    names: ['材料', '资源'],
  },
  {
    pattern: /袍|甲|护腕|靴|面具|护符|防具/,
    names: ['装备', '防具'],
  },
  {
    pattern: /符|卷轴|令牌|玉简|法器|法宝|灵宝/,
    names: ['法宝', '法器', '消耗品'],
  },
  { pattern: /信物|玉佩|簪|戒指|礼物/, names: ['信物', '礼物'] },
  { pattern: /线索|证据|密信|日记|档案/, names: ['线索物', '物证'] },
  { pattern: /芯片|机甲|飞船|终端|数据|枪械/, names: ['科技', '装备'] },
  { pattern: /金币|银两|灵石|货币|资产|股票/, names: ['资产', '资源'] },
]

export function inferItemCategoryId(
  itemName: string,
  description: string,
  categories: ItemCategory[],
  preferredName?: string,
): string | undefined {
  const text = `${itemName} ${description} ${preferredName ?? ''}`
  for (const rule of CATEGORY_KEYWORDS) {
    if (!rule.pattern.test(text)) continue
    for (const name of rule.names) {
      const matched = categories.find((category) => category.name.includes(name))
      if (matched) return matched.id
    }
  }
  if (preferredName) {
    const exact = categories.find((category) => category.name === preferredName)
    if (exact) return exact.id
  }
  return categories[0]?.id
}
