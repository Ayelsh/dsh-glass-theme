# Spec Delta

## ADDED Requirements

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
