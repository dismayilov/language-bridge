# strip-nulls.ps1
# One-shot script to remove null bytes from JS/HTML files that may have been
# corrupted by mount-layer / sync issues.
#
# Run from the repo root:
#     .\strip-nulls.ps1

$ErrorActionPreference = 'Continue'

$files = @(
    'js\app.js',
    'js\data-loader.js',
    'js\graph-engine.js',
    'js\micro-quiz.js',
    'js\profile.js',
    'js\quiz-extras.js',
    'js\quiz-maps.js',
    'index.html',
    'quiz\index.html',
    'sw.js'
)

$totalStripped = 0
foreach ($f in $files) {
    if (-not (Test-Path $f)) {
        Write-Host "  ! $f (not found)" -ForegroundColor Yellow
        continue
    }
    $bytes = [System.IO.File]::ReadAllBytes($f)
    $before = $bytes.Length
    $nullCount = ($bytes | Where-Object { $_ -eq 0 } | Measure-Object).Count
    if ($nullCount -eq 0) {
        Write-Host "  - $f (clean, $before bytes)" -ForegroundColor DarkGray
        continue
    }
    $clean = $bytes | Where-Object { $_ -ne 0 }
    [System.IO.File]::WriteAllBytes($f, [byte[]]$clean)
    $after = $clean.Count
    Write-Host "  + $f : stripped $nullCount null bytes ($before -> $after)" -ForegroundColor Green
    $totalStripped += $nullCount
}

Write-Host ""
Write-Host "Done. Removed $totalStripped null bytes total." -ForegroundColor Cyan
Write-Host ""
Write-Host "Now restart Live Server in VS Code and hard-refresh the page (Ctrl+Shift+R)." -ForegroundColor Yellow
