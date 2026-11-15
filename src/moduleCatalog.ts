import type {
  ModuleDefinition,
  ModuleField,
  ModuleRecord,
  ModuleScope,
  ModuleView,
  WorkDetail,
  WorldTemplate,
} from './types'

const DEFAULT_STATUSES = ['未定', '进行中', '已完成', '已放弃']

function fields(items: [string, string, ModuleField['type']?][]): ModuleField[] {
  return items.map(([id, label, type], index) => ({
    id: id || `f${index}`,
    label,
    type: type ?? 'text',
  }))
}

function mod(
  id: string,
  name: string,
  description: string,
  recordLabel: string,
  scope: ModuleScope,
  fieldItems: [string, string, ModuleField['type']?][],
  aiHint: string,
): ModuleDefinition {
  return {
    id,
    name,
    description,
    recordLabel,
    scope,
    fields: fields(fieldItems),
    statuses: DEFAULT_STATUSES,
    aiHint,
  }
}

export const MODULE_CATALOG: ModuleDefinition[] = [
  // 通用模块
  mod('world-rules', '世界规则', '这个世界的硬规则、禁忌与代价', '规则', 'world', [['f1', '规则'], ['f2', '代价 / 例外', 'textarea'], ['f3', '违反后果', 'textarea']], '写作时不能违反已启用的世界规则。'),
  mod('glossary', '名词词典', '专有名词、组织、货币、地名与历史事件', '词条', 'world', [['f1', '分类'], ['f2', '定义', 'textarea'], ['f3', '别称']], '使用词典里的标准称呼，不要随意换名。'),
  mod('timeline', '事件时间线', '世界或故事层面的关键事件', '事件', 'story', [['f1', '时间'], ['f2', '影响', 'textarea'], ['f3', '参与者']], '按时间线保持因果顺序。'),
  mod('pov-plan', '视角计划', '每一段由谁看、看到什么、隐瞒什么', '视角', 'story', [['f1', '视角人物'], ['f2', '范围'], ['f3', '叙述目的', 'textarea']], '生成时遵守当前视角计划，不写视角人物不知道的信息。'),
  mod('conflict-escalation', '冲突升级', '冲突的阶段、筹码与下一步', '冲突', 'story', [['f1', '双方'], ['f2', '筹码', 'textarea'], ['f3', '下一步', 'textarea']], '冲突要逐级升级，不要原地重复。'),
  mod('culture-customs', '文化习俗', '族群、地域、阶层的习俗和禁忌', '习俗', 'world', [['f1', '群体'], ['f2', '习俗 / 禁忌', 'textarea'], ['f3', '冲突点']], '涉及相关群体时引用习俗，避免现代视角穿帮。'),
  mod('org-types', '组织类型', '势力类型、结构、目标与弱点', '组织', 'faction', [['f1', '结构'], ['f2', '目标'], ['f3', '弱点 / 软肋', 'textarea']], '不同组织按各自结构行动。'),
  mod('relationship-types', '关系类型', '关系的社会含义、张力和边界', '关系', 'character', [['f1', '关系'], ['f2', '含义 / 张力', 'textarea'], ['f3', '可越界点']], '关系变化要有铺垫，不要突然亲疏。'),
  mod('custom-notes', '自定义设定', '不适合归入其他模块的设定', '设定', 'world', [['f1', '分类'], ['f2', '内容', 'textarea'], ['f3', '备注']], '只在相关情节使用，不要无端展开。'),
  mod('faction-resources', '势力资源', '势力掌握的资源、产业、人脉与消耗', '资源', 'economy', [['f1', '类型'], ['f2', '数量 / 价值'], ['f3', '用途 / 风险', 'textarea']], '势力行动要有资源支撑。'),
  mod('character-arcs', '人物弧光', '人物阶段变化、触发事件与结果', '弧光', 'character', [['f1', '阶段'], ['f2', '触发事件'], ['f3', '变化 / 代价', 'textarea']], '人物变化要落在具体章节事件上。'),

  // 修仙 / 玄幻
  mod('realm-ladder', '境界阶梯', '修炼境界、破境条件与实力特征', '境界', 'character', [['f1', '阶段'], ['f2', '破境条件', 'textarea'], ['f3', '实力特征', 'textarea'], ['f4', '代价']], '战斗表现要匹配境界差距，不要越阶无代价。'),
  mod('spirit-lineages', '灵根谱系', '灵根、体质、天赋与适配方向', '灵根', 'character', [['f1', '灵根 / 体质'], ['f2', '属性'], ['f3', '适合功法'], ['f4', '限制']], '角色修炼路线要符合灵根与体质。'),
  mod('sect-lineage', '师承谱系', '师徒、道统、宗门辈分与规矩', '师承', 'faction', [['f1', '长辈'], ['f2', '弟子'], ['f3', '规矩 / 恩怨', 'textarea']], '称呼、辈分和师承不能乱。'),
  mod('artifact-codex', '法宝图鉴', '法宝、本命物、品阶与代价', '法宝', 'economy', [['f1', '品阶'], ['f2', '类型'], ['f3', '功能 / 代价', 'textarea'], ['f4', '状态']], '法宝效果要一致，不能每章换能力。'),
  mod('elixir-codex', '丹药材料', '丹药、灵草、材料与药性', '丹药', 'economy', [['f1', '品阶'], ['f2', '药性'], ['f3', '用途 / 副作用', 'textarea'], ['f4', '来源']], '丹药效果和副作用要稳定。'),
  mod('secret-realm', '灵脉秘境', '灵脉、秘境、禁地与开启条件', '秘境', 'world', [['f1', '位置'], ['f2', '开启条件'], ['f3', '危险 / 产出', 'textarea'], ['f4', '控制者']], '秘境进出有代价和限制。'),
  mod('sect-alliance', '会盟声望', '宗门会盟、联姻、声望与外交', '会盟', 'faction', [['f1', '对象'], ['f2', '关系'], ['f3', '声望 / 条件', 'textarea']], '宗门外交要符合利益和旧怨。'),
  mod('sect-missions', '宗门任务', '宗门任务、贡献、奖励与期限', '任务', 'story', [['f1', '发布者'], ['f2', '条件'], ['f3', '奖励 / 惩罚'], ['f4', '期限']], '宗门任务要有来源和结算。'),
  mod('technique-counters', '功法克制', '功法、属性与克制关系', '克制', 'story', [['f1', '功法 / 属性'], ['f2', '克制'], ['f3', '被克制'], ['f4', '破解']], '战斗胜负要考虑属性与功法克制。'),
  mod('dao-events', '道途事件', '破境、心魔、因果与道途选择', '道途', 'story', [['f1', '阶段'], ['f2', '事件'], ['f3', '选择 / 后果', 'textarea']], '道途选择要有后果，不要只加战力。'),

  // 都市 / 商战
  mod('company-registry', '公司家族', '公司、家族、资本与掌权者', '公司 / 家族', 'faction', [['f1', '类型'], ['f2', '负责人'], ['f3', '业务 / 资产', 'textarea'], ['f4', '软肋']], '商业行动要符合公司利益与资源。'),
  mod('career-ladder', '职级体系', '职级、权限、待遇与晋升', '职级', 'character', [['f1', '序列'], ['f2', '权限'], ['f3', '待遇 / 晋升'], ['f4', '天花板']], '角色权限不能越过职级。'),
  mod('equity-assets', '股权资产', '股权、资产、估值与风险', '资产', 'economy', [['f1', '持有人'], ['f2', '估值 / 比例'], ['f3', '风险 / 质押', 'textarea']], '资本变化要能追溯来源。'),
  mod('projects-deals', '项目交易', '项目、交易、对手与阶段', '项目', 'story', [['f1', '对手'], ['f2', '金额 / 筹码'], ['f3', '阶段 / 风险', 'textarea'], ['f4', '结果']], '交易推进要有谈判和代价。'),
  mod('power-network', '人脉派系', '人物立场、利益与把柄', '人脉', 'character', [['f1', '立场'], ['f2', '利益'], ['f3', '把柄 / 关系', 'textarea']], '人脉行动要符合各自利益。'),
  mod('media-opinion', '媒体舆论', '媒体渠道、舆论风向与反噬', '舆论', 'world', [['f1', '渠道'], ['f2', '风向'], ['f3', '影响 / 反噬', 'textarea']], '舆论变化要有传播链。'),
  mod('legal-risk', '法律合规', '合同、诉讼、监管与风险', '风险', 'world', [['f1', '风险'], ['f2', '条款'], ['f3', '后果 / 应对', 'textarea']], '法律后果不能凭空消失。'),
  mod('city-spaces', '城市场所', '城市里的关键空间与归属', '场所', 'world', [['f1', '类型'], ['f2', '控制者'], ['f3', '用途 / 禁忌', 'textarea']], '场景切换要符合城市空间逻辑。'),
  mod('urban-timeline', '都市时间线', '商战、舆论、项目与私人事件的时间线', '事件', 'story', [['f1', '时间'], ['f2', '事件'], ['f3', '影响', 'textarea']], '多线事件按时间顺序推进。'),
  mod('interest-analysis', '利益分析', '各方诉求、筹码与底线', '利益方', 'story', [['f1', '诉求'], ['f2', '筹码'], ['f3', '底线 / 代价', 'textarea']], '每个阵营行动都要有利益动机。'),

  // 悬疑 / 推理
  mod('case-board', '案件', '案件、状态、受害者与手法', '案件', 'story', [['f1', '类型'], ['f2', '受害者'], ['f3', '手法 / 疑点', 'textarea'], ['f4', '状态']], '案件信息要按线索逐步揭示。'),
  mod('clue-evidence', '线索证据', '线索、证据、可信度与指向', '线索', 'story', [['f1', '来源'], ['f2', '可信度'], ['f3', '指向 / 盲点', 'textarea'], ['f4', '状态']], '线索不能凭空出现或被遗忘。'),
  mod('suspects-witnesses', '嫌疑人证人', '人物身份、动机、疑点与证词', '嫌疑人', 'character', [['f1', '身份'], ['f2', '动机'], ['f3', '疑点 / 证词', 'textarea'], ['f4', '状态']], '证词要与证据和时间线一致。'),
  mod('alibi-timeline', '时间线不在场', '关键时间点、人物位置与证明', '时间点', 'story', [['f1', '时间'], ['f2', '人物'], ['f3', '地点 / 证明', 'textarea'], ['f4', '漏洞']], '时间线不能自相矛盾。'),
  mod('crime-scenes', '现场地点', '案发现场、空间布局与物证', '现场', 'world', [['f1', '类型'], ['f2', '布局'], ['f3', '物证 / 异常', 'textarea']], '现场描述要前后一致。'),
  mod('motive-map', '动机关系', '人物动机、关系与利益冲突', '动机', 'character', [['f1', '人物'], ['f2', '动机'], ['f3', '关系 / 冲突', 'textarea']], '动机要能支撑行为，不能只靠巧合。'),
  mod('red-herrings', '误导红鲱鱼', '误导线索、真假信息与回收', '误导', 'story', [['f1', '误导'], ['f2', '真相'], ['f3', '回收章节', 'textarea']], '误导要公平，不能靠隐藏关键信息。'),
  mod('reveal-plan', '真相揭晓', '真相层次、揭晓顺序与读者信息差', '真相', 'story', [['f1', '层次'], ['f2', '揭晓对象'], ['f3', '信息差 / 后果', 'textarea']], '真相揭示要分层次，不一次倒完。'),
  mod('procedure-rules', '司法规则', '警方、司法、取证与程序边界', '规则', 'world', [['f1', '程序'], ['f2', '限制'], ['f3', '违规后果', 'textarea']], '办案流程不能只为剧情方便。'),
  mod('mystery-consistency', '推理一致性', '线索、时间、动机和真相的校验点', '校验', 'story', [['f1', '检查项'], ['f2', '状态'], ['f3', '问题 / 修正', 'textarea']], '生成和分析时要检查推理链是否闭合。'),

  // 言情 / 情感
  mod('emotional-beats', '情感节点', '关系推进的关键情绪节点', '节点', 'story', [['f1', '阶段'], ['f2', '触发事件'], ['f3', '情绪变化', 'textarea']], '情感推进要有节点，不要突然相爱。'),
  mod('tension-stages', '关系张力', '关系阶段、张力和边界', '关系', 'character', [['f1', '阶段'], ['f2', '张力'], ['f3', '边界 / 雷点', 'textarea']], '关系冲突要符合阶段和边界。'),
  mod('secrets-misunderstandings', '误会秘密', '秘密、误会、知情人与解开条件', '秘密', 'story', [['f1', '秘密 / 误会'], ['f2', '知情人'], ['f3', '解开条件 / 后果', 'textarea']], '误会要靠剧情解开，不靠旁白硬解释。'),
  mod('key-scenes', '关键场景', '告白、争吵、和好等关键场面', '场景', 'story', [['f1', '类型'], ['f2', '参与者'], ['f3', '目标 / 变化', 'textarea']], '关键场景要承担关系变化。'),
  mod('rivals', '配角情敌', '情敌、助攻、阻碍与立场', '配角', 'character', [['f1', '身份'], ['f2', '立场'], ['f3', '作用 / 结局', 'textarea']], '配角不能只做工具人。'),
  mod('family-pressure', '家庭压力', '家庭、阶层、社会压力', '压力', 'world', [['f1', '来源'], ['f2', '压力'], ['f3', '反抗 / 妥协', 'textarea']], '外部压力要真实影响选择。'),
  mod('emotion-curve', '情绪曲线', '每一段情绪走向与强度', '曲线', 'story', [['f1', '阶段'], ['f2', '情绪'], ['f3', '强度 / 转折', 'textarea']], '情绪曲线要有起伏，不要一直甜或一直虐。'),
  mod('dialogue-chemistry', '对白暧昧', '对白风格、潜台词与暧昧度', '对白', 'character', [['f1', '风格'], ['f2', '潜台词'], ['f3', '暧昧度 / 禁忌', 'textarea']], '对白要符合人物关系和阶段。'),
  mod('ending-plan', '结局计划', 'HE / BE、结局条件与余韵', '结局', 'story', [['f1', '类型'], ['f2', '条件'], ['f3', '余韵 / 风险', 'textarea']], '结局要回应主要情感线。'),
  mod('romance-analysis', '情感节奏', '情感推进与读者体验的校验点', '校验', 'story', [['f1', '检查项'], ['f2', '状态'], ['f3', '问题 / 修正', 'textarea']], '分析时检查关系推进是否过慢或过快。'),

  // 科幻 / 赛博
  mod('tech-tree', '科技树', '科技等级、前置与限制', '科技', 'world', [['f1', '等级'], ['f2', '前置'], ['f3', '能力 / 代价', 'textarea'], ['f4', '限制']], '科技能力不能超过科技树和资源限制。'),
  mod('cyberware', '义体改造', '义体、改造、排异与维护', '义体', 'character', [['f1', '部位'], ['f2', '功能'], ['f3', '代价 / 排异', 'textarea'], ['f4', '维护']], '义体使用要有身体与维护代价。'),
  mod('vehicles', '装备载具', '武器、载具、舰船与状态', '载具', 'economy', [['f1', '类型'], ['f2', '能力'], ['f3', '消耗 / 损坏', 'textarea'], ['f4', '归属']], '载具性能和损坏要稳定。'),
  mod('star-powers', '星际势力', '财团、政府、舰队与阵营', '势力', 'faction', [['f1', '类型'], ['f2', '控制范围'], ['f3', '目标 / 矛盾', 'textarea']], '星际势力行动要符合资源和航线。'),
  mod('planets-bases', '星球基地', '星球、星区、基地与航线', '地点', 'world', [['f1', '类型'], ['f2', '控制者'], ['f3', '环境 / 危险', 'textarea'], ['f4', '航线']], '星际移动要遵守航线和距离。'),
  mod('energy-resources', '资源能源', '能源、矿产、补给与价格', '资源', 'economy', [['f1', '类型'], ['f2', '数量 / 价格'], ['f3', '用途 / 争夺', 'textarea']], '资源和能源不能无限供应。'),
  mod('cyberspace', '赛博空间', '网络、黑客、数据与防火墙', '网络', 'world', [['f1', '层级'], ['f2', '入口'], ['f3', '防御 / 反噬', 'textarea']], '黑客行动要符合网络层级与代价。'),
  mod('ai-robots', 'AI 机器人', 'AI、机器人、克隆与权限', 'AI', 'character', [['f1', '类型'], ['f2', '权限'], ['f3', '目的 / 限制', 'textarea'], ['f4', '状态']], 'AI 行为要符合权限和底层规则。'),
  mod('tech-cost', '科技代价', '科技使用的身体、社会或伦理代价', '代价', 'world', [['f1', '科技'], ['f2', '代价'], ['f3', '社会后果', 'textarea']], '每次使用科技都要考虑代价。'),
  mod('scifi-consistency', '科技一致性', '科技、资源、时间和社会的校验点', '校验', 'story', [['f1', '检查项'], ['f2', '状态'], ['f3', '问题 / 修正', 'textarea']], '分析时检查科技、资源和时间线是否自洽。'),

  // 历史 / 军事
  mod('nations', '国家政权', '国家、政权、合法性与矛盾', '国家', 'faction', [['f1', '政体'], ['f2', '统治集团'], ['f3', '矛盾 / 软肋', 'textarea']], '国家行为要符合制度和利益。'),
  mod('territories', '州郡疆域', '疆域、州郡、关隘与归属', '疆域', 'world', [['f1', '层级'], ['f2', '控制者'], ['f3', '地形 / 资源', 'textarea'], ['f4', '争端']], '地理和归属要前后一致。'),
  mod('military-ranks', '军制军衔', '军制、军衔、权限与晋升', '军衔', 'character', [['f1', '军衔'], ['f2', '权限'], ['f3', '待遇 / 晋升'], ['f4', '限制']], '军队指挥链不能乱。'),
  mod('armies', '军团编制', '军团、编制、兵种与战力', '军团', 'faction', [['f1', '编制'], ['f2', '兵种'], ['f3', '战力 / 弱点', 'textarea'], ['f4', '驻地']], '军队战力和损失要可持续。'),
  mod('campaigns', '战役战线', '战役、战线、目标与结果', '战役', 'story', [['f1', '目标'], ['f2', '双方'], ['f3', '战线 / 结果', 'textarea'], ['f4', '代价']], '战役结果要符合兵力和补给。'),
  mod('supply', '补给粮饷', '粮草、军饷、运输与消耗', '补给', 'economy', [['f1', '类型'], ['f2', '数量 / 路线'], ['f3', '消耗 / 风险', 'textarea']], '长期战争必须考虑补给。'),
  mod('diplomacy', '外交盟约', '盟约、联姻、使节与背刺', '盟约', 'faction', [['f1', '对象'], ['f2', '条款'], ['f3', '暗线 / 风险', 'textarea']], '外交关系要能变化且有代价。'),
  mod('offices', '官职派系', '官职、派系、党争与任命', '官职', 'character', [['f1', '官职'], ['f2', '派系'], ['f3', '权力 / 把柄', 'textarea']], '官职带来权限，也带来约束。'),
  mod('era-timeline', '年号时间线', '年号、纪年、事件与先后', '年号', 'story', [['f1', '年号 / 时间'], ['f2', '事件'], ['f3', '影响', 'textarea']], '历史时间不能错位。'),
  mod('institutions', '制度史实', '官制、礼制、军制、律法与史实校验', '制度', 'world', [['f1', '制度'], ['f2', '规则'], ['f3', '破例 / 后果', 'textarea']], '制度不能被剧情随意打破。'),
]

export const MODULE_BY_ID = new Map(MODULE_CATALOG.map((module) => [module.id, module]))

const MODULE_VIEW_OVERRIDES: Record<string, ModuleView[]> = {
  'realm-ladder': ['ladder', 'table'],
  'career-ladder': ['ladder', 'table'],
  'military-ranks': ['ladder', 'table'],
  'tech-tree': ['ladder', 'table'],
  'case-board': ['board', 'table'],
  'sect-missions': ['board', 'table'],
  'projects-deals': ['board', 'table'],
  campaigns: ['board', 'table'],
  timeline: ['timeline', 'table'],
  'alibi-timeline': ['timeline', 'table'],
  'urban-timeline': ['timeline', 'table'],
  'era-timeline': ['timeline', 'table'],
  'mystery-consistency': ['checklist', 'table'],
  'romance-analysis': ['checklist', 'table'],
  'scifi-consistency': ['checklist', 'table'],
  'procedure-rules': ['checklist', 'table'],
}

export function moduleViewOptions(module: ModuleDefinition): ModuleView[] {
  return module.views ?? MODULE_VIEW_OVERRIDES[module.id] ?? ['table']
}

export function moduleDefaultView(module: ModuleDefinition): ModuleView {
  return module.defaultView ?? moduleViewOptions(module)[0] ?? 'table'
}

export function recommendedModuleIds(
  template: WorldTemplate,
  moduleData?: Record<string, ModuleRecord[]>,
): string[] {
  const withData = Object.keys(moduleData ?? {}).filter(
    (id) => (moduleData?.[id]?.length ?? 0) > 0 && MODULE_BY_ID.has(id),
  )
  const candidates = (template.modules ?? []).filter((id) => MODULE_BY_ID.has(id))
  return [...new Set([...candidates.slice(0, 4), ...withData])]
}

export function resolveEnabledModules(
  detail: WorkDetail,
  template: WorldTemplate,
): ModuleDefinition[] {
  const ids = detail.enabledModuleIds ?? recommendedModuleIds(template, detail.moduleData)
  return [...new Set(ids)]
    .map((id) => MODULE_BY_ID.get(id))
    .filter((module): module is ModuleDefinition => Boolean(module))
}

export function resolveHiddenModules(
  detail: WorkDetail,
  template: WorldTemplate,
): ModuleDefinition[] {
  const enabled = new Set(
    (detail.enabledModuleIds ?? recommendedModuleIds(template, detail.moduleData)).map(
      (id) => id,
    ),
  )
  const candidates = new Set([
    ...(template.modules ?? []),
    ...Object.keys(detail.moduleData ?? {}),
  ])
  return [...candidates]
    .filter((id) => !enabled.has(id) && (detail.moduleData?.[id]?.length ?? 0) > 0)
    .map((id) => MODULE_BY_ID.get(id))
    .filter((module): module is ModuleDefinition => Boolean(module))
}

export const MODULE_SCOPE_LABELS: Record<ModuleScope, string> = {
  world: '世界',
  character: '人物',
  faction: '势力',
  story: '故事',
  economy: '资源',
}

export function resolveModuleFields(
  module: ModuleDefinition,
  detail?: WorkDetail,
): ModuleField[] {
  return [...module.fields, ...(detail?.moduleCustomFields?.[module.id] ?? [])]
}

export const GENERIC_MODULE_IDS = [
  'world-rules',
  'glossary',
  'timeline',
  'pov-plan',
  'conflict-escalation',
  'culture-customs',
  'org-types',
  'relationship-types',
  'custom-notes',
  'faction-resources',
]

export const XIANXIA_MODULE_IDS = [
  'realm-ladder',
  'spirit-lineages',
  'sect-lineage',
  'artifact-codex',
  'elixir-codex',
  'secret-realm',
  'sect-alliance',
  'sect-missions',
  'technique-counters',
  'dao-events',
]

export const URBAN_MODULE_IDS = [
  'company-registry',
  'career-ladder',
  'equity-assets',
  'projects-deals',
  'power-network',
  'media-opinion',
  'legal-risk',
  'city-spaces',
  'urban-timeline',
  'interest-analysis',
]

export const MYSTERY_MODULE_IDS = [
  'case-board',
  'clue-evidence',
  'suspects-witnesses',
  'alibi-timeline',
  'crime-scenes',
  'motive-map',
  'red-herrings',
  'reveal-plan',
  'procedure-rules',
  'mystery-consistency',
]

export const ROMANCE_MODULE_IDS = [
  'emotional-beats',
  'tension-stages',
  'secrets-misunderstandings',
  'key-scenes',
  'rivals',
  'family-pressure',
  'emotion-curve',
  'dialogue-chemistry',
  'ending-plan',
  'romance-analysis',
]

export const SCIFI_MODULE_IDS = [
  'tech-tree',
  'cyberware',
  'vehicles',
  'star-powers',
  'planets-bases',
  'energy-resources',
  'cyberspace',
  'ai-robots',
  'tech-cost',
  'scifi-consistency',
]

export const HISTORICAL_MODULE_IDS = [
  'nations',
  'territories',
  'military-ranks',
  'armies',
  'campaigns',
  'supply',
  'diplomacy',
  'offices',
  'era-timeline',
  'institutions',
]

export function resolveModules(template: WorldTemplate): ModuleDefinition[] {
  return (template.modules ?? [])
    .map((id) => MODULE_BY_ID.get(id))
    .filter((module): module is ModuleDefinition => Boolean(module))
}

export function cleanModuleIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...GENERIC_MODULE_IDS]
  return [...new Set(raw.filter((id): id is string => typeof id === 'string' && MODULE_BY_ID.has(id)))]
}

export function inferModuleIds(text: string, cultivation = false): string[] {
  if (cultivation || /修仙|玄幻|宗门|境界|灵根|法宝/.test(text)) return [...XIANXIA_MODULE_IDS]
  if (/悬疑|推理|案件|侦探|刑侦|线索/.test(text)) return [...MYSTERY_MODULE_IDS]
  if (/言情|情感|恋爱|甜宠|虐恋/.test(text)) return [...ROMANCE_MODULE_IDS]
  if (/都市|商战|职场|公司|股权|豪门/.test(text)) return [...URBAN_MODULE_IDS]
  if (/科幻|赛博|星际|机甲|末世|义体/.test(text)) return [...SCIFI_MODULE_IDS]
  if (/历史|军事|王朝|战争|军衔|古代/.test(text)) return [...HISTORICAL_MODULE_IDS]
  return [...GENERIC_MODULE_IDS]
}
