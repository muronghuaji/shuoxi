import type {
  StyleComedyDensity,
  StyleComedyType,
  StyleDescriptionFocus,
  StyleDialogue,
  StyleEmotionIntensity,
  StyleHookType,
  StyleMetaphorDensity,
  StyleMetaphorSource,
  StyleNarrationDistance,
  StylePacingMode,
  StyleParagraphDensity,
  StylePace,
  StyleReaderPromise,
  StyleSatisfactionType,
  StyleSentenceRhythm,
  StyleStrength,
  StyleTropeMode,
  WorkStyle,
} from './types'

export interface StylePreset {
  id: string
  name: string
  summary: string
  category?: string
  tone: string[]
  pace: StylePace
  dialogue: StyleDialogue
  description: WorkStyle['description']
  strength: StyleStrength
  narrationDistance: StyleNarrationDistance
  sentenceRhythm: StyleSentenceRhythm
  paragraphDensity: StyleParagraphDensity
  descriptionFocus: StyleDescriptionFocus[]
  emotionExpression: WorkStyle['emotionExpression']
  dialogueSubtext: WorkStyle['dialogueSubtext']
  metaphorDensity: StyleMetaphorDensity
  metaphorSource: StyleMetaphorSource
  hookType: StyleHookType
  antiAi: string[]
  readerPromise?: StyleReaderPromise[]
  tropeMode?: StyleTropeMode
  comedyType?: StyleComedyType
  comedyDensity?: StyleComedyDensity
  emotionIntensity?: StyleEmotionIntensity
  pacingMode?: StylePacingMode
  satisfactionType?: StyleSatisfactionType
}

export const STYLE_ANTI_AI_PATTERNS: string[] = [
  '不要用「仿佛空气凝固了」这类陈词',
  '不要用「这一刻，他明白了」直接总结',
  '不要每段都替人物总结情绪',
  '不要连续使用三段式排比',
  '不要滥用「不是……而是……」句式',
  '不要用「似乎 / 仿佛 / 好像」填充不确定感',
  '不要每章都以环境描写开头',
  '不要用抽象大词替代具体动作',
  '不要写「命运的齿轮开始转动」',
  '不要用「他知道，一切都不同了」收尾',
]

export const STYLE_STRENGTH_OPTIONS: { value: StyleStrength; label: string; hint: string }[] = [
  { value: 'light', label: '轻', hint: '只做轻微倾向，优先自然通顺' },
  { value: 'medium', label: '中', hint: '风格明显可感知，但不牺牲可读性' },
  { value: 'strong', label: '强', hint: '强风格化，允许牺牲部分直白度' },
]

export const STYLE_NARRATION_OPTIONS: {
  value: StyleNarrationDistance
  label: string
  hint: string
}[] = [
  { value: 'close', label: '贴身', hint: '贴近人物感受，允许即时身体反应' },
  { value: 'medium', label: '中距', hint: '以可见动作和对话为主，少量内心' },
  { value: 'camera', label: '冷眼', hint: '像摄像机，只写外部可见' },
]

export const STYLE_RHYTHM_OPTIONS: {
  value: StyleSentenceRhythm
  label: string
  hint: string
}[] = [
  { value: 'short', label: '短句', hint: '短句为主，节奏利落' },
  { value: 'alternate', label: '长短交替', hint: '长短句形成呼吸' },
  { value: 'long', label: '长句', hint: '长句绵密，信息层叠' },
  { value: 'oral', label: '口语', hint: '接近说话的自然节奏' },
]

export const STYLE_PARAGRAPH_OPTIONS: {
  value: StyleParagraphDensity
  label: string
  hint: string
}[] = [
  { value: 'short', label: '多分段', hint: '段落短，留白多' },
  { value: 'medium', label: '中等', hint: '常规排版' },
  { value: 'long', label: '长段落', hint: '段落厚重，适合文学叙事' },
]

export const STYLE_FOCUS_OPTIONS: {
  value: StyleDescriptionFocus
  label: string
  hint: string
}[] = [
  { value: 'action', label: '动作', hint: '用动作推进，少解释' },
  { value: 'environment', label: '环境', hint: '空间、天气、光线' },
  { value: 'senses', label: '感官', hint: '气味、声音、触感' },
  { value: 'objects', label: '物件', hint: '用物件承载信息和情绪' },
  { value: 'psychology', label: '心理', hint: '允许进入内心' },
  { value: 'subtext', label: '潜台词', hint: '让对白和动作留下未说出的部分' },
]

export const STYLE_EMOTION_OPTIONS: {
  value: NonNullable<WorkStyle['emotionExpression']>
  label: string
  hint: string
}[] = [
  { value: 'direct', label: '直接', hint: '明确写出情绪' },
  { value: 'external', label: '外化', hint: '用动作和身体反应表现' },
  { value: 'restrained', label: '克制', hint: '留白，不替读者总结' },
]

export const STYLE_SUBTEXT_OPTIONS: {
  value: NonNullable<WorkStyle['dialogueSubtext']>
  label: string
  hint: string
}[] = [
  { value: 'direct', label: '直给', hint: '人物把意思说清楚' },
  { value: 'subtle', label: '含蓄', hint: '话里有话，但不难懂' },
  { value: 'high', label: '高潜台词', hint: '大量言外之意，需要读者推断' },
]

export const STYLE_METAPHOR_DENSITY_OPTIONS: {
  value: StyleMetaphorDensity
  label: string
  hint: string
}[] = [
  { value: 'none', label: '不用', hint: '几乎不用比喻' },
  { value: 'low', label: '少', hint: '偶一为之' },
  { value: 'medium', label: '中', hint: '常规密度' },
  { value: 'high', label: '多', hint: '意象密集，谨慎使用' },
]

export const STYLE_METAPHOR_SOURCE_OPTIONS: {
  value: StyleMetaphorSource
  label: string
}[] = [
  { value: 'daily', label: '日常' },
  { value: 'nature', label: '自然' },
  { value: 'industrial', label: '工业' },
  { value: 'religion', label: '宗教' },
  { value: 'violence', label: '暴力' },
  { value: 'tech', label: '科技' },
]

export const STYLE_HOOK_OPTIONS: { value: StyleHookType; label: string; hint: string }[] = [
  { value: 'suspense', label: '悬念', hint: '留下未解问题' },
  { value: 'emotion', label: '余韵', hint: '停在情绪上' },
  { value: 'action', label: '动作中断', hint: '停在动作中途' },
  { value: 'reveal', label: '信息反转', hint: '用新信息翻面' },
]

export const STYLE_PROMISE_OPTIONS: {
  value: StyleReaderPromise
  label: string
  hint: string
}[] = [
  { value: '爽感', label: '爽感', hint: '成长、打脸、被认可、回报' },
  { value: '悬念', label: '悬念', hint: '问题、线索、信息差' },
  { value: '情绪', label: '情绪', hint: '关系、甜、虐、遗憾' },
  { value: '人物', label: '人物', hint: '人物弧光、群像、关系变化' },
  { value: '世界观', label: '世界观', hint: '规则、设定、探索' },
  { value: '搞笑', label: '搞笑', hint: '错位、吐槽、荒诞' },
  { value: '治愈', label: '治愈', hint: '日常、陪伴、松弛' },
  { value: '恐惧', label: '恐惧', hint: '压迫、未知、规则怪谈' },
  { value: '经营', label: '经营', hint: '建设、资源、势力成长' },
]

export const STYLE_TROPE_OPTIONS: {
  value: StyleTropeMode
  label: string
  hint: string
}[] = [
  { value: 'straight', label: '正写套路', hint: '按类型承诺兑现，读者预期稳定' },
  { value: 'aware', label: '角色自觉', hint: '角色知道套路，但仍按世界逻辑行动' },
  { value: 'subvert', label: '局部反套路', hint: '建立预期后偏离，但有代价' },
  { value: 'deconstruct', label: '整本解构', hint: '持续拆解类型前提，必须重建新期待' },
]

export const STYLE_COMEDY_TYPE_OPTIONS: {
  value: StyleComedyType
  label: string
  hint: string
}[] = [
  { value: 'none', label: '不搞笑', hint: '保持正剧基调' },
  { value: 'deadpan', label: '冷幽默', hint: '一本正经说荒唐话' },
  { value: 'absurd', label: '沙雕荒诞', hint: '夸张、错位、无厘头' },
  { value: 'dark', label: '黑色幽默', hint: '用玩笑处理沉重处境' },
  { value: 'banter', label: '群口吐槽', hint: '角色互相拆台、接梗' },
  { value: 'meta', label: '元叙事吐槽', hint: '角色知道自己在故事里' },
  { value: 'abstract', label: '抽象癫文', hint: '逻辑跳跃、精神状态不稳定' },
]

export const STYLE_COMEDY_DENSITY_OPTIONS: {
  value: StyleComedyDensity
  label: string
  hint: string
}[] = [
  { value: 'none', label: '无', hint: '不安排笑点' },
  { value: 'low', label: '低', hint: '偶尔一句，不打断主线' },
  { value: 'medium', label: '中', hint: '每个场景有轻松节拍' },
  { value: 'high', label: '高', hint: '喜剧是主要阅读体验' },
]

export const STYLE_EMOTION_INTENSITY_OPTIONS: {
  value: StyleEmotionIntensity
  label: string
  hint: string
}[] = [
  { value: 'restrained', label: '克制', hint: '情绪压在动作和留白里' },
  { value: 'balanced', label: '平衡', hint: '该给的情绪给足，不持续煽情' },
  { value: 'high', label: '强烈', hint: '情绪节拍明显，允许起伏' },
  { value: 'extreme', label: '极致', hint: '强情绪、强反转，短剧化表达' },
]

export const STYLE_PACING_MODE_OPTIONS: {
  value: StylePacingMode
  label: string
  hint: string
}[] = [
  { value: 'slow-burn', label: '慢热', hint: '允许铺垫、氛围和长线回收' },
  { value: 'steady', label: '稳定', hint: '每章推进一点，张弛有度' },
  { value: 'fast', label: '快节奏', hint: '信息密度高，少停顿' },
  { value: 'short-drama', label: '短剧化', hint: '强钩子、快反转、情绪拉满' },
]

export const STYLE_SATISFACTION_OPTIONS: {
  value: StyleSatisfactionType
  label: string
  hint: string
}[] = [
  { value: 'none', label: '不强调', hint: '不按爽点设计章节' },
  { value: '打脸', label: '打脸', hint: '被轻视后反击' },
  { value: '升级', label: '升级', hint: '能力、地位、资源成长' },
  { value: '被认可', label: '被认可', hint: '从无名到被看见' },
  { value: '复仇', label: '复仇', hint: '旧账回收、因果兑现' },
  { value: '智斗', label: '智斗', hint: '用信息和规则取胜' },
  { value: '收集', label: '收集', hint: '物品、伙伴、线索收集' },
  { value: '建设', label: '建设', hint: '经营、势力、领地成长' },
  { value: '情感回报', label: '情感回报', hint: '关系推进、误会解开' },
]

export const STYLE_PRESET_CATEGORIES = ['经典', '网文', '反套路', '喜剧', '悬疑', '情感', '群像', '短剧'] as const

const BASE_ANTI = STYLE_ANTI_AI_PATTERNS.slice(0, 3)

const WEB_PRESET_BASE: Omit<StylePreset, 'id' | 'name' | 'summary' | 'tone'> = {
  category: '网文',
  pace: '中',
  dialogue: '中',
  description: '适中',
  strength: 'medium',
  narrationDistance: 'medium',
  sentenceRhythm: 'alternate',
  paragraphDensity: 'short',
  descriptionFocus: ['action', 'subtext'],
  emotionExpression: 'external',
  dialogueSubtext: 'subtle',
  metaphorDensity: 'low',
  metaphorSource: 'daily',
  hookType: 'suspense',
  antiAi: [...BASE_ANTI],
  readerPromise: ['人物'],
  tropeMode: 'straight',
  comedyType: 'none',
  comedyDensity: 'none',
  emotionIntensity: 'balanced',
  pacingMode: 'steady',
  satisfactionType: 'none',
}

function buildWebPreset(
  input: Partial<StylePreset> & Pick<StylePreset, 'id' | 'name' | 'summary'>,
): StylePreset {
  return { ...WEB_PRESET_BASE, ...input } as StylePreset
}

const WEB_PRESETS: StylePreset[] = [
  buildWebPreset({
    id: 'power-fantasy',
    name: '标准升级爽文',
    summary: '目标明确、升级可感、爽点按节拍兑现，信息推进优先',
    category: '网文',
    tone: ['爽', '燃'],
    pace: '快',
    dialogue: '中',
    description: '克制',
    sentenceRhythm: 'short',
    readerPromise: ['爽感', '人物'],
    satisfactionType: '升级',
    pacingMode: 'fast',
    hookType: 'action',
  }),
  buildWebPreset({
    id: 'invincible',
    name: '无敌流',
    summary: '主角从一开始就强，重点是态度、规则和周围人的反应',
    category: '网文',
    tone: ['爽', '冷峻'],
    pace: '快',
    description: '克制',
    narrationDistance: 'camera',
    sentenceRhythm: 'short',
    readerPromise: ['爽感', '世界观'],
    satisfactionType: '被认可',
    tropeMode: 'straight',
    hookType: 'reveal',
  }),
  buildWebPreset({
    id: 'cautious',
    name: '稳健苟道',
    summary: '主角先算风险再行动，信息差、底牌和退路比正面硬拼更重要',
    category: '网文',
    tone: ['冷峻', '悬疑'],
    pace: '中',
    dialogue: '少',
    description: '适中',
    narrationDistance: 'close',
    sentenceRhythm: 'alternate',
    descriptionFocus: ['psychology', 'objects'],
    emotionExpression: 'restrained',
    dialogueSubtext: 'high',
    readerPromise: ['悬念', '爽感'],
    satisfactionType: '智斗',
    hookType: 'suspense',
  }),
  buildWebPreset({
    id: 'rules-horror',
    name: '规则怪谈',
    summary: '规则先于人物，信息差和错误理解制造压迫；每条规则都要能推演',
    category: '悬疑',
    tone: ['悬疑', '冷峻'],
    pace: '快',
    dialogue: '少',
    description: '克制',
    narrationDistance: 'close',
    sentenceRhythm: 'short',
    paragraphDensity: 'short',
    descriptionFocus: ['objects', 'subtext'],
    emotionExpression: 'external',
    dialogueSubtext: 'high',
    metaphorDensity: 'low',
    metaphorSource: 'industrial',
    readerPromise: ['悬念', '恐惧'],
    hookType: 'reveal',
  }),
  buildWebPreset({
    id: 'cthulhu',
    name: '克苏鲁氛围',
    summary: '未知不可完全理解，恐怖来自认知边界和信息缺口，不靠怪物吓人',
    category: '悬疑',
    tone: ['悬疑', '冷峻', '细腻'],
    pace: '慢',
    dialogue: '中',
    description: '细腻',
    narrationDistance: 'close',
    sentenceRhythm: 'alternate',
    paragraphDensity: 'medium',
    descriptionFocus: ['environment', 'psychology'],
    emotionExpression: 'restrained',
    dialogueSubtext: 'high',
    metaphorDensity: 'medium',
    metaphorSource: 'religion',
    readerPromise: ['恐惧', '世界观'],
    emotionIntensity: 'high',
    pacingMode: 'slow-burn',
    hookType: 'suspense',
    antiAi: [...BASE_ANTI, STYLE_ANTI_AI_PATTERNS[5]],
  }),
  buildWebPreset({
    id: 'anti-trope',
    name: '反套路',
    summary: '先让读者看见套路，再让人物按自己的逻辑偏离；偏离必须有代价和新期待',
    category: '反套路',
    tone: ['反套路', '幽默', '冷峻'],
    pace: '中',
    dialogue: '多',
    description: '克制',
    narrationDistance: 'close',
    sentenceRhythm: 'alternate',
    descriptionFocus: ['action', 'subtext'],
    emotionExpression: 'external',
    dialogueSubtext: 'high',
    readerPromise: ['人物', '搞笑', '悬念'],
    tropeMode: 'subvert',
    comedyType: 'deadpan',
    comedyDensity: 'low',
    satisfactionType: 'none',
    hookType: 'reveal',
  }),
  buildWebPreset({
    id: 'meta-lead',
    name: '乐子人主角',
    summary: '主角知道套路但不被套路推着走，边整活边承担后果；世界仍然认真',
    category: '反套路',
    tone: ['反套路', '幽默', '燃'],
    pace: '快',
    dialogue: '多',
    description: '适中',
    narrationDistance: 'close',
    sentenceRhythm: 'oral',
    descriptionFocus: ['action', 'subtext'],
    emotionExpression: 'direct',
    dialogueSubtext: 'subtle',
    readerPromise: ['搞笑', '爽感', '人物'],
    tropeMode: 'aware',
    comedyType: 'banter',
    comedyDensity: 'medium',
    pacingMode: 'fast',
    hookType: 'action',
  }),
  buildWebPreset({
    id: 'sand-sculpture',
    name: '沙雕荒诞',
    summary: '靠错位、误会和夸张制造笑点，但人物不能为了笑点集体降智',
    category: '喜剧',
    tone: ['幽默', '沙雕'],
    pace: '快',
    dialogue: '多',
    description: '克制',
    narrationDistance: 'close',
    sentenceRhythm: 'oral',
    paragraphDensity: 'short',
    descriptionFocus: ['action', 'subtext'],
    emotionExpression: 'direct',
    dialogueSubtext: 'direct',
    readerPromise: ['搞笑', '人物'],
    comedyType: 'absurd',
    comedyDensity: 'high',
    pacingMode: 'fast',
    hookType: 'action',
  }),
  buildWebPreset({
    id: 'deadpan',
    name: '冷幽默',
    summary: '一本正经地写荒唐事，笑点藏在叙述语气和人物反应里',
    category: '喜剧',
    tone: ['幽默', '冷峻'],
    pace: '中',
    dialogue: '多',
    description: '克制',
    narrationDistance: 'camera',
    sentenceRhythm: 'short',
    descriptionFocus: ['objects', 'subtext'],
    emotionExpression: 'restrained',
    dialogueSubtext: 'high',
    readerPromise: ['搞笑', '人物'],
    comedyType: 'deadpan',
    comedyDensity: 'medium',
    hookType: 'reveal',
  }),
  buildWebPreset({
    id: 'dark-comedy',
    name: '黑色幽默',
    summary: '用轻描淡写处理沉重处境，笑点之后保留代价和不安',
    category: '喜剧',
    tone: ['幽默', '冷峻'],
    pace: '中',
    dialogue: '多',
    description: '克制',
    narrationDistance: 'camera',
    sentenceRhythm: 'short',
    descriptionFocus: ['objects', 'subtext'],
    emotionExpression: 'restrained',
    dialogueSubtext: 'high',
    readerPromise: ['搞笑', '人物'],
    comedyType: 'dark',
    comedyDensity: 'medium',
    emotionIntensity: 'high',
    hookType: 'reveal',
  }),
  buildWebPreset({
    id: 'ensemble',
    name: '群像多线',
    summary: '每个角色有自己的目标和说话方式，场景靠关系碰撞推进，不围着一个人转',
    category: '群像',
    tone: ['人物', '温暖'],
    pace: '中',
    dialogue: '多',
    description: '适中',
    narrationDistance: 'medium',
    sentenceRhythm: 'alternate',
    descriptionFocus: ['action', 'subtext'],
    emotionExpression: 'external',
    dialogueSubtext: 'subtle',
    readerPromise: ['人物', '情绪'],
    hookType: 'emotion',
  }),
  buildWebPreset({
    id: 'short-drama',
    name: '短剧强钩',
    summary: '开篇即冲突、每章有反转、情绪拉满；少铺垫，但因果不能断',
    category: '短剧',
    tone: ['爽', '燃'],
    pace: '快',
    dialogue: '多',
    description: '克制',
    narrationDistance: 'close',
    sentenceRhythm: 'short',
    paragraphDensity: 'short',
    descriptionFocus: ['action', 'subtext'],
    emotionExpression: 'direct',
    dialogueSubtext: 'direct',
    readerPromise: ['爽感', '情绪'],
    emotionIntensity: 'extreme',
    pacingMode: 'short-drama',
    satisfactionType: '打脸',
    hookType: 'reveal',
  }),
  buildWebPreset({
    id: 'sweet-romance',
    name: '甜宠日常',
    summary: '关系推进靠细节和回应，不靠误会拖字数；甜要有来有回',
    category: '情感',
    tone: ['甜', '温暖'],
    pace: '慢',
    dialogue: '多',
    description: '细腻',
    narrationDistance: 'close',
    sentenceRhythm: 'alternate',
    paragraphDensity: 'short',
    descriptionFocus: ['senses', 'subtext'],
    emotionExpression: 'external',
    dialogueSubtext: 'subtle',
    metaphorDensity: 'low',
    metaphorSource: 'daily',
    readerPromise: ['情绪', '人物', '治愈'],
    emotionIntensity: 'high',
    pacingMode: 'slow-burn',
    satisfactionType: '情感回报',
    hookType: 'emotion',
  }),
  buildWebPreset({
    id: 'angst-romance',
    name: '虐恋拉扯',
    summary: '关系有推进也有倒退，虐点来自选择代价，不靠强行误会',
    category: '情感',
    tone: ['虐', '细腻'],
    pace: '中',
    dialogue: '多',
    description: '细腻',
    narrationDistance: 'close',
    sentenceRhythm: 'alternate',
    paragraphDensity: 'medium',
    descriptionFocus: ['psychology', 'subtext'],
    emotionExpression: 'restrained',
    dialogueSubtext: 'high',
    metaphorDensity: 'medium',
    metaphorSource: 'daily',
    readerPromise: ['情绪', '人物'],
    emotionIntensity: 'high',
    pacingMode: 'steady',
    satisfactionType: '情感回报',
    hookType: 'emotion',
  }),
  buildWebPreset({
    id: 'female-lead',
    name: '大女主无CP',
    summary: '目标、成长和选择优先，感情线不抢主线，配角有自己的生活',
    category: '情感',
    tone: ['燃', '克制'],
    pace: '中',
    dialogue: '中',
    description: '适中',
    narrationDistance: 'close',
    sentenceRhythm: 'alternate',
    descriptionFocus: ['action', 'psychology'],
    emotionExpression: 'external',
    dialogueSubtext: 'subtle',
    readerPromise: ['人物', '爽感'],
    satisfactionType: '被认可',
    hookType: 'action',
  }),
  buildWebPreset({
    id: 'era-life',
    name: '年代生活',
    summary: '生活细节、物质变化和人情关系优先，冲突来自时代限制而不是降智',
    category: '群像',
    tone: ['温暖', '细腻'],
    pace: '慢',
    dialogue: '多',
    description: '细腻',
    narrationDistance: 'close',
    sentenceRhythm: 'alternate',
    paragraphDensity: 'medium',
    descriptionFocus: ['objects', 'senses'],
    emotionExpression: 'external',
    dialogueSubtext: 'subtle',
    metaphorDensity: 'low',
    metaphorSource: 'daily',
    readerPromise: ['人物', '治愈', '经营'],
    emotionIntensity: 'balanced',
    pacingMode: 'slow-burn',
    hookType: 'emotion',
  }),
  buildWebPreset({
    id: 'sect-building',
    name: '宗门经营',
    summary: '资源、设施、人才和外部压力形成循环，建设成果要可见',
    category: '网文',
    tone: ['燃', '克制'],
    pace: '中',
    dialogue: '中',
    description: '适中',
    narrationDistance: 'medium',
    sentenceRhythm: 'alternate',
    descriptionFocus: ['objects', 'action'],
    emotionExpression: 'external',
    dialogueSubtext: 'subtle',
    readerPromise: ['经营', '爽感', '世界观'],
    satisfactionType: '建设',
    pacingMode: 'steady',
    hookType: 'action',
  }),
  buildWebPreset({
    id: 'abstract',
    name: '抽象癫文',
    summary: '逻辑跳跃、情绪过载、叙述者不可靠；疯归疯，场景要有自己的规则',
    category: '喜剧',
    tone: ['沙雕', '癫'],
    pace: '快',
    dialogue: '多',
    description: '克制',
    narrationDistance: 'close',
    sentenceRhythm: 'oral',
    paragraphDensity: 'short',
    descriptionFocus: ['action', 'subtext'],
    emotionExpression: 'direct',
    dialogueSubtext: 'direct',
    readerPromise: ['搞笑', '人物'],
    comedyType: 'abstract',
    comedyDensity: 'high',
    emotionIntensity: 'extreme',
    pacingMode: 'short-drama',
    hookType: 'action',
  }),
]

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'cold-suspense',
    name: '冷硬悬疑',
    summary: '冷眼、短句、动作和物件承载信息，少解释',
    tone: ['冷峻', '悬疑'],
    pace: '中',
    dialogue: '中',
    description: '克制',
    strength: 'medium',
    narrationDistance: 'camera',
    sentenceRhythm: 'short',
    paragraphDensity: 'short',
    descriptionFocus: ['action', 'objects'],
    emotionExpression: 'external',
    dialogueSubtext: 'high',
    metaphorDensity: 'low',
    metaphorSource: 'industrial',
    hookType: 'suspense',
    antiAi: [...BASE_ANTI],
  },
  {
    id: 'restrained-white',
    name: '克制白描',
    summary: '动作与细节推进，情绪不直接说出来',
    tone: ['克制'],
    pace: '中',
    dialogue: '中',
    description: '克制',
    strength: 'medium',
    narrationDistance: 'medium',
    sentenceRhythm: 'short',
    paragraphDensity: 'short',
    descriptionFocus: ['action', 'senses'],
    emotionExpression: 'restrained',
    dialogueSubtext: 'subtle',
    metaphorDensity: 'low',
    metaphorSource: 'nature',
    hookType: 'emotion',
    antiAi: [...BASE_ANTI, STYLE_ANTI_AI_PATTERNS[5]],
  },
  {
    id: 'cinematic',
    name: '电影感',
    summary: '空间、光线、声音和镜头运动清楚',
    tone: ['电影感', '细腻'],
    pace: '中',
    dialogue: '中',
    description: '适中',
    strength: 'medium',
    narrationDistance: 'medium',
    sentenceRhythm: 'alternate',
    paragraphDensity: 'medium',
    descriptionFocus: ['environment', 'senses'],
    emotionExpression: 'external',
    dialogueSubtext: 'subtle',
    metaphorDensity: 'medium',
    metaphorSource: 'nature',
    hookType: 'reveal',
    antiAi: [...BASE_ANTI],
  },
  {
    id: 'literary',
    name: '文学细腻',
    summary: '心理层次和意象更丰富，允许慢下来',
    tone: ['细腻', '克制'],
    pace: '慢',
    dialogue: '中',
    description: '细腻',
    strength: 'medium',
    narrationDistance: 'close',
    sentenceRhythm: 'long',
    paragraphDensity: 'long',
    descriptionFocus: ['psychology', 'senses'],
    emotionExpression: 'restrained',
    dialogueSubtext: 'high',
    metaphorDensity: 'high',
    metaphorSource: 'nature',
    hookType: 'emotion',
    antiAi: [...BASE_ANTI, STYLE_ANTI_AI_PATTERNS[4]],
  },
  {
    id: 'web-fast',
    name: '网文快节奏',
    summary: '信息推进优先，短段、强钩子、少停顿',
    tone: ['悬疑', '冷峻'],
    pace: '快',
    dialogue: '多',
    description: '克制',
    strength: 'medium',
    narrationDistance: 'medium',
    sentenceRhythm: 'short',
    paragraphDensity: 'short',
    descriptionFocus: ['action', 'subtext'],
    emotionExpression: 'direct',
    dialogueSubtext: 'subtle',
    metaphorDensity: 'low',
    metaphorSource: 'daily',
    hookType: 'suspense',
    antiAi: [...BASE_ANTI],
  },
  {
    id: 'light-oral',
    name: '轻小说口语',
    summary: '轻松、口语化，角色吐槽和反应更明显',
    tone: ['幽默', '温暖'],
    pace: '中',
    dialogue: '多',
    description: '适中',
    strength: 'medium',
    narrationDistance: 'close',
    sentenceRhythm: 'oral',
    paragraphDensity: 'short',
    descriptionFocus: ['action', 'subtext'],
    emotionExpression: 'direct',
    dialogueSubtext: 'direct',
    metaphorDensity: 'low',
    metaphorSource: 'daily',
    hookType: 'emotion',
    antiAi: [...BASE_ANTI, STYLE_ANTI_AI_PATTERNS[7]],
  },
  {
    id: 'warm-healing',
    name: '温暖治愈',
    summary: '允许温度，但不煽情，重视日常细节',
    tone: ['温暖', '细腻'],
    pace: '慢',
    dialogue: '中',
    description: '细腻',
    strength: 'light',
    narrationDistance: 'close',
    sentenceRhythm: 'alternate',
    paragraphDensity: 'medium',
    descriptionFocus: ['senses', 'objects'],
    emotionExpression: 'external',
    dialogueSubtext: 'subtle',
    metaphorDensity: 'medium',
    metaphorSource: 'daily',
    hookType: 'emotion',
    antiAi: [...BASE_ANTI, STYLE_ANTI_AI_PATTERNS[6]],
  },
  {
    id: 'classical',
    name: '古典白话',
    summary: '白话为底，保留一点旧小说的句法和称谓',
    tone: ['克制'],
    pace: '慢',
    dialogue: '中',
    description: '适中',
    strength: 'medium',
    narrationDistance: 'medium',
    sentenceRhythm: 'alternate',
    paragraphDensity: 'medium',
    descriptionFocus: ['action', 'environment'],
    emotionExpression: 'restrained',
    dialogueSubtext: 'subtle',
    metaphorDensity: 'medium',
    metaphorSource: 'nature',
    hookType: 'suspense',
    antiAi: [...BASE_ANTI, STYLE_ANTI_AI_PATTERNS[7]],
  },
  {
    id: 'noir-humor',
    name: '黑色幽默',
    summary: '冷面、荒诞、用轻描淡写处理严重的事',
    tone: ['幽默', '冷峻'],
    pace: '中',
    dialogue: '多',
    description: '克制',
    strength: 'medium',
    narrationDistance: 'medium',
    sentenceRhythm: 'short',
    paragraphDensity: 'short',
    descriptionFocus: ['objects', 'subtext'],
    emotionExpression: 'restrained',
    dialogueSubtext: 'high',
    metaphorDensity: 'low',
    metaphorSource: 'industrial',
    hookType: 'reveal',
    antiAi: [...BASE_ANTI],
  },
  {
    id: 'epic',
    name: '史诗厚重',
    summary: '更大的空间和时间尺度，句式更沉',
    tone: ['华丽', '冷峻'],
    pace: '慢',
    dialogue: '中',
    description: '细腻',
    strength: 'medium',
    narrationDistance: 'medium',
    sentenceRhythm: 'long',
    paragraphDensity: 'long',
    descriptionFocus: ['environment', 'action'],
    emotionExpression: 'restrained',
    dialogueSubtext: 'subtle',
    metaphorDensity: 'medium',
    metaphorSource: 'religion',
    hookType: 'reveal',
    antiAi: [...BASE_ANTI, STYLE_ANTI_AI_PATTERNS[4]],
  },
  ...WEB_PRESETS,
]

export function createEmptyStyle(): WorkStyle {
  return {
    tone: [],
    pace: '中',
    dialogue: '中',
    description: '适中',
    taboos: '',
    notes: '',
    presetId: '',
    strength: 'medium',
    sampleText: '',
    sampleAnalysis: '',
    sampleSource: 'pasted',
    narrationDistance: 'medium',
    sentenceRhythm: 'alternate',
    paragraphDensity: 'medium',
    descriptionFocus: ['action'],
    emotionExpression: 'external',
    dialogueSubtext: 'subtle',
    metaphorDensity: 'low',
    metaphorSource: 'nature',
    hookType: 'suspense',
    antiAi: [],
    readerPromise: ['人物'],
    tropeMode: 'straight',
    comedyType: 'none',
    comedyDensity: 'none',
    emotionIntensity: 'balanced',
    pacingMode: 'steady',
    satisfactionType: 'none',
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function normalizeStyle(raw: WorkStyle | undefined): WorkStyle {
  const base = createEmptyStyle()
  if (!raw || typeof raw !== 'object') return base
  const value = raw as unknown as Record<string, unknown>
  const tone = Array.isArray(value.tone)
    ? value.tone.filter((item): item is string => typeof item === 'string').slice(0, 8)
    : []
  const focus = Array.isArray(value.descriptionFocus)
    ? value.descriptionFocus.filter((item): item is StyleDescriptionFocus =>
        STYLE_FOCUS_OPTIONS.some((option) => option.value === item),
      )
    : []
  const antiAi = Array.isArray(value.antiAi)
    ? value.antiAi.filter((item): item is string => typeof item === 'string')
    : []
  const promise = Array.isArray(value.readerPromise)
    ? value.readerPromise.filter((item): item is StyleReaderPromise =>
        STYLE_PROMISE_OPTIONS.some((option) => option.value === item),
      )
    : []
  return {
    ...base,
    tone,
    pace: value.pace === '慢' || value.pace === '快' ? value.pace : '中',
    dialogue: value.dialogue === '少' || value.dialogue === '多' ? value.dialogue : '中',
    description:
      value.description === '克制' || value.description === '细腻' ? value.description : '适中',
    taboos: asString(value.taboos),
    notes: asString(value.notes),
    presetId: asString(value.presetId),
    strength: value.strength === 'light' || value.strength === 'strong' ? value.strength : 'medium',
    sampleText: asString(value.sampleText),
    sampleAnalysis: asString(value.sampleAnalysis),
    sampleSource: value.sampleSource === 'chapters' ? 'chapters' : 'pasted',
    narrationDistance:
      value.narrationDistance === 'close' || value.narrationDistance === 'camera'
        ? value.narrationDistance
        : 'medium',
    sentenceRhythm:
      value.sentenceRhythm === 'short' ||
      value.sentenceRhythm === 'long' ||
      value.sentenceRhythm === 'oral'
        ? value.sentenceRhythm
        : 'alternate',
    paragraphDensity:
      value.paragraphDensity === 'short' || value.paragraphDensity === 'long'
        ? value.paragraphDensity
        : 'medium',
    descriptionFocus: focus.slice(0, 2),
    emotionExpression:
      value.emotionExpression === 'direct' || value.emotionExpression === 'restrained'
        ? value.emotionExpression
        : 'external',
    dialogueSubtext:
      value.dialogueSubtext === 'direct' || value.dialogueSubtext === 'high'
        ? value.dialogueSubtext
        : 'subtle',
    metaphorDensity:
      value.metaphorDensity === 'none' ||
      value.metaphorDensity === 'medium' ||
      value.metaphorDensity === 'high'
        ? value.metaphorDensity
        : 'low',
    metaphorSource: STYLE_METAPHOR_SOURCE_OPTIONS.some(
      (option) => option.value === value.metaphorSource,
    )
      ? (value.metaphorSource as StyleMetaphorSource)
      : 'nature',
    hookType: STYLE_HOOK_OPTIONS.some((option) => option.value === value.hookType)
      ? (value.hookType as StyleHookType)
      : 'suspense',
    antiAi,
    readerPromise: promise.slice(0, 3),
    tropeMode: STYLE_TROPE_OPTIONS.some((option) => option.value === value.tropeMode)
      ? (value.tropeMode as StyleTropeMode)
      : 'straight',
    comedyType: STYLE_COMEDY_TYPE_OPTIONS.some((option) => option.value === value.comedyType)
      ? (value.comedyType as StyleComedyType)
      : 'none',
    comedyDensity: STYLE_COMEDY_DENSITY_OPTIONS.some(
      (option) => option.value === value.comedyDensity,
    )
      ? (value.comedyDensity as StyleComedyDensity)
      : 'none',
    emotionIntensity: STYLE_EMOTION_INTENSITY_OPTIONS.some(
      (option) => option.value === value.emotionIntensity,
    )
      ? (value.emotionIntensity as StyleEmotionIntensity)
      : 'balanced',
    pacingMode: STYLE_PACING_MODE_OPTIONS.some((option) => option.value === value.pacingMode)
      ? (value.pacingMode as StylePacingMode)
      : 'steady',
    satisfactionType: STYLE_SATISFACTION_OPTIONS.some(
      (option) => option.value === value.satisfactionType,
    )
      ? (value.satisfactionType as StyleSatisfactionType)
      : 'none',
  }
}

export function stylePresetById(id: string | undefined): StylePreset | undefined {
  return STYLE_PRESETS.find((preset) => preset.id === id)
}

export function applyStylePreset(style: WorkStyle, presetId: string): WorkStyle {
  const preset = stylePresetById(presetId)
  if (!preset) return normalizeStyle(style)
  const current = normalizeStyle(style)
  return {
    ...current,
    presetId: preset.id,
    tone: [...preset.tone],
    pace: preset.pace,
    dialogue: preset.dialogue,
    description: preset.description,
    strength: preset.strength,
    narrationDistance: preset.narrationDistance,
    sentenceRhythm: preset.sentenceRhythm,
    paragraphDensity: preset.paragraphDensity,
    descriptionFocus: [...preset.descriptionFocus],
    emotionExpression: preset.emotionExpression,
    dialogueSubtext: preset.dialogueSubtext,
    metaphorDensity: preset.metaphorDensity,
    metaphorSource: preset.metaphorSource,
    hookType: preset.hookType,
    antiAi: [...preset.antiAi],
    readerPromise: [...(preset.readerPromise ?? current.readerPromise ?? ['人物'])],
    tropeMode: preset.tropeMode ?? 'straight',
    comedyType: preset.comedyType ?? 'none',
    comedyDensity: preset.comedyDensity ?? 'none',
    emotionIntensity: preset.emotionIntensity ?? 'balanced',
    pacingMode: preset.pacingMode ?? 'steady',
    satisfactionType: preset.satisfactionType ?? 'none',
  }
}

export function mergeStyle(style: WorkStyle, override?: Partial<WorkStyle>): WorkStyle {
  if (!override || Object.keys(override).length === 0) return normalizeStyle(style)
  return normalizeStyle({ ...style, ...override })
}

export function styleFocusLabel(value: StyleDescriptionFocus): string {
  return STYLE_FOCUS_OPTIONS.find((option) => option.value === value)?.label ?? value
}

export function styleLabel<T extends string>(
  options: { value: T; label: string }[],
  value: T | undefined,
): string {
  return options.find((option) => option.value === value)?.label ?? '未设定'
}

export function formatStyleCard(style: WorkStyle, chapterOverride?: Partial<WorkStyle>): string {
  const resolved = mergeStyle(style, chapterOverride)
  const focus = resolved.descriptionFocus?.length
    ? resolved.descriptionFocus.map(styleFocusLabel).join('、')
    : '未设定'
  const promise = resolved.readerPromise?.length ? resolved.readerPromise.join('、') : '未设定'
  const comedy =
    resolved.comedyType && resolved.comedyType !== 'none'
      ? `${styleLabel(STYLE_COMEDY_TYPE_OPTIONS, resolved.comedyType)}｜${
          styleLabel(STYLE_COMEDY_DENSITY_OPTIONS, resolved.comedyDensity).replace('无', '不安排')
        }`
      : '不搞笑'
  return [
    `文风：${resolved.tone.length ? resolved.tone.join('、') : '未设定'}`,
    `读者承诺：${promise}`,
    `节奏：${resolved.pace}｜对白密度：${resolved.dialogue}｜描写密度：${resolved.description}`,
    `叙事距离：${styleLabel(STYLE_NARRATION_OPTIONS, resolved.narrationDistance)}`,
    `句式节奏：${styleLabel(STYLE_RHYTHM_OPTIONS, resolved.sentenceRhythm)}｜段落：${styleLabel(
      STYLE_PARAGRAPH_OPTIONS,
      resolved.paragraphDensity,
    )}`,
    `描写焦点：${focus}`,
    `情绪表达：${styleLabel(STYLE_EMOTION_OPTIONS, resolved.emotionExpression)}｜对白潜台词：${styleLabel(
      STYLE_SUBTEXT_OPTIONS,
      resolved.dialogueSubtext,
    )}`,
    `比喻：${styleLabel(STYLE_METAPHOR_DENSITY_OPTIONS, resolved.metaphorDensity)}｜意象来源：${styleLabel(
      STYLE_METAPHOR_SOURCE_OPTIONS,
      resolved.metaphorSource,
    )}`,
    `章末钩子：${styleLabel(STYLE_HOOK_OPTIONS, resolved.hookType)}｜风格强度：${styleLabel(
      STYLE_STRENGTH_OPTIONS,
      resolved.strength,
    )}`,
    `套路模式：${styleLabel(STYLE_TROPE_OPTIONS, resolved.tropeMode)}｜爽点：${styleLabel(
      STYLE_SATISFACTION_OPTIONS,
      resolved.satisfactionType,
    )}`,
    `喜剧：${comedy}`,
    `情绪强度：${styleLabel(STYLE_EMOTION_INTENSITY_OPTIONS, resolved.emotionIntensity)}｜节奏模式：${styleLabel(
      STYLE_PACING_MODE_OPTIONS,
      resolved.pacingMode,
    )}`,
    resolved.antiAi?.length ? `反 AI 味：${resolved.antiAi.join('；')}` : '',
    resolved.sampleAnalysis ? `参考样文分析：${resolved.sampleAnalysis}` : '',
    resolved.taboos ? `禁用元素：${resolved.taboos}` : '',
    resolved.notes ? `补充要求：${resolved.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function styleWarnings(style: WorkStyle): string[] {
  const resolved = normalizeStyle(style)
  const warnings: string[] = []
  const fearOrSuspense =
    resolved.readerPromise?.includes('恐惧') ||
    resolved.readerPromise?.includes('悬念') ||
    resolved.tone.includes('悬疑') ||
    resolved.tone.includes('冷峻')
  if (resolved.comedyDensity === 'high' && fearOrSuspense) {
    warnings.push('高强度喜剧会削弱悬疑 / 恐惧的压迫感，建议把笑点集中到配角或降低密度。')
  }
  if (
    (resolved.comedyType === 'absurd' || resolved.comedyType === 'abstract') &&
    resolved.emotionIntensity === 'extreme'
  ) {
    warnings.push('抽象喜剧加极致情绪容易失控；每场只保留一个核心荒诞点，其余仍然按因果走。')
  }
  if (
    resolved.tropeMode === 'deconstruct' &&
    (resolved.satisfactionType === '打脸' || resolved.satisfactionType === '升级')
  ) {
    warnings.push('整本解构和即时爽点容易互相拆台；反套路后要给读者新的稳定期待。')
  }
  if (
    resolved.pacingMode === 'short-drama' &&
    (resolved.sentenceRhythm === 'long' || resolved.description === '细腻')
  ) {
    warnings.push('短剧化节奏和长句 / 细腻描写会互相拖慢；优先保留冲突和转折。')
  }
  if (resolved.readerPromise?.includes('搞笑') && resolved.comedyType === 'none') {
    warnings.push('读者承诺里有搞笑，但喜剧类型是不搞笑；要么补喜剧配置，要么去掉这个承诺。')
  }
  if (resolved.readerPromise?.includes('爽感') && resolved.satisfactionType === 'none') {
    warnings.push('读者承诺里有爽感，但没有指定爽点类型；建议明确打脸、升级、被认可或智斗。')
  }
  return warnings
}

export function buildStylePreview(style: WorkStyle, chapterOverride?: Partial<WorkStyle>): string {
  return `【AI 实际读到的文风卡】\n${formatStyleCard(style, chapterOverride)}`
}

export interface StyleDriftReport {
  sampleChapters: number
  averageSentenceLength: number
  dialogueRatio: number
  averageParagraphLength: number
  baselineSentenceLength: number
  baselineDialogueRatio: number
  warnings: string[]
}

export function analyzeStyleDrift(
  contents: string[],
  baselineCount = 5,
): StyleDriftReport | null {
  const values = contents.map((content) => content.trim()).filter(Boolean)
  if (values.length < 2) return null
  const metrics = values.map((content) => {
    const sentences = content.split(/[。！？!?…]/).filter((item) => item.trim())
    const paragraphs = content.split(/\n+/).filter((item) => item.trim())
    const dialogueChars = (content.match(/[「“"][^」”"]*[」”"]/g) ?? []).join('').length
    return {
      sentence: sentences.length ? content.length / sentences.length : 0,
      dialogue: content.length ? dialogueChars / content.length : 0,
      paragraph: paragraphs.length ? content.length / paragraphs.length : 0,
    }
  })
  const average = (items: number[]) =>
    items.reduce((sum, value) => sum + value, 0) / Math.max(1, items.length)
  const baseline = metrics.slice(0, Math.max(1, baselineCount))
  const recent = metrics.slice(-Math.max(1, Math.min(3, metrics.length)))
  const baselineSentence = average(baseline.map((item) => item.sentence))
  const baselineDialogue = average(baseline.map((item) => item.dialogue))
  const sentence = average(recent.map((item) => item.sentence))
  const dialogue = average(recent.map((item) => item.dialogue))
  const paragraph = average(recent.map((item) => item.paragraph))
  const warnings: string[] = []
  if (baselineSentence > 0 && Math.abs(sentence - baselineSentence) / baselineSentence > 0.35) {
    warnings.push(
      sentence > baselineSentence
        ? '最近章节句子明显变长，可能偏离短句节奏'
        : '最近章节句子明显变短，可能缺少铺垫',
    )
  }
  if (baselineDialogue > 0.03 && Math.abs(dialogue - baselineDialogue) > 0.1) {
    warnings.push(
      dialogue > baselineDialogue
        ? '最近对白占比升高，叙述可能在退让'
        : '最近对白占比下降，场景可能变得偏叙述',
    )
  }
  return {
    sampleChapters: values.length,
    averageSentenceLength: Math.round(sentence * 10) / 10,
    dialogueRatio: Math.round(dialogue * 100),
    averageParagraphLength: Math.round(paragraph),
    baselineSentenceLength: Math.round(baselineSentence * 10) / 10,
    baselineDialogueRatio: Math.round(baselineDialogue * 100),
    warnings,
  }
}

export function buildStyleAnalysisMessages(input: {
  workTitle: string
  genres: string[]
  sample: string
}): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content: [
        '你是中文小说文风分析师。',
        '只输出一个 JSON 对象，不要 markdown、解释或前后缀。',
        '字段：{"tone":["最多4个"],"pace":"慢|中|快","dialogue":"少|中|多","description":"克制|适中|细腻","strength":"light|medium|strong","narrationDistance":"close|medium|camera","sentenceRhythm":"short|alternate|long|oral","paragraphDensity":"short|medium|long","descriptionFocus":["action|environment|senses|objects|psychology|subtext，最多2个"],"emotionExpression":"direct|external|restrained","dialogueSubtext":"direct|subtle|high","metaphorDensity":"none|low|medium|high","metaphorSource":"daily|nature|industrial|religion|violence|tech","hookType":"suspense|emotion|action|reveal","readerPromise":["爽感|悬念|情绪|人物|世界观|搞笑|治愈|恐惧|经营，最多3个"],"tropeMode":"straight|aware|subvert|deconstruct","comedyType":"none|deadpan|absurd|dark|banter|meta|abstract","comedyDensity":"none|low|medium|high","emotionIntensity":"restrained|balanced|high|extreme","pacingMode":"slow-burn|steady|fast|short-drama","satisfactionType":"none|打脸|升级|被认可|复仇|智斗|收集|建设|情感回报","notes":"一句可执行建议"}',
        '不要模仿具体作者署名，只提取可执行特征。',
        '不要判断内容好坏，只分析语言和叙事习惯。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `【作品】《${input.workTitle}》｜${input.genres.join('、') || '题材未定'}\n【样文】\n${input.sample.slice(0, 6000)}`,
    },
  ]
}

export function parseStyleAnalysis(text: string): Partial<WorkStyle> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    const normalized = normalizeStyle({
      ...createEmptyStyle(),
      ...(raw as unknown as Partial<WorkStyle>),
      notes: typeof raw.notes === 'string' ? raw.notes : '',
    })
    const extra: Partial<WorkStyle> = {}
    if (Array.isArray(raw.readerPromise)) extra.readerPromise = normalized.readerPromise
    if (typeof raw.tropeMode === 'string') extra.tropeMode = normalized.tropeMode
    if (typeof raw.comedyType === 'string') extra.comedyType = normalized.comedyType
    if (typeof raw.comedyDensity === 'string') extra.comedyDensity = normalized.comedyDensity
    if (typeof raw.emotionIntensity === 'string') {
      extra.emotionIntensity = normalized.emotionIntensity
    }
    if (typeof raw.pacingMode === 'string') extra.pacingMode = normalized.pacingMode
    if (typeof raw.satisfactionType === 'string') {
      extra.satisfactionType = normalized.satisfactionType
    }
    return {
      tone: normalized.tone,
      pace: normalized.pace,
      dialogue: normalized.dialogue,
      description: normalized.description,
      strength: normalized.strength,
      narrationDistance: normalized.narrationDistance,
      sentenceRhythm: normalized.sentenceRhythm,
      paragraphDensity: normalized.paragraphDensity,
      descriptionFocus: normalized.descriptionFocus,
      emotionExpression: normalized.emotionExpression,
      dialogueSubtext: normalized.dialogueSubtext,
      metaphorDensity: normalized.metaphorDensity,
      metaphorSource: normalized.metaphorSource,
      hookType: normalized.hookType,
      notes: normalized.notes,
      ...extra,
    }
  } catch {
    return null
  }
}
