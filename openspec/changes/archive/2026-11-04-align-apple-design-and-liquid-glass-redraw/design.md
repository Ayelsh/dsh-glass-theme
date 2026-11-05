# Design

## Context

See `proposal.md` for motivation and scope, and the delta specs under `specs/` for behavioral requirements.

`dsh-liquid-glass` (`dsh-glass-theme`) ships as a concatenated client bundle (`lib/client.js`, built by `tools/build.mjs`) that injects 16 ordered CSS stylesheets (`src/css/*.css`) and mounts 5 client runtime modules (`src/layers.js`, `src/catalog.js`, `src/picker.js`, `src/stats.js`, `src/settings-section.js`, `src/workspace.js`).

Three structural constraints in the existing codebase shape this design:
1. **Static selector & attribute verification (`tools/verify.mjs`, `tools/leak.mjs`)**: Every `[class~='...']` and `[class*='...']` selector in `src/css/*.css` is checked against `research/shipped-class-map.json` and `research/all-css.txt`. Every `[data-*]` attribute selector in `src/css/*.css` must appear either in `research/shipped-attrs.txt` or in the skin's own JS sources (`tools/verify.mjs:163` currently scans `client.js`, `picker.js`, `stats.js`, `settings-section.js`, and `catalog.js`, omitting `workspace.js`).
2. **Headless presentation & workspace test gates (`tools/presentation-check.mjs`, `tools/ws-render.mjs`, `tools/ws-rich-check.mjs`, `tools/smoke.mjs`)**:
   - `tools/ws-render.mjs:157-169` statically asserts that `src/workspace.js` contains `className: 'lgwsp-space-rail'`, `className: 'lgwsp-project-trigger'`, `id: 'projectTrigger'`, and two `onClick: () => selectSpace(item.id)` handlers.
   - `tools/presentation-check.mjs:757-792` mounts `.lg-settings-board` in a standalone fixture outside `[class~='AnXs9G_panel']` and verifies that under `prefers-reduced-transparency: reduce`, `.lg-settings-board` resolves `backdropFilter === 'none'` and hides `.lg-settings-glow`, `::before`, and `::after`.
3. **Host DOM Constraints**: Host components (sidebar rows `wtg9ga_panelRow` / `wnFoaW_sessionRow`, settings tabs `AnXs9G_navCell` / `XAL7Ya_tab` / `V7pFBG_pageTab`, conversation tabs `an3WzG_tab`) are React trees owned by the host application; the skin cannot inject wrapper thumb elements into host-owned tab lists without risking React reconciliation mismatches, whereas plugin-owned surfaces (`src/picker.js`, `src/stats.js`, `src/settings-section.js`, `src/workspace.js`) have full DOM control.

## Goals / Non-Goals

**Goals:**
- Enforce single-backdrop material layering inside the host settings modal (`[class~='AnXs9G_panel']`) and eliminate cross-stylesheet selector collisions across `overlays.css`, `settings.css`, `pages.css`, and `widgets.css`.
- Calibrate motion tokens in `tokens.css` and `motion.css` so bounded track thumbs and un-flicked modals/popovers never overshoot their geometry while interactive controls respond within `60ms–70ms` on `:active` pointer-down.
- Anchor floating popover `transform-origin` (`src/picker.js`, `src/stats.js`) to the resolved trigger placement (`top` vs `bottom`, `start` vs `end`) and add spatial drill-down transitions in `src/settings-section.js`.
- Repair all broken CSS/JS variable and state bindings in `src/workspace.js` and `src/css/workspace.css`, remove fake browser chrome from `.lgwsp-inspector`, scope all workspace rules so nothing leaks globally, and unify `docs`/`console` tab controls under `.lgwsp-*`.
- Complete `prefers-reduced-transparency: reduce` and `prefers-contrast: more` coverage across all 16 stylesheets and bring remaining `< 12px` readable auxiliary copy up to the `>= 12px` floor.

**Non-Goals:**
- Mutating host-owned React trees (such as sidebar session lists or host settings tab bars) via DOM-observer injection to simulate travelling pills where the host owns the DOM structure.
- Changing any host HTTP routes (`/dsh-glass-theme/ws/*`), TAPD/WeCom CLI invocation semantics, or model catalog persistence formats.

## Decisions

### Decision 1: Scoped Modal Demotion for Settings Glass-on-Glass (`src/css/settings-section.css`)
- **Choice**: Scope `[class~='AnXs9G_panel'] :is(.lg-settings-board, .lg-settings-utility, .lg-settings-meter)` to `backdrop-filter: none; -webkit-backdrop-filter: none;` with raised/tinted non-blurred surface fills (`var(--lg-surface-raised)` / `var(--lg-glass-tint)`), and set `[class~='AnXs9G_panel'] .lg-settings-glow { display: none; }` and `[class~='AnXs9G_panel'] .lg-settings-board::after { display: none; }`.
- **Rationale**: In the live DSH application, `.lg-settings-section` always renders inside `[class~='AnXs9G_panel']`, which already applies L3 `backdrop-filter: blur(34px) saturate(190%)` (`src/css/overlays.css:195`). Suppressing the inner blur and ambient glow when inside `AnXs9G_panel` eliminates the double-blur muddiness and ambient wash shown in `assets/screenshots/settings-light.png` and `settings-dark.png`, while preserving standalone `.lg-settings-board` behavior in `tools/presentation-check.mjs`.
- **Alternatives considered**: Removing `backdrop-filter` from `.lg-settings-board` unconditionally was considered and is also compatible with `presentation-check.mjs`, but scoping the demotion to `[class~='AnXs9G_panel']` (while also keeping the reduced-transparency fallback) preserves standalone preview cards when rendered outside a modal.

### Decision 2: Motion Token Split — Critically Damped Settle vs. Gentle Pop (`src/css/tokens.css`, `src/css/motion.css`)
- **Choice**:
  - Introduce `--lg-ease-settle: cubic-bezier(0.22, 1, 0.36, 1)` (critically damped, `0%` overshoot) for bounded track thumbs (`.lg-settings-knob`, `.lg-picker-seg-thumb`, `.lgwsp-segmented-plate`, `.lgws-tabPlate`) and modal/dialog entrances (`AnXs9G_panel`).
  - Adjust `--lg-ease-spring` from `cubic-bezier(0.34, 1.4, 0.64, 1)` (`40%` overshoot) to `cubic-bezier(0.24, 1.06, 0.38, 1)` (`<= 4%` micro-settle) for compact popovers/toasts (`pc3rQa_menu`, `_toast_l6cvn`, `.lg-picker-card`, `.lg-stats-panel`) and `:active` release recovery.
  - Standardize pointer-down `:active` transitions to `60ms var(--lg-ease-out)` with `scale(0.97)` on compact triggers/buttons and `scale(0.99)` on list/menu rows, and change `[class~='GRgSLq_primary']:active:not(:disabled)` from `translateY(-1px) scale(0.94)` to `scale(0.95)`.
- **Rationale**: Apple's Fluid Interface guidelines specify `damping: 1.0` (no bounce) for non-gesture transitions and bounded controls. A `40%` overshoot caused `.lg-settings-knob` (`14px` travel inside a `2px` border) to overshoot by `5.6px` and `.lg-picker-seg-thumb` to overshoot outside the pill track.

### Decision 3: Placement-Anchored `transform-origin` on Portalled Popovers (`src/picker.js`, `src/stats.js`, `src/css/picker.css`, `src/css/stats.css`)
- **Choice**:
  - In `src/picker.js` (`placeCard`) and `src/stats.js` (`reposition`), include `side: 'above' | 'below'` and `align: 'start' | 'end'` in the computed `placement` state and stamp `data-lg-placement="${side}-${align}"` (e.g., `above-start`, `below-start`, `above-end`, `below-end`) on `.lg-picker-card` and `.lg-stats-panel`.
  - Map `data-lg-placement` in `src/css/picker.css` and `src/css/stats.css` to the exact `transform-origin` (`above-start` → `0% 100%`, `below-start` → `0% 0%`, `above-end` → `100% 100%`, `below-end` → `100% 0%`) and directional entry translation (`translateY(4px)` when `above-*`, `translateY(-4px)` when `below-*`).
- **Rationale**: The model picker trigger sits on the bottom-left of the composer (`above-start`), yet `picker.css:154` hardcoded `transform-origin: 100% 100%` (bottom-right), and both popovers flip vertically near viewport edges. Stamping `data-lg-placement` ensures popovers always scale out of the trigger that opened them.

### Decision 4: Workspace Single-Hierarchy Layout, Honest Inspector Chrome, and CSS/JS Binding Repair (`src/workspace.js`, `src/css/workspace.css`)
- **Choice**:
  1. **Preserve `ws-render.mjs` contract while eliminating hosted dual-sidebar clutter**: Keep `.lgwsp-space-rail` in `src/workspace.js` (so `tools/ws-render.mjs:160, 168` passes without regression), remove its L3 `backdrop-filter: blur(34px)` glass-on-glass styling in `src/css/workspace.css`, and collapse `.lgwsp-space-rail` (`display: none`) when rendered inside `[data-slot='main']` at standard desktop widths (`<= 1600px`) where the host sidebar (`wtg9ga_root`) already occupies the left edge and `#projectTrigger` + `.lgwsp-segmented` provide full navigation in the main workspace header.
  2. **Repair all 6 CSS/JS mismatches**:
     - Support `var(--space-color, var(--project-color, var(--lg-accent)))` on `.lgwsp-project-glyph`.
     - Match `.lgwsp-project-trigger[aria-expanded='true']` alongside `.lgwsp-project-trigger.lgwsp-is-open` (and toggle `lgwsp-is-open` in `src/workspace.js:2713`).
     - Compute semantic `--chip-bg` and `--chip-color` in `SpaceRow` (`src/workspace.js:1195`) based on work item status/priority, and provide sensible default fallback values in `.lgwsp-item-chip`.
     - Define `--card-color` on `.lgwsp-focus-bug` (`var(--dsw-alias-state-error-primary)`), `.lgwsp-focus-story` (`var(--lg-accent)`), `.lgwsp-focus-wecom` (`var(--dsw-alias-state-success-primary)`), and `.lgwsp-focus-attention` (`var(--dsw-alias-state-warn-primary)`), and apply it to both `.lgwsp-focus-card-icon` and `.lgwsp-focus-card-value`.
     - Style `.lgwsp-status-dot` at rest as a neutral/amber demo indicator and apply the green success fill + halo only on `.lgwsp-status-dot.lgwsp-is-live`.
     - Style `.lgwsp-space-option.lgwsp-is-active .lgwsp-space-option-count` as a vertically centered `--lg-accent` checkmark (`align-self: center; background: transparent; color: var(--lg-accent); font-size: 12px`).
  3. **Honest native inspector header**: In `src/workspace.js:3114-3130`, remove the decorative `.lgwsp-frame-dots` traffic lights, fake `tapd://` / `wecom://` URL bar, and non-interactive `.lgwsp-frame-open` (`↗`) span from `.lgwsp-inspector`, replacing `.lgwsp-frame-toolbar` with a clean native inspector header showing the item's kind/workspace label and real action buttons.
  4. **Scope global selectors and unify `docs`/`console` tabs**: Scope `button:focus-visible` and `@media (prefers-reduced-motion: reduce)` in `src/css/workspace.css` to `.lgwsp-workspace-page`, prune unused V1 `.lgws-*` rules, and style the `docs` (`企微协作`) and `console` (`执行 CLI`) search/command bars with `.lgwsp-*` classes.
  5. **Include `workspace.js` in `tools/verify.mjs`**: Add `'workspace.js'` to `ownSources` in `tools/verify.mjs:163` so any `data-*` attribute emitted by `workspace.js` is recognized as skin-owned.

### Decision 5: Cross-Stylesheet Deduplication & Accessibility Media-Query Completion
- **Choice**:
  - Keep `[class~='ZG377q_card']` (ask-question card) in `src/css/overlays.css` and remove its conflicting opaque override from `src/css/widgets.css:714-720`.
  - Keep `[class~='Gc24Bq_bar']` / `[class~='Gc24Bq_dock']` in `src/css/settings.css` (where its full L1 glass + child rules live) and remove the duplicate/conflicting declarations from `src/css/pages.css:922-936` and `src/css/widgets.css:732-740`.
  - Remove duplicate `[class~='iJmaOG_card']`, `[class~='Wd4N7W_root']`, `[class~='lLdGaq_document']`, and `[class~='Luqt-a_row']` blocks from `src/css/widgets.css` / `src/css/pages.css` so each component is owned by one stylesheet.
  - Add `@media (prefers-reduced-transparency: reduce)` and `@media (prefers-contrast: more)` blocks to `overlays.css`, `composer.css`, `conversation.css`, `settings.css`, `pages.css`, and `widgets.css` covering every surface that uses `backdrop-filter`.

## Risks / Trade-offs

- **[Risk] Removing V1 `.lgws-*` rules from `src/css/workspace.css` could unstyle auth/demo banners or console elements still emitted by `src/workspace.js`** → **Mitigation**: Audit every `lgws-` class string present in `src/workspace.js` (`lgws-demoBanner`, `lgws-authBanner`, `lgws-wsSelect`, `lgws-authInput`, `lgws-authButton`, `lgws-authQr`, `lgws-authLink`, `lgws-authInline`, `lgws-crashCard`, etc.) and retain/update every `.lgws-*` class that `src/workspace.js` still renders while migrating `docs`/`console` controls and deleting only dead V1 layout/tab/card/menu rules.
- **[Risk] Changing concentric radii on `.lg-settings-row` or `.lg-picker-option` could alter hit-box dimensions or cause text overlap in `tools/presentation-check.mjs`** → **Mitigation**: Only `border-radius` (and `1px–2px` container padding alignment where needed) changes; row heights, font sizes (`>= 12px`), and flex/grid gaps remain intact, and `node tools/presentation-check.mjs` verifies zero overlaps across `100%`, `125%`, and `150%` scales.
- **[Risk] New `data-lg-*` attributes in CSS could fail `node tools/verify.mjs` if not matched in JS sources** → **Mitigation**: Emit exact attribute strings in `src/picker.js`, `src/stats.js`, `src/settings-section.js`, and `src/workspace.js`, add `'workspace.js'` to `ownSources` in `tools/verify.mjs`, and run `node tools/verify.mjs` and `node tools/leak.mjs` after every stylesheet change.

## Migration Plan

1. Update design tokens and motion rules in `src/css/tokens.css`, `src/css/base.css`, and `src/css/motion.css`.
2. Update host-decorating stylesheets (`sidebar.css`, `conversation.css`, `composer.css`, `overlays.css`, `settings.css`, `pages.css`, `widgets.css`) for deduplication, pointer-down `:active` feedback, concentric corners, `>= 12px` typography floor, and `prefers-reduced-transparency` / `prefers-contrast` blocks.
3. Update plugin-owned component stylesheets and modules (`picker.css` + `picker.js`, `stats.css` + `stats.js`, `settings-section.css` + `settings-section.js`, `workspace.css` + `workspace.js`).
4. Update `tools/verify.mjs` and `tools/presentation-check.mjs`, rebuild `lib/client.js` via `node tools/build.mjs`, and run the full verification suite (`verify.mjs`, `leak.mjs`, `smoke.mjs`, `ws-render.mjs`, `ws-rich-check.mjs`, `presentation-check.mjs`).
