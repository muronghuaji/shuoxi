export const COMMON_SYSTEM_FONTS = [
  'Microsoft YaHei',
  'Microsoft YaHei UI',
  'SimSun',
  'SimHei',
  'KaiTi',
  'FangSong',
  'DengXian',
  'Source Han Serif SC',
  'Noto Serif SC',
  'Source Han Sans SC',
  'Noto Sans SC',
  'PingFang SC',
  'Songti SC',
  'STSong',
  'Segoe UI',
  'Arial',
  'Times New Roman',
  'Georgia',
  'Consolas',
  'Cascadia Code',
]

interface LocalFontData {
  family?: string
}

interface LocalFontWindow {
  queryLocalFonts?: () => Promise<LocalFontData[]>
}

function isFontAvailable(name: string): boolean {
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return false
    const sample = 'mmmmmmmmmmlli'
    const fallback = 'monospace'
    context.font = `14px ${JSON.stringify(fallback)}`
    const base = context.measureText(sample).width
    context.font = `14px ${JSON.stringify(name)}, ${fallback}`
    return Math.abs(context.measureText(sample).width - base) > 0.1
  } catch {
    return false
  }
}

export async function listSystemFonts(): Promise<string[]> {
  const found = new Set<string>()
  const localWindow = window as unknown as LocalFontWindow
  if (typeof localWindow.queryLocalFonts === 'function') {
    try {
      const fonts = await localWindow.queryLocalFonts()
      for (const font of fonts) {
        if (font.family?.trim()) found.add(font.family.trim())
      }
    } catch {
      // 用户拒绝授权时回退到常见字体检测。
    }
  }
  for (const name of COMMON_SYSTEM_FONTS) {
    if (isFontAvailable(name)) found.add(name)
  }
  return [...found].sort((left, right) => left.localeCompare(right, 'zh-CN'))
}
