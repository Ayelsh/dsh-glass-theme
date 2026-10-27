# Proposal

## Why

The Liquid Glass skin already declares 41 preferences in a host settings schema, but the only user-editable surface is a quick-provider board whose selection lives in `localStorage`. That board can only switch a provider on or off wholesale, and the 工作空间 workbench panel registers unconditionally, so there is no way to hide it. Two concrete gaps follow: a user who does not use the workbench still gets its sidebar icon and panel, and a user who pins a provider with 25 models gets all 25 in the quick list.

## What Changes

- The skin's settings page reads and writes the host preferences (`configForms` namespace `ui-skin-glass-theme`) instead of treating `localStorage` as the source of truth. `localStorage` stays as a boot mirror so the picker keeps its synchronous read; existing stored selections are migrated into the preference once, and cleared preferences fall back to the schema default.
- A **工作空间** switch appears on the settings page, bound to the existing `workspaceView` preference. Turning it off disposes both slot registrations (the sidebar icon and the `main` panel) and turning it back on re-registers them; the host-side workbench routes keep registering either way.
- **快捷供应商** gains per-model selection. Each enabled provider row drills down into its own model list where individual models can be checked or unchecked; the board keeps showing the provider-level switch and a count of selected models.
- The model picker filters its quick list by the selected `(provider, model)` pairs, keeping the current model visible even when it is not selected.
- The settings acceptance probe `tools/settings-page.mjs` is repaired against the current build's hashed selectors, and the probes that read the quick-provider key directly are updated for the mirrored storage.

## Capabilities

### New Capabilities

- `skin-preferences`: how the Liquid Glass skin persists user-facing preferences — host settings as the source of truth, the `localStorage` boot mirror, one-time migration of legacy values, and reset-to-default.
- `workspace-panel`: the availability of the 工作空间 workbench panel and its sidebar icon, governed by a persisted preference.
- `quick-provider-selection`: which providers and which models of those providers appear in the model picker's quick list.

### Modified Capabilities

None. `openspec/specs/` is empty, so every capability in this change is new.

## Impact

- `src/settings-section.js` — settings page becomes preference-backed and grows the workspace switch plus the per-provider model drill-down.
- `src/picker.js` — quick list filtering reads provider and model selections instead of a bare provider id list.
- `src/client.js` — client gains a `configForms` injection and passes preference state into the settings section and the workspace registration.
- `src/workspace.js` — `register()` exposes a start/stop handle so the panel and icon can be disposed and re-registered.
- `src/host/settings.js` — the `quickProviders` entry gains a companion per-provider model preference; the preference schema grows a map-typed field.
- `src/css/settings-section.css` — styles for the workspace row and the model drill-down view.
- `tools/settings-page.mjs` and the probes that read `dsh-glass-theme:quick-providers` directly — selector and storage updates.
- `lib/` — rebuilt bundle; `lib/client.js` is generated and must not be hand-edited.
