"""Data types for the Campus Customs agent team: tasks, delegation, results and audit entries."""

from typing import Literal

from pydantic import BaseModel, Field

AgentName = Literal["Boss", "Inventory", "Accounting", "Facilities", "Customer Service"]
AGENT_NAMES: tuple[AgentName, ...] = ("Boss", "Inventory", "Accounting", "Facilities", "Customer Service")

ResultStatus = Literal["done", "waiting_on_approval", "blocked", "needs_info", "failed"]


class TaskRequest(BaseModel):
    """A unit of work handed to an agent, by the human runner or by another agent."""

    ticket_id: int | None = Field(None, description="Board ticket this work belongs to, if any.")
    instruction: str = Field(description="What the receiving agent should do.")
    from_agent: AgentName | Literal["human"] = "human"
    context: str = Field("", description="Facts already established (with sources) so the receiver need not re-check.")


class DelegationRequest(BaseModel):
    """What an agent asks for when it delegates (the arguments of the delegate tool)."""

    to_agent: AgentName
    instruction: str
    context: str = ""


class PaymentRequestRef(BaseModel):
    """A payment request the agent created or saw, as returned by the MCP server."""

    request_id: int
    kind: Literal["invoice", "rent", "purchase_order"]
    amount: float
    status: Literal["pending", "approved", "rejected", "executed"]


class AgentReport(BaseModel):
    """Structured output every agent returns at the end of its loop."""

    status: ResultStatus = Field(
        description="done = task finished; waiting_on_approval = a payment needs a human; "
        "blocked = a shop rule or missing resource prevents progress; needs_info = required data is "
        "missing from the database; failed = an error stopped the work."
    )
    summary: str = Field(description="Two to four sentences: what was found and done.")
    facts: list[str] = Field(default_factory=list, description="Verified facts, each naming the MCP tool it came from.")
    actions_taken: list[str] = Field(default_factory=list, description="Database/board changes made (notes, drafts, requests, payments).")
    payment_requests: list[PaymentRequestRef] = Field(default_factory=list)
    missing_info: list[str] = Field(default_factory=list, description="Information that does not exist in the database.")
    recommendation: str = Field("", description="Suggested next step or decision for whoever asked.")


class AgentResult(AgentReport):
    """An AgentReport stamped with who produced it, for which ticket, and how its loop ended."""

    agent: AgentName
    ticket_id: int | None = None
    stop_reason: str = "completed"


class DelegationResult(BaseModel):
    """What the delegating agent gets back from the delegate tool."""

    to_agent: AgentName
    ok: bool
    result: AgentResult | None = None
    error: str | None = None


class TicketRunResult(BaseModel):
    """Outcome of one ticket run (Boss loop plus all delegated loops)."""

    run_id: str
    ticket_id: int | None
    stop_reason: str
    final: AgentResult | None = None
    error: str | None = None
    model_requests: int = 0
    total_tokens: int = 0
    tool_calls: int = 0
    delegations: int = 0


class AuditEntry(BaseModel):
    """One record in output/audit_trail.json."""

    timestamp: str
    run_id: str
    ticket_id: int | None = None
    agent: str
    depth: int = 0
    step: int | None = None
    action: str  # run_start, model_request, model_response, tool_call, tool_result, delegation, ...
    delegated_to: str | None = None
    tool: str | None = None
    args: dict | None = None
    result: str | None = None
    error: str | None = None
    approval_status: str | None = None
    stop_reason: str | None = None


# --------------------------------------------------------------------------- API (backend/main.py)

RunStatus = Literal["running", "completed", "stopped", "failed"]
EventCategory = Literal["message", "delegation", "tool", "approval", "limit", "system"]


class TicketOut(BaseModel):
    id: int
    type: str
    requester: str
    subject: str
    status: str = Field(description="Raw board status: open, in_progress, waiting_on_approval, blocked or resolved.")
    state: Literal["open", "resolved"] = Field(description="resolved only when status is 'resolved'.")
    created_at: str
    running: bool = False
    active_run_id: str | None = None


class TicketsResponse(BaseModel):
    shop_date: str | None
    tickets: list[TicketOut]


class RunInfo(BaseModel):
    run_id: str
    ticket_id: int
    status: RunStatus
    started_at: str
    finished_at: str | None = None
    stop_reason: str | None = None
    error: str | None = None
    result: TicketRunResult | None = None


class RunsResponse(BaseModel):
    active: list[RunInfo]
    recent: list[RunInfo]


class EventOut(AuditEntry):
    index: int = Field(description="Position in the audit trail; pass the last one as ?after= to get only newer events.")
    category: EventCategory


class EventsResponse(BaseModel):
    events: list[EventOut]
    next_after: int = Field(description="Use as ?after= on the next poll.")
    total: int


class ApprovalOut(BaseModel):
    request_id: int
    ticket_id: int | None
    ticket_subject: str | None = None
    kind: Literal["invoice", "rent", "purchase_order"]
    payee: str | None
    amount: float
    account: str
    purpose: str | None = Field(None, description="The requesting agent's reason.")
    requested_by: str
    requested_on: str
    status: Literal["pending", "approved", "rejected", "executed"]
    ref_id: int
    sku: str | None = None
    size: str | None = None
    qty: int | None = None
    decided_by: str | None = None
    payment_id: int | None = None


class ApprovalsResponse(BaseModel):
    approvals: list[ApprovalOut]
    pending_total: float


class ApprovalDecision(BaseModel):
    approver: str = Field(min_length=1, description="The human's name; recorded as payments.approved_by.")
    note: str = ""


class ApprovalResult(BaseModel):
    request_id: int
    ticket_id: int | None = None
    status: Literal["executed", "rejected"]
    decided_by: str
    payment_id: int | None = None
    amount: float | None = None
    new_balance: float | None = None
    details: dict = Field(default_factory=dict, description="Record updates (invoice paid, lease next_due, PO ETA).")


class CashResponse(BaseModel):
    account: str
    balance: float
    as_of: str
    shop_date: str | None
    pending_requests_total: float
    balance_after_pending: float


class ResetResponse(BaseModel):
    message: str
    working_db: str
    cleared_runs: int
    audit_entries_preserved: int
