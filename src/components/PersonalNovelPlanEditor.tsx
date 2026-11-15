import { useEffect, useState } from 'react'
import type {
  PersonalNovelChapterPlan,
  PersonalNovelCharacter,
  PersonalNovelFaction,
  PersonalNovelPlan,
} from '../types'
import { Modal } from './Modal'

interface PersonalNovelPlanEditorProps {
  plan: PersonalNovelPlan
  onClose: () => void
  onSave: (plan: PersonalNovelPlan) => void
}

function splitLevels(value: string): string[] {
  return value
    .split(/[、,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12)
}

export function PersonalNovelPlanEditor({
  plan,
  onClose,
  onSave,
}: PersonalNovelPlanEditorProps) {
  const [draft, setDraft] = useState<PersonalNovelPlan>(plan)
  const [realmText, setRealmText] = useState((plan.realmLevels ?? []).join('、'))
  const [tierText, setTierText] = useState((plan.factionTierLevels ?? []).join('、'))
  const [error, setError] = useState('')

  useEffect(() => {
    setDraft(plan)
  }, [plan])

  const patchChapter = (index: number, patch: Partial<PersonalNovelChapterPlan>) => {
    setDraft((current) => ({
      ...current,
      chapters: current.chapters.map((chapter, itemIndex) =>
        itemIndex === index ? { ...chapter, ...patch } : chapter,
      ),
    }))
  }

  const patchCharacter = (index: number, patch: Partial<PersonalNovelCharacter>) => {
    setDraft((current) => ({
      ...current,
      characters: current.characters.map((character, itemIndex) =>
        itemIndex === index ? { ...character, ...patch } : character,
      ),
    }))
  }

  const patchFaction = (index: number, patch: Partial<PersonalNovelFaction>) => {
    setDraft((current) => ({
      ...current,
      factions: (current.factions ?? []).map((faction, itemIndex) =>
        itemIndex === index ? { ...faction, ...patch } : faction,
      ),
    }))
  }

  const save = () => {
    const chapters = draft.chapters
      .map((chapter) => ({
        ...chapter,
        title: chapter.title.trim(),
        goal: chapter.goal.trim(),
        conflict: chapter.conflict.trim(),
        hook: chapter.hook.trim(),
      }))
      .filter((chapter) => chapter.title)
    if (!draft.title.trim() || !draft.logline.trim()) {
      setError('书名和一句话简介不能为空。')
      return
    }
    if (chapters.length === 0) {
      setError('至少保留一章。')
      return
    }
    onSave({
      ...draft,
      title: draft.title.trim(),
      logline: draft.logline.trim(),
      synopsis: draft.synopsis.trim(),
      protagonist: draft.protagonist.trim(),
      characters: draft.characters.filter((character) => character.name.trim()),
      factions: (draft.factions ?? []).filter((faction) => faction.name.trim()),
      realmLevels: splitLevels(realmText),
      factionTierLevels: splitLevels(tierText),
      chapters,
    })
  }

  return (
    <Modal
      title="编辑故事方案"
      subtitle="在开始生成正文之前，把人物、势力和每一章的目标调整好。"
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            保存方案
          </button>
        </>
      }
    >
      <div className="personal-plan-editor">
        <div className="personal-plan-editor-grid">
          <label>
            <span>书名</span>
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label>
            <span>主角</span>
            <input
              value={draft.protagonist}
              onChange={(event) =>
                setDraft((current) => ({ ...current, protagonist: event.target.value }))
              }
            />
          </label>
        </div>
        <label>
          <span>一句话简介</span>
          <input
            value={draft.logline}
            onChange={(event) =>
              setDraft((current) => ({ ...current, logline: event.target.value }))
            }
          />
        </label>
        <label>
          <span>故事简介</span>
          <textarea
            rows={3}
            value={draft.synopsis}
            onChange={(event) =>
              setDraft((current) => ({ ...current, synopsis: event.target.value }))
            }
          />
        </label>

        <div className="personal-plan-editor-section">
          <div className="personal-plan-editor-section-title">
            <strong>人物</strong>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  characters: [
                    ...current.characters,
                    { name: '', role: '', goal: '' },
                  ],
                }))
              }
            >
              添加人物
            </button>
          </div>
          {draft.characters.map((character, index) => (
            <div className="personal-plan-editor-character" key={index}>
              <div className="personal-plan-editor-row">
              <input
                placeholder="姓名"
                value={character.name}
                onChange={(event) => patchCharacter(index, { name: event.target.value })}
              />
              <input
                placeholder="身份 / 定位"
                value={character.role}
                onChange={(event) => patchCharacter(index, { role: event.target.value })}
              />
              <input
                placeholder="目标"
                value={character.goal}
                onChange={(event) => patchCharacter(index, { goal: event.target.value })}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    characters: current.characters.filter((_, itemIndex) => itemIndex !== index),
                  }))
                }
              >
                删除
              </button>
              </div>
              <div className="personal-plan-editor-row personal-plan-editor-subrow">
                <input
                  placeholder="真实身份名（没有则留空）"
                  value={character.hiddenName ?? ''}
                  onChange={(event) =>
                    patchCharacter(index, { hiddenName: event.target.value })
                  }
                />
                <input
                  type="number"
                  min={1}
                  placeholder="身份揭露章节"
                  value={character.revealChapter ?? ''}
                  onChange={(event) =>
                    patchCharacter(index, {
                      revealChapter: Number(event.target.value) || undefined,
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <div className="personal-plan-editor-section">
          <div className="personal-plan-editor-section-title">
            <strong>势力</strong>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  factions: [...(current.factions ?? []), { name: '', type: '', goal: '' }],
                }))
              }
            >
              添加势力
            </button>
          </div>
          {(draft.factions ?? []).map((faction, index) => (
            <div className="personal-plan-editor-row" key={index}>
              <input
                placeholder="势力名"
                value={faction.name}
                onChange={(event) => patchFaction(index, { name: event.target.value })}
              />
              <input
                placeholder="类型"
                value={faction.type}
                onChange={(event) => patchFaction(index, { type: event.target.value })}
              />
              <input
                placeholder="目标"
                value={faction.goal}
                onChange={(event) => patchFaction(index, { goal: event.target.value })}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    factions: (current.factions ?? []).filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  }))
                }
              >
                删除
              </button>
            </div>
          ))}
        </div>

        <div className="personal-plan-editor-grid">
          <label>
            <span>境界体系名</span>
            <input
              placeholder="例如：观海"
              value={draft.realmSchemeName ?? ''}
              onChange={(event) =>
                setDraft((current) => ({ ...current, realmSchemeName: event.target.value }))
              }
            />
          </label>
          <label>
            <span>境界名称（用、分隔）</span>
            <input
              placeholder="引气、凝脉、开府、观海"
              value={realmText}
              onChange={(event) => setRealmText(event.target.value)}
            />
          </label>
          <label>
            <span>势力层级名</span>
            <input
              placeholder="例如：宗门层级"
              value={draft.factionTierName ?? ''}
              onChange={(event) =>
                setDraft((current) => ({ ...current, factionTierName: event.target.value }))
              }
            />
          </label>
          <label>
            <span>势力层级（用、分隔）</span>
            <input
              placeholder="外门、内门、真传、长老"
              value={tierText}
              onChange={(event) => setTierText(event.target.value)}
            />
          </label>
        </div>

        <div className="personal-plan-editor-section">
          <div className="personal-plan-editor-section-title">
            <strong>章节</strong>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  chapters: [
                    ...current.chapters,
                    { title: '新章节', goal: '', conflict: '', hook: '' },
                  ],
                }))
              }
            >
              添加章节
            </button>
          </div>
          {draft.chapters.map((chapter, index) => (
            <div className="personal-plan-editor-chapter" key={index}>
              <div className="personal-plan-editor-chapter-head">
                <strong>第 {index + 1} 章</strong>
                <div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={index === 0}
                    onClick={() =>
                      setDraft((current) => {
                        const chapters = [...current.chapters]
                        ;[chapters[index - 1], chapters[index]] = [
                          chapters[index],
                          chapters[index - 1],
                        ]
                        return { ...current, chapters }
                      })
                    }
                  >
                    上移
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={index === draft.chapters.length - 1}
                    onClick={() =>
                      setDraft((current) => {
                        const chapters = [...current.chapters]
                        ;[chapters[index + 1], chapters[index]] = [
                          chapters[index],
                          chapters[index + 1],
                        ]
                        return { ...current, chapters }
                      })
                    }
                  >
                    下移
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={draft.chapters.length <= 1}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        chapters: current.chapters.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      }))
                    }
                  >
                    删除
                  </button>
                </div>
              </div>
              <input
                placeholder="章节标题"
                value={chapter.title}
                onChange={(event) => patchChapter(index, { title: event.target.value })}
              />
              <textarea
                rows={2}
                placeholder="本章目标"
                value={chapter.goal}
                onChange={(event) => patchChapter(index, { goal: event.target.value })}
              />
              <textarea
                rows={2}
                placeholder="核心冲突"
                value={chapter.conflict}
                onChange={(event) => patchChapter(index, { conflict: event.target.value })}
              />
              <textarea
                rows={2}
                placeholder="章末钩子"
                value={chapter.hook}
                onChange={(event) => patchChapter(index, { hook: event.target.value })}
              />
            </div>
          ))}
        </div>

        {error ? <p className="field-error">{error}</p> : null}
      </div>
    </Modal>
  )
}
