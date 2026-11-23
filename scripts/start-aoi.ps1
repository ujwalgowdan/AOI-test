#Requires -Version 5.1
<#
.SYNOPSIS
    Double-click launcher for the AOI application.

.DESCRIPTION
    Brings up the full AOI stack (Postgres + FastAPI backend + Vite frontend)
    via Docker Compose, waits until the web UI is reachable, and opens the
    default browser to it. Auto-starts Docker Desktop if the engine is down.

    This is the script the "AOI System" desktop shortcut runs. Install the
    shortcut with scripts\install-desktop-icon.ps1.

.PARAMETER Build
    Force a 'docker compose up --build' (rebuild images). Use this after the
    backend's requirements.txt or a Dockerfile changes. Day-to-day launches
    don't need it - source dirs are bind-mounted with live reload.

.PARAMETER Prod
    Start the production stack (docker-compose.prod.yml: nginx frontend,
    gunicorn backend, unpublished database) instead of the dev stack. Needs
    POSTGRES_PASSWORD and a strong ADMIN_PASSWORD in .env. Without -Prod the
    launcher behaves exactly as before.

.EXAMPLE
    .\scripts\start-aoi.ps1
    .\scripts\start-aoi.ps1 -Build
    .\scripts\start-aoi.ps1 -Prod
#>

param(
    [switch]$Build,
    [switch]$Prod
)

$ErrorActionPreference = "Stop"

# URL the browser opens (frontend host port from docker-compose.yml).
# In -Prod mode it is read from the running stack after start-up.
$AppUrl = "http://localhost:5173"
# Explicit project names: never fall back to a directory-derived name.
$Compose = if ($Prod) { @("compose", "-f", "docker-compose.prod.yml", "-p", "aoi-prod") }
           else       { @("compose", "-p", "aoi-bullmquality") }
$ComposeText = "docker " + ($Compose -join " ")

function Write-Step($msg)  { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Info($msg)  { Write-Host "    $msg" -ForegroundColor DarkGray }
function Write-Good($msg)  { Write-Host "    $msg" -ForegroundColor Green }

try {
    $repo = (Resolve-Path "$PSScriptRoot\..").Path
    Set-Location $repo

    Write-Host ""
    Write-Host "  AOI System launcher" -ForegroundColor White
    Write-Host "  Repo: $repo" -ForegroundColor DarkGray
    Write-Host ""

    # ---------- docker present? ----------
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker is not installed or not on PATH. Install Docker Desktop, then run this again."
    }

    # ---------- ensure the docker engine is running ----------
    Write-Step "Checking the Docker engine..."
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Info "Docker engine is not responding - starting Docker Desktop..."

        $dockerDesktop = @(
            "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
            "${Env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe",
            "$Env:LocalAppData\Docker\Docker Desktop.exe"
        ) | Where-Object { Test-Path $_ } | Select-Object -First 1

        if (-not $dockerDesktop) {
            $cmd = (Get-Command "Docker Desktop.exe" -ErrorAction SilentlyContinue)
            if ($cmd) { $dockerDesktop = $cmd.Source }
        }

        if ($dockerDesktop) {
            Start-Process -FilePath $dockerDesktop | Out-Null
            Write-Info "Launched Docker Desktop. A cold start (WSL2) can take a couple of minutes - please wait..."
        } else {
            Write-Info "Could not find 'Docker Desktop.exe' - if Docker is running another way, this will still proceed."
        }

        # Poll the daemon for up to ~300s (cold WSL2 starts are slow).
        $timeoutSec = 300
        $start = Get-Date
        $deadline = $start.AddSeconds($timeoutSec)
        $ready = $false
        while ((Get-Date) -lt $deadline) {
            & docker info *> $null
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            $elapsed = [int]((Get-Date) - $start).TotalSeconds
            Write-Host ("`r    Waiting for the Docker engine... {0,3}s / {1}s" -f $elapsed, $timeoutSec) -NoNewline -ForegroundColor DarkGray
            Start-Sleep -Seconds 3
        }
        Write-Host ""
        if (-not $ready) {
            throw "Docker engine did not come up within ${timeoutSec}s. Open Docker Desktop manually, wait for the whale icon to say 'running', then double-click the icon again."
        }
    }
    Write-Good "Docker engine is running."

    # ---------- start the stack ----------
    if ($Build) {
        Write-Step "Starting the AOI stack ($ComposeText up -d --build)..."
        & docker @Compose up -d --build
    } else {
        Write-Step "Starting the AOI stack ($ComposeText up -d)..."
        & docker @Compose up -d
    }
    if ($LASTEXITCODE -ne 0) {
        throw "'docker compose up' failed (exit $LASTEXITCODE). Scroll up for the compose error."
    }
    Write-Good "Containers requested. (First run pulls/builds images - that can take a few minutes.)"

    if ($Prod) {
        # e.g. "0.0.0.0:5174" -> http://localhost:5174
        $hostPort = (& docker @Compose port frontend 80 | Select-Object -First 1)
        if ($hostPort -match ':(\d+)$') { $AppUrl = "http://localhost:$($Matches[1])" }
    }

    # ---------- wait for the frontend ----------
    Write-Step "Waiting for the web UI at $AppUrl ..."
    Write-Info "First launch is slow: the frontend installs deps inside its container before serving."

    $deadline = (Get-Date).AddSeconds(240)
    $up = $false
    while ((Get-Date) -lt $deadline) {
        try {
            # Any HTTP response (even a 4xx) means Vite is serving.
            Invoke-WebRequest -Uri $AppUrl -UseBasicParsing -TimeoutSec 5 *> $null
            $up = $true; break
        } catch {
            $resp = $_.Exception.Response
            if ($resp -and $resp.StatusCode) { $up = $true; break }  # got an HTTP status -> it's up
            Write-Host "." -NoNewline -ForegroundColor DarkGray
            Start-Sleep -Seconds 3
        }
    }
    Write-Host ""

    if ($up) {
        Write-Good "Web UI is responding."
    } else {
        Write-Host "    [warn] UI didn't respond within 240s - opening the browser anyway." -ForegroundColor Yellow
        Write-Info "Check container status with:  $ComposeText ps   /   $ComposeText logs -f"
    }

    # ---------- open the browser ----------
    Write-Step "Opening $AppUrl in your browser..."
    Start-Process $AppUrl

    Write-Host ""
    Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host "  AOI is running in Docker (in the background)." -ForegroundColor White
    Write-Host "    App:        $AppUrl"
    Write-Host "    Status:     $ComposeText ps"
    Write-Host "    Logs:       $ComposeText logs -f"
    Write-Host "    Stop:       $ComposeText down"
    Write-Host ""
    Write-Host "  You can close this window - the app keeps running." -ForegroundColor DarkGray
    Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host ""
}
catch {
    Write-Host ""
    Write-Host "  AOI launcher failed:" -ForegroundColor Red
    Write-Host "    $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    # Pause so a double-click failure doesn't flash and vanish.
    Read-Host "Press Enter to close"
    exit 1
}
