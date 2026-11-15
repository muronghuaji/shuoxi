import { useState } from 'react'
import { addCurrencyTier, normalizeCurrency } from '../currency'
import type { CurrencySettings } from '../types'
import { Modal } from './Modal'

interface CurrencySettingsModalProps {
  currency: CurrencySettings | undefined
  onChange: (currency: CurrencySettings) => void
  onClose: () => void
}

export function CurrencySettingsModal({
  currency,
  onChange,
  onClose,
}: CurrencySettingsModalProps) {
  const [draft, setDraft] = useState(() => normalizeCurrency(currency))

  const updateName = (id: string, name: string) => {
    setDraft((current) => ({
      ...current,
      tiers: current.tiers.map((tier) => (tier.id === id ? { ...tier, name } : tier)),
    }))
  }

  return (
    <Modal
      title="货币设置"
      subtitle="默认十级，可改名，也可以继续添加；兑换率按每级 ×10 计算"
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onChange(normalizeCurrency(draft))
              onClose()
            }}
          >
            保存货币
          </button>
        </>
      }
    >
      <div className="currency-settings">
        <div className="currency-settings-head">
          <span>货币名称</span>
          <span>兑基础单位</span>
        </div>
        {draft.tiers.map((tier, index) => (
          <div className="currency-settings-row" key={tier.id}>
            <input
              className="input"
              value={tier.name}
              aria-label={`第${index + 1}级货币名称`}
              onChange={(event) => updateName(tier.id, event.target.value)}
            />
            <code>×{tier.rateToBase.toLocaleString('zh-CN')}</code>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-sm currency-add"
          onClick={() => setDraft((current) => addCurrencyTier(current))}
        >
          添加一级货币
        </button>
        <p className="currency-settings-hint">
          物品价格只记录“某个货币等级 + 数量”，不会自动改变库存或世界设定。
        </p>
      </div>
    </Modal>
  )
}
