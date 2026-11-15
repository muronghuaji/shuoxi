import type { AiUsageEntry, ApiConfig, FactionCard, Work, WorkDetail } from './types'
import { buildFactionProfilePrompt, factionMemberRecords } from './factionProfile'
import { estimateTokens } from './utils'
import { type ChatMessage, type ChatUsage } from './ai'
import { runApiTask } from './aiTask'

export interface FactionCouncilResult {
  situation: string
  positions: {
    faction: string
    stance: string
    interests: string
    risk: string
  }[]
  decision: string
  dissent: string
  risks: string[]
  nextMoves: string[]
  sceneHook: string
}

export function buildFactionCouncilMessages(input: {
  work: Work
  detail: WorkDetail
  faction: FactionCard
  topic: string
}): ChatMessage[] {
  const { work, detail, faction, topic } = input
  const profile = buildFactionProfilePrompt(faction, {
    mode: 'planning',
    detail,
    maxRelations: 20,
  })
  const members = factionMemberRecords(detail, faction)
  const memberLines = members
    .slice(0, 10)
    .map(
      (member) =>
        `- ${member.character.name}｜${member.role}${member.secret ? '（秘密身份）' : ''}${member.loyalty ? `｜忠诚：${member.loyalty}` : ''}`,
    )
    .join('\n')
  const related = factionProfileOfRelations(detail, faction)
  const otherFactions = detail.factions
    .filter((item) => item.id !== faction.id)
    .slice(0, 3)
    .map((item) => {
      const other = buildFactionProfilePrompt(item, {
        mode: 'planning',
        detail,
        maxRelations: 4,
      })
      return `【${item.name || '未命名'}】\n${other}`
    })
    .join('\n\n')
  return [
    {
      role: 'system',
      content: [
        '你是中文长篇小说作者的政治 / 组织推演助手。',
        '根据势力档案、成员、资源、情报边界和当前局势，推演一次势力议事会。',
        '只输出一个 JSON 对象，不要 markdown、解释或前后缀；不要写正文。',
        '结构：{"situation":"当前局势","positions":[{"faction":"派系或参会方","stance":"立场","interests":"利益","risk":"风险"}],"decision":"最终决策","dissent":"少数意见","risks":["风险"],"nextMoves":["下一步行动"],"sceneHook":"可直接写进下一场戏的钩子"}',
        '必须让组织像组织：有派系分歧、信息差、资源限制和决策代价；不要所有人都同意，也不要让势力像一个人一样思考。',
        '如果议题涉及其他势力，把其他势力也当成独立参会方，输出它们各自基于自己利益的立场；不要让所有势力共享同一种态度。',
        'decision 必须是在当前资源、情报和权力结构下可能做出的决定；如果条件不足，写出暂缓、试探或内部争吵。',
        '不要剧透作者没给出的未来；不要编造档案之外的关键事实。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】《${work.title}》｜${work.genres.join('、') || '题材未定'}`,
        `【主势力档案】\n${profile}`,
        memberLines ? `【关键成员】\n${memberLines}` : '',
        related ? `【相关势力关系】\n${related}` : '',
        otherFactions ? `【其他参会势力】\n${otherFactions}` : '',
        `【本次议题】${topic}`,
        '请推演这次议事会（或外交 / 战争 / 商战会议），返回 JSON。',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

function factionProfileOfRelations(detail: WorkDetail, faction: FactionCard): string {
  const profile = faction.profile
  if (!profile?.relations?.length) return ''
  return profile.relations
    .filter((relation) => relation.targetType === 'faction')
    .slice(0, 12)
    .map((relation) => {
      const target = detail.factions.find((item) => item.id === relation.targetId)
      return target
        ? `- ${target.name}：公开 ${relation.publicStance || '未定'}；真实 ${relation.trueStance || '未定'}${relation.secretDeal ? `；秘密 ${relation.secretDeal}` : ''}`
        : ''
    })
    .filter(Boolean)
    .join('\n')
}

export function parseFactionCouncil(text: string): FactionCouncilResult | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const raw = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
    const read = (key: string, max = 500) =>
      typeof raw[key] === 'string' ? (raw[key] as string).trim().slice(0, max) : ''
    const positions = Array.isArray(raw.positions)
      ? raw.positions
          .map((item) => {
            if (!item || typeof item !== 'object') return null
            const value = item as Record<string, unknown>
            const factionName = typeof value.faction === 'string' ? value.faction.trim() : ''
            if (!factionName) return null
            return {
              faction: factionName,
              stance: typeof value.stance === 'string' ? value.stance.trim() : '',
              interests: typeof value.interests === 'string' ? value.interests.trim() : '',
              risk: typeof value.risk === 'string' ? value.risk.trim() : '',
            }
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .slice(0, 12)
      : []
    const list = (key: string): string[] =>
      Array.isArray(raw[key])
        ? (raw[key] as unknown[])
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 12)
        : []
    const result: FactionCouncilResult = {
      situation: read('situation', 600),
      positions,
      decision: read('decision', 500),
      dissent: read('dissent', 400),
      risks: list('risks'),
      nextMoves: list('nextMoves'),
      sceneHook: read('sceneHook', 400),
    }
    return result.decision || result.situation || positions.length > 0 ? result : null
  } catch {
    return null
  }
}

export async function requestFactionCouncil(input: {
  work: Work
  detail: WorkDetail
  faction: FactionCard
  topic: string
  api: ApiConfig
  onRecordUsage?: (entry: AiUsageEntry) => void
}): Promise<FactionCouncilResult> {
  const messages = buildFactionCouncilMessages(input)
  let usage: ChatUsage | undefined
  const result = await runApiTask(input.api, { task: 'analysis.plan', messages,
    temperature: 0.45,
    maxTokens: 2400,
    onUsage: (value) => {
      usage = value
    },
  })
  const parsed = parseFactionCouncil(result)
  if (!parsed) throw new Error('模型没有返回可解析的势力推演 JSON')
  if (input.onRecordUsage) {
    const inputText = messages.map((message) => message.content).join('\n')
    input.onRecordUsage({
      id: `usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      at: Date.now(),
      kind: '势力推演',
      profile: 'general',
      model: input.api.model,
      inputTokens: usage?.inputTokens ?? estimateTokens(inputText),
      outputTokens: usage?.outputTokens ?? estimateTokens(result),
      actual: Boolean(usage),
      cost: undefined,
    })
  }
  return parsed
}
