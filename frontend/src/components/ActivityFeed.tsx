import { useLayoutEffect, useRef, useState } from 'react'
import type { FeedItem } from '../feed'
import { fmtTime, prettyJson } from '../format'
import { AgentAvatar, AgentName, Details, StatusChip } from './ui'

/** Chronological feed. Sticks to the newest item only while you're already at the bottom. */
export function ActivityFeed({ items, running }: { items: FeedItem[]; running: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const seen = useRef(items.length)
  const [unseen, setUnseen] = useState(0)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const added = items.length - seen.current
    seen.current = items.length
    if (added <= 0) return
    if (atBottom.current) el.scrollTop = el.scrollHeight
    else setUnseen((n) => n + added)
  }, [items.length])

  useLayoutEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight // start at the newest
  }, [])

  const onScroll = () => {
    const el = box.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (atBottom.current) setUnseen(0)
  }

  const jump = () => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' })
    setUnseen(0)
  }

  return (
    <div className="feed-wrap">
      <div className="feed" ref={box} onScroll={onScroll} aria-live="polite" aria-busy={running}>
        {items.length === 0 ? (
          <p className="empty">No activity yet. Press <strong>Run team</strong> to put the agents to work on this ticket.</p>
        ) : (
          <ol className="feed-list">
            {items.map((it) => (
              <FeedRow key={it.key} item={it} />
            ))}
          </ol>
        )}
        {running && (
          <p className="feed-typing">
            <span className="pulse" aria-hidden="true" /> Agents are working…
          </p>
        )}
      </div>
      {unseen > 0 && (
        <button type="button" className="btn btn-small feed-new" onClick={jump}>
          {unseen} new ↓
        </button>
      )}
    </div>
  )
}

function Time({ iso }: { iso: string }) {
  return <time className="feed-time" dateTime={iso}>{fmtTime(iso)}</time>
}

function FeedRow({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case 'run':
      return (
        <li className={`feed-run tone-${item.tone}`}>
          <span>{item.title}</span> <Time iso={item.time} />
          {item.detail && <div className="feed-run-detail">{item.detail}</div>}
          {item.raw != null && (
            <Details summary="Run details">
              <pre>{prettyJson(item.raw)}</pre>
            </Details>
          )}
        </li>
      )
    case 'task':
      return (
        <li className="feed-item">
          <AgentAvatar name={item.agent} size="sm" />
          <div className="feed-body">
            <div className="feed-meta"><AgentName name={item.agent} /> picked up the ticket from the desk <Time iso={item.time} /></div>
            <p className="feed-text muted">{item.instruction}</p>
          </div>
        </li>
      )
    case 'message':
      return (
        <li className="feed-item">
          <AgentAvatar name={item.agent} size="sm" />
          <div className="feed-body">
            <div className="feed-meta"><AgentName name={item.agent} /> <Time iso={item.time} /></div>
            <p className="feed-bubble">{item.text}</p>
          </div>
        </li>
      )
    case 'handoff':
      return (
        <li className="feed-item feed-handoff">
          <AgentAvatar name={item.from} size="sm" />
          <div className="feed-body">
            <div className="feed-meta">
              <span className="handoff">
                <AgentName name={item.from} /> <span className="arrow" aria-label="hands off to">→</span> <AgentName name={item.to} />
              </span>
              <Time iso={item.time} />
            </div>
            <p className="feed-text"><span className="muted">Asks:</span> {item.instruction}</p>
            {item.context && (
              <Details summary="Context passed along">
                <p className="pre-wrap">{item.context}</p>
              </Details>
            )}
          </div>
        </li>
      )
    case 'reply':
      return (
        <li className="feed-item feed-reply">
          <AgentAvatar name={item.from} size="sm" />
          <div className="feed-body">
            <div className="feed-meta">
              <span className="handoff">
                <AgentName name={item.from} /> <span className="arrow" aria-label="replies to">↩</span> <AgentName name={item.to} />
              </span>
              <StatusChip status={item.status} />
              <Time iso={item.time} />
            </div>
            <p className="feed-text">{item.text}</p>
          </div>
        </li>
      )
    case 'refused':
      return (
        <li className="feed-item feed-warn">
          <AgentAvatar name={item.from} size="sm" />
          <div className="feed-body">
            <div className="feed-meta"><AgentName name={item.from} /> couldn't hand off to <AgentName name={item.to} /> <Time iso={item.time} /></div>
            <p className="feed-text">{item.reason}</p>
          </div>
        </li>
      )
    case 'tool':
      return (
        <li className="feed-item feed-tool">
          <AgentAvatar name={item.agent} size="sm" />
          <div className="feed-body">
            <div className="feed-meta">
              <AgentName name={item.agent} /> <span>{item.label}</span>
              <code className="tool-name">{item.tool}</code>
              {item.approval && <StatusChip status={item.approval} label={item.approval === 'pending' ? 'Sent for approval' : item.approval} />}
              {item.retry && <StatusChip status="failed" label="Retried" />}
              <Time iso={item.time} />
            </div>
            <Details summary="Show arguments & result">
              <div className="tech-label">Arguments</div>
              <pre>{prettyJson(item.args ?? {})}</pre>
              <div className="tech-label">Result</div>
              <pre>{item.retry ? `Error: ${item.retry}` : item.result != null ? prettyJson(item.result) : 'Waiting for result…'}</pre>
            </Details>
          </div>
        </li>
      )
    case 'done':
      return (
        <li className="feed-item feed-done">
          <AgentAvatar name={item.agent} size="sm" />
          <div className="feed-body">
            <div className="feed-meta"><AgentName name={item.agent} /> finished <StatusChip status={item.status} /> <Time iso={item.time} /></div>
            <p className="feed-text">{item.summary}</p>
          </div>
        </li>
      )
    case 'alert':
      return (
        <li className="feed-item feed-alert">
          <AgentAvatar name={item.agent} size="sm" />
          <div className="feed-body">
            <div className="feed-meta"><AgentName name={item.agent} /> stopped <StatusChip status="failed" label={item.reason ?? 'limit'} /> <Time iso={item.time} /></div>
            <p className="feed-text">{item.text}</p>
          </div>
        </li>
      )
    case 'decision':
      return (
        <li className={`feed-item feed-decision ${item.ok ? 'ok' : 'bad'}`}>
          <AgentAvatar name="human" size="sm" />
          <div className="feed-body">
            <div className="feed-meta"><strong>{item.who}</strong> (human) <Time iso={item.time} /></div>
            <p className="feed-text">{item.text}</p>
          </div>
        </li>
      )
  }
}
