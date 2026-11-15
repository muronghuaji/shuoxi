export interface FindReplaceOptions {
  caseSensitive?: boolean
}

export interface FindMatch {
  start: number
  end: number
  text: string
}

export function findMatches(
  text: string,
  query: string,
  options: FindReplaceOptions = {},
): FindMatch[] {
  if (!query) return []
  const source = options.caseSensitive ? text : text.toLowerCase()
  const target = options.caseSensitive ? query : query.toLowerCase()
  const matches: FindMatch[] = []
  let cursor = 0
  while (cursor <= source.length) {
    const index = source.indexOf(target, cursor)
    if (index < 0) break
    matches.push({ start: index, end: index + query.length, text: text.slice(index, index + query.length) })
    cursor = index + Math.max(1, query.length)
  }
  return matches
}

export function replaceMatchAt(
  text: string,
  match: FindMatch,
  replacement: string,
): string {
  return `${text.slice(0, match.start)}${replacement}${text.slice(match.end)}`
}

export function replaceAllMatches(
  text: string,
  query: string,
  replacement: string,
  options: FindReplaceOptions = {},
): { text: string; count: number } {
  const matches = findMatches(text, query, options)
  if (matches.length === 0) return { text, count: 0 }
  let result = ''
  let cursor = 0
  for (const match of matches) {
    result += text.slice(cursor, match.start) + replacement
    cursor = match.end
  }
  result += text.slice(cursor)
  return { text: result, count: matches.length }
}
