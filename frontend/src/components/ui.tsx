import type { ReactNode } from 'react'
import { AGENT_BY_NAME, STATUS_LABELS, statusTone } from '../format'

export function StatusChip({ status, label }: { status: string; label?: string }) {
  return <span className={`chip chip-${statusTone(status)}`}>{label ?? STATUS_LABELS[status] ?? status.replace(/_/g, ' ')}</span>
}

export function ReceiptLabel({ id }: { id: number }) {
  return (
    <span className="receipt" aria-label={`Ticket ${id}`}>
      <span className="receipt-no">No.</span>
      {id}
    </span>
  )
}

export function ResolvedStamp() {
  return (
    <span className="stamp" role="img" aria-label="Resolved">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Resolved
    </span>
  )
}

export function AgentAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const a = AGENT_BY_NAME[name]
  if (!a) {
    return (
      <span className={`avatar avatar-${size} avatar-other`} aria-hidden="true">
        {name.startsWith('human') ? 'You' : name.slice(0, 2).toUpperCase()}
      </span>
    )
  }
  return (
    <span className={`avatar avatar-${size}`} style={{ background: a.color }} aria-hidden="true">
      {a.initials}
    </span>
  )
}

export function AgentName({ name }: { name: string }) {
  const a = AGENT_BY_NAME[name]
  return (
    <span className="agent-name" style={a ? { color: a.color } : undefined}>
      {name}
    </span>
  )
}

export function Card({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || aside) && (
        <header className="card-head">
          {title && <h2 className="card-title">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  )
}

export function Details({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="tech">
      <summary>{summary}</summary>
      {children}
    </details>
  )
}

export function Notice({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'info'; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'red' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}
