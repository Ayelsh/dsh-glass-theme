# Spec Delta

## Purpose

Defines whether the 工作空间 (workspace) workbench is present in the application: its sidebar icon, its central panel, and how a persisted preference turns both off and back on again without a restart.

## ADDED Requirements

### Requirement: Workspace presence is user-controlled

The skin SHALL expose a switch on its settings page that controls whether the 工作空间 panel and its sidebar icon are registered, and SHALL default to enabled.

#### Scenario: Fresh install
- **WHEN** a user has never touched the switch
- **THEN** the sidebar shows the 工作空间 icon and selecting it opens the panel

#### Scenario: User turns the workspace off
- **WHEN** the user turns the switch off
- **THEN** the sidebar icon disappears and the panel is no longer reachable, without a page reload

#### Scenario: User turns the workspace back on
- **WHEN** the user turns the switch back on
- **THEN** the sidebar icon reappears in its usual position and the panel opens as before, without a page reload

### Requirement: Turning the workspace off while it is open returns to the session

When the workspace panel is the visible central panel and the switch is turned off, the application SHALL return to the ordinary session view instead of leaving an empty or broken central area.

#### Scenario: Switch turned off from inside the workspace
- **WHEN** the user is looking at the 工作空间 panel and turns the switch off from the settings page
- **THEN** the central area shows the session conversation again and no blank panel remains

#### Scenario: Switch turned off while another panel is open
- **WHEN** the user is looking at a different central panel and turns the workspace switch off
- **THEN** the currently open panel stays open and only the workspace icon and panel are removed

### Requirement: Workspace preference survives restarts

The on/off state SHALL be persisted with the other skin preferences, so the choice holds across restarts and profile switches.

#### Scenario: Restart after turning it off
- **WHEN** the user turns the workspace off, restarts the application, and reopens it
- **THEN** the sidebar icon is still absent and the settings switch still shows off

### Requirement: Workspace removal is UI-only

Turning the workspace off SHALL only remove the panel and its sidebar icon. The background capabilities the panel uses SHALL remain available, so turning the panel back on needs no re-authentication or re-installation.

#### Scenario: Turning it off does not stop background work
- **WHEN** the user turns the workspace off and later turns it back on
- **THEN** the panel opens with its existing account, cached data, and configured commands intact

#### Scenario: Background endpoints stay registered
- **WHEN** the workspace panel is off
- **THEN** the skin's workspace endpoints still respond, and nothing in the application reports a missing route because of the toggle

### Requirement: Workspace registration failure stays contained

A failure while registering or removing the workspace SHALL NOT prevent the rest of the skin from loading.

#### Scenario: Registration throws
- **WHEN** registering the workspace panel throws during startup
- **THEN** the skin's other surfaces, including the settings page and the model picker, still load and work
