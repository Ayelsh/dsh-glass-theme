# workspace-panel Specification

## Purpose

Defines whether the 工作空间 (workspace) workbench is present in the application: its sidebar icon, its central panel, and how a persisted preference turns both off and back on again without a restart.

## Requirements

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

### Requirement: Workspace controls and status indicators bind to semantic state tokens
The Workspace panel SHALL bind project glyphs, open-menu triggers, row status chips, focus metric cards, and CLI connection pills to matching CSS custom properties and state selectors so every visual state renders with its intended semantic color and geometry in both Light and Dark themes.

#### Scenario: Project trigger glyph and open state render accurately
- **WHEN** `.lgwsp-project-trigger` renders the current project and the user opens the project menu (`aria-expanded="true"`)
- **THEN** `.lgwsp-project-glyph` resolves its tinted background and foreground from `--space-color`, the trigger displays its active focus ring, and `.lgwsp-project-chevron` rotates `180deg`

#### Scenario: Row status chips and focus cards display semantic tones
- **WHEN** work item rows (`.lgwsp-item-row`) and focus metric cards (`.lgwsp-focus-card`) render in the Workspace panel
- **THEN** `.lgwsp-item-chip` displays a tinted pill background and foreground for the item's workflow state, and `.lgwsp-focus-bug`, `.lgwsp-focus-story`, `.lgwsp-focus-wecom`, and `.lgwsp-focus-attention` resolve distinct semantic `--card-color` tokens

#### Scenario: CLI status dot distinguishes live connection from demo or disconnected state
- **WHEN** a CLI status pill (`.lgwsp-status-pill`) renders for TAPD or WeCom
- **THEN** `.lgwsp-status-dot.lgwsp-is-live` renders with the active success color and halo, while a non-live/demo `.lgwsp-status-dot` renders with a neutral or warning tone without a false green live halo

### Requirement: Workspace project rail avoids competing L3 glass and dual-sidebar clutter
The Workspace space rail (`.lgwsp-space-rail`) SHALL use a quiet subordinate surface without L3 `backdrop-filter: blur(34px)` glass-on-glass stacking, SHALL center its active project checkmark with accent styling, and SHALL collapse when hosted inside the main DSH shell alongside the primary application sidebar unless sufficient wide-viewport room exists.

#### Scenario: Workspace rendered inside the hosted DSH shell
- **WHEN** `工作空间` is opened inside the DSH shell (`[data-slot="main"]`) alongside the host sidebar
- **THEN** `.lgwsp-space-rail` does not stack a second L3 blurred sidebar next to the host sidebar, and the toolbar project switcher (`#projectTrigger`) and segmented tab bar provide complete single-hierarchy navigation

#### Scenario: Space rail active project indicator in standalone or wide layout
- **WHEN** `.lgwsp-space-rail` is visible and renders the selected project option (`.lgwsp-space-option.lgwsp-is-active`)
- **THEN** its checkmark indicator is vertically centered and styled in `--lg-accent` rather than as a top-aligned muted count badge

### Requirement: Workspace collaboration and CLI tabs share unified control styling
The `企微协作` (`docs`) and `执行 CLI` (`console`) tabs in the Workspace panel SHALL use the same `.lgwsp-*` toolbar, input, select, and action button styling as the overview, bugs, and stories tabs, and MUST NOT depend on legacy `.lgws-*` rules.

#### Scenario: Interacting with WeCom document search and CLI runner tabs
- **WHEN** the user switches to `企微协作` or `执行 CLI` in Light or Dark theme
- **THEN** the search inputs, CLI selector, and primary action buttons render with consistent `.lgwsp-*` heights, radii, focus rings, and `:active` press feedback
