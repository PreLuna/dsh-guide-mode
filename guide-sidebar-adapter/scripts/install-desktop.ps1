param([switch]$Restore)
$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$profilePath = Join-Path $env:USERPROFILE '.dsh/profiles/desktop'
$packagePath = Join-Path $profilePath 'package.json'
$installedPath = Join-Path $profilePath 'node_modules/dsh-better-sidebar'
$officialPath = Join-Path $workspacePath 'evidence/LI-stage2-2026-11-02/official/package'
$archivePath = Join-Path $workspacePath 'evidence/LI-stage2-2026-11-02/official/dsh-better-sidebar-0.28.2.tgz'
$recoveryPath = Join-Path $workspacePath 'evidence/LI-stage2-2026-11-02/desktop-before'
$receiptPath = Join-Path $recoveryPath 'files.json'
$sourcePath = Join-Path $workspacePath 'guide-sidebar-adapter'
$adapterName = '@local/dsh-guide-sidebar-adapter'
& node (Join-Path $sourcePath 'scripts/build.mjs') --check
if ($LASTEXITCODE -ne 0) { throw 'Sidebar generated client is stale; build and validate before installation.' }
$activeHosts = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'DeepSeek Harness.exe' -and $_.CommandLine -match 'dsh-desktop-host[\\/]lib[\\/](index|cli)\.js'
})
if ($activeHosts.Count -gt 0) { throw "DSH Host is running (PID $($activeHosts.ProcessId -join ',')); close it before switching packages." }
if ((Get-Content -LiteralPath (Join-Path $installedPath 'package.json') -Raw | ConvertFrom-Json).version -ne '0.28.2') {
  throw 'Expected the reviewed better-sidebar 0.28.2 installation.'
}
$clientHash = (Get-FileHash -LiteralPath (Join-Path $installedPath 'lib/client.js') -Algorithm SHA256).Hash
if ($clientHash -notin @('10CA813DB2975AC244718CC80184FE63C2997AF2065505C96A07B05B0F843E99', 'DD93B4563F6FE3D384C0E8270FCF76656398AE358D18316A91AAE4046BDF2432')) {
  throw 'Installed sidebar differs from both the known fork and official baseline; preserve and review those changes before switching.'
}
function Bounded-Path([string]$root, [string]$relative) {
  $prefix = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
  $full = [IO.Path]::GetFullPath((Join-Path $root $relative))
  if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Path escaped target directory: $relative" }
  return $full
}
function Replace-File([string]$source, [string]$target) {
  $null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target)
  $temporary = $target + '.li-' + [Guid]::NewGuid().ToString('N') + '.tmp'
  try {
    [IO.File]::Copy($source, $temporary)
    # Replace the directory entry, avoiding edits through a possible hardlink.
    [IO.File]::Move($temporary, $target, $true)
  } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary } }
}
$manifest = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json -AsHashtable
if ($Restore) {
  if (-not (Test-Path -LiteralPath $receiptPath)) { throw 'No verified sidebar recovery receipt exists.' }
  $files = @(Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json)
  foreach ($file in $files) {
    $target = Bounded-Path $installedPath $file.relative
    if (Test-Path -LiteralPath $target -PathType Leaf) {
      $currentHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
      if ($currentHash -ne $file.officialHash -and $currentHash -ne $file.beforeHash) { throw "Preserve a subsequent modification before restoring: $($file.relative)" }
    }
  }
  foreach ($file in $files) {
    $target = Bounded-Path $installedPath $file.relative
    if ($file.existed) {
      $backup = Bounded-Path (Join-Path $recoveryPath 'package') $file.relative
      if ((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -ne $file.beforeHash) { throw "Recovery file changed: $($file.relative)" }
      Replace-File $backup $target
    } elseif (Test-Path -LiteralPath $target) {
      if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $file.officialHash) { throw "Refusing to remove a subsequently modified file: $($file.relative)" }
      Remove-Item -LiteralPath $target
    }
  }
  $manifest.dependencies.Remove($adapterName)
  $manifest.dsh.profile.bundles = @($manifest.dsh.profile.bundles | Where-Object { $_ -ne $adapterName })
  $mode = 'phase-one-sidebar'
} else {
  if (-not (Test-Path -LiteralPath $archivePath)) { throw 'Run prepare-official.mjs first.' }
  $registry = Get-Content -LiteralPath (Join-Path (Split-Path -Parent $archivePath) 'registry-baseline.json') -Raw | ConvertFrom-Json
  $sha = [Security.Cryptography.SHA512]::Create()
  try { $integrity = 'sha512-' + [Convert]::ToBase64String($sha.ComputeHash([IO.File]::ReadAllBytes($archivePath))) } finally { $sha.Dispose() }
  if ($integrity -ne $registry.integrity) { throw 'Official archive integrity changed.' }
  $relativeFiles = @(& tar -tzf $archivePath | Where-Object { -not $_.EndsWith('/') } | ForEach-Object {
    if (-not $_.StartsWith('package/')) { throw 'Unexpected archive path.' }
    $_.Substring(8)
  })
  if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate the verified archive.' }
  $null = New-Item -ItemType Directory -Force -Path $recoveryPath
  if (-not (Test-Path -LiteralPath $receiptPath)) {
    Copy-Item -LiteralPath $packagePath -Destination (Join-Path $recoveryPath 'profile-package.json')
    $files = @()
    foreach ($relative in $relativeFiles) {
      $source = Bounded-Path $officialPath $relative
      $target = Bounded-Path $installedPath $relative
      $existed = Test-Path -LiteralPath $target -PathType Leaf
      $beforeHash = $null
      if ($existed) {
        $backup = Bounded-Path (Join-Path $recoveryPath 'package') $relative
        $null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup)
        Copy-Item -LiteralPath $target -Destination $backup
        $beforeHash = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
      }
      $files += @{ relative = $relative; existed = $existed; beforeHash = $beforeHash; officialHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash }
    }
    [IO.File]::WriteAllText($receiptPath, ($files | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
  }
  foreach ($relative in $relativeFiles) {
    Replace-File (Bounded-Path $officialPath $relative) (Bounded-Path $installedPath $relative)
  }
  $linkPath = Join-Path $profilePath 'node_modules/@local/dsh-guide-sidebar-adapter'
  if (Test-Path -LiteralPath $linkPath) {
    $link = Get-Item -LiteralPath $linkPath
    if (-not $link.LinkType -or [IO.Path]::GetFullPath([string]$link.Target).TrimEnd('\') -ne $sourcePath.TrimEnd('\')) { throw 'Unexpected adapter link target.' }
  } else { $null = New-Item -ItemType Junction -Path $linkPath -Target $sourcePath }
  $manifest.dependencies[$adapterName] = 'link:' + $sourcePath.Replace('\', '/')
  if ($manifest.dsh.profile.bundles -notcontains $adapterName) { $manifest.dsh.profile.bundles += $adapterName }
  $mode = 'official-sidebar-with-adapter'
}
$temporaryManifest = Join-Path $recoveryPath 'profile-package.next.json'
[IO.File]::WriteAllText($temporaryManifest, ($manifest | ConvertTo-Json -Depth 50) + "`n", [Text.UTF8Encoding]::new($false))
Replace-File $temporaryManifest $packagePath
& node (Join-Path $workspacePath 'guide-goal-adapter/scripts/sync-profile-links.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Package/configuration switch completed, but owned link lockfile sync needs review before starting DSH.' }
Write-Output "Profile mode prepared: $mode. Package recovery receipt saved; no fork source or build path is used by the new adapter."
