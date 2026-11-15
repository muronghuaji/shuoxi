import type { CharacterCard, WorkDetail } from './types'

export interface CharacterAddressEntry {
  id: string
  name: string
  activeName: string
  aliases: string[]
  futureNames: string[]
}

export interface AddressHarmonyResult {
  text: string
  fixes: { from: string; to: string; count: number }[]
  unresolved: string[]
}

export function buildCharacterAddressBook(
  detail: WorkDetail,
  chapterIndex = Number.MAX_SAFE_INTEGER,
): CharacterAddressEntry[] {
  return detail.characters
    .map((character) => {
      const timeline = [...(character.addressTimeline ?? [])].sort(
        (left, right) => left.fromChapterIndex - right.fromChapterIndex,
      )
      const activePhase = timeline
        .filter((phase) => phase.fromChapterIndex <= chapterIndex)
        .at(-1)
      const activeName = activePhase?.name || character.name
      const pastNames = timeline
        .filter((phase) => phase.fromChapterIndex <= chapterIndex)
        .map((phase) => phase.name)
        .filter((name) => name && name !== activeName)
      const futureNames = timeline
        .filter((phase) => phase.fromChapterIndex > chapterIndex)
        .map((phase) => phase.name)
        .filter(Boolean)
      const aliases = new Set<string>()
      for (const alias of [...(character.profile?.aliases ?? []), ...pastNames]) {
        const value = alias.trim()
        if (value && value !== activeName && !futureNames.includes(value)) aliases.add(value)
      }
      return {
        id: character.id,
        name: character.name,
        activeName,
        aliases: [...aliases],
        futureNames,
      }
    })
    .filter((entry) => entry.activeName)
}

function isNarratorVariant(alias: string, canonical: string): boolean {
  if (alias.length < 2) return false
  if (alias === canonical) return false
  // 只自动统一同姓或包含正式名的叙述称呼，避免把化名、绰号或隐藏身份改掉。
  return alias.includes(canonical[0]) || alias.includes(canonical)
}

function transformOutsideQuotes(
  text: string,
  transform: (segment: string) => string,
): string {
  const quoted = /[“"][\s\S]*?[”"]|「[\s\S]*?」|『[\s\S]*?』/g
  let cursor = 0
  let result = ''
  for (const match of text.matchAll(quoted)) {
    const index = match.index ?? 0
    result += transform(text.slice(cursor, index))
    result += match[0]
    cursor = index + match[0].length
  }
  result += transform(text.slice(cursor))
  return result
}

function outsideQuoteText(text: string): string {
  const quoted = /[“"][\s\S]*?[”"]|「[\s\S]*?」|『[\s\S]*?』/g
  let cursor = 0
  let result = ''
  for (const match of text.matchAll(quoted)) {
    const index = match.index ?? 0
    result += text.slice(cursor, index)
    cursor = index + match[0].length
  }
  result += text.slice(cursor)
  return result
}

export function harmonizeNarrationAddresses(input: {
  text: string
  detail: WorkDetail
  chapterIndex?: number
}): AddressHarmonyResult {
  const entries = buildCharacterAddressBook(input.detail, input.chapterIndex)
  const fixes = new Map<string, { from: string; to: string; count: number }>()
  const replaceable = entries
    .flatMap((entry) =>
      entry.aliases
        .filter((alias) => isNarratorVariant(alias, entry.activeName))
        .map((alias) => ({ alias, canonical: entry.activeName })),
    )
    .sort((left, right) => right.alias.length - left.alias.length)

  const text = transformOutsideQuotes(input.text, (segment) => {
    let next = segment
    for (const item of replaceable) {
      if (!next.includes(item.alias)) continue
      const count = next.split(item.alias).length - 1
      next = next.split(item.alias).join(item.canonical)
      const key = `${item.alias}->${item.canonical}`
      const current = fixes.get(key) ?? {
        from: item.alias,
        to: item.canonical,
        count: 0,
      }
      current.count += count
      fixes.set(key, current)
    }
    return next
  })

  const narration = outsideQuoteText(text)
  const unresolved: string[] = []
  for (const entry of entries) {
    for (const alias of entry.aliases) {
      if (!narration.includes(alias)) continue
      unresolved.push('称呼待确认：' + alias + '（旁白当前用「' + entry.activeName + '」）')
    }
    for (const futureName of entry.futureNames) {
      if (!narration.includes(futureName)) continue
      unresolved.push('身份未揭露名字提前出现：' + futureName + '（当前旁白应使用「' + entry.activeName + '」）')
    }
  }

  return {
    text,
    fixes: [...fixes.values()],
    unresolved: [...new Set(unresolved)].slice(0, 6),
  }
}

export function applyNarrationAddressFixes(
  text: string,
  fixes: { from: string; to: string }[],
): string {
  return transformOutsideQuotes(text, (segment) => {
    let next = segment
    for (const fix of fixes) {
      if (!fix.from || !fix.to) continue
      next = next.split(fix.from).join(fix.to)
    }
    return next
  })
}

function namesOf(character: CharacterCard): string[] {  return [character.name, ...(character.profile?.aliases ?? [])]
    .map((name) => name.trim())
    .filter(Boolean)
}

function nearestSpeaker(
  text: string,
  quoteStart: number,
  quoteEnd: number,
  characters: CharacterCard[],
): CharacterCard | null {
  const before = text.slice(Math.max(0, quoteStart - 90), quoteStart)
  const after = text.slice(quoteEnd, Math.min(text.length, quoteEnd + 90))
  let best: { character: CharacterCard; distance: number } | null = null
  for (const character of characters) {
    for (const name of namesOf(character)) {
      const beforeIndex = before.lastIndexOf(name)
      if (beforeIndex >= 0) {
        const distance = before.length - beforeIndex
        if (!best || distance < best.distance) best = { character, distance }
      }
      const afterIndex = after.indexOf(name)
      if (afterIndex >= 0) {
        const distance = afterIndex + 1
        if (!best || distance < best.distance) best = { character, distance }
      }
    }
  }
  return best?.character ?? null
}

export function auditDialogueAddressPermissions(input: {
  text: string
  detail: WorkDetail
}): string[] {
  const characters = input.detail.characters
  const entries: {
    speaker: CharacterCard
    target: CharacterCard
    form: string
    kind: string
  }[] = []
  for (const speaker of characters) {
    for (const note of speaker.profile?.relationNotes ?? []) {
      const target = characters.find((character) => character.id === note.characterId)
      if (!target) continue
      const forms: [string, string][] = [
        [note.address, '默认'],
        [note.addressFormal ?? '', '正式'],
        [note.addressIntimate ?? '', '亲密'],
        [note.addressAngry ?? '', '生气'],
      ]
      for (const [form, kind] of forms) {
        if (form.trim()) entries.push({ speaker, target, form: form.trim(), kind })
      }
    }
  }
  if (entries.length === 0) return []

  const quoted = /[“"]([\s\S]*?)[”"]|「([\s\S]*?)」|『([\s\S]*?)』/g
  const warnings = new Set<string>()
  for (const match of input.text.matchAll(quoted)) {
    const quote = match[1] ?? match[2] ?? match[3] ?? ''
    const start = match.index ?? 0
    const end = start + match[0].length
    const speaker = nearestSpeaker(input.text, start, end, characters)
    if (!speaker) continue
    for (const entry of entries) {
      if (!quote.includes(entry.form)) continue
      if (speaker.id === entry.speaker.id || speaker.id === entry.target.id) continue
      const note = speaker.profile?.relationNotes?.find(
        (item) => item.characterId === entry.target.id,
      )
      const allowed = note
        ? [note.address, note.addressFormal, note.addressIntimate, note.addressAngry]
            .map((item) => item?.trim() ?? '')
            .filter(Boolean)
        : []
      if (!allowed.includes(entry.form)) {
        warnings.add(
          `关系称呼待确认：${speaker.name} 对 ${entry.target.name} 使用「${entry.form}」（${entry.kind}称呼）`,
        )
      }
    }
    if (warnings.size >= 6) break
  }
  return [...warnings].slice(0, 6)
}
