# Design

## Context

The Liquid Glass skin is a two-plane DSH plugin: a client plane (`src/client.js`, `src/team.js`, `src/settings-section.js`, …) that mounts DOM into harness slots (`sidebar.workspaces`, `sidebar.footer.action`, `settings`), and a host plane (`src/host/routes.js`, `src/host/settings.js`, `src/host/team-store.js`, `src/host/team-live.js`) that serves data routes and persists team and preference state.

To align with the **DeepSeek Super-agent** architecture (`https://mp.weixin.qq.com/s/zoS7GlReWPhfCjENGxXCdg` and `deepseek-ai/dsh-superagent-prototype`) as well as the `ds-bot` reference (`G:\dshbuild\plugins\bot`), the sidebar team capability must go beyond static roster/room CRUD and implement the five pillars of Super-agent orchestration within the plugin's self-contained architecture:
1. **Two-tier Resident Router / Isolated Worker model** (`Lead` = Router, `Member` = Worker) with structural separation of coordination from execution.
2. **Event-driven intake pipeline** (`Trigger -> Fast/Slow Filter -> Mandate -> Ticket/Assignment`) supporting default `observe` mode (speculative/candidate staging) vs `auto` mode, plus **Thread subscription direct pass-through** (follow-up events in a subscribed room/thread go straight to the assigned Worker without re-running Router dispatch and without widening `Mandate` authority).
3. **Inline & Spill context budgeting and Chain of Recall** (`trg_*`, `thd_*`, `tkt_*`, `ses_*` stable IDs with hop-by-hop recall handles) plus automated **Steward** extraction of Learning Cards and Handoff Checkpoints.
4. **Full-duplex interaction & read-only snapshot `/side` chat**: non-blocking ticket execution, channel-adapted concise Router summaries (`<= 100` words), and a `/side` (BTW) responder that answers questions against a member's read-only state snapshot without polluting the primary Worker session.
5. **Durable store, idempotent Outbox, and external Watchdog loop**: persistent `Ticket`/`Assignment`/`Outbox` ledger (`request_id` deduplication) and a periodic Watchdog check that detects stalled or goal-drifting tickets based on queue age, retry count, and verifiable artifacts.

## Goals / Non-Goals

**Goals:**

- Upgrade `src/host/team-store.js` and `src/host/team-live.js` into a cohesive **Super-agent Host Engine** supporting `Trigger`, `Thread` (Rooms), `Mandate`, `Ticket`, `Assignment`, `Outbox`, Chain of Recall (`trg_*`/`thd_*`/`tkt_*`/`ses_*`), automated Steward extraction, read-only `/side` replies, and Watchdog progress audits.
- Guarantee **single-slot safety** on `sidebar.workspaces`: claim the slot with negative priority shadowing only when the team panel is expanded, and unregister (`off()`) immediately when stowed or disabled so the built-in `WorkspaceBrowser` renders natively.
- Preserve user input focus and draft text across background polling ticks (`2.5s`) in all forms (`newBox` and `panel`), and complete all unfinished UI flows (`rename-member` / `profile-update`, `rename-room` / `room-update`, room member subscription assignment).
- Maintain strict failure containment and CSS token binding (`src/css/tokens.css`).

**Non-Goals:**

- No modification to the DSH harness binary (`app.asar`).
- No non-sidebar bot features (voice/TTS, office document toolchains, external IM webhooks).

## Decisions

1. **Dynamic Single-Slot Shadowing for `sidebar.workspaces`.**
   In DSH's slot engine, `sidebar.workspaces` is declared as `kind: "single"` (only the lowest numerical priority entry is rendered by React; all higher-priority entries are unmounted). Registering a permanent component and hiding it via CSS `display: none` when stowed prevented `WorkspaceBrowser` from mounting, leaving the sidebar blank. Therefore, `slotsHandle.mountRegion()` registers `RegionError` into `sidebar.workspaces` at `freePriority(entries, -50)` **only when `open === true`** (`!stopped && enabledPref() && !collapsedPref()`), and `slotsHandle.unmountRegion()` calls the registration's `off()` disposer whenever stowed or disabled. `sidebar.footer.action` (`kind: "list"`) remains registered while the plugin is active.

2. **Two-Tier Resident Router & Isolated Worker Domain Model.**
   - **Resident Router (`role: 'lead'`)**: The single Lead profile acts as the Resident Router. It receives incoming `Triggers`, batches rapid arrivals within a short window, evaluates or stages `Mandates`, creates `Tickets` (`tkt_*`) and `Assignments` (`asg_*`), and serves as the sole external summary voice to the user. Structurally, Router actions only create/route/summarize tickets rather than running heavy worker tasks itself.
   - **Isolated Workers (`role: 'member'`)**: Each teammate profile represents an Isolated Worker with its own scoped memory, checkpoints, side-chat transcript, and bound DSH session reference (`ses_*`). Workers execute assigned `Tickets` asynchronously (`queued -> working -> ready -> merged`) and report structured deliverables back to the Router.

3. **Two-Stage Event Filter, `observe` vs `auto` Policy, and Mandate Boundary.**
   Every incoming room message, `@mention`, or dispatch request enters the store as a `Trigger` (`trg_*`) bound to a `Thread` (`thd_*`, backed by a Room):
   - **Stage 1 (Fast Path — deterministic code rules)**: Direct `@member` mentions, explicit command dispatches, or messages matching a room's active target classify as `explicit`; general room messages with a room goal classify as `candidate`; empty/noise events classify as `ignore`.
   - **Stage 2 (Policy & Autonomy Mode)**:
     - Under **`observe` mode** (the default per `000-philosophy.md` low-interruption principle), `candidate` triggers create a pending `Mandate` (`status: 'observed'`) and a speculative draft `Ticket` (`status: 'observed'`) awaiting human one-click approval (`Approve & Dispatch`) without interrupting or mutating live Worker execution.
     - Under **`auto` mode** (or for `explicit` triggers), the engine issues an authorized `Mandate` (`mnd_*`, `status: 'authorized'`) and dispatches the `Ticket` to the best-matched or `@`-named Worker.

4. **Thread Subscription Direct Pass-Through (Bypassing Router without Authority Escalation).**
   When a Worker is assigned a `Ticket` originating from a `Thread` (Room), that Worker is added to the Thread's active subscribers (`subscribedWorkerIds`). Subsequent `Triggers` in the same `Thread` match the subscription in the intake fast path and **route directly to the subscribed Worker's ticket context (`passThrough: true`)**, bypassing Router re-evaluation (mirroring the Super-agent prototype's ~30% Router decision reduction). Crucially, pass-through triggers append to the ticket's `contextEvents` only and **MUST NOT widen or alter the ticket's existing `Mandate` scope**.

5. **Inline & Spill Context Budgeting and Chain of Recall (`trg_*` / `thd_*` / `tkt_*` / `ses_*`).**
   Every domain entity carries a stable prefixed identifier (`trg_<id>`, `thd_<id>`, `tkt_<id>`, `mnd_<id>`, `asg_<id>`, `ses_<id>`) and cross-references its upstream and downstream links (`recallRefs: { triggerIds, threadId, mandateId, ticketId, workerId, sessionId }`). In the UI and Worker context projection:
   - **Inline**: The most recent summary (`<= 240` chars) and immediate status are inlined directly on the card.
   - **Spill & Hop-by-Hop Recall**: Full event payloads, long deliverables, and historical context are spilled into inspectable recall nodes. Clicking any `trg_*`, `thd_*`, `tkt_*`, or `ses_*` chip in the Recall tab or Ticket card traverses and expands the linked entity on demand.

6. **Automated Context Steward (Post-Ticket Learning Cards & Handoff Checkpoints).**
   When a Worker transitions a `Ticket` to `ready`/`merged` or when its accumulated ticket/event count crosses the compaction threshold, the host Steward automatically synthesizes:
   - A candidate **Learning Card** (`status: 'pending'`, linked to `tkt_*`) capturing reusable decisions or constraints for user confirm/discard.
   - A **Handoff Checkpoint** (`chk_*`, linked to `tkt_*` / `thd_*`) summarizing completed objectives, open blockers, and recall IDs so subsequent work continues seamlessly.

7. **Read-Only Snapshot `/side` (BTW) Responder.**
   Sending a message in the `/side` tab (`kind: 'side-send'`) no longer stops at storing the user's line. The host engine immediately constructs a **read-only snapshot** of the target member (role, accepted memory entries, active/recent tickets, latest handoff checkpoint, and live session status/events) and generates a deterministic, context-aware assistant reply (`from: 'member'`) appended to `sideChats[memberId]` within the same transaction, leaving the member's main conversation and active tickets completely untouched.

8. **Durable Outbox (`request_id` Idempotency) and External Watchdog Loop.**
   - **Outbox & Idempotency**: Mutations that dispatch messages or tickets accept an optional `requestId`; `team-store.js` records processed `requestId` receipts in a bounded `outbox` ring buffer (`cap: 100`) so retries or duplicate network deliveries are idempotent no-ops returning the original receipt.
   - **External Watchdog**: On each live refresh (`team-live.js` / `team-store.js` watchdog pass when `teamWatchdog` is enabled), an independent evaluator inspects all `working`/`queued` tickets against three criteria: (a) **stall age** (exceeding stall threshold without progress), (b) **retry count** (`>= 3`), and (c) **goal drift** (deliverable/activity diverging from the Room/Ticket goal). Tickets failing the check are marked `stalled` with a diagnostic `watchdogReason` and surfaced with a warning badge and one-click recovery actions (`Retry`, `Reassign`, `Dismiss`).

9. **Draft-Preserving DOM Updates and Complete Edit Flows (`rename-member`, `rename-room`).**
   - `renderNewBox()` is idempotent across background `tick()` polls whenever `old.dataset.kind === state.newBox.kind`, and `renderPanel()` preserves `[data-panel-input]` draft values, active focus, and text selection ranges across re-renders.
   - `renderNewBox()` and `dispatch()` fully support `rename-member` (pre-filling name, role, model, and responsibility caption -> `profile-update`) and `rename-room` (pre-filling room name, goal, and interactive member subscription chips -> `room-update`).

10. **Settings Layout & Super-Agent Preferences.**
    `src/host/settings.js` extends the `team` preference group with `teamAutonomyMode` (`'observe'` default | `'auto'`) and `teamWatchdog` (`true` default) alongside `teamSidebar`, `teamFeatures`, and `teamCollapsed`. In `src/settings-section.js` and `src/css/settings-section.css`, feature toggles render as compact inline pills inside the unified `.lg-settings-utility.has-features` card rather than full-width stacked bars.

## Risks / Trade-offs

- [Polling vs User Typing Collisions] → Solved by making `renderNewBox()` skip re-creation when the same `box.kind` is already mounted and by snapshotting/restoring draft values and selection ranges in `renderPanel()`.
- [Single-Slot Contention on `sidebar.workspaces`] → Solved by dynamic registration (`mountRegion()` only when open, `unmountRegion()` when stowed) at a computed priority below `0` (`freePriority(entries, -50)`).
- [Store Size Growth with Triggers/Tickets/Outbox] → Every collection in `team-store.js` enforces strict ring-buffer caps (`triggers: 100`, `tickets: 64`, `mandates: 64`, `outbox: 100`, `profiles: 32`, `rooms: 64`).

## Migration Plan

Existing `team-state.json` v1 files are upgraded in-place on load by `normalizeState()`, seeding default empty arrays/maps for `triggers`, `mandates`, `tickets`, and `outbox` while preserving existing `profiles`, `rooms`, `memory`, `sideChats`, `learning`, `checkpoints`, and `seen` watermarks.
