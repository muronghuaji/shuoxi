import { useMemo, useState } from 'react'
import type {
  Chapter,
  CharacterCard,
  CharacterExperience,
  CharacterKnowledgeScope,
  WorkDetail,
} from '../types'
import {
  EXPERIENCE_IMPORTANCE_LABELS,
  KNOWLEDGE_SCOPES,
  chapterLabelForExperience,
  deriveExperiencesFromEvents,
  normalizeCharacterExperience,
  normalizeCharacterExperiences,
  sortCharacterExperiences,
} from '../characterExperience'
import { IconPlus, IconTrash } from './Icons'

interface CharacterExperienceEditorProps {
  character: CharacterCard
  detail: WorkDetail
  chapters: Chapter[]
  onChange: (experiences: CharacterExperience[]) => void
  onToast: (message: string) => void
}

function blankExperience(chapterId?: string, chapterNumber?: number): CharacterExperience {
  return (
    normalizeCharacterExperience({
      title: '',
      summary: '',
      chapterId,
      chapterNumber,
      knowledgeScope: '亲身经历',
      importance: 'major',
      status: 'canon',
      source: 'manual',
    }) ?? {
      id: `exp-${Date.now().toString(36)}`,
      chapterId,
      chapterNumber,
      title: '',
      summary: '',
      participants: [],
      knowledgeScope: '亲身经历',
      learned: [],
      relationshipChanges: [],
      importance: 'major',
      status: 'canon',
      source: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  )
}

export function CharacterExperienceEditor({
  character,
  detail,
  chapters,
  onChange,
  onToast,
}: CharacterExperienceEditorProps) {
  const experiences = useMemo(
    () => sortCharacterExperiences(normalizeCharacterExperiences(character.experiences), chapters),
    [character.experiences, chapters],
  )
  const [editing, setEditing] = useState<CharacterExperience | null>(null)
  const [learnedText, setLearnedText] = useState('')
  const [participantsText, setParticipantsText] = useState('')
  const [relationsText, setRelationsText] = useState('')

  const startNew = () => {
    const chapter = chapters[0]
    const experience = blankExperience(chapter?.id, chapter ? 1 : undefined)
    setEditing(experience)
    setLearnedText('')
    setParticipantsText('')
    setRelationsText('')
  }

  const startEdit = (experience: CharacterExperience) => {
    setEditing({ ...experience })
    setLearnedText(experience.learned.join('\n'))
    setParticipantsText(experience.participants.join('、'))
    setRelationsText(
      experience.relationshipChanges
        .map((item) => [item.targetName, item.type, item.change].filter(Boolean).join(' | '))
        .join('\n'),
    )
  }

  const commit = () => {
    if (!editing) return
    const title = editing.title.trim()
    const summary = editing.summary.trim()
    if (!title && !summary) {
      onToast('人物经历至少需要标题或摘要')
      return
    }
    const chapterIndex = editing.chapterId
      ? chapters.findIndex((chapter) => chapter.id === editing.chapterId)
      : -1
    const nextExperience: CharacterExperience = {
      ...editing,
      title: title || summary.slice(0, 32),
      summary: summary || title,
      chapterNumber: chapterIndex >= 0 ? chapterIndex + 1 : editing.chapterNumber,
      participants: participantsText
        .split(/[、,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12),
      learned: learnedText
        .split(/[\n；;]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12),
      relationshipChanges: relationsText
        .split('\n')
        .map((line) => {
          const [targetName, type, change] = line.split('|').map((item) => item.trim())
          if (!targetName) return null
          return {
            targetName,
            type: type || '关系',
            change: change || '',
          }
        })
        .filter((item): item is { targetName: string; type: string; change: string } => Boolean(item)),
      updatedAt: new Date().toISOString(),
    }
    const exists = experiences.some((item) => item.id === nextExperience.id)
    const next = exists
      ? experiences.map((item) => (item.id === nextExperience.id ? nextExperience : item))
      : [...experiences, nextExperience]
    onChange(sortCharacterExperiences(next, chapters).slice(-500))
    setEditing(null)
    onToast(exists ? '人物经历已更新' : '人物经历已添加')
  }

  const remove = (experience: CharacterExperience) => {
    if (!window.confirm(`删除「${experience.title || '未命名经历'}」？`)) return
    onChange(experiences.filter((item) => item.id !== experience.id))
    onToast('人物经历已删除')
  }

  const backfill = () => {
    const derived = deriveExperiencesFromEvents(detail, character, chapters)
    if (derived.length === 0) {
      onToast('事件簿里没有找到该角色参与的事件')
      return
    }
    const keys = new Set(
      experiences.map((item) =>
        [item.eventId ?? '', item.chapterId ?? '', item.title.trim().toLowerCase()].join('|'),
      ),
    )
    const added: CharacterExperience[] = []
    for (const experience of derived) {
      const key = [experience.eventId ?? '', experience.chapterId ?? '', experience.title.trim().toLowerCase()].join('|')
      if (keys.has(key)) continue
      keys.add(key)
      added.push(experience)
    }
    if (added.length === 0) {
      onToast('事件簿经历已经全部回填过')
      return
    }
    onChange(sortCharacterExperiences([...experiences, ...added], chapters).slice(-500))
    onToast(`已从事件簿回填 ${added.length} 条人物经历`)
  }

  return (
    <section className="character-experience-editor">
      <header className="character-experience-head">
        <div>
          <strong>人物经历</strong>
          <span>
            只记录这个角色亲身经历、亲眼所见、听说或推断的事；AI 写作会把它作为行动依据，避免全知。
          </span>
        </div>
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={backfill}>
            从事件簿回填
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={startNew}>
            <IconPlus size={13} /> 新增经历
          </button>
        </div>
      </header>

      {editing ? (
        <div className="character-experience-form">
          <div className="character-experience-form-grid">
            <label>
              <span>经历标题</span>
              <input
                className="input"
                value={editing.title}
                onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                placeholder="例如：后山听到密谈"
              />
            </label>
            <label>
              <span>章节</span>
              <select
                className="input select"
                value={editing.chapterId ?? ''}
                onChange={(event) => {
                  const chapterId = event.target.value || undefined
                  const chapterIndex = chapterId
                    ? chapters.findIndex((chapter) => chapter.id === chapterId)
                    : -1
                  setEditing({
                    ...editing,
                    chapterId,
                    chapterNumber: chapterIndex >= 0 ? chapterIndex + 1 : undefined,
                  })
                }}
              >
                <option value="">未标章节</option>
                {chapters.map((chapter, index) => (
                  <option value={chapter.id} key={chapter.id}>
                    第 {index + 1} 章 · {chapter.title || '未命名章节'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>认知来源</span>
              <select
                className="input select"
                value={editing.knowledgeScope}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    knowledgeScope: event.target.value as CharacterKnowledgeScope,
                  })
                }
              >
                {KNOWLEDGE_SCOPES.map((scope) => (
                  <option value={scope} key={scope}>
                    {scope}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>重要度</span>
              <select
                className="input select"
                value={editing.importance}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    importance: event.target.value as CharacterExperience['importance'],
                  })
                }
              >
                {Object.entries(EXPERIENCE_IMPORTANCE_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>状态</span>
              <select
                className="input select"
                value={editing.status}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    status: event.target.value as CharacterExperience['status'],
                  })
                }
              >
                <option value="canon">正史</option>
                <option value="rumor">传闻</option>
                <option value="retconned">已撤回</option>
              </select>
            </label>
            <label>
              <span>地点</span>
              <input
                className="input"
                value={editing.location ?? ''}
                onChange={(event) => setEditing({ ...editing, location: event.target.value })}
                placeholder="发生地点"
              />
            </label>
          </div>

          <label className="character-experience-wide">
            <span>发生了什么</span>
            <textarea
              className="input"
              rows={4}
              value={editing.summary}
              onChange={(event) => setEditing({ ...editing, summary: event.target.value })}
              placeholder="一到两句，写清楚前因、经过和结果；不要复制整段正文"
            />
          </label>

          <div className="character-experience-form-grid">
            <label>
              <span>参与者</span>
              <input
                className="input"
                value={participantsText}
                onChange={(event) => setParticipantsText(event.target.value)}
                placeholder="用顿号分隔"
              />
            </label>
            <label>
              <span>这次经历后新知道的事</span>
              <input
                className="input"
                value={learnedText}
                onChange={(event) => setLearnedText(event.target.value)}
                placeholder="用换行 / 分号分隔"
              />
            </label>
            <label>
              <span>伤势 / 持有变化</span>
              <input
                className="input"
                value={editing.injuries ?? ''}
                onChange={(event) => setEditing({ ...editing, injuries: event.target.value })}
                placeholder="例如：左肩受伤"
              />
            </label>
            <label>
              <span>情绪影响</span>
              <input
                className="input"
                value={editing.emotionalImpact ?? ''}
                onChange={(event) =>
                  setEditing({ ...editing, emotionalImpact: event.target.value })
                }
                placeholder="例如：对顾长风信任下降"
              />
            </label>
          </div>

          <label className="character-experience-wide">
            <span>关系变化（每行：对象 | 关系 | 变化）</span>
            <textarea
              className="input"
              rows={2}
              value={relationsText}
              onChange={(event) => setRelationsText(event.target.value)}
              placeholder="顾长风 | 师徒 | 开始怀疑他隐瞒母亲遗书"
            />
          </label>

          <div className="character-experience-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
              取消
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={commit}>
              保存经历
            </button>
          </div>
        </div>
      ) : null}

      <div className="character-experience-list">
        {experiences.length === 0 ? (
          <p className="drawer-empty">
            还没有人物经历。可以手动新增，也可以点「从事件簿回填」把该角色参与过的旧事件转成经历。
          </p>
        ) : (
          experiences
            .slice()
            .reverse()
            .map((experience) => (
              <article
                className={`character-experience-card scope-${experience.knowledgeScope} ${
                  experience.status === 'retconned' ? 'is-retconned' : ''
                }`}
                key={experience.id}
              >
                <header>
                  <div>
                    <strong>{experience.title}</strong>
                    <span>
                      {chapterLabelForExperience(experience, chapters)} · {experience.knowledgeScope}
                      {experience.status === 'rumor' ? ' · 传闻' : ''}
                      {experience.status === 'retconned' ? ' · 已撤回' : ''} ·{' '}
                      {EXPERIENCE_IMPORTANCE_LABELS[experience.importance]}
                    </span>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => startEdit(experience)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-sm"
                      onClick={() => remove(experience)}
                      aria-label={`删除 ${experience.title}`}
                    >
                      <IconTrash size={12} />
                    </button>
                  </div>
                </header>
                <p>{experience.summary}</p>
                {experience.learned.length > 0 ? (
                  <small>学到：{experience.learned.join('；')}</small>
                ) : null}
                {experience.relationshipChanges.length > 0 ? (
                  <small>
                    关系变化：
                    {experience.relationshipChanges
                      .map((item) => `${item.targetName}（${item.type}）${item.change}`)
                      .join('；')}
                  </small>
                ) : null}
                {experience.injuries ? <small>伤势：{experience.injuries}</small> : null}
                {experience.emotionalImpact ? (
                  <small>影响：{experience.emotionalImpact}</small>
                ) : null}
                {experience.source !== 'manual' ? (
                  <small className="character-experience-source">
                    {experience.source === 'sync' ? '同步生成' : '事件簿回填'}
                  </small>
                ) : null}
              </article>
            ))
        )}
      </div>
    </section>
  )
}
