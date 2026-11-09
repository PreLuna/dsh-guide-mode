#Requires -Version 5.1
param([Parameter(Mandatory)][string]$Request)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$requestData = Get-Content -LiteralPath $Request -Raw -Encoding utf8 | ConvertFrom-Json
$directory = Split-Path -Parent $Request
$statusPath = Join-Path $directory 'status.json'
$lockPath = Join-Path (Split-Path -Parent $directory) 'operation.lock'
function Save-Status([string]$Status, [string]$ErrorCode = '') {
  $value = [ordered]@{ id = $requestData.id; kind = $requestData.plan.kind; pendingId = $requestData.plan.pendingId; status = $Status; error = $ErrorCode; createdAt = $requestData.createdAt; updatedAt = [DateTime]::UtcNow.ToString('o'); workerPid = $PID }
  $temporary = $statusPath + '.worker.tmp'
  [IO.File]::WriteAllText($temporary, (($value | ConvertTo-Json -Depth 5) + "`n"), [Text.UTF8Encoding]::new($false))
  [IO.File]::Replace($temporary, $statusPath, ($statusPath + '.previous'))
}
function Assert-Hash([string]$Path, $Expected) {
  if ($null -eq $Expected) { if (Test-Path -LiteralPath $Path) { throw 'Execution files changed' }; return }
  if (-not (Test-Path -LiteralPath $Path)) { throw 'Execution files changed' }
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $actual = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($Path))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
  if ($actual -ne $Expected) { throw 'Execution files changed' }
}
try {
  if ($requestData.schema -ne 1 -or $requestData.id -notmatch '^[a-f0-9-]{36}$') { throw 'Invalid request' }
  $profile = [IO.Path]::GetFullPath([string]$requestData.plan.profile.dir)
  $expected = Join-Path $profile ('.guide-manager/execution/' + $requestData.id + '/request.json')
  if ([IO.Path]::GetFullPath($Request) -ne [IO.Path]::GetFullPath($expected)) { throw 'Invalid request location' }
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  $readyPath = Join-Path $directory 'ready.json'
  while (-not (Test-Path -LiteralPath $readyPath)) { if ([DateTime]::UtcNow -gt $deadline) { throw 'Acknowledgement timed out' }; Start-Sleep -Milliseconds 100 }
  $ready = Get-Content -LiteralPath $readyPath -Raw -Encoding utf8 | ConvertFrom-Json
  if ($ready.id -ne $requestData.id -or $ready.planId -ne $requestData.plan.id) { throw 'Invalid acknowledgement' }
  Assert-Hash ([string]$requestData.plan.pendingPath) $requestData.plan.pendingHash
  foreach ($property in $requestData.plan.before.PSObject.Properties) { Assert-Hash (Join-Path $profile $property.Name) $property.Value }
  foreach ($property in $requestData.files.PSObject.Properties) { Assert-Hash (Join-Path $requestData.controller $property.Name) $property.Value }
  Save-Status 'executing'
  $helper = Join-Path $requestData.controller 'helper/restart-guide-manager.ps1'
  $mode = @{ install = 'Install'; package = 'PackageChange'; maintenance = 'Maintenance'; toggle = $null }[[string]$requestData.plan.kind]
  if ($requestData.plan.kind -notin @('install', 'package', 'maintenance', 'toggle')) { throw 'Invalid operation' }
  $arguments = @{ Profile = $profile; DshExe = [string]$requestData.executable; LaunchRecord = (Join-Path $profile '.guide-manager/launcher.json') }
  if ($mode) { $arguments[$mode] = $true }
  & $helper @arguments *>&1 | Out-File -LiteralPath (Join-Path $directory 'execution.log') -Encoding utf8
  Save-Status 'awaiting-verification'
} catch {
  [IO.File]::AppendAllText((Join-Path $directory 'execution.log'), ("Worker failure: " + $_.Exception.Message + "`r`n"), [Text.UTF8Encoding]::new($false))
  Save-Status 'failed' 'execution-worker-failed'
} finally {
  if (Test-Path -LiteralPath $lockPath) {
    $owner = Get-Content -LiteralPath $lockPath -Raw -Encoding utf8 | ConvertFrom-Json
    if ($owner.id -eq $requestData.id -and $owner.pid -eq $PID) { Remove-Item -LiteralPath $lockPath -Force }
  }
}
