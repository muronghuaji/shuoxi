import { useEffect, useState } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  CharacterCard,
  FactionCard,
  FactionMember,
  TierScheme,
  Work,
  WorkDetail,
  WorldTemplate,
} from '../types'
import { characterFromGenerated, requestEntityGenerate } from '../entityFill'
import { completeEntityArchive } from '../entityArchive'
import {
  emptyFactionProfile,
  factionHierarchyLabels,
  factionMemberRecords,
  factionProfileCompleteness,
  normalizeFactionProfile,
} from '../factionProfile'
import { IconBackpack, IconPlus, IconSparkles, IconTrash } from './Icons'
import { Modal } from './Modal'
import { NumberInput } from './NumberInput'
import { InventoryModal } from './InventoryModal'
import { FactionFacilitiesEditor } from './FactionFacilitiesEditor'
import { inventoryQuantity } from '../inventory'
import { normalizeFacilities, factionFacilityTotals } from '../factionFacilities'
import { requestLinkedItems } from '../linkedItems'
import { useLinkedGenerationSettings } from '../linkedGeneration'
import { FactionProfileEditor } from './FactionProfileEditor'
import { FactionRelationMatrix } from './FactionRelationMatrix'
import { EntityIdeaModal } from './EntityIdeaModal'
import { FactionCouncilModal } from './FactionCouncilModal'
import { LifecycleBadge, LifecycleTags } from './LifecycleTags'
import { TierSettingsModal } from './TierSettingsModal'
import { useContextMenu, type ContextMenuEntry } from './ContextMenuProvider'
import { ConfirmModal } from './ConfirmModal'
import { BatchActionBar } from './BatchActionBar'
import { useBatchSelection } from '../hooks/useBatchSelection'
import { batchExportEntities } from '../batchExport'
import { copyTextToClipboard } from '../clipboard'
import {
  defaultFactionTierScheme,
  ensureFactionTierData,
  factionTierScheme,
} from '../tiers'

interface FactionCardGridProps {
  work: Work
  detail: WorkDetail
  worldTemplate: WorldTemplate
  api: ApiConfig
  apiReady: boolean
  onRecordUsage?: (entry: AiUsageEntry) => void
  onToast: (message: string) => void
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  focusRequest?: { id: string; requestId: number } | null
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function parseRoster(value: unknown): FactionMember[] {
  if (!Array.isArray(value)) return []
  return value
    .map<FactionMember | null>((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const raw = entry as Record<string, unknown>
      const name = typeof raw.name === 'string' ? raw.name.trim() : ''
      if (!name) return null
      return {
        name,
        title: typeof raw.title === 'string' ? raw.title.trim() : '',
        cultivation: typeof raw.cultivation === 'string' ? raw.cultivation.trim() : '',
        description:
          typeof raw.description === 'string' ? raw.description.trim() : undefined,
        itemNames: Array.isArray(raw.items)
          ? raw.items.map((item) => String(item).trim()).filter(Boolean)
          : [],
      }
    })
    .filter((entry): entry is FactionMember => Boolean(entry))
}

function rosterCharacter(
  member: FactionMember,
  factionId: string,
  role: string,
): CharacterCard {
  return {
    id: createId('c'),
    name: member.name,
    role,
    identity: member.title || role,
    personality: '',
    goal: '',
    sectId: factionId,
    position: member.title,
    cultivation: member.cultivation,
    background: member.description ?? '',
    weapons: [...(member.itemNames ?? [])],
    lifecycle: '未上线',
  }
}

function splitList(value: string): string[] {
  return value
    .split(/[、,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
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

function ListField({
  label,
  values,
  onCommit,
}: {
  label: string
  values: string[]
  onCommit: (values: string[]) => void
}) {
  const [text, setText] = useState(values.join('、'))

  useEffect(() => {
    setText(values.join('、'))
  }, [values])

  const commit = () => onCommit(splitList(text))

  return (
    <label className="record-field">
      <span>{label}</span>
      <input
        className="input drawer-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
      />
    </label>
  )
}

export function FactionCardGrid({
  work,
  detail,
  worldTemplate,
  api,
  apiReady,
  onRecordUsage,
  onToast,
  onUpdateDetail,
  focusRequest,
}: FactionCardGridProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [fillingArchive, setFillingArchive] = useState(false)
  const [archivePendingOnly, setArchivePendingOnly] = useState(false)
  const [ideaOpen, setIdeaOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FactionCard | null>(null)
  const [factionView, setFactionView] = useState<'basic' | 'profile' | 'facilities'>('basic')
  const [inventoryFactionId, setInventoryFactionId] = useState<string | null>(null)
  const linkedGeneration = useLinkedGenerationSettings()
  const [matrixOpen, setMatrixOpen] = useState(false)
  const [councilOpen, setCouncilOpen] = useState(false)
  const [tierOpen, setTierOpen] = useState(false)
  const { openContextMenu } = useContextMenu()
  const selected = detail.factions.find((faction) => faction.id === selectedId) ?? null
  const selection = useBatchSelection({
    allIds: detail.factions.map((faction) => faction.id),
    onDelete: (ids) => {
      const idsSet = new Set(ids)
      onUpdateDetail({
        factions: detail.factions.filter((faction) => !idsSet.has(faction.id)),
      })
      if (selectedId && idsSet.has(selectedId)) setSelectedId(null)
      onToast(`已删除 ${ids.length} 个${terms.faction}`)
    },
    onExport: (ids, format) => {
      const entityIds = new Set(ids)
      batchExportEntities(
        'faction',
        work.title,
        detail.factions.filter((faction) => entityIds.has(faction.id)) as unknown as Record<string, unknown>[],
        format,
      )
      onToast(`已导出 ${ids.length} 个${terms.faction}`)
    },
  })
  const selectedFacilityTotals = selected
    ? factionFacilityTotals(selected.facilities)
    : { elder: 0, main: 0, inner: 0, outer: 0, menial: 0 }
  const selectedHasFacilities = normalizeFacilities(selected?.facilities).length > 0
  const pendingArchiveFactions = detail.factions.filter(
    (faction) =>
      faction.archiveStatus === 'placeholder' ||
      factionProfileCompleteness(normalizeFactionProfile(faction.profile)).score < 20,
  )
  const visibleFactions = archivePendingOnly ? pendingArchiveFactions : detail.factions

  useEffect(() => {
    if (!focusRequest?.id) return
    if (!detail.factions.some((faction) => faction.id === focusRequest.id)) return
    setSelectedId(focusRequest.id)
    setFactionView('profile')
  }, [focusRequest, detail.factions])

  useEffect(() => {
    const patch = ensureFactionTierData(detail)
    if (patch) onUpdateDetail(patch)
  }, [detail, onUpdateDetail])

  useEffect(() => {
    setFactionView('basic')
  }, [selectedId])
  const terms = worldTemplate.terms
  const features = worldTemplate.features
  const hierarchyLabels = factionHierarchyLabels(worldTemplate)
  const factionScheme = factionTierScheme(detail) ?? defaultFactionTierScheme()
  const tierLevel = (faction: FactionCard) =>
    faction.tierLevel ? factionScheme.levels[faction.tierLevel - 1] : undefined
  const tierColor = (faction: FactionCard) => tierLevel(faction)?.color ?? 'transparent'

  const saveFactionTiers = (scheme: TierScheme, _color: string) => {
    onUpdateDetail({
      tierSchemes: [
        ...(detail.tierSchemes ?? []).filter((item) => item.id !== scheme.id),
        scheme,
      ],
      factionTierSchemeId: scheme.id,
    })
    setTierOpen(false)
    onToast('势力层级已保存')
  }

  const updateFaction = (id: string, patch: Partial<FactionCard>) => {
    onUpdateDetail({
      factions: detail.factions.map((faction) =>
        faction.id === id ? { ...faction, ...patch } : faction,
      ),
    })
  }

  const addFaction = () => {
    const id = createId('f')
    onUpdateDetail({
      factions: [
        ...detail.factions,
        {
          id,
          name: '',
          type: '',
          tierLevel: 1,
          leader: '',
          goal: '',
          description: '',
          location: '',
          founded: '',
          motto: '',
          elders: [],
          mainDisciples: [],
          outerDisciples: 0,
          innerDisciples: 0,
          menialDisciples: 0,
          peaks: [],
          techniques: [],
          assets: [],
          profile: emptyFactionProfile(),
        },
      ],
    })
    setSelectedId(id)
  }

  const removeFaction = (id: string) => {
    onUpdateDetail({
      factions: detail.factions.filter((faction) => faction.id !== id),
    })
    setSelectedId(null)
  }

  const fillFactionArchive = async () => {
    if (!selected || !apiReady || fillingArchive) {
      if (!apiReady) onToast('请先配置 AI 模型和 API Key')
      return
    }
    setFillingArchive(true)
    try {
      const generated = await completeEntityArchive({
        kind: 'faction',
        work,
        detail,
        entity: selected,
        api,
        onRecordUsage,
      })
      const patch = generated as Partial<FactionCard>
      if (!patch.profile) {
        onToast('模型没有返回可用的深度档案')
        return
      }
      if (
        JSON.stringify(normalizeFactionProfile(selected.profile)) ===
        JSON.stringify(patch.profile)
      ) {
        onToast('AI 没有返回新的档案字段，请换一个模型或稍后重试')
        return
      }
      updateFaction(selected.id, patch)
      setFactionView('profile')
      onToast('已补全势力深度档案，原有字段未被覆盖')
    } catch (caught) {
      onToast(`深度档案补全失败：${caught instanceof Error ? caught.message : '请稍后重试'}`)
    } finally {
      setFillingArchive(false)
    }
  }

  const generateFaction = async (hint?: string): Promise<boolean> => {
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return false
    }
    setGenerating(true)
    try {
      const generated = await requestEntityGenerate({
        kind: 'faction',
        work,
        detail,
        hint: [
          `势力层级：${factionScheme.levels.map((level, index) => `${index + 1}=${level.name}`).join('、')}`,
          linkedGeneration.autoFillFactionRoster
            ? '本次必须补全名册：elders 生成 2-4 名长老，mainDisciples 生成 3-6 名亲传 / 主要弟子；每人写 name、title、cultivation、description，并给 items 写 1-3 件随身物品名。'
            : '本次不需要补全名册：elders 和 mainDisciples 输出空数组，只生成势力和首领。',
          hint,
        ]
          .filter(Boolean)
          .join('\n'),
        api,
        onRecordUsage,
      })
      const baseName =
        typeof generated.name === 'string' && generated.name.trim()
          ? generated.name.trim()
          : '新势力'
      const existingNames = detail.factions.map((faction) => faction.name)
      let name = baseName
      let suffix = 2
      while (existingNames.includes(name)) {
        name = `${baseName} ${suffix}`
        suffix += 1
      }
      const stringValue = (key: string, fallback = '') =>
        typeof generated[key] === 'string' ? String(generated[key]).trim() : fallback
      const numberValue = (key: string) =>
        typeof generated[key] === 'number' && generated[key] > 0
          ? Math.floor(generated[key] as number)
          : 0
      const listValue = (key: string): string[] =>
        Array.isArray(generated[key])
          ? generated[key].map((item) => String(item).trim()).filter(Boolean)
          : []
      const membersFrom = (key: string): FactionCard['elders'] =>
        Array.isArray(generated[key])
          ? generated[key]
              .map((item) => {
                if (!item || typeof item !== 'object') return null
                const raw = item as Record<string, unknown>
                const memberName = typeof raw.name === 'string' ? raw.name.trim() : ''
                if (!memberName) return null
                return {
                  name: memberName,
                  title: typeof raw.title === 'string' ? raw.title.trim() : '',
                  cultivation: typeof raw.cultivation === 'string' ? raw.cultivation.trim() : '',
                  description:
                    typeof raw.description === 'string' ? raw.description.trim() : undefined,
                  itemNames: Array.isArray(raw.items)
                    ? raw.items.map((entry) => String(entry).trim()).filter(Boolean)
                    : [],
                }
              })
              .filter((item): item is NonNullable<typeof item> => Boolean(item))
          : []
      const peaks = Array.isArray(generated.peaks)
        ? generated.peaks
            .map((item) => {
              if (!item || typeof item !== 'object') return null
              const raw = item as Record<string, unknown>
              const peakName = typeof raw.name === 'string' ? raw.name.trim() : ''
              if (!peakName) return null
              return {
                name: peakName,
                type: typeof raw.type === 'string' ? raw.type.trim() : '',
                master: typeof raw.master === 'string' ? raw.master.trim() : '',
                personalDisciples: [],
              }
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
        : []
      const leaderName = stringValue('leader')
      const leader = detail.characters.find((character) => character.name === leaderName)
      const generatedTier = numberValue('tier')
      const faction: FactionCard = {
        id: createId('f'),
        name,
        type: stringValue('type', terms.faction),
        lifecycle: '未上线',
        tierLevel: generatedTier
          ? Math.min(generatedTier, factionScheme.levels.length)
          : 1,
        leader: leaderName,
        leaderId: leader?.id,
        goal: stringValue('goal'),
        description: stringValue('description'),
        location: stringValue('location'),
        founded: stringValue('founded'),
        motto: stringValue('motto'),
        elders: linkedGeneration.autoFillFactionRoster ? membersFrom('elders') : [],
        mainDisciples: linkedGeneration.autoFillFactionRoster ? membersFrom('mainDisciples') : [],
        innerDisciples: numberValue('innerDisciples'),
        outerDisciples: numberValue('outerDisciples'),
        menialDisciples: numberValue('menialDisciples'),
        peaks,
        facilities: normalizeFacilities(generated.facilities),
        techniques: listValue('techniques'),
        assets: listValue('assets'),
        profile: normalizeFactionProfile(generated.profile),
      }

      // 生成势力后同时补齐与该势力直接相关的核心角色。角色默认未上线，
      // 等正文同步真正出现后才转为已上线。
      const relatedCharacters: CharacterCard[] = []
      const usedNames = new Set(detail.characters.map((character) => character.name))
      const memberCardFor = (
        member: NonNullable<FactionCard['elders']>[number],
        role: string,
      ): CharacterCard => {
        const existing = detail.characters.find((character) => character.name === member.name)
        if (existing) {
          member.characterId = existing.id
          return existing
        }
        if (usedNames.has(member.name)) {
          return relatedCharacters.find((character) => character.name === member.name)!
        }
        const character: CharacterCard = {
          id: createId('c'),
          name: member.name,
          role,
          identity: member.title || `${name}${role}`,
          personality: '',
          goal: '',
          sectId: faction.id,
          position: member.title,
          cultivation: member.cultivation,
          background: member.description ?? '',
          weapons: [...(member.itemNames ?? [])],
          lifecycle: '未上线',
        }
        member.characterId = character.id
        usedNames.add(character.name)
        relatedCharacters.push(character)
        return character
      }

      if (linkedGeneration.autoFillFactionRoster) {
        for (const member of faction.elders ?? []) {
          if (member.name.trim()) memberCardFor(member, '长老')
        }
        for (const member of faction.mainDisciples ?? []) {
          if (member.name.trim()) memberCardFor(member, '亲传弟子')
        }
      }

      // 首领没有已有角色卡时，至少生成一张基础角色卡，避免势力只有名字。
      if (leaderName && !usedNames.has(leaderName)) {
        const leaderCard = memberCardFor(
          {
            name: leaderName,
            title: '首领',
            cultivation: '',
            description: '',
            itemNames: [],
          },
          '首领',
        )
        faction.leaderId = leaderCard.id
      } else if (leader) {
        faction.leaderId = leader.id
      }

      const companionErrorRef: { message: string } = { message: '' }
      const rosterProvided =
        (faction.elders?.length ?? 0) + (faction.mainDisciples?.length ?? 0) > 0
      const companionSpecs = linkedGeneration.autoFillFactionRoster && !rosterProvided
        ? leader
          ? [
              {
                role: '核心成员',
                hint: `请生成势力「${name}」的一名核心成员，和首领「${leaderName}」有明确的权力、理念或情感关系。`,
              },
              {
                role: '重要弟子 / 下属',
                hint: `请生成势力「${name}」的一名重要弟子或下属，能在正文中承担具体任务，不要和已有角色重复。`,
              },
            ]
          : [
              {
                role: '首领 / 宗主',
                hint: `请生成势力「${name}」的首领${leaderName ? `，姓名必须使用「${leaderName}」` : ''}；要有完整的外貌、背景、目标和深度档案。`,
              },
              {
                role: '核心成员',
                hint: `请生成势力「${name}」的一名核心成员，和首领有明确的权力、理念或情感关系。`,
              },
            ]
        : []
      const companionDetail = { ...detail, factions: [...detail.factions, faction] }
      for (const spec of companionSpecs) {
        try {
          const rawCharacter = await requestEntityGenerate({
            kind: 'character',
            work,
            detail: companionDetail,
            hint: [
              `刚生成的势力：${name}（${faction.type}）`,
              `首领：${leaderName || '由你确定'}`,
              spec.hint,
              `角色的 sectName 必须填写「${name}」，并填写势力职位。`,
              '请一次生成完整角色档案，包含基础信息和 profile 深度档案。',
            ].join('\n'),
            api,
            onRecordUsage,
          })
          const desiredName =
            !leader && spec.role === '首领 / 宗主' && leaderName
              ? leaderName
              : typeof rawCharacter.name === 'string' && rawCharacter.name.trim()
                ? rawCharacter.name.trim()
                : '新角色'
          let characterName = desiredName
          let suffix = 2
          while (usedNames.has(characterName)) {
            characterName = `${desiredName} ${suffix}`
            suffix += 1
          }
          const character = characterFromGenerated(rawCharacter, companionDetail, {
            name: characterName,
            factionId: faction.id,
            lifecycle: '未上线',
          })
          relatedCharacters.push(character)
          usedNames.add(character.name)
          companionDetail.characters = [...companionDetail.characters, character]
        } catch (error) {
          companionErrorRef.message = error instanceof Error ? error.message : '关联角色生成失败'
        }
      }
      if (!leader && !leaderName && relatedCharacters.length > 0) {
        const first = relatedCharacters[0]
        faction.leader = first.name
        faction.leaderId = first.id
      } else if (leader && relatedCharacters.length > 0) {
        faction.leaderId = leader.id
      }

      let finalDetail = {
        ...detail,
        factions: [...detail.factions, faction],
        characters: [...detail.characters, ...relatedCharacters],
      }
      let linkedItemCount = 0
      const facilityOwners = normalizeFacilities(faction.facilities)
        .filter((facility) => (facility.resourceNames ?? []).length > 0)
        .map((facility) => ({
          type: 'facility' as const,
          id: facility.id,
          name: `${faction.name}·${facility.name}`,
          itemNames: [...(facility.resourceNames ?? [])],
        }))
      const owners = [
        ...relatedCharacters
          .map((character) => ({
            type: 'character' as const,
            id: character.id,
            name: character.name,
            itemNames: [
              ...(character.weapons ?? []),
              ...(character.treasures ?? []),
            ].filter(Boolean),
          }))
          .filter((owner) => owner.itemNames.length > 0),
        ...((faction.assets ?? []).length > 0
          ? [
              {
                type: 'faction' as const,
                id: faction.id,
                name: faction.name,
                itemNames: [...(faction.assets ?? [])].filter(Boolean),
              },
            ]
          : []),
        ...facilityOwners,
      ]
      if (linkedGeneration.autoCreateLinkedItems && owners.length > 0) {
        try {
          const linked = await requestLinkedItems({
            work,
            detail: finalDetail,
            owners,
            api,
            onRecordUsage,
          })
          if (linked) {
            linkedItemCount = Math.max(0, linked.items.length - (detail.items ?? []).length)
            const facilityResources = linked.facilityResources
            const enrichedFacilities = normalizeFacilities(faction.facilities).map((facility) =>
              facilityResources[facility.id]
                ? { ...facility, resources: facilityResources[facility.id] }
                : facility,
            )
            finalDetail = {
              ...finalDetail,
              items: linked.items,
              itemCategories: linked.categories,
              characters: linked.characters,
              factions: linked.factions.map((item) =>
                item.id === faction.id ? { ...item, facilities: enrichedFacilities } : item,
              ),
            }
          }
        } catch {
          // 势力与角色已经生成，物品补全失败不阻塞主流程。
        }
      }

      onUpdateDetail({
        factions: finalDetail.factions,
        characters: finalDetail.characters,
        ...(linkedItemCount > 0
          ? {
              items: finalDetail.items,
              itemCategories: finalDetail.itemCategories,
            }
          : {}),
      })
      setSelectedId(faction.id)
      onToast(
        relatedCharacters.length > 0
          ? `AI 已生成势力「${name}」，补全 ${relatedCharacters.length} 个关联角色${linkedItemCount > 0 ? `、${linkedItemCount} 件物品` : ''}`
          : `AI 已生成势力「${name}」${companionErrorRef.message ? `；关联角色生成失败：${companionErrorRef.message}` : ''}`,
      )
      return true
    } catch (caught) {
      onToast(`势力生成失败：${caught instanceof Error ? caught.message : '请稍后重试'}`)
      return false
    } finally {
      setGenerating(false)
    }
  }

  const completeFactionRoster = async (faction: FactionCard): Promise<boolean> => {
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return false
    }
    if (generating) return false
    setGenerating(true)
    try {
      const generated = await requestEntityGenerate({
        kind: 'faction',
        work,
        detail,
        hint: [
          `已有势力「${faction.name}」（${faction.type || '未分类'}），不要新建势力、不要改名，只补全名册。`,
          'elders 生成 2-4 名长老 / 核心层，mainDisciples 生成 3-6 名亲传 / 主要弟子。',
          '每人必须有 name、title、cultivation、description；items 写 1-3 件随身物品名。',
          '已存在的角色和成员不要重复；输出的 name 保持势力名不变。',
        ].join('\n'),
        api,
        onRecordUsage,
      })
      const newElders = parseRoster(generated.elders)
      const newDisciples = parseRoster(generated.mainDisciples)
      if (newElders.length === 0 && newDisciples.length === 0) {
        onToast('AI 没有返回可用名册，请重试或在角色页手动生成')
        return false
      }
      const existingNames = new Set([
        ...detail.characters.map((character) => character.name),
        ...(faction.elders ?? []).map((member) => member.name),
        ...(faction.mainDisciples ?? []).map((member) => member.name),
      ])
      const characters = [...detail.characters]
      const addMembers = (members: FactionMember[], role: string): FactionMember[] =>
        members
          .filter((member) => !existingNames.has(member.name))
          .map((member) => {
            const character = rosterCharacter(member, faction.id, role)
            characters.push(character)
            existingNames.add(member.name)
            return { ...member, characterId: character.id }
          })
      const elders = [...(faction.elders ?? []), ...addMembers(newElders, '长老')]
      const mainDisciples = [
        ...(faction.mainDisciples ?? []),
        ...addMembers(newDisciples, '亲传弟子'),
      ]
      if (characters.length === detail.characters.length) {
        onToast('名册里的成员已经存在，没有新增')
        return false
      }
      const nextFaction: FactionCard = { ...faction, elders, mainDisciples }
      let nextDetail: WorkDetail = {
        ...detail,
        factions: detail.factions.map((item) => (item.id === faction.id ? nextFaction : item)),
        characters,
      }
      if (linkedGeneration.autoCreateLinkedItems) {
        const owners = characters
          .filter((character) => character.sectId === faction.id)
          .map((character) => ({
            type: 'character' as const,
            id: character.id,
            name: character.name,
            itemNames: [...(character.weapons ?? []), ...(character.treasures ?? [])].filter(Boolean),
          }))
          .filter((owner) => owner.itemNames.length > 0)
        if (owners.length > 0) {
          try {
            const linked = await requestLinkedItems({
              work,
              detail: nextDetail,
              owners,
              api,
              onRecordUsage,
            })
            if (linked) {
              nextDetail = {
                ...nextDetail,
                items: linked.items,
                itemCategories: linked.categories,
                characters: linked.characters,
                factions: linked.factions,
              }
            }
          } catch {
            // 名册已经生成，物品补全失败不阻塞。
          }
        }
      }
      onUpdateDetail({
        factions: nextDetail.factions,
        characters: nextDetail.characters,
        ...(nextDetail.items !== detail.items
          ? { items: nextDetail.items, itemCategories: nextDetail.itemCategories }
          : {}),
      })
      setSelectedId(faction.id)
      onToast('AI 已补全势力名册')
      return true
    } catch (caught) {
      onToast(`补全名册失败：${caught instanceof Error ? caught.message : '请稍后重试'}`)
      return false
    } finally {
      setGenerating(false)
    }
  }

  const setCustomValue = (faction: FactionCard, fieldId: string, value: string) => {
    updateFaction(faction.id, {
      attributes: { ...(faction.attributes ?? {}), [fieldId]: value },
    })
  }

  const factionContextMenu = (faction: FactionCard): ContextMenuEntry[] => [
    {
      type: 'label',
      label: `${faction.name || `未命名${terms.faction}`}${faction.type ? ` · ${faction.type}` : ''}`,
    },
    ...(selection.selectMode
      ? [
          {
            type: 'label' as const,
            label: `已选 ${selection.selected.size} 个${terms.faction}`,
          },
          {
            label: `导出选中${terms.faction}（JSON）`,
            disabled: selection.selected.size === 0,
            onSelect: () => selection.exportSelected('json'),
          },
          {
            label: `导出选中${terms.faction}（Markdown）`,
            disabled: selection.selected.size === 0,
            onSelect: () => selection.exportSelected('markdown'),
          },
          {
            label: `删除选中${terms.faction}…`,
            danger: true,
            disabled: selection.selected.size === 0,
            onSelect: () => selection.setConfirmDeleteOpen(true),
          },
          { label: '退出多选', onSelect: selection.exit },
          { type: 'separator' as const },
        ]
      : [
          {
            label: `多选此${terms.faction}`,
            onSelect: () => {
              selection.enter()
              selection.toggle(faction.id)
            },
          },
          { label: `全选${terms.faction}`, onSelect: selection.selectAll },
          { type: 'separator' as const },
        ]),
    { label: '打开势力档案', onSelect: () => setSelectedId(faction.id) },
    {
      label: '复制势力名',
      onSelect: () => {
        void copyTextToClipboard(faction.name).then((ok) =>
          onToast(ok ? '已复制势力名' : '复制失败'),
        )
      },
    },
    {
      label: '复制一句简介',
      onSelect: () => {
        const text = [faction.name, faction.type, faction.leader, faction.goal, faction.description]
          .filter(Boolean)
          .join('｜')
        void copyTextToClipboard(text).then((ok) =>
          onToast(ok ? '已复制势力简介' : '复制失败'),
        )
      },
    },
    { type: 'separator' },
    {
      label: '编辑势力层级…',
      onSelect: () => setTierOpen(true),
    },
    {
      label: 'AI 按想法生成势力…',
      disabled: !apiReady || generating,
      hint: !apiReady ? '请先配置 AI' : generating ? '正在生成' : undefined,
      onSelect: () => setIdeaOpen(true),
    },
    {
      label: 'AI 补全长老 / 亲传名册…',
      disabled: !apiReady || generating,
      hint: !apiReady
        ? '请先配置 AI'
        : generating
          ? '正在生成'
          : '会调用一次 AI，补全缺失成员并尝试生成随身物品',
      onSelect: () => {
        void completeFactionRoster(faction)
      },
    },
    { type: 'separator' },
    {
      label: '打开关系矩阵',
      disabled: detail.factions.length === 0,
      onSelect: () => setMatrixOpen(true),
    },
    {
      label: '开始议事推演…',
      disabled: !apiReady || generating,
      hint: !apiReady ? '请先配置 AI' : undefined,
      onSelect: () => setCouncilOpen(true),
    },
    { type: 'separator' },
    {
      label: `删除${terms.faction}…`,
      danger: true,
      onSelect: () => {
        setDeleteTarget(faction)
      },
    },
  ]

  return (
    <>
      <div className="drawer-section-head">
        <span>{terms.faction}卡</span>
        <div className="drawer-section-actions">
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${selection.selectMode ? 'active' : ''}`}
            onClick={selection.toggleMode}
            disabled={detail.factions.length === 0}
            title={`多选${terms.faction}，批量导出或删除（Ctrl+A 全选 / Delete 删除 / Ctrl+E 导出 / Esc 退出）`}
          >
            {selection.selectMode
              ? `退出多选${selection.selected.size > 0 ? ` · ${selection.selected.size}` : ''}`
              : '多选'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTierOpen(true)}>
            势力层级
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setMatrixOpen(true)}
            disabled={detail.factions.length === 0}
          >
            关系矩阵
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setCouncilOpen(true)}
            disabled={detail.factions.length === 0}
          >
            议事推演
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setIdeaOpen(true)}
            disabled={!apiReady || generating}
            title={apiReady ? '输入你的想法，AI 分析后按想法生成势力' : '请先配置 AI'}
          >
            <IconSparkles size={14} />
            {generating ? '生成中…' : '一键生成'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addFaction}>
            <IconPlus size={14} />
            添加{terms.faction}
          </button>
        </div>
      </div>

      {detail.factions.length === 0 ? (
        <p className="drawer-empty">
          还没有{terms.faction}。门派、公司、家族、军方……都可以记录在这里，AI 会参考它们的立场与目标。
        </p>
      ) : null}

      <div className="archive-filter-bar">
        <button
          type="button"
          className={`btn btn-ghost btn-sm ${archivePendingOnly ? 'active' : ''}`}
          onClick={() => setArchivePendingOnly((value) => !value)}
        >
          待补全档案 {pendingArchiveFactions.length}
        </button>
        {archivePendingOnly && visibleFactions.length === 0 ? (
          <span>没有待补全{terms.faction}</span>
        ) : null}
      </div>
      <div className="sheet-grid faction-sheet-grid">
        {visibleFactions.map((faction) => {
          const warehouseCount = inventoryQuantity(faction.warehouse)
          const facilityTotals = factionFacilityTotals(faction.facilities)
          const hasFacilityData = normalizeFacilities(faction.facilities).length > 0
          return (
          <div className="sheet-card-shell" key={faction.id}>
          <button
            type="button"
            data-entity-kind="faction"
            data-entity-id={faction.id}
            className={`sheet-card faction-sheet ${
              selection.selectMode ? 'selectable' : ''
            } ${selection.selected.has(faction.id) ? 'selected' : ''}`}
            style={
              {
                '--tone': tierColor(faction),
                '--tone-soft': `${tierColor(faction)}18`,
              } as React.CSSProperties
            }
            onClick={() => {
              if (selection.selectMode) selection.toggle(faction.id)
              else setSelectedId(faction.id)
            }}
            onContextMenu={(event) => openContextMenu(event, factionContextMenu(faction))}
          >
            {selection.selectMode ? (
              <span
                className={`sheet-card-select-check ${selection.selected.has(faction.id) ? 'active' : ''}`}
                aria-hidden="true"
              >
                {selection.selected.has(faction.id) ? '✓' : ''}
              </span>
            ) : null}
            <span className="sheet-card-topline">
              <span className="sheet-card-kicker">{faction.type || terms.faction}</span>
              {tierLevel(faction) ? (
                <span
                  className="faction-tier-badge"
                  style={{
                    color: tierLevel(faction)?.color,
                    borderColor: tierLevel(faction)?.color,
                    background: `${tierLevel(faction)?.color}18`,
                  }}
                >
                  {tierLevel(faction)?.name}
                </span>
              ) : null}
            </span>
            <strong className="sheet-card-name">{faction.name || `未命名${terms.faction}`}</strong>
            <span className="sheet-card-subtitle">{terms.leader}：{faction.leader || '未定'}</span>
            {features.hierarchy ? (
              <span className="sheet-card-tags">
                <span>{hierarchyLabels.inner} {hasFacilityData ? facilityTotals.inner : faction.innerDisciples ?? 0}</span>
                <span>{hierarchyLabels.outer} {hasFacilityData ? facilityTotals.outer : faction.outerDisciples ?? 0}</span>
                <span>{hierarchyLabels.menial} {hasFacilityData ? facilityTotals.menial : faction.menialDisciples ?? 0}</span>
                {hasFacilityData ? (
                  <>
                    <span>{hierarchyLabels.mainGroup} {facilityTotals.main}</span>
                    <span>{hierarchyLabels.elderGroup} {facilityTotals.elder}</span>
                  </>
                ) : null}
              </span>
            ) : (
              <span className="sheet-card-tags">
                <span>{faction.location || '位置未定'}</span>
                {worldTemplate.factionFields.slice(0, 2).map((field) =>
                  faction.attributes?.[field.id] ? (
                    <span key={field.id}>{faction.attributes[field.id]}</span>
                  ) : null,
                )}
              </span>
            )}
            {features.hierarchy ? (
              <span className="sheet-card-meta">
                {faction.peaks?.length ?? 0} {hierarchyLabels.unitGroup} · {hierarchyLabels.elderGroup}{' '}
                {faction.elders?.length ?? 0} · {hierarchyLabels.mainGroup}{' '}
                {faction.mainDisciples?.length ?? 0}
              </span>
            ) : null}
            <span className={`sheet-card-profile ${factionProfileCompleteness(normalizeFactionProfile(faction.profile)).score >= 60 ? 'ready' : ''}`}>
              深度档案 {factionProfileCompleteness(normalizeFactionProfile(faction.profile)).score}%
            </span>
            <span className="sheet-card-meta">
              成员 {factionMemberRecords(detail, faction).length} 人 · 设施汇总{' '}
              {facilityTotals.elder +
                facilityTotals.main +
                facilityTotals.inner +
                facilityTotals.outer +
                facilityTotals.menial}{' '}
              人 · {faction.location || '位置未定'}
            </span>
            <span className="sheet-card-meta">
              设施 {normalizeFacilities(faction.facilities).length} 处 · 仓库 {inventoryQuantity(faction.warehouse)} 件
            </span>
            <span className="sheet-card-foot">
              <span>{faction.location || '位置未定'}</span>
              <LifecycleBadge value={faction.lifecycle} />
              <span>查看详情 →</span>
            </span>
          </button>
          {selection.selectMode ? null : (
            <button
              type="button"
              className="sheet-card-pack"
              title="打开势力仓库"
              aria-label={`打开${faction.name || '势力'}的仓库`}
              onClick={() => setInventoryFactionId(faction.id)}
            >
              <IconBackpack size={13} />
              仓库{warehouseCount > 0 ? ` ${warehouseCount}` : ''}
            </button>
          )}
          </div>
          )
        })}
        {selection.selectMode ? null : (
          <button type="button" className="sheet-card sheet-card-add" onClick={addFaction}>
            <IconPlus size={18} />
            <span>新建{terms.faction}卡</span>
          </button>
        )}
      </div>

      {selected ? (
        <Modal
          title={`${terms.faction}档案`}
          subtitle={selected.name || `未命名${terms.faction}`}
          tone={tierLevel(selected)?.color}
          onClose={() => setSelectedId(null)}
          size="lg"
          footer={
            <div className="record-modal-actions">
              <button
                type="button"
                className="btn btn-danger-ghost btn-sm"
                onClick={() => removeFaction(selected.id)}
              >
                <IconTrash size={14} />
                删除{terms.faction}
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
                '--tone': tierColor(selected),
                '--tone-soft': `${tierColor(selected)}18`,
              } as React.CSSProperties
            }
          >
            <header className="record-hero">
              <div>
                <span>{selected.type || '势力'}</span>
                <h3>{selected.name || `未命名${terms.faction}`}</h3>
                <p>
                  {selected.location || '位置未定'} · 立宗 {selected.founded || '年代未记'} ·{' '}
                  {selected.motto || '没有立下门规'}
                </p>
              </div>
              <div className="record-hero-badges">
                <LifecycleTags
                  value={selected.lifecycle}
                  compact
                  onChange={(lifecycle) => updateFaction(selected.id, { lifecycle })}
                />
                {tierLevel(selected) ? (
                  <span
                    className="faction-tier-badge"
                    style={{
                      color: tierLevel(selected)?.color,
                      borderColor: tierLevel(selected)?.color,
                      background: `${tierLevel(selected)?.color}18`,
                    }}
                  >
                    {factionScheme.name} · {tierLevel(selected)?.name}
                  </span>
                ) : null}
                <span>{terms.leader} {selected.leader || '未定'}</span>
                {features.hierarchy ? (
                  <>
                    <span>{selected.peaks?.length ?? 0} {terms.factionUnit}</span>
                    <span>
                      {hierarchyLabels.inner}{' '}
                      {selectedHasFacilities
                        ? selectedFacilityTotals.inner
                        : selected.innerDisciples ?? 0}
                    </span>
                    <span>
                      {hierarchyLabels.outer}{' '}
                      {selectedHasFacilities
                        ? selectedFacilityTotals.outer
                        : selected.outerDisciples ?? 0}
                    </span>
                    <span>
                      {hierarchyLabels.menial}{' '}
                      {selectedHasFacilities
                        ? selectedFacilityTotals.menial
                        : selected.menialDisciples ?? 0}
                    </span>
                    {selectedHasFacilities ? (
                      <>
                        <span>
                          {hierarchyLabels.mainGroup} {selectedFacilityTotals.main}
                        </span>
                        <span>
                          {hierarchyLabels.elderGroup} {selectedFacilityTotals.elder}
                        </span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <span>{selected.location || '位置未定'}</span>
                )}
              </div>
            </header>

            <div className="record-view-switch">
              <button
                type="button"
                className={factionView === 'basic' ? 'active' : ''}
                onClick={() => setFactionView('basic')}
              >
                基础档案
              </button>
              <button
                type="button"
                className={factionView === 'profile' ? 'active' : ''}
                onClick={() => setFactionView('profile')}
              >
                深度档案
                <small>
                  {factionProfileCompleteness(normalizeFactionProfile(selected.profile)).score}%
                </small>
              </button>
              <button
                type="button"
                className={factionView === 'facilities' ? 'active' : ''}
                onClick={() => setFactionView('facilities')}
              >
                驻地设施
                <small>{normalizeFacilities(selected.facilities).length}</small>
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm record-fill-btn"
                disabled={fillingArchive || !apiReady}
                onClick={() => void fillFactionArchive()}
              >
                <IconSparkles size={13} />
                {fillingArchive ? '补全中…' : '补全深度档案'}
              </button>
            </div>

            {factionView === 'basic' ? (
              <>
            <div className="record-form-grid">
              <Field label={`${terms.faction}名`} value={selected.name} onChange={(value) => updateFaction(selected.id, { name: value })} />
              <Field label="类型" value={selected.type} onChange={(value) => updateFaction(selected.id, { type: value })} placeholder={`${terms.faction}类型`} />
              <label className="record-field">
                <span>势力层级</span>
                <select
                  className="input select drawer-input"
                  value={selected.tierLevel ?? ''}
                  onChange={(event) =>
                    updateFaction(selected.id, {
                      tierLevel: event.target.value ? Number(event.target.value) : undefined,
                    })
                  }
                >
                  <option value="">未设置</option>
                  {factionScheme.levels.map((level, index) => (
                    <option key={level.id} value={index + 1}>
                      {index + 1} · {level.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field label={terms.leader} value={selected.leader} onChange={(value) => updateFaction(selected.id, { leader: value })} />
              <Field label="所在地" value={selected.location ?? ''} onChange={(value) => updateFaction(selected.id, { location: value })} />
              <Field label="成立时间" value={selected.founded ?? ''} onChange={(value) => updateFaction(selected.id, { founded: value })} />
              <Field label="宗旨 / 规矩" value={selected.motto ?? ''} onChange={(value) => updateFaction(selected.id, { motto: value })} />
              <Field label={`${terms.faction}目标`} value={selected.goal} onChange={(value) => updateFaction(selected.id, { goal: value })} multiline />
              <Field label={`${terms.faction}描述`} value={selected.description} onChange={(value) => updateFaction(selected.id, { description: value })} multiline />
              {selectedHasFacilities ? (
                <p className="hint-line record-field-wide">
                  人数由「驻地设施」汇总：总人数{' '}
                  {selectedFacilityTotals.elder +
                    selectedFacilityTotals.main +
                    selectedFacilityTotals.inner +
                    selectedFacilityTotals.outer +
                    selectedFacilityTotals.menial}{' '}
                  人，其中 {hierarchyLabels.elderGroup} {selectedFacilityTotals.elder}、
                  {hierarchyLabels.mainGroup} {selectedFacilityTotals.main}、{hierarchyLabels.inner}{' '}
                  {selectedFacilityTotals.inner}、{hierarchyLabels.outer}{' '}
                  {selectedFacilityTotals.outer}、{hierarchyLabels.menial}{' '}
                  {selectedFacilityTotals.menial}。要改人数请去「驻地设施」页。
                </p>
              ) : null}
              <div className="record-field record-field-wide">
                <span>物种构成</span>
                {detail.species?.length ? (
                  <div className="species-multi">
                    {detail.species.map((species) => (
                      <label key={species.id}>
                        <input
                          type="checkbox"
                          checked={selected.speciesIds?.includes(species.id) ?? false}
                          onChange={(event) =>
                            updateFaction(selected.id, {
                              speciesIds: event.target.checked
                                ? [...(selected.speciesIds ?? []), species.id]
                                : (selected.speciesIds ?? []).filter((id) => id !== species.id),
                            })
                          }
                        />
                        <span>{species.name || '未命名物种'}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="drawer-hint">还没有物种；先在「物种」页建立物种，再设置势力构成。</p>
                )}
              </div>
              {features.equipment ? (
                <>
                  <ListField label={`${terms.ability}（顿号分隔）`} values={selected.techniques ?? []} onCommit={(values) => updateFaction(selected.id, { techniques: values })} />
                  <ListField label={`${terms.item} / 资产（顿号分隔）`} values={selected.assets ?? []} onCommit={(values) => updateFaction(selected.id, { assets: values })} />
                </>
              ) : null}
              {features.hierarchy ? (
                <>
                  <label className="record-field">
                    <span>{hierarchyLabels.outer}{selectedHasFacilities ? '（设施汇总）' : ''}</span>
                    <NumberInput
                      className="input drawer-input"
                      min={0}
                      readOnly={selectedHasFacilities}
                      value={selectedHasFacilities ? selectedFacilityTotals.outer : selected.outerDisciples ?? 0}
                      fallback={0}
                      onValueChange={(value) => updateFaction(selected.id, { outerDisciples: value })}
                    />
                  </label>
                  <label className="record-field">
                    <span>{hierarchyLabels.inner}{selectedHasFacilities ? '（设施汇总）' : ''}</span>
                    <NumberInput
                      className="input drawer-input"
                      min={0}
                      readOnly={selectedHasFacilities}
                      value={selectedHasFacilities ? selectedFacilityTotals.inner : selected.innerDisciples ?? 0}
                      fallback={0}
                      onValueChange={(value) => updateFaction(selected.id, { innerDisciples: value })}
                    />
                  </label>
                  <label className="record-field">
                    <span>{hierarchyLabels.menial}{selectedHasFacilities ? '（设施汇总）' : ''}</span>
                    <NumberInput
                      className="input drawer-input"
                      min={0}
                      readOnly={selectedHasFacilities}
                      value={selectedHasFacilities ? selectedFacilityTotals.menial : selected.menialDisciples ?? 0}
                      fallback={0}
                      onValueChange={(value) => updateFaction(selected.id, { menialDisciples: value })}
                    />
                  </label>
                </>
              ) : null}
              {worldTemplate.factionFields.map((field) => (
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
                .filter((feature) => feature.scope === 'faction')
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

            {features.hierarchy ? (
              <div className="record-detail-stack">
              <section className="record-detail-block">
                <header>
                  <span>{hierarchyLabels.elderGroup}</span>
                  <strong>{selected.elders?.length ?? 0} 人</strong>
                </header>
                {selected.elders?.length ? (
                  selected.elders.map((elder) => (
                    <div className="record-member" key={`${elder.name}-${elder.title}`}>
                      <div>
                        <strong>{elder.name}</strong>
                        <span>{elder.title} · {elder.cultivation}</span>
                      </div>
                      <p>{elder.description || '暂无补充'}</p>
                    </div>
                  ))
                ) : (
                  <p className="drawer-empty">还没有记录长老。</p>
                )}
              </section>

              <section className="record-detail-block">
                <header>
                  <span>{hierarchyLabels.mainGroup}</span>
                  <strong>{selected.mainDisciples?.length ?? 0} 人</strong>
                </header>
                {selected.mainDisciples?.length ? (
                  selected.mainDisciples.map((disciple) => (
                    <div className="record-member" key={`${disciple.name}-${disciple.title}`}>
                      <div>
                        <strong>{disciple.name}</strong>
                        <span>{disciple.title} · {disciple.cultivation}</span>
                      </div>
                      <p>{disciple.description || '暂无补充'}</p>
                    </div>
                  ))
                ) : (
                  <p className="drawer-empty">还没有记录{hierarchyLabels.mainGroup}。</p>
                )}
              </section>

              <section className="record-detail-block">
                <header>
                  <span>{hierarchyLabels.unitGroup}</span>
                  <strong>{selected.peaks?.length ?? 0} 处</strong>
                </header>
                {selected.peaks?.length ? (
                  selected.peaks.map((peak) => (
                    <div className="record-peak" key={peak.name}>
                      <div className="record-peak-head">
                        <strong>{peak.name}</strong>
                        <span>{peak.type}</span>
                      </div>
                      <p>峰主 / 堂主：{peak.master || '未定'}</p>
                      <p>直属成员：{peak.personalDisciples.length > 0 ? peak.personalDisciples.join('、') : '暂无'}</p>
                      <p>{peak.description || '暂无补充'}</p>
                    </div>
                  ))
                ) : (
                  <p className="drawer-empty">还没有记录山峰、堂口或院落。</p>
                )}
              </section>
            </div>
            ) : null}

            <div className="record-footnote">
              {features.hierarchy
                ? '成员数量与组织架构会进入势力上下文；核心层、主要成员和下属单元用于写作时保持秩序一致。'
                : `当前模板未启用组织层级；可在世界模板里添加“${terms.faction}”的自定义字段。`}
            </div>
              </>
            ) : factionView === 'facilities' ? (
              <FactionFacilitiesEditor
                faction={selected}
                detail={detail}
                worldTemplate={worldTemplate}
                onUpdateDetail={onUpdateDetail}
                onToast={onToast}
              />
            ) : (
              <FactionProfileEditor
                faction={selected}
                detail={detail}
                profile={selected.profile ?? emptyFactionProfile()}
                onChange={(profile) => updateFaction(selected.id, { profile })}
                onUpdateDetail={onUpdateDetail}
                onToast={onToast}
              />
            )}
          </div>
        </Modal>
      ) : null}

      {tierOpen ? (
        <TierSettingsModal
          title="势力层级设置"
          subtitle="例如三流、二流、一流、超一流；本作品全部势力共用这套层级"
          categoryName="势力"
          categoryColor="#8b9bb4"
          scheme={factionScheme}
          defaultScheme={defaultFactionTierScheme()}
          onSave={saveFactionTiers}
          onClose={() => setTierOpen(false)}
        />
      ) : null}

      {matrixOpen ? (
        <FactionRelationMatrix
          detail={detail}
          worldTemplate={worldTemplate}
          onClose={() => setMatrixOpen(false)}
        />
      ) : null}

      {councilOpen ? (
        <FactionCouncilModal
          work={work}
          detail={detail}
          worldTemplate={worldTemplate}
          api={api}
          apiReady={apiReady}
          initialFactionId={selected?.id}
          onRecordUsage={onRecordUsage}
          onClose={() => setCouncilOpen(false)}
          onToast={onToast}
        />
      ) : null}

      {ideaOpen ? (
        <EntityIdeaModal
          kind="faction"
          work={work}
          detail={detail}
          api={api}
          apiReady={apiReady}
          onRecordUsage={onRecordUsage}
          onGenerate={generateFaction}
          onToast={onToast}
          onClose={() => setIdeaOpen(false)}
        />
      ) : null}

      {inventoryFactionId
        ? (() => {
            const owner = detail.factions.find((item) => item.id === inventoryFactionId)
            if (!owner) return null
            return (
              <InventoryModal
                title={`${owner.name || '势力'}的仓库`}
                subtitle="势力公共资产、法宝、材料和库存；分类与物品页一致"
                inventory={owner.warehouse}
                detail={detail}
                onChange={(warehouse) =>
                  onUpdateDetail({
                    factions: detail.factions.map((item) =>
                      item.id === owner.id ? { ...item, warehouse } : item,
                    ),
                  })
                }
                onToast={onToast}
                onClose={() => setInventoryFactionId(null)}
              />
            )
          })()
        : null}

      {selection.selectMode ? (
        <BatchActionBar
          selectedCount={selection.selected.size}
          totalCount={detail.factions.length}
          label={`个${terms.faction}`}
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
          onExport={() => selection.exportSelected('json')}
          onDelete={() => selection.setConfirmDeleteOpen(true)}
          onExit={selection.exit}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title={`删除${terms.faction}`}
          danger
          confirmLabel={`删除${terms.faction}`}
          message={
            <>
              <p>确定删除「{deleteTarget.name || `未命名${terms.faction}`}」？</p>
              <p>势力档案、设施与仓库会从当前作品中移除，不会修改正文。</p>
            </>
          }
          onConfirm={() => {
            removeFaction(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}

      {selection.confirmDeleteOpen ? (
        <ConfirmModal
          title={`批量删除${terms.faction}`}
          danger
          confirmLabel={`删除 ${selection.selected.size} 个${terms.faction}`}
          message={
            <>
              <p>确定删除选中的 {selection.selected.size} 个{terms.faction}？</p>
              <p>势力档案、设施与仓库会从当前作品中移除，不会修改正文。</p>
            </>
          }
          onConfirm={selection.removeSelected}
          onClose={() => selection.setConfirmDeleteOpen(false)}
        />
      ) : null}
    </>
  )
}
