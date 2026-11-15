import type {
  AiUsageEntry,
  ApiConfig,
  CharacterCard,
  EntityInventoryEntry,
  FactionCard,
  ItemCard,
  ItemCategory,
  Work,
  WorkDetail,
} from './types'
import { type ChatMessage, type ChatUsage } from './ai'
import { estimateTokens } from './utils'
import { inferItemCategoryId } from './inventory'
import { runApiTask } from './aiTask'

export interface LinkedItemOwner {
  type: 'character' | 'faction' | 'facility'
  id: string
  name: string
  itemNames: string[]
}

export interface LinkedItemResult {
  items: ItemCard[]
  categories: ItemCategory[]
  characters: CharacterCard[]
  factions: FactionCard[]
  facilityResources: Record<string, EntityInventoryEntry[]>
}

function objectFromText(text: string): Record<string, unknown> | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = cleaned.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  let end = -1
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  if (end <= start) return null
  const raw = cleaned.slice(start, end + 1)
  for (const attempt of [raw, raw.replace(/,\s*([}\]])/g, '$1')]) {
    try {
      const value = JSON.parse(attempt)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>
      }
    } catch {
      // 尝试修复尾逗号。
    }
  }
  return null
}

export function buildLinkedItemsMessages(input: {
  work: Work
  detail: WorkDetail
  owners: LinkedItemOwner[]
}): ChatMessage[] {
  const existingNames = new Set((input.detail.items ?? []).map((item) => item.name))
  const categoryNames = (input.detail.itemCategories ?? []).map((item) => item.name)
  const owners = input.owners
    .map((owner) => ({
      ...owner,
      itemNames: owner.itemNames.filter((name) => name.trim() && !existingNames.has(name.trim())),
    }))
    .filter((owner) => owner.itemNames.length > 0)
  return [
    {
      role: 'system',
      content: [
        '你是小说物品设定助手。根据角色已经拥有的物品名，补全可入库的物品条目。',
        '只输出一个合法 JSON 对象，不要 Markdown、不要解释。',
        '格式：{"items":[{"name":"","owner":"","ownerType":"character|faction|facility","category":"","grade":1,"description":"","notes":"","quantity":1}]}',
        'name 必须使用给定物品名（可以去掉「一把」「那柄」等量词），不要改名。',
        'category 必须从已有分类中选择；只有已有分类都不合适时才写一个简短的新分类名。',
        'grade 是 1-10 的数字；description 写外观、能力、来路或限制，notes 写当前状态或使用代价。',
        'owner 使用给定角色 / 势力名；quantity 是正整数。每个物品只输出一次。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】《${input.work.title}》｜${input.work.genres.join('、') || '未定题材'}`,
        `【已有物品分类】${categoryNames.join('、') || '暂无，可返回武器 / 防具 / 丹药 / 材料 / 功法 / 法宝 / 消耗品 / 资源 / 其他'}`,
        `【已有物品】${[...existingNames].slice(0, 60).join('、') || '暂无'}`,
        '【需要补全】',
        ...owners.map(
          (owner) =>
            `- ${owner.type === 'faction' ? '势力仓库' : owner.type === 'facility' ? '设施资源仓库' : '角色背包'}｜${owner.name}｜${owner.itemNames.join('、')}`,
        ),
        '请逐件补全 JSON。',
      ].join('\n'),
    },
  ]
}

export function parseLinkedItems(text: string): Record<string, unknown>[] {
  const value = objectFromText(text)
  const rawItems = value && Array.isArray(value.items) ? value.items : []
  return rawItems
    .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => item !== null)
    .slice(0, 40)
}

function stringValue(value: unknown, limit = 400): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

export async function requestLinkedItems(input: {
  work: Work
  detail: WorkDetail
  owners: LinkedItemOwner[]
  api: ApiConfig
  onRecordUsage?: (entry: AiUsageEntry) => void
}): Promise<LinkedItemResult | null> {
  const owners = input.owners
    .map((owner) => ({ ...owner, itemNames: [...new Set(owner.itemNames.map((name) => name.trim()).filter(Boolean))] }))
    .filter((owner) => owner.itemNames.length > 0)
  if (owners.length === 0) return null
  const messages = buildLinkedItemsMessages({ work: input.work, detail: input.detail, owners })
  let actualUsage: ChatUsage | undefined
  let raw = await runApiTask(input.api, { task: 'entity.generate', messages,
    temperature: 0.55,
    maxTokens: 4500,
    onUsage: (usage) => {
      actualUsage = usage
    },
  })
  let rows = parseLinkedItems(raw)
  if (rows.length === 0) {
    raw = await runApiTask(input.api, {
      task: 'entity.generate',
      messages: [...messages, { role: 'user', content: '上次输出无法解析。请只输出完整 JSON，物品数量减少到不超过 6 件，每件 description 用一句话。' }],
      temperature: 0.3,
      maxTokens: 5000,
      onUsage: (usage) => {
        actualUsage = usage
      },
    })
    rows = parseLinkedItems(raw)
  }
  if (rows.length === 0) return null

  const categories = [...(input.detail.itemCategories ?? [])]
  const addCategory = (name: string): ItemCategory => {
    const cleaned = name.trim() || '其他'
    const existing = categories.find((category) => category.name === cleaned)
    if (existing) return existing
    const created: ItemCategory = {
      id: `item-cat-link-${Date.now().toString(36)}-${categories.length}`,
      name: cleaned,
      order: categories.length,
    }
    categories.push(created)
    return created
  }
  if (categories.length === 0) {
    for (const name of ['武器', '防具', '丹药', '材料', '功法', '法宝', '消耗品', '资源', '其他']) {
      addCategory(name)
    }
  }
  const existingItemByName = new Map((input.detail.items ?? []).map((item) => [item.name, item]))
  const items = [...(input.detail.items ?? [])]
  const ownerInventory = new Map<string, EntityInventoryEntry[]>()
  const ownerByKey = new Map(owners.map((owner) => [`${owner.type}:${owner.id}`, owner]))

  for (const row of rows) {
    const name = stringValue(row.name, 80)
    if (!name) continue
    const categoryName = stringValue(row.category, 40)
    const existingItem = existingItemByName.get(name)
    const category =
      (categoryName
        ? categories.find(
            (item) => item.name === categoryName || item.name.includes(categoryName),
          )
        : undefined) ??
      categories.find((item) => item.id === inferItemCategoryId(name, stringValue(row.description), categories, categoryName))
    const resolvedCategory = category ?? addCategory(categoryName || '其他')
    const gradeRaw = typeof row.grade === 'number' ? row.grade : Number(row.grade)
    const grade = Number.isFinite(gradeRaw) ? Math.min(10, Math.max(1, Math.round(gradeRaw))) : 1
    const item: ItemCard = existingItem ?? {
      id: `item-link-${Date.now().toString(36)}-${items.length}`,
      name,
      categoryId: resolvedCategory.id,
      grade,
      lifecycle: '未上线',
      description: stringValue(row.description, 600),
      notes: stringValue(row.notes, 300),
    }
    if (!existingItem) {
      items.push(item)
      existingItemByName.set(name, item)
    } else if (!existingItem.categoryId) {
      existingItem.categoryId = resolvedCategory.id
    }

    const ownerType =
      row.ownerType === 'faction'
        ? 'faction'
        : row.ownerType === 'facility'
          ? 'facility'
          : 'character'
    const ownerName = stringValue(row.owner, 80)
    const fallbackOwner = owners.find((owner) => owner.type === ownerType) ?? owners[0]
    const owner =
      [...ownerByKey.values()].find(
        (candidate) => candidate.type === ownerType && candidate.name === ownerName,
      ) ?? fallbackOwner
    const key = `${owner.type}:${owner.id}`
    const quantityRaw = typeof row.quantity === 'number' ? row.quantity : Number(row.quantity)
    const quantity = Number.isFinite(quantityRaw) ? Math.max(1, Math.round(quantityRaw)) : 1
    const inventory = ownerInventory.get(key) ?? []
    const current = inventory.find((entry) => entry.itemId === item.id)
    if (current) current.quantity += quantity
    else inventory.push({ itemId: item.id, quantity })
    ownerInventory.set(key, inventory)
  }

  const characters = (input.detail.characters ?? []).map((character) => {
    const inventory = ownerInventory.get(`character:${character.id}`)
    return inventory ? { ...character, inventory } : character
  })
  const factions = (input.detail.factions ?? []).map((faction) => {
    const inventory = ownerInventory.get(`faction:${faction.id}`)
    return inventory ? { ...faction, warehouse: inventory } : faction
  })
  const facilityResources: Record<string, EntityInventoryEntry[]> = {}
  for (const [key, inventory] of ownerInventory) {
    if (key.startsWith('facility:')) {
      facilityResources[key.slice('facility:'.length)] = inventory
    }
  }
  input.onRecordUsage?.({
    id: `linked-items-${Date.now().toString(36)}`,
    at: Date.now(),
    kind: '实体生成',
    model: input.api.model,
    inputTokens:
      actualUsage?.inputTokens ?? estimateTokens(messages.map((message) => message.content).join('\n')),
    outputTokens: actualUsage?.outputTokens ?? estimateTokens(raw),
    actual: Boolean(actualUsage),
  })
  return { items, categories, characters, factions, facilityResources }
}
