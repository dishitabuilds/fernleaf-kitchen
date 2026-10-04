# Fernleaf review handoff

Takeover: 4 October 2026, clean `main` at Antigravity `fbfc992c7aa77849f82d6e220e4aef2ac789e53b`. Repository: [dishitabuilds/fernleaf-kitchen](https://github.com/dishitabuilds/fernleaf-kitchen), public verified. Final release commit/push and deployment are pending the checks below; this document does not claim a completed live release.

## What changed

Antigravity added billing models/migration/API/UI, role dashboard queries/UI and staff management in `fbfc992`. Existing Phase 0-3 code and recorded acceptance tests were retained. Inspection found no unrelated uncommitted user changes.

Release work fixes multi-order invoice membership, actor/payload-bound billing replay, exact current-balance settlement, delivered shortage credit limits, automatic invoiced cancellation credit, immutable invoice billing snapshots and paid history. Staff changes preserve an active Admin and prevent stranding assigned Drivers. All four landing pages now show useful role summaries. Realistic append-only fixtures and startup/IST-midnight jobs maintain review-day work; the seed no longer invoices arbitrary existing orders. External maintenance is prepared for a sleeping-host fallback. Original late-order, combination, transfer and logistics decisions are preserved.

## Requirement gate

| Must area | Implementation / check state |
| --- | --- |
| Four exact accounts and access | Implemented; baseline API/browser evidence, expanded role checks pending |
| Catalogue/options/references/menu/preview/pricing | Existing implemented features preserved; baseline 143-test regression passes |
| Companies/employees/calendars/settings | Implemented; recorded domain/flag/timezone tests preserved |
| Orders/combinations/snapshots/cutoff/manual processing | Implemented; baseline tests pass; late-order policy unchanged |
| Kitchen/dispatch/mobile own-today Driver | Implemented; fresh isolated 400-order API check passes; final browser run pending |
| Billing/payment/adjustments/staff/dashboard | Release fixes implemented; focused and final regression results pending |
| Real current-day fixture jobs | Three PostgreSQL/API fixture tests and six external-maintenance tests pass |
| README/setup/data model/decisions | Updated alongside work; final verification/URL record pending |
| Public repo / live app / two-week availability | Public repo verified; release push/CI and production gates pending |

Portions, employee CSV import and delivery photos are unfinished Should/optional work deferred by the authorised narrower scope. No functioning enhancement was removed. Decorative charts and broad refactors were omitted to preserve deadline/reliability. Original assignment PDF and submission correspondence are absent and have not been independently checked. The hiring form is excluded and has not been submitted.

## Actual checks and persistence

See [release-verification.md](release-verification.md) for exact commands/results and isolated databases. Initial typecheck/build and 143 PostgreSQL/API tests pass; initial lint exposed 16 Phase 4 errors being fixed. Fresh 400-order API check passes on a separate workload database. Fixture and maintenance suites pass 3/3 and 6/6 respectively. Production browser, billing concurrency/final regression and live HTTPS checks remain open until their results are recorded.

Ten additive migrations include the corrected invoice relation/snapshot/history guards. Local isolated databases are migrated; the existing application database and user data have not been reset. Production migration/seed/job status: not run. Production URLs: not verified. Vercel is signed in; Railway trial is expired. Render Free fallback manifest and authenticated GitHub maintenance workflow are prepared, but provider/account access and configuration are not verified.

## Reviewer steps

All four credentials use `Test@1234`: `admin@test.com`, `kitchen@test.com`, `dispatch@test.com`, `driver@test.com`. Run README setup, migrations and seed. Admin sees financial/demand summaries, can preview employee menu, create an accepted-quote order and use a reasoned late placement for today. Kitchen completes every combination; Dispatch assigns the Driver, marks ready and departs; Driver at phone width delivers its own current-day group with an optional note. Billing selects Confirmed/Delivered orders from one captured company, creates an invoice, records exact outstanding settlement and applies reasoned delivered shortage credit. Cancelling an invoiced Confirmed order adds a full remaining internal credit without changing gross/membership/payment history.

Run `pnpm db:seed` or `pnpm --filter @fernleaf/api seed:demo` to append current-day scenarios safely. Set `DEMO_FIXTURES_ENABLED=true` only for the synthetic assignment deployment. See [demo-fixtures.md](demo-fixtures.md) for idempotency, weekend data and jobs. Retention must extend at least 14 days after actual submission; verify account quota and database expiry, inspect health/logins/jobs daily, and retain resources through that window. Sleeping-host cold starts and external scheduling are documented deployment limitations, not guarantees.
