import { useState } from 'react'
import type {
  FactionCard,
  FactionFacility,
  FactionFacilityCounts,
  WorkDetail,
  WorldTemplate,
} from '../types'
import { factionHierarchyLabels } from '../factionProfile'
import {
  FACILITY_PRESETS,
  emptyFacilityCounts,
  facilityPeopleCount,
  facilityPresetToFacility,
  facilityPresetsFor,
  factionFacilityTotals,
  normalizeFacilities,
  normalizeFacilityCounts,
} from '../factionFacilities'
import { inventoryQuantity } from '../inventory'
import { IconBackpack, IconPlus, IconPencil, IconTrash } from './Icons'
import { InventoryModal } from './InventoryModal'
import { Modal } from './Modal'
import { NumberInput } from './NumberInput'

interface FactionFacilitiesEditorProps {
  faction: FactionCard
  detail: WorkDetail
  worldTemplate: WorldTemplate
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onToast: (message: string) => void
}

function emptyDraft(faction: FactionCard): FactionFacility {
  const preset = facilityPresetsFor(faction.type)[0]
  return preset ? facilityPresetToFacility(preset) : {
    id: '',
    name: '',
    type: '设施',
    description: '',
    keeper: '',
    effect: '',
    counts: emptyFacilityCounts(),
    resources: [],
  }
}

export function FactionFacilitiesEditor({
  faction,
  detail,
  worldTemplate,
  onUpdateDetail,
  onToast,
}: FactionFacilitiesEditorProps) {
  const facilities = normalizeFacilities(faction.facilities)
  const presets = facilityPresetsFor(faction.type)
  const labels = factionHierarchyLabels(worldTemplate)
  const unitLeaderLabel =
    worldTemplate.id === 'xianxia' && /宗|门|派|教|峰|阁|殿/.test(faction.type)
      ? '峰主 / 堂主'
      : '负责人'
  const totals = factionFacilityTotals(facilities)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [resourceId, setResourceId] = useState<string | null>(null)
  const [draft, setDraft] = useState<FactionFacility>(() => emptyDraft(faction))

  const save = (next: FactionFacility[]) => {
    onUpdateDetail({
      factions: detail.factions.map((item) =>
        item.id === faction.id ? { ...item, facilities: next } : item,
      ),
    })
  }

  const openAdd = (presetIndex?: number) => {
    const preset = presets[presetIndex ?? 0]
    setEditingId(null)
    setDraft(preset ? facilityPresetToFacility(preset) : emptyDraft(faction))
    setDetailId(null)
    setOpen(true)
  }

  const openEdit = (facility: FactionFacility) => {
    setEditingId(facility.id)
    setDraft({
      ...facility,
      counts: normalizeFacilityCounts(facility.counts),
      resources: facility.resources ?? [],
    })
    setDetailId(null)
    setOpen(true)
  }

  const saveDraft = () => {
    if (!draft.name.trim()) {
      onToast('先填写设施名称')
      return
    }
    const nextFacility = {
      ...draft,
      id: draft.id || `fac-${Date.now().toString(36)}`,
      name: draft.name.trim(),
      type: draft.type.trim() || '设施',
      counts: normalizeFacilityCounts(draft.counts),
      resources: draft.resources ?? [],
    }
    save(
      editingId
        ? facilities.map((item) => (item.id === editingId ? nextFacility : item))
        : [...facilities, nextFacility],
    )
    setOpen(false)
    onToast(editingId ? '设施已更新' : `已添加设施：${nextFacility.name}`)
  }

  const remove = (facility: FactionFacility) => {
    save(facilities.filter((item) => item.id !== facility.id))
    setDetailId(null)
    setResourceId(null)
    onToast(`已删除设施：${facility.name}`)
  }

  const migratePeaks = () => {
    const peaks = faction.peaks ?? []
    if (peaks.length === 0) return
    const migrated: FactionFacility[] = peaks.map((peak, index) => ({
      id: `fac-legacy-${Date.now().toString(36)}-${index}`,
      name: peak.name,
      type: peak.type || '山峰 / 分堂',
      description: peak.description || '',
      keeper: peak.master,
      effect: '',
      counts: {
        ...emptyFacilityCounts(),
        main: peak.personalDisciples.length,
      },
      resources: [],
    }))
    save([...facilities, ...migrated])
    onToast(`已把 ${migrated.length} 个旧版山峰迁移为设施`)
  }

  const updateCount = (key: keyof FactionFacilityCounts, value: number) => {
    setDraft({
      ...draft,
      counts: {
        ...normalizeFacilityCounts(draft.counts),
        [key]: Math.max(0, Math.round(Number(value) || 0)),
      },
    })
  }

  const detailFacility = detailId
    ? facilities.find((item) => item.id === detailId) ?? null
    : null
  const resourceFacility = resourceId
    ? facilities.find((item) => item.id === resourceId) ?? null
    : null
  const itemName = (itemId: string) =>
    (detail.items ?? []).find((item) => item.id === itemId)?.name ?? '已删除物品'

  const countFields: { key: keyof FactionFacilityCounts; label: string }[] = [
    { key: 'elder', label: labels.elderGroup },
    { key: 'main', label: labels.mainGroup },
    { key: 'inner', label: labels.inner },
    { key: 'outer', label: labels.outer },
    { key: 'menial', label: labels.menial },
  ]
  const totalsFields = countFields.map((field) => ({
    ...field,
    value: totals[field.key] ?? 0,
  }))
  const totalPeople =
    totalsFields.reduce((sum, field) => sum + field.value, 0)

  return (
    <section className="faction-facilities">
      <div className="faction-facilities-head">
        <div>
          <strong>驻地设施 / 分堂</strong>
          <span>
            按势力类型适配；总人数、长老、核心成员、内门 / 正式成员、外门 / 外围成员和杂役都从设施汇总。
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openAdd(0)}>
          <IconPlus size={14} />
          添加设施
        </button>
      </div>

      <div className="faction-facility-totals">
        <div className="faction-facility-total-main">
          <strong>{totalPeople}</strong>
          <span>总人数</span>
        </div>
        {totalsFields.map((field) => (
          <div key={field.key}>
            <strong>{field.value}</strong>
            <span>{field.label}</span>
          </div>
        ))}
        <div>
          <strong>{facilities.length}</strong>
          <span>设施</span>
        </div>
      </div>

      {presets.length > 0 ? (
        <div className="faction-facility-suggestions">
          <span>按「{faction.type || '通用势力'}」推荐：</span>
          {presets.slice(0, 6).map((preset, index) => (
            <button key={preset.type + preset.name} type="button" onClick={() => openAdd(index)}>
              + {preset.name}
            </button>
          ))}
        </div>
      ) : null}

      {facilities.length === 0 ? (
        <p className="drawer-empty">还没有记录设施。可以从推荐里快速添加，或让 AI 重新生成势力。</p>
      ) : (
        <div className="faction-facility-list">
          {facilities.map((facility) => {
            const counts = normalizeFacilityCounts(facility.counts)
            const resources = inventoryQuantity(facility.resources)
            return (
              <article
                className="faction-facility"
                key={facility.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailId(facility.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setDetailId(facility.id)
                  }
                }}
              >
                <div className="faction-facility-mark">{facility.type.slice(0, 2) || '设施'}</div>
                <div className="faction-facility-copy">
                  <strong>{facility.name}</strong>
                  <small>
                    {[facility.type, facility.keeper ? `${unitLeaderLabel}：${facility.keeper}` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                  <p>
                    {facilityPeopleCount(facility)} 人 · {labels.mainGroup} {counts.main} ·{' '}
                    {labels.inner} {counts.inner} · {labels.outer} {counts.outer} ·{' '}
                    {labels.menial} {counts.menial}
                  </p>
                  {facility.description ? <em>{facility.description}</em> : null}
                  <button
                    type="button"
                    className="faction-facility-resource-button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setResourceId(facility.id)
                    }}
                  >
                    <IconBackpack size={12} />
                    资源仓库{' '}
                    {resources > 0
                      ? `· ${resources}`
                      : (facility.resourceNames ?? []).length > 0
                        ? `· ${facility.resourceNames?.slice(0, 2).join('、')}`
                        : '· 空'}
                  </button>
                </div>
                <div className="faction-facility-actions">
                  <button
                    type="button"
                    aria-label={`编辑${facility.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      openEdit(facility)
                    }}
                  >
                    <IconPencil size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`删除${facility.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      remove(facility)
                    }}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {faction.peaks && faction.peaks.length > 0 ? (
        <div className="faction-legacy-peaks">
          <span>旧版山峰数据：{faction.peaks.map((peak) => peak.name).join('、')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={migratePeaks}>
            迁移为设施
          </button>
        </div>
      ) : null}

      {open ? (
        <Modal
          title={editingId ? '编辑设施' : '添加设施'}
          subtitle="设施人数会汇总到势力总人数；资源仓库与物品页共用分类"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={saveDraft}>
                保存设施
              </button>
            </>
          }
        >
          <div className="faction-facility-form">
            <label className="record-field record-field-wide">
              <span>选择模板</span>
              <select
                className="input select"
                value=""
                onChange={(event) => {
                  const preset = FACILITY_PRESETS.find((item) => item.type + '|' + item.name === event.target.value)
                  if (preset) setDraft(facilityPresetToFacility(preset))
                }}
              >
                <option value="">从全题材模板选择…</option>
                {FACILITY_PRESETS.map((preset) => (
                  <option key={`${preset.type}|${preset.name}`} value={`${preset.type}|${preset.name}`}>
                    {preset.type} · {preset.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="record-field">
              <span>名称</span>
              <input
                className="input"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="例如：藏书阁、总号、国库"
              />
            </label>
            <label className="record-field">
              <span>类型</span>
              <input
                className="input"
                value={draft.type}
                onChange={(event) => setDraft({ ...draft, type: event.target.value })}
                placeholder="山峰 / 分堂 / 库房 / 产业"
              />
            </label>
            <label className="record-field">
              <span>{unitLeaderLabel}</span>
              <input
                className="input"
                value={draft.keeper ?? ''}
                onChange={(event) => setDraft({ ...draft, keeper: event.target.value })}
                placeholder="谁在管这里"
              />
            </label>
            <div className="record-field record-field-wide">
              <span>人数构成</span>
              <div className="faction-facility-count-grid">
                {countFields.map((field) => (
                  <label key={field.key}>
                    <span>{field.label}</span>
                    <NumberInput
                      className="input"
                      min={0}
                      value={normalizeFacilityCounts(draft.counts)[field.key] ?? 0}
                      fallback={0}
                      onValueChange={(value) => updateCount(field.key, value)}
                    />
                  </label>
                ))}
              </div>
            </div>
            <label className="record-field record-field-wide">
              <span>描述</span>
              <textarea
                className="input drawer-textarea"
                rows={3}
                value={draft.description ?? ''}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder="这里是什么地方，平时有什么人，发生过什么"
              />
            </label>
            <label className="record-field record-field-wide">
              <span>作用 / 资源</span>
              <textarea
                className="input drawer-textarea"
                rows={2}
                value={draft.effect ?? ''}
                onChange={(event) => setDraft({ ...draft, effect: event.target.value })}
                placeholder="能提供什么资源、任务、情报或限制"
              />
            </label>
          </div>
        </Modal>
      ) : null}

      {detailFacility ? (
        <Modal
          title={detailFacility.name}
          subtitle={`${detailFacility.type || '设施'}${detailFacility.keeper ? ` · ${unitLeaderLabel}：${detailFacility.keeper}` : ''}`}
          size="lg"
          onClose={() => setDetailId(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDetailId(null)}>
                关闭
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => openEdit(detailFacility)}>
                编辑设施
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setDetailId(null)
                  setResourceId(detailFacility.id)
                }}
              >
                <IconBackpack size={14} />
                打开资源仓库
              </button>
            </>
          }
        >
          <div className="faction-facility-detail">
            <div className="faction-facility-totals">
              <div className="faction-facility-total-main">
                <strong>{facilityPeopleCount(detailFacility)}</strong>
                <span>总人数</span>
              </div>
              {countFields.map((field) => (
                <div key={field.key}>
                  <strong>{normalizeFacilityCounts(detailFacility.counts)[field.key] ?? 0}</strong>
                  <span>{field.label}</span>
                </div>
              ))}
            </div>
            {detailFacility.description ? (
              <section>
                <h4>描述</h4>
                <p>{detailFacility.description}</p>
              </section>
            ) : null}
            {detailFacility.effect ? (
              <section>
                <h4>作用 / 资源</h4>
                <p>{detailFacility.effect}</p>
              </section>
            ) : null}
            <section>
              <h4>资源仓库</h4>
              {detailFacility.resources?.length ? (
                <div className="faction-facility-resource-list">
                  {detailFacility.resources.map((entry) => (
                    <span key={entry.itemId}>
                      {itemName(entry.itemId)} × {entry.quantity}
                    </span>
                  ))}
                </div>
              ) : (detailFacility.resourceNames ?? []).length > 0 ? (
                <p>
                  已规划资源：{detailFacility.resourceNames?.join('、')}。打开资源仓库可把它们加入物品库和仓库。
                </p>
              ) : (
                <p className="drawer-empty">这里还没有资源。打开资源仓库，从物品库加入。</p>
              )}
            </section>
          </div>
        </Modal>
      ) : null}

      {resourceFacility ? (
        <InventoryModal
          title={`${resourceFacility.name}的资源仓库`}
          subtitle="设施产出的资源、材料和装备；与物品页共用分类"
          inventory={resourceFacility.resources}
          detail={detail}
          onChange={(resources) =>
            save(
              facilities.map((item) =>
                item.id === resourceFacility.id ? { ...item, resources } : item,
              ),
            )
          }
          onToast={onToast}
          onClose={() => setResourceId(null)}
        />
      ) : null}
    </section>
  )
}
