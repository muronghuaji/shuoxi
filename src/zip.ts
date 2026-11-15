const encoder = new TextEncoder()

let crcTable: Uint32Array | null = null

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable
  crcTable = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    crcTable[index] = value >>> 0
  }
  return crcTable
}

function crc32(data: Uint8Array): number {
  const table = getCrcTable()
  let value = 0xffffffff
  for (let index = 0; index < data.length; index += 1) {
    value = table[(value ^ data[index]) & 0xff] ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true)
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true)
}

function dosDateTime(date = new Date()): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, date: day }
}

export interface ZipEntry {
  name: string
  data: Uint8Array
}

/**
 * 生成不压缩的 ZIP。DOCX / EPUB 都是 ZIP 容器，文字体积在可接受范围内，
 * 使用 stored 模式可以避免在浏览器里引入压缩库。
 */
export function createZip(entries: ZipEntry[]): Uint8Array {
  const { time, date } = dosDateTime()
  const encoded = entries.map((entry) => ({
    name: encoder.encode(entry.name),
    data: entry.data,
    crc: crc32(entry.data),
  }))
  let localSize = 0
  for (const entry of encoded) localSize += 30 + entry.name.length + entry.data.length
  const centralSize = encoded.reduce((sum, entry) => sum + 46 + entry.name.length, 0)
  const output = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(output.buffer)
  let offset = 0
  const localOffsets: number[] = []

  for (const entry of encoded) {
    localOffsets.push(offset)
    writeU32(view, offset, 0x04034b50)
    writeU16(view, offset + 4, 20)
    writeU16(view, offset + 6, 0x800)
    writeU16(view, offset + 8, 0)
    writeU16(view, offset + 10, time)
    writeU16(view, offset + 12, date)
    writeU32(view, offset + 14, entry.crc)
    writeU32(view, offset + 18, entry.data.length)
    writeU32(view, offset + 22, entry.data.length)
    writeU16(view, offset + 26, entry.name.length)
    writeU16(view, offset + 28, 0)
    output.set(entry.name, offset + 30)
    output.set(entry.data, offset + 30 + entry.name.length)
    offset += 30 + entry.name.length + entry.data.length
  }

  const centralStart = offset
  for (let index = 0; index < encoded.length; index += 1) {
    const entry = encoded[index]
    writeU32(view, offset, 0x02014b50)
    writeU16(view, offset + 4, 20)
    writeU16(view, offset + 6, 20)
    writeU16(view, offset + 8, 0x800)
    writeU16(view, offset + 10, 0)
    writeU16(view, offset + 12, time)
    writeU16(view, offset + 14, date)
    writeU32(view, offset + 16, entry.crc)
    writeU32(view, offset + 20, entry.data.length)
    writeU32(view, offset + 24, entry.data.length)
    writeU16(view, offset + 28, entry.name.length)
    writeU16(view, offset + 30, 0)
    writeU16(view, offset + 32, 0)
    writeU16(view, offset + 34, 0)
    writeU16(view, offset + 36, 0)
    writeU32(view, offset + 38, 0)
    writeU32(view, offset + 42, localOffsets[index])
    output.set(entry.name, offset + 46)
    offset += 46 + entry.name.length
  }

  writeU32(view, offset, 0x06054b50)
  writeU16(view, offset + 4, 0)
  writeU16(view, offset + 6, 0)
  writeU16(view, offset + 8, encoded.length)
  writeU16(view, offset + 10, encoded.length)
  writeU32(view, offset + 12, offset - centralStart)
  writeU32(view, offset + 16, centralStart)
  writeU16(view, offset + 20, 0)
  return output
}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true)
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true)
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前环境不支持解压 deflate，请把技能包保存为存储模式 ZIP')
  }
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** 读取常见 ZIP 技能包；只支持 stored/deflate，不支持加密 ZIP。 */
export async function unzip(data: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let eocd = -1
  for (let index = data.length - 22; index >= Math.max(0, data.length - 65557); index -= 1) {
    if (readU32(view, index) === 0x06054b50) {
      eocd = index
      break
    }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件')
  const count = readU16(view, eocd + 10)
  const centralOffset = readU32(view, eocd + 16)
  if (count > 500) throw new Error('ZIP 文件条目过多')
  const entries: ZipEntry[] = []
  let offset = centralOffset
  const decoder = new TextDecoder('utf-8')
  for (let index = 0; index < count; index += 1) {
    if (readU32(view, offset) !== 0x02014b50) throw new Error('ZIP 中央目录损坏')
    const flags = readU16(view, offset + 8)
    const method = readU16(view, offset + 10)
    const compressedSize = readU32(view, offset + 20)
    const uncompressedSize = readU32(view, offset + 24)
    const nameLength = readU16(view, offset + 28)
    const extraLength = readU16(view, offset + 30)
    const commentLength = readU16(view, offset + 32)
    const localOffset = readU32(view, offset + 42)
    const name = decoder.decode(data.slice(offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + extraLength + commentLength
    if (flags & 0x1) throw new Error('不支持加密 ZIP')
    if (uncompressedSize > 2 * 1024 * 1024) throw new Error('技能包单个文件过大')
    if (name.endsWith('/')) continue
    if (readU32(view, localOffset) !== 0x04034b50) throw new Error('ZIP 本地文件头损坏')
    const localNameLength = readU16(view, localOffset + 26)
    const localExtraLength = readU16(view, localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const compressed = data.slice(start, start + compressedSize)
    let content: Uint8Array
    if (method === 0) content = compressed
    else if (method === 8) content = await inflateRaw(compressed)
    else throw new Error('不支持的 ZIP 压缩方式：' + method)
    entries.push({ name, data: content })
  }
  return entries
}