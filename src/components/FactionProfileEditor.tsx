import { useMemo, useState, type ReactNode } from 'react'
import type {
  FactionCard,
  FactionInternalGroup,
  FactionMembership,
  FactionProfile,
  FactionRelationNote,
  FactionStage,
  WorkDetail,
} from '../types'
import {
  buildFactionProfilePrompt,
  factionMemberRecords,
  factionProfileCompleteness,
  factionRelationTargetName,
  membershipOf,
} from '../factionProfile'
import { estimateTokens } from '../utils'
import { IconPlus, IconSparkles, IconTrash } from './Icons'

interface FactionProfileEditorProps {
  faction: FactionCard
  detail: WorkDetail
  profile: FactionProfile
  onChange: (profile: FactionProfile) => void
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onToast: (message: string) => void
}

type FactionTab =
  | 'core'
  | 'structure'
  | 'behavior'
  | 'culture'
  | 'resources'
  | 'knowledge'
  | 'relations'
  | 'members'
  | 'stages'
  | 'dynamic'
  | 'ai'

const TABS: { id: FactionTab; label: string; hint: string }[] = [
  { id: 'core', label: '核心', hint: '公开、真实、矛盾、目的' },
  { id: 'structure', label: '结构', hint: '权力、决策、派系' },
  { id: 'behavior', label: '行为', hint: '遇袭、外交、危机' },
  { id: 'culture', label: '文化', hint: '信条、仪式、口号' },
  { id: 'resources', label: '资源', hint: '财政、武力、瓶颈' },
  { id: 'knowledge', label: '情报', hint: '知道、误判、渗透' },
  { id: 'relations', label: '关系', hint: '公开、真实、秘密' },
  { id: 'members', label: '成员', hint: '人物与秘密身份' },
  { id: 'stages', label: '阶段', hint: '兴衰阶段' },
  { id: 'dynamic', label: '动态', hint: '当前状态与时间线' },
  { id: 'ai', label: 'AI 预览', hint: '模型实际读到的内容' },
]

function Field({
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

const DYNAMIC_LABELS: Record<string, string> = {
  stage: '阶段',
  leaderState: '领袖状态',
  morale: '士气',
  treasury: '财政',
  forces: '武力',
  territory: '领地',
  diplomacy: '外交',
  internalStruggle: '内斗',
  currentOperation: '当前行动',
  publicImage: '公开形象',
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function FactionProfileEditor({
  faction,
  detail,
  profile,
  onChange,
  onUpdateDetail,
  onToast,
}: FactionProfileEditorProps) {
  const [tab, setTab] = useState<FactionTab>('core')
  const [copied, setCopied] = useState(false)
  const completeness = useMemo(() => factionProfileCompleteness(profile), [profile])
  const members = useMemo(() => factionMemberRecords(detail, faction), [detail, faction])
  const timeline = useMemo(
    () =>
      (detail.factionStateTimeline ?? [])
        .filter((entry) => entry.factionId === faction.id)
        .slice(-12)
        .reverse(),
    [detail.factionStateTimeline, faction.id],
  )

  const patch = (value: Partial<FactionProfile>) => onChange({ ...profile, ...value })
  const patchGovernance = (value: Partial<FactionProfile['governance']>) =>
    onChange({ ...profile, governance: { ...profile.governance, ...value } })
  const patchBehavior = (value: Partial<FactionProfile['behavior']>) =>
    onChange({ ...profile, behavior: { ...profile.behavior, ...value } })
  const patchCulture = (value: Partial<FactionProfile['culture']>) =>
    onChange({ ...profile, culture: { ...profile.culture, ...value } })
  const patchResources = (value: Partial<FactionProfile['resources']>) =>
    onChange({ ...profile, resources: { ...profile.resources, ...value } })
  const patchKnowledge = (value: Partial<FactionProfile['knowledge']>) =>
    onChange({ ...profile, knowledge: { ...profile.knowledge, ...value } })
  const patchDynamic = (value: Partial<FactionProfile['dynamic']>) =>
    onChange({ ...profile, dynamic: { ...profile.dynamic, ...value } })
  const patchMeta = (value: Partial<FactionProfile['meta']>) =>
    onChange({ ...profile, meta: { ...profile.meta, ...value } })

  const preview = useMemo(
    () =>
      buildFactionProfilePrompt(
        { ...faction, profile },
        {
          mode: 'audit',
          detail,
          maxRelations: 40,
        },
      ),
    [faction, profile, detail],
  )

  const updateMembership = (
    characterId: string,
    value: Partial<FactionMembership>,
  ) => {
    const memberships = detail.factionMemberships ?? []
    const existing = membershipOf(detail, faction.id, characterId)
    if (existing) {
      onUpdateDetail({
        factionMemberships: memberships.map((item) =>
          item.id === existing.id ? { ...item, ...value } : item,
        ),
      })
      return
    }
    onUpdateDetail({
      factionMemberships: [
        ...memberships,
        {
          id: uid('fm'),
          factionId: faction.id,
          characterId,
          role: value.role ?? '',
          publicRole: value.publicRole ?? '',
          secret: value.secret ?? false,
          loyalty: value.loyalty ?? '',
          status: value.status ?? '',
        },
      ],
    })
  }

  const removeMembership = (characterId: string) => {
    onUpdateDetail({
      factionMemberships: (detail.factionMemberships ?? []).filter(
        (item) => !(item.factionId === faction.id && item.characterId === characterId),
      ),
    })
  }

  const addMembership = () => {
    const available = (detail.characters ?? []).find(
      (character) => !members.some((member) => member.character.id === character.id),
    )
    if (!available) {
      onToast('没有可添加的新角色；也可以先在角色卡里把角色关联到这个势力')
      return
    }
    updateMembership(available.id, { role: '成员' })
  }

  const updateRelation = (
    index: number,
    value: Partial<FactionRelationNote>,
  ) => {
    onChange({
      ...profile,
      relations: profile.relations.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...value } : item,
      ),
    })
  }

  const addRelation = () => {
    const characterTarget = detail.characters.find(
      (character) =>
        !profile.relations.some(
          (relation) =>
            relation.targetType === 'character' && relation.targetId === character.id,
        ),
    )
    const factionTarget = detail.factions.find(
      (item) =>
        item.id !== faction.id &&
        !profile.relations.some(
          (relation) =>
            relation.targetType === 'faction' && relation.targetId === item.id,
        ),
    )
    const target = factionTarget
      ? { targetType: 'faction' as const, targetId: factionTarget.id }
      : characterTarget
        ? { targetType: 'character' as const, targetId: characterTarget.id }
        : null
    if (!target) return
    onChange({
      ...profile,
      relations: [
        ...profile.relations,
        {
          ...target,
          publicStance: '',
          trueStance: '',
          secretDeal: '',
          history: '',
          tension: '',
        },
      ],
    })
  }

  const updateGroup = (index: number, value: Partial<FactionInternalGroup>) => {
    onChange({
      ...profile,
      governance: {
        ...profile.governance,
        internalGroups: profile.governance.internalGroups.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...value } : item,
        ),
      },
    })
  }

  const addGroup = () => {
    onChange({
      ...profile,
      governance: {
        ...profile.governance,
        internalGroups: [
          ...profile.governance.internalGroups,
          {
            id: uid('fg'),
            name: `派系 ${profile.governance.internalGroups.length + 1}`,
            goal: '',
            stance: '',
            power: '',
            secret: '',
          },
        ],
      },
    })
  }

  const updateStage = (index: number, value: Partial<FactionStage>) => {
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
          id: uid('fs'),
          label: `阶段 ${profile.stages.length + 1}`,
          fromChapter: '',
          toChapter: '',
          goal: '',
          status: '',
        },
      ],
    })
  }

  return (
    <div className="character-profile-editor faction-profile-editor">
      <div className="profile-editor-head">
        <div>
          <span>势力深度档案</span>
          <strong>{completeness.score}% 完成</strong>
        </div>
        <p>
          势力不是一个人。这里重点写权力、决策、资源、情报、内部派系和当前状态；写作时 AI 会用制度、成员反应和资源限制来表现它。
        </p>
      </div>

      <div className="profile-tabs" role="tablist" aria-label="势力深度档案">
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
        <p className="profile-missing">还缺：{completeness.missing.join(' · ')}</p>
      ) : null}

      {tab === 'core' ? (
        <div className="profile-tab-body">
          <Section title="身份与核心" hint="公开形象和真实面目的差距，决定这个组织有没有戏。">
            <LinesField
              label="别名 / 代号 / 旧名"
              value={profile.aliases}
              onChange={(aliases) => patch({ aliases })}
            />
            <Field label="组织类型" value={profile.category} onChange={(category) => patch({ category })} placeholder="宗门 / 公司 / 国家 / 教团 / 帮派 / 舰队" />
            <Field label="规模" value={profile.scale} onChange={(scale) => patch({ scale })} placeholder="小队 / 城市 / 国家 / 跨大陆" />
            <Field label="合法性" value={profile.legitimacy} onChange={(legitimacy) => patch({ legitimacy })} placeholder="公开合法 / 灰色 / 地下 / 被通缉" />
            <Field label="公开形象" value={profile.publicFace} onChange={(publicFace) => patch({ publicFace })} multiline />
            <Field label="真实面目" value={profile.trueFace} onChange={(trueFace) => patch({ trueFace })} multiline />
            <Field label="核心矛盾" value={profile.coreContradiction} onChange={(coreContradiction) => patch({ coreContradiction })} multiline placeholder="靠规矩维持秩序，但规矩本身是假的" />
            <Field label="存在目的" value={profile.purpose} onChange={(purpose) => patch({ purpose })} multiline />
            <Field label="起源" value={profile.origin} onChange={(origin) => patch({ origin })} multiline />
            <LinesField label="价值观" value={profile.values} onChange={(values) => patch({ values })} />
            <LinesField label="恐惧" value={profile.fears} onChange={(fears) => patch({ fears })} />
            <LinesField label="欲望" value={profile.desires} onChange={(desires) => patch({ desires })} />
            <Field label="红线" value={profile.redLine} onChange={(redLine) => patch({ redLine })} multiline placeholder="什么情况下会破例" />
            <Field label="最大弱点" value={profile.weakness} onChange={(weakness) => patch({ weakness })} multiline />
            <Field label="历史创伤" value={profile.trauma} onChange={(trauma) => patch({ trauma })} multiline />
            <Field label="兴衰弧线" value={profile.growthArc} onChange={(growthArc) => patch({ growthArc })} multiline />
          </Section>
        </div>
      ) : null}

      {tab === 'structure' ? (
        <div className="profile-tab-body">
          <Section title="权力与决策" hint="名义权力和实际权力可以不是同一个人。">
            <Field label="制度形态" value={profile.governance.system} onChange={(system) => patchGovernance({ system })} placeholder="集权 / 寡头 / 议会 / 家族 / 军队 / 网络" />
            <Field label="名义负责人" value={profile.governance.legitimateLeader} onChange={(legitimateLeader) => patchGovernance({ legitimateLeader })} />
            <Field label="实际掌权者" value={profile.governance.actualPower} onChange={(actualPower) => patchGovernance({ actualPower })} />
            <Field label="决策流程" value={profile.governance.decisionProcess} onChange={(decisionProcess) => patchGovernance({ decisionProcess })} multiline />
            <Field label="继承 / 交接" value={profile.governance.succession} onChange={(succession) => patchGovernance({ succession })} multiline />
            <Field label="议事机构" value={profile.governance.council} onChange={(council) => patchGovernance({ council })} multiline />
            <Field label="执法 / 监督" value={profile.governance.enforcement} onChange={(enforcement) => patchGovernance({ enforcement })} multiline />
            <Field label="情报机构" value={profile.governance.intelligence} onChange={(intelligence) => patchGovernance({ intelligence })} multiline />
            <Field label="晋升规则" value={profile.governance.promotion} onChange={(promotion) => patchGovernance({ promotion })} multiline />
            <Field label="惩罚 / 叛逃处理" value={profile.governance.punishment} onChange={(punishment) => patchGovernance({ punishment })} multiline />
          </Section>
          <div className="profile-section">
            <div className="profile-section-head">
              <strong>内部派系</strong>
              <span>组织内部的利益集团，不是上下级部门</span>
            </div>
            <div className="profile-stage-list">
              {profile.governance.internalGroups.map((group, index) => (
                <div className="profile-stage-card" key={group.id}>
                  <div className="profile-relation-head">
                    <span>派系 {index + 1}</span>
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-sm"
                      onClick={() =>
                        patchGovernance({
                          internalGroups: profile.governance.internalGroups.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        })
                      }
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                  <div className="record-form-grid">
                    <Field label="派系名称" value={group.name} onChange={(name) => updateGroup(index, { name })} />
                    <Field label="实力" value={group.power} onChange={(power) => updateGroup(index, { power })} />
                    <Field label="诉求" value={group.goal} onChange={(goal) => updateGroup(index, { goal })} multiline />
                    <Field label="立场" value={group.stance} onChange={(stance) => updateGroup(index, { stance })} multiline />
                    <Field label="秘密" value={group.secret} onChange={(secret) => updateGroup(index, { secret })} multiline />
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-ghost btn-sm profile-add" onClick={addGroup}>
              <IconPlus size={14} /> 添加内部派系
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'behavior' ? (
        <div className="profile-tab-body">
          <Section title="行为与决策逻辑" hint="势力遇到事情会怎么反应；这决定 AI 写出来的组织行为像不像它。">
            <Field label="遇袭 / 威胁反应" value={profile.behavior.threatResponse} onChange={(threatResponse) => patchBehavior({ threatResponse })} multiline />
            <Field label="外交风格" value={profile.behavior.diplomacy} onChange={(diplomacy) => patchBehavior({ diplomacy })} multiline />
            <Field label="冲突风格" value={profile.behavior.conflictStyle} onChange={(conflictStyle) => patchBehavior({ conflictStyle })} multiline />
            <Field label="谈判风格" value={profile.behavior.negotiation} onChange={(negotiation) => patchBehavior({ negotiation })} multiline />
            <Field label="风险偏好" value={profile.behavior.riskAppetite} onChange={(riskAppetite) => patchBehavior({ riskAppetite })} multiline />
            <Field label="内部争端处理" value={profile.behavior.internalDispute} onChange={(internalDispute) => patchBehavior({ internalDispute })} multiline />
            <Field label="扩张方式" value={profile.behavior.expansion} onChange={(expansion) => patchBehavior({ expansion })} multiline />
            <Field label="危机处理" value={profile.behavior.crisis} onChange={(crisis) => patchBehavior({ crisis })} multiline />
            <Field label="什么情况下会破例" value={profile.behavior.redLineBreak} onChange={(redLineBreak) => patchBehavior({ redLineBreak })} multiline />
            <Field label="默认反应" value={profile.behavior.defaultReaction} onChange={(defaultReaction) => patchBehavior({ defaultReaction })} multiline />
          </Section>
        </div>
      ) : null}

      {tab === 'culture' ? (
        <div className="profile-tab-body">
          <Section title="文化与语言" hint="用仪式、称呼、禁忌和口号表现组织，不用旁白解释。">
            <Field label="信条" value={profile.culture.beliefs} onChange={(beliefs) => patchCulture({ beliefs })} multiline />
            <LinesField label="仪式 / 节日" value={profile.culture.rituals} onChange={(rituals) => patchCulture({ rituals })} />
            <LinesField label="禁忌" value={profile.culture.taboos} onChange={(taboos) => patchCulture({ taboos })} />
            <Field label="象征 / 标志" value={profile.culture.symbols} onChange={(symbols) => patchCulture({ symbols })} />
            <Field label="服饰 / 建筑" value={profile.culture.dress} onChange={(dress) => patchCulture({ dress })} multiline />
            <Field label="内部称呼" value={profile.culture.addressInternal} onChange={(addressInternal) => patchCulture({ addressInternal })} />
            <Field label="对外称呼" value={profile.culture.addressExternal} onChange={(addressExternal) => patchCulture({ addressExternal })} />
            <Field label="荣誉观" value={profile.culture.honor} onChange={(honor) => patchCulture({ honor })} multiline />
            <Field label="对待外人" value={profile.culture.outsider} onChange={(outsider) => patchCulture({ outsider })} multiline />
            <Field label="公开宣传" value={profile.culture.propaganda} onChange={(propaganda) => patchCulture({ propaganda })} multiline />
            <LinesField label="口号 / 誓词 / 公告样本" value={profile.culture.slogans} onChange={(slogans) => patchCulture({ slogans })} rows={4} placeholder="每行一条组织会公开说的话" />
          </Section>
        </div>
      ) : null}

      {tab === 'resources' ? (
        <div className="profile-tab-body">
          <Section title="资源与约束" hint="没有资源限制，AI 会把势力写成无所不能。">
            <Field label="财政" value={profile.resources.finance} onChange={(finance) => patchResources({ finance })} />
            <Field label="人力" value={profile.resources.manpower} onChange={(manpower) => patchResources({ manpower })} />
            <Field label="武力" value={profile.resources.military} onChange={(military) => patchResources({ military })} />
            <Field label="领地" value={profile.resources.territory} onChange={(territory) => patchResources({ territory })} />
            <Field label="补给 / 供应链" value={profile.resources.supply} onChange={(supply) => patchResources({ supply })} multiline />
            <Field label="情报资源" value={profile.resources.intelligence} onChange={(intelligence) => patchResources({ intelligence })} multiline />
            <Field label="技术 / 知识" value={profile.resources.technology} onChange={(technology) => patchResources({ technology })} multiline />
            <Field label="合法性来源" value={profile.resources.legitimacy} onChange={(legitimacy) => patchResources({ legitimacy })} multiline />
            <LinesField label="依赖" value={profile.resources.dependencies} onChange={(dependencies) => patchResources({ dependencies })} />
            <LinesField label="瓶颈" value={profile.resources.bottlenecks} onChange={(bottlenecks) => patchResources({ bottlenecks })} />
            <LinesField label="隐藏资产 / 底牌" value={profile.resources.hiddenAssets} onChange={(hiddenAssets) => patchResources({ hiddenAssets })} />
            <LinesField label="债务 / 人情" value={profile.resources.debts} onChange={(debts) => patchResources({ debts })} />
          </Section>
        </div>
      ) : null}

      {tab === 'knowledge' ? (
        <div className="profile-tab-body">
          <Section title="情报与认知边界" hint="势力只能使用它知道的信息。">
            <LinesField label="知道什么" value={profile.knowledge.knows} onChange={(knows) => patchKnowledge({ knows })} rows={4} />
            <LinesField label="误以为什么" value={profile.knowledge.believes} onChange={(believes) => patchKnowledge({ believes })} rows={4} />
            <LinesField label="隐瞒什么" value={profile.knowledge.hides} onChange={(hides) => patchKnowledge({ hides })} rows={4} />
            <LinesField label="不知道什么" value={profile.knowledge.blindSpots} onChange={(blindSpots) => patchKnowledge({ blindSpots })} rows={4} />
            <LinesField label="被谁渗透" value={profile.knowledge.infiltratedBy} onChange={(infiltratedBy) => patchKnowledge({ infiltratedBy })} />
            <LinesField label="情报来源" value={profile.knowledge.sources} onChange={(sources) => patchKnowledge({ sources })} />
          </Section>
        </div>
      ) : null}

      {tab === 'relations' ? (
        <div className="profile-tab-body">
          <div className="profile-section-head">
            <strong>对外关系</strong>
            <span>公开态度、真实态度和秘密交易分开写</span>
          </div>
          <div className="profile-stage-list">
            {profile.relations.map((relation, index) => (
              <div className="profile-stage-card" key={`${relation.targetType}-${relation.targetId}-${index}`}>
                <div className="profile-relation-head">
                  <select
                    className="input select drawer-input"
                    value={`${relation.targetType}:${relation.targetId}`}
                    onChange={(event) => {
                      const [targetType, targetId] = event.target.value.split(':')
                      updateRelation(index, {
                        targetType: targetType === 'character' ? 'character' : 'faction',
                        targetId,
                      })
                    }}
                  >
                    <option value="">选择对象</option>
                    <optgroup label="势力">
                      {detail.factions
                        .filter((item) => item.id !== faction.id)
                        .map((item) => (
                          <option key={item.id} value={`faction:${item.id}`}>
                            {item.name}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="角色">
                      {detail.characters.map((item) => (
                        <option key={item.id} value={`character:${item.id}`}>
                          {item.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <button
                    type="button"
                    className="btn btn-danger-ghost btn-sm"
                    onClick={() =>
                      onChange({
                        ...profile,
                        relations: profile.relations.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      })
                    }
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
                <div className="record-form-grid">
                  <Field label="公开态度" value={relation.publicStance} onChange={(publicStance) => updateRelation(index, { publicStance })} multiline />
                  <Field label="真实态度" value={relation.trueStance} onChange={(trueStance) => updateRelation(index, { trueStance })} multiline />
                  <Field label="秘密交易 / 协议" value={relation.secretDeal} onChange={(secretDeal) => updateRelation(index, { secretDeal })} multiline />
                  <Field label="历史恩怨" value={relation.history} onChange={(history) => updateRelation(index, { history })} multiline />
                  <Field label="当前张力 / 最近变化" value={relation.tension} onChange={(tension) => updateRelation(index, { tension })} multiline />
                </div>
                <small className="drawer-hint">对象：{factionRelationTargetName(detail, relation)}</small>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm profile-add" onClick={addRelation}>
            <IconPlus size={14} /> 添加关系态度
          </button>
        </div>
      ) : null}

      {tab === 'members' ? (
        <div className="profile-tab-body">
          <div className="profile-section-head">
            <strong>成员与身份</strong>
            <span>角色卡里关联到本势力的成员会自动汇总；这里可以补充秘密身份或忠诚状态</span>
          </div>
          <div className="profile-stage-list">
            {members.map((member) => {
              const membership = membershipOf(detail, faction.id, member.character.id)
              return (
                <div className="profile-stage-card" key={member.character.id}>
                  <div className="profile-relation-head">
                    <strong>{member.character.name}</strong>
                    <span>{member.derived ? '角色卡关联' : '额外身份'}</span>
                    {!member.derived ? (
                      <button
                        type="button"
                        className="btn btn-danger-ghost btn-sm"
                        onClick={() => removeMembership(member.character.id)}
                      >
                        <IconTrash size={13} />
                      </button>
                    ) : null}
                  </div>
                  <div className="record-form-grid">
                    <Field label="真实职位 / 角色" value={membership?.role ?? member.role} onChange={(role) => updateMembership(member.character.id, { role })} />
                    <Field label="公开身份" value={membership?.publicRole ?? member.publicRole} onChange={(publicRole) => updateMembership(member.character.id, { publicRole })} />
                    <Field label="忠诚 / 立场" value={membership?.loyalty ?? member.loyalty} onChange={(loyalty) => updateMembership(member.character.id, { loyalty })} />
                    <Field label="当前状态" value={membership?.status ?? member.status} onChange={(status) => updateMembership(member.character.id, { status })} />
                    <label className="record-field profile-checkbox">
                      <span>秘密身份</span>
                      <input
                        type="checkbox"
                        checked={membership?.secret ?? member.secret}
                        onChange={(event) => updateMembership(member.character.id, { secret: event.target.checked })}
                      />
                      <small>对组织外不公开</small>
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
          <button type="button" className="btn btn-ghost btn-sm profile-add" onClick={addMembership}>
            <IconPlus size={14} /> 添加成员身份
          </button>
        </div>
      ) : null}

      {tab === 'stages' ? (
        <div className="profile-tab-body">
          <div className="profile-section-head">
            <strong>兴衰阶段</strong>
            <span>组织的不同时代、不同目标与状态</span>
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
                  <Field label="阶段名" value={stage.label} onChange={(label) => updateStage(index, { label })} />
                  <Field label="起始章" value={stage.fromChapter} onChange={(fromChapter) => updateStage(index, { fromChapter })} />
                  <Field label="结束章" value={stage.toChapter} onChange={(toChapter) => updateStage(index, { toChapter })} />
                  <Field label="阶段目标" value={stage.goal} onChange={(goal) => updateStage(index, { goal })} multiline />
                  <Field label="阶段状态" value={stage.status} onChange={(status) => updateStage(index, { status })} multiline />
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm profile-add" onClick={addStage}>
            <IconPlus size={14} /> 添加阶段
          </button>
        </div>
      ) : null}

      {tab === 'dynamic' ? (
        <div className="profile-tab-body">
          <Section title="当前状态" hint="静态设定不变，动态状态由章节同步更新。">
            <Field label="当前阶段" value={profile.dynamic.stage} onChange={(stage) => patchDynamic({ stage })} />
            <Field label="领袖状态" value={profile.dynamic.leaderState} onChange={(leaderState) => patchDynamic({ leaderState })} />
            <Field label="士气" value={profile.dynamic.morale} onChange={(morale) => patchDynamic({ morale })} />
            <Field label="财政" value={profile.dynamic.treasury} onChange={(treasury) => patchDynamic({ treasury })} />
            <Field label="武力" value={profile.dynamic.forces} onChange={(forces) => patchDynamic({ forces })} />
            <Field label="领地" value={profile.dynamic.territory} onChange={(territory) => patchDynamic({ territory })} />
            <Field label="外交状态" value={profile.dynamic.diplomacy} onChange={(diplomacy) => patchDynamic({ diplomacy })} />
            <Field label="内部斗争" value={profile.dynamic.internalStruggle} onChange={(internalStruggle) => patchDynamic({ internalStruggle })} multiline />
            <Field label="当前行动" value={profile.dynamic.currentOperation} onChange={(currentOperation) => patchDynamic({ currentOperation })} multiline />
            <Field label="公开形象" value={profile.dynamic.publicImage} onChange={(publicImage) => patchDynamic({ publicImage })} multiline />
          </Section>
          <Section title="叙事功能" hint="这个势力在故事中承担什么作用。">
            <label className="record-field">
              <span>重要度</span>
              <select
                className="input select drawer-input"
                value={profile.meta.importance}
                onChange={(event) => patchMeta({ importance: event.target.value as FactionProfile['meta']['importance'] })}
              >
                <option value="core">核心势力</option>
                <option value="major">重要势力</option>
                <option value="minor">次要势力</option>
                <option value="background">背景势力</option>
              </select>
            </label>
            <label className="record-field">
              <span>叙事角色</span>
              <select
                className="input select drawer-input"
                value={profile.meta.role}
                onChange={(event) => patchMeta({ role: event.target.value as FactionProfile['meta']['role'] })}
              >
                <option value="ally">盟友</option>
                <option value="obstacle">障碍</option>
                <option value="mirror">镜子</option>
                <option value="resource">资源提供者</option>
                <option value="ruler">规则制定者</option>
                <option value="antagonist">最终反派</option>
                <option value="other">其他</option>
              </select>
            </label>
            <Field label="剧情功能" value={profile.meta.storyFunction} onChange={(storyFunction) => patchMeta({ storyFunction })} multiline />
            <Field label="剧情保护" value={profile.meta.plotArmor} onChange={(plotArmor) => patchMeta({ plotArmor })} multiline />
            <Field label="首次登场" value={profile.meta.firstAppearance} onChange={(firstAppearance) => patchMeta({ firstAppearance })} />
            <Field label="给 AI 的额外要求" value={profile.meta.aiNotes} onChange={(aiNotes) => patchMeta({ aiNotes })} multiline />
          </Section>
          <div className="profile-section">
            <div className="profile-section-head">
              <strong>状态时间线</strong>
              <span>每次章节同步自动记录最近 12 次变化</span>
            </div>
            {timeline.length > 0 ? (
              <div className="profile-timeline-list">
                {timeline.map((entry) => (
                  <div className="profile-timeline-row" key={entry.id}>
                    <header>
                      <strong>{entry.chapterTitle || '未命名章节'}</strong>
                      <span>{formatTime(entry.createdAt)}</span>
                    </header>
                    <div>
                      {entry.changes.map((change, index) => (
                        <span key={`${entry.id}-${change.field}-${index}`}>
                          {DYNAMIC_LABELS[change.field] ?? change.field}：
                          {change.from || '—'} → {change.to || '—'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="drawer-empty">还没有动态记录。章节同步后，这里会记录势力的士气、财政、武力、外交和内部斗争变化。</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'ai' ? (
        <div className="profile-tab-body">
          <div className="profile-ai-preview-head">
            <div>
              <strong>AI 实际读到的势力档案</strong>
              <span>约 {estimateTokens(preview)} tokens · 写作时会按场景裁剪到 2–3 个核心势力</span>
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
            组织提示块会要求 AI 用制度、口号、成员反应和资源限制表现势力，而不是把整个组织写成一个人。
          </div>
        </div>
      ) : null}
    </div>
  )
}
