import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  type?: 'item'
  id?: string
  label: string
  icon?: ReactNode
  shortcut?: string
  hint?: string
  checked?: boolean
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

export interface ContextMenuSeparator {
  type: 'separator'
}

export interface ContextMenuLabel {
  type: 'label'
  label: string
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator | ContextMenuLabel

interface MenuState {
  x: number
  y: number
  entries: ContextMenuEntry[]
}

interface OpenOptions {
  /** 默认不会在输入框 / 可编辑区域打开；需要时显式允许。 */
  allowEditable?: boolean
}

interface ContextMenuApi {
  openContextMenu: (
    event: ReactMouseEvent<Element>,
    entries: ContextMenuEntry[],
    options?: OpenOptions,
  ) => void
  openContextMenuAt: (x: number, y: number, entries: ContextMenuEntry[]) => void
  closeContextMenu: () => void
}

const ContextMenuContext = createContext<ContextMenuApi | null>(null)

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function isEnabled(entry: ContextMenuEntry): entry is ContextMenuItem {
  return !('type' in entry) || entry.type === 'item'
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const closeContextMenu = useCallback(() => {
    setMenu(null)
    const previous = returnFocusRef.current
    returnFocusRef.current = null
    if (previous && previous.isConnected) {
      window.setTimeout(() => previous.focus({ preventScroll: true }), 0)
    }
  }, [])

  const openContextMenuAt = useCallback((x: number, y: number, entries: ContextMenuEntry[]) => {
    if (entries.length === 0) return
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setMenu({ x, y, entries })
    setPosition({ left: x, top: y, width: 0, height: 0 })
  }, [])

  const openContextMenu = useCallback(
    (
      event: ReactMouseEvent<Element>,
      entries: ContextMenuEntry[],
      options?: OpenOptions,
    ) => {
      if (!options?.allowEditable && isEditableTarget(event.target)) return
      if (entries.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      openContextMenuAt(event.clientX, event.clientY, entries)
    },
    [openContextMenuAt],
  )

  useEffect(() => {
    if (!menu) return
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      closeContextMenu()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeContextMenu()
      }
    }
    const onScroll = () => closeContextMenu()
    const onResize = () => closeContextMenu()
    const onBlur = () => closeContextMenu()
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('blur', onBlur)
    }
  }, [menu, closeContextMenu])

  useLayoutEffect(() => {
    if (!menu) return
    const element = menuRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const margin = 8
    const left = Math.max(margin, Math.min(menu.x, window.innerWidth - rect.width - margin))
    const top = Math.max(margin, Math.min(menu.y, window.innerHeight - rect.height - margin))
    setPosition({ left, top, width: rect.width, height: rect.height })
    const first = element.querySelector<HTMLElement>('button:not([disabled])')
    if (first) first.focus({ preventScroll: true })
  }, [menu])

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!menuRef.current) return
    const items = Array.from(
      menuRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
    )
    if (items.length === 0) return
    const active = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
    const index = active ? items.indexOf(active) : -1
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      items[(index + 1 + items.length) % items.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      items[(index - 1 + items.length) % items.length]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      items[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      items[items.length - 1]?.focus()
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (active) {
        event.preventDefault()
        active.click()
      }
    }
  }

  const api: ContextMenuApi = { openContextMenu, openContextMenuAt, closeContextMenu }

  return (
    <ContextMenuContext.Provider value={api}>
      {children}
      {menu
        ? createPortal(
            <div
              ref={menuRef}
              className="app-context-menu"
              role="menu"
              style={{ left: position.left, top: position.top }}
              onMouseDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
              onKeyDown={handleMenuKeyDown}
            >
              {menu.entries.map((entry, index) => {
                if ('type' in entry && entry.type === 'separator') {
                  return <span className="context-menu-separator" key={`sep-${index}`} />
                }
                if ('type' in entry && entry.type === 'label') {
                  return (
                    <span className="context-menu-label" key={`label-${index}`}>
                      {entry.label}
                    </span>
                  )
                }
                const item = entry as ContextMenuItem
                return (
                  <button
                    key={item.id ?? `${item.label}-${index}`}
                    type="button"
                    role="menuitem"
                    className={`${item.danger ? 'danger' : ''} ${item.checked ? 'checked' : ''}`.trim()}
                    disabled={item.disabled}
                    title={item.hint}
                    onClick={() => {
                      if (item.disabled) return
                      closeContextMenu()
                      item.onSelect()
                    }}
                  >
                    {item.icon ? <span className="context-menu-icon">{item.icon}</span> : null}
                    <span className="context-menu-label-text">{item.label}</span>
                    {item.checked ? <span className="context-menu-check">✓</span> : null}
                    {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </ContextMenuContext.Provider>
  )
}

export function useContextMenu(): ContextMenuApi {
  const value = useContext(ContextMenuContext)
  if (!value) throw new Error('useContextMenu must be used inside ContextMenuProvider')
  return value
}

export function contextMenuHasEnabledItem(entry: ContextMenuEntry): boolean {
  return isEnabled(entry) && !entry.disabled
}
