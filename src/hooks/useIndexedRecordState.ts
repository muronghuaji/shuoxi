import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  deleteDatabase,
  dispatchStorageError,
  initialValue,
  readDatabase,
  readLocalStorageLegacy,
  writeDatabase,
} from '../indexedDb'

const INDEX_SUFFIX = ':index'
const ENTRY_PREFIX = ':entry:'

/**
 * Record<string, T> 的 IndexedDB 存储：每个 work 单独一个 key。
 * 修改一部作品时只写该作品，不再把整本书的全部作品序列化一遍。
 * 首次运行会从旧的整包 key 自动拆分迁移。
 */
export function useIndexedRecordState<T>(
  key: string,
  initial: Record<string, T> | (() => Record<string, T>),
  options?: { legacyKey?: string; migrate?: (raw: unknown) => T },
): [Record<string, T>, Dispatch<SetStateAction<Record<string, T>>>, boolean] {
  const [value, setValue] = useState<Record<string, T>>(() => initialValue(initial))
  const [ready, setReady] = useState(false)
  const initialRef = useRef(initial)
  const previousRef = useRef<Record<string, T>>({})
  const writeChainRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let cancelled = false
    const entryKey = (id: string) => `${key}${ENTRY_PREFIX}${id}`

    const loadSplit = async (): Promise<Record<string, T> | null> => {
      const index = await readDatabase<string[]>(`${key}${INDEX_SUFFIX}`)
      if (!Array.isArray(index)) return null
      const entries = await Promise.all(
        index.map((id) => readDatabase<unknown>(entryKey(id))),
      )
      const loaded: Record<string, T> = {}
      index.forEach((id, position) => {
        const entry = entries[position]
        if (entry === undefined) return
        loaded[id] = options?.migrate ? options.migrate(entry) : (entry as T)
      })
      return loaded
    }

    const writeAll = async (record: Record<string, T>) => {
      const ids = Object.keys(record)
      await Promise.all(ids.map((id) => writeDatabase(entryKey(id), record[id])))
      await writeDatabase(`${key}${INDEX_SUFFIX}`, ids)
    }

    const load = async () => {
      try {
        const split = await loadSplit()
        if (split !== null) {
          if (cancelled) return
          previousRef.current = split
          setValue(split)
          setReady(true)
          return
        }

        const legacyKey = options?.legacyKey
        let legacy = legacyKey
          ? readLocalStorageLegacy<Record<string, T>>(legacyKey)
          : undefined
        if (legacy === undefined) {
          const stored = await readDatabase<Record<string, T>>(legacyKey ?? key)
          if (stored && typeof stored === 'object') legacy = stored
        }
        const loaded = legacy && typeof legacy === 'object' ? legacy : initialValue(initialRef.current)
        await writeAll(loaded)
        if (legacyKey) {
          try {
            await deleteDatabase(legacyKey)
          } catch {
            // 旧整包保留也不影响新结构。
          }
          try {
            window.localStorage.removeItem(legacyKey)
          } catch {
            // 清不掉旧 localStorage 不影响使用。
          }
        }
        if (cancelled) return
        previousRef.current = loaded
        setValue(loaded)
        setReady(true)
      } catch (error) {
        dispatchStorageError(key, error)
        if (!cancelled) {
          setValue(initialValue(initialRef.current))
          setReady(true)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, options?.legacyKey])

  useEffect(() => {
    if (!ready) return
    const previous = previousRef.current
    const next = value
    const nextIds = Object.keys(next)
    const changedIds = nextIds.filter((id) => previous[id] !== next[id])
    if (changedIds.length === 0) {
      const removedIds = Object.keys(previous).filter((id) => !(id in next))
      if (removedIds.length === 0) return
    }
    const removedIds = Object.keys(previous).filter((id) => !(id in next))
    const entryKey = (id: string) => `${key}${ENTRY_PREFIX}${id}`

    writeChainRef.current = writeChainRef.current
      .then(async () => {
        await Promise.all([
          ...changedIds.map((id) => writeDatabase(entryKey(id), next[id])),
          ...removedIds.map((id) => deleteDatabase(entryKey(id))),
        ])
        await writeDatabase(`${key}${INDEX_SUFFIX}`, nextIds)
      })
      .catch((error) => {
        dispatchStorageError(key, error)
      })
    previousRef.current = next
  }, [key, ready, value])

  return [value, setValue, ready]
}
