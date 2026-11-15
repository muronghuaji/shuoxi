import logoUrl from '../assets/logo.png'
import { useEffect, useState } from 'react'
import { IconMaximize, IconMinimize, IconX } from './Icons'

export function WindowTitlebar() {
  const [maximized, setMaximized] = useState(false)
  const bridge = typeof window !== 'undefined' ? window.shuoxiWindow : undefined

  useEffect(() => {
    if (!bridge) return
    document.documentElement.dataset.runtime = 'electron'
    void bridge.isMaximized().then(setMaximized)
    return bridge.onMaximizeChange(setMaximized)
  }, [bridge])

  if (!bridge) return null

  return (
    <div
      className="electron-titlebar"
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return
        bridge.toggleMaximize()
      }}
    >
      <div className="electron-titlebar-brand">
        <span className="electron-titlebar-mark">
          <img src={logoUrl} alt="" draggable={false} />
        </span>
        <strong>说戏</strong>
        <small>SHUOXI</small>
      </div>
      <div className="electron-titlebar-drag" />
      <div className="electron-titlebar-controls">
        <button type="button" onClick={() => bridge.minimize()} aria-label="最小化" title="最小化">
          <IconMinimize size={13} />
        </button>
        <button
          type="button"
          onClick={() => bridge.toggleMaximize()}
          aria-label={maximized ? '还原窗口' : '最大化'}
          title={maximized ? '还原窗口' : '最大化'}
        >
          <IconMaximize size={13} />
        </button>
        <button
          type="button"
          className="close"
          onClick={() => bridge.close()}
          aria-label="关闭"
          title="关闭"
        >
          <IconX size={13} />
        </button>
      </div>
    </div>
  )
}
