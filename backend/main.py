"""FastAPI backend for the Campus Customs dashboard.

Start from inside backend/ (with the backend venv active):
    uvicorn main:app --reload --port 8000

How it fits together
- All shop data and actions go through the campus-customs MCP server. The backend never opens
  the database; it only copies the original file over the working copy on reset.
- Agent runs use their own MCP process in the "agents" role, which can only *request* payments.
- The backend's "desk" connection uses the "human_approver" role. Only the Approve route calls
  its approve_and_pay tool, so cash changes only when a human clicks Approve.
- MCP stdio servers are subprocesses. uvicorn --reload on Windows runs the app on a loop that
  cannot start subprocesses, so all MCP and agent work runs on a private event loop in a
  background thread (AgentLoop). Routes hand work to it and await the result, which also means
  a running agent team never blocks the dashboard's requests.
"""

import asyncio
import shutil
import sys
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastmcp import Client

import audit
import config
from agents import CampusTeam, make_mcp_transport
from models import (
    ApprovalDecision,
    ApprovalOut,
    ApprovalResult,
    ApprovalsResponse,
    CashResponse,
    EventOut,
    EventsResponse,
    ResetResponse,
    RunInfo,
    RunsResponse,
    TicketOut,
    TicketsResponse,
)

MCP_CALL_TIMEOUT = 30  # seconds for one desk tool call
RECENT_RUNS_KEPT = 20


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# --------------------------------------------------------------------------- background loop + desk


class AgentLoop:
    """A private asyncio loop in a daemon thread (Proactor on Windows, so subprocesses work)."""

    def __init__(self):
        self.loop = asyncio.ProactorEventLoop() if sys.platform == "win32" else asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, name="agent-loop", daemon=True)

    def start(self) -> None:
        self.thread.start()

    def submit(self, coro):
        """Schedule a coroutine on the agent loop; returns a concurrent.futures.Future."""
        return asyncio.run_coroutine_threadsafe(coro, self.loop)

    async def run(self, coro):
        """Run a coroutine on the agent loop and await its result from the request loop."""
        return await asyncio.wrap_future(self.submit(coro))

    def stop(self) -> None:
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.thread.join(timeout=5)


class ShopToolError(Exception):
    pass


class Desk:
    """The human-side MCP connection (role human_approver), owned by one long-lived task.

    Requests are queued to that task, so the connection is always opened and closed in the
    same task, calls run one at a time, and a reset can close the connection, replace the
    database file, and reopen it (which recreates the board tables) safely.
    """

    def __init__(self):
        self.queue: asyncio.Queue | None = None
        self.task: asyncio.Task | None = None

    async def start(self) -> None:
        self.queue = asyncio.Queue()
        ready = asyncio.get_running_loop().create_future()
        self.task = asyncio.create_task(self._serve(ready))
        await ready

    async def _serve(self, ready: asyncio.Future) -> None:
        reset_fut, reset_fn = None, None
        try:
            while True:
                async with Client(make_mcp_transport("human_approver")) as client:
                    if not ready.done():
                        ready.set_result(None)
                    if reset_fut:
                        reset_fut.set_result(None)
                        reset_fut = None
                    while True:
                        op, arg, fut = await self.queue.get()
                        if op == "call":
                            try:
                                fut.set_result(await client.call_tool(arg[0], arg[1], raise_on_error=False))
                            except Exception as e:  # noqa: BLE001 - handed back to the caller
                                fut.set_exception(e)
                        elif op == "reset":
                            reset_fut, reset_fn = fut, arg
                            break
                        elif op == "stop":
                            fut.set_result(None)
                            return
                # Connection closed: safe to replace the database file, then reopen above.
                try:
                    reset_fn()
                except Exception as e:  # noqa: BLE001
                    reset_fut.set_exception(e)
                    reset_fut = None
        except Exception as e:
            for f in (ready, reset_fut):
                if f and not f.done():
                    f.set_exception(e)
            raise

    async def _send(self, op: str, arg=None):
        fut = asyncio.get_running_loop().create_future()
        await self.queue.put((op, arg, fut))
        return await asyncio.wait_for(fut, MCP_CALL_TIMEOUT)

    async def call(self, tool: str, args: dict | None = None) -> dict:
        result = await self._send("call", (tool, args or {}))
        if result.is_error:
            raise ShopToolError(" ".join(getattr(c, "text", str(c)) for c in result.content))
        return result.data

    async def replace_database(self, copy_fn) -> None:
        await self._send("reset", copy_fn)

    async def stop(self) -> None:
        if self.task and not self.task.done():
            await self._send("stop")


# --------------------------------------------------------------------------- run state


class State:
    """In-memory run state, shared by the request loop and the agent loop (guarded by a lock)."""

    def __init__(self):
        self.lock = threading.Lock()
        self.active: dict[int, RunInfo] = {}  # ticket_id -> running RunInfo
        self.futures: dict[str, object] = {}  # run_id -> concurrent Future
        self.recent: list[RunInfo] = []
        self.resetting = False
        self.approvals_in_flight = 0


agent_loop = AgentLoop()
desk = Desk()
state = State()


async def shop(tool: str, args: dict | None = None) -> dict:
    """Call an MCP tool on the desk connection from a route."""
    try:
        return await agent_loop.run(desk.call(tool, args))
    except ShopToolError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"MCP tool {tool} failed: {e}") from e
    except asyncio.TimeoutError as e:
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, f"MCP tool {tool} timed out") from e


async def _execute_run(info: RunInfo) -> None:
    """Runs on the agent loop: one CampusTeam (its own agents-role MCP process) works one ticket."""
    try:
        async with CampusTeam() as team:
            result = await team.run_ticket(info.ticket_id, run_id=info.run_id)
        info.result, info.stop_reason, info.error = result, result.stop_reason, result.error
        info.status = ("completed" if result.stop_reason == "completed"
                       else "failed" if result.stop_reason == "error" else "stopped")
    except asyncio.CancelledError:
        info.status, info.error = "failed", "cancelled (server shutting down)"
        raise
    except Exception as e:  # noqa: BLE001 - e.g. missing key or MCP start failure
        info.status, info.error, info.stop_reason = "failed", f"{type(e).__name__}: {e}", "error"
        audit.log(info.run_id, "system", "run_failed", ticket_id=info.ticket_id, error=info.error, stop_reason="error")
    finally:
        info.finished_at = _now()
        with state.lock:
            state.active.pop(info.ticket_id, None)
            state.futures.pop(info.run_id, None)
            state.recent = ([info] + state.recent)[:RECENT_RUNS_KEPT]


# --------------------------------------------------------------------------- app


@asynccontextmanager
async def lifespan(app: FastAPI):
    agent_loop.start()
    await agent_loop.run(desk.start())  # also creates the board tables on the working copy
    yield
    with state.lock:
        futures = list(state.futures.values())
    for f in futures:
        f.cancel()
    try:
        await asyncio.wait_for(agent_loop.run(desk.stop()), 10)
    finally:
        agent_loop.stop()


app = FastAPI(title="Campus Customs Desk API", version="1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # The React dashboard (frontend/, npm run dev on :5173). Any local port is allowed so a second
    # copy (e.g. :5174 for screenshots) also works; nothing outside this machine is allowed.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict:
    """Backend is up and the MCP desk connection answers."""
    shop_date = (await shop("get_shop_date")).get("shop_date")
    return {"ok": True, "shop_date": shop_date, "model": config.MODEL_NAME, "working_db": config.WORKING_DB.name}


# ----- tickets and runs


@app.get("/api/tickets", response_model=TicketsResponse)
async def list_tickets() -> TicketsResponse:
    """Every board ticket with its raw status, open/resolved state, and whether agents are working it."""
    data = await shop("list_tickets")
    shop_date = (await shop("get_shop_date")).get("shop_date")
    with state.lock:
        active = {tid: r.run_id for tid, r in state.active.items()}
    return TicketsResponse(shop_date=shop_date, tickets=[
        TicketOut(**t, state="resolved" if t["status"] == "resolved" else "open",
                  running=t["id"] in active, active_run_id=active.get(t["id"]))
        for t in data["tickets"]
    ])


@app.get("/api/tickets/{ticket_id}")
async def get_ticket(ticket_id: int) -> dict:
    """One ticket with its board activity, message drafts and payment requests."""
    data = await shop("get_ticket", {"ticket_id": ticket_id})
    if not data.get("found"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, data.get("message", f"No ticket with id {ticket_id}."))
    return data


@app.post("/api/tickets/{ticket_id}/run", response_model=RunInfo, status_code=status.HTTP_202_ACCEPTED)
async def run_ticket(ticket_id: int) -> RunInfo:
    """Start the agent team on a ticket in the background. Returns at once; poll /api/events and /api/runs."""
    data = await shop("get_ticket", {"ticket_id": ticket_id})
    if not data.get("found"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No ticket with id {ticket_id}.")
    if data["ticket"]["status"] == "resolved":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Ticket {ticket_id} is already resolved.")

    info = RunInfo(run_id=uuid.uuid4().hex[:12], ticket_id=ticket_id, status="running", started_at=_now())
    with state.lock:  # check-and-register atomically so two clicks can't start two runs
        if state.resetting:
            raise HTTPException(status.HTTP_409_CONFLICT, "A database reset is in progress. Try again shortly.")
        if ticket_id in state.active:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"Ticket {ticket_id} is already being worked (run {state.active[ticket_id].run_id}).")
        state.active[ticket_id] = info
        state.futures[info.run_id] = agent_loop.submit(_execute_run(info))
    return info


@app.get("/api/runs", response_model=RunsResponse)
async def list_runs() -> RunsResponse:
    """Runs in progress and the most recent finished runs (with their results)."""
    with state.lock:
        return RunsResponse(active=list(state.active.values()), recent=list(state.recent))


@app.get("/api/runs/{run_id}", response_model=RunInfo)
async def get_run(run_id: str) -> RunInfo:
    with state.lock:
        for r in list(state.active.values()) + state.recent:
            if r.run_id == run_id:
                return r
    raise HTTPException(status.HTTP_404_NOT_FOUND, f"No run with id {run_id} since the server started.")


# ----- events (audit trail)

_CATEGORY = {
    "model_response": "message", "final_output": "message", "agent_end": "message", "agent_start": "message",
    "delegation": "delegation", "delegation_result": "delegation", "delegation_refused": "delegation",
    "tool_call": "tool", "tool_result": "tool", "tool_retry": "tool",
    "human_decision": "approval",
    "limit_reached": "limit", "agent_stopped": "limit",
}


@app.get("/api/events", response_model=EventsResponse)
def list_events(
    after: int = Query(-1, description="Only events with index greater than this."),
    ticket_id: int | None = None,
    run_id: str | None = None,
    limit: int = Query(200, ge=1, le=1000),
) -> EventsResponse:
    """Recent agent events (messages, delegations, tool calls, approvals) from output/audit_trail.json.

    A plain (sync) route, so FastAPI runs the file read in a worker thread.
    """
    entries = audit.read_entries()
    events = []
    for i, e in enumerate(entries):
        if i <= after or (ticket_id is not None and e.get("ticket_id") != ticket_id) or (run_id and e.get("run_id") != run_id):
            continue
        events.append(EventOut(**e, index=i, category=_CATEGORY.get(e.get("action"), "system")))
    events = events[-limit:]
    return EventsResponse(events=events, next_after=len(entries) - 1, total=len(entries))


# ----- approvals and cash


@app.get("/api/approvals", response_model=ApprovalsResponse)
async def list_approvals(status_filter: str = Query("pending", alias="status",
                                                    description="pending, executed, rejected or all")) -> ApprovalsResponse:
    """Payment/purchase requests waiting for a human (or other statuses), with payee, amount, purpose and ticket."""
    args = {} if status_filter == "all" else {"status": status_filter}
    data = await shop("list_payment_requests", args)
    approvals = [
        ApprovalOut(request_id=r["id"], purpose=r["reason"], **{k: r[k] for k in (
            "ticket_id", "ticket_subject", "kind", "payee", "amount", "account", "requested_by", "requested_on",
            "status", "ref_id", "sku", "size", "qty", "decided_by", "payment_id")})
        for r in data["payment_requests"]
    ]
    pending = sum(a.amount for a in approvals if a.status == "pending")
    return ApprovalsResponse(approvals=approvals, pending_total=round(pending, 2))


_ERROR_STATUS = {
    "not_found": status.HTTP_404_NOT_FOUND,
    "invalid_approver": status.HTTP_400_BAD_REQUEST,
    "already_paid": status.HTTP_409_CONFLICT,
    "not_pending": status.HTTP_409_CONFLICT,
    "insufficient_funds": status.HTTP_409_CONFLICT,
    "not_payable": status.HTTP_409_CONFLICT,
}


async def _decide(request_id: int, body: ApprovalDecision, tool: str) -> ApprovalResult:
    with state.lock:
        if state.resetting:
            raise HTTPException(status.HTTP_409_CONFLICT, "A database reset is in progress. Try again shortly.")
        state.approvals_in_flight += 1
    try:
        out = await shop(tool, {"request_id": request_id, "approver": body.approver, "note": body.note})
    finally:
        with state.lock:
            state.approvals_in_flight -= 1

    decision = "executed" if tool == "approve_and_pay" else "rejected"
    audit.log(f"approval-{request_id}", f"human:{body.approver.strip()}", "human_decision",
              ticket_id=out.get("ticket_id"), tool=tool,
              args={"request_id": request_id, "note": body.note}, result=out,
              approval_status=decision if out.get("ok") else "refused")
    if not out.get("ok"):
        raise HTTPException(_ERROR_STATUS.get(out.get("code"), status.HTTP_400_BAD_REQUEST), out.get("message"))
    details = {k: v for k, v in out.items() if k not in
               ("ok", "request_id", "ticket_id", "status", "decided_by", "approved_by", "payment_id", "amount",
                "new_balance")}
    return ApprovalResult(request_id=request_id, ticket_id=out.get("ticket_id"), status=decision,
                          decided_by=out.get("approved_by") or out.get("decided_by"),
                          payment_id=out.get("payment_id"), amount=out.get("amount"),
                          new_balance=out.get("new_balance"), details=details)


@app.post("/api/approvals/{request_id}/approve", response_model=ApprovalResult)
async def approve_request(request_id: int, body: ApprovalDecision) -> ApprovalResult:
    """Human clicks Approve: approve AND pay the request in one MCP transaction (funds, duplicates and records checked)."""
    return await _decide(request_id, body, "approve_and_pay")


@app.post("/api/approvals/{request_id}/reject", response_model=ApprovalResult)
async def reject_request(request_id: int, body: ApprovalDecision) -> ApprovalResult:
    """Human clicks Reject: the request is closed and no money moves."""
    return await _decide(request_id, body, "reject_payment_request")


@app.get("/api/cash", response_model=CashResponse)
async def get_cash() -> CashResponse:
    """Current checking balance from cash_accounts, plus what pending requests would leave."""
    data = await shop("get_cash_position")
    checking = next((a for a in data["cash_accounts"] if a["name"] == "checking"), None)
    if checking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No 'checking' account in cash_accounts.")
    pending = round(sum(r["amount"] for r in data["queued_payment_requests"] if r["account"] == "checking"), 2)
    return CashResponse(account="checking", balance=checking["balance"], as_of=checking["date"],
                        shop_date=data["shop_date"], pending_requests_total=pending,
                        balance_after_pending=round(checking["balance"] - pending, 2))


# ----- reset


def _copy_original_over_working() -> None:
    if config.WORKING_DB.resolve() == config.ORIGINAL_DB.resolve():
        raise RuntimeError("Working database path points at the original; refusing to reset.")
    shutil.copyfile(config.ORIGINAL_DB, config.WORKING_DB)


@app.post("/api/reset", response_model=ResetResponse)
async def reset_database() -> ResetResponse:
    """Replace the working copy with a fresh copy of the untouched original. Refused while agents run.

    Clears pending approvals and board notes/drafts (they live in the working copy) and finished-run
    state. The original database and the append-only audit trail are left untouched.
    """
    with state.lock:
        if state.active:
            running = ", ".join(f"{t} (run {r.run_id})" for t, r in state.active.items())
            raise HTTPException(status.HTTP_409_CONFLICT, f"Agents are still running on ticket(s) {running}. "
                                                          "Wait for them to finish before resetting.")
        if state.approvals_in_flight:
            raise HTTPException(status.HTTP_409_CONFLICT, "An approval is being processed. Try again shortly.")
        if state.resetting:
            raise HTTPException(status.HTTP_409_CONFLICT, "A reset is already in progress.")
        state.resetting = True
    try:
        await agent_loop.run(desk.replace_database(_copy_original_over_working))
        with state.lock:
            cleared = len(state.recent)
            state.recent = []
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Reset failed: {e}") from e
    finally:
        with state.lock:
            state.resetting = False
    preserved = len(audit.read_entries())
    audit.log("reset-" + uuid.uuid4().hex[:8], "human", "database_reset",
              result=f"{config.WORKING_DB.name} replaced from {config.ORIGINAL_DB.name}; {cleared} finished runs cleared")
    return ResetResponse(message=f"{config.WORKING_DB.name} reset from {config.ORIGINAL_DB.name}.",
                         working_db=str(config.WORKING_DB), cleared_runs=cleared,
                         audit_entries_preserved=preserved)
