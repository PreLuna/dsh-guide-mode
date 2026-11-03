param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$evidencePath = Join-Path $workspacePath 'evidence/O19-production-2026-11-03/desktop'
$plan = Get-Content -LiteralPath (Join-Path $evidencePath 'plan.json') -Raw | ConvertFrom-Json -AsHashtable
$profilePath = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.dsh/profiles/desktop'))
if ($profilePath -ne [IO.Path]::GetFullPath($plan.profile)) { throw 'Unexpected profile.' }
function Bounded([string]$root, [string]$relative) {
  $full = [IO.Path]::GetFullPath((Join-Path $root $relative))
  if (-not $full.StartsWith($root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Path escaped root.' }
  return $full
}
function Hash([string]$path) { return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
$profilePattern = [regex]::Escape($profilePath).Replace('\\', '[\\/]')
if (@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'DeepSeek Harness.exe' -and $_.CommandLine -match $profilePattern }).Count -gt 0) { throw 'Close desktop Host before rollback.' }
$restore = @()
foreach ($file in $plan.files) {
  $target = Bounded $profilePath $file.relative
  $backup = Bounded (Join-Path $evidencePath 'desktop-before') $file.relative
  if ((Hash $target) -ne $file.afterSha256 -or (Hash $backup) -ne $file.beforeSha256) { throw "Subsequent edit or invalid backup: $target" }
  $restore += @{ target = $target; backup = $backup }
}
foreach ($entry in $plan.sourceHashes.GetEnumerator()) {
  if (-not $entry.Key.StartsWith('guide-panel/')) { continue }
  $target = Bounded $workspacePath $entry.Key
  $backup = Bounded (Join-Path $workspacePath 'evidence/O19-production-2026-11-03/workspace-before') $entry.Key
  if ((Hash $target) -ne $entry.Value -or -not (Test-Path -LiteralPath $backup)) { throw "Subsequent edit or missing code backup: $target" }
  $restore += @{ target = $target; backup = $backup }
}
$linkPath = Bounded $profilePath 'node_modules/@local/dsh-guide-admission'
$link = Get-Item -LiteralPath $linkPath
if ($link.LinkType -ne 'Junction' -or [IO.Path]::GetFullPath([string]$link.Target) -ne $plan.source) { throw 'Unexpected admission link.' }
if ($CheckOnly) { Write-Output "Rollback preflight passed: $($restore.Count) files and exact junction checked; no writes."; exit 0 }
foreach ($file in $restore) { Copy-Item -LiteralPath $file.backup -Destination $file.target }
Remove-Item -LiteralPath $linkPath
[IO.File]::WriteAllText((Join-Path $evidencePath 'rollback.json'), (@{ status = 'rolled-back'; date = '2026-11-03'; restoredFiles = $restore.Count } | ConvertTo-Json) + "`n")
Write-Output 'Restored previous panel code and profile selection. Admission source/evidence retained.'
