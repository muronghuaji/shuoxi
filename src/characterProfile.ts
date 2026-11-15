import type {
  CharacterBehavior,
  CharacterCard,
  CharacterDynamicState,
  CharacterKnowledge,
  CharacterPreferences,
  CharacterProfile,
  CharacterProfileMeta,
  CharacterRelationNote,
  CharacterStage,
  CharacterVoice,
  WorkDetail,
} from './types'

const MAX_TEXT = 600
const MAX_LIST = 20

export function emptyCharacterVoice(): CharacterVoice {
  return {
    register: '',
    sentenceLength: '',
    vocabulary: '',
    rhythm: '',
    honorifics: '',
    selfReference: '',
    verbalTics: [],
    catchphrases: [],
    angry: '',
    sad: '',
    intimate: '',
    pleading: '',
    threatening: '',
    lying: '',
    neverSays: [],
    samples: [],
    narrationFilter: '',
  }
}

export function emptyCharacterBehavior(): CharacterBehavior {
  return {
    habits: [],
    gestures: [],
    nervousTells: [],
    lyingTells: [],
    angryTells: [],
    relaxedTells: [],
    posture: '',
    conflictStyle: '',
    intimacyBoundary: '',
    moneyHabit: '',
    dailyRoutine: '',
    fightingStyle: '',
  }
}

export function emptyCharacterPreferences(): CharacterPreferences {
  return {
    likes: [],
    dislikes: [],
    foods: [],
    hobbies: [],
    aesthetics: [],
    sensory: [],
    comforts: [],
    triggers: [],
    topics: [],
  }
}

export function emptyCharacterKnowledge(): CharacterKnowledge {
  return { knows: [], believes: [], secrets: [], blindSpots: [], biases: [] }
}

export function emptyCharacterDynamic(): CharacterDynamicState {
  return {
    mood: '',
    currentGoal: '',
    injuries: '',
    location: '',
    possessions: '',
    arc: '',
    updatedAt: '',
  }
}

export function emptyCharacterMeta(): CharacterProfileMeta {
  return {
    importance: 'major',
    pov: false,
    firstAppearance: '',
    plotArmor: '',
    aiNotes: '',
  }
}

export function emptyCharacterProfile(): CharacterProfile {
  return {
    aliases: [],
    coreContradiction: '',
    surfacePersonality: '',
    truePersonality: '',
    values: [],
    fears: [],
    desires: [],
    shame: '',
    moralLine: '',
    growthArc: '',
    voice: emptyCharacterVoice(),
    behavior: emptyCharacterBehavior(),
    preferences: emptyCharacterPreferences(),
    knowledge: emptyCharacterKnowledge(),
    relationNotes: [],
    stages: [],
    dynamic: emptyCharacterDynamic(),
    meta: emptyCharacterMeta(),
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

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function normalizeCharacterProfile(raw: unknown): CharacterProfile {
  const input = object(raw)
  const voice = object(input.voice)
  const behavior = object(input.behavior)
  const preferences = object(input.preferences)
  const knowledge = object(input.knowledge)
  const dynamic = object(input.dynamic)
  const meta = object(input.meta)

  const relationNotes: CharacterRelationNote[] = Array.isArray(input.relationNotes)
    ? input.relationNotes
        .map((item) => {
          const value = object(item)
          return {
            characterId: text(value.characterId),
            address: text(value.address),
            addressFormal: text(value.addressFormal),
            addressIntimate: text(value.addressIntimate),
            addressAngry: text(value.addressAngry),
            attitude: text(value.attitude),
            unspoken: text(value.unspoken),
            trust: text(value.trust),
            dynamic: text(value.dynamic),
          }
        })
        .filter((item) => item.characterId)
        .slice(0, 40)
    : []

  const stages: CharacterStage[] = Array.isArray(input.stages)
    ? input.stages
        .map((item, index) => {
          const value = object(item)
          return {
            id: text(value.id) || `stage-${index + 1}`,
            label: text(value.label),
            fromChapter: text(value.fromChapter),
            toChapter: text(value.toChapter),
            goal: text(value.goal),
            traits: text(value.traits),
            voiceNote: text(value.voiceNote),
          }
        })
        .filter((item) => item.label || item.traits || item.goal)
        .slice(0, 20)
    : []

  const importance = ['core', 'major', 'minor', 'extra'].includes(String(meta.importance))
    ? (meta.importance as CharacterProfileMeta['importance'])
    : 'major'

  return {
    aliases: list(input.aliases),
    coreContradiction: text(input.coreContradiction),
    surfacePersonality: text(input.surfacePersonality),
    truePersonality: text(input.truePersonality),
    values: list(input.values),
    fears: list(input.fears),
    desires: list(input.desires),
    shame: text(input.shame),
    moralLine: text(input.moralLine),
    growthArc: text(input.growthArc),
    voice: {
      register: text(voice.register),
      sentenceLength: text(voice.sentenceLength),
      vocabulary: text(voice.vocabulary),
      rhythm: text(voice.rhythm),
      honorifics: text(voice.honorifics),
      selfReference: text(voice.selfReference),
      verbalTics: list(voice.verbalTics),
      catchphrases: list(voice.catchphrases),
      angry: text(voice.angry),
      sad: text(voice.sad),
      intimate: text(voice.intimate),
      pleading: text(voice.pleading),
      threatening: text(voice.threatening),
      lying: text(voice.lying),
      neverSays: list(voice.neverSays),
      samples: list(voice.samples),
      narrationFilter: text(voice.narrationFilter),
    },
    behavior: {
      habits: list(behavior.habits),
      gestures: list(behavior.gestures),
      nervousTells: list(behavior.nervousTells),
      lyingTells: list(behavior.lyingTells),
      angryTells: list(behavior.angryTells),
      relaxedTells: list(behavior.relaxedTells),
      posture: text(behavior.posture),
      conflictStyle: text(behavior.conflictStyle),
      intimacyBoundary: text(behavior.intimacyBoundary),
      moneyHabit: text(behavior.moneyHabit),
      dailyRoutine: text(behavior.dailyRoutine),
      fightingStyle: text(behavior.fightingStyle),
    },
    preferences: {
      likes: list(preferences.likes),
      dislikes: list(preferences.dislikes),
      foods: list(preferences.foods),
      hobbies: list(preferences.hobbies),
      aesthetics: list(preferences.aesthetics),
      sensory: list(preferences.sensory),
      comforts: list(preferences.comforts),
      triggers: list(preferences.triggers),
      topics: list(preferences.topics),
    },
    knowledge: {
      knows: list(knowledge.knows),
      believes: list(knowledge.believes),
      secrets: list(knowledge.secrets),
      blindSpots: list(knowledge.blindSpots),
      biases: list(knowledge.biases),
    },
    relationNotes,
    stages,
    dynamic: {
      mood: text(dynamic.mood),
      currentGoal: text(dynamic.currentGoal),
      injuries: text(dynamic.injuries),
      location: text(dynamic.location),
      possessions: text(dynamic.possessions),
      arc: text(dynamic.arc),
      updatedAt: text(dynamic.updatedAt),
    },
    meta: {
      importance,
      pov: meta.pov === true,
      firstAppearance: text(meta.firstAppearance),
      plotArmor: text(meta.plotArmor),
      aiNotes: text(meta.aiNotes),
    },
  }
}

export function profileOf(character: CharacterCard): CharacterProfile {
  return normalizeCharacterProfile(character.profile)
}

export function profileCompleteness(profile: CharacterProfile): {
  score: number
  missing: string[]
} {
  const hasText = (values: string[]) => values.some((value) => value.trim())
  const checks: [string, boolean][] = [
    ['核心矛盾', Boolean(profile.coreContradiction)],
    ['表层/真实性格', Boolean(profile.surfacePersonality || profile.truePersonality)],
    ['价值观', hasText(profile.values)],
    ['恐惧', hasText(profile.fears)],
    ['说话方式', Boolean(profile.voice.register || profile.voice.sentenceLength)],
    ['语气样本', hasText(profile.voice.samples)],
    ['绝不说什么', hasText(profile.voice.neverSays)],
    ['行为习惯', hasText(profile.behavior.habits) || hasText(profile.behavior.gestures)],
    [
      '紧张/说谎小动作',
      hasText(profile.behavior.nervousTells) || hasText(profile.behavior.lyingTells),
    ],
    ['喜欢/讨厌', hasText(profile.preferences.likes) || hasText(profile.preferences.dislikes)],
    ['知道什么', hasText(profile.knowledge.knows)],
    ['当前状态', Boolean(profile.dynamic.mood || profile.dynamic.currentGoal)],
  ]
  const filled = checks.filter(([, ok]) => ok).length
  return {
    score: Math.round((filled / checks.length) * 100),
    missing: checks.filter(([, ok]) => !ok).map(([label]) => label),
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function joinList(values: string[], max = 8): string {
  return values.slice(0, max).join('、')
}

function line(label: string, value: string): string {
  return value ? `${label}：${value}` : ''
}

export interface CharacterPromptOptions {
  mode?: 'writing' | 'chat' | 'planning'
  detail?: WorkDetail
  activeNames?: string[]
  maxSamples?: number
  includeKnowledge?: boolean
  extraLines?: string[]
  chapterNumber?: number
}

export function buildCharacterProfilePrompt(
  character: CharacterCard,
  options: CharacterPromptOptions = {},
): string {
  const profile = profileOf(character)
  const mode = options.mode ?? 'writing'
  const maxSamples = options.maxSamples ?? (mode === 'chat' ? 5 : 3)
  const samples = profile.voice.samples.slice(0, maxSamples)
  const activeNames = new Set(options.activeNames ?? [])
  const relationLines = profile.relationNotes
    .filter(
      (note) =>
        note.characterId &&
        (activeNames.size === 0 || activeNames.has(note.characterId)),
    )
    .map((note) => {
      const other = options.detail?.characters.find((item) => item.id === note.characterId)
      return other
        ? `${other.name}：${[
            note.address && `默认称呼${note.address}`,
            note.addressFormal && `正式称呼${note.addressFormal}`,
            note.addressIntimate && `亲密称呼${note.addressIntimate}`,
            note.addressAngry && `生气时称呼${note.addressAngry}`,
            note.attitude,
            note.unspoken && `未说出口：${note.unspoken}`,
            note.trust && `信任：${note.trust}`,
            note.dynamic,
          ]
            .filter(Boolean)
            .join('；')}`
        : ''
    })
    .filter(Boolean)
    .slice(0, 8)

  const chapterNumber = options.chapterNumber
  const stageByRange = chapterNumber
    ? profile.stages.find((stage) => {
        const from = Number.parseInt(stage.fromChapter, 10)
        const to = Number.parseInt(stage.toChapter, 10)
        const afterStart = !Number.isFinite(from) || chapterNumber >= from
        const beforeEnd = !Number.isFinite(to) || chapterNumber <= to
        return afterStart && beforeEnd
      })
    : undefined
  const currentStage =
    stageByRange ??
    (profile.dynamic.arc
      ? profile.stages.find((stage) => stage.label === profile.dynamic.arc)
      : undefined) ??
    profile.stages[profile.stages.length - 1]

  const knowledgeLines = [
    profile.knowledge.knows.length ? `- 知道：${joinList(profile.knowledge.knows, 12)}` : '',
    profile.knowledge.believes.length ? `- 误以为：${joinList(profile.knowledge.believes, 8)}` : '',
    profile.knowledge.secrets.length ? `- 秘密：${joinList(profile.knowledge.secrets, 8)}` : '',
    profile.knowledge.blindSpots.length ? `- 不知道：${joinList(profile.knowledge.blindSpots, 8)}` : '',
    profile.knowledge.biases.length ? `- 偏见：${joinList(profile.knowledge.biases, 8)}` : '',
  ].filter(Boolean)

  const lines = [
    `【角色：${character.name || '未命名'}】`,
    line('定位', character.role),
    line('身份', character.identity),
    line('年龄/性别', [character.age, character.gender].filter(Boolean).join(' / ')),
    line('当前状态', character.status ?? ''),
    line('目标', character.goal),
    line('基础性格', character.personality),
    line('背景', character.background ?? ''),
    line('外貌', character.appearance ?? ''),
    line('核心矛盾', profile.coreContradiction),
    line('表层性格', profile.surfacePersonality),
    line('真实性格', profile.truePersonality),
    line('价值观', joinList(profile.values)),
    line('恐惧', joinList(profile.fears)),
    line('欲望', joinList(profile.desires)),
    line('羞耻/软肋', profile.shame),
    line('道德底线', profile.moralLine),
    line('成长弧线', profile.growthArc),
    line('说话方式', [profile.voice.register, profile.voice.sentenceLength, profile.voice.vocabulary, profile.voice.rhythm].filter(Boolean).join('；')),
    line('称呼/敬语', profile.voice.honorifics),
    line('自称', profile.voice.selfReference),
    line('口癖', joinList(profile.voice.verbalTics)),
    line('口头禅', joinList(profile.voice.catchphrases)),
    line('生气时', profile.voice.angry),
    line('悲伤时', profile.voice.sad),
    line('亲密时', profile.voice.intimate),
    line('求人时', profile.voice.pleading),
    line('威胁时', profile.voice.threatening),
    line('撒谎时', profile.voice.lying),
    line('绝不说', joinList(profile.voice.neverSays)),
    samples.length ? `语气样本（只模仿语气，不要照抄）：\n${samples.map((sample) => `- “${sample}”`).join('\n')}` : '',
    line('叙述滤镜', profile.voice.narrationFilter),
    line('习惯', joinList(profile.behavior.habits)),
    line('小动作', joinList(profile.behavior.gestures)),
    line('紧张时', joinList(profile.behavior.nervousTells)),
    line('说谎时', joinList(profile.behavior.lyingTells)),
    line('生气时', joinList(profile.behavior.angryTells)),
    line('放松时', joinList(profile.behavior.relaxedTells)),
    line('姿势', profile.behavior.posture),
    line('冲突方式', profile.behavior.conflictStyle),
    line('亲密边界', profile.behavior.intimacyBoundary),
    line('金钱习惯', profile.behavior.moneyHabit),
    line('日常作息', profile.behavior.dailyRoutine),
    line('战斗习惯', profile.behavior.fightingStyle),
    line('喜欢', joinList(profile.preferences.likes)),
    line('讨厌', joinList(profile.preferences.dislikes)),
    line('食物', joinList(profile.preferences.foods)),
    line('爱好', joinList(profile.preferences.hobbies)),
    line('审美', joinList(profile.preferences.aesthetics)),
    line('感官偏好', joinList(profile.preferences.sensory)),
    line('舒适区', joinList(profile.preferences.comforts)),
    line('雷点', joinList(profile.preferences.triggers)),
    line('常聊话题', joinList(profile.preferences.topics)),
    options.includeKnowledge !== false && mode !== 'planning' && knowledgeLines.length
      ? `认知边界（只允许角色知道这些，不要开天眼）：\n${knowledgeLines.join('\n')}`
      : '',
    currentStage
      ? line('当前阶段', [currentStage.label, currentStage.goal, currentStage.traits, currentStage.voiceNote].filter(Boolean).join('；'))
      : '',
    profile.dynamic.mood ? line('当前情绪', profile.dynamic.mood) : '',
    profile.dynamic.currentGoal ? line('当前目标', profile.dynamic.currentGoal) : '',
    profile.dynamic.injuries ? line('当前伤势', profile.dynamic.injuries) : '',
    profile.dynamic.location ? line('当前所在地', profile.dynamic.location) : '',
    profile.dynamic.possessions ? line('当前持有物', profile.dynamic.possessions) : '',
    relationLines.length ? `关系态度：\n${relationLines.map((item) => `- ${item}`).join('\n')}` : '',
    line('作者给 AI 的额外要求', profile.meta.aiNotes),
    profile.meta.plotArmor ? line('剧情保护', profile.meta.plotArmor) : '',
    ...(options.extraLines ?? []),
    '情感演法：恐惧、羞耻和欲望不要写成标签；让它们决定他注意什么、回避什么、把哪句话咽回去。',
    '表演要求：只写这个角色会注意、会反应、会说的话；不要把他写成设定清单，不要每场都展示所有特征。',
  ]
  return lines.filter(Boolean).join('\n')
}

export function characterMentioned(character: CharacterCard, text: string): boolean {
  if (!text) return false
  const names = [character.name, ...profileOf(character).aliases].filter(Boolean)
  return names.some((name) => text.includes(name))
}

/**
 * 从已有正文里提取角色附近的对话，作为语气样本候选。
 * 只做本地匹配，不调用 AI；优先取最近章节。
 */
export function extractVoiceSamples(
  character: CharacterCard,
  chapters: { content: string }[],
  limit = 5,
): string[] {
  const names = [character.name, ...profileOf(character).aliases]
    .map((name) => name.trim())
    .filter(Boolean)
  if (names.length === 0) return []
  const quotePattern = /[“「]([^”」\n]{2,160})[”」]|"([^"\n]{2,160})"/g
  const results: string[] = []
  const seen = new Set<string>()

  for (let index = chapters.length - 1; index >= 0 && results.length < limit; index -= 1) {
    const content = chapters[index].content
    if (!content || !names.some((name) => content.includes(name))) continue
    quotePattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = quotePattern.exec(content)) && results.length < limit) {
      const quote = (match[1] ?? match[2] ?? '').trim()
      if (!quote) continue
      const prefix = content.slice(Math.max(0, match.index - 40), match.index)
      const suffix = content.slice(
        Math.min(content.length, match.index + match[0].length),
        Math.min(content.length, match.index + match[0].length + 20),
      )
      // 只取说话人附近有角色名的引号；避免把下一段其他人的对白算进来。
      const beforeSpeaker = names.some((name) => {
        const nameIndex = prefix.lastIndexOf(name)
        if (nameIndex < 0) return false
        const lastQuote = Math.max(prefix.lastIndexOf('”'), prefix.lastIndexOf('」'))
        // 如果角色名在上一句引号之后又出现，那它更可能是上一句的说话人。
        return lastQuote < nameIndex
      })
      const afterSpeaker = names.some((name) =>
        new RegExp(`^[ \\t]*${escapeRegExp(name)}(?:说|道|问|答|喊|叫|笑|开口|低声|轻声)`).test(
          suffix,
        ),
      )
      if (!beforeSpeaker && !afterSpeaker) continue
      const key = quote.replace(/\s+/g, ' ')
      if (seen.has(key)) continue
      seen.add(key)
      results.push(quote)
    }
  }
  return results
}

export function selectFocusCharacters(
  detail: WorkDetail,
  focusText: string,
  limit = 6,
): CharacterCard[] {
  const characters = detail.characters ?? []
  if (characters.length === 0) return []
  const mentioned = characters.filter((character) => characterMentioned(character, focusText))
  const important = characters.filter((character) => {
    const profile = profileOf(character)
    return (
      profile.meta.pov ||
      profile.meta.importance === 'core' ||
      /主角|男主|女主|核心/.test(character.role)
    )
  })
  const selected: CharacterCard[] = []
  for (const character of [...mentioned, ...important]) {
    if (!selected.some((item) => item.id === character.id)) selected.push(character)
    if (selected.length >= limit) break
  }
  if (selected.length === 0) selected.push(...characters.slice(0, Math.min(3, characters.length)))
  return selected
}

export function characterQuickLine(character: CharacterCard): string {
  const profile = profileOf(character)
  const voice = [profile.voice.register, profile.voice.sentenceLength, profile.voice.verbalTics[0]]
    .filter(Boolean)
    .join('、')
  return `- ${character.name || '未命名'}｜${character.role || '角色'}｜${character.identity || '身份未定'}｜性格：${character.personality || profile.surfacePersonality || '未设定'}${voice ? `｜说话：${voice}` : ''}${profile.coreContradiction ? `｜矛盾：${profile.coreContradiction}` : ''}`
}
