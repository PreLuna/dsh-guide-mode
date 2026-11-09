import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import test from 'node:test'

const helper = fileURLToPath(new URL('../helper/restart-guide-manager.ps1', import.meta.url)).replaceAll("'", "''")
const setup = `$tokens=$null; $errors=$null; $ast=[System.Management.Automation.Language.Parser]::ParseFile('${helper}',[ref]$tokens,[ref]$errors); if($errors.Count){throw ($errors | Out-String)}`

test('one-click controller parses on Windows built-in PowerShell without PowerShell 7', { skip: process.platform !== 'win32' }, () => {
  for (const name of ['restart-guide-manager.ps1', 'start-execution.ps1', 'run-execution.ps1', 'recover-manager.ps1', 'repair-components.ps1']) {
    const file = fileURLToPath(new URL(`../helper/${name}`, import.meta.url)).replaceAll("'", "''")
    const code = `$t=$null; $e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$t,[ref]$e); if($e.Count){throw ($e | Out-String)}; Write-Output 'native-syntax-ok'`
    assert.match(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { encoding: 'utf8', windowsHide: true }), /native-syntax-ok/)
  }
})

test('production PowerShell lifecycle helper has no parse errors', { skip: process.platform !== 'win32' }, () => {
  const output = execFileSync('pwsh', ['-NoProfile', '-Command', `${setup}; Write-Output 'syntax-ok'`], { encoding: 'utf8', windowsHide: true })
  assert.match(output, /syntax-ok/)
})

test('native worker persists atomic states and rejects changed bytes without Get-FileHash', { skip: process.platform !== 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'guide-native-worker-'))
  try {
    const file = fileURLToPath(new URL('../helper/run-execution.ps1', import.meta.url)).replaceAll("'", "''")
    const path = root.replaceAll("'", "''")
    writeFileSync(join(root, 'status.json'), '{"status":"waiting-ack"}')
    const code = `$t=$null; $e=$null; $ast=[System.Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$t,[ref]$e);
      foreach($name in @('Save-Status','Assert-Hash')){Invoke-Expression $ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true).Extent.Text};
      $requestData=@{id='owned';plan=@{kind='install';pendingId='exact'};createdAt='now'}; $statusPath='${path}/status.json';
      Save-Status 'executing'; if((Get-Content $statusPath -Raw | ConvertFrom-Json).status -ne 'executing'){throw 'state not saved'};
      Save-Status 'failed' 'execution-worker-failed'; if((Get-Content $statusPath -Raw | ConvertFrom-Json).error -ne 'execution-worker-failed'){throw 'failure not saved'};
      $file='${path}/bytes'; [IO.File]::WriteAllText($file,'abc');
      Assert-Hash $file 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
      [IO.File]::WriteAllText($file,'changed'); $rejected=$false; try {Assert-Hash $file 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'} catch {$rejected=$true};
      if(-not $rejected){throw 'drift accepted'}; 'native-worker-ok'`
    assert.match(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { encoding: 'utf8', windowsHide: true }), /native-worker-ok/)
  } finally { assert.ok(!relative(tmpdir(), root).startsWith('..')); rmSync(root, { recursive: true, force: true }) }
})

test('optional graceful-only close respects cancellation without forced termination', { skip: process.platform !== 'win32' }, () => {
  const code = `${setup}; Invoke-Expression $ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Stop-Dsh'},$true).Extent.Text;
    $launchSpec=@{kind='desktop'}; $GracefulOnly=$true; $script:closed=$false; $script:asked=0; $script:forced=0;
    $fake=[pscustomobject]@{Id=123}; $fake|Add-Member ScriptMethod CloseMainWindow {$script:asked++; if($script:allowClose){$script:closed=$true};return $true};
    function Get-DshProcesses {if(-not $script:closed){return @($fake)}}; function Stop-Process {$script:forced++;throw 'unexpected forced stop'};
    $StopTimeoutSeconds=0; $cancelled=$false; try {Stop-Dsh} catch {$cancelled=$_.Exception.Message -match 'cancelled or timed out'};
    if(-not $cancelled -or $script:asked -ne 1 -or $script:forced -ne 0){throw 'cancelled close must not force stop'};
    $script:allowClose=$true; $StopTimeoutSeconds=1; if((Stop-Dsh) -ne $true -or $script:asked -ne 2 -or $script:forced -ne 0){throw 'graceful close did not proceed'}; 'graceful-close-ok'`
  assert.match(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { encoding: 'utf8', windowsHide: true }), /graceful-close-ok/)
})

test('external recovery helper parses and waits for Electron before restarting', { skip: process.platform !== 'win32' }, async () => {
  const { readFileSync } = await import('node:fs')
  const recovery = fileURLToPath(new URL('../helper/recover-manager.ps1', import.meta.url)).replaceAll("'", "''")
  const code = `$t=$null; $e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('${recovery}',[ref]$t,[ref]$e); if($e.Count){throw ($e | Out-String)}; Write-Output 'recovery-syntax-ok'`
  assert.match(execFileSync('pwsh', ['-NoProfile', '-Command', code], { encoding: 'utf8', windowsHide: true }), /recovery-syntax-ok/)
  assert.match(readFileSync(recovery, 'utf8'), /--prepare-manager-recovery[^\r\n]+\| Out-Host/)
  const repair = fileURLToPath(new URL('../helper/repair-components.ps1', import.meta.url)).replaceAll("'", "''")
  assert.match(execFileSync('pwsh', ['-NoProfile', '-Command', `$t=$null; $e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('${repair}',[ref]$t,[ref]$e); if($e.Count){throw ($e | Out-String)}; 'repair-syntax-ok'`], { encoding: 'utf8', windowsHide: true }), /repair-syntax-ok/)
  assert.match(readFileSync(repair, 'utf8'), /--prepare-component-repair[^\r\n]+\| Out-Host/)
})

test('launcher identity preserves UTC for both JSON date representations across repeated restarts', { skip: process.platform !== 'win32' }, () => {
  const code = `${setup};
    $assignment=$ast.Find({param($node) $node -is [System.Management.Automation.Language.AssignmentStatementAst] -and $node.Left.Extent.Text -eq '$expectedStart'},$true).Extent.Text;
    if(-not $assignment){throw 'launcher time parser not found'};
    foreach($stamp in @('2026-11-07T05:23:27.6111699Z','2026-11-07T05:23:27.6111699+00:00')){
      $launchSpec=('{"createdAt":"'+$stamp+'"}') | ConvertFrom-Json -AsHashtable;
      Invoke-Expression $assignment;
      if($expectedStart.ToString('yyyy-MM-dd HH:mm:ss') -ne '2026-11-07 05:23:27'){throw 'launcher UTC identity drift'}
    }; Write-Output 'identity-ok'`
  assert.match(execFileSync('pwsh', ['-NoProfile', '-Command', code], { encoding: 'utf8', windowsHide: true }), /identity-ok/)
})
