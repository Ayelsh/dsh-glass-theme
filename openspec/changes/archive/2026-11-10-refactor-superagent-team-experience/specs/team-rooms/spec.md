# Spec Delta

## MODIFIED Requirements

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
