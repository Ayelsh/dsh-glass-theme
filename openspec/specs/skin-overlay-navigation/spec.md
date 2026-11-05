# skin-overlay-navigation Specification

## Purpose
Provides predictable keyboard and focus behavior across skin-owned transient layers and settings drill-down views, while preserving the distinction between nonmodal tools and modal tasks.

## Requirements

### Requirement: Opening and closing a layer preserves useful focus

Opening a skin-owned picker, statistics panel, or workspace layer SHALL place focus on a meaningful control or named focus target within it. Keyboard dismissal SHALL return focus to its connected opener or a safe connected fallback. Pointer dismissal SHALL NOT steal focus from the newly activated target.

#### Scenario: The model picker opens from the keyboard
- **WHEN** the user activates the model trigger with the keyboard
- **THEN** focus enters its search field and the field has a visible keyboard focus indicator

#### Scenario: Statistics are opened and dismissed
- **WHEN** the user opens the statistics panel and closes it with Escape
- **THEN** focus enters a meaningful named target when opened and returns to the statistics trigger when closed

#### Scenario: The user clicks outside a nonmodal panel
- **WHEN** the user dismisses a nonmodal panel by activating a focusable control outside it
- **THEN** that outside control retains focus instead of focus being forced back to the panel's opener

### Requirement: Model and effort choices support keyboard navigation

The model list SHALL expose grouped single-selection semantics, keyboard movement among available results, and Enter activation. Reasoning-effort choices SHALL expose single-selection semantics with arrow-key navigation. Keyboard navigation SHALL remain within the currently active picker layer and retain access to search and other controls.

#### Scenario: A model is chosen from filtered results
- **WHEN** the user searches, moves through available results with arrow keys, and presses Enter
- **THEN** the active result remains visible and submits the same selection as pointer activation

#### Scenario: The active result disappears
- **WHEN** a query or catalog update removes the keyboard-active result
- **THEN** the active target moves to an available result or a defined empty state and never references a missing control

#### Scenario: Reasoning effort changes by keyboard
- **WHEN** the user focuses the reasoning-effort group and presses an arrow key
- **THEN** the appropriate available choice becomes active and follows the group's single-selection interaction consistently

### Requirement: Only the top owned layer handles dismissal

For nested skin-owned layers, one Escape or outside-dismissal gesture SHALL dismiss at most the top eligible layer. Lower layers SHALL retain their view state and focus context. Unloading a layer SHALL remove its dismissal handling.

#### Scenario: The all-providers card is above the main picker
- **WHEN** the user presses Escape with the all-providers card open
- **THEN** only that card closes and focus returns to its opener in the main picker

#### Scenario: An action dialog is above item details
- **WHEN** the user presses Escape in a workspace action dialog opened from item details
- **THEN** the action dialog closes while the underlying item details remain open and receive the appropriate return focus

#### Scenario: A panel is removed with a layer open
- **WHEN** the workspace is disabled or the skin is unloaded while one of its layers is open
- **THEN** its dismissal handlers and focus restrictions are removed and no disconnected target receives focus

### Requirement: Modal and nonmodal layers have different focus boundaries

A skin-owned modal layer SHALL have an accessible title, contain keyboard focus, and make underlying content unavailable until it closes. Nonmodal picker and statistics panels SHALL allow keyboard users to leave them without a focus trap.

#### Scenario: Focus cycles inside a modal action dialog
- **WHEN** the user presses Tab or Shift+Tab at either end of a workspace action dialog
- **THEN** focus remains within the dialog and background controls cannot be activated

#### Scenario: The user leaves a nonmodal picker
- **WHEN** the user tabs beyond a nonmodal picker
- **THEN** focus can continue to the surrounding interface and the picker does not force it back

#### Scenario: A narrow inspector blocks the page with a scrim
- **WHEN** the workspace inspector is presented as a blocking sheet over the page
- **THEN** its accessible title and focus boundary match that modal presentation until it is closed

### Requirement: Settings drill-down returns to a live control

Entering the provider-model settings view SHALL focus its heading or return control. Leaving that view SHALL restore focus to the newly rendered control for the originating provider, or to a safe settings target if that provider is no longer available, without changing existing draft-save behavior.

#### Scenario: A user returns without saving
- **WHEN** the user opens a provider's model settings, edits the local draft, and returns without saving
- **THEN** the draft is discarded and focus returns to that provider's current control on the provider board

#### Scenario: The provider disappears during editing
- **WHEN** the originating provider is no longer present when the user returns
- **THEN** focus reaches a connected settings heading or equivalent safe fallback

### Requirement: Display preferences do not expose closed layers

A closed skin-owned layer SHALL be absent from visual display, pointer interaction, and keyboard navigation with normal or reduced motion. Reduced motion SHALL remove nonessential travel without changing open and closed states or the final positions of state controls.

#### Scenario: Narrow details close with reduced motion
- **WHEN** reduced motion is enabled at a viewport width of 900 CSS pixels or less and the user closes item details
- **THEN** the inspector and its scrim are no longer visible, hit-testable, or reachable by Tab

#### Scenario: Motion preferences change during use
- **WHEN** the user changes the motion preference while a layer is opening or closing
- **THEN** the layer reaches the correct final visibility and focus state without blocking interaction

### Requirement: Bounded track thumbs and un-flicked overlays use non-overshooting settling curves
Switch knobs, segmented-control selection thumbs, and floating menus or modals that open without user flick velocity SHALL animate with a critically damped or gentle settling curve (`<= 4%` overshoot on popovers and `0%` overshoot on bounded track thumbs) so moving thumbs never cross their container borders.

#### Scenario: Toggling a settings switch keeps the knob inside the track
- **WHEN** a `.lg-settings-switch` toggles between `data-on="false"` and `data-on="true"`
- **THEN** `.lg-settings-knob` translates across its 14px travel using a non-overshooting curve and remains strictly inside the 2px inset of the 34px switch track throughout the transition

#### Scenario: Switching segmented-control stops keeps the thumb within the pill track
- **WHEN** the user selects a new stop in `.lg-picker-seg` or `.lgwsp-segmented`
- **THEN** the travelling thumb (`.lg-picker-seg-thumb`, `.lgwsp-segmented-plate`) settles smoothly onto the target segment without overshooting past the segment or pill boundary

#### Scenario: Opening a modal, menu, or popover settles without spring bounce
- **WHEN** a host modal (`AnXs9G_panel`), menu (`pc3rQa_menu`), toast (`_toast_l6cvn`), model picker card (`.lg-picker-card`), or stats panel (`.lg-stats-panel`) opens from a click or keypress
- **THEN** its entrance animation uses a critically damped or gentle deceleration curve rather than a 40%-overshoot spring

### Requirement: Interactive triggers and list rows provide immediate pointer-down tactile feedback
Interactive triggers, menu items, and navigation rows across the skin SHALL respond on pointer-down (`:active`) within `60ms–70ms` using a subtle inward scale (`0.97` to `0.99`) and downward or neutral translation, releasing smoothly over `120ms–160ms`.

#### Scenario: Pressing model picker, stats, sidebar, and menu controls
- **WHEN** the user presses and holds (pointer-down `:active`) `.lg-picker-trigger`, `.lg-picker-option`, `.lg-picker-more`, `.lg-picker-seg-item`, `.lg-stats-trigger`, `[class~='wtg9ga_panelRow']`, `[class~='AnXs9G_navCell']`, or `[class~='pc3rQa_item']`
- **THEN** the control immediately compresses inward via `transform: scale(...)` with a `<= 70ms` transition duration

#### Scenario: Pressing the composer primary send button
- **WHEN** the user presses `:active` on an enabled composer send button (`[class~='GRgSLq_primary']:active:not(:disabled)`)
- **THEN** the button compresses with `scale(0.95)` without lifting upward (`translateY(-1px)` is not applied)

### Requirement: Floating popovers anchor transform-origin to their resolved trigger placement
Portalled popovers for the model picker (`.lg-picker-card`) and session stats (`.lg-stats-panel`) SHALL expose their resolved vertical and horizontal placement (`data-lg-placement`) and anchor `transform-origin` to the corner or edge nearest the trigger that opened them.

#### Scenario: Model picker opens above a left-aligned composer trigger
- **WHEN** `.lg-picker-card` is placed above the trigger (`bottom-start` / `top` placement above trigger)
- **THEN** its `transform-origin` is anchored to `0% 100%` (bottom-left) rather than hardcoded to `100% 100%`

#### Scenario: Model picker or stats panel flips below the trigger near the top viewport edge
- **WHEN** `.lg-picker-card` or `.lg-stats-panel` flips below its trigger because of top viewport clearance
- **THEN** its `transform-origin` updates to the top edge (`0% 0%` or `100% 0%` matching horizontal alignment) so it scales out of the trigger

### Requirement: Settings provider-to-model drill-down preserves spatial continuity
Navigating between the provider list and a single provider's model checklist in the Liquid Glass settings section SHALL animate the view transition spatially along the horizontal navigation axis under normal motion preferences.

#### Scenario: Drilling into a provider's model list and returning
- **WHEN** the user opens a provider's model checklist (`.lg-settings-view`) or clicks the back button (`.lg-settings-back`) while `prefers-reduced-motion` is not active
- **THEN** the incoming view enters with a directional horizontal slide-and-fade transition that is disabled under `prefers-reduced-motion: reduce`
