param(
    [switch]$ForceBuild,
    [int]$PreferredPort = 3000
)

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

function Write-Status {
    param([string]$Message)

    if (-not $script:LogPath) {
        return
    }

    Add-Content -Path $script:LogPath -Value ("[{0}] {1}" -f (Get-Date -Format "s"), $Message) -ErrorAction SilentlyContinue
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

function Get-NodePath {
    $commands = @("node.exe", "node")
    foreach ($command in $commands) {
        $resolved = Get-Command $command -ErrorAction SilentlyContinue
        if ($resolved) {
            return $resolved.Source
        }
    }

    $fallback = Join-Path $env:ProgramFiles "nodejs\node.exe"
    if (Test-Path $fallback) {
        return $fallback
    }

    throw "Node.js est introuvable. Installe Node.js puis relance l'application."
}

function Get-NpmPath {
    $commands = @("npm.cmd", "npm")
    foreach ($command in $commands) {
        $resolved = Get-Command $command -ErrorAction SilentlyContinue
        if ($resolved) {
            return $resolved.Source
        }
    }

    $fallback = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
    if (Test-Path $fallback) {
        return $fallback
    }

    throw "npm est introuvable. Installe Node.js puis relance l'application."
}

function Get-LogTail {
    param(
        [string]$Path,
        [int]$Lines = 30
    )

    if (-not (Test-Path $Path)) {
        return ""
    }

    return (Get-Content -Path $Path -Tail $Lines -ErrorAction SilentlyContinue | Out-String)
}

function Invoke-NpmRedirected {
    param(
        [string]$NpmPath,
        [string[]]$Arguments,
        [string]$LogPath
    )

    # Redirecting a native command's stderr wraps each line as a NativeCommandError.
    # With $ErrorActionPreference = "Stop" that turns harmless npm/node warnings into
    # a terminating error, so it must be relaxed for the duration of this call.
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $NpmPath @Arguments *> $LogPath
        return $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Ensure-Dependencies {
    param(
        [string]$AppRoot,
        [string]$NpmPath,
        [string]$LogPath
    )

    $nextCliPath = Join-Path $AppRoot "node_modules\next\dist\bin\next"
    if (Test-Path $nextCliPath) {
        return $nextCliPath
    }

    Write-Status "Dependances absentes. Installation en cours..."

    Push-Location $AppRoot
    try {
        $exitCode = Invoke-NpmRedirected -NpmPath $NpmPath -Arguments @("install") -LogPath $LogPath
        if ($exitCode -ne 0) {
            throw "L'installation des dependances a echoue.`n`n$(Get-LogTail -Path $LogPath)"
        }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path $nextCliPath)) {
        throw "Les dependances ont ete installees, mais Next.js reste introuvable."
    }

    return $nextCliPath
}

function Repair-Dependencies {
    param(
        [string]$AppRoot,
        [string]$NpmPath,
        [string]$LogPath
    )

    Write-Status "Build echoue. Tentative de reparation (reinstallation propre)..."

    $nodeModules = Join-Path $AppRoot "node_modules"
    $nextBuildDir = Join-Path $AppRoot ".next"

    if (Test-Path $nodeModules) {
        Remove-Item $nodeModules -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $nextBuildDir) {
        Remove-Item $nextBuildDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    Push-Location $AppRoot
    try {
        return (Invoke-NpmRedirected -NpmPath $NpmPath -Arguments @("install") -LogPath $LogPath) -eq 0
    }
    finally {
        Pop-Location
    }
}

function Test-LocalPort {
    param([int]$Port)

    $client = $null
    try {
        $client = [System.Net.Sockets.TcpClient]::new()
        $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(250)) {
            return $false
        }

        $client.EndConnect($async)
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($client) {
            $client.Dispose()
        }
    }
}

function Find-FreePort {
    param(
        [int]$StartPort,
        [int]$Attempts = 20
    )

    for ($port = $StartPort; $port -lt ($StartPort + $Attempts); $port++) {
        if (-not (Test-LocalPort -Port $port)) {
            return $port
        }
    }

    throw "Aucun port libre trouve entre $StartPort et $($StartPort + $Attempts - 1)."
}

function Test-SamePath {
    param(
        [string]$Left,
        [string]$Right
    )

    if ([string]::IsNullOrWhiteSpace($Left) -or [string]::IsNullOrWhiteSpace($Right)) {
        return $false
    }

    $trimChars = [char[]]@('\', '/')
    $normalizedLeft = [System.IO.Path]::GetFullPath($Left).TrimEnd($trimChars)
    $normalizedRight = [System.IO.Path]::GetFullPath($Right).TrimEnd($trimChars)

    return [string]::Equals(
        $normalizedLeft,
        $normalizedRight,
        [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-ListenerProcessId {
    param([int]$Port)

    try {
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
            Select-Object -First 1
        if ($listener) {
            return [int]$listener.OwningProcess
        }
    }
    catch {
        return $null
    }

    return $null
}

function Get-AppRootFromNextCliPath {
    param([string]$NextCliPath)

    if ([string]::IsNullOrWhiteSpace($NextCliPath)) {
        return $null
    }

    $candidate = $NextCliPath
    for ($index = 0; $index -lt 5; $index++) {
        $candidate = Split-Path -Parent $candidate
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            return $null
        }
    }

    if (-not (Test-Path (Join-Path $candidate "package.json"))) {
        return $null
    }

    return (Resolve-Path $candidate).Path
}

function Get-AppRootFromProcessId {
    param([int]$ProcessId)

    try {
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
        $commandLine = [string]$processInfo.CommandLine
        if ([string]::IsNullOrWhiteSpace($commandLine)) {
            return $null
        }

        $match = [regex]::Match(
            $commandLine,
            '[A-Za-z]:\\[^"]+?\\node_modules\\next\\dist\\bin\\next',
            [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

        if (-not $match.Success) {
            return $null
        }

        return Get-AppRootFromNextCliPath -NextCliPath $match.Value
    }
    catch {
        return $null
    }
}

function Test-IsMp3WebRoot {
    param([string]$AppRoot)

    if ([string]::IsNullOrWhiteSpace($AppRoot)) {
        return $false
    }

    $packageJsonPath = Join-Path $AppRoot "package.json"
    if (-not (Test-Path $packageJsonPath)) {
        return $false
    }

    try {
        $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
        return $packageJson.name -eq "mp3-web"
    }
    catch {
        return $false
    }
}

function Stop-ForeignMp3WebOnPort {
    param(
        [string]$AppRoot,
        [int]$Port
    )

    if (-not (Test-LocalPort -Port $Port)) {
        return $false
    }

    $listenerProcessId = Get-ListenerProcessId -Port $Port
    if (-not $listenerProcessId) {
        return $false
    }

    $listenerAppRoot = Get-AppRootFromProcessId -ProcessId $listenerProcessId
    if (-not (Test-IsMp3WebRoot -AppRoot $listenerAppRoot)) {
        return $false
    }

    if (Test-SamePath -Left $listenerAppRoot -Right $AppRoot) {
        return $false
    }

    Write-Status "Une ancienne copie de MP3 Web occupe le port $Port. Arret automatique..."
    Stop-Process -Id $listenerProcessId -Force -ErrorAction Stop

    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-LocalPort -Port $Port)) {
            return $true
        }

        Start-Sleep -Milliseconds 250
    }

    throw "Impossible de liberer le port $Port depuis l'ancienne copie de MP3 Web."
}

function Get-LatestInputTimestamp {
    param([string]$AppRoot)

    $items = @(
        "app",
        "public",
        "data",
        "package.json",
        "package-lock.json",
        "next.config.ts",
        "tsconfig.json"
    )

    $latest = [DateTime]::MinValue

    foreach ($item in $items) {
        $path = Join-Path $AppRoot $item
        if (-not (Test-Path $path)) {
            continue
        }

        $entry = Get-Item $path
        if ($entry.PSIsContainer) {
            $recent = Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTimeUtc -Descending |
                Select-Object -First 1

            if ($recent -and $recent.LastWriteTimeUtc -gt $latest) {
                $latest = $recent.LastWriteTimeUtc
            }

            continue
        }

        if ($entry.LastWriteTimeUtc -gt $latest) {
            $latest = $entry.LastWriteTimeUtc
        }
    }

    return $latest
}

function Test-BuildRequired {
    param(
        [string]$AppRoot,
        [bool]$Force
    )

    if ($Force) {
        return $true
    }

    $buildMarker = Join-Path $AppRoot ".next\BUILD_ID"
    if (-not (Test-Path $buildMarker)) {
        return $true
    }

    $buildTime = (Get-Item $buildMarker).LastWriteTimeUtc
    $latestInput = Get-LatestInputTimestamp -AppRoot $AppRoot

    return $latestInput -gt $buildTime
}

function Invoke-ProductionBuild {
    param(
        [string]$AppRoot,
        [string]$NpmPath,
        [string]$LogPath
    )

    Write-Status "Build de production en cours..."

    Push-Location $AppRoot
    try {
        return (Invoke-NpmRedirected -NpmPath $NpmPath -Arguments @("run", "build") -LogPath $LogPath) -eq 0
    }
    finally {
        Pop-Location
    }
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
        Remove-Item $StatePath -Force -ErrorAction SilentlyContinue
        return $null
    }
}

function Save-State {
    param(
        [string]$StatePath,
        [int]$ProcessId,
        [int]$Port,
        [string]$Url
    )

    $payload = @{
        pid = $ProcessId
        port = $Port
        url = $Url
        updatedAt = (Get-Date).ToString("o")
    } | ConvertTo-Json

    Set-Content -Path $StatePath -Value $payload -Encoding UTF8
}

function Clear-State {
    param([string]$StatePath)

    if (Test-Path $StatePath) {
        Remove-Item $StatePath -Force -ErrorAction SilentlyContinue
    }
}

function Wait-ForServer {
    param(
        [int]$ProcessId,
        [int]$Port,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if (-not $process) {
            return $false
        }

        if (Test-LocalPort -Port $Port) {
            return $true
        }

        Start-Sleep -Milliseconds 500
    }

    return $false
}

function Show-LauncherError {
    param([string]$Message)

    Write-Status "ERREUR: $Message"

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
    $stdoutLog = Join-Path $stateDirectory "server.stdout.log"
    $stderrLog = Join-Path $stateDirectory "server.stderr.log"

    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    $script:LogPath = Join-Path $stateDirectory "launcher.log"

    $state = Get-State -StatePath $statePath
    if ($state) {
        $runningProcess = Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue
        if ($runningProcess -and (Test-LocalPort -Port ([int]$state.port))) {
            $runningUrl = if ($state.url) { [string]$state.url } else { "http://127.0.0.1:$($state.port)" }
            Write-Status "L'application tourne deja. Ouverture de $runningUrl"
            Start-Process $runningUrl | Out-Null
            exit 0
        }

        Clear-State -StatePath $statePath
    }

    $envPath = Join-Path $appRoot ".env.local"
    if (-not (Test-Path $envPath)) {
        throw "Le fichier de configuration est manquant.`n`nDemande le fichier '.env.local' a l'administrateur et place-le ici :`n$envPath`n`nRelance ensuite l'application."
    }

    $nodePath = Get-NodePath
    $npmPath = Get-NpmPath
    $installLog = Join-Path $stateDirectory "install.log"
    $nextCli = Ensure-Dependencies -AppRoot $appRoot -NpmPath $npmPath -LogPath $installLog

    if (Test-BuildRequired -AppRoot $appRoot -Force $ForceBuild.IsPresent) {
        $buildLog = Join-Path $stateDirectory "build.log"
        $buildOk = Invoke-ProductionBuild -AppRoot $appRoot -NpmPath $npmPath -LogPath $buildLog

        if (-not $buildOk) {
            $repairLog = Join-Path $stateDirectory "repair-install.log"
            $repaired = Repair-Dependencies -AppRoot $appRoot -NpmPath $npmPath -LogPath $repairLog

            if ($repaired) {
                $buildOk = Invoke-ProductionBuild -AppRoot $appRoot -NpmPath $npmPath -LogPath $buildLog
            }

            if (-not $buildOk) {
                throw "Le build Next.js a echoue, meme apres reparation automatique.`n`n$(Get-LogTail -Path $buildLog)"
            }
        }
    }

    [void](Stop-ForeignMp3WebOnPort -AppRoot $appRoot -Port $PreferredPort)
    $port = Find-FreePort -StartPort $PreferredPort
    $url = "http://127.0.0.1:$port"

    Write-Status "Demarrage du serveur local sur $url"

    $env:MP3_WEB_AUTO_SHUTDOWN = "1"
    $server = Start-Process `
        -FilePath $nodePath `
        -ArgumentList "`"$nextCli`" start -p $port -H 127.0.0.1" `
        -WorkingDirectory $appRoot `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog
    Remove-Item Env:\MP3_WEB_AUTO_SHUTDOWN -ErrorAction SilentlyContinue

    if (-not (Wait-ForServer -ProcessId $server.Id -Port $port)) {
        $stderr = if (Test-Path $stderrLog) { Get-Content $stderrLog -Raw } else { "" }
        $stdout = if (Test-Path $stdoutLog) { Get-Content $stdoutLog -Raw } else { "" }
        Clear-State -StatePath $statePath

        if ([string]::IsNullOrWhiteSpace($stderr) -and [string]::IsNullOrWhiteSpace($stdout)) {
            throw "Le serveur n'a pas reussi a demarrer."
        }

        throw "Le serveur n'a pas reussi a demarrer.`n`nSortie standard:`n$stdout`n`nErreurs:`n$stderr"
    }

    Save-State -StatePath $statePath -ProcessId $server.Id -Port $port -Url $url
    Write-Status "Application prete. Ouverture du navigateur..."
    Start-Process $url | Out-Null
}
catch {
    Show-LauncherError -Message $_.Exception.Message
    exit 1
}
