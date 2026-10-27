# quick-provider-selection Specification

## Purpose

Defines what the model picker's quick list contains: which providers a user pins, and which of each pinned provider's models are shown, so a provider with a long model list does not crowd the picker.

## Requirements

### Requirement: Quick list is built from selected providers and models

The model picker SHALL show a pinned provider's models only when both the provider and the individual model are selected, and SHALL fall back to showing every provider when no provider is selected.

#### Scenario: Provider pinned with all models selected
- **WHEN** a user pins one provider and leaves all of that provider's models selected
- **THEN** the picker shows that provider's section with all of its models, and other providers are reachable only through the all-providers view

#### Scenario: Provider pinned with a subset of models
- **WHEN** a user pins a provider and selects only some of its models
- **THEN** the picker shows that provider's section containing exactly the selected models, with the section count matching what is shown

#### Scenario: No provider selected
- **WHEN** a user has not pinned any provider
- **THEN** the picker shows every provider and every model, exactly as it does when the feature is unused

#### Scenario: Provider pinned but every model deselected
- **WHEN** a pinned provider has had every one of its models explicitly deselected
- **THEN** that provider does not appear in the quick list, and the remaining pinned providers are shown

### Requirement: Model selection is keyed by provider and model

Selections SHALL identify a model together with the provider that offers it, so the same model id offered by two providers is two independent choices.

#### Scenario: Same model id under two providers
- **WHEN** a user selects a model id that two providers both offer, under one of them only
- **THEN** the picker shows it under the selected provider only, and the other provider's copy stays unselected

#### Scenario: Provider is unpinned and re-pinned
- **WHEN** a user unpins a provider that had a subset of models selected and later pins it again
- **THEN** that provider's previous model subset is restored, because unpinning removes the provider from the quick list without discarding its model choice

#### Scenario: Unpinning a provider
- **WHEN** a user unpins a provider
- **THEN** the quick list no longer shows that provider or any of its models

#### Scenario: Provider never configured
- **WHEN** a provider is pinned and its models have never been chosen individually
- **THEN** all of that provider's models are shown, including models the catalog gained after the selection was made

### Requirement: Settings page configures providers and their models

The settings page SHALL let a user enable or disable a provider, and SHALL let the user open a provider's own model list to choose which of its models are shown in the quick list.

#### Scenario: Opening a provider's model list
- **WHEN** the user activates a provider's model affordance on the settings page
- **THEN** the page shows that provider's models with their current selection, and a way to return to the provider list

#### Scenario: Choosing models
- **WHEN** the user checks or unchecks models in that view
- **THEN** the view reflects the unsaved draft immediately with no host round trip, and nothing is persisted until the user saves, at which point the choice is written once and the provider row reflects how many of its models are selected
- **WHEN** the user leaves the model list without saving
- **THEN** the draft is discarded and the previously saved selection stays in effect

#### Scenario: Provider is not enabled
- **WHEN** a provider is disabled
- **THEN** its model list is not reachable, and enabling it again shows the previously chosen models

#### Scenario: Provider offers no models
- **WHEN** a provider's model list is empty or not yet loaded
- **THEN** the page states that no models are available for it instead of showing an empty list with no explanation

### Requirement: Current model stays visible

The model the current session is using SHALL remain visible in the picker even when it is not among the selected providers or models.

#### Scenario: Current model filtered out by model selection
- **WHEN** the session's current model belongs to a pinned provider but is not one of the selected models
- **THEN** the picker still shows it, marked as the current model, and still shows the selected models

#### Scenario: Current model belongs to an unpinned provider
- **WHEN** the session's current model belongs to a provider the user has not pinned
- **THEN** the picker shows that provider's section containing the current model, alongside the pinned providers

### Requirement: Provider limit is enforced consistently

The number of selectable providers SHALL be capped, and the settings page and the model picker SHALL agree on that cap.

#### Scenario: Cap reached
- **WHEN** the user has enabled the maximum number of providers
- **THEN** the remaining providers cannot be enabled, and the page explains why

#### Scenario: Cap is displayed accurately
- **WHEN** the settings page shows how many providers are enabled
- **THEN** the displayed count matches the number the picker actually treats as pinned
