import { useState } from 'react'
import type {
  Chapter,
  SystemData,
  SystemLog,
  SystemReward,
  SystemTask,
  SystemTaskStatus,
  WorkDetail,
} from '../types'
import { IconPlus, IconTrash } from './Icons'
import { NumberInput } from './NumberInput'
import { useContextMenu } from './ContextMenuProvider'
import { copyTextToClipboard } from '../clipboard'

interface SystemPanelProps {
  detail: WorkDetail
  chapters: Chapter[]
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
}

const TASK_STATUSES: SystemTaskStatus[] = ['未触发', '进行中', '已完成', '已失败', '已放弃']
const TONES = ['冷淡机械', '毒舌', '温和', '神秘', '旁观者']

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function createDefaultSystem(): SystemData {
  return {
    enabled: true,
    name: '系统',
    type: '任务系统',
    visibility: '仅宿主',
    tone: '冷淡机械',
    personality:
      '只陈述事实，发布任务时简洁、不带情绪；奖励和惩罚直接给数字，不解释原因。',
    rules: '系统不能替宿主战斗，也不能直接改变世界；只发布任务、结算奖励和给出提示。',
    currencyName: '积分',
    balance: 0,
    tasks: [],
    rewards: [],
    logs: [],
  }
}

export function SystemPanel({ detail, chapters, onUpdateDetail }: SystemPanelProps) {
  const system = detail.system
  const { openContextMenu } = useContextMenu()
  const [taskDraft, setTaskDraft] = useState({ title: '', description: '' })
  const [rewardDraft, setRewardDraft] = useState({ name: '', effect: '' })
  const [logDraft, setLogDraft] = useState({ type: '任务提示', content: '' })

  const save = (next: SystemData) => onUpdateDetail({ system: next })

  if (!system || !system.enabled) {
    return (
      <div className="system-panel">
        <div className="drawer-section-head">
          <span>系统</span>
        </div>
        <p className="drawer-empty">
          当前模板启用了系统模块，但作品还没有系统数据。一个作品只允许一个系统；启用后再配置人格、任务和奖励。
        </p>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => save(createDefaultSystem())}
        >
          启用系统
        </button>
      </div>
    )
  }

  const update = (patch: Partial<SystemData>) => save({ ...system, ...patch })

  const updateTask = (id: string, patch: Partial<SystemTask>) => {
    update({
      tasks: system.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    })
  }

  const updateReward = (id: string, patch: Partial<SystemReward>) => {
    update({
      rewards: system.rewards.map((reward) =>
        reward.id === id ? { ...reward, ...patch } : reward,
      ),
    })
  }

  const addTask = () => {
    if (!taskDraft.title.trim()) return
    update({
      tasks: [
        ...system.tasks,
        {
          id: createId('task'),
          title: taskDraft.title.trim(),
          description: taskDraft.description.trim(),
          requirements: '',
          reward: '',
          penalty: '',
          status: '未触发',
        },
      ],
    })
    setTaskDraft({ title: '', description: '' })
  }

  const addReward = () => {
    if (!rewardDraft.name.trim()) return
    update({
      rewards: [
        ...system.rewards,
        {
          id: createId('reward'),
          name: rewardDraft.name.trim(),
          type: '道具',
          effect: rewardDraft.effect.trim(),
          cost: 0,
          stock: 1,
          claimed: false,
        },
      ],
    })
    setRewardDraft({ name: '', effect: '' })
  }

  const addLog = () => {
    if (!logDraft.content.trim()) return
    update({
      logs: [
        {
          id: createId('log'),
          createdAt: new Date().toISOString(),
          type: logDraft.type,
          content: logDraft.content.trim(),
        },
        ...system.logs,
      ],
    })
    setLogDraft({ type: '任务提示', content: '' })
  }

  const removeTask = (id: string) => update({ tasks: system.tasks.filter((task) => task.id !== id) })
  const removeReward = (id: string) =>
    update({ rewards: system.rewards.filter((reward) => reward.id !== id) })
  const removeLog = (id: string) => update({ logs: system.logs.filter((log) => log.id !== id) })

  return (
    <div className="system-panel">
      <div className="drawer-section-head">
        <span>系统管理</span>
        <span className="system-count">一个作品 · 一个系统</span>
      </div>
      <p className="drawer-hint">
        系统数据由作者手动管理；AI 只读取当前规则、任务和奖励，不自动改数值或新增任务。
      </p>

      <section className="system-section">
        <div className="system-section-head">
          <span>系统概览</span>
        </div>
        <div className="record-form-grid">
          <label className="record-field">
            <span>系统名称</span>
            <input
              className="input drawer-input"
              value={system.name}
              onChange={(event) => update({ name: event.target.value })}
            />
          </label>
          <label className="record-field">
            <span>系统类型</span>
            <input
              className="input drawer-input"
              value={system.type}
              onChange={(event) => update({ type: event.target.value })}
              placeholder="任务 / 签到 / 兑换 / 攻略 / 直播 / 自定义"
            />
          </label>
          <label className="record-field">
            <span>宿主</span>
            <select
              className="input select drawer-input"
              value={system.hostCharacterId ?? ''}
              onChange={(event) => update({ hostCharacterId: event.target.value || undefined })}
            >
              <option value="">未绑定</option>
              {detail.characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name || '未命名角色'}
                </option>
              ))}
            </select>
          </label>
          <label className="record-field">
            <span>公开程度</span>
            <select
              className="input select drawer-input"
              value={system.visibility}
              onChange={(event) =>
                update({ visibility: event.target.value as SystemData['visibility'] })
              }
            >
              <option value="仅宿主">仅宿主</option>
              <option value="部分公开">部分公开</option>
              <option value="公开">公开</option>
            </select>
          </label>
          <label className="record-field">
            <span>人格语气</span>
            <select
              className="input select drawer-input"
              value={system.tone}
              onChange={(event) => update({ tone: event.target.value })}
            >
              {TONES.map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </select>
          </label>
          <label className="record-field">
            <span>{system.currencyName || '积分'}余额</span>
            <NumberInput
              className="input drawer-input"
              min={0}
              value={system.balance}
              fallback={0}
              onValueChange={(value) => update({ balance: value })}
            />
          </label>
          <label className="record-field">
            <span>货币单位</span>
            <input
              className="input drawer-input"
              value={system.currencyName}
              onChange={(event) => update({ currencyName: event.target.value })}
            />
          </label>
          <div className="record-field record-field-wide">
            <span>人格预设</span>
            <div className="system-personality-presets">
              {[
                ['冷淡机械', '只陈述事实，发布任务时简洁、不带情绪；奖励和惩罚直接给数字，不解释原因。'],
                ['毒舌', '喜欢嘲讽宿主，但信息准确；关键提示会用挖苦的方式给出。'],
                ['温和', '语气耐心、带一点鼓励；失败时也不会过度惩罚，但会明确指出原因。'],
                ['神秘', '只说半句，喜欢用谜语和倒计时制造压力；不直接解释世界规则。'],
                ['旁观者', '像旁白一样记录宿主的选择，很少主动干预，偶尔给出一句评论。'],
              ].map(([tone, personality]) => (
                <button
                  key={tone}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => update({ tone, personality })}
                >
                  {tone}
                </button>
              ))}
            </div>
          </div>
          <label className="record-field record-field-wide">
            <span>系统人格</span>
            <textarea
              className="input drawer-textarea"
              rows={3}
              value={system.personality}
              onChange={(event) => update({ personality: event.target.value })}
              placeholder="系统怎么说话、怎么看待宿主、会不会撒谎"
            />
          </label>
          <label className="record-field record-field-wide">
            <span>系统规则 / 禁止事项</span>
            <textarea
              className="input drawer-textarea"
              rows={3}
              value={system.rules}
              onChange={(event) => update({ rules: event.target.value })}
              placeholder="能做什么、不能做什么、失败惩罚如何触发"
            />
          </label>
        </div>
      </section>

      <section className="system-section">
        <div className="system-section-head">
          <span>任务</span>
          <strong>{system.tasks.length}</strong>
        </div>
        <div className="system-add-row">
          <input
            className="input drawer-input"
            value={taskDraft.title}
            onChange={(event) => setTaskDraft((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="任务名"
          />
          <input
            className="input drawer-input"
            value={taskDraft.description}
            onChange={(event) =>
              setTaskDraft((prev) => ({ ...prev, description: event.target.value }))
            }
            placeholder="一句话说明"
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={addTask}>
            <IconPlus size={14} />
            添加任务
          </button>
        </div>
        {system.tasks.length === 0 ? (
          <p className="drawer-empty">还没有任务。</p>
        ) : (
          <div className="system-card-list">
            {system.tasks.map((task) => (
              <article
                className="system-card"
                key={task.id}
                onContextMenu={(event) =>
                  openContextMenu(event, [
                    { type: 'label', label: task.title || '未命名任务' },
                    {
                      label: '复制任务内容',
                      onSelect: () => {
                        void copyTextToClipboard(
                          [task.title, task.description, task.requirements, task.reward, task.penalty]
                            .filter(Boolean)
                            .join('\n'),
                        )
                      },
                    },
                    {
                      label: task.status === '已完成' ? '标记为进行中' : '标记为已完成',
                      onSelect: () =>
                        updateTask(task.id, {
                          status: task.status === '已完成' ? '进行中' : '已完成',
                        }),
                    },
                    { type: 'separator' },
                    {
                      label: '删除任务…',
                      danger: true,
                      onSelect: () => {
                        if (window.confirm(`删除任务「${task.title || '未命名任务'}」？`)) {
                          removeTask(task.id)
                        }
                      },
                    },
                  ])
                }
              >
                <div className="system-card-head">
                  <input
                    className="input drawer-input"
                    value={task.title}
                    onChange={(event) => updateTask(task.id, { title: event.target.value })}
                  />
                  <select
                    className="input select drawer-input"
                    value={task.status}
                    onChange={(event) =>
                      updateTask(task.id, { status: event.target.value as SystemTaskStatus })
                    }
                  >
                    {TASK_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="删除任务"
                    onClick={() => removeTask(task.id)}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
                <textarea
                  className="input drawer-textarea"
                  rows={2}
                  value={task.description}
                  onChange={(event) => updateTask(task.id, { description: event.target.value })}
                  placeholder="任务说明"
                />
                <div className="system-card-grid">
                  <input
                    className="input drawer-input"
                    value={task.requirements}
                    onChange={(event) =>
                      updateTask(task.id, { requirements: event.target.value })
                    }
                    placeholder="完成条件"
                  />
                  <input
                    className="input drawer-input"
                    value={task.reward}
                    onChange={(event) => updateTask(task.id, { reward: event.target.value })}
                    placeholder="奖励"
                  />
                  <input
                    className="input drawer-input"
                    value={task.penalty}
                    onChange={(event) => updateTask(task.id, { penalty: event.target.value })}
                    placeholder="失败惩罚"
                  />
                  <select
                    className="input select drawer-input"
                    value={task.chapterId ?? ''}
                    onChange={(event) =>
                      updateTask(task.id, { chapterId: event.target.value || undefined })
                    }
                  >
                    <option value="">未绑定章节</option>
                    {chapters.map((chapter, index) => (
                      <option key={chapter.id} value={chapter.id}>
                        第 {index + 1} 章 · {chapter.title || '未命名'}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="system-section">
        <div className="system-section-head">
          <span>奖励 / 兑换</span>
          <strong>{system.rewards.length}</strong>
        </div>
        <div className="system-add-row">
          <input
            className="input drawer-input"
            value={rewardDraft.name}
            onChange={(event) =>
              setRewardDraft((prev) => ({ ...prev, name: event.target.value }))
            }
            placeholder="奖励名"
          />
          <input
            className="input drawer-input"
            value={rewardDraft.effect}
            onChange={(event) =>
              setRewardDraft((prev) => ({ ...prev, effect: event.target.value }))
            }
            placeholder="效果"
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={addReward}>
            <IconPlus size={14} />
            添加奖励
          </button>
        </div>
        {system.rewards.length === 0 ? (
          <p className="drawer-empty">还没有奖励。</p>
        ) : (
          <div className="system-card-list">
            {system.rewards.map((reward) => (
              <article className="system-card" key={reward.id}>
                <div className="system-card-head">
                  <input
                    className="input drawer-input"
                    value={reward.name}
                    onChange={(event) => updateReward(reward.id, { name: event.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="删除奖励"
                    onClick={() => removeReward(reward.id)}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
                <div className="system-card-grid">
                  <input
                    className="input drawer-input"
                    value={reward.type}
                    onChange={(event) => updateReward(reward.id, { type: event.target.value })}
                    placeholder="类型"
                  />
                  <input
                    className="input drawer-input"
                    value={reward.effect}
                    onChange={(event) => updateReward(reward.id, { effect: event.target.value })}
                    placeholder="效果"
                  />
                  <NumberInput
                    className="input drawer-input"
                    min={0}
                    value={reward.cost}
                    fallback={0}
                    onValueChange={(value) => updateReward(reward.id, { cost: value })}
                  />
                  <label className="system-check">
                    <input
                      type="checkbox"
                      checked={Boolean(reward.claimed)}
                      onChange={(event) =>
                        updateReward(reward.id, { claimed: event.target.checked })
                      }
                    />
                    已领取
                  </label>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="system-section">
        <div className="system-section-head">
          <span>系统日志</span>
          <strong>{system.logs.length}</strong>
        </div>
        <div className="system-add-row">
          <select
            className="input select drawer-input"
            value={logDraft.type}
            onChange={(event) => setLogDraft((prev) => ({ ...prev, type: event.target.value }))}
          >
            {['任务提示', '奖励结算', '惩罚', '系统警告', '剧情提示'].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input
            className="input drawer-input"
            value={logDraft.content}
            onChange={(event) => setLogDraft((prev) => ({ ...prev, content: event.target.value }))}
            placeholder="日志内容"
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={addLog}>
            <IconPlus size={14} />
            记录日志
          </button>
        </div>
        {system.logs.length === 0 ? (
          <p className="drawer-empty">还没有系统日志。</p>
        ) : (
          <div className="system-log-list">
            {system.logs.map((log: SystemLog) => (
              <div className="system-log-row" key={log.id}>
                <span>{log.type}</span>
                <p>{log.content}</p>
                <small>{new Date(log.createdAt).toLocaleString()}</small>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="删除日志"
                  onClick={() => removeLog(log.id)}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
