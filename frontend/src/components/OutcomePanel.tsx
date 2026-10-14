import type { AgentState } from '../feed'
import { fmtMoney } from '../format'
import type { Approval, Ticket, TicketDetail } from '../types'
import type { LastRun } from './TicketPanel'
import { AgentAvatar, AgentName, Card, Notice, ResolvedStamp, StatusChip } from './ui'

interface Props {
  ticket: Ticket
  detail: TicketDetail | undefined
  states: AgentState[]
  hasRun: boolean
  lastRun: LastRun | null
  requests: Approval[]
  readyToClose: boolean
}

export function OutcomePanel({ ticket, detail, states, hasRun, lastRun, requests, readyToClose }: Props) {
  const boss = states.find((s) => s.name === 'Boss')
  const decision = boss?.summaries.at(-1)
  const drafts = detail?.message_drafts ?? []

  return (
    <Card title={<>Outcome · <span className="muted">#{ticket.id}</span></>} className="outcome-card">
      <div className="outcome-status">
        <StatusChip status={ticket.running ? 'running' : ticket.status} label={ticket.running ? 'Team working…' : undefined} />
        {ticket.state === 'resolved' && <ResolvedStamp />}
      </div>

      {!hasRun && <p className="empty">The team hasn't worked this ticket yet.</p>}
      {lastRun?.ended && !lastRun.ok && (
        <Notice tone="red">Last run stopped: {lastRun.stopReason ?? 'error'}. The ticket was not resolved.</Notice>
      )}

      {hasRun && (
        <>
          <h3 className="sub-title">Boss's decision</h3>
          <p className="decision">{decision ?? (ticket.running ? 'Still working…' : 'No decision recorded in the last run.')}</p>
          {readyToClose && (
            <Notice tone="info">
              You've paid since this decision was made. Run the team again so the Boss can confirm the payment and mark the
              ticket resolved.
            </Notice>
          )}

          <h3 className="sub-title">What each agent did</h3>
          <ul className="agent-summary">
            {states.map((s) => (
              <li key={s.name}>
                <AgentAvatar name={s.name} size="sm" />
                <div>
                  <AgentName name={s.name} />
                  <p className={s.involved ? '' : 'muted'}>
                    {!s.involved
                      ? 'Not involved in this run.'
                      : s.summaries.length
                        ? s.summaries.at(-1)
                        : ticket.running
                          ? 'Working…'
                          : 'Started but did not report back.'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {requests.length > 0 && (
        <>
          <h3 className="sub-title">Payments for this ticket</h3>
          <ul className="history-list">
            {requests.map((r) => (
              <li key={r.request_id}>
                <span>#{r.request_id} · {r.payee} · {fmtMoney(r.amount)}</span>
                <StatusChip status={r.status} label={r.status === 'executed' ? 'Paid' : r.status === 'pending' ? 'Awaiting you' : r.status} />
              </li>
            ))}
          </ul>
        </>
      )}

      {drafts.length > 0 && (
        <>
          <h3 className="sub-title">Customer drafts <span className="muted small">(saved on the board, never sent)</span></h3>
          {drafts.map((d) => (
            <details key={d.id} className="draft">
              <summary>
                To {d.recipient}: <strong>{d.subject}</strong>
              </summary>
              <p className="pre-wrap">{d.body}</p>
            </details>
          ))}
        </>
      )}
    </Card>
  )
}
