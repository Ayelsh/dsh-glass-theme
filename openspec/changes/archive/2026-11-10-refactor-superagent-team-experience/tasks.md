# Tasks

## 1. Host Super-agent Routing & Lifecycle Engine (`src/host/team-store.js`)

- [x] 1.1 Implement `selectWorkerForDispatch(state, { workerId, text, roomId })` in `src/host/team-store.js` so `ticket-add` and `trigger-intake` route tickets dispatched from the Resident Router (`lead` or `"auto"` or `""`) to an eligible Worker (`role: "member"`) by `@mention`, role/instructions match, room membership, or lowest active workload instead of trapping them on `state.profiles[0]` (`lead`), and verify with unit tests in `tests/team-store.test.mjs`.
- [x] 1.2 Add `profile-bind-session` / session-binding support in `src/host/team-store.js` (`profile-update` and `ticket-add` / `ticket-complete` / `watchdog-resolve` including worker reassignment) and migrate any legacy tickets stuck on `lead.id` when Workers exist, verifying state transitions with `node --test tests/team-store.test.mjs`.
- [x] 1.3 Upgrade `side-send` in `src/host/team-store.js` to accept live telemetry context (`thinking`, `tools`, `messages`, `phase`) and synthesize snapshot-grounded `/side` replies without mutating main conversation or ticket state, and verify with unit tests in `tests/team-store.test.mjs`.

## 2. Live Session Telemetry & Watchdog Reconciliation (`src/host/team-live.js`, `src/host/routes.js`)

- [x] 2.1 Upgrade `extractRecord()` and `payload(seen)` in `src/host/team-live.js` to extract bounded live `thinking` (`reasoning` blocks and streaming `assistant/attempt` chunks), `tools` (last 8 `tool_use` / `tool_result` records with status and output excerpts), `messages` (last 10 user/assistant turns), and execution `phase` (`thinking | tool | responding | waiting | idle`) via `sessionQuery.observeSession(id, { projectionMode: "none" })`, and verify with unit tests in `tests/team-live.test.mjs`.
- [x] 2.2 Implement `reconcileLiveTeamState(teamStore, liveSnapshot)` in `src/host/routes.js` (invoked on `GET` and `POST` `/dsh-glass-theme/team`) to auto-correlate `origin === "subagent"` sessions with unbound Workers/Tickets, refresh `ticket.lastActivityMs`, auto-complete finished subagent tickets (`ticket-complete`), and run `evaluateWatchdog()` + `watchdog-check`, verifying with route integration tests in `tests/team-live.test.mjs`.

## 3. Sidebar Router Console, Live Worker Roster & Dual-Space Inspector UI (`src/team.js`, `locale/*.json`)

- [x] 3.1 Refactor `renderRoster()` and `renderShell()` in `src/team.js` to render the top **Resident Router Console Card** (with quick task intake and target Worker selector `"auto" | <workerId>`) separately from Isolated Worker rows, change Worker row primary click to select the member and open the inspector (moving context menu to right-click and the `⋯` button), and verify roster behavior in `tests/team-ui.test.mjs`.
- [x] 3.2 Build the wide **Slide-Over Live Inspector Drawer** (`.lg-team-inspector`, 380px–440px) in `src/team.js` with a 3-way Apple Segmented Control (`pulse` for Live Thinking & Tool Stream, `recall` for strictly member-filtered Tickets & Chain of Recall, and `cognition` for `/side` chat, Steward checkpoints, learning cards, and memory) plus manual session-binding and `ticket-complete` actions, and verify inspector rendering and strict ticket filtering in `tests/team-ui.test.mjs`.
- [x] 3.3 Register the optional `main` workspace slot (`lg-team-workbench`, following `src/workspace.js`) for full-canvas Super-agent Mission Control and fix `focusSession(sessionId)` in `src/team.js` to switch sessions via the client `sessions` / `uiSession` service (with fallback) while the team sidebar is open, verifying session switching and canvas toggle in `tests/team-ui.test.mjs`.
- [x] 3.4 Add localized strings for the Router Console, Live Pulse stream, tool timeline, session binding selector, and Mission Control toggle in `locale/zh.json` and `locale/en.json`, verifying JSON validity and key parity across both locale files.

## 4. Apple Liquid Glass Material Hierarchy & Fluid Motion (`src/css/team.css`)

- [x] 4.1 Replace all undefined CSS custom properties (`--dsw-alias-accent`, `--dsw-alias-label-invert`, `--lg-surface-hover`) and raw hex colors (`#f59e0b`, `#10b981`, `#ef4444`) in `src/css/team.css` with semantic tokens from `src/css/tokens.css` (`--lg-accent`, `--lg-selection-label`, `--lg-accent-soft`, `--lg-warning`, `--lg-success`, `--lg-danger`), and verify zero undefined aliases or raw hex colors remain via CSS token tests.
- [x] 4.2 Refactor `.lg-team-inspector`, `.lg-team-routerCard`, `.lg-team-card`, `.lg-team-seg`, and `.lg-team-segPill` in `src/css/team.css` to enforce one material per layer (Liquid Glass with `inset 0 0.5px 0 var(--lg-edge-top)` only on the floating outer shell; solid/elevated `--lg-surface` / `--lg-surface-raised` on inner cards), concentric corner radii (`r_inner = r_outer - gap`), `:active` press scaling (`scale(0.97)`), and `--lg-ease-spring` transitions with `@media (prefers-reduced-motion: reduce)` and `@media (prefers-reduced-transparency: reduce)` fallbacks, verifying via CSS assertions in `tests/team-ui.test.mjs`.

## 5. End-to-End Build & Verification

- [x] 5.1 Rebuild the plugin bundle (`npm run build` / `node --test`) and verify that all unit, integration, and CSS token tests pass with zero regressions.
