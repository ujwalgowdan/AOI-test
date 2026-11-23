#Requires -Version 5.1
<#
.SYNOPSIS
    One-time setup: create the "AOI System" desktop icon.

.DESCRIPTION
    Generates an .ico from the Innotech logo and drops a desktop shortcut that
    runs scripts\start-aoi.ps1 (which boots the AOI stack in Docker and opens
    the browser). Re-running is safe - it overwrites the shortcut and reuses an
    existing icon unless -Force is given.

.PARAMETER Force
    Regenerate scripts\aoi.ico even if it already exists.

.PARAMETER Prod
    Make the shortcut start the production stack (start-aoi.ps1 -Prod,
    compose project aoi-prod) instead of the dev stack.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install-desktop-icon.ps1
    powershell -ExecutionPolicy Bypass -File scripts\install-desktop-icon.ps1 -Prod
#>

param(
    [switch]$Force,
    [switch]$Prod      # shortcut runs start-aoi.ps1 -Prod
)

$ErrorActionPreference = "Stop"

$repo      = (Resolve-Path "$PSScriptRoot\..").Path
$logoPng   = Join-Path $repo "frontend\public\innotech-logo.png"
$icoPath   = Join-Path $PSScriptRoot "aoi.ico"
$launcher  = Join-Path $PSScriptRoot "start-aoi.ps1"

Write-Host "AOI desktop-icon installer" -ForegroundColor Cyan
Write-Host "Repo: $repo"

if (-not (Test-Path $launcher)) {
    throw "Launcher not found at $launcher. Make sure scripts\start-aoi.ps1 exists."
}

# ---------- generate the .ico from the PNG (via .NET System.Drawing) ----------
if ((Test-Path $icoPath) -and -not $Force) {
    Write-Host "Icon already exists: $icoPath (use -Force to regenerate)" -ForegroundColor DarkGray
} elseif (Test-Path $logoPng) {
    Write-Host "Generating icon from $logoPng ..." -ForegroundColor DarkGray
    Add-Type -AssemblyName System.Drawing
    $bmp = [System.Drawing.Bitmap]::new($logoPng)
    try {
        $hIcon = $bmp.GetHicon()
        $icon  = [System.Drawing.Icon]::FromHandle($hIcon)
        try {
            $fs = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
            try { $icon.Save($fs) } finally { $fs.Dispose() }
        } finally {
            $icon.Dispose()
        }
    } finally {
        $bmp.Dispose()
    }
    Write-Host "Icon written: $icoPath" -ForegroundColor Green
} else {
    Write-Host "Logo not found at $logoPng - the shortcut will use PowerShell's default icon." -ForegroundColor Yellow
    $icoPath = $null
}

# ---------- create the desktop shortcut ----------
$desktop  = [Environment]::GetFolderPath('Desktop')
$lnkPath  = Join-Path $desktop "AOI System.lnk"
$psExe    = Join-Path $Env:WinDir "System32\WindowsPowerShell\v1.0\powershell.exe"

Write-Host "Creating shortcut: $lnkPath" -ForegroundColor DarkGray
$shell    = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath       = $psExe
$shortcut.Arguments        = "-NoExit -ExecutionPolicy Bypass -File `"$launcher`"" + $(if ($Prod) { " -Prod" } else { "" })
$shortcut.WorkingDirectory = $repo
$shortcut.Description       = "Start the AOI inspection app and open it in the browser"
if ($icoPath) { $shortcut.IconLocation = "$icoPath,0" }
$shortcut.Save()

Write-Host ""
Write-Host "Done. Double-click 'AOI System' on your Desktop to launch the app." -ForegroundColor Green
