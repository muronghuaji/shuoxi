import type {
  AccentColor,
  AppearanceSettings,
  BackgroundPreset,
  BackgroundScope,
  BuiltinAccentColor,
  CustomAccent,
  HomeLayout,
  ThemeMode,
  TypographyAreaSettings,
  TypographySettings,
} from './types'

export const APPEARANCE_STORAGE_KEY = 'shuoxi.appearance.v1'

export const THEME_OPTIONS: { value: ThemeMode; label: string; hint: string }[] = [
  { value: 'dark', label: '夜间', hint: '深色暖光，默认外观' },
  { value: 'light', label: '日间', hint: '暖白纸感，适合白天' },
  { value: 'system', label: '跟随系统', hint: '跟随 Windows 深浅色设置' },
]

export const ACCENT_OPTIONS: {
  value: BuiltinAccentColor
  label: string
  color: string
}[] = [
  { value: 'amber', label: '暖金', color: '#e8b563' },
  { value: 'sage', label: '青绿', color: '#8fb99b' },
  { value: 'blue', label: '雾蓝', color: '#8aadd6' },
  { value: 'rose', label: '玫瑰', color: '#d28fa2' },
  { value: 'violet', label: '紫藤', color: '#b49ad6' },
  { value: 'teal', label: '青瓷', color: '#79c2bb' },
  { value: 'coral', label: '珊瑚', color: '#e3987d' },
  { value: 'slate', label: '墨蓝', color: '#9aa7b7' },
]

const BUILTIN_ACCENTS = new Set<string>(ACCENT_OPTIONS.map((option) => option.value))

export const BACKGROUND_OPTIONS: {
  value: BackgroundPreset
  label: string
  hint: string
}[] = [
  { value: 'none', label: '无背景', hint: '只保留主题底色' },
  { value: 'paper', label: '暖纸', hint: '轻微纸张纹理' },
  { value: 'mountains', label: '远山', hint: '低对比度山影' },
  { value: 'fog', label: '雾灰', hint: '柔和的雾面渐变' },
  { value: 'ink', label: '墨色', hint: '深墨与低光晕' },
]

export const HOME_LAYOUT_OPTIONS: {
  value: HomeLayout
  label: string
  hint: string
}[] = [
  {
    value: 'studio',
    label: '剧场版',
    hint: '保留导演入口、角色会客厅与创作概览',
  },
  {
    value: 'shelf',
    label: '书架版',
    hint: '只保留继续写、作品书架和高频入口',
  },
]

export const BACKGROUND_SCOPES: { value: BackgroundScope; label: string }[] = [
  { value: 'home', label: '仅主页' },
  { value: 'app', label: '全局' },
]

export const UI_SCALE_OPTIONS = [100, 110, 125, 150] as const

export const TYPOGRAPHY_AREAS = [
  { id: 'global', label: '全局界面', hint: '菜单、按钮、表单' },
  { id: 'writing', label: '写作界面', hint: '正文与编辑区' },
  { id: 'reading', label: '阅读界面', hint: '沉浸阅读模式' },
  { id: 'chat', label: '聊天界面', hint: '角色会客厅' },
] as const

export const TYPOGRAPHY_FONTS = [
  { value: 'sans', label: '系统无衬线', stack: "'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Segoe UI', sans-serif" },
  { value: 'serif', label: '宋体 / 衬线', stack: "'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif" },
  { value: 'kai', label: '楷体', stack: "'KaiTi', 'STKaiti', 'Kaiti SC', '楷体', serif" },
  { value: 'hei', label: '黑体', stack: "'Source Han Sans SC', 'Noto Sans SC', 'Microsoft YaHei', 'SimHei', sans-serif" },
] as const

export const TYPOGRAPHY_WEIGHTS = [
  { value: 300, label: '细 300' },
  { value: 400, label: '常规 400' },
  { value: 500, label: '中等 500' },
  { value: 600, label: '粗 600' },
] as const

export const TYPOGRAPHY_COLORS = [
  { value: '', label: '跟随主题' },
  { value: '#ece7de', label: '暖白' },
  { value: '#d9d3c8', label: '米白' },
  { value: '#c8d6c2', label: '护眼绿' },
  { value: '#d7c8a8', label: '浅金' },
  { value: '#c9d6e4', label: '浅蓝' },
] as const

function typographyArea(
  input: Partial<TypographyAreaSettings>,
  defaults: TypographyAreaSettings,
  inheritOptions: TypographySettings[keyof TypographySettings]['inherit'][],
  limits: { fontSize: [number, number]; measure: [number, number] },
): TypographyAreaSettings {
  const inherit = inheritOptions.includes(input.inherit ?? defaults.inherit)
    ? (input.inherit ?? defaults.inherit)
    : defaults.inherit
  const fontFamily =
    typeof input.fontFamily === 'string' && /^[^"'{};\\<>]{0,80}$/.test(input.fontFamily.trim())
      ? input.fontFamily.trim()
      : defaults.fontFamily
  const color =
    input.color === '' || input.color === undefined
      ? ''
      : (normalizeHexColor(input.color) ?? defaults.color)
  return {
    inherit,
    fontFamily,
    fontSize: clamp(input.fontSize, limits.fontSize[0], limits.fontSize[1], defaults.fontSize),
    fontWeight: [300, 400, 500, 600, 700].includes(Number(input.fontWeight))
      ? Number(input.fontWeight)
      : defaults.fontWeight,
    color,
    lineHeight: clamp(input.lineHeight, 1.4, 2.4, defaults.lineHeight),
    measure:
      input.measure === 0
        ? 0
        : clamp(input.measure, limits.measure[0], limits.measure[1], defaults.measure),
  }
}

export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  global: {
    inherit: 'none',
    fontFamily: 'sans',
    fontSize: 14,
    fontWeight: 400,
    color: '',
    lineHeight: 1.65,
    measure: 0,
  },
  writing: {
    inherit: 'none',
    fontFamily: 'serif',
    fontSize: 16.5,
    fontWeight: 400,
    color: '',
    lineHeight: 1.82,
    measure: 0,
  },
  reading: {
    inherit: 'none',
    fontFamily: 'serif',
    fontSize: 18,
    fontWeight: 400,
    color: '',
    lineHeight: 1.85,
    measure: 720,
  },
  chat: {
    inherit: 'reading',
    fontFamily: 'serif',
    fontSize: 16.5,
    fontWeight: 400,
    color: '',
    lineHeight: 1.82,
    measure: 980,
  },
}

function normalizeTypography(raw: unknown): TypographySettings {
  const input = raw && typeof raw === 'object' ? (raw as Partial<TypographySettings>) : {}
  return {
    global: typographyArea(input.global ?? {}, DEFAULT_TYPOGRAPHY.global, ['none'], {
      fontSize: [12, 18],
      measure: [0, 0],
    }),
    writing: typographyArea(input.writing ?? {}, DEFAULT_TYPOGRAPHY.writing, ['none', 'global'], {
      fontSize: [14, 24],
      measure: [520, 1200],
    }),
    reading: typographyArea(
      input.reading ?? {},
      DEFAULT_TYPOGRAPHY.reading,
      ['none', 'global', 'writing'],
      { fontSize: [14, 30], measure: [520, 1200] },
    ),
    chat: typographyArea(
      input.chat ?? {},
      DEFAULT_TYPOGRAPHY.chat,
      ['none', 'global', 'writing', 'reading'],
      { fontSize: [13, 24], measure: [520, 1200] },
    ),
  }
}

function pickInherited(base: TypographyAreaSettings, own: TypographyAreaSettings): TypographyAreaSettings {
  return {
    ...own,
    fontFamily: base.fontFamily,
    fontSize: base.fontSize,
    fontWeight: base.fontWeight,
    color: base.color,
  }
}

export function resolveTypography(settings: TypographySettings): TypographySettings {
  const global = settings.global
  const writing =
    settings.writing.inherit === 'global'
      ? pickInherited(global, settings.writing)
      : settings.writing
  const reading =
    settings.reading.inherit === 'writing'
      ? pickInherited(writing, settings.reading)
      : settings.reading.inherit === 'global'
        ? pickInherited(global, settings.reading)
        : settings.reading
  const chat =
    settings.chat.inherit === 'reading'
      ? pickInherited(reading, settings.chat)
      : settings.chat.inherit === 'writing'
        ? pickInherited(writing, settings.chat)
        : settings.chat.inherit === 'global'
          ? pickInherited(global, settings.chat)
          : settings.chat
  return { global, writing, reading, chat }
}

function typographyFontStack(value: string, fallback: string): string {
  const known = TYPOGRAPHY_FONTS.find((item) => item.value === value)
  if (known) return known.stack
  if (!value) return fallback
  return `'${value.replace(/'/g, '')}', ${fallback}`
}

export function resolveTypographyFont(value: string, fallback = 'var(--serif-body)'): string {
  return typographyFontStack(value, fallback)
}

function typographyColor(value: string, theme: 'dark' | 'light'): string {
  if (value) return value
  return theme === 'dark' ? '#d9d3c8' : '#3d352b'
}

export function applyTypography(settings: TypographySettings, theme: 'dark' | 'light'): void {
  const root = document.documentElement
  const resolved = resolveTypography(settings)
  const set = (name: string, value: string) => root.style.setProperty(name, value)
  set('--sans', typographyFontStack(resolved.global.fontFamily, "'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Segoe UI', sans-serif"))
  set('--ui-font-family', typographyFontStack(resolved.global.fontFamily, 'var(--sans)'))
  set('--ui-font-size', `${resolved.global.fontSize}px`)
  set('--ui-font-weight', String(resolved.global.fontWeight))
  if (resolved.global.color) root.style.setProperty('--text', resolved.global.color)
  else root.style.removeProperty('--text')
  set('--ui-text-color', typographyColor(resolved.global.color, theme))
  set('--writing-font-family', typographyFontStack(resolved.writing.fontFamily, 'var(--serif-body)'))
  set('--writing-font-size', `${resolved.writing.fontSize}px`)
  set('--writing-font-weight', String(resolved.writing.fontWeight))
  set('--writing-color', typographyColor(resolved.writing.color, theme))
  set('--writing-line-height', String(resolved.writing.lineHeight))
  set('--writing-measure', `${resolved.writing.measure || 1240}px`)
  set('--reading-font-family', typographyFontStack(resolved.reading.fontFamily, 'var(--serif)'))
  set('--reading-font-size', `${resolved.reading.fontSize}px`)
  set('--reading-font-weight', String(resolved.reading.fontWeight))
  set('--reading-color', typographyColor(resolved.reading.color, theme))
  set('--reading-line-height', String(resolved.reading.lineHeight))
  set('--reading-measure', `${resolved.reading.measure || 720}px`)
  set('--chat-font-family', typographyFontStack(resolved.chat.fontFamily, 'var(--serif-body)'))
  set('--chat-font-size', `${resolved.chat.fontSize}px`)
  set('--chat-font-weight', String(resolved.chat.fontWeight))
  set('--chat-color', typographyColor(resolved.chat.color, theme))
  set('--chat-line-height', String(resolved.chat.lineHeight))
  set('--chat-measure', `${resolved.chat.measure || 980}px`)
  root.dataset.typography = 'custom'
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  mode: 'dark',
  accent: 'amber',
  customAccents: [],
  uiScale: 100,
  backgroundPreset: 'none',
  backgroundKind: 'preset',
  backgroundOpacity: 42,
  backgroundBlur: 0,
  backgroundScope: 'home',
  homeLayout: 'studio',
  typography: DEFAULT_TYPOGRAPHY,
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  const hex = match[1].toLowerCase()
  return hex.length === 3
    ? `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
    : `#${hex}`
}

function normalizeCustomAccents(raw: unknown): CustomAccent[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const accents: CustomAccent[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const value = item as Partial<CustomAccent>
    const color = normalizeHexColor(value.color)
    if (!color) continue
    const id =
      typeof value.id === 'string' && /^[a-z0-9-]{1,40}$/i.test(value.id)
        ? value.id
        : `color-${color.slice(1)}`
    if (seen.has(id)) continue
    seen.add(id)
    accents.push({
      id,
      label:
        typeof value.label === 'string' && value.label.trim()
          ? value.label.trim().slice(0, 24)
          : `自定义 ${accents.length + 1}`,
      color,
    })
    if (accents.length >= 12) break
  }
  return accents
}

export function normalizeAppearance(raw: unknown): AppearanceSettings {
  const input = raw && typeof raw === 'object' ? (raw as Partial<AppearanceSettings>) : {}
  const mode: ThemeMode =
    input.mode === 'light' || input.mode === 'system' || input.mode === 'dark'
      ? input.mode
      : DEFAULT_APPEARANCE.mode
  const customAccents = normalizeCustomAccents(input.customAccents)
  const requestedAccent = typeof input.accent === 'string' ? input.accent : 'amber'
  const accent: AccentColor =
    BUILTIN_ACCENTS.has(requestedAccent) ||
    customAccents.some((item) => `custom:${item.id}` === requestedAccent)
      ? (requestedAccent as AccentColor)
      : 'amber'
  const uiScale = UI_SCALE_OPTIONS.includes(input.uiScale as (typeof UI_SCALE_OPTIONS)[number])
    ? (input.uiScale as number)
    : DEFAULT_APPEARANCE.uiScale
  const backgroundPreset: BackgroundPreset =
    input.backgroundPreset === 'paper' ||
    input.backgroundPreset === 'mountains' ||
    input.backgroundPreset === 'fog' ||
    input.backgroundPreset === 'ink'
      ? input.backgroundPreset
      : 'none'
  const themeColor = normalizeHexColor(input.themeColor)
  return {
    mode,
    accent,
    customAccents,
    uiScale,
    backgroundPreset,
    backgroundKind: input.backgroundKind === 'image' ? 'image' : 'preset',
    backgroundOpacity: clamp(input.backgroundOpacity, 0, 100, DEFAULT_APPEARANCE.backgroundOpacity),
    backgroundBlur: clamp(input.backgroundBlur, 0, 18, DEFAULT_APPEARANCE.backgroundBlur),
    backgroundScope: input.backgroundScope === 'app' ? 'app' : 'home',
    ...(themeColor ? { themeColor } : {}),
    homeLayout: input.homeLayout === 'shelf' ? 'shelf' : 'studio',
    typography: normalizeTypography(input.typography),
  }
}

export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function presetGradient(preset: BackgroundPreset, theme: 'dark' | 'light'): string {
  if (preset === 'none') return 'none'
  const dark = theme === 'dark'
  const line = dark ? 'rgba(232,181,99,0.1)' : 'rgba(122,91,43,0.12)'
  const cool = dark ? 'rgba(126,153,181,0.12)' : 'rgba(86,114,140,0.12)'
  if (preset === 'paper') {
    return dark
      ? `radial-gradient(1100px 700px at 50% 0%, ${line}, transparent 70%), linear-gradient(145deg, #0d0d10, #15140f 55%, #0c0d10)`
      : `radial-gradient(1100px 700px at 50% 0%, ${line}, transparent 70%), linear-gradient(145deg, #f1eadf, #fbf7ef 55%, #ede5d8)`
  }
  if (preset === 'mountains') {
    return dark
      ? `radial-gradient(900px 420px at 78% 0%, ${line}, transparent 60%), linear-gradient(165deg, #0b0d10 0%, #101417 48%, #161a18 100%)`
      : `radial-gradient(900px 420px at 78% 0%, ${line}, transparent 60%), linear-gradient(165deg, #ecebe4 0%, #f4f1e8 48%, #e7e9e4 100%)`
  }
  if (preset === 'fog') {
    return dark
      ? `radial-gradient(900px 600px at 10% 10%, ${cool}, transparent 65%), linear-gradient(150deg, #0d0f12, #16161a 55%, #101214)`
      : `radial-gradient(900px 600px at 10% 10%, ${cool}, transparent 65%), linear-gradient(150deg, #f0f0ed, #f9f8f4 55%, #e9eceb)`
  }
  return dark
    ? `radial-gradient(1000px 700px at 90% 0%, ${line}, transparent 62%), linear-gradient(140deg, #08090b, #131315 58%, #0b0c10)`
    : `radial-gradient(1000px 700px at 90% 0%, ${line}, transparent 62%), linear-gradient(140deg, #eeeae2, #f7f3ea 58%, #e8e5df)`
}

function hexToRgb(color: string): [number, number, number] {
  const hex = color.replace('#', '')
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]
}

function rgbToHex(red: number, green: number, blue: number): string {
  const part = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')
  return `#${part(red)}${part(green)}${part(blue)}`
}

function mixColor(color: string, target: 'white' | 'black', amount: number): string {
  const [red, green, blue] = hexToRgb(color)
  const to = target === 'white' ? 255 : 0
  return rgbToHex(
    red + (to - red) * amount,
    green + (to - green) * amount,
    blue + (to - blue) * amount,
  )
}

function luminance(color: string): number {
  const [red, green, blue] = hexToRgb(color).map((value) => value / 255)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export function customAccentColor(appearance: AppearanceSettings): string | null {
  if (!appearance.accent.startsWith('custom:')) return null
  return (
    appearance.customAccents.find((item) => `custom:${item.id}` === appearance.accent)?.color ??
    null
  )
}

function applyCustomAccent(name: string, color: string, theme: 'dark' | 'light'): void {
  const root = document.documentElement
  const variables = [
    '--amber',
    '--amber-strong',
    '--amber-dim',
    '--accent-rgb',
    '--accent-gradient',
    '--accent-contrast',
  ]
  if (!name) {
    for (const variable of variables) root.style.removeProperty(variable)
    return
  }
  const [red, green, blue] = hexToRgb(color)
  const base = theme === 'light' ? mixColor(color, 'black', 0.2) : color
  const strong = theme === 'light' ? mixColor(color, 'black', 0.32) : mixColor(color, 'white', 0.14)
  const gradientStart = theme === 'light' ? mixColor(color, 'black', 0.1) : mixColor(color, 'white', 0.18)
  const contrast = luminance(base) > 0.48 ? '#17120b' : '#faf7ef'
  root.style.setProperty('--amber', base)
  root.style.setProperty('--amber-strong', strong)
  root.style.setProperty('--amber-dim', `rgba(${red}, ${green}, ${blue}, ${theme === 'light' ? 0.11 : 0.13})`)
  root.style.setProperty('--accent-rgb', `${red}, ${green}, ${blue}`)
  root.style.setProperty('--accent-gradient', `linear-gradient(180deg, ${gradientStart}, ${base})`)
  root.style.setProperty('--accent-contrast', contrast)
}

export function applyAppearance(
  appearance: AppearanceSettings,
  backgroundImage: string,
  view: string,
): void {
  const root = document.documentElement
  const theme = resolveTheme(appearance.mode)
  const effectiveImage =
    appearance.backgroundKind === 'image' && backgroundImage
      ? `url("${backgroundImage}")`
      : presetGradient(appearance.backgroundPreset, theme)
  const hasImage = appearance.backgroundKind === 'image' && Boolean(backgroundImage)
  const customAccent = customAccentColor(appearance)
  applyCustomAccent(customAccent ? 'custom' : '', customAccent ?? '', theme)
  root.dataset.theme = theme
  root.dataset.themeMode = appearance.mode
  root.dataset.accent = customAccent ? 'custom' : appearance.accent
  root.dataset.customTheme = appearance.themeColor ? '1' : '0'
  if (appearance.themeColor) {
    root.style.setProperty('--custom-theme-color', appearance.themeColor)
  } else {
    root.style.removeProperty('--custom-theme-color')
  }
  root.dataset.homeLayout = appearance.homeLayout
  root.dataset.bgKind = hasImage ? 'image' : appearance.backgroundPreset === 'none' ? 'none' : 'preset'
  root.dataset.bgPreset = appearance.backgroundPreset
  root.dataset.bgScope = appearance.backgroundScope
  root.style.setProperty('--app-bg-image', effectiveImage || 'none')
  root.style.setProperty(
    '--app-bg-opacity',
    hasImage
      ? String(appearance.backgroundOpacity / 100)
      : appearance.backgroundPreset === 'none'
        ? '0'
        : String(Math.max(0.32, appearance.backgroundOpacity / 100)),
  )
  root.style.setProperty('--app-bg-blur', `${appearance.backgroundBlur}px`)
  root.style.setProperty('--ui-scale', String(appearance.uiScale / 100))
  applyTypography(appearance.typography, theme)
  root.style.setProperty(
    '--app-bg-overlay',
    theme === 'dark' ? 'rgba(8, 8, 11, 0.58)' : 'rgba(247, 243, 235, 0.64)',
  )
  root.style.colorScheme = theme
  document.body.dataset.view = view
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    theme === 'dark' ? '#0a0a0c' : '#f4efe6',
  )
}
