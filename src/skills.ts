import type { Chapter, Work, WorkDetail } from './types'

export type SkillToolName =
  | 'chapter'
  | 'selection'
  | 'characters'
  | 'story_state'
  | 'recent_chapters'
  | 'stats'

export interface SkillToolResource {
  name: string
  text: string
}

export interface SkillDefinition {
  id: string
  name: string
  description: string
  category: '检查' | '润色' | '结构' | '自定义'
  output: 'advice' | 'rewrite'
  profile: 'writing' | 'general'
  instructions: string
  tools: SkillToolName[]
  resources?: SkillToolResource[]
  builtin?: boolean
  enabled?: boolean
  version: number
}

export const SKILL_TOOL_LABELS: Record<SkillToolName, string> = {
  chapter: '本章正文',
  selection: '当前选中文本',
  characters: '角色资料',
  story_state: '事件与状态',
  recent_chapters: '最近章节',
  stats: '文本统计',
}

export const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    id: 'builtin.scene-diagnosis',
    name: '场景诊断',
    description: '检查这一场的目标、冲突、信息释放和结尾，只给问题，不改正文。',
    category: '检查',
    output: 'advice',
    profile: 'general',
    builtin: true,
    version: 1,
    tools: ['chapter', 'characters', 'story_state', 'stats'],
    instructions: [
      '你是小说场景诊断编辑。只诊断本章当前场景，不重写正文。',
      '按以下维度逐项检查：',
      '1. 本场目标：主角/视角人物这一场想得到什么，是否明确。',
      '2. 冲突：谁阻止他，阻力是否具体，是否靠巧合解决。',
      '3. 信息释放：读者知道了什么，人物知道了什么，有没有提前泄底或该说没说。',
      '4. 人物位置与动作：是否清楚每个人在哪、在做什么。',
      '5. 节奏：有没有重复解释、无效对话、可删段落。',
      '6. 结尾：本场是否收住，是否留下下一场的动力。',
      '输出格式：问题列表，每条包含「位置 / 问题 / 建议」，不要输出改写稿。',
      '不确定的地方标为「待确认」，不要编造设定。',
    ].join('\n'),
  },
  {
    id: 'builtin.dialogue-polish',
    name: '对白打磨',
    description: '把解释型对白改成有潜台词的对白，保持人物语气和事实不变。',
    category: '润色',
    output: 'rewrite',
    profile: 'writing',
    builtin: true,
    version: 1,
    tools: ['chapter', 'selection', 'characters'],
    instructions: [
      '你是中文小说对白编辑。只改对白及其前后必要的动作提示，不改事件结果。',
      '原则：',
      '1. 删除角色直接说出目的、情绪和设定的台词，改成试探、回避、反问或动作。',
      '2. 每个角色的称呼、句长、口癖、态度必须符合角色资料。',
      '3. 保留原对白的信息量，不新增设定，不改变谁占上风。',
      '4. 不写「他愤怒地说」「她悲伤地说」这类解释。',
      '5. 只输出修改后的正文片段，不要解释。',
      '如果没有选中文本，就处理本章对白最密集的连续段落。',
    ].join('\n'),
  },
  {
    id: 'builtin.continuity-audit',
    name: '连续性审查',
    description: '检查本章与人物、事件、时间、位置、认知边界是否冲突，只报告问题。',
    category: '检查',
    output: 'advice',
    profile: 'general',
    builtin: true,
    version: 1,
    tools: ['chapter', 'characters', 'story_state', 'recent_chapters'],
    instructions: [
      '你是长篇小说连续性审查员。只报告冲突，不修改正文。',
      '检查：',
      '1. 人物是否知道了他没有经历过、没有听说过的事。',
      '2. 人物是否同时出现在两个地方，或位置突然变化。',
      '3. 伤势、物品、关系、身份是否无故变化。',
      '4. 时间线、路程、天气、季节是否矛盾。',
      '5. 本章事件是否与最近章节或事件簿冲突。',
      '输出格式：冲突列表，每条包含「正文位置 / 冲突内容 / 依据 / 建议」，没有冲突就明确写「未发现明显连续性冲突」。',
      '不要因为风格问题报告冲突。',
    ].join('\n'),
  },
  {
    id: 'builtin.local-polish',
    name: '局部润色',
    description: '只润色选中段落，调整节奏和用词，不改变事实与情节。',
    category: '润色',
    output: 'rewrite',
    profile: 'writing',
    builtin: true,
    version: 1,
    tools: ['selection', 'chapter', 'characters'],
    instructions: [
      '你是中文小说文字编辑。只润色选中文本；没有选中文本时，润色本章最后 3–5 段。',
      '要求：',
      '1. 不改变人物、事件、对白意思和因果。',
      '2. 删掉解释性心理和总结句，尽量用动作、停顿、细节表达。',
      '3. 调整句长和段落节奏，避免连续同构句。',
      '4. 减少空泛比喻和形容词堆叠。',
      '5. 保持原叙述人称、时态和视角。',
      '只输出润色后的文本，不要解释，不要输出 diff。',
    ].join('\n'),
  },
  {
    id: 'builtin.reduce-body-language',
    name: '去肢体动作腔',
    description: '减少装饰性肢体动作和套话，把情绪改成对白潜台词、停顿、物件与环境；保留真正有信息量的动作。',
    category: '润色',
    output: 'rewrite',
    profile: 'writing',
    builtin: true,
    version: 1,
    tools: ['selection', 'chapter', 'characters', 'stats'],
    resources: [
      {
        name: '反例',
        text: '他皱了皱眉，指尖轻轻敲击桌面，眼底闪过一丝复杂，喉结滚了滚，才缓缓开口。',
      },
      {
        name: '正例',
        text: '“你确定要现在说？”\n他把茶盏推回桌心，杯底没有发出声音。',
      },
    ],
    instructions: [
      '你是中文小说文字编辑，专门处理“肢体动作过多、用动作代替情绪”的问题。',
      '只改写选中文本；没有选中文本时，处理本章动作最密集的连续 2–3 段。',
      '目标不是删光动作，而是让每个动作都传递新信息。',
      '硬性规则：',
      '1. 每 3 个自然段最多保留 1 处身体动作描写。',
      '2. 连续两个自然段不得都写身体动作。',
      '3. 动作只有满足以下之一才保留：改变人物之间的力量关系；暴露人物在隐瞒什么；打断对白制造停顿；推动下一步行动。',
      '4. 表达情绪时按优先级选择：对白潜台词、停顿/答非所问、人物正在做的具体事情、环境细节、内心念头，最后才是身体动作。',
      '5. 禁止套话：勾唇、挑眉、眯眼、垂眸、深吸一口气、攥紧拳头、指尖泛白、喉结滚动、扯嘴角、眼底闪过、眸色一沉、意味深长地。',
      '6. 同一角色全章最多保留 1 个习惯性小动作，且不超过 2 次。',
      '7. 不改变人物、事件、对白意思、因果和视角；不新增设定。',
      '8. 被删掉的动作改成对白、停顿、具体事务或环境，不要只换成另一个动作套话。',
      '9. 只输出修改后的正文，不要解释，不要输出 diff、标题或分析。',
      '10. 输出前自检：删掉所有不传递新信息的动作句；连续两段都有动作时，改写其中一段；每个保留动作都必须能回答“它改变了什么”。',
    ].join('\n'),
  },
  {
    id: 'builtin.chapter-ending',
    name: '章节收尾',
    description: '检查本章结尾是否收住、是否留钩子、是否和下一章开头冲突。',
    category: '结构',
    output: 'advice',
    profile: 'general',
    builtin: true,
    version: 1,
    tools: ['chapter', 'story_state', 'recent_chapters'],
    instructions: [
      '你是小说章节结构编辑。只检查本章结尾，不改写正文。',
      '检查：',
      '1. 本章主要冲突是否阶段收束，还是悬在半空。',
      '2. 结尾是否只靠「他说了一句话」硬留钩子。',
      '3. 是否收掉了该收的线索，是否留下明确的新问题。',
      '4. 结尾情绪是否和本章整体一致。',
      '5. 是否与下一章可能开头冲突，是否有重复。',
      '输出：一段总体判断 + 3 条以内具体问题 + 一个可选的结尾方向，不要直接写正文。',
    ].join('\n'),
  },
]

const CUSTOM_SKILLS_KEY = 'shuoxi.skills.custom.v1'
const DISABLED_SKILLS_KEY = 'shuoxi.skills.disabled.v1'
const TOOL_NAMES = new Set(Object.keys(SKILL_TOOL_LABELS) as SkillToolName[])

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

export function normalizeSkill(raw: unknown): SkillDefinition | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const id = text(record.id)
  const name = text(record.name)
  const instructions = text(record.instructions)
  if (!id || !name || !instructions) return null
  const tools = Array.isArray(record.tools)
    ? record.tools.map((item) => String(item)).filter((item): item is SkillToolName => TOOL_NAMES.has(item as SkillToolName))
    : []
  const resources = Array.isArray(record.resources)
    ? record.resources
        .map((item) => {
          const value = item as Record<string, unknown>
          return { name: text(value.name), text: text(value.text) }
        })
        .filter((item) => item.name && item.text)
        .slice(0, 8)
    : []
  return {
    id,
    name,
    description: text(record.description),
    category: record.category === '润色' || record.category === '结构' || record.category === '自定义' ? record.category : '检查',
    output: record.output === 'rewrite' ? 'rewrite' : 'advice',
    profile: record.profile === 'general' ? 'general' : 'writing',
    instructions,
    tools,
    resources,
    version: typeof record.version === 'number' ? record.version : 1,
    enabled: record.enabled !== false,
  }
}

export function loadCustomSkills(): SkillDefinition[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SKILLS_KEY)
    if (!raw) return []
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    return value.map(normalizeSkill).filter((item): item is SkillDefinition => Boolean(item))
  } catch {
    return []
  }
}

export function saveCustomSkills(skills: SkillDefinition[]): void {
  localStorage.setItem(
    CUSTOM_SKILLS_KEY,
    JSON.stringify(skills.filter((skill) => !skill.builtin).slice(0, 100)),
  )
}

export function allSkills(): SkillDefinition[] {
  const disabled = new Set(loadDisabledSkillIds())
  return [
    ...BUILTIN_SKILLS.map((skill) => ({ ...skill, enabled: !disabled.has(skill.id) })),
    ...loadCustomSkills(),
  ]
}

export function loadDisabledSkillIds(): string[] {
  try {
    const raw = localStorage.getItem(DISABLED_SKILLS_KEY)
    if (!raw) return []
    const value = JSON.parse(raw) as unknown
    return Array.isArray(value) ? value.map(String).slice(0, 200) : []
  } catch {
    return []
  }
}

export function saveDisabledSkillIds(ids: string[]): void {
  localStorage.setItem(DISABLED_SKILLS_KEY, JSON.stringify([...new Set(ids)].slice(0, 200)))
}

export function setSkillsEnabled(ids: string[], enabled: boolean): void {
  const idSet = new Set(ids)
  const custom = loadCustomSkills().map((skill) =>
    idSet.has(skill.id) ? { ...skill, enabled } : skill,
  )
  saveCustomSkills(custom)
  const builtinIds = new Set(BUILTIN_SKILLS.map((skill) => skill.id))
  const disabled = new Set(loadDisabledSkillIds())
  for (const id of ids) {
    if (!builtinIds.has(id)) continue
    if (enabled) disabled.delete(id)
    else disabled.add(id)
  }
  saveDisabledSkillIds([...disabled])
}

export function renameCustomSkill(id: string, name: string): void {
  const nextName = name.trim()
  if (!nextName) return
  saveCustomSkills(
    loadCustomSkills().map((skill) => (skill.id === id ? { ...skill, name: nextName } : skill)),
  )
}

export function exportSkills(skills: SkillDefinition[]): string {
  return JSON.stringify({ app: 'shuoxi', version: 1, skills }, null, 2)
}

interface SkillToolData {
  chapters: Chapter[]
  currentChapter: Chapter
  detail: WorkDetail
  selectedText?: string
}

export function buildSkillToolSections(
  skill: SkillDefinition,
  data: SkillToolData,
): string[] {
  const sections: string[] = []
  const content = data.currentChapter.content
  if (skill.tools.includes('chapter')) {
    sections.push(`【工具·本章正文】\n${content.slice(0, 12000)}`)
  }
  if (skill.tools.includes('selection')) {
    const selected = data.selectedText?.trim()
    sections.push(`【工具·当前选中文本】\n${selected ? selected.slice(0, 4000) : '（没有选中文本，请按技能说明处理本章末段或对白密集段）'}`)
  }
  if (skill.tools.includes('stats')) {
    const paragraphs = content.split(/\n+/).filter((line) => line.trim())
    const dialogue = paragraphs.filter((line) => /["“”]/.test(line)).length
    sections.push(
      [
        '【工具·文本统计】',
        `字数：${content.replace(/\s/g, '').length}`,
        `段落：${paragraphs.length}`,
        `含对白段落：${dialogue}`,
        `平均段长：${paragraphs.length ? Math.round(content.length / paragraphs.length) : 0}`,
      ].join('\n'),
    )
  }
  if (skill.tools.includes('characters')) {
    const lines = data.detail.characters.slice(0, 12).map((character) => {
      const profile = character.profile
      return `${character.name}｜${character.role || '角色'}｜${character.identity || '身份未定'}｜${
        profile?.coreContradiction ? `矛盾：${profile.coreContradiction}` : ''
      }${profile?.voice?.register ? `｜语气：${profile.voice.register}` : ''}`
    })
    sections.push(`【工具·角色资料】\n${lines.join('\n')}`)
  }
  if (skill.tools.includes('story_state')) {
    const events = (data.detail.storyStateEvents ?? [])
      .slice(-8)
      .map((event) => `${event.chapterTitle}：${event.summary}`)
    const threads = (data.detail.storyThreads ?? [])
      .filter((thread) => thread.status === 'open')
      .slice(0, 8)
      .map((thread) => `未解决：${thread.text}`)
    sections.push(
      `【工具·事件与状态】\n当前摘要：${data.detail.currentSummary || '无'}\n${events.join('\n')}\n${threads.join('\n')}`,
    )
  }
  if (skill.tools.includes('recent_chapters')) {
    const index = data.chapters.findIndex((chapter) => chapter.id === data.currentChapter.id)
    const recent = data.chapters.slice(Math.max(0, index - 3), index).map((chapter) => {
      return `${chapter.title || chapter.id}：${chapter.summary || chapter.content.slice(-500)}`
    })
    sections.push(`【工具·最近章节】\n${recent.join('\n\n') || '没有更早章节'}`)
  }
  return sections
}

export function buildSkillMessages(input: {
  skill: SkillDefinition
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  currentChapter: Chapter
  selectedText?: string
}) {
  const toolSections = buildSkillToolSections(input.skill, input)
  const resourceSections = (input.skill.resources ?? []).map(
    (resource) => `【技能资料·${resource.name}】\n${resource.text}`,
  )
  return [
    {
      role: 'system' as const,
      content: [
        '你是《说戏》内置写作技能执行器。',
        '严格按技能说明工作，只处理本次提供的内容，不编造没有依据的设定。',
        '输出只包含技能要求的最终结果，不要解释过程，不要 Markdown 代码块。',
        '',
        `【技能：${input.skill.name}】`,
        input.skill.instructions,
      ].join('\n'),
    },
    {
      role: 'user' as const,
      content: [
        `【作品】${input.work.title}｜${input.work.genres.join('、') || '通用'}｜${input.work.theme || '主题未定'}`,
        `【当前章节】第 ${input.chapters.findIndex((chapter) => chapter.id === input.currentChapter.id) + 1} 章 ${input.currentChapter.title || '未命名章节'}`,
        ...toolSections,
        ...resourceSections,
        '',
        input.skill.output === 'rewrite'
          ? '请直接输出修改后的文本。'
          : '请输出检查结果；不要改写正文。',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}
