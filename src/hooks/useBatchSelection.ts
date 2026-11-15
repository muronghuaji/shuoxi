import { useCallback, useEffect, useMemo, useState } from 'react'

interface BatchSelectionOptions {
  allIds: string[]
  onDelete: (ids: string[]) => void
  onExport: (ids: string[], format: 'markdown' | 'json') => void
}

export function useBatchSelection({ allIds, onDelete, onExport }: BatchSelectionOptions) {
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const selectedIds = useMemo(() => [...selected], [selected])

  const clear = useCallback(() => {
    setSelected(new Set())
  }, [])

  const exit = useCallback(() => {
    setSelectMode(false)
    setSelected(new Set())
    setConfirmDeleteOpen(false)
  }, [])

  const enter = useCallback(() => setSelectMode(true), [])

  const toggleMode = useCallback(() => {
    setSelectMode((current) => {
      if (current) setSelected(new Set())
      return !current
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectMode(true)
    setSelected(new Set(allIds))
  }, [allIds])

  const toggle = useCallback((id: string) => {
    setSelectMode(true)
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const removeSelected = useCallback(() => {
    if (selected.size === 0) return
    onDelete([...selected])
    setConfirmDeleteOpen(false)
    setSelected(new Set())
    setSelectMode(false)
  }, [onDelete, selected])

  const exportSelected = useCallback(
    (format: 'markdown' | 'json') => {
      const ids = [...selected]
      if (ids.length === 0) return
      onExport(ids, format)
    },
    [onExport, selected],
  )

  useEffect(() => {
    if (!selectMode) return
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setSelected(new Set(allIds))
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        exit()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selected.size === 0) return
        event.preventDefault()
        setConfirmDeleteOpen(true)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        exportSelected('json')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [allIds, exit, exportSelected, selectMode, selected.size])

  return {
    selectMode,
    selected,
    selectedIds,
    confirmDeleteOpen,
    setConfirmDeleteOpen,
    enter,
    exit,
    toggleMode,
    toggle,
    selectAll,
    clear,
    removeSelected,
    exportSelected,
  }
}
