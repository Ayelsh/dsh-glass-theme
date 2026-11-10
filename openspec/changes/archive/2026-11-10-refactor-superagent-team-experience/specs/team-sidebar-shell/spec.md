# Spec Delta

## MODIFIED Requirements

### Requirement: Team panel lives in the sidebar region
The team surface SHALL register a seat in the sidebar's region area (hosting the lightweight Router Console, Worker Roster, and Thread Rooms), a footer action entry for its stow control, and an optional `main` workspace slot entry for full-canvas Mission Control when explicitly opened by the user. When a member or ticket is inspected from the sidebar, the wide Slide-Over Live Inspector Drawer (380px–440px) SHALL anchor cleanly along the sidebar edge without unmounting or breaking the center conversation column.

#### Scenario: Expanded panel replaces the browser
- **WHEN** the team panel is expanded while team mode is enabled
- **THEN** the sidebar's region area shows the Router Console, Worker Roster, and Thread Rooms in place of the session browser, at the sidebar's own width

#### Scenario: Center column untouched
- **WHEN** the team panel expands, stows, or opens/closes the Slide-Over Live Inspector Drawer
- **THEN** the conversation in the center column stays mounted and keeps its layout and state

### Requirement: Glass presentation binds to skin tokens
Team sidebar and inspector surfaces SHALL follow the Apple Liquid Glass material system and bind all colors, blur radii, specular highlights, corners, and state colors exclusively to CSS custom properties defined in `src/css/tokens.css`. Team surfaces MUST NOT stack translucent glass cards inside a translucent glass container (one material per layer: outer floating drawer uses `--lg-glass-2`/`--lg-glass-3` with `inset 0 0.5px 0 var(--lg-edge-top)`, while inner cards use solid/elevated surfaces `--lg-surface` / `--lg-surface-raised`), MUST compute concentric corner radii (`r_inner = r_outer - gap`), MUST provide immediate `:active` press scaling (`scale(0.97)`) and `--lg-ease-spring` transitions, and MUST NOT reference undefined token aliases or hardcoded hex colors.

#### Scenario: Dark theme renders team rows
- **WHEN** the application is in Dark theme
- **THEN** team rows, rooms, and inspector surfaces render with the theme's glass and surface tokens (one material per layer, concentric radii) and remain legible

#### Scenario: Theme switch updates team surfaces
- **WHEN** the user switches between Light and Dark themes
- **THEN** team sidebar and inspector surfaces update together with the rest of the skin without a reload

#### Scenario: Interactive controls respond with physical press and spring motion
- **WHEN** the user presses buttons, segmented tabs, or roster rows and opens or closes the inspector drawer
- **THEN** controls scale down immediately on pointer down (`scale(0.97)`) and panels/pills animate with `--lg-ease-spring` transitions (respecting `prefers-reduced-motion: reduce`)
