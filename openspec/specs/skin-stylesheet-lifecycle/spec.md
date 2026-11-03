# skin-stylesheet-lifecycle Specification

## Purpose
Keeps the skin's stylesheet set stable while the host loads or replaces its styles, and releases that set safely when the skin is unloaded or replaced.

## Requirements

### Requirement: Stylesheet reconciliation reaches a stable state

The skin SHALL maintain one stylesheet per declared sheet identifier in the declared order after host styles. Once that state is reached, the skin SHALL stop changing stylesheet nodes until a relevant external change occurs.

#### Scenario: Startup settles without external changes
- **WHEN** the skin has mounted and no external stylesheet changes occur
- **THEN** every declared sheet is present exactly once in order and subsequent scheduled checks do not move, replace, or rewrite those stylesheet nodes

#### Scenario: Unrelated head content changes
- **WHEN** non-stylesheet metadata or script nodes are added after the skin's styles
- **THEN** the skin does not move its styles solely because those unrelated nodes are last

### Requirement: Host stylesheet changes preserve the skin's cascade

The skin SHALL restore its declared stylesheet order after host stylesheet additions without removing or modifying the host's nodes. A batch of external changes SHALL converge to one stable stylesheet set without causing recurring self-triggered repairs.

#### Scenario: Multiple host styles arrive together
- **WHEN** the host adds multiple stylesheets in one update
- **THEN** the skin's sheets follow the new host styles in their declared order and stylesheet changes cease after reconciliation

### Requirement: Missing styles and replacement heads recover

While the document is visible, the skin SHALL recover removed skin sheets and a replaced document head within one compatibility-check interval, retain unique sheet identifiers, and continue handling later host stylesheet additions.

#### Scenario: Skin sheets are removed
- **WHEN** the host removes one or all skin stylesheets
- **THEN** the skin restores the missing sheets without duplicates and returns to a stable state

#### Scenario: The host replaces the head
- **WHEN** the host replaces the document head and later adds another stylesheet to the new head
- **THEN** the skin restores its sheets in the new head and continues preserving its cascade there

### Requirement: Disposal prevents style resurrection

After a skin mount is disposed, its observers and scheduled work SHALL cease affecting the document. Late callbacks SHALL NOT recreate styles or remove styles owned by a newer mount.

#### Scenario: A repair is pending during unload
- **WHEN** the skin is unloaded before a scheduled startup or repair callback runs
- **THEN** executing any late callback leaves the disposed mount's sheets absent and schedules no further repair

#### Scenario: A new mount replaces an old mount
- **WHEN** a new skin mount takes ownership of the stylesheet set before the previous mount is disposed
- **THEN** disposing the previous mount leaves the new mount's unique, ordered stylesheet set intact

#### Scenario: The last active mount is unloaded
- **WHEN** the last active skin mount is disposed
- **THEN** no skin-owned styles or active stylesheet-repair work remain

### Requirement: Compatibility recovery does not require every browser API

The skin SHALL retain bounded stylesheet recovery and safe disposal when animation-frame scheduling or mutation observation is unavailable, without continuously rewriting an already-correct stylesheet set.

#### Scenario: Mutation observation is unavailable
- **WHEN** the host removes a skin sheet in an environment without mutation observation
- **THEN** the visible-document compatibility check restores it and stops making changes once the set is correct

#### Scenario: Animation-frame scheduling is unavailable
- **WHEN** a host stylesheet change occurs without animation-frame scheduling
- **THEN** the skin restores its stylesheet order through its fallback scheduler and unload still prevents late restoration
