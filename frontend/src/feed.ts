// Turns raw audit-trail events into a readable activity feed, agent card states and summaries.
import { AGENTS, TOOL_LABELS, truncate } from './format'
import type { AgentName, AuditEvent } from './types'

export type FeedItem =
  | { kind: 'run'; key: string; time: string; title: string; tone: 'neutral' | 'green' | 'red' | 'amber'; detail?: string; raw?: unknown }
  | { kind: 'task'; key: string; time: string; agent: string; instruction: string }
  | { kind: 'message'; key: string; time: string; agent: string; text: string; raw?: unknown }
  | { kind: 'handoff'; key: string; time: string; from: string; to: string; instruction: string; context?: string }
  | { kind: 'reply'; key: string; time: string; from: string; to: string; status: string; text: string; approval?: string | null }
  | { kind: 'refused'; key: string; time: string; from: string; to: string; reason: string }
  | {
      kind: 'tool'
      key: string
      time: string
      agent: string
      tool: string
      label: string
      args?: unknown
      result?: string | null
      retry?: string | null
      approval?: string | null
    }
  | { kind: 'done'; key: string; time: string; agent: string; status: string; summary: string }
  | { kind: 'alert'; key: string; time: string; agent: string; text: string; reason?: string | null }
  | { kind: 'decision'; key: string; time: string; who: string; ok: boolean; text: string; raw?: unknown }

const TOOL_CALLS_ONLY = /^\d+ tool call\(s\)$/

/** "status: summary" -> [status, summary] (the backend writes agent results this way). */
export function splitStatus(result: string | null | undefined): [string, string] {
  const text = result ?? ''
  const m = text.match(/^(done|waiting_on_approval|blocked|needs_info|failed):\s*(.*)$/s)
  return m ? [m[1], m[2]] : ['done', text]
}

function modelText(result: string | null | undefined): string | null {
  if (!result) return null
  const text = result.split(' | tokens in/out ')[0].trim()
  return text && !TOOL_CALLS_ONLY.test(text) ? text : null
}

function argString(args: Record<string, unknown> | null | undefined, key: string): string {
  const v = args?.[key]
  return typeof v === 'string' ? v : ''
}

export function buildFeed(events: AuditEvent[]): FeedItem[] {
  const items: FeedItem[] = []
  const openTools = new Map<string, Extract<FeedItem, { kind: 'tool' }>[]>()

  for (const e of events) {
    const key = String(e.index)
    const t = e.timestamp
    switch (e.action) {
      case 'run_start':
        items.push({ kind: 'run', key, time: t, title: `Run ${e.run_id} started`, tone: 'neutral', raw: e.args })
        break
      case 'run_end': {
        const ok = e.stop_reason === 'completed'
        items.push({
          kind: 'run', key, time: t, tone: ok ? 'green' : 'red',
          title: ok ? 'Run finished' : `Run stopped: ${e.stop_reason}`,
          detail: e.error ?? undefined, raw: e.result,
        })
        break
      }
      case 'run_failed':
        items.push({ kind: 'run', key, time: t, tone: 'red', title: 'Run failed to start', detail: e.error ?? undefined })
        break
      case 'agent_start':
        // A delegated agent's task is already shown on the hand-off card.
        if (argString(e.args, 'from_agent') === 'human') {
          items.push({ kind: 'task', key, time: t, agent: e.agent, instruction: argString(e.args, 'instruction') })
        }
        break
      case 'model_response': {
        const text = modelText(e.result)
        if (text) items.push({ kind: 'message', key, time: t, agent: e.agent, text, raw: e.result })
        break
      }
      case 'tool_call': {
        const item: Extract<FeedItem, { kind: 'tool' }> = {
          kind: 'tool', key, time: t, agent: e.agent, tool: e.tool ?? '?',
          label: TOOL_LABELS[e.tool ?? ''] ?? `Used ${e.tool}`, args: e.args,
        }
        items.push(item)
        const k = `${e.run_id}|${e.agent}|${e.tool}`
        openTools.set(k, [...(openTools.get(k) ?? []), item])
        break
      }
      case 'tool_result':
      case 'tool_retry': {
        const k = `${e.run_id}|${e.agent}|${e.tool}`
        const queue = openTools.get(k)
        const item = queue?.shift()
        if (item) {
          if (e.action === 'tool_result') {
            item.result = e.result
            item.approval = e.approval_status
          } else item.retry = e.error
        }
        break
      }
      case 'delegation':
        items.push({
          kind: 'handoff', key, time: t, from: e.agent, to: e.delegated_to ?? '?',
          instruction: argString(e.args, 'instruction'), context: argString(e.args, 'context') || undefined,
        })
        break
      case 'delegation_result': {
        const [status, text] = splitStatus(e.result)
        items.push({ kind: 'reply', key, time: t, from: e.delegated_to ?? '?', to: e.agent, status, text, approval: e.approval_status })
        break
      }
      case 'delegation_refused':
        items.push({ kind: 'refused', key, time: t, from: e.agent, to: e.delegated_to ?? '?', reason: e.error ?? 'refused' })
        break
      case 'agent_end': {
        const [status, summary] = splitStatus(e.result)
        items.push({ kind: 'done', key, time: t, agent: e.agent, status, summary })
        break
      }
      case 'limit_reached':
      case 'agent_stopped': {
        // The backend logs limit_reached and then agent_stopped for the same agent: show it once.
        const prev = items[items.length - 1]
        if (prev?.kind === 'alert' && prev.agent === e.agent && prev.reason === e.stop_reason) break
        items.push({ kind: 'alert', key, time: t, agent: e.agent, text: e.error ?? 'Stopped', reason: e.stop_reason })
        break
      }
      case 'human_decision': {
        const ok = e.approval_status === 'executed' || e.approval_status === 'rejected'
        const id = (e.args as { request_id?: number } | null)?.request_id
        const who = e.agent.replace(/^human:/, '')
        let text = ''
        try {
          const out = JSON.parse(e.result ?? '{}')
          text = !ok
            ? out.message ?? 'Decision refused'
            : e.approval_status === 'executed'
              ? `Approved and paid request #${id}: $${Number(out.amount).toFixed(2)}. Checking now $${Number(out.new_balance).toFixed(2)}.`
              : `Rejected request #${id}.`
        } catch {
          text = e.result ?? ''
        }
        items.push({ kind: 'decision', key, time: t, who, ok, text, raw: e.result })
        break
      }
      default:
        break // loop_start, model_request, final_output, loop_end: internal steps, not shown
    }
  }
  return items
}

// --------------------------------------------------------------------------- agent cards + summaries

export type AgentPhase = 'idle' | 'working' | 'waiting' | 'done' | 'awaiting' | 'blocked' | 'needs_info' | 'failed' | 'stopped'

export interface AgentState {
  name: AgentName
  involved: boolean
  phase: AgentPhase
  statusText: string
  latest: string
  summaries: string[]
  endStatus?: string
}

const END_PHASE: Record<string, AgentPhase> = {
  done: 'done',
  waiting_on_approval: 'awaiting',
  blocked: 'blocked',
  needs_info: 'needs_info',
  failed: 'failed',
}

const PHASE_TEXT: Record<AgentPhase, string> = {
  idle: 'Idle',
  working: 'Working…',
  waiting: 'Waiting',
  done: 'Done',
  awaiting: 'Awaiting approval',
  blocked: 'Blocked',
  needs_info: 'Needs info',
  failed: 'Failed',
  stopped: 'Stopped',
}

/** The run_id of the most recent run in these (single-ticket) events, if any. */
export function latestRunId(events: AuditEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].action === 'run_start') return events[i].run_id
  return null
}

export function agentStates(events: AuditEvent[], runId: string | null, runActive: boolean): AgentState[] {
  const states = new Map<string, AgentState>(
    AGENTS.map((a) => [a.name, { name: a.name, involved: false, phase: 'idle', statusText: PHASE_TEXT.idle, latest: '', summaries: [] }]),
  )
  if (!runId) return [...states.values()]
  let ended = false

  for (const e of events) {
    if (e.run_id !== runId) continue
    if (e.action === 'run_end' || e.action === 'run_failed') ended = true
    const s = states.get(e.agent)
    if (!s) continue
    switch (e.action) {
      case 'agent_start':
        s.involved = true
        s.phase = 'working'
        s.latest = `Picked up: ${truncate(argString(e.args, 'instruction'), 90)}`
        break
      case 'tool_call':
        s.latest = TOOL_LABELS[e.tool ?? ''] ?? `Used ${e.tool}`
        break
      case 'model_response': {
        const text = modelText(e.result)
        if (text) s.latest = `“${truncate(text, 90)}”`
        break
      }
      case 'delegation':
        s.phase = 'waiting'
        s.statusText = `Waiting on ${e.delegated_to}`
        s.latest = `Asked ${e.delegated_to}: ${truncate(argString(e.args, 'instruction'), 80)}`
        break
      case 'delegation_result':
        s.phase = 'working'
        s.latest = `Heard back from ${e.delegated_to}`
        break
      case 'delegation_refused':
        s.latest = `Couldn't hand off to ${e.delegated_to}`
        break
      case 'agent_end': {
        const [status, summary] = splitStatus(e.result)
        s.phase = END_PHASE[status] ?? 'done'
        s.endStatus = status
        s.latest = truncate(summary, 110)
        s.summaries.push(summary)
        break
      }
      case 'agent_stopped':
      case 'limit_reached':
        s.phase = 'stopped'
        s.latest = e.error ?? 'Stopped by a run limit'
        break
    }
    if (s.phase !== 'waiting') s.statusText = PHASE_TEXT[s.phase]
  }

  // A run that ended (or the server forgot) while an agent was mid-task: show it as stopped.
  for (const s of states.values()) {
    if ((s.phase === 'working' || s.phase === 'waiting') && (ended || !runActive)) {
      s.phase = 'stopped'
      s.statusText = PHASE_TEXT.stopped
    }
  }
  return [...states.values()]
}
