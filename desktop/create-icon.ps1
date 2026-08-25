$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$assetDirectory = Join-Path $PSScriptRoot 'assets'
New-Item -ItemType Directory -Force -Path $assetDirectory | Out-Null
$pngPath = Join-Path $assetDirectory 'icon.png'
$icoPath = Join-Path $assetDirectory 'icon.ico'

$size = 256
$bitmap = [System.Drawing.Bitmap]::new($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

try {
  $bounds = [System.Drawing.Rectangle]::new(0, 0, $size, $size)
  $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $bounds,
    [System.Drawing.Color]::FromArgb(8, 13, 28),
    [System.Drawing.Color]::FromArgb(76, 29, 149),
    45
  )
  $graphics.FillRectangle($background, $bounds)
  $background.Dispose()

  $gold = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(245, 183, 64))
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $borderPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(245, 183, 64), 10)
  $graphics.DrawEllipse($borderPen, 18, 18, 220, 220)

  $font = [System.Drawing.Font]::new('Arial', 70, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $smallFont = [System.Drawing.Font]::new('Arial', 26, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $center = [System.Drawing.StringFormat]::new()
  $center.Alignment = [System.Drawing.StringAlignment]::Center
  $center.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString('DHP', $font, $white, [System.Drawing.RectangleF]::new(18, 56, 220, 90), $center)
  $graphics.DrawString('BOT', $smallFont, $gold, [System.Drawing.RectangleF]::new(18, 137, 220, 48), $center)

  $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  if ($center) { $center.Dispose() }
  if ($font) { $font.Dispose() }
  if ($smallFont) { $smallFont.Dispose() }
  if ($gold) { $gold.Dispose() }
  if ($white) { $white.Dispose() }
  if ($borderPen) { $borderPen.Dispose() }
  $graphics.Dispose()
  $bitmap.Dispose()
}

$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$writer = [System.IO.BinaryWriter]::new($stream)
try {
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]1)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]32)
  $writer.Write([uint32]$pngBytes.Length)
  $writer.Write([uint32]22)
  $writer.Write($pngBytes)
} finally {
  $writer.Dispose()
  $stream.Dispose()
}

Write-Output "Created $pngPath"
Write-Output "Created $icoPath"
