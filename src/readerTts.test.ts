import { describe, expect, it } from 'vitest'
import {
  buildReaderTtsSentences,
  normalizeReaderTtsSettings,
  splitReaderSentences,
} from './readerTts'

describe('reader tts', () => {
  it('splits Chinese sentences and keeps punctuation', () => {
    expect(splitReaderSentences('他推开门。雨停了！你来了？')).toEqual([
      '他推开门。',
      '雨停了！',
      '你来了？',
    ])
    expect(splitReaderSentences('   ')).toEqual([])
  })

  it('builds flat sentence indexes with paragraph ownership', () => {
    const sentences = buildReaderTtsSentences(['第一段。第二句！', '第二段'])
    expect(sentences.map((sentence) => sentence.index)).toEqual([0, 1, 2])
    expect(sentences[0].paragraphIndex).toBe(0)
    expect(sentences[2].paragraphIndex).toBe(1)
  })

  it('normalizes tts settings', () => {
    expect(normalizeReaderTtsSettings({ rate: 9, volume: -1, autoNext: false })).toMatchObject({
      rate: 2,
      volume: 0,
      autoNext: false,
    })
    expect(normalizeReaderTtsSettings(null)).toMatchObject({
      rate: 1,
      volume: 1,
      autoNext: true,
    })
  })
})
