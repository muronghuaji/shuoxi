import { useState } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  CharacterCard,
  CreateWorkInput,
  FactionCard,
  Perspective,
  RelationshipCard,
  Work,
  WorkCreationSettings,
  WorkDetail,
} from '../types'
import { PERSPECTIVES } from '../data'
import { BUILTIN_TEMPLATES, findBuiltinTemplate } from '../worldTemplates'
import { createEmptyDetail } from '../data'
import { buildProjectSetupMessages, parseProjectSetup, type ChatUsage } from '../ai'
import {
  buildOutlineGenerateMessages,
  generatedOutlineToCards,
  parseGeneratedOutline,
} from '../outlineAi'
import { runApiTask } from '../aiTask'
import { estimateTokens } from '../utils'
import { IconArrowRight, IconSparkles } from './Icons'
import { GenrePicker } from './GenrePicker'
import { Modal } from './Modal'
import { NumberInput } from './NumberInput'

type FormErrors = Partial<
  Record<'title' | 'synopsis' | 'theme' | 'genres' | 'characterCount' | 'targetWords', string>
>

const WORD_PRESETS = [100000, 300000, 500000, 1000000]

function inferTemplateId(genres: string[], synopsis: string, theme: string): string {
  const text = `${genres.join(' ')} ${synopsis} ${theme}`
  if (/规则|怪谈|无限流|副本|积分/.test(text)) return 'rules'
  if (/末世|废土|丧尸|幸存者|营地/.test(text)) return 'wasteland'
  if (/武侠|江湖|门派|武林|侠/.test(text)) return 'wuxia'
  if (/侦探|悬疑|推理|刑侦|案件|凶手/.test(text)) return 'mystery'
  if (/言情|爱情|恋爱|暗恋|重逢|婚/.test(text)) return 'romance'
  if (/科幻|星际|赛博|机甲|未来/.test(text)) return 'scifi'
  if (/历史|古代|王朝|军|朝堂|权谋/.test(text)) return 'historical'
  if (/娱乐圈|直播|艺人|流量|热搜/.test(text)) return 'entertainment'
  if (/女性|群像|多线/.test(text)) return 'ensemble'
  if (/现实|年代|家庭|职场|都市/.test(text)) return 'urban'
  return 'generic'
}

interface NewWorkModalProps {
  initialSynopsis: string
  initialGenres: CreateWorkInput['genres']
  initialData?: Partial<CreateWorkInput>
  api: ApiConfig
  apiReady: boolean
  onRecordUsage?: (entry: AiUsageEntry) => void
  onClose: () => void
  onCreate: (data: CreateWorkInput) => void
  onSaveIdea?: (data: { title: string; synopsis: string; genres: CreateWorkInput['genres'] }) => void
}

export function NewWorkModal({
  initialSynopsis,
  initialGenres,
  initialData,
  api,
  apiReady,
  onRecordUsage,
  onClose,
  onCreate,
  onSaveIdea,
}: NewWorkModalProps) {
  const [form, setForm] = useState<CreateWorkInput>({
    title: initialData?.title ?? '',
    synopsis: initialData?.synopsis ?? initialSynopsis.slice(0, 300),
    theme: initialData?.theme ?? '',
    genres: initialData?.genres ?? initialGenres,
    outlineMode: initialData?.outlineMode ?? 'fine',
    writingMode:
      initialData?.writingMode === 'wheelchair' ? 'wheelchair' : 'director',
    perspective: initialData?.perspective ?? 'third-limited',
    characterCount: initialData?.characterCount ?? 5,
    targetWords: initialData?.targetWords ?? 100000,
    creationSettings: initialData?.creationSettings ?? {},
    characters: initialData?.characters,
    factions: initialData?.factions,
    relationships: initialData?.relationships,
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiRequirement, setAiRequirement] = useState('')
  const [aiIdea, setAiIdea] = useState(initialData?.synopsis ?? initialSynopsis.slice(0, 300))
  const [aiGenerated, setAiGenerated] = useState<{
    characters: number
    factions: number
    relationships: number
    names: string
  } | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [templateChoice, setTemplateChoice] = useState(initialData?.worldTemplateId ?? 'auto')
  const [generateOutline, setGenerateOutline] = useState(true)
  const [outlineHint, setOutlineHint] = useState('')
  const templateOptions = BUILTIN_TEMPLATES.filter(
    (template) => template.id !== 'custom' && template.id !== 'system',
  )
  const selectedTemplate =
    templateChoice === 'auto'
      ? findBuiltinTemplate(inferTemplateId(form.genres, form.synopsis, form.theme)) ??
        findBuiltinTemplate('generic')!
      : findBuiltinTemplate(templateChoice) ?? findBuiltinTemplate('generic')!

  function update<K extends keyof CreateWorkInput>(key: K, value: CreateWorkInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors({})
  }

  const updateSettings = (patch: Partial<WorkCreationSettings>) => {
    setForm((prev) => ({
      ...prev,
      creationSettings: { ...(prev.creationSettings ?? {}), ...patch },
    }))
  }

  const settingsRequirement = (settings: WorkCreationSettings | undefined): string => {
    if (!settings) return ''
    return [
      settings.style ? '文风：' + settings.style : '',
      settings.pace ? '节奏：' + settings.pace : '',
      settings.romance ? '感情线：' + settings.romance : '',
      settings.ending ? '结局倾向：' + settings.ending : '',
      settings.chapterWords ? '每章约 ' + settings.chapterWords + ' 字' : '',
      settings.avoid ? '不写：' + settings.avoid : '',
    ]
      .filter(Boolean)
      .join('；')
  }

  const generateProject = async () => {
    if (!apiReady || aiLoading) {
      if (!apiReady) setAiError('请先在设置里配置 AI 模型和 API Key。')
      return
    }
    setAiLoading(true)
    setAiError('')
    try {
      const messages = buildProjectSetupMessages({
        synopsis: aiIdea.trim() || form.synopsis,
        theme: form.theme,
        genres: form.genres,
        perspective: PERSPECTIVES.find((item) => item.value === form.perspective)?.label ?? '第三人称 · 限知',
        requirement: [aiRequirement, settingsRequirement(form.creationSettings)]
          .filter(Boolean)
          .join('\n'),
        template: selectedTemplate,
      })
      let actualUsage: ChatUsage | undefined
      let result = await runApiTask(api, { task: 'analysis.plan', messages,
        temperature: 0.85,
        maxTokens: 4000,
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      let setup = parseProjectSetup(result)
      if (!setup) {
        // 有些模型会在 JSON 前写说明、被 max_tokens 截断，或把字段写成不合法的 JSON。
        // 自动用更严格的提示重试一次，避免作者只能看到“无法解析”。
        const retryMessages = [
          ...messages,
          {
            role: 'user' as const,
            content:
              '上一次输出无法解析。请重新只输出一个完整、合法的 JSON 对象；不要 markdown、不要解释；角色最多 6 个、势力 3 个、关系 5 条，字段尽量短，确保右括号完整结束。',
          },
        ]
        actualUsage = undefined
        result = await runApiTask(api, { task: 'analysis.plan', messages: retryMessages,
          temperature: 0.45,
          maxTokens: 4000,
          onUsage: (usage) => {
            actualUsage = usage
          },
        })
        setup = parseProjectSetup(result)
      }
      if (!setup) {
        throw new Error('模型返回的设定不是完整 JSON（可能被截断或格式跑偏）。已自动重试一次，请换 V4 Pro 或缩短需求后再试。')
      }

      const now = Date.now()
      const factionIds = new Map<string, string>()
      const factions: FactionCard[] = setup.factions.map((faction, index) => {
        const id = `f-ai-${now.toString(36)}-${index}`
        factionIds.set(faction.name, id)
        return {
          id,
          name: faction.name,
          type: faction.type,
          leader: faction.leader,
          goal: '',
          description: faction.description,
        }
      })
      const characters: CharacterCard[] = setup.characters.map((character, index) => ({
        id: `c-ai-${now.toString(36)}-${index}`,
        name: character.name,
        role: character.role,
        identity: character.identity,
        personality: character.personality,
        goal: character.goal,
        sectId: character.sectName ? factionIds.get(character.sectName) : undefined,
        status: '正常',
        weapons: [],
        treasures: [],
        techniques: [],
        currency: '',
      }))
      const characterIds = new Map(
        characters.map((character) => [character.name, character.id]),
      )
      const relationships: RelationshipCard[] = setup.relationships
        .map((relationship, index) => {
          const fromId = characterIds.get(relationship.fromName)
          const toId = characterIds.get(relationship.toName)
          if (!fromId || !toId) return null
          return {
            id: `r-ai-${now.toString(36)}-${index}`,
            fromId,
            toId,
            type: relationship.type,
            note: relationship.note,
          }
        })
        .filter((relationship): relationship is RelationshipCard => Boolean(relationship))

      const nextForm: CreateWorkInput = {
        ...form,
        title: setup.title || form.title,
        synopsis: setup.synopsis || form.synopsis,
        theme: setup.theme || form.theme,
        characterCount: Math.max(1, characters.length || form.characterCount),
        worldTemplateId: selectedTemplate.id,
        characters,
        factions,
        relationships,
      }
      setForm(nextForm)
      setErrors({})

      if (generateOutline) {
        setOutlineHint('正在补故事脊椎和开篇大纲…')
        try {
          const tempWork: Work = {
            id: 'draft-new-work',
            title: nextForm.title || '未命名新戏',
            synopsis: nextForm.synopsis,
            theme: nextForm.theme,
            genres: nextForm.genres,
            outlineMode: nextForm.outlineMode,
            writingMode: nextForm.writingMode,
            perspective: nextForm.perspective,
            characterCount: nextForm.characterCount,
            targetWords: nextForm.targetWords,
            promptIds: [],
            status: '草稿',
            chapters: 1,
            words: 0,
            updatedAt: Date.now(),
            coverIndex: 0,
          }
          const tempDetail: WorkDetail = {
            ...createEmptyDetail(),
            worldTemplateId: selectedTemplate.id,
            characters,
            factions,
            relationships,
          }
          const outlineMessages = buildOutlineGenerateMessages({
            work: tempWork,
            detail: tempDetail,
            chapters: [],
            requirement: aiRequirement,
            chapterCount: 5,
          })
          let outlineUsage: ChatUsage | undefined
          const outlineRaw = await runApiTask(api, {
            task: 'analysis.plan',
            messages: outlineMessages,
            temperature: 0.55,
            maxTokens: 6500,
            onUsage: (usage) => {
              outlineUsage = usage
            },
          })
          const generatedOutline = parseGeneratedOutline(outlineRaw)
          if (!generatedOutline) throw new Error('故事脊椎 JSON 无法解析')
          const cards = generatedOutlineToCards(generatedOutline, tempDetail)
          setForm((prev) => ({
            ...prev,
            globalOutline: generatedOutline.globalOutline,
            outline: cards,
          }))
          setOutlineHint(
            `已生成故事脊椎和 ${cards.length} 章开篇大纲${generatedOutline.globalOutline.arcs.length ? ` · ${generatedOutline.globalOutline.arcs.length} 个阶段` : ''}`,
          )
          onRecordUsage?.({
            id: `outline-usage-${Date.now().toString(36)}`,
            at: Date.now(),
            kind: '大纲生成',
            profile: 'general',
            model: api.model,
            inputTokens:
              outlineUsage?.inputTokens ??
              estimateTokens(outlineMessages.map((item) => item.content).join('\n')),
            outputTokens: outlineUsage?.outputTokens ?? estimateTokens(outlineRaw),
            actual: Boolean(outlineUsage),
            note: `开戏同时生成 ${cards.length} 章大纲`,
          })
        } catch (outlineError) {
          setOutlineHint(
            `设定已生成，但大纲生成失败：${
              outlineError instanceof Error ? outlineError.message : '未知错误'
            }`,
          )
        }
      }

      setAiGenerated({
        characters: characters.length,
        factions: factions.length,
        relationships: relationships.length,
        names: characters.slice(0, 6).map((character) => character.name).join('、'),
      })
      setAdvancedOpen(true)

      if (onRecordUsage) {
        const inputText = messages.map((message) => message.content).join('\n')
        const inputTokens = actualUsage?.inputTokens ?? estimateTokens(inputText)
        const outputTokens = actualUsage?.outputTokens ?? estimateTokens(result)
        const priceInput = api.inputPrice ?? 0
        const priceOutput = api.outputPrice ?? 0
        const cost =
          actualUsage && (priceInput > 0 || priceOutput > 0)
            ? (inputTokens / 1_000_000) * priceInput +
              (outputTokens / 1_000_000) * priceOutput
            : undefined
        onRecordUsage({
          id: `usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          at: Date.now(),
          kind: '项目生成',
          profile: 'general',
          model: api.model,
          inputTokens,
          outputTokens,
          actual: Boolean(actualUsage),
          cost,
        })
      }
    } catch (caught) {
      setAiError(caught instanceof Error ? caught.message : '项目生成失败')
    } finally {
      setAiLoading(false)
    }
  }

  const validate = (): FormErrors => {
    const next: FormErrors = {}
    if (!form.title.trim()) next.title = '给这部戏起个名字'
    return next
  }

  const submit = () => {
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) {
      window.requestAnimationFrame(() => {
        const firstInvalid = next.title ? 'studio-title' : 'studio-hook'
        document.getElementById(firstInvalid)?.focus()
        document.querySelector('.new-work-studio .field-error')?.scrollIntoView({
          block: 'center',
          behavior: 'smooth',
        })
      })
      return
    }

    const synopsis =
      form.synopsis.trim() ||
      form.theme.trim() ||
      `《${form.title.trim()}》的故事。`
    onCreate({
      ...form,
      title: form.title.trim(),
      synopsis,
      theme: form.theme.trim(),
      worldTemplateId: selectedTemplate.id,
    })
  }

  return (
    <Modal
      title="开戏"
      onClose={onClose}
      size="xl"
      footer={
        <>
          {onSaveIdea ? (
            <button
              type="button"
              className="btn btn-ghost new-work-save-idea"
              onClick={() => {
                if (!form.title.trim() && !form.synopsis.trim()) {
                  setAiError('先写一个书名或一句话，再存进灵感库')
                  return
                }
                onSaveIdea({
                  title: form.title.trim(),
                  synopsis: form.synopsis.trim(),
                  genres: form.genres,
                })
              }}
            >
              <IconSparkles size={14} />
              先存为灵感
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            开始
            <IconArrowRight size={16} />
          </button>
        </>
      }
    >
      <div className="new-work-studio">
        <section className="studio-left">
          <div className="studio-eyebrow">
            <IconSparkles size={14} />
            AI 托管 · 懒人开戏
          </div>
          <h2>一句话，开一部戏</h2>
          <p className="studio-lede">
            把想法丢给 AI，书名、班底、关系和简介一次配好。生成的每一条都可以再改。
          </p>

          <label className="studio-hook-label" htmlFor="studio-hook">
            你的想法（只用于 AI 生成，可留空）
          </label>
          <textarea
            id="studio-hook"
            className="studio-hook"
            value={aiIdea}
            onChange={(event) => setAiIdea(event.target.value)}
            rows={5}
            maxLength={300}
            autoFocus
            placeholder="例如：一个押了三年姓的人，替人写名字，唯独自己的那页空白。"
          />
          <div className="studio-hook-foot">
            <span>谁想要什么，被什么拦住</span>
            <span>{form.synopsis.length} / 300</span>
          </div>

          <label className="studio-extra-label" htmlFor="studio-extra">
            还想补充什么（可选）
          </label>
          <textarea
            id="studio-extra"
            className="input textarea studio-extra-input"
            value={aiRequirement}
            onChange={(event) => setAiRequirement(event.target.value)}
            rows={3}
            placeholder="例如：偏悬疑，主角是女性，少用金手指；也可以写你脑中的画面、关系或想要的名场面。"
          />

          <div className="studio-vibe-row">
            <span>想要的调性</span>
            {['电影感', '强冲突', '慢热', '轻松'].map((vibe) => (
              <button
                type="button"
                key={vibe}
                className="studio-vibe"
                onClick={() => setAiRequirement((prev) => (prev ? prev + '，' : '') + vibe)}
              >
                {vibe}
              </button>
            ))}
          </div>

          <label className="studio-outline-toggle">
            <input
              type="checkbox"
              checked={generateOutline}
              onChange={(event) => setGenerateOutline(event.target.checked)}
            />
            <span>同时生成故事脊椎 + 前 5 章大纲</span>
          </label>

          <button
            type="button"
            className="studio-generate"
            disabled={aiLoading || !apiReady}
            onClick={() => void generateProject()}
          >
            <IconSparkles size={17} />
            {aiLoading ? '正在把整部戏配好…' : '一键生成整部戏'}
          </button>
          <p className="studio-ai-hint">
            {apiReady ? '什么都不写也可以，AI 会从补充要求里替你想一个开头。' : '先在设置里配置通用 AI。'}
          </p>
          {aiError ? <p className="field-error">{aiError}</p> : null}

          <div className="studio-manual-note">
            不用 AI 也可以：右边填书名就能开始；这里的想法可以留空。
          </div>
        </section>

        <section className="studio-right">
          <div className="studio-right-head">
            <div>
              <span>新戏预览</span>
              <small>{aiGenerated ? 'AI 已配好，可继续修改' : '可边写边补'}</small>
            </div>
            {aiGenerated ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void generateProject()}>
                换一版
              </button>
            ) : null}
          </div>

          <label className="studio-field">
            <span>书名</span>
            <input
              id="studio-title"
              className={`input studio-title-input ${errors.title ? 'invalid' : ''}`}
              value={form.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder="给这本书起个名字"
              maxLength={40}
            />
            {errors.title ? <small className="field-error">{errors.title}</small> : null}
          </label>

          <div className="studio-two-col">
            <label className="studio-field">
              <span>题材</span>
              <GenrePicker
                value={form.genres}
                onChange={(genres) => update('genres', genres)}
                invalid={Boolean(errors.genres)}
              />
            </label>
            <label className="studio-field">
              <span>怎么写</span>
              <div className="studio-mode-row">
                <button
                  type="button"
                  className={`studio-mode ${form.writingMode === 'director' ? 'active' : ''}`}
                  onClick={() => update('writingMode', 'director')}
                >
                  导演模式
                </button>
                <button
                  type="button"
                  className={`studio-mode ${form.writingMode === 'wheelchair' ? 'active' : ''}`}
                  onClick={() => update('writingMode', 'wheelchair')}
                >
                  轮椅模式
                </button>
              </div>
            </label>
          </div>

          <label className="studio-field">
            <span>题材模板</span>
            <select
              className="input select"
              value={templateChoice}
              onChange={(event) => setTemplateChoice(event.target.value)}
            >
              <option value="auto">自动判断（{selectedTemplate.name}）</option>
              {templateOptions.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {selectedTemplate.story ? (
              <small className="studio-template-hint">
                {selectedTemplate.story.engine}
              </small>
            ) : null}
          </label>

          <label className="studio-field">
            <span>简介</span>
            <textarea
              className="input textarea"
              value={form.synopsis}
              onChange={(event) => update('synopsis', event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="用一两句话介绍这本书；可以留空，开始后再补。"
            />
            {errors.synopsis ? (
              <small className="field-error">{errors.synopsis}</small>
            ) : null}
          </label>

          {aiGenerated ? (
            <div className="studio-generated">
              <div className="studio-generated-head">
                <span>AI 已生成</span>
                <small>{aiGenerated.characters} 人 · {aiGenerated.factions} 势力 · {aiGenerated.relationships} 条关系</small>
              </div>
              {form.characters?.length ? (
                <div className="studio-cast">
                  {form.characters.slice(0, 8).map((character) => (
                    <span className="studio-cast-chip" key={character.id}>
                      {character.name}
                      <small>{character.role}</small>
                    </span>
                  ))}
                </div>
              ) : null}
              {form.factions?.length ? (
                <p className="studio-generated-note">
                  势力：{form.factions.slice(0, 5).map((faction) => faction.name).join('、')}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="studio-empty-cast">
              <IconSparkles size={18} />
              <span>班底还没配。可以一键生成，也可以之后在作品详情里补。</span>
            </div>
          )}

          {outlineHint ? <p className="studio-outline-hint">{outlineHint}</p> : null}

          {form.outline?.length ? (
            <details className="studio-outline-preview" open>
              <summary>
                <span>开篇大纲</span>
                <small>{form.outline.length} 章</small>
              </summary>
              {form.globalOutline?.premise ? (
                <p className="studio-spine">故事脊椎：{form.globalOutline.premise}</p>
              ) : null}
              <div className="studio-outline-list">
                {form.outline.slice(0, 5).map((card, index) => (
                  <div key={card.id}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{card.title || '未命名章节'}</strong>
                    <small>{card.summary || card.goal || '待补充'}</small>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <details
            className="new-work-advanced studio-advanced"
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
          >
            <summary>
              <span>更多设定</span>
              <small>文风、节奏、感情线、每章字数</small>
            </summary>
            <div className="studio-two-col">
              <label className="studio-field">
                <span>从谁的眼睛看</span>
                <select
                  className="input select"
                  value={form.perspective}
                  onChange={(event) => update('perspective', event.target.value as Perspective)}
                >
                  {PERSPECTIVES.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="studio-field">
                <span>班底人数</span>
                <NumberInput
                  className="input"
                  min={1}
                  max={99}
                  value={form.characterCount}
                  fallback={5}
                  onValueChange={(value) => update('characterCount', value)}
                />
              </label>
            </div>
            <div className="studio-two-col">
              <label className="studio-field">
                <span>文风</span>
                <select className="input select" value={form.creationSettings?.style ?? ''} onChange={(event) => updateSettings({ style: event.target.value })}>
                  <option value="">不指定</option>
                  <option value="克制白描">克制白描</option>
                  <option value="电影感">电影感</option>
                  <option value="冷硬悬疑">冷硬悬疑</option>
                  <option value="网文快节奏">网文快节奏</option>
                  <option value="轻小说口语">轻小说口语</option>
                  <option value="温暖治愈">温暖治愈</option>
                </select>
              </label>
              <label className="studio-field">
                <span>节奏</span>
                <select className="input select" value={form.creationSettings?.pace ?? ''} onChange={(event) => updateSettings({ pace: event.target.value })}>
                  <option value="">均衡</option>
                  <option value="慢热">慢热</option>
                  <option value="快节奏">快节奏</option>
                </select>
              </label>
            </div>
            <div className="studio-two-col">
              <label className="studio-field">
                <span>感情线</span>
                <select className="input select" value={form.creationSettings?.romance ?? ''} onChange={(event) => updateSettings({ romance: event.target.value })}>
                  <option value="">不指定</option>
                  <option value="无感情线">无感情线</option>
                  <option value="轻感情线">轻感情线</option>
                  <option value="主线感情">主线感情</option>
                  <option value="群像关系">群像关系</option>
                </select>
              </label>
              <label className="studio-field">
                <span>结局倾向</span>
                <select className="input select" value={form.creationSettings?.ending ?? ''} onChange={(event) => updateSettings({ ending: event.target.value })}>
                  <option value="">先不定</option>
                  <option value="HE">HE</option>
                  <option value="BE">BE</option>
                  <option value="开放式">开放式</option>
                </select>
              </label>
            </div>
            <div className="studio-two-col">
              <label className="studio-field">
                <span>主题（可后补）</span>
                <input className="input" value={form.theme} onChange={(event) => update('theme', event.target.value)} placeholder="这本书想表达什么" />
              </label>
              <label className="studio-field">
                <span>每章字数</span>
                <NumberInput className="input" min={500} step={100} value={form.creationSettings?.chapterWords ?? 2500} fallback={2500} onValueChange={(value) => updateSettings({ chapterWords: value })} />
              </label>
            </div>
            <label className="studio-field">
              <span>雷点 / 不写什么</span>
              <textarea className="input textarea" rows={2} value={form.creationSettings?.avoid ?? ''} onChange={(event) => updateSettings({ avoid: event.target.value })} placeholder="例如：不写后宫、不写系统、不写主角恋爱" />
            </label>

            <label className="studio-field">
              <span>目标字数</span>
              <div className="studio-word-row">
                {WORD_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset}
                    className={`chip ${form.targetWords === preset ? 'chip-active' : ''}`}
                    onClick={() => update('targetWords', preset)}
                  >
                    {preset / 10000} 万
                  </button>
                ))}
                <label className="studio-word-custom">
                  <span>自定义</span>
                  <NumberInput
                    className="input"
                    min={1000}
                    step={1000}
                    value={form.targetWords}
                    fallback={100000}
                    onValueChange={(value) => update('targetWords', value)}
                  />
                  <span>字</span>
                </label>
              </div>
              <small className="studio-word-hint">约 {(form.targetWords / 10000).toFixed(1)} 万字</small>
            </label>
          </details>

          <p className="studio-foot-note">
            开始后进入写作页；世界观、角色和大纲都可以在「作品详情」里继续补充。
          </p>
        </section>
      </div>
    </Modal>
  )
}
