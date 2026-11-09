#Requires -Version 5.1
param([Parameter(Mandatory)][string]$Request)
$ErrorActionPreference = 'Stop'
$requestData = Get-Content -LiteralPath $Request -Raw -Encoding utf8 | ConvertFrom-Json
if ($requestData.schema -ne 1 -or $requestData.id -notmatch '^[a-f0-9-]{36}$') { throw 'Invalid execution request' }
$profile = [IO.Path]::GetFullPath([string]$requestData.plan.profile.dir)
$expected = Join-Path $profile ('.guide-manager/execution/' + $requestData.id + '/request.json')
if ([IO.Path]::GetFullPath($Request) -ne [IO.Path]::GetFullPath($expected)) { throw 'Invalid request location' }
$rows = @(Get-CimInstance Win32_Process)
$hostRow = @($rows | Where-Object { $_.ProcessId -eq [int]$requestData.plan.host.pid })
if ($hostRow.Count -ne 1 -or $hostRow[0].ExecutablePath -ne [string]$requestData.executable -or
    [Math]::Abs(($hostRow[0].CreationDate.ToUniversalTime() - [DateTimeOffset]::Parse($requestData.plan.host.startedAt).UtcDateTime).TotalSeconds) -gt 5) { throw 'Host identity changed' }
$ancestors = @($hostRow[0])
while ($ancestors.Count -lt 20) {
  $parent = @($rows | Where-Object { $_.ProcessId -eq $ancestors[-1].ParentProcessId })
  if ($parent.Count -ne 1 -or $parent[0].CreationDate -gt $ancestors[-1].CreationDate) { break }
  $ancestors += $parent[0]
}
$launchPath = Join-Path $profile '.guide-manager/launcher.json'
$record = if (Test-Path -LiteralPath $launchPath) { Get-Content -LiteralPath $launchPath -Raw -Encoding utf8 | ConvertFrom-Json } else { $null }
$matchesRecord = $false
if ($record -and $record.profile -eq $profile -and $record.executable -eq $requestData.executable) {
  $candidate = @($ancestors | Where-Object { $_.ProcessId -eq [int]$record.pid })
  $matchesRecord = $candidate.Count -eq 1 -and [Math]::Abs(($candidate[0].CreationDate.ToUniversalTime() - [DateTimeOffset]::Parse($record.createdAt).UtcDateTime).TotalSeconds) -le 2
}
if (-not $matchesRecord) {
  $cli = Join-Path (Split-Path -Parent $requestData.executable) 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js'
  $profileName = Split-Path -Leaf $profile
  $webPattern = '^\s*"?' + [regex]::Escape([string]$requestData.executable) + '"?\s+--expose-internals\s+"?' + [regex]::Escape($cli) + '"?\s+--profile\s+"?' + [regex]::Escape($profileName) + '"?\s+--no-open\s+--host\s+127\.0\.0\.1\s+--port\s+([0-9]{4,5})\s*$'
  $webCandidates = @($ancestors | ForEach-Object { if ($_.ExecutablePath -eq $requestData.executable -and $_.CommandLine -match $webPattern -and [int]$Matches[1] -ge 1024 -and [int]$Matches[1] -le 65535) { @{ root = $_; port = [int]$Matches[1] } } })
  if ($webCandidates.Count -eq 1) {
    $root = $webCandidates[0].root
    $record = [ordered]@{ schema = 1; kind = 'web'; profile = $profile; home = (Split-Path -Parent (Split-Path -Parent $profile)); executable = [string]$requestData.executable; pid = [int]$root.ProcessId; createdAt = $root.CreationDate.ToUniversalTime().ToString('o'); port = $webCandidates[0].port; stdout = ''; stderr = '' }
  } else {
  $defaultProfile = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.dsh/profiles/desktop'))
  $pattern = '^\s*"?' + [regex]::Escape([string]$requestData.executable) + '"?\s*(--updated)?\s*$'
  $candidates = @($ancestors | Where-Object { $_.ExecutablePath -eq $requestData.executable -and $_.CommandLine -match $pattern })
  if ($profile -ne $defaultProfile -or $candidates.Count -ne 1) { throw 'No verified launcher for this Host; use manual helper' }
  $root = $candidates[0]
  $record = [ordered]@{ schema = 1; kind = 'desktop'; defaultDesktop = $true; profile = $profile; home = (Split-Path -Parent (Split-Path -Parent $profile)); executable = [string]$requestData.executable; pid = [int]$root.ProcessId; createdAt = $root.CreationDate.ToUniversalTime().ToString('o'); userData = ''; debugPort = 0; stdout = ''; stderr = '' }
  }
  [IO.File]::WriteAllText($launchPath, (($record | ConvertTo-Json -Depth 8) + "`n"), [Text.UTF8Encoding]::new($false))
}
$powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$worker = Join-Path $requestData.controller 'helper/run-execution.ps1'
if ($powershell.Contains('"') -or $worker.Contains('"') -or $Request.Contains('"')) { throw 'Invalid executable path' }
$startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0; EnvironmentVariables = [string[]]@(Get-ChildItem Env: | ForEach-Object { $_.Name + '=' + $_.Value }) }
# WMI owns the worker, so stopping the complete DSH tree cannot kill its installer.
$created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ('"' + $powershell + '" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $worker + '" -Request "' + $Request + '"'); CurrentDirectory = [string]$requestData.controller; ProcessStartupInformation = $startup }
if ($created.ReturnValue -ne 0) { throw 'Detached worker creation failed' }
$process = Get-Process -Id $created.ProcessId -ErrorAction Stop
$row = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$created.ProcessId)
@{ pid = [int]$created.ProcessId; parentPid = [int]$row.ParentProcessId; createdAt = $process.StartTime.ToUniversalTime().ToString('o'); shellVersion = $PSVersionTable.PSVersion.ToString() } | ConvertTo-Json -Compress
