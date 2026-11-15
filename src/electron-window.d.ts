export interface ShuoxiBridge {
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  loadSyncQueue?: () => Promise<string>
  saveSyncQueue?: (payload: string) => boolean
  getBalance?: (payload: {
    baseUrl: string
    apiKey: string
    provider: string
    force?: boolean
  }) => Promise<unknown>
  onMaximizeChange: (callback: (maximized: boolean) => void) => () => void
}

declare global {
  interface Window {
    shuoxiWindow?: ShuoxiBridge
  }
}

export {}
