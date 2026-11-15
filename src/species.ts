import type { WorkDetail, SpeciesCard } from './types'

export const SPECIES_CATEGORY_OPTIONS = [
  '动物',
  '神兽 / 妖兽',
  '精灵 / 妖精',
  '亡灵',
  '外星种族',
  'AI / 机械生命',
  '变异体',
  '恶魔 / 天使',
  '自定义',
]

export function emptySpecies(): SpeciesCard {
  return {
    id: `species-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    aliases: [],
    category: '',
    categoryId: undefined,
    tierLevel: undefined,
    tags: [],
    origin: '',
    habitat: '',
    appearance: '',
    physiology: '',
    lifespan: '',
    abilities: [],
    weaknesses: [],
    society: '',
    language: '',
    culture: '',
    relations: '',
    variants: [],
    notes: '',
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

export function normalizeSpecies(raw: unknown): SpeciesCard {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    id: text(value.id) || emptySpecies().id,
    name: text(value.name),
    aliases: list(value.aliases),
    category: text(value.category),
    categoryId: text(value.categoryId) || undefined,
    tierLevel:
      typeof value.tierLevel === 'number' && Number.isFinite(value.tierLevel) && value.tierLevel > 0
        ? Math.floor(value.tierLevel)
        : undefined,
    tags: list(value.tags),
    origin: text(value.origin),
    habitat: text(value.habitat),
    appearance: text(value.appearance),
    physiology: text(value.physiology),
    lifespan: text(value.lifespan),
    abilities: list(value.abilities),
    weaknesses: list(value.weaknesses),
    society: text(value.society),
    language: text(value.language),
    culture: text(value.culture),
    relations: text(value.relations),
    variants: list(value.variants),
    notes: text(value.notes),
  }
}

export function normalizeSpeciesList(raw: unknown): SpeciesCard[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeSpecies).filter((species) => species.name.trim())
}

export function speciesCompleteness(species: SpeciesCard): number {
  const fields = [
    species.name,
    species.category,
    species.origin,
    species.habitat,
    species.appearance,
    species.physiology,
    species.lifespan,
    species.abilities.length > 0 ? '1' : '',
    species.weaknesses.length > 0 ? '1' : '',
    species.society,
    species.language,
    species.culture,
    species.relations,
    species.variants.length > 0 ? '1' : '',
    species.notes,
  ]
  return Math.round((fields.filter((field) => field.trim()).length / fields.length) * 100)
}

export function speciesQuickLine(species: SpeciesCard): string {
  const parts = [
    species.category || '物种',
    species.habitat ? `栖息：${species.habitat}` : '',
    species.abilities.length ? `能力：${species.abilities.slice(0, 2).join('、')}` : '',
  ].filter(Boolean)
  return `${species.name || '未命名物种'}（${parts.join('｜')}）`
}

export function buildSpeciesPrompt(species: SpeciesCard): string {
  return [
    `物种：${species.name || '未命名'}`,
    species.category ? `大类：${species.category}` : '',
    species.tierLevel ? `阶位：第 ${species.tierLevel} 阶` : '',
    species.tags?.length ? `标签：${species.tags.join('、')}` : '',
    species.aliases.length ? `别名：${species.aliases.join('、')}` : '',
    species.origin ? `起源：${species.origin}` : '',
    species.habitat ? `栖息地：${species.habitat}` : '',
    species.appearance ? `外观：${species.appearance}` : '',
    species.physiology ? `生理：${species.physiology}` : '',
    species.lifespan ? `寿命：${species.lifespan}` : '',
    species.abilities.length ? `能力：${species.abilities.join('、')}` : '',
    species.weaknesses.length ? `弱点：${species.weaknesses.join('、')}` : '',
    species.society ? `社会结构：${species.society}` : '',
    species.language ? `语言：${species.language}` : '',
    species.culture ? `文化：${species.culture}` : '',
    species.relations ? `与其他种族关系：${species.relations}` : '',
    species.variants.length ? `亚种 / 变体：${species.variants.join('、')}` : '',
    species.notes ? `写作注意：${species.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function speciesNameById(detail: WorkDetail, id: string | undefined): string {
  if (!id) return ''
  return detail.species?.find((species) => species.id === id)?.name ?? ''
}
