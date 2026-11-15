import logoUrl from '../assets/logo.png'
import { IconBookOpen, IconChart, IconFileText, IconSearch, IconSettings, IconSparkles, IconUsers } from './Icons'

export type RailSection = 'library' | 'stats' | 'prompts' | 'chat' | 'ideas'

interface IconRailProps {
  active: RailSection
  onNavigate: (section: RailSection) => void
  onSearch: () => void
  onSettings: () => void
}

export function IconRail({ active, onNavigate, onSearch, onSettings }: IconRailProps) {
  return (
    <aside className="rail" aria-label="主导航">
      <div className="rail-logo" title="说戏 · 把想看的戏说出来">
        <img src={logoUrl} alt="说戏" draggable={false} />
      </div>

      <nav className="rail-nav">
        <button
          type="button"
          className={`rail-btn ${active === 'library' ? 'active' : ''}`}
          title="书库"
          aria-label="书库"
          aria-current={active === 'library' ? 'page' : undefined}
          onClick={() => onNavigate('library')}
        >
          <IconBookOpen size={20} />
        </button>
        <button
          type="button"
          className={`rail-btn ${active === 'stats' ? 'active' : ''}`}
          title="创作统计"
          aria-label="创作统计"
          aria-current={active === 'stats' ? 'page' : undefined}
          onClick={() => onNavigate('stats')}
        >
          <IconChart size={20} />
        </button>
        <button
          type="button"
          className="rail-btn"
          title="全局搜索（Ctrl / Cmd + K）"
          aria-label="全局搜索"
          onClick={onSearch}
        >
          <IconSearch size={20} />
        </button>
        <button
          type="button"
          className={`rail-btn ${active === 'prompts' ? 'active' : ''}`}
          title="提示词管理"
          aria-label="提示词管理"
          aria-current={active === 'prompts' ? 'page' : undefined}
          onClick={() => onNavigate('prompts')}
        >
          <IconFileText size={20} />
        </button>
        <button
          type="button"
          className={`rail-btn ${active === 'chat' ? 'active' : ''}`}
          title="角色会客厅"
          aria-label="角色会客厅"
          aria-current={active === 'chat' ? 'page' : undefined}
          onClick={() => onNavigate('chat')}
        >
          <IconUsers size={20} />
        </button>
        <button
          type="button"
          className={`rail-btn ${active === 'ideas' ? 'active' : ''}`}
          title="灵感库"
          aria-label="灵感库"
          aria-current={active === 'ideas' ? 'page' : undefined}
          onClick={() => onNavigate('ideas')}
        >
          <IconSparkles size={20} />
        </button>
      </nav>

      <div className="rail-spacer" />

      <div className="rail-foot">
        <button type="button" className="rail-btn" title="设置" aria-label="设置" onClick={onSettings}>
          <IconSettings size={20} />
        </button>
      </div>
    </aside>
  )
}
