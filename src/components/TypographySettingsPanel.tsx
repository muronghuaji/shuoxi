import { useMemo, useState } from 'react'
import type { TypographyAreaSettings, TypographyInherit, TypographySettings } from '../types'
import {
  DEFAULT_TYPOGRAPHY,
  TYPOGRAPHY_AREAS,
  TYPOGRAPHY_COLORS,
  TYPOGRAPHY_FONTS,
  TYPOGRAPHY_WEIGHTS,
  resolveTypography,
  resolveTypographyFont,
} from '../appearance'
import { listSystemFonts } from '../systemFonts'

interface TypographySettingsPanelProps {
  typography: TypographySettings
  onChange: (typography: TypographySettings) => void
  onToast: (message: string) => void
}

type TypographyAreaId = keyof TypographySettings

const AREA_LIMITS: Record<
  TypographyAreaId,
  { fontSize: [number, number]; measure: [number, number] }
> = {
  global: { fontSize: [12, 18], measure: [0, 0] },
  writing: { fontSize: [14, 24], measure: [520, 1200] },
  reading: { fontSize: [14, 30], measure: [520, 1200] },
  chat: { fontSize: [13, 24], measure: [520, 1200] },
}

const INHERIT_LABELS: Record<TypographyInherit, string> = {
  none: '自定义',
  global: '跟随全局界面',
  writing: '跟随写作界面',
  reading: '跟随阅读界面',
}

const INHERIT_OPTIONS: Record<TypographyAreaId, TypographyInherit[]> = {
  global: ['none'],
  writing: ['none', 'global'],
  reading: ['none', 'global', 'writing'],
  chat: ['none', 'global', 'writing', 'reading'],
}

export function TypographySettingsPanel({
  typography,
  onChange,
  onToast,
}: TypographySettingsPanelProps) {
  const [area, setArea] = useState<TypographyAreaId>('writing')
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [scanning, setScanning] = useState(false)
  const value = typography[area]
  const limits = AREA_LIMITS[area]
  const resolved = useMemo(() => resolveTypography(typography), [typography])
  const effective = resolved[area]
  const fontOptions = useMemo(() => {
    const labels = TYPOGRAPHY_FONTS.map((item) => ({
      value: item.value,
      label: item.label,
    }))
    const names = new Set([
      ...systemFonts,
      ...(value.fontFamily && !labels.some((item) => item.value === value.fontFamily)
        ? [value.fontFamily]
        : []),
    ])
    return [
      ...labels,
      ...[...names].map((name) => ({ value: name, label: name })),
    ]
  }, [systemFonts, value.fontFamily])

  const updateArea = (patch: Partial<TypographyAreaSettings>) => {
    onChange({
      ...typography,
      [area]: { ...value, ...patch },
    })
  }

  const scanFonts = async () => {
    setScanning(true)
    try {
      const fonts = await listSystemFonts()
      setSystemFonts(fonts)
      onToast(fonts.length > 0 ? `检测到 ${fonts.length} 个系统字体` : '没有检测到可列出的系统字体，可手动输入字体名')
    } catch {
      onToast('系统字体检测失败，可手动输入本机字体名')
    } finally {
      setScanning(false)
    }
  }

  const enterCustomFont = () => {
    const name = window.prompt('输入本机字体名称，例如 Microsoft YaHei', value.fontFamily)
    if (name?.trim()) updateArea({ fontFamily: name.trim().slice(0, 80) })
  }

  const inherited = area !== 'global' && value.inherit !== 'none'

  return (
    <section className="typography-panel">
      <div className="settings-section-head">
        <strong>字体与排版</strong>
        <span>设置会立即应用；不同区域可以独立覆盖，也可以跟随上一层</span>
      </div>

      <div className="typography-area-tabs">
        {TYPOGRAPHY_AREAS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={area === item.id ? 'active' : ''}
            onClick={() => setArea(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.hint}</small>
          </button>
        ))}
      </div>

      <div className="typography-preview" style={{ fontFamily: resolveTypographyFont(effective.fontFamily, 'var(--serif-body)') }}>
        <span className="typography-preview-kicker">实时预览 · {TYPOGRAPHY_AREAS.find((item) => item.id === area)?.label}</span>
        <p>
          雨是傍晚开始下的。林夏推开旧书店的门，门轴发出一声很轻的呻吟。
          <span className="typography-entity-demo">萧炎</span>抬头看她，像一句迟到了三年的问句。
        </p>
        <small>
          品阶 / 实体颜色优先保留；关闭写作页实体颜色后，才会全部使用这里的正文颜色。
        </small>
      </div>

      {area !== 'global' ? (
        <label className="typography-row">
          <span>继承方式</span>
          <select
            className="input select"
            value={value.inherit}
            onChange={(event) => updateArea({ inherit: event.target.value as TypographyInherit })}
          >
            {INHERIT_OPTIONS[area].map((inherit) => (
              <option key={inherit} value={inherit}>
                {INHERIT_LABELS[inherit]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <fieldset className="typography-controls" disabled={inherited}>
        <label className="typography-row">
          <span>字体</span>
          <select
            className="input select typography-font-input"
            value={value.fontFamily}
            onChange={(event) => updateArea({ fontFamily: event.target.value })}
          >
            {fontOptions.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
          <div className="typography-font-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void scanFonts()} disabled={scanning}>
              {scanning ? '检测中…' : '检测系统字体'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={enterCustomFont}>
              手动输入
            </button>
          </div>
        </label>

        <label className="typography-row">
          <span>字号</span>
          <input
            type="range"
            min={limits.fontSize[0]}
            max={limits.fontSize[1]}
            step={0.5}
            value={value.fontSize}
            onChange={(event) => updateArea({ fontSize: Number(event.target.value) })}
          />
          <strong>{value.fontSize}px</strong>
        </label>

        <label className="typography-row">
          <span>字重</span>
          <select
            className="input select"
            value={value.fontWeight}
            onChange={(event) => updateArea({ fontWeight: Number(event.target.value) })}
          >
            {TYPOGRAPHY_WEIGHTS.map((weight) => (
              <option key={weight.value} value={weight.value}>
                {weight.label}
              </option>
            ))}
          </select>
        </label>

        <div className="typography-row">
          <span>正文颜色</span>
          <div className="typography-colors">
            {TYPOGRAPHY_COLORS.map((color) => (
              <button
                key={color.value || 'theme'}
                type="button"
                className={`typography-color ${value.color === color.value ? 'active' : ''}`}
                title={color.label}
                onClick={() => updateArea({ color: color.value })}
              >
                <span style={{ background: color.value || 'linear-gradient(135deg, #ece7de 50%, #8a8378 50%)' }} />
                {color.label}
              </button>
            ))}
            <input
              type="color"
              className="typography-color-picker"
              value={value.color || '#d9d3c8'}
              onChange={(event) => updateArea({ color: event.target.value })}
              aria-label="自定义正文颜色"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => updateArea({ color: '' })}>
              跟随主题
            </button>
          </div>
        </div>

        <label className="typography-row">
          <span>行高</span>
          <input
            type="range"
            min={1.4}
            max={2.4}
            step={0.05}
            value={value.lineHeight}
            onChange={(event) => updateArea({ lineHeight: Number(event.target.value) })}
          />
          <strong>{value.lineHeight.toFixed(2)}</strong>
        </label>

        {area !== 'global' ? (
          <label className="typography-row">
            <span>行宽</span>
            <input
              type="range"
              min={limits.measure[0]}
              max={limits.measure[1]}
              step={20}
              value={value.measure}
              onChange={(event) => updateArea({ measure: Number(event.target.value) })}
            />
            <strong>{value.measure === 0 ? '自动' : `${value.measure}px`}</strong>
          </label>
        ) : null}
      </fieldset>

      {inherited ? (
        <p className="typography-inherited">
          当前区域继承「{INHERIT_LABELS[value.inherit]}」的字体、字号、字重和颜色；改为“自定义”后，下面的设置才会生效。
        </p>
      ) : null}

      <div className="typography-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            onChange({ ...typography, [area]: DEFAULT_TYPOGRAPHY[area] })
            onToast('当前区域已恢复默认字体')
          }}
        >
          恢复当前区域默认
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            onChange(DEFAULT_TYPOGRAPHY)
            onToast('全部字体设置已恢复默认')
          }}
        >
          恢复全部字体默认
        </button>
        <span>实体 / 品阶颜色始终优先于正文颜色。</span>
      </div>
    </section>
  )
}
