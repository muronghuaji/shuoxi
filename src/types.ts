import type { Genre } from './genres'

export type { Genre } from './genres'

export type OutlineMode = 'traditional' | 'fine'

export type BootstrapMode = 'quick' | 'standard' | 'deep'

export interface BootstrapReport {
  characters: number
  factions: number
  items: number
  species: number
  events: number
  realms: number
  analyzedChapters: number
  totalChapters: number
  warnings: string[]
}

export interface BootstrapState {
  status: 'running' | 'done' | 'partial'
  mode: BootstrapMode
  report: BootstrapReport
  updatedAt: number
}

export type WritingMode = 'plan' | 'director' | 'wheelchair'

export interface WritingContextOptions {
  globalOutline: boolean
  chapterOutline: boolean
  events: boolean
  state: boolean
  foreshadowings: boolean
}

export interface GlobalOutlineArc {
  id: string
  title: string
  goal: string
  keyEvents: string
  endState: string
}

export interface GlobalOutline {
  premise: string
  theme: string
  conflict: string
  structure: string
  arcs: GlobalOutlineArc[]
  turningPoints: string
  ending: string
  mustResolve: string
  rules: string
  notes: string
}

export type WorkStatus = '连载中' | '草稿' | '已完结'

export type Perspective = 'third-limited' | 'third-omniscient' | 'first' | 'multi' | 'second'

export type ThemeMode = 'dark' | 'light' | 'system'
export type BuiltinAccentColor =
  | 'amber'
  | 'sage'
  | 'blue'
  | 'rose'
  | 'violet'
  | 'teal'
  | 'coral'
  | 'slate'

export type AccentColor = BuiltinAccentColor | `custom:${string}`

export interface CustomAccent {
  id: string
  label: string
  color: string
}

export type BackgroundPreset = 'none' | 'paper' | 'mountains' | 'fog' | 'ink'
export type BackgroundScope = 'home' | 'app'
export type HomeLayout = 'studio' | 'shelf'

export interface BackgroundImageRecord {
  id: string
  name: string
  data: string
  createdAt: number
}

export interface AppearanceSettings {
  mode: ThemeMode
  accent: AccentColor
  customAccents: CustomAccent[]
  uiScale: number
  backgroundPreset: BackgroundPreset
  backgroundKind: 'preset' | 'image'
  backgroundOpacity: number
  backgroundBlur: number
  backgroundScope: BackgroundScope
  themeColor?: string
  homeLayout: HomeLayout
  typography: TypographySettings
}

export type TypographyInherit = 'none' | 'global' | 'writing' | 'reading'

export interface TypographyAreaSettings {
  inherit: TypographyInherit
  fontFamily: string
  fontSize: number
  fontWeight: number
  color: string
  lineHeight: number
  measure: number
}

export interface TypographySettings {
  global: TypographyAreaSettings
  writing: TypographyAreaSettings
  reading: TypographyAreaSettings
  chat: TypographyAreaSettings
}


export type DetailMode = 'collapsed' | 'expanded' | 'fullscreen'

export type ReasoningEffort = 'auto' | 'fast' | 'balanced' | 'deep'

export type AiProfileId = 'general' | 'writing' | 'chat'

export interface AiProfileSettings {
  model: string
  reasoningEffort?: ReasoningEffort
}

export interface AiSharedConnection {
  provider: string
  baseUrl: string
  apiKey: string
  inputPrice?: number
  outputPrice?: number
  embeddingModel?: string
  contextWindow?: number
}

export interface AiProfilesConfig {
  shared: AiSharedConnection
  general: AiProfileSettings
  writing: AiProfileSettings
  chat: AiProfileSettings
}

export interface AiUsageEntry {
  id: string
  at: number
  kind: '续写' | '剧情分析' | '设定同步' | '连续性审查' | '标题生成' | '项目生成' | 'AI 助手' | '实体补全' | '实体生成' | '实体想法分析' | '卷摘要' | '提示词生成' | 'AI 改写' | '角色聊天' | '聊天记忆' | '剧情提炼' | '模块补全' | '模块审查' | '模块生成' | '势力推演' | '大纲生成' | '风格分析' | '风格试写' | '救书诊断' | '救书梳理' | '救书方案' | '救书续写' | '地形生成' | '写作技能'
  model: string
  profile?: AiProfileId
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  cacheWriteTokens?: number
  uncachedInputTokens?: number
  peak?: boolean
  currency?: 'CNY' | 'USD'
  priceSource?: string
  priceConfidence?: 'high' | 'medium' | 'low'
  unpricedReason?: string
  note?: string
  actual?: boolean
  cost?: number
  workId?: string
  chapterId?: string
  sessionId?: string
}

export interface PlatformBalanceEntry {
  currency: 'CNY' | 'USD' | string
  total: number
  granted: number
  toppedUp: number
}

export interface PlatformBalance {
  isAvailable: boolean
  balances: PlatformBalanceEntry[]
  fetchedAt?: number
  cached?: boolean
}

export type IdeaType =
  | 'scene'
  | 'dialogue'
  | 'character'
  | 'setting'
  | 'conflict'
  | 'image'
  | 'twist'
  | 'other'

export type IdeaStatus = 'inbox' | 'incubating' | 'used' | 'archived'

export interface Idea {
  id: string
  title: string
  body: string
  type: IdeaType
  tags: string[]
  status: IdeaStatus
  source: 'manual' | 'selection' | 'ai' | 'import'
  workId?: string
  chapterId?: string
  createdAt: number
  updatedAt: number
  usedAt?: number
  note?: string
}

export type SyncStrategy = 'current' | 'backfill'

export interface SyncSettings {
  afterGeneration: boolean
  chapterInterval: number
  strategy: SyncStrategy
  localChapterSummary: boolean
  importantChapterAutoSync: boolean
  coverageDeepSync: boolean
  autoArchiveComplete: boolean
  archiveCompleteLimit: number
  archiveOnlyImportant: boolean
  aiBackgroundPaused: boolean
}

export type TemplateFieldType = 'text' | 'textarea' | 'number' | 'select'

export interface TemplateField {
  id: string
  label: string
  type: TemplateFieldType
  placeholder?: string
  options?: string[]
}

export interface TemplateTerms {
  faction: string
  factionUnit: string
  rank: string
  ability: string
  item: string
  currency: string
  member: string
  leader: string
  position: string
}

export interface TemplateFeatures {
  cultivation: boolean
  equipment: boolean
  hierarchy: boolean
  ranks: boolean
  system: boolean
}

export interface TemplateFeatureOption {
  key: keyof TemplateFeatures
  label: string
  hint: string
}

export type CustomFeatureScope = 'character' | 'faction'

export interface CustomFeatureDefinition {
  id: string
  name: string
  scope: CustomFeatureScope
  fields: TemplateField[]
  includeInContext: boolean
}

export interface TemplateStoryGuide {
  engine: string
  promise: string
  roleSlots: string[]
  openings: string[]
  beats: string[]
  pitfalls: string[]
  style: string
}

export interface WorldTemplate {
  id: string
  name: string
  description: string
  builtin?: boolean
  story?: TemplateStoryGuide
  terms: TemplateTerms
  features: TemplateFeatures
  featureOptions?: TemplateFeatureOption[]
  customFeatures?: CustomFeatureDefinition[]
  modules: string[]
  characterFields: TemplateField[]
  factionFields: TemplateField[]
}

export type ModuleScope = 'world' | 'character' | 'faction' | 'story' | 'economy'

export type ModuleFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'chapter'
  | 'character'
  | 'location'

export type ModuleView = 'table' | 'board' | 'timeline' | 'checklist' | 'ladder'

export interface ModuleField {
  id: string
  label: string
  type: ModuleFieldType
  placeholder?: string
  options?: string[]
  required?: boolean
}

export interface ModuleDefinition {
  id: string
  name: string
  description: string
  scope: ModuleScope
  recordLabel: string
  fields: ModuleField[]
  statuses?: string[]
  aiHint: string
  views?: ModuleView[]
  defaultView?: ModuleView
}

export interface ModuleRecord {
  id: string
  title: string
  summary: string
  status: string
  fields: Record<string, string>
  createdAt: string
  updatedAt?: string
  chapterIds?: string[]
  characterIds?: string[]
  locationIds?: string[]
}

export type PromptCategory =
  | '通用'
  | '文风'
  | '人设'
  | '世界观'
  | '剧情'
  | '写作规则'
  | '禁忌'
  | '其他'

export interface Prompt {
  id: string
  title: string
  content: string
  category: PromptCategory
  tags: string[]
  favorite: boolean
  createdAt: number
  updatedAt: number
}

export interface ChapterVersion {
  id: string
  content: string
  updatedAt: number
}

export type ChapterStatus = 'writing' | 'done'
export type ChapterStage = 'draft' | 'writing' | 'review' | 'done' | 'published'
export type ChapterTitleSource = 'manual' | 'ai' | 'default'

export interface ChapterBeats {
  advance: string
  reveal: string
  hook: string
  goal?: string
  obstacle?: string
  turn?: string
  change?: string
  done?: {
    advance?: boolean
    reveal?: boolean
    hook?: boolean
  }
}

export interface Chapter {
  id: string
  title: string
  content: string
  wordCount?: number
  updatedAt: number
  status?: ChapterStatus
  stage?: ChapterStage
  targetWords?: number
  completedAt?: number
  titleSource?: ChapterTitleSource
  titleLocked?: boolean
  summary?: string
  summarySource?: 'local' | 'ai'
  qualityIssues?: string[]
  qualityScore?: number
  addressFixes?: string[]
  addressSuggestions?: { from: string; to: string; count: number }[]
  addressOriginalContent?: string
  styleOverride?: Partial<WorkStyle>
  finalEventId?: string
  beats?: ChapterBeats
  history?: ChapterVersion[]
}

export interface CharacterVoice {
  register: string
  sentenceLength: string
  vocabulary: string
  rhythm: string
  honorifics: string
  selfReference: string
  verbalTics: string[]
  catchphrases: string[]
  angry: string
  sad: string
  intimate: string
  pleading: string
  threatening: string
  lying: string
  neverSays: string[]
  samples: string[]
  narrationFilter: string
}

export interface CharacterBehavior {
  habits: string[]
  gestures: string[]
  nervousTells: string[]
  lyingTells: string[]
  angryTells: string[]
  relaxedTells: string[]
  posture: string
  conflictStyle: string
  intimacyBoundary: string
  moneyHabit: string
  dailyRoutine: string
  fightingStyle: string
}

export interface CharacterPreferences {
  likes: string[]
  dislikes: string[]
  foods: string[]
  hobbies: string[]
  aesthetics: string[]
  sensory: string[]
  comforts: string[]
  triggers: string[]
  topics: string[]
}

export interface CharacterKnowledge {
  knows: string[]
  believes: string[]
  secrets: string[]
  blindSpots: string[]
  biases: string[]
}

export interface CharacterRelationNote {
  characterId: string
  address: string
  addressFormal?: string
  addressIntimate?: string
  addressAngry?: string
  attitude: string
  unspoken: string
  trust: string
  dynamic: string
}

export interface CharacterStage {
  id: string
  label: string
  fromChapter: string
  toChapter: string
  goal: string
  traits: string
  voiceNote: string
}

export interface CharacterDynamicState {
  mood: string
  currentGoal: string
  injuries: string
  location: string
  possessions: string
  arc: string
  updatedAt: string
}

export interface CharacterProfileMeta {
  importance: 'core' | 'major' | 'minor' | 'extra'
  pov: boolean
  firstAppearance: string
  plotArmor: string
  aiNotes: string
}

export interface CharacterProfile {
  aliases: string[]
  coreContradiction: string
  surfacePersonality: string
  truePersonality: string
  values: string[]
  fears: string[]
  desires: string[]
  shame: string
  moralLine: string
  growthArc: string
  voice: CharacterVoice
  behavior: CharacterBehavior
  preferences: CharacterPreferences
  knowledge: CharacterKnowledge
  relationNotes: CharacterRelationNote[]
  stages: CharacterStage[]
  dynamic: CharacterDynamicState
  meta: CharacterProfileMeta
}

export type EntityLifecycle = '已上线' | '已下线' | '未上线'

export type CharacterKnowledgeScope =
  | '亲身经历'
  | '亲眼所见'
  | '听别人说'
  | '传闻'
  | '自己推断'
  | '秘密知情'

export interface CharacterExperienceRelationChange {
  targetId?: string
  targetName: string
  type: string
  change: string
}

export interface CharacterExperience {
  id: string
  chapterId?: string
  chapterNumber?: number
  storyTime?: string
  title: string
  summary: string
  participants: string[]
  location?: string
  cause?: string
  result?: string
  knowledgeScope: CharacterKnowledgeScope
  learned: string[]
  relationshipChanges: CharacterExperienceRelationChange[]
  injuries?: string
  possessions?: string
  emotionalImpact?: string
  importance: 'core' | 'major' | 'minor'
  status: 'canon' | 'rumor' | 'retconned'
  source: 'manual' | 'sync' | 'backfill'
  eventId?: string
  createdAt: string
  updatedAt: string
}

export interface EntityInventoryEntry {
  itemId: string
  quantity: number
  note?: string
}

export type ArchiveStatus = 'placeholder' | 'partial' | 'complete'

export interface CharacterAddressPhase {
  id: string
  label: string
  name: string
  fromChapterIndex: number
}

export interface CharacterCard {
  id: string
  name: string
  avatar?: string
  role: string
  identity: string
  personality: string
  goal: string
  addressTimeline?: CharacterAddressPhase[]
  archiveStatus?: ArchiveStatus
  lifecycle?: EntityLifecycle
  gender?: string
  age?: string
  sectId?: string
  speciesId?: string
  position?: string
  cultivation?: string
  realmSchemeId?: string
  realmLevel?: number
  realmSublevel?: number
  spiritRoot?: string
  physique?: string
  talent?: string
  techniques?: string[]
  weapons?: string[]
  treasures?: string[]
  currency?: string
  appearance?: string
  background?: string
  status?: string
  inventory?: EntityInventoryEntry[]
  attributes?: Record<string, string>
  experiences?: CharacterExperience[]
  profile?: CharacterProfile
}

export interface FactionMember {
  name: string
  title: string
  cultivation: string
  description?: string
  characterId?: string
  itemNames?: string[]
}

export interface FactionPeak {
  name: string
  type: string
  master: string
  personalDisciples: string[]
  description?: string
}

export interface FactionFacilityCounts {
  elder: number
  main: number
  inner: number
  outer: number
  menial: number
}

export interface FactionFacility {
  id: string
  name: string
  type: string
  description?: string
  keeper?: string
  effect?: string
  counts?: FactionFacilityCounts
  resources?: EntityInventoryEntry[]
  resourceNames?: string[]
}

export interface FactionInternalGroup {
  id: string
  name: string
  goal: string
  stance: string
  power: string
  secret: string
}

export interface FactionGovernance {
  system: string
  legitimateLeader: string
  actualPower: string
  decisionProcess: string
  succession: string
  council: string
  enforcement: string
  intelligence: string
  promotion: string
  punishment: string
  internalGroups: FactionInternalGroup[]
}

export interface FactionCulture {
  beliefs: string
  rituals: string[]
  taboos: string[]
  symbols: string
  dress: string
  addressInternal: string
  addressExternal: string
  honor: string
  outsider: string
  propaganda: string
  slogans: string[]
}

export interface FactionResources {
  finance: string
  manpower: string
  military: string
  territory: string
  supply: string
  intelligence: string
  technology: string
  legitimacy: string
  dependencies: string[]
  bottlenecks: string[]
  hiddenAssets: string[]
  debts: string[]
}

export interface FactionKnowledge {
  knows: string[]
  believes: string[]
  hides: string[]
  blindSpots: string[]
  infiltratedBy: string[]
  sources: string[]
}

export interface FactionRelationNote {
  targetType: 'faction' | 'character'
  targetId: string
  publicStance: string
  trueStance: string
  secretDeal: string
  history: string
  tension: string
}

export interface FactionStage {
  id: string
  label: string
  fromChapter: string
  toChapter: string
  goal: string
  status: string
}

export interface FactionDynamicState {
  stage: string
  leaderState: string
  morale: string
  treasury: string
  forces: string
  territory: string
  diplomacy: string
  internalStruggle: string
  currentOperation: string
  publicImage: string
  updatedAt: string
}

export interface FactionProfileMeta {
  importance: 'core' | 'major' | 'minor' | 'background'
  role: 'ally' | 'obstacle' | 'mirror' | 'resource' | 'ruler' | 'antagonist' | 'other'
  storyFunction: string
  plotArmor: string
  aiNotes: string
  firstAppearance: string
}

export interface FactionBehavior {
  threatResponse: string
  diplomacy: string
  conflictStyle: string
  negotiation: string
  riskAppetite: string
  internalDispute: string
  expansion: string
  crisis: string
  redLineBreak: string
  defaultReaction: string
}

export interface FactionProfile {
  aliases: string[]
  category: string
  scale: string
  legitimacy: string
  publicFace: string
  trueFace: string
  coreContradiction: string
  purpose: string
  origin: string
  values: string[]
  fears: string[]
  desires: string[]
  redLine: string
  weakness: string
  trauma: string
  growthArc: string
  governance: FactionGovernance
  behavior: FactionBehavior
  culture: FactionCulture
  resources: FactionResources
  knowledge: FactionKnowledge
  relations: FactionRelationNote[]
  stages: FactionStage[]
  dynamic: FactionDynamicState
  meta: FactionProfileMeta
}

export type FactionIssueType =
  | 'resources'
  | 'knowledge'
  | 'hierarchy'
  | 'doctrine'
  | 'behavior'
  | 'other'

export interface FactionConsistencyIssue {
  factionName: string
  type: FactionIssueType
  quote: string
  reason: string
  severity: 'low' | 'medium' | 'high'
  dismissed?: boolean
  dismissedAt?: string
}

export interface FactionMembership {
  id: string
  factionId: string
  characterId: string
  role: string
  publicRole: string
  secret: boolean
  loyalty: string
  status: string
}

export type FactionDynamicField =
  | 'stage'
  | 'leaderState'
  | 'morale'
  | 'treasury'
  | 'forces'
  | 'territory'
  | 'diplomacy'
  | 'internalStruggle'
  | 'currentOperation'
  | 'publicImage'

export interface FactionDynamicChange {
  field: FactionDynamicField
  from: string
  to: string
}

export interface FactionStateTimelineEntry {
  id: string
  factionId: string
  factionName: string
  chapterId: string
  chapterTitle: string
  createdAt: string
  changes: FactionDynamicChange[]
  state: FactionDynamicState
}

export interface SpeciesCard {
  id: string
  name: string
  aliases: string[]
  lifecycle?: EntityLifecycle
  category: string
  categoryId?: string
  tierLevel?: number
  tags?: string[]
  origin: string
  habitat: string
  appearance: string
  physiology: string
  lifespan: string
  abilities: string[]
  weaknesses: string[]
  society: string
  language: string
  culture: string
  relations: string
  variants: string[]
  notes: string
}

export interface FactionCard {
  id: string
  name: string
  type: string
  lifecycle?: EntityLifecycle
  tierLevel?: number
  leader: string
  goal: string
  description: string
  archiveStatus?: ArchiveStatus
  location?: string
  founded?: string
  motto?: string
  leaderId?: string
  parentId?: string
  speciesIds?: string[]
  elders?: FactionMember[]
  mainDisciples?: FactionMember[]
  outerDisciples?: number
  innerDisciples?: number
  menialDisciples?: number
  peaks?: FactionPeak[]
  facilities?: FactionFacility[]
  warehouse?: EntityInventoryEntry[]
  techniques?: string[]
  assets?: string[]
  attributes?: Record<string, string>
  profile?: FactionProfile
}

export interface RelationshipCard {
  id: string
  fromId: string
  toId: string
  type: string
  note: string
}

export type ForeshadowingStatus = '未回收' | '已回收'
export type ForeshadowingType = '人物' | '物品' | '秘密' | '事件' | '关系' | '世界观'
export type ForeshadowingImportance = '主线' | '支线' | '氛围'

export interface ForeshadowingCard {
  id: string
  title: string
  status: ForeshadowingStatus
  plantedIn: string
  note: string
  type?: ForeshadowingType
  importance?: ForeshadowingImportance
  plantedChapterId?: string
  payoffChapterId?: string
  clues?: string[]
  truth?: string
  relatedCharacterIds?: string[]
  relatedFactionIds?: string[]
  relatedItemIds?: string[]
  relatedLocationIds?: string[]
}

export type StylePace = '慢' | '中' | '快'
export type StyleDialogue = '少' | '中' | '多'
export type StyleDescription = '克制' | '适中' | '细腻'
export type StyleStrength = 'light' | 'medium' | 'strong'
export type StyleNarrationDistance = 'close' | 'medium' | 'camera'
export type StyleSentenceRhythm = 'short' | 'alternate' | 'long' | 'oral'
export type StyleParagraphDensity = 'short' | 'medium' | 'long'
export type StyleDescriptionFocus =
  | 'action'
  | 'environment'
  | 'senses'
  | 'objects'
  | 'psychology'
  | 'subtext'
export type StyleEmotionExpression = 'direct' | 'external' | 'restrained'
export type StyleDialogueSubtext = 'direct' | 'subtle' | 'high'
export type StyleMetaphorDensity = 'none' | 'low' | 'medium' | 'high'
export type StyleMetaphorSource =
  | 'daily'
  | 'nature'
  | 'industrial'
  | 'religion'
  | 'violence'
  | 'tech'
export type StyleHookType = 'suspense' | 'emotion' | 'action' | 'reveal'
export type StyleReaderPromise =
  | '爽感'
  | '悬念'
  | '情绪'
  | '人物'
  | '世界观'
  | '搞笑'
  | '治愈'
  | '恐惧'
  | '经营'
export type StyleTropeMode = 'straight' | 'aware' | 'subvert' | 'deconstruct'
export type StyleComedyType = 'none' | 'deadpan' | 'absurd' | 'dark' | 'banter' | 'meta' | 'abstract'
export type StyleComedyDensity = 'none' | 'low' | 'medium' | 'high'
export type StyleEmotionIntensity = 'restrained' | 'balanced' | 'high' | 'extreme'
export type StylePacingMode = 'slow-burn' | 'steady' | 'fast' | 'short-drama'
export type StyleSatisfactionType =
  | 'none'
  | '打脸'
  | '升级'
  | '被认可'
  | '复仇'
  | '智斗'
  | '收集'
  | '建设'
  | '情感回报'

export interface WorkStyle {
  tone: string[]
  pace: StylePace
  dialogue: StyleDialogue
  description: StyleDescription
  taboos: string
  notes: string
  presetId?: string
  strength?: StyleStrength
  sampleText?: string
  sampleAnalysis?: string
  sampleSource?: 'pasted' | 'chapters'
  narrationDistance?: StyleNarrationDistance
  sentenceRhythm?: StyleSentenceRhythm
  paragraphDensity?: StyleParagraphDensity
  descriptionFocus?: StyleDescriptionFocus[]
  emotionExpression?: StyleEmotionExpression
  dialogueSubtext?: StyleDialogueSubtext
  metaphorDensity?: StyleMetaphorDensity
  metaphorSource?: StyleMetaphorSource
  hookType?: StyleHookType
  antiAi?: string[]
  readerPromise?: StyleReaderPromise[]
  tropeMode?: StyleTropeMode
  comedyType?: StyleComedyType
  comedyDensity?: StyleComedyDensity
  emotionIntensity?: StyleEmotionIntensity
  pacingMode?: StylePacingMode
  satisfactionType?: StyleSatisfactionType
}

export type OutlineStatus = '未规划' | '待写' | '写作中' | '已完成' | '偏离' | '放弃'

export interface OutlineCard {
  id: string
  title: string
  summary: string
  goal: string
  conflict: string
  status: OutlineStatus
  targetWords: number
  arcId?: string
  povCharacterId?: string
  chapterId?: string
  characterIds?: string[]
  locationIds?: string[]
  foreshadowingIds?: string[]
}

export interface LocationCard {
  id: string
  name: string
  type: string
  description: string
  parentId?: string
  factionId?: string
  notes?: string
  mapX?: number
  mapY?: number
}

export interface ItemCategory {
  id: string
  name: string
  parentId?: string
  order: number
  color?: string
  tierSchemeId?: string
}

export interface ItemCard {
  id: string
  name: string
  categoryId: string
  grade: number
  lifecycle?: EntityLifecycle
  description: string
  notes?: string
  price?: ItemPrice
}

export interface CurrencyTier {
  id: string
  name: string
  rateToBase: number
}

export interface CurrencySettings {
  enabled: boolean
  tiers: CurrencyTier[]
}

export interface ItemPrice {
  tierId: string
  amount: number
  note?: string
}

export interface LocationLink {
  id: string
  fromId: string
  toId: string
  type: string
  note?: string
}

export interface MapPoint {
  x: number
  y: number
}

export type LocationTerrainKind =
  | 'mountain'
  | 'forest'
  | 'water'
  | 'road'
  | 'river'
  | 'ravine'
  | 'custom'
  | 'brush'
  | 'label'

export type LocationMapTheme = 'dark' | 'ink' | 'parchment' | 'blueprint'

export type LocationTerrainGeometry =
  | { type: 'stamp'; x: number; y: number; scale: number; rotation: number }
  | { type: 'polygon'; points: MapPoint[] }
  | { type: 'path'; points: MapPoint[] }

export interface LocationTerrainStyle {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  brushColor?: string
}

export interface LocationTerrainShape {
  id: string
  kind: LocationTerrainKind
  geometry: LocationTerrainGeometry
  style?: LocationTerrainStyle
  label?: string
  linkedLocationId?: string
  linkedFactionId?: string
  zIndex: number
}

export interface LocationMapLayer {
  id: 'terrain' | 'route' | 'loc' | 'label'
  name: string
  visible: boolean
  locked: boolean
}

export interface LocationMapDocument {
  version: 1
  width: number
  height: number
  theme: LocationMapTheme
  layers: LocationMapLayer[]
  shapes: LocationTerrainShape[]
}

export type SystemTaskStatus = '未触发' | '进行中' | '已完成' | '已失败' | '已放弃'

export interface SystemTask {
  id: string
  title: string
  description: string
  requirements: string
  reward: string
  penalty: string
  status: SystemTaskStatus
  chapterId?: string
}

export interface SystemReward {
  id: string
  name: string
  type: string
  effect: string
  cost: number
  stock?: number
  claimed?: boolean
}

export interface SystemLog {
  id: string
  createdAt: string
  type: string
  content: string
}

export interface SystemData {
  enabled: boolean
  name: string
  type: string
  hostCharacterId?: string
  visibility: '仅宿主' | '部分公开' | '公开'
  tone: string
  personality: string
  rules: string
  currencyName: string
  balance: number
  tasks: SystemTask[]
  rewards: SystemReward[]
  logs: SystemLog[]
}

export interface TierLevel {
  id: string
  name: string
  color: string
  sublevels?: string[]
}

export interface TierScheme {
  id: string
  name: string
  levels: TierLevel[]
}

export interface SpeciesCategory {
  id: string
  name: string
  parentId?: string
  order: number
  color?: string
  tierSchemeId?: string
}

export interface RealmHistoryEntry {
  id: string
  characterId: string
  characterName: string
  schemeId: string
  schemeName: string
  level: number
  levelName: string
  sublevel?: number
  sublevelName?: string
  at: number
  note?: string
}

export interface RescueAnalysisCharacter {
  name: string
  state: string
  goal: string
}

export interface RescueAnalysis {
  currentSituation: string
  characters: RescueAnalysisCharacter[]
  openThreads: string[]
  lastHook: string
  voice: string
  risks: string[]
  direction: string
  depth: 'quick' | 'full'
  createdAt: number
}

export interface RescuePlanChapter {
  title: string
  goal: string
  conflict: string
  reveal: string
  hook: string
  threads: string[]
}

export interface RescuePlan {
  chapters: RescuePlanChapter[]
  direction: string
  createdAt: number
}

export interface RescueChapterDraft {
  title: string
  content: string
}

export interface RescueRecord {
  analysis?: RescueAnalysis
  plan?: RescuePlan
  updatedAt: number
}

export type ChatPersonaKind = 'visitor' | 'custom' | 'character'

export interface ChatPersona {
  kind: ChatPersonaKind
  name: string
  identity: string
  relation: string
  known: string
  hidden: string
  characterId?: string
}

export interface WorkDetail {
  worldview: string
  style: WorkStyle
  characters: CharacterCard[]
  species?: SpeciesCard[]
  factions: FactionCard[]
  relationships: RelationshipCard[]
  factionRelations?: RelationshipCard[]
  foreshadowings: ForeshadowingCard[]
  analysis: string
  outline?: OutlineCard[]
  globalOutline?: GlobalOutline
  locations?: LocationCard[]
  locationLinks?: LocationLink[]
  locationMap?: LocationMapDocument
  itemCategories?: ItemCategory[]
  items?: ItemCard[]
  itemGradeNames?: string[]
  currency?: CurrencySettings
  tierSchemes?: TierScheme[]
  speciesCategories?: SpeciesCategory[]
  realmSchemes?: TierScheme[]
  activeRealmSchemeId?: string
  realmHistory?: RealmHistoryEntry[]
  factionTierSchemeId?: string
  system?: SystemData
  moduleData?: Record<string, ModuleRecord[]>
  enabledModuleIds?: string[]
  moduleViews?: Record<string, ModuleView>
  moduleCustomFields?: Record<string, ModuleField[]>
  currentSummary?: string
  currentState?: CharacterDynamicState
  chatPersona?: ChatPersona
  rescue?: RescueRecord
  continuityReport?: string
  storyStateEvents?: StoryStateEvent[]
  storyStateSnapshots?: StoryStateSnapshot[]
  characterStateTimeline?: CharacterStateTimelineEntry[]
  factionStateTimeline?: FactionStateTimelineEntry[]
  factionMemberships?: FactionMembership[]
  storyThreads?: StoryThread[]
  chapterMemories?: ChapterMemory[]
  arcSummaries?: ArcSummary[]
  memory?: StoryMemoryData
  bootstrap?: BootstrapState
  worldTemplateId?: string
  worldTemplate?: WorldTemplate
}

export interface ChapterMemory {
  chapterId: string
  chapterTitle: string
  summary: string
  keyEvents: string[]
  openThreads: string[]
  resolvedThreads: string[]
  updatedAt: string
}

export interface ArcSummary {
  id: string
  title: string
  startChapterId: string
  endChapterId: string
  startIndex: number
  endIndex: number
  chapterCount: number
  summary: string
  generatedAt: string
}

export type StoryFactStatus = 'canon' | 'rumor' | 'retconned'

export interface StoryFact {
  id: string
  subjectType: StoryStateEntityType | 'world'
  subjectId: string
  subjectName: string
  field: string
  value: string
  displayValue: string
  validFromChapterId: string
  validFromChapterNumber: number
  sourceChapterId?: string
  sourceEventId?: string
  status: StoryFactStatus
  confidence: 'high' | 'medium' | 'low'
  note?: string
}

export type StoryPromiseKind = 'foreshadow' | 'promise' | 'threat' | 'goal' | 'mystery'
export type StoryPromiseStatus = 'open' | 'advanced' | 'resolved' | 'abandoned'

export interface StoryPromise {
  id: string
  kind: StoryPromiseKind
  title: string
  detail: string
  openedChapterId?: string
  openedChapterNumber?: number
  dueChapterId?: string
  dueChapterNumber?: number
  status: StoryPromiseStatus
  priority: 'main' | 'side' | 'background'
  characters: string[]
  source: 'manual' | 'derive' | 'sync'
  createdAt: string
  updatedAt: string
}

export type StoryKnowledgeState = '知道' | '误以为' | '不知道'

export interface StoryKnowledgeEntry {
  id: string
  characterId: string
  characterName: string
  topic: string
  state: StoryKnowledgeState
  source: 'profile' | 'experience' | 'manual'
  chapterId?: string
  chapterNumber?: number
  confidence: 'high' | 'medium' | 'low'
}

export interface StoryVolumeMemory {
  id: string
  title: string
  startChapterId: string
  endChapterId: string
  startIndex: number
  endIndex: number
  chapterCount: number
  summary: string
  keyEvents: string[]
  characterChanges: string[]
  openThreads: string[]
  source: 'auto' | 'manual'
  updatedAt: string
}

export type StoryHealthIssueType =
  | 'canon-conflict'
  | 'overdue-promise'
  | 'stale-thread'
  | 'dead-character'
  | 'knowledge-leak'
  | 'repetition'
  | 'missing-summary'
  | 'facility-risk'
  | 'other'

export interface StoryHealthIssue {
  id: string
  type: StoryHealthIssueType
  severity: 'low' | 'medium' | 'high'
  title: string
  detail: string
  chapterId?: string
  chapterNumber?: number
  entityName?: string
  suggestion?: string
}

export interface StoryHealthReport {
  score: number
  generatedAt: string
  issues: StoryHealthIssue[]
  counts: Record<string, number>
}

export interface StoryMemoryData {
  version: 1
  generatedAt: string
  volumes: StoryVolumeMemory[]
  facts: StoryFact[]
  promises: StoryPromise[]
  knowledge: StoryKnowledgeEntry[]
  health: StoryHealthReport
  lastAudit?: {
    chapterId: string
    chapterNumber: number
    generatedAt: string
    issues: StoryHealthIssue[]
  }
}

export type StoryStateJsonValue =
  | string
  | number
  | boolean
  | null
  | StoryStateJsonValue[]
  | { [key: string]: StoryStateJsonValue }

export type StoryStateEntityType =
  | 'character'
  | 'faction'
  | 'location'
  | 'item'
  | 'species'
  | 'foreshadowing'
  | 'relationship'
  | 'system'
  | 'module'

export interface StoryStateChange {
  entityType: StoryStateEntityType
  entityId: string
  field: string
  action: 'set' | 'add' | 'remove'
  value: string
  structuredValue?: StoryStateJsonValue
  note?: string
}

export type StoryStateNewEntityType =
  | 'character'
  | 'faction'
  | 'location'
  | 'item'
  | 'species'
  | 'foreshadowing'
  | 'relationship'

export interface StoryStateNewEntity {
  entityType: StoryStateNewEntityType
  id: string
  name: string
  role?: string
  identity?: string
  personality?: string
  sectId?: string
  factionId?: string
  type?: string
  description?: string
  leader?: string
  location?: string
  title?: string
  plantedIn?: string
  note?: string
  fromId?: string
  toId?: string
  relationType?: string
  categoryId?: string
  grade?: number
  profile?: StoryStateJsonValue
  data?: StoryStateJsonValue
}

export type CharacterIssueType = 'knowledge' | 'voice' | 'behavior' | 'other'

export interface CharacterConsistencyIssue {
  characterName: string
  type: CharacterIssueType
  quote: string
  reason: string
  severity: 'low' | 'medium' | 'high'
  dismissed?: boolean
  dismissedAt?: string
}

export type CharacterDynamicField =
  | 'mood'
  | 'currentGoal'
  | 'injuries'
  | 'location'
  | 'possessions'

export interface CharacterDynamicChange {
  field: CharacterDynamicField
  from: string
  to: string
}

export interface CharacterStateTimelineEntry {
  id: string
  characterId: string
  characterName: string
  chapterId: string
  chapterTitle: string
  createdAt: string
  changes: CharacterDynamicChange[]
  state: CharacterDynamicState
}

export interface StoryStateEvent {
  id: string
  chapterId: string
  chapterTitle: string
  createdAt: string
  summary: string
  changes: StoryStateChange[]
  events?: StoryEventEntry[]
  openThreads?: string[]
  newEntities?: StoryStateNewEntity[]
  characterIssues?: CharacterConsistencyIssue[]
  factionIssues?: FactionConsistencyIssue[]
}

export type StoryThreadStatus = 'open' | 'resolved' | 'abandoned'
export type StoryThreadPriority = 'main' | 'side' | 'background'

export interface StoryThread {
  id: string
  text: string
  status: StoryThreadStatus
  priority: StoryThreadPriority
  createdChapterId?: string
  lastTouchedChapterId?: string
  resolutionChapterId?: string
  createdAt?: string
}

export type StoryEventImportance = 'low' | 'medium' | 'high'
export type StoryEventStatus = 'canon' | 'rumor' | 'retconned'

export interface StoryEventEntry {
  id: string
  title: string
  summary: string
  participants: string[]
  location: string
  cause: string
  result: string
  consequences: string[]
  importance: StoryEventImportance
  status: StoryEventStatus
}

export interface StoryStateSnapshot {
  id: string
  eventId: string
  chapterId: string
  chapterTitle: string
  createdAt: string
  previousSummary: string
  data: {
    characters: CharacterCard[]
    factions: FactionCard[]
    locations: LocationCard[]
    items?: ItemCard[]
    species?: SpeciesCard[]
    foreshadowings: ForeshadowingCard[]
    relationships?: RelationshipCard[]
    system?: SystemData
    moduleData?: Record<string, ModuleRecord[]>
    storyThreads?: StoryThread[]
    characterStateTimeline?: CharacterStateTimelineEntry[]
    factionStateTimeline?: FactionStateTimelineEntry[]
  }
}

export type PersonalNovelLength = 'short' | 'medium' | 'serial'

export interface PersonalNovelCharacter {
  name: string
  role: string
  goal: string
  hiddenName?: string
  revealChapter?: number
}

export interface PersonalNovelFaction {
  name: string
  type: string
  goal: string
}

export interface PersonalNovelChapterPlan {
  title: string
  goal: string
  conflict: string
  hook: string
}

export interface PersonalNovelPlan {
  title: string
  logline: string
  synopsis: string
  protagonist: string
  characters: PersonalNovelCharacter[]
  factions?: PersonalNovelFaction[]
  realmSchemeName?: string
  realmLevels?: string[]
  factionTierName?: string
  factionTierLevels?: string[]
  chapters: PersonalNovelChapterPlan[]
}

export type PersonalNovelBatchStatus =
  | 'outline'
  | 'writing'
  | 'paused'
  | 'done'
  | 'error'

export interface PersonalNovelBatch {
  chapterCount: number
  targetWords: number
  status: PersonalNovelBatchStatus
  completedChapters: number
  syncStatus: 'pending' | 'done'
  startedAt: number
  updatedAt: number
  error?: string
}

export interface PersonalNovelState {
  status: 'setup' | 'planning' | 'plan_ready' | 'writing' | 'error'
  idea: string
  length: PersonalNovelLength
  tone: string
  pov: string
  chapterCount: number
  wordsPerChapter: number
  plan?: PersonalNovelPlan
  batch?: PersonalNovelBatch
  syncJobs?: PersonalNovelSyncJob[]
  currentChapterIndex: number
  error?: string
  createdAt: number
  updatedAt: number
}

export interface PersonalNovelSyncJob {
  id: string
  type: 'fast' | 'deep'
  chapterId: string
  chapterTitle: string
  status: 'queued' | 'running' | 'done' | 'error'
  error?: string
  startedAt?: number
  finishedAt?: number
}

export interface PersonalNovelCreateInput {
  idea: string
  length: PersonalNovelLength
  tone: string
  pov: string
  chapterCount: number
  wordsPerChapter: number
}

export interface WorkCreationSettings {
  style?: string
  pace?: string
  romance?: string
  ending?: string
  chapterWords?: number
  avoid?: string
}

export interface Work {
  id: string
  title: string
  synopsis: string
  theme: string
  genres: Genre[]
  creationSettings?: WorkCreationSettings
  outlineMode: OutlineMode
  writingMode?: WritingMode
  contextOptions?: Partial<WritingContextOptions>
  contextBudget?: number // 0 = 不限制；省略 = 默认 24000
  perspective: Perspective
  characterCount: number
  targetWords: number
  promptIds: string[]
  status: WorkStatus
  chapters: number
  words: number
  updatedAt: number
  coverIndex: number
  coverImage?: string
  startedAt?: number
  completedAt?: number
  completionNote?: string
  kind?: 'writer' | 'personal'
  personalNovel?: PersonalNovelState
  syncJobs?: PersonalNovelSyncJob[]
}

export interface CreateWorkInput {
  title: string
  synopsis: string
  theme: string
  genres: Genre[]
  outlineMode: OutlineMode
  writingMode: WritingMode
  perspective: Perspective
  characterCount: number
  targetWords: number
  creationSettings?: WorkCreationSettings
  worldTemplateId?: string
  globalOutline?: GlobalOutline
  outline?: OutlineCard[]
  characters?: CharacterCard[]
  factions?: FactionCard[]
  relationships?: RelationshipCard[]
}

export interface ApiConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  contextWindow?: number
  reasoningEffort?: ReasoningEffort
  inputPrice?: number
  outputPrice?: number
  embeddingModel?: string
}

export interface CharacterChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  at: number
  speakerId?: string
  speakerName?: string
  proactive?: boolean
}

export type CoreEmotion =
  | 'neutral'
  | 'joy'
  | 'sadness'
  | 'fear'
  | 'anger'
  | 'surprise'
  | 'disgust'
  | 'trust'
  | 'anticipation'

export type ChatEmotionTarget = 'user' | 'self' | 'other' | 'situation'
export type ChatEmotionTendency = 'approach' | 'avoid' | 'attack' | 'endure' | 'probe'

export interface CharacterChatEmotion {
  primary: CoreEmotion
  intensity: number
  cause: string
  target: ChatEmotionTarget
  tendency: ChatEmotionTendency
  baseline: CoreEmotion
  updatedAt: number
  auto: boolean
}

export interface CharacterChatProactiveState {
  dayKey: string
  dailyCount: number
  followUpCount: number
  lastProactiveAt?: number
  away?: boolean
  awayAt?: number
}

export interface CharacterChatSession {
  id: string
  workId: string
  characterId: string
  title: string
  chapterCutoff: number
  createdAt: number
  updatedAt: number
  messages: CharacterChatMessage[]
  backgroundImage?: string
  participantIds?: string[]
  summary?: string
  memoryCursor?: number
  autoMemory?: boolean
  pinned?: boolean
  branchOf?: string
  emotion?: CharacterChatEmotion
  proactive?: CharacterChatProactiveState
  persona?: ChatPersona
}

export type CharacterMemoryKind = 'fact' | 'promise' | 'emotion' | 'relationship' | 'user'

export type ChatLanguageOpenness = 'gentle' | 'normal' | 'sharp' | 'extreme'
export type ChatIntimacyLevel = 'off' | 'tension' | 'fade' | 'adult'

export interface CharacterChatSettings {
  autoMemoryDefault: boolean
  autoMemoryInterval: number
  defaultCutoffMode: 'latest' | 'first'
  contextMessageLimit: number
  replyLength: 'short' | 'normal' | 'long'
  languageOpenness: ChatLanguageOpenness
  allowProfanity: boolean
  allowThreats: boolean
  intimacyLevel: ChatIntimacyLevel
  proactiveEnabled: boolean
  proactiveDailyLimit: number
  proactiveFollowUpLimit: number
  backgroundImage?: string
}

export interface CharacterChatMemory {
  id: string
  workId: string
  characterId: string
  text: string
  createdAt: number
  pinned: boolean
  kind?: CharacterMemoryKind
  source?: 'auto' | 'manual'
}

export type View = 'home' | 'workspace' | 'personal' | 'prompts' | 'chat' | 'stats' | 'ideas'
