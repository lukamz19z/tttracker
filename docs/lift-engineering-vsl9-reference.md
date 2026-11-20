# VSL+9 / GMK5220 validation reference data

Reusable library data for the first V1 Lift Engineering regression case is sourced from:

- `BCC-P.25.002-HLW-LS-VSL9-GMK5220-REV-A.xlsm` (Inputs, Lifting Sum., and Lift detail sheets)
- `BCC-HLW-VSL9-GMK5220-LS-REV-B.pdf` (chart appendix, PDF pages 8–9)

The supplied files were found in the HumeLink West delivery folder, not the TTTracker repository. The committed fixture is an extracted regression dataset and does not copy either source document into the repository.

The workbook supplies all 14 lift groups, element masses, dimensions, boom configurations/sequences, nominal and maximum radii, installed heights, load-share phases, wind limits, and the source study's external outrigger reactions. The PDF chart appendix is image-based; the importer seeds only the six chart points required at the sequence maximum radii (20, 22, and 26 m for the applicable configurations). It does not claim to provide complete OEM chart tables. Capacity values remain traceable to the BC study PDF pages and require controlled manufacturer-chart verification before operational issue.

The workbook gives outrigger span 8.557 × 8.1 m while the PDF chart appendix states 8.550 × 8.100 m. Both values are retained. The files do not provide OR1–OR4 and slew-centre coordinates or enough crane/component mass and CG information for Romanello/CSP equilibrium analysis. The importer therefore creates no outrigger geometry coordinates and does not calculate reactions.

The main/auxiliary 140 kg / 120 kg rigging tare entries are aggregate study values. No component-level rigging breakdown was supplied, so each remains an explicitly labelled aggregate rigging item rather than an invented parts list. Hook, rope and boom-top attachment taring are separate crane components and derive the 0.98 t / 0.57 t total overhead values.

The reusable-library importer is idempotent for records carrying its dataset key and refuses to overwrite an ambiguous/existing natural key without that key. It is dry-run by default and never creates a project Lift Study. To inspect the plan:

```powershell
node scripts/lift-engineering/import-vsl9-gmk5220-reference.mjs
```

To apply reusable data after the existing Lift Engineering migration has been reviewed and applied, explicitly set the intended Supabase URL/service-role environment and confirm that project's ref:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-key>"
node scripts/lift-engineering/import-vsl9-gmk5220-reference.mjs --apply --confirm-project-ref <project-ref>
```

This is a temporary operator-run import mechanism. Organisation-level library source document uploads still use `LIFT_ENGINEERING_LIBRARY_DRIVE_ID` and `LIFT_ENGINEERING_LIBRARY_FOLDER_ID`; later these should be selected through TTTracker's existing organisation SharePoint integration configuration, with the IDs kept server-side.
