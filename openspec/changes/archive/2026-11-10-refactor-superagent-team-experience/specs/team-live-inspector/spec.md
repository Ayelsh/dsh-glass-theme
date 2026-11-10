# Spec Delta

## Purpose

Defines the real-time Super-agent Worker observability pipeline and wide slide-over or main-canvas inspector surface for viewing live thinking streams, tool execution timelines, session bindings, and native DSH session switching.

## ADDED Requirements

### Requirement: Live telemetry projects thinking, tool execution, and conversation turns
The host live telemetry snapshot SHALL project each bound session's latest thinking stream (reasoning blocks and in-flight streaming chunks), ordered tool execution records (tool name, summarized input, status, and output excerpt), and recent user/assistant conversation turns alongside session presence and activity timestamps.

#### Scenario: Worker streaming reasoning and tool calls
- **WHEN** a bound DSH session emits reasoning blocks or tool execution events during an active turn
- **THEN** the live telemetry payload includes the latest thinking text and ordered tool execution entries with their running or completed status

#### Scenario: Unbound member reports empty live stream gracefully
- **WHEN** a Worker is not yet bound to a DSH session or the bound session has no events
- **THEN** the live telemetry payload returns an empty activity stream for that Worker without throwing or blocking other sessions

### Requirement: Automatic and manual Worker session binding
The system SHALL automatically correlate unbound Workers and active Tickets with live or persisted DSH subagent sessions when session metadata (origin, parent session, title, or ticket marker) matches, and SHALL allow users to manually bind or rebind any Worker to an available DSH session from the inspector.

#### Scenario: Subagent session auto-binds to matching Worker
- **WHEN** a DSH subagent session starts whose title or metadata matches a Worker profile or active Ticket
- **THEN** the Worker's session binding updates automatically and its live stream begins projecting in the inspector

#### Scenario: User manually binds a Worker to a live session
- **WHEN** the user selects a DSH session from the inspector's session-binding selector for a Worker
- **THEN** the Worker profile persists that `sessionId` and the inspector immediately displays that session's thinking, tool, and message stream

### Requirement: Wide slide-over inspector drawer and main-canvas Mission Control
Selecting a Worker or inspecting a Ticket SHALL open a wide Slide-Over Live Inspector Drawer (380px–440px) anchored beside the sidebar without cramping content into the narrow sidebar width, and SHALL offer an expand toggle to open a full-canvas Super-agent Mission Control view in the main slot.

#### Scenario: Selecting a Worker opens the wide slide-over inspector
- **WHEN** the user clicks a Worker row in the team roster
- **THEN** the wide Slide-Over Live Inspector Drawer opens with spring motion and renders the selected Worker's live telemetry

#### Scenario: Expanding to main-canvas Mission Control
- **WHEN** the user activates the expand-to-canvas control in the inspector header or team header
- **THEN** the main workspace slot switches to the Super-agent Mission Control multi-pane view showing the Router overview, Worker grid, and live inspector side by side

### Requirement: Programmatic native session switching works while team sidebar is open
Activating the "Open Native Session" control in the inspector or roster SHALL switch the active DSH conversation via the client session service (or restore the session browser and select the target session) even while the team sidebar replaces the native session list DOM.

#### Scenario: Jump to native DSH conversation from inspector
- **WHEN** the user clicks "Open Native Session" for a Worker bound to a valid `sessionId` while the team sidebar is expanded
- **THEN** the center conversation column switches to that DSH session without failing due to unmounted session list DOM nodes
