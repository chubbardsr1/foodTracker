[CmdletBinding()]
param(
    [ValidateSet('Unit', 'Quick', 'Full')]
    [string]$Mode = 'Quick'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Check {
    param([string]$Label, [string]$Executable, [string[]]$Arguments)
    Write-Host "Checking: $Label"
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed (exit $LASTEXITCODE)."
    }
}

Push-Location -LiteralPath $projectRoot
try {
    $node = (Get-Command node -ErrorAction Stop).Source
    $nodeVersion = & $node -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0 -or [version]$nodeVersion -lt [version]'22.13.0') {
        throw 'Node.js 22.13 or newer is required.'
    }
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        throw 'Dependencies are missing. Run npm ci from the project directory first.'
    }
    if ($Mode -ne 'Unit') {
        Invoke-Check 'TypeScript' $node @('node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false')
    }
    $testFiles = @(Get-ChildItem -LiteralPath 'tests/unit' -Filter '*.test.mjs' -File |
        Sort-Object Name | ForEach-Object { $_.FullName })
    if ($testFiles.Count -eq 0) { throw 'No unit tests found.' }
    Invoke-Check 'Unit tests' $node (@('--experimental-strip-types', '--import', './tests/register-ts.mjs', '--test') + $testFiles)
    if ($Mode -eq 'Full') {
        Invoke-Check 'ESLint' $node @('node_modules/eslint/bin/eslint.js', '.', '--ignore-pattern', 'dist/**', '--ignore-pattern', '.next/**', '--ignore-pattern', '.sites-runtime/**', '--ignore-pattern', '.wrangler/**')
        Invoke-Check 'Windows build' $node @('node_modules/vite/bin/vite.js', 'build')
    }
    Write-Host "Verification passed ($Mode)."
} finally {
    Pop-Location
}
