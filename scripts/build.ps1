$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        $portableNode = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools') -Directory -Filter 'node-*-win-x64' | Select-Object -First 1
        if (-not $portableNode) { throw 'Install Node.js 22 or later, or place a portable Node distribution in .tools.' }
        $env:PATH = $portableNode.FullName + ';' + $env:PATH
    }
    & npm.cmd ci --cache .tools/npm-cache
    if ($LASTEXITCODE) { throw 'npm ci failed' }
    & npm.cmd test
    if ($LASTEXITCODE) { throw 'Tests failed' }
    & npm.cmd run package
    if ($LASTEXITCODE) { throw 'VSIX packaging failed' }
} finally { Pop-Location }
