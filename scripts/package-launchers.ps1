Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $PSCommandPath
$appRoot = Split-Path -Parent $scriptRoot
$outputDirectory = Join-Path $appRoot "launcher"
$buildDirectory = Join-Path $env:TEMP "mp3-web-launcher-build"

function Get-CSharpCompiler {
    $candidates = @(
        "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
        "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    throw "Compilateur C# introuvable sur cette machine."
}

function New-LauncherSource {
    param(
        [string]$Path,
        [string]$ScriptFileName,
        [string]$WindowTitle
    )

    $source = @"
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows.Forms;

internal static class LauncherProgram
{
    [STAThread]
    private static void Main()
    {
        string appRoot = null;
        var earlyLogPath = Path.Combine(Path.GetTempPath(), "mp3-web-launcher-wrapper.log");
        try
        {
            File.AppendAllText(earlyLogPath, DateTime.Now.ToString("o") + " | boot | " + "$ScriptFileName" + Environment.NewLine);
            var exeDir = AppDomain.CurrentDomain.BaseDirectory;
            var normalizedExeDir = Path.GetFullPath(exeDir);
            var parentPath = Path.GetFullPath(Path.Combine(normalizedExeDir, ".."));
            var grandParentPath = Path.GetFullPath(Path.Combine(normalizedExeDir, "..", ".."));
            var candidates = new[]
            {
                normalizedExeDir,
                parentPath,
                grandParentPath
            };

            appRoot = candidates.FirstOrDefault(path =>
                !string.IsNullOrWhiteSpace(path) &&
                File.Exists(Path.Combine(path, "package.json")));

            if (string.IsNullOrWhiteSpace(appRoot))
            {
                File.AppendAllText(earlyLogPath, DateTime.Now.ToString("o") + " | no-app-root | " + normalizedExeDir + Environment.NewLine);
                throw new InvalidOperationException("Impossible de retrouver le dossier du projet.");
            }

            var runtimeDirectory = Path.Combine(appRoot, ".launcher");
            Directory.CreateDirectory(runtimeDirectory);
            var logPath = Path.Combine(runtimeDirectory, "launcher-wrapper.log");
            File.AppendAllText(logPath, DateTime.Now.ToString("o") + " | start | " + "$ScriptFileName" + Environment.NewLine);

            var scriptPath = Path.Combine(appRoot, "scripts", "$ScriptFileName");
            if (!File.Exists(scriptPath))
            {
                File.AppendAllText(earlyLogPath, DateTime.Now.ToString("o") + " | missing-script | " + scriptPath + Environment.NewLine);
                File.AppendAllText(logPath, DateTime.Now.ToString("o") + " | missing-script | " + scriptPath + Environment.NewLine);
                throw new FileNotFoundException("Script introuvable.", scriptPath);
            }

            var windowsDirectory = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            var powershellPath = Path.Combine(
                windowsDirectory,
                "System32",
                "WindowsPowerShell",
                "v1.0",
                "powershell.exe");

            var process = new ProcessStartInfo
            {
                FileName = File.Exists(powershellPath) ? powershellPath : "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + scriptPath + "\"",
                WorkingDirectory = appRoot,
                UseShellExecute = false,
                CreateNoWindow = false
            };

            using (var child = Process.Start(process))
            {
                if (child == null)
                {
                    File.AppendAllText(earlyLogPath, DateTime.Now.ToString("o") + " | null-child" + Environment.NewLine);
                    File.AppendAllText(logPath, DateTime.Now.ToString("o") + " | null-child" + Environment.NewLine);
                    throw new InvalidOperationException("Impossible de demarrer PowerShell.");
                }

                child.WaitForExit();
                File.AppendAllText(earlyLogPath, DateTime.Now.ToString("o") + " | exit | " + child.ExitCode + Environment.NewLine);
                File.AppendAllText(logPath, DateTime.Now.ToString("o") + " | exit | " + child.ExitCode + Environment.NewLine);
            }
        }
        catch (Exception ex)
        {
            File.AppendAllText(earlyLogPath, DateTime.Now.ToString("o") + " | error | " + ex.Message + Environment.NewLine);
            if (!string.IsNullOrWhiteSpace(appRoot))
            {
                var runtimeDirectory = Path.Combine(appRoot, ".launcher");
                Directory.CreateDirectory(runtimeDirectory);
                var logPath = Path.Combine(runtimeDirectory, "launcher-wrapper.log");
                File.AppendAllText(logPath, DateTime.Now.ToString("o") + " | error | " + ex.Message + Environment.NewLine);
            }

            MessageBox.Show(
                ex.Message,
                "$WindowTitle",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}
"@

    Set-Content -Path $Path -Value $source -Encoding ASCII
}

function Build-Launcher {
    param(
        [string]$CompilerPath,
        [string]$SourcePath,
        [string]$OutputPath
    )

    $references = @(
        "/reference:System.dll",
        "/reference:System.Core.dll",
        "/reference:System.Windows.Forms.dll"
    )

    $arguments = @(
        "/nologo",
        "/target:exe",
        "/platform:anycpu",
        "/out:$OutputPath"
    ) + $references + @($SourcePath)

    & $CompilerPath $arguments
    if ($LASTEXITCODE -ne 0) {
        throw "La compilation du lanceur a echoue pour $OutputPath."
    }
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

if (Test-Path $buildDirectory) {
    Remove-Item $buildDirectory -Recurse -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null

@(
    "Open MP3 Web.exe",
    "Stop MP3 Web.exe",
    "Arreter MP3 Web.exe"
) | ForEach-Object {
    Remove-Item -LiteralPath (Join-Path $outputDirectory $_) -Force -ErrorAction SilentlyContinue
}

$compilerPath = Get-CSharpCompiler

$openSourcePath = Join-Path $buildDirectory "OpenMp3Web.cs"
$stopSourcePath = Join-Path $buildDirectory "StopMp3Web.cs"

New-LauncherSource -Path $openSourcePath -ScriptFileName "launch-app.ps1" -WindowTitle "Open MP3 Web"
New-LauncherSource -Path $stopSourcePath -ScriptFileName "stop-app.ps1" -WindowTitle "Stop MP3 Web"

Build-Launcher `
    -CompilerPath $compilerPath `
    -SourcePath $openSourcePath `
    -OutputPath (Join-Path $outputDirectory "Open MP3 Web.exe")

Build-Launcher `
    -CompilerPath $compilerPath `
    -SourcePath $stopSourcePath `
    -OutputPath (Join-Path $outputDirectory "Stop MP3 Web.exe")

Write-Host "Executables generes dans: $outputDirectory"
