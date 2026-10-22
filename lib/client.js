/**
 * Liquid Glass — client half.
 *
 * Two jobs:
 *
 *   1. get the stylesheets into the document, in order, owned by this package,
 *      and take them out again on unload. Everything visual lives in src/css/.
 *
 *   2. DECORATE two surfaces the skin does not own and the app does not
 *      describe: the composer model picker (rendered by dsh-codex-subscription)
 *      and — for the pricing chip — DeepSeek's published peak schedule. The app
 *      exposes a model's id and label and nothing else, so provider icons,
 *      one-line descriptions and the peak/off-peak factor can only come from
 *      here. src/catalog.js holds that data; this file holds the logic.
 *
 * Deliberately NOT done here:
 *   - no token registration via ctx.theme.overrideTokens(): the theme service
 *     writes overrides as inline custom properties on <body>, which outranks any
 *     stylesheet for body itself and would have to duplicate all ~150 tokens in
 *     two modes. src/css/tokens.css re-keys the same names on `body` and
 *     `body[data-ds-dark-theme]` instead — one source of truth, mode-aware by
 *     the app's own attribute.
 *   - no slot registration: the skin restyles shipped surfaces rather than
 *     adding new ones, so it must not take over any slot the app renders into.
 *   - no React: the host components are not ours to re-render, so decoration is
 *     additive DOM that the app can wipe at any time — which it does, on every
 *     re-render. The decorator therefore re-heals itself on a poll instead of
 *     assuming it runs once.
 *
 * Built by tools/build.mjs, which inlines src/css/*.css into `sheets` and
 * src/catalog.js into `catalog`. Edit the sources, never lib/client.js.
 */
window.__ModuleLoader__.load({
	id: 'dsh-glass-theme',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

		/** @type {{ id: string, css: string }[]} — inlined at build time. */
		const sheets = [{"id":"dsh-glass-theme/tokens.css","css":"/* ==========================================================================\n   Liquid Glass · token layer\n   --------------------------------------------------------------------------\n   Two jobs, in this order:\n\n   1. Re-key the shipped `--dsw-*` alias vocabulary so EVERY surface in the app\n      inherits the new palette before a single component rule runs. This is what\n      makes pages we never write a specific rule for still look redesigned.\n   2. Publish the material vocabulary (`--lg-*`) the rest of the skin consumes:\n      glass fills, specular edges, elevation ladders, ambient light field.\n\n   Mode keying is `body[data-ds-dark-theme]` — the app's own attribute, set from\n   the active ThemeDefinition.colorScheme. Never `prefers-color-scheme`.\n   ========================================================================== */\n\nbody {\n  /* ---- Ambient light field ------------------------------------------------\n     The page is not a flat colour: it is a lit environment. Every glass surface\n     above it samples this field through backdrop-filter, which is what stops\n     the materials reading as flat plastic. Two soft sources — a cool one from\n     the top-left, a warm one low-right — plus a dim floor. */\n  --lg-ambient-1: radial-gradient(120% 90% at 12% -10%, #dbe6ff 0%, #dbe6ff00 58%);\n  --lg-ambient-2: radial-gradient(100% 80% at 92% 8%, #ffe9dd 0%, #ffe9dd00 52%);\n  --lg-ambient-3: radial-gradient(90% 70% at 50% 108%, #e6e2ff 0%, #e6e2ff00 60%);\n  --lg-ambient-floor: #eef1f7;\n\n  /* ---- Glass fills -------------------------------------------------------\n     L1 chrome · L2 floating panels · L3 modals. Alpha climbs with height above\n     the content plane so legibility never depends on what is underneath. */\n  --lg-glass-1: rgba(255, 255, 255, 0.58);\n  --lg-glass-2: rgba(255, 255, 255, 0.7);\n  --lg-glass-3: rgba(252, 253, 255, 0.84);\n  --lg-glass-solid: rgba(255, 255, 255, 0.94);\n  --lg-glass-tint: rgba(255, 255, 255, 0.34);\n\n  /* The turn rail's resting hairline. Sits between label-tertiary and the\n     border tokens: readable as a mark, quiet enough that 40 of them in a\n     column do not become a list of text. */\n  --lg-rail-tick: rgba(16, 22, 40, 0.38);\n\n  /* Reading surfaces are opaque by rule: text never sits on a moving blur. */\n  --lg-surface: #ffffff;\n  --lg-surface-sunken: #f4f6fa;\n  --lg-surface-raised: #ffffff;\n\n  /* Light *inside* the reading surface. A pane of glass laid over a lit page is\n     not a flat fill even where it is opaque — it keeps the direction of the\n     room. These are tinted at very low alpha so the surface still reads as one\n     solid colour to the text on top of it, but no longer as a dead slab. */\n  --lg-surface-light-1: radial-gradient(150% 100% at 4% -26%, #ffffff 0%, #ffffff00 70%);\n  --lg-surface-light-2: radial-gradient(120% 90% at 104% -20%, #eaf0ff 0%, #eaf0ff00 66%);\n\n  /* ---- Specular edge -----------------------------------------------------\n     Glass has a lit rim. Top edge catches the key light; the bottom gets a\n     fainter counter-rim. Applied as an inset shadow so it follows the radius. */\n  --lg-edge-top: rgba(255, 255, 255, 0.92);\n  --lg-edge-bottom: rgba(255, 255, 255, 0.42);\n  --lg-hairline: rgba(16, 22, 40, 0.08);\n  --lg-hairline-strong: rgba(16, 22, 40, 0.14);\n\n  /* ---- Elevation ---------------------------------------------------------\n     Three stacked shadows: contact, mid, ambient. Never one big blur — that is\n     what makes a panel look like it was dropped on the page rather than lit\n     above it. */\n  --lg-shadow-1: 0 0 0 0.5px var(--lg-hairline), 0 1px 2px rgba(16, 22, 40, 0.05),\n    0 3px 10px -2px rgba(16, 22, 40, 0.07);\n  --lg-shadow-2: 0 0 0 0.5px var(--lg-hairline), 0 2px 6px rgba(16, 22, 40, 0.06),\n    0 12px 32px -8px rgba(16, 22, 40, 0.14);\n  --lg-shadow-3: 0 0 0 0.5px var(--lg-hairline), 0 4px 14px rgba(16, 22, 40, 0.08),\n    0 32px 72px -16px rgba(16, 22, 40, 0.24);\n\n  /* ---- Accent ------------------------------------------------------------\n     Kept in the DeepSeek family so the product still looks like itself; the\n     Apple move is in how it is used (tint, never flood fill). */\n  --lg-accent: #3d5afe;\n  --lg-accent-strong: #2c46e8;\n  --lg-accent-soft: rgba(61, 90, 254, 0.12);\n  --lg-accent-ring: rgba(61, 90, 254, 0.34);\n\n  /* List selection. Apple source lists do not TINT the selected row — they FILL\n     it and invert the label to white. That distinction is load-bearing: a tint is\n     exactly what hover looks like, so a tinted selection can never outrank a\n     hover. A filled plate outranks it by being a different kind of thing. */\n  --lg-selection-fill: var(--lg-accent);\n  --lg-selection-fill-hover: var(--lg-accent-strong);\n  --lg-selection-label: #ffffff;\n\n  /* ---- Radii -------------------------------------------------------------\n     Concentric by construction: a child inset by N from a parent of radius R\n     gets R - N. The ladder below is the app's, widened slightly at the top. */\n  --lg-r-xs: 6px;\n  --lg-r-sm: 9px;\n  --lg-r-md: 13px;\n  --lg-r-lg: 18px;\n  --lg-r-xl: 24px;\n  --lg-r-panel: 30px;\n  --lg-r-pill: 999px;\n\n  /* ---- Motion ------------------------------------------------------------\n     Apple response curve: fast start, long settle. Springs are expressed as\n     cubic-beziers where a spring is not available; the composer and sheets use\n     real interruptible transitions so a second gesture can retarget mid-flight. */\n  --lg-ease-out: cubic-bezier(0.22, 1, 0.36, 1);\n  --lg-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);\n  --lg-ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);\n  --lg-t-fast: 120ms;\n  --lg-t-base: 220ms;\n  --lg-t-slow: 380ms;\n\n  /* ---- Re-keyed shipped aliases -----------------------------------------\n     The values below are what actually repaint the app: shipped components\n     reference these names, not ours. */\n  --dsw-alias-bg-base: var(--lg-surface);\n  --dsw-alias-bg-layer-1: #ffffff;\n  --dsw-alias-bg-layer-2: #f7f9fc;\n  --dsw-alias-bg-layer-3: #eef2f8;\n  --dsw-alias-bg-overlay: rgba(255, 255, 255, 0.72);\n  --dsw-alias-bg-skeleton: rgba(16, 22, 40, 0.06);\n\n  --dsw-alias-border-l1: rgba(16, 22, 40, 0.05);\n  --dsw-alias-border-l2: rgba(16, 22, 40, 0.09);\n  --dsw-alias-border-l3: rgba(16, 22, 40, 0.13);\n  --dsw-alias-border-l4: rgba(16, 22, 40, 0.18);\n\n  --dsw-alias-brand-primary: var(--lg-accent);\n  --dsw-alias-brand-text: var(--lg-accent-strong);\n\n  --dsw-alias-button-elevated-fill: rgba(255, 255, 255, 0.72);\n  --dsw-alias-button-floating-fill: rgba(255, 255, 255, 0.86);\n  --dsw-alias-button-floating-hover: #ffffff;\n  --dsw-alias-button-info-fill: var(--lg-accent);\n  --dsw-alias-button-info-hover: var(--lg-accent-strong);\n  --dsw-alias-button-tool-bar-fill: rgba(255, 255, 255, 0.6);\n  --dsw-alias-button-tool-bar-hover: rgba(255, 255, 255, 0.9);\n\n  --dsw-alias-interactive-bg-hover: rgba(16, 22, 40, 0.055);\n  --dsw-alias-interactive-bg-hover-solid: rgba(16, 22, 40, 0.075);\n  --dsw-alias-interactive-bg-hover-accent: var(--lg-accent-soft);\n  --dsw-alias-interactive-bg-active: rgba(16, 22, 40, 0.09);\n\n  --dsw-alias-label-primary: #10131a;\n  --dsw-alias-label-secondary: rgba(16, 19, 26, 0.62);\n  --dsw-alias-label-tertiary: rgba(16, 19, 26, 0.44);\n  --dsw-alias-label-caption: rgba(16, 19, 26, 0.34);\n  --dsw-alias-label-dimmed: rgba(16, 19, 26, 0.28);\n\n  --dsw-alias-link: var(--lg-accent-strong);\n\n  --dsw-alias-markdown-code-block: #f4f6fa;\n  --dsw-alias-markdown-code-block-banner: #eef1f7;\n  --dsw-alias-markdown-inline-code: rgba(16, 22, 40, 0.06);\n\n  --dsw-alias-scrollbar-bg-l1: rgba(16, 22, 40, 0.16);\n  --dsw-alias-scrollbar-bg-l2: rgba(16, 22, 40, 0.2);\n  --dsw-alias-scrollbar-hover-l1: rgba(16, 22, 40, 0.3);\n  --dsw-alias-scrollbar-hover-l2: rgba(16, 22, 40, 0.36);\n\n  --dsw-alias-toast-bg: rgba(20, 24, 34, 0.88);\n  --dsw-alias-tooltip-bg: rgba(20, 24, 34, 0.9);\n\n  --dsw-specific-bubble: rgba(16, 22, 40, 0.045);\n  --dsw-specific-bubble-highlight: rgba(16, 22, 40, 0.07);\n  --dsw-specific-input-major: rgba(255, 255, 255, 0.72);\n  --dsw-specific-menu: rgba(252, 253, 255, 0.9);\n  --dsw-specific-selector: rgba(255, 255, 255, 0.7);\n  --dsw-specific-sidebar-fill: transparent;\n  --dsw-specific-sidebar-nav-item-active: rgba(255, 255, 255, 0.82);\n  --dsw-specific-sidebar-nav-item-active-accent: var(--lg-accent-soft);\n  --dsw-specific-sidebar-nav-item-hover: rgba(255, 255, 255, 0.5);\n  --dsw-specific-tip: rgba(255, 255, 255, 0.8);\n\n  /* Radius ladder re-keyed so shipped panels follow the wider Apple scale. */\n  --dsw-radius-xs: var(--lg-r-xs);\n  --dsw-radius-sm: var(--lg-r-sm);\n  --dsw-radius-md: var(--lg-r-md);\n  --dsw-radius-lg: var(--lg-r-lg);\n  --dsw-radius-xl: var(--lg-r-xl);\n  --dsw-radius-panel: var(--lg-r-panel);\n}\n\n/* --------------------------------------------------------------------------\n   Dark. Same structure, different light. Glass in the dark is not white fill\n   with low alpha — it is a *lighter* surface that still reads as material,\n   which is why the alpha stays low while the specular edge stays bright.\n   -------------------------------------------------------------------------- */\nbody[data-ds-dark-theme] {\n  --lg-ambient-1: radial-gradient(120% 90% at 8% -12%, #1b2a52 0%, #1b2a5200 56%);\n  --lg-ambient-2: radial-gradient(100% 80% at 96% 4%, #33223d 0%, #33223d00 50%);\n  --lg-ambient-3: radial-gradient(90% 70% at 46% 110%, #12203f 0%, #12203f00 58%);\n  --lg-ambient-floor: #0a0c11;\n\n  --lg-glass-1: rgba(255, 255, 255, 0.045);\n  --lg-glass-2: rgba(255, 255, 255, 0.075);\n  --lg-glass-3: rgba(28, 32, 42, 0.78);\n  --lg-glass-solid: rgba(24, 27, 36, 0.95);\n  --lg-glass-tint: rgba(255, 255, 255, 0.06);\n  --lg-rail-tick: rgba(255, 255, 255, 0.34);\n\n  --lg-surface: #0f1116;\n  --lg-surface-sunken: #0a0c11;\n  --lg-surface-raised: #161a22;\n\n  /* Dark surfaces catch the ambient field the same way — a cool lift from the\n     upper left, a violet one from the upper right, both far too faint to read\n     as a gradient but enough that the pane is not a uniform black. */\n  --lg-surface-light-1: radial-gradient(150% 100% at 4% -26%, #1a2130 0%, #1a213000 70%);\n  --lg-surface-light-2: radial-gradient(120% 90% at 104% -20%, #1e1c33 0%, #1e1c3300 66%);\n\n  --lg-edge-top: rgba(255, 255, 255, 0.3);\n  --lg-edge-bottom: rgba(255, 255, 255, 0.08);\n  --lg-hairline: rgba(255, 255, 255, 0.1);\n  --lg-hairline-strong: rgba(255, 255, 255, 0.16);\n\n  --lg-shadow-1: 0 0 0 0.5px var(--lg-hairline), 0 1px 2px rgba(0, 0, 0, 0.4),\n    0 3px 10px -2px rgba(0, 0, 0, 0.5);\n  --lg-shadow-2: 0 0 0 0.5px var(--lg-hairline), 0 2px 8px rgba(0, 0, 0, 0.45),\n    0 14px 36px -8px rgba(0, 0, 0, 0.62);\n  --lg-shadow-3: 0 0 0 0.5px var(--lg-hairline), 0 6px 18px rgba(0, 0, 0, 0.5),\n    0 36px 80px -16px rgba(0, 0, 0, 0.72);\n\n  --lg-accent: #7b93ff;\n  --lg-accent-strong: #93a7ff;\n  --lg-accent-soft: rgba(123, 147, 255, 0.18);\n  --lg-accent-ring: rgba(123, 147, 255, 0.4);\n\n  /* The dark selection is a darker solid than the accent, because the label on it\n     is white: `#7b93ff` would put white text at 2.2:1. `#3f56c4` clears 5.4:1 and\n     still reads as a filled plate rather than a wash. */\n  --lg-selection-fill: #3f56c4;\n  --lg-selection-fill-hover: #4a63d8;\n  --lg-selection-label: #ffffff;\n\n  --dsw-alias-bg-base: var(--lg-surface);\n  --dsw-alias-bg-layer-1: #161a22;\n  --dsw-alias-bg-layer-2: #1b2029;\n  --dsw-alias-bg-layer-3: #222833;\n  --dsw-alias-bg-overlay: rgba(18, 21, 28, 0.78);\n  --dsw-alias-bg-skeleton: rgba(255, 255, 255, 0.07);\n\n  --dsw-alias-border-l1: rgba(255, 255, 255, 0.06);\n  --dsw-alias-border-l2: rgba(255, 255, 255, 0.1);\n  --dsw-alias-border-l3: rgba(255, 255, 255, 0.14);\n  --dsw-alias-border-l4: rgba(255, 255, 255, 0.2);\n\n  --dsw-alias-brand-primary: var(--lg-accent);\n  --dsw-alias-brand-text: var(--lg-accent-strong);\n\n  --dsw-alias-button-elevated-fill: rgba(255, 255, 255, 0.075);\n  --dsw-alias-button-floating-fill: rgba(255, 255, 255, 0.1);\n  --dsw-alias-button-floating-hover: rgba(255, 255, 255, 0.16);\n  --dsw-alias-button-info-fill: var(--lg-accent);\n  --dsw-alias-button-info-hover: var(--lg-accent-strong);\n  --dsw-alias-button-tool-bar-fill: rgba(255, 255, 255, 0.06);\n  --dsw-alias-button-tool-bar-hover: rgba(255, 255, 255, 0.12);\n\n  --dsw-alias-interactive-bg-hover: rgba(255, 255, 255, 0.07);\n  --dsw-alias-interactive-bg-hover-solid: rgba(255, 255, 255, 0.09);\n  --dsw-alias-interactive-bg-hover-accent: var(--lg-accent-soft);\n  --dsw-alias-interactive-bg-active: rgba(255, 255, 255, 0.12);\n\n  --dsw-alias-label-primary: #f2f4f8;\n  --dsw-alias-label-secondary: rgba(242, 244, 248, 0.64);\n  --dsw-alias-label-tertiary: rgba(242, 244, 248, 0.46);\n  --dsw-alias-label-caption: rgba(242, 244, 248, 0.36);\n  --dsw-alias-label-dimmed: rgba(242, 244, 248, 0.3);\n\n  --dsw-alias-link: var(--lg-accent-strong);\n\n  --dsw-alias-markdown-code-block: #14181f;\n  --dsw-alias-markdown-code-block-banner: #1a1f28;\n  --dsw-alias-markdown-inline-code: rgba(255, 255, 255, 0.08);\n\n  --dsw-alias-scrollbar-bg-l1: rgba(255, 255, 255, 0.16);\n  --dsw-alias-scrollbar-bg-l2: rgba(255, 255, 255, 0.2);\n  --dsw-alias-scrollbar-hover-l1: rgba(255, 255, 255, 0.3);\n  --dsw-alias-scrollbar-hover-l2: rgba(255, 255, 255, 0.36);\n\n  --dsw-alias-toast-bg: rgba(38, 43, 54, 0.92);\n  --dsw-alias-tooltip-bg: rgba(38, 43, 54, 0.94);\n\n  --dsw-specific-bubble: rgba(255, 255, 255, 0.07);\n  --dsw-specific-bubble-highlight: rgba(255, 255, 255, 0.11);\n  --dsw-specific-input-major: rgba(255, 255, 255, 0.06);\n  --dsw-specific-menu: rgba(30, 34, 44, 0.86);\n  --dsw-specific-selector: rgba(255, 255, 255, 0.07);\n  --dsw-specific-sidebar-fill: transparent;\n  --dsw-specific-sidebar-nav-item-active: rgba(255, 255, 255, 0.1);\n  --dsw-specific-sidebar-nav-item-active-accent: var(--lg-accent-soft);\n  --dsw-specific-sidebar-nav-item-hover: rgba(255, 255, 255, 0.055);\n  --dsw-specific-tip: rgba(255, 255, 255, 0.08);\n}\n\n/* --------------------------------------------------------------------------\n   Coverage: the rest of the vocabulary.\n   --------------------------------------------------------------------------\n   The block above re-keys the tokens every screen uses. This block re-keys the\n   ones only *some* screen uses — diffs, menus, onboarding, the thinking\n   gradient, switch thumbs. They are here rather than in a per-surface sheet for\n   one reason: a token re-keyed on `body` reaches every consumer at once, so a\n   page we never wrote a selector for still lands in the new palette. That is the\n   difference between \"redesigned the sidebar\" and \"redesigned the app\".\n\n   The static palette is mode-independent (the app defines it identically in\n   both schemes), so it is declared once. Everything above it stays semantic.\n   -------------------------------------------------------------------------- */\n\nbody {\n  /* ---- Static palette ---------------------------------------------------\n     Cooler and slightly desaturated relative to the shipped ramp, so colour\n     never competes with the material. Values are the raw scale; components\n     reference these through the alias layer, never directly — except the diff\n     and chart surfaces, which is why they are re-keyed at all. */\n  --dsw-static-neutral-bluish-00: #ffffff;\n  --dsw-static-neutral-bluish-50: #f8fafc;\n  --dsw-static-neutral-bluish-60: #f1f4f9;\n  --dsw-static-neutral-bluish-75: #e9eef6;\n  --dsw-static-neutral-bluish-100: #e2e8f2;\n  --dsw-static-neutral-bluish-150: #d7dfec;\n  --dsw-static-neutral-bluish-200: #c8d2e3;\n  --dsw-static-neutral-bluish-300: #a8b5cb;\n  --dsw-static-neutral-bluish-400: #8695b0;\n  --dsw-static-neutral-bluish-500: #697893;\n  --dsw-static-neutral-bluish-600: #525f77;\n  --dsw-static-neutral-bluish-700: #3f4a5e;\n  --dsw-static-neutral-bluish-750: #353f50;\n  --dsw-static-neutral-bluish-800: #2b3444;\n  --dsw-static-neutral-bluish-850: #232b39;\n  --dsw-static-neutral-bluish-875: #1c232f;\n  --dsw-static-neutral-bluish-900: #161c26;\n  --dsw-static-neutral-bluish-950: #10151d;\n  --dsw-static-neutral-bluish-1000: #0b0f15;\n\n  --dsw-static-neutral-00: #ffffff;\n  --dsw-static-neutral-50: #fafafa;\n  --dsw-static-neutral-100: #f2f3f5;\n  --dsw-static-neutral-200: #e4e6ea;\n  --dsw-static-neutral-300: #c6cad1;\n  --dsw-static-neutral-550: #7c828d;\n  --dsw-static-neutral-600: #626873;\n  --dsw-static-neutral-700: #4b5058;\n  --dsw-static-neutral-800: #33373d;\n  --dsw-static-neutral-850: #2a2d32;\n  --dsw-static-neutral-1000: #121417;\n\n  --dsw-static-blue-300: #9fb4ff;\n  --dsw-static-blue-450: #6f8bff;\n  --dsw-static-blue-500: #3d5afe;\n  --dsw-static-blue-900: #1b2a6b;\n  --dsw-static-blue-950: #101a45;\n\n  --dsw-static-deepseek-50: #eef2ff;\n  --dsw-static-deepseek-100: #dfe5ff;\n  --dsw-static-deepseek-200: #c3cdff;\n  --dsw-static-deepseek-400: #7b93ff;\n  --dsw-static-deepseek-450: #6b83fb;\n  --dsw-static-deepseek-500: #3d5afe;\n  --dsw-static-deepseek-800: #23306b;\n\n  --dsw-static-green-100: #dcf5e6;\n  --dsw-static-green-400: #4ec98a;\n  --dsw-static-green-500: #1fa864;\n  --dsw-static-green-500-a08: #1fa86414;\n  --dsw-static-green-500-a12: #1fa8641f;\n  --dsw-static-green-900: #0f2e20;\n\n  --dsw-static-amber-100: #fdf1dc;\n  --dsw-static-amber-400: #f0a94a;\n  --dsw-static-amber-500: #dd8a17;\n  --dsw-static-amber-600: #b56c0c;\n  --dsw-static-amber-900: #3a2708;\n\n  --dsw-static-red-50: #fdf0ef;\n  --dsw-static-red-100: #fbdcd9;\n  --dsw-static-red-400: #f2726a;\n  --dsw-static-red-400-a12: #f2726a1f;\n  --dsw-static-red-500: #e5484d;\n  --dsw-static-red-600: #cc2b30;\n  --dsw-static-red-600-a08: #cc2b3014;\n  --dsw-static-red-900: #3d1013;\n\n  /* ---- Aliases that resolve against the palette above ------------------- */\n  --dsw-alias-state-business-primary: var(--dsw-static-deepseek-500);\n  --dsw-alias-state-business-tertiary: var(--dsw-static-deepseek-100);\n  --dsw-alias-state-error-primary: var(--dsw-static-red-600);\n  --dsw-alias-state-error-secondary: var(--dsw-static-red-400);\n  --dsw-alias-state-idle-primary: var(--dsw-static-neutral-300);\n  --dsw-alias-state-success-primary: var(--dsw-static-green-500);\n  --dsw-alias-state-success-secondary: var(--dsw-static-green-400);\n  --dsw-alias-state-success-tertiary: var(--dsw-static-green-100);\n  --dsw-alias-state-warn-label: var(--dsw-static-amber-600);\n  --dsw-alias-state-warn-primary: var(--dsw-static-amber-500);\n  --dsw-alias-state-warn-secondary: var(--dsw-static-amber-400);\n  --dsw-alias-state-warn-tertiary: var(--dsw-static-amber-100);\n\n  --dsw-alias-label-primary-bluish: var(--dsw-static-blue-900);\n  --dsw-alias-label-primary-dimmed: var(--dsw-static-neutral-bluish-950);\n  --dsw-alias-label-primary-foreground: var(--dsw-static-neutral-bluish-00);\n  --dsw-alias-label-primary-inverted: var(--dsw-static-neutral-bluish-00);\n  --dsw-alias-label-shimmer: rgba(11, 15, 21, 0.3);\n  --dsw-alias-label-deep-diving: var(--lg-accent-strong);\n  --dsw-alias-label-deep-diving-shimmer: rgba(44, 70, 232, 0.45);\n\n  --dsw-alias-button-primary-fill: var(--lg-accent);\n  --dsw-alias-button-primary-hover: var(--lg-accent-strong);\n  --dsw-alias-button-primary-dimmed: rgba(61, 90, 254, 0.32);\n  --dsw-alias-button-contrast-fill: var(--dsw-static-neutral-bluish-800);\n  --dsw-alias-button-ghost-active-fill: var(--dsw-static-neutral-bluish-100);\n  --dsw-alias-button-ghost-active-hover: var(--dsw-static-neutral-bluish-150);\n  --dsw-alias-button-ghost-active-border: var(--dsw-static-neutral-bluish-400);\n  --dsw-alias-button-tool-bar-fill-invisible: transparent;\n\n  /* Menus: the one place the app already ships a backdrop filter, so the skin\n     only has to agree with it instead of inventing a second language.\n\n     The fill is deliberately heavy. A menu is read, not looked at: at the\n     shipped 72% the hero headline and the composer behind it ghost through the\n     rows, and the blur turns them into grey smudges under the labels. Vibrancy\n     at this size belongs to the rim and the blur; the fill is what buys\n     legibility.\n\n     95% is measured, not picked: with the blur confirmed working, the hero\n     headline (26px, pure white) still bled a 17-level band through at 92%, and\n     the accent send button bled a blue smudge. At 95% the worst case is an\n     8-level lift, which reads as light behind frosted glass instead of as text\n     behind a pane. Apple's own menu material is close to opaque for this\n     reason — a menu that lets you read the page through it is a menu you\n     cannot read. */\n  --dsw-menu-surface-fill: rgba(250, 251, 253, 0.95);\n  --dsw-menu-backdrop-filter: blur(28px) saturate(185%);\n  --dsw-alias-menu-group-header-fill: rgba(244, 247, 251, 0.92);\n  --dsw-alias-menu-icon: var(--dsw-static-neutral-bluish-700);\n  --dsw-hovercard-bg: rgba(255, 255, 255, 0.86);\n\n  /* Sheets, dialogs, onboarding, settings cards. */\n  --dsw-alias-settings-card-fill: var(--lg-surface-raised);\n  --dsw-alias-settings-card-stroke: var(--lg-hairline);\n  --dsw-alias-onboarding-accent: var(--lg-accent);\n  --dsw-alias-onboarding-card-fill: rgba(255, 255, 255, 0.8);\n  --dsw-alias-onboarding-secondary-fill: rgba(255, 255, 255, 0.94);\n  --dsw-alias-onboarding-checkbox-border: rgba(11, 15, 21, 0.2);\n  --dsw-alias-switch-thumb: #ffffff;\n  --dsw-alias-toast-label: #ffffff;\n  --dsw-alias-tooltip-key-bg: color-mix(in srgb, var(--dsw-alias-tooltip-bg), white 18%);\n  --dsw-alias-turn-trigger-bg: var(--dsw-alias-markdown-code-block);\n  --dsw-alias-turn-trigger-bg-hover: var(--dsw-alias-interactive-bg-hover);\n  --dsw-alias-bg-multi-select: var(--dsw-static-neutral-bluish-60);\n  --dsw-alias-bg-module-platform: var(--dsw-static-neutral-bluish-60);\n  --dsw-alias-bg-document-preview: var(--lg-surface-sunken);\n  --dsw-alias-label-document-preview: var(--dsw-static-neutral-bluish-700);\n  --dsw-alias-bg-document-selection: color-mix(in srgb, var(--lg-accent) 32%, transparent);\n  --dsw-alias-border-inverted: transparent;\n  --dsw-alias-border-inverted2: transparent;\n  --dsw-alias-border-l2-darkmode-thin: var(--lg-hairline);\n  --dsw-alias-brand-primary-invert: var(--dsw-static-neutral-bluish-00);\n  --dsw-alias-brand-primary-new-colorprimary-new-color: var(--lg-accent);\n  --dsw-specific-login-input: var(--dsw-static-neutral-bluish-50);\n\n  --dsw-alias-bg-mask-1: rgba(11, 15, 21, 0.24);\n  --dsw-alias-bg-mask-2: rgba(11, 15, 21, 0.12);\n  --dsw-alias-bg-mask-3: rgba(11, 15, 21, 0.48);\n  --dsw-alias-bg-mask-drop: rgba(255, 255, 255, 0.72);\n  --dsw-alias-bg-mask-photo: rgba(0, 0, 0, 0.88);\n\n  /* Diff / code surfaces. Tinted rather than saturated: a diff is a document,\n     and a document is read. */\n  --dsw-alias-code-diff-added: var(--dsw-static-green-500-a08);\n  --dsw-alias-code-diff-deleted: var(--dsw-static-red-600-a08);\n  --dsw-alias-file-diff-added-bg: #eef8f1;\n  --dsw-alias-file-diff-added-gutter: #e6f3ea;\n  --dsw-alias-file-diff-added-marker: var(--dsw-static-green-500);\n  --dsw-alias-file-diff-deleted-bg: #fdeeed;\n  --dsw-alias-file-diff-deleted-gutter: #fbe6e4;\n  --dsw-alias-file-diff-deleted-marker: var(--dsw-static-red-600);\n  --dsw-alias-markdown-citation: var(--dsw-static-neutral-bluish-100);\n  --dsw-alias-markdown-tag: var(--dsw-static-neutral-bluish-75);\n  --dsw-alias-markdown-placeholder: var(--dsw-static-neutral-bluish-60);\n  --dsw-alias-markdown-code-segment-selected: #ffffff;\n  --dsw-alias-markdown-code-segment-unselected: var(--dsw-static-neutral-bluish-75);\n\n  /* Elevation: replaced wholesale by the three-layer ladder. The composite\n     tokens are what most panels actually reference, so re-keying them here\n     upgrades every panel at once instead of one selector at a time. */\n  --dsw-shadow-lv1: 0 1px 2px rgba(16, 22, 40, 0.05);\n  --dsw-shadow-lv1-blur: 0 4px 12px rgba(16, 22, 40, 0.06);\n  --dsw-shadow-lv2: 0 2px 6px rgba(16, 22, 40, 0.06), 0 12px 32px -8px rgba(16, 22, 40, 0.14);\n  --dsw-shadow-lv3: 0 0 0 0.5px var(--lg-hairline), 0 4px 14px rgba(16, 22, 40, 0.08),\n    0 32px 72px -16px rgba(16, 22, 40, 0.24);\n  --dsw-elevation-stroke-color: var(--lg-hairline);\n  --dsw-elevation-stroke: 0 0 0 0.5px var(--lg-hairline);\n  --dsw-elevation-panel: var(--lg-shadow-1);\n  --dsw-elevation-prominent: var(--lg-shadow-2);\n  --dsw-elevation-soft: var(--lg-shadow-1);\n\n  /* Focus: the ring is drawn by base.css, the tokens only stop the shipped\n     components from drawing a second one. */\n  --dsw-focus-ring-color: transparent;\n  --dsw-focus-ring-width: 2px;\n\n  /* Thinking gradient: the quote block's fade, keyed to the reading surface. */\n  --dsw-linear-gradient-think: linear-gradient(180deg, #ffffff 20.19%, #ffffff00 100%);\n  --dsw-linear-think-select: linear-gradient(180deg, #f4f6fa 20.19%, #f4f6fa00 100%);\n\n  /* ---- Typography ladder ------------------------------------------------\n     Every one of these is a composite `font` shorthand, and every consumer in\n     the app reads them, so re-keying the ladder retypesets the whole product in\n     one place: markdown, code, tables, headings, chrome labels.\n\n     Two Apple rules are applied throughout. First, leading is expressed against\n     the *content* font size (the user can raise it in settings), so the ratio\n     stays constant instead of the line box growing linearly. Second, larger\n     text carries a heavier weight and tighter leading while small text opens\n     up — the optical ramp, not one ratio scaled.\n\n     The body reading size drops from a 1.71 ratio to 1.57: the shipped value is\n     generous enough that a paragraph reads as a list of lines rather than a\n     block of text. */\n  --dsw-font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text',\n    'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica,\n    Arial, sans-serif;\n  --dsw-font-family-brand: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Display',\n    'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;\n\n  --dsw-font-markdown-base: var(--dsh-content-font-size, 14px) / calc(22px + var(--dsh-content-font-delta))\n    var(--dsw-font-family);\n  --dsw-font-markdown-base-italic: italic var(--dsh-content-font-size, 14px) /\n    calc(22px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n  --dsw-font-markdown-base-strong: 600 var(--dsh-content-font-size, 14px) /\n    calc(22px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n  --dsw-font-markdown-base-strong-italic: italic 600 var(--dsh-content-font-size, 14px) /\n    calc(22px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n\n  --dsw-font-markdown-h1: 700 calc(22px + var(--dsh-content-font-delta)) /\n    calc(29px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n  --dsw-font-markdown-h2: 650 calc(19px + var(--dsh-content-font-delta)) /\n    calc(26px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n  --dsw-font-markdown-h3: 640 calc(17px + var(--dsh-content-font-delta)) /\n    calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n  --dsw-font-markdown-h4: 600 var(--dsh-content-font-size, 14px) /\n    calc(22px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n\n  --dsw-font-markdown-small: 12px/18px var(--dsw-font-family);\n  --dsw-font-markdown-small-italic: italic 12px/18px var(--dsw-font-family);\n  --dsw-font-markdown-small-strong: 600 12px/18px var(--dsw-font-family);\n  --dsw-font-markdown-small-strong-italic: italic 600 12px/18px var(--dsw-font-family);\n\n  --dsw-font-markdown-table: var(--dsh-content-font-size-secondary, 13px) /\n    calc(20px + var(--dsh-content-font-delta-secondary, 0px)) var(--dsw-font-family);\n  --dsw-font-markdown-table-head: 560 var(--dsh-content-font-size-secondary, 13px) /\n    calc(20px + var(--dsh-content-font-delta-secondary, 0px)) var(--dsw-font-family);\n\n  /* Code keeps the monospace stack but gets a tighter leading than prose: a\n     code block is scanned in columns, not read in lines. */\n  --dsw-font-markdown-code: calc(12px + var(--dsh-code-font-delta)) /\n    calc(19px + var(--dsh-code-font-delta)) var(--ds-font-family-code);\n  --dsw-font-markdown-code-block: var(--dsh-code-font-size, 11px) /\n    calc(18px + var(--dsh-code-font-delta)) var(--ds-font-family-code);\n  --dsw-font-markdown-code-block-small: var(--dsh-code-font-size, 11px) /\n    calc(16px + var(--dsh-code-font-delta)) var(--ds-font-family-code);\n\n  --dsw-font-base-16: 16px/24px var(--dsw-font-family);\n  --dsw-font-base-strong-16: 560 16px/24px var(--dsw-font-family);\n  --dsw-font-m-18: 590 18px/26px var(--dsw-font-family);\n  --dsw-font-l-20: 620 20px/27px var(--dsw-font-family);\n  --dsw-font-xl-24: 660 24px/31px var(--dsw-font-family);\n\n  --dsw-font-s-14: 14px/21px var(--dsw-font-family);\n  --dsw-font-s-strong-14: 560 14px/21px var(--dsw-font-family);\n  --dsw-font-xs-13: 13px/19px var(--dsw-font-family);\n  --dsw-font-xs-strong-13: 560 13px/19px var(--dsw-font-family);\n  --dsw-font-xxs-12: 12px/17px var(--dsw-font-family);\n  --dsw-font-xxs-strong-12: 560 12px/17px var(--dsw-font-family);\n  --dsw-font-xxxs-11: 11px/15px var(--dsw-font-family);\n  --dsw-font-xxxs-strong-11: 560 11px/15px var(--dsw-font-family);\n}\n\nbody[data-ds-dark-theme] {\n  /* Palette: the dark ramp keeps the same hue rotation as the light one, only\n     inverted in lightness. Re-keying it is what makes diff and chart surfaces\n     read as part of the skin rather than as leftover product chrome. */\n  --dsw-static-neutral-bluish-00: #ffffff;\n  --dsw-static-neutral-bluish-50: #eef1f6;\n  --dsw-static-neutral-bluish-60: #e3e8f1;\n  --dsw-static-neutral-bluish-75: #d6dde9;\n  --dsw-static-neutral-bluish-100: #c7d0e0;\n  --dsw-static-neutral-bluish-150: #b6c1d4;\n  --dsw-static-neutral-bluish-200: #a3b0c6;\n  --dsw-static-neutral-bluish-300: #8b99b2;\n  --dsw-static-neutral-bluish-400: #75839c;\n  --dsw-static-neutral-bluish-500: #606d85;\n  --dsw-static-neutral-bluish-600: #4d596e;\n  --dsw-static-neutral-bluish-700: #3d4859;\n  --dsw-static-neutral-bluish-750: #333d4c;\n  --dsw-static-neutral-bluish-800: #2a3340;\n  --dsw-static-neutral-bluish-850: #222a35;\n  --dsw-static-neutral-bluish-875: #1c232d;\n  --dsw-static-neutral-bluish-900: #171d26;\n  --dsw-static-neutral-bluish-950: #11161d;\n  --dsw-static-neutral-bluish-1000: #0b0f15;\n\n  --dsw-static-neutral-00: #ffffff;\n  --dsw-static-neutral-50: #f4f5f7;\n  --dsw-static-neutral-100: #e6e8ec;\n  --dsw-static-neutral-200: #d2d5db;\n  --dsw-static-neutral-300: #a9aeb7;\n  --dsw-static-neutral-550: #6d737d;\n  --dsw-static-neutral-600: #565c65;\n  --dsw-static-neutral-700: #43484f;\n  --dsw-static-neutral-800: #2d3136;\n  --dsw-static-neutral-850: #25282c;\n  --dsw-static-neutral-1000: #0f1114;\n\n  --dsw-static-blue-300: #a8bbff;\n  --dsw-static-blue-450: #8ba2ff;\n  --dsw-static-blue-500: #7b93ff;\n  --dsw-static-blue-900: #1e2c66;\n  --dsw-static-blue-950: #121c42;\n\n  --dsw-static-deepseek-50: #101a45;\n  --dsw-static-deepseek-100: #17224f;\n  --dsw-static-deepseek-200: #1d2b63;\n  --dsw-static-deepseek-400: #93a7ff;\n  --dsw-static-deepseek-450: #7b93ff;\n  --dsw-static-deepseek-500: #6b83fb;\n  --dsw-static-deepseek-800: #2b3a7d;\n\n  --dsw-static-green-100: #12321f;\n  --dsw-static-green-400: #5ad394;\n  --dsw-static-green-500: #35b877;\n  --dsw-static-green-500-a08: #35b87714;\n  --dsw-static-green-500-a12: #35b8771f;\n  --dsw-static-green-900: #0c2a1a;\n\n  --dsw-static-amber-100: #33260d;\n  --dsw-static-amber-400: #f0b45a;\n  --dsw-static-amber-500: #e19a2a;\n  --dsw-static-amber-600: #c07d13;\n  --dsw-static-amber-900: #3a2708;\n\n  --dsw-static-red-50: #33100f;\n  --dsw-static-red-100: #451614;\n  --dsw-static-red-400: #f2726a;\n  --dsw-static-red-400-a12: #f2726a1f;\n  --dsw-static-red-500: #e5484d;\n  --dsw-static-red-600: #f2726a;\n  --dsw-static-red-600-a08: #f2726a14;\n  --dsw-static-red-900: #3d1013;\n\n  --dsw-alias-state-business-primary: var(--dsw-static-deepseek-400);\n  --dsw-alias-state-business-tertiary: var(--dsw-static-deepseek-800);\n  --dsw-alias-state-error-primary: var(--dsw-static-red-400);\n  --dsw-alias-state-error-secondary: var(--dsw-static-red-400);\n  --dsw-alias-state-idle-primary: var(--dsw-static-neutral-600);\n  --dsw-alias-state-success-primary: var(--dsw-static-green-400);\n  --dsw-alias-state-success-secondary: var(--dsw-static-green-400);\n  --dsw-alias-state-success-tertiary: var(--dsw-static-green-900);\n  --dsw-alias-state-warn-label: var(--dsw-static-amber-400);\n  --dsw-alias-state-warn-primary: var(--dsw-static-amber-400);\n  --dsw-alias-state-warn-secondary: var(--dsw-static-amber-500);\n  --dsw-alias-state-warn-tertiary: var(--dsw-static-amber-100);\n\n  --dsw-alias-label-primary-bluish: var(--dsw-static-neutral-bluish-50);\n  --dsw-alias-label-primary-dimmed: var(--dsw-static-neutral-bluish-100);\n  --dsw-alias-label-primary-foreground: var(--dsw-static-neutral-bluish-1000);\n  --dsw-alias-label-primary-inverted: var(--dsw-static-neutral-bluish-800);\n  --dsw-alias-label-shimmer: rgba(255, 255, 255, 0.45);\n  --dsw-alias-label-deep-diving: var(--lg-accent-strong);\n  --dsw-alias-label-deep-diving-shimmer: rgba(147, 167, 255, 0.5);\n\n  --dsw-alias-button-primary-fill: var(--lg-accent);\n  --dsw-alias-button-primary-hover: var(--lg-accent-strong);\n  --dsw-alias-button-primary-dimmed: rgba(123, 147, 255, 0.34);\n  --dsw-alias-button-contrast-fill: var(--dsw-static-neutral-bluish-50);\n  --dsw-alias-button-ghost-active-fill: var(--dsw-static-neutral-bluish-750);\n  --dsw-alias-button-ghost-active-hover: var(--dsw-static-neutral-bluish-700);\n  --dsw-alias-button-ghost-active-border: var(--dsw-static-neutral-bluish-600);\n\n  --dsw-menu-surface-fill: rgba(30, 34, 44, 0.96);\n  --dsw-alias-menu-group-header-fill: rgba(38, 43, 54, 0.92);\n  --dsw-alias-menu-icon: var(--dsw-alias-label-primary-dimmed);\n  --dsw-hovercard-bg: rgba(28, 32, 42, 0.92);\n\n  --dsw-alias-settings-card-fill: var(--lg-surface-raised);\n  --dsw-alias-settings-card-stroke: var(--lg-hairline);\n  --dsw-alias-onboarding-accent: var(--lg-accent);\n  --dsw-alias-onboarding-card-fill: rgba(28, 32, 42, 0.72);\n  --dsw-alias-onboarding-secondary-fill: rgba(30, 34, 44, 0.94);\n  --dsw-alias-onboarding-checkbox-border: var(--lg-hairline-strong);\n  --dsw-alias-switch-thumb: #ffffff;\n  --dsw-alias-toast-label: #ffffff;\n  --dsw-alias-turn-trigger-bg: var(--dsw-alias-interactive-bg-hover);\n  --dsw-alias-turn-trigger-bg-hover: var(--dsw-alias-interactive-bg-active);\n  --dsw-alias-bg-multi-select: var(--dsw-static-neutral-850);\n  --dsw-alias-bg-module-platform: var(--dsw-static-neutral-bluish-800);\n  --dsw-alias-bg-document-preview: var(--lg-surface-sunken);\n  --dsw-alias-label-document-preview: var(--dsw-static-neutral-bluish-300);\n  --dsw-alias-border-inverted: rgba(255, 255, 255, 0.06);\n  --dsw-alias-border-inverted2: rgba(255, 255, 255, 0.08);\n  --dsw-alias-brand-primary-invert: var(--dsw-static-neutral-bluish-1000);\n  --dsw-specific-login-input: var(--dsw-static-neutral-bluish-900);\n\n  --dsw-alias-bg-mask-1: rgba(0, 0, 0, 0.5);\n  --dsw-alias-bg-mask-2: rgba(0, 0, 0, 0.2);\n  --dsw-alias-bg-mask-3: rgba(0, 0, 0, 0.48);\n  --dsw-alias-bg-mask-drop: rgba(39, 39, 48, 0.7);\n  --dsw-alias-bg-mask-photo: rgba(0, 0, 0, 0.88);\n\n  --dsw-alias-code-diff-added: var(--dsw-static-green-500-a12);\n  --dsw-alias-code-diff-deleted: var(--dsw-static-red-400-a12);\n  --dsw-alias-file-diff-added-bg: #14241a;\n  --dsw-alias-file-diff-added-gutter: #101d15;\n  --dsw-alias-file-diff-added-marker: var(--dsw-static-green-400);\n  --dsw-alias-file-diff-deleted-bg: #2a1513;\n  --dsw-alias-file-diff-deleted-gutter: #21100f;\n  --dsw-alias-file-diff-deleted-marker: var(--dsw-static-red-400);\n  --dsw-alias-markdown-citation: var(--dsw-static-neutral-bluish-800);\n  --dsw-alias-markdown-tag: var(--dsw-static-neutral-bluish-850);\n  --dsw-alias-markdown-placeholder: var(--dsw-static-neutral-bluish-850);\n  --dsw-alias-markdown-code-segment-selected: var(--dsw-static-neutral-bluish-800);\n  --dsw-alias-markdown-code-segment-unselected: var(--dsw-static-neutral-bluish-900);\n\n  --dsw-shadow-lv1: 0 1px 2px rgba(0, 0, 0, 0.4);\n  --dsw-shadow-lv1-blur: 0 4px 12px rgba(0, 0, 0, 0.45);\n  --dsw-shadow-lv2: 0 2px 8px rgba(0, 0, 0, 0.45), 0 14px 36px -8px rgba(0, 0, 0, 0.62);\n  --dsw-shadow-lv3: 0 0 0 0.5px var(--lg-hairline), 0 6px 18px rgba(0, 0, 0, 0.5),\n    0 36px 80px -16px rgba(0, 0, 0, 0.72);\n  --dsw-elevation-stroke-color: var(--lg-hairline);\n  --dsw-elevation-panel: var(--lg-shadow-1);\n  --dsw-elevation-prominent: var(--lg-shadow-2);\n  --dsw-elevation-soft: var(--lg-shadow-1);\n\n  --dsw-linear-gradient-think: linear-gradient(180deg, #0f1116 20.19%, #0f111600 100%);\n  --dsw-linear-think-select: linear-gradient(180deg, #1c232d 20.19%, #1c232d00 100%);\n}\n\n/* --------------------------------------------------------------------------\n   Repairs.\n   --------------------------------------------------------------------------\n   The shipped stylesheets reference eleven custom properties that nothing in\n   the app ever defines. Every one of those declarations therefore falls back to\n   the property's initial value — `background: transparent` on a hover plate, an\n   inherited colour on a disabled control, a proportional font on a code viewer.\n   Those surfaces are invisible or wrong in the shipped build, which is why a\n   few of them look unfinished no matter what palette is applied.\n\n   Defining them here is not cosmetic: it is what makes the hover state of a\n   session row actually appear. Values are the ones the surrounding rules were\n   plainly written against (`-fill-l1` is the hover wash, `-separator-primary` is\n   the hairline between stat pills, `-font-mono` is the code stack).\n   -------------------------------------------------------------------------- */\nbody {\n  --dsw-alias-bg-l1: var(--lg-surface-sunken);\n  --dsw-alias-bg-layer-4: var(--lg-surface-raised);\n  --dsw-alias-fill-l1: rgba(16, 22, 40, 0.055);\n  --dsw-alias-fill-l2: rgba(16, 22, 40, 0.075);\n  --dsw-alias-fill-tertiary: rgba(16, 22, 40, 0.09);\n  --dsw-alias-fill-tsp-secondary: rgba(16, 22, 40, 0.06);\n  --dsw-alias-label-error: var(--dsw-alias-state-error-primary);\n  --dsw-alias-label-quaternary: rgba(16, 19, 26, 0.26);\n  --dsw-alias-separator-primary: var(--lg-hairline);\n  --dsw-alias-interactive-bg-hover-danger: rgba(204, 43, 48, 0.1);\n  --dsw-font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono',\n    monospace;\n  --dsw-font-markdown-code-font-family: var(--ds-font-family-code);\n  --dsw-mask-blur: blur(2px);\n  /* Onboarding's animated gradient stops. The skin keeps the shipped hues but\n     pulls the saturation down so the first-run screen reads as the same product\n     as the rest of the app rather than as a separate marketing surface. */\n  --dsw-gradient-onboarding-blue-stops: #3d5afe 18.75%, #4d8bfe 51.78%, #8fd4ff 86.25%, #3d5afe;\n  --dsw-gradient-onboarding-cyan-stops: #0b93b4 21.15%, #2fc0e0 50.95%, #b4efff 85.33%, #0b93b4;\n  --dsw-gradient-onboarding-violet-stops: #3b3fc0 33.1%, #8b76f6 50.95%, #c9c4ff 85.33%, #3b3fc0;\n}\n\nbody[data-ds-dark-theme] {\n  --dsw-alias-bg-l1: var(--lg-surface-sunken);\n  --dsw-alias-bg-layer-4: var(--lg-surface-raised);\n  --dsw-alias-fill-l1: rgba(255, 255, 255, 0.07);\n  --dsw-alias-fill-l2: rgba(255, 255, 255, 0.09);\n  --dsw-alias-fill-tertiary: rgba(255, 255, 255, 0.12);\n  --dsw-alias-fill-tsp-secondary: rgba(255, 255, 255, 0.08);\n  --dsw-alias-label-error: var(--dsw-alias-state-error-primary);\n  --dsw-alias-label-quaternary: rgba(242, 244, 248, 0.26);\n  --dsw-alias-separator-primary: var(--lg-hairline);\n  --dsw-alias-interactive-bg-hover-danger: rgba(242, 114, 106, 0.14);\n  --dsw-gradient-onboarding-blue-stops: #6b83fb 18.75%, #5f9bff 51.78%, #a8d8ff 86.25%, #6b83fb;\n  --dsw-gradient-onboarding-cyan-stops: #23a8c8 21.15%, #3fd0ee 50.95%, #bff2ff 85.33%, #23a8c8;\n  --dsw-gradient-onboarding-violet-stops: #5a5fd8 33.1%, #a596ff 50.95%, #d8d3ff 85.33%, #5a5fd8;\n}\n\n/* --------------------------------------------------------------------------\n   Answering the user's environment settings. Every one of these is a real\n   answer, not a courtesy: reduced transparency removes the blur and promotes\n   fills to opaque, reduced motion removes travel but keeps the state change,\n   increased contrast sharpens edges.\n   -------------------------------------------------------------------------- */\n\n@media (prefers-reduced-transparency: reduce) {\n  body {\n    --lg-glass-1: #ffffff;\n    --lg-glass-2: #ffffff;\n    --lg-glass-3: #ffffff;\n    --lg-glass-tint: #ffffff;\n    --dsw-specific-input-major: #ffffff;\n    --dsw-specific-menu: #ffffff;\n    --dsw-specific-sidebar-nav-item-active: #ffffff;\n  }\n  body[data-ds-dark-theme] {\n    --lg-glass-1: #1b2029;\n    --lg-glass-2: #1b2029;\n    --lg-glass-3: #1b2029;\n    --lg-glass-tint: #1b2029;\n    --dsw-specific-input-major: #1b2029;\n    --dsw-specific-menu: #1b2029;\n    --dsw-specific-sidebar-nav-item-active: #262c38;\n  }\n}\n\n@media (prefers-contrast: more) {\n  body {\n    --lg-hairline: rgba(0, 0, 0, 0.3);\n    --lg-edge-top: #ffffff;\n    --dsw-alias-label-secondary: rgba(16, 19, 26, 0.82);\n    --dsw-alias-label-tertiary: rgba(16, 19, 26, 0.68);\n  }\n  body[data-ds-dark-theme] {\n    --lg-hairline: rgba(255, 255, 255, 0.4);\n    --lg-edge-top: rgba(255, 255, 255, 0.55);\n    --dsw-alias-label-secondary: rgba(242, 244, 248, 0.84);\n    --dsw-alias-label-tertiary: rgba(242, 244, 248, 0.7);\n  }\n}\n"},{"id":"dsh-glass-theme/base.css","css":"/* ==========================================================================\n   Liquid Glass · base\n   --------------------------------------------------------------------------\n   The lit environment itself: the app frame, the ambient field behind it, the\n   type ramp, focus, and the shared primitives (`.lg-glass`, scrollbars) that\n   per-surface sheets build on.\n\n   Rule that keeps the whole design honest: glass is for FLOATING layers only.\n   Content that scrolls stays on an opaque surface. This file owns the floor;\n   the surface sheets own what floats above it.\n   ========================================================================== */\n\n/* ---- The frame ---------------------------------------------------------- */\n/* The shipped frame paints --dsw-alias-bg-base flat. Repaint it as the ambient\n   field. Because the field is on the frame, every backdrop-filter above it\n   samples a moving gradient rather than a constant colour.\n\n   Selectors here name the exact AppFrame hash rather than a `_frame` substring:\n   a dozen unrelated modules also end in `_frame` (the turn navigator, the image\n   preview, the trajectory frame), and a substring rule would restack all of\n   them. */\n[class~='BynINW_frame'] {\n  position: relative;\n  z-index: 1;\n  background: transparent !important;\n}\n\nhtml body {\n  background-color: var(--lg-ambient-floor);\n  color: var(--dsw-alias-label-primary);\n  font-family: var(--dsw-font-family);\n  -webkit-font-smoothing: antialiased;\n  text-rendering: optimizeLegibility;\n}\n\n/* The light field. One fixed pseudo-element on the app root, below every\n   surface, so it never participates in scrolling or reflow. */\nhtml body::before {\n  content: '';\n  position: fixed;\n  inset: 0;\n  z-index: 0;\n  pointer-events: none;\n  background-image: var(--lg-ambient-1), var(--lg-ambient-2), var(--lg-ambient-3);\n  background-color: var(--lg-ambient-floor);\n  /* Sits under the grid, so panels above it can blur it. */\n  contain: strict;\n}\n\n/* ---- Typography ---------------------------------------------------------\n   Apple's ramp is size-specific: larger text tightens, smaller text opens up.\n   The shipped tokens already carry a size ladder; these rules only adjust the\n   tracking/leading relationship at the extremes, where the difference shows. */\n[class*='_markdown'],\n[class*='_assistantContent'],\n[class*='_bubble'] {\n  letter-spacing: -0.006em;\n}\n\nh1,\n[class*='_markdown'] h1 {\n  letter-spacing: -0.022em;\n}\n[class*='_markdown'] h2 {\n  letter-spacing: -0.018em;\n}\n[class*='_markdown'] h3 {\n  letter-spacing: -0.012em;\n}\n\n/* Small chrome text opens up slightly so it stays legible at 11–12px. */\n[class*='_caption'],\n[class*='_meta'],\n[class*='_hint'],\n[class*='_groupTitle'],\n[class*='_sectionTitle'] {\n  letter-spacing: 0.004em;\n}\n\n/* Tabular figures wherever a number is live — counters, timers, token stats. */\n[class*='_count'],\n[class*='_stat'],\n[class*='_metric'],\n[class*='_usage'],\n[class*='_usage'] {\n  font-variant-numeric: tabular-nums;\n}\n\n/* ---- Shared material primitives ---------------------------------------- */\n\n/* L1 — chrome. Blur + saturate, lit top rim, contact shadow. */\n.lg-glass-1 {\n  background-color: var(--lg-glass-1);\n  backdrop-filter: blur(24px) saturate(180%);\n  -webkit-backdrop-filter: blur(24px) saturate(180%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    var(--lg-shadow-1);\n}\n\n/* L2 — floating panels, popovers, the composer. */\n.lg-glass-2 {\n  background-color: var(--lg-glass-2);\n  backdrop-filter: blur(28px) saturate(185%);\n  -webkit-backdrop-filter: blur(28px) saturate(185%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    var(--lg-shadow-2);\n}\n\n/* L3 — sheets and modals, where legibility outranks transparency. */\n.lg-glass-3 {\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(34px) saturate(190%);\n  -webkit-backdrop-filter: blur(34px) saturate(190%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    var(--lg-shadow-3);\n}\n\n/* Reduced transparency: the same surfaces, promoted to opaque. The blur is\n   removed rather than merely hidden so it costs nothing. */\n@media (prefers-reduced-transparency: reduce) {\n  .lg-glass-1,\n  .lg-glass-2,\n  .lg-glass-3 {\n    backdrop-filter: none;\n    -webkit-backdrop-filter: none;\n    background-color: var(--lg-glass-solid);\n  }\n}\n\n/* ---- Focus -------------------------------------------------------------\n   A single ring language for the whole app, with two deliberate constraints.\n\n   It is drawn with `outline`, not `box-shadow`. A shadow ring REPLACES the\n   element's own shadow, so every focused control would lose its material —\n   the settings nav plate, the composer card, the glass buttons all flatten\n   the moment they take focus. An outline composites on top instead, and\n   Chromium follows the border radius with it.\n\n   And it is gated on the last input modality (see src/client.js). Dialogs\n   here autofocus their first control, which Chromium counts as `:focus-visible`\n   even when the user opened the dialog with a pointer — so an ungated rule\n   paints a ring nobody asked for on every settings page. Keyboard navigation\n   still gets the ring, on the frame the key is released. */\nhtml[data-lg-input='keyboard']\n  :where(button, a, input, textarea, select, [role='button'], [role='tab'], [tabindex]):focus-visible {\n  outline: 2px solid var(--lg-accent-ring);\n  outline-offset: 2px;\n}\n\n/* ---- Scrollbars --------------------------------------------------------\n   The shipped scrollbar is already the right object: 5px, always visible, a\n   rounded thumb inset by `background-clip: content-box`, and a per-surface\n   `--dsh-scrollbar-thumb` binding so a thumb inside a card is quieter than one\n   on the page. An earlier revision of this skin replaced it with a 10px overlay\n   thumb that only appeared on hover — which made the one piece of chrome the\n   app had already got right worse. This block therefore only re-states the\n   shipped geometry, so the skin's colour tokens reach it; it deliberately does\n   not change width, visibility or track. */\n/* NOTE the absence of a `scrollbar-color` declaration here. It looks harmless —\n   it is the standard way to tint a scrollbar — but setting it switches Chromium\n   onto the STANDARD scrollbar path, where `::-webkit-scrollbar { width }` is\n   ignored and the scroller falls back to the platform's 15px bar. The app sizes\n   its scrollers around a 5px bar (`--dsh-session-list-scrollbar-width: 5px`, and\n   `padding-right: calc(edge-inset - 5px - 2px)` in the session list), so a 15px\n   bar silently eats 10px of the content box on one side only — every list then\n   reads as having a wider right inset than left. Colour therefore comes from the\n   tokens the app already binds (`--dsw-alias-scrollbar-bg-l1`), which this skin\n   re-keys, and the geometry below is the shipped geometry restated. */\n::-webkit-scrollbar {\n  width: var(--dsh-scrollbar-width, 5px);\n  height: var(--dsh-scrollbar-width, 5px);\n}\n::-webkit-scrollbar-track {\n  margin-block: var(--dsh-scrollbar-track-margin, 0px);\n  background: transparent;\n}\n::-webkit-scrollbar-thumb {\n  border: var(--dsh-scrollbar-thumb-border, 0px) solid transparent;\n  border-radius: 999px;\n  background-color: var(--dsh-scrollbar-thumb, var(--dsw-alias-scrollbar-bg-l1));\n  background-clip: content-box;\n}\n::-webkit-scrollbar-thumb:hover {\n  background-color: var(--dsh-scrollbar-thumb-hover, var(--dsw-alias-scrollbar-hover-l1));\n}\n::-webkit-scrollbar-corner {\n  background: transparent;\n}\n\n/* Engines without `::-webkit-scrollbar` (Firefox) need the standard properties,\n   and there the app's own stylesheet already supplies them under exactly this\n   guard, so the skin only has to keep the tint. */\n@supports not selector(::-webkit-scrollbar) {\n  body,\n  body * {\n    scrollbar-width: thin;\n    scrollbar-color: var(--dsh-scrollbar-thumb) transparent;\n  }\n}\n\n/* ---- Selection --------------------------------------------------------- */\n::selection {\n  background-color: var(--lg-accent-soft);\n  color: inherit;\n}\n\n/* ---- Motion floor ------------------------------------------------------\n   Reduced motion keeps every state change and removes only travel. Transitions\n   collapse to a cross-fade so nothing snaps without feedback. */\n@media (prefers-reduced-motion: reduce) {\n  *,\n  *::before,\n  *::after {\n    animation-duration: 1ms !important;\n    animation-iteration-count: 1 !important;\n    transition-duration: 120ms !important;\n    transition-property: color, background-color, border-color, box-shadow, opacity !important;\n    scroll-behavior: auto !important;\n  }\n}\n"},{"id":"dsh-glass-theme/shell.css","css":"/* ==========================================================================\n   Liquid Glass · shell\n   --------------------------------------------------------------------------\n   The three-column frame. In the shipped UI the columns are flat regions of one\n   background. Here the sidebar and rightbar become floating glass columns with\n   the ambient field visible in the gutters around them, and the centre column\n   becomes the opaque reading surface between them.\n\n   Why the centre stays opaque: it holds the transcript. Text that scrolls must\n   never sit on a moving blur, so the material stops at the column edge and the\n   reading surface is solid.\n   ========================================================================== */\n\n/* ---- Gutters -----------------------------------------------------------\n   The frame grid keeps its shipped column math (drag handles, collapse\n   animation and the Windows titlebar inset all depend on it). What changes is\n   that each column is inset from the frame so the ambient field shows through\n   the gap — the \"floating above the page\" read.\n\n   The columns are grid items sized by their track, so the inset has to be\n   padding on the column and the column has to be border-box; with the shipped\n   content-box the padding would widen the item past its track and the sidebar\n   would slide under the centre column. */\n[class~='BynINW_frame'] {\n  --lg-gutter: 10px;\n}\n\n[class*='_sidebarCol'],\n[class*='_rightbarCol'],\n[class*='_centerCol'] {\n  box-sizing: border-box;\n}\n\n[class*='_sidebarCol'] {\n  padding: var(--lg-gutter);\n  min-width: 0;\n}\n\n[class*='_rightbarCol'] {\n  padding: var(--lg-gutter) var(--lg-gutter) var(--lg-gutter) 0;\n  min-width: 0;\n}\n\n/* Collapsed columns must not keep their gutter, or the rail drifts. */\n[data-sidebar-collapsed='true'] [class*='_sidebarCol'] {\n  padding: 0;\n}\n[data-rightbar-collapsed='true'] [class*='_rightbarCol'] {\n  padding: 0;\n}\n\n/* ---- Centre column -----------------------------------------------------\n   The reading surface: opaque, lifted, floating in the same gutter as the\n   chrome. Margins rather than padding, because the column's children fill it\n   edge to edge (the transcript scroller and the composer dock both rely on\n   that), and a margin shrinks the item inside its track without changing what\n   its children measure against.\n\n   It is opaque on purpose — text that scrolls never sits on a moving blur. But\n   an opaque surface in a lit room is not a flat fill: it picks up the same light\n   as everything else. The ambient gradients are layered on as a *tint* at low\n   alpha, so the slab carries the direction of the light field without ever\n   moving under the text. This is what separates \"a dark panel\" from \"a pane of\n   glass with a surface behind it\". */\n[class*='_centerCol'] {\n  position: relative;\n  min-width: 0;\n  margin: var(--lg-gutter) var(--lg-gutter) var(--lg-gutter) 0;\n  border-radius: var(--lg-r-xl);\n  background-color: var(--lg-surface);\n  background-image: var(--lg-surface-light-1), var(--lg-surface-light-2);\n  box-shadow: var(--lg-shadow-1);\n  overflow: hidden;\n}\n\n/* When a side column is collapsed that edge of the reading surface reaches the\n   window, so its corners flatten — a panel that touches an edge does not round\n   it. The margin goes with it, otherwise a strip of wallpaper would show down\n   the edge of the window. */\n[data-sidebar-collapsed='true'] [class*='_centerCol'] {\n  margin-left: 0;\n  border-top-left-radius: 0;\n  border-bottom-left-radius: 0;\n}\n[data-rightbar-collapsed='true'] [class*='_centerCol'] {\n  margin-right: 0;\n  border-top-right-radius: 0;\n  border-bottom-right-radius: 0;\n}\n\n/* ---- Windows titlebar -------------------------------------------------\n   The shipped app reserves a 40px drag strip above the grid, paints it with the\n   sidebar fill, and rounds the centre column into it. Leaving that strip as bare\n   ambient field is what made the top of the window read as a separate layer\n   pasted over the interface: the columns floated below it with rounded corners,\n   so the eye saw wallpaper, then a hard edge, then content.\n\n   The fix is to make the strip a real object. A macOS window with a sidebar has\n   a *unified toolbar* — one full-width bar at the top of the window, with the\n   sidebar and the content starting below it. That is a legitimate layer, and it\n   is what the reserved height is for. So the strip gets the L1 material and a\n   bottom hairline, which turns \"leftover space\" into \"toolbar\".\n\n   The columns keep their 10px gutter below it, because everything in this shell\n   floats in the same gutter; the toolbar is simply the one bar that does not. */\n[data-windows-titlebar] [class~='BynINW_frame'] {\n  background-color: transparent !important;\n  background-image: none !important;\n}\n\n[data-windows-titlebar] [class~='BynINW_frame']::before {\n  background-color: var(--lg-glass-2) !important;\n  background-image: none !important;\n  backdrop-filter: blur(24px) saturate(180%);\n  -webkit-backdrop-filter: blur(24px) saturate(180%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    0 0.5px 0 var(--lg-hairline);\n  border-bottom-color: transparent !important;\n}\n\n/* The caption buttons sit in the top-right of this strip; a toolbar that ends\n   flush there would put a hairline through them, so the rule above is a\n   `box-shadow` rather than a border and the strip is allowed to reach the\n   window edge. */\n\n/* Inside the toolbar the drag region must still work, so nothing in the strip\n   may swallow pointer events. */\n[data-windows-titlebar] [class~='BynINW_frame']::before {\n  pointer-events: none;\n}\n\n[data-windows-titlebar] [class*='_centerCol'] {\n  border-radius: var(--lg-r-xl);\n  border-top-left-radius: var(--lg-r-xl);\n}\n\n/* ---- Drag handles -----------------------------------------------------\n   Invisible until hovered, then a thin lit seam — not a permanent divider. */\n[class*='_handle'] {\n  background: transparent !important;\n  transition: background-color var(--lg-t-base) var(--lg-ease-out);\n}\n[class*='_handle']:hover,\n[class*='_handle'][data-dragging='true'] {\n  background-color: var(--lg-accent-soft) !important;\n}\n\n/* ---- Overlay layer ----------------------------------------------------\n   Hosts toasts and quota notices. It is a pass-through layer, so it must not\n   paint; the items inside it own their own materials. */\n[class*='_overlayLayer'] {\n  background: transparent;\n  pointer-events: none;\n}\n[class*='_overlayLayer'] > * {\n  pointer-events: auto;\n}\n\n/* ---- Column resize transition ----------------------------------------\n   The shipped frame animates grid-template-columns. Keep it, but swap in the\n   Apple response curve so a drag release settles instead of stopping dead. */\n[class~='BynINW_frame'][data-animating] {\n  transition: grid-template-columns var(--lg-t-slow) var(--lg-ease-out) !important;\n}\n[class~='BynINW_frame'][data-dragging] {\n  transition: none !important;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  [class~='BynINW_frame'][data-animating] {\n    transition: none !important;\n  }\n}\n"},{"id":"dsh-glass-theme/sidebar.css","css":"/* ==========================================================================\n   Liquid Glass · sidebar\n   --------------------------------------------------------------------------\n   The sidebar is the app's navigation chrome, so it is L1 glass: it floats over\n   the ambient field, it never holds scrolling body text, and it stays one step\n   below the composer in height.\n\n   Selection is a travelling pill, not a cross-fade: the active row paints a lit\n   plate and rows around it keep their own hover tint, so the eye follows one\n   object moving rather than two objects swapping colour.\n   ========================================================================== */\n\n/* ---- The column -------------------------------------------------------- */\n[class~='_2H3hWW_root'] {\n  border-radius: var(--lg-r-xl);\n  background-color: var(--lg-glass-1);\n  backdrop-filter: blur(26px) saturate(180%);\n  -webkit-backdrop-filter: blur(26px) saturate(180%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    var(--lg-shadow-1);\n  /* The shipped root sets a flat fill; the material above replaces it. */\n  background-image: none;\n  /* The app writes an inline `width: <track>px` on this element to sync with the\n     drag handle, but the column now also carries a 10px gutter as padding, so\n     the inline width overflows the content box by that much and the glass slides\n     under the centre column — which is what clipped its left corner. `max-width`\n     beats an inline `width` by spec, so the glass stops at the content box while\n     the app's own number keeps animating underneath it. */\n  max-width: 100%;\n  transition:\n    background-color var(--lg-t-base) var(--lg-ease-out),\n    box-shadow var(--lg-t-base) var(--lg-ease-out);\n}\n\n/* A backdrop-filter makes this element the containing block for every\n   `position: fixed` descendant. The shipped collapse toggle is fixed to the\n   viewport at `top: (titlebar - 28px) / 2`, which is 6px — inside this column it\n   resolved to 56px and landed on top of the brand mark. The toggle is the only\n   fixed child, so it is lifted back out with the viewport as its containing\n   block again by painting the material on a pseudo-element instead of on the\n   column itself. */\n[class~='_2H3hWW_root'] {\n  backdrop-filter: none;\n  -webkit-backdrop-filter: none;\n  background-color: transparent;\n  position: relative;\n  isolation: isolate;\n}\n\n[class~='_2H3hWW_root']::before {\n  content: '';\n  position: absolute;\n  inset: 0;\n  z-index: -1;\n  border-radius: inherit;\n  background-color: var(--lg-glass-1);\n  backdrop-filter: blur(26px) saturate(180%);\n  -webkit-backdrop-filter: blur(26px) saturate(180%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    var(--lg-shadow-1);\n  pointer-events: none;\n}\n\n/* The macOS build hands the window a transparent sidebar so the system vibrancy\n   shows through. There is no system vibrancy in the browser, so the same slot\n   takes our own material instead of going empty. */\n[data-platform='darwin'] [class~='_2H3hWW_root']::before {\n  background-color: var(--lg-glass-1);\n}\n\n/* Collapsed rail: a narrow capsule. Rounding stays proportional — a 48px rail\n   with a 24px radius reads as a pill, which is the point. */\n[class~='_2H3hWW_root'][class~='_2H3hWW_collapsed']::before {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-glass-2);\n}\n\n/* ---- Brand row --------------------------------------------------------- */\n[class~='_2H3hWW_logoRow'] {\n  padding-inline: 4px;\n}\n\n[class~='_2H3hWW_brandMark'] {\n  border-radius: var(--lg-r-sm);\n  box-shadow: var(--lg-shadow-1);\n}\n\n[class~='_2H3hWW_brandName'] {\n  font-weight: 600;\n  letter-spacing: -0.012em;\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='_2H3hWW_buildVersion'] {\n  font-variant-numeric: tabular-nums;\n  letter-spacing: 0.01em;\n}\n\n/* ---- New session -------------------------------------------------------\n   The primary affordance in the column. Elevated fill plus a specular rim, and\n   it presses down (scale 0.985) on pointer-down rather than on click — the\n   response belongs to the touch, not to the outcome. */\n[class~='_2H3hWW_newSession'] {\n  border: 0.5px solid var(--lg-hairline);\n  border-radius: var(--lg-r-md);\n  background-color: var(--dsw-alias-button-elevated-fill);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    0 1px 2px rgba(16, 22, 40, 0.06);\n  font-weight: 560;\n  letter-spacing: -0.004em;\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    box-shadow var(--lg-t-fast) var(--lg-ease-out),\n    transform var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='_2H3hWW_newSession']:hover {\n  background-color: var(--dsw-alias-button-floating-hover);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    0 2px 6px rgba(16, 22, 40, 0.09);\n}\n\n[class~='_2H3hWW_newSession']:active {\n  transform: scale(0.985);\n  box-shadow: inset 0 0.5px 0 var(--lg-edge-bottom);\n}\n\n[class~='_2H3hWW_newSessionShortcut'] {\n  font-variant-numeric: tabular-nums;\n  opacity: 0.55;\n}\n\n/* ---- Panel rail (the top-level destinations) ---------------------------\n   HIG lists: a row is a full-width target with a rounded plate that appears on\n   hover, and the SELECTED row is a FILLED plate with an inverted label. The skin\n   used to give selection a tint plus a 2.5px accent bar, which is a desktop-app\n   idiom from a different family; Apple's source list fills the row and flips the\n   text to white, so selection can never be mistaken for hover. */\n[class~='_2H3hWW_panelList'] {\n  gap: 1px;\n}\n\n[class~='_2H3hWW_panelRow'] {\n  border-radius: var(--lg-r-md);\n  min-height: 32px;\n  padding: 5px 9px;\n  gap: 9px;\n  position: relative;\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='_2H3hWW_panelRow']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='_2H3hWW_panelRow'][class~='_2H3hWW_panelActive'] {\n  background-color: var(--lg-selection-fill);\n  box-shadow:\n    inset 0 0.5px 0 rgba(255, 255, 255, 0.22),\n    0 1px 2px color-mix(in srgb, var(--lg-selection-fill) 40%, transparent);\n  color: var(--lg-selection-label);\n  font-weight: 560;\n}\n\n[class~='_2H3hWW_panelRow'][class~='_2H3hWW_panelActive']:hover {\n  background-color: var(--lg-selection-fill-hover);\n}\n\n/* The selected row is one filled object: no leading bar, no second plate. */\n[class~='_2H3hWW_panelRow'][class~='_2H3hWW_panelActive']::before {\n  content: none;\n}\n\n[class~='_2H3hWW_panelGlyph'],\n[class~='_2H3hWW_panelIcon'] {\n  opacity: 0.9;\n}\n\n[class~='_2H3hWW_panelActive'] [class~='_2H3hWW_panelGlyph'],\n[class~='_2H3hWW_panelActive'] [class~='_2H3hWW_panelIcon'] {\n  opacity: 1;\n  color: var(--lg-selection-label);\n}\n\n/* ---- Region area -------------------------------------------------------\n   Holds the workspace browser and the session list. It is the only scrolling\n   part of the column, so the scrollbar is narrowed and inset. */\n[class~='_2H3hWW_regionArea'] {\n  scrollbar-gutter: stable;\n}\n\n[class~='_2H3hWW_regionArea'] > * {\n  min-height: 0;\n}\n\n/* The session list reserves a scrollbar gutter on the right (`scrollbar-gutter:\n   stable`) and pads for it, and the shipped row width is computed to land just\n   inside that reserved strip. The effect is that a row's plate ends 17px from the\n   column edge while it begins 12px from it — the list reads as pushed left, and a\n   selected row looks off-centre. The gutter has to stay (removing it makes every\n   row jump 5px when the list starts overflowing), so the compensation moves to\n   the list's own padding: drop the shipped right padding and the 2px margin, keep\n   2px of clearance for the thumb. Row edges then sit 12px from both sides. */\n[class~='_9lTDKa_list'] {\n  margin-right: 0;\n  padding-right: 2px;\n}\n\n/* ---- Footer ------------------------------------------------------------ */\n[class~='_2H3hWW_footArea'] {\n  border-top: 0.5px solid var(--lg-hairline);\n  padding-top: 6px;\n  margin-top: 4px;\n}\n\n[class~='_2H3hWW_settingsArea'] {\n  border-radius: var(--lg-r-md);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='_2H3hWW_settingsArea']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* ---- Workspace browser ------------------------------------------------- */\n[class~='_9lTDKa_root'],\n[class~='hIlkoa_slot'] {\n  background: transparent;\n}\n\n[class~='_9lTDKa_sectionHeader'],\n[class~='_9lTDKa_groupSection'] > [class~='_9lTDKa_sectionHeader'] {\n  /* A sticky header has to paint an opaque band to hide the rows sliding under\n     it, and that band is a rectangle the full width of the list — inside a 260px\n     column it is the widest box in the sidebar, which is precisely what makes a\n     list stop reading as a list. Apple's own sidebars do not pin section headers\n     in a source list this short; they let the label scroll away. So this is a\n     plain label in the list rhythm, and nothing paints. */\n  position: static;\n  z-index: auto;\n  background-color: transparent;\n  backdrop-filter: none;\n  -webkit-backdrop-filter: none;\n  padding-block: 14px 4px;\n}\n\n[class~='_9lTDKa_sectionLabel'] {\n  font-size: 11.5px;\n  font-weight: 600;\n  letter-spacing: 0.03em;\n  text-transform: uppercase;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* ---- Session rows ------------------------------------------------------\n   HIG lists-and-tables: rows are full-width targets with a rounded plate that\n   appears on hover; the SELECTED row is a filled plate with an inverted label.\n   Selection therefore never reads as hover, which matters here because this list\n   scrolls and the user needs to find the open session at a glance. */\n[class~='hIlkoa_sessionRow'],\n[class~='hIlkoa_projectRow'] {\n  border-radius: var(--lg-r-md);\n  height: 32px;\n  position: relative;\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    transform var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='hIlkoa_sessionRow']:hover,\n[class~='hIlkoa_projectRow']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='hIlkoa_sessionRow']:active,\n[class~='hIlkoa_projectRow']:active {\n  transform: scale(0.99);\n}\n\n[class~='hIlkoa_sessionRow'][class~='hIlkoa_selected'] {\n  background-color: var(--lg-selection-fill);\n  box-shadow:\n    inset 0 0.5px 0 rgba(255, 255, 255, 0.22),\n    0 1px 2px color-mix(in srgb, var(--lg-selection-fill) 40%, transparent);\n}\n\n[class~='hIlkoa_sessionRow'][class~='hIlkoa_selected']:hover {\n  background-color: var(--lg-selection-fill-hover);\n}\n\n[class~='hIlkoa_sessionRow'][class~='hIlkoa_selected'] [class~='hIlkoa_title'] {\n  font-weight: 560;\n  color: var(--lg-selection-label);\n}\n\n/* Every muted thing in a selected row has to invert with it, or the timestamp\n   disappears against the fill. */\n[class~='hIlkoa_sessionRow'][class~='hIlkoa_selected'] [class~='hIlkoa_time'],\n[class~='hIlkoa_sessionRow'][class~='hIlkoa_selected'] [class~='hIlkoa_meta'],\n[class~='hIlkoa_sessionRow'][class~='hIlkoa_selected'] [class~='hIlkoa_slot'] {\n  color: color-mix(in srgb, var(--lg-selection-label) 74%, transparent);\n}\n\n[class~='hIlkoa_sessionRow'][class~='hIlkoa_selected'] [class~='hIlkoa_dot'] {\n  background-color: var(--lg-selection-label);\n  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.22);\n}\n\n[class~='hIlkoa_title'] {\n  color: var(--dsw-alias-label-secondary);\n  letter-spacing: -0.002em;\n}\n\n[class~='hIlkoa_sessionRow']:hover [class~='hIlkoa_title'],\n[class~='hIlkoa_projectRow']:hover [class~='hIlkoa_title'] {\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='hIlkoa_time'],\n[class~='hIlkoa_meta'] {\n  font-variant-numeric: tabular-nums;\n  font-size: 11px;\n  color: var(--dsw-alias-label-caption);\n}\n\n/* A live session gets a breathing dot instead of a static one: the only place\n   in the chrome that animates at rest, so it reads as \"something is happening\". */\n[class~='hIlkoa_dot'] {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background-color: var(--lg-accent);\n  box-shadow: 0 0 0 3px var(--lg-accent-soft);\n}\n\n@keyframes lg-breathe {\n  0%,\n  100% {\n    opacity: 1;\n    box-shadow: 0 0 0 3px var(--lg-accent-soft);\n  }\n  50% {\n    opacity: 0.62;\n    box-shadow: 0 0 0 5px transparent;\n  }\n}\n\n[class~='hIlkoa_sessionRow']:has([class~='hIlkoa_dot']) [class~='hIlkoa_dot'] {\n  animation: lg-breathe 2.4s var(--lg-ease-in-out) infinite;\n}\n\n[class~='hIlkoa_rowActions'] [class~='hIlkoa_iconButton'],\n[class~='hIlkoa_iconButton'] {\n  border-radius: var(--lg-r-sm);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='hIlkoa_iconButton']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover-solid);\n}\n\n/* ---- Search ------------------------------------------------------------ */\n[class~='_9lTDKa_search'],\n[class~='_9lTDKa_searchInput'] {\n  border-radius: var(--lg-r-md);\n}\n\n[class~='_9lTDKa_searchInput'] {\n  background-color: var(--lg-glass-tint);\n  border: 0.5px solid var(--lg-hairline);\n  box-shadow: inset 0 1px 2px rgba(16, 22, 40, 0.04);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    box-shadow var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='_9lTDKa_searchInput']:focus,\n[class~='_9lTDKa_searchInput']:focus-within {\n  background-color: var(--dsw-alias-bg-layer-1);\n  box-shadow: 0 0 0 3px var(--lg-accent-ring);\n}\n\n[class~='hIlkoa_searchResultRow'] {\n  border-radius: var(--lg-r-md);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='hIlkoa_searchResultRow']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='hIlkoa_searchResultTitle'] {\n  font-weight: 560;\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='hIlkoa_searchResultSnippet'],\n[class~='hIlkoa_searchResultWorkspace'],\n[class~='hIlkoa_searchResultMeta'] {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n[class~='hIlkoa_searchResultHeading'] {\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.03em;\n  text-transform: uppercase;\n  color: var(--dsw-alias-label-caption);\n}\n\n/* ---- Skeletons ---------------------------------------------------------\n   Shimmer travels across the plate instead of pulsing the whole row, which\n   keeps the layout stable while the list resolves. */\n@keyframes lg-shimmer {\n  from {\n    background-position: -160% 0;\n  }\n  to {\n    background-position: 260% 0;\n  }\n}\n\n[class~='_9lTDKa_skeletonBar'],\n[class~='_9lTDKa_skeletonRow'] [class~='_9lTDKa_skeletonBar'],\n[class~='_9lTDKa_skeletonBarWide'] {\n  border-radius: var(--lg-r-xs);\n  background-image: linear-gradient(\n    90deg,\n    transparent 0%,\n    color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent) 45%,\n    transparent 90%\n  );\n  background-size: 160% 100%;\n  background-repeat: no-repeat;\n  animation: lg-shimmer 1.6s var(--lg-ease-in-out) infinite;\n}\n\n/* ---- Collapsed rail ---------------------------------------------------- */\n[class~='_2H3hWW_collapsed'] [class~='_2H3hWW_panelRow'] {\n  border-radius: var(--lg-r-md);\n}\n\n[class~='_2H3hWW_collapsed'] [class~='_2H3hWW_panelActive']::before {\n  inset-inline-start: -6px;\n  inset-block: 10px;\n}\n\n[class~='_2H3hWW_toggle'],\n[class~='_2H3hWW_iconButton'] {\n  border-radius: var(--lg-r-sm);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='_2H3hWW_toggle']:hover,\n[class~='_2H3hWW_iconButton']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  [class~='hIlkoa_sessionRow']:has([class~='hIlkoa_dot']) [class~='hIlkoa_dot'],\n  [class~='_9lTDKa_skeletonBar'] {\n    animation: none;\n  }\n}\n"},{"id":"dsh-glass-theme/conversation.css","css":"/* ==========================================================================\n   Liquid Glass · conversation\n   --------------------------------------------------------------------------\n   The transcript is the one place glass must stop. Every surface here is opaque\n   or near-opaque: text that scrolls never sits on a moving blur, and a long read\n   never fights the ambient field for attention.\n\n   What the redesign changes is rhythm and hierarchy, not material:\n     · the header becomes a floating strip inside the column, not a divider\n     · the reading column gets Apple's measure and leading\n     · user turns become tinted plates; assistant turns stay open text\n     · tool/reasoning rows collapse into quiet, self-effacing capsules\n   ========================================================================== */\n\n/* ---- Column ------------------------------------------------------------ */\n[class~='Dc7zOa_root'] {\n  background-color: transparent;\n}\n\n[class~='Dc7zOa_body'] {\n  --dsh-chat-content-width: var(--dsh-chat-user-width, clamp(660px, calc(var(--dsh-conversation-column-width, 0px) * 0.62), 880px));\n  --dsh-chat-flow-gap: 10px;\n  --dsh-composer-side-clearance: 18px;\n}\n\n/* ---- Header ------------------------------------------------------------\n   The shipped header is a full-width bar with a bottom rule. Here it becomes a\n   chrome strip that floats above the transcript: no rule, a soft fade so text\n   dissolves under it instead of being cut. */\n[class~='Dc7zOa_header'] {\n  border-bottom: none;\n  min-height: 56px;\n  padding: 10px 22px 6px 16px;\n  position: relative;\n  z-index: 5;\n}\n\n[class~='Dc7zOa_header']::after {\n  content: '';\n  position: absolute;\n  inset-inline: 0;\n  bottom: -14px;\n  height: 14px;\n  pointer-events: none;\n  background: linear-gradient(180deg, var(--lg-surface) 0%, transparent 100%);\n  opacity: 0.9;\n}\n\n[class~='Dc7zOa_headerBlank']::after {\n  display: none;\n}\n\n/* Title row: one line, tight tracking, and the breadcrumb reads as a single\n   object rather than a row of chips. */\n[class~='Dc7zOa_titleRow'] {\n  min-height: 32px;\n}\n\n[class~='Dc7zOa_titleCluster'] {\n  letter-spacing: -0.01em;\n  font-weight: 560;\n}\n\n[class~='Dc7zOa_crumb'] {\n  border-radius: var(--lg-r-sm);\n  padding: 2px 6px;\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='Dc7zOa_crumb']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='Dc7zOa_crumbSep'] {\n  color: var(--dsw-alias-label-dimmed);\n}\n\n[class~='Dc7zOa_crumbCurrent'] {\n  color: var(--dsw-alias-label-primary);\n  font-weight: 560;\n}\n\n/* Header controls: floating circular buttons, not flat icons. */\n[class~='Dc7zOa_headerActions'] button,\n[class~='Dc7zOa_headerUtilities'] button,\n[class~='Dc7zOa_headerCorner'] button {\n  border-radius: var(--lg-r-sm);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='Dc7zOa_headerActions'] button:hover,\n[class~='Dc7zOa_headerUtilities'] button:hover,\n[class~='Dc7zOa_headerCorner'] button:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* ---- View tabs (conversation / trajectory) -----------------------------\n   A segmented control: the track is a sunken capsule, the active segment is a\n   lit plate. This is the shipped \"tabs\" row, restyled as one control. */\n[class~='Dc7zOa_tabs'] {\n  display: inline-flex;\n  gap: 2px;\n  padding: 2px;\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0.5px 0 var(--lg-edge-bottom);\n}\n\n[class~='Dc7zOa_tab'] {\n  border-radius: calc(var(--lg-r-md) - 2px);\n  padding: 4px 12px;\n  font-size: 13px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary);\n  transition:\n    background-color var(--lg-t-base) var(--lg-ease-out),\n    color var(--lg-t-base) var(--lg-ease-out),\n    box-shadow var(--lg-t-base) var(--lg-ease-out);\n}\n\n[class~='Dc7zOa_tab']:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='Dc7zOa_tab'][class~='Dc7zOa_tabActive'] {\n  background-color: var(--lg-surface-raised);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 560;\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    0 1px 2px rgba(16, 22, 40, 0.07);\n}\n\n/* ---- Scroll body ------------------------------------------------------- */\n[class~='Dc7zOa_viewArea'] {\n  min-height: 0;\n}\n\n[class~='xz4KEq_scroll'] {\n  padding-block: 20px 8px;\n}\n\n[class~='xz4KEq_column'] {\n  /* Apple's reading measure: a little wider than the shipped 748px default,\n     because the type ramp below runs slightly larger. */\n  max-width: min(var(--dsh-chat-content-width), 100%);\n}\n\n/* ---- User turns --------------------------------------------------------\n   A user message is a raised plate with a tinted edge — the one place in the\n   transcript that carries accent colour, so a scan down the page finds the\n   turns. Assistant output stays on the page with no container at all. */\n[class~='cJsG2q_bubble'] {\n  background-color: var(--dsw-specific-bubble);\n  border-radius: var(--lg-r-lg);\n  border-end-end-radius: var(--lg-r-xs);\n  padding: 10px 15px;\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    0 0 0 0.5px var(--lg-hairline);\n  letter-spacing: -0.003em;\n  line-height: 1.58;\n}\n\n[class~='cJsG2q_userRow'] {\n  gap: 4px;\n  padding-block: 6px;\n}\n\n[class~='cJsG2q_attachmentRow'],\n[class~='cJsG2q_fileCard'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-tint);\n  border: 0.5px solid var(--lg-hairline);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='cJsG2q_fileCard']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* ---- Assistant output --------------------------------------------------\n   No container: the text is the object. Generous leading, a slight optical\n   tighten at the top of each block so headings sit close to what they head. */\n[class~='v5IAXa_root'] {\n  padding-block: 2px;\n}\n\n[class~='v5IAXa_body'] {\n  line-height: 1.68;\n  letter-spacing: -0.004em;\n}\n\n[class~='v5IAXa_body'] > *:first-child {\n  margin-top: 0;\n}\n\n[class~='v5IAXa_body'] > *:last-child {\n  margin-bottom: 0;\n}\n\n/* Assistant action row: hidden until the turn is hovered or focused, so the\n   reading surface stays quiet. */\n[class~='v5IAXa_actions'],\n[class~='xD_KDq_actions'] {\n  opacity: 0;\n  transition: opacity var(--lg-t-base) var(--lg-ease-out);\n}\n\n[class~='v5IAXa_root']:hover [class~='v5IAXa_actions'],\n[class~='v5IAXa_root']:focus-within [class~='v5IAXa_actions'],\n[class~='xD_KDq_actions']:hover,\n[class~='xD_KDq_actions']:focus-within,\n*:hover > [class~='xD_KDq_actions'] {\n  opacity: 1;\n}\n\n[class~='xD_KDq_action'] {\n  border-radius: var(--lg-r-sm);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='xD_KDq_action']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='xD_KDq_endInfo'],\n[class~='xD_KDq_timeStart'],\n[class~='xD_KDq_timeEnd'] {\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-caption);\n}\n\n/* ---- Reasoning ---------------------------------------------------------\n   A quote, not a panel: a hairline on the leading edge, dimmed text, and a\n   summary row that reads like a disclosure. */\n[class~='_3GBCTG_root'] {\n  border-radius: var(--lg-r-md);\n}\n\n[class~='_3GBCTG_summary'] {\n  border-radius: var(--lg-r-sm);\n  padding: 3px 8px;\n  margin-inline-start: -8px;\n  color: var(--dsw-alias-label-tertiary);\n  font-weight: 500;\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='_3GBCTG_summary']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n}\n\n[class~='_3GBCTG_thinkBody'] {\n  border-inline-start: 2px solid var(--lg-hairline);\n  padding-inline-start: 12px;\n  margin-block: 4px 8px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: calc(var(--dsh-content-font-size, 14px) - 1px);\n  line-height: 1.66;\n}\n\n[class~='_3GBCTG_summaryText'] {\n  transition: transform var(--lg-t-base) var(--lg-ease-out);\n}\n\n/* ---- Tool rows ---------------------------------------------------------\n   Tool calls are the \"activity\" layer: quiet capsules that light up on hover\n   and open into a code surface when expanded. */\n[class~='pFy1Ka_root'] {\n  border-radius: var(--lg-r-md);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='pFy1Ka_row'] {\n  border-radius: var(--lg-r-md);\n  padding: 4px 8px;\n  margin-inline: -8px;\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='pFy1Ka_row']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='pFy1Ka_title'] {\n  font-weight: 500;\n  letter-spacing: -0.002em;\n}\n\n[class~='pFy1Ka_leading'] {\n  border-radius: var(--lg-r-sm);\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* Expanded payloads are code surfaces: sunken, inset, monospaced. */\n[class~='pFy1Ka_bodyWrap'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--dsw-alias-markdown-code-block);\n  box-shadow:\n    inset 0 1px 2px rgba(16, 22, 40, 0.05),\n    0 0 0 0.5px var(--lg-hairline);\n  margin-block: 4px 8px;\n}\n\n[class~='pFy1Ka_codeBody'],\n[class~='pFy1Ka_terminalBody'],\n[class~='pFy1Ka_readBody'],\n[class~='pFy1Ka_searchBody'],\n[class~='pFy1Ka_diffBody'],\n[class~='pFy1Ka_webBody'] {\n  font-family: var(--ds-font-family-code);\n  font-size: calc(var(--dsh-content-font-size, 14px) - 1.5px);\n  line-height: 1.62;\n  text-autospace: no-autospace;\n}\n\n[class~='pFy1Ka_ioCard'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-tint);\n  border: 0.5px solid var(--lg-hairline);\n}\n\n[class~='pFy1Ka_ioLabel'] {\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.03em;\n  text-transform: uppercase;\n  color: var(--dsw-alias-label-caption);\n}\n\n[class~='pFy1Ka_diffStat'] {\n  font-variant-numeric: tabular-nums;\n  border-radius: var(--lg-r-pill);\n  padding: 1px 7px;\n  background-color: var(--lg-glass-tint);\n}\n\n[class~='pFy1Ka_diffAdded'] {\n  color: var(--dsw-alias-state-success-primary);\n}\n\n[class~='pFy1Ka_diffRemoved'] {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n[class~='pFy1Ka_errorSummary'] {\n  border-radius: var(--lg-r-md);\n  background-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);\n  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent);\n}\n\n/* ---- Turn process ------------------------------------------------------\n   The collapsed \"worked for Ns\" row. Small caps, quiet, tabular. */\n[class~='_4AI11G_root'] {\n  border-radius: var(--lg-r-sm);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12.5px;\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='_4AI11G_root']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n}\n\n[class~='_4AI11G_durationNumber'] {\n  font-variant-numeric: tabular-nums;\n  font-weight: 560;\n}\n\n[class~='_4AI11G_chevron'] {\n  transition: transform var(--lg-t-base) var(--lg-ease-out);\n}\n\n/* ---- Running indicator -------------------------------------------------\n   A single travelling sheen along the divider, not a spinner: the transcript\n   already moves, so the status should not compete with it. */\n@keyframes lg-sheen {\n  0% {\n    background-position: -60% 0;\n  }\n  100% {\n    background-position: 160% 0;\n  }\n}\n\n[class~='xz4KEq_runningDivider'] {\n  height: 1.5px;\n  border-radius: var(--lg-r-pill);\n  background-image: linear-gradient(\n    90deg,\n    transparent 0%,\n    var(--lg-accent) 42%,\n    color-mix(in srgb, var(--lg-accent) 40%, transparent) 58%,\n    transparent 100%\n  );\n  background-size: 55% 100%;\n  background-repeat: no-repeat;\n  animation: lg-sheen 1.9s var(--lg-ease-in-out) infinite;\n}\n\n[class~='xz4KEq_runningText'] {\n  font-size: 12.5px;\n  color: var(--dsw-alias-label-tertiary);\n  letter-spacing: 0.002em;\n}\n\n[class~='xz4KEq_runningText'] {\n  font-variant-numeric: tabular-nums;\n}\n\n/* ---- Jump to bottom ----------------------------------------------------\n   A floating capsule — L2 glass, since it hovers over moving content. */\n[class~='xz4KEq_toBottom'] {\n  border-radius: var(--lg-r-pill);\n  background-color: var(--lg-glass-2);\n  backdrop-filter: blur(24px) saturate(180%);\n  -webkit-backdrop-filter: blur(24px) saturate(180%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    var(--lg-shadow-2);\n  border: none;\n  transition:\n    transform var(--lg-t-fast) var(--lg-ease-out),\n    box-shadow var(--lg-t-base) var(--lg-ease-out);\n}\n\n[class~='xz4KEq_toBottom']:hover {\n  transform: translateY(-1px);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    var(--lg-shadow-3);\n}\n\n[class~='xz4KEq_toBottom']:active {\n  transform: scale(0.94);\n}\n\n/* ---- Turn navigator rail ----------------------------------------------\n   A floating capsule of thin marks. The app models each turn as a 28x10\n   button translated down a 10px ladder; the button is the HIT AREA and the\n   only thing a reader ever sees is its ::before bar. Painting the button\n   (as an earlier pass did, with --lg-accent on the active turn) turns the\n   hit area into a 28x10 blue slab — the mark you are supposed to read is\n   20x2, so the fill is 14x the size of the thing it was meant to point at.\n   Every state therefore goes on the BAR, and the button stays invisible.\n\n   Scale note: the reference draws 24px ticks because it shows nine turns in\n   430px. This rail packs up to 45 into the same band, so the ladder is 10px\n   and the marks stay 2px hairlines — a density map, not a list. Widening the\n   shell (40px outer) keeps the reference's airiness around a 16px bar. */\n[class~='xpvNua_frame'] {\n  box-sizing: border-box;\n  width: 40px;\n  padding: 3px;\n  border-radius: var(--lg-r-pill);\n  background-color: var(--lg-glass-3);\n  background-image: linear-gradient(\n    145deg,\n    var(--lg-edge-top),\n    transparent 48%\n  );\n  background-blend-mode: soft-light;\n  backdrop-filter: blur(20px) saturate(160%);\n  -webkit-backdrop-filter: blur(20px) saturate(160%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 0 0 0.5px var(--lg-hairline),\n    var(--lg-shadow-2);\n}\n\n/* The hit area is a rectangle of nothing. */\n[class~='xpvNua_mark'] {\n  border-radius: var(--lg-r-sm);\n  background-color: transparent;\n  transition: none;\n}\n\n/* The visible bar. Centred, so scaleX grows both ways from the middle\n   instead of sliding the mark off the rail's inner edge. */\n[class~='xpvNua_mark']::before {\n  left: 50%;\n  right: auto;\n  width: 16px;\n  height: 2px;\n  margin-left: -8px;\n  border-radius: 2px;\n  background-color: var(--lg-rail-tick);\n  transform-origin: center;\n  transform: translateY(-50%) scaleX(0.62);\n  transition:\n    transform var(--lg-t-fast) var(--lg-ease-out),\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    opacity var(--lg-t-fast) var(--lg-ease-out);\n}\n\n/* Hover and keyboard focus preview a turn: the bar lengthens and darkens. */\n[class~='xpvNua_mark']:hover::before,\n[class~='xpvNua_mark']:focus-visible::before {\n  background-color: var(--dsw-alias-label-secondary);\n  transform: translateY(-50%) scaleX(1.15);\n}\n\n[class~='xpvNua_mark']:active::before {\n  transform: translateY(-50%) scaleX(0.9);\n  transition-duration: 0ms;\n}\n\n[class~='xpvNua_markPreview']::before {\n  background-color: var(--dsw-alias-label-secondary);\n  transform: translateY(-50%) scaleX(1.38);\n}\n\n/* Where you are. Full-length bar in primary ink, plus a dot that sits\n   OUTSIDE the capsule — the reference keeps \"current\" and \"previewing\" on\n   two separate signals so browsing never looks like it moved the reader. */\n[class~='xpvNua_markActive'] {\n  background-color: transparent;\n}\n\n[class~='xpvNua_markActive']::before {\n  background-color: var(--dsw-alias-label-primary);\n  transform: translateY(-50%) scaleX(1);\n}\n\n[class~='xpvNua_markActive']::after {\n  content: '';\n  position: absolute;\n  top: 50%;\n  right: -5px;\n  width: 3px;\n  height: 3px;\n  border-radius: 50%;\n  background-color: var(--lg-accent);\n  transform: translateY(-50%);\n}\n\n/* A turn that is still streaming keeps the shipped opacity pulse; it just\n   pulses in the same ink as everything else. */\n[class~='xpvNua_markBusy'] {\n  background-color: transparent;\n}\n\n[class~='xpvNua_markBusy']::before {\n  background-color: var(--dsw-alias-label-secondary);\n  transform: translateY(-50%) scaleX(0.85);\n}\n\n/* A turn whose body has been unloaded from memory is still reachable, just\n   quieter — the bar shortens rather than the whole row fading out, because\n   fading the hit area would lie about where you can click. */\n[class~='xpvNua_markUnloaded'] {\n  opacity: 1;\n}\n\n[class~='xpvNua_markUnloaded']::before {\n  opacity: 0.45;\n  transform: translateY(-50%) scaleX(0.42);\n}\n\n/* The hover preview is a floating card over the transcript: L2 glass. */\n[class~='xpvNua_preview'] {\n  /* The shipped cap is 100px, which fits one prompt line plus three reply\n     lines only at the shipped 10px inset — with a reading inset of 11px and a\n     real line-height the third line was sliced through the middle of its\n     glyphs. 114px is exactly the content height (19.4 + 4 + 63 + 22) plus a\n     little slack, and the variable drives the clamp in the same rule so the\n     card cannot grow past what it can show. */\n  --turn-preview-height: 114px;\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-glass-2);\n  background-image: linear-gradient(\n    145deg,\n    var(--lg-edge-top),\n    transparent 52%\n  );\n  background-blend-mode: soft-light;\n  backdrop-filter: blur(24px) saturate(170%);\n  -webkit-backdrop-filter: blur(24px) saturate(170%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 0 0 0.5px var(--lg-hairline),\n    var(--lg-shadow-3);\n  border: none;\n  padding: 11px 13px;\n}\n\n[class~='xpvNua_previewPrompt'] {\n  color: var(--dsw-alias-label-primary);\n  font-size: 12.5px;\n  font-weight: 560;\n  line-height: 1.55;\n}\n\n[class~='xpvNua_previewResponse'] {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 1.75;\n}\n\n/* The fade at the rail's ends is a MASK on the scroller, not an overlay\n   element. `fadeTop`/`fadeBottom` are added to the SAME div that carries\n   `xpvNua_scroller`, so anything declared on them lands on the scroll\n   container — and `pointer-events: none` there silently disables every mark\n   inside it. The rail still scrolled, still looked right, and could not be\n   clicked or previewed at all. Nothing needs declaring here: the shipped\n   mask-image already does the fading. */\n\n/* ---- Empty / hero states ----------------------------------------------\n   The new-session page. The composer is the object; everything else recedes. */\n[class~='Dc7zOa_root'][data-phase='hero'] [class~='Dc7zOa_scrollBody'] {\n  padding-block: 0;\n}\n\n/* ---- Compaction and context markers ----------------------------------\n   System events, not messages: a centred hairline pill with quiet type. */\n[class~='cJsG2q_compactionRow'],\n[class~='cJsG2q_contextRow'] {\n  color: var(--dsw-alias-label-caption);\n  font-size: 12px;\n}\n\n[class~='cJsG2q_compactionButton'] {\n  border-radius: var(--lg-r-pill);\n  padding: 2px 10px;\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='cJsG2q_compactionButton']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* ---- Errors ----------------------------------------------------------- */\n[class~='cJsG2q_turnErrorRow'] {\n  border-radius: var(--lg-r-md);\n  background-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent);\n  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--dsw-alias-state-error-primary) 28%, transparent);\n  padding: 10px 14px;\n}\n\n[class~='cJsG2q_turnErrorTitle'] {\n  font-weight: 600;\n  letter-spacing: -0.004em;\n}\n\n[class~='cJsG2q_turnErrorCode'] {\n  font-family: var(--ds-font-family-code);\n  font-size: 11.5px;\n  border-radius: var(--lg-r-xs);\n  padding: 1px 6px;\n  background-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  [class~='xz4KEq_runningDivider'] {\n    animation: none;\n    background-image: linear-gradient(90deg, transparent, var(--lg-accent), transparent);\n    background-size: 100% 100%;\n  }\n}\n"},{"id":"dsh-glass-theme/composer.css","css":"/* ==========================================================================\n   Liquid Glass · composer\n   --------------------------------------------------------------------------\n   The composer is the highest-value glass surface in the app: it floats over\n   the transcript, it is always on screen, and it is what the user touches.\n\n   It gets L2 material plus one thing the shipped card does not have — the card\n   lifts on focus. The lift is the feedback that says \"the app is listening\",\n   and it is the only place where a shadow changes on focus.\n   ========================================================================== */\n\n/* ---- The card ---------------------------------------------------------- */\n[class~='RlGAzG_card'] {\n  border-radius: var(--lg-r-panel);\n  background-color: var(--lg-glass-2);\n  backdrop-filter: blur(30px) saturate(190%);\n  -webkit-backdrop-filter: blur(30px) saturate(190%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    var(--lg-shadow-2);\n  border: 0;\n  transition:\n    box-shadow var(--lg-t-base) var(--lg-ease-out),\n    background-color var(--lg-t-base) var(--lg-ease-out),\n    transform var(--lg-t-base) var(--lg-ease-out);\n}\n\n/* Focus lift: the card rises a hair and its ambient shadow widens. Transform is\n   used rather than a margin so the layout never reflows under the caret. */\n[class~='RlGAzG_card']:focus-within {\n  background-color: var(--lg-glass-3);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    var(--lg-shadow-3);\n  transform: translateY(-1px);\n}\n\n/* Disabled / pending: the card stops claiming attention. */\n[class~='RlGAzG_card']:has([class~='RlGAzG_inputDisabled']) {\n  opacity: 0.72;\n}\n\n/* A dashed outline marks \"this composer will create a workspace\" — kept, but\n   drawn inside the material instead of over it. */\n[class~='RlGAzG_cardWorkspaceTrigger']::after {\n  border-radius: var(--lg-r-panel);\n  border-color: var(--lg-hairline-strong);\n  color: var(--lg-hairline-strong);\n  transition: color var(--lg-t-base) var(--lg-ease-out);\n}\n\n[class~='RlGAzG_cardWorkspaceTrigger']:hover::after {\n  color: var(--lg-accent);\n}\n\n/* ---- The text surface -------------------------------------------------- */\n[class~='RlGAzG_input'] {\n  padding: 6px 10px 2px 16px;\n  caret-color: var(--lg-accent);\n  letter-spacing: -0.003em;\n  line-height: 1.6;\n}\n\n[class~='RlGAzG_input']::placeholder,\n[class~='RlGAzG_placeholder'] {\n  color: var(--dsw-alias-label-caption);\n}\n\n/* Hero variant: the new-session page. Larger, centred, and it carries the\n   page — so it gets more air and a slightly wider measure. */\n[class~='RlGAzG_hero'] [class~='RlGAzG_input'] {\n  min-height: 64px;\n  font-size: calc(var(--dsh-content-font-size, 14px) + 1px);\n  line-height: 1.66;\n}\n\n[class~='RlGAzG_hero'] [class~='RlGAzG_card'] {\n  border-radius: var(--lg-r-panel);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    var(--lg-shadow-3);\n}\n\n/* ---- Send -------------------------------------------------------------\n   The one flooded-accent control in the app. It reads as the primary action\n   precisely because nothing else is filled with the accent. */\n[class~='RlGAzG_primary'] {\n  border-radius: var(--lg-r-pill);\n  background-color: var(--lg-accent);\n  color: #fff;\n  box-shadow:\n    inset 0 0.5px 0 rgba(255, 255, 255, 0.4),\n    0 1px 2px rgba(16, 22, 40, 0.18),\n    0 4px 12px -2px color-mix(in srgb, var(--lg-accent) 45%, transparent);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    transform var(--lg-t-fast) var(--lg-ease-out),\n    box-shadow var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='RlGAzG_primary']:hover:not(:disabled) {\n  background-color: var(--lg-accent-strong);\n  box-shadow:\n    inset 0 0.5px 0 rgba(255, 255, 255, 0.45),\n    0 2px 4px rgba(16, 22, 40, 0.2),\n    0 8px 20px -4px color-mix(in srgb, var(--lg-accent) 55%, transparent);\n}\n\n[class~='RlGAzG_primary']:active:not(:disabled) {\n  transform: translateY(-1px) scale(0.94);\n}\n\n[class~='RlGAzG_primary']:disabled {\n  opacity: 0.34;\n  box-shadow: none;\n}\n\n/* Pending: the button becomes a pulsing dot, so the state lives in the same\n   place the action did. */\n[class~='RlGAzG_pending'] {\n  background-color: var(--lg-accent);\n  box-shadow: 0 0 0 4px var(--lg-accent-soft);\n}\n\n@keyframes lg-pulse {\n  from {\n    transform: scale(0.86);\n    opacity: 0.72;\n  }\n  to {\n    transform: scale(1.06);\n    opacity: 1;\n  }\n}\n\n/* ---- Toolbar row ------------------------------------------------------\n   Buttons on the composer are \"tool-bar\" fill: translucent, and they only gain\n   a plate on hover. The send button is excluded because it is the one flooded\n   control in the app and carries its own shape; without the exclusion this\n   descendant rule (0-1-1) outranks the send rule's 0-1-0 and squares it off. */\n[class~='RlGAzG_tools'] button:not([class~='RlGAzG_primary']),\n[class~='RlGAzG_trailing'] button:not([class~='RlGAzG_primary']),\n[class~='RlGAzG_modes'] button:not([class~='RlGAzG_primary']),\n[class~='RlGAzG_add'] {\n  border-radius: var(--lg-r-sm);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out),\n    transform var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='RlGAzG_tools'] button:not([class~='RlGAzG_primary']):hover,\n[class~='RlGAzG_trailing'] button:not([class~='RlGAzG_primary']):hover,\n[class~='RlGAzG_modes'] button:not([class~='RlGAzG_primary']):hover,\n[class~='RlGAzG_add']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='RlGAzG_tools'] button:not([class~='RlGAzG_primary']):active,\n[class~='RlGAzG_trailing'] button:not([class~='RlGAzG_primary']):active {\n  transform: scale(0.95);\n}\n\n/* ---- Dock --------------------------------------------------------------\n   The strip under the card: hints, stats, status. Quiet by design — it is\n   metadata about the composer, not part of it. */\n[class~='RlGAzG_dock'] {\n  gap: 10px;\n  padding-top: 6px;\n  color: var(--dsw-alias-label-caption);\n  font-size: 12px;\n}\n\n/* ---- Notices -----------------------------------------------------------\n   A notice inside the composer is a warning, not a modal: tinted, inset, and\n   it never covers the input. */\n[class~='RlGAzG_notice'],\n[class~='RlGAzG_retry'] {\n  border-radius: var(--lg-r-md);\n  background-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);\n  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--dsw-alias-state-warn-primary) 32%, transparent);\n  padding: 6px 12px;\n  margin-inline: 12px;\n  font-size: 12.5px;\n}\n\n[class~='RlGAzG_overlayAnchor'] {\n  border-radius: var(--lg-r-md);\n}\n\n/* ---- Selectors --------------------------------------------------------\n   Model, permission and reasoning controls share one trigger language: a\n   capsule with a translucent plate, a chevron that rotates in place. */\n[class~='wq12jW_trigger'],\n[class~='dlU_AG_trigger'],\n[class~='mP3ANa_selector'],\n[class~='wq12jW_cell'] {\n  border-radius: var(--lg-r-pill);\n  background-color: var(--dsw-alias-button-tool-bar-fill);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    box-shadow var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='wq12jW_trigger']:hover,\n[class~='dlU_AG_trigger']:hover,\n[class~='mP3ANa_selector']:hover,\n[class~='wq12jW_cell']:hover {\n  background-color: var(--dsw-alias-button-tool-bar-hover);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    0 0 0 0.5px var(--lg-hairline);\n}\n\n[class~='wq12jW_triggerLabel'],\n[class~='wq12jW_cellLabel'] {\n  font-weight: 500;\n  letter-spacing: -0.002em;\n}\n\n[class~='wq12jW_triggerEffort'] {\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* The chevron rotates on open rather than swapping glyphs — one object, two\n   states. */\n[class~='wq12jW_chevron'],\n[class~='dlU_AG_chevron'],\n[class~='mP3ANa_chevron'] {\n  transition: transform var(--lg-t-base) var(--lg-ease-out);\n}\n\n[class~='wq12jW_chevronOpen'],\n[class~='dlU_AG_chevronOpen'] {\n  transform: rotate(180deg);\n}\n\n/* ---- Reasoning effort slider ------------------------------------------ */\n[class~='wq12jW_triggerEffort']::after {\n  content: '';\n  display: inline-block;\n  width: 3px;\n}\n\n/* ---- Attachments ------------------------------------------------------ */\n[class~='RlGAzG_accessory'],\n[class~='RlGAzG_grow'] {\n  border-radius: var(--lg-r-md);\n}\n\n/* ---- Queue dock (messages waiting behind a running turn) --------------- */\n[class~='v1kfCW_panel'],\n[class~='v1kfCW_dock'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-1);\n  backdrop-filter: blur(20px) saturate(175%);\n  -webkit-backdrop-filter: blur(20px) saturate(175%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    var(--lg-shadow-1);\n}\n\n[class~='v1kfCW_pendingRow'],\n[class~='v1kfCW_row'] {\n  border-radius: var(--lg-r-sm);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='v1kfCW_pendingRow']:hover,\n[class~='v1kfCW_row']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='v1kfCW_count'] {\n  font-variant-numeric: tabular-nums;\n  border-radius: var(--lg-r-pill);\n  padding: 0 6px;\n  background-color: var(--lg-accent-soft);\n  color: var(--lg-accent);\n  font-size: 11px;\n  font-weight: 600;\n}\n\n/* ---- Todo panel ------------------------------------------------------- */\n[class~='aSus8q_root'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n}\n\n[class~='aSus8q_item'] {\n  border-radius: var(--lg-r-sm);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='aSus8q_progress'] {\n  border-radius: var(--lg-r-pill);\n  overflow: hidden;\n}\n\n/* ---- Enter-behaviour row ----------------------------------------------\n   This row is a LABEL with a button inside it; the row itself is not a target.\n   Painting a hover plate on it advertised an affordance that does not exist, and\n   because the row spans the full content width the plate ran edge to edge and\n   collided with the scrollbar and the panel's rounded corner. Rows that are not\n   clickable do not highlight. */\n[class~='mP3ANa_row'] {\n  border-radius: var(--lg-r-sm);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  [class~='RlGAzG_card']:focus-within {\n    transform: none;\n  }\n  [class~='RlGAzG_primary']:active:not(:disabled) {\n    transform: none;\n  }\n}\n"},{"id":"dsh-glass-theme/overlays.css","css":"/* ==========================================================================\n   Liquid Glass · overlays\n   --------------------------------------------------------------------------\n   Menus, popovers, dialogs, sheets, toasts.\n\n   Everything in this file is a FLOATING layer, which is exactly the category\n   glass is for. The rules follow one ladder:\n\n     menus / popovers / tooltips   L2  — they appear next to a control and must\n                                        read as lifted off the page\n     sheets / settings / dialogs   L3  — they take over, so legibility wins\n     toasts                        L2  — transient, they float above everything\n\n   Nothing here is glass-on-glass: a popover opened inside a dialog still paints\n   its own L2 fill over the dialog's L3 fill, which is a fill, not a blur, so the\n   stack never exceeds two backdrop layers.\n   ========================================================================== */\n\n/* The material primitive every menu, popover and select shares.\n\n   `_surface_ri079_*` is the anchor host and carries `isolation: isolate`.\n   `_material_ri079_*` is an absolutely-positioned fill layer behind the content\n   (z-index:-1, inset:0) carrying the shipped fill AND the shipped blur.\n\n   Those two facts cancel each other out. `isolation: isolate` makes the surface\n   its own backdrop root, so a z-index:-1 child inside it has NOTHING behind it\n   to sample — the material's `backdrop-filter` is a no-op, and all that is left\n   is a 76%-opaque fill. Over a lit hero or a glass composer that reads as a\n   smudge with the page ghosting through it, not as frosted glass.\n\n   The fix is to split the two jobs back apart, one element each:\n     the SURFACE carries the blur  (it is not isolated from the page, so its\n                                    backdrop is the real content behind it)\n     the MATERIAL carries the fill (exactly one fill, so the two do not stack\n                                    into an over-dark slab)\n   The fill is also raised well above the shipped 76%: a popover is opaque\n   enough that whatever it covers never shows through as text. Vibrancy is a\n   property of the EDGE and the blur, not of letting the page read through. */\n[class*='_material_ri079'] {\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    inset 0 0 0 0.5px var(--lg-hairline);\n}\n\n/* The darwin backing plate exists to keep macOS vibrancy from showing through a\n   menu. With our own material painted on top it is redundant, and it is opaque,\n   so it would defeat the blur on the platform that has the most to gain. */\n[class*='_backing_ri079'] {\n  display: none;\n}\n\n/* ---- Menu surface ------------------------------------------------------ */\n[class~='Z9Jnlq_menu'],\n[class~='wq12jW_menu'],\n[class*='dsh-menu-skeleton'],\n[class~='Z9Jnlq_viewport'],\n[class~='Z9Jnlq_menu'][class*='_surface_ri079'] {\n  border-radius: var(--lg-r-lg);\n  /* The fill lives on `_material_ri079`; a second one here would double it. */\n  background-color: transparent;\n  backdrop-filter: blur(28px) saturate(185%);\n  -webkit-backdrop-filter: blur(28px) saturate(185%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    var(--lg-shadow-3);\n  border: none;\n  padding: 5px;\n  /* The scroll fade at the bottom of a menu must fade to the menu's own fill,\n     not to a flat colour, or it reads as a seam. */\n  --lg-menu-fade: var(--dsw-menu-surface-fill);\n}\n\n[class~='Z9Jnlq_menu']::after {\n  background-image: linear-gradient(to bottom, transparent, var(--lg-menu-fade));\n  border-end-start-radius: var(--lg-r-lg);\n  border-end-end-radius: var(--lg-r-lg);\n}\n\n/* Menu items: rounded rows, hover plate, and a check that slides in. */\n[class~='Z9Jnlq_item'],\n[class~='wq12jW_option'],\n[class~='wq12jW_cell'] {\n  border-radius: var(--lg-r-md);\n  min-height: 32px;\n  padding: 5px 9px;\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='Z9Jnlq_item']:hover,\n[class~='wq12jW_option']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* Active item: accent plate. This is the menu equivalent of the travelling\n   selection pill — the pointer moves, the plate follows it. */\n[class~='Z9Jnlq_item'][class~='Z9Jnlq_active'],\n[class~='wq12jW_option'][class~='wq12jW_optionActive'],\n[class~='wq12jW_option'][class~='wq12jW_selected'] {\n  background-color: var(--lg-accent-soft);\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='wq12jW_check'] {\n  color: var(--lg-accent);\n  transition:\n    opacity var(--lg-t-fast) var(--lg-ease-out),\n    transform var(--lg-t-base) var(--lg-ease-spring);\n}\n\n[class~='wq12jW_option']:not([class~='wq12jW_selected']) [class~='wq12jW_check'] {\n  opacity: 0;\n  transform: scale(0.7);\n}\n\n[class~='Z9Jnlq_groupTitle'],\n[class~='Z9Jnlq_sectionTitle'] {\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.035em;\n  text-transform: uppercase;\n  color: var(--dsw-alias-label-caption);\n  padding: 8px 9px 4px;\n}\n\n[class~='Z9Jnlq_itemName'],\n[class~='wq12jW_modelName'] {\n  font-weight: 500;\n  letter-spacing: -0.002em;\n}\n\n[class~='Z9Jnlq_itemDescription'],\n[class~='wq12jW_optionCopy'],\n[class~='wq12jW_status'],\n[class~='wq12jW_warning'] {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n}\n\n[class~='wq12jW_warning'] {\n  color: var(--dsw-alias-state-warn-primary);\n}\n\n/* Menu search field: sunken, so it reads as an input inside the floating card. */\n[class~='wq12jW_search'],\n[class~='wq12jW_searchRow'] {\n  border-radius: var(--lg-r-md);\n  background-color: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);\n  box-shadow: inset 0 1px 2px rgba(16, 22, 40, 0.05);\n}\n\n[class~='wq12jW_searchRow']:focus-within {\n  box-shadow:\n    inset 0 1px 2px rgba(16, 22, 40, 0.05),\n    0 0 0 3px var(--lg-accent-ring);\n}\n\n[class~='wq12jW_searchClear'] {\n  border-radius: var(--lg-r-pill);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='wq12jW_searchClear']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover-solid);\n}\n\n/* Breadcrumb drill-down inside the menu. */\n[class~='Z9Jnlq_crumb'] {\n  border-radius: var(--lg-r-sm);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='Z9Jnlq_crumb']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='Z9Jnlq_crumbCurrent'] {\n  font-weight: 560;\n}\n\n/* ---- Settings / sheet --------------------------------------------------\n   The largest glass surface in the app. It is L3 because it replaces the page\n   while open, and every pixel of text on it must stay readable. */\n[class~='wCInkW_mask'] {\n  background-color: color-mix(in srgb, var(--lg-ambient-floor) 55%, transparent);\n  backdrop-filter: blur(6px) saturate(120%);\n  -webkit-backdrop-filter: blur(6px) saturate(120%);\n}\n\n[class~='wCInkW_panel'] {\n  border-radius: var(--lg-r-panel);\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(34px) saturate(190%);\n  -webkit-backdrop-filter: blur(34px) saturate(190%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    var(--lg-shadow-3);\n  /* The panel scales in from 0.96 with a slight upward travel — materialising,\n     not fading. */\n  transform-origin: 50% 40%;\n  animation: lg-materialize var(--lg-t-slow) var(--lg-ease-spring) both;\n}\n\n@keyframes lg-materialize {\n  from {\n    opacity: 0;\n    transform: scale(0.965) translateY(8px);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n\n[class~='wCInkW_nav'] {\n  background-color: transparent;\n  border-inline-end: 0.5px solid var(--lg-hairline);\n  padding-top: 18px;\n  gap: 14px;\n}\n\n[class~='wCInkW_navTitle'] {\n  font-size: 17px;\n  font-weight: 640;\n  letter-spacing: -0.016em;\n  padding-inline: 14px;\n}\n\n[class~='wCInkW_navCell'] {\n  border-radius: var(--lg-r-md);\n  height: 36px;\n  padding: 7px 12px;\n  font-weight: 450;\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='wCInkW_navCell']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='wCInkW_navCell'][class~='wCInkW_active'] {\n  /* Same HIG rule as the sidebar: a source list shows selection by filling the\n     row and inverting its label, not by tinting it. */\n  background-color: var(--lg-selection-fill);\n  box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.22);\n  color: var(--lg-selection-label);\n  font-weight: 560;\n}\n\n[class~='wCInkW_navCell'][class~='wCInkW_active']:hover {\n  background-color: var(--lg-selection-fill-hover);\n}\n\n[class~='wCInkW_navCell'][class~='wCInkW_active'] [class~='wCInkW_navIcon'] {\n  color: var(--lg-selection-label);\n}\n\n[class~='wCInkW_header'] {\n  height: 52px;\n  padding: 16px 12px 6px 18px;\n}\n\n[class~='wCInkW_close'] {\n  border-radius: var(--lg-r-sm);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    transform var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='wCInkW_close']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='wCInkW_close']:active {\n  transform: scale(0.9);\n}\n\n[class~='wCInkW_panel'] [class~='wCInkW_content'] {\n  /* The content column used to paint its own 72% floor on top of the panel's\n     material. Two stacked rectangles with no gap between them means the inner one\n     ends exactly where the panel's rounded corner begins — a straight edge cutting\n     across a 30px radius, and a fill that stops dead against the scrollbar.\n     The panel already IS the surface: at 78% fill plus a 34px blur, text over it\n     is fully legible. So the content adds nothing and the panel stays one object. */\n  background-color: transparent;\n}\n\n/* ---- Generic dialog ---------------------------------------------------\n   Feedback, sign-in, host prompts, directory pickers: all use the same base. */\n[class~='FDoH3G_dialog'],\n[class~='uKWioa_dialog'],\n[class~='tDn_6q_dialog'],\n[class~='Fv-y6W_dialog'],\n[class~='Fv-y6W_createDialog'],\n[class~='Yf9_hG_dialog'],\n[class~='d99neW_dialog'],\n[class~='KZf9OG_dialog'],\n[class~='XPF3fq_mask'] > * {\n  border-radius: var(--lg-r-panel);\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(32px) saturate(190%);\n  -webkit-backdrop-filter: blur(32px) saturate(190%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    var(--lg-shadow-3);\n  border: none;\n  animation: lg-materialize var(--lg-t-base) var(--lg-ease-out) both;\n}\n\n[class~='uKWioa_header'],\n[class~='Fv-y6W_header'],\n[class~='d99neW_dialogBody'],\n[class~='Yf9_hG_body'] {\n  padding-inline: 20px;\n}\n\n[class~='uKWioa_title'],\n[class~='Fv-y6W_title'],\n[class~='Yf9_hG_title'],\n[class~='d99neW_detailTitle'] {\n  font-size: 17px;\n  font-weight: 640;\n  letter-spacing: -0.016em;\n}\n\n[class~='Fv-y6W_footerBar'],\n[class~='uKWioa_actions'] {\n  border-top: 0.5px solid var(--lg-hairline);\n  padding-top: 12px;\n}\n\n/* ---- Toasts ------------------------------------------------------------\n   A toast is a capsule that floats above the app. It must never block the\n   composer, so it enters from the bottom with travel, not from the top.\n\n   `_toast_l6cvn_*` is the real toast element; the `_toastSuccess` /\n   `_toastError` classes that look related belong to the shortcuts settings\n   rows and only set a text colour, so they are not part of this rule. */\n[class*='_toast_l6cvn'] {\n  border-radius: var(--lg-r-pill);\n  background-color: var(--lg-glass-2);\n  backdrop-filter: blur(24px) saturate(185%);\n  -webkit-backdrop-filter: blur(24px) saturate(185%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    var(--lg-shadow-2);\n  border: none;\n  animation: lg-toast-in var(--lg-t-slow) var(--lg-ease-spring) both;\n}\n\n@keyframes lg-toast-in {\n  from {\n    opacity: 0;\n    transform: translateY(12px) scale(0.96);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n\n[class*='_toast_l6cvn'] [class*='_icon_l6cvn'] {\n  color: var(--dsw-alias-state-warn-primary);\n}\n\n[class*='_toast_l6cvn'] [class*='_success_l6cvn'] {\n  color: var(--dsw-alias-state-success-primary);\n}\n\n/* ---- Tooltips ----------------------------------------------------------\n   A tooltip is a one-line label, so it gets a tight inset and a small radius.\n   The turn rail's hover PREVIEW also carries role=\"tooltip\" (it is described\n   by aria-describedby), but it is a two-line reading card that brings its own\n   material in conversation.css. Without the exclusion this block reached\n   across sheets and cropped it to a 9px radius with a 4px inset. */\n[role='tooltip']:not([class~='xpvNua_preview']) {\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-glass-2);\n  backdrop-filter: blur(20px) saturate(180%);\n  -webkit-backdrop-filter: blur(20px) saturate(180%);\n  color: var(--dsw-alias-label-primary);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    var(--lg-shadow-2);\n  border: none;\n  font-size: 12px;\n  padding: 4px 9px;\n  letter-spacing: -0.002em;\n}\n\n/* ---- Approval / plan review ------------------------------------------\n   These interrupt, so they get the modal material and a wider measure. */\n[class~='LqhxcW_card'],\n[class~='UWr8ca_panelButton'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(30px) saturate(185%);\n  -webkit-backdrop-filter: blur(30px) saturate(185%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    var(--lg-shadow-2);\n  border: none;\n}\n\n/* ---- Drop overlay (file drag) ----------------------------------------- */\n[class~='XPF3fq_mask'] {\n  background-color: color-mix(in srgb, var(--lg-accent) 10%, transparent);\n  backdrop-filter: blur(3px);\n  -webkit-backdrop-filter: blur(3px);\n}\n\n[class~='XPF3fq_title'] {\n  font-size: 15px;\n  font-weight: 600;\n  letter-spacing: -0.01em;\n  color: var(--lg-accent);\n}\n\n/* ---- Command palette / popup select ---------------------------------- */\n[class~='EhuiKa_viewport'],\n[class~='EhuiKa_card'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-glass-2);\n  backdrop-filter: blur(28px) saturate(185%);\n  -webkit-backdrop-filter: blur(28px) saturate(185%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    var(--lg-shadow-3);\n  border: none;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  [class~='wCInkW_panel'],\n  [class~='FDoH3G_dialog'],\n  [class~='uKWioa_dialog'],\n  [class*='_toast_l6cvn'] {\n    animation: none;\n  }\n}\n"},{"id":"dsh-glass-theme/model.css","css":"/* ==========================================================================\n   Liquid Glass · model picker\n   --------------------------------------------------------------------------\n   The composer's model picker is rendered by dsh-codex-subscription, not by the\n   app, and the app's own picker (wq12jW_*) has the same shape. Both show a flat\n   list of 40 model names under six provider headings, with no icon, no\n   description and no indication of what anything costs. That is the surface the\n   user asked to redraw.\n\n   The data (icons, one-liners, the peak schedule) lives in src/catalog.js and is\n   injected as attributes and sibling nodes by src/client.js. This sheet is\n   therefore only the appearance of what the decorator adds plus the shape of\n   the list it lives in — every rule below keys on either a plugin class or a\n   `data-lg-*` hook the decorator owns, never on a shipped hash.\n\n   Why a dedicated sheet rather than more of overlays.css: the menu material\n   there is shared with every popover in the app, and the picker needs a wider\n   footprint, a scroll region with a sticky header, and a two-line row. Changing\n   the shared material to get those would move every menu in the product.\n   ========================================================================== */\n\n/* ---- Provider tints ------------------------------------------------------\n   Decorative, deliberately desaturated: these are monograms, not logos, and a\n   row of saturated brand colours in a 240px menu reads as a paint chart. Each\n   is a light/dark pair because a 12% wash that is right on white is invisible\n   on #161a22. */\nbody {\n  --lg-tint-deepseek: #4d6bfe;\n  --lg-tint-workbuddy: #7c5cff;\n  --lg-tint-zai: #2f9e6e;\n  --lg-tint-gemini: #3b7ded;\n  --lg-tint-grok: #4a5568;\n  --lg-tint-openai: #10a37f;\n  --lg-tint-kimi: #8b5cf6;\n  --lg-tint-minimax: #e0693a;\n  --lg-tint-step: #0ea5b7;\n  --lg-tint-hunyuan: #2563eb;\n  --lg-tint-router: #64748b;\n  --lg-tint-neutral: #6b7280;\n  --lg-tint-peak: #d97706;\n  --lg-tint-off: #0f9d58;\n}\n\nbody[data-ds-dark-theme] {\n  --lg-tint-deepseek: #7f95ff;\n  --lg-tint-workbuddy: #a78bfa;\n  --lg-tint-zai: #4ecb8f;\n  --lg-tint-gemini: #6ea0f5;\n  --lg-tint-grok: #94a3b8;\n  --lg-tint-openai: #2ecc9b;\n  --lg-tint-kimi: #b294ff;\n  --lg-tint-minimax: #f08a5d;\n  --lg-tint-step: #35c9da;\n  --lg-tint-hunyuan: #6b9bff;\n  --lg-tint-router: #94a3b8;\n  --lg-tint-neutral: #9aa3af;\n  --lg-tint-peak: #f0a63a;\n  --lg-tint-off: #35c98a;\n}\n\n/* ==========================================================================\n   Menu shell\n   --------------------------------------------------------------------------\n   The plugin fixes the pane at min 240 / max 420 wide and 360 tall. A two-line\n   row with an icon needs more than 240 to avoid truncating every description,\n   so the floor is raised — but only the floor: on a narrow window the viewport\n   terms still win, because they are what keeps the menu on screen.\n   ========================================================================== */\n[class~='codexModelSelectMenu'] {\n  /* The shipped min() chain is re-stated with a wider floor. Both terms stay:\n     dropping the 100vw guard would let the menu overflow a 320px window. */\n  min-width: min(304px, 100vw - 32px);\n  max-height: min(460px, 100vh - 96px);\n  padding: 0;\n  border-radius: var(--lg-r-lg);\n  /* The rim. A floating layer over an opaque page earns its float from its own\n     edge; without this the menu is a flat rectangle that happens to hover. */\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    inset 0 0 0 0.5px var(--lg-hairline),\n    var(--lg-shadow-3);\n}\n\n/* The list region scrolls; the injected header must not. The plugin already\n   declares `flex: 1 1 auto; min-height: 0` here, so this only adds the inset\n   that keeps rows off the rounded edge. */\n[class~='codexModelSelectMenu'] > [class*='codexModelSelectGroups'] {\n  padding: 2px 6px 6px;\n  scroll-padding-block: 34px;\n}\n\n/* ---- Injected header ----------------------------------------------------\n   Appended as the menu's first child and lifted with `order`, so React's own\n   children keep their indices. Two rows: quick providers, then the price chip. */\n[class~='codexModelSelectMenu'] > [data-lg-header] {\n  order: -1;\n  flex: none;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  padding: 8px 8px 7px;\n  /* A hairline, not a fill: the header sits on the menu's own material, and a\n     second fill here would band against it. */\n  box-shadow: inset 0 -0.5px 0 var(--lg-hairline);\n}\n\n/* ---- Quick providers ----------------------------------------------------\n   A row of provider chips. Selecting one filters the list to that provider and\n   pressing it again clears the filter; the pressed state is the app's own\n   accent, so it reads as a selection rather than as a button that lit up.\n\n   A three-column grid, not a wrapping flex row: the six providers otherwise\n   break 5+1 across two lines, which reads as an accident and costs the same\n   vertical space a balanced 3+3 does. Equal cells also make every chip the\n   same target size, so the row scans as one control rather than six. */\n[data-lg-quick] {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 4px;\n}\n\n[data-lg-chip] {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  min-width: 0;\n  height: 24px;\n  padding: 0 8px 0 4px;\n  border: none;\n  border-radius: var(--lg-r-pill);\n  background-color: transparent;\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 12px;\n  line-height: 16px;\n  cursor: pointer;\n  /* The chip's whole job is to say \"these are the providers\"; a border alone\n     does that at rest, and the press is what needs the motion. */\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out),\n    box-shadow var(--lg-t-fast) var(--lg-ease-out);\n}\n\n/* A long provider name must not widen its cell: the grid owns the width. */\n[data-lg-chip] > span:not([data-lg-mark]) {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n[data-lg-chip]:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n[data-lg-chip][data-lg-on] {\n  background-color: var(--lg-accent-soft);\n  box-shadow: inset 0 0 0 0.5px var(--lg-accent-ring);\n  color: var(--lg-accent);\n}\n\n/* The monogram. `--lg-tint-*` is the provider's hue; the wash is derived from\n   it so one variable per provider is enough. */\n[data-lg-chip] > [data-lg-mark] {\n  display: grid;\n  place-items: center;\n  width: 16px;\n  height: 16px;\n  border-radius: var(--lg-r-xs);\n  background-color: color-mix(in srgb, var(--lg-tint, var(--lg-tint-neutral)) 16%, transparent);\n  color: var(--lg-tint, var(--lg-tint-neutral));\n  font-size: 8px;\n  font-weight: 640;\n  letter-spacing: 0.02em;\n  line-height: 1;\n}\n\n[data-lg-chip][data-lg-tone='deepseek'] > [data-lg-mark] { --lg-tint: var(--lg-tint-deepseek); }\n[data-lg-chip][data-lg-tone='workbuddy'] > [data-lg-mark] { --lg-tint: var(--lg-tint-workbuddy); }\n[data-lg-chip][data-lg-tone='zai'] > [data-lg-mark] { --lg-tint: var(--lg-tint-zai); }\n[data-lg-chip][data-lg-tone='gemini'] > [data-lg-mark] { --lg-tint: var(--lg-tint-gemini); }\n[data-lg-chip][data-lg-tone='grok'] > [data-lg-mark] { --lg-tint: var(--lg-tint-grok); }\n[data-lg-chip][data-lg-tone='openai'] > [data-lg-mark] { --lg-tint: var(--lg-tint-openai); }\n\n/* ---- Price chip ---------------------------------------------------------\n   Only rendered when the list actually contains a first-party DeepSeek row,\n   because that is the only provider whose published schedule this reflects.\n   Showing it over a workbuddy list would attach a real number to the wrong\n   billing scheme. */\n[data-lg-price] {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 0 2px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 16px;\n  font-variant-numeric: tabular-nums;\n}\n\n[data-lg-price][hidden] {\n  display: none;\n}\n\n[data-lg-state] {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  padding: 0 6px;\n  height: 18px;\n  border-radius: var(--lg-r-pill);\n  background-color: color-mix(in srgb, var(--lg-tint-peak) 14%, transparent);\n  color: var(--lg-tint-peak);\n  font-weight: 560;\n}\n\n[data-lg-state][data-lg-tone='off'] {\n  background-color: color-mix(in srgb, var(--lg-tint-off) 14%, transparent);\n  color: var(--lg-tint-off);\n}\n\n/* The dot is what makes the chip legible at a glance: colour alone is not a\n   signal for a colour-blind reader, and the label is two characters wide. */\n[data-lg-state]::before {\n  content: '';\n  width: 5px;\n  height: 5px;\n  border-radius: var(--lg-r-pill);\n  background-color: currentColor;\n}\n\n/* Why the window is open. On a weekend or a 法定节假日 the off-peak chip would\n   otherwise sit beside a clock that says 10:00 on a weekday, and a reader who\n   knows the schedule would think the chip was broken. The reason is a suffix,\n   not a second chip: it answers the question the state raises, it does not ask\n   for attention of its own. */\n[data-lg-state][data-lg-reason]::after {\n  content: attr(data-lg-reason);\n  color: var(--dsw-alias-label-caption);\n  font-weight: 500;\n}\n\n[data-lg-factor] {\n  color: var(--dsw-alias-label-secondary);\n  font-weight: 560;\n}\n\n[data-lg-sep] {\n  color: var(--dsw-alias-separator-primary);\n}\n\n[data-lg-next] {\n  margin-inline-start: auto;\n  color: var(--dsw-alias-label-caption);\n}\n\n/* ==========================================================================\n   Provider groups\n   ========================================================================== */\n\n/* The plugin renders headings through the app's menu-group primitive\n   (`_heading_121p8_19`), which is 11px tertiary and sticky. With an icon and a\n   collapse control the heading becomes a real header row, so it needs height\n   and a background that matches the menu's fill — sticky content that is\n   transparent lets rows scroll through it. */\n[class*='codexModelSelectGroups'] [data-menu-group-heading] {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  height: 26px;\n  margin: 2px 0 1px;\n  padding: 0 6px;\n  border-radius: var(--lg-r-sm);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.02em;\n  line-height: 16px;\n  background-color: var(--dsw-menu-surface-fill);\n  backdrop-filter: blur(12px);\n  -webkit-backdrop-filter: blur(12px);\n}\n\n[class*='codexModelSelectGroups'] [data-menu-group-heading] > [data-lg-mark] {\n  display: grid;\n  place-items: center;\n  width: 15px;\n  height: 15px;\n  border-radius: var(--lg-r-xs);\n  background-color: color-mix(in srgb, var(--lg-tint, var(--lg-tint-neutral)) 16%, transparent);\n  color: var(--lg-tint, var(--lg-tint-neutral));\n  font-size: 8px;\n  font-weight: 640;\n  line-height: 1;\n}\n\n[data-menu-group-heading] > [data-lg-mark][data-lg-tone='deepseek'] { --lg-tint: var(--lg-tint-deepseek); }\n[data-menu-group-heading] > [data-lg-mark][data-lg-tone='workbuddy'] { --lg-tint: var(--lg-tint-workbuddy); }\n[data-menu-group-heading] > [data-lg-mark][data-lg-tone='zai'] { --lg-tint: var(--lg-tint-zai); }\n[data-menu-group-heading] > [data-lg-mark][data-lg-tone='gemini'] { --lg-tint: var(--lg-tint-gemini); }\n[data-menu-group-heading] > [data-lg-mark][data-lg-tone='grok'] { --lg-tint: var(--lg-tint-grok); }\n[data-menu-group-heading] > [data-lg-mark][data-lg-tone='openai'] { --lg-tint: var(--lg-tint-openai); }\n\n[data-menu-group-heading] > [data-lg-note] {\n  color: var(--dsw-alias-label-caption);\n  font-size: 10px;\n  font-weight: 400;\n  letter-spacing: 0;\n  opacity: 0.85;\n}\n\n/* Collapse control. Hidden until hover so six groups do not present six\n   chevrons as their most repeated element; it is still focusable, and\n   `:focus-visible` reveals it for keyboard users. */\n[data-menu-group-heading] > [data-lg-toggle] {\n  display: grid;\n  place-items: center;\n  width: 16px;\n  height: 16px;\n  margin-inline-start: auto;\n  padding: 0;\n  border: none;\n  border-radius: var(--lg-r-xs);\n  background: none;\n  color: var(--dsw-alias-label-caption);\n  cursor: pointer;\n  opacity: 0;\n  transition:\n    opacity var(--lg-t-fast) var(--lg-ease-out),\n    background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[data-menu-group-heading] > [data-lg-toggle] svg {\n  width: 12px;\n  height: 12px;\n  transition: transform var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[data-menu-group-heading]:hover > [data-lg-toggle],\n[data-menu-group-heading] > [data-lg-toggle]:focus-visible {\n  opacity: 1;\n}\n\n[data-menu-group-heading] > [data-lg-toggle]:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[data-menu-group][data-lg-collapsed] > [data-menu-group-heading] > [data-lg-toggle] svg {\n  transform: rotate(-90deg);\n}\n\n/* Collapsed: the heading stays, the rows go. `display: none` on the option\n   siblings rather than on a wrapper, because the plugin's rows are direct\n   children of the section. */\n[data-menu-group][data-lg-collapsed] > [role='menuitemradio'] {\n  display: none;\n}\n\n/* Filtered out by a quick-provider chip. */\n[data-menu-group][data-lg-filtered] {\n  display: none;\n}\n\n/* ==========================================================================\n   Model rows\n   --------------------------------------------------------------------------\n   The plugin's row is a single 34px line: name, optional description, check.\n   With an icon and a description it becomes a 46px two-line row, which is the\n   shape the reference used and the only shape in which a description is\n   readable rather than decorative.\n   ========================================================================== */\n[class*='codexModelSelectGroups'] [class~='codexModelSelectOption'] {\n  gap: 8px;\n  min-height: 40px;\n  padding: 5px 8px 5px 7px;\n  border-radius: var(--lg-r-md);\n}\n\n/* Family monogram. Sized to the two-line row, not to the first line, so the\n   block reads as a unit. */\n[class*='codexModelSelectGroups'] [class~='codexModelSelectOption'] > [data-lg-mark] {\n  display: grid;\n  place-items: center;\n  flex: none;\n  width: 22px;\n  height: 22px;\n  border-radius: var(--lg-r-sm);\n  background-color: color-mix(in srgb, var(--lg-tint, var(--lg-tint-neutral)) 14%, transparent);\n  color: var(--lg-tint, var(--lg-tint-neutral));\n  font-size: 9px;\n  font-weight: 640;\n  letter-spacing: 0.02em;\n  line-height: 1;\n}\n\n[class~='codexModelSelectOption'] > [data-lg-mark][data-lg-tone='deepseek'] { --lg-tint: var(--lg-tint-deepseek); }\n[class~='codexModelSelectOption'] > [data-lg-mark][data-lg-tone='openai'] { --lg-tint: var(--lg-tint-openai); }\n[class~='codexModelSelectOption'] > [data-lg-mark][data-lg-tone='gemini'] { --lg-tint: var(--lg-tint-gemini); }\n[class~='codexModelSelectOption'] > [data-lg-mark][data-lg-tone='grok'] { --lg-tint: var(--lg-tint-grok); }\n[class~='codexModelSelectOption'] > [data-lg-mark][data-lg-tone='kimi'] { --lg-tint: var(--lg-tint-kimi); }\n[class~='codexModelSelectOption'] > [data-lg-mark][data-lg-tone='zai'] { --lg-tint: var(--lg-tint-zai); }\n[class~='codexModelSelectOption'] > [data-lg-mark][data-lg-tone='minimax'] { --lg-tint: var(--lg-tint-minimax); }\n[class~='codexModelSelectOption'] > [data-lg-mark][data-lg-tone='step'] { --lg-tint: var(--lg-tint-step); }\n[class~='codexModelSelectOption'] > [data-lg-mark][data-lg-tone='hunyuan'] { --lg-tint: var(--lg-tint-hunyuan); }\n[class~='codexModelSelectOption'] > [data-lg-mark][data-lg-tone='router'] { --lg-tint: var(--lg-tint-router); }\n[class~='codexModelSelectOption'] > [data-lg-mark][data-lg-tone='workbuddy'] { --lg-tint: var(--lg-tint-workbuddy); }\n\n/* The multiplier the workbuddy provider folds into the label (\"Fast · x0.34\").\n   Split out, it becomes a secondary fact instead of part of the name — which is\n   the difference between a list of names and a list of prices.\n\n   It lives INSIDE the name span, and the name stays a block: the app's own\n   `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` still does the\n   truncating, and the badge is inline-block so it sits on the text baseline\n   instead of stretching to the column width (which is what a flex/column parent\n   does to a bare sibling span). */\n[data-lg-mult] {\n  display: inline-block;\n  margin-inline-start: 5px;\n  padding: 0 5px;\n  border-radius: var(--lg-r-xs);\n  background-color: var(--dsw-alias-bg-module-platform);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  font-weight: 500;\n  line-height: 15px;\n  font-variant-numeric: tabular-nums;\n  vertical-align: 1px;\n}\n\n/* The description reuses the plugin's own `OptionDescription` class, so this\n   only tunes the measure: 16px leading on 12px text inside a 40px row leaves\n   the two lines touching. */\n[class*='codexModelSelectGroups'] [class~='codexModelSelectOptionDescription'] {\n  margin-top: 1px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11.5px;\n  line-height: 15px;\n}\n\n/* A selected row: the app's check plus a tinted plate, so the current model is\n   findable in a 40-row list without hunting for a 14px tick. */\n[class*='codexModelSelectGroups'] [class~='codexModelSelectOption'][aria-checked='true'] {\n  background-color: var(--lg-accent-soft);\n}\n\n[class~='codexModelSelectOption'][aria-checked='true'] [class*='codexModelSelectOptionName'] {\n  font-weight: 600;\n  color: var(--lg-accent);\n}\n\n[class~='codexModelSelectOption'][aria-checked='true'] > [data-lg-mark] {\n  background-color: color-mix(in srgb, var(--lg-tint, var(--lg-tint-neutral)) 22%, transparent);\n}\n\n/* ==========================================================================\n   Trigger\n   --------------------------------------------------------------------------\n   The composer's own control. Only the geometry changes: it is one of the most\n   frequently hit targets in the product and the shipped 28px height is below\n   the 32px the rest of the composer uses.\n   ========================================================================== */\n[class~='codexModelSelectTrigger'] {\n  height: 30px;\n  padding-inline: 8px;\n  border-radius: var(--lg-r-sm);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='codexModelSelectTrigger'][aria-expanded='true'] {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* The monogram in front of the trigger label, so the composer shows which\n   family is active without the menu being open. */\n[class~='codexModelSelectTrigger'] > [data-lg-mark] {\n  display: grid;\n  place-items: center;\n  flex: none;\n  width: 18px;\n  height: 18px;\n  border-radius: var(--lg-r-xs);\n  background-color: color-mix(in srgb, var(--lg-tint, var(--lg-tint-neutral)) 16%, transparent);\n  color: var(--lg-tint, var(--lg-tint-neutral));\n  font-size: 8px;\n  font-weight: 640;\n  line-height: 1;\n}\n\n/* ==========================================================================\n   Narrow windows\n   --------------------------------------------------------------------------\n   At 320–420px the menu is the whole screen width; the quick-provider row would\n   wrap to three lines and push the list out of reach, so it scrolls sideways\n   instead. */\n@media (max-width: 480px) {\n  [data-lg-quick] {\n    flex-wrap: nowrap;\n    overflow-x: auto;\n    scrollbar-width: none;\n  }\n\n  [data-lg-quick]::-webkit-scrollbar {\n    display: none;\n  }\n\n  [data-lg-chip] {\n    flex: none;\n  }\n}\n\n/* Pointer-coarse devices have no hover, so a hover-revealed control would be\n   permanently invisible. The collapse chevron is the only one here. */\n@media (hover: none) {\n  [data-menu-group-heading] > [data-lg-toggle] {\n    opacity: 1;\n  }\n}\n"},{"id":"dsh-glass-theme/picker.css","css":"/* ==========================================================================\n   Model picker — the ported seat\n   --------------------------------------------------------------------------\n   The composer's model seat is no longer decorated: it is rendered by this\n   skin, so every class here is ours (`lg-picker-*`) and nothing has to fight a\n   third-party component for width, row height or grouping.\n\n   The material is the reason this sheet exists. The reference draws an opaque\n   card; the request was the same picker in translucent frosted glass, so the\n   card is an L3 surface — the fill carries legibility, the blur carries depth,\n   and the rim is what makes it read as a floating layer rather than a panel\n   that happens to hover.\n\n   The host trigger is hidden rather than removed: the app still owns it, still\n   focuses it for shortcuts, and would re-render it if we deleted the node.\n   ========================================================================== */\n\n[data-lg-picker-host] {\n  display: none !important;\n}\n\n.lg-picker {\n  display: inline-flex;\n  align-items: center;\n  min-width: 0;\n  position: relative;\n}\n\n/* ---- Trigger ------------------------------------------------------------\n   Quiet by default. A model name is a setting, not a call to action; it earns\n   a surface only on hover, when the reader is about to change it. */\n.lg-picker-trigger {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n  max-width: min(340px, 44cqw);\n  height: 28px;\n  padding: 0 7px 0 6px;\n  border: 0;\n  border-radius: var(--lg-r-sm);\n  background-color: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 20px;\n  cursor: pointer;\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n.lg-picker-trigger:hover,\n.lg-picker-trigger[aria-expanded='true'] {\n  background-color: var(--lg-hairline);\n  color: var(--dsw-alias-label-primary);\n}\n\n.lg-picker-trigger:focus-visible {\n  outline: 2px solid var(--lg-accent-ring);\n  outline-offset: 1px;\n}\n\n/* The monogram is a TILE, not a badge: it has to read at 16px beside a name,\n   so it carries its own quiet fill instead of relying on the glyph's weight. */\n.lg-picker-lockup {\n  display: inline-grid;\n  place-items: center;\n  flex: none;\n  min-width: 18px;\n  height: 18px;\n  padding: 0 3px;\n  border-radius: var(--lg-r-xs);\n  background-color: var(--lg-hairline);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 9px;\n  font-weight: 650;\n  letter-spacing: 0.02em;\n  line-height: 1;\n}\n\n.lg-picker-label {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.lg-picker-effort {\n  flex: none;\n  color: var(--dsw-alias-label-caption);\n  font-weight: 400;\n}\n\n.lg-picker-chevron {\n  display: inline-flex;\n  flex: none;\n  color: var(--dsw-alias-label-caption);\n  transition: transform 140ms var(--lg-ease-out);\n}\n\n.lg-picker-trigger[aria-expanded='true'] .lg-picker-chevron {\n  transform: rotate(180deg);\n}\n\n/* ---- Card ---------------------------------------------------------------\n   L3: a large floating surface. At this size an L1 fill lets the 180%-saturated\n   blur's chroma take over the panel, so the fill is heavy and the saturation is\n   dialled back — vibrancy belongs to the rim and the blur, the fill buys\n   legibility. */\n.lg-picker-card {\n  position: fixed;\n  z-index: 1100;\n  display: flex;\n  flex-direction: column;\n  width: min(360px, calc(100vw - 32px));\n  max-height: min(520px, calc(100vh - 96px));\n  padding: 0;\n  border: none;\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-glass-3);\n  background-image: linear-gradient(145deg, var(--lg-edge-top), transparent 46%);\n  background-blend-mode: soft-light;\n  -webkit-backdrop-filter: blur(30px) saturate(165%);\n  backdrop-filter: blur(30px) saturate(165%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    inset 0 0 0 0.5px var(--lg-hairline),\n    var(--lg-shadow-3);\n  color: var(--dsw-alias-label-primary);\n  overflow: hidden;\n  animation: lg-picker-in 160ms var(--lg-ease-out) both;\n}\n\n@keyframes lg-picker-in {\n  from {\n    opacity: 0;\n    transform: translateY(4px) scale(0.985);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0) scale(1);\n  }\n}\n\n/* ---- Search + price -----------------------------------------------------\n   One row, two facts: what you are filtering by, and what the model costs\n   right now. The hairline separates the header from the list without a second\n   fill, which would band against the card. */\n.lg-picker-search {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex: none;\n  padding: 8px 9px 7px;\n  box-shadow: inset 0 -0.5px 0 var(--lg-hairline);\n}\n\n.lg-picker-search input {\n  flex: 1 1 auto;\n  min-width: 0;\n  height: 24px;\n  padding: 0 7px;\n  border: none;\n  border-radius: var(--lg-r-xs);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 12px;\n  outline: none;\n}\n\n.lg-picker-search input::placeholder {\n  color: var(--dsw-alias-label-caption);\n}\n\n.lg-picker-search input:focus-visible {\n  box-shadow:\n    inset 0 0 0 0.5px var(--lg-hairline-strong),\n    0 0 0 2px var(--lg-accent-ring);\n}\n\n/* The price chip. Colour alone is not a signal — the dot carries the state for\n   a reader who cannot separate the two hues, and the reason is appended so an\n   off-peak reading on a holiday explains itself. */\n.lg-picker-badge {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  flex: none;\n  height: 22px;\n  padding: 0 7px;\n  border-radius: var(--lg-r-pill);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  font-weight: 500;\n  line-height: 1;\n  white-space: nowrap;\n}\n\n.lg-picker-badge-dot {\n  width: 5px;\n  height: 5px;\n  flex: none;\n  border-radius: 50%;\n  background-color: currentColor;\n}\n\n.lg-picker-badge b {\n  font-weight: 650;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.lg-picker-badge em {\n  color: var(--dsw-alias-label-caption);\n  font-style: normal;\n}\n\n.lg-picker-badge[data-lg-tone='off'] {\n  color: #1f9d55;\n}\n\n.lg-picker-badge[data-lg-tone='off'] b {\n  color: #17804a;\n}\n\nbody[data-ds-dark-theme] .lg-picker-badge[data-lg-tone='off'] {\n  color: #4fd08a;\n}\n\nbody[data-ds-dark-theme] .lg-picker-badge[data-lg-tone='off'] b {\n  color: #6ee0a2;\n}\n\n/* ---- List ---------------------------------------------------------------\n   Rows are FLAT. A plate per row would redraw the group once per row; the\n   section heading is the grouping, and the hover wash is the only fill a row\n   ever earns. */\n/* The foot sits outside the scroll area so the two entries stay reachable no\n   matter how long the list gets. A hairline, not a plate: it is a boundary\n   between two kinds of row, not a third surface. */\n.lg-picker-foot {\n  flex: none;\n  padding: 4px 6px 6px;\n  border-top: 0.5px solid var(--lg-hairline);\n}\n\n.lg-picker-body {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow-y: auto;\n  overscroll-behavior: contain;\n  padding: 5px 6px 7px;\n  scroll-padding-block: 26px;\n}\n\n.lg-picker-section {\n  position: relative;\n}\n\n.lg-picker-section + .lg-picker-section {\n  margin-top: 2px;\n}\n\n/* Sticky, but with the card's own fill so rows do not show through it. It does\n   NOT carry its own backdrop-filter: the card is already a backdrop root, so a\n   second blur inside it would sample the card's own blurred pixels — glass on\n   glass, which reads as mud. The fill alone is enough at 78%. A heading is a\n   LABEL here: the list under it is always open, so it has no hover, no chevron\n   and no press state to promise. */\n.lg-picker-heading {\n  position: sticky;\n  top: 0;\n  z-index: 1;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  box-sizing: border-box;\n  padding: 5px 6px 3px;\n  background-color: var(--lg-glass-3);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  font-weight: 560;\n  line-height: 16px;\n  letter-spacing: 0.01em;\n}\n\n.lg-picker-headingName {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.lg-picker-mark {\n  display: inline-grid;\n  place-items: center;\n  flex: none;\n  min-width: 16px;\n  height: 16px;\n  padding: 0 3px;\n  border-radius: var(--lg-r-xs);\n  background-color: var(--lg-hairline);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 8px;\n  font-weight: 650;\n  letter-spacing: 0.02em;\n  line-height: 1;\n}\n\n.lg-picker-count {\n  color: var(--dsw-alias-label-caption);\n  font-variant-numeric: tabular-nums;\n  font-size: 10px;\n}\n\n.lg-picker-effort-row {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  box-sizing: border-box;\n  width: 100%;\n  min-height: 32px;\n  margin-top: 2px;\n  padding: 5px 7px;\n  border: 0;\n  border-radius: var(--lg-r-sm);\n  background-color: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 12px;\n  text-align: start;\n  cursor: pointer;\n}\n\n.lg-picker-effort-row:hover {\n  background-color: var(--lg-hairline);\n}\n\n.lg-picker-effort-row:focus-visible {\n  outline: 2px solid var(--lg-accent-ring);\n  outline-offset: -2px;\n}\n\n.lg-picker-effort-value {\n  margin-inline-start: auto;\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n.lg-picker-effort-row .lg-picker-chevron {\n  flex: none;\n  margin-inline-start: 0;\n}\n\n/* The door to the rest of the catalog. It is the same kind of row as the\n   effort row above it — same height, same hover, same chevron — because both\n   are \"one more level\" entries at the foot of a list. */\n.lg-picker-more {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  box-sizing: border-box;\n  width: 100%;\n  min-height: 32px;\n  margin-top: 2px;\n  padding: 5px 7px;\n  border: 0;\n  border-radius: var(--lg-r-sm);\n  background-color: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 12px;\n  text-align: start;\n  cursor: pointer;\n}\n\n.lg-picker-more .lg-picker-count {\n  margin-inline-start: auto;\n}\n\n.lg-picker-more .lg-picker-chevron {\n  flex: none;\n  margin-inline-start: 0;\n}\n\n.lg-picker-more:hover {\n  background-color: var(--lg-hairline);\n}\n\n.lg-picker-more:focus-visible {\n  outline: 2px solid var(--lg-accent-ring);\n  outline-offset: -2px;\n}\n\n/* The second card is the same material as the first: it is the same list with a\n   wider filter, so giving it its own look would claim it was a different place. */\n.lg-picker-card-all {\n  z-index: 1101;\n}\n\n.lg-picker-effort-pane {\n  display: flex;\n  flex-direction: column;\n  gap: 1px;\n  min-height: 0;\n  padding: 4px 6px 6px;\n  overflow-y: auto;\n}\n\n.lg-picker-back {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  margin: 2px 0 4px;\n  padding: 4px 6px 4px 2px;\n  border: 0;\n  border-radius: var(--lg-r-sm);\n  background-color: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  font: inherit;\n  font-size: 11px;\n  font-weight: 560;\n  letter-spacing: 0.01em;\n  text-align: start;\n  cursor: pointer;\n}\n\n.lg-picker-back:hover {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.lg-picker-back:focus-visible {\n  outline: 2px solid var(--lg-accent-ring);\n  outline-offset: -2px;\n}\n\n.lg-picker-effort-option {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  box-sizing: border-box;\n  width: 100%;\n  min-height: 34px;\n  padding: 5px 7px;\n  border: 0;\n  border-radius: var(--lg-r-sm);\n  background-color: transparent;\n  color: inherit;\n  font: inherit;\n  text-align: start;\n  cursor: pointer;\n}\n\n.lg-picker-effort-option:hover,\n.lg-picker-effort-option:focus-visible {\n  background-color: var(--lg-hairline);\n}\n\n.lg-picker-effort-option:focus-visible {\n  outline: 2px solid var(--lg-accent-ring);\n  outline-offset: -2px;\n}\n\n.lg-picker-effort-option[aria-checked='true'] .lg-picker-name {\n  color: var(--lg-accent);\n  font-weight: 560;\n}\n\n.lg-picker-option {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  width: 100%;\n  min-height: 34px;\n  padding: 5px 7px;\n  border: none;\n  border-radius: var(--lg-r-sm);\n  background-color: transparent;\n  color: inherit;\n  text-align: left;\n  cursor: pointer;\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n.lg-picker-option:hover,\n.lg-picker-option:focus-visible {\n  background-color: var(--lg-hairline);\n}\n\n.lg-picker-option:focus-visible {\n  outline: 2px solid var(--lg-accent-ring);\n  outline-offset: -2px;\n}\n\n.lg-picker-copy {\n  display: flex;\n  flex: 1 1 auto;\n  flex-direction: column;\n  gap: 1px;\n  min-width: 0;\n}\n\n.lg-picker-name {\n  overflow: hidden;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  font-weight: 450;\n  line-height: 18px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* The reseller price ratio rides on the name but is a different kind of fact,\n   so it is set back: smaller, tabular, and in a quiet plate. It must stay\n   inline — a block here would drop onto its own line and read as a subtitle. */\n.lg-picker-mult {\n  display: inline-block;\n  margin-inline-start: 6px;\n  padding: 0 4px;\n  border-radius: var(--lg-r-xs);\n  background-color: var(--lg-hairline);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  font-weight: 500;\n  line-height: 15px;\n  font-variant-numeric: tabular-nums;\n  vertical-align: 1px;\n}\n\n.lg-picker-desc {\n  overflow: hidden;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11.5px;\n  line-height: 16px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* The check is a state, not a control: it keeps its 14px box so rows do not\n   shift as the selection moves. */\n.lg-picker-check {\n  display: grid;\n  place-items: center;\n  flex: 0 0 14px;\n  color: var(--lg-accent);\n  font-size: 11px;\n  font-weight: 700;\n}\n\n.lg-picker-option[aria-checked='true'] .lg-picker-name {\n  color: var(--lg-accent);\n  font-weight: 560;\n}\n\n.lg-picker-empty {\n  padding: 18px 12px 22px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  text-align: center;\n}\n\n/* ---- Reduced-motion / transparency / contrast answers -------------------- */\n@media (prefers-reduced-motion: reduce) {\n  .lg-picker-card {\n    animation: none;\n  }\n  .lg-picker-chevron,\n  .lg-picker-option {\n    transition: none;\n  }\n}\n\n@media (prefers-reduced-transparency: reduce) {\n  .lg-picker-card,\n  .lg-picker-heading {\n    background-color: var(--lg-surface-raised);\n    -webkit-backdrop-filter: none;\n    backdrop-filter: none;\n  }\n}\n\n@media (prefers-contrast: more) {\n  .lg-picker-card,\n  .lg-picker-heading {\n    background-color: var(--lg-surface-raised);\n    box-shadow: inset 0 0 0 1px var(--dsw-alias-label-primary);\n  }\n}\n\n@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {\n  .lg-picker-card,\n  .lg-picker-heading {\n    background-color: var(--lg-surface-raised);\n  }\n}\n\n@media (max-width: 480px) {\n  .lg-picker-card {\n    width: min(300px, calc(100vw - 24px));\n  }\n}\n"},{"id":"dsh-glass-theme/stats.css","css":"/* ===========================================================================\n   Merged usage panel — the composer's one readout.\n\n   The host splits \"how much have I spent\" across three surfaces: a context\n   ring, an activity pill and a usage pill, each opening its own popover. Three\n   popovers that each know a third of the answer make the reader do the joining.\n   This is one pill and one panel with three sections, ported from the reference\n   implementation and drawn in this skin's material.\n\n   The host pills are hidden by `html[data-lg-stats]`, which src/stats.js sets\n   in the same tick it mounts the seat — the swap is atomic, so a reader never\n   sees both readouts or neither.\n   =========================================================================== */\n\nhtml[data-lg-stats] [data-composer-stat] {\n  display: none;\n}\n\n/* The host's own context meter sits in the same dock as a SIBLING of the stat\n   pills, not inside them, so hiding `[data-composer-stat]` alone leaves a\n   fourth readout behind. */\nhtml[data-lg-stats] [class~='_2WTFBq_root'] {\n  display: none;\n}\n\n.lg-stats {\n  display: inline-flex;\n  min-width: 0;\n  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n}\n\n.lg-stats-trigger {\n  display: inline-flex;\n  align-items: center;\n  gap: 10px;\n  box-sizing: border-box;\n  max-width: 100%;\n  padding: 1px 8px;\n  border: 0;\n  border-radius: var(--lg-r-pill);\n  background-color: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  font: inherit;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n  cursor: pointer;\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out), color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n.lg-stats-trigger:hover,\n.lg-stats-trigger[aria-expanded='true'] {\n  background-color: var(--lg-hairline);\n  color: var(--dsw-alias-label-secondary);\n}\n\n.lg-stats-trigger:focus-visible {\n  outline: 2px solid var(--lg-accent-ring);\n  outline-offset: 1px;\n}\n\n/* Each reading is its own group; the gap between groups is wider than the gap\n   inside one, so three facts read as three facts and not as one run of text. */\n.lg-stats-seg {\n  display: inline-flex;\n  align-items: center;\n  gap: 3px;\n  flex: none;\n}\n\n.lg-stats-seg em {\n  color: var(--dsw-alias-label-caption);\n  font-style: normal;\n}\n\n.lg-stats-ring {\n  display: inline-flex;\n  flex: none;\n  margin-inline-end: 1px;\n}\n\n/* The panel is the same L3 material as the model card: this is a floating layer\n   over the transcript, which is exactly what glass is for. */\n.lg-stats-panel {\n  position: fixed;\n  z-index: 1100;\n  box-sizing: border-box;\n  width: min(300px, 100vw - 24px);\n  padding: 14px 15px 15px;\n  border: 0;\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-glass-3);\n  background-image: linear-gradient(145deg, var(--lg-edge-top), transparent 46%);\n  background-blend-mode: soft-light;\n  backdrop-filter: blur(30px) saturate(165%);\n  -webkit-backdrop-filter: blur(30px) saturate(165%);\n  box-shadow: inset 0 0.5px 0 var(--lg-edge-top), inset 0 -0.5px 0 var(--lg-edge-bottom), inset 0 0 0 0.5px var(--lg-hairline), var(--lg-shadow-3);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 19px;\n  cursor: default;\n  animation: lg-stats-in 150ms var(--lg-ease-out);\n}\n\n@keyframes lg-stats-in {\n  from {\n    opacity: 0;\n    transform: translateY(3px) scale(0.99);\n  }\n}\n\n.lg-stats-head {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n}\n\n.lg-stats-headline {\n  display: inline-flex;\n  align-items: baseline;\n  gap: 5px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11.5px;\n  font-weight: 500;\n}\n\n/* The percentage is the headline, so it outranks its own label. */\n.lg-stats-headline b {\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  font-weight: 590;\n  font-variant-numeric: tabular-nums;\n}\n\n.lg-stats-figures {\n  margin-inline-start: auto;\n  color: var(--dsw-alias-label-primary);\n  font-size: 14px;\n  font-weight: 590;\n  font-variant-numeric: tabular-nums;\n  letter-spacing: -0.01em;\n}\n\n/* A groove, not a plate: the bar shows a proportion, and a filled track would\n   read as a second surface stacked on the panel. */\n.lg-stats-bar {\n  display: flex;\n  gap: 1px;\n  height: 5px;\n  margin: 9px 0 11px;\n  border-radius: var(--lg-r-pill);\n  background-color: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);\n  box-shadow: inset 0 0.5px 0 color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);\n  overflow: hidden;\n}\n\n.lg-stats-segment {\n  flex: none;\n  min-width: 2px;\n  height: 100%;\n  border-radius: 1.5px;\n  transition: flex-grow var(--lg-t-slow) var(--lg-ease-out);\n}\n\n.lg-stats-rows {\n  display: flex;\n  flex-direction: column;\n  gap: 1px;\n}\n\n.lg-stats-row {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  padding: 2px 0;\n}\n\n.lg-stats-swatch {\n  flex: none;\n  width: 7px;\n  height: 7px;\n  border-radius: 2px;\n  translate: 0 -1px;\n}\n\n.lg-stats-label {\n  min-width: 0;\n  overflow: hidden;\n  color: var(--dsw-alias-label-tertiary);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.lg-stats-value {\n  margin-inline-start: auto;\n  color: var(--dsw-alias-label-primary);\n  font-variant-numeric: tabular-nums;\n}\n\n/* Sections are separated by a rule, not by a box: the panel is already one\n   surface, and a card inside it would nest grouping inside grouping. */\n.lg-stats-section {\n  display: flex;\n  flex-direction: column;\n  gap: 7px;\n  margin-top: 11px;\n  padding-top: 10px;\n  border-top: 1px solid var(--lg-hairline);\n}\n\n.lg-stats-section-title {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.04em;\n}\n\n/* Two columns: four readings that each pair a small label with a large number.\n   A single column would make the panel twice as tall to say the same thing. */\n.lg-stats-grid {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 7px 10px;\n  min-width: 0;\n}\n\n.lg-stats-item {\n  display: flex;\n  flex-direction: column;\n  gap: 1px;\n  min-width: 0;\n}\n\n.lg-stats-item .lg-stats-label {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11.5px;\n  line-height: 16px;\n}\n\n.lg-stats-item .lg-stats-value {\n  margin-inline-start: 0;\n  color: var(--dsw-alias-label-primary);\n  font-size: 14px;\n  font-weight: 500;\n  line-height: 20px;\n  font-variant-numeric: tabular-nums;\n}\n\n/* ---- the answers the platform asks for ---------------------------------- */\n\n@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {\n  .lg-stats-panel {\n    background-color: var(--lg-glass-solid);\n  }\n}\n\n@media (prefers-reduced-transparency: reduce) {\n  .lg-stats-panel {\n    background-color: var(--lg-glass-solid);\n    background-image: none;\n    backdrop-filter: none;\n    -webkit-backdrop-filter: none;\n  }\n}\n\n@media (prefers-contrast: more) {\n  .lg-stats-panel {\n    background-color: var(--lg-glass-solid);\n    box-shadow: inset 0 0 0 1px var(--dsw-alias-label-primary);\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .lg-stats-panel {\n    animation: none;\n  }\n\n  .lg-stats-segment,\n  .lg-stats-trigger {\n    transition: none;\n  }\n}\n"},{"id":"dsh-glass-theme/settings-section.css","css":"/* ===========================================================================\n   Settings — Liquid Glass section.\n\n   This is a host settings PAGE, not a dialog: it lives inside the settings\n   shell's content column, so it must speak the shell's own reading measure and\n   must NOT paint a card of its own. The shell already gives every section a\n   564px column with 24px of side padding; a second box inside that column would\n   be a box inside a box, which is the collision this skin has been fixing all\n   along.\n\n   So: rows are separated by a hairline, the switch is the only raised object,\n   and the page has no surface at all.\n   =========================================================================== */\n\n.lg-settings {\n  padding: 18px 0 40px;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  line-height: 20px;\n}\n\n.lg-settings-title {\n  margin: 0 0 6px;\n  color: var(--dsw-alias-label-primary);\n  font-size: 17px;\n  font-weight: 640;\n  letter-spacing: -0.01em;\n  line-height: 24px;\n}\n\n.lg-settings-intro {\n  margin: 0 0 18px;\n  max-width: 46em;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12.5px;\n  line-height: 20px;\n}\n\n.lg-settings-empty {\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12.5px;\n}\n\n/* A grouped list, HIG style: one hairline between rows, no plate per row. */\n.lg-settings-list {\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n.lg-settings-row {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 11px 0;\n}\n\n.lg-settings-row + .lg-settings-row {\n  border-top: 0.5px solid var(--lg-hairline);\n}\n\n/* A switch that cannot change anything looks like a switch that is broken. It\n   recedes instead, and the row's own label keeps full contrast: the provider is\n   still worth reading, only its control is unavailable. */\n.lg-settings-row[data-blocked='true'] .lg-settings-switch {\n  opacity: 0.4;\n}\n\n.lg-settings-row[data-blocked='true'] .lg-settings-switch:hover .lg-settings-knob {\n  transform: none;\n}\n\n.lg-settings-count {\n  margin: 10px 0 0;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11.5px;\n  line-height: 17px;\n  font-variant-numeric: tabular-nums;\n}\n\n.lg-settings-copy {\n  display: flex;\n  flex-direction: column;\n  gap: 1px;\n  min-width: 0;\n}\n\n.lg-settings-name {\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 19px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.lg-settings-note {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11.5px;\n  line-height: 17px;\n  font-variant-numeric: tabular-nums;\n}\n\n/* The switch: a 32x18 track with a 14px knob. iOS proportions, not the 88x20\n   toolbar control — this is a settings row, and a settings row's switch is the\n   smallest object that can be hit. */\n.lg-settings-switch {\n  position: relative;\n  flex: none;\n  box-sizing: border-box;\n  width: 32px;\n  height: 18px;\n  margin-inline-start: auto;\n  padding: 0;\n  border: 0;\n  border-radius: var(--lg-r-pill);\n  background-color: color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent);\n  cursor: pointer;\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n.lg-settings-switch[data-on='true'] {\n  background-color: var(--lg-accent);\n}\n\n.lg-settings-switch:focus-visible {\n  outline: 2px solid var(--lg-accent-ring);\n  outline-offset: 2px;\n}\n\n.lg-settings-knob {\n  position: absolute;\n  top: 2px;\n  left: 2px;\n  width: 14px;\n  height: 14px;\n  border-radius: var(--lg-r-pill);\n  background-color: #fff;\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28), 0 0 0 0.5px rgba(0, 0, 0, 0.06);\n  transition: transform var(--lg-t-fast) var(--lg-ease-out);\n}\n\n.lg-settings-switch[data-on='true'] .lg-settings-knob {\n  transform: translateX(14px);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .lg-settings-switch,\n  .lg-settings-knob {\n    transition: none;\n  }\n}\n\n@media (prefers-contrast: more) {\n  .lg-settings-switch {\n    box-shadow: inset 0 0 0 1px var(--dsw-alias-label-primary);\n  }\n}\n"},{"id":"dsh-glass-theme/settings.css","css":"/* ==========================================================================\n   Liquid Glass · settings & full pages\n   --------------------------------------------------------------------------\n   Everything that is a PAGE rather than a floating layer: the settings tabs,\n   the plugin manager, the market, usage, jobs, schedules, goals, skills,\n   subagents, trajectory.\n\n   These pages are opaque. They are read for minutes at a time, so the material\n   language stops at the sheet that hosts them — inside, the design is the\n   Apple settings idiom: grouped inset cards, hairline separators, a single\n   accent for state, and generous vertical rhythm.\n   ========================================================================== */\n\n/* ---- The shared page idiom --------------------------------------------\n   A page is a scrolling column with a fixed max measure. Sections are grouped\n   cards on the sunken floor, not floating panels.\n\n   `box-sizing: border-box` is load-bearing, not tidying. The shipped section\n   rule is `width: 100%` and the element is content-box, so any horizontal\n   padding this rule adds makes the border box WIDER than its scroller. The\n   overflow then resolves `margin-inline: auto` to a negative value and pushes\n   the right edge of every row out of the panel — visible as content running\n   into the panel's edge with a scrollbar at the bottom of the settings sheet.\n\n   The settings scroller already insets its children by 24px\n   (`wCInkW_options { padding: 0 24px 24px }`), so the section repeats only the\n   VERTICAL rhythm. Adding the same 24px again here would double the left inset\n   while the right one stayed clipped — the asymmetry is the tell. */\n[class~='S0jZwq_page'] {\n  box-sizing: border-box;\n  max-width: 780px;\n  margin-inline: auto;\n  padding: 20px 24px 48px;\n}\n\n/* The plugin manager is a browsing page, not a settings page: its body is a\n   two-column grid of cards. At the settings measure (780px) each card was\n   ~350px inside a 1144px column, so the page read as a narrow ribbon floating\n   in empty space. A card grid earns width the way text does not. */\n[class~='fO69Vq_page'] {\n  box-sizing: border-box;\n  max-width: 1000px;\n  margin-inline: auto;\n  /* The shipped page reserves 28px of top padding on its head instead of on\n     itself, so the page adds none — otherwise the title drops 20px for no\n     reason. */\n  padding: 0 clamp(24px, 3vw, 40px) 48px;\n}\n\n[class~='fO69Vq_page'] > * {\n  max-width: 100%;\n}\n\n[class~='wCInkW_panel'] [class~='zZnCHW_section'] {\n  box-sizing: border-box;\n  max-width: 780px;\n  margin-inline: auto;\n  padding: 20px 0 48px;\n}\n\n/* Every section the settings sheet can host, whatever package owns it: a\n   section is a block in a 24px-inset column, never a box that overflows it. */\n[class~='wCInkW_options'] > * {\n  box-sizing: border-box;\n  max-width: 100%;\n}\n\n[class~='fO69Vq_pageHead'],\n[class~='fO69Vq_pageHeading'] {\n  gap: 6px;\n}\n\n[class~='fO69Vq_pageTitle'] {\n  font-size: 21px;\n  font-weight: 660;\n  letter-spacing: -0.022em;\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='fO69Vq_pageIntro'] {\n  font-size: 13.5px;\n  line-height: 1.6;\n  color: var(--dsw-alias-label-tertiary);\n  max-width: 62ch;\n}\n\n/* ---- Tabs -------------------------------------------------------------\n   Two different tab idioms live in settings, and they need different shapes:\n\n   `amjGKq_tab` (plugin settings) is an UNDERLINE tab — a text button over a\n   hairline with a 2px active bar drawn by the shipped `::after`. It becomes a\n   segmented pill instead, so the bar is removed and the plate does the work.\n\n   `fO69Vq_pageTabList` (plugin manager) is a real tablist whose children carry\n   no class of their own, so they are addressed structurally. */\n[class~='amjGKq_tabs'] {\n  display: inline-flex;\n  align-items: center;\n  gap: 2px;\n  /* Hug the two tabs instead of stretching: a segmented control spanning a\n     600px panel with 120px of content reads as an empty bar, not a control.\n     `fit-content` is needed because the parent is a stretching flex column. */\n  width: fit-content;\n  padding: 2px;\n  border-bottom: 0;\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0.5px 0 var(--lg-edge-bottom);\n  margin-top: 0;\n  margin-bottom: 16px;\n}\n\n[class~='amjGKq_tab'] {\n  border-radius: calc(var(--lg-r-md) - 2px);\n  padding: 5px 13px;\n  font-size: 13px;\n  line-height: 20px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary);\n  transition:\n    background-color var(--lg-t-base) var(--lg-ease-out),\n    color var(--lg-t-base) var(--lg-ease-out),\n    box-shadow var(--lg-t-base) var(--lg-ease-out);\n}\n\n/* The shipped active bar is a bottom-edge rule belonging to the underline\n   idiom. In a segmented control it reads as a stray tick under one pill.\n   It is emitted by `.amjGKq_tab[data-active=true]:after` and by\n   `.amjGKq_tab:focus-visible:after`, i.e. specificity 0-2-1, so a bare\n   `::after` reset (0-1-1) loses. Both source selectors are matched here. */\n[class~='amjGKq_tab'][data-active='true']::after,\n[class~='amjGKq_tab']:focus-visible::after {\n  content: none;\n}\n\n[class~='amjGKq_tab']:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='amjGKq_tab'][data-active='true'] {\n  background-color: var(--lg-surface-raised);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 560;\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    0 1px 2px rgba(16, 22, 40, 0.07);\n}\n\n[class~='fO69Vq_pageTabList'] {\n  display: inline-flex;\n  gap: 2px;\n  padding: 2px;\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0.5px 0 var(--lg-edge-bottom);\n}\n\n[class~='fO69Vq_pageTabList'] > * {\n  border: 0;\n  border-radius: calc(var(--lg-r-md) - 2px);\n  background-color: transparent;\n  padding: 6px 14px;\n  font-size: 13px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary);\n  transition:\n    background-color var(--lg-t-base) var(--lg-ease-out),\n    color var(--lg-t-base) var(--lg-ease-out);\n}\n\n[class~='fO69Vq_pageTabList'] > *[data-active='true'] {\n  background-color: var(--lg-surface-raised);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 560;\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    0 1px 2px rgba(16, 22, 40, 0.07);\n}\n\n/* ---- Grouped card lists ----------------------------------------------\n   The core Apple settings shape: one rounded container per group, rows inside\n   it separated by a hairline that stops short of the leading edge.\n\n   `amjGKq_section` is deliberately NOT in this list. It is the PAGE section\n   that owns the title, the intro, the tabs and the panel — a card around all of\n   that nests a card inside a card AND, because the shipped section carries no\n   padding, drags the title into the top-left corner where `overflow: hidden`\n   plus an 18px radius shaves the first glyph. A page is not a card; only the\n   groups inside it are.\n\n   `RotMhW_group` is not one either: its body is a two-column GRID OF CARDS, so\n   a surface here would be a card holding cards. Its header row is styled on its\n   own below. */\n[class~='fO69Vq_group'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-surface-raised);\n  box-shadow:\n    inset 0 0 0 0.5px var(--lg-hairline),\n    0 1px 2px rgba(16, 22, 40, 0.04);\n  overflow: hidden;\n  margin-bottom: 18px;\n  /* A card must hold its contents off its own edge. The shipped cards bleed\n     themselves by -8px (`fO69Vq_card { margin: 0 -8px }`) so that their hover\n     plate reaches the page edge — correct on a bare page, wrong inside a card,\n     where it drove the plugin icon flush against the border. The group owns the\n     inset now, and the cards stop bleeding. */\n  padding: 10px 12px 6px;\n}\n\n[class~='fO69Vq_cards'] > [class~='fO69Vq_card'] {\n  margin-inline: 0;\n}\n\n[class~='amjGKq_section'],\n[class~='RotMhW_group'] {\n  box-sizing: border-box;\n  max-width: 100%;\n  gap: 14px;\n  margin-bottom: 22px;\n}\n\n/* The settings scroller pads its sides but not its top (`wCInkW_options\n   { padding: 0 24px 24px }`), because each page section is expected to bring\n   its own leading space. `zZnCHW_section` does; this one does not, so the\n   heading started flush under the header rule. */\n[class~='amjGKq_section'] {\n  padding: 18px 0 40px;\n  margin-bottom: 0;\n}\n\n[class~='RotMhW_group'] {\n  gap: 10px;\n}\n\n/* The inventory group header is a section header, not a row inside a card: it\n   names what the grid below it is. It therefore sits on the page floor with the\n   same 12/640/uppercase voice as every other group label. */\n[class~='RotMhW_groupTitleRow'] {\n  padding: 0 2px;\n  min-height: 30px;\n}\n\n[class~='fO69Vq_groupHead'],\n[class~='fO69Vq_sectionHead'] {\n  padding: 14px 16px 8px;\n}\n\n[class~='fO69Vq_groupTitle'],\n[class~='RotMhW_groupTitle'],\n[class~='fO69Vq_sectionTitle'] {\n  font-size: 12px;\n  font-weight: 640;\n  letter-spacing: 0.035em;\n  text-transform: uppercase;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* The page heading is a heading, not a group label: it names the whole pane, so\n   it keeps sentence case at reading size. Uppercasing it made the settings page\n   announce itself in the same voice as a list subhead. */\n[class~='amjGKq_heading'] {\n  font-size: 17px;\n  font-weight: 640;\n  letter-spacing: -0.016em;\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='fO69Vq_groupInfo'],\n[class~='RotMhW_hint'] {\n  font-size: 12.5px;\n  line-height: 1.55;\n  color: var(--dsw-alias-label-caption);\n}\n\n[class~='amjGKq_intro'] {\n  font-size: 13px;\n  line-height: 1.55;\n  color: var(--dsw-alias-label-tertiary);\n  max-width: 62ch;\n}\n\n/* ---- Rows ------------------------------------------------------------ */\n[class~='fO69Vq_row'],\n[class~='RotMhW_card'],\n[class~='amjGKq_cards'] > * {\n  border-radius: var(--lg-r-md);\n  background-color: transparent;\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    transform var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='fO69Vq_row']:hover,\n[class~='RotMhW_card']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='fO69Vq_row']:active {\n  transform: scale(0.995);\n}\n\n[class~='fO69Vq_rowMain'],\n[class~='RotMhW_cardMainRow'] {\n  gap: 12px;\n  padding: 11px 14px;\n  min-height: 52px;\n}\n\n[class~='fO69Vq_rowModule'],\n[class~='RotMhW_cardTitle'],\n[class~='fO69Vq_cardTitle'],\n[class~='fO69Vq_detailName'] {\n  font-size: 14px;\n  font-weight: 560;\n  letter-spacing: -0.006em;\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='fO69Vq_rowId'],\n[class~='RotMhW_cardDescription'],\n[class~='fO69Vq_cardDesc'],\n[class~='fO69Vq_rowLine'] {\n  font-size: 12.5px;\n  line-height: 1.5;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n[class~='fO69Vq_rowId'] {\n  font-family: var(--ds-font-family-code);\n  font-size: 11.5px;\n  letter-spacing: 0;\n}\n\n/* Plugin icon tile: a rounded square with a soft inner light. */\n[class~='fO69Vq_cardIcon'],\n[class~='RotMhW_cardIdentity'],\n[class~='fO69Vq_iconWrap'] {\n  border-radius: var(--lg-r-md);\n  border: 0.5px solid var(--lg-hairline);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0.5px 0 var(--lg-edge-top);\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* Status tags: pills, toned, never outlined. */\n[class~='fO69Vq_statusTag'],\n[class~='RotMhW_status'],\n[class~='fO69Vq_versionTag'] {\n  border-radius: var(--lg-r-pill);\n  padding: 1px 8px;\n  font-size: 11px;\n  font-weight: 560;\n  letter-spacing: 0.01em;\n  background-color: var(--lg-glass-tint);\n  color: var(--dsw-alias-label-tertiary);\n  border: none;\n}\n\n[class~='fO69Vq_statusTag']:has([class~='fO69Vq_status']),\n[class~='RotMhW_statusWithDot'] {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n}\n\n[class~='fO69Vq_status'],\n[class~='RotMhW_phaseDot'] {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background-color: var(--dsw-alias-state-success-primary);\n}\n\n[class~='fO69Vq_rowFailure'] [class~='fO69Vq_status'],\n[class~='fO69Vq_failure'] {\n  color: var(--dsw-alias-state-error-primary);\n  background-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);\n}\n\n[class~='fO69Vq_rowFailure'] [class~='fO69Vq_status'] {\n  background-color: var(--dsw-alias-state-error-primary);\n}\n\n/* ---- Buttons ---------------------------------------------------------\n   Two kinds only: a filled accent for the one primary action, and a quiet\n   bordered button for everything else. */\n/* The add control is a SPLIT button: `addPrimary` is the left half and\n   `addMore` the right, laid out by `addGroup` as a single inline-flex row with\n   no gap. The app squares the facing corners so the two halves read as one\n   capsule, and a `border-radius` SHORTHAND here would round them back out and\n   open a notch between the halves — so the radius must be written as longhands\n   that keep the facing side at 0. The two halves are styled together so the\n   fill, height and hover transition can never drift apart. */\n[class~='fO69Vq_addPrimary'],\n[class~='fO69Vq_addMore'],\n[class~='fO69Vq_installFooter'] button:last-child {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-accent);\n  color: #fff;\n  border: none;\n  box-shadow:\n    inset 0 0.5px 0 rgba(255, 255, 255, 0.35),\n    0 1px 2px rgba(16, 22, 40, 0.16);\n  font-weight: 560;\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    transform var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='fO69Vq_addPrimary'] {\n  border-top-right-radius: 0;\n  border-bottom-right-radius: 0;\n}\n\n[class~='fO69Vq_addMore'] {\n  border-top-left-radius: 0;\n  border-bottom-left-radius: 0;\n  border-left: 0.5px solid color-mix(in srgb, #fff 26%, transparent);\n}\n\n[class~='fO69Vq_addPrimary']:hover,\n[class~='fO69Vq_addMore']:hover {\n  background-color: var(--lg-accent-strong);\n}\n\n[class~='fO69Vq_addPrimary']:active,\n[class~='fO69Vq_addMore']:active {\n  transform: scale(0.97);\n}\n\n[class~='fO69Vq_addButton'],\n[class~='fO69Vq_iconButton'],\n[class~='fO69Vq_footAction'],\n[class~='fO69Vq_infoButton'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--dsw-alias-button-elevated-fill);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    box-shadow var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='fO69Vq_addButton']:hover,\n[class~='fO69Vq_iconButton']:hover,\n[class~='fO69Vq_footAction']:hover,\n[class~='fO69Vq_infoButton']:hover {\n  background-color: var(--dsw-alias-button-floating-hover);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    0 0 0 0.5px var(--lg-hairline);\n}\n\n[class~='fO69Vq_dangerButton'],\n[class~='fO69Vq_deleteButton'] {\n  border-radius: var(--lg-r-md);\n  color: var(--dsw-alias-state-error-primary);\n  background-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);\n  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--dsw-alias-state-error-primary) 26%, transparent);\n}\n\n[class~='fO69Vq_dangerButton']:hover,\n[class~='fO69Vq_deleteButton']:hover {\n  background-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 16%, transparent);\n}\n\n/* ---- Install wizard --------------------------------------------------\n   A stepped panel: the step indicator is the only place colour is used. */\n[class~='fO69Vq_wizard'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-surface-raised);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n}\n\n[class~='fO69Vq_wizardTitle'] {\n  font-size: 16px;\n  font-weight: 620;\n  letter-spacing: -0.012em;\n}\n\n[class~='fO69Vq_wizardSub'] {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12.5px;\n}\n\n[class~='fO69Vq_installField'],\n[class~='fO69Vq_registryCustomField'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 1px 2px rgba(16, 22, 40, 0.05);\n  border: none;\n  transition: box-shadow var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='fO69Vq_installField']:focus-within,\n[class~='fO69Vq_registryCustomField']:focus-within {\n  box-shadow:\n    inset 0 1px 2px rgba(16, 22, 40, 0.05),\n    0 0 0 3px var(--lg-accent-ring);\n}\n\n[class~='fO69Vq_inputError'],\n[class~='fO69Vq_installSafety'] {\n  border-radius: var(--lg-r-sm);\n  font-size: 12.5px;\n}\n\n[class~='fO69Vq_inputError'] {\n  color: var(--dsw-alias-state-error-primary);\n  background-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);\n  padding: 6px 10px;\n}\n\n[class~='fO69Vq_installSafety'] {\n  background-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent);\n  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--dsw-alias-state-warn-primary) 26%, transparent);\n  padding: 8px 12px;\n}\n\n/* ---- Empty / skeleton states ----------------------------------------- */\n[class~='fO69Vq_empty'],\n[class~='d99neW_empty'],\n[class~='RotMhW_hint'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  color: var(--dsw-alias-label-tertiary);\n  padding: 32px 24px;\n  text-align: center;\n  font-size: 13px;\n}\n\n[class~='fO69Vq_skeletonBar'],\n[class~='RotMhW_skeletonBar'],\n[class~='d99neW_skeletonBar'],\n[class~='d99neW_skeletonFill'] {\n  border-radius: var(--lg-r-xs);\n  background-image: linear-gradient(\n    90deg,\n    transparent 0%,\n    color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent) 45%,\n    transparent 90%\n  );\n  background-size: 160% 100%;\n  background-repeat: no-repeat;\n  animation: lg-shimmer 1.6s var(--lg-ease-in-out) infinite;\n}\n\n/* ---- Toggles ---------------------------------------------------------\n   `RotMhW_switcher` is the one shipped control in this family: a 36px chip\n   that opens a menu, so it reads as a pill. The app styles its own toggles,\n   and this skin adds nothing to them.\n\n   There is deliberately NO generic `[role='switch']` rule here, because the\n   role lands on the element that RECEIVES THE CLICK, never on the track.\n   The one shipped switch proves it: TrajectoryToolbar renders\n   `button.QnvEwG_control[role=switch]` (88x20) with the track in a child\n   span, `QnvEwG_controlTrack` (20x10, radius 5px, already styled by the app).\n   dsh-zhipu-plan goes further and puts the role on `.dzp-backendRow`, a\n   530x70 full-width ROW. A generic rule therefore paints a control the size\n   of its whole row as a capsule: accent fill swallows the label, and a 999px\n   radius on a row-sized box is the box/edge collision the HIG forbids.\n   Tracks are styled where the app or the plugin puts them; this sheet does\n   not guess at a plugin's internal shape. */\n[class~='RotMhW_switcher'] {\n  border-radius: var(--lg-r-pill);\n  transition:\n    background-color var(--lg-t-base) var(--lg-ease-out),\n    box-shadow var(--lg-t-base) var(--lg-ease-out);\n}\n\n/* ---- Market --------------------------------------------------------- */\n[class~='d99neW_card'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-surface-raised);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  transition:\n    box-shadow var(--lg-t-base) var(--lg-ease-out),\n    transform var(--lg-t-base) var(--lg-ease-out);\n}\n\n[class~='d99neW_card']:hover {\n  transform: translateY(-1px);\n  box-shadow:\n    inset 0 0 0 0.5px var(--lg-hairline),\n    0 6px 18px -6px rgba(16, 22, 40, 0.16);\n}\n\n[class~='d99neW_marketName'] {\n  font-size: 14px;\n  font-weight: 600;\n  letter-spacing: -0.008em;\n}\n\n[class~='d99neW_description'],\n[class~='d99neW_muted'],\n[class~='d99neW_meta'] {\n  font-size: 12.5px;\n  line-height: 1.55;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n[class~='d99neW_tags'] > *,\n[class~='d99neW_tags'] {\n  border-radius: var(--lg-r-pill);\n  padding: 1px 8px;\n  font-size: 11px;\n  background-color: var(--lg-glass-tint);\n  color: var(--dsw-alias-label-tertiary);\n}\n\n[class~='d99neW_categories'] button,\n[class~='d99neW_toolbar'] button {\n  border-radius: var(--lg-r-pill);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='d99neW_categories'] button:hover,\n[class~='d99neW_toolbar'] button:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* ---- Stat pills -------------------------------------------------------\n   Two tertiary readouts on the composer's bottom edge (turns/steps/speed and\n   tokens/cache-hit). They used to carry a sunken plate plus a hairline, which\n   at 22px tall turned them into two small BUTTONS competing with the send\n   button — the composer had three raised controls in a row and only one of\n   them actually sends.\n\n   Apple's treatment for tertiary chrome is no surface at rest: the affordance\n   is the icon, the tint appears under the pointer. That also removes two\n   rectangles from a row the user is trying to read as a sentence. */\n[class~='iq1doa_pill'],\n[class~='Rd79tq_trigger'],\n[class~='_2WTFBq_trigger'] {\n  border-radius: var(--lg-r-pill);\n  background-color: transparent;\n  box-shadow: none;\n  border: none;\n  padding: 1px 7px;\n  font-size: 12px;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-tertiary);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='iq1doa_pill']:hover,\n[class~='iq1doa_pill'][aria-expanded='true'],\n[class~='Rd79tq_trigger']:hover,\n[class~='Rd79tq_trigger'][aria-expanded='true'],\n[class~='_2WTFBq_trigger']:hover,\n[class~='_2WTFBq_trigger'][aria-expanded='true'] {\n  background-color: var(--lg-hairline);\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* The separator between a pill's two readings is punctuation, not structure. */\n[class~='iq1doa_sep'] {\n  color: var(--dsw-alias-separator-primary);\n  opacity: 0.7;\n}\n\n/* ---- Stat popovers (session stats + token usage) ----------------------\n   The two dialogs those pills open. They ARE floating layers over a scrolling\n   transcript, so they earn the same glass as every other popover in the skin.\n\n   What they did not have was a typographic hierarchy: the shipped panel sets\n   one 12px/18px size for the title, for all four labels and for all four\n   values, so a reader faces eight lines of equal weight and has to read every\n   one of them to find the total. The rule applied here is that the TOTAL is\n   the headline — it arrives in Xt1eiG_titleValue on the usage dialog and in\n   _2WTFBq_figures on the context meter. Where a dialog has no total (the\n   activity one), its title stays a plain label rather than being inflated to\n   fill the role. */\n[class~='Xt1eiG_panel'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(30px) saturate(180%);\n  -webkit-backdrop-filter: blur(30px) saturate(180%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    inset 0 0 0 0.5px var(--lg-hairline),\n    var(--lg-shadow-3);\n  border: none;\n  padding: 14px 16px 15px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n[class~='Xt1eiG_title'] {\n  align-items: baseline;\n  margin-bottom: 9px;\n  font-size: 12px;\n  font-weight: 590;\n  letter-spacing: 0.01em;\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='Xt1eiG_titleLabel'] {\n  gap: 7px;\n  font-weight: 590;\n}\n\n[class~='Xt1eiG_titleLabel'] svg {\n  width: 13px;\n  height: 13px;\n  opacity: 0.6;\n  translate: 0 1px;\n}\n\n[class~='Xt1eiG_titleValue'] {\n  font-size: 14px;\n  font-weight: 590;\n  letter-spacing: -0.01em;\n  color: var(--dsw-alias-label-primary);\n  font-variant-numeric: tabular-nums;\n}\n\n/* A divider is a property of a relationship, so this one stays — but the\n   shipped rule is a flat 0.5px border that reads as a table rule. Fading it at\n   both ends turns it back into a separation between two groups. */\n[class~='Xt1eiG_titleRule'] {\n  border-top: none;\n  height: 1px;\n  margin-bottom: 8px;\n  background-image: linear-gradient(\n    to right,\n    transparent,\n    var(--lg-hairline-strong) 18%,\n    var(--lg-hairline-strong) 82%,\n    transparent\n  );\n}\n\n[class~='Xt1eiG_details'] {\n  grid-template-columns: minmax(72px, auto) minmax(0, 1fr);\n  gap: 7px 18px;\n  font-size: 12px;\n  line-height: 18px;\n}\n\n[class~='Xt1eiG_details'] dt {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11.5px;\n  font-weight: 500;\n  letter-spacing: 0.01em;\n}\n\n[class~='Xt1eiG_details'] dd {\n  color: var(--dsw-alias-label-primary);\n  font-size: 12.5px;\n  font-weight: 500;\n  font-variant-numeric: tabular-nums;\n  letter-spacing: -0.005em;\n}\n\n/* A route is an identifier, not prose: provider/model reads better in mono, and\n   must not be re-flowed mid-token by a narrow value column. */\n[class~='Xt1eiG_route'] {\n  font-family: var(--dsw-font-mono);\n  font-size: 11px;\n  letter-spacing: 0;\n}\n\n[class~='Xt1eiG_reasoning'] {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n}\n\n/* ---- Context meter --------------------------------------------------- */\n[class~='_2WTFBq_root'] {\n  border-radius: var(--lg-r-pill);\n}\n\n[class~='_2WTFBq_panel'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(30px) saturate(180%);\n  -webkit-backdrop-filter: blur(30px) saturate(180%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    inset 0 0 0 0.5px var(--lg-hairline),\n    var(--lg-shadow-3);\n  border: none;\n  padding: 13px 14px 14px;\n  font-size: 12px;\n  line-height: 19px;\n}\n\n[class~='_2WTFBq_header'] {\n  align-items: baseline;\n  gap: 8px;\n}\n\n[class~='_2WTFBq_headline'] {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11.5px;\n  font-weight: 500;\n  letter-spacing: 0.01em;\n}\n\n[class~='_2WTFBq_percent'] {\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  font-weight: 590;\n  font-variant-numeric: tabular-nums;\n}\n\n[class~='_2WTFBq_figures'] {\n  color: var(--dsw-alias-label-primary);\n  font-size: 14px;\n  font-weight: 590;\n  font-variant-numeric: tabular-nums;\n  letter-spacing: -0.01em;\n}\n\n/* A meter is a measured quantity, so its track is a groove rather than a plate:\n   inset shadow, no border, and segments that keep a hairline of track between\n   them instead of butting together. */\n[class~='_2WTFBq_bar'] {\n  height: 5px;\n  margin: 9px 0 11px;\n  gap: 1px;\n  border-radius: var(--lg-r-pill);\n  background-color: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);\n  box-shadow: inset 0 0.5px 0 color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);\n  overflow: hidden;\n}\n\n[class~='_2WTFBq_segment'] {\n  border-radius: 1.5px;\n  min-width: 2px;\n  height: 100%;\n  transition: flex-grow var(--lg-t-slow) var(--lg-ease-out);\n}\n\n[class~='_2WTFBq_swatch'] {\n  width: 7px;\n  height: 7px;\n  border-radius: 2px;\n  margin-right: 7px;\n  translate: 0 -1px;\n}\n\n[class~='_2WTFBq_rows'] {\n  margin: 8px 0 0;\n}\n\n[class~='_2WTFBq_row'] {\n  padding: 3px 0;\n  font-size: 12px;\n  line-height: 18px;\n}\n\n[class~='_2WTFBq_track'] {\n  stroke: color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);\n  stroke-width: 2px;\n}\n\n[class~='_2WTFBq_fill'] {\n  stroke: var(--lg-accent);\n  stroke-width: 2px;\n}\n\n/* ---- Jobs / schedules / goals ---------------------------------------\n   Schedules and goals are lists of CARDS, so each row is a plate. The\n   background-jobs popover is not: it is a HIG grouped list, where the row is\n   the group member and the section header is the grouping. A plate on every\n   row there re-draws the group once per row and leaves the reader counting\n   boxes instead of scanning commands — the user called this out directly\n   (\"请不要在每个列表选项都增加一层灰色背景\"). So the two idioms are now\n   authored separately and must not be merged again. */\n[class~='q7hbua_row'],\n[class~='QSKnSa_row'] {\n  border-radius: var(--lg-r-sm);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='q7hbua_row']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='q7hbua_nextRunRelative'] {\n  font-variant-numeric: tabular-nums;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-caption);\n}\n\n/* The popover shell. It is a floating layer over the transcript, so it is the\n   one thing here that earns glass. `foD-wG_menu` is the MenuSurface; the\n   `panel` is the expanded output drawer inside a row, which must NOT repeat\n   the shell material — it sits on the shell, and glass-on-glass muddies. */\n[class~='foD-wG_menu'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(30px) saturate(180%);\n  -webkit-backdrop-filter: blur(30px) saturate(180%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    inset 0 0 0 0.5px var(--lg-hairline),\n    var(--lg-shadow-3);\n  border: none;\n  overflow: hidden;\n}\n\n/* The list body owns the inset, once, so every row shares one alignment and\n   no row can reach the shell's rounded edge. */\n[class~='foD-wG_menuBody'] {\n  padding: 6px;\n  gap: 0;\n}\n\n/* Section header = the grouping. It is a label, not a row: no fill, no rule\n   under it (the shipped `border-top` on every header drew a line through the\n   list at each section boundary). */\n[class~='foD-wG_sectionHeader'] {\n  margin: 8px 2px 2px;\n  padding: 2px 6px 4px;\n  border-top: none;\n  font-size: 11px;\n  font-weight: 560;\n  letter-spacing: 0.01em;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n[class~='foD-wG_sectionHeader']:first-child {\n  margin-top: 2px;\n}\n\n[class~='foD-wG_sectionToggle'],\n[class~='foD-wG_sectionClear'] {\n  border-radius: var(--lg-r-xs);\n  font-weight: 500;\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='foD-wG_sectionToggle']:hover,\n[class~='foD-wG_sectionClear']:hover {\n  background-color: var(--lg-hairline);\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* A row is a MEMBER of the group: transparent at rest, and it stays\n   transparent when it is the live one. The instruction here was explicit —\n   「请不要在每个列表选项都增加一层灰色背景」 — and a plate on the live row is\n   still a plate on a list option. The running row is told apart the way a HIG\n   list tells any row apart: a state-coloured dot and brighter text. That is\n   also the only distinction that survives a screenshot being read at a glance,\n   because the reader scans for \"which line is different\", not \"which line is\n   boxed\". */\n[class~='foD-wG_rowLine'],\n[class~='foD-wG_rowLineLive'] {\n  border-radius: var(--lg-r-sm);\n  background-color: transparent;\n  padding: 0;\n  box-shadow: none;\n}\n\n[class~='foD-wG_row'] {\n  border-radius: var(--lg-r-sm);\n  min-height: 30px;\n  padding: 5px 6px;\n  gap: 7px;\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='foD-wG_row']:hover,\n[class~='foD-wG_row']:focus-visible {\n  background-color: var(--lg-hairline);\n}\n\n/* Hover is the one transient fill a flat list is allowed, and the live row gets\n   the same one as its siblings — it is not a special surface, it is a row that\n   happens to be running. */\n\n[class~='foD-wG_rowSettled'] {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* `primary` is the TEXT COLUMN of a live row, not a control. The shipped class\n   name reads like a button, and painting it with the accent filled the whole\n   command line with saturated colour. */\n[class~='foD-wG_primary'] {\n  background-color: transparent;\n  color: inherit;\n  border-radius: 0;\n  gap: 0;\n}\n\n[class~='foD-wG_label'] {\n  font-size: 12px;\n  line-height: 17px;\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='foD-wG_rowSettled'] [class~='foD-wG_label'] {\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* The running row's command is tinted, which is the one state signal a flat\n   list can carry without inventing a surface. A colour on text is not a plate;\n   it costs no pixels and it survives at any list length. */\n[class~='foD-wG_rowLineLive'] [class~='foD-wG_label'] {\n  color: var(--lg-accent);\n}\n\n[class~='foD-wG_status'] {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 16px;\n  max-width: 46%;\n}\n\n[class~='foD-wG_duration'],\n[class~='foD-wG_count'] {\n  font-variant-numeric: tabular-nums;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* The kind chip (\"bash\" / \"pwsh\") is metadata, so it is an outline and not a\n   second filled plate competing with the row. */\n[class~='foD-wG_kind'] {\n  border-radius: var(--lg-r-xs);\n  background-color: transparent;\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline-strong);\n  color: var(--dsw-alias-label-tertiary);\n  padding: 0 5px;\n  font-size: 10px;\n  line-height: 15px;\n  letter-spacing: 0.01em;\n}\n\n[class~='foD-wG_rowLineLive'] [class~='foD-wG_kind'] {\n  background-color: transparent;\n}\n\n/* The state indicator is the ui-primitives StateDot, and it renders TWO\n   different things:\n     state === 'ongoing' -> an SVG spinner (`_spinner_1i3xo_37`, 14px)\n     otherwise           -> a span (`_dot_1i3xo_2`, 10px) whose visible circle\n                            is its `::after` at inset 20%\n   Both get their size from an INLINE style, so a width/height rule here is\n   dead on arrival — inline wins over any stylesheet. All this needs to do is\n   stop the flex row from shrinking it, which the shipped rule already says;\n   restating it keeps the row honest if the shipped one ever changes. */\n[class~='foD-wG_rowDot'],\n[class~='foD-wG_triggerDot'] {\n  flex: none;\n  border-radius: var(--lg-r-pill);\n}\n\n/* Chevron and stop are icon affordances on a row, so they are quiet by\n   default and gain their rim on hover — a permanent bordered square beside\n   every row is chrome the reader has to filter out. */\n[class~='foD-wG_chevronBox'],\n[class~='foD-wG_stop'] {\n  width: 20px;\n  height: 20px;\n  border: none;\n  border-radius: var(--lg-r-xs);\n  background-color: transparent;\n  box-shadow: none;\n  color: var(--dsw-alias-label-tertiary);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='foD-wG_row']:hover [class~='foD-wG_chevronBox'],\n[class~='foD-wG_chevronBox']:hover {\n  background-color: var(--lg-hairline);\n  color: var(--dsw-alias-label-secondary);\n}\n\n[class~='foD-wG_stop']:hover,\n[class~='foD-wG_stop']:focus-visible {\n  background-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);\n  color: var(--dsw-alias-state-error-primary);\n}\n\n/* Arming a stop is a destructive confirmation, so it stops being an icon and\n   becomes a labelled button — the one place here that may carry a fill. */\n[class~='foD-wG_stopArmed'],\n[class~='foD-wG_stopArmed']:hover,\n[class~='foD-wG_stopArmed']:focus-visible {\n  width: auto;\n  padding: 0 7px;\n  border-radius: var(--lg-r-xs);\n  background-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);\n  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--dsw-alias-state-error-primary) 42%, transparent);\n  color: var(--dsw-alias-state-error-primary);\n}\n\n[class~='foD-wG_stopLabel'] {\n  font-size: 11px;\n  font-weight: 560;\n}\n\n/* The output drawer sits inside the shell: it is a reading surface, so it is\n   opaque enough to read terminal output on and carries no blur of its own. */\n[class~='foD-wG_panel'] {\n  margin: 2px 6px 8px;\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n}\n\n[class~='foD-wG_notice'] {\n  margin: 0 8px 6px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n}\n\n/* The trigger is a chip in the conversation toolbar, so it takes the same\n   raised treatment as its neighbours instead of a bare text run. */\n[class~='foD-wG_trigger'] {\n  border-radius: var(--lg-r-pill);\n  padding: 2px 8px 2px 6px;\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  color: var(--dsw-alias-label-secondary);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='foD-wG_trigger']:hover,\n[class~='foD-wG_trigger'][aria-expanded='true'] {\n  background-color: var(--lg-surface-sunken);\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='nJdiTq_bar'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-glass-1);\n  backdrop-filter: blur(20px) saturate(175%);\n  -webkit-backdrop-filter: blur(20px) saturate(175%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    var(--lg-shadow-1);\n}\n\n[class~='nJdiTq_goalGlyph'] {\n  color: var(--lg-accent);\n}\n\n[class~='nJdiTq_label'] {\n  font-weight: 560;\n  letter-spacing: -0.004em;\n}\n\n/* ---- Skills / subagents --------------------------------------------- */\n[class~='Xpfrra_card'],\n[class~='pbObnW_section'],\n[class~='oXE0lW_root'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-raised);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n}\n\n[class~='Xpfrra_summary'],\n[class~='Xpfrra_row'] {\n  border-radius: var(--lg-r-sm);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='Xpfrra_summary']:hover,\n[class~='Xpfrra_row']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='Xpfrra_instructionsCard'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--dsw-alias-markdown-code-block);\n  box-shadow: inset 0 1px 2px rgba(16, 22, 40, 0.05);\n}\n\n[class~='oXE0lW_metricDuration'],\n[class~='oXE0lW_metricToken'] {\n  font-variant-numeric: tabular-nums;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-caption);\n}\n\n/* ---- Deliverables --------------------------------------------------- */\n[class~='flL80G_cardPreview'],\n[class~='kuvljq_card'],\n[class~='jmg6Sq_summary'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-raised);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n}\n\n[class~='kuvljq_row'],\n[class~='flL80G_file'] {\n  border-radius: var(--lg-r-sm);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='kuvljq_row']:hover,\n[class~='flL80G_file']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='kuvljq_added'],\n[class~='LFNH1G_added'] {\n  color: var(--dsw-alias-state-success-primary);\n  font-variant-numeric: tabular-nums;\n}\n\n[class~='kuvljq_deleted'],\n[class~='LFNH1G_deleted'] {\n  color: var(--dsw-alias-state-error-primary);\n  font-variant-numeric: tabular-nums;\n}\n\n/* ---- Plan review / questions --------------------------------------- */\n[class~='P2izSq_card'],\n[class~='P2izSq_frame'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-surface-raised);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n}\n\n[class~='P2izSq_title'] {\n  font-size: 16px;\n  font-weight: 620;\n  letter-spacing: -0.014em;\n}\n\n[class~='P2izSq_actions'] button,\n[class~='mAtvLq_footerActions'] button {\n  border-radius: var(--lg-r-md);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    transform var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='mAtvLq_card'],\n[class~='mAtvLq_frame'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-surface-raised);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n}\n\n[class~='mAtvLq_option'],\n[class~='mAtvLq_customRow'] {\n  border-radius: var(--lg-r-md);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='mAtvLq_option']:hover,\n[class~='mAtvLq_customRow']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='mAtvLq_customRowActive'] {\n  background-color: var(--lg-accent-soft);\n  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--lg-accent) 34%, transparent);\n}\n\n[class~='mAtvLq_checkboxChecked'] {\n  color: var(--lg-accent);\n}\n\n[class~='mAtvLq_eyebrow'] {\n  font-size: 11px;\n  font-weight: 620;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n  color: var(--dsw-alias-label-caption);\n}\n\n/* ---- Trajectory ----------------------------------------------------- */\n[class~='QnvEwG_root'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n}\n\n[class~='QnvEwG_searchInput'],\n[class~='QnvEwG_control'] {\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-surface-raised);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n}\n\n/* The plugin inventory search is an icon + an inner <input>, not a styled box,\n   so the field itself carries the material and the wrapper stays a positioning\n   context for the leading glyph. */\n[class~='RotMhW_search'] input {\n  border: 0;\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    box-shadow var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='RotMhW_search'] input:focus-visible {\n  outline: none;\n  background-color: var(--lg-surface-raised);\n  box-shadow:\n    inset 0 0 0 0.5px var(--lg-accent-ring),\n    0 0 0 3px color-mix(in srgb, var(--lg-accent) 16%, transparent);\n}\n\n[class~='QnvEwG_toggle'] {\n  border-radius: var(--lg-r-pill);\n}\n\n[class~='haSm5q_message']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='ZNyiNW_span'] {\n  border-radius: var(--lg-r-xs);\n  transition: filter var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='ZNyiNW_span']:hover {\n  filter: brightness(1.15);\n}\n\n[class~='ZNyiNW_hoverLine'] {\n  background-color: var(--lg-accent);\n}\n\n[class~='ZNyiNW_turnBoundary'] {\n  background-color: var(--lg-hairline);\n}\n\n/* ---- Workflow run --------------------------------------------------- */\n[class~='_2Oss8W_root'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-raised);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n}\n\n[class~='_2Oss8W_phaseHeader'],\n[class~='_2Oss8W_runHeader'] {\n  border-radius: var(--lg-r-sm);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='_2Oss8W_phaseHeader']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='_2Oss8W_memberRow'] {\n  border-radius: var(--lg-r-sm);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  [class~='d99neW_card']:hover,\n  [class~='fO69Vq_row']:active {\n    transform: none;\n  }\n  [class~='fO69Vq_skeletonBar'],\n  [class~='RotMhW_skeletonBar'],\n  [class~='d99neW_skeletonBar'] {\n    animation: none;\n  }\n}\n"},{"id":"dsh-glass-theme/pages.css","css":"/* =======================================================================\n   pages.css — the surfaces that are their own page rather than part of the\n   three-column shell.\n\n   Everything here inherits the token layer (tokens.css), so this sheet only\n   has to answer \"what shape does this surface have\", never \"what colour is\n   it\". The rule throughout: a page is a READING surface (opaque, quiet, no\n   blur behind text); a control or a floating layer is GLASS. Getting that\n   split wrong is what makes an app look like it was wrapped in plastic.\n   ======================================================================= */\n\n/* ---- Appearance cubes (settings > general > appearance) ----------------\n   Three swatches that preview a theme. They are the one place in the app\n   where a control is legitimately an image, so the chrome around them stays\n   almost invisible: a hairline that only gains weight on selection. */\n[class~='v01cdW_group'] {\n  gap: 10px;\n}\n\n[class~='v01cdW_title'] {\n  font: var(--dsw-font-xs-strong-13);\n  letter-spacing: 0.01em;\n  color: var(--dsw-alias-label-secondary);\n}\n\n[class~='v01cdW_cubeRow'] {\n  gap: 8px;\n}\n\n[class~='v01cdW_themeCube'] {\n  border-radius: var(--lg-r-md);\n  border-width: 1px;\n  border-color: var(--lg-hairline);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0.5px 0 var(--lg-edge-bottom);\n  transition:\n    border-color var(--lg-t-fast) var(--lg-ease-out),\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    transform var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='v01cdW_themeCube']:hover:not([class~='v01cdW_selected']) {\n  border-color: var(--lg-hairline-strong);\n}\n\n/* Selection is a ring, not a fill: the swatch's own colours must not be\n   tinted by the selection state or the preview lies. */\n[class~='v01cdW_selected'] {\n  border-color: var(--lg-accent);\n  background-color: var(--lg-accent-soft);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-bottom),\n    0 0 0 2px var(--lg-accent-ring);\n}\n\n[class~='v01cdW_themeCube']:active {\n  transform: scale(0.985);\n}\n\n/* ---- Font size row ----------------------------------------------------\n   A stepper: minus, value, plus. The value is tabular so the row does not\n   shift when it changes between 13 and 14. */\n[class~='_0Fr0Ha_row'] {\n  border-bottom-color: var(--lg-hairline);\n}\n\n[class~='_0Fr0Ha_title'] {\n  font: var(--dsw-font-s-strong-14);\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='_0Fr0Ha_desc'] {\n  font: var(--dsw-font-xxs-12);\n  color: var(--dsw-alias-label-tertiary);\n}\n\n[class~='_0Fr0Ha_stepper'] {\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n[class~='_0Fr0Ha_value'] {\n  font-variant-numeric: tabular-nums;\n  font-weight: 560;\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='_0Fr0Ha_unit'] {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n[class~='_0Fr0Ha_arrow'] {\n  border-radius: var(--lg-r-xs);\n  color: var(--dsw-alias-label-secondary);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    opacity var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='_0Fr0Ha_arrow']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n/* The arrows are revealed on hover of the stepper. On a touch screen there\n   is no hover, so they must be visible unconditionally. */\n@media (hover: none) {\n  [class~='_0Fr0Ha_arrows'] {\n    opacity: 1;\n  }\n}\n\n/* ---- Language row ----------------------------------------------------- */\n[class~='Hefa_q_row'] {\n  border-radius: var(--lg-r-sm);\n}\n\n[class~='Hefa_q_title'] {\n  font: var(--dsw-font-s-strong-14);\n}\n\n[class~='Hefa_q_selector'] {\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n  color: var(--dsw-alias-label-secondary);\n}\n\n[class~='Hefa_q_chevron'] {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* ---- Agent presets ----------------------------------------------------\n   Cards in a responsive grid. The active one is not \"selected\" in the sense\n   of a list selection — it is the preset the next session will run — so it\n   gets an accent hairline plus a faint accent wash rather than a filled\n   plate, which would compete with the model chips inside the composer. */\n[class~='KZf9OG_section'] {\n  gap: 14px;\n}\n\n[class~='KZf9OG_intro'] {\n  font: var(--dsw-font-xs-13);\n  color: var(--dsw-alias-label-secondary);\n  max-width: 62ch;\n}\n\n[class~='KZf9OG_groupHead'] {\n  font: var(--dsw-font-xxxs-strong-11);\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n[class~='KZf9OG_cards'] {\n  gap: 10px;\n}\n\n[class~='KZf9OG_card'] {\n  border-radius: var(--lg-r-lg);\n  border-width: 1px;\n  border-color: var(--lg-hairline);\n  background-color: var(--lg-surface-raised);\n  box-shadow: 0 1px 2px rgba(16, 22, 40, 0.04);\n  transition:\n    border-color var(--lg-t-fast) var(--lg-ease-out),\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    box-shadow var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='KZf9OG_card']:hover:not([class~='KZf9OG_cardActive']) {\n  border-color: var(--lg-hairline-strong);\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='KZf9OG_cardActive'] {\n  border-color: color-mix(in srgb, var(--lg-accent) 55%, transparent);\n  background-color: var(--lg-accent-soft);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-bottom),\n    0 0 0 1px color-mix(in srgb, var(--lg-accent) 22%, transparent);\n}\n\n[class~='KZf9OG_cardName'] {\n  font: var(--dsw-font-s-strong-14);\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='KZf9OG_cardId'] {\n  font-family: var(--dsw-font-mono);\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n[class~='KZf9OG_cardDesc'] {\n  font: var(--dsw-font-xxs-12);\n  color: var(--dsw-alias-label-secondary);\n}\n\n[class~='KZf9OG_cardFoot'] {\n  border-top-color: var(--lg-hairline);\n}\n\n[class~='KZf9OG_brokenBadge'] {\n  border-radius: var(--lg-r-xs);\n  background-color: var(--dsw-alias-state-error-tertiary);\n  color: var(--dsw-alias-state-error-primary);\n  font: var(--dsw-font-xxxs-strong-11);\n}\n\n[class~='KZf9OG_viewerCode'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n[class~='KZf9OG_dialog'] {\n  border-radius: var(--lg-r-panel);\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(34px) saturate(190%);\n  -webkit-backdrop-filter: blur(34px) saturate(190%);\n  box-shadow: var(--lg-shadow-3);\n}\n\n/* ---- Model providers --------------------------------------------------\n   A list of rows where each row is a provider. The row itself is the card,\n   so the radius is one step smaller than the settings cards around it —\n   a row is not a container, it is an item in one. */\n[class~='_3nPmjq_section'] {\n  gap: 12px;\n}\n\n[class~='_3nPmjq_rowCard'] {\n  border-radius: var(--lg-r-lg);\n  border-width: 1px;\n  border-color: var(--lg-hairline);\n  background-color: var(--lg-surface-raised);\n  box-shadow: 0 1px 2px rgba(16, 22, 40, 0.04);\n  padding: 12px 16px;\n}\n\n[class~='_3nPmjq_rowCard']:hover {\n  border-color: var(--lg-hairline-strong);\n}\n\n[class~='_3nPmjq_rowName'] {\n  font: var(--dsw-font-s-strong-14);\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='_3nPmjq_rowTag'] {\n  border-radius: var(--lg-r-xs);\n  border-color: var(--lg-hairline);\n  background-color: var(--lg-glass-tint);\n  color: var(--dsw-alias-label-secondary);\n  font: var(--dsw-font-xxxs-11);\n}\n\n[class~='_3nPmjq_credentialDot'] {\n  border-radius: var(--lg-r-pill);\n}\n\n[class~='_3nPmjq_credentialDotConfigured'] {\n  background-color: var(--dsw-alias-state-success-primary);\n  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent);\n}\n\n[class~='_3nPmjq_credentialDotMissing'] {\n  background-color: var(--dsw-alias-state-warn-primary);\n}\n\n[class~='_3nPmjq_editor'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n[class~='_3nPmjq_addCard'],\n[class~='_3nPmjq_setupCard'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n[class~='_3nPmjq_input'],\n[class~='_3nPmjq_keyInput'],\n[class~='_3nPmjq_selectInput'] {\n  border-radius: var(--lg-r-sm);\n  border-width: 1px;\n  border-color: var(--lg-hairline);\n  background-color: var(--lg-surface-sunken);\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='_3nPmjq_input']:focus,\n[class~='_3nPmjq_keyInput']:focus,\n[class~='_3nPmjq_selectInput']:focus {\n  border-color: var(--lg-accent);\n  box-shadow: 0 0 0 3px var(--lg-accent-ring);\n}\n\n[class~='_3nPmjq_primaryButton'],\n[class~='_3nPmjq_secondaryButton'],\n[class~='_3nPmjq_addButton'] {\n  border-radius: var(--lg-r-sm);\n  font: var(--dsw-font-xs-strong-13);\n}\n\n[class~='_3nPmjq_primaryButton'] {\n  background-color: var(--lg-accent);\n  color: #fff;\n  box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.32);\n}\n\n[class~='_3nPmjq_secondaryButton'],\n[class~='_3nPmjq_addButton'] {\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='_3nPmjq_secondaryButton']:hover,\n[class~='_3nPmjq_addButton']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='_3nPmjq_dangerButton'] {\n  border-radius: var(--lg-r-sm);\n  color: var(--dsw-alias-state-error-primary);\n}\n\n[class~='_3nPmjq_dangerButton']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover-danger);\n}\n\n[class~='_3nPmjq_iconButton'] {\n  border-radius: var(--lg-r-xs);\n}\n\n[class~='_3nPmjq_candidateList'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n  padding: 4px;\n}\n\n[class~='_3nPmjq_candidate'] {\n  border-radius: var(--lg-r-sm);\n}\n\n[class~='_3nPmjq_modelCatalog'] {\n  border-top-color: var(--lg-hairline);\n}\n\n[class~='_3nPmjq_modelRow'] {\n  gap: 8px;\n}\n\n/* ---- Account ----------------------------------------------------------\n   Balance and identity. The balance figure is the only large number on the\n   page, so it carries the display weight and everything else recedes. */\n[class~='_8RVnMG_card'],\n[class~='_8RVnMG_balanceCard'] {\n  border-radius: var(--lg-r-lg);\n  border-width: 1px;\n  border-color: var(--lg-hairline);\n  background-color: var(--lg-surface-raised);\n  box-shadow: 0 1px 2px rgba(16, 22, 40, 0.04);\n}\n\n[class~='_8RVnMG_balanceCard'] {\n  background-image: var(--lg-surface-light-1), var(--lg-surface-light-2);\n}\n\n[class~='_8RVnMG_amount'] {\n  font: var(--dsw-font-xl-24);\n  font-variant-numeric: tabular-nums;\n  letter-spacing: -0.02em;\n}\n\n[class~='_8RVnMG_avatar'] {\n  border-radius: var(--lg-r-pill);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n[class~='_8RVnMG_divider'] {\n  border-top-color: var(--lg-hairline);\n}\n\n/* `primary` and `linkButton` are two independent single-class selectors that\n   the app applies to the SAME element: an `<a>` carrying both classes is a\n   filled accent button. Ordered naively, whichever block comes later wins the\n   `color` declaration, and the link colour (accent) then lands on top of the\n   accent FILL — blue text on blue, invisible. The compound selector below pins\n   the filled variant to white-on-accent regardless of source order. */\n[class~='_8RVnMG_primary'] {\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-accent);\n  color: #fff;\n  box-shadow:\n    inset 0 0.5px 0 rgba(255, 255, 255, 0.35),\n    0 1px 2px rgba(16, 22, 40, 0.16);\n}\n\n[class~='_8RVnMG_linkButton'][class~='_8RVnMG_primary'],\n[class~='_8RVnMG_secondary'][class~='_8RVnMG_primary'] {\n  color: #fff;\n}\n\n[class~='_8RVnMG_linkButton'][class~='_8RVnMG_primary']:hover,\n[class~='_8RVnMG_secondary'][class~='_8RVnMG_primary']:hover {\n  background-color: var(--lg-accent-strong);\n}\n\n[class~='_8RVnMG_secondary'],\n[class~='_8RVnMG_linkButton'] {\n  border-radius: var(--lg-r-sm);\n  color: var(--lg-accent);\n}\n\n[class~='_8RVnMG_secondary']:hover,\n[class~='_8RVnMG_linkButton']:hover {\n  background-color: var(--lg-accent-soft);\n}\n\n[class~='uKWioa_dialog'] {\n  border-radius: var(--lg-r-panel);\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(34px) saturate(190%);\n  -webkit-backdrop-filter: blur(34px) saturate(190%);\n  box-shadow: var(--lg-shadow-3);\n}\n\n[class~='uKWioa_primaryButton'] {\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-accent);\n  color: #fff;\n}\n\n[class~='uKWioa_secondaryButton'],\n[class~='uKWioa_close'] {\n  border-radius: var(--lg-r-sm);\n}\n\n/* ---- Approval ---------------------------------------------------------\n   The one card in the transcript that must interrupt. It keeps the warn\n   border — that is the app's safety language, not decoration — but the\n   strip becomes a soft tint instead of a saturated band, so the command\n   below it stays the loudest thing on the card. */\n[class~='j_8BDW_card'] {\n  border-radius: var(--lg-r-lg);\n  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 42%, transparent);\n  background-color: var(--lg-glass-2);\n  backdrop-filter: blur(24px) saturate(180%);\n  -webkit-backdrop-filter: blur(24px) saturate(180%);\n  box-shadow: var(--lg-shadow-2);\n}\n\n[class~='j_8BDW_strip'] {\n  background-color: var(--dsw-alias-state-warn-tertiary);\n  color: var(--dsw-alias-state-warn-primary);\n  font: var(--dsw-font-xs-13);\n}\n\n[class~='j_8BDW_headline'] {\n  font: var(--dsw-font-s-strong-14);\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='j_8BDW_command'] {\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n  font-family: var(--ds-font-family-code);\n}\n\n[class~='j_8BDW_actionRow'] {\n  gap: 8px;\n}\n\n[class~='j_8BDW_reject'] {\n  border-radius: var(--lg-r-sm);\n}\n\n/* ---- Plan preview ----------------------------------------------------- */\n[class~='KuQXFq_card'] {\n  border-radius: var(--lg-r-md);\n  border-width: 1px;\n  border-color: var(--lg-hairline);\n  background-color: var(--lg-surface-raised);\n}\n\n[class~='KuQXFq_cardTitle'] {\n  font: var(--dsw-font-s-strong-14);\n}\n\n[class~='KuQXFq_cardDescription'] {\n  font: var(--dsw-font-xxs-12);\n  color: var(--dsw-alias-label-secondary);\n}\n\n[class~='KuQXFq_document'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n[class~='_0D_3ea_chip'] {\n  border-radius: var(--lg-r-sm);\n  background-color: var(--dsw-alias-state-business-tertiary);\n  color: var(--dsw-alias-state-business-primary);\n  font: var(--dsw-font-xxxs-strong-11);\n}\n\n/* ---- Schedules / tasks ------------------------------------------------\n   A two-pane page: list on the left, detail on the right. Both panes are\n   reading surfaces, so neither gets a blur; the split is a hairline. */\n[class~='S0jZwq_page'] {\n  background-color: transparent;\n}\n\n[class~='S0jZwq_pageHeading'] {\n  font: var(--dsw-font-l-20);\n  letter-spacing: -0.01em;\n}\n\n/* The divider is a property of the SPLIT, not of the list, so it is gated on\n   `hasDetails` — the class the page root only carries when a detail pane is\n   actually rendered. Ungated, the line drew down the right edge of an\n   otherwise empty page with nothing on the other side of it. */\n[class~='S0jZwq_hasDetails'] > [class~='S0jZwq_listPane'] {\n  border-inline-end: 1px solid var(--lg-hairline);\n}\n\n/* Task rows are separated by a 2px gap in the shipped stylesheet, which reads\n   as loose text on a page rather than as a list of objects. Grouping them onto\n   one raised surface is the iOS grouped-list idiom: the card is the container,\n   the rows are its cells, and the hairline between them is what says \"these are\n   peers\". Without the container each row is a floating sentence. */\n[class~='S0jZwq_listRows'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-surface-raised);\n  box-shadow:\n    inset 0 0 0 0.5px var(--lg-hairline),\n    0 1px 2px rgba(16, 22, 40, 0.04);\n  padding: 6px;\n  gap: 0;\n  overflow: hidden;\n}\n\n[class~='S0jZwq_listRows'] > * + * {\n  border-top: 0.5px solid var(--lg-hairline);\n}\n\n[class~='S0jZwq_row'] {\n  border-radius: var(--lg-r-md);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='S0jZwq_row']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='S0jZwq_selectedRow'] {\n  background-color: var(--lg-accent-soft);\n  box-shadow: inset 2px 0 0 var(--lg-accent);\n}\n\n[class~='S0jZwq_rowTitle'] {\n  font: var(--dsw-font-xs-strong-13);\n}\n\n[class~='S0jZwq_ruleCard'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n/* The task page has TWO tab idioms, and they are different objects:\n   `filterTab` is a pill row (a filter, applied instantly); `detailTab` is an\n   underline row inside a header bar (navigation between panes). Treating\n   them as one control is what makes the page look unresolved. */\n[class~='S0jZwq_filterTabs'] {\n  gap: 6px;\n}\n\n[class~='S0jZwq_filterTab'] {\n  border-radius: var(--lg-r-pill);\n  height: 28px;\n  color: var(--dsw-alias-label-secondary);\n  font: var(--dsw-font-xs-13);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='S0jZwq_filterTab']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='S0jZwq_filterTabActive'] {\n  background-color: var(--lg-accent-soft);\n  color: var(--lg-accent);\n  font-weight: 560;\n}\n\n[class~='S0jZwq_detailTabsBar'] {\n  border-bottom-color: var(--lg-hairline);\n}\n\n[class~='S0jZwq_detailTab'] {\n  color: var(--dsw-alias-label-tertiary);\n  transition: color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='S0jZwq_detailTab']:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='S0jZwq_detailTab'][aria-selected='true'] {\n  color: var(--lg-accent);\n}\n\n[class~='S0jZwq_detailTab'][aria-selected='true']::after {\n  background-color: var(--lg-accent);\n  border-radius: var(--lg-r-pill);\n}\n\n[class~='q7hbua_row'] {\n  border-radius: var(--lg-r-sm);\n}\n\n[class~='q7hbua_title'] {\n  font: var(--dsw-font-xs-strong-13);\n}\n\n[class~='q7hbua_rowOverdue'] {\n  box-shadow: inset 2px 0 0 var(--dsw-alias-state-warn-primary);\n}\n\n[class~='QSKnSa_card'] {\n  border-radius: var(--lg-r-md);\n  border-width: 1px;\n  border-color: var(--lg-hairline);\n  background-color: var(--lg-surface-raised);\n}\n\n[class~='QSKnSa_title'] {\n  font: var(--dsw-font-xs-strong-13);\n}\n\n[class~='CVUQCW_panel'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(30px) saturate(190%);\n  -webkit-backdrop-filter: blur(30px) saturate(190%);\n  box-shadow: var(--lg-shadow-3);\n}\n\n[class~='LOs-Za_cell'] {\n  border-radius: var(--lg-r-xs);\n}\n\n[class~='LOs-Za_selected'] {\n  background-color: var(--lg-accent);\n  color: #fff;\n}\n\n[class~='_DSe8a_option'] {\n  border-radius: var(--lg-r-xs);\n}\n\n[class~='_DSe8a_selected'] {\n  background-color: var(--lg-accent-soft);\n  color: var(--lg-accent);\n}\n\n[class~='_3tUStW_root'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(28px) saturate(185%);\n  -webkit-backdrop-filter: blur(28px) saturate(185%);\n  box-shadow: var(--lg-shadow-3);\n}\n\n[class~='_3tUStW_item'] {\n  border-radius: var(--lg-r-xs);\n}\n\n/* ---- Trajectory -------------------------------------------------------\n   The table is a dense instrument. It stays flat and monospaced; the only\n   material in it is the details drawer, which floats over the table. */\n[class~='haSm5q_table'] {\n  font-family: var(--ds-font-family-code);\n}\n\n[class~='haSm5q_tablePane'] {\n  background-color: transparent;\n}\n\n[class~='haSm5q_eventHeader'] {\n  border-bottom-color: var(--lg-hairline);\n}\n\n[class~='haSm5q_kindTag'] {\n  border-radius: var(--lg-r-xs);\n  font: var(--dsw-font-xxxs-strong-11);\n}\n\n[class~='haSm5q_details'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(30px) saturate(185%);\n  -webkit-backdrop-filter: blur(30px) saturate(185%);\n  box-shadow: var(--lg-shadow-3);\n}\n\n[class~='haSm5q_detailTabs'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-tint);\n  padding: 2px;\n}\n\n[class~='haSm5q_detailTab'] {\n  border-radius: var(--lg-r-sm);\n}\n\n[class~='haSm5q_detailTabActive'] {\n  background-color: var(--lg-surface-raised);\n  box-shadow: 0 1px 2px rgba(16, 22, 40, 0.08);\n}\n\n[class~='haSm5q_sourceBlock'],\n[class~='haSm5q_programPanel'],\n[class~='haSm5q_jsonPayload'] {\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n[class~='ZNyiNW_root'] {\n  background-color: transparent;\n}\n\n[class~='ZNyiNW_track'] {\n  background-color: var(--lg-hairline);\n  border-radius: var(--lg-r-pill);\n}\n\n[class~='ZNyiNW_selection'] {\n  background-color: color-mix(in srgb, var(--lg-accent) 22%, transparent);\n  border-radius: var(--lg-r-xs);\n}\n\n[class~='QnvEwG_root'] {\n  border-bottom-color: var(--lg-hairline);\n}\n\n[class~='QnvEwG_searchInput'] {\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n[class~='QnvEwG_action'] {\n  border-radius: var(--lg-r-xs);\n}\n\n[class~='QnvEwG_control'] {\n  border-radius: var(--lg-r-pill);\n}\n\n/* ---- Shortcuts reference ---------------------------------------------\n   A searchable table of key bindings. Keys are physical objects here: a\n   key cap is a small raised plate, not a coloured tag. */\n[class~='_3Y3Nma_dialog'] {\n  border-radius: var(--lg-r-panel);\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(34px) saturate(190%);\n  -webkit-backdrop-filter: blur(34px) saturate(190%);\n  box-shadow: var(--lg-shadow-3);\n}\n\n[class~='_3Y3Nma_searchField'] {\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n[class~='_3Y3Nma_group'] {\n  border-bottom-color: var(--lg-hairline);\n}\n\n[class~='_3Y3Nma_row'] {\n  border-radius: var(--lg-r-sm);\n}\n\n[class~='_3Y3Nma_row']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='_3Y3Nma_keyBadge'],\n[class~='_3Y3Nma_fixedKeyBadge'],\n[class~='_3Y3Nma_binding'] {\n  border-radius: var(--lg-r-xs);\n  background-color: var(--lg-surface-raised);\n  box-shadow:\n    inset 0 -1px 0 rgba(16, 22, 40, 0.10),\n    inset 0 0.5px 0 var(--lg-edge-top),\n    0 1px 1px rgba(16, 22, 40, 0.06);\n  color: var(--dsw-alias-label-secondary);\n  font-family: var(--ds-font-family-code);\n}\n\n[class~='_3Y3Nma_invalid'] {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n/* ---- Cordis panel ----------------------------------------------------- */\n[class~='zf92ZW_panel'] {\n  border-radius: var(--lg-r-lg);\n  background-color: transparent;\n}\n\n[class~='zf92ZW_header'] {\n  border-bottom-color: var(--lg-hairline);\n}\n\n[class~='zf92ZW_row'] {\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-surface-raised);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n[class~='zf92ZW_rowName'] {\n  font: var(--dsw-font-xs-strong-13);\n}\n\n[class~='zf92ZW_rowId'] {\n  font-family: var(--dsw-font-mono);\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n[class~='zf92ZW_badge'] {\n  border-radius: var(--lg-r-pill);\n}\n\n[class~='zf92ZW_actionButton'] {\n  border-radius: var(--lg-r-xs);\n}\n\n[class~='_3jVEXG_card'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n[class~='_3jVEXG_row'] {\n  border-radius: var(--lg-r-sm);\n}\n\n[class~='p_wyXq_card'],\n[class~='p_wyXq_sourceCard'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n[class~='p_wyXq_sourceCode'],\n[class~='p_wyXq_bodyWrap'] {\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-surface-sunken);\n}\n\n/* ---- Skill rows ------------------------------------------------------- */\n[class~='Xpfrra_card'] {\n  border-radius: var(--lg-r-md);\n  border-width: 1px;\n  border-color: var(--lg-hairline);\n  background-color: var(--lg-surface-raised);\n}\n\n[class~='Xpfrra_row'] {\n  border-radius: var(--lg-r-sm);\n}\n\n[class~='Xpfrra_summary'] {\n  border-radius: var(--lg-r-sm);\n}\n\n[class~='Xpfrra_title'] {\n  font: var(--dsw-font-xs-strong-13);\n}\n\n[class~='Xpfrra_instructionsCard'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n[class~='Xpfrra_instructionsHeader'] {\n  border-bottom-color: var(--lg-hairline);\n}\n\n[class~='Xpfrra_separator'] {\n  border-top-color: var(--lg-hairline);\n}\n\n/* ---- Jobs panel -------------------------------------------------------\n   Authored in settings.css alongside the schedules/goals lists, because the\n   two are the same subject and must be read together to stay distinct. This\n   sheet deliberately carries nothing for `foD-wG_*`: a second, weaker set of\n   rules for the same classes is how the row plates came back the first time. */\n\n/* ---- Goal bar ---------------------------------------------------------\n   Sits in the composer dock and states the session objective. It is chrome\n   over content, so it is glass, and it is quiet until hovered because the\n   objective is reference, not a call to action. */\n[class~='nJdiTq_bar'],\n[class~='nJdiTq_dock'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n[class~='nJdiTq_objective'] {\n  font: var(--dsw-font-xxs-12);\n  color: var(--dsw-alias-label-secondary);\n}\n\n[class~='nJdiTq_iconBtn'] {\n  border-radius: var(--lg-r-xs);\n}\n\n[class~='-ja1rG_bubble'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n}\n\n/* ---- Terminal guide / session log / model label ----------------------- */\n[class~='zpy3TW_entry'],\n[class~='zpy3TW_trigger'] {\n  border-radius: var(--lg-r-sm);\n}\n\n[class~='zpy3TW_entry']:hover,\n[class~='zpy3TW_trigger']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='zpy3TW_menu'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(28px) saturate(185%);\n  -webkit-backdrop-filter: blur(28px) saturate(185%);\n  box-shadow: var(--lg-shadow-3);\n}\n\n[class~='zpy3TW_shortcut'] {\n  border-radius: var(--lg-r-xs);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 1px var(--lg-hairline);\n  font-family: var(--ds-font-family-code);\n  font-size: 11px;\n}\n\n/* The session-log upload row is one row in a list of rows, not a card. Giving it\n   a raised surface made a 564px plate inside a 564px column: a box as wide as the\n   thing that contains it stops saying \"this is a group\" and starts colliding with\n   the column edge and the scrollbar. It keeps the same hairline divider as its\n   neighbours instead, and the toggle carries the row's weight. */\n[class~='PUqB7a_row'] {\n  border-bottom: 0.5px solid var(--lg-hairline);\n}\n\n[class~='PUqB7a_title'] {\n  font: var(--dsw-font-xs-strong-13);\n}\n\n[class~='dO-SVa_label'] {\n  font: var(--dsw-font-xxs-12);\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* ---- Foreign pages ----------------------------------------------------\n   Third-party plugins can claim the `main` slot and render their own page.\n   Those pages ship plain HTML with no class names at all, so nothing in the\n   host's design system reaches them: a save button arrives as a 23px sliver\n   with its label wrapped onto two lines. The skin is the only layer that can\n   give them the app's control language, so it does — scoped to the main slot\n   and to controls that carry no class, which is precisely the set the host\n   never styles.\n\n   Deliberately minimal: type, spacing, radius, and a press state. A foreign\n   page keeps its own layout; it only stops looking like a different product. */\n[data-slot='main'] button:not([class]) {\n  box-sizing: border-box;\n  height: 32px;\n  padding: 0 14px;\n  border: 1px solid var(--lg-hairline);\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-glass-tint);\n  color: var(--dsw-alias-label-primary);\n  font: var(--dsw-font-xs-strong-13);\n  white-space: nowrap;\n  cursor: pointer;\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    border-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[data-slot='main'] button:not([class]):hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n  border-color: var(--lg-hairline-strong);\n}\n\n[data-slot='main'] button:not([class]):active {\n  background-color: var(--dsw-alias-interactive-bg-active);\n}\n\n[data-slot='main'] input:not([class]),\n[data-slot='main'] select:not([class]),\n[data-slot='main'] textarea:not([class]) {\n  box-sizing: border-box;\n  border: 1px solid var(--lg-hairline);\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-surface-sunken);\n  color: var(--dsw-alias-label-primary);\n  font: var(--dsw-font-xs-13);\n  padding: 4px 10px;\n}\n\n[data-slot='main'] input:not([class]):focus,\n[data-slot='main'] select:not([class]):focus,\n[data-slot='main'] textarea:not([class]):focus {\n  border-color: var(--lg-accent);\n  outline: none;\n  box-shadow: 0 0 0 3px var(--lg-accent-ring);\n}\n\n/* A foreign page's own headings and body copy join the app's scale instead of\n   inheriting the browser's 16px/1.5 default.\n\n   Every text rule below excludes anything inside the markdown renderer. That\n   renderer emits unclassed `<p>`, `<h1>`, `<table>` and `<a>` too, and those\n   already have a typographic ladder driven by `--dsh-content-font-size`; a\n   foreign-page rule reaching them would silently override the user's font-size\n   setting. Controls are safe to style unconditionally because markdown never\n   contains them. */\n[data-slot='main'] h1:not([class]):not([class*='_markdown_'] *) {\n  font: var(--dsw-font-xl-24);\n  letter-spacing: -0.01em;\n}\n\n[data-slot='main'] h2:not([class]):not([class*='_markdown_'] *) {\n  font: var(--dsw-font-l-20);\n  letter-spacing: -0.005em;\n}\n\n[data-slot='main'] h3:not([class]):not([class*='_markdown_'] *) {\n  font: var(--dsw-font-m-18);\n}\n\n[data-slot='main'] label:not([class]):not([class*='_markdown_'] *),\n[data-slot='main'] p:not([class]):not([class*='_markdown_'] *) {\n  font: var(--dsw-font-s-14);\n  color: var(--dsw-alias-label-secondary);\n}\n\n[data-slot='main'] a:not([class]):not([class*='_markdown_'] *) {\n  color: var(--lg-accent);\n  text-decoration: none;\n}\n\n[data-slot='main'] a:not([class]):not([class*='_markdown_'] *):hover {\n  text-decoration: underline;\n}\n\n[data-slot='main'] table:not([class]):not([class*='_markdown_'] *) {\n  border-collapse: collapse;\n  font: var(--dsw-font-xs-13);\n}\n\n[data-slot='main'] th:not([class]):not([class*='_markdown_'] *),\n[data-slot='main'] td:not([class]):not([class*='_markdown_'] *) {\n  border-bottom: 1px solid var(--lg-hairline);\n  padding: 6px 10px;\n  text-align: start;\n}\n\n[data-slot='main'] th:not([class]):not([class*='_markdown_'] *) {\n  font: var(--dsw-font-xxs-strong-12);\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* ---- One motion floor for this sheet ---------------------------------\n   These pages are dense; the only motion worth paying for is the press. */\n@media (prefers-reduced-motion: reduce) {\n  [class~='v01cdW_themeCube']:active,\n  [class~='KZf9OG_card']:active {\n    transform: none;\n  }\n}\n"},{"id":"dsh-glass-theme/widgets.css","css":"/* ==========================================================================\n   Liquid Glass · widgets\n   --------------------------------------------------------------------------\n   The right-hand dock, the attachment rail, file previews, the browser panel,\n   markdown, code blocks, and the small chrome pieces that appear all over the\n   app.\n\n   Rule applied here: the dock is chrome (L1), the panes inside it are reading\n   surfaces (opaque), and the markdown renderer gets Apple's typographic ramp.\n   ========================================================================== */\n\n/* ---- Right dock -------------------------------------------------------\n   The dock panel is an absolutely-positioned overlay that hangs off the right\n   edge of the rightbar column. When the column is collapsed to zero width the\n   panel still spans the viewport (its width comes from its content), and only\n   its dockkit children are hidden — the panelBody itself stays laid out.\n\n   That is why the material has to be gated on the open attribute rather than\n   applied to the body unconditionally: an unconditional glass panelBody paints\n   a 640px frosted rectangle over the middle of the transcript. */\n[class~='OUqwTW_panel'] {\n  background: transparent;\n  backdrop-filter: none;\n  -webkit-backdrop-filter: none;\n  box-shadow: none;\n  border: 0;\n}\n\n/* The panel is absolutely positioned against the rightbar column, so it ignores\n   that column's padding and spans the full frame height — flush to the top and\n   bottom edges while the sidebar and the centre column both float on a 10px\n   gutter. Inset it vertically so the dock keeps the same rhythm as the rest of\n   the shell; the RIGHT edge stays flush on purpose, because a dock slides in\n   from the edge and a gap there would read as a stray margin. The left corners\n   are the only rounded ones for the same reason. */\n[class~='OUqwTW_panel'] {\n  top: var(--lg-gutter);\n  bottom: var(--lg-gutter);\n}\n\n/* The dock is the widest glass surface in the app (it opens at ~640px), and at\n   that size an L1 fill is the wrong material: 4.5% white over a 180%-saturated\n   blur lets the ambient field's chroma take over the whole panel and the dock\n   reads as a coloured wash rather than as chrome. Large glass goes up the\n   ladder — a heavier fill and LESS saturation, because there is more area for\n   the backdrop to bleed through. The blur stays, so the panel still belongs to\n   the room; it just stops competing with the text on it. */\n[class~='OUqwTW_panel'][data-sidebar-right-open] [class~='OUqwTW_panelBody'] {\n  border-radius: var(--lg-r-xl) 0 0 var(--lg-r-xl);\n  background-color: var(--lg-glass-3);\n  backdrop-filter: blur(30px) saturate(140%);\n  -webkit-backdrop-filter: blur(30px) saturate(140%);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 -0.5px 0 var(--lg-edge-bottom),\n    inset 0.5px 0 0 var(--lg-hairline),\n    var(--lg-shadow-1);\n  overflow: hidden;\n}\n\n/* In FULLSCREEN the dock stops being a column and becomes a sheet: it keeps its\n   absolute position but grows to `100vw` minus the sidebar, so it now lies ON\n   TOP OF the centre column instead of beside it.\n\n   The app does not raise the panel for this. It cannot rely on paint order\n   either: `BynINW_rightbarCol` and `BynINW_centerCol` are both\n   `position: relative; z-index: auto`, so neither opens a stacking context and\n   everything inside them competes in the frame's context. The transcript's\n   composer is a FLEX ITEM with `z-index: 1`, which does create a stacking\n   context even at `position: static`, so it paints above every `z-index: auto`\n   positioned box — including this panel. The result is the composer card\n   floating through the middle of a fullscreen dock.\n\n   The panel therefore has to be lifted explicitly, and only in fullscreen:\n   while docked it never overlaps the centre column, so raising it there would\n   only let it swallow the column resize handle. 20 clears the composer's 1 and\n   stays far below the app's real overlay layers (settings 1000, menus 1100). */\n[class~='OUqwTW_panel'][data-sidebar-right-panel='fullscreen'] {\n  z-index: 20;\n}\n\n/* Dockkit paints `--dsw-alias-bg-base` on a docked tab host, which is an opaque\n   slab sitting directly on the glass panel above and covering all of it. The\n   host has already opted out of that fill for FLOATING tab hosts\n   (`:not(._float_*)`), so a docked host is the one case that needs the fill\n   removed here. The header strip then becomes the panel's title bar: same\n   material, no fill of its own. */\n[class~='OUqwTW_panel'][data-sidebar-right-open] [class*='_tabHost_6nhg2_'],\n[class~='OUqwTW_panel'][data-sidebar-right-open] [class*='_emptyTabHost_6nhg2_'] {\n  background: transparent;\n}\n\n[class~='OUqwTW_panel'][data-sidebar-right-open] [class*='_tabHostHeader_6nhg2_'] {\n  padding-inline: 4px 10px;\n}\n\n/* A pane is a reading surface inside the dock, so it goes opaque and loses the\n   blur. Only one backdrop layer is allowed per stack. */\n[data-dockkit-pane] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-surface);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  overflow: hidden;\n}\n\n[data-dockkit-divider] {\n  background-color: var(--lg-hairline);\n}\n\n[data-dockkit-empty] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12.5px;\n}\n\n[class~='OUqwTW_collapseGlyph'],\n[class~='OUqwTW_iconButton'],\n[class~='dzXS4q_button'] {\n  border-radius: var(--lg-r-sm);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    transform var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='OUqwTW_iconButton']:hover,\n[class~='dzXS4q_button']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='OUqwTW_tabTitle'] {\n  font-size: 12px;\n  font-weight: 600;\n  letter-spacing: 0.02em;\n  text-transform: uppercase;\n  color: var(--dsw-alias-label-caption);\n}\n\n/* ---- Attachments ----------------------------------------------------- */\n[class~='GjTS2W_card'],\n[class~='GjTS2W_card'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-tint);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    0 0 0 0.5px var(--lg-hairline);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    transform var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='GjTS2W_card']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n  transform: translateY(-1px);\n}\n\n[class~='GjTS2W_card']:active {\n  transform: scale(0.985);\n}\n\n[class~='GjTS2W_name'],\n[class~='GjTS2W_name'] {\n  font-size: 12.5px;\n  font-weight: 500;\n  letter-spacing: -0.002em;\n}\n\n[class~='GjTS2W_meta'],\n[class~='GjTS2W_meta'] {\n  font-size: 11px;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-caption);\n}\n\n[class~='Mrat-G_rail'],\n[class~='srf2qa_rail'] {\n  gap: 8px;\n}\n\n[class~='Mrat-G_thumbnail'],\n[class~='srf2qa_thumbnail'],\n[class~='Nhu-QW_frame'] {\n  border-radius: var(--lg-r-md);\n  box-shadow:\n    inset 0 0 0 0.5px var(--lg-hairline),\n    0 1px 3px rgba(16, 22, 40, 0.08);\n  overflow: hidden;\n}\n\n/* ---- File previews -------------------------------------------------- */\n[class~='TdjKvG_preview'],\n[class~='mXcgTW_document'],\n[class~='BMNXqa_frame'],\n[class~='FYC9oG_frame'],\n[class~='ORj4nq_code'],\n[class~='j86_xG_body'],\n[class~='Woyo-G_root'] {\n  background-color: var(--lg-surface);\n  color: var(--dsw-alias-label-primary);\n}\n\n[class~='ORj4nq_code'] pre,\n[class~='TdjKvG_preview'] pre {\n  font-family: var(--ds-font-family-code);\n  font-size: 12.5px;\n  line-height: 1.65;\n  text-autospace: no-autospace;\n}\n\n[class~='mXcgTW_document'] {\n  font-size: 14px;\n  line-height: 1.7;\n  letter-spacing: -0.003em;\n}\n\n[class~='GH6oSW_surface'] {\n  background-color: var(--lg-surface-sunken);\n}\n\n[class~='eQSa2q_loading'] {\n  color: var(--lg-accent);\n}\n\n/* ---- Browser panel -------------------------------------------------- */\n[class~='qWvkEq_root'] {\n  background-color: var(--lg-surface);\n}\n\n[class~='qWvkEq_toolbar'] {\n  border-radius: 0 0 var(--lg-r-md) var(--lg-r-md);\n  background-color: var(--lg-glass-1);\n  backdrop-filter: blur(20px) saturate(175%);\n  -webkit-backdrop-filter: blur(20px) saturate(175%);\n  box-shadow: inset 0 -0.5px 0 var(--lg-hairline);\n}\n\n[class~='qWvkEq_addressBox'] {\n  border-radius: var(--lg-r-pill);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 1px 2px rgba(16, 22, 40, 0.05);\n  border: none;\n  transition: box-shadow var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='qWvkEq_addressBox']:focus-within {\n  box-shadow:\n    inset 0 1px 2px rgba(16, 22, 40, 0.05),\n    0 0 0 3px var(--lg-accent-ring);\n}\n\n[class~='qWvkEq_addressGo'] {\n  border-radius: var(--lg-r-pill);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='qWvkEq_addressGo']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover-solid);\n}\n\n[class~='qWvkEq_sandboxWarning'],\n[class~='qWvkEq_sandboxOff'] {\n  border-radius: var(--lg-r-sm);\n  background-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);\n  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--dsw-alias-state-warn-primary) 30%, transparent);\n  color: var(--dsw-alias-state-warn-primary);\n  font-size: 12px;\n  padding: 6px 10px;\n}\n\n[class~='qWvkEq_viewport'],\n[class~='qWvkEq_webview'] {\n  border-radius: var(--lg-r-md);\n  overflow: hidden;\n  background-color: #fff;\n}\n\n/* ---- Markdown ------------------------------------------------------\n   The typographic heart of the app. Apple's ramp: tighter tracking as size\n   grows, generous leading for body, a clear 4px/8px rhythm between blocks. */\n[class*='_markdown'],\n[class~='v5IAXa_body'] {\n  --lg-md-gap: 0.85em;\n}\n\n[class~='v5IAXa_body'] p {\n  margin-block: 0 var(--lg-md-gap);\n  line-height: 1.7;\n}\n\n[class~='v5IAXa_body'] h1,\n[class~='v5IAXa_body'] h2,\n[class~='v5IAXa_body'] h3,\n[class~='v5IAXa_body'] h4 {\n  margin-block: 1.5em 0.55em;\n  font-weight: 640;\n  letter-spacing: -0.018em;\n  line-height: 1.3;\n}\n\n[class~='v5IAXa_body'] h1 {\n  font-size: 1.62em;\n  letter-spacing: -0.024em;\n}\n\n[class~='v5IAXa_body'] h2 {\n  font-size: 1.32em;\n  letter-spacing: -0.02em;\n}\n\n[class~='v5IAXa_body'] h3 {\n  font-size: 1.12em;\n  letter-spacing: -0.014em;\n}\n\n[class~='v5IAXa_body'] h4 {\n  font-size: 1em;\n  letter-spacing: -0.01em;\n}\n\n[class~='v5IAXa_body'] ul,\n[class~='v5IAXa_body'] ol {\n  margin-block: 0 var(--lg-md-gap);\n  padding-inline-start: 1.35em;\n}\n\n[class~='v5IAXa_body'] li {\n  margin-block: 0.22em;\n  line-height: 1.68;\n}\n\n[class~='v5IAXa_body'] li::marker {\n  color: var(--dsw-alias-label-caption);\n}\n\n[class~='v5IAXa_body'] blockquote {\n  margin-block: 0 var(--lg-md-gap);\n  padding-inline-start: 14px;\n  border-inline-start: 2.5px solid var(--lg-hairline-strong);\n  color: var(--dsw-alias-label-secondary);\n}\n\n[class~='v5IAXa_body'] hr {\n  border: none;\n  border-top: 0.5px solid var(--lg-hairline);\n  margin-block: 1.5em;\n}\n\n[class~='v5IAXa_body'] a {\n  color: var(--dsw-alias-link);\n  text-decoration-thickness: 1px;\n  text-underline-offset: 2px;\n  text-decoration-color: color-mix(in srgb, var(--dsw-alias-link) 35%, transparent);\n  transition: text-decoration-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='v5IAXa_body'] a:hover {\n  text-decoration-color: currentColor;\n}\n\n[class~='v5IAXa_body'] strong {\n  font-weight: 620;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* ---- Markdown tables -------------------------------------------------\n   Apple does not put tables in boxes. A table in Pages, Numbers, or a HIG spec\n   sheet is an open grid: no outer border, no header fill, no vertical rules —\n   only hairlines between rows, a slightly stronger one under the header, and\n   generous vertical padding so the eye can track across. The alignment edge is\n   the text column, so the table never looks indented relative to the prose.\n\n   The shipped renderer already strips the outer padding (`th:first-child,\n   td:first-child { padding-left: 0 }`, `td:last-child { padding-right: 0 }`), so\n   the table is meant to sit flush with the paragraph text. A rounded container\n   fought that: it re-indented the first column and put a visible frame around\n   something that is supposed to be open.\n\n   Row rules fade at the ends instead of running edge to edge — that is what\n   stops a wide table from reading as a stack of bars. */\n[class*='_tableScroll_1ypvv'] {\n  margin-block: 0.15em 1.05em;\n}\n\n[class~='v5IAXa_body'] table,\n[class*='_tableScroll_1ypvv'] table {\n  border-collapse: collapse;\n  border: 0;\n  font-size: 0.94em;\n  font-variant-numeric: tabular-nums;\n}\n\n[class~='v5IAXa_body'] th,\n[class*='_tableScroll_1ypvv'] th {\n  background-color: transparent;\n  padding-block: 6px 9px;\n  font-weight: 600;\n  font-size: 0.92em;\n  letter-spacing: 0.005em;\n  color: var(--dsw-alias-label-secondary);\n  text-align: start;\n  border: 0;\n  border-bottom: 0.5px solid var(--lg-hairline-strong);\n  white-space: nowrap;\n}\n\n[class~='v5IAXa_body'] td,\n[class*='_tableScroll_1ypvv'] td {\n  padding-block: 9px;\n  border: 0;\n  border-bottom: 0.5px solid var(--lg-hairline);\n  vertical-align: top;\n  line-height: 1.55;\n}\n\n/* The last row's rule would hang under the table with nothing after it. */\n[class~='v5IAXa_body'] tr:last-child td,\n[class*='_tableScroll_1ypvv'] tr:last-child td {\n  border-bottom-color: transparent;\n}\n\n/* Horizontal padding belongs to the CELL, not to a container, so the first\n   column starts on the text edge and the rest breathe. */\n[class~='v5IAXa_body'] th + th,\n[class*='_tableScroll_1ypvv'] th + th,\n[class~='v5IAXa_body'] td + td,\n[class*='_tableScroll_1ypvv'] td + td {\n  padding-inline-start: 18px;\n}\n\n/* Numeric columns line up by the decimal, which is the whole reason a table\n   earns tabular figures. */\n[class~='v5IAXa_body'] td:not(:first-child),\n[class*='_tableScroll_1ypvv'] td:not(:first-child) {\n  font-variant-numeric: tabular-nums;\n}\n\n/* A table wider than the column scrolls; the hint is a hairline that fades in\n   on the scroller itself rather than a scrollbar drawn over the text. */\n[class*='_tableScroll_1ypvv']:hover {\n  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2) transparent;\n}\n[class~='v5IAXa_body'] :not(pre) > code {\n  font-family: var(--ds-font-family-code);\n  font-size: 0.88em;\n  padding: 0.14em 0.4em;\n  border-radius: var(--lg-r-xs);\n  background-color: var(--dsw-alias-markdown-inline-code);\n  letter-spacing: 0;\n  text-autospace: no-autospace;\n}\n\n/* ---- Code blocks --------------------------------------------------- */\n[class*='_card_7gxqk'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--dsw-alias-markdown-code-block);\n  box-shadow:\n    inset 0 1px 2px rgba(16, 22, 40, 0.05),\n    0 0 0 0.5px var(--lg-hairline);\n  overflow: hidden;\n}\n\n[class*='_card_7gxqk'] pre {\n  font-family: var(--ds-font-family-code);\n  font-size: calc(var(--dsh-content-font-size, 14px) - 1.5px);\n  line-height: 1.66;\n  text-autospace: no-autospace;\n  padding: 12px 14px;\n  overflow-x: auto;\n}\n\n[class*='_banner_7gxqk'],\n[data-code-block-banner] {\n  background-color: var(--dsw-alias-markdown-code-block-banner);\n  border-bottom: 0.5px solid var(--lg-hairline);\n  padding: 5px 12px;\n  font-size: 11.5px;\n  font-weight: 500;\n  letter-spacing: 0.01em;\n  color: var(--dsw-alias-label-tertiary);\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n[class*='_banner_7gxqk'] button {\n  border-radius: var(--lg-r-xs);\n  padding: 1px 6px;\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class*='_banner_7gxqk'] button:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover-solid);\n}\n\n/* Shiki tokens: the theme ships its own palette; only the container is ours. */\n[class*='_shiki_7gxqk'] {\n  background-color: transparent !important;\n}\n\n/* ---- Citation chips ------------------------------------------------- */\n[class*='_pill_1bqmh'],\n[class*='_refChip_fbulu'] {\n  border-radius: var(--lg-r-pill);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  padding: 0 7px;\n  font-size: 0.86em;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-secondary);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class*='_pill_1bqmh']:hover {\n  background-color: var(--lg-accent-soft);\n}\n\n/* ---- Reference chips (attached files in the composer) --------------- */\n[class~='rtYPxa_chip'] {\n  border-radius: var(--lg-r-pill);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    transform var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='rtYPxa_chip']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='rtYPxa_chip']:active {\n  transform: scale(0.97);\n}\n\n[class~='rtYPxa_invalid'] {\n  color: var(--dsw-alias-state-error-primary);\n  background-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);\n}\n\n/* ---- Question composer / plan review cards ------------------------- */\n[class~='mAtvLq_header'] {\n  border-bottom: 0.5px solid var(--lg-hairline);\n  padding-bottom: 10px;\n}\n\n[class~='mAtvLq_badge'] {\n  border-radius: var(--lg-r-xs);\n  background-color: var(--lg-accent-soft);\n  color: var(--lg-accent);\n  padding: 0 5px;\n  font-size: 11px;\n  font-weight: 600;\n}\n\n[class~='mAtvLq_fieldInput'],\n[class~='mAtvLq_customInline'] {\n  border-radius: var(--lg-r-sm);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 1px 2px rgba(16, 22, 40, 0.05);\n  border: none;\n}\n\n[class~='mAtvLq_footer'] {\n  border-top: 0.5px solid var(--lg-hairline);\n  padding-top: 10px;\n}\n\n/* ---- Account -------------------------------------------------------\n   The account control lives at the foot of the sidebar, which is already a glass\n   column. Painting it as a second glass card put material on material: a 78%\n   opaque rounded box inside a translucent rounded column, which reads as a box\n   in a box and is exactly the \"glass on glass\" the material ladder forbids.\n\n   Apple's sidebar footer is a ROW, not a card — Finder, Mail and Music all put\n   the account entry in the same rhythm as the navigation rows above it. So the\n   fill goes away entirely and the row earns its affordance from hover, the same\n   way every other row in this column does. What remains is the avatar, which is\n   the one element here that is genuinely a distinct object. */\n[class~='ET65mq_root'] {\n  border-radius: var(--lg-r-md);\n  background-color: transparent;\n  backdrop-filter: none;\n  -webkit-backdrop-filter: none;\n  box-shadow: none;\n  border: none;\n}\n\n[class~='ET65mq_trigger'] {\n  border-radius: var(--lg-r-md);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    transform var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='ET65mq_trigger']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='ET65mq_trigger']:active {\n  transform: scale(0.985);\n}\n\n/* The avatar is the one raised object in the row: a lit disc, not a hole. */\n[class~='ET65mq_avatar'] {\n  border-radius: var(--lg-r-pill);\n  background-color: var(--lg-glass-2);\n  box-shadow:\n    inset 0 0.5px 0 var(--lg-edge-top),\n    inset 0 0 0 0.5px var(--lg-hairline),\n    0 1px 2px rgba(16, 22, 40, 0.12);\n}\n\n/* The name is the row's label, so it takes label weight — the shipped row left\n   it at body weight, which made the account entry look like stray text. */\n[class~='ET65mq_label'] {\n  font-weight: 560;\n  letter-spacing: -0.004em;\n}\n\n[class~='KrzJGG_card'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-glass-tint);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n}\n\n/* ---- Secret / masked text ----------------------------------------- */\n[class~='fnygdG_mask'] {\n  border-radius: var(--lg-r-xs);\n  background-color: var(--lg-surface-sunken);\n  font-family: var(--ds-font-family-code);\n  letter-spacing: 0.08em;\n}\n\n/* ---- Open-in-app --------------------------------------------------- */\n[class~='WgQWqa_main'],\n[class~='WgQWqa_main'] {\n  border-radius: var(--lg-r-sm);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='WgQWqa_main']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* ---- Directory picker --------------------------------------------- */\n[class~='Fv-y6W_row'] {\n  border-radius: var(--lg-r-sm);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='Fv-y6W_row']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='Fv-y6W_rowSelected'] {\n  background-color: var(--lg-accent-soft);\n}\n\n[class~='Fv-y6W_crumbBar'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 1px 2px rgba(16, 22, 40, 0.04);\n}\n\n[class~='Fv-y6W_crumb'] {\n  border-radius: var(--lg-r-xs);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='Fv-y6W_crumb']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover-solid);\n}\n\n/* ---- Message feedback --------------------------------------------- */\n[class~='vpunvW_action'] {\n  border-radius: var(--lg-r-sm);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='vpunvW_action']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='FDoH3G_chip'] {\n  border-radius: var(--lg-r-pill);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 0 0 0.5px var(--lg-hairline);\n  transition:\n    background-color var(--lg-t-fast) var(--lg-ease-out),\n    box-shadow var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='FDoH3G_chip']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n[class~='FDoH3G_chip'][class~='FDoH3G_chipActive'] {\n  background-color: var(--lg-accent-soft);\n  color: var(--lg-accent);\n  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--lg-accent) 40%, transparent);\n}\n\n[class~='FDoH3G_detail'] {\n  border-radius: var(--lg-r-md);\n  background-color: var(--lg-surface-sunken);\n  box-shadow: inset 0 1px 2px rgba(16, 22, 40, 0.05);\n  border: none;\n}\n\n/* ---- Ask-question card -------------------------------------------- */\n[class~='LqhxcW_card'] {\n  border-radius: var(--lg-r-lg);\n  background-color: var(--lg-surface-raised);\n  box-shadow:\n    inset 0 0 0 0.5px var(--lg-hairline),\n    0 1px 3px rgba(16, 22, 40, 0.05);\n}\n\n[class~='LqhxcW_item'] {\n  border-radius: var(--lg-r-md);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='LqhxcW_item']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* ---- Goal bar / status line --------------------------------------- */\n[class~='nJdiTq_bar'] {\n  border-radius: var(--lg-r-md);\n}\n\n[class~='nJdiTq_iconBtn'] {\n  border-radius: var(--lg-r-sm);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n[class~='nJdiTq_iconBtn']:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* ---- Dockkit strip (tool strip inside the right dock) -------------- */\n[data-dockkit-host='dock'] {\n  background: transparent;\n}\n\n[data-dockkit-pointer] {\n  border-radius: var(--lg-r-pill);\n  background-color: var(--lg-accent-soft);\n  transition: background-color var(--lg-t-fast) var(--lg-ease-out);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  [class~='GjTS2W_card']:hover,\n  [class~='GjTS2W_card']:active,\n  [class~='rtYPxa_chip']:active {\n    transform: none;\n  }\n}\n"},{"id":"dsh-glass-theme/motion.css","css":"/* ==========================================================================\n   motion.css — the last sheet, and deliberately the smallest in intent.\n   --------------------------------------------------------------------------\n   Everything above this file draws surfaces. This file decides how they move,\n   and it exists because motion is the one property of an interface that cannot\n   be fixed surface by surface: if the sidebar plate takes 120ms and the menu\n   takes 300ms, the product feels assembled rather than designed, no matter how\n   good either one looks alone.\n\n   Three rules govern everything here.\n\n   One: motion is a consequence of state, never decoration. Nothing in this\n   file animates on load except a material arriving for the first time. There is\n   no idle animation, no ambient drift, no attention-seeking pulse. An interface\n   that moves without being touched is an interface asking for attention it was\n   not given.\n\n   Two: the same gesture always takes the same time. Press, release, hover and\n   selection all resolve inside the `--lg-t-*` ladder, so a fast flick across\n   three rows reads as one rhythm instead of three unrelated reactions.\n\n   Three: everything is interruptible. Transitions, not animations, wherever the\n   property is a value the user can re-target mid-flight. A row can be hovered\n   and unhovered faster than the transition completes, and the plate must follow\n   the pointer out of whatever intermediate opacity it had reached — which is\n   exactly what a CSS transition does and a keyframe animation does not.\n   ========================================================================== */\n\n/* --------------------------------------------------------------------------\n   1. One transition language for every interactive surface.\n   --------------------------------------------------------------------------\n   The shipped stylesheets declare transitions one component at a time, which is\n   why the timings disagree. Rather than restate each one, this block sets the\n   default duration and curve on the surfaces the app actually has, and lets the\n   per-surface sheets above override the *properties* they care about. Anything\n   already carrying a transition keeps it: these rules are written at the same\n   specificity and simply land later in the cascade, so a component that opted\n   into a specific duration still wins by writing it in a later sheet or with a\n   more specific selector.\n   -------------------------------------------------------------------------- */\n[class~='_2H3hWW_newSession'],\n[class~='_2H3hWW_panelRow'],\n[class~='_2H3hWW_toggle'],\n[class~='hIlkoa_sessionRow'],\n[class~='hIlkoa_projectRow'],\n[class~='fO69Vq_row'],\n[class~='wCInkW_navCell'],\n[class~='RlGAzG_primary'],\n[class~='RlGAzG_add'],\n[class~='RlGAzG_tools'] button,\n[class~='RlGAzG_trailing'] button,\n[class~='xz4KEq_toBottom'],\n[class~='GjTS2W_card'],\n[class~='rtYPxa_chip'],\n[class~='wq12jW_trigger'],\n[class~='dlU_AG_trigger'],\n[class~='mP3ANa_selector'],\n[class~='wq12jW_cell'],\n[class~='wCInkW_close'],\n[class~='iq1doa_pill'] {\n  transition-duration: var(--lg-t-fast);\n  transition-timing-function: var(--lg-ease-out);\n}\n\n/* Selection is a slower, calmer event than hover. A pointer crossing a row\n   should light it instantly; the row that becomes *selected* is a state change\n   the user is meant to register, so it settles rather than snaps. */\n[class~='_2H3hWW_panelActive'],\n[class~='hIlkoa_selected'],\n[class~='Dc7zOa_tabActive'],\n[class~='Dc7zOa_tab'] {\n  transition-duration: var(--lg-t-base);\n  transition-timing-function: var(--lg-ease-in-out);\n}\n\n/* --------------------------------------------------------------------------\n   2. Press, and release.\n   --------------------------------------------------------------------------\n   The shipped press states scale the control down and leave it there until the\n   pointer lifts. That reads as the control being *deformed* rather than pushed,\n   because a real surface under a finger compresses and then returns with a\n   little overshoot as the pressure goes away.\n\n   The asymmetry is the point: compression is fast (the finger is already\n   moving), release is slower and uses the spring curve. Declaring the faster\n   duration on `:active` and the slower one on the base selector gives exactly\n   that, because on release the base rule takes over.\n   -------------------------------------------------------------------------- */\n[class~='_2H3hWW_newSession']:active,\n[class~='hIlkoa_sessionRow']:active,\n[class~='hIlkoa_projectRow']:active,\n[class~='GjTS2W_card']:active,\n[class~='rtYPxa_chip']:active,\n[class~='fO69Vq_row']:active,\n[class~='xz4KEq_toBottom']:active {\n  transition-duration: 70ms;\n  transition-timing-function: var(--lg-ease-out);\n}\n\n[class~='_2H3hWW_newSession'],\n[class~='hIlkoa_sessionRow'],\n[class~='hIlkoa_projectRow'],\n[class~='GjTS2W_card'],\n[class~='rtYPxa_chip'],\n[class~='fO69Vq_row'],\n[class~='xz4KEq_toBottom'] {\n  transition-property: background-color, border-color, box-shadow, color, transform, opacity;\n  transition-duration: var(--lg-t-fast);\n  transition-timing-function: var(--lg-ease-spring);\n}\n\n/* --------------------------------------------------------------------------\n   3. Materials arrive; they do not fade in.\n   --------------------------------------------------------------------------\n   A translucent surface that fades from transparent to translucent passes\n   through a state where its backdrop-filter is partially applied, which on\n   Chromium produces a visible flash as the blur radius resolves. Scaling up\n   from 0.96 while the opacity comes in over a shorter window keeps the blur\n   fully active for the whole transition, so the material looks like it is being\n   placed rather than dissolving into existence.\n   -------------------------------------------------------------------------- */\n@keyframes lg-surface-in {\n  from {\n    opacity: 0;\n    transform: scale(0.96);\n  }\n  to {\n    opacity: 1;\n    transform: scale(1);\n  }\n}\n\n@keyframes lg-surface-out {\n  from {\n    opacity: 1;\n    transform: scale(1);\n  }\n  to {\n    opacity: 0;\n    transform: scale(0.98);\n  }\n}\n\n/* Menus and popovers grow out of the control that opened them. `transform-origin`\n   is set per-anchor by the sheets above where the anchor is known; the fallback\n   here is the top edge, which is right for the overwhelmingly common case of a\n   menu hanging below a button. */\n[class~='Z9Jnlq_menu'],\n[class*='_root_4ub78'],\n[class*='_card_1pq26'] {\n  animation: lg-surface-in var(--lg-t-base) var(--lg-ease-spring) both;\n  transform-origin: top center;\n  will-change: transform, opacity;\n}\n\n/* --------------------------------------------------------------------------\n   4. The travelling indicator.\n   -------------------------------------------------------------------------- */\n/* A selection plate that cross-fades between positions reads as two plates\n   blinking. One plate that slides reads as a single object that moved, and the\n   eye tracks it. This is the only place in the skin where a longer duration is\n   correct: the travel has to be slow enough to be followed. */\n[class~='_2H3hWW_panelActive']::before,\n[class~='hIlkoa_selected']::before {\n  transition:\n    transform var(--lg-t-base) var(--lg-ease-spring),\n    opacity var(--lg-t-fast) var(--lg-ease-out);\n}\n\n/* --------------------------------------------------------------------------\n   5. Reduced motion — a real answer, not a blanket kill.\n   --------------------------------------------------------------------------\n   base.css already collapses durations globally for this preference. That is\n   the correct floor, but it is not the whole answer: collapsing a spring to 1ms\n   turns a scale-up into a hard cut, and a hard cut on a material is more\n   jarring than the motion it replaced. What the preference actually asks for is\n   no *travel* — nothing may move across the screen — while state changes stay\n   legible.\n\n   So: transforms are removed outright rather than shortened, and the\n   transitions that carry meaning (colour, opacity, shadow) keep a short\n   duration so the change is still readable as a change.\n   -------------------------------------------------------------------------- */\n@media (prefers-reduced-motion: reduce) {\n  [class~='Z9Jnlq_menu'],\n  [class*='_root_4ub78'] {\n    animation: none;\n    opacity: 1;\n    transform: none;\n  }\n\n  /* No element may translate or scale on interaction. Colour and shadow carry\n     the feedback instead, which is what the surfaces above already provide. */\n  [class~='_2H3hWW_newSession']:active,\n  [class~='hIlkoa_sessionRow']:active,\n  [class~='hIlkoa_projectRow']:active,\n  [class~='GjTS2W_card']:active,\n  [class~='rtYPxa_chip']:active,\n  [class~='fO69Vq_row']:active,\n  [class~='xz4KEq_toBottom']:active,\n  [class~='RlGAzG_primary']:active:not(:disabled),\n  [class~='RlGAzG_tools'] button:active,\n  [class~='RlGAzG_trailing'] button:active,\n  [class~='wCInkW_close']:active,\n  [class~='fO69Vq_addPrimary']:active,\n  [class~='fO69Vq_addMore']:active {\n    transform: none;\n  }\n\n  /* Hover lifts are travel too. Keep the shadow change — that is depth, not\n     motion — and drop the displacement. */\n  [class~='GjTS2W_card']:hover,\n  [class~='rtYPxa_chip']:hover,\n  [class~='RlGAzG_card']:focus-within,\n  [class~='xz4KEq_toBottom']:hover {\n    transform: none;\n  }\n\n  [class~='_2H3hWW_panelActive']::before,\n  [class~='hIlkoa_selected']::before {\n    transition-duration: 1ms;\n  }\n\n  /* The running-state sheen and the live-session breath are the only looping\n     animations in the skin. Under this preference they become static marks: the\n     running divider keeps its tinted line, the session dot keeps its lit state,\n     and neither pulses. */\n  [class~='xz4KEq_runningDivider'],\n  [class~='hIlkoa_dot'] {\n    animation: none;\n  }\n}\n\n/* --------------------------------------------------------------------------\n   6. Touch: hover is not a state that exists.\n   --------------------------------------------------------------------------\n   On a pointer that cannot hover, every `:hover` reveal in this skin — the\n   assistant action row, the scrollbar thumb, the row action buttons — would\n   either never appear or appear and stick after a tap. Both are wrong. Where a\n   surface is hidden until hover, this block shows it; where hover only adds\n   emphasis, it is left alone.\n   -------------------------------------------------------------------------- */\n@media (hover: none) {\n  [class~='v5IAXa_actions'],\n  [class~='xD_KDq_actions'] {\n    opacity: 1;\n    transform: none;\n  }\n\n  /* Touch targets get the full row height back; the compacted hit areas above\n     assume a mouse can hit a 28px plate. */\n  [class~='hIlkoa_sessionRow'],\n  [class~='_2H3hWW_panelRow'] {\n    min-height: 36px;\n  }\n\n  /* Without hover there is no \"hover lift\", so pressed feedback has to carry\n     the whole interaction. The tint is already there; this only makes sure the\n     press is visible at all on a surface that has no pointer cursor to warn\n     the user something is interactive. */\n  [class~='GjTS2W_card']:active,\n  [class~='hIlkoa_sessionRow']:active {\n    background-color: var(--dsw-alias-interactive-bg-active);\n  }\n}\n\n/* --------------------------------------------------------------------------\n   7. Focus is not motion.\n   --------------------------------------------------------------------------\n   Keyboard focus must never animate in a way that delays the ring, because the\n   ring is the user's only confirmation that the key press landed. The ring\n   itself is an `outline` (see base.css) and so is not animated; what has to\n   settle instantly is the colour and transform transition on the focused\n   control, so the ring never arrives over a half-lit plate.\n   -------------------------------------------------------------------------- */\n[class~='_2H3hWW_newSession']:focus-visible,\n[class~='hIlkoa_sessionRow']:focus-visible,\n[class~='fO69Vq_row']:focus-visible,\n[class~='RlGAzG_primary']:focus-visible,\n[class~='xz4KEq_toBottom']:focus-visible,\n[class~='wCInkW_close']:focus-visible {\n  transition-duration: 0ms;\n}\n\n/* --------------------------------------------------------------------------\n   8. Long transcripts.\n   --------------------------------------------------------------------------\n   A conversation with a thousand tool rows is the normal case, not the edge\n   case, and every one of those rows carries a blur, a shadow and a transition.\n   `content-visibility` lets the engine skip layout and paint for rows far\n   outside the viewport while keeping them in the DOM and in the accessibility\n   tree, which is exactly the trade this needs. `contain-intrinsic-size` gives\n   the engine a placeholder height so the scrollbar does not jump as rows\n   resolve.\n\n   This is the one performance rule in the skin, and it is here rather than in\n   conversation.css because it is what makes the motion above affordable.\n   -------------------------------------------------------------------------- */\n[class~='xz4KEq_flowItem'] {\n  content-visibility: auto;\n  contain-intrinsic-size: auto 72px;\n}\n\n/* Never let the engine skip the row that is actually streaming: its height\n   changes every frame and a resolved placeholder would fight the live content. */\n[class~='xz4KEq_flowItem'][data-streaming],\n[class~='xz4KEq_flowItem'][data-running] {\n  content-visibility: visible;\n}\n"}];

		/** @type {object} — inlined from src/catalog.js at build time. */
		const catalog = {
  /**
   * Provider identity: the monogram tile, its tint, and the one-line summary in
   * the quick-provider row. `tone` resolves to `--lg-tint-<tone>` in model.css,
   * so a new provider needs one CSS variable, not a new rule.
   */
  providers: {
    'DeepSeek Account': { key: 'deepseek', mark: 'DS', tone: 'deepseek', label: 'DeepSeek', note: '官方账号' },
    workbuddy: { key: 'workbuddy', mark: 'WB', tone: 'workbuddy', label: 'WorkBuddy', note: '按倍率计费' },
    'zai-coding-cn': { key: 'zai', mark: 'Z', tone: 'zai', label: '智谱', note: '编码套餐' },
    Gemini: { key: 'gemini', mark: 'G', tone: 'gemini', label: 'Gemini', note: '订阅' },
    Grok: { key: 'grok', mark: 'X', tone: 'grok', label: 'Grok', note: '订阅' },
    'ChatGPT subscription': { key: 'openai', mark: 'AI', tone: 'openai', label: 'ChatGPT', note: '订阅' },
  },

  /**
   * Model families — which icon a row gets, independent of who resells it
   * (workbuddy serves GPT, Gemini, Kimi and GLM under one account). Matched
   * against the row label; FIRST HIT WINS, so specific names come before
   * generic ones.
   */
  families: [
    { key: 'deepseek', mark: 'DS', tone: 'deepseek', test: /deepseek/i },
    { key: 'gpt', mark: 'GP', tone: 'openai', test: /gpt|sol|terra|luna|astra|reserve/i },
    { key: 'gemini', mark: 'GE', tone: 'gemini', test: /gemini/i },
    { key: 'grok', mark: 'GR', tone: 'grok', test: /grok/i },
    { key: 'kimi', mark: 'KM', tone: 'kimi', test: /kimi|moonshot/i },
    { key: 'glm', mark: 'GL', tone: 'zai', test: /glm|zhipu|z\.ai/i },
    { key: 'minimax', mark: 'MM', tone: 'minimax', test: /minimax/i },
    { key: 'step', mark: 'ST', tone: 'step', test: /step/i },
    { key: 'hunyuan', mark: 'HY', tone: 'hunyuan', test: /^hy\d|hunyuan/i },
    { key: 'router', mark: 'AU', tone: 'router', test: /^auto$/i },
    { key: 'tier', mark: 'WB', tone: 'workbuddy', test: /^(fast|balanced|primary)$/i },
  ],

  /**
   * Description RULES, tried in order after the exact-name table above.
   *
   * The exact table only covers the models on screen today; a reseller adds
   * rows without asking, and a row with no line reads as an unfinished menu.
   * These are the same two-stage rules the reference implementation ships
   * (family first, then tier), so a model nobody hand-described still gets a
   * truthful sentence about what its line is for.
   *
   * FAMILY rules describe a MODEL LINE and are deliberately version-agnostic:
   * a retired Flash and a future one say the same thing. Order matters — the
   * anchored `deepseek.*flash` must come before the bare `deepseek`, or every
   * DeepSeek row inherits the generic line.
   */
  descriptionRules: [
    { test: "deepseek.*flash", text: "非对称模型结构，小成本大智能。" },
    { test: "deepseek.*pro", text: "性能比肩顶级闭源模型。" },
    { test: "deepseek", text: "更强、更快、更普惠。" },
    { test: "claude.*fable", text: "新一代智能，专为解决最艰深的知识工作和编程难题。" },
    { test: "claude.*mythos", text: "面向网络安全与生物学研究的可靠模型。" },
    { test: "claude.*opus", text: "面向复杂编程与 AI 智能体的混合推理模型。" },
    { test: "claude.*sonnet", text: "面向实时智能体与高吞吐的混合推理模型。" },
    { test: "claude.*haiku", text: "面向速度敏感的高吞吐场景，响应快、成本低。" },
    { test: "claude", text: "Anthropic Claude 模型。" },
    { test: "codex", text: "为 Codex 智能体编程优化，可并行处理多项软件工程任务。" },
    { test: "gpt[._-]?5[._-]?4(?!\\d)", text: "面向编程与专业工作的长上下文模型。" },
    { test: "gpt-?5", text: "内置思考、可配置推理强度，面向编程与智能体任务。" },
    { test: "(^|[/-])o[1-9](-|$)", text: "作答前深入思考，从 o1 到 o3 与 o4-mini。" },
    { test: "gpt-oss|oss-\\d", text: "OpenAI 开发的开放权重推理模型。" },
    { test: "gpt", text: "支持文本与图像输入、多语言。" },
    { test: "gemini.*(pro|ultra|Argon)", text: "面向复杂任务、深度推理与多模态理解。" },
    { test: "gemini.*flash", text: "速度与成本优先，面向规模化智能体任务与高频低延迟场景。" },
    { test: "gemini", text: "原生理解文本、图像、视频与音频。" },
    { test: "gemma", text: "源自 Gemini 研究，从云端服务器到手机都能运行。" },
    { test: "nano-?banana", text: "Gemini 图像生成与编辑模型，支持自然语言对话式创建与修改。" },
    { test: "glm[._-]?5[._-]?3.*flashx", text: "GLM 5.3 flash的高吞吐版本。" },
    { test: "glm[._-]?5[._-]?3.*flash", text: "GLM-5系列的首个原生多模态模型。" },
    { test: "glm[._-]?5[._-]?3(?!\\d)", text: "最强开放权重编程模型之一，拓展智能上界的可及边界。" },
    { test: "glm.*flash", text: "更快更省的多模态推理，兼顾长上下文与日常编程。" },
    { test: "glm", text: "覆盖对话、编程与智能体，支持思考模式与函数调用。" },
    { test: "kimi.*(k3|k-?3)|(^|[^a-z0-9])k-?3", text: "面向编程与知识工作的 2.8T 开放权重模型。" },
    { test: "kimi.*(cod(e|ing)|k2[._-]?7).*highspeed", text: "面向长程编程的开放权重智能体模型高速版。" },
    { test: "kimi.*(cod(e|ing)|k2[._-]?7)", text: "面向长程编程的开放权重智能体模型。" },
    { test: "kimi", text: "原生支持文本、图像与视频输入，含思考模式与工具调用。" },
    { test: "qwen[._-]?3[._-]?8.*max", text: "面向编程与办公，2.4 万亿参数 MoE，1M 上下文、思考模式与内置工具。" },
    { test: "qwen.*(coder|code)", text: "开放权重 MoE，面向补全、生成与仓库级修改。" },
    { test: "qwen.*(flash|turbo)", text: "响应快、成本低，工具调用与长上下文支持完整。" },
    { test: "qwen.*plus", text: "能力与成本均衡，完整工具调用支持。" },
    { test: "qwen.*a\\d+b", text: "总参大、激活参数少，单位成本低于同规模稠密模型。" },
    { test: "qwen.*[-_]\\d+b($|[^a-z])", text: "可本地或低成本部署。" },
    { test: "qwen", text: "开放权重与云端 API 并行，覆盖文本、图像、音频与视频。" },
    { test: "step[._-]?5(?!\\d)", text: "面向编程与专业知识工作，原生图文视频输入，1M 上下文。" },
    { test: "step[._-]?3[._-]?7.*flash", text: "面向智能体与代码任务，198B/11B 稀疏 MoE，图像与视频理解，256K 上下文，最高 400 tokens/s。" },
    { test: "step", text: "覆盖文本推理、多模态与语音，经官方开放平台提供。" },
    { test: "minimax.*m3|(^|[^a-z0-9])m3($|-)", text: "首个集前沿编程、1M 上下文与原生多模态于一身的开放权重模型。" },
    { test: "minimax|(^|[^a-z0-9])m2[-.]?\\d", text: "主打智能体推理、工具调用、编程与多模态输入，面向长上下文任务。" },
    { test: "muse-spark", text: "小而快、原生多模态推理，驱动 Meta AI。" },
    { test: "celeris[._-]?1(-|$)", text: "生成速度 1,664 tokens/s，超过 Mercury 2 的 5 倍，MMLU-Pro 75.9%。" },
    { test: "celeris", text: "扩散架构大语言模型，主打超低延迟生成。" },
    { test: "mercury-?\\d|inception", text: "面向代码生成，H100 上超 1,000 tokens/s，速度最高为同类模型的 10 倍。" },
    { test: "apodex", text: "面向复杂专业工作、金融与科研，1.1 mini 为 35B、可本地部署。" },
    { test: "motif", text: "MIT 许可，314B 总参 / 13.2B 激活，256K 上下文。" },
    { test: "grok[._-]?4(?!\\d)", text: "全球最智能的模型之一，支持原生工具使用以及实时搜索功能。" },
    { test: "grok", text: "覆盖编程、智能体与知识工作，API 支持多模态输入。" },
    { test: "doubao.*2[._-]?1(?!\\d)|seed[._-]?2[._-]?1(?!\\d)", text: "分 Pro 与 Turbo 两档的新一代生产力智能体，以通用任务与代码见长。" },
    { test: "doubao|seed-?\\d|volc", text: "经 50+ 内部业务场景验证，每日千亿级 token 用量打磨，支持多模态。" },
    { test: "ernie[._-]?5([._-]?0)?(-|$)", text: "2.4 万亿参数的原生全模态大模型。" },
    { test: "ernie", text: "产业级知识增强，支持中文理解与多模态生成。" },
    { test: "hunyuan|(^|[^a-z0-9])hy\\d", text: "中文理解与智能体场景表现均衡。" },
    { test: "codestral", text: "面向补全、FIM 与生成，128K 上下文。" },
    { test: "mistral.*large[._-]?3(?!\\d)", text: "Apache 2.0 开放权重多模态模型，细粒度 MoE，675B 总参 / 41B 激活，256K 上下文。" },
    { test: "mistral|magistral", text: "从云端到边缘的前沿模型，开放权重与商用并行，可 API 调用或自托管。" },
    { test: "llama", text: "可自由微调、蒸馏并部署到任何环境。" },
    { test: "north", text: "整合大模型、搜索与自动化成一个企业级安全工作空间。" },
    { test: "command-?[ar]|cohere", text: "面向工具调用、RAG 与多语言，Command A 为 111B/256K。" },
    { test: "phi-?\\d", text: "面向边缘与本地部署，Phi-4 以 14B 专注推理、数学与代码。" },
    { test: "(^|[^a-z0-9])nova(-|$)", text: "Micro/Lite/Pro/Premier 四档，支持文本、图像与视频输入。" },
    { test: "sonar|perplexity", text: "结合实时网络信息与引用的搜索 API，从轻量 Sonar 到多步深研 Sonar Pro。" },
  ],

  /**
   * TIER rules run only when no family matched. They read the SIZE/VARIANT
   * suffix of the name, which is the one thing every vendor spells the same
   * way. The two parameter-count rules come last and are anchored so that a
   * sparse-MoE suffix is not mistaken for a small dense model.
   */
  tierRules: [
    { test: "flash|mini|lite|nano|turbo|air|small|swift|highspeed|fast|instant", text: "响应快、成本低，适合简单或高频任务。" },
    { test: "pro|max|ultra|opus|thinking|reasoner|plus|large|advanced|heavy|frontier", text: "适合复杂或质量优先的任务，成本更高。" },
    { test: "a\\d+b", text: "总参大、激活参数少，单位成本低于同规模稠密模型。" },
    { test: "(^|[-_])\\d+b($|[^a-z])", text: "可本地或低成本部署。" },
  ],

  /**
   * One line per model, in the voice a person uses when choosing: what it is
   * FOR, not what it is. Kept short so it never truncates at the menu's 240px
   * floor. Keys are normalised (see the header).
   */
  descriptions: {
    'DeepSeek-V4.1-Flash': '日常对话与代码，速度优先',
    'DeepSeek-V4-Pro': '复杂推理与长任务',
    'DeepSeek-V3.2': '上一代通用模型',
    Auto: '按任务自动选择模型',
    Fast: '最快响应，适合简单任务',
    Balanced: '速度与质量的平衡点',
    Primary: '最强推理，适合难题',
    'Kimi-K2.8-Preview': '长上下文与中文写作',
    'Kimi-K3': '长文档与深度阅读',
    'Kimi-K2.6': '稳定版长上下文',
    'GLM-5.3-Flash': '智谱快速版，响应敏捷',
    'GLM-5.3': '智谱主力，综合均衡',
    'GLM-5.3 Highspeed': '极速版，适合轻量任务',
    'GLM-5.2': '上一代智谱主力',
    'GLM-4.6V': '支持图像理解',
    'GPT-6-Astra': '最新旗舰，最强通用能力',
    'GPT-6-Sol': '旗舰推理，擅长复杂代码',
    'GPT-6-Luna': '轻量旗舰，性价比高',
    'GPT-6.1-Sol': '旗舰推理的迭代版本',
    'GPT-5.6-Sol': '高难度代码与推理',
    'GPT-5.6-Terra': '均衡型主力模型',
    'GPT-5.6-Luna': '快速响应，日常首选',
    'GPT-5.5': '成熟稳定的通用模型',
    'GPT-5.4': '上一代通用模型',
    'GPT-Reserve': '实验性备用模型',
    'GPT-Reserve (Experimental)': '实验性备用模型，能力未定',
    'Gemini-3.5-Flash': '谷歌快速模型，多模态',
    'Gemini-3.8-Flash': '谷歌新一代快速模型',
    'Gemini 3.8 flash': '谷歌新一代快速模型',
    'Grok-4.7': '实时信息与推理',
    'Grok 4.7': '实时信息与推理',
    'MiniMax-M3.1-Flash': '长文本与语音场景',
    'Hy4 preview': '腾讯混元预览版',
    Hy3: '腾讯混元上一代',
    'Step-5-Preview': '阶跃星辰预览版',
  },

  /**
   * DeepSeek's published peak/off-peak schedule, as of 2026-10.
   *
   * Source: https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
   *   空闲时段价格 = 高峰时段价格的一半
   *   高峰时段 = 北京时间 周一至周五（不含法定节假日）9:00–12:00、14:00–18:00
   *   其余时段（含周末及法定节假日全天）为 空闲时段
   *
   * The holiday list is the part worth being careful about. 中国法定节假日 are
   * declared by the State Council each year and the 调休 (make-up work days)
   * that go with them move actual weekdays around, so a rule that only looks
   * at the weekday is wrong on roughly a dozen days a year — and those are
   * exactly the days a reader checks the chip. The dates below are the 2026
   * holiday days only; they are NOT recomputed, and the year is therefore part
   * of the data rather than of the logic. When the year rolls over the chip
   * stops claiming holiday accuracy for dates it has no table for: `holidays`
   * is keyed by year and a missing year simply falls back to the weekday rule.
   *
   * The schedule applies to the FIRST-PARTY DeepSeek account only. workbuddy
   * rows reuse DeepSeek names but are billed by the reseller's own `· xN.NN`
   * multiplier, which is a different quantity and must not be mixed in.
   */
  pricing: {
    providerKeys: ['deepseek'],
    windows: [
      [9 * 60, 12 * 60],
      [14 * 60, 18 * 60],
    ],
    weekdaysOnly: true,
    offPeakFactor: 0.5,
    /** Beijing time, regardless of where the window happens to be. */
    utcOffsetMinutes: 8 * 60,
    /** 中国法定节假日 (rest days), by Beijing calendar date. 调休 work days are
     *  NOT included: they are ordinary weekdays and the weekday rule already
     *  treats them as peak, which is what the published schedule says. */
    holidays: {
      2026: [
        '01-01', '01-02', '01-03',
        '02-15', '02-16', '02-17', '02-18', '02-19', '02-20', '02-21', '02-22', '02-23',
        '04-04', '04-05', '04-06',
        '05-01', '05-02', '05-03', '05-04', '05-05',
        '06-19', '06-20', '06-21',
        '09-25', '09-26', '09-27',
        '10-01', '10-02', '10-03', '10-04', '10-05', '10-06', '10-07',
      ],
    },
  },
};

		/** @type {Function} — inlined from src/picker.js at build time. */
		const createPicker = function createPicker(require, ctx, catalog) {
	const React = require('react');
	const ReactDOM = require('react-dom/client');
	const ReactDOMShared = require('react-dom');

	/** Reference-compatible provider monograms, drawn as text. */
	const MARK = {
		'DeepSeek Account': 'DS',
		workbuddy: 'WB',
		'zai-coding-cn': 'GLM',
		Gemini: 'GM',
		Grok: 'X',
		'ChatGPT subscription': 'GPT',
	};

	/** The class names this layer emits. Plain, unhashed, ours. */
	const C = {
		root: 'lg-picker',
		trigger: 'lg-picker-trigger',
		lockup: 'lg-picker-lockup',
		label: 'lg-picker-label',
		effort: 'lg-picker-effort',
		chevron: 'lg-picker-chevron',
		card: 'lg-picker-card',
		cardAll: 'lg-picker-card-all',
		section: 'lg-picker-section',
		heading: 'lg-picker-heading',
		mark: 'lg-picker-mark',
		count: 'lg-picker-count',
		option: 'lg-picker-option',
		copy: 'lg-picker-copy',
		name: 'lg-picker-name',
		desc: 'lg-picker-desc',
		check: 'lg-picker-check',
		badge: 'lg-picker-badge',
		footer: 'lg-picker-footer',
		more: 'lg-picker-more',
		search: 'lg-picker-search',
		empty: 'lg-picker-empty',
		effortRow: 'lg-picker-effort-row',
		effortValue: 'lg-picker-effort-value',
		effortPane: 'lg-picker-effort-pane',
		effortOption: 'lg-picker-effort-option',
		back: 'lg-picker-back',
		pin: 'lg-picker-pin',
		headingName: 'lg-picker-headingName',
	};

	/* ---- quick providers ------------------------------------------------
	   Which providers are "quick" is the user's choice, and it has to survive
	   a reload, so it lives in localStorage under a namespaced key. The
	   reference keeps this in its host settings; a skin has no host
	   configuration surface of its own that the client can read, and inventing
	   a round trip for six booleans would be worse than the six booleans. */
	const QUICK_KEY = 'dsh-glass-theme:quick-providers';
	const QUICK_MAX = 4;

	/* The picker and the settings page must agree on the limit; the number lives
	   here and settings-section.js keeps its own copy, so a change has to touch
	   both. They are separate files because they are spliced separately. */
	function readQuick() {
		try {
			const raw = window.localStorage.getItem(QUICK_KEY);
			if (raw === null) return null;
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return null;
			return parsed.filter((value) => typeof value === 'string');
		} catch (error) {
			return null;
		}
	}

	/** The quick list changed on the settings page (or in another window). */
	function subscribeQuick(onChange) {
		try {
			window.addEventListener('lg-quick-providers', onChange);
			window.addEventListener('storage', onChange);
			return () => {
				window.removeEventListener('lg-quick-providers', onChange);
				window.removeEventListener('storage', onChange);
			};
		} catch (error) {
			return () => {};
		}
	}

	function writeQuick(list) {
		try {
			window.localStorage.setItem(QUICK_KEY, JSON.stringify(list));
		} catch (error) {
			/* a private-mode quota failure must not break the picker */
		}
	}

	/** Reference's description cascade: exact table, then family, then tier. */
	const descriptions = (catalog && catalog.descriptions) || {};
	/* The catalog is authored as a bare object expression, so its matchers
	   arrive as REGEX LITERALS, not strings — `typeof test` is "object" and a
	   string-only guard silently drops every one of them. Read `source` so
	   both authoring styles work. */
	const ruleSource = (rule) => {
		if (typeof rule === 'string') return rule;
		if (rule && typeof rule.source === 'string') return rule.source;
		return '';
	};
	const tierRules = [];
	for (const rule of (catalog && catalog.descriptionRules) || []) {
		const source = ruleSource(rule && rule.test);
		if (source === '' || typeof rule.text !== 'string') continue;
		try {
			tierRules.push({ re: new RegExp(source, 'i'), text: rule.text });
		} catch (error) {
			/* skipped */
		}
	}
	for (const rule of (catalog && catalog.tierRules) || []) {
		const source = ruleSource(rule && rule.test);
		if (source === '' || typeof rule.text !== 'string') continue;
		try {
			tierRules.push({ re: new RegExp(source, 'i'), text: rule.text });
		} catch (error) {
			/* skipped */
		}
	}

	const normalise = (value) => String(value == null ? '' : value).toLowerCase().replace(/[\s._·\-–—]/g, '');

	/* "Fast · x0.34" → { name: "Fast", mult: "×0.34" }. The ratio is a
	   RESELLER price ratio, not the peak/off-peak factor; keeping them apart
	   stops one number from being read as the other. */
	const MULTIPLIER_RE = /^(.*?)\s*·\s*x\s*([\d.]+)\s*$/i;
	function splitMultiplier(label) {
		const raw = String(label == null ? '' : label);
		const match = MULTIPLIER_RE.exec(raw);
		if (!match) return { name: raw, mult: '' };
		return { name: match[1].trim(), mult: '×' + match[2] };
	}

	/* The table is keyed by the human model name ("DeepSeek-V4.1-Flash") while
	   lookups are normalised, so the table has to be normalised ONCE at build
	   time — comparing a normalised key against raw keys silently missed all
	   35 entries and pushed every row down to the generic family line. */
	const descTable = new Map();
	for (const key of Object.keys(descriptions)) {
		const value = descriptions[key];
		if (typeof value !== 'string' || value.trim() === '') continue;
		descTable.set(normalise(key), value.trim());
	}

	/** The reference's lookup order, preserved: explicit, exact, family, tier. */
	function describe(name, explicit) {
		const key = normalise(name);
		/* The curated table wins over the host's own `description`. That field is
		   raw provider copy — the live directory returns full ENGLISH sentences
		   for some rows ("Stronger agentic coding, knowledge, and difficult
		   reasoning; suited to complex or quality-critical tasks at higher
		   cost."), which in a 360px card ellipsises after three words and leaves
		   the reader with a truncated sentence instead of a one-line summary.
		   A localised, hand-written line is the better answer wherever we have
		   one; the host text is the fallback, not the headline. */
		if (descTable.has(key)) return descTable.get(key);
		if (typeof explicit === 'string' && explicit.trim() !== '') return explicit.trim();
		/* `families` exists to pick a MARK and a TONE; it carries no copy, so it
		   must not be consulted for text — returning its empty `text` would end
		   the cascade before the tier rules ever ran. */
		for (const rule of tierRules) if (rule.re.test(name)) return rule.text || '';
		return '';
	}

	/** Provider monogram: the reference's lockups, reduced to a readable mark. */
	function markFor(group) {
		const named = MARK[group && group.name ? group.name : ''] || MARK[group && group.id ? group.id : ''];
		if (named) return named;
		const source = String((group && (group.name || group.id)) || '?').replace(/[^A-Za-z0-9]/g, '');
		return (source.slice(0, 2) || '?').toUpperCase();
	}

	/* ---- peak / off-peak --------------------------------------------------
	   The reference fetches a catalog from its host half. This port keeps the
	   schedule local so the badge works with no network, and states the reason
	   rather than only the state: "off-peak" on a Wednesday and "off-peak" on
	   National Day are different facts and the chip says which applies. */
	const PRICING = (catalog && catalog.pricing) || null;
	const BEIJING_OFFSET = (PRICING && PRICING.utcOffsetMinutes) || 480;

	function beijingStamp(ms) {
		const shifted = new Date(ms + BEIJING_OFFSET * 60000);
		const year = shifted.getUTCFullYear();
		const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
		const day = String(shifted.getUTCDate()).padStart(2, '0');
		return {
			weekday: shifted.getUTCDay(),
			minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
			md: month + '-' + day,
			year: String(year),
		};
	}

	function holidayTable() {
		if (!PRICING || !PRICING.holidays) return null;
		return PRICING.holidays;
	}

	function isHoliday(stamp) {
		const table = holidayTable();
		if (!table) return false;
		const year = table[stamp.year];
		return Array.isArray(year) && year.indexOf(stamp.md) >= 0;
	}

	function isPeak(stamp) {
		if (stamp.weekday === 0 || stamp.weekday === 6) return false;
		if (isHoliday(stamp)) return false;
		if (!PRICING || !Array.isArray(PRICING.windows)) return false;
		for (const span of PRICING.windows) {
			if (stamp.minutes >= span[0] && stamp.minutes < span[1]) return true;
		}
		return false;
	}

	function humanLeft(ms) {
		const total = Math.max(0, Math.round(ms / 60000));
		const days = Math.floor(total / 1440);
		const hours = Math.floor((total % 1440) / 60);
		const minutes = total % 60;
		if (days > 0) return days + ' 天 ' + hours + ' 小时';
		if (hours > 0) return hours + ' 小时 ' + minutes + ' 分';
		return minutes + ' 分';
	}

	let cachedPrice = null;
	let cachedAt = 0;
	function price() {
		const now = Date.now();
		if (cachedPrice !== null && now - cachedAt < 20000) return cachedPrice;
		const today = beijingStamp(now);
		const peak = isPeak(today);
		/* Walk forward a minute at a time to the next boundary. The windows are
		   at most a day apart, so eight days is a safe ceiling for a holiday. */
		let switchAt = null;
		const limit = now + 8 * 86400000;
		for (let probe = now + 60000; probe < limit; probe += 60000) {
			if (isPeak(beijingStamp(probe)) !== peak) {
				switchAt = probe;
				break;
			}
		}
		let reason = 'window';
		if (isHoliday(today)) reason = 'holiday';
		else if (today.weekday === 0 || today.weekday === 6) reason = 'weekend';
		cachedPrice = { peak, reason, switchAt };
		cachedAt = now;
		return cachedPrice;
	}

	/* ---- the seat -------------------------------------------------------- */

	/** Read the session id the way the reference does, then fall back. */
	function sessionIdFor() {
		try {
			const ui = ctx.get('uiSession');
			const live = ui && ui.current && ui.current.value;
			if (live && typeof live.key === 'string') return live.key;
		} catch (error) {
			/* service absent */
		}
		try {
			const sessions = ctx.get('sessions');
			const current = sessions && sessions.list && sessions.list.getSnapshot().current;
			if (typeof current === 'string') return current;
		} catch (error) {
			/* service absent */
		}
		return null;
	}

	function directoryFor(sessionId) {
		try {
			const models = ctx.get('modelDirectories');
			if (!models || typeof models.directoryFor !== 'function') return null;
			return models.directoryFor(sessionId);
		} catch (error) {
			return null;
		}
	}

	function Picker() {
		const [sessionId, setSessionId] = React.useState(sessionIdFor);
		const [directory, setDirectory] = React.useState(() => directoryFor(sessionIdFor()));
		const [snapshot, setSnapshot] = React.useState(() => {
			const first = directoryFor(sessionIdFor());
			try {
				return first && first.store ? first.store.getSnapshot() : null;
			} catch (error) {
				return null;
			}
		});
		const [open, setOpen] = React.useState(false);
		const [pane, setPane] = React.useState('root');
		const [query, setQuery] = React.useState('');
		const [tick, setTick] = React.useState(0);
		const [placement, setPlacement] = React.useState(null);
		const [quick, setQuick] = React.useState(() => readQuick());
		const anchor = React.useRef(null);
		const cardRef = React.useRef(null);
		const allRef = React.useRef(null);
		/* The second card. It exists only when a quick-provider list is
		   configured: without one the first card already lists everything, so a
		   second panel would be a door into the same room. */
		const [allOpen, setAllOpen] = React.useState(false);
		const [allQuery, setAllQuery] = React.useState('');
		const [allPlacement, setAllPlacement] = React.useState(null);

		/* The card is `position: fixed` (a popover must escape the composer's
		   overflow), so it has no anchor of its own: place it above the trigger,
		   right-aligned, then clamp it into the viewport. The composer sits at the
		   bottom of the window, so "above" is the only side with room. */
		React.useLayoutEffect(() => {
			if (!open) {
				setPlacement(null);
				setAllPlacement(null);
				return;
			}
			const place = () => {
				const trigger = anchor.current;
				const card = cardRef.current;
				if (trigger === null || card === null) return;
				const a = trigger.getBoundingClientRect();
				const b = card.getBoundingClientRect();
				const gap = 8;
				const margin = 10;
				let top = a.top - b.height - gap;
				if (top < margin) top = Math.min(a.bottom + gap, window.innerHeight - b.height - margin);
				let left = a.right - b.width;
				if (left < margin) left = margin;
				if (left + b.width > window.innerWidth - margin) left = window.innerWidth - margin - b.width;
				top = Math.max(margin, Math.min(top, window.innerHeight - b.height - margin));
				setPlacement({ top: Math.round(top), left: Math.round(left) });
				/* The sub-card opens to the LEFT of the card it extends, the way a
				   submenu opens away from the edge it is anchored to. If there is no
				   room it opens to the right instead of going off-screen. */
				const extra = allRef.current;
				if (extra === null) {
					setAllPlacement(null);
					return;
				}
				const c = extra.getBoundingClientRect();
				let allLeft = left - c.width - 6;
				if (allLeft < margin) allLeft = Math.min(left + b.width + 6, window.innerWidth - margin - c.width);
				let allTop = top;
				if (allTop + c.height > window.innerHeight - margin) allTop = window.innerHeight - margin - c.height;
				setAllPlacement({ top: Math.round(Math.max(margin, allTop)), left: Math.round(Math.max(margin, allLeft)) });
			};
			place();
			window.addEventListener('resize', place);
			return () => window.removeEventListener('resize', place);
		}, [open, allOpen]);

		/* The session can change under us (a new conversation, a switch in the
		   sidebar). Re-resolve on a slow poll rather than subscribing to a service
		   we do not own; the reference does the same through its own hook. */
		React.useEffect(() => {
			const sync = () => {
				const next = sessionIdFor();
				if (next === sessionId) return;
				setSessionId(next);
				setDirectory(directoryFor(next));
			};
			if (typeof setInterval !== 'function') return undefined;
			const timer = setInterval(sync, 900);
			return () => clearInterval(timer);
		}, [sessionId]);

		React.useEffect(() => {
			if (!directory || !directory.store) return undefined;
			let live = true;
			const read = () => {
				if (!live) return;
				try {
					setSnapshot(directory.store.getSnapshot());
				} catch (error) {
					/* a torn store read is not fatal */
				}
			};
			read();
			try {
				directory.load && directory.load();
			} catch (error) {
				/* the host may be offline */
			}
			let stop = null;
			try {
				stop = directory.store.subscribe(read);
			} catch (error) {
				stop = null;
			}
			return () => {
				live = false;
				if (typeof stop === 'function') stop();
			};
		}, [directory]);

		/* The badge counts down, so it needs a heartbeat while it is visible. */
		React.useEffect(() => {
			if (!open) return undefined;
			if (typeof setInterval !== 'function') return undefined;
			const timer = setInterval(() => setTick((value) => value + 1), 20000);
			return () => clearInterval(timer);
		}, [open]);

		/* The quick list is edited on the settings page, which is a different
		   React tree in a different part of the DOM. Without this the picker keeps
		   showing the old list until a reload, which reads as "the setting did not
		   save". */
		React.useEffect(() => subscribeQuick(() => setQuick(readQuick())), []);

		/* Close on outside press and on Escape. */
		React.useEffect(() => {
			if (!open) return undefined;
			const onDown = (event) => {
				const node = anchor.current;
				if (node && event.target instanceof Node && node.contains(event.target)) return;
				if (event.target instanceof Element && event.target.closest('.' + C.card)) return;
				setOpen(false);
				setPane('root');
				setAllOpen(false);
			};
			const onKey = (event) => {
				if (event.key !== 'Escape') return;
				/* The sub-card is the topmost layer, so Escape closes it first and
				   leaves the picker behind it open. */
				if (allOpen) {
					setAllOpen(false);
					return;
				}
				setOpen(false);
				setPane('root');
			};
			document.addEventListener('pointerdown', onDown, true);
			document.addEventListener('keydown', onKey, true);
			return () => {
				document.removeEventListener('pointerdown', onDown, true);
				document.removeEventListener('keydown', onKey, true);
			};
		}, [open, allOpen]);

		const current = snapshot && snapshot.current ? snapshot.current : null;
		const groups = snapshot && Array.isArray(snapshot.groups) ? snapshot.groups : [];
		const routable = snapshot && snapshot.routable ? snapshot.routable : null;

		/* A model id is only unique INSIDE its provider. The live catalog has
		   `deepseek-v4.1-flash` under both DeepSeek Account and workbuddy (and
		   two workbuddy rows share the same label with different ratios), so a
		   selection test on the model id alone reports every same-named row as
		   selected. Both halves of the pair are required. */
		const isCurrent = (group, model) =>
			current !== null && current.provider === group.id && current.model === model.id;

		const currentLabel = (() => {
			if (!current) return '选择模型';
			for (const group of groups) {
				if (group.id !== current.provider) continue;
				for (const model of group.models || []) {
					if (model.id === current.model) return model.name || model.id;
				}
			}
			/* The provider may have dropped the model since it was chosen; fall
			   back to any provider so the trigger still names something real. */
			for (const group of groups) {
				for (const model of group.models || []) {
					if (model.id === current.model) return model.name || model.id;
				}
			}
			return current.model || '选择模型';
		})();

		/* The reasoning ladder belongs to the SELECTED MODEL, not the picker:
		   `reasoning` is optional per model and its `efforts` are the only legal
		   values. Read it from the same (provider, model) pair. */
		const currentModel = (() => {
			if (!current) return null;
			for (const group of groups) {
				if (group.id !== current.provider) continue;
				for (const model of group.models || []) if (model.id === current.model) return model;
			}
			return null;
		})();
		const reasoning = currentModel && currentModel.reasoning ? currentModel.reasoning : null;
		const effortChoices = reasoning && Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
		/* The trigger is the narrowest place the ratio appears (the composer
		   dock), so the badge form used inside the card is too heavy here — the
		   name is shown bare and the ratio becomes a quiet suffix. */
		const currentBare = splitMultiplier(currentLabel);
		/* The effort the session is actually running on: an explicit choice when
		   one was made, the model's own default when it was not. A fresh session
		   carries no `reasoningEffort` at all — showing "默认" there would hide
		   the number the host is really using. */
		const activeEffort = current !== null && current.reasoningEffort !== undefined && current.reasoningEffort !== null
			? current.reasoningEffort
			: reasoning && reasoning.defaultEffort !== undefined
			? reasoning.defaultEffort
			: null;
		const isDefaultEffort = activeEffort !== null && (current === null || current.reasoningEffort === undefined || current.reasoningEffort === null);
		const effortLabel = (() => {
			if (activeEffort === null) return '';
			for (const level of effortChoices) if (level.id === activeEffort) return level.name || level.id;
			return activeEffort;
		})();

		const select = (group, model) => {
			if (!directory || typeof directory.select !== 'function') return;
			try {
				/* Carry the new model's own default effort: `select` otherwise
				   re-derives it, and passing a stale ladder id from the previous
				   model is rejected by the host. */
				const next = model && model.reasoning && model.reasoning.defaultEffort !== undefined ? { reasoningEffort: model.reasoning.defaultEffort } : {};
				const outcome = directory.select(Object.assign({ provider: group.id, model: model.id }, next));
				if (outcome && typeof outcome.catch === 'function') outcome.catch(() => {});
			} catch (error) {
				/* the failure is already reported by the store */
			}
			setOpen(false);
			setPane('root');
		};

		const pickEffort = (level) => {
			if (!directory || typeof directory.select !== 'function' || current === null) return;
			try {
				const outcome = directory.select({ provider: current.provider, model: current.model, reasoningEffort: level });
				if (outcome && typeof outcome.catch === 'function') outcome.catch(() => {});
			} catch (error) {
				/* the failure is already reported by the store */
			}
			setPane('root');
		};

		/* ================================================================== *
		 * Selection
		 * ================================================================== */

		const trigger = React.createElement(
			'button',
			{
				type: 'button',
				className: C.trigger,
				'aria-haspopup': 'dialog',
				'aria-expanded': open ? 'true' : 'false',
				'aria-label': '选择模型',
				onClick: () => {
					setOpen((value) => !value);
					setPane('root');
					setQuery('');
					setAllOpen(false);
					setAllQuery('');
				},
			},
			React.createElement('span', { className: C.lockup, 'aria-hidden': 'true' }, markFor({ id: current ? current.provider : '', name: current ? current.provider : '' })),
			React.createElement('span', { className: C.label }, currentBare.name),
			currentBare.mult === '' ? null : React.createElement('span', { className: C.effort }, currentBare.mult),
			effortLabel ? React.createElement('span', { className: C.effort }, effortLabel) : null,
			React.createElement(
				'span',
				{ className: C.chevron, 'aria-hidden': 'true' },
				React.createElement(
					'svg',
					{ viewBox: '0 0 12 12', width: 12, height: 12 },
					React.createElement('path', {
						d: 'M3 4.5 6 7.5 9 4.5',
						fill: 'none',
						stroke: 'currentColor',
						strokeWidth: '1.4',
						strokeLinecap: 'round',
						strokeLinejoin: 'round',
					})
				)
			)
		);

		if (!open) return React.createElement('span', { className: C.root, ref: anchor }, trigger);

		const active = price();
		const filtered = query.trim() === '' ? null : normalise(query);

		const sectionFor = (group, models, filterOverride) => {
			const filter = filterOverride === undefined ? filtered : filterOverride;
			const shown = models.filter((model) => filter === null || normalise(model.name || model.id).indexOf(filter) >= 0);
			if (shown.length === 0) return null;
			return React.createElement(
				'section',
				{ className: C.section, key: group.id },
				/* A provider heading is a LABEL, not a control: the list it names
				   is always open, so a chevron or a collapse state would promise an
				   interaction that does not exist. */
				React.createElement(
					'div',
					{ className: C.heading },
					React.createElement('span', { className: C.mark, 'aria-hidden': 'true' }, markFor(group)),
					React.createElement('span', { className: C.headingName }, group.name || group.id),
					React.createElement('span', { className: C.count }, shown.length)
				),
				shown.map((model) => {
					/* Reseller rows embed the price ratio in the label itself
					   ("Fast · x0.34"). Splitting it out keeps the model name and
					   the ratio legible as two different kinds of fact — and the
					   ratio is NOT the peak/off-peak factor, so it must never be
					   merged with the badge above. */
					const bare = splitMultiplier(model.name || model.id);
					const chosen = isCurrent(group, model);
					return React.createElement(
						'button',
						{
							type: 'button',
							/* Two rows can share an id across providers, and two
							   workbuddy rows can share a LABEL, so the key is the pair
							   plus the label. */
							key: group.id + '\u0000' + model.id + '\u0000' + (model.name || ''),
							className: C.option,
							role: 'menuitemradio',
							'aria-checked': chosen ? 'true' : 'false',
							onClick: () => select(group, model),
						},
						React.createElement(
							'span',
							{ className: C.copy },
							React.createElement('span', { className: C.name }, bare.name, bare.mult === '' ? null : React.createElement('span', { className: 'lg-picker-mult' }, bare.mult)),
							(() => {
								const text = describe(bare.name, model.description);
								return text ? React.createElement('span', { className: C.desc }, text) : null;
							})()
						),
						React.createElement('span', { className: C.check, 'aria-hidden': 'true' }, chosen ? '✓' : '')
					);
				})
			);
		};

		/* The reasoning ladder is its own pane, not a submenu of every row: one
		   model is selected at a time, so there is exactly one ladder to show. */
		const effortPane = React.createElement(
			'section',
			{ className: C.effortPane, key: 'effort' },
			React.createElement(
				'button',
				{ type: 'button', className: C.back, onClick: () => setPane('root') },
				React.createElement(
					'span',
					{ className: C.chevron, 'aria-hidden': 'true' },
					React.createElement('svg', { viewBox: '0 0 12 12', width: 12, height: 12 }, React.createElement('path', { d: 'M7.5 3 4.5 6l3 3', fill: 'none', stroke: 'currentColor', strokeWidth: '1.4', strokeLinecap: 'round', strokeLinejoin: 'round' }))
				),
				'思考强度'
			),
			effortChoices.length === 0
				? React.createElement('div', { className: C.empty }, '当前模型未提供推理等级')
				: effortChoices.map((level) => {
						/* With no explicit choice the host runs the model's own
						   default, so THAT level is the one the check belongs to. */
						const chosen = activeEffort === level.id;
						const suffix = chosen && isDefaultEffort ? '默认' : '';
						return React.createElement(
							'button',
							{
								type: 'button',
								key: level.id,
								className: C.effortOption,
								role: 'menuitemradio',
								'aria-checked': chosen ? 'true' : 'false',
								onClick: () => pickEffort(level.id),
							},
							React.createElement(
								'span',
								{ className: C.copy },
								React.createElement('span', { className: C.name }, level.name || level.id, suffix === '' ? null : React.createElement('span', { className: 'lg-picker-mult' }, suffix)),
								level.description ? React.createElement('span', { className: C.desc }, level.description) : null
							),
							React.createElement('span', { className: C.check, 'aria-hidden': 'true' }, chosen ? '✓' : '')
						);
					})
		);

		/* Which providers the card lists by default. A configured list narrows
		   it; an empty one leaves the picker exactly as it was before the setting
		   existed. The rest of the catalog stays one click away. */
		const quickList = quick === null ? [] : quick;
		const pinnedGroups = groups.filter((group) => quickList.indexOf(group.id) >= 0);
		const hasQuick = pinnedGroups.length > 0;
		const shownGroups = hasQuick ? pinnedGroups : groups;
		const allFilter = allQuery.trim() === '' ? null : normalise(allQuery);

		/* The card's two footers. They live OUTSIDE the scrolling body: an entry
		   that only appears after scrolling a 28-row list is an entry most users
		   never see, and "思考强度" is a control, not the last row of a table. */
		const foot =
			effortChoices.length === 0 && (!hasQuick || filtered !== null)
				? null
				: React.createElement(
						'div',
						{ className: 'lg-picker-foot' },
						effortChoices.length === 0
							? null
							: React.createElement(
									'button',
									{ type: 'button', className: C.effortRow, onClick: () => setPane('effort') },
									React.createElement('span', null, '思考强度'),
									React.createElement('span', { className: C.effortValue }, effortLabel === '' ? '默认' : effortLabel),
									React.createElement('span', { className: C.chevron, 'aria-hidden': 'true' }, React.createElement('svg', { viewBox: '0 0 12 12', width: 12, height: 12 }, React.createElement('path', { d: 'M4.5 3 7.5 6l-3 3', fill: 'none', stroke: 'currentColor', strokeWidth: '1.4', strokeLinecap: 'round', strokeLinejoin: 'round' })))
							  ),
						/* The door to the rest of the catalog. It exists only when a
						   quick list is configured — otherwise every model is already
						   on this card and a second one would show the same rows. */
						!hasQuick || filtered !== null
							? null
							: React.createElement(
									'button',
									{ type: 'button', className: C.more, onClick: () => setAllOpen(true) },
									React.createElement('span', null, '所有供应商'),
									React.createElement('span', { className: C.count }, groups.length),
									React.createElement('span', { className: C.chevron, 'aria-hidden': 'true' }, React.createElement('svg', { viewBox: '0 0 12 12', width: 12, height: 12 }, React.createElement('path', { d: 'M4.5 3 7.5 6l-3 3', fill: 'none', stroke: 'currentColor', strokeWidth: '1.4', strokeLinecap: 'round', strokeLinejoin: 'round' })))
							  )
				  );

		const card = !open
			? null
			: React.createElement(
					'div',
					{
						className: C.card,
						role: 'dialog',
						'aria-label': '模型',
						ref: cardRef,
						style: placement === null ? { visibility: 'hidden' } : { top: placement.top + 'px', left: placement.left + 'px' },
					},
					React.createElement(
						'div',
						{ className: C.search },
						React.createElement('input', {
							type: 'search',
							placeholder: '搜索模型',
							value: query,
							onChange: (event) => setQuery(event.target.value),
							'aria-label': '搜索模型',
						}),
						React.createElement(
							'span',
							{ className: C.badge, 'data-lg-tone': active.peak ? 'peak' : 'off', title: '高峰：北京时间周一至周五 9:00–12:00、14:00–18:00（中国法定节假日除外）；空闲时段价格为其一半。' },
							React.createElement('span', { className: 'lg-picker-badge-dot', 'aria-hidden': 'true' }),
							active.peak ? '高峰' : '空闲',
							React.createElement('b', null, active.peak ? '≈2×' : '≈1×'),
							active.switchAt === null ? null : React.createElement('em', null, humanLeft(active.switchAt - Date.now()) + '后转' + (active.peak ? '空闲' : '高峰'))
						)
					),
					pane === 'effort'
						? effortPane
						: groups.length === 0
						? React.createElement('div', { className: C.empty }, snapshot && snapshot.status === 'loading' ? '正在读取模型…' : '暂无可用模型')
						: React.createElement(
								'div',
								{ className: 'lg-picker-body' },
								shownGroups.map((group) => sectionFor(group, group.models || []))
						  ),
					foot
			  );

		/* The second card: every provider, for the models the quick list leaves
		   out. Same glass, same rows — it is the same list with a wider filter, so
		   it must not read as a different kind of surface. */
		const allCard = allOpen
			? React.createElement(
					'div',
					{
						className: C.card + ' ' + C.cardAll,
						role: 'dialog',
						'aria-label': '所有供应商',
						ref: allRef,
						style: allPlacement === null ? { visibility: 'hidden' } : { top: allPlacement.top + 'px', left: allPlacement.left + 'px' },
					},
					React.createElement(
						'div',
						{ className: C.search },
						React.createElement('input', {
							type: 'search',
							placeholder: '搜索全部模型',
							value: allQuery,
							onChange: (event) => setAllQuery(event.target.value),
							'aria-label': '搜索全部模型',
						})
					),
					React.createElement(
						'div',
						{ className: 'lg-picker-body' },
						groups.map((group) => sectionFor(group, group.models || [], allFilter))
					)
			  )
			: null;

		/* The card is portalled to <body>. It must be: several ancestors of the
		   composer carry a backdrop-filter, and a filtered element becomes the
		   CONTAINING BLOCK for its fixed-position descendants — so a card left in
		   the composer's subtree resolves `position:fixed` against the composer
		   instead of the window and lands at the wrong place entirely. */
		return React.createElement(
			'span',
			{ className: C.root, ref: anchor },
			trigger,
			ReactDOMShared.createPortal(card, document.body),
			allCard === null ? null : ReactDOMShared.createPortal(allCard, document.body)
		);
	}

	/** Mount the seat into the composer's model slot, hiding the host trigger. */
	function mount() {
		const slot = document.querySelector('[data-slot="conversation.input.model"]');
		if (slot === null) return null;
		const host = slot.firstElementChild;
		if (host !== null) host.setAttribute('data-lg-picker-host', '');
		let seat = slot.querySelector('.' + C.root);
		if (seat === null) {
			seat = document.createElement('span');
			seat.className = C.root;
			slot.appendChild(seat);
		}
		const root = ReactDOM.createRoot(seat);
		root.render(React.createElement(Picker));
		return () => {
			try {
				root.unmount();
			} catch (error) {
				/* already gone */
			}
			if (host !== null) host.removeAttribute('data-lg-picker-host');
			if (seat && seat.parentNode) seat.parentNode.removeChild(seat);
		};
	}

	return { mount };
};

		/** @type {Function} — inlined from src/stats.js at build time. */
		const createStats = function createStats(require, ctx, catalog) {
	const React = require('react');
	const ReactDOM = require('react-dom/client');
	const ReactDOMShared = require('react-dom');

	const C = {
		root: 'lg-stats',
		trigger: 'lg-stats-trigger',
		panel: 'lg-stats-panel',
		head: 'lg-stats-head',
		headline: 'lg-stats-headline',
		figures: 'lg-stats-figures',
		bar: 'lg-stats-bar',
		segment: 'lg-stats-segment',
		rows: 'lg-stats-rows',
		row: 'lg-stats-row',
		swatch: 'lg-stats-swatch',
		section: 'lg-stats-section',
		grid: 'lg-stats-grid',
		item: 'lg-stats-item',
		label: 'lg-stats-label',
		value: 'lg-stats-value',
	};

	/* The three buckets are the app's own vocabulary (system prompt, tool
	   definitions, messages) and their colours are the ones the shipped meter
	   already uses, so a reader who has seen the host panel recognises them. */
	const BUCKETS = [
		{ key: 'systemTokens', label: '系统提示词', tint: 'var(--dsw-static-neutral-bluish-400)' },
		{ key: 'toolsTokens', label: '工具定义', tint: '#a78bfa' },
		{ key: 'messageTokens', label: '对话消息', tint: 'var(--dsw-static-blue-450)' },
	];

	/** 1,234,567 → "1,234,567"; large counts get a compact form. */
	function exact(value) {
		if (typeof value !== 'number' || !isFinite(value)) return '—';
		return Math.round(value).toLocaleString('en-US');
	}

	function compact(value) {
		if (typeof value !== 'number' || !isFinite(value)) return '—';
		if (value >= 1e9) return (value / 1e9).toFixed(value >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
		if (value >= 1e6) return (value / 1e6).toFixed(value >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
		if (value >= 1e3) return (value / 1e3).toFixed(value >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
		return String(Math.round(value));
	}

	/** "4分14秒" style, matching the app's own duration wording. */
	function duration(ms) {
		if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0) return '—';
		const total = Math.round(ms / 1000);
		if (total < 60) return total + ' 秒';
		const minutes = Math.floor(total / 60);
		const seconds = total % 60;
		if (minutes < 60) return minutes + ' 分 ' + seconds + ' 秒';
		const hours = Math.floor(minutes / 60);
		return hours + ' 小时 ' + (minutes % 60) + ' 分';
	}

	function percentText(part, whole) {
		if (!whole || whole <= 0) return '—';
		return Math.round((part / whole) * 100) + '%';
	}

	/** The session the composer is attached to, read the way the picker does. */
	function liveSession() {
		try {
			const ui = ctx.get('uiSession');
			const value = ui && ui.current ? ui.current.value : null;
			if (value === null || value === undefined) return null;
			return value.hooks && value.hooks.session ? value.hooks.session : null;
		} catch (error) {
			return null;
		}
	}

	function faceOf(session, name) {
		try {
			if (session === null) return null;
			const projections = session.projections;
			if (!projections || typeof projections.faceOf !== 'function') return null;
			return projections.faceOf(name);
		} catch (error) {
			return null;
		}
	}

	function Stats() {
		const [values, setValues] = React.useState({});
		const [open, setOpen] = React.useState(false);
		const [placement, setPlacement] = React.useState(null);
		const anchor = React.useRef(null);
		const panelRef = React.useRef(null);

		/* One subscription per projection, re-established when the session
		   changes. A single 1s poll would work too, but these values drive a
		   number a reader is watching tick up, and a poll makes it stutter. */
		React.useEffect(() => {
			let live = true;
			const names = ['contextPressure', 'contextBreakdown', 'sessionStats', 'tokenUsage'];
			const stops = [];
			const read = () => {
				if (!live) return;
				const session = liveSession();
				const next = {};
				for (const name of names) {
					const face = faceOf(session, name);
					if (face === null) continue;
					try {
						next[name] = face.getSnapshot();
					} catch (error) {
						/* a torn read is not fatal */
					}
				}
				setValues(next);
			};
			read();
			const session = liveSession();
			for (const name of names) {
				const face = faceOf(session, name);
				if (face === null || typeof face.subscribe !== 'function') continue;
				try {
					const stop = face.subscribe(read);
					if (typeof stop === 'function') stops.push(stop);
				} catch (error) {
					/* the projection may have gone away */
				}
			}
			if (typeof setInterval === 'function') {
				const timer = setInterval(read, 4000);
				stops.push(() => clearInterval(timer));
			}
			return () => {
				live = false;
				for (const stop of stops) {
					try {
						stop();
					} catch (error) {
						/* already disposed */
					}
				}
			};
		}, []);

		const pressure = values.contextPressure || null;
		const breakdown = values.contextBreakdown || null;
		const stats = values.sessionStats || null;
		const usage = values.tokenUsage || null;

		const used = pressure === null ? null : pressure.projectedTokens !== undefined ? pressure.projectedTokens : pressure.pressureTokens;
		const window_ = pressure === null ? null : pressure.contextWindow;
		const percent = used === null || window_ === null || !window_ ? null : Math.min(100, Math.round((used / window_) * 100));

		const billed = usage === null ? 0 : (usage.uncachedInputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0);
		const hitRate = usage === null || billed === 0 ? null : Math.round(((usage.cacheReadTokens || 0) / billed) * 100);

		/* EVERY hook must run before the first conditional return: an early
		   `return null` between hooks makes React report "rendered fewer hooks
		   than expected" and drop the whole tree — which reads as an empty seat
		   and no error anywhere the eye lands. */
		React.useLayoutEffect(() => {
			if (!open) {
				setPlacement(null);
				return undefined;
			}
			const place = () => {
				const trigger_ = anchor.current;
				const panel = panelRef.current;
				if (trigger_ === null || panel === null) return;
				const a = trigger_.getBoundingClientRect();
				const b = panel.getBoundingClientRect();
				const gap = 8;
				const margin = 10;
				let top = a.top - b.height - gap;
				if (top < margin) top = Math.min(a.bottom + gap, window.innerHeight - b.height - margin);
				let left = a.left;
				if (left + b.width > window.innerWidth - margin) left = window.innerWidth - margin - b.width;
				if (left < margin) left = margin;
				setPlacement({ top: Math.round(Math.max(margin, Math.min(top, window.innerHeight - b.height - margin))), left: Math.round(left) });
			};
			place();
			window.addEventListener('resize', place);
			return () => window.removeEventListener('resize', place);
		}, [open]);

		React.useEffect(() => {
			if (!open) return undefined;
			const onDown = (event) => {
				if (anchor.current && event.target instanceof Node && anchor.current.contains(event.target)) return;
				if (panelRef.current && event.target instanceof Node && panelRef.current.contains(event.target)) return;
				setOpen(false);
			};
			const onKey = (event) => {
				if (event.key === 'Escape') setOpen(false);
			};
			document.addEventListener('pointerdown', onDown, true);
			document.addEventListener('keydown', onKey, true);
			return () => {
				document.removeEventListener('pointerdown', onDown, true);
				document.removeEventListener('keydown', onKey, true);
			};
		}, [open]);

		/* Nothing to say until the session has a projection; an empty pill that
		   appears and disappears is worse than no pill. This return is AFTER
		   every hook on purpose — see the note above. */
		if (percent === null && stats === null && usage === null) return null;

		/* The collapsed pill: one reading per question, in the order a reader
		   asks them — how full, how fast, how much. */
		const trigger = React.createElement(
			'button',
			{
				type: 'button',
				className: C.trigger,
				ref: anchor,
				'aria-haspopup': 'dialog',
				'aria-expanded': open ? 'true' : 'false',
				'aria-label': '上下文与用量',
				onClick: () => setOpen((value) => !value),
			},
			percent === null
				? null
				: React.createElement('span', { className: C.seg }, React.createElement('span', { className: 'lg-stats-ring', 'aria-hidden': 'true' }, ring(percent)), percent + '%'),
			stats === null || !stats.steps
				? null
				: React.createElement(
						'span',
						{ className: C.seg },
						stats.turns + ' 轮',
						stats.decodeMs > 0 ? React.createElement('em', null, Math.round(stats.decodeTokens / (stats.decodeMs / 1000)) + ' tok/s') : null
				  ),
			usage === null
				? null
				: React.createElement('span', { className: C.seg }, compact(billed + (usage.outputTokens || 0)), ' tok', hitRate === null ? null : React.createElement('em', null, '命中 ' + hitRate + '%'))
		);

		if (!open) return React.createElement('span', { className: C.root, ref: anchor }, trigger);

		const total = breakdown === null ? 0 : (breakdown.systemTokens || 0) + (breakdown.toolsTokens || 0) + (breakdown.messageTokens || 0);
		const segments =
			breakdown === null || total === 0 || percent === null
				? [{ key: 'total', tint: 'var(--dsw-alias-label-tertiary)', width: percent === null ? 0 : percent }]
				: BUCKETS.map((bucket) => ({ key: bucket.key, tint: bucket.tint, width: (percent * (breakdown[bucket.key] || 0)) / total }));

		const panel = React.createElement(
			'div',
			{
				className: C.panel,
				role: 'dialog',
				'aria-label': '上下文与用量',
				ref: panelRef,
				style: placement === null ? { visibility: 'hidden' } : { top: placement.top + 'px', left: placement.left + 'px' },
			},
			React.createElement(
				'div',
				{ className: C.head },
				React.createElement('span', { className: C.headline }, '上下文已用', percent === null ? null : React.createElement('b', null, percent + '%')),
				React.createElement('span', { className: C.figures }, used === null ? '—' : '~' + compact(used), window_ === null ? '' : ' / ' + compact(window_))
			),
			React.createElement(
				'div',
				{ className: C.bar, 'aria-hidden': 'true' },
				segments.filter((part) => part.width > 0).map((part) => React.createElement('span', { key: part.key, className: C.segment, style: { flexGrow: part.width, background: part.tint } }))
			),
			breakdown === null
				? null
				: React.createElement(
						'div',
						{ className: C.rows },
						BUCKETS.map((bucket) =>
							React.createElement(
								'div',
								{ className: C.row, key: bucket.key },
								React.createElement('span', { className: C.swatch, style: { background: bucket.tint }, 'aria-hidden': 'true' }),
								React.createElement('span', { className: C.label }, bucket.label),
								React.createElement('span', { className: C.value }, '~' + compact(breakdown[bucket.key] || 0))
							)
						)
				  ),
			stats === null
				? null
				: React.createElement(
						'div',
						{ className: C.section },
						React.createElement('div', { className: 'lg-stats-section-title' }, '会话统计'),
						React.createElement(
							'div',
							{ className: C.grid },
							item('模型用时', duration(stats.llmMs)),
							item('工具调用用时', duration(stats.toolMs)),
							item('首 token 平均', stats.ttftSteps > 0 ? (stats.ttftMs / stats.ttftSteps / 1000).toFixed(1) + ' 秒' : '—'),
							item('输出速度', stats.decodeMs > 0 ? Math.round(stats.decodeTokens / (stats.decodeMs / 1000)) + ' tok/s' : '—')
						)
				  ),
			usage === null
				? null
				: React.createElement(
						'div',
						{ className: C.section },
						React.createElement('div', { className: 'lg-stats-section-title' }, 'Token 用量'),
						React.createElement(
							'div',
							{ className: C.grid },
							item('缓存命中', hitRate === null ? '—' : hitRate + '%'),
							item('未缓存输入', exact(usage.uncachedInputTokens || 0) + ' tok'),
							item('缓存读取', exact(usage.cacheReadTokens || 0) + ' tok'),
							item('输出', exact(usage.outputTokens || 0) + ' tok')
						)
				  )
		);

		return React.createElement('span', { className: C.root, ref: anchor }, trigger, ReactDOMShared.createPortal(panel, document.body));
	}

	function item(label, value) {
		return React.createElement(
			'div',
			{ className: 'lg-stats-item', key: label },
			React.createElement('span', { className: 'lg-stats-label' }, label),
			React.createElement('span', { className: 'lg-stats-value' }, value)
		);
	}

	/** The 14px ring the host meter draws, kept so the reading looks familiar. */
	function ring(percent) {
		const r = 5.5;
		const circumference = 2 * Math.PI * r;
		return React.createElement(
			'svg',
			{ viewBox: '0 0 14 14', width: 14, height: 14, 'aria-hidden': 'true' },
			React.createElement('circle', { cx: 7, cy: 7, r, fill: 'none', stroke: 'currentColor', strokeWidth: 2, opacity: 0.18 }),
			React.createElement('circle', {
				cx: 7,
				cy: 7,
				r,
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: 2,
				strokeLinecap: 'round',
				strokeDasharray: (circumference * percent) / 100 + ' ' + circumference,
				transform: 'rotate(-90 7 7)',
			})
		);
	}

	/**
	 * Mount into the composer dock, beside the host's own readouts.
	 *
	 * The host pills are hidden by CSS once `html[data-lg-stats]` is set, so the
	 * swap is atomic: the attribute and the seat appear together, and a reader
	 * never sees both or neither.
	 */
	function mount() {
		const dock = document.querySelector('[data-composer-dock]');
		if (dock === null) return null;
		let seat = dock.querySelector('.' + C.root);
		if (seat === null) {
			seat = document.createElement('span');
			seat.className = C.root;
			dock.appendChild(seat);
		}
		document.documentElement.setAttribute('data-lg-stats', '');
		const root = ReactDOM.createRoot(seat);
		root.render(React.createElement(Stats));
		return () => {
			try {
				root.unmount();
			} catch (error) {
				/* already gone */
			}
			document.documentElement.removeAttribute('data-lg-stats');
			if (seat && seat.parentNode) seat.parentNode.removeChild(seat);
		};
	}

	return { mount };
};

		/** @type {Function} — inlined from src/settings-section.js at build time. */
		const createSettingsSection = function createSettingsSection(require, ctx, catalog) {
	const React = require('react');
	const h = React.createElement;

	const QUICK_KEY = 'dsh-glass-theme:quick-providers';
	const QUICK_MAX = 4;

	function readQuick() {
		try {
			const raw = window.localStorage.getItem(QUICK_KEY);
			if (raw === null) return [];
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
		} catch (error) {
			return [];
		}
	}

	function writeQuick(list) {
		try {
			window.localStorage.setItem(QUICK_KEY, JSON.stringify(list));
			/* The picker polls, so it picks this up on its next tick; the event is
			   for anything else listening (a second window, a future panel). */
			window.dispatchEvent(new CustomEvent('lg-quick-providers', { detail: list }));
		} catch (error) {
			/* a quota failure must not break the settings page */
		}
	}

	/** The live provider list, read the same way the composer's picker reads it. */
	function providers() {
		try {
			/* The `modelSelection` PROJECTION and the model directory's own store
			   are two different snapshots: the projection is a flattened summary
			   and has no `groups` array. Asking the directory directly is the only
			   reading that yields providers, and it is what the picker does. */
			const ui = ctx.get('uiSession');
			const value = ui && ui.current ? ui.current.value : null;
			let sessionId = null;
			if (value !== null && value !== undefined) {
				if (value.key !== undefined && value.key !== null) sessionId = value.key;
				else if (value.sessionId !== undefined && value.sessionId !== null) sessionId = value.sessionId;
			}
			if (sessionId === null || sessionId === '') {
				const sessions = ctx.get('sessions');
				const live = sessions && sessions.list && typeof sessions.list.getSnapshot === 'function' ? sessions.list.getSnapshot() : null;
				if (live && live.current !== undefined && live.current !== null) sessionId = live.current;
			}
			if (sessionId === null || sessionId === '') return [];
			const directories = ctx.get('modelDirectories');
			if (!directories || typeof directories.directoryFor !== 'function') return [];
			const directory = directories.directoryFor(sessionId);
			if (directory === null || directory === undefined) return [];
			if (directory.store === undefined && typeof directory.load === 'function') directory.load();
			const store = directory.store;
			let snap = null;
			if (store && typeof store.getSnapshot === 'function') snap = store.getSnapshot();
			if (snap === null && directory.projected !== undefined && directory.projected !== null) snap = directory.projected;
			if (snap === null || !Array.isArray(snap.groups)) return [];
			return snap.groups.map((group) => ({ id: group.id, name: group.name || group.id, count: (group.models || []).length }));
		} catch (error) {
			return [];
		}
	}

	function Section() {
		const [quick, setQuick] = React.useState(() => readQuick());
		const [list, setList] = React.useState(() => providers());

		/* The directory can still be loading when the page opens; a settings page
		   that says "no providers" on a slow start is a settings page that lies. */
		React.useEffect(() => {
			const read = () => setList(providers());
			read();
			if (typeof setInterval !== 'function') return undefined;
			const timer = setInterval(read, 2000);
			return () => clearInterval(timer);
		}, []);

		const toggle = (id) => {
			const next = quick.indexOf(id) >= 0 ? quick.filter((value) => value !== id) : quick.length < QUICK_MAX ? quick.concat(id) : quick;
			setQuick(next);
			writeQuick(next);
		};

		return h(
			'div',
			{ className: 'lg-settings' },
			h('h2', { className: 'lg-settings-title' }, '快捷供应商'),
			h(
				'p',
				{ className: 'lg-settings-intro' },
				'模型选择器默认只列出这里勾选的供应商；其余供应商收在“所有供应商”里。',
				'一个都不勾选时，选择器会列出全部供应商。'
			),
			list.length === 0
				? h('p', { className: 'lg-settings-empty' }, '尚未读取到供应商，请先打开一个会话。')
				: h(
						'ul',
						{ className: 'lg-settings-list' },
						list.map((provider) => {
							const on = quick.indexOf(provider.id) >= 0;
							/* At the limit an unchecked switch cannot do anything. Saying
							   so is the difference between a control that refuses and a
							   control that appears broken. */
							const blocked = !on && quick.length >= QUICK_MAX;
							return h(
								'li',
								{ className: 'lg-settings-row', key: provider.id, 'data-blocked': blocked ? 'true' : 'false' },
								h(
									'span',
									{ className: 'lg-settings-copy' },
									h('span', { className: 'lg-settings-name' }, provider.name),
									h('span', { className: 'lg-settings-note' }, provider.count + ' 个模型')
								),
								h(
									'button',
									{
										type: 'button',
										className: 'lg-settings-switch',
										role: 'switch',
										'aria-checked': on ? 'true' : 'false',
										'aria-disabled': blocked ? 'true' : 'false',
										'aria-label': provider.name,
										title: blocked ? '最多可选 ' + QUICK_MAX + ' 个，请先取消一个' : undefined,
										'data-on': on ? 'true' : 'false',
										onClick: () => toggle(provider.id),
									},
									h('span', { className: 'lg-settings-knob' })
								)
							);
						})
					),
			list.length === 0
				? null
				: h('p', { className: 'lg-settings-count' }, '已选 ' + quick.length + ' / ' + QUICK_MAX)
		);
	}

	/**
	 * Register into the host's settings section slot.
	 *
	 * `label` is what the settings navigation shows. `inject` must be an injector
	 * FUNCTION: the slot runtime calls it to build the section's props, and an
	 * array registers a section that renders nothing and reports nothing.
	 */
	function register() {
		const slots = ctx.slots;
		if (!slots || typeof slots.register !== 'function') return null;
		const register = () =>
			slots.register(
				{
					name: 'settings.section',
					id: 'liquid-glass',
					order: 40,
					label: () => 'Liquid Glass',
					/* An INJECTOR, not a list: the slot runtime calls this to build
					   the props the section receives. An array here registers
					   nothing and reports no error, so it fails silently. */
					inject: () => ({}),
				},
				Section
			);
		try {
			if (typeof slots.inject === 'function') slots.inject('settings.section', register);
			else register();
			return true;
		} catch (error) {
			console.error('dsh-glass-theme: could not register the settings section', error);
			return null;
		}
	}

	return { register, Section };
};

		/** Build stamp, inlined at build time. */
		const built = "2026-10-22T07:02:26.886Z";

		const PACKAGE = 'dsh-glass-theme';

		/* ================================================================== *
		 * Stylesheet mounting
		 * ================================================================== */

		/**
		 * Append the sheets, then re-append them so they sit after the shipped
		 * stylesheets. Ordering matters twice over: the app injects its CSS-module
		 * tags as each client module loads, and several shipped rules win on equal
		 * specificity alone. Moving a style element to the end of <head> re-runs it
		 * in that position, which is cheaper and safer than escalating specificity
		 * everywhere.
		 */
		const mount = () => {
			const tags = [];
			const head = document.head ?? document.documentElement;
			for (const sheet of sheets) {
				if (document.querySelector(`style[data-plugin-css="${sheet.id}"]`) !== null) continue;
				const tag = document.createElement('style');
				tag.dataset.plugin = PACKAGE;
				tag.dataset.pluginCss = sheet.id;
				tag.textContent = sheet.css;
				head.appendChild(tag);
				tags.push(tag);
			}
			const raise = () => {
				for (const tag of tags) if (tag.isConnected) document.head.appendChild(tag);
			};
			raise();
			// The shell installs the theme layer during boot; re-raise once the
			// first paint settles so the skin always lands on top of it.
			if (typeof requestAnimationFrame === 'function') requestAnimationFrame(raise);
			return tags;
		};

		/** Mark the document so the skin's own rules can key on being active. */
		const stamp = () => {
			const root = document.documentElement;
			root.dataset.dshGlassTheme = '';
			root.dataset.dshGlassThemeBuilt = built;
			const mark = () => {
				if (document.body !== null && !document.body.hasAttribute('data-dsh-glass-theme')) {
					document.body.setAttribute('data-dsh-glass-theme', '');
				}
			};
			mark();
			if (document.body === null && typeof document.addEventListener === 'function') {
				document.addEventListener('DOMContentLoaded', mark, { once: true });
			}
		};

		/* ================================================================== *
		 * Input modality
		 * ================================================================== */

		/**
		 * Track the last input modality on `html[data-lg-input]`.
		 *
		 * The app autofocuses the first control of every dialog it opens. Chromium
		 * reports that programmatic focus as `:focus-visible`, so a plain
		 * `:focus-visible` ring paints on settings panels the user opened with a
		 * mouse — a ring where no keyboard was involved. Gating on the last real
		 * input separates the two cases: pointer users never see it, keyboard users
		 * always do.
		 *
		 * Listens in the CAPTURE phase because the app stops propagation on several
		 * of its own controls, and a missed keydown would strand the document in
		 * pointer mode with no focus ring at all.
		 */
		const trackModality = () => {
			const root = document.documentElement;
			const set = (mode) => {
				if (root.dataset.lgInput === mode) return;
				root.dataset.lgInput = mode;
			};
			set('pointer');
			const keyboard = (event) => {
				// Modifier keys alone do not mean keyboard navigation: Ctrl+C during
				// a mouse-driven session must not arm the ring.
				if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') return;
				set('keyboard');
			};
			const pointer = () => set('pointer');
			const options = { capture: true, passive: true };
			const events = [
				['keydown', keyboard],
				['pointerdown', pointer],
				['mousedown', pointer],
				['touchstart', pointer],
			];
			for (const [type, handler] of events) document.addEventListener(type, handler, options);
			return () => {
				for (const [type, handler] of events) document.removeEventListener(type, handler, options);
			};
		};

		/* ================================================================== *
		 * Model menu decoration
		 *
		 * The picker belongs to dsh-codex-subscription. Its markup, measured:
		 *
		 *   div.codexModelSelectMenu                       (fixed, flex column)
		 *     div.codexModelSelectGroups[role=menu]
		 *       section[role=group][data-menu-group]       × 6 providers
		 *         div[data-menu-group-heading]             provider name
		 *         button.codexModelSelectOption            × N models
		 *           span.codexModelSelectOptionCopy
		 *             span.codexModelSelectOptionName      "Fast · x0.34"
		 *           span.codexModelSelectCheck
		 *
		 * Everything below is ADDITIVE: new siblings and new attributes, never a
		 * rewrite of the plugin's own structure, so a re-render loses at most one
		 * decoration pass. The poll puts it back.
		 * ================================================================== */

		/** Attribute names, kept together because the gate reads this file for them. */
		const ATTR = {
			header: 'data-lg-header',
			quick: 'data-lg-quick',
			chip: 'data-lg-chip',
			price: 'data-lg-price',
			state: 'data-lg-state',
			factor: 'data-lg-factor',
			sep: 'data-lg-sep',
			next: 'data-lg-next',
			mark: 'data-lg-mark',
			note: 'data-lg-note',
			toggle: 'data-lg-toggle',
			provider: 'data-lg-provider',
			collapsed: 'data-lg-collapsed',
			filtered: 'data-lg-filtered',
			mult: 'data-lg-mult',
			tone: 'data-lg-tone',
			desc: 'data-lg-desc',
			sig: 'data-lg-sig',
		};

		/** `data-lg-chip` carries the provider key; this is its press state. */
		const CHIP_ON = 'data-lg-on';

		const norm = (value) => value.toLowerCase().replace(/[\s._·\-–—]+/g, '');

		/** Model keys are normalised once, so lookups are exact and case-free. */
		const descriptionByKey = (() => {
			const map = new Map();
			for (const [key, value] of Object.entries(catalog.descriptions)) map.set(norm(key), value);
			return map;
		})();

		/**
		 * The rule tables ship as STRINGS, not regexes, because catalog.js is
		 * spliced into the bundle as source text and a literal `/…/` there would
		 * depend on how the splice is escaped. Compiling them once at startup
		 * keeps that data file plain and the matching fast.
		 */
		const compileRules = (rules) => {
			if (!Array.isArray(rules)) return [];
			const out = [];
			for (const rule of rules) {
				if (rule === null || typeof rule.test !== 'string') continue;
				let re = null;
				try {
					re = new RegExp(rule.test, 'i');
				} catch {
					continue;
				}
				out.push({ re, text: rule.text });
			}
			return out;
		};
		const descriptionRules = compileRules(catalog.descriptionRules);
		const tierRules = compileRules(catalog.tierRules);

		/**
		 * Three sources, in decreasing authority: the hand-written table (a
		 * specific model, written by someone who looked it up), then the family
		 * rules (what the LINE is for), then the tier rules (what its SIZE suffix
		 * implies). The last two are the reference implementation's approach and
		 * are what keeps an unfamiliar reseller row from reading as unfinished.
		 */
		const descriptionFor = (label) => {
			const exact = catalog.descriptions[label] ?? descriptionByKey.get(norm(label));
			if (exact !== undefined) return exact;
			for (const rule of descriptionRules) if (rule.re.test(label)) return rule.text;
			for (const rule of tierRules) if (rule.re.test(label)) return rule.text;
			return '';
		};

		/** First matching family wins; the catalog lists specific names first. */
		const familyFor = (label) => {
			for (const family of catalog.families) if (family.test.test(label)) return family;
			return null;
		};

		/** workbuddy folds the price ratio into the label: "Fast · x0.34". */
		const MULTIPLIER_RE = /^(.*?)\s*·\s*x\s*([\d.]+)\s*$/;

		/* ---- peak / off-peak ------------------------------------------- */

		/**
		 * DeepSeek's published schedule, evaluated against BEIJING wall clock.
		 *
		 *   高峰 = 周一至周五 9:00–12:00、14:00–18:00（北京时间，不含法定节假日）
		 *   空闲 = 其余时段，价格恰为高峰的一半
		 *
		 * The holiday exclusion is real data, not a guess: `catalog.pricing.holidays`
		 * carries the 中国法定节假日 dates per year, because the published rule
		 * subtracts them from the weekday window. A year with no table falls back
		 * to the weekday rule alone — the chip still tells the truth about the
		 * window, it just stops promising holiday accuracy for that year.
		 *
		 * The factor is expressed relative to the CHEAPER baseline, so peak reads
		 * `2×` and off-peak reads `1×` — the same convention the reference uses.
		 */
		const peakCache = { at: 0, value: null };

		const peakInfo = () => {
			const now = Date.now();
			if (peakCache.value !== null && now - peakCache.at < 20000) return peakCache.value;

			const { windows, weekdaysOnly, offPeakFactor, utcOffsetMinutes, holidays } = catalog.pricing;
			const offset = utcOffsetMinutes * 60000;

			const beijing = (ms) => {
				const date = new Date(ms + offset);
				const year = date.getUTCFullYear();
				const month = String(date.getUTCMonth() + 1).padStart(2, '0');
				const day = String(date.getUTCDate()).padStart(2, '0');
				return {
					weekday: date.getUTCDay(),
					minutes: date.getUTCHours() * 60 + date.getUTCMinutes(),
					ymd: `${year}-${month}-${day}`,
					md: `${month}-${day}`,
					year,
				};
			};
			/** A holiday closes the whole day, so it is off-peak at any hour. */
			const isHoliday = (stamp) => {
				const table = holidays && holidays[stamp.year];
				if (!Array.isArray(table)) return false;
				return table.indexOf(stamp.md) >= 0;
			};
			const isPeak = (ms) => {
				const stamp = beijing(ms);
				if (weekdaysOnly && (stamp.weekday === 0 || stamp.weekday === 6)) return false;
				if (isHoliday(stamp)) return false;
				for (const [from, to] of windows) if (stamp.minutes >= from && stamp.minutes < to) return true;
				return false;
			};

			const peak = isPeak(now);
			// The next boundary is at most 8 days out (a full week plus the
			// weekend either side); scan minute by minute rather than encode the
			// calendar twice.
			let switchAt = null;
			let at = Math.floor(now / 60000) * 60000 + 60000;
			for (let i = 0; i < 60 * 24 * 8 && switchAt === null; i++, at += 60000) {
				if (isPeak(at) !== peak) switchAt = at;
			}

			// Why it is off-peak right now, when that is a holiday rather than the
			// hour: the schedule has three different reasons and a reader who sees
			// 空闲 at 10:00 on a Wednesday deserves to know which one applies.
			const today = beijing(now);
			const reason = isHoliday(today) ? 'holiday' : today.weekday === 0 || today.weekday === 6 ? 'weekend' : 'window';

			const value = { peak, factor: peak ? 1 / offPeakFactor : 1, switchAt, reason };
			peakCache.value = value;
			peakCache.at = now;
			return value;
		};

		/** Compact Chinese duration: "3 小时 26 分", "1 天 3 小时", "12 分". */
		const duration = (ms) => {
			const total = Math.max(0, Math.round(ms / 60000));
			const days = Math.floor(total / 1440);
			const hours = Math.floor((total % 1440) / 60);
			const minutes = total % 60;
			if (days > 0) return `${days} 天 ${hours} 小时`;
			if (hours > 0) return `${hours} 小时 ${minutes} 分`;
			return `${minutes} 分`;
		};

		/* ---- decoration state ------------------------------------------ */

		/** null = show every provider. Set by the quick-provider chips. */
		let activeProvider = null;

		/** section element -> true when the user collapsed it this page-life. */
		const collapsed = new WeakSet();

		const element = (target) => (target instanceof Element ? target : null);

		/* ---- header ---------------------------------------------------- */

		const buildChip = (provider) => {
			const chip = document.createElement('button');
			chip.type = 'button';
			chip.setAttribute(ATTR.chip, provider.key);
			chip.setAttribute(ATTR.tone, provider.tone);
			chip.setAttribute('aria-pressed', 'false');
			chip.title = `${provider.label} · ${provider.note}`;

			const mark = document.createElement('span');
			mark.setAttribute(ATTR.mark, '');
			mark.setAttribute('aria-hidden', 'true');
			mark.textContent = provider.mark;

			const label = document.createElement('span');
			label.textContent = provider.label;

			chip.append(mark, label);
			return chip;
		};

		const buildHeader = (menu) => {
			const header = document.createElement('div');
			header.setAttribute(ATTR.header, '');

			const quick = document.createElement('div');
			quick.setAttribute(ATTR.quick, '');
			quick.setAttribute('role', 'group');
			quick.setAttribute('aria-label', '快捷供应商');
			for (const provider of Object.values(catalog.providers)) quick.append(buildChip(provider));

			const price = document.createElement('div');
			price.setAttribute(ATTR.price, '');
			price.title =
				'高峰：北京时间周一至周五 9:00–12:00、14:00–18:00（中国法定节假日除外）；空闲时段价格为其一半。';

			const state = document.createElement('span');
			state.setAttribute(ATTR.state, '');

			const factor = document.createElement('span');
			factor.setAttribute(ATTR.factor, '');

			const sep = document.createElement('span');
			sep.setAttribute(ATTR.sep, '');
			sep.setAttribute('aria-hidden', 'true');
			sep.textContent = '·';

			const next = document.createElement('span');
			next.setAttribute(ATTR.next, '');

			price.append(state, factor, sep, next);
			header.append(quick, price);
			// The plugin's menu is a flex column, so `order` puts the header above
			// the group list without touching React's own child order.
			menu.append(header);
			return header;
		};

		const renderPrice = (price, show) => {
			price.hidden = !show;
			if (!show) return;
			const info = peakInfo();
			const state = price.querySelector(`[${ATTR.state}]`);
			const factor = price.querySelector(`[${ATTR.factor}]`);
			const next = price.querySelector(`[${ATTR.next}]`);
			if (state === null || factor === null || next === null) return;

			const label = info.peak ? '高峰' : '空闲';
			if (state.textContent !== label) state.textContent = label;
			state.setAttribute(ATTR.tone, info.peak ? 'peak' : 'off');

			// A holiday or a weekend is why the window is open at 10:00 on a
			// weekday; without the reason the chip reads as a broken clock.
			const reason = info.peak ? null : info.reason === 'holiday' ? '法定节假日' : info.reason === 'weekend' ? '周末' : null;
			if (reason === null) state.removeAttribute('data-lg-reason');
			else state.setAttribute('data-lg-reason', reason);

			const ratio = `≈${Number.isInteger(info.factor) ? info.factor : info.factor.toFixed(1)}×`;
			if (factor.textContent !== ratio) factor.textContent = ratio;

			const target = info.peak ? '空闲' : '高峰';
			const text =
				info.switchAt === null
					? ''
					: `${duration(info.switchAt - Date.now())}后转${target}`;
			if (next.textContent !== text) next.textContent = text;
		};

		/* ---- group headings -------------------------------------------- */

		/** Direct text children only, so our own injected spans never leak in. */
		const headingText = (heading) => {
			let text = '';
			for (const node of heading.childNodes) if (node.nodeType === 3) text += node.nodeValue;
			return text.trim();
		};

		const decorateHeading = (section, heading) => {
			const name = headingText(heading);
			const provider = catalog.providers[name] ?? null;
			if (provider !== null) section.setAttribute(ATTR.provider, provider.key);

			let mark = heading.querySelector(`:scope > [${ATTR.mark}]`);
			if (mark === null) {
				mark = document.createElement('span');
				mark.setAttribute(ATTR.mark, '');
				mark.setAttribute('aria-hidden', 'true');
				heading.prepend(mark);
			}
			const glyph = provider?.mark ?? '';
			if (mark.textContent !== glyph) mark.textContent = glyph;
			mark.setAttribute(ATTR.tone, provider?.tone ?? 'neutral');

			let note = heading.querySelector(`:scope > [${ATTR.note}]`);
			if (note === null) {
				note = document.createElement('span');
				note.setAttribute(ATTR.note, '');
				heading.append(note);
			}
			const noteText = provider?.note ?? '';
			if (note.textContent !== noteText) note.textContent = noteText;

			let toggle = heading.querySelector(`:scope > [${ATTR.toggle}]`);
			if (toggle === null) {
				toggle = document.createElement('button');
				toggle.type = 'button';
				toggle.setAttribute(ATTR.toggle, '');
				toggle.innerHTML =
					'<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
				heading.append(toggle);
			}
			toggle.setAttribute('aria-label', `收起或展开 ${name}`);
			toggle.setAttribute('aria-expanded', collapsed.has(section) ? 'false' : 'true');
		};

		/* ---- model rows ------------------------------------------------ */

		/**
		 * The option's own label, ignoring injected children.
		 *
		 * The multiplier badge lives INSIDE the name span so it can sit on the
		 * same baseline; reading `textContent` would then fold `×0.34` back into
		 * the label on the next pass and the multiplier would drift into the
		 * description lookup. Direct text nodes are the label; elements are ours.
		 */
		const ownText = (el) => {
			let text = '';
			for (const node of el.childNodes) if (node.nodeType === 3) text += node.nodeValue;
			return text;
		};

		/** Replace the element's own text, leaving injected children in place. */
		const setOwnText = (el, text) => {
			let written = false;
			for (const node of [...el.childNodes]) {
				if (node.nodeType !== 3) continue;
				if (written) node.nodeValue = '';
				else {
					node.nodeValue = text;
					written = true;
				}
			}
			if (!written) el.insertBefore(document.createTextNode(text), el.firstChild);
		};

		const decorateOption = (option) => {
			const name = option.querySelector('[class*="codexModelSelectOptionName"]');
			if (name === null) return;
			const copy = name.parentElement;
			if (copy === null) return;

			const full = ownText(name);
			const match = full.match(MULTIPLIER_RE);
			const bare = match === null ? full : match[1].trim();
			const multiplier = match === null ? '' : match[2];
			// Idempotent: once split, the label no longer matches the pattern, so
			// this writes at most once per render. React restores the original
			// text only when the label itself changes.
			if (full !== bare) setOwnText(name, bare);

			const family = familyFor(bare);
			let icon = option.querySelector(`:scope > [${ATTR.mark}]`);
			if (family === null) {
				if (icon !== null) icon.remove();
			} else {
				if (icon === null) {
					icon = document.createElement('span');
					icon.setAttribute(ATTR.mark, '');
					icon.setAttribute('aria-hidden', 'true');
					option.prepend(icon);
				}
				if (icon.textContent !== family.mark) icon.textContent = family.mark;
				icon.setAttribute(ATTR.tone, family.tone);
			}

			// Inside the name span, not beside it: `OptionCopy` is a column, so a
			// sibling badge lands on its own line and stretches the full width.
			let badge = name.querySelector(`:scope > [${ATTR.mult}]`);
			if (multiplier === '') {
				if (badge !== null) badge.remove();
			} else {
				if (badge === null) {
					badge = document.createElement('span');
					badge.setAttribute(ATTR.mult, '');
					name.append(badge);
				}
				const text = `×${multiplier}`;
				if (badge.textContent !== text) badge.textContent = text;
			}

			const description = descriptionFor(bare);
			let desc = copy.querySelector(`:scope > [${ATTR.desc}]`);
			if (description === '') {
				if (desc !== null) desc.remove();
			} else {
				if (desc === null) {
					desc = document.createElement('span');
					desc.setAttribute(ATTR.desc, '');
					// The plugin's own description slot, with its own styling. Reusing
					// the class is the point: the slot exists and is simply never filled
					// for model rows.
					desc.className = 'codexModelSelectOptionDescription';
					copy.append(desc);
				}
				if (desc.textContent !== description) desc.textContent = description;
			}
		};

		/* ---- one full pass --------------------------------------------- */

		const decorateModelMenu = () => {
			const menu = document.querySelector('[class~="codexModelSelectMenu"]');
			if (menu === null) return;
			const groups = menu.querySelector('[class*="codexModelSelectGroups"]');
			if (groups === null) return;

			const sections = groups.querySelectorAll('section[data-menu-group]');
			if (sections.length === 0) return;

			// Signature: re-walking 40 rows on every poll is pointless when nothing
			// about the list changed. Headings and counts identify a render.
			const signature = `${sections.length}:${groups.querySelectorAll('[role="menuitemradio"]').length}`;
			const settled = menu.getAttribute(ATTR.sig) === signature;
			const header = menu.querySelector(`:scope > [${ATTR.header}]`);

			if (!settled || header === null) {
				const built = header ?? buildHeader(menu);
				for (const section of sections) {
					const heading = section.querySelector('[data-menu-group-heading]');
					if (heading !== null) decorateHeading(section, heading);
					for (const option of section.querySelectorAll('button[role="menuitemradio"]')) {
						decorateOption(option);
					}
				}
				menu.setAttribute(ATTR.sig, signature);
				renderPrice(built.querySelector(`[${ATTR.price}]`), hasPricing(sections));
			} else {
				// The header survives; only the countdown is time-dependent.
				renderPrice(header.querySelector(`[${ATTR.price}]`), hasPricing(sections));
			}

			applyFilter(groups, sections);
		};

		const hasPricing = (sections) => {
			for (const section of sections) {
				const key = section.getAttribute(ATTR.provider);
				if (key !== null && catalog.pricing.providerKeys.includes(key)) return true;
			}
			return false;
		};

		const applyFilter = (groups, sections) => {
			for (const section of sections) {
				const hide = activeProvider !== null && section.getAttribute(ATTR.provider) !== activeProvider;
				if (hide) section.setAttribute(ATTR.filtered, '');
				else section.removeAttribute(ATTR.filtered);
				if (collapsed.has(section)) section.setAttribute(ATTR.collapsed, '');
				else section.removeAttribute(ATTR.collapsed);
			}
			if (activeProvider === null) groups.removeAttribute(ATTR.provider);
			else groups.setAttribute(ATTR.provider, activeProvider);
		};

		/* ---- interaction ----------------------------------------------- */

		const setFilter = (key) => {
			activeProvider = activeProvider === key ? null : key;
			const menu = document.querySelector('[class~="codexModelSelectMenu"]');
			if (menu === null) return;
			for (const chip of menu.querySelectorAll(`[${ATTR.chip}]`)) {
				const on = activeProvider !== null && chip.getAttribute(ATTR.chip) === activeProvider;
				if (on) chip.setAttribute(CHIP_ON, '');
				else chip.removeAttribute(CHIP_ON);
				chip.setAttribute('aria-pressed', on ? 'true' : 'false');
			}
			// The signature guard would otherwise keep the old filter painted.
			menu.removeAttribute(ATTR.sig);
			decorateModelMenu();
		};

		const toggleCollapse = (button) => {
			const section = button.closest('section[data-menu-group]');
			if (section === null) return;
			if (collapsed.has(section)) collapsed.delete(section);
			else collapsed.add(section);
			button.setAttribute('aria-expanded', collapsed.has(section) ? 'false' : 'true');
			if (collapsed.has(section)) section.setAttribute(ATTR.collapsed, '');
			else section.removeAttribute(ATTR.collapsed);
		};

		/**
		 * Decoration runs on a poll, not a MutationObserver: the transcript streams
		 * tokens continuously, so a document-wide observer would fire on every
		 * token. One `querySelector` every 400 ms is free by comparison, and it
		 * self-heals React re-renders without needing to know why they happened.
		 */
		const startDecorator = () => {
			const timers = new Set();
			const later = (fn, ms) => {
				if (typeof setTimeout !== 'function') return;
				const id = setTimeout(() => {
					timers.delete(id);
					try {
						fn();
					} catch (error) {
						console.error('dsh-glass-theme: model menu decoration failed', error);
					}
				}, ms);
				timers.add(id);
			};
			const run = () => {
				try {
					decorateModelMenu();
				} catch (error) {
					console.error('dsh-glass-theme: model menu decoration failed', error);
				}
			};

			const onPointer = (event) => {
				const target = element(event.target);
				if (target === null) return;

				const chip = target.closest(`[${ATTR.chip}]`);
				if (chip !== null) {
					// The menu closes on outside-click; this click is inside it and must
					// not be read as a dismissal by the plugin's own handler.
					event.preventDefault();
					event.stopPropagation();
					setFilter(chip.getAttribute(ATTR.chip));
					return;
				}

				const toggle = target.closest(`[${ATTR.toggle}]`);
				if (toggle !== null) {
					event.preventDefault();
					event.stopPropagation();
					toggleCollapse(toggle);
					return;
				}

				// Opening the picker, or drilling from a cell into the model list, is
				// the one moment the decoration must not lag behind the paint.
				if (target.closest('[class*="codexModelSelectTrigger"],[class*="codexModelSelectCell"]') !== null) {
					for (const delay of [0, 60, 160, 320]) later(run, delay);
				}
			};

			document.addEventListener('click', onPointer, true);

			// A DOM stub (the smoke harness) has no timers. Polling is an
			// optimisation, not a requirement: without it the decorator still runs
			// once on mount and on every click, which is what a test needs.
			const timer =
				typeof setInterval === 'function'
					? setInterval(() => {
							if (document.visibilityState === 'hidden') return;
							run();
						}, 400)
					: null;

			run();

			return () => {
				if (timer !== null) clearInterval(timer);
				document.removeEventListener('click', onPointer, true);
				for (const id of timers) clearTimeout(id);
				timers.clear();
				clearDecorations();
			};
		};

		/** Best-effort teardown so a hot reload leaves no half-decorated menu. */
		const clearDecorations = () => {
			for (const header of document.querySelectorAll(`[${ATTR.header}]`)) header.remove();
			for (const node of document.querySelectorAll(`[${ATTR.mark}],[${ATTR.mult}],[${ATTR.desc}]`)) node.remove();
			for (const section of document.querySelectorAll(`section[${ATTR.filtered}],section[${ATTR.collapsed}]`)) {
				section.removeAttribute(ATTR.filtered);
				section.removeAttribute(ATTR.collapsed);
			}
			for (const menu of document.querySelectorAll(`[${ATTR.sig}]`)) menu.removeAttribute(ATTR.sig);
			activeProvider = null;
		};

		/* ================================================================== *
		 * Lifecycle
		 * ================================================================== */

		const clear = () => {
			document.documentElement.removeAttribute('data-dsh-glass-theme');
			document.documentElement.removeAttribute('data-dsh-glass-theme-built');
			document.documentElement.removeAttribute('data-lg-input');
			document.body?.removeAttribute('data-dsh-glass-theme');
		};

		function apply(ctx) {
			if (typeof document === 'undefined') return;
		try { window.__lgCtx = ctx } catch (e) {}
			try {
				stamp();
			} catch (error) {
				console.error('dsh-glass-theme: could not mark the document', error);
			}

			try {
				ctx.effect(() => trackModality());
			} catch (error) {
				console.error('dsh-glass-theme: could not track input modality', error);
			}

			try {
				ctx.effect(() => startDecorator());
			} catch (error) {
				console.error('dsh-glass-theme: could not decorate the model menu', error);
			}

			/* The ported picker replaces the composer's model seat. It renders its
			   own React tree, so it is mounted once and then left alone; the poll
			   inside it re-resolves the session, and the mount is retried until the
			   slot exists because the composer is not in the DOM on the hero page. */
			try {
				ctx.effect(() => {
					if (typeof document === 'undefined') return undefined;
					let seat = null;
					let stop = null;
					const attach = () => {
						if (seat !== null) {
							// A session switch unmounts the composer; if our seat left the
							// document, drop the old root and mount again.
							if (document.body.contains(seat)) return;
							try {
								stop && stop();
							} catch (error) {
								/* already disposed */
							}
							seat = null;
							stop = null;
						}
						let picker = null;
						try {
							picker = createPicker(require, ctx, catalog);
						} catch (error) {
							console.error('dsh-glass-theme: could not build the model picker', error);
							return;
						}
						try {
							stop = picker.mount();
							seat = document.querySelector('[class~="lg-picker"]');
						} catch (error) {
							console.error('dsh-glass-theme: could not mount the model picker', error);
						}
					};
					attach();
					if (typeof setInterval !== 'function') {
						return () => {
							try {
								stop && stop();
							} catch (error) {
								/* already disposed */
							}
						};
					}
					const timer = setInterval(attach, 1200);
					return () => {
						clearInterval(timer);
						try {
							stop && stop();
						} catch (error) {
							/* already disposed */
						}
					};
				});
			} catch (error) {
				console.error('dsh-glass-theme: could not install the model picker', error);
			}

			/* The merged usage panel replaces the host's three separate readouts
			   (context ring, activity pill, usage pill) with one. Same mounting
			   story as the picker: it lives in a slot that only exists once a
			   session is open, so the mount is retried until the dock appears. */
			try {
				ctx.effect(() => {
					if (typeof document === 'undefined') return undefined;
					let seat = null;
					let stop = null;
					const attach = () => {
						if (seat !== null) {
							if (document.body.contains(seat)) return;
							try {
								stop && stop();
							} catch (error) {
								/* already disposed */
							}
							seat = null;
							stop = null;
						}
						let stats = null;
						try {
							stats = createStats(require, ctx, catalog);
						} catch (error) {
							console.error('dsh-glass-theme: could not build the usage panel', error);
							return;
						}
						try {
							stop = stats.mount();
							seat = document.querySelector('[class~="lg-stats"]');
						} catch (error) {
							console.error('dsh-glass-theme: could not mount the usage panel', error);
						}
					};
					attach();
					if (typeof setInterval !== 'function') {
						return () => {
							try {
								stop && stop();
							} catch (error) {
								/* already disposed */
							}
						};
					}
					const timer = setInterval(attach, 1200);
					return () => {
						clearInterval(timer);
						try {
							stop && stop();
						} catch (error) {
							/* already disposed */
						}
					};
				});
			} catch (error) {
				console.error('dsh-glass-theme: could not install the usage panel', error);
			}

			/* The skin's own settings section: where the quick-provider list is
			   chosen. It registers into the host's `settings.section` slot, so it
			   appears as one more page in the settings shell rather than as a
			   second dialog with its own idea of navigation. */
			try {
				ctx.effect(() => {
					let done = null;
					try {
						done = createSettingsSection(require, ctx, catalog).register();
					} catch (error) {
						console.error('dsh-glass-theme: could not register the settings section', error);
					}
					return () => {
						try {
							if (typeof done === 'function') done();
						} catch (error) {
							/* already disposed */
						}
					};
				});
			} catch (error) {
				console.error('dsh-glass-theme: could not install the settings section', error);
			}

			try {
				// ctx.effect gives the disposer a defined lifetime: the sheets leave
				// with the plugin, including on hot reload.
				ctx.effect(() => {
					const tags = mount();
					return () => {
						for (const tag of tags) tag.remove();
						clear();
					};
				});
			} catch (error) {
				console.error('dsh-glass-theme: could not mount the skin stylesheets', error);
			}
		}

		/* `slots` is declared because the skin registers a settings page into the
		   host's `settings.section` list. Without the service in this list the
		   context has no `slots` accessor, `ctx.slots.inject` throws, and the page
		   silently never appears — the failure looks exactly like "the code did
		   nothing", which is why it cost a round trip. */
		const inject = ['slots'];

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
