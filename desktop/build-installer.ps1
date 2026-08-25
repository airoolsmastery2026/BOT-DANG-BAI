$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputDirectory = Join-Path $repositoryRoot 'release\windows'
$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
)
$stagingDirectory = Join-Path $temporaryRoot ("bot-dang-bai-build-{0}" -f [guid]::NewGuid().ToString('N'))
$resolvedStaging = [System.IO.Path]::GetFullPath($stagingDirectory)
$expectedPrefix = "$temporaryRoot$([System.IO.Path]::DirectorySeparatorChar)bot-dang-bai-build-"

if (-not $resolvedStaging.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Unsafe installer staging path: $resolvedStaging"
}

New-Item -ItemType Directory -Force -Path $resolvedStaging | Out-Null
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

try {
  Push-Location $repositoryRoot
  try {
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    & npx --no-install electron-builder --win nsis --x64 --publish never "--config.directories.output=$resolvedStaging"
    if ($LASTEXITCODE -ne 0) { throw "electron-builder failed with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
  }

  $installer = Get-ChildItem -LiteralPath $resolvedStaging -File -Filter '*-Setup-*.exe' | Select-Object -First 1
  if (-not $installer) { throw 'Windows installer was not created.' }

  $destination = Join-Path $outputDirectory $installer.Name
  Copy-Item -LiteralPath $installer.FullName -Destination $destination -Force
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $installerStream = [System.IO.File]::OpenRead($destination)
  try {
    $hashBytes = $sha256.ComputeHash($installerStream)
    $hash = [System.BitConverter]::ToString($hashBytes).Replace('-', '').ToLowerInvariant()
  } finally {
    $installerStream.Dispose()
    $sha256.Dispose()
  }
  "$hash  $($installer.Name)" | Set-Content -Encoding ascii "$destination.sha256"

  Write-Output "Installer: $destination"
  Write-Output "SHA-256: $hash"
} finally {
  if (Test-Path -LiteralPath $resolvedStaging) {
    $verifiedStaging = [System.IO.Path]::GetFullPath($resolvedStaging)
    if (-not $verifiedStaging.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove unsafe staging path: $verifiedStaging"
    }
    Remove-Item -LiteralPath $verifiedStaging -Recurse -Force
  }
}
