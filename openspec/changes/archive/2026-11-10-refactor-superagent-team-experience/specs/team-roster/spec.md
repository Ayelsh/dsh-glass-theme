# Spec Delta

## MODIFIED Requirements

### Requirement: Roster lists Resident Router first then Isolated Workers
The team sidebar SHALL render the Resident Router (`lead` role) as a dedicated top **Router Console Card** above the Isolated Worker (`member` role) list rather than as an ordinary execution row. The Worker ordering SHALL remain stable while membership is unchanged, and the Router Console Card SHALL visually distinguish its global intake, routing, and coordination role from Worker execution slots.

#### Scenario: Team with Resident Router and Workers renders in order
- **WHEN** the team sidebar renders with a Lead (Resident Router) and multiple Workers
- **THEN** the Lead renders at the top as a dedicated Router Console Card with global routing status and quick task intake, followed by Isolated Worker rows in stable order

#### Scenario: Membership change updates roster
- **WHEN** a Worker is added to or removed from the team
- **THEN** the Worker roster updates to include or exclude that member without losing existing rows' identity or displacing the top Router Console Card

### Requirement: Member rows show identity and active ticket workload
Each member row SHALL show the member's identity: a rendered avatar (personal avatar when available, otherwise a deterministic generated identicon), the member's display name, a secondary live activity caption describing its current real-time state (active thinking excerpt, running tool name, role/model, or active ticket count), and any Watchdog stall alert when an assigned ticket is stalled.

#### Scenario: Member with avatar renders
- **WHEN** a member has an assigned avatar
- **THEN** the row renders that avatar beside the member's name and live role/workload/activity caption

#### Scenario: Member without avatar renders identicon
- **WHEN** a member has no assigned avatar
- **THEN** the row renders a deterministic identicon derived from the member's identity, stable across reloads

#### Scenario: Worker with active or stalled tickets shows workload status
- **WHEN** a Worker has one or more active or Watchdog-stalled tickets assigned or is actively streaming thinking/tool events
- **THEN** its row caption or badge reflects the active ticket workload, live thinking/tool pulse, and highlights any stalled state

### Requirement: Presence states are visible
Each member row SHALL indicate the member's presence: working (including sub-states for thinking vs tool execution), waiting (for user input, mandate approval, or upstream handoff), stalled (flagged by the external Watchdog), or idle. The indication SHALL be perceivable without relying on color alone.

#### Scenario: Member is working
- **WHEN** a Worker is actively executing an assigned ticket, streaming reasoning blocks, or running a tool call
- **THEN** its row shows a working indicator (animated shimmer, live pulse dot, and status/tool label) in addition to color

#### Scenario: Member returns to idle
- **WHEN** a working member finishes its turn or ticket assignment
- **THEN** its working indicator stops and the row shows the idle state

### Requirement: Selecting a member focuses its conversation and Super-agent state
Primary-clicking a member row SHALL directly select that member as the active team target, animate the traveling selection indicator to that row, and open or update the wide Live Inspector Drawer (and bound session view) for that member without opening a context menu. Secondary actions SHALL be invoked via right-click or the row's explicit `⋯` menu button.

#### Scenario: Primary click selects Worker and opens live inspector
- **WHEN** the user left-clicks a Worker row in the roster
- **THEN** the selection indicator travels to that row and the Live Inspector Drawer opens showing that Worker's live thinking, tool execution, and tickets

#### Scenario: Switch between member rows
- **WHEN** the user selects a different member row while the team sidebar is open
- **THEN** the newly selected member becomes the active target in the inspector and the previous member retains its state for later return
