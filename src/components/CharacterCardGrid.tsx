import { useEffect, useState } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  Chapter,
  CharacterCard,
  Work,
  WorkDetail,
  WorldTemplate,
} from '../types'
import { describeItem } from '../itemDisplay'
import { prepareImage } from '../imageAssets'
import { ImagePickerButton } from './ImagePickerButton'
import { requestEntityGenerate } from '../entityFill'
import { completeEntityArchive } from '../entityArchive'
import { normalizeCharacterProfile, emptyCharacterProfile, profileCompleteness } from '../characterProfile'
import { copyTextToClipboard } from '../clipboard'
import { inventoryQuantity } from '../inventory'
import { requestLinkedItems } from '../linkedItems'
import { useLinkedGenerationSettings } from '../linkedGeneration'
import { IconBackpack, IconPlus, IconSparkles, IconTrash } from './Icons'
import { Modal } from './Modal'
import { InventoryModal } from './InventoryModal'
import { ItemCardSections } from './ItemCardSections'
import { CharacterProfileEditor } from './CharacterProfileEditor'
import { CharacterExperienceEditor } from './CharacterExperienceEditor'
import { LifecycleBadge, LifecycleTags } from './LifecycleTags'
import { EntityIdeaModal } from './EntityIdeaModal'
import { RealmSettingsModal } from './RealmSettingsModal'
import { useContextMenu, type ContextMenuEntry } from './ContextMenuProvider'
import { ConfirmModal } from './ConfirmModal'
import { BatchActionBar } from './BatchActionBar'
import { useBatchSelection } from '../hooks/useBatchSelection'
import { batchExportEntities } from '../batchExport'
import type { ArchiveJob } from '../archiveQueue'
import {
  appendRealmHistory,
  characterRealmScheme,
  ensureRealmData,
  schemeById,
} from '../tiers'

interface CharacterCardGridProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  worldTemplate: WorldTemplate
  api: ApiConfig
  apiReady: boolean
  onRecordUsage?: (entry: AiUsageEntry) => void
  onToast: (message: string) => void
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onOpenTab?: (tab: 'relations' | 'species' | 'factions') => void
  focusRequest?: { id: string; requestId: number } | null
  archiveJobs?: ArchiveJob[]
  onQueueFactionArchive?: (factionId: string) => void
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function appearanceOf(name: string, chapters: Chapter[]): { count: number; first: number } {
  const keyword = name.trim()
  if (!keyword) return { count: 0, first: 0 }
  let count = 0
  let first = 0
  chapters.forEach((chapter, index) => {
    if (chapter.content.includes(keyword)) {
      count += 1
      if (!first) first = index + 1
    }
  })
  return { count, first }
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  placeholder?: string
}) {
  return (
    <label className={`record-field ${multiline ? 'record-field-wide' : ''}`}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          className="input drawer-textarea"
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className="input drawer-input"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  )
}

export function CharacterCardGrid({
  work,
  detail,
  chapters,
  worldTemplate,
  api,
  apiReady,
  onRecordUsage,
  onToast,
  onUpdateDetail,
  onOpenTab,
  focusRequest,
  archiveJobs = [],
  onQueueFactionArchive,
}: CharacterCardGridProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [fillingArchive, setFillingArchive] = useState(false)
  const [archivePendingOnly, setArchivePendingOnly] = useState(false)
  const [characterQuery, setCharacterQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [ideaOpen, setIdeaOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CharacterCard | null>(null)
  const [realmOpen, setRealmOpen] = useState(false)
  const [inventoryCharacterId, setInventoryCharacterId] = useState<string | null>(null)
  const { openContextMenu } = useContextMenu()
  const [recordView, setRecordView] = useState<'basic' | 'profile' | 'history'>('basic')
  const linkedGeneration = useLinkedGenerationSettings()
  const selected = detail.characters.find((character) => character.id === selectedId) ?? null
  const selection = useBatchSelection({
    allIds: detail.characters.map((character) => character.id),
    onDelete: (ids) => {
      const idsSet = new Set(ids)
      onUpdateDetail({
        characters: detail.characters.filter((character) => !idsSet.has(character.id)),
        relationships: detail.relationships.filter(
          (relationship) =>
            !idsSet.has(relationship.fromId) && !idsSet.has(relationship.toId),
        ),
      })
      if (selectedId && idsSet.has(selectedId)) setSelectedId(null)
      onToast(`已删除 ${ids.length} 个角色`)
    },
    onExport: (ids, format) => {
      const entityIds = new Set(ids)
      batchExportEntities(
        'character',
        work.title,
        detail.characters.filter((character) => entityIds.has(character.id)) as unknown as Record<string, unknown>[],
        format,
      )
      onToast(`已导出 ${ids.length} 个角色`)
    },
  })

  useEffect(() => {
    if (!focusRequest?.id) return
    if (!detail.characters.some((character) => character.id === focusRequest.id)) return
    setSelectedId(focusRequest.id)
    setRecordView('profile')
  }, [focusRequest, detail.characters])

  useEffect(() => {
    const patch = ensureRealmData(detail, worldTemplate.id)
    if (patch) onUpdateDetail(patch)
  }, [detail, onUpdateDetail, worldTemplate.id])

  useEffect(() => {
    setRecordView('basic')
  }, [selectedId])
  const terms = worldTemplate.terms
  const features = worldTemplate.features

  const pendingArchive = detail.characters.filter(
    (character) =>
      character.archiveStatus === 'placeholder' ||
      profileCompleteness(normalizeCharacterProfile(character.profile)).score < 20,
  )
  const normalizedQuery = characterQuery.trim().toLowerCase()
  const isMainCharacter = (character: CharacterCard) => {
    const profile = normalizeCharacterProfile(character.profile)
    return (
      profile.meta.pov ||
      profile.meta.importance === 'core' ||
      /主角|男主|女主|核心/.test(character.role || '')
    )
  }
  const importanceRank: Record<string, number> = { core: 0, major: 1, minor: 2, extra: 3 }
  const roleRank = (character: CharacterCard) => {
    const role = character.role || ''
    if (/主角|男主|女主|核心/.test(role)) return 0
    if (/配角|关键/.test(role)) return 1
    if (/反派|对手/.test(role)) return 2
    return 3
  }
  const sortCharacters = (a: CharacterCard, b: CharacterCard) =>
    (importanceRank[normalizeCharacterProfile(a.profile).meta.importance] ?? 4) -
      (importanceRank[normalizeCharacterProfile(b.profile).meta.importance] ?? 4) ||
    roleRank(a) - roleRank(b) ||
    (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN')
  const unattachedLabel = /修仙|武侠|江湖|玄幻|仙侠/.test(worldTemplate.name)
    ? '散人'
    : `未加入${terms.faction}`
  const allCharacters = archivePendingOnly ? pendingArchive : detail.characters
  const mainCount = detail.characters.filter(isMainCharacter).length
  const factionCounts = new Map(detail.factions.map((faction) => [faction.id, 0]))
  let independentCount = 0
  for (const character of detail.characters) {
    if (character.sectId && factionCounts.has(character.sectId)) {
      factionCounts.set(character.sectId, (factionCounts.get(character.sectId) ?? 0) + 1)
    } else {
      independentCount += 1
    }
  }
  const categories = [
    { id: 'all', label: '全部人物', count: detail.characters.length },
    { id: 'main', label: '主要角色', count: mainCount },
    ...detail.factions.map((faction) => ({
      id: `faction:${faction.id}`,
      label: faction.name || `未命名${terms.faction}`,
      count: factionCounts.get(faction.id) ?? 0,
    })),
    { id: 'independent', label: unattachedLabel, count: independentCount },
  ]
  const activeCategory = categories.some((category) => category.id === selectedCategory)
    ? selectedCategory
    : 'all'
  const categoryCharacters = allCharacters.filter((character) => {
    if (activeCategory === 'all') return true
    if (activeCategory === 'main') return isMainCharacter(character)
    if (activeCategory === 'independent') {
      return !character.sectId || !factionCounts.has(character.sectId)
    }
    if (activeCategory.startsWith('faction:')) {
      return character.sectId === activeCategory.slice('faction:'.length)
    }
    return true
  })
  const visibleCharacters = categoryCharacters
    .filter((character) => {
      if (!normalizedQuery) return true
      const faction = detail.factions.find((item) => item.id === character.sectId)?.name ?? ''
      return `${character.name} ${character.role} ${character.identity} ${character.personality} ${faction}`
        .toLowerCase()
        .includes(normalizedQuery)
    })
    .slice()
    .sort(sortCharacters)
  const activeCategoryLabel =
    categories.find((category) => category.id === activeCategory)?.label ?? '全部人物'
  const activeFactionId = activeCategory.startsWith('faction:')
    ? activeCategory.slice('faction:'.length)
    : ''
  const activeFaction = detail.factions.find((faction) => faction.id === activeFactionId) ?? null
  const activeFactionCharacters = activeFaction
    ? detail.characters.filter((character) => character.sectId === activeFaction.id)
    : []
  const activeFactionNames = new Set(activeFactionCharacters.map((character) => character.name))
  const activeFactionJobs = activeFaction
    ? archiveJobs.filter(
        (job) => job.kind === 'character' && activeFactionNames.has(job.name),
      )
    : []
  const activeFactionPending = activeFactionJobs.filter(
    (job) => job.status === 'queued' || job.status === 'running',
  ).length
  const activeFactionDone = activeFactionJobs.filter((job) => job.status === 'done').length

  const updateCharacter = (id: string, patch: Partial<CharacterCard>) => {
    const current = detail.characters.find((character) => character.id === id)
    const nextPatch: Partial<WorkDetail> = {
      characters: detail.characters.map((character) =>
        character.id === id ? { ...character, ...patch } : character,
      ),
    }
    const realmChanged =
      current &&
      ((patch.realmSchemeId !== undefined && patch.realmSchemeId !== current.realmSchemeId) ||
        (patch.realmLevel !== undefined && patch.realmLevel !== current.realmLevel) ||
        (patch.realmSublevel !== undefined && patch.realmSublevel !== current.realmSublevel))
    if (current && realmChanged) {
      const schemeId = patch.realmSchemeId ?? current.realmSchemeId ?? detail.activeRealmSchemeId
      const level = patch.realmLevel ?? current.realmLevel ?? 0
      const scheme = schemeById(detail.realmSchemes, schemeId)
      const levelEntry = scheme?.levels[level - 1]
      if (scheme && levelEntry && level > 0) {
        const sublevel = patch.realmSublevel ?? current.realmSublevel
        const sublevelName = sublevel ? levelEntry.sublevels?.[sublevel - 1] : undefined
        nextPatch.realmHistory = appendRealmHistory(detail, {
          characterId: current.id,
          characterName: current.name,
          schemeId: scheme.id,
          schemeName: scheme.name,
          level,
          levelName: levelEntry.name,
          sublevel: sublevelName ? sublevel : undefined,
          sublevelName,
        })
      }
    }
    onUpdateDetail(nextPatch)
  }

  const setCustomValue = (character: CharacterCard, fieldId: string, value: string) => {
    updateCharacter(character.id, {
      attributes: { ...(character.attributes ?? {}), [fieldId]: value },
    })
  }

  const addCharacter = () => {
    const id = createId('c')
    onUpdateDetail({
      characters: [
        ...detail.characters,
        {
          id,
          name: '',
          role: '配角',
          identity: '',
          personality: '',
          goal: '',
          sectId: '',
          speciesId: '',
          position: '',
          cultivation: '',
          techniques: [],
          weapons: [],
          treasures: [],
          currency: '',
          spiritRoot: '',
          appearance: '',
          background: '',
          status: '',
        },
      ],
    })
    setSelectedId(id)
  }

  const removeCharacter = (id: string) => {
    onUpdateDetail({
      characters: detail.characters.filter((character) => character.id !== id),
      relationships: detail.relationships.filter(
        (relationship) => relationship.fromId !== id && relationship.toId !== id,
      ),
    })
    setSelectedId(null)
  }

  const fillCharacterArchive = async () => {
    if (!selected || !apiReady || fillingArchive) {
      if (!apiReady) onToast('请先配置 AI 模型和 API Key')
      return
    }
    setFillingArchive(true)
    try {
      const generated = await completeEntityArchive({
        kind: 'character',
        work,
        detail,
        entity: selected,
        api,
        onRecordUsage,
      })
      const patch = generated as Partial<CharacterCard>
      if (!patch.profile) {
        onToast('模型没有返回可用的深度档案')
        return
      }
      if (
        JSON.stringify(normalizeCharacterProfile(selected.profile)) ===
        JSON.stringify(patch.profile)
      ) {
        onToast('AI 没有返回新的档案字段，请换一个模型或稍后重试')
        return
      }
      updateCharacter(selected.id, patch)
      setRecordView('profile')
      onToast('已补全角色深度档案，原有字段未被覆盖')
    } catch (caught) {
      onToast(`深度档案补全失败：${caught instanceof Error ? caught.message : '请稍后重试'}`)
    } finally {
      setFillingArchive(false)
    }
  }

  const generateCharacter = async (hint?: string): Promise<boolean> => {    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return false
    }
    setGenerating(true)
    try {
      const generated = await requestEntityGenerate({
        kind: 'character',
        work,
        detail,
        hint,
        api,
        onRecordUsage,
      })
      const baseName =
        typeof generated.name === 'string' && generated.name.trim()
          ? generated.name.trim()
          : '新角色'
      const existingNames = detail.characters.map((character) => character.name)
      let name = baseName
      let suffix = 2
      while (existingNames.includes(name)) {
        name = `${baseName} ${suffix}`
        suffix += 1
      }
      const stringValue = (key: string, fallback = '') =>
        typeof generated[key] === 'string' ? String(generated[key]).trim() : fallback
      const listValue = (key: string): string[] =>
        Array.isArray(generated[key])
          ? generated[key].map((item) => String(item).trim()).filter(Boolean)
          : []
      const factionName = stringValue('sectName')
      const faction = detail.factions.find((item) => item.name === factionName)
      const character: CharacterCard = {
        id: createId('c'),
        name,
        role: stringValue('role', '配角'),
        identity: stringValue('identity'),
        personality: stringValue('personality'),
        goal: stringValue('goal'),
        sectId: faction?.id,
        position: stringValue('position'),
        cultivation: stringValue('cultivation'),
        spiritRoot: stringValue('spiritRoot'),
        physique: stringValue('physique'),
        talent: stringValue('talent'),
        techniques: listValue('techniques'),
        weapons: listValue('weapons'),
        treasures: listValue('treasures'),
        currency: stringValue('currency'),
        appearance: stringValue('appearance'),
        background: stringValue('background'),
        status: '正常',
        profile: normalizeCharacterProfile(generated.profile),
      }
      let finalCharacters = [...detail.characters, character]
      let linkedItemCount = 0
      const carriedNames = [...new Set([...(character.weapons ?? []), ...(character.treasures ?? [])])]
      if (linkedGeneration.autoCreateLinkedItems && carriedNames.length > 0) {
        try {
          const linked = await requestLinkedItems({
            work,
            detail: { ...detail, characters: finalCharacters },
            owners: [
              {
                type: 'character',
                id: character.id,
                name: character.name,
                itemNames: carriedNames,
              },
            ],
            api,
            onRecordUsage,
          })
          if (linked) {
            finalCharacters = linked.characters
            linkedItemCount = Math.max(0, linked.items.length - (detail.items ?? []).length)
            onUpdateDetail({
              characters: finalCharacters,
              items: linked.items,
              itemCategories: linked.categories,
            })
          }
        } catch {
          // 角色已经生成，物品补全失败不阻塞主流程。
        }
      }
      if (linkedItemCount === 0) onUpdateDetail({ characters: finalCharacters })
      setSelectedId(character.id)
      onToast(
        linkedItemCount > 0
          ? `AI 已生成角色「${name}」，并补全 ${linkedItemCount} 件物品到物品页`
          : `AI 已生成角色和深度档案：${name}`,
      )
      return true
    } catch (caught) {
      onToast(`角色生成失败：${caught instanceof Error ? caught.message : '请稍后重试'}`)
      return false
    } finally {
      setGenerating(false)
    }
  }

  const completeCharacterItems = async (character: CharacterCard): Promise<void> => {
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return
    }
    const itemNames = [
      ...new Set([...(character.weapons ?? []), ...(character.treasures ?? [])].filter(Boolean)),
    ]
    if (itemNames.length === 0) {
      onToast('先在角色档案里填写武器 / 法宝名称，再补全物品')
      return
    }
    setGenerating(true)
    try {
      const linked = await requestLinkedItems({
        work,
        detail,
        owners: [
          {
            type: 'character',
            id: character.id,
            name: character.name,
            itemNames,
          },
        ],
        api,
        onRecordUsage,
      })
      if (!linked) {
        onToast('没有需要补全的物品')
        return
      }
      onUpdateDetail({
        characters: linked.characters,
        items: linked.items,
        itemCategories: linked.categories,
      })
      const count = Math.max(0, linked.items.length - (detail.items ?? []).length)
      onToast(count > 0 ? `已补全 ${count} 件物品到物品页` : '物品已经存在')
    } catch (caught) {
      onToast(`补全物品失败：${caught instanceof Error ? caught.message : '请稍后重试'}`)
    } finally {
      setGenerating(false)
    }
  }

  const sectName = (sectId?: string) =>
    detail.factions.find((faction) => faction.id === sectId)?.name ?? `未加入${terms.faction}`
  const speciesName = (speciesId?: string) =>
    detail.species?.find((species) => species.id === speciesId)?.name ?? ''
  const realmOf = (character: CharacterCard) => {
    const scheme = characterRealmScheme(detail, character.realmSchemeId)
    const level = character.realmLevel ? scheme?.levels[character.realmLevel - 1] : undefined
    const sublevel =
      character.realmSublevel && level ? level.sublevels?.[character.realmSublevel - 1] : undefined
    return { scheme, level, sublevel }
  }
  const realmLabel = (character: CharacterCard) => {
    const { level, sublevel } = realmOf(character)
    return level ? [level.name, sublevel].filter(Boolean).join(' · ') : ''
  }

  const characterContextMenu = (character: CharacterCard): ContextMenuEntry[] => [
    {
      type: 'label',
      label: `${character.name || '未命名角色'}${character.role ? ` · ${character.role}` : ''}`,
    },
    ...(selection.selectMode
      ? [
          {
            type: 'label' as const,
            label: `已选 ${selection.selected.size} 个角色`,
          },
          {
            label: '导出选中角色（JSON）',
            disabled: selection.selected.size === 0,
            onSelect: () => selection.exportSelected('json'),
          },
          {
            label: '导出选中角色（Markdown）',
            disabled: selection.selected.size === 0,
            onSelect: () => selection.exportSelected('markdown'),
          },
          {
            label: '删除选中角色…',
            danger: true,
            disabled: selection.selected.size === 0,
            onSelect: () => selection.setConfirmDeleteOpen(true),
          },
          {
            label: '退出多选',
            onSelect: selection.exit,
          },
          { type: 'separator' as const },
        ]
      : [
          {
            label: '多选此角色',
            onSelect: () => {
              selection.enter()
              selection.toggle(character.id)
            },
          },
          {
            label: '全选角色',
            onSelect: selection.selectAll,
          },
          { type: 'separator' as const },
        ]),
    {
      label: '打开角色档案',
      onSelect: () => setSelectedId(character.id),
    },
    {
      label: '复制姓名',
      onSelect: () => {
        void copyTextToClipboard(character.name).then((ok) =>
          onToast(ok ? '已复制角色姓名' : '复制失败'),
        )
      },
    },
    {
      label: '复制一句话设定',
      onSelect: () => {
        const text = [
          character.name,
          character.position || character.role,
          character.identity,
          character.personality,
          realmLabel(character),
        ]
          .filter(Boolean)
          .join('｜')
        void copyTextToClipboard(text).then((ok) =>
          onToast(ok ? '已复制角色摘要' : '复制失败'),
        )
      },
    },
    { type: 'separator' },
    {
      label: 'AI 按想法生成角色…',
      disabled: !apiReady || generating,
      hint: !apiReady ? '请先配置 AI' : generating ? '正在生成' : undefined,
      onSelect: () => setIdeaOpen(true),
    },
    {
      label: 'AI 补全此角色随身物品…',
      disabled:
        !apiReady ||
        generating ||
        ((character.weapons?.length ?? 0) === 0 && (character.treasures?.length ?? 0) === 0),
      hint:
        !apiReady
          ? '请先配置 AI'
          : generating
            ? '正在生成'
            : (character.weapons?.length ?? 0) === 0 && (character.treasures?.length ?? 0) === 0
              ? '先在角色档案里填写武器 / 法宝名称'
              : '会调用一次 AI，把已有名称补成物品页条目',
      onSelect: () => {
        void completeCharacterItems(character)
      },
    },
    ...(onOpenTab
      ? [
          {
            label: '打开人物关系网',
            onSelect: () => onOpenTab('relations'),
          } satisfies ContextMenuEntry,
        ]
      : []),
    { type: 'separator' },
    { type: 'label', label: `所属${terms.faction}` },
    {
      label: '移出势力 / 散人',
      checked: !character.sectId,
      onSelect: () => updateCharacter(character.id, { sectId: '' }),
    },
    ...detail.factions.map((faction) => ({
      label: faction.name || `未命名${terms.faction}`,
      checked: character.sectId === faction.id,
      onSelect: () => updateCharacter(character.id, { sectId: faction.id }),
    })),
    { type: 'separator' },
    {
      label: '删除角色…',
      danger: true,
      onSelect: () => {
        setDeleteTarget(character)
      },
    },
  ]

  const customValues = (character: CharacterCard) =>
    worldTemplate.characterFields
      .map((field) => ({ field, value: character.attributes?.[field.id]?.trim() ?? '' }))
      .filter((item) => item.value)
      .slice(0, 2)

  const selectedRelations = selected
    ? detail.relationships.filter(
        (relationship) =>
          relationship.fromId === selected.id || relationship.toId === selected.id,
      )
    : []

  return (
    <>
      <div className="drawer-section-head">
        <span>角色卡</span>
        <div className="drawer-section-actions">
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${selection.selectMode ? 'active' : ''}`}
            onClick={selection.toggleMode}
            disabled={detail.characters.length === 0}
            title="多选角色，批量导出或删除（Ctrl+A 全选 / Delete 删除 / Ctrl+E 导出 / Esc 退出）"
          >
            {selection.selectMode
              ? `退出多选${selection.selected.size > 0 ? ` · ${selection.selected.size}` : ''}`
              : '多选'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRealmOpen(true)}>
            境界设置
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setIdeaOpen(true)}
            disabled={!apiReady || generating}
            title={apiReady ? '输入你的想法，AI 分析后按想法生成角色' : '请先配置 AI'}
          >
            <IconSparkles size={14} />
            {generating ? '生成中…' : '一键生成'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addCharacter}>
            <IconPlus size={14} />
            添加角色
          </button>
        </div>
      </div>

      {detail.characters.length === 0 ? (
        <p className="drawer-empty">
          还没有角色。先添加主角和关键配角，AI 写作时会自动参考这些设定。
        </p>
      ) : null}

      <div className="character-browser">
        <aside className="character-category-rail" aria-label="角色分类">
          <span className="character-category-title">分类</span>
          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              className={`character-category-item ${activeCategory === category.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category.id)}
            >
              <span>{category.label}</span>
              <small>{category.count}</small>
            </button>
          ))}
        </aside>

        <div className="character-category-content">
          <div className="archive-filter-bar">
            <input
              className="input character-filter-search"
              value={characterQuery}
              onChange={(event) => setCharacterQuery(event.target.value)}
              placeholder="搜索角色 / 身份 / 所属势力"
              aria-label="搜索角色"
            />
            <button
              type="button"
              className={`btn btn-ghost btn-sm ${archivePendingOnly ? 'active' : ''}`}
              onClick={() => setArchivePendingOnly((value) => !value)}
            >
              待补全档案 {pendingArchive.length}
            </button>
            <span className="character-filter-count">
              {visibleCharacters.length} / {detail.characters.length}
            </span>
          </div>
          <div className="character-category-heading">
            <div>
              <strong>{activeCategoryLabel}</strong>
              <span>{visibleCharacters.length} 人</span>
            </div>
            {activeFaction && onQueueFactionArchive ? (
              <div className="character-category-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!apiReady || activeFactionCharacters.length === 0}
                  title="补全该势力下所有角色的普通档案和深度档案；可关闭界面，任务在后台继续"
                  onClick={() => onQueueFactionArchive(activeFaction.id)}
                >
                  <IconSparkles size={13} />
                  {activeFactionPending > 0
                    ? `后台补全中 ${activeFactionDone}/${activeFactionCharacters.length}`
                    : '一键补全该势力档案'}
                </button>
                {activeFactionPending > 0 ? (
                  <small>
                    队列中 {activeFactionPending} 个，可关闭界面继续运行
                  </small>
                ) : null}
              </div>
            ) : null}
          </div>
          {visibleCharacters.length === 0 ? (
            <p className="drawer-empty">
              {characterQuery.trim()
                ? '没有匹配的角色。'
                : archivePendingOnly
                  ? '这个分类下没有待补全角色。'
                  : activeCategory === 'independent'
                    ? '没有散人 / 未加入势力的角色。'
                    : '这个分类下还没有角色。'}
            </p>
          ) : null}
          <div className="sheet-grid character-sheet-grid">
        {visibleCharacters.map((character) => {
          const appearance = appearanceOf(character.name, chapters)
          const signature = character.weapons?.[0]
            ? { name: character.weapons[0], kind: 'weapon' as const }
            : character.techniques?.[0]
              ? { name: character.techniques[0], kind: 'technique' as const }
              : character.treasures?.[0]
                ? { name: character.treasures[0], kind: 'treasure' as const }
                : null
          const signatureMeta =
            features.equipment && signature
              ? describeItem(signature.name, signature.kind, character.cultivation)
              : null
          const profileScore = profileCompleteness(
            normalizeCharacterProfile(character.profile),
          ).score
          const bagCount = inventoryQuantity(character.inventory)
          return (
            <div className="sheet-card-shell" key={character.id}>
            <button
              type="button"
              data-entity-kind="character"
              data-entity-id={character.id}
              className={`sheet-card character-sheet ${
                selection.selectMode ? 'selectable' : ''
              } ${selection.selected.has(character.id) ? 'selected' : ''}`}
              style={
                {
                  '--tone': realmOf(character).level?.color ?? 'transparent',
                  '--tone-soft': `${realmOf(character).level?.color ?? 'transparent'}18`,
                } as React.CSSProperties
              }
              onContextMenu={(event) => openContextMenu(event, characterContextMenu(character))}
              onClick={() => {
                if (selection.selectMode) selection.toggle(character.id)
                else setSelectedId(character.id)
              }}
            >
              {selection.selectMode ? (
                <span
                  className={`sheet-card-select-check ${selection.selected.has(character.id) ? 'active' : ''}`}
                  aria-hidden="true"
                >
                  {selection.selected.has(character.id) ? '✓' : ''}
                </span>
              ) : null}
              <span className="sheet-card-avatar">
                {character.avatar ? (
                  <img src={character.avatar} alt="" draggable={false} />
                ) : (
                  (character.name || '角').slice(0, 1)
                )}
              </span>
              <span className="sheet-card-kicker">
                {character.position || character.role || '角色'}
              </span>
              <strong className="sheet-card-name">{character.name || '未命名角色'}</strong>
              <span className="sheet-card-subtitle">
                {character.identity || '身份未设定'}
              </span>
              <span className="sheet-card-tags">
                <span>{sectName(character.sectId)}</span>
                {speciesName(character.speciesId) ? (
                  <span>{speciesName(character.speciesId)}</span>
                ) : null}
                {realmOf(character).level ? (
                  <span
                    className="character-realm-badge"
                    style={{
                      color: realmOf(character).level?.color,
                      borderColor: realmOf(character).level?.color,
                      background: `${realmOf(character).level?.color}18`,
                    }}
                  >
                    {realmLabel(character)}
                  </span>
                ) : null}
                {features.ranks && character.cultivation ? (
                  <span>{character.cultivation}</span>
                ) : null}
                {features.cultivation && character.spiritRoot ? (
                  <span>{character.spiritRoot}</span>
                ) : null}
                {features.cultivation && character.physique ? (
                  <span>{character.physique}</span>
                ) : null}
              </span>
              {customValues(character).length > 0 ? (
                <span className="sheet-card-custom">
                  {customValues(character)
                    .map((item) => `${item.field.label}：${item.value}`)
                    .join(' · ')}
                </span>
              ) : null}
              {signatureMeta ? (
                <span className="sheet-card-signature">
                  {signature?.name} · {signatureMeta.grade}
                </span>
              ) : null}
              {features.equipment ? (
                <span className="sheet-card-meta">
                  {character.techniques?.length ?? 0} 门{terms.ability} ·{' '}
                  {character.weapons?.length ?? 0} 件武器 ·{' '}
                  {character.treasures?.length ?? 0} 件{terms.item}
                </span>
              ) : null}
              <span className={`sheet-card-profile ${profileScore >= 60 ? 'ready' : ''}`}>
                深度档案 {profileScore}%
                {character.archiveStatus === 'placeholder' ? ' · 待补全' : ''}
              </span>
              <span className="sheet-card-foot">
                <span>出场 {appearance.count} 章</span>
                <LifecycleBadge value={character.lifecycle} />
                <span>查看详情 →</span>
              </span>
            </button>
            {selection.selectMode ? null : (
              <button
                type="button"
                className="sheet-card-pack"
                title="打开角色背包"
                aria-label={`打开${character.name || '角色'}的背包`}
                onClick={() => setInventoryCharacterId(character.id)}
              >
                <IconBackpack size={13} />
                背包{bagCount > 0 ? ` ${bagCount}` : ''}
              </button>
            )}
            </div>
          )
        })}
        {selection.selectMode ? null : (
          <button type="button" className="sheet-card sheet-card-add" onClick={addCharacter}>
            <IconPlus size={18} />
            <span>新建角色卡</span>
          </button>
        )}
          </div>
        </div>
      </div>

      {selected ? (
        <Modal
          title="角色档案"
          subtitle={selected.name || '未命名角色'}
          tone={realmOf(selected).level?.color}
          onClose={() => setSelectedId(null)}
          size="lg"
          footer={
            <div className="record-modal-actions">
              <button
                type="button"
                className="btn btn-danger-ghost btn-sm"
                onClick={() => removeCharacter(selected.id)}
              >
                <IconTrash size={14} />
                删除角色
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setSelectedId(null)}>
                关闭
              </button>
            </div>
          }
        >
          <div
            className="record-sheet detail-accent-sheet"
            style={
              {
                '--tone': realmOf(selected).level?.color ?? 'var(--line)',
                '--tone-soft': `${realmOf(selected).level?.color ?? 'transparent'}18`,
              } as React.CSSProperties
            }
          >
            <header className="record-hero">
              <div className="record-hero-avatar">
                {selected.avatar ? (
                  <img src={selected.avatar} alt="" draggable={false} />
                ) : (
                  <span>{(selected.name || '角').slice(0, 1)}</span>
                )}
                <ImagePickerButton
                  label={selected.avatar ? '换头像' : '设置头像'}
                  className="record-avatar-action"
                  onPick={async (file) => {
                    const avatar = await prepareImage(file, 'avatar')
                    updateCharacter(selected.id, { avatar })
                    onToast('角色头像已更新')
                  }}
                  onError={onToast}
                />
                {selected.avatar ? (
                  <button
                    type="button"
                    className="record-avatar-remove"
                    onClick={() => {
                      updateCharacter(selected.id, { avatar: undefined })
                      onToast('已移除角色头像')
                    }}
                  >
                    移除
                  </button>
                ) : null}
              </div>
              <div className="record-hero-copy">
                <span>{selected.role || '角色'} · {sectName(selected.sectId)}{speciesName(selected.speciesId) ? ` · ${speciesName(selected.speciesId)}` : ''}</span>
                <h3>{selected.name || '未命名角色'}</h3>
                <p>{selected.identity || '还没有写身份'}</p>
              </div>
              <div className="record-hero-badges">
                {realmOf(selected).level ? (
                  <span
                    className="character-realm-badge"
                    style={{
                      color: realmOf(selected).level?.color,
                      borderColor: realmOf(selected).level?.color,
                      background: `${realmOf(selected).level?.color}18`,
                    }}
                  >
                    {realmOf(selected).scheme?.name} · {realmLabel(selected)}
                  </span>
                ) : null}
                {features.cultivation ? (
                  <>
                    <span>{selected.cultivation || `${terms.rank}未定`}</span>
                    <span>{selected.spiritRoot || '灵根未定'}</span>
                    <span>{selected.physique || '体质未定'}</span>
                  </>
                ) : (
                  <span>{selected.position || terms.position}</span>
                )}
                <span>出场 {appearanceOf(selected.name, chapters).count} 章</span>
                <LifecycleTags
                  value={selected.lifecycle}
                  compact
                  onChange={(lifecycle) => updateCharacter(selected.id, { lifecycle })}
                />
              </div>
            </header>

            <div className="record-view-switch">
              <button
                type="button"
                className={recordView === 'basic' ? 'active' : ''}
                onClick={() => setRecordView('basic')}
              >
                基础档案
              </button>
              <button
                type="button"
                className={recordView === 'profile' ? 'active' : ''}
                onClick={() => setRecordView('profile')}
              >
                深度档案
                <small>
                  {profileCompleteness(normalizeCharacterProfile(selected.profile)).score}%
                </small>
              </button>
              <button
                type="button"
                className={recordView === 'history' ? 'active' : ''}
                onClick={() => setRecordView('history')}
              >
                人物经历
                <small>{selected.experiences?.length ?? 0}</small>
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm record-fill-btn"
                disabled={fillingArchive || !apiReady}
                onClick={() => void fillCharacterArchive()}
              >
                <IconSparkles size={13} />
                {fillingArchive ? '补全中…' : '补全深度档案'}
              </button>
            </div>

            {recordView === 'basic' ? (
              <>
            {features.equipment ? <ItemCardSections character={selected} terms={terms} /> : null}

            <div className="record-form-grid">
              <Field label="姓名" value={selected.name} onChange={(value) => updateCharacter(selected.id, { name: value })} />
              <Field label="故事定位" value={selected.role} onChange={(value) => updateCharacter(selected.id, { role: value })} placeholder="主角 / 配角 / 反派" />
              <Field label="身份" value={selected.identity} onChange={(value) => updateCharacter(selected.id, { identity: value })} />
              <label className="record-field">
                <span>境界体系</span>
                <select
                  className="input select drawer-input"
                  value={
                    selected.realmSchemeId ??
                    detail.activeRealmSchemeId ??
                    detail.realmSchemes?.[0]?.id ??
                    ''
                  }
                  onChange={(event) =>
                    updateCharacter(selected.id, {
                      realmSchemeId: event.target.value || undefined,
                      realmLevel: 1,
                      realmSublevel: undefined,
                    })
                  }
                >
                  {(detail.realmSchemes ?? []).map((scheme) => (
                    <option key={scheme.id} value={scheme.id}>
                      {scheme.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="record-field">
                <span>境界</span>
                <select
                  className="input select drawer-input"
                  value={selected.realmLevel ?? ''}
                  onChange={(event) =>
                    updateCharacter(selected.id, {
                      realmLevel: event.target.value ? Number(event.target.value) : undefined,
                      realmSublevel: undefined,
                    })
                  }
                >
                  <option value="">未设置</option>
                  {(
                    characterRealmScheme(
                      detail,
                      selected.realmSchemeId ?? detail.activeRealmSchemeId,
                    )?.levels ?? []
                  ).map((level, index) => (
                    <option key={level.id} value={index + 1}>
                      {index + 1} · {level.name}
                    </option>
                  ))}
                </select>
              </label>
              {(() => {
                const scheme = characterRealmScheme(
                  detail,
                  selected.realmSchemeId ?? detail.activeRealmSchemeId,
                )
                const level = selected.realmLevel ? scheme?.levels[selected.realmLevel - 1] : undefined
                if (!level?.sublevels?.length) return null
                return (
                  <label className="record-field">
                    <span>小境界</span>
                    <select
                      className="input select drawer-input"
                      value={selected.realmSublevel ?? ''}
                      onChange={(event) =>
                        updateCharacter(selected.id, {
                          realmSublevel: event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        })
                      }
                    >
                      <option value="">未设置</option>
                      {level.sublevels.map((sublevel, index) => (
                        <option key={sublevel} value={index + 1}>
                          {sublevel}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              })()}
              <label className="record-field">
                <span>所属{terms.faction}</span>
                <select
                  className="input select drawer-input"
                  value={selected.sectId ?? ''}
                  onChange={(event) => updateCharacter(selected.id, { sectId: event.target.value })}
                >
                  <option value="">未加入{terms.faction}</option>
                  {detail.factions.map((faction) => (
                    <option key={faction.id} value={faction.id}>
                      {faction.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="record-field">
                <span>物种 / 种族</span>
                <select
                  className="input select drawer-input"
                  value={selected.speciesId ?? ''}
                  onChange={(event) =>
                    updateCharacter(selected.id, {
                      speciesId: event.target.value || undefined,
                    })
                  }
                >
                  <option value="">未设定物种</option>
                  {(detail.species ?? []).map((species) => (
                    <option key={species.id} value={species.id}>
                      {species.name || '未命名物种'}
                    </option>
                  ))}
                </select>
              </label>
              <Field label={terms.position} value={selected.position ?? ''} onChange={(value) => updateCharacter(selected.id, { position: value })} placeholder={terms.position} />
              {features.cultivation ? (
                <>
                  <Field label={`${terms.rank}境界`} value={selected.cultivation ?? ''} onChange={(value) => updateCharacter(selected.id, { cultivation: value })} placeholder={terms.rank} />
                  <Field label="灵根" value={selected.spiritRoot ?? ''} onChange={(value) => updateCharacter(selected.id, { spiritRoot: value })} />
                  <Field label="体质" value={selected.physique ?? ''} onChange={(value) => updateCharacter(selected.id, { physique: value })} />
                  <Field label="天赋" value={selected.talent ?? ''} onChange={(value) => updateCharacter(selected.id, { talent: value })} />
                </>
              ) : null}
              <Field label="性别" value={selected.gender ?? ''} onChange={(value) => updateCharacter(selected.id, { gender: value })} />
              <Field label="年龄" value={selected.age ?? ''} onChange={(value) => updateCharacter(selected.id, { age: value })} />
              <Field label="当前状态" value={selected.status ?? ''} onChange={(value) => updateCharacter(selected.id, { status: value })} />
              <Field label="人物设定" value={selected.personality} onChange={(value) => updateCharacter(selected.id, { personality: value })} multiline placeholder="性格、习惯、弱点" />
              <Field label="目标" value={selected.goal} onChange={(value) => updateCharacter(selected.id, { goal: value })} multiline />
              <Field label="外貌" value={selected.appearance ?? ''} onChange={(value) => updateCharacter(selected.id, { appearance: value })} multiline />
              <Field label="背景" value={selected.background ?? ''} onChange={(value) => updateCharacter(selected.id, { background: value })} multiline />
              {worldTemplate.characterFields.map((field) => (
                <label
                  className={`record-field ${field.type === 'textarea' ? 'record-field-wide' : ''}`}
                  key={field.id}
                >
                  <span>{field.label} · 模板字段</span>
                  {field.type === 'textarea' ? (
                    <textarea
                      className="input drawer-textarea"
                      rows={3}
                      value={selected.attributes?.[field.id] ?? ''}
                      placeholder={field.placeholder || field.label}
                      onChange={(event) => setCustomValue(selected, field.id, event.target.value)}
                    />
                  ) : field.type === 'select' ? (
                    <select
                      className="input select drawer-input"
                      value={selected.attributes?.[field.id] ?? ''}
                      onChange={(event) => setCustomValue(selected, field.id, event.target.value)}
                    >
                      <option value="">未设置</option>
                      {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input drawer-input"
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={selected.attributes?.[field.id] ?? ''}
                      placeholder={field.placeholder || field.label}
                      onChange={(event) => setCustomValue(selected, field.id, event.target.value)}
                    />
                  )}
                </label>
              ))}
              {(worldTemplate.customFeatures ?? [])
                .filter((feature) => feature.scope === 'character')
                .map((feature) => (
                  <div className="custom-feature-block" key={feature.id}>
                    <div className="custom-feature-block-head">
                      <strong>{feature.name}</strong>
                      <span>{feature.fields.length} 个字段</span>
                    </div>
                    {feature.fields.map((field) => (
                      <label
                        className={`record-field ${field.type === 'textarea' ? 'record-field-wide' : ''}`}
                        key={field.id}
                      >
                        <span>{field.label}</span>
                        {field.type === 'textarea' ? (
                          <textarea
                            className="input drawer-textarea"
                            rows={3}
                            value={selected.attributes?.[field.id] ?? ''}
                            placeholder={field.placeholder || field.label}
                            onChange={(event) => setCustomValue(selected, field.id, event.target.value)}
                          />
                        ) : field.type === 'select' ? (
                          <select
                            className="input select drawer-input"
                            value={selected.attributes?.[field.id] ?? ''}
                            onChange={(event) => setCustomValue(selected, field.id, event.target.value)}
                          >
                            <option value="">未设置</option>
                            {(field.options ?? []).map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="input drawer-input"
                            type={field.type === 'number' ? 'number' : 'text'}
                            value={selected.attributes?.[field.id] ?? ''}
                            placeholder={field.placeholder || field.label}
                            onChange={(event) => setCustomValue(selected, field.id, event.target.value)}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                ))}
            </div>

            <div className="record-detail-block">
              <header>
                <span>人物关系</span>
                <strong>{selectedRelations.length} 条</strong>
              </header>
              {selectedRelations.length > 0 ? (
                selectedRelations.map((relationship) => {
                  const otherId =
                    relationship.fromId === selected.id
                      ? relationship.toId
                      : relationship.fromId
                  const other = detail.characters.find((character) => character.id === otherId)
                  return (
                    <div className="record-member" key={relationship.id}>
                      <div>
                        <strong>{other?.name || '未知角色'}</strong>
                        <span>{relationship.type || '关系'}</span>
                      </div>
                      <p>{relationship.note || '暂无补充'}</p>
                    </div>
                  )
                })
              ) : (
                <p className="drawer-empty">还没有记录人物关系。</p>
              )}
            </div>

            {(detail.realmHistory ?? []).some((entry) => entry.characterId === selected.id) ? (
              <div className="record-detail-block character-realm-history">
                <header>
                  <span>境界记录</span>
                  <strong>
                    {(detail.realmHistory ?? []).filter((entry) => entry.characterId === selected.id).length} 条
                  </strong>
                </header>
                {(detail.realmHistory ?? [])
                  .filter((entry) => entry.characterId === selected.id)
                  .slice(0, 8)
                  .map((entry) => (
                    <div className="record-member" key={entry.id}>
                      <div>
                        <strong>
                          {entry.schemeName} · {entry.levelName}
                          {entry.sublevelName ? ` · ${entry.sublevelName}` : ''}
                        </strong>
                        <span>{new Date(entry.at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
              </div>
            ) : null}

            <div className="record-footnote">
              {features.equipment
                ? `${terms.ability} / 武器 / ${terms.item} / ${terms.currency}当前为展示卡；角色基础信息仍可编辑。`
                : '当前模板不启用修仙专属字段，可在世界模板里添加自定义字段。'}
            </div>
              </>
            ) : recordView === 'profile' ? (
              <CharacterProfileEditor
                character={selected}
                detail={detail}
                profile={selected.profile ?? emptyCharacterProfile()}
                chapters={chapters}
                onChange={(profile) => updateCharacter(selected.id, { profile })}
                onToast={onToast}
              />
            ) : (
              <CharacterExperienceEditor
                character={selected}
                detail={detail}
                chapters={chapters}
                onChange={(experiences) => updateCharacter(selected.id, { experiences })}
                onToast={onToast}
              />
            )}
          </div>
        </Modal>
      ) : null}

      {realmOpen ? (
        <RealmSettingsModal
          detail={detail}
          templateId={worldTemplate.id}
          onUpdateDetail={onUpdateDetail}
          onClose={() => setRealmOpen(false)}
        />
      ) : null}

      {ideaOpen ? (
        <EntityIdeaModal
          kind="character"
          work={work}
          detail={detail}
          api={api}
          apiReady={apiReady}
          onRecordUsage={onRecordUsage}
          onGenerate={generateCharacter}
          onToast={onToast}
          onClose={() => setIdeaOpen(false)}
        />
      ) : null}

      {inventoryCharacterId
        ? (() => {
            const owner = detail.characters.find((item) => item.id === inventoryCharacterId)
            if (!owner) return null
            return (
              <InventoryModal
                title={`${owner.name || '角色'}的背包`}
                subtitle="角色随身携带的物品、法宝和资源；分类与物品页一致"
                inventory={owner.inventory}
                detail={detail}
                onChange={(inventory) =>
                  onUpdateDetail({
                    characters: detail.characters.map((item) =>
                      item.id === owner.id ? { ...item, inventory } : item,
                    ),
                  })
                }
                onToast={onToast}
                onClose={() => setInventoryCharacterId(null)}
              />
            )
          })()
        : null}

      {selection.selectMode ? (
        <BatchActionBar
          selectedCount={selection.selected.size}
          totalCount={detail.characters.length}
          label="个角色"
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onExport={() => selection.exportSelected('json')}
          onDelete={() => selection.setConfirmDeleteOpen(true)}
          onExit={selection.exit}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="删除角色"
          danger
          confirmLabel="删除角色"
          message={
            <>
              <p>确定删除「{deleteTarget.name || '未命名角色'}」？</p>
              <p>相关人物关系也会一起移除；不会修改作品正文。</p>
            </>
          }
          onConfirm={() => {
            removeCharacter(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}

      {selection.confirmDeleteOpen ? (
        <ConfirmModal
          title="批量删除角色"
          danger
          confirmLabel={`删除 ${selection.selected.size} 个角色`}
          message={
            <>
              <p>确定删除选中的 {selection.selected.size} 个角色？</p>
              <p>相关人物关系会一起移除；角色经历和背包只从当前作品档案中删除，不会影响作品正文。</p>
            </>
          }
          onConfirm={selection.removeSelected}
          onClose={() => selection.setConfirmDeleteOpen(false)}
        />
      ) : null}
    </>
  )
}
