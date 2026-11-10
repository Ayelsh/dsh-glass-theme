# Spec Delta

## ADDED Requirements

### Requirement: Three-way segmented control organizes inspector views
The member inspector SHALL organize its views under a 3-segment Apple Segmented Control (`pulse` for Live Thinking & Tool Stream, `recall` for Tickets & Chain of Recall, and `cognition` for Side Chat, Checkpoints, Learning Cards, and Memory) with a horizontally traveling selection pill rather than stacking all sections simultaneously in a narrow column.

#### Scenario: Switching inspector segments moves the selection pill
- **WHEN** the user selects `pulse`, `recall`, or `cognition` in the inspector's segmented control
- **THEN** the active selection pill travels smoothly to the chosen segment and only that segment's content view is rendered

## MODIFIED Requirements

### Requirement: Chain of Recall panel provides Inline summary and Spill continuation
The detail inspector SHALL provide a Super-agent Recall & Tickets surface (`recall` segment) that displays active and historical Tickets (`tkt_*`), Triggers (`trg_*`), Mandates (`mnd_*`), and Watchdog alerts with an **Inline** concise summary and an expandable **Spill** detail view showing the full Chain of Recall reference graph (`trg_* -> thd_* -> mnd_* -> tkt_* -> ses_*`). When inspecting a Worker, only Tickets assigned to that Worker (`workerId === member.id`) SHALL be listed; when inspecting the Resident Router (`lead`), the global routing queue across all Workers SHALL be displayed.

#### Scenario: Inspect Chain of Recall references on a ticket
- **WHEN** the user opens the Recall/Tickets segment and expands a Ticket's Spill handle
- **THEN** the inspector reveals the full linked Chain of Recall IDs (`trg_*`, `thd_*`, `mnd_*`, `ses_*`), pass-through context events, and deliverable details

#### Scenario: Worker ticket list does not leak unassigned or other Workers' tickets
- **WHEN** the user inspects a specific Worker in the `recall` segment
- **THEN** only Tickets whose `workerId` equals that Worker's ID are shown, and unassigned tickets do not duplicate across every member

### Requirement: Side chat answers from a read-only member snapshot without polluting main state
The inspector SHALL offer a side-chat (`/side` / BTW) surface inside the `cognition` segment where the user can ask a quick question of the selected member. Submitting a question (`side-send`) SHALL synthesize an immediate assistant reply derived from a read-only snapshot of that member's live thinking stream (`reasoning`), recent tool executions (`tool_use` / `tool_result`), active tickets, memory, and latest checkpoint, appending both question and reply only to the member's side-chat transcript and NEVER mutating the main conversation or active Worker tickets.

#### Scenario: Quick ask in side chat receives a snapshot-grounded reply
- **WHEN** the user sends a question through the side-chat input for a selected member
- **THEN** both the user's question and a reply grounded in the member's live reasoning/tool snapshot and ticket state appear in the side-chat transcript while the main conversation and active tickets remain unchanged

#### Scenario: Side chat selection follows the roster
- **WHEN** the user switches the selected member in the roster
- **THEN** the side-chat surface displays and targets the newly selected member's isolated side-chat transcript
