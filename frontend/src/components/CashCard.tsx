import { fmtMoney } from '../format'
import type { Cash } from '../types'
import { Card, Notice } from './ui'

export function CashCard({ cash, error, flash }: { cash: Cash | null; error: string | null; flash: boolean }) {
  return (
    <Card title="Checking balance" className="cash-card">
      {!cash && !error && <p className="muted">Loading balance…</p>}
      {!cash && error && <Notice tone="red">Couldn't load the balance: {error}</Notice>}
      {cash && (
        <>
          <p className={`balance${flash ? ' balance-flash' : ''}`} aria-live="polite">{fmtMoney(cash.balance)}</p>
          <p className="muted small">
            {cash.account} · as of {cash.as_of}
          </p>
          {cash.pending_requests_total > 0 ? (
            <dl className="cash-lines">
              <div><dt>Awaiting approval</dt><dd>− {fmtMoney(cash.pending_requests_total)}</dd></div>
              <div className={cash.balance_after_pending < 0 ? 'neg' : ''}>
                <dt>If all approved</dt><dd>{fmtMoney(cash.balance_after_pending)}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted small">No payments waiting. Cash only goes out in this shop.</p>
          )}
        </>
      )}
    </Card>
  )
}
