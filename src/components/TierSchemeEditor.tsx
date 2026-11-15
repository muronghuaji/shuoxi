import { useState } from 'react'
import type { TierLevel, TierScheme } from '../types'
import { TIER_PALETTE } from '../tiers'
import { IconPlus, IconTrash } from './Icons'
import { Modal } from './Modal'

interface TierSchemeEditorProps {
  scheme: TierScheme
  onChange: (scheme: TierScheme) => void
  labelPrefix?: string
}

function newLevel(index: number): TierLevel {
  return {
    id: `tier-level-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    name: `第 ${index + 1} 级`,
    color: TIER_PALETTE[index % TIER_PALETTE.length],
    sublevels: [],
  }
}

export function TierSchemeEditor({
  scheme,
  onChange,
  labelPrefix = '等级',
}: TierSchemeEditorProps) {
  const [sublevelDialog, setSublevelDialog] = useState<{
    levelIndex: number
    sublevelIndex: number | null
    value: string
  } | null>(null)

  const updateLevel = (index: number, patch: Partial<TierLevel>) => {
    onChange({
      ...scheme,
      levels: scheme.levels.map((level, levelIndex) =>
        levelIndex === index ? { ...level, ...patch } : level,
      ),
    })
  }

  const removeLevel = (index: number) => {
    if (scheme.levels.length <= 1) return
    onChange({ ...scheme, levels: scheme.levels.filter((_, levelIndex) => levelIndex !== index) })
  }

  const updateSublevels = (index: number, sublevels: string[]) => {
    updateLevel(index, { sublevels })
  }

  const openAddSublevel = (index: number) => {
    setSublevelDialog({ levelIndex: index, sublevelIndex: null, value: '' })
  }

  const openEditSublevel = (index: number, sublevelIndex: number) => {
    const level = scheme.levels[index]
    setSublevelDialog({
      levelIndex: index,
      sublevelIndex,
      value: level.sublevels?.[sublevelIndex] ?? '',
    })
  }

  const saveSublevel = () => {
    if (!sublevelDialog) return
    const value = sublevelDialog.value.trim()
    if (!value) return
    const level = scheme.levels[sublevelDialog.levelIndex]
    if (!level) return
    const next = [...(level.sublevels ?? [])]
    if (sublevelDialog.sublevelIndex === null) next.push(value)
    else next[sublevelDialog.sublevelIndex] = value
    updateSublevels(sublevelDialog.levelIndex, next)
    setSublevelDialog(null)
  }

  return (
    <div className="tier-scheme-editor">
      <label className="record-field">
        <span>方案名称</span>
        <input
          className="input drawer-input"
          value={scheme.name}
          onChange={(event) => onChange({ ...scheme, name: event.target.value })}
          placeholder="例如：武器品阶 / 丹药品级 / 修仙境界"
        />
      </label>
      <div className="tier-levels">
        {scheme.levels.map((level, index) => (
          <div className="tier-level-group" key={level.id}>
            <div className="tier-level-row">
              <span className="tier-level-index">{index + 1}</span>
              <input
                type="color"
                className="tier-color-input"
                value={level.color}
                title="等级颜色"
                aria-label={`${labelPrefix} ${index + 1} 颜色`}
                onChange={(event) => updateLevel(index, { color: event.target.value })}
              />
              <input
                className="input drawer-input"
                value={level.name}
                aria-label={`${labelPrefix} ${index + 1} 名称`}
                onChange={(event) => updateLevel(index, { name: event.target.value })}
                placeholder={`第 ${index + 1} 级名称`}
              />
              <button
                type="button"
                className="icon-btn"
                disabled={scheme.levels.length <= 1}
                onClick={() => removeLevel(index)}
                title="删除该等级"
                aria-label={`删除${labelPrefix} ${index + 1}`}
              >
                <IconTrash size={13} />
              </button>
            </div>
            <div className="tier-level-subrow">
              <span />
              <div className="tier-sublevel-editor">
                {(level.sublevels ?? []).map((sublevel, sublevelIndex) => (
                  <span className="tier-sublevel-chip" key={`${sublevel}-${sublevelIndex}`}>
                    <button
                      type="button"
                      className="tier-sublevel-name"
                      title="点击修改"
                      onClick={() => openEditSublevel(index, sublevelIndex)}
                    >
                      {sublevel}
                    </button>
                    <button
                      type="button"
                      className="tier-sublevel-remove"
                      title="删除子等级"
                      aria-label={`删除子等级 ${sublevel}`}
                      onClick={() =>
                        updateSublevels(
                          index,
                          (level.sublevels ?? []).filter((_, itemIndex) => itemIndex !== sublevelIndex),
                        )
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  className="tier-sublevel-add"
                  onClick={() => openAddSublevel(index)}
                >
                  <IconPlus size={11} />
                  添加子等级
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="tier-editor-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onChange({ ...scheme, levels: [...scheme.levels, newLevel(scheme.levels.length)] })}
        >
          <IconPlus size={13} />
          添加等级
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() =>
            onChange({
              ...scheme,
              levels: scheme.levels.map((level, index) => ({
                ...level,
                color: TIER_PALETTE[index % TIER_PALETTE.length],
              })),
            })
          }
        >
          重置配色
        </button>
      </div>

      {sublevelDialog ? (
        <Modal
          title={sublevelDialog.sublevelIndex === null ? '添加子等级' : '修改子等级'}
          subtitle={
            scheme.levels[sublevelDialog.levelIndex]?.name
              ? `${labelPrefix}：${scheme.levels[sublevelDialog.levelIndex].name}`
              : labelPrefix
          }
          size="md"
          onClose={() => setSublevelDialog(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setSublevelDialog(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!sublevelDialog.value.trim()}
                onClick={saveSublevel}
              >
                确定
              </button>
            </>
          }
        >
          <label className="record-field">
            <span>子等级名称</span>
            <input
              className="input"
              value={sublevelDialog.value}
              autoFocus
              placeholder="例如：一层 / 初期 / 巅峰"
              onChange={(event) =>
                setSublevelDialog((current) =>
                  current ? { ...current, value: event.target.value } : current,
                )
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  saveSublevel()
                }
                if (event.key === 'Escape') setSublevelDialog(null)
              }}
            />
          </label>
          <p className="drawer-hint">保存后不会关闭上层境界设置，可以继续添加或修改。</p>
        </Modal>
      ) : null}
    </div>
  )
}
