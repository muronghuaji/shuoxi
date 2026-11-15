import { APP_VERSION } from './version'

export interface DiagnosticEvent {
  at: string
  type: 'error' | 'unhandledrejection' | 'react'
  message: string
  stack?: string
}

const DIAGNOSTICS_KEY = 'shuoxi.diagnostics.v1'
const MAX_EVENTS = 30

function read(): DiagnosticEvent[] {
  try {
    const raw = localStorage.getItem(DIAGNOSTICS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as DiagnosticEvent[]).slice(-MAX_EVENTS) : []
  } catch {
    return []
  }
}

export function recordDiagnostic(
  type: DiagnosticEvent['type'],
  error: unknown,
  fallback = '未知错误',
): void {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : fallback
  const stack = error instanceof Error ? error.stack : undefined
  const event: DiagnosticEvent = {
    at: new Date().toISOString(),
    type,
    message: message.slice(0, 2000),
    stack: stack?.slice(0, 6000),
  }
  try {
    const events = [...read(), event].slice(-MAX_EVENTS)
    localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(events))
  } catch {
    // 诊断日志失败不能影响主流程
  }
  console.error(`[diagnostics:${type}]`, error)
}

export function getDiagnostics(): DiagnosticEvent[] {
  return read()
}

export function clearDiagnostics(): void {
  try {
    localStorage.removeItem(DIAGNOSTICS_KEY)
  } catch {
    // ignore
  }
}

export function diagnosticsJson(): string {
  return JSON.stringify(
    {
      app: '说戏',
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      language: navigator.language,
      events: getDiagnostics(),
    },
    null,
    2,
  )
}

export function installGlobalDiagnostics(): () => void {
  const handleError = (event: ErrorEvent) => {
    recordDiagnostic('error', event.error ?? event.message)
  }
  const handleRejection = (event: PromiseRejectionEvent) => {
    recordDiagnostic('unhandledrejection', event.reason)
  }
  window.addEventListener('error', handleError)
  window.addEventListener('unhandledrejection', handleRejection)
  return () => {
    window.removeEventListener('error', handleError)
    window.removeEventListener('unhandledrejection', handleRejection)
  }
}
