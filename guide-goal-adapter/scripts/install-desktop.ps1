param([switch]$Restore)
$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$profilePath = Join-Path $env:USERPROFILE '.dsh/profiles/desktop'
$packagePath = Join-Path $profilePath 'package.json'
$linkPath = Join-Path $profilePath 'node_modules/@local/dsh-guide-goal-adapter'
$sourcePath = Join-Path $workspacePath 'guide-goal-adapter'
$backupPath = Join-Path $workspacePath 'evidence/LI-stage1-2026-11-02/desktop-before'
# Touching the profile manifest can trigger HMR. Never apply during a live Host.
$activeHosts = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'DeepSeek Harness.exe' -and $_.CommandLine -match 'dsh-desktop-host[\\/]lib[\\/](index|cli)\.js'
})
if ($activeHosts.Count -gt 0) { throw "DSH Host is running (PID $($activeHosts.ProcessId -join ',')); close it before this paired configuration switch." }
$manifest = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json -AsHashtable
$adapterName = '@local/dsh-guide-goal-adapter'
if ($Restore) {
  if (-not (Test-Path -LiteralPath (Join-Path $backupPath 'package.json'))) { throw 'No pre-install recovery manifest exists.' }
  # Restore only the adapter-owned entry; preserve other later profile changes.
  $manifest.dependencies.Remove($adapterName)
  $manifest.dsh.profile.bundles = @($manifest.dsh.profile.bundles | Where-Object { $_ -ne $adapterName })
  $mode = 'original-driver'
} else {
  $null = New-Item -ItemType Directory -Force -Path $backupPath
  if (-not (Test-Path -LiteralPath (Join-Path $backupPath 'package.json'))) {
    Copy-Item -LiteralPath $packagePath -Destination (Join-Path $backupPath 'package.json')
    foreach ($filename in @('cordis.patch.yml', 'pnpm-lock.yaml')) {
      if (Test-Path -LiteralPath (Join-Path $profilePath $filename)) { Copy-Item -LiteralPath (Join-Path $profilePath $filename) -Destination (Join-Path $backupPath $filename) }
    }
  }
  if (Test-Path -LiteralPath $linkPath) {
    $item = Get-Item -LiteralPath $linkPath
    if (-not $item.LinkType -or [IO.Path]::GetFullPath([string]$item.Target).TrimEnd('\') -ne $sourcePath.TrimEnd('\')) {
      throw "Unexpected existing adapter path: $linkPath"
    }
  } else {
    $null = New-Item -ItemType Junction -Path $linkPath -Target $sourcePath
  }
  $manifest.dependencies[$adapterName] = 'link:' + $sourcePath.Replace('\', '/')
  if ($manifest.dsh.profile.bundles -notcontains $adapterName) { $manifest.dsh.profile.bundles += $adapterName }
  $mode = 'guide-goal-adapter'
}
$json = ($manifest | ConvertTo-Json -Depth 50) + "`n"
[IO.File]::WriteAllText($packagePath, $json, [Text.UTF8Encoding]::new($false))
& node (Join-Path $PSScriptRoot 'sync-profile-links.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Profile metadata is recoverable, but the owned link lockfile sync failed; review before starting DSH.' }
# Restoring removes bundle selection, so its original-driver disable patch is
# no longer composed. Keep the link for non-destructive, repeatable switching.
Write-Output "Profile mode prepared: $mode. Cold-start DSH; original package files are unchanged."
