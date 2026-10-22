#requires -Version 5.1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$source = [Drawing.Image]::FromFile((Join-Path $root 'public\hanzi.png'))
function Save-Icon([string]$path, [int]$size, [double]$inset = 0.08) {
    $bitmap = New-Object Drawing.Bitmap($size, $size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([Drawing.Color]::White)
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $edge = [int]($size * (1 - 2 * $inset))
        $offset = [int]($size * $inset)
        $graphics.DrawImage($source, $offset, $offset, $edge, $edge)
        $bitmap.Save($path, [Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
function Save-Splash([string]$path) {
    $existing = [Drawing.Image]::FromFile($path)
    $width = $existing.Width
    $height = $existing.Height
    $existing.Dispose()
    $bitmap = New-Object Drawing.Bitmap($width, $height)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#f5f7f8'))
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $edge = [int]([Math]::Min($width, $height) * 0.22)
        $graphics.DrawImage($source, [int](($width - $edge) / 2), [int](($height - $edge) / 2), $edge, $edge)
        $bitmap.Save($path, [Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
try {
    $sizes = @{mdpi=48; hdpi=72; xhdpi=96; xxhdpi=144; xxxhdpi=192}
    foreach ($density in $sizes.Keys) {
        $folder = Join-Path $root "android\app\src\main\res\mipmap-$density"
        New-Item -ItemType Directory -Force $folder | Out-Null
        Save-Icon (Join-Path $folder 'ic_launcher.png') $sizes[$density]
        Save-Icon (Join-Path $folder 'ic_launcher_round.png') $sizes[$density]
        Save-Icon (Join-Path $folder 'ic_launcher_foreground.png') ([int]($sizes[$density] * 2.25)) 0.23
    }
    Save-Icon (Join-Path $root 'ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png') 1024
    foreach ($image in Get-ChildItem (Join-Path $root 'android\app\src\main\res') -Recurse -Filter 'splash.png') { Save-Splash $image.FullName }
    foreach ($image in Get-ChildItem (Join-Path $root 'ios\App\App\Assets.xcassets\Splash.imageset') -Filter '*.png') { Save-Splash $image.FullName }
} finally { $source.Dispose() }
