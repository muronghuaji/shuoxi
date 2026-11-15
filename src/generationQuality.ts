export type GenerationEndingIssue =
  | 'empty'
  | 'finish-length'
  | 'too-short'
  | 'mid-sentence'
  | 'unclosed-quote'

export interface GenerationQualityInput {
  text: string
  finishReason?: string
  targetWords?: number
  minimumChars?: number
}

export interface GenerationQualityResult {
  shouldRetry: boolean
  issues: GenerationEndingIssue[]
  minimumChars: number
  chars: number
  reasonText: string
}

export const MIN_GENERATION_CHARS = 300

export function resolveMinimumGeneratedChars(targetWords = 0): number {
  if (!Number.isFinite(targetWords) || targetWords <= 0) return MIN_GENERATION_CHARS
  return Math.max(
    MIN_GENERATION_CHARS,
    Math.min(1200, Math.round(targetWords * 0.3)),
  )
}

const TERMINAL_PUNCTUATION = /[。！？…!?.”」』）】》]$/
const BAD_ENDING_PUNCTUATION = /[，、；：,;:]$/

function hasUnclosedPair(text: string, open: string, close: string): boolean {
  let depth = 0
  for (const char of text) {
    if (char === open) depth += 1
    if (char === close) depth = Math.max(0, depth - 1)
  }
  return depth > 0
}

function hasUnbalancedQuote(text: string, open: string, close: string): boolean {
  let balance = 0
  for (const char of text) {
    if (char === open) balance += 1
    if (char === close) balance -= 1
  }
  return balance !== 0
}

export function checkGenerationQuality(
  input: GenerationQualityInput,
): GenerationQualityResult {
  const text = input.text.trim()
  const minimumChars = input.minimumChars ?? resolveMinimumGeneratedChars(input.targetWords)
  const chars = text.length
  const issues: GenerationEndingIssue[] = []
  if (!text) {
    issues.push('empty')
  } else {
    if (input.finishReason === 'length') issues.push('finish-length')
    if (chars < minimumChars) issues.push('too-short')
    const lastChar = text.slice(-1)
    if (
      BAD_ENDING_PUNCTUATION.test(text) ||
      (!TERMINAL_PUNCTUATION.test(text) && !/[。！？…”」』）】》]$/.test(lastChar))
    ) {
      issues.push('mid-sentence')
    }
    if (
      hasUnbalancedQuote(text, '“', '”') ||
      hasUnbalancedQuote(text, '「', '」') ||
      hasUnbalancedQuote(text, '『', '』') ||
      hasUnclosedPair(text, '（', '）') ||
      hasUnclosedPair(text, '【', '】')
    ) {
      issues.push('unclosed-quote')
    }
  }
  const uniqueIssues = [...new Set(issues)]
  return {
    shouldRetry: uniqueIssues.length > 0,
    issues: uniqueIssues,
    minimumChars,
    chars,
    reasonText: uniqueIssues.map(issueLabel).filter(Boolean).join('、'),
  }
}

function issueLabel(issue: GenerationEndingIssue): string {
  switch (issue) {
    case 'empty':
      return '正文为空'
    case 'finish-length':
      return '输出被截断'
    case 'too-short':
      return '正文过短'
    case 'mid-sentence':
      return '结尾停在半句'
    case 'unclosed-quote':
      return '引号或括号未闭合'
  }
}

export function buildGenerationRetryInstruction(input: {
  quality: GenerationQualityResult
  targetWords?: number
  directive: string
}): string {
  const { quality } = input
  const target = input.targetWords && input.targetWords > 0 ? input.targetWords : 0
  const lengthLine = target
    ? `本章目标约 ${target} 字；当前只有 ${quality.chars} 字，最低可接受 ${quality.minimumChars} 字。`
    : `当前正文只有 ${quality.chars} 字，最低可接受 ${quality.minimumChars} 字。`
  return [
    '【自动补写要求】',
    `上一次生成出现：${quality.reasonText}。`,
    lengthLine,
    '请重新生成完整本章正文，而不是只补一句。',
    '保持原有指令、剧情方向、视角、人物语气和文风；补足本章应有的事件推进与场景收束。',
    '不要重复已有段落，不要新增无关剧情，不要用总结或解释代替正文；只输出正文。',
    `原指令：${input.directive}`,
  ].join('\n')
}
