param([Parameter(Mandatory=$true)][string]$Plan,[switch]$Restore)
$ErrorActionPreference='Stop'
$planPath=[IO.Path]::GetFullPath($Plan)
$output=Split-Path -Parent $planPath
$value=Get-Content -LiteralPath $planPath -Raw | ConvertFrom-Json -AsHashtable
$profile=[IO.Path]::GetFullPath($value.profile)
$workspace=[IO.Path]::GetFullPath($value.workspace)
if($workspace -ne [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))){throw 'Plan belongs to another workspace'}
function Bounded([string]$root,[string]$relative){
  $path=[IO.Path]::GetFullPath((Join-Path $root $relative))
  if(-not $path.StartsWith($root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Path escaped intended root'}
  return $path
}
function Hash([string]$path){return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
$pattern=[regex]::Escape($profile).Replace('\\','[\\/]')
if(@(Get-CimInstance Win32_Process|Where-Object{$_.Name -eq 'DeepSeek Harness.exe' -and $_.CommandLine -match $pattern}).Count){throw 'Close this profile Host before applying or restoring'}
foreach($entry in $value.unchangedHashes.GetEnumerator()){if((Hash (Bounded $profile $entry.Key)) -ne $entry.Value){throw "Unrelated profile file changed: $($entry.Key)"}}
$backup=Join-Path $output 'profile-before'
foreach($file in $value.files){
  $target=Bounded $profile $file.relative
  $expected=if($Restore){$file.afterSha256}else{$file.beforeSha256}
  $candidate=if($Restore){Bounded $backup $file.relative}else{Bounded $output $file.candidate}
  $candidateHash=if($Restore){$file.beforeSha256}else{$file.afterSha256}
  if((Hash $target) -ne $expected -or (Hash $candidate) -ne $candidateHash){throw "Subsequent edit or invalid candidate: $target"}
}
foreach($link in $value.links){
  $path=[IO.Path]::GetFullPath($link.path)
  if(-not $path.StartsWith((Join-Path $profile 'node_modules/@local').TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected owned link path'}
  if(Test-Path -LiteralPath $path){$item=Get-Item -LiteralPath $path;if($item.LinkType -ne 'Junction' -or [IO.Path]::GetFullPath([string]$item.Target) -ne [IO.Path]::GetFullPath($link.source)){throw 'Unexpected link target'}}
  if(-not ([IO.Path]::GetFullPath($link.source)).StartsWith($workspace.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Source escaped workspace'}
}
if(-not $Restore){
  foreach($file in $value.files){$path=Bounded $backup $file.relative;if(Test-Path -LiteralPath $path){throw 'Backup already exists; preserve operation history'};$null=New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path);Copy-Item -LiteralPath (Bounded $profile $file.relative) -Destination $path}
}
$changed=@()
$beforeLinks=@{}
foreach($link in $value.links){$beforeLinks[$link.path]=[bool](Test-Path -LiteralPath $link.path)}
try{
  foreach($link in $value.links){
    $needed=if($Restore){[bool]$link.existed}else{$value.mode -eq 'install'}
    if($needed -and -not(Test-Path -LiteralPath $link.path)){$null=New-Item -ItemType Directory -Force -Path (Split-Path -Parent $link.path);$null=New-Item -ItemType Junction -Path $link.path -Target $link.source}
  }
  foreach($file in $value.files){
    $target=Bounded $profile $file.relative;$from=if($Restore){Bounded $backup $file.relative}else{Bounded $output $file.candidate}
    $temporary=$target+'.guide-'+[Guid]::NewGuid().ToString('N')+'.tmp'
    Copy-Item -LiteralPath $from -Destination $temporary
    [IO.File]::Move($temporary,$target,$true);$changed+=$file
  }
  foreach($link in $value.links){$needed=if($Restore){[bool]$link.existed}else{$value.mode -eq 'install'};if(-not $needed -and (Test-Path -LiteralPath $link.path)){Remove-Item -LiteralPath $link.path}}
  $receipt=@{status=if($Restore){'restored'}else{'applied'};date='2026-11-03';mode=$value.mode;profile=$profile;files=$value.files.Count;ownedLinks=$value.links.Count}
  $receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output $(if($Restore){'restored.json'}else{'applied.json'})) -Encoding utf8
  Write-Output ($receipt|ConvertTo-Json -Compress)
}catch{
  foreach($file in $changed){
    $rollback=if($Restore){Bounded $output $file.candidate}else{Bounded $backup $file.relative}
    Copy-Item -LiteralPath $rollback -Destination (Bounded $profile $file.relative)
  }
  foreach($link in $value.links){
    if($beforeLinks[$link.path] -and -not(Test-Path -LiteralPath $link.path)){$null=New-Item -ItemType Junction -Path $link.path -Target $link.source}
    elseif(-not $beforeLinks[$link.path] -and (Test-Path -LiteralPath $link.path)){
      $item=Get-Item -LiteralPath $link.path
      if($item.LinkType -eq 'Junction' -and [IO.Path]::GetFullPath([string]$item.Target) -eq [IO.Path]::GetFullPath($link.source)){Remove-Item -LiteralPath $link.path}
    }
  }
  throw
}
