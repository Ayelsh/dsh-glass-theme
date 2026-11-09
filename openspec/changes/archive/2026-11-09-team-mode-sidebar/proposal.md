# Proposal

## Why

The Liquid Glass skin's sidebar originally presented only the flat DSH session list. While the initial `team-mode-sidebar` pass added a sidebar region panel, static member/room stores, and passive session observation, it fell short of the **DeepSeek Super-agent** architecture (`deepseek-ai/dsh-superagent-prototype`) and `ds-bot`'s full orchestration model:
1. It lacked the **two-tier Resident Router / Isolated Worker architecture** where the Lead acts as a dedicated coordinator (dispatching tickets and speaking to the human without blocking on heavy execution) and teammates act as isolated Worker sessions.
2. It lacked an **event-driven pipeline** with two-stage intake filtering (fast rule path + slow policy assessment), `observe` (default speculative/suggestion mode) vs `auto` (autonomous execution mode), scoped `Mandate` authority, and **Thread subscription direct pass-through** (where follow-up events in a room/thread bypass the Router and go straight to subscribed Workers without widening authority).
3. It lacked **Inline & Spill context management and Chain of Recall** (`Trigger -> Thread -> Ticket -> Worker Session` reference IDs), automated post-turn Learning Card / Steward Checkpoint extraction, a real read-only snapshot `/side` chat reply engine, durable `Ticket`/`Outbox` idempotency, and an **external Watchdog loop** inspecting substantive progress and goal drift.
4. Several sidebar interactions remained incomplete (`rename-member` / `profile-update`, `rename-room` / `room-update`, room member subscription management).

This unified change upgrades `team-mode-sidebar` to a full Super-agent sidebar architecture and closes all remaining UI and orchestration items within the plugin, referencing `ds-bot` and `dsh-superagent-prototype` ideas only and never copying code.

## What Changes

- **Sidebar-region team container (`team-sidebar-shell`)**: Claims `sidebar.workspaces` dynamically via priority shadowing only while expanded (`data-lg-team-open="true"`), unregistering when stowed so the native session browser renders intact, with a persistent `sidebar.footer.action` toggle and default-stowed behavior.
- **Resident Router & Isolated Worker roster (`team-roster`)**: Upgrades the Lead to the **Resident Router** (batching triggers, issuing tickets/assignments, sole external speaker) and teammates to **Isolated Workers** bound to real or managed sessions, displaying presence (`idle` / `working` / `waiting` / `stalled`), active ticket counts, Watchdog health alerts, and unread/mention badges.
- **Event-driven Thread rooms & Subscription Pass-Through (`team-rooms`)**: Upgrades group rooms into **Threads (`thd_*`)** with two-stage intake filtering (`explicit` / `candidate` / `ignore`), `observe` vs `auto` intake modes, scoped **Mandates (`mnd_*`)**, and **Thread Subscription Direct Pass-Through** where subsequent room messages route directly to subscribed Workers as context without re-invoking the Router or expanding Mandate scope.
- **Complete team & Super-agent actions (`team-sidebar-actions`)**: Completes member creation, `rename-member` (`profile-update`), `rename-room` (`room-update` with goal & subscribed member assignment), ticket dispatch/approval (promoting `observe` candidates into authorized `Ticket` assignments), Watchdog intervention (retry/escalate/dismiss stalled tickets), context menus, and the `Ctrl/Cmd+K` command palette.
- **Chain of Recall, Steward & Live Side-Chat panels (`team-sidebar-panels`)**: Adds **Chain of Recall** navigation (`trg_*`, `thd_*`, `tkt_*`, `ses_*` IDs with Inline summary & Spill continuation handles), automated post-ticket **Learning Card** extraction and **Steward Handoff Checkpoints**, and a responsive **`/side` (BTW) chat** that synthesizes answers from the selected member's read-only snapshot (memory, active tickets, checkpoints, live events) without polluting the Worker's primary transcript.
- **Super-agent policy & Watchdog preferences (`team-sidebar-preferences`)**: Persists `teamSidebar`, `teamFeatures`, `teamCollapsed`, `teamAutonomyMode` (`observe` default vs `auto`), and `teamWatchdog` through the declared host settings entry with first-paint browser mirroring.
- **Containment**: Every host and client addition remains strictly contained so any failure leaves the ordinary DSH session list and skin intact.

Out of scope: non-sidebar bot capabilities (voice/speech synthesis, office document rendering, browser automation panes, billing ledgers) and modifications to the DSH harness binary itself.

## Capabilities

### New Capabilities

- `team-sidebar-shell`: The team-mode sidebar container — user-controlled switch, dynamic `sidebar.workspaces` single-slot shadowing when expanded and clean unregistration when stowed, default-stowed first paint, glass token binding, and failure containment.
- `team-roster`: The Router/Worker roster projection — Resident Router (Lead) first, Isolated Worker rows with deterministic identicons/avatars, role/model captions, active ticket & Watchdog status indicators, and unread badges.
- `team-rooms`: Event-driven Thread rooms — room rows (`thd_*`) with group goal, subscribed Worker chips, two-stage trigger intake (`observe` vs `auto`), Mandate-bounded Thread subscription direct pass-through, and mention/unread markers.
- `team-sidebar-actions`: Full lifecycle commands — member creation, member rename/re-role (`profile-update`), room goal & member subscription editing (`room-update`), ticket dispatch and `observe`-candidate approval, Watchdog stall resolution, context menus, and `Ctrl/Cmd+K` palette.
- `team-sidebar-panels`: Super-agent cognition & recall panels — memory store, auto-extracted learning cards, Steward handoff checkpoints, Chain of Recall (`trg_*`/`thd_*`/`tkt_*`/`ses_*` Inline & Spill inspector), and read-only snapshot `/side` chat.
- `team-sidebar-preferences`: Host settings persistence and first-paint mirror for `teamSidebar`, `teamFeatures`, `teamCollapsed`, `teamAutonomyMode` (`observe` | `auto`), and `teamWatchdog`.

### Modified Capabilities

<!-- None: all requirements land in the six new team-* capabilities while reusing existing skin-preferences and workspace-panel mechanisms unchanged. -->

## Impact

- `src/client.js` & `src/team.js`: Dynamic slot shadowing, draft-preserving DOM updates across polling ticks, full `rename-member` / `rename-room` / room-membership forms, Ticket/Thread/Watchdog UI controls, Chain of Recall inspector, and `/side` responder display.
- `src/host/team-store.js`, `src/host/team-live.js`, `src/host/routes.js`: Extended Super-agent domain store (`triggers`, `threads`, `mandates`, `tickets`, `assignments`, `outbox` with `request_id` idempotency, Chain of Recall graph, automated Steward checkpoint & learning extraction, read-only snapshot `/side` responder, and external Watchdog evaluator).
- `src/host/settings.js` & `src/settings-section.js` & `src/css/settings-section.css`: Inline pill layout for team feature toggles plus `teamAutonomyMode` (`observe` / `auto`) and `teamWatchdog` controls.
- `src/css/team.css`: Token-bound styling for Router/Worker badges, Thread pass-through pills, Ticket/Mandate cards, Chain of Recall handles, and Watchdog alerts.
