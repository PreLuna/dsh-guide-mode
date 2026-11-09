import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const helper = fileURLToPath(new URL('../helper/restart-guide-manager.ps1', import.meta.url)).replaceAll("'", "''")
const setup = `$tokens=$null; $errors=$null; $ast=[System.Management.Automation.Language.Parser]::ParseFile('${helper}',[ref]$tokens,[ref]$errors); if($errors.Count){throw ($errors | Out-String)}`

test('production PowerShell lifecycle helper has no parse errors', { skip: process.platform !== 'win32' }, () => {
  const output = execFileSync('pwsh', ['-NoProfile', '-Command', `${setup}; Write-Output 'syntax-ok'`], { encoding: 'utf8', windowsHide: true })
  assert.match(output, /syntax-ok/)
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
