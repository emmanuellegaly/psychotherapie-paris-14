# Optimise une image pour le site : redimensionne en plusieurs largeurs, ré-encode en JPEG (ou PNG),
# et supprime TOUTES les métadonnées (EXIF, GPS, profil, etc.) : l'image est redessinée dans une image neuve.
# Utilise uniquement ce qui est déjà présent sous Windows (System.Drawing), aucune installation.
#
# Exemples :
#   ./outils/optimiser-image.ps1 -Source photos-a-integrer/portrait.jpg -Nom portrait -Largeurs 400,800
#   ./outils/optimiser-image.ps1 -Source logo.png -Nom label-ff2p -Largeurs 240 -Format png
#   ./outils/optimiser-image.ps1 -Source photo.jpg -Nom partage -Largeurs 1200 -Recadrage 1200x630
#
# Résultat : ressources/images/<Nom>-<largeur>.jpg (ou .png). Une largeur plus grande que l'original est ignorée
# (l'original est alors utilisé à sa taille). Affiche à la fin les fichiers créés et leur poids.
param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$Nom,
    [int[]]$Largeurs = @(480, 960, 1600),
    [ValidateSet('jpg', 'png')][string]$Format = 'jpg',
    [int]$Qualite = 78,
    [string]$Recadrage = ''   # ex. "1200x630" : recadre au centre à ce rapport largeur/hauteur
)
Add-Type -AssemblyName System.Drawing
$racine = Split-Path -Parent $PSScriptRoot
$dossier = Join-Path $racine 'ressources/images'
New-Item -ItemType Directory -Force $dossier | Out-Null
$cheminSource = (Resolve-Path $Source).Path
$img = [System.Drawing.Image]::FromFile($cheminSource)
try {
    # Orientation EXIF (balise 274) : on applique la rotation avant de jeter les métadonnées
    if ($img.PropertyIdList -contains 274) {
        $o = $img.GetPropertyItem(274).Value[0]
        switch ($o) {
            3 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
            6 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
            8 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
        }
    }
    # Zone source (recadrage centré éventuel)
    $sx = 0; $sy = 0; $sw = $img.Width; $sh = $img.Height
    if ($Recadrage -match '^(\d+)x(\d+)$') {
        $ratio = [double]$Matches[1] / [double]$Matches[2]
        if ($sw / $sh -gt $ratio) { $nw = [int]($sh * $ratio); $sx = [int](($sw - $nw) / 2); $sw = $nw }
        else { $nh = [int]($sw / $ratio); $sy = [int](($sh - $nh) / 2); $sh = $nh }
    }
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $params = New-Object System.Drawing.Imaging.EncoderParameters 1
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]$Qualite)
    $faites = @{}
    foreach ($l in $Largeurs) {
        $w = [Math]::Min($l, $sw)
        if ($faites.ContainsKey($w)) { continue }
        $faites[$w] = $true
        $h = [int][Math]::Round($sh * $w / $sw)
        $pf = if ($Format -eq 'png') { [System.Drawing.Imaging.PixelFormat]::Format32bppArgb } else { [System.Drawing.Imaging.PixelFormat]::Format24bppRgb }
        $bmp = New-Object System.Drawing.Bitmap $w, $h, $pf
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        if ($Format -eq 'jpg') { $g.Clear([System.Drawing.Color]::White) }
        $attr = New-Object System.Drawing.Imaging.ImageAttributes
        $attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
        $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), $sx, $sy, $sw, $sh, [System.Drawing.GraphicsUnit]::Pixel, $attr)
        $g.Dispose()
        $sortie = Join-Path $dossier "$Nom-$w.$Format"
        if ($Format -eq 'png') { $bmp.Save($sortie, [System.Drawing.Imaging.ImageFormat]::Png) }
        else { $bmp.Save($sortie, $codec, $params) }
        $bmp.Dispose()
        '{0}  {1}x{2}  {3:N0} octets' -f (Split-Path -Leaf $sortie), $w, $h, (Get-Item $sortie).Length
    }
}
finally { $img.Dispose() }
