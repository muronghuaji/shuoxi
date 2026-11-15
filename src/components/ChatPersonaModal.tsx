import { useState } from 'react'
import type { CharacterCard, ChatPersona, ChatPersonaKind } from '../types'
import { createCharacterPersona, DEFAULT_CHAT_PERSONA } from '../chatPersona'
import { Modal } from './Modal'

interface ChatPersonaModalProps {
  persona: ChatPersona
  characters: CharacterCard[]
  hasMessages: boolean
  onSave: (persona: ChatPersona, saveAsWorkDefault: boolean) => void
  onClose: () => void
}

const KIND_OPTIONS: {
  value: ChatPersonaKind
  label: string
  hint: string
}[] = [
  {
    value: 'visitor',
    label: '无形访客',
    hint: '角色不知道你的名字和来历；最安全、最不干扰正典。',
  },
  {
    value: 'custom',
    label: '自定义身份',
    hint: '给自己一个名字、身份和与角色的关系。',
  },
  {
    value: 'character',
    label: '书中角色',
    hint: '以作品里已有角色的身份进入这场对话。',
  },
]

export function ChatPersonaModal({
  persona,
  characters,
  hasMessages,
  onSave,
  onClose,
}: ChatPersonaModalProps) {
  const [draft, setDraft] = useState<ChatPersona>(persona)
  const [saveAsDefault, setSaveAsDefault] = useState(false)
  const selectedCharacter = characters.find((item) => item.id === draft.characterId)

  const update = (patch: Partial<ChatPersona>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }

  const changeKind = (kind: ChatPersonaKind) => {
    if (kind === 'visitor') {
      setDraft({ ...DEFAULT_CHAT_PERSONA })
      return
    }
    if (kind === 'character') {
      const character = selectedCharacter ?? characters[0]
      if (character) {
        setDraft(createCharacterPersona(character, draft))
      }
      return
    }
    setDraft({
      kind: 'custom',
      name: draft.name,
      identity: draft.identity,
      relation: draft.relation,
      known: draft.known,
      hidden: draft.hidden,
    })
  }

  return (
    <Modal
      title="我在戏里的身份"
      subtitle="身份只影响聊天里角色怎么看你，不会自动改写作品正典"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSave(draft, saveAsDefault)}
          >
            保存身份
          </button>
        </>
      }
    >
      <div className="chat-persona-modal">
        <div className="chat-persona-kinds">
          {KIND_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              className={draft.kind === option.value ? 'active' : ''}
              onClick={() => changeKind(option.value)}
              disabled={option.value === 'character' && characters.length === 0}
            >
              <strong>{option.label}</strong>
              <small>{option.hint}</small>
            </button>
          ))}
        </div>

        {draft.kind === 'character' ? (
          <>
            <label className="chat-persona-field">
              <span>选择角色</span>
              <select
                className="input select"
                value={draft.characterId ?? ''}
                onChange={(event) => {
                  const character = characters.find((item) => item.id === event.target.value)
                  if (character) setDraft(createCharacterPersona(character, draft))
                }}
              >
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                    {character.identity ? ` · ${character.identity}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {selectedCharacter ? (
              <div className="chat-persona-character-preview">
                <strong>{selectedCharacter.name}</strong>
                <span>
                  {[selectedCharacter.role, selectedCharacter.identity].filter(Boolean).join(' · ')}
                </span>
                <p>{selectedCharacter.background || selectedCharacter.goal || selectedCharacter.personality || '暂无公开简介'}</p>
              </div>
            ) : null}
          </>
        ) : null}

        {draft.kind === 'custom' ? (
          <div className="chat-persona-grid">
            <label className="chat-persona-field">
              <span>名字</span>
              <input
                className="input"
                value={draft.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="角色会这样称呼你"
                maxLength={40}
              />
            </label>
            <label className="chat-persona-field">
              <span>身份 / 来历</span>
              <input
                className="input"
                value={draft.identity}
                onChange={(event) => update({ identity: event.target.value })}
                placeholder="例如：守灯阁新来的杂役"
                maxLength={200}
              />
            </label>
          </div>
        ) : null}

        <label className="chat-persona-field">
          <span>与对方的关系</span>
          <input
            className="input"
            value={draft.relation}
            onChange={(event) => update({ relation: event.target.value })}
            placeholder="例如：陆青禾的下属，刚来三天"
            maxLength={200}
          />
        </label>

        <div className="chat-persona-grid">
          <label className="chat-persona-field">
            <span>对方已经知道</span>
            <textarea
              className="input drawer-textarea"
              rows={3}
              value={draft.known}
              onChange={(event) => update({ known: event.target.value })}
              placeholder="例如：你的名字、你是杂役、你怕黑"
              maxLength={300}
            />
          </label>
          <label className="chat-persona-field">
            <span>对方不知道 / 你想隐瞒</span>
            <textarea
              className="input drawer-textarea"
              rows={3}
              value={draft.hidden}
              onChange={(event) => update({ hidden: event.target.value })}
              placeholder="例如：你见过她父亲发病，你知道灯的异常"
              maxLength={300}
            />
          </label>
        </div>

        {hasMessages ? (
          <p className="chat-persona-warning">
            当前会话已有聊天记录。修改身份只影响角色今后的认知，不会改写已经发生的对话。想彻底换身份，建议新建会话。
          </p>
        ) : null}

        <label className="chat-persona-default">
          <input
            type="checkbox"
            checked={saveAsDefault}
            onChange={(event) => setSaveAsDefault(event.target.checked)}
          />
          <span>同时设为本书的默认身份，之后新会话自动使用</span>
        </label>

        <p className="chat-persona-note">
          身份是聊天层设定，不会自动写入角色卡、正文或作品正典。
        </p>
      </div>
    </Modal>
  )
}
