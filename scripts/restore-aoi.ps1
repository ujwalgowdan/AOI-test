#Requires -Version 5.1
<#
.SYNOPSIS
    Restore a backup-aoi.ps1 backup into FRESH volumes of a compose project,
    then verify it against the backup's manifest.

.DESCRIPTION
    Refuses to run unless every volume the target project would use is new:
    no existing volume with the resolved name and no `external` volumes, and
    no containers already in the project. It never overwrites live data.

      1. Checks the dump and image archive against the manifest's SHA-256.
      2. Starts only the target's Postgres, pg_restore's the dump.
      3. Creates (does not start) the target's backend, unpacks the images
         into its /data volume.
      4. Verifies: row counts for operators / inspectors / sessions /
         captures equal the manifest; every file in /data matches its
         SHA-256 from backup time; no more capture images missing than
         before the backup.

    The app containers are left stopped. Start them yourself after reading
    the result (the command is printed at the end).

.EXAMPLE
    .\scripts\restore-aoi.ps1 -Backup backups\aoi-prod_20261118_180000.dump `
        -ComposeFile docker-compose.prod.yml -Project aoi-prod-restore
#>
param(
    [Parameter(Mandatory = $true)][string]$Backup,
    [string[]]$ComposeFile = @("docker-compose.prod.yml"),
    [Parameter(Mandatory = $true)][string]$Project,
    [string]$EnvFile
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..").Path
$dump = (Resolve-Path $Backup).Path
$dir = Split-Path $dump -Parent
$base = [IO.Path]::GetFileNameWithoutExtension($dump)
$manifest = Get-Content (Join-Path $dir "$base.manifest.json") -Raw | ConvertFrom-Json
$tgz = Join-Path $dir $manifest.data.file
$sums = Join-Path $dir $manifest.data_hashes

$dcArgs = @("compose")
foreach ($f in $ComposeFile) {
    if (-not [IO.Path]::IsPathRooted($f)) { $f = Join-Path $repo $f }
    $dcArgs += @("-f", $f)
}
$dcArgs += @("-p", $Project)
if ($EnvFile) { $dcArgs += @("--env-file", (Resolve-Path $EnvFile).Path) }

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
# Docker call whose failure is an expected answer (e.g. "no such volume").
# PowerShell 5.1 turns redirected native stderr into a terminating error
# under $ErrorActionPreference = Stop, so relax it locally.
function Test-Docker {
    $ErrorActionPreference = "Continue"
    & docker @args *> $null
    $LASTEXITCODE -eq 0
}
$failures = New-Object System.Collections.ArrayList
function Check($ok, $msg) {
    if ($ok) { Write-Host "    PASS  $msg" -ForegroundColor Green }
    else { Write-Host "    FAIL  $msg" -ForegroundColor Red; [void]$failures.Add($msg) }
}

Write-Step "Checking backup integrity..."
if ((Get-FileHash $dump -Algorithm SHA256).Hash.ToLower() -ne $manifest.dump.sha256) { throw "Dump hash differs from the manifest." }
if ((Get-FileHash $tgz -Algorithm SHA256).Hash.ToLower() -ne $manifest.data.sha256) { throw "Image archive hash differs from the manifest." }

Write-Step "Checking that project '$Project' is fresh..."
$cfg = (Dc config --format json) -join "`n" | ConvertFrom-Json
foreach ($v in $cfg.volumes.PSObject.Properties) {
    if ($v.Value.external) { throw "Volume '$($v.Name)' is external ('$($v.Value.name)'). Restore only into fresh, project-owned volumes." }
    if (Test-Docker volume inspect $v.Value.name) { throw "Volume '$($v.Value.name)' already exists. Restore only into fresh volumes (pick a new -Project)." }
}
if (@(Dc ps -a -q).Count -gt 0) { throw "Project '$Project' already has containers. Pick a new -Project." }

Write-Step "Starting Postgres and restoring the dump..."
Dc up -d db | Out-Null
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    if (Test-Docker @dcArgs exec -T db pg_isready -U aoi -d aoi) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) { throw "Postgres did not become ready." }
Dc cp $dump db:/tmp/restore.dump | Out-Null
Dc exec -T db pg_restore -U aoi -d aoi --no-owner --exit-on-error /tmp/restore.dump | Out-Null
Dc exec -T db rm -f /tmp/restore.dump | Out-Null

Write-Step "Unpacking images into the new /data volume..."
Dc create backend | Out-Null
$backendId = @(Dc ps -a -q backend)[0]
$restoredSums = @(Invoke-Docker run --rm --volumes-from $backendId -v "${dir}:/backup:ro" alpine:3.20 sh -c `
    "tar xzf /backup/$($manifest.data.file) -C /data && cd /data && find . -type f -exec sha256sum {} + | sort -k2")
if ($LASTEXITCODE -ne 0) { throw "Unpacking images failed (exit $LASTEXITCODE)." }

Write-Step "Verifying against the manifest..."
$countSql = "SELECT 'operators', count(*) FROM operators UNION ALL SELECT 'inspectors', count(*) FROM inspectors " +
            "UNION ALL SELECT 'sessions', count(*) FROM sessions UNION ALL SELECT 'captures', count(*) FROM captures"
foreach ($line in @(Dc exec -T db psql -U aoi -d aoi -At -F "|" -c $countSql)) {
    $k, $v = $line.Split("|")
    Check ([int]$v -eq [int]$manifest.counts.$k) ("{0,-11} restored {1} / backup {2}" -f $k, $v, $manifest.counts.$k)
}
$expected = @(Get-Content $sums)
$diff = @(Compare-Object $expected $restoredSums)
Check ($diff.Count -eq 0) ("files       {0} restored, all SHA-256 equal to backup ({1} differences)" -f $restoredSums.Count, $diff.Count)

$paths = @(Dc exec -T db psql -U aoi -d aoi -At -c "SELECT image_path FROM captures WHERE image_path IS NOT NULL")
$files = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($l in $restoredSums) { [void]$files.Add(($l -replace '^\S+\s+', '')) }
$missing = @($paths | Where-Object { -not $files.Contains("./detection_results/$_") }).Count
Check ($missing -le [int]$manifest.missing_images.count) ("images      {0} referenced, {1} missing (backup had {2} missing)" -f `
    $paths.Count, $missing, $manifest.missing_images.count)

Write-Host ""
if ($failures.Count) {
    Write-Host "RESTORE VERIFICATION FAILED ($($failures.Count)). Nothing was started. Inspect, then remove with:" -ForegroundColor Red
    Write-Host "    docker $(($dcArgs | ForEach-Object { if ($_ -match ' ') { '"' + $_ + '"' } else { $_ } }) -join ' ') down -v"
    exit 1
}
Write-Host "Restore verified. App containers are NOT started. Start them with:" -ForegroundColor Green
Write-Host "    docker $(($dcArgs | ForEach-Object { if ($_ -match ' ') { '"' + $_ + '"' } else { $_ } }) -join ' ') up -d"
