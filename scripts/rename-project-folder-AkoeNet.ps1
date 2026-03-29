# Renombra la carpeta del repo de AkoNet -> AkoeNet.
# Cierra Cursor/VS Code y cualquier terminal con cwd dentro del repo antes de ejecutar.
# Desde PowerShell, en la RAIZ del repo:
#   powershell -ExecutionPolicy Bypass -File .\scripts\rename-project-folder-AkoeNet.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$leaf = Split-Path -Leaf $repoRoot
$parent = Split-Path -Parent $repoRoot

if ($leaf -eq "AkoeNet") {
  Write-Host "La carpeta ya se llama AkoeNet. Nada que hacer."
  exit 0
}

if ($leaf -ne "AkoNet") {
  Write-Host "Carpeta actual: $leaf"
  Write-Host "Este script solo renombra automaticamente si el nombre es exactamente 'AkoNet'."
  Write-Host "Renombra manualmente a AkoeNet desde el explorador o: Rename-Item '$repoRoot' -NewName 'AkoeNet'"
  exit 1
}

Set-Location -LiteralPath $parent
Rename-Item -LiteralPath $repoRoot -NewName "AkoeNet"
Write-Host "Listo: $parent\AkoNet -> $parent\AkoeNet"
Write-Host "Vuelve a abrir el proyecto desde la nueva ruta."
