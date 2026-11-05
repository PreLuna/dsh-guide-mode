#Requires -Version 7.0
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
  [switch]$NoRestart,
  [int]$StopTimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$profileDir = [IO.Path]::GetFullPath($Profile)
$pendingPath = if ($Pending -eq '') { Join-Path $profileDir '.guide-manager\pending.json' } else { [IO.Path]::GetFullPath($Pending) }
$applyScript = Join-Path $here 'apply-pending.mjs'
$stateDir = Join-Path $profileDir '.guide-manager'
$backupDir = Join-Path $stateDir 'backups'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $stateDir "helper-$stamp.log"
$resultPath = Join-Path $stateDir 'helper-result.json'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

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
  return @(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue)
}

function Stop-Dsh {
  $stopped = $false
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $processes = Get-DshProcesses
    if ($processes.Count -eq 0) { return $stopped }
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
  Write-Log "restarting DSH: $DshExe"
  Start-Process -FilePath $DshExe | Out-Null
}

if (-not (Test-Path -LiteralPath $DshExe)) { throw "DSH executable not found: $DshExe" }

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

$pending = Get-Content -LiteralPath $pendingPath -Raw | ConvertFrom-Json -AsHashtable
if ([IO.Path]::GetFullPath([string]$pending.profile) -ne $profileDir) {
  throw "Pending intent belongs to another profile: $($pending.profile)"
}
Write-Log "applying pending intents: $($pending.intents.Count); profile=$profileDir"

$stopped = $false
$status = 'failed'
$errorMessage = $null
try {
  $stopped = Stop-Dsh
  if ($stopped) { Write-Log 'DSH is stopped.' }
  if ((Get-DshProcesses).Count -gt 0) { throw 'DSH is still running; refusing to patch a live profile.' }
  $env:ELECTRON_RUN_AS_NODE = '1'
  Write-Log "running $applyScript"
  & $DshExe $applyScript $pendingPath 2>&1 | Tee-Object -FilePath $logPath -Append
  $applyExit = $LASTEXITCODE
  if ($applyExit -ne 0 -or (Test-Path -LiteralPath $pendingPath)) {
    throw "apply-pending.mjs failed (exit $applyExit); pending intent kept for retry"
  }
  $status = 'applied'
  Write-Log 'pending intent applied; pending file removed.'
} catch {
  $errorMessage = $_.Exception.Message
  Write-Log "FAILED: $errorMessage"
} finally {
  if ($stopped) {
    try { Start-Dsh } catch { Write-Log "restart failed: $($_.Exception.Message)" }
  }
  Write-Result $status @{ stoppedDsh = $stopped; error = $errorMessage }
}

if ($status -eq 'failed') { throw $errorMessage }
