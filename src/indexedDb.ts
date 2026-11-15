const DB_NAME = 'shuoxi-storage'
const STORE_NAME = 'kv'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

export function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'))
  })
  return dbPromise
}

export function readDatabase<T>(key: string): Promise<T | undefined> {
  return openDatabase().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly')
        const request = transaction.objectStore(STORE_NAME).get(key)
        request.onsuccess = () => resolve(request.result as T | undefined)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB 读取失败'))
      }),
  )
}

export function writeDatabase<T>(key: string, value: T): Promise<void> {
  return openDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        transaction.objectStore(STORE_NAME).put(value, key)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 写入失败'))
      }),
  )
}

export function deleteDatabase(key: string): Promise<void> {
  return openDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        transaction.objectStore(STORE_NAME).delete(key)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 删除失败'))
      }),
  )
}

export function readLocalStorageLegacy<T>(
  key: string,
  migrate?: (raw: unknown) => T,
): T | undefined {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return undefined
    const parsed: unknown = JSON.parse(raw)
    return migrate ? migrate(parsed) : (parsed as T)
  } catch {
    return undefined
  }
}

export function initialValue<T>(initial: T | (() => T)): T {
  return typeof initial === 'function' ? (initial as () => T)() : initial
}

export function dispatchStorageError(key: string, error: unknown): void {
  window.dispatchEvent(
    new CustomEvent('shuoxi-storage-error', {
      detail: { key, error: error instanceof Error ? error.message : String(error) },
    }),
  )
}
