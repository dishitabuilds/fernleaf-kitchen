$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$previousPath = $env:PATH

Push-Location -LiteralPath $projectRoot
try {
    # A repeat launch must not spawn competing servers or stop unrelated processes.
    $occupiedPorts = @(
        [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
            Where-Object { $_.Port -in @(3000, 3001) } |
            Select-Object -ExpandProperty Port -Unique
    )
    if ($occupiedPorts.Count -gt 0) {
        $alreadyHealthy = $false
        if ($occupiedPorts.Count -eq 2) {
            try {
                $apiHealth = Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/health' -MaximumRedirection 0 -TimeoutSec 5
                $webHealth = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/health' -MaximumRedirection 0 -TimeoutSec 10
                $login = Invoke-WebRequest -Uri 'http://localhost:3000/login' -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 10
                $alreadyHealthy = (
                    $apiHealth.service -eq 'fernleaf-api' -and $apiHealth.status -eq 'ok' -and $apiHealth.database -eq 'connected' -and
                    $webHealth.service -eq 'fernleaf-api' -and $webHealth.status -eq 'ok' -and $webHealth.database -eq 'connected' -and
                    $login.StatusCode -eq 200 -and $login.Content.Contains('aria-label="Fernleaf Kitchen"') -and
                    $login.Content.Contains('name="email"') -and $login.Content.Contains('name="password"')
                )
            }
            catch {
                # Busy ports alone do not identify a working Fernleaf instance.
                $alreadyHealthy = $false
            }
        }
        if ($alreadyHealthy) {
            Write-Host 'Fernleaf is already running and healthy at http://localhost:3000 (API: http://localhost:3001/api/v1/health). No second instance was started.'
            Write-Host 'Use the existing app. To restart it, stop its original development terminal with Ctrl+C, then run this launcher again.'
            return
        }
        throw "Port(s) $($occupiedPorts -join ', ') are already in use, but a healthy Fernleaf web/API pair could not be verified. If another development terminal is starting, wait for it to become ready and retry. Otherwise stop the process using those ports from its owning terminal, then retry. See README.md startup troubleshooting. No process was stopped."
    }

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
