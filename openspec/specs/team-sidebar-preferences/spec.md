# team-sidebar-preferences Specification

## Purpose
Defines persistence and UI presentation for team sidebar preferences — enabled state, stow state, per-feature toggles, Super-agent autonomy mode (`observe` vs `auto`), and external Watchdog toggle — through the host settings entry with a browser-side mirror for first paint.

## Requirements

### Requirement: Team preferences persist through host settings
The team sidebar SHALL read its preferences from, and write every change to, the host settings entry the plugin declares (`teamSidebar`, `teamFeatures`, `teamCollapsed`, `teamAutonomyMode`, `teamWatchdog`). Feature toggles on the settings page SHALL render as compact inline pill checkboxes inside the team settings card rather than full-width stacked bars.

#### Scenario: Feature list and autonomy mode persist
- **WHEN** the user changes feature pills or switches `teamAutonomyMode` between `observe` and `auto` and restarts
- **THEN** the team panel retains the configured feature visibility and autonomy policy mode

#### Scenario: Stow preference persists
- **WHEN** the user stows the team panel and restarts
- **THEN** the team panel opens stowed and the native session browser remains visible

### Requirement: Super-agent autonomy mode defaults to observe
The declared `teamAutonomyMode` preference SHALL default to `'observe'` (low-interruption speculative observation mode) and allow switching to `'auto'` (autonomous ticket dispatch mode) from either the settings page, the team header badge, or the command palette.

#### Scenario: Default autonomy mode is observe
- **WHEN** the plugin loads with no prior `teamAutonomyMode` recorded
- **THEN** the team engine operates in `'observe'` mode so ambient candidate triggers stage draft tickets for user approval

#### Scenario: Switching autonomy mode to auto
- **WHEN** the user switches `teamAutonomyMode` to `'auto'`
- **THEN** candidate room triggers are automatically authorized and dispatched to Workers without manual approval

### Requirement: Preferences observed across surfaces
The settings page, the sidebar container, and team surfaces SHALL observe preference changes (`teamSidebar`, `teamFeatures`, `teamCollapsed`, `teamAutonomyMode`, `teamWatchdog`) and stay consistent without requiring a reload.

#### Scenario: External settings change reflects immediately
- **WHEN** a team preference changes while the team panel is rendered
- **THEN** the team panel reflects the new value immediately without a reload

### Requirement: Browser mirror enables first paint
The skin SHALL keep a browser-storage mirror of the team panel's enabled, stow, autonomy mode, and watchdog state so the sidebar can render with the correct state before the host settings entry has loaded.

#### Scenario: First paint uses the mirror
- **WHEN** the application starts and the host settings entry has not yet loaded
- **THEN** the sidebar renders using the mirrored state

#### Scenario: Mirror reconciles with host entry
- **WHEN** the host settings entry loads and differs from the mirror
- **THEN** the host entry wins and the mirror is updated to match

### Requirement: Reset restores team defaults
The settings page SHALL offer a way to reset team preferences, and resetting SHALL re-enable the team panel, restore the default feature list, set `teamAutonomyMode` back to `'observe'`, and enable `teamWatchdog`.

#### Scenario: Reset team preferences
- **WHEN** the user resets team preferences on the settings page
- **THEN** `teamSidebar` is `true`, `teamFeatures` has all four features, `teamAutonomyMode` is `'observe'`, and `teamWatchdog` is `true`

### Requirement: Stow state persists as a view preference
The stowed/unfolded state of the team panel SHALL persist as a host preference (`teamCollapsed`), defaulting to `true` (stowed) when unrecorded, and SHALL NOT participate in the reset-to-defaults flow.

#### Scenario: Stow state holds across restart
- **WHEN** the user stows the team panel and the application reloads
- **THEN** the sidebar reopens stowed with the native session browser visible

#### Scenario: Stow state is not reset
- **WHEN** the user resets team preferences on the settings page
- **THEN** the stow state is left as the user last set it

#### Scenario: Unrecorded stow defaults to stowed
- **WHEN** neither the host settings entry nor the mirror records a stow choice for the user
- **THEN** the sidebar treats the team panel as stowed until the user expands it
