import type {
  Chapter,
  ModuleDefinition,
  ModuleField,
  ModuleRecord,
  Work,
  WorkDetail,
} from './types'
import type { ChatMessage } from './ai'

function clip(text: string, limit: number): string {
  const value = text.trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

export interface ModuleAiFillInput {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  module: ModuleDefinition
  fields: ModuleField[]
  records: ModuleRecord[]
  record: ModuleRecord
}

export function buildModuleFillMessages(input: ModuleAiFillInput): ChatMessage[] {
  const { work, detail, chapters, module, fields, records, record } = input
  const fieldSchema = fields
    .filter((field) => ['text', 'textarea', 'number', 'select'].includes(field.type))
    .map(
      (field) =>
        `- ${field.id}｜${field.label}｜${field.type}${field.options?.length ? `｜可选：${field.options.join(' / ')}` : ''}`,
    )
    .join('\n')
  const existing = fields
    .map((field) => (record.fields[field.id] ? `${field.label}：${record.fields[field.id]}` : ''))
    .filter(Boolean)
    .join('\n')
  const otherRecords = records
    .filter((item) => item.id !== record.id)
    .slice(0, 20)
    .map(
      (item) =>
        `- ${item.title || '未命名'}｜${item.status}${item.summary ? `｜${clip(item.summary, 120)}` : ''}`,
    )
    .join('\n')
  return [
    {
      role: 'system',
      content: [
        '你是小说设定模块的资料补全助手。',
        '只输出一个 JSON 对象，不要 markdown、不要解释。格式：{"fields":{"fieldId":"值"}}。',
        '只补全字段表中允许的字段 id，不要发明字段 id。',
        '根据作品、模块上下文和当前记录，补全符合设定逻辑的内容；无法确定的字段留空或写“待补充”。',
        '不要修改已有内容，不要写正文，不要发明与作品冲突的关键事实。',
        '每个值尽量简短，textarea 类字段最多 160 字。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】《${work.title}》｜${work.genres.join('、') || '未设置题材'}｜${work.theme || '主题未定'}`,
        work.synopsis ? `【简介】${clip(work.synopsis, 300)}` : '',
        detail.worldview ? `【世界观】${clip(detail.worldview, 700)}` : '',
        `【模块】${module.name}：${module.description}`,
        `【模块规则】${module.aiHint}`,
        `【可用字段】\n${fieldSchema}`,
        `【当前记录】${record.title || '未命名'}｜${record.status}`,
        `【已有内容】\n${existing || '（空）'}`,
        `【同模块其他记录】\n${otherRecords || '（无）'}`,
        `【章节列表】\n${chapters
          .slice(0, 40)
          .map((chapter) => chapter.title || '未命名章节')
          .join('、') || '（无）'}`,
        '请补全当前记录字段，输出 JSON。',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

export interface ModuleAiFillResult {
  fields: Record<string, string>
}

export function parseModuleFillResult(
  text: string,
  allowedFieldIds: string[],
): ModuleAiFillResult | null {
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
    const fieldsRaw =
      raw.fields && typeof raw.fields === 'object'
        ? (raw.fields as Record<string, unknown>)
        : {}
    const allowed = new Set(allowedFieldIds)
    const fields: Record<string, string> = {}
    for (const [id, value] of Object.entries(fieldsRaw)) {
      if (!allowed.has(id) || typeof value !== 'string') continue
      const trimmed = value.trim()
      if (trimmed) fields[id] = trimmed.slice(0, 600)
    }
    return Object.keys(fields).length ? { fields } : null
  } catch {
    return null
  }
}

export interface ModuleAuditIssue {
  title: string
  issue: string
  suggestion: string
}

export function buildModuleAuditMessages(input: ModuleAiFillInput): ChatMessage[] {
  const { work, detail, module, fields, records } = input
  const fieldLabels = new Map(fields.map((field) => [field.id, field.label]))
  const recordLines = records
    .slice(0, 40)
    .map((record) => {
      const values = Object.entries(record.fields)
        .filter(([id, value]) => value && fieldLabels.has(id))
        .map(([id, value]) => `${fieldLabels.get(id)}：${clip(value, 180)}`)
        .join('；')
      return `- ${record.title || '未命名'}｜${record.status}${record.summary ? `｜${clip(record.summary, 180)}` : ''}${values ? `｜${values}` : ''}`
    })
    .join('\n')
  return [
    {
      role: 'system',
      content: [
        '你是小说设定模块的一致性检查助手。',
        '只输出一个 JSON 对象，不要 markdown、不要解释。格式：{"issues":[{"title":"记录名","issue":"问题","suggestion":"建议"}]}。',
        '检查模块内部矛盾、缺失关键信息、状态冲突和与作品设定冲突的地方。',
        '最多 6 条；没有问题就返回空数组；不要编造作品中没有的设定。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】《${work.title}》`,
        detail.worldview ? `【世界观】${clip(detail.worldview, 600)}` : '',
        `【模块】${module.name}：${module.description}`,
        `【模块规则】${module.aiHint}`,
        `【记录】\n${recordLines || '（无）'}`,
        '请检查这个模块，输出问题 JSON。',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

export function parseModuleAuditResult(text: string): ModuleAuditIssue[] | null {  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const raw = JSON.parse(cleaned.slice(start, end + 1)) as { issues?: unknown }
    if (!Array.isArray(raw.issues)) return null
    return raw.issues
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const value = item as Record<string, unknown>
        const title = typeof value.title === 'string' ? value.title.trim().slice(0, 80) : ''
        const issue = typeof value.issue === 'string' ? value.issue.trim().slice(0, 300) : ''
        const suggestion =
          typeof value.suggestion === 'string' ? value.suggestion.trim().slice(0, 300) : ''
        if (!issue) return null
        return { title: title || '模块记录', issue, suggestion }
      })
      .filter((item): item is ModuleAuditIssue => item !== null)
      .slice(0, 6)
  } catch {
    return null
  }
}

export interface ModuleGenerateInput {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  module: ModuleDefinition
  fields: ModuleField[]
  records: ModuleRecord[]
  count: number
  request: string
}

export function buildModuleGenerateMessages(input: ModuleGenerateInput): ChatMessage[] {
  const { work, detail, chapters, module, fields, records, count, request } = input
  const fieldSchema = fields
    .filter((field) => ['text', 'textarea', 'number', 'select'].includes(field.type))
    .map(
      (field) =>
        `- ${field.id}：${field.label}（${field.type}${field.options?.length ? `，可选：${field.options.join(' / ')}` : ''}）`,
    )
    .join('\n')
  const existing = records
    .slice(0, 24)
    .map(
      (record) =>
        `- ${record.title || '未命名'}｜${record.status}${record.summary ? `｜${clip(record.summary, 100)}` : ''}`,
    )
    .join('\n')
  const fieldLabels = fields.map((field) => `${field.id}=${field.label}`).join('、')
  return [
    {
      role: 'system',
      content: [
        '你是小说设定模块的资料生成助手。',
        '只输出一个 JSON 对象，不要 Markdown、不要解释。格式：',
        '{"records":[{"title":"记录名","status":"状态","summary":"一句话摘要","fields":{"fieldId":"值"}}]}',
        '只能使用字段表中的字段 id；不要发明字段 id；不要写正文。',
        '记录之间要互补，不要重复已有记录，不要与作品设定冲突。',
        '每个 textarea 字段尽量 80–220 字，其余字段简洁。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【作品】《${work.title}》｜${work.genres.join('、') || '未设置题材'}｜${work.theme || '主题未定'}`,
        work.synopsis ? `【简介】${clip(work.synopsis, 400)}` : '',
        detail.worldview ? `【世界观】${clip(detail.worldview, 1000)}` : '',
        `【模块】${module.name}：${module.description}`,
        `【模块规则】${module.aiHint}`,
        `【状态】${(module.statuses ?? ['未定']).join(' / ')}`,
        `【字段表】\n${fieldSchema}\n字段对照：${fieldLabels}`,
        `【已有记录】\n${existing || '（无）'}`,
        `【章节】\n${chapters.slice(0, 40).map((chapter) => chapter.title || '未命名章节').join('、') || '（无）'}`,
        `【生成数量】${Math.max(1, Math.min(12, count))} 条`,
        `【作者要求】${request.trim() || '根据作品自动生成有价值的设定条目。'}`,
        '请生成记录 JSON。',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]
}

export function parseModuleGenerateResult(
  text: string,
  module: ModuleDefinition,
  fields: ModuleField[],
  count: number,
): ModuleRecord[] | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const allowed = new Set(fields.map((field) => field.id))
  const statuses = module.statuses ?? ['未定']
  const now = new Date().toISOString()
  const normalize = (item: unknown): ModuleRecord | null => {
    if (!item || typeof item !== 'object') return null
    const value = item as Record<string, unknown>
    const title = typeof value.title === 'string' ? value.title.trim().slice(0, 120) : ''
    if (!title) return null
    const summary =
      typeof value.summary === 'string' ? value.summary.trim().slice(0, 400) : ''
    const status =
      typeof value.status === 'string' && statuses.includes(value.status)
        ? value.status
        : statuses[0]
    const fieldsRaw =
      value.fields && typeof value.fields === 'object'
        ? (value.fields as Record<string, unknown>)
        : {}
    const nextFields: Record<string, string> = {}
    for (const field of fields) nextFields[field.id] = ''
    for (const [id, fieldValue] of Object.entries(fieldsRaw)) {
      if (!allowed.has(id) || typeof fieldValue !== 'string') continue
      nextFields[id] = fieldValue.trim().slice(0, 800)
    }
    return {
      id: `record-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      summary,
      status,
      fields: nextFields,
      createdAt: now,
      updatedAt: now,
    }
  }
  const finish = (items: unknown[]): ModuleRecord[] | null => {
    const records = items
      .map(normalize)
      .filter((record): record is ModuleRecord => record !== null)
      .slice(0, Math.max(1, Math.min(12, count)))
    return records.length ? records : null
  }

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const raw = JSON.parse(cleaned.slice(start, end + 1)) as { records?: unknown }
      if (Array.isArray(raw.records)) return finish(raw.records)
    } catch {
      // JSON 可能被截断；继续尝试从文本中抢救完整记录对象。
    }
  }

  // 模型输出被截断时，逐个解析 records 数组里已经闭合的对象。
  const recordsKey = cleaned.indexOf('"records"')
  const arrayStart = recordsKey >= 0 ? cleaned.indexOf('[', recordsKey) : -1
  if (arrayStart < 0) return null
  const items: unknown[] = []
  let depth = 0
  let inString = false
  let escaped = false
  let objectStart = -1
  for (let index = arrayStart + 1; index < cleaned.length; index += 1) {
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
    if (char === '{') {
      if (depth === 0) objectStart = index
      depth += 1
      continue
    }
    if (char === '}') {
      depth -= 1
      if (depth === 0 && objectStart >= 0) {
        try {
          items.push(JSON.parse(cleaned.slice(objectStart, index + 1)))
        } catch {
          // 单个对象不完整，跳过。
        }
        objectStart = -1
      }
      continue
    }
    if (char === ']' && depth === 0) break
  }
  return finish(items)
}
