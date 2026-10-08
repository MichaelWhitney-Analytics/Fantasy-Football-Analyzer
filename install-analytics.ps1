$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$target = Join-Path $root "docs\assets\app.js"
$patchPath = Join-Path $PSScriptRoot "live-analytics.js"
if (-not (Test-Path -LiteralPath $target)) { throw "Run this installer from the Fantasy-Football-Analyzer project root." }
if (-not (Test-Path -LiteralPath $patchPath)) { throw "Keep live-analytics.js alongside this installer." }
$original = Get-Content -LiteralPath $target -Raw -Encoding UTF8
if ($original.Contains("FF_LIVE_ANALYTICS_PATCH_V1")) { throw "The analytics patch is already installed." }
$patch = Get-Content -LiteralPath $patchPath -Raw -Encoding UTF8
$backup = "$target.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $target -Destination $backup
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $original + [Environment]::NewLine + $patch, $utf8)
Write-Host "Analytics patch installed locally. Nothing has been published."
Write-Host "Backup: $backup"
Write-Host "Refresh localhost:8000 and reconnect your league."
