# workspace-item-details Specification

## Purpose
Lets users read complete details for the existing supported TAPD bugs, stories, and tasks without indefinite loading or mixed project data, and recover from a failed read.

## Requirements

### Requirement: A detail read reaches a visible outcome

For a live TAPD bug, story, or task supported by the existing detail-read service, the workspace SHALL show read progress and then the returned detail, an explicit empty-description state, or an actionable error. Updating the loading display SHALL NOT invalidate the read itself. Other item types retain their existing summary-only behavior.

#### Scenario: Detail arrives after the loading state renders
- **WHEN** a user opens an item whose complete record is not yet cached and its read succeeds asynchronously
- **THEN** the loading indication is replaced by that item's returned detail

#### Scenario: A record has no description
- **WHEN** a successful detail read returns a valid record without description content
- **THEN** the panel shows a no-description state rather than continuing to indicate loading

#### Scenario: Existing summary content is available
- **WHEN** an item already has readable summary content while a complete record is loading
- **THEN** the panel retains that content and identifies the pending complete-detail read without presenting it as a failure

### Requirement: Detail results belong to their item and project

A detail result SHALL belong to the project, item type, and item identifier for which it was requested. Results from an obsolete project lifecycle or disposed panel SHALL NOT update the current view or populate its active cache.

#### Scenario: The user changes items before a read returns
- **WHEN** item A is loading and the user opens item B before A returns
- **THEN** A's result never replaces B's details and B can complete its own read

#### Scenario: Projects contain the same item identifier
- **WHEN** the user changes projects while a detail request for an identically numbered item in the previous project is pending
- **THEN** the old result is not displayed or reused as the new project's item detail

#### Scenario: The panel is disposed during a read
- **WHEN** the workspace panel is removed or unloaded before a detail request settles
- **THEN** the late result does not update or reopen the disposed panel

### Requirement: Detail failures can be retried

A failed detail read SHALL provide a retry action for the same item and project. A retry SHALL show progress and be able to replace the error with a successful result; repeated activation while that retry is pending SHALL NOT create duplicate reads.

#### Scenario: A failed read succeeds on retry
- **WHEN** a detail read fails and the user retries after the service recovers
- **THEN** the panel shows retry progress and replaces the error with the returned record

#### Scenario: Retry is activated repeatedly
- **WHEN** the user activates retry more than once before the same item's pending read settles
- **THEN** only one read for that item and project is outstanding

### Requirement: Revisiting an item does not strand loading

Within the same panel and project lifecycle, the workspace SHALL reuse a successfully read complete record when the user revisits its item. Closing and reopening a pending item SHALL either rejoin its outstanding read or begin a replacement read that can settle normally.

#### Scenario: A completed item is reopened
- **WHEN** the user closes and reopens an item whose complete record was already loaded in the same project lifecycle
- **THEN** the record is available without an additional detail read

#### Scenario: A pending item is reopened
- **WHEN** the user closes an item during its read and opens it again
- **THEN** the item can reach a completed or retryable error state and does not remain loading because its earlier view was closed

### Requirement: Inspector header uses honest native chrome without fake browser decorations
The in-page work item inspector (`.lgwsp-inspector`) SHALL present a clean native inspector header showing the item's source/context and real interactive controls, and MUST NOT render decorative traffic-light window dots, fake protocol URL bars (`tapd://`, `wecom://`), or non-interactive external-link icons.

#### Scenario: Opening a TAPD or WeCom item in the inspector
- **WHEN** the user selects a work item row to open `.lgwsp-inspector`
- **THEN** the inspector renders the item's details, status/owner actions, `在此开会话`, and real external open button (`在 TAPD 打开` / `在企微打开`) without fake window traffic-light dots (`.lgwsp-frame-dots`), fake `tapd://` or `wecom://` URL bars, or non-clickable `↗` decorations
