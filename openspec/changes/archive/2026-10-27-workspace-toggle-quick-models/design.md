# Design

## Context

See `proposal.md` — Why. The constraints that shape the approach:

- **The preference surface already exists but has no reader.** `src/host/settings.js` declares 41 typed entries in a `PREFS` map and projects them through a schemastery `Config`; the host calls `settings.configure({ auto: false }, ctx.fiber)`, which means the host will not generate a page for this entry and the skin's own section is the only surface. On the client the entry is reachable as `ctx.get('configForms').get('ui-skin-glass-theme')`, a `ConfigFormController` with `getSnapshot()`, `subscribe(listener)`, `set(field, value)`, `unset(field)`. The namespace id is `ui-skin-glass-theme`, from `skin.json`'s `wiring.id` and the `cordis.patch.yml` insert id — not the package name, and not the unstable per-fiber entry hash.
- **The picker must read its selection synchronously.** `src/picker.js` calls `readQuick()` inside `useState` at first render, and the picker is a bare function expression spliced into the client bundle. Making that read asynchronous would mean a first paint with the wrong list and a visible reflow on every composer mount.
- **`picker.js` and `settings-section.js` are spliced separately.** They cannot share a module; today they each carry their own copy of `QUICK_KEY` and `QUICK_MAX` (`src/picker.js:83-84`, `src/settings-section.js:24-25`) with a comment acknowledging the duplication.
- **The two slot registrations are one unit.** `src/workspace.js:3237-3287` claims `main` and `sidebar.panellist` inside a single `slots.inject` chain and returns a single disposer; `slots.inject` itself returns an idempotent disposer.
- **The shell already reconciles a removed panel.** The app's layout store watches the `main` slot and clears `activePanelId` when the selected key disappears, so removing the workspace registration while it is open returns the user to the session without extra code.
- **No client `settings` service.** `ctx.get('settings')` is `undefined` on the client; `configForms` is the client-side handle. `ctx.inject` entries are a hard gate, so `configForms` must be added to the client's `inject` array or the whole `apply` never runs.
- **The settings page has one material object.** `src/css/settings-section.css` is built around a single board; a second nested card would break the visual premise, which is why the model chooser is a view swap inside the board rather than a dialog or an expanding card.

## Goals / Non-Goals

**Goals:**

- One storage story for every preference the settings page edits: host settings authoritative, browser storage a mirror, no split-brain between the picker and the page.
- A workspace switch that is honest at runtime — it adds and removes the real registrations rather than hiding a button.
- Per-model quick selection that stays legible with a 25-model provider and does not require a second floating layer.
- Keep both edited files standalone-parseable, because `tools/build.mjs` splices each as a bare function expression.

**Non-Goals:**

- Making every one of the 41 declared preferences editable. Only the workspace switch and the quick-provider selection get controls in this change; the rest stay declared-but-unedited.
- Changing the provider cap, the provider identity model (ids, not names), or the all-providers view.
- Reworking the workbench itself, its routes, or its account flow.
- A generic preference framework shared with other plugins. The client-side adapter is local to this skin.

## Decisions

### D1. Host settings authoritative, `localStorage` as a boot mirror

The settings page reads `getSnapshot().value` and writes with `set(field, value)`. On every write it also writes the same selection to `localStorage`, and on boot the client writes the host value back into `localStorage` before the picker first mounts.

*Why not `localStorage` only:* it is invisible to the host, lost with a profile switch, and cannot be reset through the settings service. *Why not host settings only:* the picker needs a synchronous read at first paint, and an async `configForms` read would either block the first paint or reflow the composer.

The mirror is a **projection**, never a second source of truth: nothing writes the mirror without also writing the host value, and boot always overwrites the mirror from the host value. A stale mirror therefore self-heals on the next load.

*Alternative considered:* keep `localStorage` authoritative and expose a read-only preference for display. Rejected — it leaves the settings service unable to reset or migrate the value, and the two copies would drift silently.

### D2. Preference shape: provider list stays a list; model selection is a companion map

`quickProviders` remains `list` of provider ids (unchanged type, cap, and the `drop` rule). A **new** preference holds the per-provider model selection as a map from provider id to a list of model ids.

*Why a separate key rather than encoding pairs into one list:* the existing list has a hard `entryMax` of 128 characters and a `max` of 64 entries; encoding `provider\u0000model` pairs would consume that budget, break the existing meaning of the key, and make the provider-only semantics impossible to express. A map keyed by provider also answers "which models for this provider" without a scan, and lets a provider with no explicit choice be distinguished from one with an empty choice — that distinction is what makes "unpinning does not discard the model choice" and "a never-configured provider shows all its models" both expressible.

The map needs a new schema branch: `prefsField()` currently builds only `Schema.union([string, boolean, array(string)])`. The map entry gets its own `type: "map"` branch built with `Schema.dict(Schema.array(Schema.string()))` (schemastery 3.18.5 supports `dict`), with the same `volatile` treatment as every other field so it appears in the form projection.

*Alternative considered:* one preference per provider, generated dynamically. Rejected — the schema is a static `PREFS` map, and dynamic keys would make the entry's schema depend on the catalog.

### D3. Model chooser is a view swap inside the settings board

The board holds a `view` state: either the provider list or one provider's model list, with a back affordance. Selecting a provider row's model affordance replaces the board's contents; the meter and the intro stay.

*Why not an accordion:* a 25-model provider would push the board past the viewport and bury the other providers. *Why not a popover:* the picker already uses two `createPortal` cards; a third floating layer inside the settings panel risks stacking and focus problems, and the CSS premise is one material object.

The provider row keeps its switch and shows the selected-model count (`n / total` when a subset is chosen, `全部` when nothing has been chosen explicitly), so the provider list still answers "what is in my quick list" without opening anything.

### D4. Workspace toggle drives registration, not visibility

`createWorkspace(...).register()` changes from "register and return true" to returning a handle with `start()` and `stop()`. The client's effect reads the preference, calls `start()` or leaves it stopped, and subscribes to the preference so a change applies live. `stop()` disposes the existing `slots.inject` chain.

*Why not CSS hiding:* a hidden-but-registered panel still occupies the shell's panel list and can still be selected programmatically; the user asked for off, not for invisible.

Removing the `main` registration while it is open is safe: the shell's layout store already clears `activePanelId` when a selected key disappears, which is exactly the "return to the session" behavior the spec requires.

Host routes are untouched: the toggle is a UI switch, so turning it off must not break a running workbench session or require re-authentication when it comes back.

### D5. `configForms` joins the client's `inject` array

`src/client.js:1171` currently declares `const inject = ['slots']`. It gains `configForms`. Because an `inject` entry the running line does not provide keeps `apply` from ever running at all, the client must not hard-depend on the service: the preference adapter is written to degrade — no `configForms` service means the mirror is used and the settings page still works, exactly as the spec's fallback requirement states.

*Alternative considered:* read preferences through a raw `fetch` to the settings route. Rejected — the controller already handles revision conflicts and the stale-write recovery the spec requires.

### D6. One client-side preference adapter, created once and passed down

A single factory in the client creates the adapter (`get()`, `set(field, value)`, `subscribe(listener)`, `ready`) and hands the same instance to the settings section and to the workspace registration. The picker keeps reading the mirror, so it needs no adapter.

*Why not let each consumer create its own:* two subscriptions to the same controller and two migration attempts on first load; the migration must be exactly once.

### D7. Migration runs once, from the mirror into an empty preference

On boot, if the preference holds no selection and the mirror holds a parsable list, the adapter writes the mirror into the preference and marks migration done. If the preference already holds a selection, the mirror is overwritten from it instead. Unparsable mirror content is dropped; entries naming unknown providers are dropped at read time (not written back), so a provider that disappears and returns does not lose its place.

## Risks / Trade-offs

- **[The mirror and the preference can disagree for one frame]** → Boot always writes mirror-from-preference before the picker mounts, and every write touches both. A disagreement therefore lasts at most until the next boot, and never outlives a reload.
- **[A stale write is refused while the user is mid-interaction]** → The controller's revision recovery is surfaced by re-reading the snapshot; the settings page re-renders from the refreshed value rather than leaving the control in a lying state. Worst case the user repeats one toggle.
- **[Adding `configForms` to `inject` could disable the entire skin on a build without it]** → The client treats the service as optional at runtime and the settings page falls back to the mirror; the acceptance probe covers a build with and without the service.
- **[The model map can grow unbounded across many providers]** → It is keyed by provider, and only providers the user has pinned can be edited; the map is pruned of entries for providers that no longer exist in the catalog when the settings page next writes.
- **[A view swap inside the board changes focus and scroll position]** → The board scrolls to the top on view change and returns focus to the row's affordance on back, so keyboard users do not lose their place.
- **[`tools/settings-page.mjs` currently fails against this build]** → Its hard-coded hashed selectors are replaced with the role/aria-label lookups that work today; the probe is part of the change, not an afterthought.

## Migration Plan

1. Ship the new schema entry and the client adapter together: an old client with a new host simply never reads the new field, and a new client with an old host sees no `configForms` entry for the skin and falls back to the mirror.
2. On first run after upgrade, the adapter migrates an existing mirror selection into the preference. No data loss: the mirror is only overwritten once the preference holds a value.
3. Rollback is a version downgrade: the old client reads the mirror, which the new client kept current, so the previous behavior resumes with the last selection intact.

## Open Questions

None blocking. The exact label copy for the workspace switch and the model-count suffix is a wording detail that can be settled during implementation without changing the specs or the task breakdown.
