import type { FactionFacility, FactionFacilityCounts } from './types'
import { normalizeInventory } from './inventory'

export interface FacilityPreset {
  type: string
  name: string
  description: string
  effect: string
}

const SECT: FacilityPreset[] = [
  { type: '山峰', name: '主峰', description: '宗门核心驻地，掌门与长老议事、传道所在。', effect: '发布宗门任务，调度弟子' },
  { type: '分堂', name: '任务堂', description: '弟子领取任务、兑换贡献的地方。', effect: '提供任务与贡献点' },
  { type: '藏书阁', name: '藏书阁', description: '收藏功法、典籍与旧案的楼阁。', effect: '查阅功法与秘闻' },
  { type: '剑阁', name: '剑阁', description: '藏剑、试剑和剑修悟道之地。', effect: '获取剑类资源或传承' },
  { type: '丹房', name: '炼丹房', description: '炼制丹药、处理药园材料的丹房。', effect: '产出丹药，处理伤势' },
  { type: '器阁', name: '炼器阁', description: '锻造、修复法器的工坊。', effect: '打造或修复装备' },
  { type: '演武场', name: '演武场', description: '弟子比试、操练和公开选拔的场地。', effect: '举办比试，暴露实力' },
  { type: '刑堂', name: '刑堂', description: '审问、惩戒与关押犯戒者的地方。', effect: '施压、审讯与执行门规' },
  { type: '库房', name: '宗门库房', description: '存放灵石、材料与宗门资产的仓库。', effect: '调用宗门资源' },
  { type: '秘境', name: '秘境', description: '宗门掌控的试炼秘境，入口有严格限制。', effect: '开启限时副本或传承' },
]

const FAMILY: FacilityPreset[] = [
  { type: '祖宅', name: '祖宅', description: '家族根基所在，祠堂与家老议事厅都在这里。', effect: '家族权威与庇护' },
  { type: '祠堂', name: '祠堂', description: '供奉先祖、执行家法的地方。', effect: '声望、家法与传承' },
  { type: '藏书楼', name: '藏书楼', description: '家族功法、族谱和旧信的收藏处。', effect: '查阅家族秘史' },
  { type: '演武场', name: '演武场', description: '族中子弟修炼、比试的场地。', effect: '训练与选拔' },
  { type: '药园', name: '药园', description: '培育灵药、供应丹房的园地。', effect: '产出药材' },
  { type: '库房', name: '族库', description: '存放族产、兵器和贵重物品的库房。', effect: '调用家族资源' },
  { type: '暗卫', name: '暗卫营', description: '家族暗中培养的护卫与情报力量。', effect: '保护、监视与清除' },
]

const COURT: FacilityPreset[] = [
  { type: '皇宫', name: '皇宫', description: '皇权中心，朝会与密诏都从这里发出。', effect: '最高权力与合法性' },
  { type: '朝堂', name: '朝堂', description: '百官议政、党争和站队的地方。', effect: '推动政治冲突' },
  { type: '国库', name: '国库', description: '王朝财政与贡品的存放处。', effect: '调度财力与资源' },
  { type: '军营', name: '京畿大营', description: '拱卫都城、执行军令的驻军大营。', effect: '军事威慑与兵变风险' },
  { type: '情报司', name: '情报司', description: '收集密报、监视官员的机构。', effect: '掌握秘密与把柄' },
  { type: '驿站', name: '驿站', description: '传递军情、诏令和商旅往来的节点。', effect: '信息与交通' },
]

const MERCHANT: FacilityPreset[] = [
  { type: '总号', name: '总号', description: '商会总部，账房、护卫和情报网在此调度。', effect: '统一调度商路与资金' },
  { type: '仓库', name: '总仓', description: '存放货物、灵石与往来账册的仓库。', effect: '调用货物与资金' },
  { type: '拍卖行', name: '拍卖行', description: '拍卖珍稀物品、交换情报的场所。', effect: '交易稀有资源' },
  { type: '账房', name: '账房', description: '核对账目、洗钱和掌握把柄的地方。', effect: '财务与秘密' },
  { type: '护卫队', name: '护卫队', description: '押运货物、保护商队的武装力量。', effect: '武力保护与押运' },
  { type: '情报网', name: '情报网', description: '分布在码头、茶楼和商路上的暗线。', effect: '消息与黑市渠道' },
]

const ORGANIZATION: FacilityPreset[] = [
  { type: '总堂', name: '总堂', description: '帮派或组织的核心据点，首领在此发号施令。', effect: '权威与调度' },
  { type: '分堂', name: '分堂', description: '控制街区或地盘的分支据点。', effect: '地盘与人力' },
  { type: '刑堂', name: '刑堂', description: '处置叛徒、审问敌人的地方。', effect: '威慑与审讯' },
  { type: '库房', name: '库房', description: '存放武器、货物和活动经费的仓库。', effect: '调用组织资源' },
  { type: '情报堂', name: '情报堂', description: '收集把柄、安排眼线的暗线机构。', effect: '情报与渗透' },
  { type: '产业', name: '产业', description: '赌场、码头、酒馆等合法或灰色的产业。', effect: '现金流与掩护' },
]

const ACADEMY: FacilityPreset[] = [
  { type: '讲堂', name: '讲堂', description: '公开授课、辩论和考核的场所。', effect: '学习与声望' },
  { type: '藏书阁', name: '藏书阁', description: '学院典籍与禁书的收藏处。', effect: '查阅资料与禁书' },
  { type: '试炼场', name: '试炼场', description: '学生实战考核与排名的场地。', effect: '排名与资源分配' },
  { type: '丹房', name: '丹房', description: '学院炼丹与研究药物的实验室。', effect: '丹药与实验' },
  { type: '器阁', name: '器阁', description: '制作、维修教学器械的工坊。', effect: '装备与维修' },
  { type: '宿舍', name: '宿舍区', description: '学生生活、结盟和暗斗的生活区。', effect: '人际关系与秘密' },
]

const MILITARY: FacilityPreset[] = [
  { type: '大营', name: '中军大营', description: '主帅发令、军议和调度全军的营地。', effect: '全军调度' },
  { type: '粮仓', name: '粮仓', description: '存放军粮和过冬物资的仓库。', effect: '维持军队与围城' },
  { type: '军械库', name: '军械库', description: '存放兵器、甲胄和攻城器械的库房。', effect: '武装与补给' },
  { type: '斥候营', name: '斥候营', description: '侦察、渗透和传递军情的营地。', effect: '情报与先手' },
  { type: '校场', name: '校场', description: '练兵、点将和公开处刑的场地。', effect: '士气与军纪' },
  { type: '刑营', name: '刑营', description: '关押战俘、审问细作的地方。', effect: '审讯与威慑' },
]

const CHURCH: FacilityPreset[] = [
  { type: '圣殿', name: '圣殿', description: '教会最高仪式与权力中心。', effect: '信仰与合法性' },
  { type: '祈祷厅', name: '祈祷厅', description: '信徒集会、聆听神谕的地方。', effect: '凝聚信徒' },
  { type: '藏经院', name: '藏经院', description: '收藏教义、神谕与禁典的院落。', effect: '教义与秘密' },
  { type: '裁判所', name: '裁判所', description: '审判异端、执行教规的机构。', effect: '审判与恐惧' },
  { type: '圣库', name: '圣库', description: '存放奉献物、圣物和财富的库房。', effect: '资源与圣物' },
]

const GENERAL: FacilityPreset[] = [
  { type: '主殿', name: '主殿', description: '势力核心驻地与首领议事处。', effect: '权威与调度' },
  { type: '分堂', name: '分堂', description: '向外延伸的分支据点。', effect: '扩张与人力' },
  { type: '库房', name: '库房', description: '存放资源、装备和账册的仓库。', effect: '调用资源' },
  { type: '演武场', name: '演武场', description: '训练、比试和展示力量的地方。', effect: '训练与威慑' },
  { type: '情报堂', name: '情报堂', description: '收集消息、培养暗线的机构。', effect: '情报与渗透' },
  { type: '产业', name: '产业', description: '维持势力的产业与现金流。', effect: '资金与掩护' },
]

export const FACILITY_PRESETS: FacilityPreset[] = [
  ...SECT,
  ...FAMILY,
  ...COURT,
  ...MERCHANT,
  ...ORGANIZATION,
  ...ACADEMY,
  ...MILITARY,
  ...CHURCH,
  ...GENERAL,
]

export function facilityPresetsFor(type: string): FacilityPreset[] {
  if (/宗|门|派|道观|佛寺|教派|剑宗|仙门/.test(type)) return SECT
  if (/家族|世家|门阀|氏族/.test(type)) return FAMILY
  if (/王朝|帝国|朝廷|王国|皇|官府|城邦/.test(type)) return COURT
  if (/商会|商行|公司|集团|财团|商盟/.test(type)) return MERCHANT
  if (/学院|书院|学堂|大学|学宫/.test(type)) return ACADEMY
  if (/军|兵团|舰队|军团|军团|联盟军/.test(type)) return MILITARY
  if (/教|神殿|圣堂|教会|修道院/.test(type)) return CHURCH
  if (/帮|会|社|组织|联盟|集团|势力/.test(type)) return ORGANIZATION
  return GENERAL
}

export function emptyFacilityCounts(): FactionFacilityCounts {
  return { elder: 0, main: 0, inner: 0, outer: 0, menial: 0 }
}

export function normalizeFacilityCounts(
  value: unknown,
): FactionFacilityCounts {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const read = (key: string) => {
    const number = typeof raw[key] === 'number' ? raw[key] : Number(raw[key])
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0
  }
  return {
    elder: read('elder'),
    main: read('main'),
    inner: read('inner'),
    outer: read('outer'),
    menial: read('menial'),
  }
}

export function facilityPeopleCount(facility: FactionFacility): number {
  const counts = normalizeFacilityCounts(facility.counts)
  return counts.elder + counts.main + counts.inner + counts.outer + counts.menial
}

export function factionFacilityTotals(facilities: FactionFacility[] | undefined): FactionFacilityCounts {
  const totals = emptyFacilityCounts()
  for (const facility of normalizeFacilities(facilities)) {
    const counts = normalizeFacilityCounts(facility.counts)
    totals.elder += counts.elder
    totals.main += counts.main
    totals.inner += counts.inner
    totals.outer += counts.outer
    totals.menial += counts.menial
  }
  return totals
}

export function normalizeFacilities(value: unknown): FactionFacility[] {
  if (!Array.isArray(value)) return []
  return value
    .map<FactionFacility | null>((item, index) => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : ''
      if (!name) return null
      const rawResources = Array.isArray(raw.resources) ? raw.resources : []
      return {
        id:
          typeof raw.id === 'string' && raw.id.trim()
            ? raw.id.trim()
            : `fac-${Date.now().toString(36)}-${index}`,
        name,
        type: typeof raw.type === 'string' ? raw.type.trim().slice(0, 40) : '设施',
        description:
          typeof raw.description === 'string' ? raw.description.trim().slice(0, 500) : '',
        keeper: typeof raw.keeper === 'string' ? raw.keeper.trim().slice(0, 80) : '',
        effect: typeof raw.effect === 'string' ? raw.effect.trim().slice(0, 300) : '',
        counts: normalizeFacilityCounts(raw.counts),
        resources: normalizeInventory(rawResources),
        resourceNames: (
          rawResources.some((resource) => typeof resource === 'string')
            ? rawResources.filter((resource): resource is string => typeof resource === 'string')
            : Array.isArray(raw.resourceNames)
              ? raw.resourceNames.filter(
                  (resource): resource is string => typeof resource === 'string',
                )
              : []
        )
          .map((resource) => resource.trim())
          .filter(Boolean)
          .slice(0, 20),
      }
    })
    .filter((item): item is FactionFacility => item !== null)
}

export function facilityPresetToFacility(preset: FacilityPreset): FactionFacility {
  return {
    id: `fac-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: preset.name,
    type: preset.type,
    description: preset.description,
    keeper: '',
    effect: preset.effect,
    counts: emptyFacilityCounts(),
    resources: [],
    resourceNames: [],
  }
}
