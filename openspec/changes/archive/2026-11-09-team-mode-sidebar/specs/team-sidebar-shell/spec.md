# Spec Delta

## Purpose

Defines the team-mode sidebar container: how team surfaces claim a seat inside the session sidebar's region area, how expanding swaps the sidebar's content between the session browser and the team panel, glass presentation bound to skin tokens, and containment so team failures never break the ordinary sidebar.

## ADDED Requirements

### Requirement: Team mode is user-controlled
The skin SHALL expose a settings switch that enables or disables team mode, and team mode SHALL default to enabled. When disabled, the sidebar SHALL present the ordinary session list with no team surfaces rendered.

#### Scenario: Team mode disabled
- **WHEN** the user turns the team-mode switch off on the settings page
- **THEN** the sidebar shows the ordinary session browser and no team rows, rooms, or team panels are rendered

#### Scenario: Team mode re-enabled without restart
- **WHEN** the user turns the team-mode switch back on
- **THEN** the team panel surfaces reappear inside the sidebar without an application restart

### Requirement: Team panel lives in the sidebar region
The team surface SHALL register a seat in the sidebar's region area (the slot that hosts the workspace browser) plus a footer action entry for its stow control. The team panel SHALL NOT float as a separate column, overlay the application, or alter the chat column's layout; the center column SHALL keep showing the conversation at all times.

#### Scenario: Expanded panel replaces the browser
- **WHEN** the team panel is expanded while team mode is enabled
- **THEN** the sidebar's region area shows the team panel in place of the session browser, at the sidebar's own width, with no separate floating column

#### Scenario: Center column untouched
- **WHEN** the team panel expands or stows
- **THEN** the conversation in the center column stays mounted and keeps its layout

### Requirement: Team panel stows by default
The team panel SHALL be stowed whenever no stow choice has been recorded, so the sidebar always first paints with the ordinary session browser; the team content SHALL replace the browser only after the user expands it.

#### Scenario: First use shows the session browser
- **WHEN** a user who has never expanded or stowed the team panel loads the application
- **THEN** the sidebar shows the session browser and no team content replaces it

#### Scenario: Recorded choice wins on load
- **WHEN** a stow or expand choice has been recorded for the user
- **THEN** the sidebar paints with the recorded content on load

### Requirement: Stow swaps content back to the browser
The team panel SHALL provide a stow control in its head plus an always-visible footer toggle next to the sidebar's own controls. Activating either SHALL clear the team-open state, restoring the session browser in the region area without a reload; expanding again SHALL swap the browser back out. The stowed choice SHALL persist as described by `team-sidebar-preferences`.

#### Scenario: Stow returns the session browser
- **WHEN** the user activates the head stow control or the footer toggle
- **THEN** the session browser reappears in the sidebar immediately and the team panel unmounts from view without a reload

#### Scenario: Expand swaps the browser out
- **WHEN** the user expands the team panel from the footer toggle while it is stowed
- **THEN** the region area swaps back to the team panel and the browser's state is preserved

#### Scenario: Stow state survives a reload
- **WHEN** the application reloads with the team panel last stowed
- **THEN** the sidebar first paints with the session browser visible, not the team panel

### Requirement: Glass presentation binds to skin tokens
Team sidebar surfaces SHALL be styled with the skin's glass material system, binding colors, blur radii, corners, and state colors to the skin's CSS custom properties so Light and Dark themes both render correctly. Team surfaces MUST NOT hardcode colors that bypass the token system.

#### Scenario: Dark theme renders team rows
- **WHEN** the application is in Dark theme
- **THEN** team rows, rooms, and panels render with the theme's glass tokens and remain legible

#### Scenario: Theme switch updates team surfaces
- **WHEN** the user switches between Light and Dark themes
- **THEN** team sidebar surfaces update together with the rest of the skin without a reload

### Requirement: Team registration failure stays contained
A failure while registering, updating, or rendering team surfaces SHALL NOT prevent the rest of the skin from loading or the ordinary session list from working. The team sidebar SHALL degrade to the ordinary session list when team state is unavailable.

#### Scenario: Team state unavailable at load
- **WHEN** the team state source fails or is empty while the skin loads
- **THEN** the skin loads normally, the ordinary sidebar works, and no broken team container is rendered

#### Scenario: Runtime team error
- **WHEN** a team rendering or update step throws at runtime
- **THEN** the error is contained to the team surface and the rest of the skin continues functioning
