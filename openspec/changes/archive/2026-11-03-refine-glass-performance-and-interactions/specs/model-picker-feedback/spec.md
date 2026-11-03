# Spec Delta

## Purpose

Makes model and reasoning-effort changes understandable and recoverable by showing catalog progress, pending operations, authoritative selection state, and useful failure or empty-state feedback.

## ADDED Requirements

### Requirement: Pending selection has immediate feedback

The picker SHALL visibly identify a pending model or reasoning-effort change when the user activates it. Pending feedback SHALL be distinct from the host-confirmed selection, and duplicate activation of the same pending change SHALL NOT submit another operation.

#### Scenario: A model change is slow
- **WHEN** the user selects a model and the host has not yet confirmed it
- **THEN** the target model shows pending feedback while the confirmed selection remains identifiable

#### Scenario: A reasoning-effort change is pending
- **WHEN** the user changes reasoning effort and activates the same choice again before completion
- **THEN** the control shows its pending target and submits that change only once

### Requirement: Confirmation follows the host's current selection

The picker SHALL present a model or effort as selected only when the host's current selection confirms it. An operation returning successfully without a matching current selection SHALL NOT be presented as a confirmed change.

#### Scenario: Command completion precedes current-selection confirmation
- **WHEN** a model change reports successful command completion before the host publishes the requested current selection
- **THEN** the picker does not move the confirmed selection indicator solely because the command completed

#### Scenario: Confirmation does not arrive within the client waiting period
- **WHEN** a command has succeeded but its requested selection is still unconfirmed after eight seconds of waiting for the current-selection update
- **THEN** the picker replaces waiting feedback with an explicit unconfirmed-status explanation and manual retry, continues reflecting the host's current selection, and does not cancel or automatically roll back the host command

#### Scenario: The current model uses its default effort
- **WHEN** the host confirms the requested model without an explicit effort but the model declares an effective default effort
- **THEN** the picker compares that default when determining whether the requested effort is confirmed and does not invent a default when none is declared

#### Scenario: A choice from all providers succeeds
- **WHEN** a model selected in the all-providers card is confirmed by the host
- **THEN** that card returns to the main picker with focus in the main picker and the main picker remains open for reasoning-effort adjustment

### Requirement: Failed selections remain recoverable

The picker SHALL show an actionable failure for rejected model or effort changes, whether the failure is returned as a normal result or thrown. The failure itself SHALL NOT change the confirmed selection indicator, which SHALL continue reflecting the host's current selection. The user SHALL be able to retry without reopening the picker or losing the current query.

#### Scenario: A command returns a failure result
- **WHEN** the host returns an unsuccessful model-selection result without throwing
- **THEN** the picker shows a failure and retry action, retains the query and all-providers card if open, and continues to reflect the host-confirmed model

#### Scenario: A command throws or rejects
- **WHEN** a model or effort command throws synchronously or rejects asynchronously
- **THEN** pending feedback ends with a visible failure and a retry action for that target

#### Scenario: An older operation completes late
- **WHEN** the user has moved to another selection or session before an older operation completes
- **THEN** the older completion cannot dismiss the current card, replace the current operation's feedback, or claim a selection for the new session

#### Scenario: The user has already closed the picker
- **WHEN** the user closes or leaves the picker while a selection is pending and the host later confirms it
- **THEN** the confirmed selection can update normally without reopening a card or taking focus from the user's current task

### Requirement: Catalog and filtered states have distinct explanations

The picker SHALL distinguish initial catalog loading, unavailable catalog data, a partially available catalog, an empty catalog, and a search with no matching models. Available models SHALL remain usable when another provider fails to load.

#### Scenario: The initial catalog is loading
- **WHEN** no models have arrived and the catalog is still loading
- **THEN** the picker shows loading feedback rather than an empty-catalog message

#### Scenario: A search matches no visible models
- **WHEN** the catalog contains models but the current search filters every displayed group to zero results
- **THEN** the picker explains that there are no matching models and offers a way to clear the query

#### Scenario: Some providers cannot load
- **WHEN** one provider fails while other providers supply models
- **THEN** the picker explains the partial failure without presenting it as a selection failure or blocking the available models

#### Scenario: The catalog fails or is empty
- **WHEN** catalog loading finishes with an overall failure or with no available models
- **THEN** the picker presents the corresponding error with a retry action or an explicit empty-catalog explanation, respectively
