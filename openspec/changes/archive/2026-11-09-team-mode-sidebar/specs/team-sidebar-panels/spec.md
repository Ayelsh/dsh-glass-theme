# Spec Delta

## Purpose

Defines the companion Super-agent cognition and observability surfaces reachable from the team sidebar: long-term memory, auto-extracted learning cards, Steward handoff checkpoints, Chain of Recall (`trg_*` / `thd_*` / `tkt_*` / `ses_*` Inline & Spill inspector), and the read-only snapshot `/side` (BTW) responder.

## ADDED Requirements

### Requirement: Memory panel shows long-term knowledge
The team sidebar SHALL offer a memory panel for a selected member that lists accumulated long-term facts and notes with add, inline edit, remove, and clear controls. Destructive removals SHALL require confirmation.

#### Scenario: View and edit member memory
- **WHEN** the user opens the memory panel for a member and adds or edits an entry
- **THEN** the panel persists and lists that member's updated memory entries across reloads

#### Scenario: Remove a memory entry with confirmation
- **WHEN** the user removes a memory entry and confirms
- **THEN** the entry disappears from the panel and is no longer listed on reopen

### Requirement: Learning cards support manual and automated post-ticket extraction
When new knowledge is proposed manually or automatically extracted by the Steward upon Ticket completion (`ticket-complete`), the learning panel SHALL surface it as a pending learning card (`status: 'pending'`, referencing its source `tkt_*` when applicable) with confirm and discard controls.

#### Scenario: Confirm an auto-extracted or pending learning card
- **WHEN** the user confirms a pending learning card
- **THEN** the knowledge is accepted into the target member's long-term memory and the card is marked accepted

#### Scenario: Discard a learning card
- **WHEN** the user discards a pending learning card
- **THEN** the card is marked rejected and is not added to the member's memory

### Requirement: Steward handoff checkpoints capture ticket and compaction transitions
When a Worker completes a Ticket, crosses the context compaction threshold, or receives a manual checkpoint note, the handoff panel SHALL surface a Handoff Checkpoint card (`chk_*`) summarizing carried-over objectives and linking to its source `tkt_*` / `thd_*` recall IDs. Each card SHALL be dismissable without interrupting ongoing work.

#### Scenario: Ticket completion or compaction creates a Steward checkpoint
- **WHEN** a Ticket completes or a Steward checkpoint is triggered for a member
- **THEN** a checkpoint card summarizing the carried-over state and recall links appears in the handoff panel

#### Scenario: Dismiss a handoff card
- **WHEN** the user dismisses a handoff checkpoint card
- **THEN** the card is removed without altering the underlying conversation or ticket state

### Requirement: Chain of Recall panel provides Inline summary and Spill continuation
The detail panel SHALL provide a Super-agent Recall & Tickets surface (`recall` tab) that displays active and historical Tickets (`tkt_*`), Triggers (`trg_*`), Mandates (`mnd_*`), and Watchdog alerts with an **Inline** concise summary and an expandable **Spill** detail view showing the full Chain of Recall reference graph (`trg_* -> thd_* -> mnd_* -> tkt_* -> ses_*`).

#### Scenario: Inspect Chain of Recall references on a ticket
- **WHEN** the user opens the Recall/Tickets panel and expands a Ticket's Spill handle
- **THEN** the panel reveals the full linked Chain of Recall IDs (`trg_*`, `thd_*`, `mnd_*`, `ses_*`), pass-through context events, and deliverable details

### Requirement: Side chat answers from a read-only member snapshot without polluting main state
The team sidebar SHALL offer a side-chat (`/side` / BTW) panel where the user can ask a quick question of the selected member. Submitting a question (`side-send`) SHALL synthesize an immediate assistant reply derived from a read-only snapshot of that member's role, memory, active tickets, latest checkpoint, and live status, appending both question and reply only to the member's side-chat transcript and NEVER mutating the main conversation or active Worker tickets.

#### Scenario: Quick ask in side chat receives a snapshot-grounded reply
- **WHEN** the user sends a question through the side-chat panel for a selected member
- **THEN** both the user's question and the member's snapshot-grounded reply appear in the side-chat transcript while the main conversation and active tickets remain unchanged

#### Scenario: Side chat selection follows the roster
- **WHEN** the user switches the selected member in the roster
- **THEN** the side-chat panel displays and targets the newly selected member's isolated side-chat transcript
