import { useState } from 'react'
import type { TierScheme, WorkDetail } from '../types'
import { defaultRealmScheme, ensureRealmData } from '../tiers'
import { TierSchemeEditor } from './TierSchemeEditor'
import { Modal } from './Modal'
import { IconPlus, IconTrash } from './Icons'

interface RealmSettingsModalProps {
  detail: WorkDetail
  templateId: string | undefined
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onClose: () => void
}

export function RealmSettingsModal({
  detail,
  templateId,
  onUpdateDetail,
  onClose,
}: RealmSettingsModalProps) {
  const ensurePatch = ensureRealmData(detail, templateId)
  const initialSchemes = ensurePatch?.realmSchemes ?? detail.realmSchemes ?? [defaultRealmScheme(templateId)]
  const initialActive =
    ensurePatch?.activeRealmSchemeId ??
    detail.activeRealmSchemeId ??
    initialSchemes[0]?.id ??
    ''
  const [schemes, setSchemes] = useState<TierScheme[]>(
    initialSchemes.map((scheme) => ({ ...scheme, levels: scheme.levels.map((level) => ({ ...level })) })),
  )
  const [activeId, setActiveId] = useState(initialActive)
  const [schemeId, setSchemeId] = useState(initialScheme(initialSchemes, initialActive))
  const selected = schemes.find((scheme) => scheme.id === schemeId) ?? schemes[0]
  const [error, setError] = useState('')

  const updateScheme = (next: TierScheme) => {
    setSchemes((prev) => prev.map((scheme) => (scheme.id === next.id ? next : scheme)))
  }

  const addScheme = () => {
    const next = defaultRealmScheme(templateId)
    setSchemes((prev) => [...prev, next])
    setSchemeId(next.id)
  }

  const removeScheme = (id: string) => {
    if (schemes.length <= 1) {
      setError('至少保留一个境界体系')
      return
    }
    const next = schemes.filter((scheme) => scheme.id !== id)
    setSchemes(next)
    setSchemeId(next[0]?.id ?? '')
    if (activeId === id) setActiveId(next[0]?.id ?? '')
  }

  const save = () => {
    const valid = schemes.filter((scheme) => scheme.name.trim() && scheme.levels.some((level) => level.name.trim()))
    if (valid.length === 0) {
      setError('至少保留一个有效境界体系')
      return
    }
    const nextActive = valid.some((scheme) => scheme.id === activeId) ? activeId : valid[0].id
    onUpdateDetail({
      realmSchemes: valid.map((scheme) => ({
        ...scheme,
        name: scheme.name.trim(),
        levels: scheme.levels.map((level) => ({ ...level, name: level.name.trim() || '未命名' })),
      })),
      activeRealmSchemeId: nextActive,
      realmHistory: detail.realmHistory ?? [],
    })
    onClose()
  }

  return (
    <Modal
      title="角色境界体系"
      subtitle="可以为作品配置多套境界 / 等级体系；角色可以选择自己的体系与阶位"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save}>
            保存境界
          </button>
        </>
      }
    >
      <div className="realm-settings">
        <aside className="realm-scheme-list">
          <div className="realm-scheme-head">
            <span>境界体系</span>
            <button type="button" className="icon-btn" onClick={addScheme} aria-label="添加境界体系">
              <IconPlus size={14} />
            </button>
          </div>
          {schemes.map((scheme) => (
            <div className={`realm-scheme-row ${scheme.id === selected?.id ? 'active' : ''}`} key={scheme.id}>
              <button type="button" onClick={() => setSchemeId(scheme.id)}>
                <strong>{scheme.name || '未命名体系'}</strong>
                <small>{scheme.levels.length} 阶</small>
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => removeScheme(scheme.id)}
                aria-label={`删除境界体系 ${scheme.name}`}
              >
                <IconTrash size={12} />
              </button>
            </div>
          ))}
          <label className="realm-active">
            <input
              type="radio"
              checked={activeId === selected?.id}
              onChange={() => selected && setActiveId(selected.id)}
            />
            <span>设为角色默认体系</span>
          </label>
        </aside>
        <div className="realm-scheme-editor">
          {selected ? (
            <TierSchemeEditor
              scheme={selected}
              onChange={updateScheme}
              labelPrefix="境界"
            />
          ) : null}
          {error ? <p className="field-error">{error}</p> : null}
        </div>
      </div>
    </Modal>
  )
}

function initialScheme(schemes: TierScheme[], activeId: string): string {
  return activeId || schemes[0]?.id || ''
}
