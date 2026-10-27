# Tasks

## 1. Preference schema and host-side plumbing

- [x] 1.1 Add the per-provider model preference to `PREFS` in `src/host/settings.js` as a `map`-typed entry with a `{}` default, and verify `node tools/host-check.mjs` reports the new key in the built host schema.
- [x] 1.2 Extend `prefsField()` in `src/host/settings.js` with a `map` branch built from `Schema.dict(Schema.array(Schema.string()))`, keeping the `volatile` treatment, and verify `node tools/host-check.mjs` still passes and the entry's projection includes the new field.
- [x] 1.3 Document the two preference keys and their relationship in `docs/WORKSPACE.md`'s settings section (or a new `docs/SETTINGS.md` if that reads better), and verify the documented key names match `src/host/settings.js` exactly.

## 2. Client preference adapter

- [x] 2.1 Add the preference adapter to `src/client.js`: resolve `ctx.get('configForms').get('ui-skin-glass-theme')`, expose `get(field)`, `set(field, value)`, `subscribe(listener)`, and `ready`, and verify a live probe on `window.__lgCtx` reports the namespace resolved and the 41 existing keys readable.
- [x] 2.2 Implement the boot sequence in the adapter — read the snapshot, migrate a mirror value into an empty preference, overwrite the mirror from a non-empty preference, and drop unparsable or unknown entries — and verify with a seeded `localStorage` value that the preference is populated on first load and that a second load does not re-migrate.
- [x] 2.3 Add `configForms` to the client's `inject` array and make the adapter degrade to the mirror when the service or the namespace is absent, and verify the skin still loads and the settings page still renders with the service stubbed out.
- [x] 2.4 Prune the model map of entries naming providers that no longer exist when the settings page writes, and verify with a seeded stale provider id that the next write removes it.

## 3. Settings page: preference-backed quick providers

- [x] 3.1 Rewire `src/settings-section.js` to read and write through the adapter instead of `localStorage` directly, keeping the mirror write in the same interaction, and verify the board renders the stored selection after a reload with the adapter's value changed out-of-band.
- [x] 3.2 Replace the duplicated `QUICK_KEY`/`QUICK_MAX` constants so the page and the picker share one definition through the spliced bundle, and verify `node tools/build.mjs` still produces a bundle whose cap matches the one the picker enforces.
- [x] 3.3 Keep the model arrays in `providers()` instead of reducing each group to `{id, name, count}`, and verify the settings page can list a 25-model provider's models by name.

## 4. Settings page: model drill-down

- [x] 4.1 Add the view state and the model list view to `src/settings-section.js`, with a back affordance and a per-model checkbox, and verify a provider's subset selection round-trips through a reload.
- [x] 4.2 Show the selected-model count on each provider row (`n / total` for a subset, `全部` when nothing was chosen explicitly) and verify the row count matches the picker's section count for the same selection.
- [x] 4.3 Style the model list view in `src/css/settings-section.css` using the existing board vocabulary, keep the one-material-object premise, and verify `node tools/verify.mjs` reports no unresolved selector tokens.
- [x] 4.4 Handle the empty and not-yet-loaded model list with an explicit message and verify the page does not render an empty list with no explanation.

## 5. Picker: model-level filtering

- [x] 5.1 Change `src/picker.js`'s quick-list filtering from a provider-id list to the provider/model selection, keeping the current model force-visible, and verify the picker shows only the selected models under a pinned provider with a subset.
- [x] 5.2 Keep the "no provider pinned shows everything" fallback and the all-providers view unchanged, and verify both still behave as before with an empty selection.
- [x] 5.3 Ensure a pinned provider with no explicit model choice shows all of its models, including ones the catalog gained later, and verify by adding a model to a stubbed catalog.

## 6. Workspace toggle

- [x] 6.1 Change `src/workspace.js`'s `register()` to return a `{start, stop}` handle that disposes the existing `slots.inject` chain, and verify the panel and icon both disappear after `stop()` in a live probe.
- [x] 6.2 Drive that handle from the `workspaceView` preference in `src/client.js`, subscribing so a change applies without a reload, and verify turning the switch off removes the sidebar icon and turning it on restores it.
- [x] 6.3 Confirm the shell returns to the session when the workspace is open and the switch is turned off, and verify the central area is not left blank.
- [x] 6.4 Add the workspace row to `src/settings-section.js` above the quick-provider board, styled in `src/css/settings-section.css`, and verify the row's switch reflects and writes the preference.

## 7. Acceptance probes and integration

- [x] 7.1 Repair `tools/settings-page.mjs` against this build's selectors (role/aria-label lookups instead of the stale hashed class names) and verify it passes end to end against the running GUI.
- [x] 7.2 Extend `tools/settings-page.mjs` to cover the workspace switch and the model drill-down, and verify each assertion fails when the corresponding behavior is reverted.
- [x] 7.3 Update the probes that read `dsh-glass-theme:quick-providers` directly (`allcard-rects.mjs`, `anchor-probe.mjs`, `badge-shot.mjs`, `collapse-check.mjs`, `door.mjs`, `final-shots.mjs`, `restore-model.mjs`, `select-behavior.mjs`, `two-level.mjs`) for the mirrored storage, and verify each still runs without a missing-key error.
- [x] 7.4 Run the full gate set — `node tools/build.mjs`, `node tools/verify.mjs`, `node tools/assert-built.mjs`, `node tools/host-check.mjs`, `node tools/smoke.mjs` — and verify every one exits clean.
- [x] 7.5 Bump the version and rebuild the shipped bundle stamp, and verify `node tools/assert-built.mjs` reports the new stamp.

## Workflow follow-up

- Archive this change with `/openspec-archive-change` once implementation and the probes are green.
