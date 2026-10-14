"""Command-line human approval of payment requests (same as the dashboard's Approve button).

It launches its own campus-customs MCP server with CAMPUS_CUSTOMS_ROLE=human_approver,
the only role that has approve_and_pay / reject tools. Agents never get this role.
Approving pays the request immediately (cash, payments and the invoice/lease are updated).

Run from hw5/backend:
    .venv\\Scripts\\python.exe approve.py --list
    .venv\\Scripts\\python.exe approve.py --approver "Your Name"     # asks y/n for each pending request
"""

import argparse
import asyncio
import json
import uuid

from fastmcp import Client

import audit
from agents import make_mcp_transport


async def main(approver: str | None, list_only: bool) -> None:
    run_id = "approval-" + uuid.uuid4().hex[:8]
    transport = make_mcp_transport("human_approver")
    async with Client(transport) as client:
        pending = (await client.call_tool("list_payment_requests", {"status": "pending"})).data["payment_requests"]
        if not pending:
            print("No pending payment requests.")
            return
        cash = (await client.call_tool("get_cash_position", {})).data
        print(f"Cash: ${cash['total_cash']:.2f} (uncommitted ${cash['uncommitted_cash']:.2f})\n")
        for r in pending:
            print(f"#{r['id']} ticket {r['ticket_id']} | {r['kind']} to {r['payee']} | ${r['amount']:.2f} "
                  f"from {r['account']} | requested by {r['requested_by']}\n    reason: {r['reason']}")
            if list_only:
                continue
            answer = input("    approve and pay? [y]es / [n]o (reject) / [s]kip: ").strip().lower()
            if answer not in ("y", "n"):
                continue
            tool = "approve_and_pay" if answer == "y" else "reject_payment_request"
            note = input("    note (optional): ").strip()
            out = (await client.call_tool(tool, {"request_id": r["id"], "approver": approver, "note": note})).data
            print("    ->", json.dumps(out))
            audit.log(run_id, f"human:{approver}", "human_decision", ticket_id=r["ticket_id"], tool=tool,
                      args={"request_id": r["id"], "note": note}, result=out,
                      approval_status=("executed" if tool == "approve_and_pay" else "rejected")
                      if out.get("ok") else "decision_refused")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--approver", help="your name, recorded as payments.approved_by")
    p.add_argument("--list", action="store_true", help="only list pending requests")
    a = p.parse_args()
    if not a.list and not a.approver:
        p.error("--approver is required unless --list is used")
    asyncio.run(main(a.approver, a.list))
