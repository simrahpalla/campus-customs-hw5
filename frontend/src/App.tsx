import { useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE, api, errorMessage } from './api'
import { ActivityFeed } from './components/ActivityFeed'
import { AgentCards } from './components/AgentCards'
import { type DecisionNotice, ApprovalsPanel } from './components/ApprovalsPanel'
import { CashCard } from './components/CashCard'
import { Header } from './components/Header'
import { OutcomePanel } from './components/OutcomePanel'
import { TicketInbox } from './components/TicketInbox'
import { type LastRun, TicketPanel } from './components/TicketPanel'
import { Card } from './components/ui'
import { agentStates, buildFeed, latestRunId } from './feed'
import { fmtMoney } from './format'
import type { Approval } from './types'
import { useDesk } from './useDesk'

const stored = (k: string) => localStorage.getItem(k) ?? ''

export default function App() {
  const [selectedId, setSelectedId] = useState<number | null>(() => Number(stored('cc.selected')) || null)
  const desk = useDesk(selectedId)
  const tickets = desk.tickets?.tickets ?? null
  const online = desk.connection === 'online'

  // Default to the first ticket; persist the choice.
  useEffect(() => {
    if (tickets?.length && !tickets.some((t) => t.id === selectedId)) setSelectedId(tickets[0].id)
  }, [tickets, selectedId])
  useEffect(() => {
    if (selectedId != null) localStorage.setItem('cc.selected', String(selectedId))
  }, [selectedId])

  const ticket = tickets?.find((t) => t.id === selectedId) ?? null
  const ticketEvents = useMemo(() => desk.events.filter((e) => e.ticket_id === selectedId), [desk.events, selectedId])
  const runId = latestRunId(ticketEvents)
  const states = useMemo(() => agentStates(ticketEvents, runId, !!ticket?.running), [ticketEvents, runId, ticket?.running])
  const feed = useMemo(() => buildFeed(ticketEvents), [ticketEvents])

  const lastRun: LastRun | null = useMemo(() => {
    if (!runId) return null
    const end = ticketEvents.findLast((e) => e.run_id === runId && (e.action === 'run_end' || e.action === 'run_failed'))
    return {
      runId,
      ended: !!end,
      ok: end?.stop_reason === 'completed',
      stopReason: end?.stop_reason ?? null,
      error: end?.error ?? null,
      time: end?.timestamp ?? null,
    }
  }, [ticketEvents, runId])

  // ----- Run team (one click at a time)
  const [starting, setStarting] = useState<number | null>(null)
  const [runErrors, setRunErrors] = useState<Record<number, string | null>>({})
  const runTeam = async (id: number) => {
    if (starting != null) return
    setStarting(id)
    setRunErrors((e) => ({ ...e, [id]: null }))
    try {
      await api.runTicket(id)
      await desk.refresh()
    } catch (e) {
      setRunErrors((r) => ({ ...r, [id]: errorMessage(e) }))
    } finally {
      setStarting(null)
    }
  }

  // ----- Approvals (never automatic; one request in flight at a time per card)
  const [approver, setApprover] = useState(() => stored('cc.approver'))
  const busyRef = useRef(new Set<number>())
  const [busy, setBusy] = useState(new Set<number>())
  const [cardErrors, setCardErrors] = useState<Record<number, string>>({})
  const [notice, setNotice] = useState<DecisionNotice | null>(null)
  const [cashFlash, setCashFlash] = useState(false)

  const changeApprover = (name: string) => {
    setApprover(name)
    localStorage.setItem('cc.approver', name)
  }

  const decide = async (a: Approval, action: 'approve' | 'reject') => {
    const id = a.request_id
    if (busyRef.current.has(id) || !approver.trim()) return
    busyRef.current.add(id)
    setBusy(new Set(busyRef.current))
    setCardErrors(({ [id]: _drop, ...rest }) => rest)
    setNotice(null)
    try {
      if (action === 'approve') {
        const r = await api.approve(id, approver.trim())
        setNotice({
          tone: 'green',
          text: `Paid ${fmtMoney(r.amount)} to ${a.payee} for ticket #${a.ticket_id}. Checking balance is now ${fmtMoney(r.new_balance)}.`,
        })
        setCashFlash(true)
        setTimeout(() => setCashFlash(false), 1600)
      } else {
        await api.reject(id, approver.trim())
        setNotice({ tone: 'green', text: `Rejected request #${id} (${fmtMoney(a.amount)} to ${a.payee}). No money moved.` })
      }
    } catch (e) {
      setCardErrors((c) => ({ ...c, [id]: `${action === 'approve' ? 'Approval' : 'Rejection'} failed: ${errorMessage(e)}` }))
    } finally {
      busyRef.current.delete(id)
      setBusy(new Set(busyRef.current))
      await desk.refresh()
    }
  }

  const ticketRequests = (desk.approvals?.approvals ?? []).filter((a) => a.ticket_id === selectedId)
  // The Boss set "waiting_on_approval", but you've since decided every request and paid at least one.
  // Only the Boss can change ticket status, so the ticket needs another run to be closed.
  const paidRequests = ticketRequests.filter((r) => r.status === 'executed')
  const readyToClose =
    !!ticket &&
    !ticket.running &&
    ticket.status === 'waiting_on_approval' &&
    paidRequests.length > 0 &&
    ticketRequests.every((r) => r.status !== 'pending')

  return (
    <div className="app">
      <Header connection={desk.connection} shopDate={desk.tickets?.shop_date ?? null} />

      {desk.connection === 'offline' && (
        <div className="offline-banner" role="alert">
          <strong>Can't reach the backend at {API_BASE}.</strong> Start it from <code>backend/</code> with{' '}
          <code>uvicorn main:app --reload --port 8000</code>. Retrying automatically…
          {desk.connectionError && !desk.connectionError.startsWith("Can't reach") && (
            <span className="muted small"> ({desk.connectionError})</span>
          )}
        </div>
      )}

      <main className="desk">
        <div className="col-inbox">
          <TicketInbox
            tickets={tickets}
            details={desk.details}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={desk.connection === 'connecting'}
          />
        </div>

        <div className="col-main">
          {!ticket ? (
            <Card>
              <p className="empty">{desk.connection === 'connecting' ? 'Loading the desk…' : 'Select a ticket from the inbox.'}</p>
            </Card>
          ) : (
            <>
              <TicketPanel
                ticket={ticket}
                detail={desk.details[ticket.id]}
                online={online}
                starting={starting === ticket.id}
                runError={runErrors[ticket.id] ?? null}
                lastRun={lastRun}
                paidRequests={readyToClose ? paidRequests : null}
                onRun={() => runTeam(ticket.id)}
              />
              <section className="card team" aria-labelledby="team-title">
                <header className="card-head">
                  <h2 className="card-title" id="team-title">The team</h2>
                  {runId && <span className="muted small">Latest run <code>{runId}</code></span>}
                </header>
                <AgentCards states={states} hasRun={!!runId} />
                <h3 className="sub-title feed-title">Activity · ticket #{ticket.id}</h3>
                <ActivityFeed key={ticket.id} items={feed} running={ticket.running} />
              </section>
            </>
          )}
        </div>

        <aside className="col-side" aria-label="Cash, approvals and outcome">
          <CashCard cash={desk.cash} error={desk.cashError} flash={cashFlash} />
          <ApprovalsPanel
            approvals={desk.approvals}
            approver={approver}
            onApproverChange={changeApprover}
            busy={busy}
            cardErrors={cardErrors}
            notice={notice}
            online={online}
            selectedTicketId={selectedId}
            onApprove={(a) => decide(a, 'approve')}
            onReject={(a) => decide(a, 'reject')}
          />
          {ticket && (
            <OutcomePanel
              ticket={ticket}
              detail={desk.details[ticket.id]}
              states={states}
              hasRun={!!runId}
              lastRun={lastRun}
              requests={ticketRequests}
              readyToClose={readyToClose}
            />
          )}
        </aside>
      </main>
    </div>
  )
}
