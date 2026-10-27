# skin-preferences Specification

## Purpose

Defines where the Liquid Glass skin keeps the preferences a user changes on its settings page: a host-side settings entry that survives restarts and profile changes, with the browser-side mirror that lets the model picker read a selection synchronously at first paint.

## Requirements

### Requirement: Settings page persists through host settings

The skin's settings page SHALL read its current values from, and write every user change to, the host settings entry that the plugin declares, rather than treating browser storage as the source of truth.

#### Scenario: Value survives a restart
- **WHEN** a user changes a value on the skin's settings page and then restarts the application
- **THEN** the settings page shows the changed value on next open, and the rest of the skin behaves as that value specifies

#### Scenario: Write is rejected
- **WHEN** a write is refused because the stored revision is stale
- **THEN** the settings page re-reads the host value, shows the refreshed value, and does not leave the control in a state that contradicts what is stored

#### Scenario: Host settings entry is unavailable
- **WHEN** the running build does not expose the skin's settings entry
- **THEN** the settings page still renders and remains usable, falling back to the browser-side mirror, and the rest of the skin keeps working

### Requirement: Settings page reflects changes made elsewhere

The settings page SHALL observe the host settings entry and update the displayed values when they change outside the page, without requiring a reload.

#### Scenario: Second window changes a value
- **WHEN** the same preference is changed from another window or another part of the application
- **THEN** the open settings page shows the new value without a page reload

### Requirement: Browser storage mirrors the selection

The skin SHALL keep a browser-storage mirror of the quick-provider selection so the model picker can read it synchronously before the host settings entry has loaded.

#### Scenario: Picker reads before settings arrive
- **WHEN** the model picker mounts before the host settings entry has produced a value
- **THEN** the picker applies the selection from the browser-storage mirror, and the quick list is already correct on first paint

#### Scenario: Mirror follows the settings page
- **WHEN** the user changes the selection on the settings page
- **THEN** the mirror is updated in the same interaction, so any picker already mounted re-renders without waiting for a network round trip

### Requirement: Legacy selection is migrated once

The skin SHALL migrate a selection that exists only in the browser-storage mirror into the host settings entry the first time it runs against an entry that holds no selection.

#### Scenario: Existing user upgrades
- **WHEN** a user who previously configured quick providers in browser storage opens a build that reads host settings
- **THEN** their previous selection becomes the stored selection, and the settings page shows those providers as enabled

#### Scenario: Migration does not overwrite
- **WHEN** the host settings entry already holds a selection
- **THEN** the browser-storage value is not written over it, and the stored selection wins

#### Scenario: Legacy value is unusable
- **WHEN** the browser-storage value cannot be parsed or names providers the catalog does not offer
- **THEN** the skin discards the unusable entries, keeps the usable ones, and never fails to render the settings page because of them

### Requirement: Reset restores the declared default

The settings page SHALL offer a way to clear the stored selection, and clearing it SHALL return the skin to the behavior its declared default describes.

#### Scenario: User clears the selection
- **WHEN** the user clears the quick-provider selection
- **THEN** the stored value returns to the declared default and the model picker immediately behaves as that default specifies

#### Scenario: Reset is reflected in the mirror
- **WHEN** the user clears the selection
- **THEN** the browser-storage mirror is cleared as well, so a subsequent first paint matches the stored default

### Requirement: Settings page declares that it owns its presentation

Because the skin ships its own settings page, it SHALL declare that page to the host settings service so the service does not also generate a page for the same entry.

#### Scenario: Host does not generate a duplicate page
- **WHEN** the host settings service enumerates entries that build their own pages
- **THEN** the skin's entry is excluded from generated pages, and the skin's own section remains the single settings surface for it

#### Scenario: Host settings service is absent
- **WHEN** the running build has no host settings service
- **THEN** the declaration is skipped without error and the skin still loads
