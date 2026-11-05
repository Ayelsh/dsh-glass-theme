# Spec Delta

## ADDED Requirements

### Requirement: Inspector header uses honest native chrome without fake browser decorations
The in-page work item inspector (`.lgwsp-inspector`) SHALL present a clean native inspector header showing the item's source/context and real interactive controls, and MUST NOT render decorative traffic-light window dots, fake protocol URL bars (`tapd://`, `wecom://`), or non-interactive external-link icons.

#### Scenario: Opening a TAPD or WeCom item in the inspector
- **WHEN** the user selects a work item row to open `.lgwsp-inspector`
- **THEN** the inspector renders the item's details, status/owner actions, `在此开会话`, and real external open button (`在 TAPD 打开` / `在企微打开`) without fake window traffic-light dots (`.lgwsp-frame-dots`), fake `tapd://` or `wecom://` URL bars, or non-clickable `↗` decorations
