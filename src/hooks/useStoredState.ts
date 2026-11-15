import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

export function useStoredState<T>(
  key: string,
  initial: T | (() => T),
  migrate?: (raw: unknown) => T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw)
        return migrate ? migrate(parsed) : (parsed as T)
      }
    } catch {
      // 本地数据损坏时回退到默认值
    }
    return (typeof initial === 'function' ? (initial as () => T)() : initial) as T
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      // 存储配额或权限失败时通知上层，避免静默丢数据。
      window.dispatchEvent(
        new CustomEvent('shuoxi-storage-error', {
          detail: { key, error: error instanceof Error ? error.message : String(error) },
        }),
      )
    }
  }, [key, value])

  return [value, setValue]
}
