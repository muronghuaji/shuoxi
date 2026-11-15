import { useMemo, useState } from 'react'
import type { EntityIndexEntry } from '../entityIndex'
import {
  cleanAlias,
  findCharacterAliasOwner,
  isGenericAddressTerm,
} from '../entityBinding'
import type { CharacterAliasOwner } from '../entityBinding'
import type { WorkDetail } from '../types'
import { Modal } from './Modal'

interface EntityBindingModalProps {
  selectedText: string
  detail: WorkDetail
  characters: EntityIndexEntry[]
  mode: 'chat' | 'writing'
  onBind: (
    entity: EntityIndexEntry,
    scope: 'global' | 'temporary',
  ) => void
  onClose: () => void
}

export function EntityBindingModal({
  selectedText,
  detail,
  characters,
  mode,
  onBind,
  onClose,
}: EntityBindingModalProps) {
  const alias = cleanAlias(selectedText)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<EntityIndexEntry | null>(null)
  const [scope, setScope] = useState<'global' | 'temporary'>('global')
  const [confirmed, setConfirmed] = useState(false)
  const owner: CharacterAliasOwner | null = useMemo(
    () => (alias ? findCharacterAliasOwner(detail, alias) : null),
    [alias, detail],
  )
  const generic = alias ? isGenericAddressTerm(alias) : false
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return characters.slice(0, 80)
    return characters
      .filter((entry) =>
        [entry.name, ...entry.aliases].some((name) =>
          name.toLowerCase().includes(value),
        ),
      )
      .slice(0, 80)
  }, [characters, query])
  const conflict = Boolean(owner && selected && owner.id !== selected.id)
  const needsConfirm = generic || conflict
  const canBind = Boolean(alias && selected && (!needsConfirm || confirmed))

  return (
    <Modal
      title="绑定选中文字"
      subtitle={`将「${alias || selectedText.trim()}」识别为某个角色`}
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
            disabled={!canBind}
            onClick={() => {
              if (!selected) return
              onBind(selected, scope)
              onClose()
            }}
          >
            绑定
          </button>
        </>
      }
    >
      <div className="entity-binding-form">
        <label className="entity-binding-search">
          <span>选择角色</span>
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索角色名或别名"
            autoFocus
          />
        </label>

        <div className="entity-binding-list" role="listbox" aria-label="角色列表">
          {filtered.length === 0 ? (
            <p className="entity-binding-empty">没有匹配的角色</p>
          ) : (
            filtered.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="option"
                aria-selected={selected?.id === entry.id}
                className={`entity-binding-option ${selected?.id === entry.id ? 'active' : ''}`}
                onClick={() => {
                  setSelected(entry)
                  setConfirmed(false)
                }}
              >
                <span className="entity-binding-avatar">{entry.name.slice(0, 1)}</span>
                <span>
                  <strong>{entry.name}</strong>
                  <small>{entry.subtitle}</small>
                </span>
              </button>
            ))
          )}
        </div>

        {alias ? (
          <div className="entity-binding-scope">
            <label>
              <input
                type="radio"
                name="binding-scope"
                checked={scope === 'global'}
                onChange={() => setScope('global')}
              />
              <span>
                <strong>加入本书别名</strong>
                <small>聊天、写作页、搜索和以后出现的同一个词都会识别。</small>
              </span>
            </label>
            {mode === 'chat' ? (
              <label>
                <input
                  type="radio"
                  name="binding-scope"
                  checked={scope === 'temporary'}
                  onChange={() => setScope('temporary')}
                />
                <span>
                  <strong>仅本次聊天临时识别</strong>
                  <small>不修改角色档案，刷新页面后失效。</small>
                </span>
              </label>
            ) : null}
          </div>
        ) : (
          <p className="entity-binding-warning">选中文字为空或太长，无法绑定。</p>
        )}

        {generic ? (
          <p className="entity-binding-warning">
            「{alias}」是泛称，可能指多个角色。建议只在本次聊天临时识别，或确认后再加入本书别名。
          </p>
        ) : null}
        {conflict ? (
          <p className="entity-binding-warning">
            「{alias}」目前属于「{owner?.name}」。继续绑定会把这个词从原角色移走。
          </p>
        ) : null}
        {needsConfirm ? (
          <label className="entity-binding-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            我已确认这个绑定
          </label>
        ) : null}
      </div>
    </Modal>
  )
}
