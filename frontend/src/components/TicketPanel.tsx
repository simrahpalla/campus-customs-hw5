import { TICKET_TYPE_LABELS, fmtDateTime, fmtMoney, fmtTime } from '../format'
import type { Approval, Ticket, TicketDetail } from '../types'
import { Notice, ReceiptLabel, ResolvedStamp, StatusChip } from './ui'

export interface LastRun {
  runId: string
  ended: boolean
  ok: boolean
  stopReason: string | null
  error: string | null
  time: string | null
}

interface Props {
  ticket: Ticket
  detail: TicketDetail | undefined
  online: boolean
  starting: boolean
  runError: string | null
  lastRun: LastRun | null
  /** Set when the ticket still says "awaiting approval" but its payments are already paid. */
  paidRequests: Approval[] | null
  onRun: () => void
}

export function TicketPanel({ ticket, detail, online, starting, runError, lastRun, paidRequests, onRun }: Props) {
  const d = detail?.ticket
  const resolved = ticket.state === 'resolved'
  const disabled = !online || starting || ticket.running || resolved
  const buttonLabel = ticket.running
    ? 'Team is working…'
    : starting
      ? 'Starting…'
      : resolved
        ? 'Resolved'
        : paidRequests
          ? 'Run team again'
          : 'Run team'

  return (
    <section className="card ticket-panel" aria-labelledby="ticket-title">
      <div className="ticket-panel-head">
        <div>
          <div className="ticket-panel-labels">
            <ReceiptLabel id={ticket.id} />
            <span className="muted small">{TICKET_TYPE_LABELS[ticket.type] ?? ticket.type}</span>
          </div>
          <h2 className="ticket-panel-title" id="ticket-title">{ticket.subject}</h2>
          <div className="ticket-panel-status">
            {ticket.running ? <StatusChip status="running" label="Team working…" /> : <StatusChip status={ticket.status} />}
            {resolved && <ResolvedStamp />}
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-run" onClick={onRun} disabled={disabled} aria-busy={starting || ticket.running}>
          {(starting || ticket.running) && <span className="spinner" aria-hidden="true" />}
          {buttonLabel}
        </button>
      </div>

      <dl className="facts">
        <div><dt>Requester</dt><dd>{ticket.requester}</dd></div>
        <div><dt>Received</dt><dd>{fmtDateTime(ticket.created_at)}</dd></div>
        {d?.sku && (
          <div><dt>Item</dt><dd><code>{d.sku}</code> · size {d.size} · qty {d.qty}</dd></div>
        )}
        {d?.lease_id != null && <div><dt>Lease</dt><dd>#{d.lease_id}</dd></div>}
        {d?.invoice_id != null && <div><dt>Linked invoice</dt><dd>#{d.invoice_id}</dd></div>}
      </dl>

      {d?.requester_notes && (
        <blockquote className="requester-note">
          <span className="requester-note-label">From the requester</span>
          {d.requester_notes}
        </blockquote>
      )}

      {runError && <Notice tone="red">Couldn't start the team: {runError}</Notice>}
      {!online && <Notice tone="amber">The backend is offline, so the team can't be started right now.</Notice>}
      {ticket.running && <Notice tone="info">The agents are working on this ticket. Activity below updates every couple of seconds.</Notice>}
      {!ticket.running && lastRun?.ended && !lastRun.ok && (
        <Notice tone="red">
          The last run stopped early ({lastRun.stopReason ?? 'error'}){lastRun.error ? `: ${lastRun.error}` : '.'} You can run the team again.
        </Notice>
      )}
      {paidRequests && (
        <Notice tone="green">
          <strong>Payment done:</strong>{' '}
          {paidRequests.map((r) => `${fmtMoney(r.amount)} to ${r.payee}`).join(', ')}. The ticket still says “Awaiting
          approval” because only the Boss can change its status. <strong>Run the team again</strong> so the Boss can confirm
          the payment and close the ticket.
        </Notice>
      )}
      {!ticket.running && lastRun?.ended && lastRun.ok && !resolved && !paidRequests && (
        <p className="muted small">
          Last run finished{lastRun.time ? ` at ${fmtTime(lastRun.time)}` : ''}. The ticket stays open until the Boss confirms it resolved
          {ticket.status === 'waiting_on_approval' ? ' — it is waiting for your approval.' : '.'}
        </p>
      )}
    </section>
  )
}
