# Proposal

## Why

A full Light and Dark theme audit of `dsh-liquid-glass` (`dsh-glass-theme`) against Apple Human Interface Guidelines (Fluid Interfaces) and WWDC 2025 Liquid Glass material rules revealed several visual and interactive regressions: glass-on-glass blur stacking inside the settings modal, a 40%-overshoot spring curve (`cubic-bezier(0.34, 1.4, 0.64, 1)`) that drives switch knobs and segmented-control thumbs past their track borders, missing pointer-down (`:active`) tactile responses and placement-anchored `transform-origin` on popovers, incomplete `prefers-reduced-transparency` / `prefers-contrast` fallbacks across host overlays, cross-stylesheet selector collisions, and broken CSS/JS bindings plus global style leaks and fake browser chrome in the Workspace (`工作空间`) workbench. Addressing these cohesively brings every Light and Dark surface into strict compliance with Apple's material hierarchy, physical motion, concentric geometry, and honest affordance principles.

## What Changes

- **Eliminate glass-on-glass stacking & cross-stylesheet material collisions**:
  - Demote nested surfaces inside the already-blurred L3 settings modal (`[class~='AnXs9G_panel']` containing `.lg-settings-board`, `.lg-settings-utility`, `.lg-settings-meter`) to raised/tinted non-blurred surfaces and suppress `.lg-settings-glow` inside the modal so two `backdrop-filter` layers never stack.
  - Deduplicate conflicting rules across `overlays.css`, `settings.css`, `pages.css`, and `widgets.css` (including `[class~='ZG377q_card']`, `[class~='Gc24Bq_bar']`, `[class~='iJmaOG_card']`, `[class~='Wd4N7W_root']`, `[class~='lLdGaq_document']`, and `[class~='Luqt-a_row']`) so each surface has one authoritative material tier.
- **Calibrate spring physics, pointer-down response, and spatial origin**:
  - Replace the 40%-overshoot curve (`--lg-ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1)`) on bounded track thumbs (`.lg-settings-knob`, `.lg-picker-seg-thumb`, `.lgwsp-segmented-plate`, `.lgws-tabPlate`) and un-flicked overlay entrances (`AnXs9G_panel`, `pc3rQa_menu`, `_toast_l6cvn`, `.lg-picker-card`, `.lg-stats-panel`) with critically damped / gentle settling curves (`--lg-ease-settle`, `--lg-ease-pop`) so thumbs never breach their 2px track borders.
  - Add immediate `60ms–70ms` pointer-down (`:active`) tactile compression (`scale(0.97)`–`scale(0.99)`) on `.lg-picker-trigger`, `.lg-picker-option`, `.lg-picker-more`, `.lg-picker-seg-item`, `.lg-stats-trigger`, `[class~='wtg9ga_panelRow']`, `[class~='AnXs9G_navCell']`, and `[class~='pc3rQa_item']`, and fix `[class~='GRgSLq_primary']:active` so pressing the composer send button compresses downward instead of lifting upward (`translateY(-1px)`).
  - Anchor `.lg-picker-card` and `.lg-stats-panel` `transform-origin` dynamically to the actual trigger placement (`top` vs `bottom`, `start` vs `end` via `data-lg-placement`) and add spatial slide/fade transitions when drilling between the provider list and model checklist in `.lg-settings-section`.
- **Enforce concentric corner geometry, typography floor, and accessibility fallbacks**:
  - Align inner radii to `innerRadius = outerRadius - padding` across `.lg-settings-board` (`24px` outer, `6px` inset → `18px` `.lg-settings-row`), `.lg-picker-card` (`18px` outer, `6px` inset → `12px` `.lg-picker-option` / `.lg-picker-more`), and `[class~='V7pFBG_group']` (`18px` outer, `6px` inset → `12px` `[class~='V7pFBG_row']`).
  - Raise remaining `< 12px` readable auxiliary labels, timestamps, section headings, and badges in `sidebar.css`, `conversation.css`, `composer.css`, `stats.css`, `picker.css`, `settings.css`, and `workspace.css` to `>= 12px` with appropriate tracking and `tabular-nums`.
  - Complete `@media (prefers-reduced-transparency: reduce)` and `@media (prefers-contrast: more)` opaque surface and border fallbacks across `overlays.css`, `composer.css`, `conversation.css`, `settings.css`, `pages.css`, and `widgets.css`.
- **Repair Workspace (`工作空间`) visual bindings, layout hierarchy, and honest inspector chrome**:
  - Scope all `src/css/workspace.css` rules to the workspace container, removing the unscoped `button:focus-visible` and `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 1ms !important; } }` rules that leaked globally across the host app.
  - Fix broken CSS custom property and state bindings between `src/workspace.js` and `src/css/workspace.css`: align `--space-color` / `--project-color` on `.lgwsp-project-glyph`, wire `aria-expanded="true"` / `.lgwsp-is-open` on `.lgwsp-project-trigger`, populate semantic `--chip-bg` and `--chip-color` on `.lgwsp-item-chip`, define semantic `--card-color` tones for `.lgwsp-focus-bug` / `.lgwsp-focus-story` / `.lgwsp-focus-wecom` / `.lgwsp-focus-attention`, differentiate `.lgwsp-status-dot` between live (`lgwsp-is-live`) and demo/disconnected states, and center the active checkmark in `.lgwsp-space-option`.
  - Demote `.lgwsp-space-rail` from L3 glass (`blur(34px)`) to a quiet subordinate rail and collapse its visual competition when hosted beside the main DSH sidebar while preserving project switching from both surfaces.
  - Replace the decorative fake browser toolbar (`.lgwsp-frame-dots`, `tapd://` / `wecom://` pseudo-URL bar, and non-clickable `↗` icon) inside `.lgwsp-inspector` with an honest native inspector header while retaining all real actions (`在此开会话`, `在 TAPD 打开`, `在企微打开`, workflow transitions, and owner reassignment).
  - Unify the `docs` (`企微协作`) and `console` (`执行 CLI`) tab toolbars and inputs with the V2 `.lgwsp-*` control styling.

## Capabilities

### New Capabilities
<!-- None; all changes extend existing cohesive capabilities. -->

### Modified Capabilities
- `skin-control-presentation`: Add requirements for preventing glass-on-glass stacking inside blurred modal hosts, enforcing concentric corner radii on nested card rows, completing `prefers-reduced-transparency` and `prefers-contrast` fallbacks across all host overlay/chrome sheets, scoping workspace focus/reduced-motion rules so they never leak globally, and enforcing the `>= 12px` typography floor across remaining readable auxiliary labels.
- `skin-overlay-navigation`: Add requirements for non-overshooting spring/settling curves on bounded track thumbs and un-flicked overlay entrances, immediate `60ms–70ms` pointer-down (`:active`) tactile feedback across triggers and list rows, placement-anchored `transform-origin` (`data-lg-placement`) on portalled popovers, and spatial drill-down transitions in the settings provider/model view.
- `workspace-panel`: Add requirements for repairing broken CSS variable and state bindings (`.lgwsp-project-glyph`, `.lgwsp-project-trigger`, `.lgwsp-item-chip`, `.lgwsp-focus-*` semantic tones, `.lgwsp-status-dot` live vs demo state), demoting `.lgwsp-space-rail` from competing L3 glass, and unifying `docs`/`console` tab controls under scoped `.lgwsp-*` styles.
- `workspace-item-details`: Add requirement that the in-page inspector header uses honest native panel chrome without fake window traffic lights, pseudo-protocol URL bars (`tapd://`, `wecom://`), or non-interactive external-link glyphs.

## Impact

- **Stylesheets (`src/css/*.css`)**: `tokens.css`, `base.css`, `sidebar.css`, `conversation.css`, `composer.css`, `overlays.css`, `picker.css`, `stats.css`, `settings.css`, `settings-section.css`, `pages.css`, `workspace.css`, `widgets.css`, `motion.css`.
- **Client Runtime Modules (`src/*.js`)**: `src/picker.js`, `src/stats.js`, `src/settings-section.js`, `src/workspace.js`.
- **Verification & Build Tooling (`tools/*.mjs`, `lib/client.js`)**: `tools/verify.mjs` (include `workspace.js` in skin-owned attribute scan), `tools/presentation-check.mjs` (include `max: 4` in settings fixture mock and verify updated selectors/rules), and rebuilt `lib/client.js`.
