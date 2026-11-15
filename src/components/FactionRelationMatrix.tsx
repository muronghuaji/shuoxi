import type { FactionCard, WorkDetail, WorldTemplate } from '../types'
import { factionProfileOf } from '../factionProfile'
import { Modal } from './Modal'
import { useContextMenu } from './ContextMenuProvider'
import { copyTextToClipboard } from '../clipboard'

interface FactionRelationMatrixProps {
  detail: WorkDetail
  worldTemplate: WorldTemplate
  onClose: () => void
}

function relationText(faction: FactionCard, targetId: string): string {
  const relation = factionProfileOf(faction).relations.find(
    (item) => item.targetType === 'faction' && item.targetId === targetId,
  )
  if (!relation) return '—'
  return [relation.publicStance, relation.trueStance && relation.trueStance !== relation.publicStance ? `真实：${relation.trueStance}` : '']
    .filter(Boolean)
    .join(' / ') || '未填写'
}

export function FactionRelationMatrix({
  detail,
  worldTemplate,
  onClose,
}: FactionRelationMatrixProps) {
  const factions = detail.factions
  const label = worldTemplate.terms.faction
  const { openContextMenu } = useContextMenu()
  return (
    <Modal
      title={`${label}关系矩阵`}
      subtitle="行是对外态度，列是目标势力；只读矩阵，编辑请到各势力深度档案"
      onClose={onClose}
      size="lg"
      footer={
        <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
          关闭
        </button>
      }
    >
      {factions.length === 0 ? (
        <p className="drawer-empty">还没有{label}。</p>
      ) : (
        <div className="faction-matrix-wrap">
          <table className="faction-matrix">
            <thead>
              <tr>
                <th>从 ↓ / 到 →</th>
                {factions.map((faction) => (
                  <th key={faction.id}>{faction.name || '未命名'}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {factions.map((faction) => (
                <tr key={faction.id}>
                  <th>{faction.name || '未命名'}</th>
                  {factions.map((target) => (
                    <td
                      key={target.id}
                      onContextMenu={(event) => {
                        if (faction.id === target.id) return
                        const text = relationText(faction, target.id)
                        openContextMenu(event, [
                          {
                            type: 'label',
                            label: `${faction.name || '未命名'} → ${target.name || '未命名'}`,
                          },
                          {
                            label: '复制这条关系',
                            onSelect: () => {
                              void copyTextToClipboard(
                                `${faction.name || '未命名'} → ${target.name || '未命名'}：${text}`,
                              )
                            },
                          },
                        ])
                      }}
                    >
                      {faction.id === target.id ? (
                        <span className="faction-matrix-self">自身</span>
                      ) : (
                        relationText(faction, target.id)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="drawer-hint">
        关系矩阵读取每个势力深度档案里的「对外关系」。公开态度、真实态度和秘密交易分开记录，避免把政治关系写成单一标签。
      </p>
    </Modal>
  )
}
