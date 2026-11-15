import { Component, type ErrorInfo, type ReactNode } from 'react'
import { downloadTextFile } from '../backup'
import { diagnosticsJson, getDiagnostics, recordDiagnostic } from '../diagnostics'
import { APP_VERSION } from '../version'
import { IconX } from './Icons'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    recordDiagnostic(
      'react',
      new Error(`${error.message}\n${info.componentStack ?? ''}`),
      'React 组件错误',
    )
  }

  private reload = () => {
    window.location.reload()
  }

  private exportDiagnostics = () => {
    downloadTextFile(
      `shuoxi-diagnostics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`,
      diagnosticsJson(),
    )
  }

  render() {
    if (!this.state.error) return this.props.children
    const events = getDiagnostics()
    return (
      <div className="fatal-error-page">
        <div className="fatal-error-card" role="alert">
          <span className="fatal-error-mark">
            <IconX size={20} />
          </span>
          <div className="fatal-error-copy">
            <span>界面遇到问题</span>
            <h1>说戏没有正常渲染</h1>
            <p>
              本地数据仍在浏览器存储中。可以先导出诊断信息，再重新加载；不要直接清理浏览器数据。
            </p>
          </div>
          <pre className="fatal-error-message">{this.state.error.message || '未知错误'}</pre>
          <div className="fatal-error-meta">
            <span>版本 {APP_VERSION}</span>
            <span>已记录 {events.length} 条诊断</span>
          </div>
          <div className="fatal-error-actions">
            <button type="button" className="btn btn-ghost" onClick={this.exportDiagnostics}>
              导出诊断信息
            </button>
            <button type="button" className="btn btn-primary" onClick={this.reload}>
              重新加载
            </button>
          </div>
        </div>
      </div>
    )
  }
}
