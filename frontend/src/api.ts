// Thin client for the FastAPI backend (backend/main.py). No API keys live here.
import type {
  ApprovalResult,
  ApprovalsResponse,
  Cash,
  EventsResponse,
  RunInfo,
  RunsResponse,
  TicketDetail,
  TicketsResponse,
} from './types'

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, `Can't reach the backend at ${API_BASE}.`)
  }
  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
      else if (Array.isArray(body.detail)) detail = body.detail.map((d: { msg?: string }) => d.msg).join('; ')
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  tickets: () => request<TicketsResponse>('/api/tickets'),
  ticket: (id: number) => request<TicketDetail>(`/api/tickets/${id}`),
  runTicket: (id: number) => request<RunInfo>(`/api/tickets/${id}/run`, { method: 'POST' }),
  runs: () => request<RunsResponse>('/api/runs'),
  events: (after: number, limit = 1000) => request<EventsResponse>(`/api/events?after=${after}&limit=${limit}`),
  approvals: () => request<ApprovalsResponse>('/api/approvals?status=all'),
  approve: (id: number, approver: string, note = '') =>
    request<ApprovalResult>(`/api/approvals/${id}/approve`, { method: 'POST', body: JSON.stringify({ approver, note }) }),
  reject: (id: number, approver: string, note = '') =>
    request<ApprovalResult>(`/api/approvals/${id}/reject`, { method: 'POST', body: JSON.stringify({ approver, note }) }),
  cash: () => request<Cash>('/api/cash'),
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
