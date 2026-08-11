[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$DraftPath,
    [string]$CoverImageUrl = "",
    [switch]$Yes
)

$ErrorActionPreference = "Stop"

function Get-FrontMatterValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FrontMatter,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $pattern = "(?m)^" + [regex]::Escape($Name) + ":\s*(.+?)\s*$"
    $match = [regex]::Match($FrontMatter, $pattern)
    if (-not $match.Success) {
        return $null
    }
    return $match.Groups[1].Value.Trim().Trim('"').Trim("'")
}

function Read-DevApiKey {
    $key = $env:DEVTO_API_KEY
    if ([string]::IsNullOrWhiteSpace($key)) {
        $key = [Environment]::GetEnvironmentVariable("DEVTO_API_KEY", "User")
    }
    if (-not [string]::IsNullOrWhiteSpace($key)) {
        return $key.Trim()
    }

    $secureKey = Read-Host "DEV API Key (input is hidden)" -AsSecureString
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }
}

$resolvedDraftPath = (Resolve-Path -LiteralPath $DraftPath).Path
$reviewReceiptPath = "$resolvedDraftPath.humanwriting.sha256"
if (-not (Test-Path -LiteralPath $reviewReceiptPath -PathType Leaf)) {
    throw "HumanWriting review receipt is missing: $reviewReceiptPath"
}

$expectedHash = (Get-Content -Raw -LiteralPath $reviewReceiptPath).Trim().ToLowerInvariant()
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedDraftPath).Hash.ToLowerInvariant()
if ($expectedHash -notmatch '^[a-f0-9]{64}$' -or $expectedHash -ne $actualHash) {
    throw "The draft changed after HumanWriting review. Review it again before sending."
}

$markdown = Get-Content -Raw -Encoding UTF8 -LiteralPath $resolvedDraftPath
$frontMatterMatch = [regex]::Match(
    $markdown,
    "(?s)\A---\s*\r?\n(?<frontMatter>.*?)\r?\n---\s*\r?\n(?<body>.*)\z"
)
if (-not $frontMatterMatch.Success) {
    throw "Draft must contain YAML front matter followed by Markdown content."
}

$frontMatter = $frontMatterMatch.Groups["frontMatter"].Value
$bodyMarkdown = $frontMatterMatch.Groups["body"].Value.Trim()
$title = Get-FrontMatterValue -FrontMatter $frontMatter -Name "title"
$description = Get-FrontMatterValue -FrontMatter $frontMatter -Name "description"
$tagText = Get-FrontMatterValue -FrontMatter $frontMatter -Name "tags"

if ([string]::IsNullOrWhiteSpace($title) -or [string]::IsNullOrWhiteSpace($bodyMarkdown)) {
    throw "Draft title and body are required."
}

$tags = @()
if (-not [string]::IsNullOrWhiteSpace($tagText)) {
    $tags = @($tagText.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}
if ($tags.Count -gt 4) {
    throw "DEV accepts at most four tags; found $($tags.Count)."
}

Write-Host "DEV unpublished draft" -ForegroundColor Cyan
Write-Host "  Title: $title"
Write-Host "  Tags: $($tags -join ', ')"
Write-Host "  Account: determined by the supplied DEV API Key"
Write-Host "  HumanWriting review: verified"
Write-Host "  Published: false"

if (-not $Yes) {
    $confirmation = Read-Host "Create this unpublished draft on DEV? [y/N]"
    if ($confirmation -notin @("y", "Y", "yes", "YES")) {
        Write-Host "Cancelled. Nothing was sent to DEV."
        exit 0
    }
}

$apiKey = Read-DevApiKey
if ([string]::IsNullOrWhiteSpace($apiKey)) {
    throw "No DEV API Key was provided."
}

$article = @{
    title         = $title
    published     = $false
    body_markdown = $bodyMarkdown
    tags          = $tags
}
if (-not [string]::IsNullOrWhiteSpace($description)) {
    $article.description = $description
}
if (-not [string]::IsNullOrWhiteSpace($CoverImageUrl)) {
    $article.main_image = $CoverImageUrl
}

$payload = @{ article = $article } | ConvertTo-Json -Depth 5
$headers = @{
    "api-key"    = $apiKey
    "Accept"     = "application/vnd.forem.api-v1+json"
    "User-Agent" = "promotion-publisher-skill/1.0"
}

try {
    $response = Invoke-RestMethod `
        -Method Post `
        -Uri "https://dev.to/api/articles" `
        -Headers $headers `
        -ContentType "application/json; charset=utf-8" `
        -Body $payload
}
finally {
    $apiKey = $null
    $headers["api-key"] = $null
}

Write-Host "DEV draft created successfully." -ForegroundColor Green
[PSCustomObject]@{
    Id        = $response.id
    Title     = $response.title
    Published = $response.published
    Url       = $response.url
}
