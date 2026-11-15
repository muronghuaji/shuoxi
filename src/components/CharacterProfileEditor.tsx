import { useMemo, useState, type ReactNode } from 'react'
import type {
  Chapter,
  CharacterCard,
  CharacterProfile,
  CharacterRelationNote,
  CharacterStage,
  WorkDetail,
} from '../types'
import {
  buildCharacterProfilePrompt,
  extractVoiceSamples,
  profileCompleteness,
} from '../characterProfile'
import { estimateTokens } from '../utils'
import { IconPlus, IconSparkles, IconTrash } from './Icons'

interface CharacterProfileEditorProps {
  character: CharacterCard
  detail: WorkDetail
  profile: CharacterProfile
  chapters: Chapter[]
  onChange: (profile: CharacterProfile) => void
  onToast: (message: string) => void
}

type ProfileTab = 'core' | 'voice' | 'behavior' | 'preferences' | 'knowledge' | 'relations' | 'stages' | 'dynamic' | 'ai'

const TABS: { id: ProfileTab; label: string; hint: string }[] = [
  { id: 'core', label: '核心', hint: '身份、矛盾、性格、价值观' },
  { id: 'voice', label: '语言', hint: '说话方式、口癖、语气样本' },
  { id: 'behavior', label: '行为', hint: '习惯、小动作、冲突方式' },
  { id: 'preferences', label: '偏好', hint: '喜欢、讨厌、雷点' },
  { id: 'knowledge', label: '认知', hint: '知道、误以为、秘密' },
  { id: 'relations', label: '关系', hint: '对不同人物的态度' },
  { id: 'stages', label: '阶段', hint: '角色在不同卷的变化' },
  { id: 'dynamic', label: '动态', hint: '当前情绪、目标、伤势' },
  { id: 'ai', label: 'AI 预览', hint: '查看模型实际读到的内容' },
]

const DYNAMIC_FIELD_LABELS: Record<string, string> = {
  mood: '情绪',
  currentGoal: '目标',
  injuries: '伤势',
  location: '所在地',
  possessions: '持有物',
}

function formatTimelineTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <label className={`record-field ${multiline ? 'record-field-wide' : ''}`}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          className="input drawer-textarea profile-textarea"
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className="input drawer-input"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  )
}

function LinesField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string
  value: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <label className="record-field record-field-wide">
      <span>{label}</span>
      <textarea
        className="input drawer-textarea profile-textarea"
        rows={rows}
        value={value.join('\n')}
        placeholder={placeholder ?? '每行一条'}
        onChange={(event) => onChange(event.target.value.split('\n'))}
      />
    </label>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="profile-section">
      <div className="profile-section-head">
        <strong>{title}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
      <div className="record-form-grid">{children}</div>
    </section>
  )
}

export function CharacterProfileEditor({
  character,
  detail,
  profile,
  chapters,
  onChange,
  onToast,
}: CharacterProfileEditorProps) {
  const [tab, setTab] = useState<ProfileTab>('core')
  const [copied, setCopied] = useState(false)
  const completeness = useMemo(() => profileCompleteness(profile), [profile])
  const timeline = useMemo(
    () =>
      (detail.characterStateTimeline ?? [])
        .filter((entry) => entry.characterId === character.id)
        .slice(-12)
        .reverse(),
    [detail.characterStateTimeline, character.id],
  )

  const patch = (value: Partial<CharacterProfile>) => onChange({ ...profile, ...value })
  const patchVoice = (value: Partial<CharacterProfile['voice']>) =>
    onChange({ ...profile, voice: { ...profile.voice, ...value } })
  const patchBehavior = (value: Partial<CharacterProfile['behavior']>) =>
    onChange({ ...profile, behavior: { ...profile.behavior, ...value } })
  const patchPreferences = (value: Partial<CharacterProfile['preferences']>) =>
    onChange({ ...profile, preferences: { ...profile.preferences, ...value } })
  const patchKnowledge = (value: Partial<CharacterProfile['knowledge']>) =>
    onChange({ ...profile, knowledge: { ...profile.knowledge, ...value } })
  const patchDynamic = (value: Partial<CharacterProfile['dynamic']>) =>
    onChange({ ...profile, dynamic: { ...profile.dynamic, ...value } })
  const patchMeta = (value: Partial<CharacterProfile['meta']>) =>
    onChange({ ...profile, meta: { ...profile.meta, ...value } })

  const preview = useMemo(
    () =>
      buildCharacterProfilePrompt(
        { ...character, profile } as CharacterCard,
        {
          mode: 'chat',
          detail,
          includeKnowledge: true,
          maxSamples: 5,
        },
      ),
    [character, profile, detail],
  )

  const updateRelation = (index: number, value: Partial<CharacterRelationNote>) => {
    onChange({
      ...profile,
      relationNotes: profile.relationNotes.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...value } : item,
      ),
    })
  }

  const addRelation = () => {
    const available = detail.characters.find(
      (item) =>
        item.id !== character.id &&
        !profile.relationNotes.some((note) => note.characterId === item.id),
    )
    if (!available) return
    onChange({
      ...profile,
      relationNotes: [
        ...profile.relationNotes,
        {
          characterId: available.id,
          address: '',
          addressFormal: '',
          addressIntimate: '',
          addressAngry: '',
          attitude: '',
          unspoken: '',
          trust: '',
          dynamic: '',
        },
      ],
    })
  }

  const updateStage = (index: number, value: Partial<CharacterStage>) => {
    onChange({
      ...profile,
      stages: profile.stages.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...value } : item,
      ),
    })
  }

  const addStage = () => {
    onChange({
      ...profile,
      stages: [
        ...profile.stages,
        {
          id: `stage-${Date.now().toString(36)}`,
          label: `第 ${profile.stages.length + 1} 阶段`,
          fromChapter: '',
          toChapter: '',
          goal: '',
          traits: '',
          voiceNote: '',
        },
      ],
    })
  }

  return (
    <div className="character-profile-editor">
      <div className="profile-editor-head">
        <div>
          <span>深度角色档案</span>
          <strong>{profileCompleteness(profile).score}% 完成</strong>
        </div>
        <p>
          这些设定会进入写作、角色聊天和 AI 检查。语气样本、核心矛盾和“绝不说”是最影响人物是否像本人的部分。
        </p>
      </div>

      <div className="profile-tabs" role="tablist" aria-label="角色深度档案">
        {TABS.map((item) => (
          <button
            type="button"
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.hint}</small>
          </button>
        ))}
      </div>

      {completeness.missing.length > 0 ? (
        <p className="profile-missing">
          还缺：{completeness.missing.join(' · ')}
        </p>
      ) : null}

      {tab === 'core' ? (
        <div className="profile-tab-body">
          <Section title="核心矛盾" hint="他想要什么，又害怕什么；这是角色最重要的发动机。">
            <LinesField
              label="别名 / 常用称呼"
              value={profile.aliases}
              onChange={(aliases) => patch({ aliases })}
              placeholder="例如：薰儿、小兰、阿雪；去姓称呼会自动识别"
            />
            <TextField
              label="核心矛盾"
              value={profile.coreContradiction}
              onChange={(coreContradiction) => patch({ coreContradiction })}
              placeholder="想被理解，但绝不主动解释"
              multiline
            />
            <TextField
              label="表层性格"
              value={profile.surfacePersonality}
              onChange={(surfacePersonality) => patch({ surfacePersonality })}
              placeholder="别人看到的样子"
            />
            <TextField
              label="真实性格"
              value={profile.truePersonality}
              onChange={(truePersonality) => patch({ truePersonality })}
              placeholder="只有亲近/独处时才出现"
            />
            <LinesField
              label="价值观"
              value={profile.values}
              onChange={(values) => patch({ values })}
              placeholder="例如：承诺比命重要"
            />
            <LinesField
              label="恐惧"
              value={profile.fears}
              onChange={(fears) => patch({ fears })}
              placeholder="例如：被抛下、失去控制"
            />
            <LinesField
              label="欲望 / 想要"
              value={profile.desires}
              onChange={(desires) => patch({ desires })}
            />
            <TextField
              label="羞耻 / 软肋"
              value={profile.shame}
              onChange={(shame) => patch({ shame })}
              multiline
            />
            <TextField
              label="道德底线"
              value={profile.moralLine}
              onChange={(moralLine) => patch({ moralLine })}
              placeholder="什么情况下会破例"
              multiline
            />
            <TextField
              label="成长弧线"
              value={profile.growthArc}
              onChange={(growthArc) => patch({ growthArc })}
              placeholder="从什么样的人，变成什么样的人"
              multiline
            />
          </Section>
        </div>
      ) : null}

      {tab === 'voice' ? (
        <div className="profile-tab-body">
          <Section title="说话方式" hint="示例比形容词更有效。不要照抄，只模仿语气。">
            <TextField
              label="语域"
              value={profile.voice.register}
              onChange={(register) => patchVoice({ register })}
              placeholder="文雅 / 粗俗 / 简洁 / 啰嗦 / 正式"
            />
            <TextField
              label="句子长度"
              value={profile.voice.sentenceLength}
              onChange={(sentenceLength) => patchVoice({ sentenceLength })}
              placeholder="短句为主 / 长句多 / 断句多"
            />
            <TextField
              label="常用词 / 用词"
              value={profile.voice.vocabulary}
              onChange={(vocabulary) => patchVoice({ vocabulary })}
              placeholder="偏书面 / 偏江湖 / 爱用军事术语"
            />
            <TextField
              label="语速 / 节奏"
              value={profile.voice.rhythm}
              onChange={(rhythm) => patchVoice({ rhythm })}
              placeholder="说话慢，常停顿"
            />
            <TextField
              label="称呼 / 敬语"
              value={profile.voice.honorifics}
              onChange={(honorifics) => patchVoice({ honorifics })}
              placeholder="对上级称‘您’，对朋友直呼其名"
            />
            <TextField
              label="自称"
              value={profile.voice.selfReference}
              onChange={(selfReference) => patchVoice({ selfReference })}
              placeholder="我 / 老夫 / 本座 / 在下"
            />
            <LinesField
              label="口癖 / 语气词"
              value={profile.voice.verbalTics}
              onChange={(verbalTics) => patchVoice({ verbalTics })}
              placeholder="例如：、罢了、算了"
            />
            <LinesField
              label="口头禅"
              value={profile.voice.catchphrases}
              onChange={(catchphrases) => patchVoice({ catchphrases })}
            />
            <TextField
              label="生气时怎么说话"
              value={profile.voice.angry}
              onChange={(angry) => patchVoice({ angry })}
              multiline
            />
            <TextField
              label="悲伤时怎么说话"
              value={profile.voice.sad}
              onChange={(sad) => patchVoice({ sad })}
              multiline
            />
            <TextField
              label="亲密时怎么说话"
              value={profile.voice.intimate}
              onChange={(intimate) => patchVoice({ intimate })}
              multiline
            />
            <TextField
              label="求人时怎么说话"
              value={profile.voice.pleading}
              onChange={(pleading) => patchVoice({ pleading })}
              multiline
            />
            <TextField
              label="威胁时怎么说话"
              value={profile.voice.threatening}
              onChange={(threatening) => patchVoice({ threatening })}
              multiline
            />
            <TextField
              label="撒谎时怎么说话"
              value={profile.voice.lying}
              onChange={(lying) => patchVoice({ lying })}
              multiline
            />
            <LinesField
              label="绝不说的话 / 绝不用的句式"
              value={profile.voice.neverSays}
              onChange={(neverSays) => patchVoice({ neverSays })}
              placeholder="例如：不会说‘相信我’"
            />
            <LinesField
              label="语气样本"
              value={profile.voice.samples}
              onChange={(samples) => patchVoice({ samples })}
              rows={5}
              placeholder="每行一句本人会说的话，最好从正文里摘"
            />
            <div className="profile-inline-action">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const extracted = extractVoiceSamples(
                    { ...character, profile },
                    chapters,
                    5,
                  )
                  if (extracted.length === 0) {
                    onToast('正文里还没有找到这个角色附近的对话')
                    return
                  }
                  const merged = Array.from(
                    new Set([...profile.voice.samples, ...extracted].map((item) => item.trim()).filter(Boolean)),
                  ).slice(0, 20)
                  patchVoice({ samples: merged })
                  onToast(`从正文提取了 ${extracted.length} 句语气样本`)
                }}
              >
                <IconSparkles size={14} />
                从正文提取语气样本
              </button>
              <span>扫描最近章节里角色附近的引号对白，只做本地提取，不调用 AI。</span>
            </div>
            <TextField
              label="叙述滤镜"
              value={profile.voice.narrationFilter}
              onChange={(narrationFilter) => patchVoice({ narrationFilter })}
              placeholder="作为视角人物时，他/她会注意什么、忽略什么"
              multiline
            />
          </Section>
        </div>
      ) : null}

      {tab === 'behavior' ? (
        <div className="profile-tab-body">
          <Section title="可观察行为" hint="写动作，不写心理标签。">
            <LinesField
              label="日常习惯"
              value={profile.behavior.habits}
              onChange={(habits) => patchBehavior({ habits })}
              placeholder="例如：进门先看出口"
            />
            <LinesField
              label="手势 / 小动作"
              value={profile.behavior.gestures}
              onChange={(gestures) => patchBehavior({ gestures })}
            />
            <LinesField
              label="紧张时"
              value={profile.behavior.nervousTells}
              onChange={(nervousTells) => patchBehavior({ nervousTells })}
              placeholder="例如：摸袖口、反复整理衣领"
            />
            <LinesField
              label="说谎时"
              value={profile.behavior.lyingTells}
              onChange={(lyingTells) => patchBehavior({ lyingTells })}
            />
            <LinesField
              label="生气时"
              value={profile.behavior.angryTells}
              onChange={(angryTells) => patchBehavior({ angryTells })}
            />
            <LinesField
              label="放松时"
              value={profile.behavior.relaxedTells}
              onChange={(relaxedTells) => patchBehavior({ relaxedTells })}
            />
            <TextField
              label="站姿 / 走路 / 坐姿"
              value={profile.behavior.posture}
              onChange={(posture) => patchBehavior({ posture })}
            />
            <TextField
              label="冲突方式"
              value={profile.behavior.conflictStyle}
              onChange={(conflictStyle) => patchBehavior({ conflictStyle })}
              multiline
            />
            <TextField
              label="亲密关系边界"
              value={profile.behavior.intimacyBoundary}
              onChange={(intimacyBoundary) => patchBehavior({ intimacyBoundary })}
              multiline
            />
            <TextField
              label="金钱 / 消费习惯"
              value={profile.behavior.moneyHabit}
              onChange={(moneyHabit) => patchBehavior({ moneyHabit })}
            />
            <TextField
              label="日常作息"
              value={profile.behavior.dailyRoutine}
              onChange={(dailyRoutine) => patchBehavior({ dailyRoutine })}
              multiline
            />
            <TextField
              label="战斗 / 行动习惯"
              value={profile.behavior.fightingStyle}
              onChange={(fightingStyle) => patchBehavior({ fightingStyle })}
              multiline
            />
          </Section>
        </div>
      ) : null}

      {tab === 'preferences' ? (
        <div className="profile-tab-body">
          <Section title="喜欢与讨厌" hint="只在相关场景里取用，不要每章都展示。">
            <LinesField
              label="喜欢"
              value={profile.preferences.likes}
              onChange={(likes) => patchPreferences({ likes })}
            />
            <LinesField
              label="讨厌"
              value={profile.preferences.dislikes}
              onChange={(dislikes) => patchPreferences({ dislikes })}
            />
            <LinesField
              label="食物"
              value={profile.preferences.foods}
              onChange={(foods) => patchPreferences({ foods })}
            />
            <LinesField
              label="爱好"
              value={profile.preferences.hobbies}
              onChange={(hobbies) => patchPreferences({ hobbies })}
            />
            <LinesField
              label="审美"
              value={profile.preferences.aesthetics}
              onChange={(aesthetics) => patchPreferences({ aesthetics })}
            />
            <LinesField
              label="感官偏好"
              value={profile.preferences.sensory}
              onChange={(sensory) => patchPreferences({ sensory })}
              placeholder="声音、气味、温度、光线"
            />
            <LinesField
              label="舒适区"
              value={profile.preferences.comforts}
              onChange={(comforts) => patchPreferences({ comforts })}
            />
            <LinesField
              label="雷点 / 应激点"
              value={profile.preferences.triggers}
              onChange={(triggers) => patchPreferences({ triggers })}
            />
            <LinesField
              label="常聊话题"
              value={profile.preferences.topics}
              onChange={(topics) => patchPreferences({ topics })}
            />
          </Section>
        </div>
      ) : null}

      {tab === 'knowledge' ? (
        <div className="profile-tab-body">
          <Section title="认知边界" hint="角色只能使用自己知道的信息，不能开天眼。">
            <LinesField
              label="知道什么"
              value={profile.knowledge.knows}
              onChange={(knows) => patchKnowledge({ knows })}
              rows={4}
            />
            <LinesField
              label="误以为什么"
              value={profile.knowledge.believes}
              onChange={(believes) => patchKnowledge({ believes })}
              rows={4}
            />
            <LinesField
              label="秘密 / 隐瞒"
              value={profile.knowledge.secrets}
              onChange={(secrets) => patchKnowledge({ secrets })}
              rows={4}
            />
            <LinesField
              label="不知道什么"
              value={profile.knowledge.blindSpots}
              onChange={(blindSpots) => patchKnowledge({ blindSpots })}
              rows={4}
            />
            <LinesField
              label="偏见"
              value={profile.knowledge.biases}
              onChange={(biases) => patchKnowledge({ biases })}
              rows={3}
            />
          </Section>
        </div>
      ) : null}

      {tab === 'relations' ? (
        <div className="profile-tab-body">
          <div className="profile-section-head">
            <strong>关系专属态度</strong>
            <span>不是全局关系类型，而是“他对某个人具体怎么说话、怎么想”</span>
          </div>
          <div className="profile-relation-list">
            {profile.relationNotes.map((note, index) => {
              const other = detail.characters.find((item) => item.id === note.characterId)
              return (
                <div className="profile-relation-card" key={`${note.characterId}-${index}`}>
                  <div className="profile-relation-head">
                    <select
                      className="input select drawer-input"
                      value={note.characterId}
                      onChange={(event) => updateRelation(index, { characterId: event.target.value })}
                    >
                      <option value="">选择角色</option>
                      {detail.characters
                        .filter((item) => item.id !== character.id)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-sm"
                      onClick={() =>
                        onChange({
                          ...profile,
                          relationNotes: profile.relationNotes.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        })
                      }
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                  <TextField
                    label={`对 ${other?.name || '对方'} 的称呼`}
                    value={note.address}
                    onChange={(address) => updateRelation(index, { address })}
                  />
                  <TextField
                    label="正式场合"
                    value={note.addressFormal ?? ''}
                    onChange={(addressFormal) => updateRelation(index, { addressFormal })}
                  />
                  <TextField
                    label="亲密时"
                    value={note.addressIntimate ?? ''}
                    onChange={(addressIntimate) => updateRelation(index, { addressIntimate })}
                  />
                  <TextField
                    label="生气时"
                    value={note.addressAngry ?? ''}
                    onChange={(addressAngry) => updateRelation(index, { addressAngry })}
                  />
                  <TextField
                    label="态度"
                    value={note.attitude}
                    onChange={(attitude) => updateRelation(index, { attitude })}
                    multiline
                  />
                  <TextField
                    label="没说的话"
                    value={note.unspoken}
                    onChange={(unspoken) => updateRelation(index, { unspoken })}
                    multiline
                  />
                  <TextField
                    label="信任 / 权力位置"
                    value={note.trust}
                    onChange={(trust) => updateRelation(index, { trust })}
                  />
                  <TextField
                    label="最近变化"
                    value={note.dynamic}
                    onChange={(dynamic) => updateRelation(index, { dynamic })}
                    multiline
                  />
                </div>
              )
            })}
          </div>
          <button type="button" className="btn btn-ghost btn-sm profile-add" onClick={addRelation}>
            <IconPlus size={14} />
            添加关系态度
          </button>
        </div>
      ) : null}

      {tab === 'stages' ? (
        <div className="profile-tab-body">
          <div className="profile-section-head">
            <strong>角色阶段</strong>
            <span>同一角色在不同卷的变化；写作时只读取当前阶段</span>
          </div>
          <div className="profile-stage-list">
            {profile.stages.map((stage, index) => (
              <div className="profile-stage-card" key={stage.id}>
                <div className="profile-relation-head">
                  <span>阶段 {index + 1}</span>
                  <button
                    type="button"
                    className="btn btn-danger-ghost btn-sm"
                    onClick={() =>
                      onChange({
                        ...profile,
                        stages: profile.stages.filter((_, itemIndex) => itemIndex !== index),
                      })
                    }
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
                <div className="record-form-grid">
                  <TextField label="阶段名" value={stage.label} onChange={(label) => updateStage(index, { label })} />
                  <TextField label="起始章" value={stage.fromChapter} onChange={(fromChapter) => updateStage(index, { fromChapter })} placeholder="例如 1 或第一卷" />
                  <TextField label="结束章" value={stage.toChapter} onChange={(toChapter) => updateStage(index, { toChapter })} />
                  <TextField label="阶段目标" value={stage.goal} onChange={(goal) => updateStage(index, { goal })} multiline />
                  <TextField label="阶段性格" value={stage.traits} onChange={(traits) => updateStage(index, { traits })} multiline />
                  <TextField label="阶段语气" value={stage.voiceNote} onChange={(voiceNote) => updateStage(index, { voiceNote })} multiline />
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm profile-add" onClick={addStage}>
            <IconPlus size={14} />
            添加角色阶段
          </button>
        </div>
      ) : null}

      {tab === 'dynamic' ? (
        <div className="profile-tab-body">
          <Section title="当前状态" hint="静态人设不变，动态状态每章更新。">
            <TextField
              label="当前情绪"
              value={profile.dynamic.mood}
              onChange={(mood) => patchDynamic({ mood })}
            />
            <TextField
              label="当前目标"
              value={profile.dynamic.currentGoal}
              onChange={(currentGoal) => patchDynamic({ currentGoal })}
              multiline
            />
            <TextField
              label="当前伤势 / 身体状态"
              value={profile.dynamic.injuries}
              onChange={(injuries) => patchDynamic({ injuries })}
            />
            <TextField
              label="当前所在地"
              value={profile.dynamic.location}
              onChange={(location) => patchDynamic({ location })}
            />
            <TextField
              label="当前持有物"
              value={profile.dynamic.possessions}
              onChange={(possessions) => patchDynamic({ possessions })}
              multiline
            />
            <TextField
              label="当前卷 / 角色阶段"
              value={profile.dynamic.arc}
              onChange={(arc) => patchDynamic({ arc })}
            />
          </Section>
          <Section title="元信息" hint="帮助 AI 判断角色重要性和出场。">
            <label className="record-field">
              <span>重要度</span>
              <select
                className="input select drawer-input"
                value={profile.meta.importance}
                onChange={(event) =>
                  patchMeta({ importance: event.target.value as CharacterProfile['meta']['importance'] })
                }
              >
                <option value="core">核心角色</option>
                <option value="major">重要角色</option>
                <option value="minor">次要角色</option>
                <option value="extra">路人</option>
              </select>
            </label>
            <label className="record-field profile-checkbox">
              <span>视角角色</span>
              <input
                type="checkbox"
                checked={profile.meta.pov}
                onChange={(event) => patchMeta({ pov: event.target.checked })}
              />
              <small>本章 / 本卷主要视角</small>
            </label>
            <TextField
              label="首次登场"
              value={profile.meta.firstAppearance}
              onChange={(firstAppearance) => patchMeta({ firstAppearance })}
            />
            <TextField
              label="剧情保护"
              value={profile.meta.plotArmor}
              onChange={(plotArmor) => patchMeta({ plotArmor })}
              placeholder="不能死 / 不能黑化 / 不能与某人决裂"
              multiline
            />
            <TextField
              label="给 AI 的额外要求"
              value={profile.meta.aiNotes}
              onChange={(aiNotes) => patchMeta({ aiNotes })}
              placeholder="例如：不要让他主动解释自己"
              multiline
            />
          </Section>
          <div className="profile-section">
            <div className="profile-section-head">
              <strong>状态时间线</strong>
              <span>每次章节同步自动记录最近 12 次动态变化</span>
            </div>
            {timeline.length > 0 ? (
              <div className="profile-timeline-list">
                {timeline.map((entry) => (
                  <div className="profile-timeline-row" key={entry.id}>
                    <header>
                      <strong>{entry.chapterTitle || '未命名章节'}</strong>
                      <span>{formatTimelineTime(entry.createdAt)}</span>
                    </header>
                    <div>
                      {entry.changes.map((change, index) => (
                        <span key={`${entry.id}-${change.field}-${index}`}>
                          {DYNAMIC_FIELD_LABELS[change.field] ?? change.field}：
                          {change.from || '—'} → {change.to || '—'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="drawer-empty">
                还没有动态记录。写完一章并自动同步设定后，这里会显示角色当时的情绪、目标、伤势、所在地和持有物变化。
              </p>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'ai' ? (
        <div className="profile-tab-body">
          <div className="profile-ai-preview-head">
            <div>
              <strong>AI 实际读到的角色档案</strong>
              <span>
                约 {estimateTokens(preview)} tokens · 写作时还会按场景裁剪，聊天时会使用完整版
              </span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                void navigator.clipboard?.writeText(preview)
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1200)
              }}
            >
              {copied ? '已复制' : '复制预览'}
            </button>
          </div>
          <pre className="profile-ai-preview">{preview}</pre>
          <div className="profile-ai-hint">
            <IconSparkles size={14} />
            AI 会优先读取语气样本、核心矛盾、“绝不说”和认知边界；喜欢/讨厌只在相关场景使用。
          </div>
        </div>
      ) : null}
    </div>
  )
}
