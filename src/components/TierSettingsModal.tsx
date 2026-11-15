import { useRef, useState } from 'react'
import type { TierScheme } from '../types'
import { normalizeTierScheme, TIER_PALETTE } from '../tiers'
import { TierSchemeEditor } from './TierSchemeEditor'
import { Modal } from './Modal'

interface TierSettingsModalProps {
  title: string
  subtitle?: string
  categoryName: string
  categoryColor?: string
  scheme: TierScheme
  defaultScheme?: TierScheme
  copyTargets?: { id: string; name: string }[]
  onCopy?: (targetId: string, scheme: TierScheme, color: string) => void
  onSave: (scheme: TierScheme, color: string) => void
  onClose: () => void
}

export function TierSettingsModal({
  title,
  subtitle,
  categoryName,
  categoryColor,
  scheme,
  defaultScheme,
  copyTargets = [],
  onCopy,
  onSave,
  onClose,
}: TierSettingsModalProps) {
  const [draft, setDraft] = useState<TierScheme>({
    ...scheme,
    levels: scheme.levels.map((level) => ({ ...level })),
  })
  const [color, setColor] = useState(categoryColor ?? TIER_PALETTE[0])
  const [copyTargetId, setCopyTargetId] = useState('')
  const [error, setError] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  const exportScheme = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${categoryName || 'tier'}-scheme.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importScheme = async (file: File | undefined) => {
    if (!file) return
    try {
      const raw: unknown = JSON.parse(await file.text())
      const next = normalizeTierScheme(raw)
      if (!next) throw new Error('文件缺少有效的等级方案')
      setDraft({ ...next, id: draft.id })
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导入失败')
    }
  }

  const save = () => {
    const name = draft.name.trim()
    const levels = draft.levels
      .map((level) => ({ ...level, name: level.name.trim() }))
      .filter((level) => level.name)
    if (!name) {
      setError('方案需要一个名称')
      return
    }
    if (levels.length === 0) {
      setError('至少保留一个等级')
      return
    }
    onSave({ ...draft, name, levels }, color)
  }

  return (
    <Modal
      title={title}
      subtitle={subtitle ?? `${categoryName} · 本分类独立分级`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save}>
            保存分级
          </button>
        </>
      }
    >
      <div className="tier-settings-modal">
        <div className="tier-category-row">
          <label className="record-field">
            <span>分类颜色</span>
            <div className="tier-category-color">
              <input
                type="color"
                className="tier-color-input"
                value={color}
                aria-label="分类颜色"
                onChange={(event) => setColor(event.target.value)}
              />
              <span>{color}</span>
            </div>
          </label>
          {defaultScheme ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setDraft({
                  ...defaultScheme,
                  id: draft.id,
                  levels: defaultScheme.levels.map((level, index) => ({
                    ...level,
                    id: `${draft.id}-l${index + 1}`,
                  })),
                })
              }
            >
              恢复默认分级
            </button>
          ) : null}
        </div>
        <TierSchemeEditor scheme={draft} onChange={setDraft} labelPrefix="分级" />
        <div className="tier-io-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportScheme}>
            导出方案 JSON
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => importRef.current?.click()}
          >
            导入方案 JSON
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              void importScheme(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </div>
        {copyTargets.length > 0 && onCopy ? (
          <div className="tier-copy-row">
            <span>复制当前方案到：</span>
            <select
              className="input select"
              value={copyTargetId}
              onChange={(event) => setCopyTargetId(event.target.value)}
            >
              <option value="">选择分类</option>
              {copyTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!copyTargetId}
              onClick={() => {
                if (!copyTargetId) return
                const name = draft.name.trim()
                const levels = draft.levels
                  .map((level) => ({ ...level, name: level.name.trim() }))
                  .filter((level) => level.name)
                if (!name || levels.length === 0) {
                  setError('方案名称和至少一个等级不能为空')
                  return
                }
                onCopy(copyTargetId, { ...draft, name, levels }, color)
                setCopyTargetId('')
              }}
            >
              复制方案
            </button>
          </div>
        ) : null}
        {error ? <p className="field-error">{error}</p> : null}
      </div>
    </Modal>
  )
}
