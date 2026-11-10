# Spec Delta

## MODIFIED Requirements

### Requirement: Context menus on member and room rows
Right-clicking (or activating the explicit `⋯` menu button on) a member or room row SHALL open a context menu with the actions applicable to that row: open inspector tabs (`pulse`, `recall`, `cognition`), dispatch or review tickets, bind a DSH session, rename/configure member (`profile-update`), edit room goal and subscribed members (`room-update`), clear member memory, export state, and remove member or room. Primary left-click on a row MUST select the row rather than opening the context menu. Actions that destroy state SHALL require explicit confirmation before executing.

#### Scenario: Member context menu actions
- **WHEN** the user right-clicks a member row or clicks its `⋯` menu button
- **THEN** the menu lists inspector tab openers, ticket dispatch, session binding, rename/configure, clear memory, export, and remove actions applicable to that member

#### Scenario: Destructive action confirms first
- **WHEN** the user invokes a destructive action (remove member, remove room, clear memory, or reset)
- **THEN** a confirmation bar is presented and the mutation executes only after explicit confirmation

### Requirement: Ticket dispatch, observe approval, and Watchdog intervention actions
The team surface SHALL allow users to dispatch a new Ticket (`ticket-add` / `trigger-intake`) from the Resident Router Console or directly to a specific Worker, approve an `observed` draft Ticket into an active Worker assignment (`ticket-approve`), complete/merge an active Ticket (`ticket-complete`), and resolve a Watchdog-stalled Ticket via retry, reassign, or dismiss (`watchdog-resolve`). Dispatching from the Resident Router without a pinned Worker ID SHALL automatically route the Ticket to the best-matched or least-loaded Worker (`role: 'member'`) rather than assigning `workerId` to `lead`, and live poll cycles SHALL evaluate `watchdog-check` automatically. All dispatch mutations SHALL support idempotent `requestId` deduplication through the host Outbox.

#### Scenario: Router dispatch routes ticket to an eligible Worker instead of Lead
- **WHEN** the user dispatches a ticket from the Resident Router Console with auto-routing selected and at least one Worker exists
- **THEN** the Router assigns the Ticket to the matched or least-loaded Worker (`role: 'member'`), binds or updates its active workload, and does not trap the Ticket on `lead`

#### Scenario: Approve an observed ticket for execution
- **WHEN** the user clicks approve on a speculative/observed Ticket
- **THEN** its Mandate transitions to `authorized`, the Ticket transitions to `working` on the assigned Worker, and duplicate submissions with the same `requestId` are deduplicated

#### Scenario: Complete an active ticket and record deliverable
- **WHEN** the user marks an active Ticket complete (`ticket-complete`) or its bound Worker session completes the assigned task
- **THEN** the Ticket transitions to `ready` (or `merged`), records its deliverable summary, and generates a Steward handoff checkpoint and pending learning card

#### Scenario: Resolve a Watchdog-stalled ticket
- **WHEN** the external Watchdog marks a ticket as `stalled` during live evaluation and the user triggers retry, reassign, or dismiss
- **THEN** the ticket either resets its retry/stall state to resume work, reassigns to another Worker, or closes cleanly
