$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root "apps\web\public\icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

function New-KodiIcon {
  param(
    [int] $Size,
    [string] $Path
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::FromArgb(15, 111, 95))

  $padding = [int]($Size * 0.145)
  $inner = New-Object System.Drawing.Rectangle $padding, $padding, ($Size - ($padding * 2)), ($Size - ($padding * 2))
  $graphics.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(246, 250, 248))), $inner)

  $pinBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(15, 111, 95))
  $centerX = $Size / 2
  $topY = $Size * 0.18
  $pinWidth = $Size * 0.43
  $pinHeight = $Size * 0.62
  $pinRect = New-Object System.Drawing.RectangleF ($centerX - ($pinWidth / 2)), $topY, $pinWidth, $pinWidth
  $graphics.FillEllipse($pinBrush, $pinRect)

  $points = @(
    (New-Object System.Drawing.PointF ($centerX - ($pinWidth * 0.28)), ($topY + ($pinWidth * 0.63))),
    (New-Object System.Drawing.PointF ($centerX + ($pinWidth * 0.28)), ($topY + ($pinWidth * 0.63))),
    (New-Object System.Drawing.PointF $centerX, ($topY + $pinHeight))
  )
  $graphics.FillPolygon($pinBrush, $points)

  $holeSize = $Size * 0.155
  $holeRect = New-Object System.Drawing.RectangleF ($centerX - ($holeSize / 2)), ($topY + ($pinWidth * 0.27)), $holeSize, $holeSize
  $graphics.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(246, 250, 248))), $holeRect)

  $font = New-Object System.Drawing.Font "Arial", ($Size * 0.18), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textRect = New-Object System.Drawing.RectangleF 0, ($Size * 0.43), $Size, ($Size * 0.2)
  $graphics.DrawString("K", $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(22, 33, 31))), $textRect, $format)

  $arcPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(31, 127, 191)), ([Math]::Max(8, $Size * 0.047))
  $arcPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $arcPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawArc($arcPen, ($Size * 0.31), ($Size * 0.64), ($Size * 0.38), ($Size * 0.16), 20, 140)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-KodiIcon -Size 192 -Path (Join-Path $iconsDir "kodi-192.png")
New-KodiIcon -Size 512 -Path (Join-Path $iconsDir "kodi-512.png")

Write-Host "Generated Kodi PWA icons."
