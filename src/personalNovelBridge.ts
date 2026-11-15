export interface PersonalNovelBridge {
  generation: {
    completed: number
    total: number
    status: 'writing' | 'paused' | 'done' | 'error'
    currentChapter?: number
  }
  sync: {
    status: 'idle' | 'running' | 'error'
    done: number
    total: number
  }
  continueChapters: (count: number) => void
  cost: number
  stop: () => void
  openAddressReview: () => void
  openSyncQueue: () => void
}
