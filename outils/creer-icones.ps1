# Dessine les icônes du site (même motif que ressources/racine/favicon.svg) en PNG 180 px et 32 px,
# puis assemble favicon.ico. Aucune installation : System.Drawing (Windows) + Node.
Add-Type -AssemblyName System.Drawing
$racine = Join-Path (Split-Path -Parent $PSScriptRoot) 'ressources/racine'
function Dessiner([int]$taille, [string]$sortie) {
    $bmp = New-Object System.Drawing.Bitmap $taille, $taille
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $k = $taille / 40.0
    $fond = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#1b2a41'))
    $or = [System.Drawing.ColorTranslator]::FromHtml('#e9c46a')
    $g.FillRectangle($fond, 0, 0, $taille, $taille)
    $stylo = New-Object System.Drawing.Pen $or, ([float](2 * $k))
    $stylo.StartCap = 'Round'; $stylo.EndCap = 'Round'
    $g.DrawLine($stylo, 20 * $k, 35 * $k, 20 * $k, 22 * $k)
    $g.DrawLine($stylo, 20 * $k, 28 * $k, 15 * $k, 24 * $k)
    $g.DrawLine($stylo, 20 * $k, 25 * $k, 26 * $k, 20 * $k)
    $g.DrawEllipse($stylo, 10 * $k, 5 * $k, 20 * $k, 20 * $k)
    $pinceau = New-Object System.Drawing.SolidBrush $or
    foreach ($p in @(@(16, 13), @(23, 10), @(24, 17), @(18, 19))) { $g.FillEllipse($pinceau, ($p[0] - 1.8) * $k, ($p[1] - 1.8) * $k, 3.6 * $k, 3.6 * $k) }
    $g.Dispose()
    $bmp.Save($sortie, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}
Dessiner 180 (Join-Path $racine 'apple-touch-icon.png')
$tmp = Join-Path $env:TEMP 'icone-32.png'
Dessiner 32 $tmp
# favicon.ico = en-tête ICO + une image PNG 32 px
node -e "const fs=require('fs');const p=fs.readFileSync(process.argv[1]);const h=Buffer.alloc(22);h.writeUInt16LE(0,0);h.writeUInt16LE(1,2);h.writeUInt16LE(1,4);h[6]=32;h[7]=32;h[8]=0;h[9]=0;h.writeUInt16LE(1,10);h.writeUInt16LE(32,12);h.writeUInt32LE(p.length,14);h.writeUInt32LE(22,18);fs.writeFileSync(process.argv[2],Buffer.concat([h,p]));" $tmp (Join-Path $racine 'favicon.ico')
Remove-Item $tmp
Get-ChildItem $racine | Select-Object Name, Length
