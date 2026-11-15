import { useMemo, useState } from 'react'
import type { EntityInventoryEntry, WorkDetail } from '../types'
import {
  categoryPath,
  groupInventory,
  inventoryQuantity,
  normalizeInventory,
  removeInventory,
  upsertInventory,
} from '../inventory'
import { Modal } from './Modal'
import { IconPlus, IconTrash } from './Icons'

interface InventoryModalProps {
  title: string
  subtitle: string
  inventory: EntityInventoryEntry[] | undefined
  detail: WorkDetail
  onChange: (inventory: EntityInventoryEntry[]) => void
  onToast: (message: string) => void
  onClose: () => void
}

export function InventoryModal({
  title,
  subtitle,
  inventory,
  detail,
  onChange,
  onToast,
  onClose,
}: InventoryModalProps) {
  const items = detail.items ?? []
  const categories = detail.itemCategories ?? []
  const entries = normalizeInventory(inventory)
  const [filter, setFilter] = useState('all')
  const [addItemId, setAddItemId] = useState('')
  const groups = useMemo(
    () => groupInventory(entries, items, categories),
    [categories, entries, items],
  )
  const visibleGroups =
    filter === 'all' ? groups : groups.filter((group) => group.categoryId === filter)
  const entryIds = new Set(entries.map((entry) => entry.itemId))
  const addable = items.filter((item) => !entryIds.has(item.id))
  const totalQuantity = inventoryQuantity(entries)
  const itemById = new Map(items.map((item) => [item.id, item]))
  const gradeName = (grade: number) =>
    detail.itemGradeNames?.[grade - 1] ?? `${grade} 阶`

  const changeQuantity = (itemId: string, delta: number) => {
    const current = entries.find((entry) => entry.itemId === itemId)
    if (!current) return
    const next = current.quantity + delta
    if (next <= 0) {
      onChange(removeInventory(entries, itemId))
      onToast('已从列表移除')
      return
    }
    onChange(upsertInventory(entries, itemId, next))
  }

  const addItem = () => {
    if (!addItemId) {
      onToast('先选择一件物品')
      return
    }
    onChange(upsertInventory(entries, addItemId, 1))
    const item = items.find((current) => current.id === addItemId)
    onToast(`已加入：${item?.name ?? '物品'}`)
    setAddItemId('')
  }

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      size="lg"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          关闭
        </button>
      }
    >
      <div className="inventory-modal">
        <div className="inventory-summary">
          <div>
            <strong>{entries.length}</strong>
            <span>种物品</span>
          </div>
          <div>
            <strong>{totalQuantity}</strong>
            <span>总数量</span>
          </div>
          <div>
            <strong>{groups.length}</strong>
            <span>分类</span>
          </div>
        </div>

        <div className="inventory-add-row">
          <select
            className="input select"
            value={addItemId}
            onChange={(event) => setAddItemId(event.target.value)}
            aria-label="选择要加入的物品"
          >
            <option value="">从物品库选择…</option>
            {addable.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {categoryPath(categories, item.categoryId)}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>
            <IconPlus size={14} />
            加入
          </button>
        </div>

        {items.length === 0 ? (
          <p className="drawer-empty">
            物品页还没有物品。先去「物品」页建立物品库，再回来把物品放进这里。
          </p>
        ) : entries.length === 0 ? (
          <p className="drawer-empty">这里还是空的。可以从上方物品库加入，或等 AI 生成时自动放入。</p>
        ) : (
          <>
            <div className="inventory-filter-row">
              <button
                type="button"
                className={filter === 'all' ? 'active' : ''}
                onClick={() => setFilter('all')}
              >
                全部 · {entries.length}
              </button>
              {groups.map((group) => (
                <button
                  key={group.categoryId || 'missing'}
                  type="button"
                  className={filter === group.categoryId ? 'active' : ''}
                  onClick={() => setFilter(group.categoryId)}
                >
                  {group.path} · {group.entries.length}
                </button>
              ))}
            </div>
            <div className="inventory-list">
              {visibleGroups.map((group) => (
                <section className="inventory-group" key={group.categoryId || 'missing'}>
                  <header>
                    <strong>{group.path}</strong>
                    <span>
                      {group.entries.length} 种 · 共 {group.quantity} 件
                    </span>
                  </header>
                  {group.entries.map((entry) => {
                    const item = itemById.get(entry.itemId)
                    const category = categories.find((current) => current.id === item?.categoryId)
                    return (
                      <article className="inventory-row" key={entry.itemId}>
                        <div className="inventory-row-main">
                          <strong>{item?.name ?? '已删除物品'}</strong>
                          <small>
                            {item
                              ? `${category?.name ?? '未分类'} · ${gradeName(item.grade)}`
                              : '物品库中已找不到这条记录'}
                          </small>
                          {item?.description ? <p>{item.description}</p> : null}
                          {entry.note ? <em>{entry.note}</em> : null}
                        </div>
                        <div className="inventory-row-actions">
                          <button
                            type="button"
                            aria-label={`减少 ${item?.name ?? '物品'}`}
                            onClick={() => changeQuantity(entry.itemId, -1)}
                          >
                            −
                          </button>
                          <strong>{entry.quantity}</strong>
                          <button
                            type="button"
                            aria-label={`增加 ${item?.name ?? '物品'}`}
                            onClick={() => changeQuantity(entry.itemId, 1)}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="inventory-remove"
                            aria-label={`移除 ${item?.name ?? '物品'}`}
                            onClick={() => {
                              onChange(removeInventory(entries, entry.itemId))
                              onToast('已从列表移除')
                            }}
                          >
                            <IconTrash size={13} />
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
