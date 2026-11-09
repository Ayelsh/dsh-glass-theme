# team-roster Specification

## Purpose
Defines the Super-agent team roster projection: the Resident Router (Lead) pinned first, followed by Isolated Worker rows with deterministic identity, presence (`working`, `waiting`, `stalled`, `idle`), active ticket & Watchdog health indicators, and unread/mention badges.

## Requirements

### Requirement: Roster lists Resident Router first then Isolated Workers
The roster SHALL list the Resident Router (`lead` role) as the first row, followed by every Isolated Worker (`member` role). The ordering SHALL remain stable while membership is unchanged, and the Lead row SHALL visually distinguish its Resident Router coordination role from Worker execution roles.

#### Scenario: Team with Resident Router and Workers renders in order
- **WHEN** the team sidebar renders with a Lead (Resident Router) and multiple Workers
- **THEN** the Lead row appears first with its Router role indicator and Worker rows follow in stable order

#### Scenario: Membership change updates roster
- **WHEN** a Worker is added to or removed from the team
- **THEN** the roster updates to include or exclude that member without losing the existing rows' identity

### Requirement: Member rows show identity and active ticket workload
Each member row SHALL show the member's identity: a rendered avatar (personal avatar when available, otherwise a deterministic generated identicon), the member's display name, a secondary caption describing its role, model, or active ticket count, and any Watchdog stall alert when an assigned ticket is stalled.

#### Scenario: Member with avatar renders
- **WHEN** a member has an assigned avatar
- **THEN** the row renders that avatar beside the member's name and role/workload caption

#### Scenario: Member without avatar renders identicon
- **WHEN** a member has no assigned avatar
- **THEN** the row renders a deterministic identicon derived from the member's identity, stable across reloads

#### Scenario: Worker with active or stalled tickets shows workload status
- **WHEN** a Worker has one or more active or Watchdog-stalled tickets assigned
- **THEN** its row caption or badge reflects the active ticket workload and highlights any stalled state

### Requirement: Presence states are visible
Each member row SHALL indicate the member's presence: working, waiting (for user input, mandate approval, or upstream handoff), stalled (flagged by the external Watchdog), or idle. The indication SHALL be perceivable without relying on color alone.

#### Scenario: Member is working
- **WHEN** a Worker is actively executing an assigned ticket or streaming a turn
- **THEN** its row shows a working indicator (animated shimmer and status label) in addition to color

#### Scenario: Member returns to idle
- **WHEN** a working member finishes its turn or ticket assignment
- **THEN** its working indicator stops and the row shows the idle state

### Requirement: Unread badges reflect attention
Member rows SHALL show an unread badge when the member or the conversation/ticket stream it represents has unseen activity. Explicit `@`-mentions SHALL outrank ordinary unread counts, and the badge SHALL clear when the user focuses that member.

#### Scenario: Unread activity raises a badge
- **WHEN** a member produces output or ticket updates while its surface is not focused
- **THEN** its row shows an unread badge

#### Scenario: Focusing clears the badge
- **WHEN** the user selects or opens the member's surface
- **THEN** the unread and mention badges on its row are cleared

### Requirement: Selecting a member focuses its conversation and Super-agent state
Selecting a member row SHALL focus that member as the active team target, updating the active selection and opening or targeting its bound session and companion panels without losing previous state.

#### Scenario: Switch between member rows
- **WHEN** the user selects a different member row while the team sidebar is open
- **THEN** the newly selected member becomes the active target and the previous member retains its state for later return
