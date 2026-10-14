// Agent identities, labels and small formatting helpers shared by the components.
import type { AgentName } from './types'

export interface AgentIdentity {
  name: AgentName
  initials: string
  color: string
  role: string
}

export const AGENTS: AgentIdentity[] = [
  { name: 'Boss', initials: 'BO', color: 'var(--agent-boss)', role: 'Assigns work, decides' },
  { name: 'Inventory', initials: 'IN', color: 'var(--agent-inventory)', role: 'Stock & vendors' },
  { name: 'Accounting', initials: 'AC', color: 'var(--agent-accounting)', role: 'Cash & payments' },
  { name: 'Facilities', initials: 'FA', color: 'var(--agent-facilities)', role: 'Lease & rent' },
  { name: 'Customer Service', initials: 'CS', color: 'var(--agent-cs)', role: 'Customer drafts' },
]

export const AGENT_BY_NAME = Object.fromEntries(AGENTS.map((a) => [a.name, a])) as Record<string, AgentIdentity>

export const TOOL_LABELS: Record<string, string> = {
  get_shop_date: 'Checked the shop date',
  list_tickets: 'Looked over the ticket board',
  get_ticket: 'Read the ticket',
  check_stock_and_pricing: 'Checked stock & pricing',
  check_discount_margin: 'Checked a discount margin',
  check_vendor_status: 'Checked vendor status',
  get_invoice: 'Looked up an invoice',
  check_rent_due: 'Checked rent due',
  get_cash_position: 'Checked the cash position',
  list_payment_requests: 'Reviewed payment requests',
  add_ticket_note: 'Added a note to the ticket',
  update_ticket_status: 'Updated the ticket status',
  draft_customer_message: 'Drafted a customer message',
  request_payment: 'Requested a payment for approval',
}

export const TICKET_TYPE_LABELS: Record<string, string> = {
  customer_order: 'Customer order',
  rent_notice: 'Rent notice',
  price_override: 'Discount request',
}

export const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_on_approval: 'Awaiting approval',
  blocked: 'Blocked',
  resolved: 'Resolved',
}

export function statusTone(status: string): 'neutral' | 'info' | 'amber' | 'red' | 'green' {
  switch (status) {
    case 'resolved':
    case 'done':
    case 'completed':
    case 'executed':
      return 'green'
    case 'waiting_on_approval':
    case 'pending':
      return 'amber'
    case 'blocked':
    case 'failed':
    case 'stopped':
    case 'needs_info':
    case 'rejected':
      return 'red'
    case 'in_progress':
    case 'running':
      return 'info'
    default:
      return 'neutral'
  }
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const fmtMoney = (n: number | null | undefined) => (n == null ? '—' : money.format(n))

export function fmtTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

/** Pretty-print a tool result string from the audit trail (JSON when possible). */
export function prettyJson(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
}
