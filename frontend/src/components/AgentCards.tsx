import type { CSSProperties } from 'react'
import { AGENT_BY_NAME } from '../format'
import type { AgentState } from '../feed'
import { AgentAvatar } from './ui'

const PHASE_TONE: Record<string, string> = {
  idle: 'neutral',
  working: 'info',
  waiting: 'info',
  done: 'green',
  awaiting: 'amber',
  blocked: 'red',
  needs_info: 'red',
  failed: 'red',
  stopped: 'red',
}

export function AgentCards({ states, hasRun }: { states: AgentState[]; hasRun: boolean }) {
  return (
    <ul className="agent-cards" aria-label="Agents">
      {states.map((s) => {
        const a = AGENT_BY_NAME[s.name]
        return (
          <li key={s.name} className={`agent-card phase-${s.phase}`} style={{ '--agent': a.color } as CSSProperties}>
            <div className="agent-card-head">
              <AgentAvatar name={s.name} />
              <div>
                <div className="agent-card-name">{s.name}</div>
                <div className="agent-card-role">{a.role}</div>
              </div>
            </div>
            <div className={`agent-status tone-${PHASE_TONE[s.phase]}`}>
              {(s.phase === 'working' || s.phase === 'waiting') && <span className="pulse" aria-hidden="true" />}
              {s.statusText}
            </div>
            <p className="agent-latest">{s.latest || (hasRun ? 'Not involved in this run.' : 'Waiting for a run.')}</p>
          </li>
        )
      })}
    </ul>
  )
}
