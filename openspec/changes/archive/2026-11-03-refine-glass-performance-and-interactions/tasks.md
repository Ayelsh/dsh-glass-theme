# Tasks

All boxes describe future implementation work. The proposal workflow does not execute these tasks. Apply the existing main specifications together with this change's five delta specifications.

## 1. Stable stylesheet lifecycle

- [x] 1.1 Add `tools/style-lifecycle-check.mjs` using the built client with asynchronously delivered mutation records and controlled frames/timers; verify the original implementation fails the no-external-change convergence case rather than merely checking tag count.
- [x] 1.2 Make stylesheet reconciliation idempotent in `src/client.js`, preserving unique identifiers and declared order after host styles; verify startup and host style batches settle with no additional style writes over at least 10 frames and three compatibility ticks, and trailing metadata/scripts cause no reorder.
- [x] 1.3 Preserve missing-sheet and replaced-head recovery, reconnect observation, and retain the 750ms visible-document fallback; verify one/all sheet deletion, head replacement followed by new host styles, and environments without mutation observation or animation-frame scheduling in `style-lifecycle-check.mjs`.
- [x] 1.4 Add mount-generation ownership and cancel startup/repair frames, fallback timeouts, observers, and intervals on disposal; verify late callbacks cannot resurrect styles and an old disposer cannot remove a newer mount's sheets or active-skin markers.
- [x] 1.5 Document the lifecycle check command and its bounded-recovery/convergence coverage in `README.md`; verify the documented build-plus-check sequence runs successfully against the generated bundle.

## 2. Reliable TAPD item details

- [x] 2.1 Add `tools/detail-lifecycle-check.mjs` with dependency comparison, cleanup, delayed requests, and rerenders using actual React or an equivalent lifecycle-aware harness; verify the original loading-state self-cancellation is reproduced and recorded as a failing regression.
- [x] 2.2 Separate panel-owned in-flight requests from rendered detail state in `src/workspace.js`, with project/kind/id keys and project epochs; verify delayed success, A/B responses out of order, identical IDs across projects, failed project switching, externally observed project changes, and unmount invalidation.
- [x] 2.3 Implement same-project completed-cache reuse, close/reopen pending behavior, retained summary content, explicit empty-description outcome, and failure Retry; verify one outstanding read per key, successful retry, and unchanged summary-only handling for item types outside TAPD bug/story/task.
- [x] 2.4 Update `docs/WORKSPACE.md` with detail progress, retry, cache scope, and the absence of a host-CLI cancellation guarantee; verify `node tools/detail-lifecycle-check.mjs`, `node tools/ws-render.mjs`, and `node tools/ws-rich-check.mjs` pass with the existing rich-content handling intact.

## 3. Model and reasoning-effort feedback

- [x] 3.1 Add `tools/picker-feedback-check.mjs` with a controlled public directory store and operation results; verify it covers `{ ok: false }`, synchronous throw, promise rejection, successful command before projection, and provider/model identity collisions rather than relying on source-pattern checks.
- [x] 3.2 Render immediate pending feedback from local operation ownership and the directory snapshot, retaining host-confirmed current selection; verify duplicate pending choices are ignored, different targets can supersede them, and effective default effort is confirmed without inventing a missing default.
- [x] 3.3 Add actionable failure and retry presentation while preserving queries and the all-providers card; verify returned and thrown failures leave the confirmed indicator aligned with the actual host current, including reselecting the current model or an externally selected target.
- [x] 3.4 Guard completion by session, directory, sequence, and picker opening generation; close the all-providers card only on successful outcome plus matching current, and add the eight-second acknowledged-but-unconfirmed state; verify late operations cannot close a newer card, reopen a dismissed picker, steal focus, or trigger automatic host rollback.
- [x] 3.5 Add distinct loading, overall catalog error/retry, true empty, no-match/clear-query, and partial-provider-failure views; verify available models remain usable and no ready-catalog forced-refresh capability is assumed.
- [x] 3.6 Update the picker behavior and regression commands in `README.md`; verify `node tools/picker-feedback-check.mjs` passes and existing provider filtering, current-model visibility, provider/model keys, and inline effort behavior remain covered.

## 4. Shared layer and keyboard navigation

- [x] 4.1 Add a reusable isolated CDP browser fixture and `tools/interaction-check.mjs` using the real skin components and host-compatible React from an installed/supplied test path; verify missing prerequisites fail explicitly and controlled services cannot mutate the user's active settings, session model, or TAPD records.
- [x] 4.2 Add the bare `src/layers.js` coordinator, inline it through `tools/build.mjs`, and pass one owner-scoped instance to the skin component factories; verify the fixture covers top-layer Escape/outside handling, nested owners, disposal, and restoration of previously applied focus/inert states.
- [x] 4.3 Integrate nonmodal picker and statistics entry/return focus, pointer-outside focus preservation, and natural Tab exit; verify keyboard-open/Escape-return, outside-control focus, child-card-only Escape, and completion after user dismissal in `interaction-check.mjs`.
- [x] 4.4 Implement grouped combobox/listbox model navigation and a complete effort radio-group pattern, updating affected CSS and test selectors; verify arrow movement, Enter activation, visible active results, removed-result recovery, and ordinary Tab access to search/disclosure/effort controls.
- [x] 4.5 Integrate the workspace project menu, desktop inspector, narrow blocking inspector, and action dialogs with the coordinator; verify one Escape closes only the top layer, named modal dialogs contain Tab/Shift+Tab, background restrictions restore correctly, and disabling the workspace removes all owned handlers/restrictions.
- [x] 4.6 Replace settings drill-down node retention with provider-ID-based focus restoration after commit; verify entry focus, save/back return to the newly rendered provider control, provider disappearance fallback, and unchanged local-draft/one-save/discard behavior.
- [x] 4.7 Preserve unmounted closed-inspector behavior and make reduced-motion transitions state-safe; verify open/close at 900 CSS pixels or less, mid-interaction motion-preference changes, and absence from DOM or display/hit testing/Tab navigation after close.
- [x] 4.8 Document keyboard paths and the isolated interaction-check command in `README.md` and relevant workspace instructions; verify `node tools/interaction-check.mjs` completes the documented flows without application-console errors.

## 5. Readable controls and restrained settings

- [x] 5.1 Apply the role-scoped 12px/17px typography minimum and readable foregrounds to model descriptions/rates, provider counts, settings helper text, and workspace status/owner/time metadata; verify computed sizes and actual composited contrast of at least 4.5:1 in normal, hover, selected, and selected-plus-hover states in both host themes.
- [x] 5.2 Simplify ordinary settings enabled rows to the design's faint gradient, neutral name/glyph treatment, and primary switch indicator; verify enabled/off, hover, keyboard focus, and capacity-limit states remain distinguishable and increased-contrast outlines still apply.
- [x] 5.3 Apply the settings-only ambient, grain, and colored-shadow defaults from `design.md`, retaining existing blur, radii, edge highlight, and depth structure; verify reduced transparency yields final background alpha 1 with no backdrop blur/glow/grain and reduced motion preserves final switch positions.
- [x] 5.4 Add `tools/presentation-check.mjs` on the isolated browser fixture and a `docs/PRESENTATION-QA.md` evidence record; verify computed role sizes, state-specific composited contrast pairs, host-theme overrides, combined display preferences, and control fit, without treating antialiased edge pixels or old blue-row preview checks as acceptance.
- [x] 5.5 Complete the design's visual matrix at actual Windows 100/125/150 percent scaling, including the combined-preference narrow case, and record host version, OS/host scale, CSS viewport, state, screenshots, and measured ratios in `docs/PRESENTATION-QA.md`; verify text does not overlap its controls and explicitly list any unavailable environment case as unrun rather than passed.

## 6. Integration and distributable verification

- [x] 6.1 Generate `lib/client.js` through `node tools/build.mjs` and verify `node tools/smoke.mjs`, `node tools/assert-built.mjs`, and all five new lifecycle/interaction/presentation checks pass against their intended source or built entry points; confirm no hand-edited generated bundle or new runtime dependency is introduced.
- [x] 6.2 With the required local selector inventories present, run `node tools/verify.mjs` and `node tools/leak.mjs`, then rerun applicable workspace checks; verify no dead/overmatching selectors, no regression in sanitization or workspace mounting, and report missing inventory prerequisites explicitly.
- [x] 6.3 Load the candidate bundle into a disposable DSH profile and validate the existing quick-provider filtering/draft-save, host preference persistence/mirror, and workspace toggle requirements together with the new keyboard and feedback paths; verify no live user profile or remote workflow record is changed.
- [x] 6.4 Observe idle stylesheet activity and host-style recovery on the same browser before/after, and complete the acceptance record with all commands and unrun limitations; verify stable idle has no recurring stylesheet rewrites and make no numeric CPU/GPU/FPS improvement claim without a corresponding browser trace.

## Workflow follow-up

- Review the completed implementation and evidence before archiving the change through the OpenSpec archive workflow.
- Publishing or installing into an active user profile is outside this change's planning authorization and is not part of tracked implementation completion.
