$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$previousPath = $env:PATH

Push-Location -LiteralPath $projectRoot
try {
    $missingEnvironment = @('apps/api/.env', 'apps/web/.env.local') | Where-Object {
        -not (Test-Path -LiteralPath (Join-Path $projectRoot $_) -PathType Leaf)
    }
    if ($missingEnvironment) {
        throw "Missing environment file(s): $($missingEnvironment -join ', '). Copy apps/api/.env.example to apps/api/.env and apps/web/.env.example to apps/web/.env.local, then edit their local values. See README.md for first-time setup."
    }

    if (-not (Get-Command node -CommandType Application -ErrorAction SilentlyContinue)) {
        throw 'Node.js is missing from PATH. Install Node.js 24.10.0, then open a new PowerShell terminal.'
    }
    $pnpm = Get-Command pnpm.cmd -CommandType Application -ErrorAction SilentlyContinue
    if (-not $pnpm) {
        $pnpm = Get-Command pnpm -CommandType Application, ExternalScript -ErrorAction SilentlyContinue
    }
    $pnpmPath = if ($pnpm) { $pnpm.Source } else {
        Join-Path $projectRoot '.tooling/node_modules/.bin/pnpm.cmd'
    }
    if (-not (Test-Path -LiteralPath $pnpmPath -PathType Leaf)) {
        throw 'pnpm is missing. Run npm install --global pnpm@10.34.6, then try again.'
    }
    # Root scripts invoke pnpm again; the executable's directory must be on PATH.
    $env:PATH = (Split-Path -Parent $pnpmPath) + ';' + $previousPath

    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules') -PathType Container)) {
        throw 'Dependencies are missing. From the repository root, run pnpm install --frozen-lockfile first.'
    }
    if (-not (Get-Command docker -CommandType Application -ErrorAction SilentlyContinue)) {
        throw 'Docker is missing from PATH. Install/start Docker Desktop with Linux containers for local PostgreSQL.'
    }

    & $pnpmPath db:up
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm db:up failed (exit $LASTEXITCODE). Start Docker Desktop with Linux containers and check port 5432, then retry. No migration or seed was run."
    }

    Write-Host 'Starting Fernleaf at http://localhost:3000 (API: http://localhost:3001/api/v1/health). Keep this terminal open; Ctrl+C stops development.'
    & $pnpmPath dev
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm dev failed (exit $LASTEXITCODE). Review the server output above and README.md startup troubleshooting."
    }
}
finally {
    $env:PATH = $previousPath
    Pop-Location
}
