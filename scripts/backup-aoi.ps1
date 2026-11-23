#Requires -Version 5.1
<#
.SYNOPSIS
    Consistent backup of one AOI stack: Postgres dump + capture images.

.DESCRIPTION
    This is an OFFLINE-WRITES backup, not an online one:

      1. Session check 1: asks the backend (from inside its container) how many
         inspection sessions are live. Refuses if any are, or if it cannot
         tell, unless -ConfirmInterruption is given. Nothing is stopped yet.
      2. Stops the frontend (no new browser traffic), then session check 2,
         then stops the backend. Its stop grace period lets in-flight requests
         (an /analyze writing a JPEG + a captures row) finish. Postgres keeps
         running. The backend logs how many sessions were live at shutdown;
         the script reports it.
      3. pg_dump (custom format) while writes are paused.
      4. Archives the images volume (mounted read-only) while writes are
         STILL paused, plus a SHA-256 list of every file.
      5. Restarts only the services it stopped (also on refusal or failure),
         checks they stay up, and writes a manifest.

    Sessions live in the backend's memory: stopping it ends them. The operator
    must start a new session; that session's on-screen counters and live
    updates are lost (captures already saved are kept). Run between shifts.

    Never prompts, so scheduled and piped runs behave the same.

    Exit codes:
      0  backup written
      1  backup failed (services the script stopped were restarted)
      2  refused: active session(s)
      3  refused: could not determine whether sessions are active
      4  refused: a session started after check 1 (backend not stopped)
      5  backup written, but a session was live at backend shutdown without
         -ConfirmInterruption (it started after check 2)
      6  a service the script stopped could not be restarted (see output)

    Output (in -OutDir, default <repo>\backups):
      <project>_<stamp>.dump           pg_dump -Fc
      <project>_<stamp>.data.tgz       the backend's /data volume
      <project>_<stamp>.data.sha256    sha256 of every file in /data
      <project>_<stamp>.manifest.json  counts, hashes, session checks

    Copy the backups off this machine; a disk failure takes both otherwise.

.PARAMETER ConfirmInterruption
    Back up even if sessions are (or may be) active. They will be ended.

.EXAMPLE
    .\scripts\backup-aoi.ps1 -ComposeFile docker-compose.prod.yml -Project aoi-prod
    .\scripts\backup-aoi.ps1 -ComposeFile docker-compose.prod.yml -Project aoi-prod -ConfirmInterruption
    .\scripts\backup-aoi.ps1 -Project aoi-bullmquality          # the dev stack
#>
param(
    [string[]]$ComposeFile = @("docker-compose.yml"),
    [Parameter(Mandatory = $true)][string]$Project,
    [string]$EnvFile,
    [string]$OutDir,
    [switch]$ConfirmInterruption
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..").Path
if (-not $OutDir) { $OutDir = Join-Path $repo "backups" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path

$dcArgs = @("compose")
foreach ($f in $ComposeFile) {
    if (-not [IO.Path]::IsPathRooted($f)) { $f = Join-Path $repo $f }
    $dcArgs += @("-f", $f)
}
$dcArgs += @("-p", $Project)
if ($EnvFile) { $dcArgs += @("--env-file", (Resolve-Path $EnvFile).Path) }
$dcText = "docker " + (($dcArgs | ForEach-Object { if ($_ -match ' ') { '"' + $_ + '"' } else { $_ } }) -join ' ')

# Native calls run with a local Continue preference and are judged by exit
# code only: PowerShell 5.1 would otherwise turn docker's progress output on
# stderr into a terminating error whenever the caller redirects 2>&1.
function Invoke-Docker {
    $ErrorActionPreference = "Continue"
    & docker @args
}
function Dc {
    $out = Invoke-Docker @dcArgs @args
    if ($LASTEXITCODE -ne 0) { throw "docker compose $($args -join ' ') failed (exit $LASTEXITCODE)" }
    $out
}
function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Bad($msg) { Write-Host $msg -ForegroundColor Red }

# Test-only pause (not documented): AOI_BACKUP_TEST_GAP=<after-check1|after-check2>:<seconds>
function Test-Gap($point) {
    if ($env:AOI_BACKUP_TEST_GAP -match "^${point}:(\d+)$") {
        Write-Host "    [test] pausing $($Matches[1]) s at $point" -ForegroundColor DarkYellow
        Start-Sleep -Seconds ([int]$Matches[1])
    }
}

# Ask the running backend, from inside its container, how many sessions are
# live. Anything other than a clean answer is "unknown" (fail closed).
function Get-SessionState {
    $ErrorActionPreference = "Continue"
    $id = @(& docker @dcArgs ps --status running -q backend 2>$null)[0]
    if (-not $id) { return @{ known = $false; reason = "backend container is not running" } }
    $probe = "import json,urllib.request as u;b=json.load(u.urlopen('http://127.0.0.1:8000/internal/active-sessions',timeout=5));print(int(b['active_sessions']),int(b['websocket_clients']))"
    $job = Start-Job -ScriptBlock {
        param($a)
        $ErrorActionPreference = "Continue"
        $o = @(& docker @a 2>&1 | ForEach-Object { "$_" })
        "EXIT=$LASTEXITCODE"
        $o
    } -ArgumentList (, ($dcArgs + @("exec", "-T", "backend", "python", "-c", $probe)))
    if (-not (Wait-Job $job -Timeout 15)) {
        Stop-Job $job; Remove-Job $job -Force
        return @{ known = $false; reason = "no answer within 15 s" }
    }
    $out = @(Receive-Job $job); Remove-Job $job -Force
    $exit = if ($out.Count -and $out[0] -match '^EXIT=(-?\d+)$') { [int]$Matches[1] } else { -1 }
    $lines = @($out | Select-Object -Skip 1 | Where-Object { "$_".Trim() })
    $last = if ($lines.Count) { "$($lines[-1])".Trim() } else { "" }
    if ($exit -ne 0) {
        if ($last.Length -gt 160) { $last = $last.Substring(0, 160) }
        return @{ known = $false; reason = "probe failed (exit $exit): $last" }
    }
    if ($last -match '^(\d+) (\d+)$') { return @{ known = $true; active = [int]$Matches[1]; clients = [int]$Matches[2] } }
    return @{ known = $false; reason = "unexpected response: $last" }
}
function Describe($s) {
    if ($s.known) { "$($s.active) active session(s), $($s.clients) live dashboard(s)" } else { "UNKNOWN ($($s.reason))" }
}

$running = @(Dc ps --status running --services)
if ($running -notcontains "db") { throw "Postgres (service 'db') of project '$Project' is not running." }
$backendId = @(Dc ps -a -q backend)[0]
if (-not $backendId) { throw "Project '$Project' has no backend container (needed to reach its /data volume)." }
$toPause = @("frontend", "backend" | Where-Object { $running -contains $_ })
# Container IDs of what we may stop. Restarts use `docker start <id>`, NOT
# `docker compose start <svc>`, which would also start depends_on services
# (e.g. a backend that was not running before).
$ids = @{}
foreach ($svc in $toPause) { $ids[$svc] = @(Dc ps -q $svc)[0] }
Write-Host "Running before backup: $($running -join ', ')"

$guard = [ordered]@{ confirm_interruption = [bool]$ConfirmInterruption; check1 = $null; check2 = $null; shutdown_report = $null; decision = $null }
$lossText = "Stopping the backend ends them: the operator must start a new session and that session's on-screen counters and live updates are lost (saved captures are kept)."

# ---------- session check 1: nothing stopped yet ----------
if ($running -contains "backend") {
    $s1 = Get-SessionState
    $guard.check1 = Describe $s1
    Write-Host "Session check 1: $($guard.check1)"
    if (-not $ConfirmInterruption) {
        if (-not $s1.known) {
            Write-Bad "REFUSED: could not determine whether sessions are active ($($s1.reason)). Treating as possibly active. Nothing was stopped. Re-run with -ConfirmInterruption to back up anyway (any live session will be ended)."
            exit 3
        }
        if ($s1.active -gt 0) {
            Write-Bad "REFUSED: $($s1.active) active inspection session(s), $($s1.clients) live dashboard(s) on project '$Project'. $lossText Nothing was stopped. Run between shifts, or re-run with -ConfirmInterruption to interrupt them."
            exit 2
        }
    } elseif (-not $s1.known -or $s1.active -gt 0) {
        $n = if ($s1.known) { $s1.active } else { "an unknown number of" }
        Write-Host "Proceeding with -ConfirmInterruption: $n session(s) will be ended." -ForegroundColor Yellow
    }
} else {
    # Backend not running: no in-memory sessions can exist, but follow the
    # fail-closed rule anyway (we cannot ask it).
    $guard.check1 = "UNKNOWN (backend container is not running)"
    Write-Host "Session check 1: $($guard.check1)"
    if (-not $ConfirmInterruption) {
        Write-Bad "REFUSED: could not determine whether sessions are active (backend container is not running). Treating as possibly active. Nothing was stopped. Re-run with -ConfirmInterruption to back up anyway."
        exit 3
    }
}
Test-Gap "after-check1"

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$base = "${Project}_$stamp"
$dump = Join-Path $OutDir "$base.dump"
$tgz = Join-Path $OutDir "$base.data.tgz"
$sums = Join-Path $OutDir "$base.data.sha256"
$manifestPath = Join-Path $OutDir "$base.manifest.json"
$countSql = "SELECT 'operators', count(*) FROM operators UNION ALL SELECT 'inspectors', count(*) FROM inspectors " +
            "UNION ALL SELECT 'sessions', count(*) FROM sessions UNION ALL SELECT 'captures', count(*) FROM captures"

$stopped = New-Object System.Collections.ArrayList   # only what THIS run stopped
$exitCode = 0
$failure = $null
try {
    if ($toPause -contains "frontend") {
        Write-Step "Pausing writes: stopping frontend..."
        Dc stop frontend | Out-Null
        [void]$stopped.Add("frontend")
    }
    if ($toPause -contains "backend") {
        # ---------- session check 2: right before the backend stops ----------
        $s2 = Get-SessionState
        $guard.check2 = Describe $s2
        Write-Host "Session check 2: $($guard.check2)"
        $s1Active = if ($s1 -and $s1.known) { $s1.active } else { 0 }
        if (-not $ConfirmInterruption -and (-not $s2.known -or $s2.active -gt 0)) {
            if ($s2.known) {
                Write-Bad "REFUSED: a session started after check 1 (check 1: $s1Active, check 2: $($s2.active)). The backend was NOT stopped and the session is intact; the frontend is being restarted. Nothing else changed."
                $exitCode = 4
            } else {
                Write-Bad "REFUSED: check 2 could not determine whether sessions are active ($($s2.reason)). The backend was NOT stopped; the frontend is being restarted. Nothing else changed. Re-run with -ConfirmInterruption to back up anyway."
                $exitCode = 3
            }
            $guard.decision = "refused at check 2"
        }
        if ($exitCode -eq 0) {
            Test-Gap "after-check2"
            Write-Step "Stopping backend (Postgres stays up)..."
            $since = (Get-Date).ToUniversalTime().AddSeconds(-2).ToString("yyyy-MM-ddTHH:mm:ssZ")
            Dc stop backend | Out-Null
            [void]$stopped.Add("backend")
            $line = @(Invoke-Docker @dcArgs logs --no-color --since $since backend 2>$null |
                Select-String 'AOI_SHUTDOWN active_sessions=(\d+) websocket_clients=(\d+)')
            if ($line.Count) {
                $m = $line[-1].Matches[0]
                $cut = [int]$m.Groups[1].Value
                $guard.shutdown_report = "$cut session(s) active at shutdown, $($m.Groups[2].Value) live dashboard(s)"
                if ($cut -eq 0) {
                    Write-Host "Shutdown report: 0 sessions were active at shutdown."
                } elseif ($ConfirmInterruption) {
                    Write-Host "Shutdown report: $cut session(s) were active at shutdown and have been ended (confirmed)." -ForegroundColor Yellow
                } else {
                    Write-Bad "WARNING: $cut session(s) were active at shutdown and have been ended. They started after check 2 (not via the stopped frontend). The backup continues; exit code 5."
                    $exitCode = 5
                }
            } else {
                $guard.shutdown_report = "unavailable (no AOI_SHUTDOWN log line)"
                Write-Host "Shutdown report unavailable (no AOI_SHUTDOWN log line)." -ForegroundColor Yellow
            }
        }
    }

    if ($exitCode -in 0, 5) {
        $guard.decision = if ($ConfirmInterruption) { "proceeded (confirmed)" }
                          elseif ($exitCode -eq 5) { "proceeded; session(s) cut off after check 2" }
                          else { "proceeded" }
        Write-Step "Dumping the database..."
        # Dump inside the container, then copy: piping binary through PowerShell corrupts it.
        Dc exec -T db pg_dump -U aoi -d aoi -Fc -f /tmp/aoi_backup.dump | Out-Null
        Dc cp db:/tmp/aoi_backup.dump $dump | Out-Null
        Dc exec -T db rm -f /tmp/aoi_backup.dump | Out-Null

        $counts = [ordered]@{}
        foreach ($l in @(Dc exec -T db psql -U aoi -d aoi -At -F "|" -c $countSql)) {
            $k, $v = $l.Split("|"); $counts[$k] = [int]$v
        }
        $paths = @(Dc exec -T db psql -U aoi -d aoi -At -c "SELECT image_path FROM captures WHERE image_path IS NOT NULL")

        Write-Step "Archiving images (writes still paused)..."
        Invoke-Docker run --rm --volumes-from "${backendId}:ro" -v "${OutDir}:/backup" alpine:3.20 sh -c `
            "tar czf /backup/$base.data.tgz -C /data . && cd /data && find . -type f -exec sha256sum {} + | sort -k2 > /backup/$base.data.sha256"
        if ($LASTEXITCODE -ne 0) { throw "Archiving the /data volume failed (exit $LASTEXITCODE)." }
    }
}
catch {
    $failure = $_
}
finally {
    # Don't leave a half-copied dump inside the db container after a failure.
    if ($failure) { Invoke-Docker @dcArgs exec -T db rm -f /tmp/aoi_backup.dump 2>$null | Out-Null }
    # Restart ONLY what this run stopped (each was running before), backend first.
    $restartFailed = @()
    $order = @("backend", "frontend" | Where-Object { $stopped -contains $_ })
    if ($order) { Write-Step "Restarting what this run stopped: $($order -join ', ')..." }
    foreach ($svc in $order) {
        Invoke-Docker start $ids[$svc] 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { $restartFailed += "$svc (start exit $LASTEXITCODE)"; continue }
        # "Started" is not "working" (a backend can run while unable to reach
        # Postgres). With a healthcheck (all prod services) require "healthy"
        # within 90 s; without one (dev) require it to stay running for 6 s.
        $why = "not healthy within 90 s"
        $deadline = (Get-Date).AddSeconds(90)
        $since = Get-Date
        $up = $false
        while ((Get-Date) -lt $deadline) {
            Start-Sleep -Seconds 2
            $st = "$(Invoke-Docker inspect -f '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $ids[$svc] 2>$null)".Trim()
            if ($st -notlike "true *") { $why = "exited after start"; break }
            if ($st -eq "true healthy") { $up = $true; break }
            if ($st -eq "true unhealthy") { $why = "unhealthy"; break }
            if ($st -eq "true none" -and ((Get-Date) - $since).TotalSeconds -ge 6) { $up = $true; break }
        }
        if (-not $up) { $restartFailed += "$svc ($why)" }
    }
}

if ($failure) {
    Write-Bad "BACKUP FAILED: $($failure.Exception.Message)"
    if ($exitCode -in 0, 5) { $exitCode = 1 }
}
if ($restartFailed) {
    Write-Bad "ERROR: could not restart: $($restartFailed -join '; '). The app is DOWN. Check '$dcText logs', then start it with: $dcText up -d"
    $exitCode = 6
} elseif ($order) {
    Write-Host "Restarted: $($order -join ', ')."
}
if ($failure -or $exitCode -in 2, 3, 4, 6) {
    Write-Host "Session guard: $($guard | ConvertTo-Json -Compress)"
    exit $exitCode
}

$fileLines = @(Get-Content $sums)
$files = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($l in $fileLines) { [void]$files.Add(($l -replace '^\S+\s+', '')) }
$missing = @($paths | Where-Object { -not $files.Contains("./detection_results/$_") })

$manifest = [ordered]@{
    project        = $Project
    compose_files  = @($ComposeFile)
    created        = (Get-Date).ToString("o")
    dump           = @{ file = (Split-Path $dump -Leaf); sha256 = (Get-FileHash $dump -Algorithm SHA256).Hash.ToLower() }
    data           = @{ file = (Split-Path $tgz -Leaf); sha256 = (Get-FileHash $tgz -Algorithm SHA256).Hash.ToLower() }
    data_hashes    = (Split-Path $sums -Leaf)
    counts         = $counts
    files_in_data  = $fileLines.Count
    capture_images = $paths.Count
    missing_images = @{ count = $missing.Count; sample = @($missing | Select-Object -First 20) }
    session_guard  = $guard
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host ""
Write-Host "Backup complete: $OutDir\$base.*" -ForegroundColor Green
$counts.GetEnumerator() | ForEach-Object { Write-Host ("    {0,-11} {1}" -f $_.Key, $_.Value) }
Write-Host ("    files       {0} in /data ({1} capture images referenced, {2} missing on disk before backup)" -f `
    $fileLines.Count, $paths.Count, $missing.Count)
Write-Host "    Session guard: $($guard | ConvertTo-Json -Compress)"
Write-Host "    Copy these files off this machine." -ForegroundColor DarkGray
exit $exitCode
