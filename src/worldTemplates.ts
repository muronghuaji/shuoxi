import type {
  CustomFeatureDefinition,
  TemplateField,
  TemplateFieldType,
  TemplateFeatureOption,
  TemplateFeatures,
  TemplateStoryGuide,
  TemplateTerms,
  WorkDetail,
  WorldTemplate,
} from './types'
import {
  GENERIC_MODULE_IDS,
  HISTORICAL_MODULE_IDS,
  MYSTERY_MODULE_IDS,
  ROMANCE_MODULE_IDS,
  SCIFI_MODULE_IDS,
  URBAN_MODULE_IDS,
  XIANXIA_MODULE_IDS,
  cleanModuleIds,
  inferModuleIds,
} from './moduleCatalog'

const GENERIC_TERMS: TemplateTerms = {
  faction: '势力',
  factionUnit: '部门',
  rank: '等级',
  ability: '能力',
  item: '物品',
  currency: '货币',
  member: '成员',
  leader: '首领',
  position: '职位',
}

const GENERIC_FEATURES: TemplateFeatures = {
  cultivation: false,
  equipment: false,
  hierarchy: false,
  ranks: false,
  system: false,
}

const STORY_GUIDES: Record<string, TemplateStoryGuide> = {
  xianxia: {
    engine: '一个被规则压住的人，用一次逆天选择撕开境界与门第。',
    promise: '升级、打脸、资源争夺、师徒/宗门羁绊，最终把个人选择变成天下局势。',
    roleSlots: ['废柴或外门主角', '压他一头的同门', '护道长辈', '亦敌亦友的天骄', '宗门之上的执棋者'],
    openings: ['被测出最差天赋，却看见别人看不见的东西', '被逐出宗门当天，捡到一件不能见光的法宝', '替人背锅受罚，意外进入禁地'],
    beats: ['受辱/失位', '第一次越级反击', '得到师承或异宝', '同门/宗门利益冲突', '卷入更大势力', '境界突破与代价', '旧规则被打破'],
    pitfalls: ['无代价越级', '境界数值膨胀', '反派只为送资源', '主角靠天命不靠选择'],
    style: '动作与代价清楚，少解释设定；每次升级都要换一个更难的问题。',
  },
  generic: {
    engine: '一个普通人被一件事推着走，必须在关系和代价之间做出选择。',
    promise: '清晰的主角欲望、持续的阻力和可感知的变化；不依赖题材术语也能成立。',
    roleSlots: ['主角', '对手', '盟友', '阻挠者', '见证者'],
    openings: ['一件不该发生的事打破了日常', '主角收到一个无法拒绝的请求', '一个旧人带着旧秘密回来'],
    beats: ['日常失衡', '第一次行动', '代价出现', '关系变化', '真相或选择', '最终行动', '新的日常'],
    pitfalls: ['主角没有目标', '冲突靠误会硬拖', '配角只做工具人', '结尾没有代价'],
    style: '先写人物想要什么，再写他愿意付出什么；少解释，多让选择发生。',
  },
  urban: {
    engine: '一个被资本/家族规则压住的人，用信息差和交易重新分配权力。',
    promise: '逆袭、商战、站队、资源置换，赢一场不等于安全，输一场可能失去全部。',
    roleSlots: ['被低估的主角', '掌握资源的对手', '利益摇摆的合作者', '家族/公司长辈', '真正的幕后操盘手'],
    openings: ['被踢出项目当天，发现合同里藏着一个名字', '家族会议上被投票出局，却拿到一份旧账', '替领导背锅后，收到对手公司递来的名片'],
    beats: ['失去位置', '拿到第一张牌', '小胜换到资源', '盟友反水', '资本围剿', '用规则反制规则', '重新定义胜负'],
    pitfalls: ['靠巧合拿到关键证据', '反派降智', '商业行为没有法律/资金后果', '只写会议不写代价'],
    style: '信息差要可追溯，每次谈判都有底线和代价；少写口号，多写筹码。',
  },
  mystery: {
    engine: '一个必须解开的问题，牵出一组互相隐瞒的人，以及一个不愿被看见的真相。',
    promise: '线索、误导、嫌疑、反转和真相揭晓；读者可以参与推理。',
    roleSlots: ['调查者', '受害者/失踪者', '最像凶手的人', '隐藏关键信息的人', '真正的操盘者'],
    openings: ['现场少了一件不该少的东西', '死者的时间线里多出一小时', '嫌疑人主动承认没做过的事'],
    beats: ['异常出现', '第一轮调查', '错误答案被推翻', '关键人物说谎暴露', '第二条时间线', '真相接近但代价出现', '最终选择'],
    pitfalls: ['靠巧合破案', '关键线索最后才告诉读者', '凶手没有动机', '所有人都降智配合主角'],
    style: '线索先于答案出现；每章给读者一个新的可推理问题，少替读者总结。',
  },
  romance: {
    engine: '两个想要靠近的人，被各自的过去、身份或选择反复推开。',
    promise: '关系张力、误会与和解、关键场景、情绪回报；感情推进必须有事件驱动。',
    roleSlots: ['主角', '情感对象', '制造阻力的家人/朋友', '镜像关系', '推动转变的关键人物'],
    openings: ['重逢在最不该重逢的场合', '一纸契约把两个人绑在一起', '她替别人赴约，却遇到真正想见的人'],
    beats: ['靠近', '误会或边界出现', '关系被迫绑定', '关键坦白', '外部阻力升级', '选择与代价', '重新靠近'],
    pitfalls: ['只靠误会拖字数', '一方没有独立目标', '强行虐/强行甜', '配角只做工具人'],
    style: '情绪落在动作和细节里；每次关系变化都要有事件触发，少用内心独白解释。',
  },
  scifi: {
    engine: '一个新技术/新规则改变了生存条件，人必须在效率和人性之间做选择。',
    promise: '世界规则、技术代价、组织博弈和生存压力；设定要能改变人物选择。',
    roleSlots: ['技术人员/幸存者', '掌握资源的组织', '规则制定者', '被技术改变的人', '更大的非人变量'],
    openings: ['系统第一次误判', '基地收到一段来自未来的广播', '主角发现自己不是原装人类'],
    beats: ['新规则出现', '第一次使用代价', '组织争夺技术', '规则漏洞暴露', '人性选择', '更大尺度真相', '代价结算'],
    pitfalls: ['科技只是魔法', '设定不讲成本', '人物为设定服务', '结尾用更高科技解决一切'],
    style: '每条技术规则都要有代价和限制；先写人怎么活，再解释原理。',
  },
  historical: {
    engine: '一个身处权力结构底层的人，被时代推到一个必须站队的位置。',
    promise: '权谋、战争、制度、粮饷、家族与天下；胜负取决于资源、信息和人心。',
    roleSlots: ['被时代推上前台的主角', '掌握兵/粮的实权者', '名义上的共主', '旧秩序的守门人', '外部强敌'],
    openings: ['一封被截下的密信改变了一次任命', '粮道断了，城中只剩三天', '主角在朝会上说了一句不该说的话'],
    beats: ['局势失衡', '第一次站队', '粮/兵/人心三线争夺', '盟友背叛', '制度反噬', '决战前夜', '新秩序代价'],
    pitfalls: ['现代价值观直接套古人', '权谋只靠台词', '粮草兵力无数字', '历史人物工具化'],
    style: '权力运行要有制度和资源依据；少写“天下大势”，多写谁吃什么、谁怕什么。',
  },
  rules: {
    engine: '一套不能违反的规则开始杀人，主角必须在规则缝隙里活到看清制定者。',
    promise: '规则解谜、死亡倒计时、玩家/组织博弈，每次胜利都暴露新规则。',
    roleSlots: ['被卷入的普通人', '熟悉规则的老人', '破坏规则的疯子', '制定规则的存在', '隐藏的同类'],
    openings: ['第一条规则出现在手机里', '有人违反规则死了，但尸体留了提示', '主角发现自己已经被写过一次'],
    beats: ['规则降临', '第一次违规代价', '找到漏洞', '团队分裂', '规则升级', '制定者现身', '重写规则'],
    pitfalls: ['规则随便改', '靠主角猜中', '死亡只为吓人', '最后用武力解决'],
    style: '规则先写清，再让角色试错；恐怖来自代价，不来自形容词。',
  },
  wasteland: {
    engine: '旧世界已经失效，人必须在资源、暴力和信任之间重建一个小秩序。',
    promise: '生存、营地、物资、变异与人性选择；每一次安全都要用资源换。',
    roleSlots: ['幸存者', '营地管理者', '掠夺者', '掌握旧技术的人', '更大的生态威胁'],
    openings: ['水源第一次变红', '营地收到不该存在的求救信号', '主角醒来，发现自己被换了身份'],
    beats: ['灾难/失所', '找到临时安全', '资源争夺', '营地内部裂痕', '外部威胁升级', '牺牲与迁移', '新秩序雏形'],
    pitfalls: ['物资无限', '废土只剩打怪', '道德选择没有代价', '人物不饿不冷'],
    style: '先写水、食物、燃料和伤口；秩序是靠具体交换维持的。',
  },
  wuxia: {
    engine: '一个守规矩的江湖人，发现规矩本身已经被权力买走。',
    promise: '门派、恩怨、师徒、江湖规矩与个人选择；武打要有招式逻辑和代价。',
    roleSlots: ['初入江湖的主角', '旧派宗师', '亦正亦邪的浪子', '朝廷/帮会操盘者', '背负旧案的对手'],
    openings: ['一场不该输的比武输了', '师门信物出现在死者手里', '主角奉命送一封信，信里写着自己的名字'],
    beats: ['入江湖', '第一次守/破规矩', '旧案浮出', '门派站队', '武林大会/围杀', '真相与师门决裂', '退出或重立规矩'],
    pitfalls: ['武功没有限制', '江湖规矩只靠旁白', '反派没有立场', '朝廷和门派逻辑割裂'],
    style: '打斗短、准、有空间感；江湖规矩要落在请帖、座次、拜帖和人情上。',
  },
  realism: {
    engine: '一个普通人在具体的生活压力下，做出一个会改变身边人的选择。',
    promise: '真实处境、家庭/职场关系、时代变化与个人尊严；不靠奇观，靠细节。',
    roleSlots: ['被生活推着走的主角', '最亲但最不理解他的人', '掌握资源的小人物', '时代变化的受益者/受害者', '主角自己的旧选择'],
    openings: ['一张账单打破了表面的平静', '老房子要拆，家里人第一次坐到一起', '主角在单位里替人签了一个字'],
    beats: ['日常失衡', '第一次妥协', '关系裂痕', '时代/制度压力', '无法两全的选择', '代价落地', '生活继续'],
    pitfalls: ['用苦难堆情绪', '人物只有立场没有生活', '结尾强行圆满', '时代背景只做布景'],
    style: '写具体的钱、时间、面子和身体感受；少评判，多呈现选择的代价。',
  },
  entertainment: {
    engine: '一个被流量/资本定义的人，想办法拿回自己讲故事的权利。',
    promise: '娱乐圈、直播、舆论、资源争夺和公众形象；热度是资源也是枷锁。',
    roleSlots: ['被低估的艺人/主播', '掌握资源的公司/平台', '竞争对手', '粉丝/舆论代表', '真正的资本操盘手'],
    openings: ['直播事故后，主角被推上热搜', '一个没人接的剧本送到手里', '旧队友在节目里公开内涵'],
    beats: ['被定义', '第一次反击/出圈', '资源上升', '舆论反噬', '公司/平台交易', '公众形象崩塌或重建', '拿回叙事权'],
    pitfalls: ['热搜解决一切', '粉丝群体工具化', '行业规则全靠旁白', '主角没有作品'],
    style: '写清资源怎么换、舆论怎么发酵、作品怎么被看见；少写“全网炸了”。',
  },
  ensemble: {
    engine: '一群人被同一件事绑在一起，每个人都想用自己的方式活下去。',
    promise: '群像、关系网、多线推进和共同事件；没有单一主角，每个人都有欲望和代价。',
    roleSlots: ['群像核心', '对立面核心', '连接者', '背叛者', '局外人/见证者'],
    openings: ['一场葬礼把所有人叫回同一座城', '一张旧照片出现在每个人门口', '共同的秘密即将过期'],
    beats: ['共同事件', '各自立场', '第一次分裂', '秘密交换', '关系重组', '共同代价', '新的共同体或彻底散场'],
    pitfalls: ['人物多但没有区分', '每条线都浅尝辄止', '靠巧合汇合', '旁白总结人物'],
    style: '每场戏至少让两个人暴露不同立场；群像靠选择和代价区分，不靠标签。',
  },
}

function storyTemplate(
  id: string,
  name: string,
  description: string,
  terms: TemplateTerms,
  modules: string[] = GENERIC_MODULE_IDS,
): WorldTemplate {
  return {
    id,
    name,
    description,
    builtin: true,
    story: STORY_GUIDES[id],
    terms,
    features: { ...GENERIC_FEATURES },
    featureOptions: [],
    modules: [...modules],
    characterFields: [],
    factionFields: [],
  }
}

function featureOption(
  key: keyof TemplateFeatures,
  label: string,
  hint: string,
): TemplateFeatureOption {
  return { key, label, hint }
}

const XIANXIA_FEATURE_OPTIONS: TemplateFeatureOption[] = [
  featureOption('cultivation', '灵根 / 体质 / 修为', '角色的灵根、体质、天赋与修为境界'),
  featureOption('equipment', '功法 / 武器 / 法宝 / 灵石', '功法、武器、法宝与货币字段'),
  featureOption('hierarchy', '长老 / 弟子 / 峰堂结构', '势力的层级、长老、弟子与下属单位'),
  featureOption('ranks', '职位 / 境界等级', '职位与修为等级字段'),
  featureOption('system', '系统面板 / 任务 / 积分', '可选的任务、奖励、积分与系统日志'),
]

const URBAN_FEATURE_OPTIONS: TemplateFeatureOption[] = [
  featureOption('hierarchy', '公司 / 部门 / 家族结构', '董事会、部门、家族分支与成员'),
  featureOption('ranks', '职级 / 职衔', '职位、职级与等级字段'),
  featureOption('equipment', '技能 / 资产 / 资金', '技能、资产、物品与资金字段'),
  featureOption('system', '系统 / 任务 / 积分', '可选的任务、积分与系统面板'),
]

const MYSTERY_FEATURE_OPTIONS: TemplateFeatureOption[] = [
  featureOption('hierarchy', '警局 / 专案组结构', '组织层级、部门与成员'),
  featureOption('ranks', '警衔 / 职务', '警衔、职务与等级字段'),
  featureOption('equipment', '证据 / 物证 / 资金', '物证、证据、技能与资金字段'),
]

const ROMANCE_FEATURE_OPTIONS: TemplateFeatureOption[] = [
  featureOption('hierarchy', '家族 / 圈层结构', '家族分支、圈层与核心成员'),
  featureOption('ranks', '身份 / 地位', '身份、地位与关系层级字段'),
]

const SCIFI_FEATURE_OPTIONS: TemplateFeatureOption[] = [
  featureOption('cultivation', '义体 / 异能 / 等级', '义体、异能、天赋与等级'),
  featureOption('equipment', '科技 / 装备 / 信用点', '科技、装备与信用点字段'),
  featureOption('hierarchy', '基地 / 舰队结构', '基地、舰船、军团与成员'),
  featureOption('ranks', '职责 / 等级', '职责、等级与权限字段'),
  featureOption('system', '系统面板 / 任务 / 积分', '可选的任务、积分与系统面板'),
]

const HISTORICAL_FEATURE_OPTIONS: TemplateFeatureOption[] = [
  featureOption('hierarchy', '官署 / 军队 / 州郡', '官署、军队、州郡与成员层级'),
  featureOption('ranks', '官职 / 军衔 / 品级', '官职、军衔与品级字段'),
  featureOption('equipment', '兵器 / 粮饷 / 辎重', '兵器、粮饷、辎重与物资'),
]

const CUSTOM_FEATURE_OPTIONS: TemplateFeatureOption[] = [
  featureOption('cultivation', '能力 / 天赋 / 等级', '自定义的修炼、能力或天赋体系'),
  featureOption('equipment', '技能 / 物品 / 货币', '自定义的技能、物品与货币字段'),
  featureOption('hierarchy', '势力 / 组织 / 层级', '自定义势力的层级与成员结构'),
  featureOption('ranks', '职位 / 等级', '自定义的职位与等级字段'),
  featureOption('system', '系统 / 任务 / 积分', '可选的任务、积分与系统面板'),
]

const LEGACY_SYSTEM_FEATURE_OPTIONS: TemplateFeatureOption[] = [
  featureOption('system', '系统面板 / 任务 / 积分', '任务、奖励、积分与系统日志'),
]

export function getTemplateFeatureOptions(template: WorldTemplate): TemplateFeatureOption[] {
  if (Array.isArray(template.featureOptions)) return template.featureOptions
  const builtin = findBuiltinTemplate(template.id)
  if (builtin?.featureOptions) return builtin.featureOptions
  return [...CUSTOM_FEATURE_OPTIONS]
}

export const BUILTIN_TEMPLATES: WorldTemplate[] = [
  {
    id: 'xianxia',
    name: '修仙 / 玄幻',
    description: '宗门、灵根、功法、法宝与境界体系；当前《九霄问道》示例使用此模板。',
    builtin: true,
    terms: {
      faction: '宗门',
      factionUnit: '峰 / 堂',
      rank: '修为',
      ability: '功法',
      item: '法宝',
      currency: '灵石',
      member: '弟子',
      leader: '宗主',
      position: '宗门职位',
    },
    features: {
      cultivation: true,
      equipment: true,
      hierarchy: true,
      ranks: true,
      system: false,
    },
    featureOptions: XIANXIA_FEATURE_OPTIONS,
    modules: XIANXIA_MODULE_IDS,
    characterFields: [],
    factionFields: [],
  },
  {
    id: 'generic',
    name: '通用小说',
    description: '不绑定题材的通用模板，只保留角色、势力、关系、章节、伏笔与写作风格。',
    builtin: true,
    terms: GENERIC_TERMS,
    features: GENERIC_FEATURES,
    featureOptions: [],
    modules: GENERIC_MODULE_IDS,
    characterFields: [],
    factionFields: [],
  },
  {
    id: 'urban',
    name: '都市 / 商战',
    description: '公司、家族、股权、项目、舆论与职级；适合都市、商战、职场与权力故事。',
    builtin: true,
    terms: {
      faction: '公司 / 家族',
      factionUnit: '部门',
      rank: '职级',
      ability: '技能',
      item: '物品',
      currency: '资金',
      member: '员工',
      leader: '老板 / 家长',
      position: '职位',
    },
    features: {
      cultivation: false,
      equipment: false,
      hierarchy: false,
      ranks: false,
      system: false,
    },
    featureOptions: URBAN_FEATURE_OPTIONS,
    modules: URBAN_MODULE_IDS,
    characterFields: [],
    factionFields: [],
  },
  {
    id: 'mystery',
    name: '悬疑 / 推理',
    description: '案件、线索、嫌疑人、时间线、误导与真相揭晓；适合推理、刑侦与悬疑故事。',
    builtin: true,
    terms: {
      faction: '组织 / 警方',
      factionUnit: '部门',
      rank: '职级',
      ability: '技能',
      item: '物证',
      currency: '资金',
      member: '成员',
      leader: '负责人',
      position: '职务',
    },
    features: {
      cultivation: false,
      equipment: false,
      hierarchy: false,
      ranks: false,
      system: false,
    },
    featureOptions: MYSTERY_FEATURE_OPTIONS,
    modules: MYSTERY_MODULE_IDS,
    characterFields: [],
    factionFields: [],
  },
  {
    id: 'romance',
    name: '言情 / 情感',
    description: '情感节点、关系张力、误会、关键场景与情绪曲线；适合言情与情感故事。',
    builtin: true,
    terms: {
      faction: '家族 / 圈子',
      factionUnit: '分支',
      rank: '身份',
      ability: '能力',
      item: '信物',
      currency: '资产',
      member: '成员',
      leader: '家长 / 核心人物',
      position: '身份',
    },
    features: {
      cultivation: false,
      equipment: false,
      hierarchy: false,
      ranks: false,
      system: false,
    },
    featureOptions: ROMANCE_FEATURE_OPTIONS,
    modules: ROMANCE_MODULE_IDS,
    characterFields: [],
    factionFields: [],
  },
  {
    id: 'scifi',
    name: '科幻 / 赛博',
    description: '势力、基地、科技、装备与信用点；适合科幻、赛博、末世与星际故事。',
    builtin: true,
    terms: {
      faction: '势力 / 舰队',
      factionUnit: '基地 / 舰船',
      rank: '等级',
      ability: '科技',
      item: '装备',
      currency: '信用点',
      member: '成员',
      leader: '指挥官',
      position: '职责',
    },
    features: {
      cultivation: false,
      equipment: true,
      hierarchy: false,
      ranks: false,
      system: false,
    },
    featureOptions: SCIFI_FEATURE_OPTIONS,
    modules: SCIFI_MODULE_IDS,
    characterFields: [],
    factionFields: [],
  },
  {
    id: 'historical',
    name: '历史 / 军事',
    description: '国家、州郡、军衔、兵法与粮饷；适合历史、军事与权谋故事。',
    builtin: true,
    terms: {
      faction: '国家 / 军团',
      factionUnit: '州郡 / 兵团',
      rank: '军衔',
      ability: '兵法',
      item: '兵器',
      currency: '粮饷',
      member: '将士',
      leader: '统帅',
      position: '职务',
    },
    features: {
      cultivation: false,
      equipment: false,
      hierarchy: false,
      ranks: false,
      system: false,
    },
    featureOptions: HISTORICAL_FEATURE_OPTIONS,
    modules: HISTORICAL_MODULE_IDS,
    characterFields: [],
    factionFields: [],
  },
  {
    id: 'custom',
    name: '自定义世界',
    description: '空白模板。自己定义术语、能力、势力和角色字段，适合新类型或原创世界观。',
    builtin: true,
    terms: GENERIC_TERMS,
    features: GENERIC_FEATURES,
    featureOptions: CUSTOM_FEATURE_OPTIONS,
    modules: GENERIC_MODULE_IDS,
    characterFields: [],
    factionFields: [],
  },
  storyTemplate(
    'rules',
    '规则怪谈 / 无限流',
    '规则、副本、死亡倒计时与制定者；适合规则怪谈、无限流与悬疑解谜。',
    {
      faction: '组织 / 阵营',
      factionUnit: '小队 / 层',
      rank: '层级',
      ability: '规则 / 能力',
      item: '道具',
      currency: '积分',
      member: '玩家',
      leader: '组织者',
      position: '身份',
    },
  ),
  storyTemplate(
    'wasteland',
    '末世 / 废土',
    '营地、物资、变异与幸存者秩序；适合末世、废土与生存故事。',
    {
      faction: '营地 / 势力',
      factionUnit: '聚落',
      rank: '等级',
      ability: '异能',
      item: '物资',
      currency: '物资',
      member: '幸存者',
      leader: '首领',
      position: '职责',
    },
  ),
  storyTemplate(
    'wuxia',
    '武侠 / 江湖',
    '门派、帮会、师承、兵器与江湖规矩；适合武侠、江湖与低武权谋。',
    {
      faction: '门派 / 帮会',
      factionUnit: '堂口',
      rank: '境界',
      ability: '武学',
      item: '兵器',
      currency: '银两',
      member: '弟子',
      leader: '掌门',
      position: '江湖身份',
    },
  ),
  storyTemplate(
    'realism',
    '现实 / 年代',
    '家庭、单位、时代变化与普通人的选择；适合现实、年代与生活流故事。',
    GENERIC_TERMS,
  ),
  storyTemplate(
    'entertainment',
    '娱乐圈 / 直播',
    '公司、平台、舆论、资源与公众形象；适合娱乐圈、直播与行业故事。',
    {
      faction: '公司 / 平台',
      factionUnit: '部门 / 团队',
      rank: '番位 / 职级',
      ability: '技能',
      item: '资源',
      currency: '通告费',
      member: '艺人 / 主播',
      leader: '老板',
      position: '职位',
    },
  ),
  storyTemplate(
    'ensemble',
    '女性向 / 群像',
    '多线人物、关系网与共同事件；适合女性向、群像与关系叙事。',
    GENERIC_TERMS,
  ),
].map((template) => ({
  ...template,
  story: template.story ?? STORY_GUIDES[template.id],
}))

export function findBuiltinTemplate(id?: string): WorldTemplate | undefined {
  return BUILTIN_TEMPLATES.find((template) => template.id === id)
}

const LEGACY_SYSTEM_TEMPLATE: WorldTemplate = {
  id: 'system',
  name: '系统 / 游戏化（旧模板）',
  description: '旧版系统模板，保留系统功能，不再出现在模板选择器中。',
  features: { ...GENERIC_FEATURES, system: true },
  featureOptions: LEGACY_SYSTEM_FEATURE_OPTIONS,
  terms: GENERIC_TERMS,
  modules: [...GENERIC_MODULE_IDS],
  characterFields: [],
  factionFields: [],
}

export function detectWorldTemplate(detail: WorkDetail): WorldTemplate {
  const cultivationish = detail.characters.some(
    (character) =>
      Boolean(character.cultivation || character.spiritRoot || character.physique || character.talent),
  )
  const hierarchyish = detail.factions.some(
    (faction) => (faction.peaks?.length ?? 0) > 0 || (faction.elders?.length ?? 0) > 0,
  )
  return cultivationish || hierarchyish
    ? BUILTIN_TEMPLATES[0]
    : BUILTIN_TEMPLATES.find((template) => template.id === 'generic')!
}

export function resolveWorldTemplate(detail: WorkDetail): WorldTemplate {
  if (detail.worldTemplateId === 'system' && !detail.worldTemplate) {
    return LEGACY_SYSTEM_TEMPLATE
  }
  const template =
    detail.worldTemplate ??
    findBuiltinTemplate(detail.worldTemplateId) ??
    detectWorldTemplate(detail)
  if (template.modules?.length) return template
  const name = template.name
  let fallback = GENERIC_MODULE_IDS
  if (template.features.cultivation || /修仙|玄幻/.test(name)) fallback = XIANXIA_MODULE_IDS
  else if (/悬疑|推理/.test(name)) fallback = MYSTERY_MODULE_IDS
  else if (/言情|情感/.test(name)) fallback = ROMANCE_MODULE_IDS
  else if (/都市|商战/.test(name)) fallback = URBAN_MODULE_IDS
  else if (/科幻|赛博/.test(name)) fallback = SCIFI_MODULE_IDS
  else if (/历史|军事/.test(name)) fallback = HISTORICAL_MODULE_IDS
  return { ...template, modules: [...fallback] }
}

export function cloneTemplate(template: WorldTemplate): WorldTemplate {
  return JSON.parse(JSON.stringify(template)) as WorldTemplate
}

export function createCustomTemplate(base: WorldTemplate): WorldTemplate {
  return {
    ...cloneTemplate(base),
    id: `custom-${Date.now().toString(36)}`,
    name: `${base.name}（自定义）`,
    builtin: false,
  }
}

function cleanField(raw: unknown, index: number): TemplateField | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const label = typeof value.label === 'string' ? value.label.trim().slice(0, 40) : ''
  if (!label) return null
  const type: TemplateFieldType =
    value.type === 'textarea' || value.type === 'number' || value.type === 'select'
      ? value.type
      : 'text'
  const options = Array.isArray(value.options)
    ? value.options
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20)
    : []
  return {
    id:
      typeof value.id === 'string' && value.id.trim()
        ? value.id.trim().slice(0, 60)
        : `field-${index}-${Date.now().toString(36)}`,
    label,
    type,
    placeholder:
      typeof value.placeholder === 'string' ? value.placeholder.trim().slice(0, 120) : undefined,
    options: type === 'select' ? options : undefined,
  }
}

function cleanFields(raw: unknown): TemplateField[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((field, index) => cleanField(field, index))
    .filter((field): field is TemplateField => Boolean(field))
    .slice(0, 24)
}

function cleanTerms(raw: unknown): TemplateTerms {
  const value = (raw ?? {}) as Record<string, unknown>
  const terms = { ...GENERIC_TERMS }
  for (const key of Object.keys(terms) as (keyof TemplateTerms)[]) {
    if (typeof value[key] === 'string' && value[key].trim()) {
      terms[key] = String(value[key]).trim().slice(0, 24)
    }
  }
  return terms
}

function cleanFeatureOptions(raw: unknown): TemplateFeatureOption[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const keys: (keyof TemplateFeatures)[] = [
    'cultivation',
    'equipment',
    'hierarchy',
    'ranks',
    'system',
  ]
  const seen = new Set<string>()
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const value = item as Record<string, unknown>
      const key = value.key
      if (typeof key !== 'string' || !keys.includes(key as keyof TemplateFeatures)) return null
      if (seen.has(key)) return null
      seen.add(key)
      const label = typeof value.label === 'string' ? value.label.trim().slice(0, 40) : ''
      const hint = typeof value.hint === 'string' ? value.hint.trim().slice(0, 100) : ''
      if (!label) return null
      return { key: key as keyof TemplateFeatures, label, hint }
    })
    .filter((item): item is TemplateFeatureOption => Boolean(item))
    .slice(0, 5)
}

function cleanCustomFeatures(raw: unknown): CustomFeatureDefinition[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const value = item as Record<string, unknown>
      const name = typeof value.name === 'string' ? value.name.trim().slice(0, 40) : ''
      if (!name) return null
      return {
        id:
          typeof value.id === 'string' && value.id.trim()
            ? value.id.trim().slice(0, 60)
            : `feature-${index}-${Date.now().toString(36)}`,
        name,
        scope: value.scope === 'faction' ? ('faction' as const) : ('character' as const),
        fields: cleanFields(value.fields).slice(0, 12),
        includeInContext: value.includeInContext !== false,
      }
    })
    .filter((item): item is CustomFeatureDefinition => Boolean(item))
    .slice(0, 10)
}

export function validateWorldTemplate(raw: unknown): WorldTemplate | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 40) : ''
  if (!name) return null
  const features = (value.features ?? {}) as Record<string, unknown>
  const text = `${name} ${typeof value.description === 'string' ? value.description : ''} ${Object.values(value.terms ?? {}).filter((item) => typeof item === 'string').join(' ')}`
  const modules =
    Array.isArray(value.modules) && value.modules.length > 0
      ? cleanModuleIds(value.modules)
      : inferModuleIds(text, Boolean(features.cultivation))
  return {
    id:
      typeof value.id === 'string' && value.id.trim()
        ? value.id.trim().slice(0, 60)
        : `custom-${Date.now().toString(36)}`,
    name,
    description:
      typeof value.description === 'string' ? value.description.trim().slice(0, 240) : '',
    builtin: false,
    terms: cleanTerms(value.terms),
    features: {
      cultivation: Boolean(features.cultivation),
      equipment: Boolean(features.equipment),
      hierarchy: Boolean(features.hierarchy),
      ranks: Boolean(features.ranks),
      system: Boolean(features.system),
    },
    featureOptions: cleanFeatureOptions(value.featureOptions),
    customFeatures: cleanCustomFeatures(value.customFeatures),
    modules,
    characterFields: cleanFields(value.characterFields),
    factionFields: cleanFields(value.factionFields),
  }
}

export function parseGeneratedTemplate(text: string): WorldTemplate | null {
  const trimmed = text.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return validateWorldTemplate(JSON.parse(withoutFence.slice(start, end + 1)))
  } catch {
    return null
  }
}
