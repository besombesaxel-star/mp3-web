Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:SelfPath = if ($PSCommandPath) {
    $PSCommandPath
}
elseif ($MyInvocation.PSCommandPath) {
    $MyInvocation.PSCommandPath
}
elseif ($MyInvocation.MyCommand.Path) {
    $MyInvocation.MyCommand.Path
}
else {
    [Environment]::GetCommandLineArgs()[0]
}

function Get-AppRoot {
    $baseDir = Split-Path -Parent $script:SelfPath
    $candidates = @(
        $baseDir,
        (Split-Path -Parent $baseDir)
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path (Join-Path $candidate "package.json"))) {
            return (Resolve-Path $candidate).Path
        }
    }

    throw "Impossible de retrouver le dossier du projet."
}

function Get-State {
    param([string]$StatePath)

    if (-not (Test-Path $StatePath)) {
        return $null
    }

    try {
        $raw = Get-Content $StatePath -Raw
        if ([string]::IsNullOrWhiteSpace($raw)) {
            return $null
        }

        return $raw | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Show-StopError {
    param([string]$Message)

    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
    [System.Windows.Forms.MessageBox]::Show(
        $Message,
        "MP3 Web",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
}

try {
    $appRoot = Get-AppRoot
    $stateDirectory = Join-Path $appRoot ".launcher"
    $statePath = Join-Path $stateDirectory "server.json"
    $state = Get-State -StatePath $statePath

    if (-not $state) {
        Write-Host "[MP3 Web] Aucun serveur enregistre."
        exit 0
    }

    $process = Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $process.Id -Force
        Write-Host "[MP3 Web] Serveur arrete."
    }
    else {
        Write-Host "[MP3 Web] Le serveur etait deja arrete."
    }

    Remove-Item $statePath -Force -ErrorAction SilentlyContinue
}
catch {
    Show-StopError -Message $_.Exception.Message
    exit 1
}
