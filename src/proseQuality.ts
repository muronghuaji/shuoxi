export interface ProseQualityIssue {
  level: 'high' | 'medium' | 'low'
  title: string
  detail: string
}

export interface ProseQualityReport {
  chars: number
  sentences: number
  paragraphs: number
  averageSentenceLength: number
  longSentenceRatio: number
  dialogueRatio: number
  averageParagraphLength: number
  score: number
  abstractEmotion: { word: string; count: number }[]
  filterWords: { word: string; count: number }[]
  repeatedClauses: { text: string; count: number }[]
  issues: ProseQualityIssue[]
}

const ABSTRACT_EMOTIONS = [
  '害怕',
  '恐惧',
  '紧张',
  '愤怒',
  '生气',
  '悲伤',
  '难过',
  '绝望',
  '震惊',
  '痛苦',
  '无奈',
  '兴奋',
  '开心',
  '高兴',
  '焦虑',
  '压抑',
  '安心',
  '失落',
  '激动',
]

const FILTER_WORDS = [
  '仿佛',
  '似乎',
  '好像',
  '不由得',
  '不禁',
  '瞬间',
  '顿时',
  '空气仿佛',
  '嘴角勾起',
  '嘴角微微',
  '眸光',
  '眼中闪过',
  '心中一紧',
  '心中一沉',
  '深吸一口气',
  '缓缓',
  '淡淡',
  '微微',
  '不知为何',
  '说不出的',
]

function countWords(text: string, words: string[]): { word: string; count: number }[] {
  return words
    .map((word) => ({ word, count: text.split(word).length - 1 }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function analyzeProseQuality(text: string): ProseQualityReport {
  const value = text.trim()
  const chars = value.replace(/\s/g, '').length
  const paragraphTexts = value.split(/\n+/).map((item) => item.trim()).filter(Boolean)
  const paragraphs = paragraphTexts.length
  const sentenceTexts = value
    .split(/[。！？!?…]+/u)
    .map((item) => item.replace(/[\s“”「」"'，,；;：:]/g, ''))
    .filter(Boolean)
  const sentenceLengths = sentenceTexts.map((item) => item.length)
  const sentences = sentenceLengths.length
  const averageSentenceLength = sentences
    ? Math.round((sentenceLengths.reduce((sum, length) => sum + length, 0) / sentences) * 10) / 10
    : 0
  const longSentenceRatio = sentences
    ? sentenceLengths.filter((length) => length >= 35).length / sentences
    : 0
  const dialogueChars = (value.match(/[“「][^”」]*[”」]/g) ?? []).join('').length
  const dialogueRatio = chars > 0 ? dialogueChars / chars : 0
  const averageParagraphLength = paragraphs
    ? Math.round((chars / paragraphs) * 10) / 10
    : 0

  const abstractEmotion = countWords(value, ABSTRACT_EMOTIONS)
  const filterWords = countWords(value, FILTER_WORDS)
  const clauses = value
    .split(/[。！？!?…\n，,；;：:]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8)
  const clauseCounts = new Map<string, number>()
  for (const clause of clauses) clauseCounts.set(clause, (clauseCounts.get(clause) ?? 0) + 1)
  const repeatedClauses = [...clauseCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([clause, count]) => ({ text: clause, count }))
    .slice(0, 6)

  const issues: ProseQualityIssue[] = []
  if (abstractEmotion.reduce((sum, item) => sum + item.count, 0) >= 3) {
    issues.push({
      level: 'high',
      title: '抽象情绪偏多',
      detail: `命中 ${abstractEmotion.map((item) => `${item.word}×${item.count}`).join('、')}。情绪被直接总结，画面感会被削弱。`,
    })
  }
  if (filterWords.reduce((sum, item) => sum + item.count, 0) >= 4) {
    issues.push({
      level: 'medium',
      title: '过滤词偏多',
      detail: `命中 ${filterWords.map((item) => `${item.word}×${item.count}`).join('、')}。可以删掉一部分，让动作和物件自己说话。`,
    })
  }
  if (sentences > 0 && (averageSentenceLength >= 38 || longSentenceRatio >= 0.4)) {
    issues.push({
      level: 'medium',
      title: '长句密度偏高',
      detail: `平均句长 ${averageSentenceLength} 字，35 字以上占比 ${Math.round(longSentenceRatio * 100)}%。紧张场景可以拆短。`,
    })
  }
  if (chars >= 500 && dialogueRatio < 0.1) {
    issues.push({
      level: 'medium',
      title: '对白占比偏低',
      detail: `对白约 ${Math.round(dialogueRatio * 100)}%。如果这是多人场景，可以考虑让人物直接说话，而不是全部由旁白转述。`,
    })
  }
  if (repeatedClauses.length > 0) {
    issues.push({
      level: 'medium',
      title: '存在重复分句',
      detail: repeatedClauses.map((item) => `「${item.text}」×${item.count}`).join('；'),
    })
  }
  if (paragraphs > 0 && averageParagraphLength > 360) {
    issues.push({
      level: 'low',
      title: '段落偏厚',
      detail: `平均每段 ${averageParagraphLength} 字。可以考虑在动作或情绪转折处切段。`,
    })
  }

  const penalty =
    (abstractEmotion.reduce((sum, item) => sum + item.count, 0) >= 3 ? 12 : 0) +
    (filterWords.reduce((sum, item) => sum + item.count, 0) >= 4 ? 8 : 0) +
    (averageSentenceLength >= 38 ? 8 : 0) +
    (dialogueRatio < 0.1 && chars >= 500 ? 8 : 0) +
    (repeatedClauses.length > 0 ? 10 : 0) +
    (averageParagraphLength > 360 ? 5 : 0)

  return {
    chars,
    sentences,
    paragraphs,
    averageSentenceLength,
    longSentenceRatio,
    dialogueRatio,
    averageParagraphLength,
    score: clamp(100 - penalty, 0, 100),
    abstractEmotion,
    filterWords,
    repeatedClauses,
    issues,
  }
}
