param(
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

$python = (Get-Command python).Source
$iscc = @(
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (Test-Path -LiteralPath "$root\build") {
    Remove-Item -LiteralPath "$root\build" -Recurse -Force
}
if (Test-Path -LiteralPath "$root\dist") {
    Remove-Item -LiteralPath "$root\dist" -Recurse -Force
}

& $python -m PyInstaller --noconfirm --clean "$root\notra.spec"
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller failed with exit code $LASTEXITCODE"
}

$exe = "$root\dist\Notra\Notra.exe"
if (-not (Test-Path -LiteralPath $exe)) {
    throw "Build output not found: $exe"
}
Write-Host "Built $exe"

if (-not $SkipInstaller) {
    if (-not $iscc) {
        throw "Inno Setup 6 compiler not found. Install it or add ISCC.exe to PATH."
    }
    & $iscc "$root\installer.iss"
    if ($LASTEXITCODE -ne 0) {
        throw "Inno Setup failed with exit code $LASTEXITCODE"
    }
    $setup = "$root\dist\Notra-Setup-1.0.0.exe"
    if (-not (Test-Path -LiteralPath $setup)) {
        throw "Installer output not found: $setup"
    }
    Write-Host "Built $setup"
}
