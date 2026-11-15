import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react'
import type {
  AiUsageEntry,
  ApiConfig,
  Chapter,
  CharacterCard,
  CharacterChatMemory,
  CharacterChatMessage,
  CharacterChatSession,
  CharacterChatSettings,
  CharacterChatEmotion,
  ChatPersona,
  CharacterMemoryKind,
  Work,
  WorkDetail,
} from '../types'
import { estimateTokens } from '../utils'
import { prepareImage } from '../imageAssets'
import { ImagePickerButton } from './ImagePickerButton'
import { downloadTextFile } from '../backup'
import { useContextMenu, type ContextMenuEntry } from './ContextMenuProvider'
import { copyTextToClipboard } from '../clipboard'
import { fetchModels, type ChatUsage } from '../ai'
import { runApiTask } from '../aiTask'
import {
  CHARACTER_CHAT_STARTERS,
  MEMORY_KIND_LABELS,
  buildCharacterChatMemoryMessages,
  buildCharacterChatMessages,
  buildCharacterVoiceCheckMessages,
  buildChatPlotMessages,
  buildGroupCharacterChatMessages,
  chapterCutoffLabel,
  createCharacterChatMessage,
  parseChatMemoryUpdate,
  parseChatPlotSuggestions,
  parseGroupChatReply,
  type ChatPlotSuggestions,
} from '../characterChat'
import { replyMaxTokens } from '../characterChatSettings'
import { containsExplicitTerms } from '../chatContent'
import {
  appraiseChatEmotion,
  defaultChatEmotion,
  normalizeChatEmotion,
} from '../chatEmotion'
import {
  applyProactiveState,
  markUserActivity,
  planProactiveChat,
  type ProactiveReason,
} from '../chatProactive'
import { normalizeChatPersona, personaLabel } from '../chatPersona'
import { ChatPersonaModal } from './ChatPersonaModal'
import { ChatEmotionBadge } from './ChatEmotionBadge'
import { buildEntityIndex, type EntityIndexEntry } from '../entityIndex'
import { ENTITY_CATEGORY_COLORS, splitEntityText } from '../entityHighlight'
import { EntityInfoCard } from './EntityInfoCard'
import { EntityArchiveModal } from './EntityArchiveModal'
import { EntityBindingModal } from './EntityBindingModal'
import {
  bindCharacterAlias,
  cleanAlias,
  mergeTemporaryAliases,
  type TemporaryEntityAlias,
} from '../entityBinding'
import { IconArrowLeft, IconArrowRight, IconPencil, IconPlus, IconSparkles, IconStop, IconTrash, IconUsers } from './Icons'
import { Modal } from './Modal'
import { ModelPicker } from './ModelPicker'

interface CharacterChatViewProps {
  works: Work[]
  detailsByWork: Record<string, WorkDetail>
  chaptersByWork: Record<string, Chapter[]>
  api: ApiConfig
  apiReady: boolean
  initialWorkId?: string | null
  sessions: CharacterChatSession[]
  setSessions: Dispatch<SetStateAction<CharacterChatSession[]>>
  sessionsReady: boolean
  memories: CharacterChatMemory[]
  setMemories: Dispatch<SetStateAction<CharacterChatMemory[]>>
  memoriesReady: boolean
  settings: CharacterChatSettings
  onChatSettingsChange?: (settings: CharacterChatSettings) => void
  onChatModelChange: (model: string) => void
  onBack: () => void
  onOpenSettings: () => void
  onRecordUsage?: (entry: AiUsageEntry) => void
  onToast: (message: string) => void
  onInsertDialogue?: (workId: string, chapterId: string, text: string) => void
  onUpdateDetailForWork?: (workId: string, patch: Partial<WorkDetail>) => void
}

function newSessionId(): string {
  return `chat-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
}

function ChatAvatar({
  name,
  avatar,
  small = false,
}: {
  name: string
  avatar?: string
  small?: boolean
}) {
  return (
    <span className={`chat-avatar ${small ? 'small' : ''}`}>
      {avatar ? <img src={avatar} alt="" draggable={false} /> : (name || '角').slice(0, 1)}
    </span>
  )
}

function sessionWhen(session: CharacterChatSession): string {
  const date = new Date(session.updatedAt)
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function sessionPreview(session: CharacterChatSession): string {
  const last = [...session.messages].reverse().find((message) => message.role === 'assistant')
  return last?.content.replace(/\s+/g, ' ').slice(0, 42) || '还没有开口'
}

function messageTime(at: number): string {
  return new Date(at).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function CharacterChatView({
  works,
  detailsByWork,
  chaptersByWork,
  api,
  apiReady,
  initialWorkId,
  sessions,
  setSessions,
  sessionsReady,
  memories,
  setMemories,
  memoriesReady,
  settings,
  onChatSettingsChange,
  onChatModelChange,
  onBack,
  onOpenSettings,
  onRecordUsage,
  onToast,
  onInsertDialogue,
  onUpdateDetailForWork,
}: CharacterChatViewProps) {
  const [workId, setWorkId] = useState(initialWorkId ?? works[0]?.id ?? '')
  const [characterId, setCharacterId] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [cutoff, setCutoff] = useState(1)
  const [draft, setDraft] = useState('')
  const [memoryDraft, setMemoryDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [streaming, setStreaming] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    if (!apiReady || !api.baseUrl.trim() || !api.apiKey.trim()) {
      setAvailableModels([])
      return () => {
        cancelled = true
      }
    }
    void fetchModels(api)
      .then((models) => {
        if (!cancelled) setAvailableModels(models)
      })
      .catch(() => {
        if (!cancelled) setAvailableModels(api.model ? [api.model] : [])
      })
    return () => {
      cancelled = true
    }
  }, [apiReady, api.provider, api.baseUrl, api.apiKey, api.model])
  const [memoryBusy, setMemoryBusy] = useState(false)
  const [memoryError, setMemoryError] = useState('')
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null)
  const [editingMemoryText, setEditingMemoryText] = useState('')
  const [groupOpen, setGroupOpen] = useState(false)
  const [groupSelection, setGroupSelection] = useState<string[]>([])
  const [groupCutoff, setGroupCutoff] = useState(1)
  const [groupNextSpeaker, setGroupNextSpeaker] = useState('')
  const [sceneOpen, setSceneOpen] = useState(false)
  const [sceneText, setSceneText] = useState('')
  const [insertChapterId, setInsertChapterId] = useState('')
  const [plotOpen, setPlotOpen] = useState(false)
  const [plotBusy, setPlotBusy] = useState(false)
  const [plotError, setPlotError] = useState('')
  const [plotSuggestions, setPlotSuggestions] = useState<ChatPlotSuggestions | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voiceResult, setVoiceResult] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const [memoryOpen, setMemoryOpen] = useState(true)
  const [emotionOpen, setEmotionOpen] = useState(false)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [sessionQuery, setSessionQuery] = useState('')
  const [selectedEntity, setSelectedEntity] = useState<{
    entry: EntityIndexEntry
    left: number
    top: number
  } | null>(null)
  const [archiveEntity, setArchiveEntity] = useState<EntityIndexEntry | null>(null)
  const [bindingSelection, setBindingSelection] = useState<{
    text: string
    left: number
    top: number
  } | null>(null)
  const [bindingText, setBindingText] = useState('')
  const [temporaryAliases, setTemporaryAliases] = useState<TemporaryEntityAlias[]>([])
  const [bindingUndo, setBindingUndo] = useState<{
    label: string
    characters?: WorkDetail['characters']
    temporary?: TemporaryEntityAlias[]
  } | null>(null)
  const draftRef = useRef<HTMLTextAreaElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const memoryBusyRef = useRef(false)
  const proactiveBusyRef = useRef(false)
  const proactiveRetryAtRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const { openContextMenu } = useContextMenu()

  const work = works.find((item) => item.id === workId) ?? null
  const detail = work ? detailsByWork[work.id] ?? null : null
  const chapters = work ? chaptersByWork[work.id] ?? [] : []
  const characters = detail?.characters ?? []
  const character = characters.find((item) => item.id === characterId) ?? null
  const activeSession = sessions.find((session) => session.id === sessionId) ?? null
  const activeSessionRef = useRef(activeSession)
  useEffect(() => {
    activeSessionRef.current = activeSession
  }, [activeSession])

  const activeChapter = chapters[Math.max(0, cutoff - 1)]
  const openForeshadows = (detail?.foreshadowings ?? [])
    .filter((item) => item.status === '未回收')
    .slice(0, 3)
  const baseChatEntityEntries = useMemo(
    () => (detail ? buildEntityIndex(detail) : []),
    [detail],
  )
  const chatEntityEntries = useMemo(
    () => mergeTemporaryAliases(baseChatEntityEntries, temporaryAliases),
    [baseChatEntityEntries, temporaryAliases],
  )
  const chatCharacters = useMemo(
    () => chatEntityEntries.filter((entry) => entry.category === 'character'),
    [chatEntityEntries],
  )
  const openChatEntity = (entry: EntityIndexEntry, x: number, y: number) => {
    setSelectedEntity({
      entry,
      left: Math.max(12, Math.min(x + 8, window.innerWidth - 300)),
      top: Math.max(12, Math.min(y + 8, window.innerHeight - 260)),
    })
  }
  const handleChatSelection = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('button, textarea, input, .chat-selection-toolbar')) return
    const selection = window.getSelection()
    const raw = selection?.toString().trim() ?? ''
    if (!selection || selection.rangeCount === 0 || !raw || raw.length > 20 || /[\r\n]/.test(raw)) {
      setBindingSelection(null)
      return
    }
    const range = selection.getRangeAt(0)
    const bubble = target.closest('.chat-bubble p')
    if (!bubble || !bubble.contains(range.commonAncestorContainer)) {
      setBindingSelection(null)
      return
    }
    const text = cleanAlias(raw)
    if (!text) {
      setBindingSelection(null)
      return
    }
    setBindingSelection({
      text,
      left: Math.max(12, Math.min(event.clientX, window.innerWidth - 180)),
      top: Math.max(12, event.clientY - 42),
    })
  }
  const finishCharacterBinding = (
    entry: EntityIndexEntry,
    scope: 'global' | 'temporary',
  ) => {
    const alias = cleanAlias(bindingText)
    if (!alias) return
    if (scope === 'temporary') {
      const previous = temporaryAliases
      setTemporaryAliases((current) => [
        ...current.filter((item) => item.alias.toLowerCase() !== alias.toLowerCase()),
        { alias, entityId: entry.id, category: entry.category },
      ])
      setBindingUndo({ label: `已临时识别「${alias}」为${entry.name}`, temporary: previous })
      setBindingText('')
      onToast(`本次聊天中「${alias}」识别为${entry.name}`)
      return
    }
    if (!detail || !work || !onUpdateDetailForWork) {
      onToast('当前作品还没有可保存的角色档案')
      return
    }
    const nextDetail = bindCharacterAlias(detail, entry.id, alias)
    const previousCharacters = detail.characters
    onUpdateDetailForWork(work.id, { characters: nextDetail.characters })
    setBindingUndo({
      label: `已将「${alias}」绑定为${entry.name}`,
      characters: previousCharacters,
      temporary: temporaryAliases,
    })
    setBindingText('')
    onToast(`「${alias}」以后都会识别为${entry.name}`)
  }
  const undoCharacterBinding = () => {
    if (!bindingUndo) return
    if (bindingUndo.characters && work && onUpdateDetailForWork) {
      onUpdateDetailForWork(work.id, { characters: bindingUndo.characters })
    }
    if (bindingUndo.temporary) setTemporaryAliases(bindingUndo.temporary)
    setBindingUndo(null)
    onToast('已撤销绑定')
  }
  useEffect(() => {
    setTemporaryAliases([])
    setBindingUndo(null)
    setBindingSelection(null)
    setBindingText('')
  }, [sessionId])
  const renderChatContent = (content: string) => {
    if (chatEntityEntries.length === 0) return content
    return splitEntityText(content, chatEntityEntries).map((segment, index) => {
      if (!segment.entity) return <span key={`chat-text-${index}`}>{segment.text}</span>
      const color =
        segment.entity.tierColor ?? ENTITY_CATEGORY_COLORS[segment.entity.category]
      return (
        <button
          key={`chat-entity-${index}`}
          type="button"
          className="chat-entity"
          style={{ color }}
          title={`${segment.entity.name} · ${segment.entity.subtitle}`}
          onClick={(event) => {
            event.stopPropagation()
            openChatEntity(segment.entity!, event.clientX, event.clientY)
          }}
        >
          {segment.text}
        </button>
      )
    })
  }
  const lastAssistantId =
    [...(activeSession?.messages ?? [])]
      .reverse()
      .find((message) => message.role === 'assistant')?.id ?? null
  const activeParticipants = useMemo(() => {
    if (!activeSession) return character ? [character] : []
    const ids =
      activeSession.participantIds && activeSession.participantIds.length > 0
        ? activeSession.participantIds
        : [activeSession.characterId]
    const matched = characters.filter((item) => ids.includes(item.id))
    return matched.length > 0 ? matched : character ? [character] : []
  }, [activeSession, characters, character])
  const activeCharacter = activeParticipants[0] ?? character
  const isGroupChat = activeParticipants.length > 1
  const activeEmotion = activeSession?.emotion
    ? normalizeChatEmotion(activeSession.emotion, activeCharacter)
    : defaultChatEmotion(activeCharacter)
  const activePersona = normalizeChatPersona(
    activeSession?.persona ?? detail?.chatPersona,
    characters,
  )
  const chatBackground = activeSession?.backgroundImage ?? settings.backgroundImage
  const applyChatBackground = async (file: File) => {
    const backgroundImage = await prepareImage(file, 'chat-background')
    if (activeSession) {
      setSessions((prev) =>
        prev.map((item) =>
          item.id === activeSession.id ? { ...item, backgroundImage } : item,
        ),
      )
    } else if (onChatSettingsChange) {
      onChatSettingsChange({ ...settings, backgroundImage })
    }
    onToast('聊天背景已更新')
  }
  const clearChatBackground = () => {
    if (activeSession) {
      setSessions((prev) =>
        prev.map((item) => (item.id === activeSession.id ? { ...item, backgroundImage: undefined } : item)),
      )
    } else if (onChatSettingsChange) {
      onChatSettingsChange({ ...settings, backgroundImage: undefined })
    }
    onToast('已清除聊天背景')
  }
  const workSessions = useMemo(
    () =>
      work
        ? sessions
            .filter((session) => session.workId === work.id)
            .sort(
              (a, b) =>
                Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
                b.updatedAt - a.updatedAt,
            )
        : [],
    [sessions, work],
  )
  const filteredSessions = useMemo(() => {
    const query = sessionQuery.trim().toLowerCase()
    if (!query) return workSessions
    return workSessions.filter((session) => {
      const participants = (session.participantIds ?? [session.characterId])
        .map((id) => characters.find((item) => item.id === id)?.name ?? '')
        .join(' ')
      return `${session.title} ${sessionPreview(session)} ${participants}`
        .toLowerCase()
        .includes(query)
    })
  }, [workSessions, sessionQuery, characters])
  const groupSessions = filteredSessions.filter(
    (session) => (session.participantIds?.length ?? 0) > 1,
  )
  const characterSessions = useMemo(
    () =>
      work && character
        ? filteredSessions.filter(
            (session) =>
              session.characterId === character.id &&
              (session.participantIds?.length ?? 0) <= 1,
          )
        : [],
    [filteredSessions, work, character],
  )
  const activeMemories = useMemo(
    () =>
      work && character
        ? memories
            .filter((memory) => memory.workId === work.id && memory.characterId === character.id)
            .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
        : [],
    [memories, work, character],
  )

  useEffect(() => {
    if (!sessionsReady || works.length === 0) return
    if (!workId || !works.some((item) => item.id === workId)) setWorkId(works[0].id)
  }, [sessionsReady, works, workId])

  useEffect(() => {
    if (!work) return
    if (characters.length === 0) {
      if (characterId) setCharacterId('')
      return
    }
    if (!characterId || !characters.some((item) => item.id === characterId)) {
      setCharacterId(characters[0].id)
    }
  }, [work, characters, characterId])

  useEffect(() => {
    setCutoff(
      settings.defaultCutoffMode === 'first' ? 1 : Math.max(1, chapters.length || 1),
    )
  }, [work?.id, chapters.length, settings.defaultCutoffMode])

  useEffect(() => {
    if (!sessionsReady || !character || !work) return
    const latest = sessions
      .filter(
        (session) =>
          session.workId === work.id &&
          session.characterId === character.id &&
          (session.participantIds?.length ?? 0) <= 1,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    setSessionId(latest?.id ?? null)
    if (latest) {
      setCutoff(latest.chapterCutoff)
    } else {
      setCutoff(
        settings.defaultCutoffMode === 'first' ? 1 : Math.max(1, chapters.length || 1),
      )
    }
    setError('')
    setStreaming('')
    setDraft('')
    setMemoryError('')
    setEditingMemoryId(null)
  }, [character?.id, sessionsReady, work?.id, settings.defaultCutoffMode, chapters.length])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [activeSession?.messages.length, streaming, activeSession?.id])

  useEffect(() => {
    if (sessionId && !sessions.some((session) => session.id === sessionId)) {
      setSessionId(null)
    }
  }, [sessions, sessionId])

  const chooseCharacter = (nextCharacter: CharacterCard) => {
    setCharacterId(nextCharacter.id)
    const latest = work
      ? sessions
          .filter(
            (session) =>
              session.workId === work.id &&
              session.characterId === nextCharacter.id &&
              (session.participantIds?.length ?? 0) <= 1,
          )
          .sort((a, b) => b.updatedAt - a.updatedAt)[0]
      : null
    setSessionId(latest?.id ?? null)
    if (latest) setCutoff(latest.chapterCutoff)
    setError('')
    setMemoryError('')
    setEditingMemoryId(null)
  }

  const startSession = () => {
    if (!work || !character) return
    const safeCutoff = Math.max(1, Math.min(chapters.length || 1, cutoff))
    const session: CharacterChatSession = {
      id: newSessionId(),
      workId: work.id,
      characterId: character.id,
      title: `与${character.name}的对话`,
      chapterCutoff: safeCutoff,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      summary: '',
      memoryCursor: 0,
      autoMemory: settings.autoMemoryDefault,
      emotion: defaultChatEmotion(character),
      persona: normalizeChatPersona(detail?.chatPersona, characters),
    }
    setSessions((prev) => [session, ...prev])
    setSessionId(session.id)
    setDraft('')
    setError('')
  }

  const startWithPrompt = (text: string) => {
    startSession()
    setDraft(text)
    window.setTimeout(() => draftRef.current?.focus(), 50)
  }

  const openGroupModal = () => {
    setGroupSelection(characters.slice(0, 2).map((item) => item.id))
    setGroupCutoff(cutoff || Math.max(1, chapters.length || 1))
    setGroupOpen(true)
  }

  const startGroupSession = () => {
    if (!work) return
    const participants = characters.filter((item) => groupSelection.includes(item.id))
    if (participants.length < 2) {
      onToast('群聊至少选择两个角色')
      return
    }
    const session: CharacterChatSession = {
      id: newSessionId(),
      workId: work.id,
      characterId: participants[0].id,
      participantIds: participants.map((item) => item.id),
      title: `群聊 · ${participants.map((item) => item.name).join(' / ')}`,
      chapterCutoff: Math.max(1, Math.min(chapters.length || 1, groupCutoff)),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      summary: '',
      memoryCursor: 0,
      autoMemory: false,
      emotion: defaultChatEmotion(participants[0]),
      persona: normalizeChatPersona(detail?.chatPersona, characters),
    }
    setSessions((prev) => [session, ...prev])
    setSessionId(session.id)
    setGroupOpen(false)
    setDraft('')
    setError('')
    onToast(`已开始 ${participants.length} 人群聊`)
  }

  const updateSession = (session: CharacterChatSession) => {
    setSessions((prev) => {
      if (prev.some((item) => item.id === session.id)) {
        return prev.map((item) => (item.id === session.id ? session : item))
      }
      return [session, ...prev]
    })
  }

  const updateEmotion = (patch: Partial<CharacterChatEmotion>) => {
    if (!activeSession) return
    const current = normalizeChatEmotion(activeSession.emotion, activeCharacter)
    updateSession({
      ...activeSession,
      emotion: {
        ...current,
        ...patch,
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    })
  }

  const savePersona = (next: ChatPersona, asDefault: boolean) => {
    if (!activeSession) return
    const persona = normalizeChatPersona(next, characters)
    updateSession({
      ...activeSession,
      persona,
      updatedAt: Date.now(),
    })
    if (asDefault && work && onUpdateDetailForWork) {
      onUpdateDetailForWork(work.id, { chatPersona: persona })
    }
    setPersonaOpen(false)
    onToast(asDefault ? '身份已保存，并设为本书默认' : '聊天身份已更新')
  }

  const recordUsage = (
    kind: '角色聊天' | '聊天记忆' | '剧情提炼',
    input: string,
    output: string,
    usage?: ChatUsage,
    note?: string,
  ) => {
    if (!onRecordUsage) return
    const inputTokens = usage?.inputTokens ?? estimateTokens(input)
    const outputTokens = usage?.outputTokens ?? estimateTokens(output)
    const priceInput = api.inputPrice ?? 0
    const priceOutput = api.outputPrice ?? 0
    onRecordUsage({
      id: `usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      at: Date.now(),
      kind,
      profile: 'chat',
      model: api.model,
      inputTokens,
      outputTokens,
      note: note ?? (character ? `角色：${character.name}` : undefined),
      actual: Boolean(usage),
      cost:
        usage && (priceInput > 0 || priceOutput > 0)
          ? (inputTokens / 1_000_000) * priceInput + (outputTokens / 1_000_000) * priceOutput
          : undefined,
    })
  }

  const runProactive = async (reason: ProactiveReason, followUpIndex: number) => {
    const session = activeSessionRef.current
    if (
      !session ||
      !work ||
      !activeCharacter ||
      !apiReady ||
      isGroupChat ||
      proactiveBusyRef.current ||
      Date.now() < proactiveRetryAtRef.current
    ) {
      return
    }
    proactiveBusyRef.current = true
    try {
      const fallbackDetail: WorkDetail = detail ?? {
        worldview: '',
        style: { tone: [], pace: '中', dialogue: '中', description: '适中', taboos: '', notes: '' },
        characters,
        factions: [],
        relationships: [],
        foreshadowings: [],
        analysis: '',
      }
      const messages = buildCharacterChatMessages(
        {
          work,
          detail: fallbackDetail,
          character: activeCharacter,
          chapters,
          session,
          memories,
        },
        settings.contextMessageLimit,
        settings,
        {
          reason,
          followUpIndex,
          followUpLimit: settings.proactiveFollowUpLimit,
        },
      )
      const result = await runApiTask(api, {
        task: 'chat.character',
        messages,
        temperature: 0.75,
        maxTokens: 300,
      })
      const text = result.trim()
      if (!text || containsExplicitTerms(text)) {
        proactiveRetryAtRef.current = Date.now() + 60_000
        return
      }
      const latest = activeSessionRef.current
      if (!latest || latest.id !== session.id) return
      const expectedLastId = session.messages[session.messages.length - 1]?.id ?? ''
      const latestLastId = latest.messages[latest.messages.length - 1]?.id ?? ''
      if (latestLastId !== expectedLastId) return
      if (draftRef.current?.value.trim()) return
      const assistantMessage = {
        ...createCharacterChatMessage('assistant', text),
        speakerId: activeCharacter.id,
        speakerName: activeCharacter.name,
        proactive: true,
      }
      updateSession({
        ...latest,
        messages: [...latest.messages, assistantMessage],
        proactive: applyProactiveState(latest.proactive, reason),
        updatedAt: Date.now(),
      })
      recordUsage(
        '角色聊天',
        messages.map((message) => message.content).join('\n'),
        text,
        undefined,
        `角色主动消息：${reason}`,
      )
    } catch {
      proactiveRetryAtRef.current = Date.now() + 5 * 60 * 1000
    } finally {
      proactiveBusyRef.current = false
    }
  }

  useEffect(() => {
    if (!activeSession || !activeCharacter || !apiReady || !settings.proactiveEnabled || isGroupChat) {
      return
    }
    let cancelled = false
    const tick = () => {
      if (cancelled || proactiveBusyRef.current) return
      if (Date.now() < proactiveRetryAtRef.current) return
      if (document.visibilityState !== 'visible') return
      if (document.querySelector('.modal-backdrop')) return
      if (draftRef.current?.value.trim()) return
      const current = activeSessionRef.current
      if (!current || current.id !== activeSession.id) return
      const plan = planProactiveChat(current, settings)
      if (!plan || plan.delayMs > 0) return
      void runProactive(plan.reason, plan.followUpIndex)
    }
    const initialTimer = window.setTimeout(tick, 1500)
    const interval = window.setInterval(tick, 5000)
    return () => {
      cancelled = true
      window.clearTimeout(initialTimer)
      window.clearInterval(interval)
    }
  }, [activeSession, activeCharacter, apiReady, settings])

  const runMemoryUpdate = async (target: CharacterChatSession, manual = false) => {
    if (!work || !character || !apiReady) {
      if (manual) onToast(apiReady ? '还没有可以整理的内容' : '请先配置 AI 模型和 API Key')
      return
    }
    if (memoryBusyRef.current) return
    const cursor = target.memoryCursor ?? 0
    if (target.messages.length <= cursor) {
      if (manual) onToast('这段对话还没有新的内容需要整理')
      return
    }
    memoryBusyRef.current = true
    setMemoryBusy(true)
    setMemoryError('')
    try {
      const messages = buildCharacterChatMemoryMessages({
        work,
        detail: detail ?? {
          worldview: '',
          style: { tone: [], pace: '中', dialogue: '中', description: '适中', taboos: '', notes: '' },
          characters,
          factions: [],
          relationships: [],
          foreshadowings: [],
          analysis: '',
        },
        character,
        chapters,
        session: target,
        memories,
      })
      let actualUsage: ChatUsage | undefined
      const raw = await runApiTask(api, { task: 'chat.character', messages,
        temperature: 0.2,
        maxTokens: 900,
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      const parsed = parseChatMemoryUpdate(raw)
      if (!parsed) throw new Error('记忆整理结果无法解析')
      const existingTexts = new Set(
        memories
          .filter((memory) => memory.workId === work.id && memory.characterId === character.id)
          .map((memory) => memory.text.replace(/\s+/g, '').toLowerCase()),
      )
      const fresh = parsed.memories
        .filter((memory) => !existingTexts.has(memory.text.replace(/\s+/g, '').toLowerCase()))
        .slice(0, 5)
        .map<CharacterChatMemory>((memory) => ({
          id: `chat-memory-auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          workId: work.id,
          characterId: character.id,
          text: memory.text,
          createdAt: Date.now(),
          pinned: false,
          kind: memory.kind,
          source: 'auto',
        }))
      if (fresh.length > 0) setMemories((prev) => [...fresh, ...prev])
      setSessions((prev) =>
        prev.map((session) =>
          session.id === target.id
            ? {
                ...session,
                summary: parsed.summary || session.summary,
                memoryCursor: target.messages.length,
                updatedAt: Date.now(),
              }
            : session,
        ),
      )
      recordUsage(
        '聊天记忆',
        messages.map((message) => message.content).join('\n'),
        raw,
        actualUsage,
        '会话摘要与长期记忆整理',
      )
      if (manual) onToast(fresh.length > 0 ? `记忆已更新，新增 ${fresh.length} 条` : '会话摘要已更新')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '记忆整理失败'
      setMemoryError(message)
      if (manual) onToast(`记忆整理失败：${message}`)
    } finally {
      memoryBusyRef.current = false
      setMemoryBusy(false)
    }
  }

  const send = async (override?: string, existingSession?: CharacterChatSession) => {
    const content = (override ?? draft).trim()
    const baseSession = existingSession ?? activeSession
    if (
      !content ||
      !work ||
      !activeCharacter ||
      !apiReady ||
      !baseSession ||
      sending
    ) {
      return
    }
    const group = activeParticipants.length > 1
    const userMessage = createCharacterChatMessage('user', content)
    const currentEmotion = normalizeChatEmotion(baseSession.emotion, activeCharacter)
    const nextEmotion = currentEmotion.auto
      ? appraiseChatEmotion(currentEmotion, content, activeCharacter)
      : currentEmotion
    const nextProactive = markUserActivity(baseSession.proactive, content)
    const nextSession: CharacterChatSession = existingSession
      ? {
          ...existingSession,
          emotion: nextEmotion,
          proactive: nextProactive,
          chapterCutoff: Math.max(1, Math.min(chapters.length || 1, cutoff)),
          updatedAt: Date.now(),
        }
      : {
          ...baseSession,
          emotion: nextEmotion,
          proactive: nextProactive,
          chapterCutoff: Math.max(1, Math.min(chapters.length || 1, cutoff)),
          messages: [...baseSession.messages, userMessage],
          updatedAt: Date.now(),
        }
    updateSession(nextSession)
    setDraft('')
    setError('')
    setStreaming('')
    setSending(true)
    const controller = new AbortController()
    abortRef.current = controller
    let collected = ''
    let actualUsage: ChatUsage | undefined
    try {
      const fallbackDetail: WorkDetail = detail ?? {
        worldview: '',
        style: { tone: [], pace: '中', dialogue: '中', description: '适中', taboos: '', notes: '' },
        characters,
        factions: [],
        relationships: [],
        foreshadowings: [],
        analysis: '',
      }
      const messages = group
        ? buildGroupCharacterChatMessages(
            {
              work,
              detail: fallbackDetail,
              characters: activeParticipants,
              chapters,
              session: nextSession,
              memories,
              nextSpeakerName: groupNextSpeaker || undefined,
            },
            settings.contextMessageLimit,
            settings,
          )
        : buildCharacterChatMessages(
            {
              work,
              detail: fallbackDetail,
              character: activeCharacter,
              chapters,
              session: nextSession,
              memories,
            },
            settings.contextMessageLimit,
            settings,
          )
      const result = await runApiTask(api, { task: 'chat.character', messages,
        temperature: 0.9,
        maxTokens: replyMaxTokens(settings.replyLength),
        signal: controller.signal,
        onDelta: (delta) => {
          collected += delta
          if (!group) {
            setStreaming(
              containsExplicitTerms(collected) ? '正在调整为克制表达…' : collected,
            )
          }
        },
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      let finalText = result.trim() || collected.trim()
      if (!finalText) throw new Error('模型没有返回对话内容')
      if (containsExplicitTerms(finalText)) {
        const rewrite = await runApiTask(api, {
          task: 'chat.character',
          messages: [
            ...messages,
            {
              role: 'user',
              content:
                '上一版回复出现了禁止的露骨性器官词或粗俗性俚语。请保持剧情、人物和格式不变，重新输出一版不包含这些词的克制版本；只输出回复本身，不要解释。',
            },
          ],
          temperature: 0.35,
          maxTokens: replyMaxTokens(settings.replyLength),
          signal: controller.signal,
        })
        finalText = rewrite.trim()
        if (!finalText || containsExplicitTerms(finalText)) {
          throw new Error('回复包含露骨词，已拦截。请调低成人内容等级或重试。')
        }
      }
      let completedSession: CharacterChatSession
      if (group) {
        const lines = parseGroupChatReply(finalText, activeParticipants)
        if (!lines) throw new Error('多人对话格式无法解析，请重试')
        const assistantMessages = lines.map((line) => {
          const matched = activeParticipants.find((item) => item.name === line.character)
          const message = createCharacterChatMessage('assistant', line.content)
          return {
            ...message,
            speakerId: matched?.id,
            speakerName: matched?.name ?? line.character,
          }
        })
        completedSession = {
          ...nextSession,
          messages: [...nextSession.messages, ...assistantMessages],
          updatedAt: Date.now(),
        }
      } else {
        completedSession = {
          ...nextSession,
          messages: [
            ...nextSession.messages,
            {
              ...createCharacterChatMessage('assistant', finalText),
              speakerId: activeCharacter.id,
              speakerName: activeCharacter.name,
            },
          ],
          updatedAt: Date.now(),
        }
      }
      updateSession(completedSession)
      recordUsage(
        '角色聊天',
        messages.map((message) => message.content).join('\n'),
        finalText,
        actualUsage,
        group
          ? `群聊：${activeParticipants.map((item) => item.name).join(' / ')}`
          : `角色：${activeCharacter.name}`,
      )
      if (
        !group &&
        completedSession.autoMemory !== false &&
        completedSession.messages.length - (completedSession.memoryCursor ?? 0) >=
          settings.autoMemoryInterval
      ) {
        window.setTimeout(() => void runMemoryUpdate(completedSession), 150)
      }
    } catch (caught) {
      const wasAborted =
        typeof caught === 'object' &&
        caught !== null &&
        'name' in caught &&
        (caught as { name?: string }).name === 'AbortError'
      if (wasAborted) {
        if (collected.trim() && !group) {
          updateSession({
            ...nextSession,
            messages: [
              ...nextSession.messages,
              {
                ...createCharacterChatMessage('assistant', collected.trim()),
                speakerId: activeCharacter.id,
                speakerName: activeCharacter.name,
              },
            ],
            updatedAt: Date.now(),
          })
        }
      } else {
        setError(caught instanceof Error ? caught.message : '这段对话没有接上，请再试一次')
      }
    } finally {
      abortRef.current = null
      setSending(false)
      setStreaming('')
    }
  }

  const stop = () => {
    abortRef.current?.abort()
  }

  const runVoiceCheck = async () => {
    if (voiceBusy || sending || !apiReady || !work || !detail || !activeCharacter || !activeSession) {
      return
    }
    if (isGroupChat) {
      onToast('群聊暂不做单角色语气检查')
      return
    }
    if (!activeSession.messages.some((message) => message.role === 'assistant')) {
      onToast('还没有角色回复可以检查')
      return
    }
    setVoiceBusy(true)
    setVoiceError('')
    setVoiceResult('')
    try {
      const messages = buildCharacterVoiceCheckMessages({
        work,
        detail,
        character: activeCharacter,
        chapters,
        session: activeSession,
      })
      let actualUsage: ChatUsage | undefined
      const result = await runApiTask(api, { task: 'chat.character', messages,
        temperature: 0.2,
        maxTokens: 800,
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      if (!result.trim()) throw new Error('模型没有返回检查结果')
      setVoiceResult(result.trim())
      recordUsage(
        '角色聊天',
        messages.map((message) => message.content).join('\n'),
        result,
        actualUsage,
        '角色语气检查',
      )
    } catch (caught) {
      setVoiceError(caught instanceof Error ? caught.message : '语气检查失败')
    } finally {
      setVoiceBusy(false)
    }
  }

  const rememberMessage = (message: CharacterChatMessage) => {
    if (!work || !character || !message.content.trim()) return
    const memory: CharacterChatMemory = {
      id: `chat-memory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      workId: work.id,
      characterId: character.id,
      text: message.content.trim().slice(0, 300),
      createdAt: Date.now(),
      pinned: true,
      kind: message.role === 'assistant' ? 'fact' : 'user',
      source: 'manual',
    }
    setMemories((prev) => [memory, ...prev])
    onToast(`${character.name}记住了一条对话`)
  }

  const branchFromMessage = (messageId: string) => {
    if (!activeSession) return
    const index = activeSession.messages.findIndex((message) => message.id === messageId)
    if (index < 0) return
    const branch: CharacterChatSession = {
      ...activeSession,
      id: newSessionId(),
      title: `分支 · ${activeSession.title}`.slice(0, 80),
      messages: activeSession.messages.slice(0, index + 1),
      summary: '',
      memoryCursor: 0,
      branchOf: activeSession.id,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setSessions((prev) => [branch, ...prev])
    setSessionId(branch.id)
    onToast('已创建对话分支')
  }

  const regenerateLast = () => {
    if (!activeSession || sending) return
    const messages = activeSession.messages
    let lastUserIndex = -1
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'user') {
        lastUserIndex = index
        break
      }
    }
    if (lastUserIndex < 0) return
    const lastUser = messages[lastUserIndex]
    const truncated: CharacterChatSession = {
      ...activeSession,
      messages: messages.slice(0, lastUserIndex + 1),
      updatedAt: Date.now(),
    }
    updateSession(truncated)
    void send(lastUser.content, truncated)
  }

  const editUserMessage = (message: CharacterChatMessage) => {
    if (!activeSession || message.role !== 'user' || sending) return
    const nextText = window.prompt('编辑这条消息并重新生成回复：', message.content)
    if (!nextText || !nextText.trim()) return
    const index = activeSession.messages.findIndex((item) => item.id === message.id)
    if (index < 0) return
    const messages = activeSession.messages
      .slice(0, index + 1)
      .map((item, itemIndex) =>
        itemIndex === index ? { ...item, content: nextText.trim() } : item,
      )
    const truncated: CharacterChatSession = {
      ...activeSession,
      messages,
      updatedAt: Date.now(),
    }
    updateSession(truncated)
    void send(nextText.trim(), truncated)
  }

  const quoteMessage = (message: CharacterChatMessage) => {
    setDraft((current) => `${current}${current.trim() ? '\n' : ''}> ${message.content}\n`)
    draftRef.current?.focus()
  }

  const renameSession = (target: CharacterChatSession) => {
    const next = window.prompt('会话名称', target.title)
    if (!next?.trim()) return
    updateSession({ ...target, title: next.trim().slice(0, 80), updatedAt: Date.now() })
  }

  const toggleSessionPin = (target: CharacterChatSession) => {
    updateSession({ ...target, pinned: !target.pinned })
  }

  const deleteSession = (target: CharacterChatSession) => {
    if (!window.confirm(`删除会话「${target.title}」？`)) return
    setSessions((prev) => prev.filter((session) => session.id !== target.id))
    if (sessionId === target.id) setSessionId(null)
    onToast('会话已删除')
  }

  const selectSession = (target: CharacterChatSession) => {
    setSessionId(target.id)
    setCutoff(target.chapterCutoff)
    setGroupNextSpeaker('')
    setError('')
    setMemoryError('')
    setEditingMemoryId(null)
  }

  const insertQuickDraft = (text: string) => {
    setDraft((current) => `${current}${current.trim() ? '\n' : ''}${text}`)
    draftRef.current?.focus()
  }

  const insertGroupMention = (name: string) => {
    insertQuickDraft(`@${name} `)
  }

  const openSceneDraft = () => {
    if (!activeSession || !activeCharacter) return
    const names = activeParticipants.map((item) => item.name)
    const lines = activeSession.messages.map((message) => {
      if (message.role === 'user') return `我：${message.content}`
      return `${message.speakerName ?? activeCharacter.name}：${message.content}`
    })
    setSceneText(
      [
        `【场景】${isGroupChat ? names.join(' / ') : activeCharacter.name}的对话`,
        `【人物】${['我', ...names].join('、')}`,
        `【知识截止】${chapterCutoffLabel(chapters, activeSession.chapterCutoff)}`,
        '',
        '【对白】',
        ...lines,
      ].join('\n'),
    )
    setInsertChapterId(
      chapters[Math.max(0, activeSession.chapterCutoff - 1)]?.id ??
        chapters[chapters.length - 1]?.id ??
        '',
    )
    setSceneOpen(true)
  }

  const insertSceneToChapter = () => {
    if (!work || !sceneText.trim() || !onInsertDialogue) return
    const targetChapter = chapters.find((chapter) => chapter.id === insertChapterId)
    if (!targetChapter) {
      onToast('没有可插入的章节')
      return
    }
    const dialogueOnly = sceneText.split('【对白】').slice(1).join('【对白】').trim() || sceneText
    onInsertDialogue(work.id, targetChapter.id, dialogueOnly.trim())
    setSceneOpen(false)
    onToast(`对白草稿已插入第 ${chapters.findIndex((chapter) => chapter.id === targetChapter.id) + 1} 章`)
  }

  const exportSceneDraft = () => {
    downloadTextFile(
      `${(activeCharacter?.name ?? '角色').replace(/[\\/:*?"<>|]/g, '_')}-对白草稿.md`,
      sceneText,
      'text/markdown;charset=utf-8',
    )
    onToast('已导出对白草稿')
  }

  const runPlotSuggestions = async () => {
    if (!activeSession || !work || !apiReady || plotBusy) {
      if (!apiReady) onToast('请先配置 AI 模型和 API Key')
      return
    }
    setPlotBusy(true)
    setPlotError('')
    try {
      const messages = buildChatPlotMessages({
        work,
        characters: activeParticipants.length > 0 ? activeParticipants : character ? [character] : [],
        session: activeSession,
      })
      let actualUsage: ChatUsage | undefined
      const raw = await runApiTask(api, { task: 'chat.character', messages,
        temperature: 0.25,
        maxTokens: 1000,
        onUsage: (usage) => {
          actualUsage = usage
        },
      })
      const parsed = parseChatPlotSuggestions(raw)
      if (!parsed) throw new Error('剧情候选格式无法解析')
      setPlotSuggestions(parsed)
      setPlotOpen(true)
      recordUsage(
        '剧情提炼',
        messages.map((message) => message.content).join('\n'),
        raw,
        actualUsage,
        '角色聊天剧情候选',
      )
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '剧情提炼失败'
      setPlotError(message)
      onToast(`剧情提炼失败：${message}`)
    } finally {
      setPlotBusy(false)
    }
  }

  const plotMarkdown = plotSuggestions
    ? [
        '# 角色聊天剧情候选',
        '',
        '## 事件候选',
        ...(plotSuggestions.events.length
          ? plotSuggestions.events.map((item) => `- ${item}`)
          : ['- 暂无']),
        '',
        '## 关系变化候选',
        ...(plotSuggestions.relationships.length
          ? plotSuggestions.relationships.map((item) => `- ${item}`)
          : ['- 暂无']),
        '',
        '## 章末钩子候选',
        ...(plotSuggestions.hooks.length
          ? plotSuggestions.hooks.map((item) => `- ${item}`)
          : ['- 暂无']),
      ].join('\n')
    : ''

  const exportPlotSuggestions = () => {
    downloadTextFile(
      `剧情候选-${new Date().toISOString().slice(0, 10)}.md`,
      plotMarkdown,
      'text/markdown;charset=utf-8',
    )
    onToast('已导出剧情候选')
  }

  const addMemory = () => {
    const text = memoryDraft.trim()
    if (!text || !work || !character) return
    const memory: CharacterChatMemory = {
      id: `chat-memory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      workId: work.id,
      characterId: character.id,
      text: text.slice(0, 300),
      createdAt: Date.now(),
      pinned: true,
      kind: 'fact',
      source: 'manual',
    }
    setMemories((prev) => [memory, ...prev])
    setMemoryDraft('')
    onToast(`${character.name}记住了这件事`)
  }

  const startEditMemory = (memory: CharacterChatMemory) => {
    setEditingMemoryId(memory.id)
    setEditingMemoryText(memory.text)
  }

  const saveEditMemory = () => {
    const text = editingMemoryText.trim()
    if (!text || !editingMemoryId) return
    setMemories((prev) =>
      prev.map((memory) =>
        memory.id === editingMemoryId ? { ...memory, text: text.slice(0, 300) } : memory,
      ),
    )
    setEditingMemoryId(null)
    setEditingMemoryText('')
  }

  const toggleMemoryPin = (id: string) => {
    setMemories((prev) =>
      prev.map((memory) => (memory.id === id ? { ...memory, pinned: !memory.pinned } : memory)),
    )
  }

  const removeMemory = (id: string) => {
    setMemories((prev) => prev.filter((memory) => memory.id !== id))
  }

  const exportSession = () => {
    if (!activeSession || !work || !activeCharacter) return
    const title = isGroupChat
      ? activeParticipants.map((item) => item.name).join(' / ')
      : activeCharacter.name
    const text = [
      `# 与${title}的对话`,
      `作品：${work.title}`,
      `知识截止：${chapterCutoffLabel(chapters, activeSession.chapterCutoff)}`,
      '',
      ...activeSession.messages.map((message) => {
        if (message.role === 'user') return `我：${message.content}`
        return `${message.speakerName ?? activeCharacter.name}：${message.content}`
      }),
    ].join('\n')
    const safe = title.replace(/[\\/:*?"<>|]/g, '_')
    downloadTextFile(`${safe}-对话.md`, text, 'text/markdown;charset=utf-8')
    onToast('已导出当前对话')
  }

  const clearSession = () => {
    if (!activeSession || !window.confirm('清空本次对话？角色记忆不会被删除。')) return
    updateSession({ ...activeSession, messages: [], updatedAt: Date.now() })
    setStreaming('')
    setError('')
  }

  const messageContextMenu = (messageId: string): ContextMenuEntry[] => {
    if (!activeSession) return []
    const message = activeSession.messages.find((item) => item.id === messageId)
    if (!message) return []
    const speaker = message.speakerName ?? activeCharacter?.name ?? '角色'
    return [
      {
        type: 'label',
        label: `${message.role === 'assistant' ? speaker : '我'} · ${message.content.slice(0, 26)}`,
      },
      {
        label: '复制这条消息',
        onSelect: () => {
          void copyTextToClipboard(message.content).then((ok) =>
            onToast(ok ? '已复制消息' : '复制失败'),
          )
        },
      },
      {
        label: '引用到输入框',
        onSelect: () => quoteMessage(message),
      },
      ...(message.role === 'assistant'
        ? [
            {
              label: '记住这句话',
              onSelect: () => rememberMessage(message),
            },
          ]
        : [
            {
              label: '编辑并重发',
              onSelect: () => editUserMessage(message),
            },
          ]),
      {
        label: '从这里创建分支',
        onSelect: () => branchFromMessage(message.id),
      },
      { type: 'separator' as const },
      {
        label: '删除这条消息…',
        danger: true,
        onSelect: () => {
          if (!window.confirm('删除这条消息？')) return
          updateSession({
            ...activeSession,
            messages: activeSession.messages.filter((item) => item.id !== messageId),
            updatedAt: Date.now(),
          })
        },
      },
    ]
  }

  const sessionContextMenu = (sessionId: string): ContextMenuEntry[] => {
    const session = sessions.find((item) => item.id === sessionId)
    if (!session) return []
    return [
      { type: 'label', label: sessionPreview(session) },
      {
        label: '打开会话',
        onSelect: () => selectSession(session),
      },
      {
        label: session.pinned ? '取消置顶' : '置顶会话',
        onSelect: () => toggleSessionPin(session),
      },
      {
        label: '重命名会话',
        onSelect: () => renameSession(session),
      },
      {
        label: '复制会话摘要',
        onSelect: () => {
          void copyTextToClipboard(
            [session.summary, sessionPreview(session)].filter(Boolean).join('\n'),
          ).then((ok) => onToast(ok ? '已复制会话摘要' : '复制失败'))
        },
      },
      {
        label: '导出当前对话',
        onSelect: () => {
          setSessionId(session.id)
          window.setTimeout(exportSession, 30)
        },
      },
      { type: 'separator' },
      {
        label: '删除会话…',
        danger: true,
        onSelect: () => deleteSession(session),
      },
    ]
  }

  if (!work) {
    return (
      <div className="character-chat-view">
        <header className="chat-topbar">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
            <IconArrowLeft size={16} />
            书库
          </button>
          <div>
            <span className="chat-eyebrow">角色会客厅</span>
            <h1>还没有可以聊天的作品</h1>
          </div>
        </header>
        <div className="chat-empty-state">
          <IconSparkles size={24} />
          <p>先创建一部作品，添加角色，再回来和他聊一聊。</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`character-chat-view ${chatBackground ? 'has-chat-background' : ''}`}
      style={
        chatBackground
          ? ({
              '--chat-background-image': `url("${chatBackground}")`,
            } as CSSProperties)
          : undefined
      }
    >
      <header className="chat-topbar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <IconArrowLeft size={16} />
          书库
        </button>
        <div>
          <span className="chat-eyebrow">角色会客厅</span>
          <div className="chat-topbar-title-row">
            <h1>
              {isGroupChat
                ? `群聊：${activeParticipants.map((item) => item.name).join(' / ')}`
                : character
                  ? `和 ${character.name} 聊聊`
                  : '选一个角色'}
            </h1>
            {activeSession && activeCharacter ? (
              <ChatEmotionBadge
                emotion={activeEmotion}
                characterName={activeCharacter.name}
                open={emotionOpen}
                onToggle={() => setEmotionOpen((open) => !open)}
                onClose={() => setEmotionOpen(false)}
                onChange={updateEmotion}
              />
            ) : null}
            {activeSession && activeCharacter ? (
              <button
                type="button"
                className="chat-persona-badge"
                onClick={() => setPersonaOpen(true)}
                title="设置你在这场对话里的身份"
              >
                <span>身份</span>
                <strong>{personaLabel(activePersona)}</strong>
              </button>
            ) : null}
          </div>
        </div>
        <div className="chat-topbar-actions">

          {activeCharacter ? (
            <>
              <ImagePickerButton
                label={chatBackground ? '换背景' : '聊天背景'}
                title="设置聊天背景（有会话时只影响当前会话）"
                onPick={applyChatBackground}
                onError={onToast}
              />
              {chatBackground ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearChatBackground}>
                  清除背景
                </button>
              ) : null}
            </>
          ) : null}
          {character ? (
            <button
              type="button"
              className={`btn btn-ghost btn-sm ${memoryOpen ? 'active' : ''}`}
              onClick={() => setMemoryOpen((open) => !open)}
            >
              {memoryOpen ? '收起记忆' : '长期记忆'}
            </button>
          ) : null}
          <label className="chat-model-picker" title="只影响角色聊天 AI">
            <span>聊天模型</span>
            {apiReady ? (
              <ModelPicker
                value={api.model}
                models={
                  api.model && !availableModels.includes(api.model)
                    ? [api.model, ...availableModels]
                    : availableModels
                }
                onChange={onChatModelChange}
                compact
                ariaLabel="聊天模型"
              />
            ) : (
              <span className="model-config-empty">未配置模型</span>
            )}
          </label>
          <span className={`ai-state ${apiReady ? 'ready' : 'warn'}`}>
            <span className="status-dot" />
            {apiReady ? '模型已就绪' : 'AI 未配置'}
          </span>
          {!apiReady ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenSettings}>
              去设置
            </button>
          ) : null}
        </div>
      </header>

      <div
        className={`chat-layout ${memoryOpen ? '' : 'memory-collapsed'}`}
      >
        <aside className="chat-sidebar">
          <label className="chat-field">
            <span>作品</span>
            <select
              className="input select"
              value={work.id}
              onChange={(event) => setWorkId(event.target.value)}
            >
              {works.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>

          <label className="chat-search">
            <input
              className="input"
              value={sessionQuery}
              onChange={(event) => setSessionQuery(event.target.value)}
              placeholder="搜索会话 / 角色"
              aria-label="搜索会话"
            />
          </label>

          <div className="chat-sidebar-head">
            <span>角色</span>
            <small>{characters.length}</small>
          </div>
          <div className="chat-character-list">
            {characters.length === 0 ? (
              <p className="chat-empty-note">这本书还没有角色卡，先到作品详情创建角色。</p>
            ) : (
              characters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`chat-character-item ${item.id === character?.id ? 'active' : ''}`}
                  onClick={() => chooseCharacter(item)}
                >
                  <ChatAvatar name={item.name} avatar={item.avatar} />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.role || item.identity || '未设置定位'}</small>
                  </span>
                </button>
              ))
            )}
          </div>

          {groupSessions.length > 0 ? (
            <>
              <div className="chat-sidebar-head">
                <span>群聊会话</span>
                <small>{groupSessions.length}</small>
              </div>
              <div className="chat-session-list">
                {groupSessions.slice(0, 5).map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className={`chat-session-item ${session.id === activeSession?.id ? 'active' : ''}`}
                    onContextMenu={(event) =>
                      openContextMenu(event, sessionContextMenu(session.id))
                    }
                    onClick={() => selectSession(session)}
                  >
                    <span>{sessionWhen(session)} · 群聊</span>
                    <strong>{session.pinned ? '★ ' : ''}{session.title}</strong>
                    <small>{sessionPreview(session)}</small>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {characterSessions.length > 0 ? (
            <>
              <div className="chat-sidebar-head">
                <span>最近对话</span>
                <small>{characterSessions.length}</small>
              </div>
              <div className="chat-session-list">
                {characterSessions.slice(0, 8).map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className={`chat-session-item ${session.id === activeSession?.id ? 'active' : ''}`}
                    onContextMenu={(event) =>
                      openContextMenu(event, sessionContextMenu(session.id))
                    }
                    onClick={() => selectSession(session)}
                  >
                    <span>{sessionWhen(session)}</span>
                    <strong>{session.pinned ? '★ ' : ''}{session.title || '对话'}</strong>
                    <small>{sessionPreview(session)}</small>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="chat-sidebar-foot">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={startSession}
              disabled={!character}
            >
              <IconPlus size={14} />
              新对话
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={openGroupModal}
              disabled={characters.length < 2}
            >
              <IconUsers size={14} />
              发起群聊
            </button>
            <span>聊天只保存在本机</span>
          </div>
        </aside>

        <main className="chat-main">
          {!character ? (
            <div className="chat-empty-state">
              <IconSparkles size={24} />
              <p>选择一个角色，开始聊天。</p>
            </div>
          ) : (
            <>
              <div className="chat-main-head">
                <div>
                  <span className="chat-eyebrow">
                    {work.title} · {isGroupChat ? '多角色群聊' : '角色本人'}
                  </span>
                  <h2>
                    {isGroupChat
                      ? activeParticipants.map((item) => item.name).join(' / ')
                      : activeCharacter?.name ?? character?.name}
                  </h2>
                  <p>
                    {isGroupChat
                      ? `${activeParticipants.length} 人群聊`
                      : activeCharacter?.role || activeCharacter?.identity || '角色'}{' '}
                    · 知道到{' '}
                    <select
                      className="chat-cutoff-select"
                      value={cutoff}
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        setCutoff(next)
                        if (activeSession) {
                          updateSession({ ...activeSession, chapterCutoff: next })
                        }
                      }}
                      aria-label="角色知识截止章节"
                    >
                      {Array.from({ length: Math.max(1, chapters.length) }, (_, index) => (
                        <option key={index + 1} value={index + 1}>
                          第 {index + 1} 章
                        </option>
                      ))}
                    </select>
                  </p>
                </div>
                {activeSession ? (
                  <div className="chat-main-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => renameSession(activeSession)}
                    >
                      重命名
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleSessionPin(activeSession)}
                    >
                      {activeSession.pinned ? '取消置顶' : '置顶'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void runPlotSuggestions()}
                      disabled={plotBusy || activeSession.messages.length === 0}
                    >
                      {plotBusy ? '提炼中…' : '提炼剧情'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void runVoiceCheck()}
                      disabled={
                        voiceBusy ||
                        sending ||
                        !apiReady ||
                        isGroupChat ||
                        activeSession.messages.length === 0
                      }
                    >
                      {voiceBusy ? '检查中…' : '语气检查'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={openSceneDraft}
                      disabled={activeSession.messages.length === 0}
                    >
                      转草稿
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={exportSession}>
                      导出
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={clearSession}>
                      清空
                    </button>
                  </div>
                ) : null}
              </div>

              {activeSession ? (
                <>
                  <div className="chat-message-scroll" onMouseUp={handleChatSelection}>
                    {bindingUndo ? (
                      <div className="chat-binding-undo">
                        <span>{bindingUndo.label}</span>
                        <button type="button" onClick={undoCharacterBinding}>
                          撤销
                        </button>
                      </div>
                    ) : null}
                    {voiceResult || voiceError ? (
                      <div className="chat-voice-result">
                        <div className="chat-voice-result-head">
                          <span>角色语气检查</span>
                          <button
                            type="button"
                            onClick={() => {
                              setVoiceResult('')
                              setVoiceError('')
                            }}
                          >
                            关闭
                          </button>
                        </div>
                        <pre>{voiceError || voiceResult}</pre>
                      </div>
                    ) : null}
                    {activeSession.messages.length > 0 ? (
                      <div className="chat-scene-strip">
                        <span>{activeChapter?.title ?? work.title}</span>
                        <span>{activeParticipants.map((item) => item.name).join(' / ')}</span>
                        <span>{chapterCutoffLabel(chapters, cutoff)}</span>
                      </div>
                    ) : null}
                    {activeSession.messages.length === 0 ? (
                      <div className="chat-welcome">
                        <span className="chat-welcome-mark">
                          {isGroupChat ? '群' : (activeCharacter?.name ?? character?.name ?? '戏').slice(0, 1)}
                        </span>
                        <p className="chat-welcome-kicker">
                          {isGroupChat ? '他们都在场' : '他/她就在你面前'}
                        </p>
                        <h3>你想先说什么？</h3>
                        <div className="chat-starters">
                          {CHARACTER_CHAT_STARTERS.map((starter) => (
                            <button
                              key={starter}
                              type="button"
                              onClick={() => void send(starter)}
                              disabled={!apiReady || sending}
                            >
                              {starter}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="chat-stage">
                        <aside className="chat-rail chat-scene-rail">
                          <p className="chat-rail-kicker">本场</p>
                          <h4>{activeChapter?.title ?? work.title}</h4>
                          <p className="chat-rail-copy">
                            {activeSession.summary || work.synopsis || '从当前场景继续。'}
                          </p>
                          <div className="chat-rail-members">
                            {activeParticipants.map((item) => (
                              <div key={item.id}>
                                <ChatAvatar name={item.name} avatar={item.avatar} small />
                                <span>
                                  <strong>{item.name}</strong>
                                  <small>{item.role || item.identity || '角色'}</small>
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="chat-rail-foot">
                            <span>知识截止</span>
                            <strong>{chapterCutoffLabel(chapters, cutoff)}</strong>
                          </div>
                        </aside>
                        <div className="chat-messages">
                        <div className="chat-day-separator">今天 · {chapterCutoffLabel(chapters, cutoff)}</div>
                        {activeSession.messages.map((message) => {
                          const speakerName = message.speakerName ?? activeCharacter?.name ?? '角色'
                          const speakerAvatar =
                            activeParticipants.find((item) => item.id === message.speakerId)?.avatar ??
                            (message.speakerName === activeCharacter?.name ? activeCharacter?.avatar : undefined)
                          return (
                            <div
                              className={`chat-message ${message.role}`}
                              key={message.id}
                              onContextMenu={(event) =>
                                openContextMenu(event, messageContextMenu(message.id))
                              }
                            >
                              {message.role === 'assistant' ? (
                                <ChatAvatar name={speakerName} avatar={speakerAvatar} small />
                              ) : null}
                              <div className="chat-bubble">
                                <div className="chat-bubble-meta">
                                  <span className="chat-bubble-name">
                                    {message.role === 'assistant' ? speakerName : '我'}
                                  </span>
                                  {message.proactive ? (
                                    <span className="chat-proactive-tag">主动</span>
                                  ) : null}
                                  <time>{messageTime(message.at)}</time>
                                </div>
                                <p>{renderChatContent(message.content)}</p>
                                <div className="chat-message-actions">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void copyTextToClipboard(message.content).then((ok) =>
                                        onToast(ok ? '已复制消息' : '复制失败'),
                                      )
                                    }}
                                  >
                                    复制
                                  </button>
                                  <button type="button" onClick={() => quoteMessage(message)}>
                                    引用
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => branchFromMessage(message.id)}
                                  >
                                    分支
                                  </button>
                                  {message.role === 'assistant' ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => rememberMessage(message)}
                                      >
                                        记住
                                      </button>
                                      {lastAssistantId === message.id ? (
                                        <button
                                          type="button"
                                          onClick={regenerateLast}
                                          disabled={sending}
                                        >
                                          重新生成
                                        </button>
                                      ) : null}
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => editUserMessage(message)}
                                      disabled={sending}
                                    >
                                      编辑重发
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        {sending && streaming ? (
                          <div className="chat-message assistant">
                            <ChatAvatar
                              name={activeCharacter?.name ?? '角色'}
                              avatar={activeCharacter?.avatar}
                              small
                            />
                            <div className="chat-bubble">
                              <span className="chat-bubble-name">{activeCharacter?.name}</span>
                              <p>{renderChatContent(streaming)}</p>
                            </div>
                          </div>
                        ) : null}
                        <div ref={messagesEndRef} />
                        </div>
                        <aside className="chat-rail chat-topic-rail">
                          <p className="chat-rail-kicker">可以聊</p>
                          {activeCharacter?.goal ? (
                            <button
                              type="button"
                              onClick={() =>
                                insertQuickDraft(`关于“${activeCharacter.goal}”，你现在最在意的是什么？`)
                              }
                            >
                              <span>角色目标</span>
                              <strong>{activeCharacter.goal}</strong>
                            </button>
                          ) : null}
                          {openForeshadows.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => insertQuickDraft(`关于“${item.title}”，你记得多少？`)}
                            >
                              <span>未回收线索</span>
                              <strong>{item.title}</strong>
                            </button>
                          ))}
                          {CHARACTER_CHAT_STARTERS.slice(0, 3).map((starter) => (
                            <button
                              key={starter}
                              type="button"
                              onClick={() => insertQuickDraft(starter)}
                            >
                              <span>开场</span>
                              <strong>{starter}</strong>
                            </button>
                          ))}
                          <div className="chat-rail-foot">
                            <span>输入后按 Enter 发送</span>
                          </div>
                        </aside>
                      </div>
                    )}
                  </div>

                  <div className="chat-composer">
                    {error ? <p className="chat-error">{error}</p> : null}
                    {plotError ? <p className="chat-error">剧情提炼：{plotError}</p> : null}
                    <div className="chat-composer-context">
                      <span className="chat-context-chip">
                        记忆 {activeMemories.length}
                      </span>
                      <span className="chat-context-chip">
                        {chapterCutoffLabel(chapters, cutoff)}
                      </span>
                      {isGroupChat ? (
                        <span className="chat-group-mentions">
                          指定发言：
                          {activeParticipants.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => insertGroupMention(item.name)}
                            >
                              @{item.name}
                            </button>
                          ))}
                        </span>
                      ) : (
                        <span className="chat-quick-actions">
                          {['试探他', '直接问', '换个话题', '说出真实想法'].map((text) => (
                            <button
                              key={text}
                              type="button"
                              onClick={() => insertQuickDraft(text)}
                            >
                              {text}
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                    <div className="chat-composer-row">
                      <textarea
                        ref={draftRef}
                        className="chat-textarea"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            void send()
                          }
                        }}
                        placeholder={
                          apiReady
                            ? isGroupChat
                              ? '对在场角色说点什么…（Enter 发送 / Shift + Enter 换行）'
                              : `对${activeCharacter?.name ?? '角色'}说点什么…（Enter 发送 / Shift + Enter 换行）`
                            : '先配置 AI 模型和 API Key，才能和角色聊天'
                        }
                        disabled={!apiReady || sending}
                        rows={2}
                      />
                      {sending ? (
                        <button type="button" className="chat-send stop" onClick={stop} aria-label="停止">
                          <IconStop size={17} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="chat-send"
                          onClick={() => void send()}
                          disabled={!apiReady || !draft.trim()}
                          aria-label="发送"
                        >
                          <IconArrowRight size={17} />
                        </button>
                      )}
                    </div>
                    <span className="chat-composer-note">
                      {chapterCutoffLabel(chapters, cutoff)} ·{' '}
                      {isGroupChat ? '多角色群聊，每位角色只知道自己知道的事' : '这是角色本人，不是写作助手'}
                      {' '}· 选中消息里的人名可以绑定人物
                    </span>
                  </div>
                </>
              ) : (
                <div className="chat-welcome standalone">
                  <span className="chat-welcome-mark">{character.name.slice(0, 1)}</span>
                  <p className="chat-welcome-kicker">角色会客厅</p>
                  <h3>和{character.name}聊点什么？</h3>
                  <p className="chat-welcome-copy">
                    他/她只会知道到第 {cutoff} 章为止的事，聊天记忆单独保存在本机，不会自动改正文或设定。
                  </p>
                  {workSessions[0] ? (
                    <button
                      type="button"
                      className="chat-resume-card"
                      onClick={() => selectSession(workSessions[0])}
                    >
                      <span>上次聊到 · {sessionWhen(workSessions[0])}</span>
                      <strong>{sessionPreview(workSessions[0])}</strong>
                      <small>继续这段对话</small>
                    </button>
                  ) : null}
                  <div className="chat-starter-grid">
                    {CHARACTER_CHAT_STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        disabled={!apiReady}
                        onClick={() => startWithPrompt(starter)}
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="btn btn-primary" onClick={startSession}>
                    <IconPlus size={15} />
                    开始新对话
                  </button>
                </div>
              )}
              {!activeSession ? null : null}
            </>
          )}
        </main>

        {character && memoryOpen ? (
          <aside className="chat-memory-panel">
            {isGroupChat ? (
              <>
                <div className="chat-memory-head">
                  <div>
                    <span className="chat-eyebrow">群聊模式</span>
                    <h3>{activeParticipants.length} 人对话</h3>
                  </div>
                </div>
                <p className="chat-memory-hint">
                  群聊暂以完整对话上下文作为记忆，不自动写入单个角色的长期记忆；切回单聊可以继续管理角色记忆。
                </p>
                <div className="chat-group-members">
                  {activeParticipants.map((item) => (
                    <div key={item.id}>
                      <ChatAvatar name={item.name} avatar={item.avatar} small />
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.role || item.identity || '角色'}</small>
                      </span>
                    </div>
                  ))}
                </div>
                <label className="chat-group-order">
                  <span>下一轮优先发言</span>
                  <select
                    className="input select"
                    value={groupNextSpeaker}
                    onChange={(event) => setGroupNextSpeaker(event.target.value)}
                  >
                    <option value="">自然顺序</option>
                    {activeParticipants.map((item) => (
                      <option key={item.id} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="chat-memory-foot">
                  <span>角色知识边界</span>
                  <strong>{chapterCutoffLabel(chapters, cutoff)}</strong>
                </div>
              </>
            ) : (
              <>
            <div className="chat-memory-head">
              <div>
                <span className="chat-eyebrow">长期记忆</span>
                <h3>{character.name} 记得</h3>
              </div>
              <span>{activeMemories.length}</span>
            </div>
            <div className="chat-character-state">
              <ChatAvatar name={character.name} avatar={character.avatar} small />
              <div>
                <strong>{character.name}</strong>
                <small>
                  {character.identity || character.role || '角色'}
                  {character.status ? ` · ${character.status}` : ''}
                  {character.goal ? ` · 目标：${character.goal}` : ''}
                </small>
              </div>
            </div>
            <div className="chat-memory-summary">
              <div className="chat-memory-summary-head">
                <span>会话摘要</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => activeSession && void runMemoryUpdate(activeSession, true)}
                  disabled={!activeSession || !apiReady || memoryBusy || isGroupChat}
                >
                  {memoryBusy ? '整理中…' : '整理记忆'}
                </button>
              </div>
              <p>
                {isGroupChat
                  ? '群聊暂以完整对话上下文作为记忆；长期记忆请切回单聊。'
                  : activeSession?.summary ||
                    '还没有摘要。聊过几轮后可以点「整理记忆」，它会总结对话并提取新的长期记忆。'}
              </p>
              <label className="chat-memory-auto">
                <input
                  type="checkbox"
                  checked={activeSession?.autoMemory !== false}
                  disabled={!activeSession || isGroupChat}
                  onChange={(event) => {
                    if (activeSession) {
                      updateSession({ ...activeSession, autoMemory: event.target.checked })
                    }
                  }}
                />
                <span>每 {settings.autoMemoryInterval} 条对话自动整理</span>
              </label>
              {memoryError ? <p className="chat-memory-error">{memoryError}</p> : null}
            </div>
            <p className="chat-memory-hint">
              这里的事情会进入后续对话；自动整理只记录对话里明确发生的事，不会写回作品正典。
            </p>
            <div className="chat-memory-list">
              {activeMemories.length === 0 ? (
                <p className="chat-empty-note">还没有长期记忆。可以手动记下一件希望角色记住的事。</p>
              ) : (
                activeMemories.map((memory) =>
                  editingMemoryId === memory.id ? (
                    <div className="chat-memory-edit" key={memory.id}>
                      <textarea
                        className="chat-memory-input"
                        value={editingMemoryText}
                        onChange={(event) => setEditingMemoryText(event.target.value)}
                        rows={3}
                        maxLength={300}
                      />
                      <div>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingMemoryId(null)}>
                          取消
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={saveEditMemory}
                          disabled={!editingMemoryText.trim()}
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`chat-memory-item ${memory.pinned ? 'pinned' : ''}`}
                      key={memory.id}
                      onContextMenu={(event) =>
                        openContextMenu(event, [
                          { type: 'label', label: memory.kind || '长期记忆' },
                          { label: '编辑记忆', onSelect: () => startEditMemory(memory) },
                          {
                            label: '复制记忆',
                            onSelect: () => {
                              void copyTextToClipboard(memory.text)
                            },
                          },
                          {
                            label: memory.pinned ? '取消固定' : '固定记忆',
                            onSelect: () => toggleMemoryPin(memory.id),
                          },
                          { type: 'separator' },
                          {
                            label: '删除记忆…',
                            danger: true,
                            onSelect: () => {
                              if (window.confirm('删除这条长期记忆？')) removeMemory(memory.id)
                            },
                          },
                        ])
                      }
                    >
                      <button
                        type="button"
                        className="chat-memory-pin"
                        title={memory.pinned ? '取消固定' : '固定记忆'}
                        onClick={() => toggleMemoryPin(memory.id)}
                      >
                        {memory.pinned ? '★' : '☆'}
                      </button>
                      <div className="chat-memory-content">
                        <div className="chat-memory-meta">
                          <span>{MEMORY_KIND_LABELS[(memory.kind ?? 'fact') as CharacterMemoryKind]}</span>
                          <span>{memory.source === 'auto' ? '自动' : '手动'}</span>
                        </div>
                        <p>{memory.text}</p>
                      </div>
                      <button
                        type="button"
                        className="chat-memory-edit-btn"
                        title="编辑记忆"
                        onClick={() => startEditMemory(memory)}
                      >
                        <IconPencil size={12} />
                      </button>
                      <button
                        type="button"
                        className="chat-memory-delete"
                        title="删除记忆"
                        onClick={() => removeMemory(memory.id)}
                      >
                        <IconTrash size={12} />
                      </button>
                    </div>
                  ),
                )
              )}
            </div>
            <div className="chat-memory-add">
              <textarea
                className="chat-memory-input"
                value={memoryDraft}
                onChange={(event) => setMemoryDraft(event.target.value)}
                placeholder="例如：她答应下次带我去看旧剑冢"
                rows={3}
                maxLength={300}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={addMemory}
                disabled={!memoryDraft.trim() || memoriesReady === false}
              >
                记住这件事
              </button>
            </div>
            <div className="chat-memory-foot">
              <span>角色知识边界</span>
              <strong>{chapterCutoffLabel(chapters, cutoff)}</strong>
            </div>
              </>
            )}
          </aside>
        ) : null}
      </div>

      {plotOpen ? (
        <Modal
          title="剧情候选"
          subtitle="从对话中提炼，只作为候选；不会自动写入事件簿或正文"
          onClose={() => setPlotOpen(false)}
          size="lg"
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(plotMarkdown)
                  onToast('已复制剧情候选')
                }}
              >
                复制
              </button>
              <button type="button" className="btn btn-ghost" onClick={exportPlotSuggestions}>
                导出 Markdown
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setPlotOpen(false)}>
                完成
              </button>
            </>
          }
        >
          <div className="chat-plot-suggestions">
            <section>
              <h4>事件候选</h4>
              {plotSuggestions?.events.length ? (
                plotSuggestions.events.map((item) => <p key={item}>· {item}</p>)
              ) : (
                <p>暂无</p>
              )}
            </section>
            <section>
              <h4>关系变化候选</h4>
              {plotSuggestions?.relationships.length ? (
                plotSuggestions.relationships.map((item) => <p key={item}>· {item}</p>)
              ) : (
                <p>暂无</p>
              )}
            </section>
            <section>
              <h4>章末钩子候选</h4>
              {plotSuggestions?.hooks.length ? (
                plotSuggestions.hooks.map((item) => <p key={item}>· {item}</p>)
              ) : (
                <p>暂无</p>
              )}
            </section>
          </div>
        </Modal>
      ) : null}

      {sceneOpen ? (
        <Modal
          title="对白草稿"
          subtitle="从当前对话整理，可编辑后复制或导出；不会自动写入正文"
          onClose={() => setSceneOpen(false)}
          size="lg"
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(sceneText)
                  onToast('已复制对白草稿')
                }}
              >
                复制
              </button>
              <button type="button" className="btn btn-ghost" onClick={exportSceneDraft}>
                导出 Markdown
              </button>
              {onInsertDialogue ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={insertSceneToChapter}
                  disabled={!sceneText.trim() || chapters.length === 0}
                >
                  插入正文
                </button>
              ) : null}
              <button type="button" className="btn btn-primary" onClick={() => setSceneOpen(false)}>
                完成
              </button>
            </>
          }
        >
          {onInsertDialogue ? (
            <label className="chat-insert-target">
              <span>插入到章节</span>
              <select
                className="input select"
                value={insertChapterId}
                onChange={(event) => setInsertChapterId(event.target.value)}
              >
                {chapters.map((chapter, index) => (
                  <option key={chapter.id} value={chapter.id}>
                    第 {index + 1} 章 · {chapter.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <textarea
            className="input textarea scene-draft-textarea"
            value={sceneText}
            onChange={(event) => setSceneText(event.target.value)}
            rows={16}
            aria-label="对白草稿"
          />
        </Modal>
      ) : null}

      {groupOpen ? (
        <Modal
          title="发起多角色群聊"
          subtitle="选择 2–4 个角色，让他们互相回应；群聊不会自动写入单角色长期记忆"
          onClose={() => setGroupOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setGroupOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={startGroupSession}
                disabled={groupSelection.length < 2}
              >
                <IconUsers size={15} />
                开始群聊
              </button>
            </>
          }
        >
          <div className="chat-group-modal">
            <div className="chat-group-picker">
              {characters.map((item) => (
                <label
                  key={item.id}
                  className={`chat-group-option ${groupSelection.includes(item.id) ? 'active' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={groupSelection.includes(item.id)}
                    onChange={() =>
                      setGroupSelection((prev) => {
                        if (prev.includes(item.id)) return prev.filter((id) => id !== item.id)
                        return prev.length >= 4 ? prev : [...prev, item.id]
                      })
                    }
                  />
                  <ChatAvatar name={item.name} avatar={item.avatar} small />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.role || item.identity || '角色'}</small>
                  </span>
                </label>
              ))}
            </div>
            <label className="chat-group-cutoff">
              <span>角色知识截止</span>
              <select
                className="input select"
                value={groupCutoff}
                onChange={(event) => setGroupCutoff(Number(event.target.value))}
              >
                {Array.from({ length: Math.max(1, chapters.length) }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    第 {index + 1} 章
                  </option>
                ))}
              </select>
            </label>
            <p className="hint-line">
              每位角色只知道截止章节之前的事；一次最多让 3 位角色发言，不会替用户说话。
            </p>
          </div>
        </Modal>
      ) : null}

      {bindingSelection ? (
        <div
          className="chat-selection-toolbar"
          style={{ left: bindingSelection.left, top: bindingSelection.top }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <span>「{bindingSelection.text}」</span>
          <button
            type="button"
            onClick={() => {
              setBindingText(bindingSelection.text)
              setBindingSelection(null)
            }}
          >
            绑定人物
          </button>
        </div>
      ) : null}

      {bindingText && detail ? (
        <EntityBindingModal
          selectedText={bindingText}
          detail={detail}
          characters={chatCharacters}
          mode="chat"
          onBind={finishCharacterBinding}
          onClose={() => setBindingText('')}
        />
      ) : null}

      {selectedEntity ? (
        <EntityInfoCard
          entry={selectedEntity.entry}
          position={{ left: selectedEntity.left, top: selectedEntity.top }}
          onClose={() => setSelectedEntity(null)}
          onOpenDetails={(entry) => {
            setSelectedEntity(null)
            if (detail) setArchiveEntity(entry)
            else onToast('当前作品还没有可打开的详情')
          }}
        />
      ) : null}

      {archiveEntity && detail && work ? (
        <EntityArchiveModal
          category={archiveEntity.category}
          id={archiveEntity.id}
          detail={detail}
          chapters={chapters}
          onUpdateDetail={(patch) => onUpdateDetailForWork?.(work.id, patch)}
          onToast={onToast}
          onClose={() => setArchiveEntity(null)}
        />
      ) : null}
      {personaOpen && activeSession ? (
        <ChatPersonaModal
          persona={activePersona}
          characters={characters}
          hasMessages={activeSession.messages.length > 0}
          onSave={savePersona}
          onClose={() => setPersonaOpen(false)}
        />
      ) : null}
    </div>
  )
}
