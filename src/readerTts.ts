export interface ReaderTtsSettings {
  voiceURI: string
  rate: number
  volume: number
  autoNext: boolean
  sleepMinutes?: number
}

export const READER_TTS_SETTINGS_KEY = 'shuoxi.readerTts.v1'

export const DEFAULT_READER_TTS_SETTINGS: ReaderTtsSettings = {
  voiceURI: '',
  rate: 1,
  volume: 1,
  autoNext: true,
}

export function normalizeReaderTtsSettings(
  value: Partial<ReaderTtsSettings> | null | undefined,
): ReaderTtsSettings {
  const rate = Number(value?.rate)
  const volume = Number(value?.volume)
  return {
    voiceURI: typeof value?.voiceURI === 'string' ? value.voiceURI : '',
    rate: Number.isFinite(rate) ? Math.min(2, Math.max(0.5, rate)) : 1,
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1,
    autoNext: value?.autoNext !== false,
    ...(value?.sleepMinutes === 15 || value?.sleepMinutes === 30 || value?.sleepMinutes === 60
      ? { sleepMinutes: value.sleepMinutes }
      : {}),
  }
}

export interface ReaderTtsSentence {
  index: number
  paragraphIndex: number
  text: string
}

export function splitReaderSentences(paragraph: string): string[] {
  const clean = paragraph.trim()
  if (!clean) return []
  const parts = clean.match(/[^。！？!?…]+[。！？!?…]*/g) ?? [clean]
  return parts.map((part) => part.trim()).filter(Boolean)
}

export function buildReaderTtsSentences(paragraphs: string[]): ReaderTtsSentence[] {
  const result: ReaderTtsSentence[] = []
  paragraphs.forEach((paragraph, paragraphIndex) => {
    for (const text of splitReaderSentences(paragraph)) {
      result.push({ index: result.length, paragraphIndex, text })
    }
  })
  return result
}
