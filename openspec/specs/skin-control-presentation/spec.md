# skin-control-presentation Specification

## Purpose
Keeps essential auxiliary information readable and settings control states visually clear across the skin's themes, while preserving its existing floating-glass and opaque-content hierarchy.

## Requirements

### Requirement: Essential auxiliary text is readable by default

Model descriptions and rate labels, provider model counts, settings helper text, and workspace status, owner, and time metadata SHALL use at least 12 CSS pixels with at least 17 CSS pixels of line height at the default text scale. These roles SHALL reach a contrast ratio of at least 4.5:1 against their actual composited backgrounds in light and dark themes.

#### Scenario: Auxiliary text appears on an ordinary surface
- **WHEN** one of the named text roles is displayed in an ordinary non-disabled state in either theme
- **THEN** its computed size and line height meet the minimums and its rendered text/background pair meets the contrast target

#### Scenario: A model row is selected or hovered
- **WHEN** a model row containing a description and rate label is selected, hovered, or both selected and hovered
- **THEN** those text roles remain readable against that state-specific background and meet the same contrast target

#### Scenario: The host uses a different theme from the operating system
- **WHEN** the host theme changes independently of the operating system theme
- **THEN** the text and surfaces use the host-selected theme and continue meeting the readability targets

### Requirement: Provider enablement is visually distinct from interaction focus

Settings provider rows SHALL use their switch position and state as the primary enablement indicator. Ordinary enabled rows SHALL use restrained background emphasis without an accent outline or simultaneous accent treatment on their name and glyph. Hover and keyboard focus SHALL remain separately identifiable.

#### Scenario: Enabled and disabled providers appear together
- **WHEN** the provider board shows a mixture of enabled and disabled rows
- **THEN** their switches clearly distinguish enablement while enabled row names and identity marks retain the ordinary text and glyph treatment

#### Scenario: Keyboard focus reaches an enabled row control
- **WHEN** the user tabs to a control in an enabled provider row
- **THEN** its focus indicator is immediately visible and distinguishable from the row's persistent enabled state

### Requirement: Decorative settings effects remain subordinate to content

The settings board SHALL retain its edge highlight and depth cues while using reduced ambient color, colored outer shadow, and grain compared with the previous presentation. Decorative effects SHALL NOT compromise the readability or state recognition of its text and switches.

#### Scenario: The ordinary settings board is shown in either theme
- **WHEN** the user opens settings in the light or dark host theme
- **THEN** its controls remain visually foregrounded and its ambient color, grain, and colored outer shadow use the reduced presentation defined by the change design

### Requirement: Display preferences preserve control meaning

Under reduced transparency the settings board SHALL use an opaque readable surface without decorative glow or grain. Increased contrast SHALL retain strong control and focus boundaries. Reduced motion SHALL preserve final switch positions and control states without nonessential translation or scale motion.

#### Scenario: Reduced transparency is enabled
- **WHEN** the user requests reduced transparency
- **THEN** settings decoration is hidden, backdrop blur is removed, and text and enabled states remain readable on the solid surface

#### Scenario: Increased contrast overrides restrained row emphasis
- **WHEN** increased contrast is enabled
- **THEN** stronger outlines or boundaries can identify controls without being suppressed by ordinary-theme row styling

#### Scenario: The interface is used at larger display scaling
- **WHEN** the host runs at Windows display scaling of 125 percent or 150 percent
- **THEN** the named text roles remain legible within their controls and the new typography does not overlap switches, buttons, or adjacent labels

#### Scenario: Display preferences are combined
- **WHEN** reduced motion, reduced transparency, and increased contrast are enabled together
- **THEN** control state, focus, and readability remain intact without decorative motion or transparent surfaces

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
