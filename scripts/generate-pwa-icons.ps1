$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$publicDir = Join-Path $root "apps\web\public"
$iconsDir = Join-Path $publicDir "icons"
$brandDir = Join-Path $publicDir "brand"
New-Item -ItemType Directory -Force -Path $iconsDir, $brandDir | Out-Null

function New-RoundedRectanglePath {
  param(
    [float] $X,
    [float] $Y,
    [float] $Width,
    [float] $Height,
    [float] $Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc(($X + $Width - $diameter), $Y, $diameter, $diameter, 270, 90)
  $path.AddArc(($X + $Width - $diameter), ($Y + $Height - $diameter), $diameter, $diameter, 0, 90)
  $path.AddArc($X, ($Y + $Height - $diameter), $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-KodiCompassK {
  param(
    [System.Drawing.Graphics] $Graphics,
    [float] $X,
    [float] $Y,
    [float] $Size,
    [bool] $Shadow = $false
  )

  $iconX = $X + ($Size * 0.055)
  $iconY = $Y + ($Size * 0.055)
  $iconSize = $Size * 0.89
  $radius = $Size * 0.168
  $iconPath = New-RoundedRectanglePath -X $iconX -Y $iconY -Width $iconSize -Height $iconSize -Radius $radius

  if ($Shadow) {
    $shadowPath = New-RoundedRectanglePath -X ($iconX + ($Size * 0.018)) -Y ($iconY + ($Size * 0.026)) -Width $iconSize -Height $iconSize -Radius $radius
    $Graphics.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(28, 7, 89, 133))), $shadowPath)
    $shadowPath.Dispose()
  }

  $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.RectangleF $iconX, $iconY, $iconSize, $iconSize),
    ([System.Drawing.Color]::FromArgb(8, 96, 146)),
    ([System.Drawing.Color]::FromArgb(3, 79, 120)),
    45
  )
  $Graphics.FillPath($gradient, $iconPath)

  $centerX = $X + ($Size / 2)
  $centerY = $Y + ($Size / 2)
  $ringSize = $Size * 0.59
  $ringRect = New-Object System.Drawing.RectangleF ($centerX - ($ringSize / 2)), ($centerY - ($ringSize / 2)), $ringSize, $ringSize
  $ringPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(4, $Size * 0.039))
  $ringPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $ringPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $Graphics.DrawEllipse($ringPen, $ringRect)

  $tickPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(4, $Size * 0.039))
  $tickPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $tickPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $tickOuter = $ringSize / 2
  $tickInner = $tickOuter - ($Size * 0.092)
  foreach ($angle in @(0, 90, 180, 270)) {
    $radians = ($angle - 90) * [Math]::PI / 180
    $x1 = $centerX + [Math]::Cos($radians) * $tickInner
    $y1 = $centerY + [Math]::Sin($radians) * $tickInner
    $x2 = $centerX + [Math]::Cos($radians) * $tickOuter
    $y2 = $centerY + [Math]::Sin($radians) * $tickOuter
    $Graphics.DrawLine($tickPen, ([float]$x1), ([float]$y1), ([float]$x2), ([float]$y2))
  }

  $font = New-Object System.Drawing.Font "Arial", ($Size * 0.295), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textRect = New-Object System.Drawing.RectangleF ($X + ($Size * 0.18)), ($Y + ($Size * 0.25)), ($Size * 0.64), ($Size * 0.42)
  $Graphics.DrawString("K", $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)), $textRect, $format)

  $sparklePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(126, 232, 216)), ([Math]::Max(2, $Size * 0.012))
  $sparklePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $sparklePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $sparkleX = $X + ($Size * 0.842)
  $sparkleY = $Y + ($Size * 0.805)
  $sparkle = $Size * 0.021
  $Graphics.DrawLine($sparklePen, $sparkleX, ($sparkleY - $sparkle), $sparkleX, ($sparkleY + $sparkle))
  $Graphics.DrawLine($sparklePen, ($sparkleX - $sparkle), $sparkleY, ($sparkleX + $sparkle), $sparkleY)

  $iconPath.Dispose()
  $gradient.Dispose()
  $ringPen.Dispose()
  $tickPen.Dispose()
  $font.Dispose()
  $format.Dispose()
  $sparklePen.Dispose()
}

function New-KodiIcon {
  param(
    [int] $Size,
    [string] $Path
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)
  Draw-KodiCompassK -Graphics $graphics -X 0 -Y 0 -Size $Size
  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

function New-KodiShareImage {
  param([string] $Path)

  $width = 1200
  $height = 630
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::White)

  Draw-KodiCompassK -Graphics $graphics -X 80 -Y 145 -Size 340 -Shadow $true

  $titleFont = New-Object System.Drawing.Font "Arial", 58, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $subtitleFont = New-Object System.Drawing.Font "Arial", 30, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $blueBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(7, 89, 133))
  $tealBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(20, 184, 166))
  $grayBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(57, 76, 88))

  $graphics.DrawString("Kodi", $titleFont, $blueBrush, 460, 190)
  $graphics.DrawString("AI", $titleFont, $tealBrush, 635, 190)
  $graphics.DrawString("Smart Guide", $titleFont, $blueBrush, 720, 190)
  $subtitleRect = New-Object System.Drawing.RectangleF 462, 286, 650, 120
  $graphics.DrawString("Live map, trip points, family chat, and an AI travel companion.", $subtitleFont, $grayBrush, $subtitleRect)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-KodiIcon -Size 192 -Path (Join-Path $iconsDir "kodi-192.png")
New-KodiIcon -Size 512 -Path (Join-Path $iconsDir "kodi-512.png")
New-KodiShareImage -Path (Join-Path $brandDir "kodi-ai-smart-guide-share.png")

Write-Host "Generated selected Kodi compass K PWA and share images."
