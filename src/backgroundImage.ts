const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_EDGE = 2400

export async function compressBackgroundImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('图片超过 20MB，请先压缩')
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法处理图片')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const webp = canvas.toDataURL('image/webp', 0.8)
  if (webp.startsWith('data:image/webp')) return webp
  return canvas.toDataURL('image/jpeg', 0.82)
}
