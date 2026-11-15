export type ItemKind = 'technique' | 'weapon' | 'treasure'

export interface ItemDescription {
  grade: string
  type: string
  effect: string
  condition?: string
  state?: string
}

interface ItemOverride {
  grade: string
  type: string
  effect: string
  condition?: string
  state?: string
}

const ITEM_OVERRIDES: Record<string, ItemOverride> = {
  太虚剑典: {
    grade: '天阶',
    type: '心法 / 剑道',
    effect: '以剑意养神识，统摄太虚一脉所有剑诀；修炼至深处可凝聚剑域。',
    condition: '需以太虚心法为根基，每次破境有剑意反噬。',
    state: '宗门传承 · 沈玄清主修',
  },
  寒山十三式: {
    grade: '天阶',
    type: '剑诀',
    effect: '十三式层层封山，最后一式可冻结一方灵气，是沈玄清封山一剑的来源。',
    state: '已修至第九式',
  },
  一念封山: {
    grade: '天阶',
    type: '秘术',
    effect: '将全部剑意压缩为一念，出剑即封山；威力越大，反噬越重。',
    condition: '化神以上方可施展。',
    state: '沈玄清压箱底的一剑',
  },
  玄霜剑: {
    grade: '仙品',
    type: '本命剑',
    effect: '出鞘三尺内冻结灵气，剑身会随主人心境变化；剑鸣可传百里。',
    condition: '需剑主以心血祭炼。',
    state: '已认主 · 不可交易',
  },
  太虚剑匣: {
    grade: '仙品',
    type: '法宝 / 封印',
    effect: '藏剑、养剑、封剑三用，匣中封着半截剑灵，与陆照雪母亲有关。',
    condition: '需太虚宗主血脉或剑令开启。',
    state: '封存中 · 少一枚剑令',
  },
  清心玉: {
    grade: '地阶',
    type: '护身法宝',
    effect: '温养神识，抵御心魔与幻术；在突破时能稳住一口气。',
    state: '沈玄清随身',
  },
  护山大阵枢: {
    grade: '天阶',
    type: '阵法核心',
    effect: '控制太虚山九峰护山大阵，可封山、困敌、转移灵脉。',
    condition: '仅宗主与执法长老可动用。',
    state: '问剑峰顶',
  },
  流云剑诀: {
    grade: '玄阶',
    type: '剑诀',
    effect: '剑势轻灵连绵，适合以快打慢；与太虚剑典残卷配合时威力翻倍。',
    state: '陆照雪主修',
  },
  '太虚剑典·残卷': {
    grade: '天阶',
    type: '残卷',
    effect: '只余前三式，却足以让外门弟子越阶而战；后六式下落不明。',
    condition: '无完整心法，强行修炼会伤及经脉。',
    state: '残卷 · 夹在旧剑谱中',
  },
  照雪三式: {
    grade: '玄阶',
    type: '自创剑诀',
    effect: '陆照雪从残卷中悟出的三式，剑意偏寒，第三式尚未完全掌握。',
    state: '自创 · 尚未命名最后一式',
  },
  照雪剑: {
    grade: '玄阶',
    type: '佩剑',
    effect: '与陆照雪的冰灵根共鸣，剑身越冷，剑意越盛。',
    state: '已认主 · 剑身有裂纹',
  },
  半枚太虚剑令: {
    grade: '地阶',
    type: '信物',
    effect: '可出入藏锋堂与问剑峰，但只有半枚，无法开启剑匣。',
    state: '残缺 · 陆照雪随身',
  },
  青云长生诀: {
    grade: '天阶',
    type: '道门心法',
    effect: '以气养神，绵长不绝；擅长持久战与压制伤势。',
    state: '云无涯主修',
  },
  一气化三清: {
    grade: '天阶',
    type: '道术',
    effect: '分化三道清气迷惑对手，可攻可守，是青云门镇门之术。',
    condition: '极耗神识。',
  },
  青梧百草经: {
    grade: '地阶',
    type: '药道功法',
    effect: '辨药、配药、以药入道；可临时压制毒素与魔气。',
    state: '苏青梧主修',
  },
  引火归元: {
    grade: '玄阶',
    type: '丹火术',
    effect: '引地火入药，控制丹炉温度；也能在战斗中以火攻敌。',
  },
  听春: {
    grade: '玄阶',
    type: '药锄',
    effect: '采药时能感应灵植年份，也可拆解成九枚银针。',
    state: '苏青梧随身',
  },
  青玉药囊: {
    grade: '地阶',
    type: '储物法宝',
    effect: '保存药材不腐，内里空间约一间药房大小。',
    state: '苏青梧随身',
  },
  万毒归心诀: {
    grade: '天阶',
    type: '毒道心法',
    effect: '以万毒养身，毒越重修为越高；可将毒素凝成蛊。',
    condition: '需从小以毒淬体。',
    state: '祝红绡主修',
  },
  红绡蛊经: {
    grade: '地阶',
    type: '蛊道秘术',
    effect: '以血养蛊、以蛊控人，红绡软鞭中藏着三种本命蛊。',
  },
  万蛊鼎: {
    grade: '仙品',
    type: '镇宗法宝',
    effect: '万毒谷至宝，可炼蛊、养蛊、封蛊，鼎中据说还活着初代谷主。',
    condition: '需以南疆古图开启。',
    state: '万蛊堂供奉',
  },
  七绝毒囊: {
    grade: '地阶',
    type: '毒囊',
    effect: '收纳七种绝毒，按顺序释放可组合出不同效果。',
    state: '祝红绡随身',
  },
  七绝蛊经: {
    grade: '玄阶',
    type: '蛊道功法',
    effect: '以七情养七蛊，蛊虫会随主人情绪变化。',
    state: '殷十娘主修',
  },
  化血遁: {
    grade: '玄阶',
    type: '身法',
    effect: '以精血为引瞬移百丈，代价是短时间气血亏空。',
    condition: '连续使用会伤及根基。',
  },
  子母双匕: {
    grade: '玄阶',
    type: '双匕',
    effect: '母刃见血后，子刃可循血气追踪；适合近身刺杀。',
    state: '殷十娘随身',
  },
  金蚕蛊: {
    grade: '地阶',
    type: '本命蛊',
    effect: '可吞噬毒素与灵气，危急时替宿主挡一次致命伤。',
    state: '已认主 · 休眠中',
  },
  九转丹经: {
    grade: '天阶',
    type: '丹道心法',
    effect: '九转成丹，每一转都需要不同地火与药引；可炼延寿丹。',
    state: '丹阳子主修',
  },
  丹火不灭: {
    grade: '天阶',
    type: '丹火术',
    effect: '地火不熄，丹炉不冷；战斗时可将丹火化为火墙。',
  },
  九转丹炉: {
    grade: '仙品',
    type: '镇谷法宝',
    effect: '炼丹至宝，可自动调节火候；炉底刻着半篇失传丹方。',
    state: '丹炉峰 · 丹阳子祭炼中',
  },
  万年火灵芝: {
    grade: '仙品',
    type: '天材地宝',
    effect: '可续命、破境、炼九转还魂丹；丹霞谷仅此半株。',
    state: '药库最深处 · 封存',
  },
  百草辨微: {
    grade: '地阶',
    type: '药道秘术',
    effect: '通过气味、纹理与灵气判断药性，也能识破伪装毒药。',
    state: '白芷主修',
  },
  丹火三昧: {
    grade: '玄阶',
    type: '丹火术',
    effect: '三昧真火用于炼丹与攻敌，温度随心境变化。',
  },
  白芷药鼎: {
    grade: '玄阶',
    type: '药鼎',
    effect: '白芷随身药鼎，可炼小还丹与解毒丹；鼎身有裂纹。',
  },
  天机百解: {
    grade: '天阶',
    type: '机关心法',
    effect: '拆解天下机关与阵法，推演其结构；修炼到深处可反推炼制者。',
    state: '公输玄主修',
  },
  机关傀儡术: {
    grade: '地阶',
    type: '机关术',
    effect: '以灵石驱动傀儡，可侦察、战斗、搬运；天机阁的看家本领。',
  },
  天机盘: {
    grade: '仙品',
    type: '镇阁法宝',
    effect: '推演天机、追踪气息、封锁消息；每次使用都会损耗寿命。',
    condition: '需天机阁主血脉。',
    state: '听雨楼 · 公输玄轮椅暗格',
  },
  青铜鸟: {
    grade: '地阶',
    type: '机关鸟',
    effect: '可飞千里传讯，也能在危急时自爆示警。',
    state: '已认主 · 公输小满改造过',
  },
  天机阁备用令: {
    grade: '地阶',
    type: '令牌',
    effect: '可调动天机阁一处暗线，但只能使用一次。',
    state: '公输小满偷带',
  },
  玄天不坏身: {
    grade: '天阶',
    type: '体修功法',
    effect: '以禅定淬体，肉身可抗法宝；修炼到极致可断肢重生。',
    state: '玄天老祖主修',
  },
  大寂灭禅: {
    grade: '天阶',
    type: '禅功',
    effect: '以寂灭之意镇压魔气，也能让对手短暂失去战意。',
    condition: '心志不坚者易入魔。',
  },
  玄天舍利: {
    grade: '仙品',
    type: '佛门法宝',
    effect: '镇魔、疗伤、护心；玄天老祖把唯一一颗交给了释无相。',
    state: '释无相随身',
  },
  雪山伏魔阵: {
    grade: '天阶',
    type: '护山阵法',
    effect: '封锁西域魔气入口，阵眼在玄天峰顶。',
    condition: '需三位元婴以上修士同时维持。',
    state: '常年开启',
  },
  伏魔棍法: {
    grade: '地阶',
    type: '棍法',
    effect: '以守为攻，棍势如山；对魔修有额外压制。',
    state: '释无相主修',
  },
  无相: {
    grade: '地阶',
    type: '乌木棍',
    effect: '棍身刻满经文，击中魔修时会自动诵经。',
    state: '释无相随身',
  },
  幽冥渡厄经: {
    grade: '天阶',
    type: '魔道心法',
    effect: '渡魂、养鬼、借阴煞修炼；可操控亡魂作战。',
    state: '夜无冥主修',
  },
  九幽噬魂: {
    grade: '天阶',
    type: '魔道秘术',
    effect: '吞噬魂魄补全自身，对神识有极强侵蚀。',
    condition: '需幽冥灯护住心神。',
  },
  冥河刀: {
    grade: '仙品',
    type: '本命魔刀',
    effect: '刀锋带忘川死气，伤口难以愈合；斩杀越多，刀越强。',
    state: '已认主 · 夜无冥',
  },
  幽冥灯: {
    grade: '仙品',
    type: '镇殿法宝',
    effect: '护住神魂、照亮幽冥海；灯灭则海下仙宫开启。',
    condition: '需以阴煞珠为灯油。',
    state: '幽冥峰顶',
  },
  '仙宫海图': {
    grade: '仙品',
    type: '残图',
    effect: '标注北荒海下仙宫入口；只有半张，另半张在天机阁。',
    state: '残缺 · 夜无冥随身',
  },
  忘川引: {
    grade: '地阶',
    type: '渡魂术',
    effect: '引魂过忘川，可问死者三句话；也能让活人短暂失神。',
    state: '孟婆七主修',
  },
  一叶渡魂: {
    grade: '玄阶',
    type: '身法',
    effect: '借忘川水汽瞬移，船桨所指即渡口。',
  },
  忘川: {
    grade: '玄阶',
    type: '船桨',
    effect: '既是摆渡工具，也是武器；桨声能安抚亡魂。',
    state: '孟婆七随身',
  },
  河灯: {
    grade: '地阶',
    type: '魂灯',
    effect: '一盏不灭的河灯，能护住持灯人的记忆。',
  },
  落日箭诀: {
    grade: '天阶',
    type: '箭道功法',
    effect: '以神识锁定、以气血拉弓，一箭可破甲；擅长远程压制。',
    state: '萧落日主修',
  },
  八石弓: {
    grade: '天阶',
    type: '弓术',
    effect: '八石之力拉满，箭出如落日坠地；对修士护体罡气有破甲效果。',
  },
  落日弓: {
    grade: '仙品',
    type: '本命弓',
    effect: '萧家传世弓，弓弦由蛟筋制成；搭箭时可引落日光。',
    state: '萧落日认主',
  },
  破甲箭: {
    grade: '地阶',
    type: '箭矢',
    effect: '专破护体罡气与法宝防御，萧落日只剩三支。',
    state: '仅剩三支',
  },
  射日弓匣: {
    grade: '仙品',
    type: '弓匣',
    effect: '温养弓弦、收纳箭矢；匣中刻着落日山庄的军功谱。',
    state: '落日山庄祖库',
  },
  丹书铁券: {
    grade: '地阶',
    type: '信物',
    effect: '先皇所赐，可保落日山庄一次大罪；对八宗而言是一张旧牌。',
    state: '萧落日随身',
  },
  红缨弓: {
    grade: '玄阶',
    type: '佩弓',
    effect: '萧红缨的弓，弓梢系红缨；拉满时能射出追踪箭。',
    state: '已认主',
  },
  响箭: {
    grade: '玄阶',
    type: '箭矢',
    effect: '箭尾带哨，可传讯、扰敌、点燃信号。',
    state: '十二支',
  },
  断箭: {
    grade: '地阶',
    type: '遗物',
    effect: '萧红缨母亲留下的断箭，箭杆上刻着北荒两个字。',
    state: '残缺 · 萧红缨随身',
  },
}

function inferType(name: string, kind: ItemKind): string {
  if (name.includes('剑典') || name.includes('心法') || name.includes('经')) return '功法'
  if (name.includes('剑')) return '剑'
  if (name.includes('刀')) return '刀'
  if (name.includes('弓')) return '弓'
  if (name.includes('棍')) return '棍'
  if (name.includes('鞭')) return '鞭'
  if (name.includes('炉') || name.includes('丹')) return '丹道'
  if (name.includes('阵')) return '阵法'
  if (name.includes('符')) return '符箓'
  if (kind === 'weapon') return '武器'
  if (kind === 'treasure') return '法宝'
  return '功法'
}

function inferGrade(cultivation?: string): string {
  if (!cultivation) return '未定'
  if (/大乘|合体|炼虚|化神/.test(cultivation)) return '天阶'
  if (/元婴/.test(cultivation)) return '地阶'
  if (/金丹/.test(cultivation)) return '玄阶'
  if (/筑基/.test(cultivation)) return '黄阶'
  if (/炼气/.test(cultivation)) return '凡品'
  return '未定'
}

export function describeItem(
  name: string,
  kind: ItemKind,
  cultivation?: string,
): ItemDescription {
  const override = ITEM_OVERRIDES[name]
  if (override) return override
  const type = inferType(name, kind)
  const grade = inferGrade(cultivation)
  if (kind === 'weapon') {
    return {
      grade,
      type,
      effect: `与${cultivation || '主人'}修为共鸣的武器，具体招式与威力在战斗情节中展开。`,
      state: '展示品 · 效果待补充',
    }
  }
  if (kind === 'treasure') {
    return {
      grade,
      type,
      effect: '提供辅助、防御或特殊用途的法宝，具体效果在情节中展开。',
      state: '展示品 · 效果待补充',
    }
  }
  return {
    grade,
    type,
    effect: `《${name}》是角色主修方向的功法，具体招式与限制在情节中展开。`,
    state: '展示品 · 效果待补充',
  }
}
