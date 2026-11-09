#Requires -Version 5.1
<#
  Guide-manager restart helper.

  Modes:
    (default)  apply pending.json, then restart DSH
    -Reload    only stop and restart DSH so changed local link sources load
    -Rollback  restore the newest cordis.patch.yml backup, then restart DSH

  Double-click restart-guide-manager.cmd, reload-guide-manager.cmd, or
  rollback-guide-manager.cmd. Only `DeepSeek Harness` processes are stopped;
  unrelated applications are not touched. The official profile patch writer
  runs under Electron Node.
#>
param(
  [string]$Profile = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop'),
  [string]$Pending = '',
  [string]$DshExe = (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'),
  [switch]$Reload,
  [switch]$Rollback,
  [switch]$Install,
  [switch]$PackageChange,
  [switch]$Maintenance,
  [string]$LaunchRecord = '',
  [switch]$NoRestart,
  [switch]$GracefulOnly,
  [int]$StopTimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$profileDir = [IO.Path]::GetFullPath($Profile)
$modeCount = @($Reload, $Rollback, $Install, $PackageChange, $Maintenance).Where({ $_ }).Count
if ($modeCount -gt 1) { throw 'Choose exactly one helper mode' }
$pendingName = if ($Maintenance) { 'maintenance-pending.json' } elseif ($PackageChange) { 'package-pending.json' } elseif ($Install) { 'install-pending.json' } else { 'pending.json' }
$pendingPath = if ($Pending -eq '') { Join-Path (Join-Path $profileDir '.guide-manager') $pendingName } else { [IO.Path]::GetFullPath($Pending) }
$applyName = if ($Maintenance) { 'apply-maintenance.mjs' } elseif ($PackageChange) { 'apply-package.mjs' } elseif ($Install) { 'apply-install.mjs' } else { 'apply-pending.mjs' }
$applyScript = Join-Path $here $applyName
$stateDir = Join-Path $profileDir '.guide-manager'
$backupDir = Join-Path $stateDir 'backups'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $stateDir "helper-$stamp.log"
$resultPath = Join-Path $stateDir 'helper-result.json'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$launchPath = if ($LaunchRecord) { [IO.Path]::GetFullPath($LaunchRecord) } else { Join-Path $stateDir 'launcher.json' }
$launchSpec = if (Test-Path -LiteralPath $launchPath) { Get-Content -LiteralPath $launchPath -Raw -Encoding utf8 | ConvertFrom-Json } else { $null }
$dshHomeDir = Split-Path -Parent (Split-Path -Parent $profileDir)
$profileName = Split-Path -Leaf $profileDir
if ((Split-Path -Leaf (Split-Path -Parent $profileDir)) -ne 'profiles') { throw 'Profile must be under a DSH home/profiles directory' }
if ($launchSpec) {
  if ($launchSpec.schema -ne 1 -or $launchSpec.kind -notin @('web', 'desktop') -or
      [IO.Path]::GetFullPath([string]$launchSpec.profile) -ne $profileDir -or
      [IO.Path]::GetFullPath([string]$launchSpec.home) -ne $dshHomeDir -or
      [IO.Path]::GetFullPath([string]$launchSpec.executable) -ne [IO.Path]::GetFullPath($DshExe)) { throw 'Invalid launcher identity or profile' }
  $defaultDesktop = $launchSpec.defaultDesktop -eq $true -and $profileDir -eq [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.dsh/profiles/desktop'))
  if ($launchSpec.kind -eq 'desktop' -and ($profileName -ne 'desktop' -or (-not $defaultDesktop -and [string]$launchSpec.userData -notmatch '^(?:[a-zA-Z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)'))) { throw 'Desktop launcher needs its own absolute userData directory' }
  if ($launchSpec.kind -eq 'web' -and ([int]$launchSpec.port -lt 1024 -or [int]$launchSpec.port -gt 65535)) { throw 'Web launcher needs a concrete unprivileged port' }
} elseif ($profileDir -ne [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.dsh/profiles/desktop'))) {
  throw 'A non-default profile requires .guide-manager/launcher.json; no processes were stopped'
}
$script:trackedProcesses = @{}

function Write-Log {
  param([string]$Message)
  $line = '[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $Message
  Write-Host $line
  Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
}

function Write-Result {
  param([string]$Status, [hashtable]$Extra = @{})
  $data = [ordered]@{
    at = (Get-Date).ToString('o')
    status = $Status
    pending = $pendingPath
    log = $logPath
  }
  foreach ($key in $Extra.Keys) { $data[$key] = $Extra[$key] }
  [IO.File]::WriteAllText($resultPath, (($data | ConvertTo-Json -Depth 5) + "`n"), [Text.UTF8Encoding]::new($false))
}

function Get-DshProcesses {
  $rows = @(Get-CimInstance Win32_Process)
  if ($script:trackedProcesses.Count -eq 0) {
    if ($launchSpec) {
      $root = @($rows | Where-Object { $_.ProcessId -eq [int]$launchSpec.pid })
      if ($root.Count -eq 0) { return @() }
      $expectedStart = if ($launchSpec.createdAt -is [DateTime]) { $launchSpec.createdAt.ToUniversalTime() }
        elseif ($launchSpec.createdAt -is [DateTimeOffset]) { $launchSpec.createdAt.UtcDateTime }
        else { [DateTimeOffset]::Parse([string]$launchSpec.createdAt, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime }
      if ($root[0].ExecutablePath -ne $DshExe -or [Math]::Abs(($root[0].CreationDate.ToUniversalTime() - $expectedStart).TotalSeconds) -gt 2) {
        throw "Launcher PID identity changed; refusing to stop it. PID=$($root[0].ProcessId); executable=$($root[0].ExecutablePath); recorded=$($expectedStart.ToString('o')); observed=$($root[0].CreationDate.ToUniversalTime().ToString('o'))"
      }
      $marker = if ($launchSpec.kind -eq 'desktop') { [string]$launchSpec.userData } else { '--profile ' + $profileName }
      if ($defaultDesktop) {
        $pattern = '^\s*"?' + [regex]::Escape($DshExe) + '"?\s*(--updated)?\s*$'
        if ($root[0].CommandLine -notmatch $pattern) { throw 'Default desktop launcher identity changed' }
      } elseif ([string]::IsNullOrEmpty($marker) -or -not $root[0].CommandLine.Contains($marker)) { throw 'Launcher command does not identify the target instance' }
    } else {
      $pattern = '^\s*"?' + [regex]::Escape($DshExe) + '"?\s*(--updated)?\s*$'
      $root = @($rows | Where-Object { $_.ExecutablePath -eq $DshExe -and $_.CommandLine -match $pattern })
      if ($root.Count -gt 1) { throw 'Multiple default desktop roots; specify an explicit launcher record' }
    }
    foreach ($row in $root) { $script:trackedProcesses[[int]$row.ProcessId] = $row.CreationDate.ToUniversalTime().Ticks }
  }
  $active = @{}
  foreach ($row in $rows) {
    $key = [int]$row.ProcessId
    if ($script:trackedProcesses.ContainsKey($key) -and $script:trackedProcesses[$key] -eq $row.CreationDate.ToUniversalTime().Ticks) { $active[$key] = $row }
  }
  do {
    $added = $false
    foreach ($row in $rows) {
      $key = [int]$row.ProcessId
      if (-not $active.ContainsKey($key) -and $active.ContainsKey([int]$row.ParentProcessId) -and
          $row.CreationDate -ge $active[[int]$row.ParentProcessId].CreationDate) {
        $active[$key] = $row
        $script:trackedProcesses[$key] = $row.CreationDate.ToUniversalTime().Ticks
        $added = $true
      }
    }
  } while ($added)
  return @($active.Keys | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
}

function Stop-Dsh {
  $stopped = $false
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $processes = Get-DshProcesses
    if ($processes.Count -eq 0) { return $stopped }
    if ($GracefulOnly -and $launchSpec.kind -eq 'desktop') {
      foreach ($process in $processes) { try { $null = $process.CloseMainWindow() } catch {} }
      $deadline = (Get-Date).AddSeconds($StopTimeoutSeconds)
      while ((Get-Date) -lt $deadline) {
        if ((Get-DshProcesses).Count -eq 0) { return $true }
        Start-Sleep -Milliseconds 500
      }
      throw 'Desktop close was cancelled or timed out; no package files were changed'
    }
    $stopped = $true
    Write-Log ("stopping DSH attempt {0}: PID {1}" -f $attempt, (($processes | ForEach-Object { $_.Id }) -join ','))
    foreach ($process in $processes) {
      try { $null = $process.CloseMainWindow() } catch {}
    }
    Start-Sleep -Seconds 2
    $processes = Get-DshProcesses
    if ($processes.Count -eq 0) { return $stopped }
    foreach ($process in $processes) {
      try { Stop-Process -Id $process.Id -Force -ErrorAction Stop } catch {}
    }
    $deadline = (Get-Date).AddSeconds($StopTimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
      if ((Get-DshProcesses).Count -eq 0) { return $stopped }
      Start-Sleep -Milliseconds 500
    }
  }
  $remaining = (Get-DshProcesses | ForEach-Object { $_.Id }) -join ','
  throw "DSH is still running (PID $remaining). A supervisor may be restarting it; close that supervisor or stop the process tree, then retry."
}

function Start-Dsh {
  if ($NoRestart) {
    Write-Log 'NoRestart set; start DSH manually after checking the log.'
    return
  }
  if ((Get-DshProcesses).Count -gt 0) {
    Write-Log 'DSH is already running; not starting another instance.'
    return
  }
  if (-not (Test-Path -LiteralPath $DshExe)) {
    Write-Log "DSH executable not found: $DshExe"
    return
  }
  Write-Log "restarting target DSH profile: $profileDir"
  $savedNodeMode = $env:ELECTRON_RUN_AS_NODE
  $savedDshHome = $env:DSH_HOME
  try {
    $env:DSH_HOME = $dshHomeDir
    $arguments = @()
    if ($launchSpec -and $launchSpec.kind -eq 'web') {
      $env:ELECTRON_RUN_AS_NODE = '1'
      $cli = Join-Path (Split-Path -Parent $DshExe) 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js'
      $arguments = @('--expose-internals', ('"' + $cli + '"'), '--profile', $profileName, '--no-open', '--host', '127.0.0.1', '--port', [string]$launchSpec.port)
    } else {
      Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
      if ($launchSpec) {
        if (-not $defaultDesktop) { $arguments = @('--user-data-dir=' + ('"' + [string]$launchSpec.userData + '"')) }
        if ($launchSpec.debugPort) { $arguments += '--remote-debugging-port=' + [int]$launchSpec.debugPort }
      }
    }
    $startOptions = @{ FilePath = $DshExe; WindowStyle = 'Hidden'; PassThru = $true }
    if ($arguments.Count) { $startOptions.ArgumentList = $arguments }
    if ($launchSpec) {
      $launchSpec.stdout = Join-Path $stateDir "host-$stamp.stdout.log"
      $launchSpec.stderr = Join-Path $stateDir "host-$stamp.stderr.log"
      $startOptions.RedirectStandardOutput = $launchSpec.stdout
      $startOptions.RedirectStandardError = $launchSpec.stderr
    }
    $started = Start-Process @startOptions
    if ($launchSpec) {
      $launchSpec.pid = $started.Id
      $launchSpec.createdAt = $started.StartTime.ToUniversalTime().ToString('o')
      [IO.File]::WriteAllText($launchPath, (($launchSpec | ConvertTo-Json -Depth 8) + "`n"), [Text.UTF8Encoding]::new($false))
    }
  } finally {
    $env:ELECTRON_RUN_AS_NODE = $savedNodeMode
    $env:DSH_HOME = $savedDshHome
  }
}

if (-not (Test-Path -LiteralPath $DshExe)) { throw "DSH executable not found: $DshExe" }
if ($Install -and ($Reload -or $Rollback)) { throw 'Install cannot be combined with Reload or Rollback' }
if ($PackageChange -and ($Install -or $Reload -or $Rollback)) { throw 'PackageChange cannot be combined with another mode' }

if ($Reload) {
  Write-Log 'reload mode: restart DSH so local-source changes load.'
  $stopped = $false
  $status = 'reloaded'
  $errorMessage = $null
  try {
    $stopped = Stop-Dsh
    if ($stopped) { Write-Log 'DSH is stopped.' }
  } catch {
    $status = 'failed'
    $errorMessage = $_.Exception.Message
    Write-Log "FAILED: $errorMessage"
  } finally {
    try { Start-Dsh } catch { Write-Log "restart failed: $($_.Exception.Message)" }
    Write-Result $status @{ stoppedDsh = $stopped; error = $errorMessage }
  }
  if ($status -eq 'failed') { throw $errorMessage }
  exit 0
}

if ($Rollback) {
  $backup = Get-ChildItem -LiteralPath $backupDir -Filter 'cordis.patch.yml.*.bak' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($null -eq $backup) { throw "No cold-switch backup found in $backupDir" }
  $patchPath = Join-Path $profileDir 'cordis.patch.yml'
  Write-Log "rollback mode: restoring $($backup.Name)"
  $stopped = $false
  $status = 'rolled-back'
  $errorMessage = $null
  try {
    $stopped = Stop-Dsh
    if ($stopped) { Write-Log 'DSH is stopped.' }
    Copy-Item -LiteralPath $backup.FullName -Destination $patchPath -Force
    if (Test-Path -LiteralPath $pendingPath) { Remove-Item -LiteralPath $pendingPath -Force }
    Write-Log "restored $patchPath from $($backup.Name); pending cleared."
  } catch {
    $status = 'failed'
    $errorMessage = $_.Exception.Message
    Write-Log "FAILED: $errorMessage"
  } finally {
    try { Start-Dsh } catch { Write-Log "restart failed: $($_.Exception.Message)" }
    Write-Result $status @{ stoppedDsh = $stopped; backup = $backup.FullName; error = $errorMessage }
  }
  if ($status -eq 'failed') { throw $errorMessage }
  exit 0
}

if (-not (Test-Path -LiteralPath $pendingPath)) {
  Write-Log "no pending intent: $pendingPath"
  Write-Result 'nothing-pending'
  exit 0
}
if (-not (Test-Path -LiteralPath $applyScript)) { throw "apply-pending.mjs not found: $applyScript" }

$pendingDocument = Get-Content -LiteralPath $pendingPath -Raw -Encoding utf8 | ConvertFrom-Json
$intentProfile = if ($Install -or $PackageChange -or $Maintenance) { [string]$pendingDocument.profile.dir } else { [string]$pendingDocument.profile }
if ([IO.Path]::GetFullPath($intentProfile) -ne $profileDir) {
  throw "Pending intent belongs to another profile: $($pendingDocument.profile)"
}
$operationLabel = if ($Maintenance) { 'maintenance' } elseif ($PackageChange) { 'package upgrade/recovery' } elseif ($Install) { 'first installation' } else { 'cold component intents' }
Write-Log "applying $operationLabel; profile=$profileDir"

$stopped = $false
$status = 'failed'
$errorMessage = $null
try {
  $stopped = Stop-Dsh
  if ($stopped) { Write-Log 'DSH is stopped.' }
  if ((Get-DshProcesses).Count -gt 0) { throw 'DSH is still running; refusing to patch a live profile.' }
  $env:ELECTRON_RUN_AS_NODE = '1'
  Write-Log "running $applyScript"
  & $DshExe --expose-internals $applyScript $pendingPath 2>&1 | ForEach-Object { Add-Content -LiteralPath $logPath -Value $_ -Encoding utf8; Write-Output $_ }
  $applyExit = $LASTEXITCODE
  if ($Install -or $PackageChange -or $Maintenance) {
    $receiptName = if ($Maintenance) { 'maintenance-result.json' } elseif ($PackageChange) { 'package-result.json' } else { 'install-result.json' }
    $installResultPath = Join-Path $stateDir $receiptName
    if (Test-Path -LiteralPath $installResultPath) {
      try {
        $installReceipt = Get-Content -LiteralPath $installResultPath -Raw -Encoding utf8 | ConvertFrom-Json
      } catch {
        $status = 'recovery-required'
        throw 'Installation receipt is unreadable; DSH will remain stopped until the profile is checked.'
      }
      if ($installReceipt.status -in @('recovery-required', 'installing', 'upgrading', 'restoring', 'applying')) {
        $status = 'recovery-required'
        throw 'Installation was interrupted or dependency recovery failed; DSH will remain stopped. See install-result.json and its backup.'
      }
    }
  }
  if (($Install -or $PackageChange -or $Maintenance) -and $applyExit -eq 3) {
    $status = 'recovery-required'
    throw 'Dependency restoration requires manual repair; DSH will remain stopped. See install-result.json and its backup.'
  }
  if ($applyExit -ne 0 -or (Test-Path -LiteralPath $pendingPath)) {
    throw "apply-pending.mjs failed (exit $applyExit); pending intent kept for retry"
  }
  $status = 'applied'
  Write-Log 'pending intent applied; pending file removed.'
} catch {
  $errorMessage = $_.Exception.Message
  Write-Log "FAILED: $errorMessage"
} finally {
  if ($stopped -and $status -ne 'recovery-required') {
    try { Start-Dsh } catch { Write-Log "restart failed: $($_.Exception.Message)" }
  }
  Write-Result $status @{ stoppedDsh = $stopped; error = $errorMessage }
}

if ($status -ne 'applied') { throw $errorMessage }
