# Campus Customs MCP Server

A [FastMCP](https://gofastmcp.com) server that gives the Campus Customs agent team (Boss, Inventory, Accounting, Facilities, Customer Service) its tools. It's the only way the agents read or change shop data.

## Database

- **Path:** `../data/campus_customs_new.db`, the working copy. You can override it with the `CAMPUS_CUSTOMS_DB` environment variable, for example to use a scratch copy in tests.
- **Original stays untouched:** the original `data/campus_customs.db` is never opened, and the server refuses to start if pointed at it.
- **Board tables:** on startup the server adds `ticket_activity`, `message_drafts` and `payment_requests` to the working copy.
- **Transactions:** reads are opened read-only. Writes run in a single `BEGIN IMMEDIATE` transaction.
- **Shop date:** "today" is always `desk.date_today`.
- **Missing data:** a missing record returns `{"found": false, ...}` or `{"ok": false, "message": ...}`. The server never invents values.

## Roles

The `CAMPUS_CUSTOMS_ROLE` environment variable chooses which tools exist:
- **`agents`** (default): used by the agent team and by Claude Code (`.mcp.json`). It can only *request* payments and has no tool that moves money.
- **`human_approver`**: adds `approve_and_pay` and `reject_payment_request`. Only the backend's Approve and Reject routes (`backend/main.py`) and `backend/approve.py` use it.

## Tools

| Tool | Purpose |
|---|---|
| `get_shop_date` | Shop date and desk notes. |
| `list_tickets(status?)` | Board tickets. |
| `get_ticket(ticket_id)` | One ticket plus its activity notes, message drafts and payment requests. Requester text is labeled untrusted. |
| `check_stock_and_pricing(sku, size?)` | Quantity and location for each size, plus unit cost, list price and margin. |
| `check_discount_margin(sku, qty, proposed_unit_price)` | Discount %, margin and whether a bulk price is below cost. |
| `check_vendor_status(vendor_id?)` | Specialty, `lead_days`, open invoices, days overdue and `can_ship_new_orders`. |
| `get_invoice(invoice_id)` | Invoice, its vendor, days overdue and any payment requests for it. |
| `check_rent_due(lease_id)` | Rent amount, landlord, due date, days until due and cash coverage. |
| `get_cash_position` | Balances, open invoices, queued requests, uncommitted cash and past payments. |
| `list_payment_requests(status?, ticket_id?)` | The approval queue, with payee, purpose (`reason`) and ticket subject. |
| `add_ticket_note(ticket_id, agent, note)` | Adds a note to the ticket's activity log. |
| `update_ticket_status(ticket_id, status, agent, note)` | Sets `open`, `in_progress`, `waiting_on_approval`, `blocked` or `resolved`. Only Boss can resolve. |
| `draft_customer_message(ticket_id, agent, subject, body)` | Saves a draft to the ticket's requester. Nothing is sent. |
| `request_payment(ticket_id, agent, kind, ref_id, reason, account?, sku?, size?, qty?)` | Queues an invoice, rent or purchase-order payment for human approval. |
| `approve_and_pay(request_id, approver, note?)` | **Human only.** Approves a pending request and pays it in one transaction, updating cash, `payments`, and the invoice, lease or PO record. |
| `reject_payment_request(request_id, approver, note?)` | **Human only.** Rejects a pending request. No money moves. |

### What `request_payment` enforces

- **Amount:** always computed from the database, never accepted from an agent.
- **Duplicates:** it refuses to queue the same payment twice.
- **Cash:** it refuses when the account doesn't have enough.
- **Rent timing:** rent can only be requested within 14 days of its due date.
- **Blocked vendors:** it refuses a purchase order while the vendor has an open unpaid invoice.

### What `approve_and_pay` enforces

- **Human approver:** the approver must be a human. Blank names, agent names and the requester's own name are refused.
- **Pending only:** it pays only `pending` requests, never one that is already paid or rejected.
- **Cash:** it re-checks the balance first and never allows a negative balance.
- **Still payable:** the invoice must still be open, the rent period unpaid, and the vendor able to ship.
- **All or nothing:** if any check fails, nothing changes and the request stays pending.
- **Paid only once:** it never pays the same request twice, even if two Approve clicks arrive at the same moment.

Error results include a `code` (`not_found`, `invalid_approver`, `already_paid`, `not_pending`, `insufficient_funds` or `not_payable`). The backend maps each code to an HTTP status.

## Setup and run

Run these from the `mcp_server/` folder:

```bash
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

To start the server over stdio:

```bash
.venv\Scripts\python.exe server.py
```

Claude Code and the agent team normally start it for you.
