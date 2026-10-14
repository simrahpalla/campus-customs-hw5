// Polls the backend for everything the desk shows. Faster while agents are running.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api, errorMessage } from './api'
import type { ApprovalsResponse, AuditEvent, Cash, RunsResponse, TicketDetail, TicketsResponse } from './types'

export type Connection = 'connecting' | 'online' | 'offline'

const FAST_MS = 1500
const SLOW_MS = 4000

export function useDesk(selectedId: number | null) {
  const [connection, setConnection] = useState<Connection>('connecting')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [tickets, setTickets] = useState<TicketsResponse | null>(null)
  const [details, setDetails] = useState<Record<number, TicketDetail>>({})
  const [runs, setRuns] = useState<RunsResponse | null>(null)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [approvals, setApprovals] = useState<ApprovalsResponse | null>(null)
  const [cash, setCash] = useState<Cash | null>(null)
  const [cashError, setCashError] = useState<string | null>(null)

  const cursor = useRef(-1)
  const inFlight = useRef(false)
  const polls = useRef(0)
  const selectedRef = useRef(selectedId)
  const fast = useRef(false)
  selectedRef.current = selectedId

  const loadDetails = useCallback(async (ids: number[]) => {
    const results = await Promise.allSettled(ids.map((id) => api.ticket(id)))
    setDetails((prev) => {
      const next = { ...prev }
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') next[ids[i]] = r.value
      })
      return next
    })
  }, [])

  const again = useRef(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (inFlight.current) {
      again.current = true // a poll is running; do one more as soon as it finishes
      return
    }
    inFlight.current = true
    try {
      const [t, r, ev, ap, c] = await Promise.allSettled([
        api.tickets(),
        api.runs(),
        api.events(cursor.current),
        api.approvals(),
        api.cash(),
      ])

      if (t.status === 'rejected') {
        setConnection('offline')
        setConnectionError(errorMessage(t.reason))
        return
      }
      setConnection('online')
      setConnectionError(null)
      setTickets(t.value)
      if (r.status === 'fulfilled') setRuns(r.value)
      if (ap.status === 'fulfilled') setApprovals(ap.value)
      if (c.status === 'fulfilled') {
        setCash(c.value)
        setCashError(null)
      } else setCashError(errorMessage(c.reason))

      if (ev.status === 'fulfilled') {
        const res = ev.value
        if (res.next_after < cursor.current) {
          // The audit file got shorter (set aside as corrupt): start over.
          cursor.current = -1
          setEvents([])
        } else if (res.events.length) {
          setEvents((prev) => {
            const last = prev.length ? prev[prev.length - 1].index : -1
            return [...prev, ...res.events.filter((e) => e.index > last)]
          })
        }
        cursor.current = Math.max(cursor.current, res.next_after)
      }

      // Ticket details: the selected one every poll, all of them on the first poll and every few polls.
      const ids = t.value.tickets.map((x) => x.id)
      const sel = selectedRef.current
      await loadDetails(polls.current % 4 === 0 ? ids : sel != null ? [sel] : [])
      polls.current += 1
      fast.current = (r.status === 'fulfilled' && r.value.active.length > 0) || t.value.tickets.some((x) => x.running)
    } catch (e) {
      setConnection('offline')
      setConnectionError(e instanceof ApiError ? e.message : errorMessage(e))
    } finally {
      inFlight.current = false
      if (again.current) {
        again.current = false
        void refresh()
      }
    }
  }, [loadDetails])

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const loop = async () => {
      await refresh()
      if (!stopped) timer = setTimeout(loop, fast.current ? FAST_MS : SLOW_MS)
    }
    loop()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [refresh])

  // Load the newly selected ticket's details right away.
  useEffect(() => {
    if (selectedId != null) loadDetails([selectedId])
  }, [selectedId, loadDetails])

  return { connection, connectionError, tickets, details, runs, events, approvals, cash, cashError, refresh }
}
