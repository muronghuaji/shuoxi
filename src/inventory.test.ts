import { describe, expect, it } from 'vitest'
import type { ItemCard, ItemCategory } from './types'
import {
  categoryPath,
  groupInventory,
  inferItemCategoryId,
  inventoryQuantity,
  normalizeInventory,
  removeInventory,
  upsertInventory,
} from './inventory'

const categories: ItemCategory[] = [
  { id: 'cat-weapon', name: '武器', order: 0 },
  { id: 'cat-pill', name: '丹药', order: 1 },
  { id: 'cat-material', name: '材料', order: 2 },
]

const items: ItemCard[] = [
  { id: 'i1', name: '照雪剑', categoryId: 'cat-weapon', grade: 3, description: '', lifecycle: '未上线' },
  { id: 'i2', name: '回春丹', categoryId: 'cat-pill', grade: 2, description: '', lifecycle: '未上线' },
]

describe('entity inventory', () => {
  it('normalizes quantities and merges duplicates', () => {
    const inventory = normalizeInventory([
      { itemId: 'i1', quantity: 2 },
      { itemId: 'i1', quantity: 3 },
      { itemId: 'i2', quantity: 0 },
    ])
    expect(inventory).toHaveLength(2)
    expect(inventoryQuantity(inventory)).toBe(6)
  })

  it('upserts and removes entries', () => {
    const added = upsertInventory([], 'i1', 2)
    expect(added).toEqual([{ itemId: 'i1', quantity: 2 }])
    expect(upsertInventory(added, 'i1', 5)[0].quantity).toBe(5)
    expect(removeInventory(added, 'i1')).toEqual([])
  })

  it('groups by category path', () => {
    const groups = groupInventory(
      normalizeInventory([{ itemId: 'i1', quantity: 1 }, { itemId: 'i2', quantity: 1 }]),
      items,
      categories,
    )
    expect(groups.map((group) => group.path)).toEqual(['丹药', '武器'])
    expect(categoryPath(categories, 'cat-weapon')).toBe('武器')
  })

  it('infers sensible categories', () => {
    expect(inferItemCategoryId('照雪剑', '一柄剑', categories)).toBe('cat-weapon')
    expect(inferItemCategoryId('回春丹', '治疗丹药', categories)).toBe('cat-pill')
    expect(inferItemCategoryId('寒铁矿石', '锻造材料', categories)).toBe('cat-material')
  })
})
