# Campus Customs Multi-Agent Operations: System Harness

A team of five AI agents (Boss, Inventory, Accounting, Facilities, Customer Service) runs a simulated campus shop by working tickets from a shared board. An **MCP server** exposes the shop's tools, a **FastAPI** backend runs the agents, and a **React** dashboard lets a human watch progress and approve payments.

---

## 1. Data

- **Original:** `data/campus_customs.db`. This is read-only and is never modified.
- **Working copy:** `data/campus_customs_new.db`. The MCP server and backend read and write only this file. Reset it from the original before each full ticket-resolution run.
- **Shop date:** `desk.date_today` = **2026-08-31**. Use this for every "today" and overdue check, never the computer's clock.

### Tables and fields

| Table | Fields | Why it matters to the agents |
|---|---|---|
| `desk` | `date_today`, `notes` | Gives every agent the shop's "today" for due-date and overdue checks. |
| `tickets` | `id`, `type`, `requester`, `subject`, `sku`, `size`, `qty`, `lease_id`, `invoice_id`, `status`, `notes`, `created_at` | The shared work board: the Boss reads it to assign work, and its foreign keys point agents to the relevant inventory, lease or invoice. |
| `inventory` | `sku`, `name`, `size`, `qty`, `location` (PK = `sku` + `size`) | Inventory checks stock per SKU and size to find shortages before an order is promised. |
| `pricing` | `sku`, `unit_cost`, `list_price` | Accounting uses cost against price to check margins on discounts and to price restock purchase orders. |
| `vendors` | `id`, `name`, `specialty`, `lead_days` | Inventory picks the right vendor for a restock, and `lead_days` is the only source of delivery times. |
| `invoices` | `id`, `vendor_id`, `amount`, `due_date`, `status`, `description` | Accounting tracks unpaid bills, and an `open` invoice blocks that vendor from shipping new product. |
| `leases` | `id`, `space_name`, `landlord`, `monthly_rent`, `next_due`, `notes` | Facilities uses it to see what rent is owed, to whom, and when. |
| `cash_accounts` | `name`, `balance`, `date` | Accounting checks this before any payment; the balance can never go negative. |
| `payments` | `id`, `kind`, `ref_id`, `amount`, `account`, `paid_at`, `approved_by` | An audit log of executed payments. Each row records the human who approved it. Starts empty. |

### Starting data (original database)

- **Inventory:**
  - `CC-HOOD-NAVY` hoodie: S 4, M 8, L 14, XL 6
  - `CC-TEE-WHITE` tee: S **0**, M 5, L 3, XL 2
  - `CC-HAT-BLUE` cap: OS 40
  - `CC-MUG-CREST` mug: OS **0**
- **Pricing (cost → list):**
  - Hoodie $22 → $58
  - Tee $8 → $28
  - Cap $6 → $22
  - Mug $3.50 → $14
- **Vendors:**
  - 1 Bulldog Print Co (apparel reprint, 5 days)
  - 2 Elm City Gifts (mugs and small goods, 3 days)
  - 3 QuickShip CT (local courier, 1 day)
- **Invoices:** #501 from Bulldog Print Co, $840, due 2026-08-28, `open` ("Rush reprint CC-TEE-WHITE S"). This is **overdue** as of the shop date.
- **Leases:** #1 Chapel Street shop, landlord Elm City Properties, $2,400/month, next due 2026-09-02.
- **Cash:** `checking` $3,400.
- **Payments:** none.

### The three open tickets and how they link

| Ticket | Type | Request | Linked rows | What the agents will find |
|---|---|---|---|---|
| **101** | `customer_order` | Tauhid Zaman wants 1 `CC-TEE-WHITE` in size S | `inventory` (CC-TEE-WHITE, S), `invoice_id` → #501 → vendor 1 | S is out of stock (qty 0). The apparel vendor, Bulldog Print Co, has an overdue open invoice for $840, so it can't ship a reprint until that's paid. After payment, delivery takes 5 days. |
| **102** | `rent_notice` | Elm City Properties: rent due in 2 days | `lease_id` → lease #1 | $2,400 due 2026-09-02, which is 2 days after the shop date. Paying it is Facilities' job, and it needs Accounting's cash check and human approval. |
| **103** | `price_override` | Yale AI Club wants 20 `CC-HOOD-NAVY` in size M at a bulk discount | `inventory` (CC-HOOD-NAVY, M), `pricing` (CC-HOOD-NAVY) | Only 8 M are in stock, so the order is 12 short. At $22 cost and $58 list, the discount must keep a positive margin. The restock vendor is again Bulldog Print Co, which is blocked by invoice #501. |

### Cross-ticket tension

- The tickets compete for $3,400 in cash, and no revenue is modelled.
- Rent ($2,400) plus invoice #501 ($840) comes to $3,240, which leaves **$160**.
- Restocking the 12 missing hoodies at cost would be 12 × $22 = $264, which is more than $160.
- So the agents can't pay for everything. The Boss has to prioritise, and every payment still needs human approval.

---

## 2. MCP server (`mcp_server/`)

- **Code:** FastMCP server in `mcp_server/server.py` (`FastMCP("campus-customs")`), with its own venv and `requirements.txt` (`fastmcp`).
- **Database:** it points at `data/campus_customs_new.db`, which it opens with SQLite `mode=ro`, so the tools can't write.
- **Shop date:** every date check uses `desk.date_today`.
- **Missing data:** a missing SKU, size, vendor or lease returns `{"found": false, "message": ...}`. Tools never invent values.
- **Status:** connected to Claude Code and smoke-tested (see "Claude Code connection" below).

### Tools

#### `check_stock_and_pricing(sku, size=None)`
- **What it does:** returns the on-hand quantity and location for each size of a SKU, plus its unit cost, list price and per-unit margin.
- **Reads:** `inventory`, `pricing`
- **Unlocks:** 101, 103
- **How it helps:**
  - **101:** it shows that `CC-TEE-WHITE` size S has 0 on hand, so Tauhid's tee can't ship from stock and needs a restock.
  - **103:** it shows that only 8 of the 20 size-M hoodies the Yale AI Club wants are in stock. The $22 cost against the $58 list price ($36 margin) sets the lowest discount price that still makes money.

#### `check_vendor_status(vendor_id=None)`
- **What it does:** lists vendors with their specialty and `lead_days`. It also shows each vendor's open invoices with days overdue, and `can_ship_new_orders`, which is false while any invoice is open.
- **Reads:** `vendors`, `invoices`, `desk`
- **Unlocks:** 101, 103
- **How it helps:**
  - **101:** it shows that the apparel vendor, Bulldog Print Co, is blocked by invoice #501 ($840, 3 days overdue). That invoice must be paid before the size S tee can be reprinted, and delivery then takes 5 days.
  - **103:** it shows that the same block stops the 12-hoodie restock, so any promise to the club depends on clearing #501 first.

#### `check_rent_due(lease_id)`
- **What it does:** returns the lease's landlord, rent amount and due date, the days until it's due by shop date, and the cash account balances, including whether any account covers the rent.
- **Reads:** `leases`, `desk`, `cash_accounts`
- **Unlocks:** 102
- **How it helps:** it confirms that Elm City Properties' $2,400 rent for the Chapel Street shop is due 2026-09-02, 2 days after the shop date. Checking holds $3,400, so the rent is payable, but it would leave only $1,000 for invoice #501.

### Claude Code connection (Problem 4)

- **Config:** `.mcp.json` at the Claude Code project root (`AI Foundations/`). The entry is called `campus-customs` and sits alongside the existing `outlook` server.

  ```json
  "campus-customs": {
    "command": "C:/Users/simra/OneDrive/Desktop/Yale Fall 2026/AI Foundations/hw5/mcp_server/.venv/Scripts/python.exe",
    "args": ["C:/Users/simra/OneDrive/Desktop/Yale Fall 2026/AI Foundations/hw5/mcp_server/server.py"]
  }
  ```

- **How it runs:**
  - Claude Code launches `server.py` over stdio using the server's own venv.
  - The tools appear as `mcp__campus-customs__<tool>`.
  - `server.py` builds its database path from its own location, so it always opens `hw5/data/campus_customs_new.db`, whatever the working directory.
- **Loading:** the server loads only when a session starts, so after editing `.mcp.json`, fully restart Claude.
- **Smoke test:** the evidence is in `output/mcp_smoke.json`.
  - Four MCP calls cover tickets 101, 102 and 103. Every output matched an independent SQL query on the working copy.
  - Both database files kept identical MD5 hashes afterwards.

---

## 3. MCP tools: full list (Problem 5)

- **Only path to the database:** the MCP server is how agents read or change the shop. Agents never import `sqlite3` or open the database.
- **Working copy only:** the server works on `data/campus_customs_new.db`. It refuses to start if pointed at the original.
- **Board tables:** on startup it adds three tables to the working copy only. Resetting from the original removes them, and they're recreated on the next start.
  - `ticket_activity`: work notes for each ticket.
  - `message_drafts`: customer replies, saved as drafts and never sent.
  - `payment_requests`: the approval queue.
- **Two roles:** the `CAMPUS_CUSTOMS_ROLE` environment variable picks the role.
  - `agents` is the default, used by the team and by Claude Code.
  - `human_approver` adds the two approval tools. It's used only by the backend's Approve and Reject routes and by `backend/approve.py` (changed in Problem 7).

| Tool | Reads | Updates | Role | Used by |
|---|---|---|---|---|
| `get_shop_date` | `desk` | none | agents | all |
| `list_tickets` | `tickets` | none | agents | all |
| `get_ticket` | `tickets`, `ticket_activity`, `message_drafts`, `payment_requests` | none | agents | all |
| `check_stock_and_pricing` | `inventory`, `pricing` | none | agents | Boss, Inventory, Accounting, Customer Service |
| `check_discount_margin` | `pricing` | none | agents | Accounting |
| `check_vendor_status` | `vendors`, `invoices`, `desk` | none | agents | Boss, Inventory, Accounting |
| `get_invoice` | `invoices`, `vendors`, `payment_requests`, `desk` | none | agents | Accounting |
| `check_rent_due` | `leases`, `desk`, `cash_accounts` | none | agents | Boss, Facilities |
| `get_cash_position` | `cash_accounts`, `invoices`, `payment_requests`, `payments`, `desk` | none | agents | Boss, Accounting, Facilities |
| `list_payment_requests` | `payment_requests`, `leases`, `invoices`, `vendors`, `tickets` (payee and ticket subject, added in Problem 7) | none | agents | Boss, Accounting, Facilities, backend |
| `add_ticket_note` | `tickets`, `desk` | `ticket_activity` | agents | all |
| `update_ticket_status` | `tickets`, `desk` | `tickets.status`, `ticket_activity` | agents | Boss (only Boss can set `resolved`) |
| `draft_customer_message` | `tickets`, `desk` | `message_drafts`, `ticket_activity` | agents | Customer Service |
| `request_payment` | `tickets`, `cash_accounts`, `invoices`, `leases`, `vendors`, `inventory`, `pricing`, `payment_requests`, `desk` | `payment_requests` (status `pending`), `ticket_activity` | agents | Accounting |
| `approve_and_pay` | `payment_requests`, `cash_accounts`, `invoices`, `leases`, `vendors`, `desk` | `cash_accounts.balance`/`date`, `payments` (new row), `invoices` (see below), `leases.next_due`, `payment_requests` (status `executed`, `decided_by`, `payment_id`), `ticket_activity` | **human_approver only** | backend Approve route, `approve.py` |
| `reject_payment_request` | `payment_requests`, `desk` | `payment_requests` (status `rejected`), `ticket_activity` | **human_approver only** | backend Reject route, `approve.py` |

**Changed in Problem 7:**
- The agents' `execute_payment` tool and the separate `approve_payment_request` tool were replaced by `approve_and_pay`. It approves and pays in a single transaction.
- If any check fails, nothing changes and the request stays `pending`.
- No agent has a tool that moves money.

**`approve_and_pay` updates by payment kind:**
- **Invoice:** sets `invoices.status = 'paid'`.
- **Rent:** moves `leases.next_due` forward one month.
- **Purchase order:** inserts a `paid` row in `invoices` with an ETA of shop date + `vendors.lead_days`. Stock doesn't arrive during the run.

**`request_payment` rules:** the server always calculates the amount itself from the database. It never accepts an amount from an agent.
- **Invoice:** `invoices.amount`.
- **Rent:** `leases.monthly_rent`. It can only be requested within 14 days of `next_due`, so the next month's rent can't be paid twice.
- **Purchase order:** `qty × pricing.unit_cost`. It's refused while the vendor has an open invoice.
- **All kinds:** refused if it duplicates a pending, approved or executed request, or if the account doesn't have enough cash.

---

## 4. Agent team (`backend/`)

- **Framework:** PydanticAI 2.56.
- **Model:** every agent uses `gpt-6-luna` through Portkey (`https://api.portkey.ai/v1`, `PORTKEY_API_KEY` from the root `.env`). No other model or fallback is configured.
- **Prompts:** one file per agent in `backend/prompts/`.

| Agent | Role | MCP tools |
|---|---|---|
| **Boss** (`boss.md`) | Reads tickets, assigns work, weighs cash across tickets, makes the final decision, sets ticket status (the only agent that can resolve). | read tools, `update_ticket_status`, `add_ticket_note` |
| **Inventory** (`inventory.md`) | Checks stock by SKU and size, works out shortfalls (101: tee S; 103: 12 hoodies M short), and matches vendors, lead times and shipping blocks. | `check_stock_and_pricing`, `check_vendor_status`, common tools |
| **Accounting** (`accounting.md`) | Tracks cash and invoice 501, checks discount margins (103), and queues invoice, rent and purchase-order payments for human approval. It cannot pay anything; only a human Approve click does. | cash, invoice, margin and payment tools |
| **Facilities** (`facilities.md`) | Checks lease 1 against the rent notice (102), confirms the amount and due date, and gets rent queued through Accounting. | `check_rent_due`, `get_cash_position`, `list_payment_requests`, common tools |
| **Customer Service** (`customer_service.md`) | Drafts replies to the ticket's requester (101 Tauhid Zaman, 103 Yale AI Club). Drafts are saved on the board and never sent. | `draft_customer_message`, `check_stock_and_pricing`, common tools |

The common tools are `get_shop_date`, `list_tickets`, `get_ticket` and `add_ticket_note`.

**Code**
- `models.py`: data types.
  - `TaskRequest`: the work handed to an agent.
  - `DelegationRequest` and `DelegationResult`: what goes into and comes back from a delegation.
  - `AgentReport`: each agent's structured output.
  - `AgentResult`: an `AgentReport` stamped with the agent's name and stop reason.
  - `PaymentRequestRef`, `TicketRunResult` and `AuditEntry`.
- `agents.py`: the agents themselves.
  - `CampusTeam` owns one MCP connection shared by all agents. Each agent gets a filtered view of the tools plus the shared `delegate` tool.
  - `run_agent()` drives each loop node by node with `Agent.iter()` and writes every node to the audit trail.
  - `run_ticket()` starts Boss on a ticket.
- `audit.py`: the audit trail writer.
- `config.py`: paths, model and limits.
- `run_team.py`: command-line runner.
- `approve.py`: human approval command-line tool.

**Delegation:** any agent can call `delegate(to_agent, instruction, context)` to run any other agent (not itself) and get back its `AgentResult`. Chains can go in any direction, e.g. Inventory → Accounting → Facilities.

**Run usage:** one usage counter is shared by every loop in a ticket run, so the limits apply to the whole team, not to each agent separately.

**Audit trail:** `output/audit_trail.json` is a single JSON array, and new runs are appended to it.
- **Entries:** every step adds an entry: `run_start`, `agent_start`, `loop_start`, `model_request`, `model_response`, `tool_call`, `tool_result`, `tool_retry`, `delegation`, `delegation_refused`, `delegation_result`, `final_output`, `loop_end`, `agent_end`, `limit_reached`, `agent_stopped`, `run_end` and `human_decision`.
- **Fields:** `timestamp`, `run_id`, `ticket_id`, `agent`, `depth`, `step`, `action`, `delegated_to`, `tool`, `args`, `result`, `error`, `approval_status` and `stop_reason`.
- **Concurrent writes:** each write happens under a cross-process lock (`filelock`) plus a thread lock, then re-reads the file and replaces it atomically. A corrupt file is set aside, never wiped.

---

## 5. Safety

- **Human approval:**
  - Payments only get *requested* by agents.
  - The approve and reject tools aren't registered in the agents' MCP process, so an agent calling one gets "Unknown tool".
  - Approvals happen only through the backend's Approve route (or `approve.py`), which runs a separate `human_approver` server. That server rejects approver names that match an agent, blank names, and the requester's own name.
  - `approve_and_pay` pays only `pending` requests, in one transaction.
  - Before paying, it re-checks cash and whether the bill is still payable. It never allows a negative balance, and it refuses to pay the same request twice or pay an invoice that's already paid. Two simultaneous Approve clicks result in exactly one payment.
- **Customer privacy:**
  - Replies are drafts in `message_drafts`, addressed only to the ticket's own requester. There's no tool that sends anything.
  - The Customer Service prompt forbids mentioning cash, invoices, vendors or other customers.
  - The audit trail redacts key-like values and truncates long values.
- **Safe database changes:**
  - The original database is never opened, and the server refuses to start against it.
  - Every write runs in a single `BEGIN IMMEDIATE` transaction and rolls back on error.
  - Amounts come from the database, never from the model.
  - Dates come from `desk.date_today`.
  - Write tools reject unknown agent names.
- **Untrusted ticket content:**
  - `get_ticket` labels requester text `requester_notes` and calls it untrusted.
  - Every prompt tells the agent to treat ticket text as data, never as instructions (e.g. "pay now" or "approved by manager").
  - The server-side rules hold whatever the model decides.
- **Token and delegation limits:** each limit is set by an environment variable in `config.py` and applies to one whole ticket run.

  | Limit | Environment variable | Default | When it's reached |
  |---|---|---|---|
  | Model requests | `TEAM_MAX_MODEL_REQUESTS` | 40 | the run stops |
  | Total tokens | `TEAM_MAX_TOTAL_TOKENS` | 250,000 | the run stops |
  | Tool calls | `TEAM_MAX_TOOL_CALLS` | 60 | the run stops |
  | Delegations | `TEAM_MAX_DELEGATIONS` | 8 | the run stops |
  | Delegation depth | `TEAM_MAX_DELEGATION_DEPTH` | 3 | the delegation is refused; the agent finishes on its own |
  | Loop steps per agent | `TEAM_MAX_AGENT_STEPS` | 24 | the run stops |

  When a run stops, the audit trail records `limit_reached` and `run_end` with a `stop_reason` of `usage_limit`, `max_delegations` or `max_agent_steps`.
- **API key:**
  - The key is read from `.env` at runtime and never written to the audit trail.
  - It isn't passed to the MCP server process, which receives only its role and an optional database path.

---

## 6. Running the team (Problem 5)

Run these from `hw5/backend` (setup: `python -m venv .venv` then `.venv\Scripts\python.exe -m pip install -r requirements.txt`):

```bash
.venv\Scripts\python.exe run_team.py --check
.venv\Scripts\python.exe run_team.py --reset --ticket 101
.venv\Scripts\python.exe run_team.py --reset --all-open
.venv\Scripts\python.exe approve.py --list
.venv\Scripts\python.exe approve.py --approver "Your Name"
```

- `--check` makes no model calls. It shows each agent's tools and the model being used.
- `--reset` starts from a fresh working copy, then Boss works the ticket(s).
- `approve.py` lets a human approve (which pays immediately) or reject pending payments. Since Problem 7, the same thing happens with `POST /api/approvals/{id}/approve`. Rerun a ticket **without** `--reset` afterwards so the Boss sees the payment. `--reset` would wipe the approval queue.

---

## 7. Backend routes (Problem 7, `backend/main.py`)

**Start:** run `uvicorn main:app --reload --port 8000` from inside `backend/` (venv active). Interactive docs are at `http://localhost:8000/docs`.

- `GET /api/health`: confirms the backend is up and the MCP connection answers (shop date, model, working database name).
- `GET /api/tickets`: tickets 101–103, each with its raw status, `state` (`open`/`resolved`) and whether agents are running on it.
- `GET /api/tickets/{ticket_id}`: one ticket with its board activity, message drafts and payment requests (404 if unknown).
- `POST /api/tickets/{ticket_id}/run`: starts the agent team on the ticket in the background and returns 202 with a `run_id`. It returns 404 for an unknown ticket, and 409 if the ticket is already running, already resolved, or a reset is in progress.
- `GET /api/runs`: runs in progress plus the 20 most recent finished runs, with their results.
- `GET /api/runs/{run_id}`: the status and result of one run.
- `GET /api/events?after=&ticket_id=&run_id=&limit=`: recent audit-trail events (agent messages, delegations, tool calls and results, approvals, limits), each with an `index` and a `category`. Pass `next_after` back as `after` to poll for new events only.
- `GET /api/approvals?status=pending|executed|rejected|all`: payment and purchase requests with request ID, ticket, payee, amount, purpose, requester and status, plus `pending_total`.
- `POST /api/approvals/{request_id}/approve` (body `{"approver": "...", "note": "..."}`): the human Approve button. It calls `approve_and_pay`, which changes cash and updates `payments` and the invoice, lease or PO records. It returns 400 for an agent or invalid approver, 404 for an unknown request, and 409 if the request is already paid or not pending, or cash is insufficient.
- `POST /api/approvals/{request_id}/reject` (same body): the human Reject button. No money moves.
- `GET /api/cash`: the checking balance from `cash_accounts`, the pending-request total, and the balance left after pending requests.
- `POST /api/reset`: copies the untouched original over `data/campus_customs_new.db`, which clears approvals, notes and drafts, and clears finished-run state. The audit trail is kept and a `database_reset` entry is added. It returns 409 while agents are running or an approval is in progress.

**How it works:**
- **Two MCP roles:**
  - Agent runs each use their own `agents`-role MCP process. They can only request payments.
  - The backend's "desk" connection uses the `human_approver` role. Only the Approve and Reject routes call its decision tools.
- **Background loop:** on Windows, `uvicorn --reload` uses an event loop that can't start subprocesses, and the MCP stdio servers are subprocesses. So all MCP and agent work runs on a private event loop in a background thread (`AgentLoop`). Routes hand work to it, so a long agent run never blocks event polling or approvals.
- **One run per ticket:** duplicate runs are prevented with a lock-guarded, in-memory set of active tickets.
- **Clean reset:** the reset closes the desk's MCP connection, replaces the file, and reconnects, which recreates the board tables.
- **No direct database access:** the backend never opens the database itself. It only copies the file during a reset.
- **CORS:** allows `http://localhost:5173` (and `127.0.0.1:5173`) for the React dashboard. In Problem 9 this was widened to any local port (see §10).
- **Test overrides:** `CAMPUS_CUSTOMS_DB` and `CAMPUS_CUSTOMS_AUDIT` point the backend and MCP server at scratch files for isolated tests.
- **Problem 8 addition:** approval and rejection results now include `ticket_id`, so each `human_decision` event shows up in that ticket's activity feed.

---

## 8. Dashboard (Problem 8, `frontend/`)

- **Stack:** React 19, Vite 8 and TypeScript 6. Start it with `npm run dev` from `frontend/` (http://localhost:5173).
- **Backend address:** it talks to `http://localhost:8000` directly (override with `VITE_API_BASE`). No API keys are in the frontend.
- **Files:**
  - `src/api.ts`: client for every route.
  - `src/useDesk.ts`: polling and connection state.
  - `src/feed.ts`: turns audit events into feed items, agent card states and per-agent summaries.
  - `src/components/*`: the panels.
  - `src/styles.css`: the look.
- **Data flow:** one poll calls `GET /api/tickets`, `/api/runs`, `/api/events?after=<cursor>`, `/api/approvals?status=all` and `/api/cash`, plus `GET /api/tickets/{id}` for details.
  - Polls run every 4s, or every 1.5s while any run is active.
  - The poll runs again immediately after a Run or Approve click.
  - Events are fetched incrementally using the `after` cursor and filtered by the selected ticket.
- **Actions:**
  - `POST /api/tickets/{id}/run` from **Run team**.
  - `POST /api/approvals/{id}/approve` and `POST /api/approvals/{id}/reject` from the approval cards. A non-agent "Approving as" name is required.
- **Resolved:** a ticket shows the ✓ Resolved stamp only when the backend status is `resolved`.
- **Paid but not closed:** when a ticket still reads `waiting_on_approval` but all its requests are decided and at least one is paid, a green hint and a **Run team again** button prompt the Boss to close it. Only the Boss can change ticket status.
- **Design rationale:** see `output/design.md`.

---

## 9. Board tables added to the working copy

The MCP server creates these on startup (`CREATE TABLE IF NOT EXISTS`) in `campus_customs_new.db` only. A reset removes them and they are recreated empty.

| Table | Fields | Why it matters to the agents |
|---|---|---|
| `ticket_activity` | `id`, `ticket_id`, `agent`, `note`, `shop_date` | The shared work log on the board. Each agent's findings and decisions, plus each human decision, are written here so later runs can pick up where the last one stopped. |
| `message_drafts` | `id`, `ticket_id`, `recipient`, `subject`, `body`, `author`, `status` (`draft`), `shop_date` | Customer and landlord replies. The recipient is always the ticket's requester, and nothing is ever sent. |
| `payment_requests` | `id`, `ticket_id`, `kind` (`invoice`/`rent`/`purchase_order`), `ref_id`, `period`, `amount`, `account`, `sku`, `size`, `qty`, `reason`, `requested_by`, `requested_on`, `status` (`pending`/`executed`/`rejected`), `decided_by`, `decided_on`, `decision_note`, `payment_id` | The human approval queue. Agents create `pending` rows. Only the human `approve_and_pay` tool turns a row into `executed` and links it to its `payments` row. `period` is used to detect duplicates. |

**Original tables changed by actions:**
- **`approve_and_pay`:** updates `cash_accounts`, `payments`, `invoices` (status `paid`, or a new paid purchase-order row), and `leases.next_due`.
- **`update_ticket_status`:** updates `tickets.status`.
- **Never written:** `desk`, `inventory`, `pricing` and `vendors`.

---

## 10. Changes made during the full run (Problem 9)

- **Completion rules in `backend/prompts/boss.md`:** the first runs of 101 and 103 ended `blocked`, waiting for customer replies or money that this simulation can never produce. The Boss prompt now has a "When a ticket is complete" section:
  - never wait for replies, because drafts aren't sent
  - an out-of-stock order is resolved once the restock purchase order is paid and the arrival-estimate draft is saved
  - rent is resolved once the payment is executed
  - a discount request is resolved once there's an above-cost price, a quantity the shop can commit to, and a drafted offer, even if it's partial
  - a rejected payment is final
- **Restock rule in `backend/prompts/accounting.md`:** Accounting queues the restock purchase order once the vendor can ship and cash covers it. If cash only covers part of it, Accounting reports the largest quantity that fits.
- **Audit writes no longer crash runs (`backend/audit.py`):** one run crashed with `PermissionError [WinError 5]` while replacing `audit_trail.json`, most likely a brief OneDrive or other file lock.
  - The swap now retries for about 4 seconds.
  - Entries that still can't be written stay queued in memory and are written in order with the next successful write. Pending entries are also written when the server shuts down.
  - A failed audit write never raises into an agent run.
- **CORS (`backend/main.py`):** `allow_origin_regex` accepts any `http://localhost:<port>` or `http://127.0.0.1:<port>`, so a second dashboard copy (e.g. :5174 for screenshots) works. Remote origins are still refused.

---

## 11. Full run results (Problem 9)

| Ticket | Final status | Runs | Human approvals | Cash change |
|---|---|---|---|---|
| 101 Bulldog tee | resolved | 3 (blocked, crashed, resolved) | #1 invoice 501 $840.00 · #3 PO 1 × CC-TEE-WHITE S $8.00 | −$848.00 |
| 102 Rent due | resolved | 1 (plus 1 failed start) | #2 rent lease 1 $2,400.00 | −$2,400.00 |
| 103 Bulk hoodie discount | resolved | 2 (blocked, resolved) | none | $0.00 (no cash impact) |

- **Cash:** $3,400.00 at the start (after reset), minus $3,248.00 in executed payments, leaves $152.00. That matches `cash_accounts.checking`.
- **Evidence files:**
  - `output/run_baseline.json`: the starting state.
  - `output/audit_trail.json`: Problem 9 entries are those after index 233.
  - `output/desk_tickets.html`: the Actual sections and the Cash tab.
  - `output/resolved_tickets.json`: per-ticket outcome, agent contributions and approvals.
  - `output/resolved_board.html`: your three dashboard screenshots (`output/screenshots/ticket-10x.webp`), embedded as base64. Rebuild it with `python scripts/build_resolved_board.py`.
- **Known evidence gaps:**
  - Run `4e2821ecc0fc` (ticket 101) has no `run_end`, and one entry was lost when it crashed.
  - Run `ec82eb3fc950` (ticket 102) failed to start: "Failed to initialize server session". No database change.

---

## 12. Coverage map

| Topic | Where |
|---|---|
| Database tables and fields | §1 (original tables), §9 (board tables) |
| All MCP tools, with tables read and updated | §3 (full table, updated in Problem 7), §2 (first three tools), `mcp_server/README.md` |
| All five agents and their roles and tools | §4, prompts in `backend/prompts/`, completion rules in §10 |
| API routes | §7 |
| Dashboard | §8 and `output/design.md` |
| Safety rules (human approval, privacy, safe database changes, untrusted ticket content, limits, API key) | §5, plus §10 (audit resilience, local-only CORS) |
| Running and testing | §2 (Claude Code MCP connection), §6 (CLI), §7 (backend start), §8 (dashboard start) |
| Actual results | §11 |
