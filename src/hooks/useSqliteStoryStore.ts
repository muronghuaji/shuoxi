import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Chapter, Work, WorkDetail } from '../types'
import {
  loadPrimaryStoryData,
  savePrimaryStoryData,
  type PrimaryStoryData,
} from '../storySqlite'
import { readDatabase, dispatchStorageError } from '../indexedDb'

interface SqliteStoryState extends PrimaryStoryData {
  ready: boolean
}

export type StorySaveStatus = 'saved' | 'saving' | 'error'

export interface StorySaveState {
  status: StorySaveStatus
  lastSavedAt: number
  error: string
}

async function readIndexedRecord<T>(
  key: string,
  initial: Record<string, T>,
): Promise<Record<string, T>> {
  try {
    const index = await readDatabase<string[]>(`${key}:index`)
    if (Array.isArray(index)) {
      const values = await Promise.all(
        index.map((id) => readDatabase<T>(`${key}:entry:${id}`)),
      )
      const loaded: Record<string, T> = {}
      index.forEach((id, position) => {
        const value = values[position]
        if (value !== undefined) loaded[id] = value
      })
      if (Object.keys(loaded).length > 0) return loaded
    }
    const bundled = await readDatabase<Record<string, T>>(key)
    if (bundled && typeof bundled === 'object') return bundled
  } catch {
    // 回退种子数据
  }
  return initial
}

function readLegacyWorks(initial: Work[], normalize: (raw: unknown) => Work[]): Work[] {
  try {
    const raw = window.localStorage.getItem('shuoxi.works.v1')
    if (!raw) return initial
    return normalize(JSON.parse(raw))
  } catch {
    return initial
  }
}

function applyAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function' ? (action as (value: T) => T)(current) : action
}

export function useSqliteStoryStore(input: {
  works: Work[]
  chapters: Record<string, Chapter[]>
  details: Record<string, WorkDetail>
  normalizeWorks: (raw: unknown) => Work[]
}): {
  works: Work[]
  setWorks: Dispatch<SetStateAction<Work[]>>
  chaptersByWork: Record<string, Chapter[]>
  setChaptersByWork: Dispatch<SetStateAction<Record<string, Chapter[]>>>
  detailsByWork: Record<string, WorkDetail>
  setDetailsByWork: Dispatch<SetStateAction<Record<string, WorkDetail>>>
  ready: boolean
  saveState: StorySaveState
  retrySave: () => void
} {
  const [state, setState] = useState<SqliteStoryState>({
    works: input.works,
    chapters: input.chapters,
    details: input.details,
    ready: false,
  })
  const [saveState, setSaveState] = useState<StorySaveState>({
    status: 'saved',
    lastSavedAt: 0,
    error: '',
  })
  const saveTimerRef = useRef<number | null>(null)
  const latestDataRef = useRef<PrimaryStoryData>({
    works: input.works,
    chapters: input.chapters,
    details: input.details,
  })

  const persist = useCallback(async (data: PrimaryStoryData, persistNow = false) => {
    latestDataRef.current = data
    setSaveState((current) => ({ ...current, status: 'saving', error: '' }))
    try {
      await savePrimaryStoryData(data, { persistNow })
      setSaveState({
        status: 'saved',
        lastSavedAt: Date.now(),
        error: '',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setSaveState({ status: 'error', lastSavedAt: 0, error: message })
      dispatchStorageError('shuoxi.storySqlite', error)
      throw error
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const primary = await loadPrimaryStoryData()
      if (primary) {
        if (cancelled) return
        setState({ ...primary, ready: true })
        return
      }
      const [chapters, details] = await Promise.all([
        readIndexedRecord<Chapter[]>('shuoxi.chapters.v1', input.chapters),
        readIndexedRecord<WorkDetail>('shuoxi.details.v1', input.details),
      ])
      const works = readLegacyWorks(input.works, input.normalizeWorks)
      if (cancelled) return
      setState({ works, chapters, details, ready: true })
      void persist({ works, chapters, details }).catch(() => undefined)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [input.chapters, input.details, input.normalizeWorks, input.works, persist])

  useEffect(() => {
    if (!state.ready) return
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      void persist({
        works: state.works,
        chapters: state.chapters,
        details: state.details,
      }).catch(() => undefined)
    }, 700)
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    }
  }, [state, persist])

  useEffect(() => {
    if (!state.ready) return
    const flush = () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      void persist(
        {
          works: state.works,
          chapters: state.chapters,
          details: state.details,
        },
        true,
      ).catch(() => undefined)
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [state, persist])

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!state.ready) return
    latestDataRef.current = {
      works: state.works,
      chapters: state.chapters,
      details: state.details,
    }
  }, [state])

  const retrySave = useCallback(() => {
    void persist(latestDataRef.current, true).catch(() => undefined)
  }, [persist])

  const setWorks = useCallback<Dispatch<SetStateAction<Work[]>>>((action) => {
    setState((current) => ({
      ...current,
      works: applyAction(action, current.works),
    }))
  }, [])
  const setChaptersByWork = useCallback<
    Dispatch<SetStateAction<Record<string, Chapter[]>>>
  >((action) => {
    setState((current) => ({
      ...current,
      chapters: applyAction(action, current.chapters),
    }))
  }, [])
  const setDetailsByWork = useCallback<
    Dispatch<SetStateAction<Record<string, WorkDetail>>>
  >((action) => {
    setState((current) => ({
      ...current,
      details: applyAction(action, current.details),
    }))
  }, [])

  return {
    works: state.works,
    setWorks,
    chaptersByWork: state.chapters,
    setChaptersByWork,
    detailsByWork: state.details,
    setDetailsByWork,
    ready: state.ready,
    saveState,
    retrySave,
  }
}
