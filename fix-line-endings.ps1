# ─────────────────────────────────────────────────────────────────────────────
#  fix-line-endings.ps1
#
#  One-shot script to clear the recurring "thousands of changed files" diff
#  in GitHub Desktop caused by CRLF vs LF mismatches.
#
#  Run this ONCE from PowerShell at the repo root:
#      .\fix-line-endings.ps1
#
#  What it does:
#    1. Sets local autocrlf=false so Git stops auto-converting line endings.
#    2. Commits the .gitattributes file (if it isn't already committed).
#    3. Renormalizes every tracked file to match the new .gitattributes rules.
#    4. Commits the normalization as a single, clearly-labelled commit.
#    5. Tells you what real code changes are still pending.
#
#  Safe to run more than once. Idempotent.
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'

function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host "→ $msg" -ForegroundColor Cyan
}

# Sanity check: must be inside the repo root
if (-not (Test-Path ".git")) {
    Write-Host "✗ This script must be run from the repo root (no .git folder here)." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path ".gitattributes")) {
    Write-Host "✗ No .gitattributes found. Run this from the repo root after creating it." -ForegroundColor Red
    exit 1
}

# ── 1. Local autocrlf off ────────────────────────────────────────────────────
Write-Step "Disabling Git's automatic line-ending conversion for this repo"
git config core.autocrlf false
git config core.eol lf
Write-Host "  core.autocrlf = $(git config --get core.autocrlf)"
Write-Host "  core.eol      = $(git config --get core.eol)"

# ── 2. Commit .gitattributes first (if dirty) ───────────────────────────────
Write-Step "Committing .gitattributes (if not already committed)"
git add .gitattributes
$gaStatus = git diff --cached --name-only
if ($gaStatus -match '\.gitattributes') {
    git commit -m "Add .gitattributes to standardize line endings to LF"
    Write-Host "  ✓ Committed .gitattributes"
} else {
    Write-Host "  (already committed — skipping)"
}

# ── 3. Renormalize every tracked file ────────────────────────────────────────
Write-Step "Renormalizing every tracked file"
git add --renormalize .

$staged = git diff --cached --name-only
$count  = ($staged | Measure-Object).Count
Write-Host "  $count files queued for normalization commit"

if ($count -gt 0) {
    git commit -m "Normalize all line endings to LF"
    Write-Host "  ✓ Committed normalization"
} else {
    Write-Host "  Nothing to renormalize — line endings already clean."
}

# ── 4. Stage and commit any remaining real changes ───────────────────────────
Write-Step "Checking for any remaining real code changes"
$remaining = git status --porcelain
$remCount  = ($remaining | Measure-Object).Count

if ($remCount -eq 0) {
    Write-Host "  ✓ Working tree is clean. Everything committed." -ForegroundColor Green
} else {
    Write-Host "  $remCount files still have changes (these are real edits, not line endings):"
    Write-Host ""
    $remaining | ForEach-Object { Write-Host "    $_" }
    Write-Host ""
    Write-Host "  To commit them all in one go:" -ForegroundColor Yellow
    Write-Host "    git add ."
    Write-Host "    git commit -m ""<your message here>"""
    Write-Host "    git push"
}

Write-Step "Done. You can now open GitHub Desktop — the file count should be sane."
