param([string]$OutputName = 'wizards-gambit-toy.zip')
$ErrorActionPreference = 'Stop'
if ($OutputName -notmatch '^[A-Za-z0-9_-]+\.zip$') { throw 'OutputName must be a ZIP filename.' }
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskDist = Join-Path $taskRoot 'dist-toy'
if (!(Test-Path -LiteralPath (Join-Path $taskDist 'index.html'))) {
  throw 'Run npm run build:toy first.'
}
$taskOutput = Join-Path $taskRoot '.local'
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskZip = Join-Path $taskOutput $OutputName
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskStream = [IO.File]::Open($taskZip, [IO.FileMode]::Create)
$taskArchive = $null
try {
  $taskArchive = New-Object IO.Compression.ZipArchive($taskStream, [IO.Compression.ZipArchiveMode]::Create, $false)
  foreach ($taskFile in Get-ChildItem -LiteralPath $taskDist -File -Recurse) {
    $taskEntry = $taskFile.FullName.Substring($taskDist.Length + 1).Replace('\', '/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive, $taskFile.FullName, $taskEntry, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  if ($taskArchive) { $taskArchive.Dispose() }
  $taskStream.Dispose()
}
Get-Item -LiteralPath $taskZip | Select-Object Name, Length
