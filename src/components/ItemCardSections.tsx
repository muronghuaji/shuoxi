import { useState } from 'react'
import type { CharacterCard, TemplateTerms } from '../types'
import { describeItem } from '../itemDisplay'

interface ItemCardSectionsProps {
  character: CharacterCard
  terms?: TemplateTerms
}

type ItemGroupKey = 'techniques' | 'weapons' | 'treasures'

export function ItemCardSections({ character, terms }: ItemCardSectionsProps) {
  const [openGroup, setOpenGroup] = useState<ItemGroupKey | null>(null)
  const groups = [
    { kind: 'technique' as const, key: 'techniques' as const, title: terms?.ability ?? '功法' },
    { kind: 'weapon' as const, key: 'weapons' as const, title: '武器' },
    { kind: 'treasure' as const, key: 'treasures' as const, title: terms?.item ?? '法宝' },
  ]
  const hasItems = groups.some((group) => (character[group.key]?.length ?? 0) > 0)
  const hasCurrency = Boolean(character.currency?.trim())

  if (!hasItems && !hasCurrency) {
    return (
      <p className="drawer-empty">
        还没有记录{terms?.ability ?? '功法'}、武器、{terms?.item ?? '法宝'}或{terms?.currency ?? '货币'}。物品卡为展示视图，后续可单独做编辑。
      </p>
    )
  }

  return (
    <div className="item-sections">
      {groups.map((group) => {
        const items = character[group.key] ?? []
        if (items.length === 0) return null
        return (
          <section className="item-section" key={group.key}>
            <header className="item-section-head">
              <button
                type="button"
                className="item-section-toggle"
                onClick={() => setOpenGroup((prev) => (prev === group.key ? null : group.key))}
                aria-expanded={openGroup === group.key}
                title="查看该角色拥有的全部同类物品"
              >
                <span>{group.title}</span>
                <strong>{items.length}</strong>
                <small>{openGroup === group.key ? '收起' : '查看物品'}</small>
              </button>
              {openGroup === group.key ? (
                <div className="item-quick-popover">
                  <div className="item-quick-popover-head">
                    <strong>
                      {group.title} · {items.length}
                    </strong>
                    <button
                      type="button"
                      aria-label="关闭物品列表"
                      onClick={() => setOpenGroup(null)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="item-quick-list">
                    {items.map((name) => {
                      const item = describeItem(name, group.kind, character.cultivation)
                      return (
                        <div className="item-quick-row" key={`${group.key}-quick-${name}`}>
                          <span>{name}</span>
                          <small>
                            {item.type} · {item.grade}
                          </small>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </header>
            <div className="item-card-grid">
              {items.map((name) => {
                const item = describeItem(name, group.kind, character.cultivation)
                return (
                  <article className={`item-card item-card-${group.kind}`} key={`${group.key}-${name}`}>
                    <div className="item-card-head">
                      <span>{item.type}</span>
                      <span className="item-grade">{item.grade}</span>
                    </div>
                    <strong>{name}</strong>
                    <p>{item.effect}</p>
                    <div className="item-card-foot">
                      {item.condition ? <span>条件：{item.condition}</span> : null}
                      <span>{item.state || '展示品'}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}

      {hasCurrency ? (
        <section className="item-section">
          <header>
            <span>{terms?.currency ?? '货币'} / 身家</span>
            <strong>1</strong>
          </header>
          <article className="currency-card">
            <span className="currency-mark">钱袋</span>
            <div>
              <strong>{character.currency}</strong>
              <p>按角色当前身家展示；未见明确来源的资产不编造汇率。</p>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  )
}
