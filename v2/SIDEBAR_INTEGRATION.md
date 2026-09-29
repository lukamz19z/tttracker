# Project sidebar integration

The current V2 project navigation already uses the project section/module registry.

Do **not** hard-code a second sidebar list.

The stable feature keys for this package are:

| Feature key | Sidebar label | Route |
| --- | --- | --- |
| `daily_dockets` | Daily Dockets | `/project/[projectId]/daily-dockets` |
| `materials` | Materials | `/project/[projectId]/materials` |
| `defects` | Defects | `/project/[projectId]/defects` |

`lib/projects/project-section-ui.ts` provides the UI fallback route/icon mapping.

The database/settings layer continues to decide whether a section is:

- enabled for the organisation subscription
- enabled for the project
- ready/released
- permitted for the current user

## Recommended visible order for the current transmission workflow

1. Overview
2. Towers
3. Forecasting
4. Daily Dockets
5. Materials
6. Defects

Future sections such as Deliveries, Rectifications, Workpacks, Safety and Commercial stay in the registry but remain hidden until enabled/released.

This preserves the V2 rule that optional sections do not appear simply because the feature has a route or existed in V1.
