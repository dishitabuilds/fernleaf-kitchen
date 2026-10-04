# Release verification — 4 October 2026

> Historical initial release-takeover checks. Failures, absent-source notes and pending checks below describe that checkpoint and are preserved without upgrading their results. The original assignment PDF has since been read fully; later local Phase 6 evidence and the verified pushed/deployed application commit `7c975ea5cdba62ce9cc42c77ea548a4832ddd0b1` are recorded in [README](../README.md). Final production smoke evidence is kept separately there; the 400-order workload evidence is local.

Verification begins from Antigravity commit `fbfc992` on `main`. Existing development PostgreSQL and the healthy web/API at ports 3000/3001 are preserved. The original assignment PDF is absent; requirements were checked against `rules.md`, README and the relevant blueprint acceptance sections.

## Initial checks

| Check | Actual result |
| --- | --- |
| `pnpm lint` | Failed: 16 errors in Antigravity billing, staff and dashboard additions (unused declarations and React effect state updates). Reported to implementation owners. |
| `pnpm typecheck` | Passed contracts, API and web. |
| `pnpm build` | Passed contracts, API and Next.js production output, including billing/staff routes. |
| `pnpm test:integration` | Passed all 143 tests / 9 suites in 132.249 seconds against guarded `fernleaf_test`. Includes 400-order API workload; this baseline does not cover the new billing module. |
| Existing local health | Direct API and proxied API returned HTTP 200 with real PostgreSQL `database: connected`. |

The workstation needs `.tooling/node_modules/.bin` on PATH and uses the ignored `.tooling/browsers` Chromium cache. Docker named-pipe access is denied in the filesystem sandbox, but the existing PostgreSQL instance is accessible over localhost TCP. No database reset or Docker volume deletion was attempted.

## Isolated browser preparation

Created `fernleaf_release_browser_test` using localhost PostgreSQL; it is separate from development and the integration suite. Applied all ten committed/current additive migrations, including `billing_release_safety`, successfully. Browser fixture seed initially failed because sandboxed `tsx` could not read Windows user information (`uv_os_get_passwd`); the automatically approved normal-access retry passed both `pnpm db:seed` and `pnpm test:seed-browser`, preserving existing records.

Added four billing/security Chromium cases and strengthened all four login cases to require visible role dashboard metrics. Discovery lists 27 ordinary cases in six files. The billing scenario appends dedicated synthetic records through NestJS and verifies invoice creation, original-total reconciliation, exact company settlement, post-payment shortage credit, automatic invoiced-cancellation credit, original membership retention and over-credit rejection. Tests have been discovered but not yet executed against the fixed checkpoint.

Remaining checks: final lint/types/build after fixes; billing and role browser journeys; dedicated 400-order browser workload; rolling fixture checks; live HTTPS smoke tests and retention/access proof. Local, pushed and deployed verification remain separate.
