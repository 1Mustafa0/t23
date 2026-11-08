$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Join-Path $PSScriptRoot '..\public\sprites'
$buildingDir = Join-Path $root 'buildings'
$vehicleDir = Join-Path $root 'vehicles'
$treeDir = Join-Path $root 'trees'
@($buildingDir, $vehicleDir, $treeDir) | ForEach-Object { New-Item -ItemType Directory -Force -Path $_ | Out-Null }

function New-Brush([string]$color) { return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($color)) }
function New-Pen([string]$color, [single]$width = 4) { return [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($color), $width) }
function Fill-RoundRect($g, [single]$x, [single]$y, [single]$w, [single]$h, [single]$radius, [string]$fill, [string]$stroke = '#2c3e50', [single]$lineWidth = 5) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = $radius * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $brush = New-Brush $fill; $pen = New-Pen $stroke $lineWidth
  $g.FillPath($brush, $path); $g.DrawPath($pen, $path)
  $brush.Dispose(); $pen.Dispose(); $path.Dispose()
}
function Fill-Polygon($g, [System.Drawing.PointF[]]$points, [string]$fill, [string]$stroke = '#2c3e50', [single]$lineWidth = 5) {
  $brush = New-Brush $fill; $pen = New-Pen $stroke $lineWidth
  $g.FillPolygon($brush, $points); $g.DrawPolygon($pen, $points)
  $brush.Dispose(); $pen.Dispose()
}
function Draw-Window($g, [single]$x, [single]$y, [string]$glass = '#e1f5fe') {
  Fill-RoundRect $g $x $y 68 56 7 $glass '#2c3e50' 4
  $pen = New-Pen '#ffffff' 4
  $g.DrawLine($pen, $x + 34, $y + 3, $x + 34, $y + 53)
  $g.DrawLine($pen, $x + 3, $y + 28, $x + 65, $y + 28)
  $pen.Dispose()
}
function Save-Bitmap($bitmap, [string]$path) {
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

$outline = '#2c3e50'
$palettes = [ordered]@{
  home = @{ wall='#fff8e1'; roof='#e53935'; accent='#c62828'; glass='#fff59d'; style='gable' }
  cafe = @{ wall='#d7ccc8'; roof='#8d6e63'; accent='#e53935'; glass='#fff59d'; style='awning' }
  office = @{ wall='#b0bec5'; roof='#1e88e5'; accent='#90caf9'; glass='#90caf9'; style='modern' }
  market = @{ wall='#efebe9'; roof='#43a047'; accent='#43a047'; glass='#d7ccc8'; style='awning' }
  bakery = @{ wall='#fff3e0'; roof='#ffb300'; accent='#ffb300'; glass='#fff59d'; style='awning' }
  cinema = @{ wall='#ede7f6'; roof='#7e57c2'; accent='#ff80ab'; glass='#40c4ff'; style='marquee' }
  cityhall = @{ wall='#f5f5f5'; roof='#3949ab'; accent='#6366f1'; glass='#e1f5fe'; style='civic' }
  bank = @{ wall='#fffde7'; roof='#854d0e'; accent='#ca8a04'; glass='#fff59d'; style='civic' }
  library = @{ wall='#f5f5f5'; roof='#1d4ed8'; accent='#3b82f6'; glass='#90caf9'; style='civic' }
  hospital = @{ wall='#e0f2f1'; roof='#06b6d4'; accent='#06b6d4'; glass='#b2dfdb'; style='hospital' }
  wellness = @{ wall='#e0f2f1'; roof='#14b8a6'; accent='#14b8a6'; glass='#b2dfdb'; style='wellness' }
  police = @{ wall='#37474f'; roof='#3b82f6'; accent='#3b82f6'; glass='#546e7a'; style='police' }
  construction_site = @{ wall='#5d4037'; roof='#ffb300'; accent='#fbc02d'; glass='#d7a15c'; style='construction' }
}

foreach ($entry in $palettes.GetEnumerator()) {
  $bitmap = [System.Drawing.Bitmap]::new(512, 384, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $shadow = New-Brush '#30000000'; $g.FillEllipse($shadow, 58, 335, 396, 24); $shadow.Dispose()
  $p = $entry.Value
  $wallX = 64; $wallY = 132; $wallW = 384; $wallH = 208

  if ($p.style -eq 'gable' -or $p.style -eq 'civic') {
    Fill-Polygon $g ([System.Drawing.PointF[]]@([System.Drawing.PointF]::new(42, 145), [System.Drawing.PointF]::new(256, 52), [System.Drawing.PointF]::new(470, 145))) $p.roof $outline 7
  } elseif ($p.style -eq 'awning') {
    Fill-Polygon $g ([System.Drawing.PointF[]]@([System.Drawing.PointF]::new(56, 144), [System.Drawing.PointF]::new(92, 75), [System.Drawing.PointF]::new(420, 75), [System.Drawing.PointF]::new(456, 144))) $p.roof $outline 7
  } elseif ($p.style -eq 'marquee') {
    Fill-Polygon $g ([System.Drawing.PointF[]]@([System.Drawing.PointF]::new(52, 140), [System.Drawing.PointF]::new(100, 82), [System.Drawing.PointF]::new(412, 82), [System.Drawing.PointF]::new(460, 140))) $p.roof $outline 7
  }

  Fill-RoundRect $g $wallX $wallY $wallW $wallH 18 $p.wall $outline 7
  $accentBrush = New-Brush $p.accent
  if ($p.style -eq 'modern') {
    $g.FillRectangle($accentBrush, 83, 106, 142, 20); $g.FillRectangle($accentBrush, 287, 106, 142, 20)
    $pen = New-Pen $outline 6; $g.DrawLine($pen, 256, 132, 256, 94); $g.DrawLine($pen, 256, 94, 256, 73); $pen.Dispose()
  } elseif ($p.style -eq 'awning' -or $p.style -eq 'marquee') {
    $g.FillRectangle($accentBrush, 64, 132, 384, 44)
    $stripe = if ($p.style -eq 'market') { '#ffffff' } else { '#ffffff' }
    for ($i = 0; $i -lt 10; $i++) {
      $color = if ($i % 2 -eq 0) { $p.accent } else { $stripe }
      $b = New-Brush $color; $g.FillRectangle($b, 78 + ($i * 35), 162, 35, 38); $b.Dispose()
    }
  } elseif ($p.style -eq 'marquee') {
    $g.FillRectangle($accentBrush, 64, 132, 384, 48)
    for ($i = 0; $i -lt 9; $i++) { $b = New-Brush '#ffd54f'; $g.FillEllipse($b, 88 + ($i * 42), 148, 10, 10); $b.Dispose() }
  } elseif ($p.style -eq 'hospital' -or $p.style -eq 'wellness' -or $p.style -eq 'police') {
    $g.FillRectangle($accentBrush, 64, 132, 384, 42)
  } elseif ($p.style -eq 'civic') {
    $g.FillRectangle($accentBrush, 64, 132, 384, 12)
  } elseif ($p.style -eq 'construction') {
    $pen = New-Pen '#d7a15c' 8
    for ($x = 100; $x -lt 400; $x += 90) { $g.DrawRectangle($pen, $x, 178, 52, 144); $g.DrawLine($pen, $x, 180, $x + 52, 318); $g.DrawLine($pen, $x + 52, 180, $x, 318) }
    $pen.Dispose()
    $g.FillRectangle($accentBrush, 389, 65, 24, 275); $g.FillRectangle($accentBrush, 320, 61, 110, 14)
  }
  $accentBrush.Dispose()

  if ($p.style -eq 'civic') {
    for ($i = 0; $i -lt 5; $i++) {
      $x = 102 + ($i * 74); $b = New-Brush '#ffffff'; $g.FillRectangle($b, $x, 183, 20, 126); $b.Dispose()
      $pen = New-Pen $outline 4; $g.DrawRectangle($pen, $x, 183, 20, 126); $pen.Dispose()
    }
  } elseif ($p.style -eq 'construction') {
    $pen = New-Pen '#fbc02d' 7; $pen.DashPattern = [single[]]@(2, 2); $g.DrawRectangle($pen, 73, 142, 366, 185); $pen.Dispose()
  } else {
    $windowY = if ($p.style -eq 'home') { 206 } else { 205 }
    $windowXs = if ($p.style -eq 'home') { @(104, 340) } else { @(106, 211, 316) }
    foreach ($x in $windowXs) { Draw-Window $g $x $windowY $p.glass }
    if ($p.style -eq 'modern') {
      for ($row = 0; $row -lt 2; $row++) { for ($col = 0; $col -lt 4; $col++) {
        $b = New-Brush $p.glass; $g.FillRectangle($b, 100 + ($col * 78), 183 + ($row * 64), 57, 43); $b.Dispose()
        $pen = New-Pen $outline 4; $g.DrawRectangle($pen, 100 + ($col * 78), 183 + ($row * 64), 57, 43); $pen.Dispose()
      } }
    }
    if ($p.style -eq 'hospital') { $b = New-Brush '#e53935'; $g.FillRectangle($b, 87, 139, 34, 8); $g.FillRectangle($b, 100, 126, 8, 34); $b.Dispose() }
    if ($p.style -eq 'wellness') { $b = New-Brush '#66bb6a'; $g.FillEllipse($b, 87, 139, 30, 30); $b.Dispose() }
    if ($p.style -eq 'police') { $b = New-Brush '#ffd54f'; $g.FillEllipse($b, 238, 105, 36, 20); $b.Dispose() }
    if ($p.style -eq 'home') {
      $b = New-Brush '#b71c1c'; $g.FillRectangle($b, 382, 72, 30, 64); $b.Dispose()
      $pen = New-Pen '#7f0000' 7; $g.DrawLine($pen, 374, 74, 420, 74); $pen.Dispose()
    }
  }

  if ($p.style -eq 'awning' -or $p.style -eq 'marquee') {
    $pen = New-Pen $outline 5; $g.DrawLine($pen, 88, 201, 424, 201); $pen.Dispose()
  }
  if ($p.style -ne 'construction') {
    Fill-RoundRect $g 228 264 56 76 8 '#5d4037' $outline 5
    $b = New-Brush '#ffd54f'; $g.FillEllipse($b, 270, 301, 8, 8); $b.Dispose()
  }
  if ($p.style -eq 'home') {
    $pen = New-Pen '#c62828' 5; $g.DrawLine($pen, 68, 149, 256, 68); $g.DrawLine($pen, 256, 68, 444, 149); $pen.Dispose()
  }
  $g.Dispose()
  Save-Bitmap $bitmap (Join-Path $buildingDir ($entry.Key + '.png'))
}

$vehicleColors = [ordered]@{
  yellow='#fbc02d'; blue='#42a5f5'; green='#66bb6a'; red='#ef5350'; orange='#ffa726'; purple='#ab47bc'; teal='#26a69a'
}
$vehicleTypes = @('taxi', 'beetle', 'van', 'coupe', 'pickup')
foreach ($type in $vehicleTypes) {
  foreach ($colorEntry in $vehicleColors.GetEnumerator()) {
    $bitmap = [System.Drawing.Bitmap]::new(128, 80, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bitmap); $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias; $g.Clear([System.Drawing.Color]::Transparent)
    $body = $colorEntry.Value
    $shadow = New-Brush '#40000000'; $g.FillEllipse($shadow, 13, 61, 102, 12); $shadow.Dispose()
    if ($type -eq 'beetle') { $b = New-Brush $body; $pen = New-Pen $outline 5; $g.FillEllipse($b, 15, 12, 98, 56); $g.DrawEllipse($pen, 15, 12, 98, 56); $b.Dispose(); $pen.Dispose() }
    elseif ($type -eq 'van') { Fill-RoundRect $g 15 12 98 56 10 $body $outline 5 }
    elseif ($type -eq 'pickup') {
      Fill-RoundRect $g 13 18 102 48 9 $body $outline 5
      $bed = New-Brush '#795548'; $g.FillRectangle($bed, 20, 22, 28, 39); $bed.Dispose()
    }
    else {
      $b = New-Brush $body; $pen = New-Pen $outline 5; $g.FillEllipse($b, 13, 14, 102, 54); $g.DrawEllipse($pen, 13, 14, 102, 54); $b.Dispose(); $pen.Dispose()
    }
    if ($type -eq 'taxi') { $b = New-Brush $body; $g.FillRectangle($b, 13, 31, 102, 20); $b.Dispose() }
    $tire = New-Brush '#263238'; $g.FillRectangle($tire, 9, 18, 15, 11); $g.FillRectangle($tire, 104, 18, 15, 11); $g.FillRectangle($tire, 9, 53, 15, 11); $g.FillRectangle($tire, 104, 53, 15, 11); $tire.Dispose()
    if ($type -eq 'van') { Fill-RoundRect $g 52 20 43 40 4 '#e1f5fe' $outline 3 }
    else { $glass = New-Brush '#e1f5fe'; $pen = New-Pen $outline 3; $g.FillEllipse($glass, 47, 19, 38, 42); $g.DrawEllipse($pen, 47, 19, 38, 42); $glass.Dispose(); $pen.Dispose() }
    $roof = New-Brush $body; $g.FillEllipse($roof, 54, 24, 24, 32); $roof.Dispose()
    $lamp = New-Brush '#fff59d'; $g.FillEllipse($lamp, 104, 21, 8, 8); $g.FillEllipse($lamp, 104, 53, 8, 8); $lamp.Dispose()
    if ($type -eq 'taxi') { Fill-RoundRect $g 54 7 20 8 3 '#fff59d' $outline 2 }
    if ($type -eq 'pickup') { $pen = New-Pen '#2c3e50' 3; $g.DrawRectangle($pen, 20, 23, 28, 37); $pen.Dispose() }
    $g.Dispose(); Save-Bitmap $bitmap (Join-Path $vehicleDir ($type + '-' + $colorEntry.Key + '.png'))
  }
}

foreach ($snowy in @($false, $true)) {
  $bitmap = [System.Drawing.Bitmap]::new(128, 160, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bitmap); $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias; $g.Clear([System.Drawing.Color]::Transparent)
  $shadow = New-Brush '#30000000'; $g.FillEllipse($shadow, 28, 139, 72, 15); $shadow.Dispose()
  Fill-RoundRect $g 55 89 18 54 6 '#795548' $outline 4
  $foliage = if ($snowy) { '#b0bec5' } else { '#4caf50' }; $foliage2 = if ($snowy) { '#cfd8dc' } else { '#81c784' }
  foreach ($cluster in @(@(64, 54, 46), @(38, 76, 38), @(90, 76, 38))) { $b = New-Brush $foliage; $pen = New-Pen $outline 4; $g.FillEllipse($b, $cluster[0] - $cluster[2] / 2, $cluster[1] - $cluster[2] / 2, $cluster[2], $cluster[2]); $g.DrawEllipse($pen, $cluster[0] - $cluster[2] / 2, $cluster[1] - $cluster[2] / 2, $cluster[2], $cluster[2]); $b.Dispose(); $pen.Dispose() }
  $b = New-Brush $foliage2; $pen = New-Pen $outline 4; $g.FillEllipse($b, 39, 20, 50, 50); $g.DrawEllipse($pen, 39, 20, 50, 50); $b.Dispose(); $pen.Dispose()
  $g.DrawArc((New-Pen $(if ($snowy) { '#ffffff' } else { '#a5d6a7' }) 4), 46, 26, 32, 24, 205, 90)
  if ($snowy) { $b = New-Brush '#ffffff'; $g.FillEllipse($b, 47, 13, 34, 18); $g.FillEllipse($b, 38, 23, 24, 15); $g.FillEllipse($b, 67, 23, 24, 15); $b.Dispose() }
  $g.Dispose(); $file = if ($snowy) { 'tree-snow.png' } else { 'tree.png' }; Save-Bitmap $bitmap (Join-Path $treeDir $file)
}

Write-Output "Generated PNG sprites in $root"
