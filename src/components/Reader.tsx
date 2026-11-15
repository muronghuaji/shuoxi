import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Chapter, TypographySettings, Work } from '../types'
import type { EntityIndexEntry } from '../entityIndex'
import { resolveTypography } from '../appearance'
import { useContextMenu } from './ContextMenuProvider'
import { BookmarkModal } from './BookmarkModal'
import { EntityInfoCard } from './EntityInfoCard'
import { NumberInput } from './NumberInput'
import { copyTextToClipboard } from '../clipboard'
import {
  buildReaderTtsSentences,
  DEFAULT_READER_TTS_SETTINGS,
  normalizeReaderTtsSettings,
  READER_TTS_SETTINGS_KEY,
  type ReaderTtsSettings,
} from '../readerTts'
import {
  DEFAULT_READER_SETTINGS,
  READER_SETTINGS_KEY,
  READER_THEME_META,
  loadReaderPosition,
  normalizeReaderSettings,
  readingProgress,
  saveReaderPosition,
  type ReaderSettings,
  type ReaderTheme,
} from '../reader'
import { useStoredState } from '../hooks/useStoredState'
import { loadReaderHighlights, saveReaderHighlights, type ReaderHighlight } from '../readerHighlights'
import { formatReaderDuration, loadReaderStats, recordReaderStats, type ReaderStats } from '../readerStats'
import { ENTITY_CATEGORY_LABELS, splitEntityText } from '../entityHighlight'
import { countWords } from '../utils'
import {
  IconBookOpen,
  IconBookmark,
  IconChevronLeft,
  IconChevronRight,
  IconMaximize,
  IconMinimize,
  IconPlay,
  IconSettings,
  IconStop,
  IconX,
} from './Icons'

interface ReaderProps {
  work: Work
  chapters: Chapter[]
  initialChapterId?: string
  entityEntries: EntityIndexEntry[]
  typography?: TypographySettings
  onClose: (chapterId: string) => void
  onOpenShelf?: (chapterId: string) => void
  generation?: {
    completed: number
    total: number
    status: 'writing' | 'paused' | 'done' | 'error'
    currentChapter?: number
    onContinue: (count?: number) => void
    onStop: () => void
  }
  sync?: {
    status: 'idle' | 'running' | 'error'
    done: number
    total: number
    onOpen: () => void
  }
  billing?: {
    balance: string
    cost: string
    loading?: boolean
    onRefresh?: () => void
  }
  onOpenDetails?: () => void
  onOpenWriter?: () => void
  onOpenAddressReview?: () => void
  onOpenEntityDetails?: (entry: EntityIndexEntry) => void
}

type ReaderPanel = 'toc' | 'settings' | null

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  onChange: (value: number) => void
}) {
  return (
    <label className="reader-slider">
      <span>
        {label}
        <small>
          {value}
          {suffix}
        </small>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

export function Reader({
  work,
  chapters,
  initialChapterId,
  entityEntries,
  typography,
  onClose,
  onOpenShelf,
  generation,
  sync,
  billing,
  onOpenDetails,
  onOpenWriter,
  onOpenAddressReview,
  onOpenEntityDetails,
}: ReaderProps) {
  const { openContextMenu } = useContextMenu()
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const savedPosition = useMemo(() => loadReaderPosition(work.id), [work.id])
  const [readerStats, setReaderStats] = useState<ReaderStats>(() => loadReaderStats(work.id))
  const sessionStartedAtRef = useRef(Date.now())
  const initialId = savedPosition?.chapterId ?? initialChapterId
  const initialIndex = chapters.findIndex((chapter) => chapter.id === initialId)
  const [index, setIndex] = useState(initialIndex >= 0 ? initialIndex : 0)
  const [panel, setPanel] = useState<ReaderPanel>(null)
  const [settings, setSettings] = useStoredState<ReaderSettings>(
    READER_SETTINGS_KEY,
    DEFAULT_READER_SETTINGS,
    normalizeReaderSettings,
  )
  const [ttsSettings, setTtsSettings] = useStoredState<ReaderTtsSettings>(
    READER_TTS_SETTINGS_KEY,
    DEFAULT_READER_TTS_SETTINGS,
    (raw) =>
      normalizeReaderTtsSettings(
        raw as Partial<ReaderTtsSettings> | null | undefined,
      ),
  )
  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([])
  const [ttsState, setTtsState] = useState<'idle' | 'playing' | 'paused'>('idle')
  const [activeSentence, setActiveSentence] = useState(-1)
  const [ttsBarOpen, setTtsBarOpen] = useState(false)
  const [ttsNotice, setTtsNotice] = useState('')
  const ttsTokenRef = useRef(0)
  const ttsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const autoNextTtsRef = useRef(false)
  const ttsSettingsRef = useRef<ReaderTtsSettings>(ttsSettings)
  ttsSettingsRef.current = ttsSettings
  const [scrollRatio, setScrollRatio] = useState(savedPosition?.scrollRatio ?? 0)
  const [fullscreen, setFullscreen] = useState(false)
  const [chromeHidden, setChromeHidden] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [tocQuery, setTocQuery] = useState('')
  const [highlights, setHighlights] = useState<ReaderHighlight[]>(() => loadReaderHighlights(work.id))
  const [selectionMenu, setSelectionMenu] = useState<{
    left: number
    top: number
    text: string
    start: number
    end: number
  } | null>(null)
  const [entityCard, setEntityCard] = useState<{
    entry: EntityIndexEntry
    left: number
    top: number
  } | null>(null)
  const [continueChoice, setContinueChoice] = useState('1')
  const [customContinueCount, setCustomContinueCount] = useState(5)
  const [continueMenuOpen, setContinueMenuOpen] = useState(false)
  const [continueMenuPosition, setContinueMenuPosition] = useState({ top: 0, right: 0 })
  const continueCount =
    continueChoice === 'custom'
      ? Math.max(1, Math.min(100, Math.floor(customContinueCount) || 1))
      : Math.max(1, Number(continueChoice) || 1)
  const activeTocRef = useRef<HTMLButtonElement | null>(null)
  const chromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const restoreRatioRef = useRef(savedPosition?.scrollRatio ?? 0)
  const resolvedReading = useMemo(
    () => (typography ? resolveTypography(typography).reading : null),
    [typography],
  )

  useEffect(() => {
    if (!resolvedReading) return
    setSettings((prev) => ({
      ...prev,
      fontFamily:
        resolvedReading.fontFamily === 'sans' || resolvedReading.fontFamily === 'hei'
          ? 'sans'
          : 'serif',
      fontSize: resolvedReading.fontSize,
      lineHeight: resolvedReading.lineHeight,
      pageWidth: resolvedReading.measure || prev.pageWidth,
    }))
  }, [
    resolvedReading?.fontFamily,
    resolvedReading?.fontSize,
    resolvedReading?.lineHeight,
    resolvedReading?.measure,
    setSettings,
  ])

  useEffect(() => {
    setHighlights(loadReaderHighlights(work.id))
  }, [work.id])

  const currentChapter = chapters[index]
  const content = currentChapter?.content ?? ''
  const paragraphs = useMemo(
    () =>
      content
        .split(/\n+/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean),
    [content],
  )
  const ttsSentences = useMemo(() => buildReaderTtsSentences(paragraphs), [paragraphs])
  const paragraphStarts = useMemo(() => {
    let cursor = 0
    return paragraphs.map((paragraph) => {
      const found = content.indexOf(paragraph, cursor)
      const start = found >= 0 ? found : cursor
      cursor = start + paragraph.length
      return start
    })
  }, [content, paragraphs])

  const ttsSupported =
    typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'
  const ttsVoiceOptions = useMemo(() => {
    const chinese = ttsVoices.filter((voice) => /^zh/i.test(voice.lang))
    const rest = ttsVoices.filter((voice) => !/^zh/i.test(voice.lang))
    return [...chinese, ...rest]
  }, [ttsVoices])
  const percent = readingProgress(chapters, index, scrollRatio)
  const theme = READER_THEME_META[settings.theme]
  const wordCount = currentChapter?.wordCount ?? countWords(content)
  const chapterHighlights = highlights.filter((item) => item.chapterId === currentChapter?.id)
  const chapterPercent = Math.round(scrollRatio * 100)
  const remainingMinutes = Math.max(
    1,
    Math.ceil((Math.max(0, wordCount) * (1 - scrollRatio)) / 500),
  )
  const nextChapter = chapters[index + 1]
  const tocItems = chapters
    .map((chapter, chapterIndex) => ({ chapter, chapterIndex }))
    .filter(({ chapter }) => {
      const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase()
      const query = normalize(tocQuery)
      return !query || normalize(chapter.title).includes(query)
    })

  const saveCurrentPosition = (chapterId = currentChapter?.id) => {
    if (!chapterId) return
    saveReaderPosition(work.id, chapterId, scrollRatio)
  }

  useEffect(() => {
    setReaderStats(loadReaderStats(work.id))
    sessionStartedAtRef.current = Date.now()
  }, [work.id])

  const closeReader = () => {
    stopTts(false)
    saveCurrentPosition()
    setReaderStats(
      recordReaderStats(
        work.id,
        Math.max(1, Math.round((Date.now() - sessionStartedAtRef.current) / 1000)),
        wordCount,
      ),
    )
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    const chapterId = currentChapter?.id ?? ''
    if (onOpenShelf) onOpenShelf(chapterId)
    else onClose(chapterId)
  }

  const goToChapter = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= chapters.length) return
    stopTts(false)
    saveCurrentPosition()
    setIndex(nextIndex)
    setScrollRatio(0)
    restoreRatioRef.current = 0
    setPanel(null)
  }

  const stopTts = (closeBar = true) => {
    ttsTokenRef.current += 1
    if (ttsSupported) window.speechSynthesis.cancel()
    ttsUtteranceRef.current = null
    setTtsState('idle')
    setActiveSentence(-1)
    if (closeBar) setTtsBarOpen(false)
  }

  const finishTts = () => {
    if (ttsSettingsRef.current.autoNext && index < chapters.length - 1) {
      autoNextTtsRef.current = true
      goToChapter(index + 1)
      return
    }
    ttsTokenRef.current += 1
    ttsUtteranceRef.current = null
    setTtsState('idle')
    setActiveSentence(-1)
    setTtsBarOpen(false)
  }

  const speakTtsSentence = (sentenceIndex: number) => {
    if (!ttsSupported) return
    const sentence = ttsSentences[sentenceIndex]
    if (!sentence) {
      finishTts()
      return
    }
    const token = ttsTokenRef.current
    const utterance = new SpeechSynthesisUtterance(sentence.text)
    const currentSettings = ttsSettingsRef.current
    const voice = ttsVoices.find((item) => item.voiceURI === currentSettings.voiceURI)
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang || 'zh-CN'
    utterance.rate = currentSettings.rate
    utterance.volume = currentSettings.volume
    utterance.onend = () => {
      if (token !== ttsTokenRef.current) return
      speakTtsSentence(sentenceIndex + 1)
    }
    utterance.onerror = (event) => {
      if (token !== ttsTokenRef.current) return
      if (event.error === 'canceled' || event.error === 'interrupted') return
      stopTts()
      setTtsNotice('朗读失败，请检查系统语音或稍后重试')
    }
    ttsUtteranceRef.current = utterance
    setActiveSentence(sentenceIndex)
    window.speechSynthesis.speak(utterance)
  }

  const startTts = (fromIndex = 0) => {
    if (!ttsSupported) {
      setTtsNotice('当前系统不支持朗读')
      return
    }
    if (ttsSentences.length === 0) {
      setTtsNotice('当前章节没有可朗读的正文')
      return
    }
    window.speechSynthesis.cancel()
    ttsTokenRef.current += 1
    setTtsNotice('')
    setTtsBarOpen(true)
    setTtsState('playing')
    setActiveSentence(fromIndex)
    speakTtsSentence(fromIndex)
  }

  const toggleTts = () => {
    if (ttsState === 'playing') {
      window.speechSynthesis.pause()
      setTtsState('paused')
      return
    }
    if (ttsState === 'paused') {
      window.speechSynthesis.resume()
      setTtsState('playing')
      return
    }
    startTts(0)
  }

  const updateSettings = (patch: Partial<ReaderSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }

  const applyReadingPreset = (preset: 'comfort' | 'compact' | 'large') => {
    if (preset === 'compact') {
      updateSettings({ fontSize: 17, lineHeight: 1.7, pageWidth: 900, paragraphGap: 0.55 })
    } else if (preset === 'large') {
      updateSettings({ fontSize: 23, lineHeight: 2.05, pageWidth: 760, paragraphGap: 1.05 })
    } else {
      updateSettings({ fontSize: 19, lineHeight: 1.95, pageWidth: 780, paragraphGap: 0.9 })
    }
  }

  useEffect(() => {
    if (!ttsSupported) return
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices()
      setTtsVoices(voices)
      if (!ttsSettings.voiceURI && voices.length > 0) {
        const preferred =
          voices.find((voice) => /^zh/i.test(voice.lang) && /xiaoxiao|huihui|tingting|yaoyao|female/i.test(voice.name)) ??
          voices.find((voice) => /^zh/i.test(voice.lang)) ??
          voices[0]
        setTtsSettings((prev) => ({ ...prev, voiceURI: preferred.voiceURI }))
      }
    }
    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
  }, [setTtsSettings, ttsSettings.voiceURI, ttsSupported])

  useEffect(() => {
    return () => {
      ttsTokenRef.current += 1
      if (ttsSupported) window.speechSynthesis.cancel()
    }
  }, [ttsSupported])

  useEffect(() => {
    if (activeSentence < 0) return
    const element = document.querySelector<HTMLElement>(
      `[data-tts-sentence="${activeSentence}"]`,
    )
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeSentence])

  useEffect(() => {
    if (!autoNextTtsRef.current) return
    autoNextTtsRef.current = false
    const timer = window.setTimeout(() => startTts(0), 80)
    return () => window.clearTimeout(timer)
    // startTts 取决于新章节内容，由 index 变化触发。
  }, [index])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleFullscreen)
    return () => document.removeEventListener('fullscreenchange', handleFullscreen)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (shortcutsOpen) {
          setShortcutsOpen(false)
        } else if (panel) {
          setPanel(null)
        } else {
          closeReader()
        }
        return
      }
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT'
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === '?') {
        event.preventDefault()
        setShortcutsOpen((value) => !value)
        return
      }
      if (event.key.toLowerCase() === 'h') {
        event.preventDefault()
        setChromeHidden((value) => !value)
        if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current)
        return
      }
      if (event.key === ' ' && ttsState !== 'idle') {
        event.preventDefault()
        toggleTts()
        return
      }
      if (event.key === 'PageDown' || (event.key === ' ' && ttsState === 'idle')) {
        event.preventDefault()
        scrollPage(1)
        return
      }
      if (event.key === 'PageUp') {
        event.preventDefault()
        scrollPage(-1)
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        scrollPage(1)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        scrollPage(-1)
        return
      }
      if (!typing && event.key.toLowerCase() === 'r' && ttsState === 'idle') {
        event.preventDefault()
        startTts(0)
        return
      }
      if (!typing && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        void toggleFullscreen()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToChapter(index - 1)
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goToChapter(index + 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const ratio = restoreRatioRef.current
    restoreRatioRef.current = 0
    requestAnimationFrame(() => {
      const max = container.scrollHeight - container.clientHeight
      container.scrollTop = max > 0 ? max * ratio : 0
      setScrollRatio(max > 0 ? ratio : 0)
    })
  }, [index])

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget
    const max = container.scrollHeight - container.clientHeight
    setScrollRatio(max > 0 ? Math.min(1, Math.max(0, container.scrollTop / max)) : 0)
    setSelectionMenu(null)
  }

  const scheduleChromeHide = () => {
    if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current)
    chromeTimerRef.current = setTimeout(() => setChromeHidden(true), 2800)
  }

  const wakeChrome = () => {
    setChromeHidden(false)
    scheduleChromeHide()
  }

  const scrollPage = (direction: -1 | 1) => {
    const container = scrollRef.current
    if (!container) return
    container.scrollBy({
      top: direction * Math.max(280, container.clientHeight * 0.82),
      behavior: 'smooth',
    })
    wakeChrome()
  }

  useEffect(() => {
    wakeChrome()
    const handleMove = (event: MouseEvent) => {
      if (event.clientY < 96 || event.clientY > window.innerHeight - 96) wakeChrome()
    }
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) wakeChrome()
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('wheel', handleWheel, { passive: true })
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('wheel', handleWheel)
      if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current)
    }
    // wakeChrome 只操作本地 UI 计时器
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (panel || bookmarksOpen || shortcutsOpen || ttsBarOpen) {
      setChromeHidden(false)
      if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current)
    }
  }, [panel, bookmarksOpen, shortcutsOpen, ttsBarOpen])

  useEffect(() => {
    if (panel !== 'toc') return
    activeTocRef.current?.scrollIntoView({ block: 'center' })
  }, [panel, index, tocQuery])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // 浏览器或 Electron 拒绝全屏时，不影响阅读
    }
  }

  const renderHighlighted = (text: string, baseStart: number) => {
    const overlapping = chapterHighlights
      .filter((item) => item.end > baseStart && item.start < baseStart + text.length)
      .sort((left, right) => left.start - right.start)
    if (overlapping.length === 0) return null
    const nodes: ReactNode[] = []
    let cursor = 0
    overlapping.forEach((item, index) => {
      const start = Math.max(0, item.start - baseStart)
      const end = Math.min(text.length, item.end - baseStart)
      if (start > cursor) {
        nodes.push(<span key={`hl-text-${index}-${cursor}`}>{text.slice(cursor, start)}</span>)
      }
      if (end > start) {
        nodes.push(
          <mark
            key={`hl-${item.id}`}
            className={`reader-highlight color-${item.color}`}
            title={item.note || '双击删除高亮'}
            onDoubleClick={() => {
              if (!window.confirm('删除这段高亮？')) return
              const next = highlights.filter((highlight) => highlight.id !== item.id)
              setHighlights(next)
              saveReaderHighlights(work.id, next)
            }}
          >
            {text.slice(start, end)}
          </mark>,
        )
      }
      cursor = Math.max(cursor, end)
    })
    if (cursor < text.length) nodes.push(<span key={`hl-tail-${cursor}`}>{text.slice(cursor)}</span>)
    return nodes
  }

  const renderParagraph = (paragraph: string, baseStart?: number) => {
    if (baseStart !== undefined) {
      const highlighted = renderHighlighted(paragraph, baseStart)
      if (highlighted) return highlighted
    }
    if (!settings.showEntityColors || entityEntries.length === 0) return paragraph
    return splitEntityText(paragraph, entityEntries).map((segment, index) => {
      if (!segment.entity) return <span key={`reader-text-${index}`}>{segment.text}</span>
      return (
        <span
          key={`reader-entity-${index}-${segment.entity.id}`}
          className={`reader-entity ${segment.entity.tierColor ? 'has-tier' : 'no-tier'}`}
          style={
            segment.entity.tierColor
              ? ({
                  '--entity-color': segment.entity.tierColor,
                } as CSSProperties)
              : undefined
          }
          title={`${ENTITY_CATEGORY_LABELS[segment.entity.category]}${segment.entity.tierLabel ? ` · ${segment.entity.tierLabel}` : ''}：${segment.entity.name}`}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            setEntityCard({
              entry: segment.entity as EntityIndexEntry,
              left: Math.min(window.innerWidth - 260, Math.max(8, rect.left)),
              top: Math.min(window.innerHeight - 220, rect.bottom + 6),
            })
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            const rect = event.currentTarget.getBoundingClientRect()
            setEntityCard({
              entry: segment.entity as EntityIndexEntry,
              left: Math.min(window.innerWidth - 260, Math.max(8, rect.left)),
              top: Math.min(window.innerHeight - 220, rect.bottom + 6),
            })
          }}
        >
          {segment.text}
        </span>
      )
    })
  }

  const handleReaderSelection = () => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) {
      setSelectionMenu(null)
      return
    }
    const text = selection.toString().trim()
    if (!text) {
      setSelectionMenu(null)
      return
    }
    const range = selection.getRangeAt(0)
    const article = scrollRef.current?.querySelector('.reader-article')
    if (!article || !article.contains(range.commonAncestorContainer)) {
      setSelectionMenu(null)
      return
    }
    const start = content.indexOf(text)
    if (start < 0) {
      setSelectionMenu(null)
      return
    }
    const rect = range.getBoundingClientRect()
    setSelectionMenu({
      left: Math.max(8, Math.min(window.innerWidth - 240, rect.left + rect.width / 2 - 104)),
      top: Math.min(window.innerHeight - 100, rect.bottom + 8),
      text,
      start,
      end: start + text.length,
    })
  }

  const addSelectionHighlight = (note = '') => {
    if (!selectionMenu || !currentChapter) return
    const next: ReaderHighlight[] = [
      ...highlights,
      {
        id: `hl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        workId: work.id,
        chapterId: currentChapter.id,
        start: selectionMenu.start,
        end: selectionMenu.end,
        text: selectionMenu.text,
        note,
        color: 'amber',
        createdAt: Date.now(),
      },
    ]
    setHighlights(next)
    saveReaderHighlights(work.id, next)
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
  }

  const addSelectionNote = () => {
    if (!selectionMenu) return
    const note = window.prompt('给这段文字写批注（可留空）', '')
    if (note === null) return
    addSelectionHighlight(note.trim())
  }

  return (
    <div
      className={`reader-overlay ${chromeHidden ? 'chrome-hidden' : ''}`}
      onMouseDown={wakeChrome}
      data-theme={settings.theme}
      style={
        {
          '--reader-bg': theme.background,
          '--reader-text': resolvedReading?.color || theme.text,
          '--reader-muted': theme.muted,
          '--reader-font-size': `${settings.fontSize}px`,
          '--reader-line-height': String(settings.lineHeight),
          '--reader-page-width': `${settings.pageWidth}px`,
          '--reader-paragraph-gap': `${settings.paragraphGap}em`,
          '--reader-font-family': settings.fontFamily === 'sans' ? 'var(--sans)' : 'var(--serif)',
        } as CSSProperties
      }
      role="dialog"
      aria-modal="true"
      aria-label="阅读模式"
    >
      <header className="reader-topbar">
        <div className="reader-head-left">
          <button type="button" className="reader-exit" onClick={closeReader}>
            <IconChevronLeft size={16} />
            书库
          </button>
          <div className="reader-work-title">
            <span>正在阅读</span>
            <strong>{work.title}</strong>
          </div>
        </div>
        <div className="reader-head-progress" aria-label={`阅读进度 ${percent}%`}>
          <span>
            第 {chapters.length ? index + 1 : 0} / {chapters.length} 章
          </span>
          <strong>{percent}%</strong>
        </div>
        <div className="reader-head-actions">
          <div className="reader-head-billing">
            {billing ? (
              <button
                type="button"
                className="reader-billing-pill"
                onClick={billing.onRefresh}
                title="刷新账户余额"
              >
                <span>余额</span>
                <strong>{billing.balance}</strong>
                {billing.loading ? <i>刷新中</i> : null}
              </button>
            ) : null}
            {billing ? (
              <span className="reader-billing-pill reader-cost-pill" title="本次阅读期间的生成费用">
                <span>本次计费</span>
                <strong>{billing.cost}</strong>
              </span>
            ) : null}
          </div>
          {sync ? (
            <button
              type="button"
              className={`reader-action-btn reader-sync-btn ${sync.status}`}
              onClick={sync.onOpen}
              title="查看同步队列"
            >
              {sync.status === 'running'
                ? `同步中 ${sync.done}/${sync.total}`
                : sync.status === 'error'
                  ? '同步失败 · 查看队列'
                  : '同步已完成'}
            </button>
          ) : null}
          {generation ? (
            <div className="reader-generation-group">
              {generation.status !== 'writing' ? (
                <button
                  type="button"
                  className="reader-continue-count"
                  title="选择一次续写的章数"
                  aria-expanded={continueMenuOpen}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setContinueMenuPosition({
                      top: rect.bottom + 6,
                      right: Math.max(10, window.innerWidth - rect.right),
                    })
                    setContinueMenuOpen((open) => !open)
                  }}
                >
                  <span>章数</span>
                  <strong>{continueCount} 章</strong>
                  <span className="reader-continue-caret" aria-hidden="true">▾</span>
                </button>
              ) : null}
              <button
                type="button"
                className="reader-action-btn reader-generation-btn"
                onClick={
                  generation.status === 'writing'
                    ? generation.onStop
                    : () => generation.onContinue(continueCount)
                }
                title={
                  generation.status === 'writing'
                    ? '停止生成'
                    : generation.completed >= generation.total
                      ? `续写 ${continueCount} 章`
                      : '继续生成未完成章节'
                }
              >
                {generation.status === 'writing'
                  ? `写第 ${generation.completed + 1} 章… 停止`
                  : generation.completed >= generation.total
                    ? `续写 ${continueCount} 章`
                    : `继续写 · ${generation.completed}/${generation.total}`}
              </button>
            </div>
          ) : null}
          {onOpenDetails ? (
            <button type="button" className="reader-action-btn" onClick={onOpenDetails}>
              作品详情
            </button>
          ) : null}
          {onOpenWriter ? (
            <button type="button" className="reader-action-btn" onClick={onOpenWriter}>
              写作
            </button>
          ) : null}
          {onOpenAddressReview ? (
            <button type="button" className="reader-action-btn" onClick={onOpenAddressReview}>
              称呼
            </button>
          ) : null}
          <button
            type="button"
            className={`reader-icon-btn ${bookmarksOpen ? 'active' : ''}`}
            title="书签"
            aria-label="书签"
            onClick={() => setBookmarksOpen((value) => !value)}
          >
            <IconBookmark size={17} />
          </button>
          <button
            type="button"
            className={`reader-icon-btn ${ttsState !== 'idle' ? 'active' : ''}`}
            title={ttsState === 'idle' ? '朗读本章' : ttsState === 'playing' ? '朗读控制' : '继续朗读'}
            aria-label="朗读"
            onClick={() => {
              if (ttsState === 'idle') startTts(0)
              else setTtsBarOpen((value) => !value)
            }}
          >
            <IconPlay size={17} />
          </button>
          <button
            type="button"
            className={`reader-icon-btn ${panel === 'toc' ? 'active' : ''}`}
            title="目录"
            aria-label="目录"
            onClick={() => setPanel((prev) => (prev === 'toc' ? null : 'toc'))}
          >
            <IconBookOpen size={17} />
          </button>
          <button
            type="button"
            className={`reader-icon-btn ${panel === 'settings' ? 'active' : ''}`}
            title="阅读显示设置"
            aria-label="阅读显示设置"
            onClick={() => setPanel((prev) => (prev === 'settings' ? null : 'settings'))}
          >
            <IconSettings size={17} />
          </button>
          <button
            type="button"
            className="reader-icon-btn reader-fullscreen-btn"
            title={fullscreen ? '退出全屏' : '全屏阅读'}
            aria-label={fullscreen ? '退出全屏' : '全屏阅读'}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <IconMinimize size={16} /> : <IconMaximize size={16} />}
          </button>
          <button
            type="button"
            className="reader-icon-btn reader-close-btn"
            title="关闭阅读模式"
            aria-label="关闭阅读模式"
            onClick={closeReader}
          >
            <IconX size={17} />
          </button>
        </div>
      </header>

      <div className="reader-progress-track" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>


      <div className="reader-scroll" ref={scrollRef} onScroll={handleScroll}>
        {currentChapter ? (
          <article
            className="reader-article"
            onMouseDown={() => setSelectionMenu(null)}
            onMouseUp={handleReaderSelection}
            onContextMenu={(event) => {
              const selected = window.getSelection()?.toString() ?? ''
              openContextMenu(event, [
                { type: 'label', label: currentChapter?.title || `第 ${index + 1} 章` },
                {
                  label: '复制选中文字',
                  disabled: !selected.trim(),
                  onSelect: () => {
                    void copyTextToClipboard(selected)
                  },
                },
                {
                  label: '复制整章正文',
                  disabled: !content.trim(),
                  onSelect: () => {
                    void copyTextToClipboard(content)
                  },
                },
                { type: 'separator' },
                {
                  label: '上一章',
                  disabled: index <= 0,
                  onSelect: () => goToChapter(index - 1),
                },
                {
                  label: '下一章',
                  disabled: index >= chapters.length - 1,
                  onSelect: () => goToChapter(index + 1),
                },
                { type: 'separator' },
                {
                  label: '回到写作台',
                  onSelect: () => closeReader(),
                },
              ])
            }}
          >
            <div className="reader-chapter-meta">
              <span>第 {index + 1} 章</span>
              <span>{wordCount.toLocaleString()} 字</span>
            </div>
            <h1>{currentChapter.title || '未命名章节'}</h1>
            {paragraphs.length > 0 ? (
              <div className="reader-body">
                {paragraphs.map((paragraph, paragraphIndex) => (
                  <p key={`${paragraph.slice(0, 12)}-${paragraphIndex}`}>
                    {(() => {
                      const paragraphStart = paragraphStarts[paragraphIndex] ?? 0
                      let sentenceCursor = 0
                      return ttsSentences
                        .filter((sentence) => sentence.paragraphIndex === paragraphIndex)
                        .map((sentence) => {
                          const relative = paragraph.indexOf(sentence.text, sentenceCursor)
                          if (relative >= 0) sentenceCursor = relative + sentence.text.length
                          return (
                            <span
                              key={`tts-${sentence.index}`}
                              data-tts-sentence={sentence.index}
                              className={
                                activeSentence === sentence.index ? 'reader-tts-current' : undefined
                              }
                            >
                              {renderParagraph(
                                sentence.text,
                                paragraphStart + Math.max(0, relative),
                              )}
                            </span>
                          )
                        })
                    })()}
                  </p>
                ))}
              </div>
            ) : (
              <div className="reader-empty">
                <p>这一章还没有正文。</p>
                <span>退出阅读后可以继续写作。</span>
              </div>
            )}
            {currentChapter.qualityIssues?.length ? (
              <div className="reader-quality-note">
                <strong>本章写作检查</strong>
                <span>
                  {currentChapter.qualityIssues
                    .map((issue) =>
                      issue === 'empty'
                        ? '正文为空'
                        : issue === 'finish-length'
                          ? '输出被截断'
                          : issue === 'too-short'
                            ? '正文偏短'
                            : issue === 'mid-sentence'
                              ? '结尾停在半句'
                              : issue === 'unclosed-quote'
                                ? '引号或括号未闭合'
                                : issue,
                    )
                    .join(' · ')}
                </span>
              </div>
            ) : null}
            {currentChapter.addressFixes?.length ? (
              <div className="reader-quality-note">
                <strong>已自动统一旁白称呼</strong>
                <span>{currentChapter.addressFixes.join(' · ')}</span>
              </div>
            ) : null}
            <div className="reader-chapter-end">· 本章完 ·</div>
            <div className="reader-next-card">
              {nextChapter ? (
                <>
                  <span>下一章</span>
                  <strong>{nextChapter.title || '未命名章节'}</strong>
                  <p>
                    {(nextChapter.wordCount ?? countWords(nextChapter.content)).toLocaleString()} 字
                  </p>
                  <div>
                    <button
                      type="button"
                      className="reader-next-primary"
                      onClick={() => goToChapter(index + 1)}
                    >
                      继续阅读 <IconChevronRight size={15} />
                    </button>
                    <button type="button" onClick={() => setPanel('toc')}>目录</button>
                    <button type="button" onClick={() => setBookmarksOpen(true)}>加书签</button>
                  </div>
                </>
              ) : (
                <>
                  <span>全书完</span>
                  <strong>已经读到最后一章</strong>
                  <p>感谢你读到这里。</p>
                  <div>
                    <button type="button" onClick={() => goToChapter(0)}>回到第一章</button>
                    <button type="button" onClick={() => setPanel('toc')}>查看目录</button>
                  </div>
                </>
              )}
            </div>
            {generation && !nextChapter ? (
              <div className="reader-generation-end">
                <span>
                  本批 {generation.completed}/{generation.total} 章
                </span>
                <button
                  type="button"
                  className="reader-next-primary"
                  onClick={
                    generation.status === 'writing'
                      ? generation.onStop
                      : () => generation.onContinue(continueCount)
                  }
                >
                  {generation.status === 'writing'
                    ? `正在写第 ${generation.completed + 1} 章… 停止`
                    : generation.completed >= generation.total
                      ? '续写下一章'
                      : '继续生成未完成章节'}
                </button>
              </div>
            ) : null}
          </article>
        ) : (
          <div className="reader-empty reader-empty-book">
            <p>这部作品还没有章节。</p>
            <span>退出阅读后先创建第一章。</span>
          </div>
        )}
      </div>

      {selectionMenu ? (
        <div
          className="reader-selection-menu"
          style={{ left: selectionMenu.left, top: selectionMenu.top }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            type="button"
            onClick={() => {
              void copyTextToClipboard(selectionMenu.text)
              setSelectionMenu(null)
            }}
          >
            复制
          </button>
          <button type="button" onClick={() => addSelectionHighlight()}>
            高亮
          </button>
          <button type="button" onClick={addSelectionNote}>
            批注
          </button>
        </div>
      ) : null}

      {continueMenuOpen ? (
        <>
          <div
            className="reader-continue-backdrop"
            onClick={() => setContinueMenuOpen(false)}
          />
          <div
            className="reader-continue-popover"
            style={{ top: continueMenuPosition.top, right: continueMenuPosition.right }}
            role="menu"
            aria-label="续写章数"
          >
            <div className="reader-continue-title">续写多少章</div>
            <div className="reader-continue-options">
              {[1, 3, 5, 10, 20, 30, 50].map((count) => (
                <button
                  type="button"
                  key={count}
                  role="menuitem"
                  className={`reader-continue-option ${continueChoice === String(count) ? 'active' : ''}`}
                  onClick={() => {
                    setContinueChoice(String(count))
                    setContinueMenuOpen(false)
                  }}
                >
                  {count} 章
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className={`reader-continue-option ${continueChoice === 'custom' ? 'active' : ''}`}
                onClick={() => setContinueChoice('custom')}
              >
                自定义
              </button>
            </div>
            {continueChoice === 'custom' ? (
              <div className="reader-continue-custom-row">
                <NumberInput
                  className="input reader-continue-input"
                  min={1}
                  max={100}
                  value={customContinueCount}
                  fallback={1}
                  onValueChange={setCustomContinueCount}
                />
                <span>章</span>
                <button
                  type="button"
                  className="reader-continue-confirm"
                  onClick={() => setContinueMenuOpen(false)}
                >
                  确定
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {entityCard ? (
        <EntityInfoCard
          entry={entityCard.entry}
          position={{ left: entityCard.left, top: entityCard.top }}
          onClose={() => setEntityCard(null)}
          onOpenDetails={() => {
            const entry = entityCard.entry
            setEntityCard(null)
            onOpenEntityDetails?.(entry)
          }}
        />
      ) : null}

      {ttsBarOpen || ttsState !== 'idle' ? (
        <div className="reader-tts-bar" role="region" aria-label="朗读控制">
          <button type="button" className="reader-tts-play" onClick={toggleTts}>
            {ttsState === 'paused' ? '继续' : ttsState === 'playing' ? '暂停' : '朗读'}
          </button>
          <select
            className="reader-tts-select"
            value={ttsSettings.voiceURI}
            aria-label="朗读音色"
            onChange={(event) =>
              setTtsSettings((prev) => ({ ...prev, voiceURI: event.target.value }))
            }
          >
            {ttsVoiceOptions.length === 0 ? <option value="">系统暂无语音</option> : null}
            {ttsVoiceOptions.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name} · {voice.lang}
              </option>
            ))}
          </select>
          <select
            className="reader-tts-select"
            value={ttsSettings.rate}
            aria-label="朗读速度"
            onChange={(event) =>
              setTtsSettings((prev) => ({ ...prev, rate: Number(event.target.value) }))
            }
          >
            {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
          <label className="reader-tts-auto">
            <input
              type="checkbox"
              checked={ttsSettings.autoNext}
              onChange={(event) =>
                setTtsSettings((prev) => ({ ...prev, autoNext: event.target.checked }))
              }
            />
            自动下一章
          </label>
          <span className="reader-tts-status">
            {ttsState === 'playing'
              ? `朗读中 · ${activeSentence + 1} / ${ttsSentences.length}`
              : ttsState === 'paused'
                ? '已暂停'
                : '朗读已停止'}
          </span>
          {ttsNotice ? <span className="reader-tts-notice">{ttsNotice}</span> : null}
          <button type="button" className="reader-tts-stop" onClick={() => stopTts()}>
            <IconStop size={13} />
            停止
          </button>
        </div>
      ) : null}

      <footer className="reader-footer">
        <button
          type="button"
          className="reader-nav-btn"
          disabled={index <= 0}
          onClick={() => goToChapter(index - 1)}
        >
          <IconChevronLeft size={16} />
          上一章
        </button>
        <span className="reader-footer-progress">
          {currentChapter
            ? `第 ${index + 1} / ${chapters.length} 章 · ${currentChapter.title || '未命名章节'} · 本章 ${chapterPercent}% · 剩余约 ${remainingMinutes} 分钟`
            : '暂无章节'}
        </span>
        <button
          type="button"
          className="reader-nav-btn"
          disabled={index >= chapters.length - 1}
          onClick={() => goToChapter(index + 1)}
        >
          下一章
          <IconChevronRight size={16} />
        </button>
      </footer>

      {panel ? <div className="reader-panel-scrim" onClick={() => setPanel(null)} /> : null}

      {panel === 'toc' ? (
        <aside className="reader-panel reader-toc" aria-label="章节目录">
          <div className="reader-panel-head">
            <div>
              <span>章节目录</span>
              <small>
                共 {chapters.length} 章
                {chapters.length > 0 ? ` · 当前第 ${index + 1} 章` : ''}
              </small>
            </div>
            <button type="button" className="reader-icon-btn" onClick={() => setPanel(null)} aria-label="关闭目录">
              <IconX size={15} />
            </button>
          </div>
          <div className="reader-toc-search">
            <input
              className="input"
              value={tocQuery}
              placeholder="搜索章节标题…"
              aria-label="搜索章节标题"
              onChange={(event) => setTocQuery(event.target.value)}
            />
          </div>
          <div className="reader-toc-list">
            {tocItems.map(({ chapter, chapterIndex }) => (
              <button
                type="button"
                key={chapter.id}
                ref={chapterIndex === index ? activeTocRef : undefined}
                className={`reader-toc-item ${chapterIndex === index ? 'active' : ''}`}
                onClick={() => goToChapter(chapterIndex)}
              >
                <span>{String(chapterIndex + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{chapter.title || '未命名章节'}</strong>
                  <small>
                    {(chapter.wordCount ?? countWords(chapter.content)).toLocaleString()} 字
                    {chapter.status === 'done' ? ' · 已完成' : ''}
                  </small>
                </div>
                {chapterIndex === index ? <i>在读</i> : null}
              </button>
            ))}
            {tocItems.length === 0 ? (
              <p className="reader-toc-empty">没有匹配的章节</p>
            ) : null}
          </div>
        </aside>
      ) : null}

      {panel === 'settings' ? (
        <aside className="reader-panel reader-settings" aria-label="阅读显示设置">
          <div className="reader-panel-head">
            <div>
              <span>阅读设置</span>
              <small>仅影响阅读模式 · 自动保存</small>
            </div>
            <button type="button" className="reader-icon-btn" onClick={() => setPanel(null)} aria-label="关闭设置">
              <IconX size={15} />
            </button>
          </div>

          <div className="reader-setting-block">
            <strong>快速预设</strong>
            <div className="reader-preset-row">
              <button type="button" onClick={() => applyReadingPreset('comfort')}>舒适</button>
              <button type="button" onClick={() => applyReadingPreset('compact')}>紧凑</button>
              <button type="button" onClick={() => applyReadingPreset('large')}>大字</button>
            </div>
          </div>

          <div className="reader-setting-block">
            <strong>背景</strong>
            <div className="reader-theme-grid">
              {(Object.keys(READER_THEME_META) as ReaderTheme[]).map((themeId) => (
                <button
                  type="button"
                  key={themeId}
                  className={`reader-theme-option ${settings.theme === themeId ? 'active' : ''}`}
                  onClick={() => updateSettings({ theme: themeId })}
                >
                  <span
                    className="reader-theme-swatch"
                    style={{ background: READER_THEME_META[themeId].background }}
                  />
                  {READER_THEME_META[themeId].label}
                </button>
              ))}
            </div>
          </div>

          <div className="reader-setting-block">
            <strong>字体</strong>
            <div className="reader-font-switch">
              <button
                type="button"
                className={settings.fontFamily === 'serif' ? 'active' : ''}
                onClick={() => updateSettings({ fontFamily: 'serif' })}
              >
                宋体 / 衬线
              </button>
              <button
                type="button"
                className={settings.fontFamily === 'sans' ? 'active' : ''}
                onClick={() => updateSettings({ fontFamily: 'sans' })}
              >
                黑体 / 无衬线
              </button>
            </div>
          </div>

          <div className="reader-setting-block">
            <SliderRow
              label="字号"
              value={settings.fontSize}
              min={16}
              max={30}
              step={1}
              suffix=" px"
              onChange={(value) => updateSettings({ fontSize: value })}
            />
            <SliderRow
              label="行距"
              value={settings.lineHeight}
              min={1.5}
              max={2.4}
              step={0.05}
              suffix=""
              onChange={(value) => updateSettings({ lineHeight: value })}
            />
            <SliderRow
              label="正文宽度"
              value={settings.pageWidth}
              min={620}
              max={1100}
              step={20}
              suffix=" px"
              onChange={(value) => updateSettings({ pageWidth: value })}
            />
            <SliderRow
              label="段间距"
              value={settings.paragraphGap}
              min={0.4}
              max={1.6}
              step={0.1}
              suffix=" em"
              onChange={(value) => updateSettings({ paragraphGap: value })}
            />
          </div>

          <div className="reader-setting-block">
            <label className="reader-toggle">
              <span>
                实体颜色
                <small>按类别给人物、物种、地点等着色</small>
              </span>
              <input
                type="checkbox"
                checked={settings.showEntityColors}
                onChange={(event) => updateSettings({ showEntityColors: event.target.checked })}
              />
            </label>
          </div>

          <div className="reader-setting-foot">
            <button
              type="button"
              className="reader-reset"
              onClick={() => setSettings(DEFAULT_READER_SETTINGS)}
            >
              恢复默认
            </button>
            <button
              type="button"
              className="reader-reset"
              onClick={() => setShortcutsOpen(true)}
            >
              快捷键
            </button>
            <span>
              累计阅读 {formatReaderDuration(readerStats.seconds)} · {readerStats.words.toLocaleString()} 字
            </span>
            <span>左右方向键翻章 · Esc 退出</span>
          </div>
        </aside>
      ) : null}

      {bookmarksOpen ? (
        <BookmarkModal
          work={work}
          chapters={chapters}
          currentChapter={currentChapter}
          currentScrollRatio={scrollRatio}
          onJump={(chapterId, ratio) => {
            const nextIndex = chapters.findIndex((chapter) => chapter.id === chapterId)
            if (nextIndex < 0) return
            stopTts(false)
            saveCurrentPosition()
            setIndex(nextIndex)
            setScrollRatio(ratio)
            restoreRatioRef.current = ratio
            setBookmarksOpen(false)
          }}
          onClose={() => setBookmarksOpen(false)}
        />
      ) : null}

      {shortcutsOpen ? (
        <div className="reader-shortcuts-overlay" role="dialog" aria-modal="true" aria-label="阅读快捷键">
          <div className="reader-shortcuts-card">
            <div className="reader-shortcuts-head">
              <strong>阅读快捷键</strong>
              <button type="button" onClick={() => setShortcutsOpen(false)} aria-label="关闭快捷键">
                <IconX size={15} />
              </button>
            </div>
            <dl>
              <div><dt>↑ / ↓ / PgUp / PgDn / 空格</dt><dd>滚动正文</dd></div>
              <div><dt>← / →</dt><dd>上一章 / 下一章</dd></div>
              <div><dt>H</dt><dd>显示 / 隐藏工具栏</dd></div>
              <div><dt>R</dt><dd>开始朗读</dd></div>
              <div><dt>F</dt><dd>全屏阅读</dd></div>
              <div><dt>?</dt><dd>打开快捷键</dd></div>
              <div><dt>Esc</dt><dd>关闭面板 / 退出阅读</dd></div>
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  )
}
