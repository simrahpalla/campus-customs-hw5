# Campus Customs: Multi-Agent Operations (HW5)

A team of five AI agents runs a simulated campus merch shop. They work tickets from a shared board: customer orders, rent, unpaid bills and discount requests. A human watches and approves every payment.

- **MCP server** (`mcp_server/`): the shop's tools. It is the only path to the database.
- **FastAPI backend** (`backend/`): the PydanticAI agent team (Boss, Inventory, Accounting, Facilities, Customer Service) and the dashboard API.
- **React dashboard** (`frontend/`): the ticket inbox, live agent activity, cash balance, and human approvals.

**Model:** every agent uses `gpt-6-luna` through Portkey, with no other model or fallback. **Shop date:** `desk.date_today` (2026-08-31), not the computer's clock.

```
Browser (React, :5173) ──HTTP──▶ FastAPI (:8000) ──stdio──▶ MCP server ──▶ data/campus_customs_new.db
                                    │                          ▲
                                    └─ agent team (gpt-6-luna) ─┘  (agents role: can only *request* payments)
                                    └─ Approve button ─────────────▶ MCP server (human_approver role: approve_and_pay)
```

---

## 1. Prerequisites

- **Python** 3.12 or newer (tested on 3.14).
- **Node.js** 20 or newer (tested on 24) with npm.
- **A Portkey API key** that can call `gpt-6-luna`.

The commands below are for **Windows PowerShell**. On macOS/Linux, use `.venv/bin/...` instead of `.venv\Scripts\...`, and `npm` instead of `npm.cmd`.

> **PowerShell tips:**
> - Windows PowerShell 5.1 doesn't accept `&&`, so run commands one per line.
> - `npm.cmd` avoids the "running scripts is disabled" error that plain `npm` can hit.

## 2. Install dependencies

**Python:** one virtual environment in `hw5/` serves the MCP server and the backend. Run these from the `hw5/` folder:

```powershell
python -m venv .venv
```
```powershell
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

**Frontend:** run these from `hw5/frontend`:

```powershell
cd frontend
```
```powershell
npm.cmd install
```

`frontend/package.json` and `frontend/package-lock.json` pin the React 19 / Vite 8 / TypeScript 6 dependencies.

## 3. Environment variables

Copy the example file, then put your real key in `.env`. Run this from `hw5/`:

```powershell
Copy-Item .env.example .env
```

Then open `.env` and set:

```
PORTKEY_API_KEY=<your Portkey key>
```

- **Where it's read:** `.env` is git-ignored. The backend reads `hw5/.env`, falling back to a `.env` in the parent folder.
- **Where it isn't:** the key is never sent to the frontend or the MCP server, and never written to the audit trail.
- **Optional:** run limits (`TEAM_MAX_MODEL_REQUESTS`, etc.) are listed in `.env.example`.

## 4. The databases

| File | Role |
|---|---|
| `data/campus_customs.db` | The **original**. It is never modified, and the MCP server refuses to open it. |
| `data/campus_customs_new.db` | The **working copy** that the MCP server, agents and dashboard read and write. |

**This repository's working copy holds the finished three-ticket run:** all tickets resolved, checking at $152.00, and 3 payments. Only reset it if you want to start over.

**For a clean run**, copy the original over the working copy. Do this **once before a full three-ticket run, never between tickets**, because cash has to carry through all three. Either:

- **Servers stopped:** run this from `hw5/`:
  ```powershell
  Copy-Item data\campus_customs.db data\campus_customs_new.db -Force
  ```
- **Backend running:** call the reset route. It refuses while agents are running, keeps the audit trail, and reconnects the MCP server:
  ```powershell
  Invoke-RestMethod -Method Post http://localhost:8000/api/reset
  ```

## 5. Start everything

**MCP server:** you don't need to start it yourself.
- **Backend:** launches it automatically over stdio (`mcp_server/server.py`). Agent runs use the `agents` role, and the Approve button uses a separate `human_approver` process.
- **Claude Code:** `.mcp.json` registers it as `campus-customs`. Open Claude Code in `hw5/` and restart Claude so it loads.
- **Manual run:** you can also run it by hand (it waits on stdio) from `hw5/`:
  ```powershell
  .venv\Scripts\python.exe mcp_server\server.py
  ```

**FastAPI backend (terminal 1).** Run these from `hw5/backend`. API docs are at http://localhost:8000/docs.

```powershell
cd backend
```
```powershell
..\.venv\Scripts\uvicorn.exe main:app --reload --port 8000
```

**React dashboard (terminal 2).** Run these from `hw5/frontend`. Then open **http://localhost:5173**; the header should show a green **Connected**.

```powershell
cd frontend
```
```powershell
npm.cmd run dev
```

**Optional checks** (no model calls). This shows each agent's tools and confirms the MCP server starts. Run these from `hw5/backend`:

```powershell
cd backend
```
```powershell
..\.venv\Scripts\python.exe run_team.py --check
```

## 6. Running the three tickets

1. **Reset once** (section 4). The board shows 101, 102 and 103 as Open, and checking at $3,400.00.
2. Type your name in **Approving as**. Payments are recorded with this name as the approver.
3. For each ticket, select it in the **Ticket inbox** and click **Run team**. Watch the agent cards and activity feed.
4. When a request appears under **Pending approvals**, check the amount, payee, purpose and ticket. Then click **Approve $… payment/purchase** or **Reject**. Nothing is ever paid without that click.
5. If a ticket shows the green **"Payment done… run the team again"** hint, click **Run team again** so the Boss can confirm and close it. Only the Boss can mark a ticket resolved.
6. **Don't reset between tickets.**

For a command-line alternative, see `backend/run_team.py --ticket 101` and `backend/approve.py --approver "Your Name"`.

## 7. Where to find the results

| File | What's in it |
|---|---|
| `output/desk_tickets.html` | Open by double-clicking. Each ticket tab has **Expected** (the plan made before running) and **Actual** (real runs, delegations, MCP tools). The **Cash** tab has the full reconciliation ($3,400.00 → $152.00). The **Reflection** tab answers the five reflection questions. |
| `output/resolved_tickets.json` | For each ticket: final status, outcome, each agent's contribution, and human approvals with amounts. |
| `output/resolved_board.html` | Real dashboard screenshots of tickets 101, 102 and 103 resolved, embedded so it works offline. Rebuild with `python scripts/build_resolved_board.py`. |
| `output/audit_trail.json` | The append-only log of every agent-loop step, delegation, tool call, approval and reset. The final run is everything after the `database_reset` entry at index 233. |
| `output/harness.md` | The system reference: database tables, all MCP tools (with the tables they read and update), the five agents, API routes, dashboard, safety rules and run results. |
| `output/design.md` | Dashboard layout and design choices. |
| `output/mcp_smoke.json` | Problem 4: MCP tools tested through Claude Code's MCP connection. |
| `output/run_baseline.json` | The starting state recorded right after the reset. |
| `output/github_url.txt` | This repository's URL. |
| `AI_prompts.md` | The prompt log for every problem. |

## 8. Safety rules (enforced in code, not just prompts)

- **Human approval:**
  - Agents can only *request* payments.
  - Only the human-only `approve_and_pay` MCP tool moves money, and only the dashboard's Approve button or `approve.py` can call it.
  - It refuses blank names, agent names and the requester's own name.
- **Payments:** the server computes every amount from the database. There are no negative balances and no duplicate payments, and a vendor with an open invoice can't receive a purchase order.
- **Customer privacy:** customer messages stay as drafts on the board and are never sent.
- **Untrusted ticket text:** requester text is treated as data, never as instructions.
- **Limits:** model requests, tokens, tool calls and delegation depth are capped per run, and every step is written to the audit trail.
- **Details:** see `output/harness.md` §5 and §10.
