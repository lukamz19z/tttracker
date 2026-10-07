# Inactive V2 SQL references

These `.sql.disabled` files are historical references, not active migrations.
Do not apply them or copy them back into a migration directory.

## Preserved non-identical files

| Original location | Archived file | Disposition |
| --- | --- | --- |
| `v2/supabase/migrations/017_materials_project_wide_import_upgrade.sql` | `017_materials_project_wide_import_upgrade.sql.disabled` | Missing DDL reconciled by root `20261002180000_materials_import_integrity.sql`; option seeds already canonical. |
| `supabase/migrations/supabase/migrations/20261002170000_materials_import_schema_fix.sql` | `20261002170000_materials_import_schema_fix.sql.disabled` | Same import schema changes; reconciled without pretending the old version was applied. |
| `v2/supabase/migrations/20260929_012_operations_control_centre.sql` | `20260929_012_operations_control_centre.sql.disabled` | Root `20260929110945_operations_control_centre.sql` includes this implementation plus prerequisite checks, a corrected conflict target, and schema reload. |
| `v2/supabase/migrations/20260929_012_operations_control_foundation.sql` | `20260929_012_operations_control_foundation.sql.disabled` | Distinct legacy configuration/reviewer model; not used by Materials imports. Preserved without activating unrelated schema. |

## Removed duplicates

All paths below were under `v2/supabase/migrations/`:

| Removed file | Existing canonical root migration |
| --- | --- |
| `20260927_006_invitation_delivery.sql` | `20260927103336_invitation_delivery.sql` (identical executable SQL; comments/format differ) |
| `20260927_007_auth_email_workflows.sql` | `20260927104756_auth_email_workflows.sql` |
| `20260927_008_tenant_setup_framework.sql` | `20260928101620_tenant_setup_framework.sql` |
| `20260928_009_security_mfa.sql` | `20260928103405_security_mfa.sql` |
| `20260928_010_workspace_projects_towers.sql` | `20260928104522_workspace_projects_towers.sql` |
| `20260928_011_project_tower_forecasting.sql` | `20260928110923_project_tower_forecasting.sql` |
| `20261002_016_materials_traceability_control.sql` | `20261002062325_materials_traceability_control.sql` |
| `20261002163500_material_bundle_deliveries_two_stage.sql` | `20261002163500_material_bundle_deliveries_two_stage.sql` |

The duplicate nested `supabase/migrations/supabase/verification/verify_materials_import_schema_fix.sql`
was removed; the byte-identical original remains in `supabase/verification/`.
Root migration filenames/content and remote migration history were left intact.
