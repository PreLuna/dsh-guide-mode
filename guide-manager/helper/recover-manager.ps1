#Requires -Version 5.1
param(
  [Parameter(Mandatory)][string]$Profile,
  [string]$TransactionId = '',
  [string]$DshExe = (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'),
  [switch]$NoRestart
)
$ErrorActionPreference = 'Stop'
# This script and its imports live in .guide-manager/controllers, outside node_modules.
$previousNodeMode = $env:ELECTRON_RUN_AS_NODE
try {
  $env:ELECTRON_RUN_AS_NODE = '1'
  & $DshExe --expose-internals (Join-Path $PSScriptRoot 'apply-maintenance.mjs') --prepare-manager-recovery $Profile $TransactionId | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Recovery preparation refused; no processes were stopped.' }
} finally { $env:ELECTRON_RUN_AS_NODE = $previousNodeMode }
& (Join-Path $PSScriptRoot 'restart-guide-manager.ps1') -Profile $Profile -DshExe $DshExe -Maintenance -NoRestart:$NoRestart
