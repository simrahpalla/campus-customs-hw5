"""Build output/resolved_board.html from real dashboard screenshots.

Put one screenshot per ticket in output/screenshots/ named ticket-101.png, ticket-102.png and
ticket-103.png (.png, .webp, .jpg or .jpeg, preferred in that order). Then run from hw5/:
    python scripts/build_resolved_board.py

Images are embedded as base64, so the page opens by double-clicking with no servers running.
A missing screenshot is reported on the page and in the console; nothing is substituted.
"""

import base64
import html
import json
from pathlib import Path

HW = Path(__file__).resolve().parent.parent
OUT = HW / "output"
SHOTS = OUT / "screenshots"
MIME = {".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}

tickets = {t["ticket_id"]: t for t in json.loads((OUT / "resolved_tickets.json").read_text(encoding="utf-8"))["tickets"]}


def find_shot(ticket_id: int) -> Path | None:
    for ext in (".png", ".webp", ".jpg", ".jpeg"):
        p = SHOTS / f"ticket-{ticket_id}{ext}"
        if p.exists():
            return p
    return None


sections, missing = [], []
for tid in (101, 102, 103):
    t = tickets[tid]
    shot = find_shot(tid)
    if shot:
        data = base64.b64encode(shot.read_bytes()).decode()
        figure = (f'<img src="data:{MIME[shot.suffix.lower()]};base64,{data}" '
                  f'alt="Campus Customs dashboard with ticket {tid} selected, showing it resolved">'
                  f'<figcaption>Actual screenshot of the React dashboard (<code>{html.escape(shot.name)}</code>), '
                  f'ticket {tid} selected after it was resolved.</figcaption>')
    else:
        missing.append(tid)
        figure = (f'<div class="missing">Screenshot not captured yet. Save it as '
                  f'<code>output/screenshots/ticket-{tid}.png</code> and rebuild.</div>')
    approvals = "".join(
        f"<li>Request #{a['request_id']}: {html.escape(a['what'])}, <strong>${a['amount']:,.2f}</strong> to "
        f"{html.escape(a['payee'])}, approved by {html.escape(a['approved_by'])}</li>"
        for a in t["human_approvals"]
    ) or "<li>None. This ticket had no cash impact.</li>"
    sections.append(f"""
  <section class="ticket" id="t{tid}">
    <h2><span class="receipt">No. {tid}</span> {html.escape(t['subject'])} <span class="stamp">✓ {html.escape(t['final_status'].title())}</span></h2>
    <p class="outcome">{html.escape(t['outcome'])}</p>
    <figure>{figure}</figure>
    <h3>Human approvals</h3>
    <ul>{approvals}</ul>
    <p class="cash">Cash change for this ticket: <strong>{'−' if t['cash_change'] < 0 else ''}${abs(t['cash_change']):,.2f}</strong></p>
  </section>""")

summary = json.loads((OUT / "resolved_tickets.json").read_text(encoding="utf-8"))
page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Campus Customs: Resolved Board</title>
<style>
  :root {{ --ivory:#faf6ee; --ink:#14213d; --muted:#5d6576; --line:#e6dfd1; --yale:#00356b; --green:#3d7a56; --green-soft:#e7f1ea; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; background:var(--ivory); color:var(--ink); font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }}
  header {{ background:#fff; border-bottom:1px solid var(--line); padding:18px 28px; }}
  header h1 {{ margin:0; font:700 1.5rem/1.2 Georgia,serif; }}
  header p {{ margin:4px 0 0; color:var(--muted); }}
  nav {{ display:flex; gap:10px; padding:12px 28px; flex-wrap:wrap; }}
  nav a {{ color:var(--yale); font-weight:600; text-decoration:none; border:1px solid var(--line); background:#fff; padding:5px 12px; border-radius:999px; }}
  main {{ max-width:1200px; margin:0 auto; padding:8px 28px 48px; }}
  .totals {{ background:#fff; border:1px solid var(--line); border-radius:14px; padding:14px 18px; margin:8px 0 22px; }}
  .ticket {{ background:#fff; border:1px solid var(--line); border-radius:14px; padding:20px 22px; margin-bottom:26px; box-shadow:0 1px 2px rgba(20,33,61,.05),0 4px 14px rgba(20,33,61,.05); }}
  h2 {{ margin:0 0 6px; font:700 1.3rem/1.3 Georgia,serif; display:flex; flex-wrap:wrap; align-items:center; gap:10px; }}
  h3 {{ font-size:.8rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:16px 0 4px; }}
  .receipt {{ font:700 .85rem ui-monospace,Consolas,monospace; border:1px dashed #b9ae99; background:var(--ivory); padding:2px 9px; border-radius:3px; }}
  .stamp {{ font:700 .72rem/1.4 system-ui,sans-serif; text-transform:uppercase; letter-spacing:.1em; color:var(--green); border:2px solid var(--green); border-radius:5px; padding:1px 8px; transform:rotate(-5deg); background:var(--green-soft); }}
  .outcome {{ margin:4px 0 12px; }}
  figure {{ margin:0; }}
  figure img {{ display:block; width:100%; height:auto; border:1px solid var(--line); border-radius:10px; }}
  figcaption {{ color:var(--muted); font-size:.85rem; margin-top:6px; }}
  .missing {{ border:2px dashed #d9a441; background:#fdf4e2; color:#7a4c12; border-radius:10px; padding:28px; text-align:center; }}
  .cash {{ margin:10px 0 0; }}
  code {{ font-family:ui-monospace,Consolas,monospace; font-size:.9em; }}
</style>
</head>
<body>
<header>
  <h1>Campus Customs · Resolved Board</h1>
  <p>Actual screenshots of the React Operations Desk after tickets 101, 102 and 103 were resolved (Problem 9). Images are embedded, so no servers are needed.</p>
</header>
<nav><a href="#t101">Ticket 101</a><a href="#t102">Ticket 102</a><a href="#t103">Ticket 103</a></nav>
<main>
  <div class="totals">Checking: <strong>${summary['starting_checking_balance']:,.2f}</strong> at the start → <strong>${summary['ending_checking_balance']:,.2f}</strong> at the end. {html.escape(summary['cash_reconciled'])}.</div>
  {''.join(sections)}
</main>
</body>
</html>
"""
(OUT / "resolved_board.html").write_text(page, encoding="utf-8")
print("wrote output/resolved_board.html")
print("missing screenshots:", missing or "none")
