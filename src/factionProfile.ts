import type {
  CharacterCard,
  FactionCard,
  FactionGovernance,
  FactionInternalGroup,
  FactionMembership,
  FactionProfile,
  FactionRelationNote,
  WorkDetail,
  WorldTemplate,
} from './types'

const MAX_TEXT = 600
const MAX_LIST = 30

export function emptyFactionGovernance(): FactionGovernance {
  return {
    system: '',
    legitimateLeader: '',
    actualPower: '',
    decisionProcess: '',
    succession: '',
    council: '',
    enforcement: '',
    intelligence: '',
    promotion: '',
    punishment: '',
    internalGroups: [],
  }
}

export function emptyFactionProfile(): FactionProfile {
  return {
    aliases: [],
    category: '',
    scale: '',
    legitimacy: '',
    publicFace: '',
    trueFace: '',
    coreContradiction: '',
    purpose: '',
    origin: '',
    values: [],
    fears: [],
    desires: [],
    redLine: '',
    weakness: '',
    trauma: '',
    growthArc: '',
    governance: emptyFactionGovernance(),
    behavior: {
      threatResponse: '',
      diplomacy: '',
      conflictStyle: '',
      negotiation: '',
      riskAppetite: '',
      internalDispute: '',
      expansion: '',
      crisis: '',
      redLineBreak: '',
      defaultReaction: '',
    },
    culture: {
      beliefs: '',
      rituals: [],
      taboos: [],
      symbols: '',
      dress: '',
      addressInternal: '',
      addressExternal: '',
      honor: '',
      outsider: '',
      propaganda: '',
      slogans: [],
    },
    resources: {
      finance: '',
      manpower: '',
      military: '',
      territory: '',
      supply: '',
      intelligence: '',
      technology: '',
      legitimacy: '',
      dependencies: [],
      bottlenecks: [],
      hiddenAssets: [],
      debts: [],
    },
    knowledge: {
      knows: [],
      believes: [],
      hides: [],
      blindSpots: [],
      infiltratedBy: [],
      sources: [],
    },
    relations: [],
    stages: [],
    dynamic: {
      stage: '',
      leaderState: '',
      morale: '',
      treasury: '',
      forces: '',
      territory: '',
      diplomacy: '',
      internalStruggle: '',
      currentOperation: '',
      publicImage: '',
      updatedAt: '',
    },
    meta: {
      importance: 'major',
      role: 'other',
      storyFunction: '',
      plotArmor: '',
      aiNotes: '',
      firstAppearance: '',
    },
  }
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : fallback
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim().slice(0, 300) : ''))
    .filter(Boolean)
    .slice(0, MAX_LIST)
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function normalizeFactionProfile(raw: unknown): FactionProfile {
  const input = obj(raw)
  const governance = obj(input.governance)
  const behavior = obj(input.behavior)
  const culture = obj(input.culture)
  const resources = obj(input.resources)
  const knowledge = obj(input.knowledge)
  const dynamic = obj(input.dynamic)
  const meta = obj(input.meta)

  const internalGroups: FactionInternalGroup[] = Array.isArray(governance.internalGroups)
    ? governance.internalGroups
        .map((rawGroup, index) => {
          const group = obj(rawGroup)
          const name = text(group.name)
          if (!name) return null
          return {
            id: text(group.id) || `group-${index + 1}`,
            name,
            goal: text(group.goal),
            stance: text(group.stance),
            power: text(group.power),
            secret: text(group.secret),
          }
        })
        .filter((group): group is FactionInternalGroup => Boolean(group))
        .slice(0, 30)
    : []

  const relations: FactionRelationNote[] = Array.isArray(input.relations)
    ? input.relations
        .map((rawRelation) => {
          const relation = obj(rawRelation)
          const targetType: FactionRelationNote['targetType'] =
            relation.targetType === 'character' ? 'character' : 'faction'
          return {
            targetType,
            targetId: text(relation.targetId),
            publicStance: text(relation.publicStance),
            trueStance: text(relation.trueStance),
            secretDeal: text(relation.secretDeal),
            history: text(relation.history),
            tension: text(relation.tension),
          }
        })
        .filter((relation) => relation.targetId)
        .slice(0, 60)
    : []

  const stages = Array.isArray(input.stages)
    ? input.stages
        .map((rawStage, index) => {
          const stage = obj(rawStage)
          return {
            id: text(stage.id) || `faction-stage-${index + 1}`,
            label: text(stage.label),
            fromChapter: text(stage.fromChapter),
            toChapter: text(stage.toChapter),
            goal: text(stage.goal),
            status: text(stage.status),
          }
        })
        .filter((stage) => stage.label || stage.goal || stage.status)
        .slice(0, 20)
    : []

  const importance = ['core', 'major', 'minor', 'background'].includes(String(meta.importance))
    ? (meta.importance as FactionProfile['meta']['importance'])
    : 'major'
  const role = [
    'ally',
    'obstacle',
    'mirror',
    'resource',
    'ruler',
    'antagonist',
    'other',
  ].includes(String(meta.role))
    ? (meta.role as FactionProfile['meta']['role'])
    : 'other'

  return {
    aliases: list(input.aliases),
    category: text(input.category),
    scale: text(input.scale),
    legitimacy: text(input.legitimacy),
    publicFace: text(input.publicFace),
    trueFace: text(input.trueFace),
    coreContradiction: text(input.coreContradiction),
    purpose: text(input.purpose),
    origin: text(input.origin),
    values: list(input.values),
    fears: list(input.fears),
    desires: list(input.desires),
    redLine: text(input.redLine),
    weakness: text(input.weakness),
    trauma: text(input.trauma),
    growthArc: text(input.growthArc),
    governance: {
      system: text(governance.system),
      legitimateLeader: text(governance.legitimateLeader),
      actualPower: text(governance.actualPower),
      decisionProcess: text(governance.decisionProcess),
      succession: text(governance.succession),
      council: text(governance.council),
      enforcement: text(governance.enforcement),
      intelligence: text(governance.intelligence),
      promotion: text(governance.promotion),
      punishment: text(governance.punishment),
      internalGroups,
    },
    behavior: {
      threatResponse: text(behavior.threatResponse),
      diplomacy: text(behavior.diplomacy),
      conflictStyle: text(behavior.conflictStyle),
      negotiation: text(behavior.negotiation),
      riskAppetite: text(behavior.riskAppetite),
      internalDispute: text(behavior.internalDispute),
      expansion: text(behavior.expansion),
      crisis: text(behavior.crisis),
      redLineBreak: text(behavior.redLineBreak),
      defaultReaction: text(behavior.defaultReaction),
    },
    culture: {
      beliefs: text(culture.beliefs),
      rituals: list(culture.rituals),
      taboos: list(culture.taboos),
      symbols: text(culture.symbols),
      dress: text(culture.dress),
      addressInternal: text(culture.addressInternal),
      addressExternal: text(culture.addressExternal),
      honor: text(culture.honor),
      outsider: text(culture.outsider),
      propaganda: text(culture.propaganda),
      slogans: list(culture.slogans),
    },
    resources: {
      finance: text(resources.finance),
      manpower: text(resources.manpower),
      military: text(resources.military),
      territory: text(resources.territory),
      supply: text(resources.supply),
      intelligence: text(resources.intelligence),
      technology: text(resources.technology),
      legitimacy: text(resources.legitimacy),
      dependencies: list(resources.dependencies),
      bottlenecks: list(resources.bottlenecks),
      hiddenAssets: list(resources.hiddenAssets),
      debts: list(resources.debts),
    },
    knowledge: {
      knows: list(knowledge.knows),
      believes: list(knowledge.believes),
      hides: list(knowledge.hides),
      blindSpots: list(knowledge.blindSpots),
      infiltratedBy: list(knowledge.infiltratedBy),
      sources: list(knowledge.sources),
    },
    relations,
    stages,
    dynamic: {
      stage: text(dynamic.stage),
      leaderState: text(dynamic.leaderState),
      morale: text(dynamic.morale),
      treasury: text(dynamic.treasury),
      forces: text(dynamic.forces),
      territory: text(dynamic.territory),
      diplomacy: text(dynamic.diplomacy),
      internalStruggle: text(dynamic.internalStruggle),
      currentOperation: text(dynamic.currentOperation),
      publicImage: text(dynamic.publicImage),
      updatedAt: text(dynamic.updatedAt),
    },
    meta: {
      importance,
      role,
      storyFunction: text(meta.storyFunction),
      plotArmor: text(meta.plotArmor),
      aiNotes: text(meta.aiNotes),
      firstAppearance: text(meta.firstAppearance),
    },
  }
}

export function factionProfileOf(faction: FactionCard): FactionProfile {
  return normalizeFactionProfile(faction.profile)
}

export function factionProfileCompleteness(profile: FactionProfile): {
  score: number
  missing: string[]
} {
  const has = (values: string[]) => values.some((value) => value.trim())
  const checks: [string, boolean][] = [
    ['公开/真实面目', Boolean(profile.publicFace || profile.trueFace)],
    ['核心矛盾', Boolean(profile.coreContradiction)],
    ['存在目的', Boolean(profile.purpose)],
    ['红线', Boolean(profile.redLine)],
    ['决策方式', Boolean(profile.governance.decisionProcess)],
    ['行为逻辑', Boolean(profile.behavior.threatResponse || profile.behavior.defaultReaction)],
    ['内部派系', profile.governance.internalGroups.length > 0],
    ['文化/仪式', Boolean(profile.culture.beliefs) || has(profile.culture.rituals)],
    ['口号/誓词', has(profile.culture.slogans)],
    ['资源/瓶颈', Boolean(profile.resources.finance) || has(profile.resources.bottlenecks)],
    ['情报边界', has(profile.knowledge.knows) || has(profile.knowledge.hides)],
    ['关系态度', profile.relations.length > 0],
    ['当前动态', Boolean(profile.dynamic.stage || profile.dynamic.currentOperation)],
  ]
  const filled = checks.filter(([, ok]) => ok).length
  return {
    score: Math.round((filled / checks.length) * 100),
    missing: checks.filter(([, ok]) => !ok).map(([label]) => label),
  }
}

function join(values: string[], max = 10): string {
  return values.slice(0, max).join('、')
}

function line(label: string, value: string): string {
  return value ? `${label}：${value}` : ''
}

export interface FactionMemberRecord {
  character: CharacterCard
  role: string
  publicRole: string
  secret: boolean
  loyalty: string
  status: string
  derived: boolean
}

export function factionMemberRecords(
  detail: WorkDetail,
  faction: FactionCard,
): FactionMemberRecord[] {
  const records = new Map<string, FactionMemberRecord>()
  for (const character of detail.characters ?? []) {
    if (character.sectId !== faction.id) continue
    records.set(character.id, {
      character,
      role: character.position || '成员',
      publicRole: character.identity || '',
      secret: false,
      loyalty: '',
      status: character.status || '',
      derived: true,
    })
  }
  for (const membership of detail.factionMemberships ?? []) {
    if (membership.factionId !== faction.id) continue
    const character = (detail.characters ?? []).find(
      (item) => item.id === membership.characterId,
    )
    if (!character) continue
    const current = records.get(character.id)
    records.set(character.id, {
      character,
      role: membership.role || current?.role || '成员',
      publicRole: membership.publicRole || current?.publicRole || '',
      secret: membership.secret,
      loyalty: membership.loyalty,
      status: membership.status || current?.status || character.status || '',
      derived: false,
    })
  }
  return [...records.values()]
}

export function membershipOf(
  detail: WorkDetail,
  factionId: string,
  characterId: string,
): FactionMembership | undefined {
  return (detail.factionMemberships ?? []).find(
    (item) => item.factionId === factionId && item.characterId === characterId,
  )
}

export function factionRelationTargetName(
  detail: WorkDetail,
  relation: FactionRelationNote,
): string {
  if (relation.targetType === 'character') {
    return detail.characters.find((item) => item.id === relation.targetId)?.name ?? '未知角色'
  }
  return detail.factions.find((item) => item.id === relation.targetId)?.name ?? '未知势力'
}

export function factionMentioned(faction: FactionCard, text: string): boolean {
  if (!text) return false
  const names = [faction.name, ...factionProfileOf(faction).aliases].filter(Boolean)
  return names.some((name) => text.includes(name))
}

export function selectFocusFactions(
  detail: WorkDetail,
  focusText: string,
  limit = 3,
): FactionCard[] {
  const factions = detail.factions ?? []
  if (factions.length === 0) return []
  const selected: FactionCard[] = []
  const add = (faction: FactionCard | undefined) => {
    if (!faction || selected.some((item) => item.id === faction.id)) return
    if (selected.length < limit) selected.push(faction)
  }

  for (const faction of factions) {
    if (factionMentioned(faction, focusText)) add(faction)
  }
  // 当前视角 / 在场角色所属势力
  for (const character of detail.characters ?? []) {
    if (!character.sectId) continue
    if (!focusText.includes(character.name)) continue
    add(factions.find((faction) => faction.id === character.sectId))
  }
  const important = factions.filter((faction) => {
    const profile = factionProfileOf(faction)
    return profile.meta.importance === 'core' || profile.meta.role === 'antagonist'
  })
  for (const faction of important) add(faction)
  for (const faction of factions) add(faction)
  return selected
}

export function factionQuickLine(faction: FactionCard): string {
  const profile = factionProfileOf(faction)
  return `- ${faction.name || '未命名'}｜${faction.type || profile.category || '组织'}｜${faction.leader || '负责人未定'}｜公开：${profile.publicFace || faction.description || '未设定'}${profile.coreContradiction ? `｜矛盾：${profile.coreContradiction}` : ''}`
}

export interface FactionPromptOptions {
  mode?: 'writing' | 'chat' | 'planning' | 'audit'
  detail?: WorkDetail
  chapterNumber?: number
  maxRelations?: number
  extraLines?: string[]
}

export function buildFactionProfilePrompt(
  faction: FactionCard,
  options: FactionPromptOptions = {},
): string {
  const profile = factionProfileOf(faction)
  const mode = options.mode ?? 'writing'
  const chapterNumber = options.chapterNumber
  const stageByRange = chapterNumber
    ? profile.stages.find((stage) => {
        const from = Number.parseInt(stage.fromChapter, 10)
        const to = Number.parseInt(stage.toChapter, 10)
        return (
          (!Number.isFinite(from) || chapterNumber >= from) &&
          (!Number.isFinite(to) || chapterNumber <= to)
        )
      })
    : undefined
  const stage =
    stageByRange ??
    (profile.dynamic.stage
      ? profile.stages.find((item) => item.label === profile.dynamic.stage)
      : undefined) ??
    profile.stages[profile.stages.length - 1]

  const relationLines = profile.relations
    .slice(0, options.maxRelations ?? 12)
    .map((relation) => {
      const target =
        relation.targetType === 'character'
          ? options.detail?.characters.find((item) => item.id === relation.targetId)?.name
          : options.detail?.factions.find((item) => item.id === relation.targetId)?.name
      if (!target) return ''
      return `- ${target}：公开=${relation.publicStance || '未定'}；真实=${relation.trueStance || '未定'}${relation.secretDeal ? `；秘密=${relation.secretDeal}` : ''}${relation.tension ? `；当前张力=${relation.tension}` : ''}`
    })
    .filter(Boolean)

  const members =
    options.detail && mode !== 'planning'
      ? factionMemberRecords(options.detail, faction)
      : []
  const memberLines = members
    .slice(0, 10)
    .map(
      (member) =>
        `- ${member.character.name}｜${member.secret ? '秘密身份' : '公开身份'}：${member.role}${member.publicRole ? `｜对外：${member.publicRole}` : ''}${member.loyalty ? `｜忠诚：${member.loyalty}` : ''}`,
    )

  const internalGroups = profile.governance.internalGroups
    .map(
      (group) =>
        `- ${group.name}：诉求=${group.goal || '未定'}；立场=${group.stance || '未定'}；实力=${group.power || '未定'}${group.secret ? `；秘密=${group.secret}` : ''}`,
    )
    .slice(0, 10)

  const lines = [
    `【势力：${faction.name || '未命名'}】`,
    line('类型', faction.type || profile.category),
    line('别名', join(profile.aliases)),
    line('规模/合法性', [profile.scale, profile.legitimacy].filter(Boolean).join(' / ')),
    line('公开形象', profile.publicFace || faction.description),
    line('真实面目', profile.trueFace),
    line('核心矛盾', profile.coreContradiction),
    line('存在目的', profile.purpose || faction.goal),
    line('起源', profile.origin),
    line('价值观', join(profile.values)),
    line('恐惧', join(profile.fears)),
    line('欲望', join(profile.desires)),
    line('红线', profile.redLine),
    line('弱点', profile.weakness),
    line('历史创伤', profile.trauma),
    line('兴衰弧线', profile.growthArc),
    line('名义负责人', faction.leader || profile.governance.legitimateLeader),
    line('实际掌权', profile.governance.actualPower),
    line('制度', profile.governance.system),
    line('决策流程', profile.governance.decisionProcess),
    line('继承方式', profile.governance.succession),
    line('议事机构', profile.governance.council),
    line('执法/监督', profile.governance.enforcement),
    line('情报机构', profile.governance.intelligence),
    line('晋升', profile.governance.promotion),
    line('惩罚', profile.governance.punishment),
    internalGroups.length ? `内部派系：\n${internalGroups.join('\n')}` : '',
    line('遇袭 / 威胁反应', profile.behavior.threatResponse),
    line('外交风格', profile.behavior.diplomacy),
    line('冲突风格', profile.behavior.conflictStyle),
    line('谈判风格', profile.behavior.negotiation),
    line('风险偏好', profile.behavior.riskAppetite),
    line('内部争端处理', profile.behavior.internalDispute),
    line('扩张方式', profile.behavior.expansion),
    line('危机处理', profile.behavior.crisis),
    line('破例条件', profile.behavior.redLineBreak),
    line('默认反应', profile.behavior.defaultReaction),
    line('信条', profile.culture.beliefs),
    line('仪式', join(profile.culture.rituals)),
    line('禁忌', join(profile.culture.taboos)),
    line('象征', profile.culture.symbols),
    line('服饰/建筑', profile.culture.dress),
    line('内部称呼', profile.culture.addressInternal),
    line('对外称呼', profile.culture.addressExternal),
    line('荣誉观', profile.culture.honor),
    line('对待外人', profile.culture.outsider),
    line('公开宣传', profile.culture.propaganda),
    line('口号/誓词', join(profile.culture.slogans)),
    line('财政', profile.resources.finance),
    line('人力', profile.resources.manpower),
    line('武力', profile.resources.military),
    line('领地', profile.resources.territory),
    line('补给', profile.resources.supply),
    line('情报资源', profile.resources.intelligence),
    line('技术/知识', profile.resources.technology),
    line('合法性来源', profile.resources.legitimacy),
    line('依赖', join(profile.resources.dependencies)),
    line('瓶颈', join(profile.resources.bottlenecks)),
    line('隐藏资产', join(profile.resources.hiddenAssets)),
    line('债务', join(profile.resources.debts)),
    line('知道', join(profile.knowledge.knows)),
    line('误以为', join(profile.knowledge.believes)),
    line('隐瞒', join(profile.knowledge.hides)),
    line('情报盲区', join(profile.knowledge.blindSpots)),
    line('被渗透', join(profile.knowledge.infiltratedBy)),
    line('情报来源', join(profile.knowledge.sources)),
    relationLines.length ? `对外关系：\n${relationLines.join('\n')}` : '',
    memberLines.length ? `关键成员：\n${memberLines.join('\n')}` : '',
    stage
      ? line('当前阶段', [stage.label, stage.goal, stage.status].filter(Boolean).join('；'))
      : '',
    line('当前领袖状态', profile.dynamic.leaderState),
    line('当前士气', profile.dynamic.morale),
    line('当前财政', profile.dynamic.treasury),
    line('当前武力', profile.dynamic.forces),
    line('当前领地', profile.dynamic.territory),
    line('当前外交', profile.dynamic.diplomacy),
    line('当前内斗', profile.dynamic.internalStruggle),
    line('当前行动', profile.dynamic.currentOperation),
    line('当前公开形象', profile.dynamic.publicImage),
    line('剧情功能', profile.meta.storyFunction),
    line('给 AI 的额外要求', profile.meta.aiNotes),
    ...(options.extraLines ?? []),
    '表演要求：势力是集体，不是一个人。用制度、口号、成员反应、资源限制、内部派系和信息差来表现它，不要让它像一个人一样思考或说话。',
  ]
  return lines.filter(Boolean).join('\n')
}

export function factionLabels(template?: WorldTemplate): {
  faction: string
  leader: string
  member: string
  unit: string
  ability: string
  item: string
  currency: string
  position: string
} {
  return {
    faction: template?.terms.faction ?? '势力',
    leader: template?.terms.leader ?? '负责人',
    member: template?.terms.member ?? '成员',
    unit: template?.terms.factionUnit ?? '部门',
    ability: template?.terms.ability ?? '能力',
    item: template?.terms.item ?? '资源',
    currency: template?.terms.currency ?? '资金',
    position: template?.terms.position ?? '职位',
  }
}

export function factionHierarchyLabels(template?: WorldTemplate): {
  elderGroup: string
  mainGroup: string
  unitGroup: string
  inner: string
  outer: string
  menial: string
} {
  const id = template?.id ?? 'generic'
  if (id === 'urban') {
    return {
      elderGroup: '董事会',
      mainGroup: '核心成员',
      unitGroup: '部门 / 子公司',
      inner: '正式员工',
      outer: '外包 / 外围',
      menial: '临时人员',
    }
  }
  if (id === 'mystery') {
    return {
      elderGroup: '指挥层',
      mainGroup: '核心成员',
      unitGroup: '部门 / 专案组',
      inner: '在编人员',
      outer: '线人 / 外聘',
      menial: '临时人员',
    }
  }
  if (id === 'scifi') {
    return {
      elderGroup: '指挥层',
      mainGroup: '核心成员',
      unitGroup: '基地 / 舰队 / 部门',
      inner: '正式成员',
      outer: '预备 / 外包',
      menial: '临时人员',
    }
  }
  if (id === 'historical') {
    return {
      elderGroup: '长老 / 重臣',
      mainGroup: '核心官员',
      unitGroup: '州郡 / 军营 / 部门',
      inner: '在编',
      outer: '候补 / 外围',
      menial: '杂役',
    }
  }
  if (id === 'romance') {
    return {
      elderGroup: '家族长辈',
      mainGroup: '核心成员',
      unitGroup: '家族分支 / 圈子',
      inner: '正式成员',
      outer: '外围成员',
      menial: '临时人员',
    }
  }
  if (id === 'xianxia') {
    return {
      elderGroup: '长老会',
      mainGroup: '主要弟子',
      unitGroup: '峰 / 堂 / 院',
      inner: '内门弟子',
      outer: '外门弟子',
      menial: '杂役',
    }
  }
  return {
    elderGroup: '核心层',
    mainGroup: '主要成员',
    unitGroup: '部门 / 分支机构',
    inner: '正式成员',
    outer: '外围成员',
    menial: '临时成员',
  }
}
