import { useState } from 'react'
import type { AiUsageEntry, ApiConfig, Work, WorkDetail, WorldTemplate } from '../types'
import { requestFactionCouncil, type FactionCouncilResult } from '../factionCouncil'
import { Modal } from './Modal'
import { IconSparkles } from './Icons'

interface FactionCouncilModalProps {
  work: Work
  detail: WorkDetail
  worldTemplate: WorldTemplate
  api: ApiConfig
  apiReady: boolean
  initialFactionId?: string
  onRecordUsage?: (entry: AiUsageEntry) => void
  onClose: () => void
  onToast: (message: string) => void
}

export function FactionCouncilModal({
  work,
  detail,
  worldTemplate,
  api,
  apiReady,
  initialFactionId,
  onRecordUsage,
  onClose,
  onToast,
}: FactionCouncilModalProps) {
  const [factionId, setFactionId] = useState(
    initialFactionId ?? detail.factions[0]?.id ?? '',
  )
  const [topic, setTopic] = useState('')
  const [result, setResult] = useState<FactionCouncilResult | null>(null)
  const [loading, setLoading] = useState(false)
  const faction = detail.factions.find((item) => item.id === factionId)

  const run = async () => {
    if (!faction) {
      onToast('先选择一个势力')
      return
    }
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return
    }
    if (!topic.trim()) {
      onToast('写一个议事议题')
      return
    }
    setLoading(true)
    try {
      const next = await requestFactionCouncil({
        work,
        detail,
        faction,
        topic: topic.trim(),
        api,
        onRecordUsage,
      })
      setResult(next)
      onToast('势力议事推演完成')
    } catch (caught) {
      onToast(`推演失败：${caught instanceof Error ? caught.message : '请稍后重试'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="势力议事推演"
      subtitle={`${worldTemplate.terms.faction}内部的派系、资源与决策模拟`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            关闭
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={loading}>
            {loading ? '推演中…' : '开始推演'}
          </button>
        </>
      }
    >
      <div className="faction-council">
        <div className="record-form-grid">
          <label className="record-field">
            <span>势力</span>
            <select
              className="input select drawer-input"
              value={factionId}
              onChange={(event) => {
                setFactionId(event.target.value)
                setResult(null)
              }}
            >
              {detail.factions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || '未命名'}
                </option>
              ))}
            </select>
          </label>
          <label className="record-field record-field-wide">
            <span>议事议题</span>
            <textarea
              className="input drawer-textarea"
              rows={3}
              value={topic}
              placeholder="例如：太玄剑宗要求我们交出旧案卷宗，议事会怎么决定？"
              onChange={(event) => setTopic(event.target.value)}
            />
          </label>
        </div>
        <p className="drawer-hint">
          推演会读取势力档案、关键成员、资源、情报边界和对外关系，模拟派系分歧、决策、风险与下一步行动；只生成分析，不写正文。
        </p>
        {result ? (
          <div className="faction-council-result">
            <section>
              <h4>当前局势</h4>
              <p>{result.situation || '未填写'}</p>
            </section>
            {result.positions.length ? (
              <section>
                <h4>派系立场</h4>
                <div className="faction-council-positions">
                  {result.positions.map((position, index) => (
                    <div key={`${position.faction}-${index}`}>
                      <strong>{position.faction}</strong>
                      <span>{position.stance}</span>
                      {position.interests ? <p>利益：{position.interests}</p> : null}
                      {position.risk ? <p>风险：{position.risk}</p> : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            <section>
              <h4>最终决策</h4>
              <p>{result.decision || '未填写'}</p>
              {result.dissent ? <p>少数意见：{result.dissent}</p> : null}
            </section>
            {result.risks.length ? (
              <section>
                <h4>风险</h4>
                <ul>
                  {result.risks.map((risk, index) => (
                    <li key={`risk-${index}`}>{risk}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {result.nextMoves.length ? (
              <section>
                <h4>下一步行动</h4>
                <ul>
                  {result.nextMoves.map((move, index) => (
                    <li key={`move-${index}`}>{move}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {result.sceneHook ? (
              <section className="faction-council-hook">
                <h4>可直接用的场景钩子</h4>
                <p>{result.sceneHook}</p>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="faction-council-empty">
            <IconSparkles size={18} />
            <p>还在等一个议题。</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
