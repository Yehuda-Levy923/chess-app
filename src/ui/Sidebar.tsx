import type { ReactNode } from 'react'
import { IconChart, IconGames, IconHome, IconSettings, IconTarget } from './icons'
import './Shell.css'

export type View = 'home' | 'games' | 'practice' | 'insights'

const NAV: { id: View; name: string; icon: ReactNode; key: string }[] = [
  { id: 'home', name: 'Home', icon: <IconHome size={18} />, key: '1' },
  { id: 'games', name: 'Games', icon: <IconGames size={18} />, key: '2' },
  { id: 'practice', name: 'Practice', icon: <IconTarget size={18} />, key: '3' },
  { id: 'insights', name: 'Insights', icon: <IconChart size={18} />, key: '4' },
]

type Props = {
  view: View
  onView: (v: View) => void
  username: string
  /** The player's current rating in their main time control, if known */
  rating: { value: number; timeClass: string } | null
  onSettings: () => void
}

/** The app's frame: where you are, where else you can go, and who you are. */
export function Sidebar({ view, onView, username, rating, onSettings }: Props) {
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand">Game review</div>

      <ul className="side-nav">
        {NAV.map((n) => (
          <li key={n.id}>
            <button className={`side-item ${view === n.id ? 'on' : ''}`} onClick={() => onView(n.id)} aria-current={view === n.id ? 'page' : undefined} title={`${n.name} (${n.key})`}>
              {n.icon}
              <span className="side-name">{n.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-foot">
        {username && (
          <div className="me">
            <span className="me-name">{username}</span>
            {rating && (
              <span className="me-rating num">
                {rating.value.toLocaleString()} <span className="dim">{rating.timeClass}</span>
              </span>
            )}
          </div>
        )}
        <button className="side-item" onClick={onSettings} title="Settings">
          <IconSettings size={18} />
          <span className="side-name">Settings</span>
        </button>
      </div>
    </nav>
  )
}
