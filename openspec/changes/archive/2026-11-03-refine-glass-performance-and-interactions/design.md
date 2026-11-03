# Design

## Context

See `proposal.md` for motivation and scope. The plugin runs as a plain-script client module. `tools/build.mjs` inlines CSS and bare function factories from `src/` into `lib/client.js`; separate React roots render the picker, statistics, settings, and workspace. There is no frontend bundler or established browser-test dependency to replace.

Relevant observations:

- `src/client.js:98-184` unconditionally moves every skin style, then observes those same additions. Its synchronous `raising` flag does not cover asynchronous observer delivery. The committed bundle contains the same logic.
- `src/workspace.js:1737-1760` depends on the entire `details` object while updating it to loading. Dependency cleanup revokes the pending read before its response can publish. Source-effect lifecycle simulation reproduces this; it is not a real-browser measurement.
- `src/picker.js` already subscribes to the host directory but does not present its `status`, `pending`, `error`, and provider `failures` fully. The locally extracted host contract confirms that business failure can resolve `{ ok: false, error }`; successful command completion alone does not establish the durable current selection.
- Settings drill-down stores an opener node that is removed during the view swap. Workspace dialog and inspector handlers independently receive Escape.
- Small descriptions and metadata use 10-11.5px text, often with tertiary foregrounds. Selected model descriptions also reduce the selection-label opacity. Historical settings screenshots show strong color and grain; the new appearance has not been rendered yet.
- The real inspector is conditionally unmounted on close. The reduced-motion transform rule is a regression risk for retained-node implementations, not a confirmed visible closed inspector in the current application.

The existing main specifications remain authoritative for quick-provider filtering, draft/save behavior, host preference persistence, and workspace presence. The five new capabilities add separate contracts rather than rewriting those requirements.

## Goals / Non-Goals

**Goals:**

- Give each asynchronous task and transient layer a specific owner with explicit invalidation and cleanup.
- Keep host projections authoritative and make pending presentation distinct from confirmed state.
- Reuse the package's source/build model, existing React peer, and Node/CDP verification tools.
- Make first-tranche acceptance reproducible without mutating a user's normal profile or invoking live workflow writes.

**Non-Goals:**

- No new host endpoints, catalog internals, persistent detail store, or runtime dependency.
- No general polling rewrite, statistics subscription redesign, responsive picker replacement, or new animation framework.
- No global palette lift, density setting, icon-system replacement, or increase in blur/refraction complexity.

## Decisions

### 1. Reconcile styles idempotently, with generation-scoped ownership

Reconciliation checks sheet identifiers, declared order, and order relative to host stylesheet-bearing nodes. An already-correct set produces zero stylesheet DOM writes. Trailing metadata or scripts do not justify a reorder. Preserve `data-plugin` and `data-plugin-css` compatibility attributes.

Observer delivery ignores the current generation's own insertions/moves, responds to external stylesheet arrivals and removal of owned sheets, and coalesces repair into one pending frame. Keep the existing 750ms visible-document compatibility interval for missed removal and head replacement; after head replacement, reconnect observation to the new head. This change does not refactor unrelated timers.

Track the startup frame, repair frame or fallback timeout, interval, observer, and mount generation. A newer mount takes ownership without duplicate identifiers; obsolete callbacks cannot move or remove the new generation's tags. Disposal first invalidates ownership, then cancels scheduled work and releases only that generation's resources. Guard related active-skin markers against an obsolete disposer clearing a newer mount's state.

Alternatives considered: a longer-lived boolean still cannot identify asynchronous self-notifications; an unfiltered whole-document observer would add unrelated work; removing compatibility recovery would regress late host loading and head rebuilds. Idempotence is required even when observer filtering succeeds.

### 2. Own detail reads at panel/project scope, separately from rendering state

For the existing TAPD bug/story/task detail service, maintain a panel-owned cache and an independent in-flight registry keyed by project ID, item kind, and item ID. Other item types retain their existing summary-only paths. Rendering state describes absent/loading/done/error; it does not determine request lifetime by depending on the entire state object it changes. A request records its owner epoch and request identity before publishing loading.

Closing details or selecting a different item detaches the view; an existing request can finish into its own cache key. Reopening joins the in-flight read or reuses completed data. Failed entries expose Retry; repeated retry while the same key is in flight is ignored. Render existing summary content while complete details load, and retain the current rich-content sanitizer and image/link handling.

At the start of a project change, advance the project epoch, clear the active inspector and in-flight ownership, and prevent new detail reads until the active project is confirmed. On failed switching, resume the confirmed project in the new epoch with empty request state. Detect project changes reported by later host status reads as well. Panel disposal invalidates all outstanding publication rights. Browser cancellation is optional and does not imply that a host CLI was terminated.

Alternatives considered: view-level cancellation can work but requires removing abandoned loading entries on every close. A panel-owned registry gives the existing revisit cache a clear owner and avoids duplicate reads. Cross-panel persistence and automatic refresh of cached descriptions are deferred.

### 3. Derive picker feedback from the public directory snapshot and guarded outcomes

Use `directory.store` and its public `load()` / `select()` contract. Keep checkmarks and the selected effort tied to `snapshot.current`, using the model's effective default effort when the projection omits it. Identify selections by provider/model/effort, never model ID alone. Do not write optimistic current values or roll back the host after a failed command.

Track the local operation's directory, session, sequence, target, origin card, opening generation, and outcome. Show pending immediately. Repeating the identical pending selection is ignored; a different target can supersede it, consistent with the host's existing latest-operation behavior. Handle returned `{ ok: false }`, synchronous throws, and rejected promises. A late operation from a replaced session/directory cannot affect the current card or feedback. Completion after user dismissal updates authoritative selection normally but cannot reopen a card or restore focus; presentation callbacks require the original opening generation to remain active.

Close the all-providers card only after successful command outcome and matching confirmed current selection; keep the main card open. Return focus to a connected main-card target, preferring the relevant effort control or all-providers opener. Failure retains queries and the child card. If an acknowledged operation has no matching projection after 8 seconds, replace the spinner with an explicit unconfirmed-status explanation and retry; never label it successful or automatically revert the host. A later matching projection can still resolve that state.

Present initial loading, overall catalog error, true empty catalog, filtered no-match, and partial provider failures separately. `failures` describes catalog-provider availability, not a selection error. Use `load()` for supported initial/error retries; do not claim it refreshes partial failures in an already-ready catalog, since the verified host can return cached data there.

Alternatives considered: promise resolution as success misclassifies the real result contract; immediate child-card closure hides failures; a local authoritative selection would diverge from other host entry points.

### 4. Share layer coordination across the existing React roots

Introduce a package-local bare factory, `src/layers.js`, inlined by `tools/build.mjs` and instantiated once per active skin application. Pass the coordinator into the existing picker, statistics, settings, and workspace factories through shared options. It owns skin layer ordering, Escape/outside-dismissal routing, connected focus restoration, and modal focus restrictions. Component owners register/unregister layers; skin disposal releases the coordinator. It does not manage host-owned dialogs or routing.

Use one top-layer dismissal decision per event. Remove independent skin document handlers that can dismiss lower layers simultaneously. Dismissal caused by pointer activation outside a nonmodal layer does not force return focus. Keyboard dismissal restores a connected opener; when an opener is removed, use the owning layer's safe heading/trigger fallback. Do not globally suppress unrelated host keyboard events.

The picker and statistics remain nonmodal and do not trap Tab. The picker uses a search combobox with a grouped listbox and a valid active descendant; arrow keys move the active result, Enter selects, and query/catalog changes repair a removed active target. Keep ordinary Tab access to group disclosure and other controls. Effort uses a complete radio-group keyboard pattern. Update CSS state selectors when replacing `aria-checked` model rows with `aria-selected` options.

Workspace action dialogs are titled modal layers. The desktop inspector is a nonmodal named region; the narrow inspector with its blocking scrim is a titled modal sheet. Contain focus and make only the appropriate background siblings inert for a modal, never an ancestor containing the modal. Preserve and restore previous inert/accessibility states, including nested modal lifetimes and removed DOM nodes. Nonmodal background interaction stays available.

Settings model drill-down is a view change, not a modal. Store the provider ID rather than the old opener node; after rendering the destination view, a layout effect focuses its heading/return control or the newly rendered provider control. Preserve draft/discard/save semantics. Closed inspectors continue to unmount; if exit effects retain a node later, explicit hidden/inert state must preserve the same closed-state contract under reduced motion.

Alternatives considered: separate event handlers recreate the current ordering bug; a third-party overlay framework would add a runtime dependency and disrupt this package's loader. The coordinator centralizes only lifecycle and navigation, leaving data and rendering with their existing owners.

### 5. Improve named text roles and reduce settings decoration locally

Apply a role-based typography pass to model descriptions/rate labels, provider model counts, settings helper text, and workspace status/owner/time metadata. Use a 12px/17px minimum at the default scale; this is a project design choice, not a claimed universal minimum. Reuse secondary foregrounds or a scoped readable-muted token where appropriate, without brightening every tertiary or decorative label globally. Audit normal, hover, selected, and selected-plus-hover colors. Selected model auxiliary text should use near-opaque selection-label color, subject to actual background measurements.

Retain the existing system font stack, material hierarchy, radii, board blur/saturation, specular edge, and contact/mid shadows. Start implementation with these settings-only values; tune further only while retaining the spec's readability and state-recognition contract:

| Setting | Light | Dark |
| --- | --- | --- |
| Three ambient source alphas | 0.26 / 0.20 / 0.17 | 0.28 / 0.14 / 0.18 |
| Grain opacity | 0.02 | 0.025 |
| Accent contribution in the colored outer shadow | 20% | 24% |
| Enabled-row accent gradient | 6% to 2% | 8% to 3% |
| Enabled-row hover accent gradient | 8% to 3% | 10% to 4% |

Use the switch's existing blue state and thumb position as the primary enablement signal. Ordinary enabled rows lose their accent outline, name-weight increase, and accent glyph treatment. Keep keyboard focus rings and increased-contrast boundaries explicit. Scope typography/spacing adjustments to the named roles and their control geometry; no global density mode is introduced.

For reduced transparency, verify a fully opaque settings-board background, no backdrop blur, and no glow or grain. The existing token named `--lg-glass-solid` still has alpha below one; its name alone is not evidence of opacity. Prefer a targeted solid surface over changing every glass token.

Alternatives considered: globally increasing tertiary alpha would flatten hierarchy; adding blur or refraction would increase visual and rendering complexity; wholesale radius/font changes are unnecessary because those foundations already exist.

### 6. Test lifecycle behavior and real presentation at their appropriate levels

Retain the existing Node and CDP infrastructure. Add focused `tools/style-lifecycle-check.mjs`, `tools/detail-lifecycle-check.mjs`, and `tools/picker-feedback-check.mjs` for the three substantive runtime contracts. The style check runs the built bundle with asynchronously delivered mutation records and controlled frames/timers. Detail and picker checks must exercise real React or a harness that compares dependencies, runs cleanups, and reschedules state updates; the current first-render-only `ws-render.mjs` shim is insufficient for the detail defect.

Use a shared isolated browser fixture and existing `tools/cdp.mjs` for `tools/interaction-check.mjs` and `tools/presentation-check.mjs`. Render actual skin components with controlled model/workspace services and the host-compatible React peer. Resolve that test-only React from the installed host or a supplied dependency path; fail with a clear prerequisite error if unavailable. Do not silently skip or add a production dependency. Use a disposable test profile for host integration checks and never change the user's live provider settings, session model, or TAPD workflow records.

Minimum lifecycle evidence:

- Styles: settle startup, advance at least 10 frames and three 750ms checks, and see no new style writes or queued repairs after stability. Cover external style batches, unrelated head nodes, partial/all sheet removal, head replacement, missing browser APIs, pending-callback disposal, and old/new mount disposal order.
- Details: delayed success after loading rerender; A/B out-of-order results; same ID in different projects; close/reopen pending; completed-cache reuse; failure/retry/deduplication; project and panel invalidation. Do not test only extracted source text or sanitizer output.
- Picker: returned failure and thrown/rejected failure, delayed projection, 8-second unconfirmed state, effective default effort, duplicate and superseding selections, stale-session outcomes, catalog partial failure, and filtered empty state.
- Navigation: keyboard entry/return, pointer-outside focus preservation, grouped search navigation, effort radio keys, provider drill-down return to a new DOM node, nested Escape, modal Tab containment, owner disposal, and narrow inspector open/close with motion preferences changed.

Visual validation uses the host's own light/dark signal, busy and calm backgrounds, and normal/hover/selected/selected-plus-hover/focus states. For contrast, composite foreground alpha against the actual rendered background; do not sample antialiased glyph-edge pixels as text color. Record measured color pairs and ratios. State failures can be reproduced in the isolated fixture.

Baseline matrix: both themes at actual Windows display scales 100%, 125%, and 150%. At 125%, add each preference separately and all three together: reduced motion, reduced transparency, and increased contrast. At 150%, also check the narrow inspector with combined preferences. Record OS/host scale and effective CSS viewport; deviceScaleFactor alone is not evidence of Windows layout scaling. Browser fixtures can cover preference states, but actual host-scale checks remain explicit acceptance work.

Run existing applicable `verify.mjs`, `leak.mjs`, `smoke.mjs`, `assert-built.mjs`, `ws-render.mjs`, and `ws-rich-check.mjs` after build. Check required local inventories before selector verification; a missing inventory is an unmet prerequisite, not a pass. Preserve material-structure assertions unless an intentionally changed contract requires a focused update. Old static-preview checks that require a strongly blue enabled row do not establish acceptance for the restrained presentation.

## Risks / Trade-offs

- Style recovery still polls every 750ms -> Preserve compatibility in this tranche; verify zero DOM writes when already correct and defer general timer optimization.
- A model command can be acknowledged before its durable projection arrives -> Keep confirmation separate, show an unconfirmed state after the threshold, and accept later authoritative updates without rollback.
- The host contract may drift -> Use public snapshot/service adapters and fixtures for the verified result shape; record the installed host version for browser acceptance. Local extracted research is evidence, not a shipped runtime dependency.
- Modal restrictions can interfere with portals or nested layers -> Inert only appropriate siblings, retain previous states, and test parent/child modal teardown plus keyboard exits.
- Larger small text can expose tight control geometry -> Adjust scoped spacing/wrapping, test selected-plus-hover and actual display scaling, and keep the two-card redesign deferred.
- Transparent backgrounds vary -> Measure against rendered state backgrounds and make the named text roles meet the contrast target without claiming all application text has been audited.
- A host or React test prerequisite may be unavailable -> Report exactly which acceptance remains unrun; do not substitute static parsing for lifecycle or visual verification.

## Migration Plan

1. Implement and verify runtime lifecycles, then picker feedback and shared navigation, then the scoped presentation pass.
2. Generate `lib/client.js` through `tools/build.mjs`, run targeted and existing applicable checks, and review source/build consistency.
3. Load the candidate in a disposable DSH profile and complete keyboard, theme, preference, and Windows-scaling acceptance. Compare style mutation activity before/after on that same host; make no numeric CPU/FPS claim without a browser trace.
4. Distribute the rebuilt package through the existing workflow and restart the host when required by its loader. This proposal does not authorize publishing or installation into a user's active profile.
5. Roll back by restoring the previous package/bundle and restarting. No preference, route, or persistent detail-cache migration is required.
