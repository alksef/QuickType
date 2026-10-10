# Packages QuickType into an .opk (a ZIP of the app files with
# manifest.json at the archive root, extension renamed to .opk).
# README.md stays out of the package: it is repo documentation, not an app file.
$ErrorActionPreference = 'Stop'

$rootDir = Split-Path $PSScriptRoot -Parent
$src = Join-Path $rootDir 'quicktype-overlay'
$dist = Join-Path $rootDir 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$manifest = Get-Content -Raw (Join-Path $src 'manifest.json') | ConvertFrom-Json
$appId = ($manifest.meta.name -replace '[^A-Za-z0-9]+', '-')
$opkName = '{0}-{1}.opk' -f $appId, $manifest.meta.version

$files = @(
    'manifest.json',
    'background.html',
    'config.js',
    'desktop.html',
    'desktop.css',
    'desktop.js',
    'overlay.html',
    'overlay.css',
    'overlay.js',
    'icon.png'
)

foreach ($f in $files) {
    if (-not (Test-Path (Join-Path $src $f))) {
        throw "missing required file: $f"
    }
}

$stage = Join-Path $dist 'stage'
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
foreach ($f in $files) {
    Copy-Item (Join-Path $src $f) (Join-Path $stage $f)
}

$zip = Join-Path $dist ($opkName -replace '\.opk$', '.zip')
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip

$opk = Join-Path $dist $opkName
if (Test-Path $opk) { Remove-Item -Force $opk }
Move-Item $zip $opk
Remove-Item -Recurse -Force $stage

'{0} bytes -> {1}' -f (Get-Item $opk).Length, $opk
