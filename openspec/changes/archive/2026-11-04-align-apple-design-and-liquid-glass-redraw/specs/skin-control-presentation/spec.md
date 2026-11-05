# Spec Delta

## ADDED Requirements

### Requirement: Nested settings surfaces inside blurred modals avoid glass-on-glass stacking
When the Liquid Glass settings section renders inside an already-blurred host settings modal, its nested board, utility controls, and meter badges SHALL use raised or tinted non-blurred surfaces and MUST NOT apply a second `backdrop-filter` blur or decorative ambient glow behind the nested board.

#### Scenario: Settings section rendered inside the host settings modal
- **WHEN** the Liquid Glass settings section is mounted inside the host settings dialog (`[class~='AnXs9G_panel']`)
- **THEN** `.lg-settings-board`, `.lg-settings-utility`, and `.lg-settings-meter` render with `backdrop-filter: none` and `.lg-settings-glow` is hidden so only the outer modal shell samples the backdrop

#### Scenario: Settings section rendered standalone in presentation fixtures
- **WHEN** the Liquid Glass settings section is mounted outside `[class~='AnXs9G_panel']` in a standalone fixture
- **THEN** `.lg-settings-board` retains its standalone presentation and still degrades to `backdrop-filter: none` with hidden glow, sheen, and grain under `prefers-reduced-transparency: reduce`

### Requirement: Concentric corner geometry on nested card rows
Nested interactive rows and footer buttons inside rounded cards SHALL use inner border radii aligned with `innerRadius = outerRadius - insetPadding` so outer and inner corners share a concentric curvature center.

#### Scenario: Settings board and model picker inner rows align concentrically
- **WHEN** `.lg-settings-board`, `.lg-picker-card`, or `[class~='V7pFBG_group']` renders nested rows or action buttons
- **THEN** each child row radius matches the container radius minus the container inset padding (within 1px), avoiding pinched or flared corner gaps

### Requirement: Host overlay and chrome sheets honor reduced-transparency and increased-contrast preferences
All floating glass surfaces styled across host overlays, composer cards, conversation floating controls, settings popovers, and secondary pages SHALL disable `backdrop-filter` and use opaque surface tokens when `prefers-reduced-transparency: reduce` is active, and SHALL render explicit 1px structural borders when `prefers-contrast: more` is active.

#### Scenario: Host dialogs, menus, composer, and popovers under reduced transparency
- **WHEN** `prefers-reduced-transparency: reduce` is active in either Light or Dark theme
- **THEN** host modals (`AnXs9G_panel`, `cS6V_W_dialog`, `Wsg8iW_dialog`, `J8V0KW_dialog`, `St8tea_dialog`), menus (`pc3rQa_menu`, `Ag-ohG_menu`, `-4GESq_menu`, `js5r2G_root`), composer glass (`GRgSLq_card::before`, `F07MqG_panel`), conversation floating controls (`SNx2jG_frame`, `SNx2jG_preview`, `V4vHZW_toBottom`), and stat/context popovers (`xXe6ja_panel`, `A6Bq1a_panel`) resolve `backdrop-filter: none` over an opaque surface fill

#### Scenario: Host dialogs, menus, composer, and popovers under increased contrast
- **WHEN** `prefers-contrast: more` is active in either Light or Dark theme
- **THEN** those floating surfaces and interactive pills render an explicit 1px border or inset box-shadow using high-contrast border tokens

### Requirement: Scoped focus and reduced-motion rules do not leak globally across stylesheets
Component-specific stylesheets (including `workspace.css`) MUST scope focus-ring and reduced-motion rules to their own root container so they do not override the skin's global keyboard-gated focus ring (`html[data-lg-input='keyboard']`) or global `120ms` reduced-motion opacity/color fade.

#### Scenario: Pointer click on a non-workspace button does not trigger an unscoped focus outline
- **WHEN** the user clicks a button outside the Workspace panel using a pointer (`html[data-lg-input='pointer']`)
- **THEN** no unscoped `button:focus-visible` rule from `workspace.css` applies a 3px focus outline

#### Scenario: Reduced motion preserves non-spatial opacity and color transitions globally
- **WHEN** `prefers-reduced-motion: reduce` is active
- **THEN** no unscoped `*` rule in `workspace.css` forces `transition-duration: 1ms !important` on global elements outside the Workspace container

### Requirement: Cross-stylesheet selector ownership avoids conflicting material rules
Each host component selector decorated by the skin SHALL have a single authoritative material and radius definition without conflicting overrides across `overlays.css`, `settings.css`, `pages.css`, and `widgets.css`.

#### Scenario: Ask-question card and goal bar retain consistent material definitions
- **WHEN** `[class~='ZG377q_card']` or `[class~='Gc24Bq_bar']` renders in the conversation or composer dock
- **THEN** its background, border-radius, and backdrop-filter come from one consistent rule set rather than being partially overwritten by a later stylesheet
