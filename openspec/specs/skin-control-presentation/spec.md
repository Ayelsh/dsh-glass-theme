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
