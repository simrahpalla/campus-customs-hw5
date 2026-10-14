import { API_BASE } from '../api'
import type { Connection } from '../useDesk'

const LABEL: Record<Connection, string> = {
  connecting: 'Connecting…',
  online: 'Connected',
  offline: 'Offline · retrying',
}

export function Header({ connection, shopDate }: { connection: Connection; shopDate: string | null }) {
  const date = shopDate
    ? new Date(shopDate + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : null
  return (
    <header className="topbar">
      <div className="brand">
        <span className="crest" aria-hidden="true">CC</span>
        <div>
          <h1 className="brand-name">Campus Customs</h1>
          <p className="brand-sub">Operations Desk</p>
        </div>
      </div>
      <div className="topbar-right">
        {date && (
          <span className="shop-date" title="desk.date_today — the shop's business date">
            Shop date <strong>{date}</strong>
          </span>
        )}
        <span className={`conn conn-${connection}`} title={`Backend: ${API_BASE}`} role="status">
          <span className="conn-dot" aria-hidden="true" />
          {LABEL[connection]}
        </span>
      </div>
    </header>
  )
}
