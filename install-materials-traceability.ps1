param([string]$RepoPath = "")
$ErrorActionPreference = "Stop"
# Legacy ZIP installers must not overwrite applied migrations or current code.
if (-not $RepoPath) {
  $RepoPath = if ((Split-Path -Leaf $PSScriptRoot) -eq "v2") { Split-Path -Parent $PSScriptRoot } else { $PSScriptRoot }
}
$RepoPath = (Resolve-Path -LiteralPath $RepoPath).Path
$CanonicalMigration = Join-Path $RepoPath "supabase\migrations\20261002180000_materials_import_integrity.sql"
if (-not (Test-Path -LiteralPath $CanonicalMigration)) { throw "Canonical Materials import migration not found: $CanonicalMigration" }
Write-Host "Materials migrations are maintained only in supabase/migrations. No files will be copied or renamed."
Push-Location -LiteralPath $RepoPath
try {
  & npx supabase db push --dry-run
  if ($LASTEXITCODE -ne 0) { throw "Migration dry-run failed." }
} finally { Pop-Location }
Write-Host "Review the dry-run before applying migrations. See supabase/migrations/README.md."
