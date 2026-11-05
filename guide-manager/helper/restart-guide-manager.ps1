#Requires -Version 7.0
<#
  Apply the pending guide-manager cold intent while DSH is stopped, then restart.

  Double-click restart-guide-manager.cmd, or run:
    pwsh -NoProfile -ExecutionPolicy Bypass -File .\restart-guide-manager.ps1

  It stops only `DeepSeek Harness` processes; unrelated applications are not
  touched. The official profile patch writer runs under Electron Node.
#>
param(
  [string]$Profile = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop'),
  [string]$Pending = '',
  [string]$DshExe = (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'),
  [switch]$NoRestart,
  [int]$StopTimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$profileDir = [IO.Path]::GetFullPath($Profile)
$pendingPath = if ($Pending -eq '') { Join-Path $profileDir '.guide-manager\pending.json' } else { [IO.Path]::GetFullPath($Pending) }
$applyScript = Join-Path $here 'apply-pending.mjs'
$stateDir = Join-Path $profileDir '.guide-manager'
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

if (-not (Test-Path -LiteralPath $pendingPath)) {
  Write-Log "no pending intent: $pendingPath"
  [IO.File]::WriteAllText($resultPath, ((@{ at = (Get-Date).ToString('o'); status = 'nothing-pending'; pending = $pendingPath; log = $logPath } | ConvertTo-Json -Depth 5) + "`n"), [Text.UTF8Encoding]::new($false))
  exit 0
}
if (-not (Test-Path -LiteralPath $applyScript)) { throw "apply-pending.mjs not found: $applyScript" }
if (-not (Test-Path -LiteralPath $DshExe)) { throw "DSH executable not found: $DshExe" }

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
  [IO.File]::WriteAllText($resultPath, (([ordered]@{
    at = (Get-Date).ToString('o')
    status = $status
    pending = $pendingPath
    log = $logPath
    stoppedDsh = $stopped
    error = $errorMessage
  } | ConvertTo-Json -Depth 5) + "`n"), [Text.UTF8Encoding]::new($false))
}

if ($status -eq 'failed') { throw $errorMessage }
