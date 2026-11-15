import { useMemo } from 'react'
import { PROVIDERS } from '../data'
import {
  isOffPeak,
  resolveWritingPrice,
  type WritingPriceRule,
  type WritingPricingSettings,
} from '../pricing'
import { formatMoney } from '../stats'
import { NumberInput } from './NumberInput'

interface WritingPriceSettingsProps {
  settings: WritingPricingSettings
  provider: string
  model: string
  onChange: (settings: WritingPricingSettings) => void
}

function sortRules(rules: WritingPriceRule[]): WritingPriceRule[] {
  return [...rules].sort(
    (left, right) =>
      left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model),
  )
}

export function WritingPriceSettings({
  settings,
  provider,
  model,
  onChange,
}: WritingPriceSettingsProps) {
  const current = useMemo(
    () => resolveWritingPrice(settings.rules, provider, model),
    [model, provider, settings.rules],
  )
  const priceRules = sortRules(settings.rules)

  const updateRule = (id: string, patch: Partial<WritingPriceRule>) => {
    onChange({
      rules: settings.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
      updatedAt: Date.now(),
    })
  }

  const addRule = (preset: 'blank' | 'deepseek') => {
    const base = provider || 'deepseek'
    const next: WritingPriceRule =
      preset === 'deepseek'
        ? {
            id: `price-${Date.now().toString(36)}`,
            provider: 'deepseek',
            model: 'deepseek-flash',
            inputPrice: 2,
            outputPrice: 8,
            cacheHitPrice: 0.5,
            cacheWritePrice: 0,
            currency: 'CNY',
            offPeakEnabled: true,
            offPeakStart: '00:30',
            offPeakEnd: '08:30',
            offPeakDiscount: 50,
            timeZone: 'Asia/Shanghai',
            note: 'DeepSeek 参考模板：请按官方价格页面核对。',
          }
        : {
            id: `price-${Date.now().toString(36)}`,
            provider: base,
            model: '',
            inputPrice: 0,
            outputPrice: 0,
            currency: 'CNY',
            offPeakEnabled: false,
            offPeakStart: '00:30',
            offPeakEnd: '08:30',
            offPeakDiscount: 0,
            timeZone: 'Asia/Shanghai',
            note: '',
          }
    onChange({ rules: [...settings.rules, next], updatedAt: Date.now() })
  }

  const removeRule = (id: string) => {
    onChange({
      rules: settings.rules.filter((rule) => rule.id !== id),
      updatedAt: Date.now(),
    })
  }

  return (
    <div className="writing-price-settings">
      <div className="writing-price-current">
        <div>
          <strong>当前写作模型</strong>
          <span>
            {provider || '未配置服务商'} · {model || '未配置模型'}
          </span>
        </div>
        {current ? (
          <div className={current.offPeak ? 'offpeak' : ''}>
            <strong>
              {current.offPeak ? '空闲期价' : '峰期价'} · 输入 {formatMoney(current.inputPrice)}/M ·
              输出 {formatMoney(current.outputPrice)}/M
            </strong>
            <span>{current.rule.note || '按内置价格自动计算，无需手动维护'}</span>
          </div>
        ) : (
          <div className="missing">
            <strong>当前模型没有匹配到内置价格</strong>
            <span>展开下方「自定义价格（高级）」补一条，写作页才会显示金额。</span>
          </div>
        )}
      </div>

      <details className="writing-price-advanced">
        <summary>
          <span>自定义价格（高级）</span>
          <small>默认使用内置价格；只有未匹配或服务商调价时才需要展开</small>
        </summary>
        <div className="writing-price-head">
          <div>
            <strong>自定义价格规则</strong>
            <span>
              一般不需要修改。只有自动匹配不到模型，或服务商调整价格时，再在这里覆盖。
            </span>
          </div>
          <div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => addRule('blank')}>
              添加模型规则
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => addRule('deepseek')}>
              DeepSeek 参考模板
            </button>
          </div>
        </div>

      <div className="writing-price-list">
        {priceRules.map((rule) => {
          const offPeakNow = isOffPeak(rule)
          const factor = offPeakNow ? 1 - rule.offPeakDiscount / 100 : 1
          return (
            <article className="writing-price-card" key={rule.id}>
              <header>
                <div>
                  <strong>
                    {rule.provider} · {rule.model || '未命名模型'}
                  </strong>
                  <span>
                    {rule.offPeakEnabled
                      ? `空闲期 ${rule.offPeakStart}–${rule.offPeakEnd}（${rule.offPeakDiscount}% off，${rule.timeZone}）`
                      : '未开启峰谷价'}
                    {offPeakNow ? ' · 当前空闲期' : ' · 当前峰期'}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-danger-ghost btn-sm"
                  onClick={() => removeRule(rule.id)}
                >
                  删除
                </button>
              </header>
              <div className="writing-price-grid">
                <label>
                  <span>服务商</span>
                  <select
                    className="input select"
                    value={rule.provider}
                    onChange={(event) => updateRule(rule.id, { provider: event.target.value })}
                  >
                    {PROVIDERS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>模型 ID</span>
                  <input
                    className="input"
                    value={rule.model}
                    placeholder="例如 deepseek-flash"
                    onChange={(event) => updateRule(rule.id, { model: event.target.value })}
                  />
                </label>
                <label>
                  <span>输入价格 · 元/百万 tokens</span>
                  <NumberInput
                    className="input"
                    min={0}
                    step={0.01}
                    value={rule.inputPrice}
                    fallback={0}
                    placeholder="按官方峰期价填写"
                    onValueChange={(value) => updateRule(rule.id, { inputPrice: value })}
                  />
                </label>
                <label>
                  <span>输出价格 · 元/百万 tokens</span>
                  <NumberInput
                    className="input"
                    min={0}
                    step={0.01}
                    value={rule.outputPrice}
                    fallback={0}
                    placeholder="按官方峰期价填写"
                    onValueChange={(value) => updateRule(rule.id, { outputPrice: value })}
                  />
                </label>
                <label>
                  <span>缓存命中输入价 · 元/百万 tokens</span>
                  <NumberInput
                    className="input"
                    min={0}
                    step={0.01}
                    value={rule.cacheHitPrice ?? rule.inputPrice}
                    fallback={rule.inputPrice}
                    placeholder="默认等于输入价"
                    onValueChange={(value) => updateRule(rule.id, { cacheHitPrice: value })}
                  />
                </label>
                <label>
                  <span>缓存写入价 · 元/百万 tokens</span>
                  <NumberInput
                    className="input"
                    min={0}
                    step={0.01}
                    value={rule.cacheWritePrice ?? 0}
                    fallback={0}
                    placeholder="没有缓存写入价时填 0"
                    onValueChange={(value) => updateRule(rule.id, { cacheWritePrice: value })}
                  />
                </label>
              </div>
              <div className="writing-price-offpeak">
                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={rule.offPeakEnabled}
                    onChange={(event) =>
                      updateRule(rule.id, { offPeakEnabled: event.target.checked })
                    }
                  />
                  <span>启用峰谷 / 空闲期价格</span>
                </label>
                {rule.offPeakEnabled ? (
                  <>
                    <label>
                      <span>开始</span>
                      <input
                        className="input"
                        type="time"
                        value={rule.offPeakStart}
                        onChange={(event) =>
                          updateRule(rule.id, { offPeakStart: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>结束</span>
                      <input
                        className="input"
                        type="time"
                        value={rule.offPeakEnd}
                        onChange={(event) =>
                          updateRule(rule.id, { offPeakEnd: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>折扣 %</span>
                      <NumberInput
                          className="input"
                          min={0}
                          max={100}
                          step={1}
                          value={rule.offPeakDiscount}
                          fallback={0}
                          onValueChange={(value) =>
                            updateRule(rule.id, { offPeakDiscount: value })
                          }
                        />
                    </label>
                    <span className="writing-price-factor">
                      空闲期输入 {formatMoney(rule.inputPrice * factor)}/M · 输出{' '}
                      {formatMoney(rule.outputPrice * factor)}/M
                    </span>
                  </>
                ) : null}
              </div>
              <label className="writing-price-note">
                <span>备注 / 价格来源</span>
                <input
                  className="input"
                  value={rule.note}
                  placeholder="例如：DeepSeek 价格页 2026-11，峰期价"
                  onChange={(event) => updateRule(rule.id, { note: event.target.value })}
                />
              </label>
            </article>
          )
        })}
        {priceRules.length === 0 ? (
          <p className="drawer-empty">还没有写作模型价格规则。先添加一条，费用才会开始计算。</p>
        ) : null}
        </div>
      </details>
    </div>
  )
}
