import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  dispatchStorageError,
  initialValue,
  readDatabase,
  readLocalStorageLegacy,
  writeDatabase,
} from '../indexedDb'

/**
 * 大对象持久化：优先 IndexedDB，首次打开时把旧的 localStorage 数据迁移过去。
 * 返回 ready，避免在异步加载完成前被默认值或种子数据覆盖。
 */
export function useIndexedStoredState<T>(
  key: string,
  initial: T | (() => T),
  migrate?: (raw: unknown) => T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(() => initialValue(initial))
  const [ready, setReady] = useState(false)
  const initialRef = useRef(initial)
  const migrateRef = useRef(migrate)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const stored = await readDatabase<T>(key)
        if (stored !== undefined) {
          if (!cancelled) {
            setValue(migrateRef.current ? migrateRef.current(stored) : stored)
            setReady(true)
          }
          return
        }
        const legacy = readLocalStorageLegacy(key, migrateRef.current)
        const loaded = legacy !== undefined ? legacy : initialValue(initialRef.current)
        await writeDatabase(key, loaded)
        try {
          window.localStorage.removeItem(key)
        } catch {
          // 迁移已经成功，清不掉旧键不影响使用。
        }
        if (!cancelled) {
          setValue(loaded)
          setReady(true)
        }
      } catch {
        // IndexedDB 不可用时退回 localStorage，至少不中断写作。
        if (!cancelled) {
          const legacy = readLocalStorageLegacy(key, migrateRef.current)
          setValue(legacy !== undefined ? legacy : initialValue(initialRef.current))
          setReady(true)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [key])

  useEffect(() => {
    if (!ready) return
    void writeDatabase(key, value).catch((error) => {
      // IndexedDB 失败时尽量写回 localStorage，小数据仍可继续保存。
      let fallbackSaved = false
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
        fallbackSaved = true
      } catch {
        // 配额也不够时交给上层提示导出备份。
      }
      if (!fallbackSaved) dispatchStorageError(key, error)
    })
  }, [key, ready, value])

  return [value, setValue, ready]
}
