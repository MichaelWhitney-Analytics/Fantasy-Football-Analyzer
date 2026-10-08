$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$target = Join-Path $root "docs\assets\app.js"
$patchPath = Join-Path $PSScriptRoot "waiver-trends-adjustments.js"
if (-not (Test-Path -LiteralPath $target)) { throw "Run from your Fantasy-Football-Analyzer project folder." }
if (-not (Test-Path -LiteralPath $patchPath)) { throw "Keep waiver-trends-adjustments.js next to this installer." }
$original = Get-Content -LiteralPath $target -Raw -Encoding UTF8
if (-not $original.Contains("FF_LIVE_ANALYTICS_PATCH_V1")) { throw "Install the previous analytics patch first." }
if ($original.Contains("FF_WAIVER_TRENDS_ADJUSTMENTS_V1")) { throw "These adjustments are already installed." }
$patch = Get-Content -LiteralPath $patchPath -Raw -Encoding UTF8
$backup = "$target.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $target -Destination $backup
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $original + [Environment]::NewLine + $patch, $utf8)
Write-Host "Waiver/trending adjustments installed locally. Nothing published."
Write-Host "Backup: $backup"
Write-Host "Refresh localhost:8000 and reconnect your league."
