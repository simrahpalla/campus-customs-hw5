"""The Campus Customs agent team: Boss, Inventory, Accounting, Facilities and Customer Service.

- Every agent runs gpt-6-luna through Portkey (PORTKEY_API_KEY), with no other model or fallback.
- Every shop fact and database change goes through the campus-customs MCP server (stdio,
  role "agents"). Agents have no direct database access.
- Every agent has a `delegate` tool that can run any of the other four agents and receive its
  structured AgentResult, so A -> B -> C chains work in any direction.
- Each agent loop is driven node by node with Agent.iter(), and every step is written to
  output/audit_trail.json. Usage (requests, tokens, tool calls) is shared by the whole ticket
  run, so the limits in config.py cap the team as a whole, not each agent.
"""

import json
import os
import uuid
from dataclasses import dataclass, field

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

from openai import AsyncOpenAI
from pydantic_ai import Agent, RunContext
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.mcp import MCPToolset, StdioTransport
from pydantic_ai.messages import RetryPromptPart, TextPart, ToolCallPart, ToolReturnPart
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.toolsets import FunctionToolset
from pydantic_ai.usage import RunUsage, UsageLimits

import audit
import config
from models import (
    AGENT_NAMES,
    AgentName,
    AgentReport,
    AgentResult,
    DelegationRequest,
    DelegationResult,
    TaskRequest,
    TicketRunResult,
)

PROMPT_FILES: dict[AgentName, str] = {
    "Boss": "boss.md",
    "Inventory": "inventory.md",
    "Accounting": "accounting.md",
    "Facilities": "facilities.md",
    "Customer Service": "customer_service.md",
}

# Which MCP tools each agent may see. Approval tools are not in this list at all: the agent
# MCP process never registers them (they exist only when CAMPUS_CUSTOMS_ROLE=human_approver).
COMMON_TOOLS = {"get_shop_date", "list_tickets", "get_ticket", "add_ticket_note"}
AGENT_TOOLS: dict[AgentName, set[str]] = {
    "Boss": COMMON_TOOLS | {
        "update_ticket_status", "check_stock_and_pricing", "check_vendor_status",
        "check_rent_due", "get_cash_position", "list_payment_requests",
    },
    "Inventory": COMMON_TOOLS | {"check_stock_and_pricing", "check_vendor_status"},
    "Accounting": COMMON_TOOLS | {
        "get_cash_position", "get_invoice", "check_vendor_status", "check_stock_and_pricing",
        "check_discount_margin", "list_payment_requests", "request_payment",
    },
    "Facilities": COMMON_TOOLS | {"check_rent_due", "get_cash_position", "list_payment_requests"},
    "Customer Service": COMMON_TOOLS | {"draft_customer_message", "check_stock_and_pricing"},
}
# Agents can only queue payments. Paying happens in the human-only approve_and_pay tool,
# which the backend's Approve route calls through a separate human_approver MCP process.
PAYMENT_TOOLS = {"request_payment"}


class RunLimitReached(Exception):
    """Raised when a configured limit is hit. Stops the whole ticket run."""

    def __init__(self, reason: str, detail: str):
        super().__init__(f"{reason}: {detail}")
        self.reason, self.detail = reason, detail


@dataclass
class RunState:
    """Shared by every agent loop in one ticket run."""

    run_id: str
    ticket_id: int | None
    usage: RunUsage = field(default_factory=RunUsage)
    delegations: int = 0
    limits: UsageLimits = field(default_factory=lambda: UsageLimits(
        request_limit=config.MAX_MODEL_REQUESTS,
        total_tokens_limit=config.MAX_TOTAL_TOKENS,
        tool_calls_limit=config.MAX_TOOL_CALLS,
    ))


@dataclass
class TeamDeps:
    """Per-agent-loop dependencies (PydanticAI deps)."""

    team: "CampusTeam"
    state: RunState
    agent: AgentName
    depth: int
    chain: tuple[AgentName, ...]


# --------------------------------------------------------------------------- model + MCP


def make_model() -> OpenAIResponsesModel:
    """gpt-6-luna routed through Portkey, using PORTKEY_API_KEY from .env. No fallbacks."""
    key = os.getenv("PORTKEY_API_KEY")
    if not key:
        raise RuntimeError("PORTKEY_API_KEY is missing from the root .env file.")
    client = AsyncOpenAI(
        api_key=key,
        base_url=config.PORTKEY_BASE_URL,
        default_headers={"x-portkey-api-key": key, "x-portkey-provider": "openai"},
    )
    return OpenAIResponsesModel(config.MODEL_NAME, provider=OpenAIProvider(openai_client=client))


def make_mcp_transport(role: str = "agents") -> StdioTransport:
    """Stdio launch spec for the campus-customs MCP server. The Portkey key is NOT passed to it."""
    env = {"CAMPUS_CUSTOMS_ROLE": role}
    if os.getenv("CAMPUS_CUSTOMS_DB"):  # optional override, e.g. a scratch copy for tests
        env["CAMPUS_CUSTOMS_DB"] = os.environ["CAMPUS_CUSTOMS_DB"]
    return StdioTransport(
        command=str(config.MCP_PYTHON),
        args=[str(config.MCP_SERVER)],
        env=env,
        cwd=str(config.MCP_SERVER.parent),
    )


def make_mcp_toolset(role: str = "agents") -> MCPToolset:
    return MCPToolset(make_mcp_transport(role), id="campus_customs")


# --------------------------------------------------------------------------- delegation tool

delegation_tools: FunctionToolset[TeamDeps] = FunctionToolset()


@delegation_tools.tool
async def delegate(ctx: RunContext[TeamDeps], to_agent: AgentName, instruction: str, context: str = "") -> DelegationResult:
    """Hand a sub-task to another team member and wait for its structured result.

    Args:
        to_agent: Boss, Inventory, Accounting, Facilities or Customer Service (not yourself).
        instruction: Exactly what you need from them, including ticket ids, SKUs, sizes, quantities.
        context: Facts you already verified (with the tool they came from) so they don't redo work.
    """
    d, s = ctx.deps, ctx.deps.state
    req = DelegationRequest(to_agent=to_agent, instruction=instruction, context=context)
    log = dict(ticket_id=s.ticket_id, depth=d.depth, delegated_to=to_agent, args=req.model_dump())

    if to_agent == d.agent:
        audit.log(s.run_id, d.agent, "delegation_refused", error="cannot delegate to itself", **log)
        return DelegationResult(to_agent=to_agent, ok=False, error="You cannot delegate to yourself. Do the work or pick another agent.")
    if d.depth + 1 > config.MAX_DELEGATION_DEPTH:
        audit.log(s.run_id, d.agent, "delegation_refused", stop_reason="max_delegation_depth",
                  error=f"depth limit {config.MAX_DELEGATION_DEPTH} reached", **log)
        return DelegationResult(to_agent=to_agent, ok=False,
                                error=f"Delegation depth limit ({config.MAX_DELEGATION_DEPTH}) reached. "
                                      "Finish with what you have and report what is missing.")
    if s.delegations >= config.MAX_DELEGATIONS:
        audit.log(s.run_id, d.agent, "limit_reached", stop_reason="max_delegations",
                  error=f"{config.MAX_DELEGATIONS} delegations already used", **log)
        raise RunLimitReached("max_delegations", f"{config.MAX_DELEGATIONS} delegations already used in this run")

    s.delegations += 1
    audit.log(s.run_id, d.agent, "delegation", result=f"delegation {s.delegations}/{config.MAX_DELEGATIONS}", **log)
    task = TaskRequest(ticket_id=s.ticket_id, instruction=instruction, from_agent=d.agent, context=context)
    result = await d.team.run_agent(to_agent, task, s, depth=d.depth + 1, chain=d.chain + (to_agent,))
    audit.log(s.run_id, d.agent, "delegation_result", ticket_id=s.ticket_id, depth=d.depth,
              delegated_to=to_agent, result=f"{result.status}: {result.summary}",
              approval_status=_approval_from_result(result))
    return DelegationResult(to_agent=to_agent, ok=True, result=result)


# --------------------------------------------------------------------------- team


def _runtime_context(ctx: RunContext[TeamDeps]) -> str:
    d = ctx.deps
    lines = [
        "## Run context",
        f"- You are **{d.agent}**. Delegation chain so far: {' -> '.join(d.chain)}.",
        f"- Delegation depth {d.depth} of max {config.MAX_DELEGATION_DEPTH}; "
        f"delegations used {d.state.delegations} of {config.MAX_DELEGATIONS} for this whole run.",
        f"- Team budget for this run: {config.MAX_MODEL_REQUESTS} model requests, "
        f"{config.MAX_TOOL_CALLS} tool calls, {config.MAX_TOTAL_TOKENS:,} tokens (shared by all agents). "
        f"Used so far: {d.state.usage.requests} requests, {d.state.usage.tool_calls} tool calls.",
    ]
    if d.depth >= config.MAX_DELEGATION_DEPTH:
        lines.append("- You are at the depth limit: you cannot delegate. Finish with what you can verify yourself.")
    return "\n".join(lines)


def _approval_from_content(tool: str, content) -> str | None:
    if tool not in PAYMENT_TOOLS or not isinstance(content, dict):
        return None
    if content.get("ok") is False:
        return "refused"
    return content.get("status")


def _approval_from_result(result: AgentResult) -> str | None:
    if not result.payment_requests:
        return None
    return ", ".join(f"#{p.request_id}:{p.status}" for p in result.payment_requests)


def _task_prompt(task: TaskRequest) -> str:
    return "## Task\n```json\n" + task.model_dump_json(indent=2) + "\n```"


class CampusTeam:
    """Owns the MCP connection and the five agents. Use as `async with CampusTeam() as team:`."""

    def __init__(self):
        self.mcp = make_mcp_toolset("agents")
        model = make_model()
        self.agents: dict[AgentName, Agent[TeamDeps, AgentReport]] = {}
        for name in AGENT_NAMES:
            allowed = AGENT_TOOLS[name]
            agent = Agent(
                model,
                name=name,
                deps_type=TeamDeps,
                output_type=AgentReport,
                instructions=(config.PROMPTS_DIR / PROMPT_FILES[name]).read_text(encoding="utf-8"),
                toolsets=[
                    self.mcp.filtered(lambda ctx, tool_def, allowed=allowed: tool_def.name in allowed),
                    delegation_tools,
                ],
                retries=2,
            )
            agent.instructions(_runtime_context)
            self.agents[name] = agent

    async def __aenter__(self):
        await self.mcp.__aenter__()  # one MCP server process shared by all agents
        return self

    async def __aexit__(self, *exc):
        await self.mcp.__aexit__(*exc)

    async def list_tools_by_agent(self) -> dict[str, list[str]]:
        """Tool names each agent can actually see (MCP tools after filtering, plus delegate)."""
        available = {t.name for t in await self.mcp.list_tools()}
        return {name: sorted((AGENT_TOOLS[name] & available) | {"delegate"}) for name in AGENT_NAMES}

    async def run_agent(self, name: AgentName, task: TaskRequest, state: RunState,
                        depth: int = 0, chain: tuple[AgentName, ...] | None = None) -> AgentResult:
        """Run one agent's loop to completion, auditing every node. Raises RunLimitReached on limits."""
        chain = chain or (name,)
        deps = TeamDeps(team=self, state=state, agent=name, depth=depth, chain=chain)
        base = dict(ticket_id=state.ticket_id, depth=depth)
        audit.log(state.run_id, name, "agent_start", args=task.model_dump(), result=" -> ".join(chain), **base)

        step = 0
        try:
            async with self.agents[name].iter(_task_prompt(task), deps=deps, usage=state.usage,
                                              usage_limits=state.limits) as run:
                async for node in run:
                    step += 1
                    if step > config.MAX_AGENT_STEPS:
                        audit.log(state.run_id, name, "limit_reached", step=step, stop_reason="max_agent_steps",
                                  error=f"{name} exceeded {config.MAX_AGENT_STEPS} loop steps", **base)
                        raise RunLimitReached("max_agent_steps", f"{name} exceeded {config.MAX_AGENT_STEPS} loop steps")
                    self._audit_node(node, state, name, step, base)
                report: AgentReport = run.result.output
        except UsageLimitExceeded as e:
            audit.log(state.run_id, name, "limit_reached", step=step, stop_reason="usage_limit", error=str(e), **base)
            raise RunLimitReached("usage_limit", str(e)) from e
        except RunLimitReached as e:
            audit.log(state.run_id, name, "agent_stopped", step=step, stop_reason=e.reason, error=e.detail, **base)
            raise

        result = AgentResult(agent=name, ticket_id=state.ticket_id, stop_reason="completed", **report.model_dump())
        audit.log(state.run_id, name, "agent_end", step=step, result=f"{result.status}: {result.summary}",
                  approval_status=_approval_from_result(result), stop_reason="completed", **base)
        return result

    def _audit_node(self, node, state: RunState, name: str, step: int, base: dict) -> None:
        run_id = state.run_id
        if Agent.is_user_prompt_node(node):
            audit.log(run_id, name, "loop_start", step=step, **base)
        elif Agent.is_model_request_node(node):
            for part in node.request.parts:
                if isinstance(part, ToolReturnPart):
                    if part.tool_name == "delegate":
                        continue  # delegation_result is logged by the delegate tool itself
                    content = part.content
                    audit.log(run_id, name, "tool_result", step=step, tool=part.tool_name, result=content,
                              approval_status=_approval_from_content(part.tool_name, content), **base)
                elif isinstance(part, RetryPromptPart):
                    audit.log(run_id, name, "tool_retry", step=step, tool=part.tool_name,
                              error=str(part.content), **base)
            audit.log(run_id, name, "model_request", step=step,
                      result=f"requests so far: {state.usage.requests}", **base)
        elif Agent.is_call_tools_node(node):
            resp = node.model_response
            calls = [p for p in resp.parts if isinstance(p, ToolCallPart)]
            text = " ".join(p.content for p in resp.parts if isinstance(p, TextPart))
            audit.log(run_id, name, "model_response", step=step, stop_reason=resp.finish_reason,
                      result=(text or f"{len(calls)} tool call(s)") +
                             f" | tokens in/out {resp.usage.input_tokens}/{resp.usage.output_tokens}", **base)
            for call in calls:
                if call.tool_name == "delegate":
                    continue  # logged as a delegation by the tool
                action = "final_output" if call.tool_name == "final_result" else "tool_call"
                audit.log(run_id, name, action, step=step, tool=call.tool_name, args=call.args_as_dict(), **base)
        elif Agent.is_end_node(node):
            audit.log(run_id, name, "loop_end", step=step, stop_reason="final_output", **base)

    async def run_ticket(self, ticket_id: int, run_id: str | None = None) -> TicketRunResult:
        """Boss works one ticket to a decision, delegating as needed."""
        state = RunState(run_id=run_id or uuid.uuid4().hex[:12], ticket_id=ticket_id)
        audit.log(state.run_id, "system", "run_start", ticket_id=ticket_id, args={
            "model": config.MODEL_NAME, "max_model_requests": config.MAX_MODEL_REQUESTS,
            "max_total_tokens": config.MAX_TOTAL_TOKENS, "max_tool_calls": config.MAX_TOOL_CALLS,
            "max_delegations": config.MAX_DELEGATIONS, "max_delegation_depth": config.MAX_DELEGATION_DEPTH,
            "max_agent_steps": config.MAX_AGENT_STEPS,
        })
        task = TaskRequest(
            ticket_id=ticket_id,
            from_agent="human",
            instruction=f"Work ticket {ticket_id} to a final decision: gather the facts through the team, "
                        "get any payments queued for human approval, make sure customer-facing replies are "
                        "drafted, set the ticket status, and report your decision.",
        )
        final, error, stop = None, None, "completed"
        try:
            final = await self.run_agent("Boss", task, state)
        except RunLimitReached as e:
            stop, error = e.reason, e.detail
        except Exception as e:  # noqa: BLE001 - recorded in the audit trail, then reported
            stop, error = "error", f"{type(e).__name__}: {e}"
        result = TicketRunResult(
            run_id=state.run_id, ticket_id=ticket_id, stop_reason=stop, final=final, error=error,
            model_requests=state.usage.requests, total_tokens=state.usage.total_tokens,
            tool_calls=state.usage.tool_calls, delegations=state.delegations,
        )
        audit.log(state.run_id, "system", "run_end", ticket_id=ticket_id, stop_reason=stop, error=error,
                  result=json.dumps({k: v for k, v in result.model_dump().items() if k not in ("final", "error")}),
                  approval_status=_approval_from_result(final) if final else None)
        return result
