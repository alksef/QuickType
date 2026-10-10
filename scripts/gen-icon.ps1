# Generates the app icon (256x256 PNG, must stay under 30KB).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$rootDir = Split-Path $PSScriptRoot -Parent
$out = Join-Path $rootDir 'quicktype-overlay\icon.png'

$bmp = New-Object System.Drawing.Bitmap (256, 256)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Twitch purple background circle
$purple = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 145, 70, 255))
$g.FillEllipse($purple, 8, 8, 240, 240)

$font = New-Object System.Drawing.Font ('Segoe UI', 110, [System.Drawing.FontStyle]::Bold)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$g.DrawString('Q', $font, $white, 128.0, 132.0, $fmt)

$g.Dispose()
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

'{0} bytes -> {1}' -f (Get-Item $out).Length, $out
