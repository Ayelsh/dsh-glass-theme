# Tasks

## 1. Foundation: team store, routes, client skeleton

- [x] 1.1 Create `src/host/team-store.js` with profiles, rooms, memory entries, side-chat transcripts, write-cap/pruning, and persistence under the plugin data dir, mirroring the usage-ledger storage pattern. Verify: import the module in a Node check script and exercise save/load/reset round-trips, confirming the file appears under the plugin data dir and caps hold.
- [x] 1.2 Register team data routes (GET state, POST mutations) in `src/host/routes.js` following the existing route conventions. Verify: `node tools/host-check.mjs` passes and a route probe returns the team state shape for a fresh store.
- [x] 1.3 Create `src/client/team.js` claiming the sidebar's region seat with try/catch containment (render nothing on failure). Verify: build with `node tools/build.mjs`, reload the GUI, and confirm the team panel mounts inside the sidebar and that an injected error in the module leaves the session list intact.
- [x] 1.4 Create `src/css/team.css`, register it through the existing stylesheet lifecycle, and confirm all color/spacing values bind to `src/css/tokens.css` variables. Verify: `node tools/style-lifecycle-check.mjs` passes and a grep check finds no raw colors in `team.css`.

## 2. Shell: switch, sidebar-region panel, stow

- [x] 2.1 Add the team switch (user-controlled enable) driving mount/unmount of the team panel, persisted via the preferences module. Verify: toggling the switch hides/restores the team surface and the choice survives a reload.
- [x] 2.2 Claim the sidebar's region seat (`sidebar.workspaces` slot entry wrapped in a React error boundary, registered dynamically with negative priority only while expanded and unregistered when stowed) plus a `sidebar.footer.action` toggle entry; the expanded panel replaces the session browser in the region area via the `data-lg-team-open` attribute, at the sidebar's own width, with the center column untouched. Verify: `node tools/team-shell-check.mjs` scenario 11 asserts the slot claims, region mount/detach, and footer toggle behavior.
- [x] 2.3 Stow the panel: the head control and the footer toggle both clear the open attribute and unregister the `sidebar.workspaces` override so the session browser returns in place; expanding swaps the browser back out; no floating column, strip, or chat-column push remains. Verify: `node tools/team-shell-check.mjs` scenarios 11/12/14 assert swap semantics, disposal, and stow persistence.
- [x] 2.4 Write `node tools/team-shell-check.mjs` asserting mount containment, open-attribute swapping, stow persistence, and settings-group rendering against the built bundle. Verify: the check script passes on a clean build (14 scenarios).

## 3. Roster

- [x] 3.1 Render the roster list from team state: Lead first, then members, each row showing avatar, name, role caption, and presence dot. Verify: seed two profiles in the store and confirm row order, labels, and empty-state hint render as specified in `specs/team-roster/spec.md`.
- [x] 3.2 Implement deterministic SVG identicons hashed from member id as the avatar fallback, with configured data-URI avatars taking precedence. Verify: two members with different ids render stable, distinct identicons across reloads, and an avatar override replaces the identicon.
- [x] 3.3 Map presence from observable harness signals (working = streaming turn, waiting = pending approval/question, idle otherwise) with idle fallback on missing signals. Verify: while a teammate turn streams, its row shows working; with no activity all rows fall back to idle.
- [x] 3.4 Implement unread badges incrementing on activity in non-focused conversations and clearing on focus. Verify: activity in a background conversation raises the badge; focusing that conversation clears it.
- [x] 3.5 Extend `node tools/team-shell-check.mjs` (or add `team-roster-check.mjs`) asserting roster order, identicon determinism, and badge clear-on-focus. Verify: the check script passes.

## 4. Rooms

- [x] 4.1 Implement room definitions (name, member ids, goal) in the team store and room rows in the sidebar, each showing name, goal line, and member chips. Verify: create a room via the store and confirm the row renders with goal line and chips per `specs/team-rooms/spec.md`.
- [x] 4.2 Bind rooms to real conversations: selecting a room focuses its bound conversation through the existing conversation-switch path; room removal deletes only the definition, never the conversation. Verify: selecting a room switches the chat; removing the room leaves the conversation listed in the session list.
- [x] 4.3 Implement mention markers distinct from unread badges: explicit @-mentions surface a mention marker that outranks plain unread. Verify: a room with both a mention and plain unread shows the mention marker; opening the room clears both.
- [x] 4.4 Add room checks to the team check script asserting goal-line rendering, removal-is-bookkeeping, and marker precedence. Verify: the check script passes.

## 5. Actions: context menus and palette

- [x] 5.1 Build the context menu overlay for member and room rows (configure, rename, remove, clear memory entries) styled with the existing overlay primitives. Verify: right-click/long-press on a row opens the menu; actions mutate the team store and the menu closes; overlay closes on outside click and Escape.
- [x] 5.2 Implement the Ctrl/Cmd+K palette listing members, rooms, and panel entries with fuzzy filter and keyboard navigation. Verify: opening with the shortcut lists all entries, typing filters, Enter/arrow keys select, and each entry performs its action.
- [x] 5.3 Wire member creation behind feature detection of the harness team capability: real spawn when exposed, otherwise a disabled entry with an explanatory hint. Verify: with the capability absent the entry renders disabled with hint and no error; with it present a test spawn creates a member visible in the roster.
- [x] 5.4 Route destructive actions (remove member/room, clear memory) through the existing approval/confirm UI pattern. Verify: each destructive action shows confirmation and is cancellable without state change.
- [x] 5.5 Add action checks (menu open/close, palette navigation, disabled-entry rendering) to the team check script. Verify: the check script passes.

## 6. Panels: memory, learning, handoff, side chat

- [x] 6.1 Build the memory panel per member: list stored entries with add/edit/remove, reading and writing the team store. Verify: seeded entries render; add/edit/remove round-trip through the store and persist across reload.
- [x] 6.2 Implement learning cards: pending entries awaiting confirm/discard, moving to accepted memory on confirm and dropping on discard. Verify: a pending entry shows as a card; confirm moves it into the member's memory list; discard removes it.
- [x] 6.3 Implement handoff checkpoint cards: render from compaction/handoff events when observable for the focused member, else offer a manual checkpoint note; both dismissable and non-blocking. Verify: seeding a checkpoint shows the card; dismissing removes it without side effects; the manual note path saves a checkpoint entry.
- [x] 6.4 Implement side chat (BTW): member-scoped exchange writing to its own transcript section, never the main conversation. Verify: sending a side-chat message appends to the side transcript and the main conversation transcript is unchanged.
- [x] 6.5 Add panel checks (round-trips, card transitions, side-chat isolation) to the team check script. Verify: the check script passes.

## 7. Preferences

- [x] 7.1 Add the `team` group (`enabled`, `features`, `collapsed`) to the declared host settings entry and render it in the settings page via the `settings-section.js` pattern (switch, feature checkboxes, reset). Verify: settings page shows the team group; changing values reflects in the sidebar live.
- [x] 7.2 Add the browser-storage mirror of `enabled`/`collapsed` with one-time reconciliation in favor of the host entry, following the `skin-preferences` migration pattern. Verify: with divergent mirror values, reload reconciles to the host entry and the one-time flag prevents re-migration.
- [x] 7.3 Implement reset-to-defaults for the team group (re-enable the panel, restore the default feature list; stow state is excluded). Verify: reset restores defaults in the host entry and the sidebar returns to the expanded default features.
- [x] 7.4 Add preference checks (group rendering, reconciliation direction, reset) to the team check script. Verify: the check script passes.

## 8. Integration

- [x] 8.1 Run the full build and the complete team check suite together. Verify: `node tools/build.mjs` and all `team-*check.mjs` scripts pass on the final bundle.
- [x] 8.2 Re-verify containment end-to-end: with the team switch off and with an injected team-module error, the ordinary session list, settings page, and workspace panel behave exactly as before the change. Verify: side-by-side GUI observation and the containment assertions in the check suite.
- [x] 8.3 Validate planning artifacts and specs. Verify: `openspec validate team-mode-sidebar --strict` passes with all requirements covered.

## 9. Unfinished UI Closure & Input Stability

- [x] 9.1 Preserve in-progress user drafts and input focus across background polling ticks (`tick()`) in `renderNewBox()` and `renderPanel()`, and fix the settings page team card layout so feature toggles render as inline pills inside `.lg-settings-utility.has-features`. Verify: typing in `.lg-team-newBox` or `.lg-team-panel` survives multiple `2.5s` poll cycles without clearing or losing focus.
- [x] 9.2 Complete `rename-member` (`profile-update`) and `rename-room` (`room-update` with room name, goal, and interactive member subscription chips) in `src/team.js` (`renderNewBox` and `dispatch`). Verify: selecting "重命名" on a member row or "编辑目标" on a room row opens a pre-filled editor and submits `profile-update` / `room-update` cleanly.
- [x] 9.3 Extend `src/host/settings.js`, `src/settings-section.js`, and `src/team.js` with `teamAutonomyMode` (`'observe'` default vs `'auto'`) and `teamWatchdog` (`true` default), including browser mirror and reset-to-defaults support. Verify: settings page and team header toggle between `observe` and `auto` modes and persist across reloads.

## 10. Super-agent Two-Tier Engine, Event Pipeline & Thread Pass-Through

- [x] 10.1 Extend `src/host/team-store.js` with Super-agent domain entities (`triggers` `trg_*`, `mandates` `mnd_*`, `tickets` `tkt_*`, `assignments` `asg_*`, and `outbox` `requestId` deduplication ring buffer) and two-stage intake filtering (`explicit` / `candidate` / `ignore`) governed by `observe` vs `auto` autonomy mode. Verify: `node tools/team-store-check.mjs` tests trigger classification, `observe` staging vs `auto` dispatch, and `requestId` idempotency.
- [x] 10.2 Implement Thread Subscription Direct Pass-Through in `src/host/team-store.js`: assigning a Worker to a Room Thread (`thd_*`) subscribes the Worker (`subscribedWorkerIds`), and subsequent triggers in that Thread route directly to the subscribed Worker's ticket context (`passThrough: true`) without creating duplicate Router dispatches and without widening the existing `Mandate` scope. Verify: store check asserts pass-through routing and Mandate invariance.
- [x] 10.3 Project Resident Router (`lead`) and Isolated Worker (`member`) roles, active ticket counts, Thread subscription pass-through pills, and quick ticket dispatch/approval controls in `src/team.js` and `src/css/team.css`. Verify: shell check asserts Router/Worker badges, ticket dispatch, and `observe` -> `working` approval transitions.

## 11. Chain of Recall, Automated Steward, Live Side-Chat & External Watchdog

- [x] 11.1 Implement Chain of Recall (`recallRefs: { triggerIds, threadId, mandateId, ticketId, workerId, sessionId }`) with Inline summaries and expandable Spill continuation details in `src/host/team-store.js` and a `recall` ("工单/召回") tab in `src/team.js`. Verify: store and shell checks assert hop-by-hop recall reference integrity and Spill expansion in the UI.
- [x] 11.2 Implement automated Context Steward extraction on ticket completion (`ticket-complete`) and compaction thresholds: automatically synthesize a pending Learning Card and a Handoff Checkpoint linked to the ticket's recall IDs. Verify: completing a ticket automatically populates a pending learning card and checkpoint for the assigned Worker.
- [x] 11.3 Upgrade `side-send` in `src/host/team-store.js` to generate an immediate, deterministic assistant reply grounded in a read-only snapshot of the target member's role, memory, active tickets, and latest checkpoint without mutating the main conversation or active tickets. Verify: sending a `/side` question returns both the user message and the member's snapshot-grounded reply in `sideChats[memberId]`.
- [x] 11.4 Implement the external Watchdog evaluator (`watchdog-check` / `watchdog-resolve` in `src/host/team-store.js` and `src/host/team-live.js`) that flags `working`/`queued` tickets exceeding stall age, retry cap (`>= 3`), or goal drift as `stalled` and surfaces recovery actions (`Retry`, `Dismiss`) in the sidebar. Verify: store and shell checks assert stall detection and recovery transitions.

## 12. Full Verification & Live GUI End-to-End Retest

- [x] 12.1 Expand `tools/team-store-check.mjs` and `tools/team-shell-check.mjs` to cover all new Super-agent domain mutations, `rename-member`/`rename-room`, Thread pass-through, Chain of Recall, automated Steward, read-only `/side` reply, and Watchdog recovery, and run `node tools/build.mjs`, `node tools/style-lifecycle-check.mjs`, `node tools/host-check.mjs`, and `openspec validate team-mode-sidebar --strict`. Verify: all check suites pass with zero errors.
- [x] 12.2 Redeploy to the active desktop profile and run `tools/team-full-retest.mjs` against the live Web GUI via CDP, capturing screenshot evidence of settings inline pills, member/room creation and rename, ticket dispatch & Thread pass-through, Chain of Recall panel, live `/side` reply, and stowed session list preservation. Verify: live GUI retest passes all steps and screenshots confirm visual correctness.
