import { useSyncExternalStore } from 'react'

export interface LinkedGenerationSettings {
  autoCreateLinkedItems: boolean
  autoFillFactionRoster: boolean
}

const STORAGE_KEY = 'shuoxi.linkedGeneration.v1'
const DEFAULT_SETTINGS: LinkedGenerationSettings = {
  autoCreateLinkedItems: true,
  autoFillFactionRoster: true,
}
let current: LinkedGenerationSettings = read()
const listeners = new Set<() => void>()

function read(): LinkedGenerationSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<LinkedGenerationSettings>
    return {
      autoCreateLinkedItems:
        typeof parsed.autoCreateLinkedItems === 'boolean'
          ? parsed.autoCreateLinkedItems
          : DEFAULT_SETTINGS.autoCreateLinkedItems,
      autoFillFactionRoster:
        typeof parsed.autoFillFactionRoster === 'boolean'
          ? parsed.autoFillFactionRoster
          : DEFAULT_SETTINGS.autoFillFactionRoster,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getLinkedGenerationSettings(): LinkedGenerationSettings {
  return current
}

export function setLinkedGenerationSettings(patch: Partial<LinkedGenerationSettings>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // 本地存储失败时保留内存设置。
  }
  emit()
}

export function useLinkedGenerationSettings(): LinkedGenerationSettings {
  return useSyncExternalStore(subscribe, () => current, () => current)
}
