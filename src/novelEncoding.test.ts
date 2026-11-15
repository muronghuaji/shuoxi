import { describe, expect, it } from 'vitest'
import { decodeNovelBuffer } from './novelEncoding'

function bufferFromBytes(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer
}

describe('decodeNovelBuffer', () => {
  it('decodes UTF-8 text', () => {
    const buffer = new TextEncoder().encode('第一章 测试').buffer
    const decoded = decodeNovelBuffer(buffer)
    expect(decoded.text).toBe('第一章 测试')
    expect(decoded.encoding).toBe('UTF-8')
  })

  it('decodes UTF-8 with BOM', () => {
    const bytes = [0xef, 0xbb, 0xbf, ...new TextEncoder().encode('斗破苍穹')]
    const decoded = decodeNovelBuffer(bufferFromBytes(bytes))
    expect(decoded.text).toContain('斗破苍穹')
    expect(decoded.encoding).toBe('UTF-8')
  })

  it('falls back to GB18030 for ANSI Chinese TXT', () => {
    // GBK bytes: 第一章 测试
    const bytes = [0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x20, 0xb2, 0xe2, 0xca, 0xd4]
    const decoded = decodeNovelBuffer(bufferFromBytes(bytes))
    expect(decoded.text).toBe('第一章 测试')
    expect(decoded.encoding).toBe('GB18030')
  })
})
