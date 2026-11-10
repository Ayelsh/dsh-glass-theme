# team-rooms Specification

## Purpose
Defines event-driven Thread rooms (`thd_*`) in the team sidebar: multi-member collaboration streams with group goals, subscribed Worker chips, two-stage trigger intake (`observe` vs `auto` modes), Mandate-bounded Thread Subscription Direct Pass-Through, and mention/unread markers.

## Requirements

### Requirement: Rooms represent event-driven Threads
The team sidebar SHALL list group rooms as event-driven Threads (`thd_*`) distinct from member rows, grouped under the rooms section. Creating a room SHALL assign it a stable Thread ID (`thd_*`), and removing a room SHALL remove only the room definition without deleting its participating Worker profiles or underlying DSH conversations.

#### Scenario: Room appears as a Thread in sidebar
- **WHEN** a group room exists in the team store
- **THEN** the sidebar shows a room row under the rooms section with its Thread identity, goal, and subscribed member chips

#### Scenario: Removing a room keeps members and conversations
- **WHEN** the user removes a room
- **THEN** the room row disappears while all member rows and underlying conversations remain intact

### Requirement: Room rows show membership, goal, and subscription pass-through state
A room row SHALL show the room's name, its participating/subscribed Worker chips, its current group goal line when set, and an indicator when Thread Subscription Direct Pass-Through is active for one or more assigned tickets.

#### Scenario: Room with goal and subscribed Workers renders details
- **WHEN** a room has a group goal and subscribed Workers set
- **THEN** the room row shows the goal line and member chips beneath the room name

#### Scenario: Room without goal omits goal line
- **WHEN** a room has no group goal set
- **THEN** the room row renders without a goal line and without an empty placeholder

### Requirement: Two-stage trigger intake and observe/auto mandate modes
Room Thread events (`thd_*`) and Router Console task submissions SHALL pass through a two-stage intake filter (`explicit`, `candidate`, or `ignore`) governed by the active autonomy mode (`observe` by default, or `auto`). In `observe` mode, `candidate` triggers SHALL stage an observed draft Ticket (`status: 'observed'`) routed to an eligible Worker (matching `@worker`, role/instructions, or least-loaded Worker rather than defaulting to `lead`) awaiting user approval; in `auto` mode or on `explicit` triggers, the engine SHALL issue an authorized Mandate (`mnd_*`) and dispatch the Ticket (`tkt_*`) directly to the selected Worker.

#### Scenario: Candidate trigger in observe mode stages a draft ticket
- **WHEN** a room or Router Console receives a candidate trigger while the autonomy mode is set to `observe`
- **THEN** the engine records a speculative draft Ticket with `observed` status assigned to an eligible Worker (not trapped on `lead` when Workers exist) for user review

#### Scenario: Explicit mention or auto mode dispatches an authorized ticket
- **WHEN** a room or Router Console receives an explicit `@worker` trigger or a candidate trigger while in `auto` mode
- **THEN** the engine issues an authorized Mandate (`mnd_*`) and assigns an active Ticket (`tkt_*`) to the matched Worker

### Requirement: Thread subscription direct pass-through preserves Mandate boundaries
Once a Worker is assigned an active Ticket on a room Thread (`thd_*`), that Worker SHALL subscribe to the Thread. Subsequent triggers in the same Thread SHALL pass directly to the subscribed Worker's ticket context (`passThrough: true`), bypassing Resident Router re-dispatch and surfacing in the Worker's live inspector stream. Direct pass-through triggers MUST only append context and MUST NOT widen or escalate the Ticket's existing Mandate authority.

#### Scenario: Follow-up message in a subscribed Thread bypasses Router
- **WHEN** a room Thread has an active subscribed Worker and a follow-up trigger arrives in that Thread
- **THEN** the trigger is appended directly to the subscribed Worker's ticket context with `passThrough: true` without creating a duplicate Router dispatch

#### Scenario: Direct pass-through does not widen Mandate scope
- **WHEN** a follow-up trigger is delivered via Thread subscription direct pass-through
- **THEN** the Ticket's original Mandate (`mnd_*`) scope remains unchanged

### Requirement: Mention and unread markers
A room row SHALL show an attention marker when the room has unseen activity, and SHALL distinguish messages that explicitly `@`-mention a member or user from ordinary unread messages. Selecting the room SHALL focus its bound conversation/thread and clear unseen markers.

#### Scenario: Mentioned in a room outranks ordinary unread
- **WHEN** a room receives both an `@`-mention and ordinary messages while not focused
- **THEN** the room row displays the mention-emphasized marker, and selecting the room clears both markers
