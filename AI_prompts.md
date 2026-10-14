# AI Prompts Log — Homework 5

This file records the prompts I used while completing Homework 5.

## Assignment Context — Campus Customs Multi-Agent Operations

### Initial prompt

> Our assignment today is called Campus Customs Multi-Agent Operations. Help me build it one problem at a time. As usual, I’ll provide each problem separately; don’t implement ahead or start coding yet.
>
> The goal is to build a team of AI agents that runs a simulated campus shop. Tickets on a shared board include customer orders, rent, unpaid bills, and discount requests. The system will have three connected components:
>
> * An MCP server exposing the shop’s tools.
> * A FastAPI backend running the multi-agent team.
> * A React dashboard where a human can watch progress and approve requests.
>
>
> There are five agents:
>
> * Boss: reads tickets, assigns work, and makes final decisions.
> * Inventory: checks stock by SKU and size, identifies shortages, and finds vendors for restocking.
> * Accounting: tracks cash and invoices, checks margins, and prepares payments or purchase orders for human approval.
> * Facilities: handles leases, rent, and shop-space issues.
> * Customer Service: drafts customer messages.
>
>
> Any agent can delegate to any other agent—not just through the Boss.
>
> The supplied database is `data/campus_customs.db`. Tables include `desk`, `tickets`, `inventory`, `pricing`, `vendors`, `leases`, `cash_accounts`, `payments`, and `invoices`. Inspect the actual schema before making assumptions about fields.
> Keep the original database untouched. Use a working copy at `data/campus_customs_new.db` for both the MCP server and backend. Before a full ticket-resolution run, reset that working copy from the original.
> Follow these rules throughout:
>
> 1. Use `desk.date_today` as the shop’s current date, including for overdue checks—not the computer’s date.
> 2. Get vendor lead times from the `vendors` table. Vendors cannot ship new products while they have an open unpaid invoice.
> 3. Every payment requires explicit human approval before execution. Enforce this in the implementation, not just agent prompts, and update the relevant database records after payment.
> 4. The payment tool must refuse payments when cash is insufficient. No negative balances.
> 5. Cash only goes out; this assignment does not model revenue or incoming funds.
> 6. Never email customers or contact real vendors. Keep message drafts on the board.
> 7. For every agent’s AI calls, use only `gpt-6-luna` through Portkey with `PORTKEY_API_KEY`. Do not configure alternative models or fallbacks. Keep the key out of code, logs, and Git.
> 8. The final submission will be a public GitHub repository. I’ll provide the required file structure when we reach that problem.
>
> Keep the implementation straightforward and explain changes briefly so I can understand them. After each problem, tell me what changed, how to run or check it, and whether I need to do anything manually.
> For now, acknowledge this context and wait for Problem 1. Additionally, unzip the data folder I have added to the hw5 folder.

### What was missing

- It didn't say how to resolve conflicts with the project's `AGENTS.md`, which specifies `gpt-5.6-luna` and plain HTML interfaces.

### Follow-up prompt(s)

> follow the latest guidance from this hw - use gpt 6 luna and build a react dashboard

## Problem 1 — AI Prompts Log

### Initial prompt

> problem 1 -
> /ai-prompts-md - as we have done in previous homeworks

### What was missing

- Nothing — completed with the initial prompt.

### Follow-up prompt(s)

> None.

## Problem 2 — Study the Campus Customs Database

### Initial prompt

> problem 2: study the campus customs database 
>
> * open up the database and look through each table and its fields. 
> * Create a copy of the original file in the data folder - later problems will update that working copy
> * Study the three open tickets available to understand how they link to the tables 
> * start output/harness.md (as we have done in previous homeworks). In it, for each of the tables you reviewed in the data, list the fields and one short line on why that table is relevant for the agents. We will grow this harness file in later problems

### What was missing

- Nothing — completed with the initial prompt.

### Follow-up prompt(s)

> None.

## Problem 3 — Build the Initial MCP Server

### Initial prompt

> Problem 3: Build the initial MCP server.
>
> Use what you learned from the database review in Problem 2 to create an MCP server in `mcp_server/` using FastMCP, pointed at `data/campus_customs_new.db`.
>
> We will add more tools to this later but for this problem we are focusing on 3 tools which should help unlock the tickets you saw in problem 2 
>
> Before choosing tools, review the actual schema and tickets 101, 102, and 103. Implement exactly three useful tools based on what those tickets need. Choose clear, descriptive names and use only real database fields and records—never invent data. Keep these initial tools read-only and return a clear result when information is missing. 
>
> Do not connect or run the MCP server in this problem.
>
> Update `output/harness.md`, preserving the existing content. For each tool, include:
>
> * Tool name and what it does.
> * The specific table(s) it reads.
> * Which ticket(s) it helps unlock: 101, 102, or 103.
> * One sentence explaining how its information helps resolve that specific ticket. Refer to the actual ticket’s needs; avoid vague descriptions like “reads inventory.”
>
>
> Also create a short `mcp_server/README.md` explaining the server’s purpose, its database path, and its three tools.
> Keep the implementation simple, preserve the original database, and follow our existing prompt-log process. When finished, briefly explain why you chose these three tools.

### What was missing

- It didn't say whether the tools should be general-purpose or map one-to-one to tickets. I compared both options and kept the general-purpose tools.

### Follow-up prompt(s)

> dont make any changes yet - if we wanted to have each tool correspond to one ticket only - what would those 3 tools look like - just chat with me

> feel free to log it as a follow up prompt under problem 3 in the aipromptsmd 
>
> I agree with you - lets stick with the current general purpose tools

## Problem 4 — Add the MCP Server to the Vibe Coder and Test Each Tool

### Initial prompt

> okay problem 4: Add the MCP server to the vibe coder and test each tool
>
> * add the MCP server from problem 3  to this project's Claude Code configuration so you can call the tools
> * save the connection json text in .mcp.json at the project root (or however else you prefer to save local MCP server lists) 
> * use the actual server entry point and python env and ensure it accesses the database copy  
> * Once you are connected, test each of the three tools through claude code's MCP connection using relevant inputs from the tickets. Calling python functions directly does not count as testing the connection 
> * save the test evidence in output/mcp.smoke.json. For every tool, include the prompt requesting the test (you can use this prompt), the tool name, the arguments used, and the actual tool output 
> * verify the returned values against database - do not invent outputs or mark unexecuted tests successful.
> * if i need to restart claude or approve the mpc connection before you can call the tools, tell me what exactly to do and pause until the connection is available - then finish the tests and save the evidence

### What was missing

- Nothing — completed with the initial prompt. A full restart of Claude loaded the server; no approval prompt appeared.

### Follow-up prompt(s)

> i restarted fully but I got no approval request for campus customs

> why does it sit outside hw5 and contain absolute paths?

## Problem 5 — Build the Agent Team and Grow the MCP Tools

### Initial prompt

> okay. lets move on to problem 5: build the agent team and grow the MCP tools
>
> We are going to build the agentic team for campus customs using pydantic AI. We will build 5 agents: Boss, Inventory, Accounting, Facilities, and Customer Service. 
>
> * Create the 5 agents under backend/ 
> * Put data types in backend/models.py
> * put the agent prompts in backend/prompts/ - creating one detailed prompt file per agent
> * Each prompt should explain the agents responsibilities, relevant shop rules, tools, when to delegate, how to handle missing information, and when its work is finished
> * Tailor these to the actual tickets and database rather than using generic role descriptions
> * implement full connectivity - every agent must be able to delegate to any of the other four agents and receive their results. Include working agent loops and structured models for tasks, delegation, and results  
> * use the portkey_api_key and only gpt-6-luna for every agent 
>
>
> MCP tools and shop rules:
>
> * review tickets 101-103 and add any tools the agents need to the MCP server so they can work on the open tickets 
> * All agents must get shop facts and perform shop database actions through the MCP server using the copy database
> * Do not create a separate tool layer or direct database access in the agents that bypasses the MCP
> * Preserve the original database and enforce the rules below: 
>
>
> Rules: 
>
> * Use `desk.date_today` as the shop’s date.
> * Read vendor lead times from the database; vendors cannot ship while they have an open unpaid invoice.
> * Payments require explicit human approval. An agent cannot approve its own payment, and a payment tool must reject unapproved requests.
> * Refuse payments when cash is insufficient; never allow negative balances or duplicate payments.
> * Update the relevant database records after successful actions.
> * No incoming revenue is modeled.
> * Customer messages remain drafts on the board; do not contact real customers or vendors.
> * Never invent missing shop information.
>
> Audit trail
>
> * append records to output/audit_trail.json for every agent-loop step, preserving earlier runs. Record timestamps, run/ticket identifiers, agent, action or delevation, tool name and arguments when applicable, a concise result or error, approval status when relevant, and stop reason 
> * Keep the file valid JSON and project against concurrent writes losing entries
> * Do not log API keys 
> * add configurable limits on model requests, token use, and delegation dept or steps to prevent runaway conversations. Stop clearly when a limit is reached 
>
>
> Documentation
> Extend output/harness.md (preserving existing content)
>
> * list all 5 agents and their roles
> * list every MCP tool, including new tools with all the tables it reads or undates
> * add a short safety section covering human approval, customer privacy, safe database changes, untrusted ticket content, and token/delegation limits. 
>
>
> update mcp_server/README.md so its tool list matches what we have at this point and as always, follow our existing prompt log process 
>
> Check imports, configuration and the key safeguards without running a full ticket resolution session or making any unapproved payments. Report what you verified, anything not yet tested, and how I can run the team. keep this scoped to problem 5 - do not build the dashboard or any other later problems yet.

### What was missing

- Nothing — completed with the initial prompt.

### Follow-up prompt(s)

> None.

## Problem 6 — Plan the Three Tickets

### Initial prompt

> Problem 6: Plan the three tickets 
>
> Before wiring the backend, we need to write down what we expect the team to do on each open ticket 
>
> Review tickets 101, 102, and 103 and their relevant database facts through our MCP tools. Also review the agents and available tool names from Problem 5.
>
> Create `output/desk_tickets.html` as a self-contained HTML page I can open by double-clicking, without a running server. Include five working tabs: Ticket 101, Ticket 102, Ticket 103, Cash, and Reflection.
> For each ticket, fill in an Expected section with:
>
> * A brief summary of the ticket.
> * Which agent the Boss should call first and why.
> * The specific sequence of expected delegations: who asks whom, what they need, and why. Include specialist-to-specialist delegation where useful.
> * The actual MCP tool names expected at each stage and what information or action each provides.
>
> Make each plan specific to the ticket and grounded in database facts. Only involve relevant agents—do not send every specialist to every ticket. Where a step depends on a finding or human approval, explain that condition rather than assuming it succeeds.
> Leave an empty Actual section on each ticket tab for later comparison. Leave Cash and Reflection marked “Coming later.”
> Use clear, plain language and a simple, readable layout. These are predictions, not execution results: do not run the agent team, resolve tickets, make payments, or change the database. Read-only MCP calls to inform the plans are fine.
> Follow our existing prompt-log process. When finished, give me the file path and briefly summarize each ticket’s proposed delegation sequence so I can review the reasoning.

### What was missing

- Nothing — completed with the initial prompt.

### Follow-up prompt(s)

> None.

## Problem 7 — Backend Routes

### Initial prompt

> onto Problem 7: Backend routes
>
> Now we want to add the FastAPI backend routes for our future React dashboard.
>
> Build on the existing agents and MCP server. In `backend/main.py`, create the FastAPI app with routes that:
>
> * Return tickets 101–103 and whether each is open or resolved.
> * Accept a ticket ID and run our existing agent team on that ticket.
> * Return recent agent events, including agent messages, delegations, and tool usage, so the dashboard can refresh.
> * Approve and execute a pending payment or purchase after a human clicks Approve.
> * Return the current checking balance from `cash_accounts`.
> * Reset `data/campus_customs_new.db` from the untouched original database for a fresh run.
>
>
> Choose clear route names and request/response models. Run agent work without blocking the dashboard from fetching events or submitting approvals, and prevent duplicate simultaneous runs on the same ticket.
>
> Approval and database behavior
>
> * Agents should only prepare payment/purchase requests. 
> * The human approval route is what triggers the actual cash change through the MCP tools. Ensure agents cannot bypass that route or approve their own requests. 
> * Reuse the existing safeguards: sufficient funds, no negative balances, no duplicate payments, and consistent updates to the relevant records. Return clear errors for invalid tickets or approval requests.
> * Keep shop data access and actions through MCP rather than introducing a parallel shop-tools layer. Make pending approval details available to the future dashboard, including the request ID, amount, payee, purpose, and ticket.
> * The reset route must preserve the original database and the append-only audit trail, clear stale pending approvals and run state, and refuse to reset while agents are actively running.
>
>
> Run and document
>
> * Make sure the backend starts from inside `backend/` with:
>
> `uvicorn main:app --reload --port 8000`Check that imports, database paths, prompt paths, and MCP startup work from that directory. Start the server and verify the read-only routes. Test payment/reset safeguards using an isolated test database if needed; do not approve actual pending requests or run a full ticket-resolution session for this step.
> In `output/harness.md`, preserve existing content and add one line per route showing its HTTP method, URL, and purpose. Follow our prompt-log process.
> Keep this scoped to the backend; do not build the React dashboard yet. Finish with a brief summary of the routes, checks performed, and any manual steps I need to take.

### What was missing

- Nothing — completed with the initial prompt.

### Follow-up prompt(s)

> None.

## Problem 8 — Campus Customs Dashboard (React + Vite + TypeScript)

### Initial prompt

> Problem 8: Build the Campus Customs dashboard in frontend/ using React + Vite + TypeScript. Connect it to the backend routes from Problem 7 and use real data throughout, not placeholder tickets, balances, or activity.
>
> Functionality:
>
> * List all three tickets and their current status.
> * Let me select a ticket and start the agent team on it.
> * Show each agent and what they’re saying/doing while it runs, including delegations and MCP tool calls. Refresh this as the run progresses.
> * Mark tickets resolved when the backend confirms resolution—not when a run fails or is still awaiting approval.
> * Show a short summary of what each agent did on the selected ticket. If someone wasn’t involved, say so.
> * Let me approve a payment or purchase, showing the amount, payee, purpose, and ticket before I click.
> * Show the checking balance and refresh it after successful payments.
> * Include loading, empty, connection-error, and failure states, and prevent duplicate Run or Approve clicks.
>
>
> Layout:
> I want this to feel like a polished campus shop operations desk—professional, warm, and easy to follow.
> Use a compact header with “Campus Customs,” the subtitle “Operations Desk,” and a connection indicator. Below that:
>
> * Left: a “Ticket inbox” with the three ticket cards, showing ID, title, short description, and status. Make the selected ticket clearly stand out.
> * Center: the selected ticket’s details and a clear “Run team” button, followed by the agents and their live activity.
> * Right: the checking balance, pending approvals, and a summary of the selected ticket’s outcome.
>
>
> Keep the balance and approvals easy to find. Adapt the layout sensibly for smaller screens.
>
> Style:
>
> * Use a warm ivory background, white cards, dark navy text, and Yale blue buttons and accents. Use muted green for success/resolved, amber for awaiting approval, and red for errors.
> * Use Georgia or a similar serif for the Campus Customs name to give it a collegiate feel, with a clean sans-serif for the rest. Keep the cards softly rounded, with subtle borders/shadows and enough spacing that the page doesn’t feel crowded.
> * Add a few shop-inspired details: ticket IDs that look like receipt labels, a dashed divider on approval cards, and a small “Resolved” stamp with a checkmark. Avoid flashy gradients, excessive animation, or unnecessary charts.
>
>
> Agent presentation:
> Show five compact agent cards above a chronological activity feed. Each card should have the agent’s name, a simple icon or initials, current status, and latest action.
> Give each agent a consistent identity:
>
> * Boss: navy
> * Inventory: teal
> * Accounting: muted purple
> * Facilities: burnt orange
> * Customer Service: blue
>
> Use those colors in their icons and labels without making the whole dashboard overly colorful. Keep names and status text visible too.
>
> In the activity feed, show who acted, when, and what they did. Make handoffs clear—for example, “Inventory → Accounting,” followed by what they’re asking for. Show readable messages by default and let me expand technical tool arguments/results. Keep activity tied to the selected ticket and don’t keep jumping to the bottom if I’m reading earlier messages.
>
> Approvals should stand out with an amber accent and a clear button like “Approve $450 payment,” using the actual amount. Show confirmation after success and the updated balance, or a clear error if it fails. Never automatically approve anything.
>
> Setup and documentation:
>
> * Connect the frontend to http://localhost:8000 and configure backend CORS for the Vite origin, usually http://localhost:5173. 
> * Start the frontend with npm run dev from frontend/. Keep API keys on the backend.
> * Write output/design.md explaining the layout, agent identities, how resolved tickets and cash appear, and why the creative choices make the dashboard pleasant to use.
> * Preserve output/desk_tickets.html and follow our prompt-log process. Check that the frontend builds and displays real backend data, and inspect it in a browser if possible. 
> * Then tell me how to launch it and test a ticket myself. Don’t run the full team or approve payments for me yet.

### What was missing

- It didn't say which shell the launch commands were for. The first instructions used `&&`, which Windows PowerShell 5.1 doesn't support, so they had to be rewritten as separate PowerShell commands.
- It didn't account for PowerShell's script execution policy, which blocks `npm.ps1`. The frontend had to be started with `npm.cmd run dev` instead.
- It didn't say what the dashboard should show after a human pays. The ticket stays "awaiting approval" until the Boss runs again, so a hint telling the user to rerun the team was added.

### Follow-up prompt(s)

> i tried to start the back and front end but didnt work - not sure why

> backend terminal run was successful - frontend didnt work see image

> [screenshot only: `npm.cmd run dev` run from the `AI Foundations` folder failed with ENOENT, could not find package.json]

> I did it and ran the test for ticket 102. I approved the payment - why does the ticket status or outcome still say waiting for approval

> Yes, add a hint on the dashboard when a ticket is waiting on approval but all its payments are already paid, telling me to run the team again so the Boss can close it.

## Problem 9 — Run and Resolve All Three Tickets

### Initial prompt

> Problem 9: Run and resolve all three tickets, then document the actual results.
>
> First, reset data/campus_customs_new.db from the untouched original database and record the starting checking balance. Preserve the existing audit trail. Start the backend and dashboard, and tell me how to run tickets 101, 102, and 103 on the board.
>
> I’ll run them and approve payments/purchases through the dashboard when requested. Don’t approve anything on my behalf. Don’t reset between tickets—we need to track the cash across the whole run.
> Help troubleshoot any errors so all three tickets can genuinely resolve. Don’t manually mark tickets resolved or invent successful results. Keep using only gpt-6-luna through Portkey for the agents, and append real activity to output/audit_trail.json.
>
> Once I’ve completed the runs, use the actual logs and database records to finish these outputs:
>
> 1. Update output/desk_tickets.html:
>
> * Preserve the Expected sections exactly as they are.
> * Fill each ticket’s Actual section with which agents worked, what they delegated to each other, and which MCP tools they used.
> * Fill the Cash tab with the starting checking balance, each payment/purchase grouped by ticket with its amount and purpose, each ticket’s total cash change, and the ending balance.
> * If a ticket had no cash impact, explicitly say so.
> * Verify that starting cash minus all completed payments equals ending cash, and that the ending amount matches cash_accounts in the working database. Don’t count pending or failed payments, or count the same payment twice.
> * Leave the Reflection tab for the later problem.
>
> 2. Save output/resolved_tickets.json with, for each ticket:
>
> * Ticket ID.
> * Final status.
> * Short outcome.
> * What each agent contributed.
> * Any human approvals, including what was approved and the amount.
>
> 3. Create output/resolved_board.html:
>
> * A page I can open by double-clicking, with an actual screenshot of the React dashboard for each resolved ticket: 101, 102, and 103.
> * Clearly label each screenshot and embed the images so the page works without the servers running.
> * If you can’t capture screenshots yourself, tell me exactly what to capture and where to save them. Don’t substitute a recreated dashboard or mockup.
>
> Finish output/harness.md so it covers the database tables, all MCP tools, all five agents, API routes, dashboard, and safety rules. Preserve existing content and follow our prompt-log process.
> Start with the reset and startup steps, then pause for me to run the tickets and approve requests. Afterward, complete the documentation from the real evidence and flag any missing evidence or cash discrepancies.

### What was missing

- The agent prompts never defined when an out-of-stock order counts as resolved. After the invoice was paid, the Boss blocked ticket 101 to wait for a customer reply that can never arrive, because drafts are never sent.
- The same gap applied to the discount request: ticket 103 was first blocked waiting for a reply or more funds.
- The prompt didn't plan for audit-file locking on Windows/OneDrive, which crashed one run and had to be fixed in `audit.py`.
- Claude's preview pane couldn't reliably capture full-size screenshots, so the user captured and attached all three.

### Follow-up prompt(s)

> 102 was resolved. 103 is happening right now. 101 was blocked - see image

> i ran 103 and that was blocked as we expected due to low cash. now what are you suggesting for 101

> Yes, add the completion rules to the Boss and Accounting prompts, then tell me exactly how to rerun 101 and 103.

> before you do - explain to me why the $8 will be charged for 101

> yes

> I reran 101 and 103 and both are resolved. Please collect the evidence and finish the documentation.

> I took the three screen shots - i have attached them here. save them with the right title as you need and proceed

## Problem 10 — Reflection

### Initial prompt

> Problem 10: Reflection 
>
>  Fill the Reflection tab in output/desk_tickets.html. Keep the existing Expected, Actual, and Cash sections intact. First review those sections, output/resolved_tickets.json, the audit trail for our three-ticket run, and the actual agent/tool implementation. Ground the reflection in what our app really did.
>
> Answer these questions thoroughly, in a natural, straightforward tone:
>
> 1. How did the agents perform on each ticket?
> Discuss tickets 101, 102, and 103 separately. Explain what worked, what didn’t, and why, using the actual delegations, tool calls, outcomes, and payment approvals. Don’t assume “resolved” automatically means the process was efficient or correct. Make sure to include and reflect on the challenges I faced in resolving the tickets the first time around 
> 2. How did Actual compare with Expected for each ticket?
> Compare the original plan with the real sequence: who the Boss called first, which agents participated, how they delegated, and which tools they used. Explain whether differences were useful adaptations or unnecessary work. Don’t rewrite the original expectations to match the results.
> 3. What would have been simpler with one agent and tools?
> Identify specific parts of our tickets where one agent could have handled the same work with fewer handoffs. Explain the tradeoff using examples from our runs, including where specialist roles did help. Don’t claim measured time or token savings unless we actually recorded them.
> 4. What three new Campus Customs problems could this team solve with its existing tools?
> Give three concrete, distinct scenarios. For each, explain which agents and actual MCP tools would handle it, how the workflow would work, and any approval or cash constraints. Connect each scenario to a capability demonstrated in tickets 101–103. These should be new situations, not just retellings of those tickets.
> 5. What three new Campus Customs problems could it NOT solve with its existing tools?
> For each, explain the specific missing capability or data, what additional tools/integrations would be needed, and which existing or new agent would use them. Tie the limitation back to our app and what the ticket runs demonstrated. Distinguish drafting or recommending an action from actually being able to carry it out.
>
>
> Every answer needs Campus Customs specifics. Use the ticket tabs and Cash tab on this same page as evidence, referencing ticket IDs, actual tool names, delegations, and dollar amounts where relevant. Add links to the relevant tabs if practical. For the hypothetical scenarios, clearly label them as hypothetical and connect them to evidence from the real runs.
>
> Check that any financial claims match the Cash tab and recorded transactions. Don’t invent errors, approvals, agent contributions, or personal reactions. If evidence is missing or contradictory, flag it rather than filling in a plausible story.
> Make the Reflection tab readable with clear question headings and ticket-specific subheadings. Be detailed enough to explain the reasoning, but avoid generic essays about multi-agent systems. Follow our prompt-log process and tell me if there’s anything I need to clarify or review.

### What was missing

- Nothing — completed with the initial prompt.

### Follow-up prompt(s)

> None.

## Problem 11 — Submit to GitHub

### Initial prompt

> [Attached image: the expected `hw5/` file layout — AI_prompts.md, requirements.txt, .env.example, .gitignore, .mcp.json, README.md, data/ (campus_customs.db, campus_customs_new.db), mcp_server/ (server.py, README.md), frontend/, backend/ (main.py, models.py, prompts/ with boss.md, inventory.md, accounting.md, facilities.md, customer_service.md), output/ (harness.md, mcp_smoke.json, desk_tickets.html, design.md, resolved_tickets.json, resolved_board.html, audit_trail.json, github_url.txt)]
>
> Problem 11: Submit to GitHub
>
> Prepare this homework for submission and push it to a public GitHub repository. I’ve attached the expected file layout. Check our project against it and make sure all required files are included. Preserve the completed ticket results, reflection, screenshots, and audit trail—don’t reset the working database or rerun the agents.
> Update the root README.md with clear setup instructions:
>
> * Install the Python and frontend dependencies.
> * Set up the environment variables using .env.example.
> * Copy the original database to the working copy when a clean run is needed.
> * Start the MCP server, FastAPI backend, and React dashboard.
> * Reset the working database before a full three-ticket run, not between individual tickets.
> * Explain where to find the results and reflection.
>
>
> Make sure requirements.txt and the frontend dependency files are complete. Include both data/campus_customs.db and data/campus_customs_new.db, as required.
>
> Do not publish my real .env or any API keys. Include .env.example with placeholders, and make sure .gitignore excludes secrets, virtual environments, node_modules, and caches without excluding the required databases or outputs. Check the files being committed, including logs and .mcp.json, for accidentally included credentials. If there’s existing Git history, check that for secrets too without printing their values.
>
> Check whether this project is already a Git repository, what remote it uses, and whether GitHub access is authenticated. If it’s already connected to the correct homework repository, use that. Otherwise, create a new public repository called campus-customs-hw5 under my account. Don’t overwrite or reuse an unrelated homework repo.
>
> If you need me to sign in or complete a GitHub authorization step, tell me exactly what to do. Otherwise, go ahead and commit and push the completed project.
> Put the actual repository URL in output/github_url.txt and make sure that file is committed and pushed too. Verify that the repository is public and all required files are present on GitHub, including both databases and the completed output files.
>
> Follow our prompt-log process. When finished, give me the exact repo URL to submit to Canvas

### What was missing

- The GitHub CLI wasn't installed and no GitHub account was signed in on this machine, so the empty public repository had to be created by hand on github.com.
- The expected layout named the smoke-test file `output/mcp_smoke.json`, while Problem 4 had saved it as `mcp.smoke.json`, so it was renamed.

### Follow-up prompt(s)

> https://github.com/simrahpalla/campus-customs-hw5.git
