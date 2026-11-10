# Design

## Context

See `proposal.md` for motivation and problem statement. The current team implementation in `dsh-liquid-glass` splits across four primary files:
- `src/host/team-store.js`: Persists `team-state.json` (`profiles`, `rooms`, `triggers`, `mandates`, `tickets`, `learnCards`, `checkpoints`, `memory`, `sideChat`, `outbox`, `seen`). Currently `sortProfiles()` pins `role === "lead"` at `state.profiles[0]`, and both `trigger-intake` and `ticket-add` fall back to `state.profiles[0]` when `workerId` is omitted or targets Lead. Meanwhile, `trigger-intake`, `ticket-complete`, and `watchdog-check` have zero callers in production routes or client code.
- `src/host/team-live.js`: Reads `sessions`, `sessionQuery`, and `sessionPersistence`. Currently `messagesOf(events)` discards `reasoning`, `tool_use`, `tool_result`, and streaming `assistant/attempt` events, and `payload(seen)` omits `messagesOf` entirely—returning only session headers and unread counts.
- `src/team.js`: Mounts inside `sidebar.workspaces` (~240px–260px wide). Clicking any row opens a context menu (`data-action="row-menu"`), every row including Lead offers `派发工单` (`workerId = profile.id`), `renderPanel()` stacks five vertical sections inside an `inset: 0` overlay over the narrow sidebar, and `focusSession()` queries `[class*='sessionRow']` DOM nodes that do not exist while `sidebar.workspaces` replaces `WorkspaceBrowser`.
- `src/css/team.css`: Uses undefined CSS variables (`--dsw-alias-accent`, `--dsw-alias-label-invert`, `--lg-surface-hover`), raw hex colors (`#f59e0b`, `#10b981`, `#ef4444`), and glass-on-glass nesting (`.lg-team-card` with `var(--lg-glass-tint)` inside `.lg-team-panel` with `backdrop-filter: blur(26px)`).

## Goals / Non-Goals

**Goals:**
- Separate the Resident Router (`lead`) from Isolated Workers (`member`) in both the UI and the host routing engine so tickets dispatched through the Router are routed to Workers and never trapped on `lead`.
- Project live Worker thinking (`reasoning` blocks + streaming `assistant/attempt` chunks), tool executions (`tool_use` / `tool_result`), and recent conversation turns from `sessionQuery.observeSession` to the client in real time.
- Implement Scheme 1's dual-space Apple architecture: a lightweight ~260px sidebar (Router Console Card + Live Worker Roster + Thread Rooms) paired with a wide **Slide-Over Live Inspector Drawer (380px–440px)** and an optional full-canvas **Super-agent Mission Control** view (`main` slot, matching `src/workspace.js`).
- Reorganize the inspector around a 3-way Apple Segmented Control (`pulse`, `recall`, `cognition`) with a traveling selection pill, strict per-Worker ticket filtering, and `/side` answers grounded in live session snapshots.
- Bring `src/css/team.css` into strict compliance with `src/css/tokens.css`, `apple-liquid-glass`, and `apple-design` (one material per layer, concentric radii, `:active` scale feedback, and `--lg-ease-spring` motion).

**Non-Goals:**
- Modifying DSH core (`app.asar`) or adding external npm runtime dependencies.
- Building a separate cloud daemon or multi-machine remote RPC layer outside the DSH plugin host/client boundary.

## Decisions

### Decision 1: Resident Router Console Card & Smart Worker Routing (`src/host/team-store.js`, `src/team.js`)
- **Choice**: Render the `lead` profile as a dedicated top **Router Console Card** in the sidebar with a quick task/ticket intake bar (`targetWorkerId: "auto" | <workerId>`) and global routing metrics. In `src/host/team-store.js`, introduce `selectWorkerForDispatch(state, { workerId, text, roomId })`:
  1. If `workerId` explicitly names a `member` profile, use that Worker.
  2. If `workerId` is `"auto"`, `""`, or equals the `lead` profile ID while at least one `member` profile exists, score available Workers (`role === "member"`) by `@mention` match in `text`, keyword overlap with `profile.instructions` / `profile.name`, room subscription (`room.memberIds`), and lowest active (`working` / `queued`) ticket count, assigning the Ticket to the winning Worker.
  3. Only fall back to `lead` if zero `member` profiles exist in `state.profiles`.
- **Rationale**: Directly eliminates the primary bug where users dispatch a ticket from the Lead row or without a worker ID and the ticket gets stuck on `lead.id` (`state.profiles[0]`).
- **Alternatives Considered**: Forcing users to always open a specific Worker's submenu before creating a ticket. Rejected because in the Super-agent mental model, users talk to the Resident Router (`主控`) and expect the Router to dispatch work to Workers.

### Decision 2: Live Telemetry Projection & Auto-Correlating Subagent Sessions (`src/host/team-live.js`, `src/host/routes.js`)
- **Choice**: Extend `teamLive.refresh()` and `extractRecord()` in `src/host/team-live.js` to extract a bounded live activity digest per session from `sessionQuery.observeSession(id, { projectionMode: "none" })` (and `session.snapshotEvents()`):
  - `thinking`: Latest `reasoning` block text or in-flight `assistant/attempt` reasoning chunk (capped to 600 chars inline, with full text in Spill preview), plus `isThinking: boolean`.
  - `tools`: Last 8 `tool_use` / `tool_result` pairs with `{ id, name, summary, status: "running" | "done" | "error", outputExcerpt, timestampMs }`.
  - `messages`: Last 10 `user/message` and `assistant/message` turns (`{ role, text, seq, timestampMs }`).
  - `phase`: Derived real-time execution phase (`"thinking" | "tool" | "responding" | "waiting" | "idle"`).
  During `GET /dsh-glass-theme/team` and `POST /dsh-glass-theme/team` in `src/host/routes.js`, run a reconciliation pass (`reconcileLiveTeamState(teamStore, liveSnapshot)`) that:
  1. Auto-binds unbound Workers or active Tickets to newly discovered `origin === "subagent"` sessions (matching session title/prompt against Worker name or Ticket title/goal, or assigning the newest unclaimed subagent session spawned after `ticket.createdAt`).
  2. Updates `ticket.lastActivityMs` from the bound session's `lastActivityMs`, auto-transitions `working` tickets to `ready` (`ticket-complete`) when a bound subagent session finishes its final turn after activity, and invokes `evaluateWatchdog()` + `watchdog-check` so stalled tickets are flagged automatically.
- **Rationale**: Gives users immediate visibility into each Worker's thinking process, tool execution timeline, and session output without requiring changes to DSH core, and activates the previously dead `trigger-intake`, `ticket-complete`, and `watchdog-check` state transitions.
- **Alternatives Considered**: Streaming raw WebSocket frames from a custom server. Rejected because DSH host routes already poll `teamLive.refresh()` every 4 seconds (and can poll every 2 seconds while a Worker is actively streaming), keeping the plugin self-contained.

### Decision 3: Scheme 1 Dual-Space Layout — Slide-Over Live Inspector + Optional Main-Slot Mission Control (`src/team.js`, `src/css/team.css`)
- **Choice**:
  ```text
  +----------------------+--------------------------------------------+
  | Sidebar (~260px)     | Slide-Over Live Inspector (380px-440px)    |
  |                      | (or Full-Canvas Main Slot Mission Control) |
  | +------------------+ | +----------------------------------------+ |
  | | Router Console   | | | Header: Worker Name + Status + Session | |
  | | [Quick Dispatch] | | | [Open Native Session] [Expand Canvas]  | |
  | +------------------+ | +----------------------------------------+ |
  | | WORKERS          | | | Segmented Pill:                        | |
  | | * Worker A [Tool]| | | [ Live Pulse | Tickets/Recall | /side ]| |
  | |   Worker B [Idle]| | +----------------------------------------+ |
  | +------------------+ | | Active Segment Body (Solid Cards):     | |
  | | THREAD ROOMS     | | | - Thinking Stream (Reasoning)          | |
  | | # Room 1  [thd_] | | | - Tool Execution Timeline              | |
  | +------------------+ | | - Session Transcript Preview           | |
  +----------------------+--------------------------------------------+
  ```
  - Keep the left sidebar (`sidebar.workspaces`) clean and scannable: Router Console Card at top, Worker Roster rows (left-click selects Worker and opens the Slide-Over Inspector; `⋯` button or right-click opens the context menu), and Thread Rooms.
  - Render `.lg-team-inspector` as a wide (380px–440px) slide-over drawer anchored to the right edge of the sidebar (`left: 100%` of the sidebar shell, floating over the left margin of the center pane with Liquid Glass material, closing on `Escape` or close button) AND register an optional `main` slot (`lg-team-workbench`, following `src/workspace.js:16-20`) so clicking "Expand to Canvas" opens a full-bleed 3-column Super-agent Mission Control workbench.
  - Fix `focusSession(sessionId)` to first invoke the client `sessions` / `uiSession` service (or if switching via DOM is required, temporarily stow the team overlay or trigger session activation through the client store) so "Open Native Session" works reliably.
- **Rationale**: A 240px sidebar cannot legibly display thinking chains, tool call arguments, Chain of Recall graphs, and side-chat transcripts at the same time. A 400px slide-over drawer + optional `main` slot preserves conversation context while giving telemetry room to breathe.
- **Alternatives Considered**: Keeping all details inside the 240px sidebar with accordion sections. Rejected because code paths, tool arguments, and reasoning streams wrap every 15 characters at 240px width.

### Decision 4: Apple Liquid Glass Material Hierarchy & Token Compliance (`src/css/team.css`)
- **Choice**:
  - **One Material Per Layer**: Only the floating Slide-Over Inspector shell (`.lg-team-inspector`), floating menus (`.lg-team-menu`), and command palette (`.lg-team-palette`) use `backdrop-filter: blur(var(--lg-blur-panel)) saturate(var(--lg-saturate-panel))` with `--lg-glass-2`/`--lg-glass-3` and top specular edge `inset 0 0.5px 0 var(--lg-edge-top)`. All inner cards (`.lg-team-card`, `.lg-team-pulseCard`, `.lg-team-toolRow`, `.lg-team-memItem`, `.lg-team-sideMsg`) use solid/elevated tokens (`var(--lg-surface)`, `var(--lg-surface-raised)`, `var(--lg-surface-sunken)`) with zero nested `backdrop-filter` or `--lg-glass-tint`.
  - **Strict Token Binding**: Replace all occurrences of `--dsw-alias-accent`, `--dsw-alias-label-invert`, `--lg-surface-hover`, and raw hex literals (`#f59e0b`, `#10b981`, `#ef4444`) with defined tokens in `src/css/tokens.css` (`--lg-accent`, `--lg-selection-label`, `--lg-accent-soft`, `--lg-warning`, `--lg-success`, `--lg-danger`).
  - **Concentric Geometry & Fluid Physics**: Outer inspector radius `var(--lg-r-panel)` (18px) with `12px` padding yields inner card radius `var(--lg-r-sm)` / `calc(var(--lg-r-panel) - 8px)`. Segmented control uses a single `.lg-team-segPill` element animated via `transform: translateX(...)` with `var(--lg-ease-spring)`. All interactive rows and buttons apply `:active { transform: scale(0.97); transition: transform 100ms var(--lg-ease-out); }`.
- **Rationale**: Directly satisfies the `apple-liquid-glass` and `apple-design` skill rules and fixes invisible/broken buttons caused by undefined `--dsw-alias-*` variables.

## Risks / Trade-offs

- **[Risk] Slide-over inspector drawer could overlap narrow viewport conversations** -> **Mitigation**: Allow instant dismissal via `Escape`, outside click, or header toggle, and provide the one-click "Expand to Canvas" (`main` slot) mode for small screens; clamp drawer width with `min(420px, calc(100vw - 280px))`.
- **[Risk] Large session event logs could slow down `teamLive.refresh()`** -> **Mitigation**: Extract only the tail of each session's events (last 40 events / last 10 messages / last 8 tool calls / latest reasoning block) and truncate inline excerpts to 600 characters.
- **[Risk] Existing unit tests assert against legacy DOM selectors or `workerId` fallback to `profiles[0]`** -> **Mitigation**: Preserve core data-action attributes where compatible and update `tests/team-*.test.mjs` to cover Worker routing, live telemetry projection, and the 3-segment inspector.

## Migration Plan

1. Upgrade `src/host/team-store.js` (`selectWorkerForDispatch`, live-grounded `side-send`, ticket filter isolation) while keeping `STORE_VERSION = 1` backward-compatible with existing `team-state.json` files (auto-migrating any legacy ticket erroneously assigned to `lead.id` when a `member` exists, or keeping it inspectable under the Router queue).
2. Upgrade `src/host/team-live.js` and `src/host/routes.js` to project `thinking`, `tools`, `messages`, and `phase`, auto-correlate subagent sessions, and invoke `evaluateWatchdog()` / `watchdog-check`.
3. Refactor `src/team.js` and `src/css/team.css` to render the Router Console Card, single-click Worker selection, Slide-Over Live Inspector Drawer (with 3-way Segmented Control), optional `main` Mission Control slot, and compliant Apple Liquid Glass styling.
4. Update `locale/zh.json`, `locale/en.json`, and `tests/team-*.test.mjs`, then rebuild and verify.
