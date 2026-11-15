export interface DecodedNovelText {
  text: string
  encoding: string
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value)
}

/**
 * TXT 小说在国内常见 UTF-8 / GBK(GB18030) 两种编码。
 * 先严格尝试 UTF-8；失败再按 GB18030 解码，避免整本乱码。
 */
export function decodeNovelBuffer(buffer: ArrayBuffer): DecodedNovelText {
  const bytes = new Uint8Array(buffer)

  if (hasPrefix(bytes, [0xef, 0xbb, 0xbf])) {
    return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'UTF-8' }
  }
  if (hasPrefix(bytes, [0xff, 0xfe])) {
    return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'UTF-16 LE' }
  }
  if (hasPrefix(bytes, [0xfe, 0xff])) {
    return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'UTF-16 BE' }
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text, encoding: 'UTF-8' }
  } catch {
    // 继续尝试中文 ANSI 编码
  }

  try {
    const text = new TextDecoder('gb18030').decode(bytes)
    return { text, encoding: 'GB18030' }
  } catch {
    // 最后退回宽松 UTF-8，至少能导入可读部分
  }
  return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'UTF-8（容错）' }
}
