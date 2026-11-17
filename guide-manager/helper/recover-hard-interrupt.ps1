param(
  [Parameter(Mandatory)][string]$Profile,
  [ValidateSet('install-restore', 'package-restore', 'maintenance-restore', 'manager-restore', 'migration-recover')][string]$Action,
  [string]$Id,
  [string]$DshExe
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $here 'recover-hard-interrupt.mjs'
if (-not (Test-Path -LiteralPath $nodeScript)) { throw "recover-hard-interrupt.mjs not found: $nodeScript" }
if (-not $DshExe) {
  $DshExe = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'
}
if (-not (Test-Path -LiteralPath $DshExe)) { throw "DeepSeek Harness.exe not found; pass -DshExe explicitly" }
$saved = $env:ELECTRON_RUN_AS_NODE
try {
  $env:ELECTRON_RUN_AS_NODE = '1'
  $arguments = @('--expose-internals', $nodeScript, '--profile', $Profile)
  if ($Action) { $arguments += @('--action', $Action) }
  if ($Id) { $arguments += @('--id', $Id) }
  & $DshExe @arguments
  exit $LASTEXITCODE
} finally {
  $env:ELECTRON_RUN_AS_NODE = $saved
}
