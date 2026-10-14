"""Run the Campus Customs agent team from the command line.

Run from hw5/backend with the backend venv:
    .venv\\Scripts\\python.exe run_team.py --check                 # config + MCP check, no model calls
    .venv\\Scripts\\python.exe run_team.py --ticket 101            # Boss works one ticket
    .venv\\Scripts\\python.exe run_team.py --all-open --reset      # fresh working copy, then every open ticket

Payments are only queued here. A human approves and pays them through the backend's
Approve route (POST /api/approvals/{id}/approve) or approve.py; agents cannot pay.
"""

import argparse
import asyncio
import json
import os
import shutil
import uuid

import config
from agents import AGENT_TOOLS, CampusTeam


def reset_working_db() -> None:
    """Replace the working copy with a fresh copy of the untouched original."""
    shutil.copyfile(config.ORIGINAL_DB, config.WORKING_DB)
    print(f"Reset {config.WORKING_DB.name} from {config.ORIGINAL_DB.name}.")


async def check() -> None:
    """Verify configuration and the MCP connection without calling the model."""
    print(f"model: {config.MODEL_NAME} via {config.PORTKEY_BASE_URL}")
    print(f"PORTKEY_API_KEY set: {bool(os.getenv('PORTKEY_API_KEY'))}")
    print(f"MCP server: {config.MCP_SERVER} (python {config.MCP_PYTHON.exists() and 'found' or 'MISSING'})")
    print(f"limits: requests={config.MAX_MODEL_REQUESTS} tokens={config.MAX_TOTAL_TOKENS} "
          f"tool_calls={config.MAX_TOOL_CALLS} delegations={config.MAX_DELEGATIONS} "
          f"depth={config.MAX_DELEGATION_DEPTH} steps/agent={config.MAX_AGENT_STEPS}")
    async with CampusTeam() as team:
        tools = await team.list_tools_by_agent()
        for agent, names in tools.items():
            missing = AGENT_TOOLS[agent] - set(names)
            print(f"{agent:17} {len(names):2} tools: {', '.join(names)}" + (f"  MISSING: {missing}" if missing else ""))
        print("models:", {a.name: a.model.model_name for a in team.agents.values()})


async def run(tickets: list[int]) -> None:
    run_id = uuid.uuid4().hex[:12]
    async with CampusTeam() as team:
        for ticket_id in tickets:
            print(f"\n=== ticket {ticket_id} (run {run_id}) ===")
            result = await team.run_ticket(ticket_id, run_id=run_id)
            print(json.dumps(result.model_dump(), indent=2))
            if result.stop_reason != "completed":
                print(f"Stopped: {result.stop_reason}. See output/audit_trail.json.")


async def open_ticket_ids() -> list[int]:
    async with CampusTeam() as team:
        out = await team.mcp.direct_call_tool("list_tickets", {"status": "open"})
        return [t["id"] for t in out["tickets"]]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="store_true", help="verify config and MCP tools; no model calls")
    p.add_argument("--ticket", type=int, action="append", help="ticket id to work (repeatable)")
    p.add_argument("--all-open", action="store_true", help="work every open ticket")
    p.add_argument("--reset", action="store_true", help="reset the working DB from the original first")
    a = p.parse_args()

    if a.check:
        asyncio.run(check())
        return
    if a.reset:
        reset_working_db()
    tickets = a.ticket or []
    if a.all_open:
        tickets += asyncio.run(open_ticket_ids())
    if not tickets:
        p.error("give --ticket N, --all-open or --check")
    asyncio.run(run(tickets))


if __name__ == "__main__":
    main()
