import type { SkillDefinition, SkillToolName } from './skills'
import { normalizeSkill } from './skills'
import { createZip, unzip, type ZipEntry } from './zip'

const MAX_TOTAL_TEXT = 2 * 1024 * 1024
const MAX_INSTRUCTIONS = 24000
const MAX_RESOURCES = 8
const MAX_RESOURCE_CHARS = 12000
const ALLOWED_CATEGORIES = new Set(['检查', '润色', '结构', '自定义'])
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.json'])
const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.js',
  '.mjs',
  '.cjs',
  '.ps1',
  '.bat',
  '.cmd',
  '.sh',
  '.com',
  '.scr',
  '.msi',
  '.vbs',
  '.jar',
  '.py',
])

interface ParsedMarkdown {
  meta: Record<string, unknown>
  body: string
}

function safeName(value: string, fallback: string): string {
  const cleaned = value
    .replace(/\\/g, '/')
    .replace(/[?#]/g, '')
    .trim()
  if (!cleaned || cleaned.startsWith('/') || cleaned.split('/').includes('..')) return fallback
  return cleaned
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'skill'
  )
}

function parseList(value: string): string[] {
  return value
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((item) => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
}

function parseFrontmatter(raw: string): ParsedMarkdown {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '')
  const lines = normalized.split('\n')
  if (lines[0]?.trim() !== '---') return { meta: {}, body: normalized.trim() }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end < 0) return { meta: {}, body: normalized.trim() }
  const meta: Record<string, unknown> = {}
  let currentKey = ''
  let listValue: string[] | null = null
  const flushList = () => {
    if (currentKey && listValue) meta[currentKey] = listValue
  }
  for (const line of lines.slice(1, end)) {
    const listMatch = line.match(/^\s*-\s+(.+)$/)
    if (listMatch && currentKey) {
      if (!listValue) listValue = []
      listValue.push(listMatch[1].trim().replace(/^["']|["']$/g, ''))
      continue
    }
    flushList()
    listValue = null
    const match = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (!match) {
      currentKey = ''
      continue
    }
    currentKey = match[1]
    const value = match[2].trim()
    if (!value) {
      meta[currentKey] = ''
    } else if (value.startsWith('[') && value.endsWith(']')) {
      meta[currentKey] = parseList(value)
    } else {
      meta[currentKey] = value.replace(/^["']|["']$/g, '')
    }
  }
  flushList()
  return { meta, body: lines.slice(end + 1).join('\n').trim() }
}

function metaText(meta: Record<string, unknown>, key: string): string {
  const value = meta[key]
  return typeof value === 'string' ? value.trim() : ''
}

function metaTools(meta: Record<string, unknown>): SkillToolName[] {
  const value = meta.tools
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item).trim())
    .filter((item): item is SkillToolName =>
      ['chapter', 'selection', 'characters', 'story_state', 'recent_chapters', 'stats'].includes(item),
    )
}

export function parseSkillMarkdown(
  raw: string,
  fallbackName = '未命名技能',
  resources: { name: string; text: string }[] = [],
): SkillDefinition {
  const { meta, body } = parseFrontmatter(raw)
  if (!body.trim()) throw new Error('SKILL.md 没有正文说明')
  const name = metaText(meta, 'name') || fallbackName.replace(/\.(md|markdown)$/i, '') || '未命名技能'
  const description =
    metaText(meta, 'description') ||
    body
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 120) ||
    ''
  const category = ALLOWED_CATEGORIES.has(metaText(meta, 'category'))
    ? (metaText(meta, 'category') as SkillDefinition['category'])
    : '自定义'
  const parsed = normalizeSkill({
    id: `custom.${slug(name)}`,
    name,
    description,
    category,
    output: metaText(meta, 'output') === 'rewrite' ? 'rewrite' : 'advice',
    profile: metaText(meta, 'profile') === 'general' ? 'general' : 'writing',
    instructions: body.slice(0, MAX_INSTRUCTIONS),
    tools: metaTools(meta),
    resources: resources.slice(0, MAX_RESOURCES),
    version: Number(meta.version) || 1,
    builtin: false,
  })
  if (!parsed) throw new Error('技能内容无效')
  return parsed
}

function decodeText(data: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(data)
}

function resourceText(name: string, data: Uint8Array): { name: string; text: string } | null {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (!TEXT_EXTENSIONS.has(ext)) return null
  return { name, text: decodeText(data).slice(0, MAX_RESOURCE_CHARS) }
}

export async function parseSkillPackageZip(buffer: ArrayBuffer): Promise<SkillDefinition[]> {
  const entries = await unzip(new Uint8Array(buffer))
  const normalizedNames = entries.map((entry) => safeName(entry.name, ''))
  const blocked = normalizedNames.find((name) => {
    const dot = name.lastIndexOf('.')
    return dot >= 0 && BLOCKED_EXTENSIONS.has(name.slice(dot).toLowerCase())
  })
  if (blocked) throw new Error(`技能包包含可执行文件，已拒绝：${blocked}`)

  const total = entries.reduce((sum, entry) => sum + entry.data.length, 0)
  if (total > MAX_TOTAL_TEXT) throw new Error('技能包文本过大，请控制在 2MB 以内')

  const skillFiles = entries.filter((_, index) =>
    /(^|\/)SKILL\.md$/i.test(normalizedNames[index]),
  )
  if (skillFiles.length === 0) throw new Error('技能包缺少 SKILL.md')

  const result: SkillDefinition[] = []
  for (const skillFile of skillFiles) {
    const fileName = safeName(skillFile.name, '')
    const prefix = fileName.slice(0, Math.max(0, fileName.lastIndexOf('/') + 1))
    const resources: { name: string; text: string }[] = []
    for (let index = 0; index < entries.length && resources.length < MAX_RESOURCES; index += 1) {
      const name = normalizedNames[index]
      if (!name.startsWith(prefix) || name === fileName) continue
      if (!/(^|\/)(references|assets|examples)\//i.test(name)) continue
      const resource = resourceText(name.slice(prefix.length), entries[index].data)
      if (resource) resources.push(resource)
    }
    const fallbackName = prefix.split('/').filter(Boolean).at(-1) || '未命名技能'
    result.push(parseSkillMarkdown(decodeText(skillFile.data), fallbackName, resources))
  }
  return result
}

export async function importSkillPackageFile(file: File): Promise<SkillDefinition[]> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.zip')) return parseSkillPackageZip(await file.arrayBuffer())
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return [parseSkillMarkdown(await file.text(), file.name.replace(/\.(md|markdown)$/i, ''))]
  }
  throw new Error('只支持 .md 或 .zip 技能包')
}

function yamlValue(value: string): string {
  return /[:#\[\]{}]/.test(value) ? JSON.stringify(value) : value
}

export function buildSkillMarkdown(skill: SkillDefinition): string {
  const lines = [
    '---',
    `name: ${yamlValue(skill.name)}`,
    `description: ${yamlValue(skill.description)}`,
    `category: ${skill.category}`,
    `output: ${skill.output}`,
    `profile: ${skill.profile}`,
    `tools: [${skill.tools.join(', ')}]`,
    `version: ${skill.version}`,
    '---',
    '',
    skill.instructions,
  ]
  return lines.join('\n')
}

export function buildSkillZip(skill: SkillDefinition): Uint8Array {
  const folder = slug(skill.name)
  const entries: ZipEntry[] = [
    {
      name: `${folder}/SKILL.md`,
      data: new TextEncoder().encode(buildSkillMarkdown(skill)),
    },
  ]
  ;(skill.resources ?? []).slice(0, MAX_RESOURCES).forEach((resource, index) => {
    const base = resource.name.split('/').pop() || `reference-${index + 1}.md`
    entries.push({
      name: `${folder}/references/${String(index + 1).padStart(2, '0')}-${safeName(
        base,
        `reference-${index + 1}.md`,
      )}`,
      data: new TextEncoder().encode(resource.text),
    })
  })
  return createZip(entries)
}
