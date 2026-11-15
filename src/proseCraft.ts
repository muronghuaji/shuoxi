import type { Chapter, WorkDetail, WorkStyle } from './types'
import type { ChatMessage } from './ai'
import { formatStyleCard } from './styleProfile'

export const PROSE_CRAFT_RULES = [
  '【场景合同】这一章只写 1–3 个场景；每个场景必须有目标、阻力、变化和一个具体的感官细节。',
  '【表演原则】不总结剧情，不替人物解释情绪；用动作、物件、停顿、对白和身体反应表现。',
  '【句法节奏】长短句交替；不要连续三句使用同一种开头或同一种句式。',
  '【具体优先】把抽象形容词换成可见、可听、可触的动作和物件；一段只保留一个主要比喻。',
  '【对白】每句对白都要有目的或潜台词；不同角色不能共用同一种语气、句长和用词。',
  '【反 AI 味】避免“仿佛、似乎、不禁、不由得”堆叠，避免“不是……而是……”句式，避免每段都收束成金句。',
  '【禁止】不要写剧情摘要、标题、分析、说明或“未完待续”；不要为了凑字数重复信息。',
].join('\n')

export function buildProseContractSection(): string {
  return PROSE_CRAFT_RULES
}

/**
 * 情感/心理写作约束。
 * 目的不是让模型“多写心理”，而是让它在该克制时克制、该进入内心时不要只写外部动作。
 */
export function buildEmotionSceneSection(style?: WorkStyle): string {
  const expression = style?.emotionExpression ?? 'external'
  const intensity = style?.emotionIntensity ?? 'balanced'
  const expressionRule =
    expression === 'direct'
      ? '情绪可以直接写出来，但每场最多直接点名一次；其余用念头、动作和反应的后果承接，不要连续解释。'
      : expression === 'restrained'
        ? '情绪以留白和潜台词为主；允许一个很短的内心转折，但不要把未说出口的话全解释完。'
        : '情绪主要落在动作、身体反应、物件和对白上；不要用“他感到/他知道/他意识到”代替现场。'
  const intensityRule =
    intensity === 'restrained'
      ? '心理密度低：整场最多一次内心段落；优先让动作和停顿承担情绪。'
      : intensity === 'high' || intensity === 'extreme'
        ? '心理密度中高：允许 2–3 次自由间接心理；写出欲望、恐惧和羞耻之间的拉扯，但每场只完成一次情绪转折。'
        : '心理密度中等：允许 1–2 次自由间接心理；让表面反应和真实动机出现一次错位。'
  return [
    '【情感与心理】',
    expressionRule,
    intensityRule,
    '心理不是情绪标签，而是人物此刻想做什么、怕什么、拒绝承认什么；写选择，不写总结。',
    '允许自由间接引语：把人物念头直接写进叙述，不要每句都加“他想/她知道”。',
    '每场至少有一次“想说但没说 / 想做但没做 / 说反话”的选择；这是心理层次，不是解释。',
    '身体反应要具体到动作和感官，避免“心跳加速、呼吸一滞、浑身发抖”这类模板。',
    '不要把所有情绪解释完；至少保留一个未说出口的动机或一个没有回答的问题。',
    '场景结尾停在动作、画面或未完成的话上，不要用情绪总结收尾。',
  ].join('\n')
}

function clipAnchor(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= 220) return clean
  return `${clean.slice(0, 220)}…`
}

/**
 * 从已写正文里挑 1–2 段作为语感锚点。
 * 只提供节奏和具体程度，不提供剧情模板，避免模型照抄。
 */
export function buildStyleAnchorSection(
  chapters: Chapter[],
  currentChapterId: string,
  style?: WorkStyle,
): string {
  const currentIndex = chapters.findIndex((chapter) => chapter.id === currentChapterId)
  const prior = chapters
    .slice(0, currentIndex >= 0 ? currentIndex : chapters.length)
    .filter((chapter) => chapter.content.trim().length >= 60)
  const candidates: string[] = []
  for (const chapter of [...prior].reverse().slice(0, 8)) {
    const paragraphs = chapter.content
      .split(/\n+/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length >= 8 && paragraph.length <= 420)
    const pick =
      paragraphs.find((paragraph) => /[“「].+?[”」]/.test(paragraph)) ??
      paragraphs[Math.max(0, Math.floor(paragraphs.length / 2))] ??
      paragraphs[0]
    if (pick && !candidates.some((item) => item.slice(0, 40) === pick.slice(0, 40))) {
      candidates.push(pick)
    }
    if (candidates.length >= 2) break
  }
  const fallback = style?.sampleText?.trim()
  if (candidates.length === 0 && fallback) candidates.push(fallback)
  if (candidates.length === 0) return ''
  return [
    '【语感锚点】',
    '下面只用来学习句长、停顿、具体程度和叙述距离；不要照抄内容、意象或句式。',
    ...candidates.map((anchor, index) => `${index + 1}. ${clipAnchor(anchor)}`),
  ].join('\n')
}

export function buildProseVoiceSection(detail: WorkDetail): string {
  const lines: string[] = []
  for (const character of detail.characters.slice(0, 8)) {
    const profile = character.profile
    const voice = profile?.voice
    const parts = [
      character.name,
      voice?.register,
      voice?.sentenceLength,
      (voice?.verbalTics ?? []).slice(0, 2).join('、'),
    ].filter(Boolean)
    if (parts.length > 1) lines.push(`- ${parts.join('｜')}`)
    const sample = voice?.samples?.[0]
    if (sample) lines.push(`  台词参考：“${sample.slice(0, 120)}”`)
  }
  return lines.length > 0 ? `【角色声音卡】\n${lines.join('\n')}` : ''
}

export interface ProsePolishInput {
  workTitle: string
  chapterTitle: string
  content: string
  style: WorkStyle
  anchors?: string
  voice?: string
}

export function buildProsePolishMessages(input: ProsePolishInput): ChatMessage[] {
  const system = [
    '你是中文小说文字编辑，只做文笔精修，不改剧情。',
    '必须保留：原有事实、人物状态、叙事视角、段落顺序、场景目标和所有已发生事件。',
    '精修目标：',
    '1. 把解释情绪改成动作、对白、物件和身体反应；',
    '2. 删掉重复信息、空泛形容词、翻译腔和 AI 套话；',
    '3. 调整长短句和段落节奏，让句子有呼吸；',
    '4. 让对白更有目的、潜台词和人物差异；',
    '5. 如果段落只有外部动作，在关键处补入克制的自由间接心理；如果心理解释过多，删到只剩一个未说出口的动机。',
    '6. 保留作者原稿的语感和关键细节，不要整段换掉。',
    '不要新增剧情、角色、设定、物品或未来信息；不要删掉关键动作和信息；不要输出 markdown、标题或解释。',
    '只输出精修后的完整本章正文。',
  ].join('\n')
  const user = [
    `【作品】${input.workTitle}`,
    `【本章】${input.chapterTitle || '未命名章节'}`,
    `【写作风格】\n${formatStyleCard(input.style)}`,
    `【文笔要求】\n${PROSE_CRAFT_RULES}`,
    buildEmotionSceneSection(input.style),
    input.anchors ? input.anchors : '',
    input.voice ? input.voice : '',
    `【待精修正文】\n${input.content}`,
    '【精修任务】只改文笔，不改剧情。返回精修后的完整正文。',
  ]
    .filter(Boolean)
    .join('\n\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
