$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$evidencePath = Join-Path $workspacePath 'evidence/O19-production-2026-11-03/desktop'
$plan = Get-Content -LiteralPath (Join-Path $evidencePath 'plan.json') -Raw | ConvertFrom-Json -AsHashtable
$profilePath = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.dsh/profiles/desktop'))
if ($profilePath -ne [IO.Path]::GetFullPath($plan.profile)) { throw 'Migration plan belongs to a different profile.' }
$sourcePath = [IO.Path]::GetFullPath((Join-Path $workspacePath 'guide-admission'))
$linkPath = [IO.Path]::GetFullPath((Join-Path $profilePath 'node_modules/@local/dsh-guide-admission'))
if ($sourcePath -ne $plan.source -or $linkPath -ne $plan.link) { throw 'Unexpected source or link in migration plan.' }

function Bounded-Path([string]$root, [string]$relative) {
  $prefix = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
  $full = [IO.Path]::GetFullPath((Join-Path $root $relative))
  if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Path escaped intended directory: $relative" }
  return $full
}
function Hash([string]$path) { return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Replace-From([string]$source, [string]$target) {
  $temporary = $target + '.admission-' + [Guid]::NewGuid().ToString('N') + '.tmp'
  if (-not $temporary.StartsWith($profilePath.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Temporary target escaped profile.' }
  [IO.File]::Copy($source, $temporary)
  [IO.File]::Move($temporary, $target, $true)
}

# The profile is HMR watched. No write occurs until every precondition passes.
$profilePattern = [regex]::Escape($profilePath).Replace('\\', '[\\/]')
$active = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'DeepSeek Harness.exe' -and $_.CommandLine -match $profilePattern })
if ($active.Count -gt 0) { throw "Desktop Host is running (PID $($active.ProcessId -join ',')); migration requires it to be closed. Independent profiles are preserved." }
foreach ($entry in $plan.sourceHashes.GetEnumerator()) {
  if ((Hash (Bounded-Path $workspacePath $entry.Key)) -ne $entry.Value) { throw "Production source changed after planning: $($entry.Key)" }
}
foreach ($entry in $plan.unchangedHashes.GetEnumerator()) {
  if ((Hash (Bounded-Path $profilePath $entry.Key)) -ne $entry.Value) { throw "Profile changed after planning: $($entry.Key)" }
}
$alreadyApplied = $true
foreach ($file in $plan.files) {
  $target = Bounded-Path $profilePath $file.relative
  $candidate = Bounded-Path $evidencePath $file.candidate
  if ((Hash $candidate) -ne $file.afterSha256) { throw "Candidate changed: $($file.candidate)" }
  $current = Hash $target
  if ($current -ne $file.afterSha256) { $alreadyApplied = $false }
  if ($current -notin @($file.beforeSha256, $file.afterSha256)) { throw "Subsequent edit must be preserved: $($file.relative)" }
}
if (Test-Path -LiteralPath $linkPath) {
  $link = Get-Item -LiteralPath $linkPath
  if ($link.LinkType -ne 'Junction' -or [IO.Path]::GetFullPath([string]$link.Target) -ne $sourcePath) { throw 'Unexpected existing admission link.' }
} elseif ($alreadyApplied) { throw 'Manifest was applied but the admission link is absent; review before continuing.' }
if ($alreadyApplied) { Write-Output 'Admission desktop migration is already applied and verified.'; exit 0 }

$backupPath = Join-Path $evidencePath 'desktop-before'
$null = New-Item -ItemType Directory -Force -Path $backupPath
foreach ($file in $plan.files) {
  $backup = Bounded-Path $backupPath $file.relative
  if (Test-Path -LiteralPath $backup) {
    if ((Hash $backup) -ne $file.beforeSha256) { throw "Original backup changed: $($file.relative)" }
  } else {
    if ((Hash (Bounded-Path $profilePath $file.relative)) -ne $file.beforeSha256) { throw 'No original backup exists for an already changed file.' }
    $null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup)
    Copy-Item -LiteralPath (Bounded-Path $profilePath $file.relative) -Destination $backup
  }
}
foreach ($relative in @('cordis.patch.yml', 'cordis.yml', 'pnpm-workspace.yaml', 'node_modules/.modules.yaml')) {
  $backup = Bounded-Path $backupPath $relative
  if (-not (Test-Path -LiteralPath $backup)) {
    $null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup)
    Copy-Item -LiteralPath (Bounded-Path $profilePath $relative) -Destination $backup
  }
}

$replaced = @()
try {
  if (-not (Test-Path -LiteralPath $linkPath)) { $null = New-Item -ItemType Junction -Path $linkPath -Target $sourcePath }
  foreach ($file in $plan.files) {
    $target = Bounded-Path $profilePath $file.relative
    if ((Hash $target) -ne $file.afterSha256) {
      Replace-From (Bounded-Path $evidencePath $file.candidate) $target
      $replaced += $file
    }
    if ((Hash $target) -ne $file.afterSha256) { throw "Post-write hash mismatch: $($file.relative)" }
  }
  $receipt = @{ status = 'applied'; date = '2026-11-03'; profile = $profilePath; source = $sourcePath; link = $linkPath; files = $plan.files; config = $plan.policy; hostWasClosed = $true }
  [IO.File]::WriteAllText((Join-Path $evidencePath 'applied.json'), ($receipt | ConvertTo-Json -Depth 20) + "`n", [Text.UTF8Encoding]::new($false))
  Write-Output 'Admission desktop migration applied. Original profile files backed up; only the admission dependency, bundle and link lock records changed.'
} catch {
  foreach ($file in $replaced) {
    $target = Bounded-Path $profilePath $file.relative
    if ((Hash $target) -eq $file.afterSha256) { Replace-From (Bounded-Path $backupPath $file.relative) $target }
  }
  throw
}
