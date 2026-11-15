import { parseImportedNovel } from './novelImport'
import type { ImportedNovel, NovelImportProgress } from './novelImport'
import { decodeNovelBuffer } from './novelEncoding'

interface ImportRequest {
  file: File
}

type ImportResponse =
  | ({ type: 'progress' } & NovelImportProgress)
  | { type: 'done'; novel: ImportedNovel }
  | { type: 'error'; message: string }

function send(message: ImportResponse) {
  self.postMessage(message)
}

self.onmessage = async (event: MessageEvent<ImportRequest>) => {
  const file = event.data?.file
  if (!file) {
    send({ type: 'error', message: '没有拿到导入文件' })
    return
  }
  try {
    send({ type: 'progress', percent: 4, stage: '读取文件…' })
    const buffer = await file.arrayBuffer()
    send({
      type: 'progress',
      percent: 10,
      stage: `已读取 ${(file.size / 1024 / 1024).toFixed(1)} MB，检测编码…`,
    })
    const { text, encoding } = decodeNovelBuffer(buffer)
    send({
      type: 'progress',
      percent: 16,
      stage: `编码：${encoding}，开始识别章节…`,
    })
    const novel = parseImportedNovel(file.name, text, (progress) => {
      send({ type: 'progress', ...progress })
    })
    send({ type: 'done', novel })
  } catch (error) {
    send({
      type: 'error',
      message: error instanceof Error ? error.message : '导入解析失败',
    })
  }
}
