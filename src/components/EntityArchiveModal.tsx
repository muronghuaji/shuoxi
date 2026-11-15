import type { EntityCategory } from '../entityIndex'
import type {
  Chapter,
  CharacterCard,
  FactionCard,
  ItemCard,
  LocationCard,
  SpeciesCard,
  WorkDetail,
} from '../types'
import {
  emptyCharacterProfile,
  normalizeCharacterProfile,
} from '../characterProfile'
import {
  emptyFactionProfile,
  normalizeFactionProfile,
} from '../factionProfile'
import { CharacterProfileEditor } from './CharacterProfileEditor'
import { CharacterExperienceEditor } from './CharacterExperienceEditor'
import { FactionProfileEditor } from './FactionProfileEditor'
import { LifecycleTags } from './LifecycleTags'
import { Modal } from './Modal'

interface EntityArchiveModalProps {
  category: EntityCategory
  id: string
  detail: WorkDetail
  chapters: Chapter[]
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onToast: (message: string) => void
  onClose: () => void
}

function FieldLine({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null
  return (
    <div className="entity-archive-line">
      <span>{label}</span>
      <p>{value}</p>
    </div>
  )
}

function ListLine({ label, values }: { label: string; values?: string[] }) {
  if (!values?.length) return null
  return (
    <div className="entity-archive-line">
      <span>{label}</span>
      <p>{values.join('、')}</p>
    </div>
  )
}

function CharacterArchive({
  character,
  detail,
  chapters,
  onUpdateDetail,
  onToast,
}: {
  character: CharacterCard
  detail: WorkDetail
  chapters: Chapter[]
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onToast: (message: string) => void
}) {
  return (
    <div className="entity-archive">
      <div className="entity-archive-hero">
        <span className="entity-archive-kicker">角色档案</span>
        <h3>{character.name || '未命名角色'}</h3>
        <p>
          {[character.role, character.identity].filter(Boolean).join(' · ') || '还没有定位与身份'}
        </p>
        <div className="entity-lifecycle-row">
          <span>上线状态</span>
          <LifecycleTags
            value={character.lifecycle}
            compact
            onChange={(lifecycle) =>
              onUpdateDetail({
                characters: detail.characters.map((item) =>
                  item.id === character.id ? { ...item, lifecycle } : item,
                ),
              })
            }
          />
        </div>
      </div>
      <div className="entity-archive-fields">
        <FieldLine label="目标" value={character.goal} />
        <FieldLine label="状态" value={character.status} />
        <FieldLine label="外貌" value={character.appearance} />
        <FieldLine label="性格" value={character.personality} />
        <FieldLine label="背景" value={character.background} />
        <ListLine label="武器" values={character.weapons} />
        <ListLine label="功法" values={character.techniques} />
      </div>
      <CharacterProfileEditor
        character={character}
        detail={detail}
        profile={normalizeCharacterProfile(character.profile) ?? emptyCharacterProfile()}
        chapters={chapters}
        onChange={(profile) =>
          onUpdateDetail({
            characters: detail.characters.map((item) =>
              item.id === character.id ? { ...item, profile } : item,
            ),
          })
        }
        onToast={onToast}
      />
      <CharacterExperienceEditor
        character={character}
        detail={detail}
        chapters={chapters}
        onChange={(experiences) =>
          onUpdateDetail({
            characters: detail.characters.map((item) =>
              item.id === character.id ? { ...item, experiences } : item,
            ),
          })
        }
        onToast={onToast}
      />
    </div>
  )
}

function FactionArchive({
  faction,
  detail,
  onUpdateDetail,
  onToast,
}: {
  faction: FactionCard
  detail: WorkDetail
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onToast: (message: string) => void
}) {
  return (
    <div className="entity-archive">
      <div className="entity-archive-hero">
        <span className="entity-archive-kicker">势力档案</span>
        <h3>{faction.name || '未命名势力'}</h3>
        <p>{[faction.type, faction.leader].filter(Boolean).join(' · ') || '还没有类型与首领'}</p>
        <div className="entity-lifecycle-row">
          <span>上线状态</span>
          <LifecycleTags
            value={faction.lifecycle}
            compact
            onChange={(lifecycle) =>
              onUpdateDetail({
                factions: detail.factions.map((item) =>
                  item.id === faction.id ? { ...item, lifecycle } : item,
                ),
              })
            }
          />
        </div>
      </div>
      <div className="entity-archive-fields">
        <FieldLine label="目标" value={faction.goal} />
        <FieldLine label="驻地" value={faction.location} />
        <FieldLine label="简介" value={faction.description} />
        <ListLine label="功法" values={faction.techniques} />
        <ListLine label="资产" values={faction.assets} />
      </div>
      <FactionProfileEditor
        faction={faction}
        detail={detail}
        profile={normalizeFactionProfile(faction.profile) ?? emptyFactionProfile()}
        onChange={(profile) =>
          onUpdateDetail({
            factions: detail.factions.map((item) =>
              item.id === faction.id ? { ...item, profile } : item,
            ),
          })
        }
        onUpdateDetail={onUpdateDetail}
        onToast={onToast}
      />
    </div>
  )
}

function SimpleArchive({
  kicker,
  title,
  subtitle,
  fields,
}: {
  kicker: string
  title: string
  subtitle: string
  fields: { label: string; value?: string }[]
}) {
  return (
    <div className="entity-archive">
      <div className="entity-archive-hero">
        <span className="entity-archive-kicker">{kicker}</span>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <div className="entity-archive-fields">
        {fields.map((field) => (
          <FieldLine key={field.label} label={field.label} value={field.value} />
        ))}
      </div>
    </div>
  )
}

export function EntityArchiveModal({
  category,
  id,
  detail,
  chapters,
  onUpdateDetail,
  onToast,
  onClose,
}: EntityArchiveModalProps) {
  if (category === 'character') {
    const character = detail.characters.find((item) => item.id === id)
    if (!character) return null
    return (
      <Modal title="角色档案" subtitle={character.name} size="lg" onClose={onClose}>
        <CharacterArchive
          character={character}
          detail={detail}
          chapters={chapters}
          onUpdateDetail={onUpdateDetail}
          onToast={onToast}
        />
      </Modal>
    )
  }
  if (category === 'faction') {
    const faction = detail.factions.find((item) => item.id === id)
    if (!faction) return null
    return (
      <Modal title="势力档案" subtitle={faction.name} size="lg" onClose={onClose}>
        <FactionArchive
          faction={faction}
          detail={detail}
          onUpdateDetail={onUpdateDetail}
          onToast={onToast}
        />
      </Modal>
    )
  }
  if (category === 'species') {
    const species = (detail.species ?? []).find((item) => item.id === id) as SpeciesCard | undefined
    if (!species) return null
    return (
      <Modal title="物种档案" subtitle={species.name} size="lg" onClose={onClose}>
        <SimpleArchive
          kicker="物种档案"
          title={species.name || '未命名物种'}
          subtitle={species.category || '未分类'}
          fields={[
            { label: '起源', value: species.origin },
            { label: '栖息地', value: species.habitat },
            { label: '外形', value: species.appearance },
            { label: '生理', value: species.physiology },
            { label: '寿命', value: species.lifespan },
            { label: '能力', value: species.abilities.join('、') },
            { label: '弱点', value: species.weaknesses.join('、') },
            { label: '社会', value: species.society },
            { label: '语言', value: species.language },
            { label: '文化', value: species.culture },
            { label: '关系', value: species.relations },
            { label: '变体', value: species.variants.join('、') },
            { label: '备注', value: species.notes },
          ]}
        />
      </Modal>
    )
  }
  if (category === 'item') {
    const item = (detail.items ?? []).find((entry) => entry.id === id) as ItemCard | undefined
    if (!item) return null
    const categoryName =
      detail.itemCategories?.find((entry) => entry.id === item.categoryId)?.name ?? '物品'
    const gradeName =
      detail.itemGradeNames?.[item.grade - 1] ??
      detail.tierSchemes
        ?.flatMap((scheme) => scheme.levels.map((level) => level.name))
        .slice(item.grade - 1, item.grade)[0] ??
      `${item.grade} 级`
    return (
      <Modal title="物品详情" subtitle={item.name} size="lg" onClose={onClose}>
        <SimpleArchive
          kicker={categoryName}
          title={item.name || '未命名物品'}
          subtitle={`${categoryName} · ${gradeName}`}
          fields={[
            { label: '介绍', value: item.description },
            { label: '备注', value: item.notes },
          ]}
        />
      </Modal>
    )
  }
  if (category === 'location') {
    const location = (detail.locations ?? []).find((entry) => entry.id === id) as
      | LocationCard
      | undefined
    if (!location) return null
    const parent = detail.locations?.find((entry) => entry.id === location.parentId)?.name
    const faction = detail.factions.find((entry) => entry.id === location.factionId)?.name
    return (
      <Modal title="地点详情" subtitle={location.name} size="lg" onClose={onClose}>
        <SimpleArchive
          kicker="地点"
          title={location.name || '未命名地点'}
          subtitle={[location.type, parent ? `上级：${parent}` : '', faction ? `势力：${faction}` : '']
            .filter(Boolean)
            .join(' · ')}
          fields={[
            { label: '描述', value: location.description },
            { label: '备注 / 交通 / 禁忌', value: location.notes },
            { label: '上级地点', value: parent },
            { label: '所属势力', value: faction },
            { label: '地图坐标', value: `${location.mapX ?? 0}, ${location.mapY ?? 0}` },
          ]}
        />
      </Modal>
    )
  }
  if (category === 'foreshadow') {
    const foreshadow = detail.foreshadowings.find((item) => item.id === id)
    if (!foreshadow) return null
    return (
      <Modal title="伏笔详情" subtitle={foreshadow.title} size="lg" onClose={onClose}>
        <SimpleArchive
          kicker="伏笔"
          title={foreshadow.title || '未命名伏笔'}
          subtitle={[foreshadow.status, foreshadow.importance].filter(Boolean).join(' · ')}
          fields={[
            { label: '埋设 / 备注', value: foreshadow.note },
            { label: '真相', value: foreshadow.truth },
            { label: '线索', value: (foreshadow.clues ?? []).join('、') },
            { label: '埋设位置', value: foreshadow.plantedIn },
          ]}
        />
      </Modal>
    )
  }
  return null
}
