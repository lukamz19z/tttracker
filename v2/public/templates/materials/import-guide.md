# Materials import guide

Choose scope before mapping or applying.

- **Single tower:** use the searchable tower picker. A tower column is optional and is not used for targeting.
- **Selected towers:** choose targets with search. Evaluate applicability only within this subset; an explicit list is intersected with these towers.
- **Evaluate all project towers:** evaluate the schedule against every project tower, applying only matching requirements. Confirm applicability to the displayed tower types. This does not infer engineering applicability.
- **Tower from CSV:** map your tower column to Tower Identifier. Each row must match exactly one existing project tower. No towers are created.

Members support every scope. Map Applicable Towers and explicitly choose blank behaviour (Common within scope, Applies to none, or Requires attention) and list delimiter. For a common/default schedule choose Common. Explicit lists always exclude unlisted towers. Save/load these settings with a mapping profile. Unsupported rule kinds are rejected; future resolvers can add tower types/attributes without replacing source history. Use Selected or All for a shared schedule; use Tower from CSV for tower-specific member rows. A batch stores the upload once, with separate tower requirements and operational history.

The Bundles template demonstrates Tower from CSV with T001/T002. Replace these example identifiers with your actual project tower identifiers. Bundle references such as 1/1 remain text and can repeat on different towers.

Add preserves existing masters. Merge enriches without blank erasure or receipt resets. Replace supersedes only the selected towers, category, source role and document scope; historical records are retained.

Blank rows are ignored. Partially populated invalid rows block the entire atomic import. Validation counts describe source rows; the success summary also shows the number of tower requirements applied.

Uploads currently support CSV. Export spreadsheet values to CSV; XLSX upload is not implemented.

Repeated Member Numbers retain source variants and tower-specific packing hints. A source hint is not a global member bundle property. Member imports can precede Bundle manifests: missing/ambiguous assignments remain pending. Bundle imports and reconciliation link only unique context matches.

Bundle manifests default to distinct source-row identity, preserving repeated bundle numbers with separate UUIDs. Choose Reference and context identity only when your profile defines those rows as the same package. Keep the same source document scope across revisions; Replace preserves operational history while superseding the scoped manifest. Source-row identities use physical row/context, so reordered revisions should be reviewed and replaced rather than assumed identical.

Unknown applicability references default to blocking validation. A profile may explicitly retain unknown references as unresolved source rules for towers not currently present. Those rules create no operational records or cross-project links. Ambiguous identifiers always block. Tower-from-CSV targeting remains strict.

Map a Bundle manifest Section to Manifest Section / Package Context, separately from Tower Segment. A Member Schedule Section/profile maps to Profile, not to physical package context. Optional Member Packing Context can resolve manifest duplicates when the source supplies matching package context; missing context is never guessed.


## Schedule readiness and later towers

Member Schedule profiles default blank Applicable Towers to Common within selected scope. Other blank policies remain configurable. Save profile stores mapping and applicability without importing material records; selecting that profile restores its settings.

Unavailable applicability references are warnings. Valid source rows are retained even if no current tower matches. Single/Selected scopes remain bounded to their chosen tower IDs. Evaluate all project towers also supports later project towers. After adding/importing towers, run Materials reconciliation to evaluate the stored schedule without uploading it again. Repeated reconciliation is safe; existing receipts and operational assignments remain unchanged. Tower-from-CSV target mapping remains strict and project-specific.

Preview and Import readiness remain visible. Use preview search/pagination and expand mapping, tower breakdown or issue groups only when needed. The footer reports source rows, target towers and fatal errors beside Import.
