import { TICKET_TYPE_LABELS, truncate } from '../format'
import type { Ticket, TicketDetail } from '../types'
import { ReceiptLabel, ResolvedStamp, StatusChip } from './ui'

interface Props {
  tickets: Ticket[] | null
  details: Record<number, TicketDetail>
  selectedId: number | null
  onSelect: (id: number) => void
  loading: boolean
}

export function TicketInbox({ tickets, details, selectedId, onSelect, loading }: Props) {
  return (
    <section className="card inbox" aria-labelledby="inbox-title">
      <header className="card-head">
        <h2 className="card-title" id="inbox-title">Ticket inbox</h2>
        {tickets && <span className="muted small">{tickets.filter((t) => t.state === 'open').length} open</span>}
      </header>

      {loading && !tickets && (
        <ul className="ticket-list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="ticket-card skeleton" />
          ))}
        </ul>
      )}
      {tickets && tickets.length === 0 && <p className="empty">No tickets on the board.</p>}

      {tickets && tickets.length > 0 && (
        <ul className="ticket-list">
          {tickets.map((t) => {
            const note = details[t.id]?.ticket.requester_notes
            const selected = t.id === selectedId
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={`ticket-card${selected ? ' selected' : ''}${t.state === 'resolved' ? ' resolved' : ''}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(t.id)}
                >
                  <span className="ticket-card-top">
                    <ReceiptLabel id={t.id} />
                    <span className="muted small">{TICKET_TYPE_LABELS[t.type] ?? t.type}</span>
                  </span>
                  <span className="ticket-title">{t.subject}</span>
                  <span className="ticket-desc">
                    {t.requester}
                    {note ? ` — ${truncate(note, 70)}` : ''}
                  </span>
                  <span className="ticket-card-bottom">
                    {t.running ? <StatusChip status="running" label="Team working…" /> : <StatusChip status={t.status} />}
                    {t.state === 'resolved' && <ResolvedStamp />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
