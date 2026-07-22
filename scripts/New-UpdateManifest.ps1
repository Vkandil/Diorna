param(
  [Parameter(Mandatory = $true)][string]$Artifacts,
  [Parameter(Mandatory = $true)][string]$Version,
  [ValidateSet('stable', 'beta')][string]$Channel = 'stable',
  [Parameter(Mandatory = $true)][string]$Repository
)

$platforms = @{}
$targets = @{
  'x64' = 'windows-x86_64'
  'arm64' = 'windows-aarch64'
}

foreach ($entry in $targets.GetEnumerator()) {
  $architecture = $entry.Key
  $archive = Get-ChildItem -Path $Artifacts -Recurse -File -Filter '*.nsis.zip' |
    Where-Object { $_.Name -match $architecture -or ($architecture -eq 'x64' -and $_.Name -match 'x64|x86_64') } |
    Select-Object -First 1
  if (-not $archive) { throw "Missing updater archive for $architecture" }
  $signature = Get-Item "$($archive.FullName).sig" -ErrorAction Stop
  $platforms[$entry.Value] = @{
    signature = (Get-Content $signature.FullName -Raw).Trim()
    url = "https://github.com/$Repository/releases/download/v$Version/$($archive.Name)"
  }
}

$manifest = @{
  version = $Version
  notes = "See CHANGELOG.md for Diorna $Version."
  pub_date = (Get-Date).ToUniversalTime().ToString('o')
  platforms = $platforms
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content "$Channel.json"
