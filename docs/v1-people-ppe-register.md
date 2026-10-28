# V1 PPE sizing register

The operational register reports employee sizing, not physical distribution or stock.

- Existing shirt, jacket, glove and pants sizes stay in their canonical `employees` columns. Other configured types use `people_ppe_requirements.size_value`, keyed by employee/type IDs.
- Active `people_ppe_types` define names, whether a size/value is needed, independent size options and ordering. Inactive categories preserve existing data.
- Each employee contributes once to an item/size count. Configured or overridden quantities and issue events do not affect totals or completeness.
- Missing details means an active category needs a size/value but none is recorded. No-size categories do not produce missing-size warnings. Existing nonblank historical sizes remain visible.
- Default personnel scope is `active !== false`, matching the existing People register. Crew, employment, search, type, size and Complete/Missing filters apply to the same report/export/print scope. Person completeness considers all active categories, even when viewing one type.
- Overview size chips drill down to the contributing People rows. People expand to read-only sizing; authorised users choose Edit PPE to change canonical sizing.
- CSV and the dedicated print report contain Employee, Employee Number, Crew, PPE Item, Size and Status. They contain no physical issue quantities or inventory calculations.

## API and permissions

`GET /api/people/ppe` loads minimally selected employees and additional sizes in 1,000-row pages, plus definitions and permitted crew labels in parallel. It does not query issue history or its aggregate view. No per-employee requests.

`PATCH /api/people/ppe` validates the category/options and writes only the mapped employee size or additional sizing row. It preserves dormant quantity overrides and all issue history. Existing historical values outside current options can be kept unchanged. Additional-size insertion handles a concurrent initial-row insert.

The register's former `POST` issue operation returns controlled HTTP 409. Configuration reads/writes only name, active, requires_size, size_options and sort_order; it never resets dormant issue settings.

View/export/print require `tt.people`, `people.view_basic`, `people.view_ppe`; editing/configuration additionally require `people.edit`. Crew information requires `people.view_crews`. Stable employee/type IDs are used; confidential employee fields are not loaded.

## Schema and deployment

The sizing schema is unchanged. The same PPE Register now also includes a separate physical inventory ledger; see [V1 PPE inventory](v1-ppe-inventory.md) for its new migration and rollout. Existing category-level issue tables, quantity columns, functions and historical events remain unchanged. They are not inferred to be physical inventory receipts or issues. Deploy the V1 website/API together. No mobile or native changes.

## Validation

Run `node scripts/verify-v1-ppe-register.mjs`, `node scripts/verify-v1-people-access-provider.mjs`, website TypeScript, changed-file ESLint and the production build. The PPE script retains schema/backwards-compatibility checks and tests sizing-only counts, canonical values, active/crew filtering, missing data, permissions, safe CSV and paginated bulk loading.
