# Proposal

## Why

The skin's visual foundation is established, but stylesheet reconciliation can keep scheduling itself, workspace details can remain loading, and model changes and keyboard navigation lack reliable feedback. A focused first tranche will make everyday operation predictable while improving small-text readability and reducing visual competition in settings.

## What Changes

- Make stylesheet reconciliation converge after startup and external stylesheet changes, recover missing sheets, and stop completely on disposal.
- Correct workspace detail request ownership so asynchronous results reach the right item, failures can be retried, and stale work cannot affect another project or an unmounted panel.
- Show model and reasoning-effort selection progress, confirmed outcomes, actionable failures, and distinct catalog-loading and search-empty states using the existing host model-directory contract.
- Complete keyboard entry, navigation, and focus return for skin-owned picker, statistics, settings drill-down, and workspace layers. Only the top layer handles dismissal; modal dialogs contain focus. Preserve a genuinely hidden closed inspector when reduced motion is enabled.
- Raise essential auxiliary text to a readable size and contrast in both themes, including selected states. Simplify settings enabled rows and reduce ambient color and grain while retaining the existing glass hierarchy.
- Add targeted lifecycle and browser regressions and regenerate the distributed bundle during implementation.

This proposal adopts the first-tranche recommendation from the preceding exploration. Broad polling/subscription refactoring, statistics session rebinding, two-card responsive redesign, workspace grid-animation changes, GPU tuning, global density preferences, and provider-icon redesign are deferred. No host APIs, preference formats, provider limits, or existing selection/draft semantics are changed.

## Capabilities

### New Capabilities

- `skin-stylesheet-lifecycle`: Stable stylesheet ownership, bounded reconciliation, compatibility recovery, and complete disposal.
- `workspace-item-details`: Project-scoped asynchronous detail loading, safe reuse, stale-result isolation, and retry.
- `model-picker-feedback`: Observable catalog and selection states, authoritative confirmation, and recoverable model/effort failures.
- `skin-overlay-navigation`: Keyboard access, correct focus ownership and return, top-layer dismissal, and accessible closed states for skin-owned layers and their settings drill-down.
- `skin-control-presentation`: Readable auxiliary text and restrained, distinguishable settings control states across themes and display preferences.

### Modified Capabilities

None. The existing `quick-provider-selection`, `skin-preferences`, and `workspace-panel` specifications cover filtering, persistence, and panel presence. Their requirements remain in force; the new capabilities cover lifecycle, feedback, navigation, and presentation without duplicating those contracts.

## Impact

- Frontend: `src/client.js`, `src/workspace.js`, `src/picker.js`, `src/stats.js`, `src/settings-section.js`, targeted `src/css/` sheets, and package-local shared helpers if needed.
- Verification: extend the existing `tools/` Node and CDP-based checks with asynchronous lifecycle, failure, keyboard, theme, and reduced-motion cases. Existing first-render smoke shims do not exercise asynchronous observer delivery or effect dependency cleanup adequately.
- Distribution: rebuild `lib/client.js` from authored sources after implementation; do not patch generated code directly.
- Compatibility: retain host settings and browser-mirror behavior, workspace route registration, plain-script module loading, and React 18 support. No new runtime package or host-side change is planned.
- Evidence boundary: source and built-code inspection plus in-memory control-flow reproductions support the two lifecycle defects. Historical screenshots guide visual changes; browser CPU/GPU gains and the final appearance require implementation-time validation.
