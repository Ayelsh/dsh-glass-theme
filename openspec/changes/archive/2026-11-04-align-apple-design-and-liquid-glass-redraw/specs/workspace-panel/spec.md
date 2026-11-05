# Spec Delta

## ADDED Requirements

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
