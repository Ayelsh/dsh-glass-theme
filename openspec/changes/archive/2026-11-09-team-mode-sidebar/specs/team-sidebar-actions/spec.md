# Spec Delta

## Purpose

Defines the user and Super-agent commands available over the team surface: context menus, command palette (`Ctrl/Cmd+K`), member creation, member rename/re-role (`profile-update`), room goal & member subscription editing (`room-update`), draft-preserving inline forms, Ticket dispatch/approval, and Watchdog recovery actions.

## ADDED Requirements

### Requirement: Context menus on member and room rows
Right-clicking (or activating the menu button on) a member or room row SHALL open a context menu with the actions applicable to that row: open panels (`memory`, `learning`, `handoff`, `side`, `recall`), dispatch or review tickets, rename/configure member (`profile-update`), edit room goal and subscribed members (`room-update`), clear member memory, export state, and remove member or room. Actions that destroy state SHALL require explicit confirmation before executing.

#### Scenario: Member context menu actions
- **WHEN** the user opens a member row's context menu
- **THEN** the menu lists panel openers, ticket dispatch, rename/configure, clear memory, export, and remove actions applicable to that member

#### Scenario: Destructive action confirms first
- **WHEN** the user invokes a destructive action (remove member, remove room, clear memory, or reset)
- **THEN** a confirmation bar is presented and the mutation executes only after explicit confirmation

### Requirement: Member rename and configuration flow updates profile in place
Selecting the rename/configure action on a member row (`rename-member`) SHALL open an inline configuration form pre-filled with the member's current display name, role (`member` or `lead`), and responsibility/model caption. Submitting the form SHALL dispatch `profile-update` and update the member in place without recreating the team.

#### Scenario: Rename and update a member's responsibility
- **WHEN** the user opens `rename-member`, edits the member's name or responsibility caption, and submits
- **THEN** `profile-update` persists the new values and the roster row immediately reflects the updated identity

### Requirement: Room edit flow updates goal and subscribed members in place
Selecting the edit action on a room row (`rename-room`) SHALL open an inline editor pre-filled with the room's name, group goal, and selectable member subscription chips. Submitting the form SHALL dispatch `room-update` and update the room's name, goal, and `memberIds` in place.

#### Scenario: Edit a room's goal and subscribed members
- **WHEN** the user opens `rename-room`, updates the goal text, toggles member chips, and submits
- **THEN** `room-update` persists the updated name, goal, and `memberIds`, and the room row renders the new goal and member chips

### Requirement: Inline forms preserve user drafts across polling ticks
While an inline creation or edit form (`member`, `room`, `rename-member`, `rename-room`) or a detail panel input is open, background polling ticks (`tick()`) MUST NOT clear, reset, or steal focus from the user's in-progress text input.

#### Scenario: Typing in add-member or edit form survives background refresh
- **WHEN** the user is typing in a creation, rename, or panel input while multiple background poll cycles run
- **THEN** the input value, focus, and cursor selection remain intact until the user submits or cancels

### Requirement: Ticket dispatch, observe approval, and Watchdog intervention actions
The team surface SHALL allow users to dispatch a new Ticket (`ticket-add` / `trigger-intake`), approve an `observed` draft Ticket into an active Worker assignment (`ticket-approve`), complete/merge an active Ticket (`ticket-complete`), and resolve a Watchdog-stalled Ticket via retry or dismiss (`watchdog-resolve`). All dispatch mutations SHALL support idempotent `requestId` deduplication through the host Outbox.

#### Scenario: Approve an observed ticket for execution
- **WHEN** the user clicks approve on a speculative/observed Ticket
- **THEN** its Mandate transitions to `authorized`, the Ticket transitions to `working` (or `queued`) on the assigned Worker, and duplicate submissions with the same `requestId` are deduplicated

#### Scenario: Resolve a Watchdog-stalled ticket
- **WHEN** the external Watchdog marks a ticket as `stalled` and the user triggers retry or dismiss
- **THEN** the ticket either resets its retry/stall state to resume work or closes cleanly

### Requirement: Command palette searches team surface and Super-agent actions
The skin SHALL provide a command palette (invoked with `Ctrl/Cmd+K` or the header `⌘K` button) that fuzzy-searches members, rooms, panels, ticket dispatches, autonomy mode toggles (`observe` / `auto`), and Watchdog checks, and executes the selected entry.

#### Scenario: Fuzzy search and dispatch from palette
- **WHEN** the user types a query in the palette and presses Enter on a matched member, room, or Super-agent action
- **THEN** the selected action executes immediately and the palette closes

### Requirement: Member creation flow
The team sidebar SHALL provide an entry to create a new member collecting display name, role (`member` default or `lead`), and responsibility/model description, delegating to the harness spawn capability when exposed and persisting the profile in the host store.

#### Scenario: Create a member from the sidebar
- **WHEN** the user completes the member creation form and submits
- **THEN** the new member appears in the roster immediately with the provided identity
