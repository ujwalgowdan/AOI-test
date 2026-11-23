#Requires -Version 5.1
<#
.SYNOPSIS
    One-command launcher for the AOI dev stack.

.DESCRIPTION
    Starts the FastAPI backend (uvicorn :8000) and the Vite dev server (:5173)
    as child processes, prints their PIDs and URLs, and tears both down on
    Ctrl+C. Runs prerequisite checks first.

.PARAMETER NoInstall
    Skip the pip / npm install steps even if deps look missing. Useful in CI
    or if you want to debug a dirty environment.

.EXAMPLE
    .\scripts\run-dev.ps1
    .\scripts\run-dev.ps1 -NoInstall
#>

param(
    [switch]$NoInstall
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $repo

Write-Host "AOI dev launcher" -ForegroundColor Cyan
Write-Host "Repo: $repo"

# ---------- .env check ----------
if (-not (Test-Path "$repo\.env")) {
    Write-Warning "No .env at $repo. Admin routes stay disabled (503) until ADMIN_PASSWORD is set, and email is stubbed. Copy .env.example to .env and edit before any non-local use."
}

# ---------- tool availability ----------
foreach ($cmd in 'python', 'npm') {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "$cmd not on PATH. Install Python 3.12 and Node 22 (or compatible) before running."
    }
}

# ---------- dep checks ----------
if (-not $NoInstall) {
    Write-Host "Checking backend Python deps..." -ForegroundColor DarkGray
    $probe = & python -c "import fastapi, uvicorn, apscheduler, cv2" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend deps missing — running 'pip install -r backend\requirements.txt'..." -ForegroundColor Yellow
        & pip install -r "$repo\backend\requirements.txt"
        if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
    }

    if (-not (Test-Path "$repo\frontend\node_modules")) {
        Write-Host "Frontend node_modules missing — running 'npm install' in frontend\..." -ForegroundColor Yellow
        Push-Location "$repo\frontend"
        try { & npm install; if ($LASTEXITCODE -ne 0) { throw "npm install failed" } }
        finally { Pop-Location }
    }
}

# ---------- launch ----------
Write-Host ""
Write-Host "Starting backend (uvicorn) on http://127.0.0.1:8000 ..." -ForegroundColor Green
$backend = Start-Process -PassThru -NoNewWindow `
    -FilePath python `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", `
                  "--reload", "--reload-dir", "app", "--reload-dir", "legacy" `
    -WorkingDirectory "$repo\backend"

Write-Host "Starting frontend (vite) on http://localhost:5173 ..." -ForegroundColor Green
# On Windows, `npm` resolves to either npm.ps1 (Get-Command) or npm.cmd.
# Start-Process can run neither directly: .ps1 isn't a Win32 binary, and even
# `npm.cmd` triggers the same shim error. Route through cmd.exe, which knows
# how to dispatch the .cmd shim.
$frontend = Start-Process -PassThru -NoNewWindow `
    -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm", "run", "dev" `
    -WorkingDirectory "$repo\frontend"

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
Write-Host (" Backend  PID {0} -> http://127.0.0.1:8000" -f $backend.Id)
Write-Host (" Frontend PID {0} -> http://localhost:5173" -f $frontend.Id)
Write-Host ""
Write-Host " Press Ctrl+C to stop both."
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""

try {
    Wait-Process -Id $backend.Id, $frontend.Id
}
finally {
    foreach ($p in @($backend, $frontend)) {
        if ($p -and -not $p.HasExited) {
            Write-Host "Stopping PID $($p.Id)..." -ForegroundColor DarkGray
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "Both services stopped." -ForegroundColor Cyan
}
