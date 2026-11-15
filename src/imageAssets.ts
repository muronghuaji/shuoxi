export type ImagePurpose = 'cover' | 'avatar' | 'chat-background'

interface ImagePreset {
  width: number
  height: number
  fit: 'cover' | 'contain'
  quality: number
  maxBytes: number
}

const PRESETS: Record<ImagePurpose, ImagePreset> = {
  cover: { width: 600, height: 900, fit: 'cover', quality: 0.84, maxBytes: 12 * 1024 * 1024 },
  avatar: { width: 256, height: 256, fit: 'cover', quality: 0.84, maxBytes: 8 * 1024 * 1024 },
  'chat-background': {
    width: 1600,
    height: 1000,
    fit: 'cover',
    quality: 0.78,
    maxBytes: 16 * 1024 * 1024,
  },
}

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片无法解码，请换 JPG / PNG / WebP'))
    image.src = url
  })
}

async function loadDrawable(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  const url = URL.createObjectURL(file)
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => {
          bitmap.close()
          URL.revokeObjectURL(url)
        },
      }
    } catch {
      // 回退到 img 解码
    }
  }
  try {
    const image = await loadImageElement(url)
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function fitBox(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  fit: 'cover' | 'contain',
): { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number } {
  const targetRatio = targetWidth / targetHeight
  const sourceRatio = sourceWidth / sourceHeight
  if (fit === 'contain') {
    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
    const dw = Math.max(1, Math.round(sourceWidth * scale))
    const dh = Math.max(1, Math.round(sourceHeight * scale))
    return {
      sx: 0,
      sy: 0,
      sw: sourceWidth,
      sh: sourceHeight,
      dx: Math.round((targetWidth - dw) / 2),
      dy: Math.round((targetHeight - dh) / 2),
      dw,
      dh,
    }
  }
  if (sourceRatio > targetRatio) {
    const sw = Math.max(1, Math.round(sourceHeight * targetRatio))
    return {
      sx: Math.round((sourceWidth - sw) / 2),
      sy: 0,
      sw,
      sh: sourceHeight,
      dx: 0,
      dy: 0,
      dw: targetWidth,
      dh: targetHeight,
    }
  }
  const sh = Math.max(1, Math.round(sourceWidth / targetRatio))
  return {
    sx: 0,
    sy: Math.round((sourceHeight - sh) / 2),
    sw: sourceWidth,
    sh,
    dx: 0,
    dy: 0,
    dw: targetWidth,
    dh: targetHeight,
  }
}

export async function prepareImage(file: File, purpose: ImagePurpose): Promise<string> {
  const preset = PRESETS[purpose]
  if (file.size > preset.maxBytes) {
    throw new Error(`图片太大，请换 ${Math.round(preset.maxBytes / 1024 / 1024)}MB 以内的文件`)
  }
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error('只支持 JPG / PNG / WebP 图片')
  }
  const drawable = await loadDrawable(file)
  try {
    if (!drawable.width || !drawable.height) throw new Error('图片尺寸无效')
    const canvas = document.createElement('canvas')
    canvas.width = preset.width
    canvas.height = preset.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前环境无法处理图片')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    const box = fitBox(
      drawable.width,
      drawable.height,
      preset.width,
      preset.height,
      preset.fit,
    )
    context.drawImage(
      drawable.source,
      box.sx,
      box.sy,
      box.sw,
      box.sh,
      box.dx,
      box.dy,
      box.dw,
      box.dh,
    )
    const dataUrl = canvas.toDataURL('image/webp', preset.quality)
    if (!dataUrl.startsWith('data:image/')) throw new Error('图片处理失败')
    return dataUrl
  } finally {
    drawable.release()
  }
}
