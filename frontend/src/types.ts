// Mirrors the response models in backend/models.py.

export type AgentName = 'Boss' | 'Inventory' | 'Accounting' | 'Facilities' | 'Customer Service'

export type TicketStatus = 'open' | 'in_progress' | 'waiting_on_approval' | 'blocked' | 'resolved'

export interface Ticket {
  id: number
  type: string
  requester: string
  subject: string
  status: TicketStatus | string
  state: 'open' | 'resolved'
  created_at: string
  running: boolean
  active_run_id: string | null
}

export interface TicketsResponse {
  shop_date: string | null
  tickets: Ticket[]
}

export interface TicketDetail {
  found: boolean
  ticket: {
    id: number
    type: string
    requester: string
    subject: string
    sku: string | null
    size: string | null
    qty: number | null
    lease_id: number | null
    invoice_id: number | null
    status: string
    created_at: string
    requester_notes: string | null
  }
  activity: { agent: string; note: string; shop_date: string }[]
  message_drafts: { id: number; recipient: string; subject: string; body: string; author: string; status: string }[]
  payment_requests: {
    id: number
    kind: string
    ref_id: number
    amount: number
    status: string
    requested_by: string
    decided_by: string | null
  }[]
}

export interface TicketRunResult {
  run_id: string
  ticket_id: number | null
  stop_reason: string
  error: string | null
  model_requests: number
  total_tokens: number
  tool_calls: number
  delegations: number
  final: { status: string; summary: string } | null
}

export interface RunInfo {
  run_id: string
  ticket_id: number
  status: 'running' | 'completed' | 'stopped' | 'failed'
  started_at: string
  finished_at: string | null
  stop_reason: string | null
  error: string | null
  result: TicketRunResult | null
}

export interface RunsResponse {
  active: RunInfo[]
  recent: RunInfo[]
}

export type EventCategory = 'message' | 'delegation' | 'tool' | 'approval' | 'limit' | 'system'

export interface AuditEvent {
  index: number
  category: EventCategory
  timestamp: string
  run_id: string
  ticket_id?: number | null
  agent: string
  depth?: number
  step?: number | null
  action: string
  delegated_to?: string | null
  tool?: string | null
  args?: Record<string, unknown> | null
  result?: string | null
  error?: string | null
  approval_status?: string | null
  stop_reason?: string | null
}

export interface EventsResponse {
  events: AuditEvent[]
  next_after: number
  total: number
}

export interface Approval {
  request_id: number
  ticket_id: number | null
  ticket_subject: string | null
  kind: 'invoice' | 'rent' | 'purchase_order'
  payee: string | null
  amount: number
  account: string
  purpose: string | null
  requested_by: string
  requested_on: string
  status: 'pending' | 'approved' | 'rejected' | 'executed'
  ref_id: number
  sku: string | null
  size: string | null
  qty: number | null
  decided_by: string | null
  payment_id: number | null
}

export interface ApprovalsResponse {
  approvals: Approval[]
  pending_total: number
}

export interface ApprovalResult {
  request_id: number
  ticket_id: number | null
  status: 'executed' | 'rejected'
  decided_by: string
  payment_id: number | null
  amount: number | null
  new_balance: number | null
  details: Record<string, unknown>
}

export interface Cash {
  account: string
  balance: number
  as_of: string
  shop_date: string | null
  pending_requests_total: number
  balance_after_pending: number
}
