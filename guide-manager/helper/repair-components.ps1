#Requires -Version 5.1
param(
  [Parameter(Mandatory)][string]$Profile,
  [Parameter(Mandatory)][string[]]$Components,
  [string]$DshExe = (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'),
  [switch]$NoRestart
)
$ErrorActionPreference = 'Stop'
$previousNodeMode = $env:ELECTRON_RUN_AS_NODE
try {
  $env:ELECTRON_RUN_AS_NODE = '1'
  & $DshExe --expose-internals (Join-Path $PSScriptRoot 'apply-maintenance.mjs') --prepare-component-repair $Profile ($Components -join ',') | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Component repair preparation refused; no processes were stopped.' }
} finally { $env:ELECTRON_RUN_AS_NODE = $previousNodeMode }
$pending = Get-Content -LiteralPath (Join-Path $Profile '.guide-manager/maintenance-pending.json') -Raw -Encoding utf8 | ConvertFrom-Json
if ($pending.controllerHash -notmatch '^[a-f0-9]{64}$') { throw 'Invalid prepared controller' }
$controller = Join-Path $Profile ('.guide-manager/controllers/' + $pending.controllerHash + '/helper/restart-guide-manager.ps1')
& $controller -Profile $Profile -DshExe $DshExe -Maintenance -NoRestart:$NoRestart
