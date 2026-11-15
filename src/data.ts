import type {
  ApiConfig,
  Chapter,
  Genre,
  Perspective,
  Prompt,
  PromptCategory,
  Work,
  WorkDetail,
} from './types'
import { isGenre } from './genres'
import { createEmptyStyle } from './styleProfile'
import { countWords } from './utils'

export interface ProviderPreset {
  id: string
  name: string
  baseUrl: string
  model: string
  hint: string
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-flash',
    hint: '填写 API Key 后会自动获取该服务商的可用模型；接口兼容 OpenAI。',
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    hint: '阿里云百炼，国内直连，速度快。',
  },
  {
    id: 'kimi',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    hint: '长上下文，适合把更多前文一次交给模型。',
  },
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
    hint: '完全离线运行，不产生 API 费用。',
  },
  {
    id: 'custom',
    name: '自定义（OpenAI 兼容）',
    baseUrl: '',
    model: '',
    hint: '任何兼容 /chat/completions 的接口都可以接入。',
  },
]

export function getProvider(id: string): ProviderPreset {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0]
}

export const DEFAULT_API: ApiConfig = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-flash',
  reasoningEffort: 'auto',
}

export function normalizeModelId(provider: string, model: string): string {
  if (provider !== 'deepseek') return model
  if (model === 'deepseek-chat' || model === 'deepseek-v4-flash') return 'deepseek-flash'
  if (model === 'deepseek-reasoner') return 'deepseek-v4-pro'
  return model
}

export function displayModelName(model: string): string {
  if (model === 'deepseek-flash' || model === 'deepseek-chat') return 'V4.1 Flash'
  if (model === 'deepseek-v4-pro' || model === 'deepseek-reasoner') return 'V4 Pro'
  return model
}

export function migrateApiConfig(raw: unknown): ApiConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_API
  const value = raw as Partial<ApiConfig>
  const provider = typeof value.provider === 'string' ? value.provider : DEFAULT_API.provider
  let model = typeof value.model === 'string' ? value.model : getProvider(provider).model
  model = normalizeModelId(provider, model)
  return {
    provider,
    baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : DEFAULT_API.baseUrl,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
    model,
    reasoningEffort: value.reasoningEffort ?? 'auto',
    inputPrice: typeof value.inputPrice === 'number' ? value.inputPrice : 0,
    outputPrice: typeof value.outputPrice === 'number' ? value.outputPrice : 0,
  }
}

export const PERSPECTIVES: { value: Perspective; label: string }[] = [
  { value: 'third-limited', label: '第三人称 · 限知' },
  { value: 'third-omniscient', label: '第三人称 · 全知' },
  { value: 'first', label: '第一人称' },
  { value: 'multi', label: '多视角' },
  { value: 'second', label: '第二人称' },
]

export const PROMPT_CATEGORIES: PromptCategory[] = [
  '通用',
  '文风',
  '人设',
  '世界观',
  '剧情',
  '写作规则',
  '禁忌',
  '其他',
]

export const MODEL_CATALOG: Record<string, string[]> = {
  deepseek: ['deepseek-flash', 'deepseek-v4-pro'],
  qwen: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long'],
  kimi: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  ollama: ['qwen2.5:7b', 'llama3.1:8b', 'deepseek-r1:7b'],
  custom: [],
}

export const STYLE_TONE_OPTIONS = [
  '克制',
  '冷峻',
  '温暖',
  '幽默',
  '华丽',
  '悬疑',
  '细腻',
  '电影感',
  '爽',
  '燃',
  '甜',
  '虐',
  '沙雕',
  '反套路',
  '人物',
  '群像',
  '癫',
]

function isPerspective(value: unknown): value is Perspective {
  return PERSPECTIVES.some((item) => item.value === value)
}

const now = Date.now()

export const SEED_PROMPTS: Prompt[] = [
  {
    id: 'p-concise',
    title: '克制白描',
    content:
      '多用动作、物件和细节推进，少用形容词和心理解释。情绪不直接说出来，让读者从角色做了什么里看出来。',
    category: '文风',
    tags: ['白描', '克制'],
    favorite: true,
    createdAt: now - 12 * 86_400_000,
    updatedAt: now - 2 * 86_400_000,
  },
  {
    id: 'p-dialogue',
    title: '对话不解释潜台词',
    content: '人物对话不要互相解释潜台词。重要的话说一半，剩下的让动作和停顿去说。',
    category: '写作规则',
    tags: ['对话', '潜台词'],
    favorite: false,
    createdAt: now - 11 * 86_400_000,
    updatedAt: now - 3 * 86_400_000,
  },
  {
    id: 'p-logic',
    title: '主角不降智',
    content: '主角不做降智选择。每一个决定都要有当下的动机、代价和压力来源。',
    category: '人设',
    tags: ['主角', '逻辑'],
    favorite: false,
    createdAt: now - 10 * 86_400_000,
    updatedAt: now - 4 * 86_400_000,
  },
  {
    id: 'p-hook',
    title: '每场结尾留钩子',
    content: '每场戏结束前，留下一个未解决的问题、一个反常的细节，或一句没有说完的话。',
    category: '剧情',
    tags: ['节奏', '钩子'],
    favorite: true,
    createdAt: now - 9 * 86_400_000,
    updatedAt: now - 5 * 86_400_000,
  },
  {
    id: 'p-world',
    title: '设定必须可回收',
    content:
      '新设定出现时必须可回收：它会在什么时候、以什么方式产生作用？没有回收计划的设定不要写。',
    category: '世界观',
    tags: ['设定', '伏笔'],
    favorite: false,
    createdAt: now - 8 * 86_400_000,
    updatedAt: now - 6 * 86_400_000,
  },
  {
    id: 'p-forbid',
    title: '禁止巧合推进',
    content:
      '不靠巧合、失忆、梦境或突然出现的救兵推进剧情。冲突必须由人物选择和已有设定产生。',
    category: '禁忌',
    tags: ['禁忌', '逻辑'],
    favorite: true,
    createdAt: now - 7 * 86_400_000,
    updatedAt: now - 7 * 86_400_000,
  },
  {
    id: 'p-emotion',
    title: '不替读者总结情绪',
    content:
      '不替读者总结情绪。不要写「她很难过」，写她的手在杯沿上停了很久，茶凉了也没喝。',
    category: '写作规则',
    tags: ['情绪', '细节'],
    favorite: false,
    createdAt: now - 6 * 86_400_000,
    updatedAt: now - 8 * 86_400_000,
  },
  {
    id: 'p-scene',
    title: '单场戏控制篇幅',
    content: '每场戏 800–1500 字，只完成一个戏剧任务；一场戏里不要塞进两次转折。',
    category: '剧情',
    tags: ['节奏', '字数'],
    favorite: false,
    createdAt: now - 5 * 86_400_000,
    updatedAt: now - 9 * 86_400_000,
  },
]

function buildSeedWorks(): Work[] {
  return [
  {
    id: 'w-mist-harbor',
    title: '雾港来信',
    synopsis:
      '雨夜，旧书店。林夏推门进来，发现柜台后坐着三年前失踪的姐姐，她手里捏着一张泛黄的寻人启事。',
    theme: '关于失踪、记忆，和一句迟到了三年的答案。',
    genres: ['悬疑', '推理'],
    outlineMode: 'fine',
    perspective: 'third-limited',
    characterCount: 6,
    targetWords: 300000,
    promptIds: ['p-concise', 'p-hook', 'p-world'],
    status: '连载中',
    chapters: 12,
    words: 32400,
    updatedAt: now - 2 * 3_600_000,
    coverIndex: 0,
  },
  {
    id: 'w-spring-weightless',
    title: '春日失重',
    synopsis: '分手三年后，两人在同一架飞往大理的航班上重逢，中间只隔了一条过道。',
    theme: '重逢、错过，以及重新选择一次的勇气。',
    genres: ['言情', '现言'],
    outlineMode: 'traditional',
    perspective: 'first',
    characterCount: 4,
    targetWords: 200000,
    promptIds: ['p-concise', 'p-emotion'],
    status: '连载中',
    chapters: 8,
    words: 21800,
    updatedAt: now - 26 * 3_600_000,
    coverIndex: 1,
  },
  {
    id: 'w-spare-the-blade',
    title: '刀下留人',
    synopsis: '刽子手行刑前夜收到一封血书，上面只有四个字：刀下留人。',
    theme: '规矩、良知，和一个刽子手想保住的东西。',
    genres: ['武侠', '历史'],
    outlineMode: 'traditional',
    perspective: 'third-omniscient',
    characterCount: 5,
    targetWords: 120000,
    promptIds: ['p-concise', 'p-dialogue'],
    status: '草稿',
    chapters: 3,
    words: 8400,
    updatedAt: now - 3 * 86_400_000,
    coverIndex: 2,
  },
  {
    id: 'w-seventh-wake',
    title: '第七次醒来',
    synopsis: '她每次死亡都会在七分钟前醒来，但这一次，倒计时变成了六分钟。',
    theme: '时间、记忆，和自我救赎的七分钟。',
    genres: ['科幻', '悬疑'],
    outlineMode: 'fine',
    perspective: 'third-limited',
    characterCount: 3,
    targetWords: 150000,
    promptIds: ['p-hook', 'p-forbid'],
    status: '连载中',
    chapters: 6,
    words: 15600,
    updatedAt: now - 5 * 86_400_000,
    coverIndex: 3,
  },
  {
    id: 'w-human-fireworks',
    title: '人间烟火',
    synopsis: '巷口的面馆要拆了，老板娘决定在最后一天，把欠街坊们的面都还上。',
    theme: '告别、邻里，和普通人的体面。',
    genres: ['都市', '现实'],
    outlineMode: 'traditional',
    perspective: 'multi',
    characterCount: 8,
    targetWords: 250000,
    promptIds: [],
    status: '已完结',
    chapters: 24,
    words: 82200,
    updatedAt: now - 9 * 86_400_000,
    coverIndex: 4,
  },
]
}

export const SEED_WORKS: Work[] = import.meta.env.PROD ? [] : buildSeedWorks()

const DEMO_CHAPTER_CONTENT = [
  '雨是傍晚开始下的。',
  '林夏推开旧书店的门，门轴发出一声很轻的呻吟，像有人从很深的地方叹了口气。店里没开灯，只有柜台后一盏台灯亮着，光晕里浮着细小的灰。',
  '然后她看到了那个女人。',
  '三年了。寻人启事上的照片已经泛黄，照片里的眉眼此刻就坐在台灯下，抬头看她，像一句迟到了三年的问句。',
  '「你回来了。」姐姐说。',
  '她手里捏着一张纸，纸角被指腹磨得发毛。林夏站在门口，雨水顺着伞尖滴到木地板上，一滴，两滴。她忽然发现自己忘了要说什么。',
].join('\n\n')

function seedChapters(workId: string, titles: string[], firstContent = ''): Chapter[] {
  return titles.map((title, index) => ({
    id: `${workId}-ch-${index + 1}`,
    title,
    content: index === 0 ? firstContent : '',
    updatedAt: now - (titles.length - index) * 3_600_000,
  }))
}

const unnamed = (count: number) => Array.from({ length: count }, () => '未命名章节')

function buildSeedChapters(): Record<string, Chapter[]> {
  return {
  'w-mist-harbor': seedChapters(
    'w-mist-harbor',
    ['雨夜来客', '寻人启事', '铜钥匙', ...unnamed(9)],
    DEMO_CHAPTER_CONTENT,
  ),
  'w-spring-weightless': seedChapters('w-spring-weightless', unnamed(8)),
  'w-spare-the-blade': seedChapters('w-spare-the-blade', unnamed(3)),
  'w-seventh-wake': seedChapters('w-seventh-wake', unnamed(6)),
  'w-human-fireworks': seedChapters('w-human-fireworks', unnamed(24)),
}
}

export const SEED_CHAPTERS: Record<string, Chapter[]> = import.meta.env.PROD ? {} : buildSeedChapters()

let chapterSequence = 0

export function createChapter(
  title = '未命名章节',
  content = '',
  wordCount?: number,
): Chapter {
  chapterSequence += 1
  return {
    id: `ch-${Date.now().toString(36)}-${chapterSequence}`,
    title,
    content,
    wordCount: wordCount ?? countWords(content),
    updatedAt: Date.now(),
    status: 'writing',
    titleSource: 'default',
  }
}

export function createEmptyDetail(): WorkDetail {
  return {
    worldview: '',
    style: createEmptyStyle(),
    characters: [],
    species: [],
    factions: [],
    relationships: [],
    foreshadowings: [],
    analysis: '',
    worldTemplateId: 'generic',
  }
}

function buildSeedWorkDetails(): Record<string, WorkDetail> {
  return {
  'w-mist-harbor': {
    worldview:
      '雾港，南方沿海的旧港城。常年多雾，旧城区保留着九十年代的书店、钟楼和码头。近十年有数起失踪案不了了之，卷宗大多停在「自行离开」四个字上。',
    style: {
      tone: ['克制', '悬疑', '电影感'],
      pace: '中',
      dialogue: '中',
      description: '细腻',
      taboos: '不要用巧合、失忆或梦境推进剧情；不要替读者总结情绪。',
      notes: '每章结尾留一个未解决的问题。重要信息尽量藏在动作和物件里。',
    },
    characters: [
      {
        id: 'c-linxia',
        name: '林夏',
        role: '主角',
        identity: '《雾港晚报》记者',
        personality: '执拗，怕水，习惯用玩笑掩饰紧张',
        goal: '找到失踪三年的姐姐，弄清她为什么回来',
      },
      {
        id: 'c-linwu',
        name: '林雾',
        role: '关键角色',
        identity: '失踪者，现为旧书店主人',
        personality: '温柔，隐瞒，说话只说一半',
        goal: '保护林夏，不再让她追查旧案',
      },
    ],
    factions: [
      {
        id: 'f-news',
        name: '雾港晚报',
        type: '媒体',
        leader: '主编 陈默',
        goal: '追独家，同时掩盖一段旧案',
        description: '旧城区仅存的老牌报社，纸张发黄，消息却灵通。',
      },
      {
        id: 'f-police',
        name: '港区警署',
        type: '执法',
        leader: '副队长 周野',
        goal: '维持三年前失踪案的结论',
        description: '码头边的灰色小楼，夜里总有一盏灯亮着。',
      },
    ],
    relationships: [
      {
        id: 'r-linxia-linwu',
        fromId: 'c-linxia',
        toId: 'c-linwu',
        type: '姐妹',
        note: '相依为命，但姐姐失踪前两人有过一次激烈争吵。',
      },
      {
        id: 'r-linxia-linwu-hide',
        fromId: 'c-linxia',
        toId: 'c-linwu',
        type: '互相隐瞒',
        note: '林夏没说自己在查旧案，林雾没说这三年去了哪。',
      },
    ],
    foreshadowings: [
      {
        id: 'fs-three-years',
        title: '姐姐失踪的三年',
        status: '未回收',
        plantedIn: '第一章',
        note: '她为什么回来，又为什么像在躲什么人。',
      },
      {
        id: 'fs-brass-key',
        title: '铜钥匙',
        status: '未回收',
        plantedIn: '第一章',
        note: '对应旧书店地窖的门，姐姐一直把它带在身上。',
      },
    ],
    analysis: '',
  },
}
}

export const SEED_WORK_DETAILS: Record<string, WorkDetail> = import.meta.env.PROD ? {} : buildSeedWorkDetails()

interface LegacyWork {
  id?: unknown
  title?: unknown
  synopsis?: unknown
  premise?: unknown
  theme?: unknown
  genres?: unknown
  genre?: unknown
  outlineMode?: unknown
  perspective?: unknown
  characterCount?: unknown
  targetWords?: unknown
  promptIds?: unknown
  status?: unknown
  chapters?: unknown
  words?: unknown
  updatedAt?: unknown
  coverIndex?: unknown
  coverImage?: unknown
}

/**
 * 兼容 v0.1 时代的旧数据结构（单一 genre / premise 字段），
 * 读取 localStorage 时统一修补成新结构。
 */
export function normalizeStoredWorks(raw: unknown): Work[] {
  if (!Array.isArray(raw)) return import.meta.env.PROD ? [] : SEED_WORKS

  return raw.map((entry, index) => {
    const legacy = (entry ?? {}) as LegacyWork

    const genres: Genre[] = []
    if (Array.isArray(legacy.genres)) {
      for (const item of legacy.genres) {
        if (isGenre(item) && !genres.includes(item)) genres.push(item)
      }
    }
    if (genres.length === 0 && isGenre(legacy.genre)) genres.push(legacy.genre)

    const synopsis =
      typeof legacy.synopsis === 'string'
        ? legacy.synopsis
        : typeof legacy.premise === 'string'
          ? legacy.premise
          : ''

    const promptIds = Array.isArray(legacy.promptIds)
      ? legacy.promptIds.filter((id): id is string => typeof id === 'string')
      : []

    return {
      id: typeof legacy.id === 'string' && legacy.id ? legacy.id : `w-migrated-${index}`,
      title:
        typeof legacy.title === 'string' && legacy.title.trim() ? legacy.title : '未命名作品',
      synopsis,
      theme: typeof legacy.theme === 'string' ? legacy.theme : '',
      genres: genres.length > 0 ? genres : (['其他'] as Genre[]),
      outlineMode: legacy.outlineMode === 'traditional' ? 'traditional' : 'fine',
      writingMode:
        (legacy as Partial<Work>).writingMode === 'wheelchair'
          ? 'wheelchair'
          : (legacy as Partial<Work>).writingMode === 'plan' ||
              (legacy as Partial<Work>).writingMode === 'director'
            ? 'director'
            : undefined,
      contextOptions:
        (legacy as Partial<Work>).contextOptions &&
        typeof (legacy as Partial<Work>).contextOptions === 'object'
          ? (legacy as Partial<Work>).contextOptions
          : undefined,
      contextBudget:
        typeof (legacy as Partial<Work>).contextBudget === 'number'
          ? (legacy as Partial<Work>).contextBudget
          : undefined,
      perspective: isPerspective(legacy.perspective) ? legacy.perspective : 'third-limited',
      characterCount:
        typeof legacy.characterCount === 'number' && legacy.characterCount >= 1
          ? legacy.characterCount
          : 3,
      targetWords:
        typeof legacy.targetWords === 'number' && legacy.targetWords >= 1000
          ? legacy.targetWords
          : 100000,
      promptIds,
      status: legacy.status === '连载中' || legacy.status === '已完结' ? legacy.status : '草稿',
      chapters: typeof legacy.chapters === 'number' && legacy.chapters >= 0 ? legacy.chapters : 0,
      words: typeof legacy.words === 'number' && legacy.words >= 0 ? legacy.words : 0,
      updatedAt: typeof legacy.updatedAt === 'number' ? legacy.updatedAt : Date.now(),
      coverIndex:
        typeof legacy.coverIndex === 'number' && legacy.coverIndex >= 0
          ? legacy.coverIndex % 5
          : index % 5,
      ...(typeof legacy.coverImage === 'string' && legacy.coverImage.startsWith('data:image/')
        ? { coverImage: legacy.coverImage }
        : {}),
    }
  })
}

/**
 * ������������ʾ���顣����ʱ�������Ƿ�����Ժͽ�ͼ��
 * �����淢��������ʹ�ö����� userData����������������뱳��ͼ��
 */
export const INITIAL_WORKS: Work[] = import.meta.env.PROD ? [] : SEED_WORKS
export const INITIAL_CHAPTERS: Record<string, Chapter[]> = import.meta.env.PROD
  ? {}
  : SEED_CHAPTERS
export const INITIAL_WORK_DETAILS: Record<string, WorkDetail> = import.meta.env.PROD
  ? {}
  : SEED_WORK_DETAILS
