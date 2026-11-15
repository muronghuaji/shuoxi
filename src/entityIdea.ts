import type { ChatMessage } from './ai'
import type { EntityFillKind } from './ai'
import type { Work, WorkDetail } from './types'

export interface EntityIdeaAnalysis {
  understanding: string
  mustKeep: string[]
  avoid: string[]
  direction: string
}

export const ENTITY_KIND_LABELS: Record<EntityFillKind, string> = {
  character: '角色',
  faction: '势力',
  item: '物品',
  location: '地点',
  species: '物种',
}

export const ENTITY_IDEA_EXAMPLES: Record<EntityFillKind, string[]> = {
  character: [
    '一个表面温和、实际在利用主角的旧友',
    '一个不识字但记得所有死者名字的守墓人',
    '一个被宗门逐出、靠替人顶罪活着的剑修',
  ],
  faction: [
    '一个衰败但掌握旧城所有情报的商会',
    '一个只收留被逐出师门者的地下组织',
    '一个表面做慈善、实际买卖身份的公司',
  ],
  item: [
    '一把让持有者听见亡者声音的铜钥匙',
    '一封每次打开都会多出一行字的旧信',
    '一枚只能使用一次、会记住持有者名字的护符',
  ],
  location: [
    '一间只在雨夜出现的旧书店',
    '一座建在废弃矿井上的边贸城',
    '一条每天凌晨改名的巷子',
  ],
  species: [
    '一个靠记忆繁殖的深海族群',
    '一群把名字当作禁忌的雪原游猎者',
    '一种会把宿主梦境当作食物的微生物集合',
  ],
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(/[；;\n]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function jsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = cleaned.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  let end = -1
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  if (end <= start) return null
  const raw = cleaned.slice(start, end + 1)
  const attempts = [
    raw,
    raw.replace(/,\s*([}\]])/g, '$1'),
    raw.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"),
  ]
  for (const attempt of attempts) {
    try {
      const parsed: unknown = JSON.parse(attempt)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch {
      // 尝试下一种修复。
    }
  }
  return null
}

function markdownSection(text: string, keywords: string[]): string {
  const lines = text
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n+/)
    .map((line) => line.replace(/^#{1,6}\s*/, '').trim())
    .filter(Boolean)
  const index = lines.findIndex((line) => keywords.some((keyword) => line.includes(keyword)))
  if (index < 0) return ''
  return lines
    .slice(index, index + 6)
    .join('\n')
    .replace(new RegExp(`^.*?(?:${keywords.join('|')})[：:]\\s*`), '')
    .trim()
}

function fallbackAnalysis(text: string): EntityIdeaAnalysis | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json|markdown|md)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  if (!cleaned) return null
  const lines = cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^[-*#>\d.\s]+/, '').trim())
    .filter(Boolean)
  const understanding =
    markdownSection(cleaned, ['理解', '意图', '核心']) ||
    lines.find((line) => !/^[\[{]/.test(line))?.slice(0, 800) ||
    ''
  if (!understanding) return null
  return {
    understanding,
    mustKeep: lines
      .filter((line) => /必须|保留|不能改|核心点/.test(line))
      .slice(0, 8),
    avoid: lines.filter((line) => /避免|不要|容易写偏|冲突/.test(line)).slice(0, 8),
    direction: markdownSection(cleaned, ['设定落点', '方向', '建议']),
  }
}

function existingEntityNames(kind: EntityFillKind, detail: WorkDetail): string[] {
  if (kind === 'character') return detail.characters.map((item) => item.name)
  if (kind === 'faction') return detail.factions.map((item) => item.name)
  if (kind === 'location') return (detail.locations ?? []).map((item) => item.name)
  if (kind === 'item') return (detail.items ?? []).map((item) => item.name)
  return (detail.species ?? []).map((item) => item.name)
}

export function buildEntityIdeaAnalysisMessages(input: {
  kind: EntityFillKind
  work: Work
  detail: WorkDetail
  idea: string
}): ChatMessage[] {
  const label = ENTITY_KIND_LABELS[input.kind]
  const names = existingEntityNames(input.kind, input.detail).slice(0, 30)
  return [
    {
      role: 'system',
      content: [
        `你是中文小说设定策划，正在帮作者把「${label}」的想法落成具体设定。`,
        '只分析想法，不要直接生成完整实体，不要写正文。',
        '只输出一个合法 JSON 对象，不要 markdown、不要解释。',
        '必须尊重作者想法，同时指出怎样落进当前作品而不冲突。',
        '不要把用户的想法改成另一个想法。',
        '字段格式：{"understanding":"我理解你想要什么","mustKeep":["必须保留的点"],"avoid":["容易写偏或冲突的点"],"direction":"最合适的设定落点"}' ,
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】《${input.work.title}》｜${input.work.genres.join('、') || '未定题材'}｜${input.work.theme || '主题未定'}`,
        input.work.synopsis ? `【简介】${input.work.synopsis.slice(0, 600)}` : '',
        `【已有${label}】${names.length ? names.join('、') : '暂无'}`,
        input.detail.currentSummary ? `【当前剧情】${input.detail.currentSummary.slice(0, 700)}` : '',
        `【作者想法】${input.idea.trim()}`,
        `请分析这个${label}想法。`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

export function parseEntityIdeaAnalysis(text: string): EntityIdeaAnalysis | null {
  const value = jsonObject(text)
  if (value) {
    const understanding = stringValue(value.understanding)
    if (understanding) {
      return {
        understanding,
        mustKeep: stringList(value.mustKeep).slice(0, 8),
        avoid: stringList(value.avoid).slice(0, 8),
        direction: stringValue(value.direction),
      }
    }
  }
  return fallbackAnalysis(text)
}

export function buildEntityIdeaHint(input: {
  idea: string
  analysis: EntityIdeaAnalysis
  extra?: string
}): string {
  return [
    `作者原始想法：${input.idea.trim()}`,
    `AI 理解：${input.analysis.understanding}`,
    input.analysis.mustKeep.length
      ? `必须保留：${input.analysis.mustKeep.join('、')}`
      : '',
    input.analysis.avoid.length ? `避免写偏：${input.analysis.avoid.join('、')}` : '',
    input.analysis.direction ? `设定落点：${input.analysis.direction}` : '',
    input.extra ?? '',
    '生成时必须优先满足以上作者想法；不要改写成无关设定。',
  ]
    .filter(Boolean)
    .join('\n')
}
