# Campus Customs Operations Desk: Design

The dashboard (`frontend/`, React + Vite + TypeScript) is where a human watches the five-agent team work the shop's tickets and approves the payments the agents prepare.

Everything on screen comes from the FastAPI backend at `http://localhost:8000`: tickets, statuses, balances, approvals and agent activity. Nothing is mocked.

---

## 1. Layout

A compact white header carries:
- **The name and subtitle:** **Campus Customs** in Georgia, with *Operations Desk* in small caps beneath it.
- **A crest:** a small Yale-blue shield with "CC" on it.
- **The shop date:** from `desk.date_today`, so you always see the shop's business date rather than today's real date.
- **A connection pill:** green **Connected**, amber **Connecting…** or red **Offline · retrying**.

Below the header there are three columns on a warm ivory page:

| Left: Ticket inbox | Center: Ticket and team | Right: Money and outcome |
|---|---|---|
| Three ticket cards, each with a receipt-label ID, title, requester and short description, and a status chip. The selected card has a Yale-blue outline and left bar. | The selected ticket's facts (requester, received time, item/lease/invoice, the requester's own words) and a large **Run team** button. Below that, **The team**: five agent cards above a chronological **Activity** feed. | **Checking balance** (large serif number), **Pending approvals** (amber cards), and **Outcome** for the selected ticket. |

**Sticky columns:** the inbox and the right column stay in place while the center scrolls. The balance and approvals are always one glance away, even while you read a long activity feed.

**Smaller screens:**
- **Under 1240px:** the right column moves to the top as a row of cards (balance, approvals, outcome), with the inbox and the center below.
- **Under 820px (phones):** everything stacks in one column. The inbox becomes a short horizontal strip of swipeable ticket cards, followed by balance and approvals, then the ticket and team. The Run button spans the full width, and nothing scrolls sideways.

---

## 2. Agent identities

Each agent keeps one color everywhere: the avatar, the agent's name in the feed, and the top edge of its card. Everything else stays navy-on-white, so the page doesn't become a rainbow.

| Agent | Color | Initials | Role line |
|---|---|---|---|
| Boss | navy `#1d2b4f` | BO | Assigns work, decides |
| Inventory | teal `#1f7a72` | IN | Stock & vendors |
| Accounting | muted purple `#6e5a8e` | AC | Cash & payments |
| Facilities | burnt orange `#b4572a` | FA | Lease & rent |
| Customer Service | blue `#2f6db5` | CS | Customer drafts |

**Agent cards:** each shows the name, initials, role, current status and latest action. Possible statuses are *Idle, Working…, Waiting on Accounting, Done, Awaiting approval, Blocked, Needs info, Failed* and *Stopped*. Status is always written in words, not shown by color alone. An agent the latest run never called reads **"Not involved in this run."**

**Activity feed** (newest at the bottom):
- **Messages:** "Inventory" in teal, then the agent's words in a speech bubble, with the time on the right.
- **Handoffs:** a blue-tinted row reading **Inventory → Accounting**, followed by *"Asks: …"* with the actual request. Replies come back as **Accounting ↩ Inventory** with a status chip and the answer.
- **Tool calls:** in plain language ("Checked stock & pricing"), with the MCP tool name as a small code tag. The technical arguments and result sit behind **Show arguments & result**.
- **Run boundaries and stops:** each run starts and ends with a centered divider. Run limits and failures appear as red rows.
- **Your decisions:** approvals and rejections appear as human rows.
- **Scrolling:** the feed only follows new activity while you're already at the bottom. If you scroll up to read, it stays put and shows a **"3 new ↓"** button instead.

---

## 3. How resolved tickets appear

**What counts as resolved:** a ticket shows as resolved only when the backend reports `status = "resolved"`. Only the Boss agent can set that, through MCP. A run that finishes, fails or stops never resolves a ticket on its own.

**When a ticket is resolved:**
- **Status:** the chip turns muted green, and a small tilted **✓ Resolved** rubber stamp appears on the inbox card, the ticket header and the Outcome panel.
- **Run button:** it is replaced by a disabled **Resolved** button.

**When it isn't resolved:**
- **Awaiting approval:** the ticket shows an amber **Awaiting approval** chip. The center panel explains that it is "waiting for your approval".
- **Failed or stopped runs:** these show a red notice ("The last run stopped early (max_delegations)…"), and the ticket stays open.
- **Paid but not yet closed:** paying doesn't change a ticket's status; only the Boss can. So when a ticket still reads *Awaiting approval* but nothing is pending and at least one payment is paid, a green notice says *"Payment done: $2,400.00 to Elm City Properties… Run the team again so the Boss can confirm the payment and close the ticket."* The button becomes **Run team again**, and the Outcome panel repeats the hint under the Boss's decision. The ticket only shows as resolved after that run.

---

## 4. How cash and approvals appear

**Checking balance:**
- **The balance:** the current `cash_accounts` balance in a large serif figure, with the "as of" date. It flashes green briefly after a payment.
- **Pending requests:** when requests are pending, two lines show **Awaiting approval −$3,240.00** and **If all approved $160.00**, so you can see the cash pressure before approving anything.

**Pending approvals:**
- **Card layout:** each request is an amber-accented card showing the **amount**, **payee**, **purpose** (the agent's reason), **ticket** (number and subject), purchase details if any, and **who requested it**.
- **The button:** below a dashed tear-off line sits a specific Yale-blue button such as **"Approve $840.00 payment"** or **"Approve $264.00 purchase"**, plus a quiet **Reject** button.
- **Never automatic:** nothing is approved without your click, and you must enter your name in **Approving as** first. Your name is recorded as `payments.approved_by`, and the backend refuses agent names.
- **After success:** a green confirmation reads *"Paid $840.00 to Bulldog Print Co for ticket #101. Checking balance is now $2,560.00."* The balance, approvals, tickets and feed refresh immediately.
- **After an error:** a red message appears inside that card, e.g. *"Approval failed: Insufficient cash…"* or *"…already paid"*.
- **Duplicate clicks:** each card's buttons lock while its request is in flight. The backend also guarantees one payment even if two clicks arrive at once.
- **History:** paid and rejected requests collapse into a **Decided requests** list.

**Outcome panel** (selected ticket):
- **Status and decision:** the status chip and stamp, and the Boss's final decision.
- **Each agent:** what each of the five agents did, or that it wasn't involved.
- **Payments:** this ticket's payment requests and their status (*Awaiting you* / *Paid* / *Rejected*).
- **Drafts:** customer reply drafts, labelled *saved on the board, never sent*.

---

## 5. States

| State | What you see |
|---|---|
| Loading | Placeholder ticket cards, "Loading balance…", "Loading approvals…", "Loading the desk…" |
| Empty | "No activity yet. Press **Run team**…", "Nothing waiting for approval…", "The team hasn't worked this ticket yet." |
| Connection error | Red header pill and a banner explaining how to start the backend. It retries automatically, and Run and Approve are disabled until the connection is back. |
| Failure | Run start errors (e.g. "already being worked", 409) and approval errors appear in red next to the button that caused them. Stopped runs get a red notice and red feed rows. |
| Running | The ticket chip reads "Team working…", the Run button shows a spinner and "Team is working…", and agent cards pulse softly. Polling speeds up from every 4s to every 1.5s. |

**Duplicate clicks:** Run is disabled while a start request is in flight or the ticket is already running. The backend also returns 409 for a second run on the same ticket.

---

## 6. Why these choices

- **It looks like a campus shop counter.** The warm ivory page and Georgia wordmark feel collegiate rather than corporate. Ticket IDs look like dashed paper receipt labels with a punched hole, approval cards have a dashed tear-off line, and resolved tickets get a rubber stamp. These small details make an AI control panel feel like a shop desk while keeping the layout businesslike.
- **Color carries meaning, not decoration.**
  - Yale blue is only for actions you take (Run team, Approve) and selection.
  - Green only means done, paid or resolved.
  - Amber only means "needs a human".
  - Red only means something went wrong.
  - The five agent colors appear only on avatars, names and a thin card edge.
- **Money is always visible.** The balance and approvals sit in a sticky column (or at the top on smaller screens), because approving a payment is the one action with real consequences. Each approval card shows everything needed to decide (amount, payee, purpose, ticket, requester) right above a button that names the exact amount.
- **It's readable first, technical on demand.** The feed shows sentences, such as who asked whom for what and what came back. Raw MCP arguments and JSON results are one click away for checking the agents' work, without cluttering the default view.
- **It's calm and honest.** There are no gradients, charts or flashy motion: only a small spinner, a gentle pulse while agents work, and a brief green flash on the balance. All of these are disabled when the system's "reduce motion" setting is on. A ticket never looks resolved unless the backend says so, and money never moves unless you click.
- **It's accessible.**
  - Statuses are written in words alongside color.
  - Buttons have visible focus rings.
  - The feed and balance announce updates politely to screen readers.
  - Text contrast stays high (navy on white or ivory).
