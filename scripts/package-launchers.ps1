Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $PSCommandPath
$appRoot = Split-Path -Parent $scriptRoot
$outputDirectory = Join-Path $appRoot "launcher"
$buildDirectory = Join-Path $env:TEMP "mp3-web-iexpress"

function Convert-ToSedPath {
    param([string]$Path)

    return $Path.Replace("\", "\\")
}

function New-CmdWrapper {
    param(
        [string]$Path,
        [string]$AppRoot,
        [string]$NpmScriptName
    )

    $content = @(
        "@echo off",
        "cd /d `"$AppRoot`"",
        "call npm.cmd run $NpmScriptName"
    )

    Set-Content -Path $Path -Value $content -Encoding ASCII
}

function New-IExpressPackage {
    param(
        [string]$CmdFileName,
        [string]$FriendlyName,
        [string]$TargetFileName
    )

    $cmdSourcePath = Join-Path $buildDirectory $CmdFileName
    $sedBaseName = [System.IO.Path]::GetFileNameWithoutExtension($CmdFileName)
    $sedPath = Join-Path $buildDirectory ($sedBaseName + ".sed")
    $targetPath = Join-Path $outputDirectory $TargetFileName

    $sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$(Convert-ToSedPath -Path $targetPath)
FriendlyName=$FriendlyName
AppLaunched=$CmdFileName
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[SourceFiles]
SourceFiles0=$(Convert-ToSedPath -Path ($buildDirectory + "\"))
[SourceFiles0]
%FILE0%=
[Strings]
FILE0="$CmdFileName"
"@

    Set-Content -Path $sedPath -Value $sed -Encoding ASCII

    Push-Location $buildDirectory
    try {
        & iexpress.exe /N $sedPath
        Start-Sleep -Seconds 1
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path $targetPath)) {
        throw "IExpress n'a pas genere $TargetFileName."
    }
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
if (Test-Path $buildDirectory) {
    Remove-Item $buildDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null

Get-ChildItem $outputDirectory -Filter "*.exe*" -File -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

@(
    "Open MP3 Web.exe",
    "Stop MP3 Web.exe"
) | ForEach-Object {
    Remove-Item -LiteralPath (Join-Path $outputDirectory $_) -Force -ErrorAction SilentlyContinue
}

New-CmdWrapper -Path (Join-Path $buildDirectory "launch-app.cmd") -AppRoot $appRoot -NpmScriptName "app:launch"
New-CmdWrapper -Path (Join-Path $buildDirectory "stop-app.cmd") -AppRoot $appRoot -NpmScriptName "app:stop"

New-IExpressPackage `
    -CmdFileName "launch-app.cmd" `
    -FriendlyName "Open MP3 Web" `
    -TargetFileName "Open MP3 Web.exe"

New-IExpressPackage `
    -CmdFileName "stop-app.cmd" `
    -FriendlyName "Stop MP3 Web" `
    -TargetFileName "Stop MP3 Web.exe"

Write-Host "Executables generes dans: $outputDirectory"
