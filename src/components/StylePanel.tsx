import { useMemo, useState } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  Chapter,
  Work,
  WorkDetail,
  WorkStyle,
} from '../types'
import type { ChatUsage } from '../ai'
import { buildGenerationMessages } from '../ai'
import { runApiTask } from '../aiTask'
import { STYLE_TONE_OPTIONS } from '../data'
import {
  analyzeStyleDrift,
  applyStylePreset,
  buildStyleAnalysisMessages,
  buildStylePreview,
  formatStyleCard,
  normalizeStyle,
  parseStyleAnalysis,
  STYLE_ANTI_AI_PATTERNS,
  STYLE_COMEDY_DENSITY_OPTIONS,
  STYLE_COMEDY_TYPE_OPTIONS,
  STYLE_EMOTION_INTENSITY_OPTIONS,
  STYLE_EMOTION_OPTIONS,
  STYLE_FOCUS_OPTIONS,
  STYLE_HOOK_OPTIONS,
  STYLE_METAPHOR_DENSITY_OPTIONS,
  STYLE_METAPHOR_SOURCE_OPTIONS,
  STYLE_NARRATION_OPTIONS,
  STYLE_PACING_MODE_OPTIONS,
  STYLE_PARAGRAPH_OPTIONS,
  STYLE_PRESETS,
  STYLE_PRESET_CATEGORIES,
  STYLE_PROMISE_OPTIONS,
  STYLE_RHYTHM_OPTIONS,
  STYLE_SATISFACTION_OPTIONS,
  STYLE_STRENGTH_OPTIONS,
  STYLE_SUBTEXT_OPTIONS,
  STYLE_TROPE_OPTIONS,
  styleWarnings,
} from '../styleProfile'

interface StylePanelProps {
  work: Work
  detail: WorkDetail
  chapters: Chapter[]
  activeChapterId: string
  api: ApiConfig
  apiReady: boolean
  onUpdateDetail: (patch: Partial<WorkDetail>) => void
  onUpdateChapter: (chapterId: string, patch: Partial<Chapter>) => void
  onRecordUsage?: (entry: AiUsageEntry) => void
  onToast: (message: string) => void
}

const TRIAL_DIRECTIVE =
  '这是一段风格试写，不是正式正文。用当前作品文风写约 200 字，写一个有具体动作、有场景、有角色反应的片段；不要标题、不要解释、不要总结。'

function copyText(text: string, onToast: (message: string) => void) {
  if (!text) return
  void navigator.clipboard.writeText(text).then(
    () => onToast('已复制'),
    () => onToast('复制失败'),
  )
}

function optionLabel<T extends string>(
  options: { value: T; label: string }[],
  value: T | undefined,
): string {
  return options.find((item) => item.value === value)?.label ?? '未设定'
}

export function StylePanel({
  work,
  detail,
  chapters,
  activeChapterId,
  api,
  apiReady,
  onUpdateDetail,
  onUpdateChapter,
  onRecordUsage,
  onToast,
}: StylePanelProps) {
  const style = normalizeStyle(detail.style)
  const activeChapter = chapters.find((chapter) => chapter.id === activeChapterId)
  const chapterOverride = activeChapter?.styleOverride
  const preview = buildStylePreview(style, chapterOverride)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [trialLoading, setTrialLoading] = useState(false)
  const [trialText, setTrialText] = useState('')
  const [abPresetId, setAbPresetId] = useState(
    STYLE_PRESETS.find((preset) => preset.id !== style.presetId)?.id ?? 'literary',
  )
  const [abA, setAbA] = useState('')
  const [abB, setAbB] = useState('')
  const [presetCategory, setPresetCategory] = useState<string>('全部')
  const warnings = styleWarnings(style)
  const visiblePresets =
    presetCategory === '全部'
      ? STYLE_PRESETS
      : STYLE_PRESETS.filter((preset) => (preset.category ?? '经典') === presetCategory)
  const drift = useMemo(
    () => analyzeStyleDrift(chapters.slice(-10).map((chapter) => chapter.content)),
    [chapters],
  )

  const updateStyle = (patch: Partial<WorkStyle>) => {
    onUpdateDetail({ style: normalizeStyle({ ...style, ...patch }) })
  }

  const applyPreset = (presetId: string) => {
    updateStyle(applyStylePreset(style, presetId))
  }

  const toggleTone = (tone: string) => {
    updateStyle({
      tone: style.tone.includes(tone)
        ? style.tone.filter((item) => item !== tone)
        : [...style.tone, tone],
    })
  }

  const togglePromise = (promise: NonNullable<WorkStyle['readerPromise']>[number]) => {
    const current = style.readerPromise ?? []
    if (current.includes(promise)) {
      updateStyle({ readerPromise: current.filter((item) => item !== promise) })
      return
    }
    if (current.length >= 3) {
      onToast('读者承诺最多选 3 个；先取消一个再选')
      return
    }
    updateStyle({ readerPromise: [...current, promise] })
  }

  const toggleFocus = (focus: NonNullable<WorkStyle['descriptionFocus']>[number]) => {
    const current = style.descriptionFocus ?? []
    if (current.includes(focus)) {
      updateStyle({ descriptionFocus: current.filter((item) => item !== focus) })
      return
    }
    if (current.length >= 2) {
      onToast('描写焦点最多选 2 个；先取消一个再选')
      return
    }
    updateStyle({ descriptionFocus: [...current, focus] })
  }

  const toggleAntiAi = (pattern: string) => {
    const current = style.antiAi ?? []
    updateStyle({
      antiAi: current.includes(pattern)
        ? current.filter((item) => item !== pattern)
        : [...current, pattern],
    })
  }

  const analyzeSample = async () => {
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return
    }
    const sample =
      (style.sampleText ?? '').trim() ||
      chapters
        .map((chapter) => chapter.content)
        .filter((content) => content.trim())
        .slice(-3)
        .join('\n\n')
        .slice(0, 6000)
    if (!sample) {
      onToast('先粘贴一段样文，或让作品里有正文')
      return
    }
    setAnalysisLoading(true)
    try {
      let actualUsage: ChatUsage | undefined
      const result = await runApiTask(api, {
        task: 'analysis.plan',
        messages: buildStyleAnalysisMessages({
          workTitle: work.title,
          genres: work.genres,
          sample,
        }),
        temperature: 0.2,
        maxTokens: 900,
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      const parsed = parseStyleAnalysis(result)
      if (!parsed) throw new Error('模型没有返回可解析的风格 JSON')
      const focus = (parsed.descriptionFocus ?? [])
        .map((item) => optionLabel(STYLE_FOCUS_OPTIONS, item))
        .join('、')
      const brief = [
        parsed.tone?.length ? `文风：${parsed.tone.join('、')}` : '',
        `镜头：${optionLabel(STYLE_NARRATION_OPTIONS, parsed.narrationDistance)}`,
        `句式：${optionLabel(STYLE_RHYTHM_OPTIONS, parsed.sentenceRhythm)}`,
        focus ? `焦点：${focus}` : '',
        parsed.notes ? `建议：${parsed.notes}` : '',
      ]
        .filter(Boolean)
        .join('；')
      onUpdateDetail({
        style: normalizeStyle({
          ...style,
          ...parsed,
          sampleText: style.sampleText || sample.slice(0, 1200),
          sampleSource: style.sampleText ? 'pasted' : 'chapters',
          sampleAnalysis: brief.slice(0, 400),
        }),
      })
      if (onRecordUsage) {
        onRecordUsage({
          id: `style-analysis-${Date.now()}`,
          at: Date.now(),
          kind: '风格分析',
          model: api.model,
          inputTokens: Math.ceil(sample.length / 1.5),
          outputTokens: Math.ceil(result.length / 1.5),
          note: '分析参考样文',
          actual: Boolean(actualUsage),
        })
      }
      onToast('已从样文提取风格卡')
    } catch (caught) {
      onToast(`风格分析失败：${caught instanceof Error ? caught.message : '请稍后重试'}`)
    } finally {
      setAnalysisLoading(false)
    }
  }

  const generateTrial = async (
    styleVariant: WorkStyle,
    label: string,
    includeChapterOverride = true,
  ): Promise<string> => {
    const fallbackChapter: Chapter = {
      id: 'style-trial',
      title: '风格试写',
      content: '',
      updatedAt: Date.now(),
    }
    const base = activeChapter ?? fallbackChapter
    const messages = buildGenerationMessages({
      work,
      detail: { ...detail, style: styleVariant },
      chapters,
      chapter: {
        ...base,
        styleOverride: includeChapterOverride ? base.styleOverride : undefined,
      },
      baseContent: base.content,
      directive: TRIAL_DIRECTIVE,
      prompts: [],
    })
    let actualUsage: ChatUsage | undefined
    const text = await runApiTask(api, { task: 'writing.selection-edit', messages,
      temperature: 0.85,
      maxTokens: 500,
      onUsage: (usage) => {
        actualUsage = usage
      },
    })
    if (onRecordUsage) {
      onRecordUsage({
        id: `style-trial-${label}-${Date.now()}`,
        at: Date.now(),
        kind: '风格试写',
        model: api.model,
        inputTokens: Math.ceil(messages.map((message) => message.content).join('\n').length / 1.5),
        outputTokens: Math.ceil(text.length / 1.5),
        note: label,
        actual: Boolean(actualUsage),
      })
    }
    return text.trim()
  }

  const runTrial = async () => {
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return
    }
    setTrialLoading(true)
    setTrialText('')
    setAbA('')
    setAbB('')
    try {
      setTrialText(await generateTrial(style, '试写'))
      onToast('风格试写完成')
    } catch (caught) {
      onToast(`试写失败：${caught instanceof Error ? caught.message : '请稍后重试'}`)
    } finally {
      setTrialLoading(false)
    }
  }

  const runAb = async () => {
    if (!apiReady) {
      onToast('请先配置 AI 模型和 API Key')
      return
    }
    setTrialLoading(true)
    setTrialText('')
    setAbA('')
    setAbB('')
    try {
      const alternative = applyStylePreset(style, effectiveAbPresetId)
      setAbA(await generateTrial(style, 'A 当前风格', false))
      setAbB(await generateTrial(alternative, 'B 对比预设', false))
      onToast('A/B 试写完成：A 当前，B 对比预设')
    } catch (caught) {
      onToast(`A/B 试写失败：${caught instanceof Error ? caught.message : '请稍后重试'}`)
    } finally {
      setTrialLoading(false)
    }
  }

  const effectiveAbPresetId =
    abPresetId === style.presetId
      ? (STYLE_PRESETS.find((preset) => preset.id !== style.presetId)?.id ?? 'literary')
      : abPresetId

  const patchOverride = (patch: Partial<WorkStyle>) => {
    if (!activeChapter) return
    const next: Partial<WorkStyle> = { ...(chapterOverride ?? {}) }
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        delete next[key as keyof WorkStyle]
      } else {
        ;(next as Record<string, unknown>)[key] = value
      }
    }
    onUpdateChapter(activeChapter.id, {
      styleOverride: Object.keys(next).length > 0 ? next : undefined,
    })
  }

  return (
    <div className="style-panel">
      <div className="style-hero style-span-2">
        <div>
          <span className="style-kicker">文风控制台</span>
          <h3>让文字有自己的呼吸</h3>
          <p>
            预设决定方向，叙事镜头决定距离，参考样文决定“像不像”。风格只作用于叙述；对白仍优先角色自己的语言档案。
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => copyText(preview, onToast)}
          title="复制 AI 实际读到的文风卡"
        >
          复制 AI 文风卡
        </button>
      </div>

      <section className="style-section style-span-2 style-preset-section">
        <div className="style-section-head">
          <div>
            <strong>风格预设</strong>
            <span>先选一个起点，再逐项微调；预设不会锁死</span>
          </div>
          {style.presetId ? (
            <small>{STYLE_PRESETS.find((preset) => preset.id === style.presetId)?.name}</small>
          ) : null}
        </div>
        <div className="style-preset-filter">
          {['全部', ...STYLE_PRESET_CATEGORIES].map((category) => (
            <button
              key={category}
              type="button"
              className={`chip ${presetCategory === category ? 'chip-active' : ''}`}
              onClick={() => setPresetCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
        <div className="style-preset-grid">
          {visiblePresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`style-preset-card ${style.presetId === preset.id ? 'active' : ''}`}
              onClick={() => applyPreset(preset.id)}
            >
              <span>{preset.name}</span>
              <small>{preset.summary}</small>
              {preset.category ? <em>{preset.category}</em> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="style-section">
        <div className="style-section-head">
          <div>
            <strong>文风与强度</strong>
            <span>关键词是方向，强度决定 AI 执行到多深</span>
          </div>
        </div>
        <div className="chip-row style-tone-row">
          {STYLE_TONE_OPTIONS.map((tone) => (
            <button
              key={tone}
              type="button"
              className={`chip ${style.tone.includes(tone) ? 'chip-active' : ''}`}
              aria-pressed={style.tone.includes(tone)}
              onClick={() => toggleTone(tone)}
            >
              {tone}
            </button>
          ))}
        </div>
        <div className="style-segment-row">
          <span>风格强度</span>
          <div className="style-segment">
            {STYLE_STRENGTH_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={style.strength === option.value ? 'active' : ''}
                title={option.hint}
                onClick={() => updateStyle({ strength: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="style-three-col">
          <label className="style-field">
            <span>节奏</span>
            <select
              className="input select drawer-input"
              value={style.pace}
              onChange={(event) => updateStyle({ pace: event.target.value as WorkStyle['pace'] })}
            >
              {['慢', '中', '快'].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="style-field">
            <span>对白密度</span>
            <select
              className="input select drawer-input"
              value={style.dialogue}
              onChange={(event) =>
                updateStyle({ dialogue: event.target.value as WorkStyle['dialogue'] })
              }
            >
              {['少', '中', '多'].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="style-field">
            <span>描写密度</span>
            <select
              className="input select drawer-input"
              value={style.description}
              onChange={(event) =>
                updateStyle({ description: event.target.value as WorkStyle['description'] })
              }
            >
              {['克制', '适中', '细腻'].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="style-section style-span-2">
        <div className="style-section-head">
          <div>
            <strong>读者承诺与套路</strong>
            <span>先决定读者为什么追更，再决定是正写还是反着写</span>
          </div>
        </div>
        <div className="style-focus-block">
          <span>读者承诺（最多 3 个）</span>
          <div className="chip-row">
            {STYLE_PROMISE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`chip ${style.readerPromise?.includes(option.value) ? 'chip-active' : ''}`}
                title={option.hint}
                aria-pressed={style.readerPromise?.includes(option.value) ?? false}
                onClick={() => togglePromise(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="style-three-col">
          <label className="style-field">
            <span>套路模式</span>
            <select
              className="input select drawer-input"
              value={style.tropeMode}
              onChange={(event) =>
                updateStyle({ tropeMode: event.target.value as WorkStyle['tropeMode'] })
              }
            >
              {STYLE_TROPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} title={option.hint}>
                  {option.label}
                </option>
              ))}
            </select>
            <small>{STYLE_TROPE_OPTIONS.find((item) => item.value === style.tropeMode)?.hint}</small>
          </label>
          <label className="style-field">
            <span>爽点类型</span>
            <select
              className="input select drawer-input"
              value={style.satisfactionType}
              onChange={(event) =>
                updateStyle({
                  satisfactionType: event.target.value as WorkStyle['satisfactionType'],
                })
              }
            >
              {STYLE_SATISFACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} title={option.hint}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="style-field">
            <span>节奏模式</span>
            <select
              className="input select drawer-input"
              value={style.pacingMode}
              onChange={(event) =>
                updateStyle({ pacingMode: event.target.value as WorkStyle['pacingMode'] })
              }
            >
              {STYLE_PACING_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} title={option.hint}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {warnings.length > 0 ? (
          <div className="style-warning-list">
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="style-section style-span-2">
        <div className="style-section-head">
          <div>
            <strong>喜剧与情绪</strong>
            <span>搞笑不是加梗；先选笑点来源，再控制密度和情绪强度</span>
          </div>
        </div>
        <div className="style-three-col">
          <label className="style-field">
            <span>喜剧类型</span>
            <select
              className="input select drawer-input"
              value={style.comedyType}
              onChange={(event) =>
                updateStyle({ comedyType: event.target.value as WorkStyle['comedyType'] })
              }
            >
              {STYLE_COMEDY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} title={option.hint}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="style-field">
            <span>喜剧密度</span>
            <select
              className="input select drawer-input"
              value={style.comedyDensity}
              onChange={(event) =>
                updateStyle({
                  comedyDensity: event.target.value as WorkStyle['comedyDensity'],
                })
              }
            >
              {STYLE_COMEDY_DENSITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} title={option.hint}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="style-field">
            <span>情绪强度</span>
            <select
              className="input select drawer-input"
              value={style.emotionIntensity}
              onChange={(event) =>
                updateStyle({
                  emotionIntensity: event.target.value as WorkStyle['emotionIntensity'],
                })
              }
            >
              {STYLE_EMOTION_INTENSITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} title={option.hint}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="style-section">
        <div className="style-section-head">
          <div>
            <strong>叙事镜头</strong>
            <span>距离、句式、段落和描写焦点</span>
          </div>
        </div>
        <div className="style-three-col">
          <label className="style-field">
            <span>叙事距离</span>
            <select
              className="input select drawer-input"
              value={style.narrationDistance}
              onChange={(event) =>
                updateStyle({
                  narrationDistance: event.target.value as WorkStyle['narrationDistance'],
                })
              }
            >
              {STYLE_NARRATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} title={option.hint}>
                  {option.label}
                </option>
              ))}
            </select>
            <small>
              {optionLabel(STYLE_NARRATION_OPTIONS, style.narrationDistance)}：
              {STYLE_NARRATION_OPTIONS.find((item) => item.value === style.narrationDistance)?.hint}
            </small>
          </label>
          <label className="style-field">
            <span>句式节奏</span>
            <select
              className="input select drawer-input"
              value={style.sentenceRhythm}
              onChange={(event) =>
                updateStyle({
                  sentenceRhythm: event.target.value as WorkStyle['sentenceRhythm'],
                })
              }
            >
              {STYLE_RHYTHM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="style-field">
            <span>段落密度</span>
            <select
              className="input select drawer-input"
              value={style.paragraphDensity}
              onChange={(event) =>
                updateStyle({
                  paragraphDensity: event.target.value as WorkStyle['paragraphDensity'],
                })
              }
            >
              {STYLE_PARAGRAPH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="style-focus-block">
          <span>描写焦点（最多 2 个）</span>
          <div className="chip-row">
            {STYLE_FOCUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`chip ${style.descriptionFocus?.includes(option.value) ? 'chip-active' : ''}`}
                aria-pressed={style.descriptionFocus?.includes(option.value) ?? false}
                title={option.hint}
                onClick={() => toggleFocus(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="style-section">
        <div className="style-section-head">
          <div>
            <strong>语言质感</strong>
            <span>情绪怎么说、对白藏多少、比喻从哪里来</span>
          </div>
        </div>
        <div className="style-three-col">
          <label className="style-field">
            <span>情绪表达</span>
            <select
              className="input select drawer-input"
              value={style.emotionExpression}
              onChange={(event) =>
                updateStyle({
                  emotionExpression: event.target.value as WorkStyle['emotionExpression'],
                })
              }
            >
              {STYLE_EMOTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="style-field">
            <span>对白潜台词</span>
            <select
              className="input select drawer-input"
              value={style.dialogueSubtext}
              onChange={(event) =>
                updateStyle({
                  dialogueSubtext: event.target.value as WorkStyle['dialogueSubtext'],
                })
              }
            >
              {STYLE_SUBTEXT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="style-field">
            <span>章末钩子</span>
            <select
              className="input select drawer-input"
              value={style.hookType}
              onChange={(event) =>
                updateStyle({ hookType: event.target.value as WorkStyle['hookType'] })
              }
            >
              {STYLE_HOOK_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="style-three-col style-three-col-two">
          <label className="style-field">
            <span>比喻密度</span>
            <select
              className="input select drawer-input"
              value={style.metaphorDensity}
              onChange={(event) =>
                updateStyle({
                  metaphorDensity: event.target.value as WorkStyle['metaphorDensity'],
                })
              }
            >
              {STYLE_METAPHOR_DENSITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="style-field">
            <span>意象来源</span>
            <select
              className="input select drawer-input"
              value={style.metaphorSource}
              onChange={(event) =>
                updateStyle({
                  metaphorSource: event.target.value as WorkStyle['metaphorSource'],
                })
              }
            >
              {STYLE_METAPHOR_SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="style-section">
        <div className="style-section-head">
          <div>
            <strong>参考样文</strong>
            <span>粘贴 300–800 字，AI 提炼成可执行的风格卡；不会每次把整段样文塞进上下文</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void analyzeSample()}
            disabled={analysisLoading}
          >
            {analysisLoading ? '分析中…' : '从样文分析风格'}
          </button>
        </div>
        <textarea
          className="input drawer-textarea style-sample-input"
          rows={6}
          value={style.sampleText}
          onChange={(event) =>
            updateStyle({ sampleText: event.target.value, sampleSource: 'pasted' })
          }
          placeholder="粘贴你想靠近的叙述样文。建议选 1–3 段有动作、有环境、有对白的段落。"
        />
        {style.sampleAnalysis ? (
          <div className="style-analysis-box">
            <span>AI 提炼的风格卡</span>
            <p>{style.sampleAnalysis}</p>
          </div>
        ) : null}
      </section>

      <section className="style-section">
        <div className="style-section-head">
          <div>
            <strong>禁用与 AI 味</strong>
            <span>具体规则比“冷峻”这种形容词更能约束模型</span>
          </div>
          <small>{style.antiAi?.length ?? 0} 条已启用</small>
        </div>
        <div className="style-anti-list">
          {STYLE_ANTI_AI_PATTERNS.map((pattern) => (
            <label key={pattern} className="style-anti-item">
              <input
                type="checkbox"
                checked={style.antiAi?.includes(pattern) ?? false}
                onChange={() => toggleAntiAi(pattern)}
              />
              <span>{pattern}</span>
            </label>
          ))}
        </div>
        <label className="style-field">
          <span>内容禁区 / 禁用元素</span>
          <textarea
            className="input drawer-textarea"
            rows={2}
            value={style.taboos}
            onChange={(event) => updateStyle({ taboos: event.target.value })}
            placeholder="例如：不要巧合推进、不要网络梗、不要替读者总结情绪。"
          />
        </label>
        <label className="style-field">
          <span>补充要求</span>
          <textarea
            className="input drawer-textarea"
            rows={2}
            value={style.notes}
            onChange={(event) => updateStyle({ notes: event.target.value })}
            placeholder="例如：重要信息尽量藏在动作和物件里。"
          />
        </label>
      </section>

      {activeChapter ? (
        <section className="style-section style-scene-override">
          <div className="style-section-head">
            <div>
              <strong>当前章节场景覆盖</strong>
              <span>{activeChapter.title || '当前章节'}：只影响这一章，优先级高于全局文风</span>
            </div>
            {chapterOverride && Object.keys(chapterOverride).length > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onUpdateChapter(activeChapter.id, { styleOverride: undefined })}
              >
                清除覆盖
              </button>
            ) : null}
          </div>
          <div className="style-three-col">
            <label className="style-field">
              <span>叙事距离</span>
              <select
                className="input select drawer-input"
                value={chapterOverride?.narrationDistance ?? ''}
                onChange={(event) =>
                  patchOverride({
                    narrationDistance: (event.target.value ||
                      undefined) as WorkStyle['narrationDistance'],
                  })
                }
              >
                <option value="">跟随全局</option>
                {STYLE_NARRATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="style-field">
              <span>节奏</span>
              <select
                className="input select drawer-input"
                value={chapterOverride?.pace ?? ''}
                onChange={(event) =>
                  patchOverride({
                    pace: (event.target.value || undefined) as WorkStyle['pace'],
                  })
                }
              >
                <option value="">跟随全局</option>
                {['慢', '中', '快'].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="style-field">
              <span>情绪表达</span>
              <select
                className="input select drawer-input"
                value={chapterOverride?.emotionExpression ?? ''}
                onChange={(event) =>
                  patchOverride({
                    emotionExpression: (event.target.value ||
                      undefined) as WorkStyle['emotionExpression'],
                  })
                }
              >
                <option value="">跟随全局</option>
                {STYLE_EMOTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="style-field">
            <span>本章补充</span>
            <textarea
              className="input drawer-textarea"
              rows={2}
              value={chapterOverride?.notes ?? ''}
              onChange={(event) => patchOverride({ notes: event.target.value })}
              placeholder="例如：这一章打斗多，短句和动作优先。"
            />
          </label>
        </section>
      ) : null}

      <section className="style-section style-span-2 style-preview-section">
        <div className="style-section-head">
          <div>
            <strong>AI 文风卡预览</strong>
            <span>模型每次真正读到的内容；当前章节覆盖会合并进来</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => copyText(preview, onToast)}
          >
            复制
          </button>
        </div>
        <pre className="style-preview">{preview}</pre>
        <p className="style-resolved-line">
          当前：{formatStyleCard(style, chapterOverride).split('\n')[1] ?? '未设定'}
        </p>
      </section>

      <section className="style-section style-span-2 style-trial-section">
        <div className="style-section-head">
          <div>
            <strong>风格试写</strong>
            <span>先用 200 字看感觉，不满意再改参数；不会写入正文</span>
          </div>
          <div className="style-trial-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void runTrial()}
              disabled={trialLoading}
            >
              {trialLoading ? '试写中…' : '试写 200 字'}
            </button>
            <select
              className="input select drawer-input style-ab-select"
              value={effectiveAbPresetId}
              onChange={(event) => setAbPresetId(event.target.value)}
              title="A/B 对比时 B 方案使用的预设"
            >
              {STYLE_PRESETS.filter((preset) => preset.id !== style.presetId).map((preset) => (
                <option key={preset.id} value={preset.id}>
                  B：{preset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void runAb()}
              disabled={trialLoading}
            >
              A/B 对比
            </button>
          </div>
        </div>
        {trialText ? (
          <div className="style-trial-result">
            <div className="style-trial-head">
              <span>当前风格试写</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => copyText(trialText, onToast)}
              >
                复制
              </button>
            </div>
            <p>{trialText}</p>
          </div>
        ) : null}
        {abA || abB ? (
          <div className="style-ab-grid">
            <div className="style-trial-result">
              <div className="style-trial-head">
                <span>A · 当前风格</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyText(abA, onToast)}>
                  复制
                </button>
              </div>
              <p>{abA || '生成中…'}</p>
            </div>
            <div className="style-trial-result">
              <div className="style-trial-head">
                <span>B · {STYLE_PRESETS.find((preset) => preset.id === effectiveAbPresetId)?.name}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyText(abB, onToast)}>
                  复制
                </button>
              </div>
              <p>{abB || '生成中…'}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="style-section style-span-2 style-drift-section">
        <div className="style-section-head">
          <div>
            <strong>本地风格漂移检查</strong>
            <span>只比较句长、对白占比和段落长度，不调用 AI</span>
          </div>
          <small>{drift ? `${drift.sampleChapters} 章样本` : '至少 2 章正文'}</small>
        </div>
        {drift ? (
          <div className="style-drift-box">
            <div>
              <span>最近句长</span>
              <strong>{drift.averageSentenceLength} 字</strong>
              <small>基线 {drift.baselineSentenceLength} 字</small>
            </div>
            <div>
              <span>最近对白占比</span>
              <strong>{drift.dialogueRatio}%</strong>
              <small>基线 {drift.baselineDialogueRatio}%</small>
            </div>
            <div>
              <span>最近段长</span>
              <strong>{drift.averageParagraphLength} 字</strong>
            </div>
            <div className="style-drift-warnings">
              {drift.warnings.length ? (
                drift.warnings.map((warning) => <p key={warning}>{warning}</p>)
              ) : (
                <p>没有明显漂移。继续用当前风格即可。</p>
              )}
            </div>
          </div>
        ) : (
          <p className="drawer-empty">写满两章后，这里会出现本地风格漂移提示。</p>
        )}
      </section>

      <p className="drawer-hint style-span-2">
        风格卡会进入每次续写和选段改写的提示词。叙述遵循作品风格；角色对白优先角色语言档案；当前章节覆盖优先级最高。
      </p>
    </div>
  )
}
