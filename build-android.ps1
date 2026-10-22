#requires -Version 5.1
param([switch]$Release)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not $env:JAVA_HOME) {
    $bundled = 'C:\Program Files\Android\Android Studio\jbr'
    if (Test-Path (Join-Path $bundled 'bin\java.exe')) { $env:JAVA_HOME = $bundled }
}
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
& npm.cmd run sync
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Push-Location android
try {
    $task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
    & .\gradlew.bat $task --no-daemon
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }
Write-Host 'APK output: android/app/build/outputs/apk/'
if ($Release) { Write-Host 'Release APK must be signed with your own keystore before distribution.' }
