import { fmtMoney } from '../format'
import type { Approval, ApprovalsResponse } from '../types'
import { AgentName, Card, Notice, StatusChip } from './ui'

export interface DecisionNotice {
  tone: 'green' | 'red'
  text: string
}

interface Props {
  approvals: ApprovalsResponse | null
  approver: string
  onApproverChange: (name: string) => void
  busy: Set<number>
  cardErrors: Record<number, string>
  notice: DecisionNotice | null
  online: boolean
  selectedTicketId: number | null
  onApprove: (a: Approval) => void
  onReject: (a: Approval) => void
}

const KIND_LABEL: Record<string, string> = { invoice: 'Vendor invoice', rent: 'Rent', purchase_order: 'Purchase order' }

export function ApprovalsPanel(p: Props) {
  const pending = p.approvals?.approvals.filter((a) => a.status === 'pending') ?? []
  const noName = !p.approver.trim()

  return (
    <Card
      title="Pending approvals"
      className="approvals-card"
      aside={pending.length > 0 && <span className="count-badge" aria-label={`${pending.length} pending`}>{pending.length}</span>}
    >
      <label className="approver">
        <span>Approving as</span>
        <input
          type="text"
          value={p.approver}
          placeholder="Your name"
          onChange={(e) => p.onApproverChange(e.target.value)}
          autoComplete="name"
        />
      </label>

      {p.notice && <Notice tone={p.notice.tone}>{p.notice.text}</Notice>}
      {!p.approvals && <p className="muted">Loading approvals…</p>}
      {p.approvals && pending.length === 0 && (
        <p className="empty">Nothing waiting for approval. Agents queue payments here; nothing is ever paid without your click.</p>
      )}

      <ul className="approval-list">
        {pending.map((a) => {
          const busy = p.busy.has(a.request_id)
          const verb = a.kind === 'purchase_order' ? 'purchase' : 'payment'
          return (
            <li key={a.request_id} className={`approval${a.ticket_id === p.selectedTicketId ? ' for-selected' : ''}`}>
              <div className="approval-head">
                <span className="approval-kind">{KIND_LABEL[a.kind] ?? a.kind}</span>
                <span className="muted small">Request #{a.request_id}</span>
              </div>
              <p className="approval-amount">{fmtMoney(a.amount)}</p>
              <dl className="approval-facts">
                <div><dt>Payee</dt><dd>{a.payee ?? 'Unknown payee'}</dd></div>
                <div><dt>Purpose</dt><dd>{a.purpose || '—'}</dd></div>
                <div>
                  <dt>Ticket</dt>
                  <dd>{a.ticket_id != null ? `#${a.ticket_id}${a.ticket_subject ? ` · ${a.ticket_subject}` : ''}` : '—'}</dd>
                </div>
                {a.kind === 'purchase_order' && a.sku && (
                  <div><dt>Order</dt><dd>{a.qty} × {a.sku} {a.size}</dd></div>
                )}
                <div><dt>Requested by</dt><dd><AgentName name={a.requested_by} /> · {a.requested_on}</dd></div>
              </dl>
              <hr className="dashed" />
              {p.cardErrors[a.request_id] && <Notice tone="red">{p.cardErrors[a.request_id]}</Notice>}
              <div className="approval-actions">
                <button
                  type="button"
                  className="btn btn-approve"
                  disabled={busy || noName || !p.online}
                  aria-busy={busy}
                  onClick={() => p.onApprove(a)}
                >
                  {busy ? <><span className="spinner" aria-hidden="true" /> Working…</> : `Approve ${fmtMoney(a.amount)} ${verb}`}
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy || noName || !p.online} onClick={() => p.onReject(a)}>
                  Reject
                </button>
              </div>
              {noName && <p className="muted small">Enter your name above to approve or reject.</p>}
            </li>
          )
        })}
      </ul>

      {p.approvals && p.approvals.approvals.some((a) => a.status !== 'pending') && (
        <details className="tech history">
          <summary>Decided requests</summary>
          <ul className="history-list">
            {p.approvals.approvals
              .filter((a) => a.status !== 'pending')
              .map((a) => (
                <li key={a.request_id}>
                  <span>#{a.request_id} · {a.payee} · {fmtMoney(a.amount)}</span>
                  <StatusChip status={a.status} label={a.status === 'executed' ? 'Paid' : a.status} />
                </li>
              ))}
          </ul>
        </details>
      )}
    </Card>
  )
}
