# Fernleaf Kitchen

An internal kitchen operations application for companies buying individual boxed meals for their employees. Staff enter orders, Kitchen prepares meals, Dispatch organises deliveries, and Driver completes assigned drops. Companies owe the money; employees have no login or payment flow.

The mandated stack is **Next.js + NestJS + Prisma**. This repository uses TypeScript, pnpm workspaces and PostgreSQL. The frontend calls the backend over HTTP; Prisma and authoritative business rules belong to NestJS.

## Current progress and sources

**Phase 0's local foundation is implemented and verified:** workspace, PostgreSQL migrations, health, frontend HTTP connection, authentication, permissions, four demo accounts and role/settings shells. Lint, type-check, 20 backend tests, 10 browser tests, production builds, the development command and a production-mode API Docker container pass. Deployment files are prepared; the required hosted gate is **blocked by pending Vercel/Railway access**. Later phases have not started. Settings access does not satisfy editable calendars/cutoffs, and role shells do not satisfy operational dashboards.

The complete [Heizen-Implementation-Blueprint.md](Heizen-Implementation-Blueprint.md) was read before implementation. The original assignment PDF and submission email/screenshots are absent from this workspace and have **not** been checked. Requirement numbering, the 4 October 2026 11:59 PM IST deadline, public-repository requirement and submission method below come from the blueprint; comparison with the original sources remains pending. No attachment from another conversation is assumed accessible. [AGENTS.md](AGENTS.md) and [rules.md](rules.md) govern future work.

The user authorised normal phase commits/pushes and creation of this project's GitHub repository. Hosting access is pending. **No deployment or production database has been verified.** Phase 0 requires deployed browser sign-in, rejected unauthorised API access and production API-to-database connectivity; its deployed gate remains open.

| Delivery record | Status |
| --- | --- |
| GitHub URL / visibility | [dishitabuilds/fernleaf-kitchen](https://github.com/dishitabuilds/fernleaf-kitchen), verified public |
| Branch / phase commit / verified push | `main`; [`d8aa0b6`](https://github.com/dishitabuilds/fernleaf-kitchen/commit/d8aa0b66f448ae83c71d3084a4164d505fbb21b1) pushed and verified against `refs/heads/main` on 3 October 2026 |
| Web / API live URLs | Not deployed; hosting access pending |
| Local checks | PostgreSQL, lint, type-check, 20 backend tests, 10 browser tests, production builds, `pnpm dev` and local Docker smoke pass |
| GitHub Actions | [Phase checks](https://github.com/dishitabuilds/fernleaf-kitchen/actions/runs/37113060316) **PASS** for `d8aa0b6`: clean Linux install, lint, type-check, PostgreSQL tests, builds and browser checks |

## Scope and four roles

All eleven blueprint functional areas are Musts. Portions and employee CSV import are explicit Shoulds. Delivery photo is optional within the required driver workflow. Only Phase 0 is authorised so far.

| Role | Responsibility | Phase 0 surface |
| --- | --- | --- |
| Admin | Configure catalogue/pricing, companies/employees, staff/settings; manage orders, overrides and billing | Authenticated landing shell and read-only settings; protected mutation probe is tested through HTTP |
| Kitchen | Prepare active confirmed orders and monitor readiness/risk | Authenticated Kitchen shell |
| Dispatch | Assign drivers, check grouped-drop readiness and record departure | Authenticated Dispatch shell |
| Driver | Read/complete own assigned drops for kitchen-local today | Authenticated Driver shell; deliveries are planned |

Out of scope: customer storefront, unaffiliated customers, employee payments/refunds, extra order types, automatically included free options, date-based menus, ordering pauses, exports, accounting/recipe integrations, coupons, tax, delivery fees/zones, general audit-log product, real email/notifications and marketing banners. The required order timeline remains in scope.

## Prerequisites and local setup

| Component | Pinned selection |
| --- | --- |
| Node.js | 24.10.0 local / API Docker target |
| pnpm | 10.34.6 |
| Next.js / React | 16.3.8 / 19.3.0 |
| NestJS | 12.1.2 |
| Prisma | 7.10.0 |
| TypeScript | 5.9.3 |
| PostgreSQL | 17.6-bookworm Compose image |

Manifests and the committed lockfile are authoritative. Prerequisites are the Node/pnpm versions above, Git, Docker Desktop running Linux containers for local PostgreSQL, and free ports 3000/3001/5432. Docker being installed does not mean its daemon is running. A separate PostgreSQL instance is supported through `DATABASE_URL`; integration checks require a separate test database.

If pnpm is missing, install the pinned version after installing Node:

```powershell
npm install --global pnpm@10.34.6
node --version
pnpm --version
```

The implementation workstation used an ignored temporary pnpm tool cache; the project does not assume pnpm was installed globally there. Reviewers should use the normal installation above.

From the repository root in PowerShell:

```powershell
pnpm install --frozen-lockfile
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
pnpm db:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Edit the copied environments first. Real `.env` files are Git-ignored. The example database credentials are disposable local-development values; provider secrets belong in provider variables. `db:migrate` runs `prisma migrate deploy` and applies committed migrations without schema generation or reset. For an intentional new schema change, use `pnpm --filter @fernleaf/api migrate --name change-name` (`db:migrate:dev` is the interactive alias); inspect the target and any drift/reset prompt first. Production uses only `migrate:deploy`. The seed inserts missing demo staff without resetting reviewer edits to existing accounts.

`docker compose stop` stops local PostgreSQL while preserving its named volume; `pnpm db:up` restarts it. The test-database init script runs on a new volume only. If using a previously created volume without `fernleaf_test`, create that separate database explicitly rather than deleting the development volume.

| URL | Purpose |
| --- | --- |
| `http://localhost:3000` | Next.js staff application/login |
| `http://localhost:3001/api/v1/health` | Direct NestJS health/database check |
| `http://localhost:3000/api/v1/health` | Same API through the Next.js HTTP rewrite |

Health success is `{ "status": "ok", "database": "connected", "service": "fernleaf-api" }` after a real database query.

For the disposable database from the example, first apply migrations to its separate test database. The process override below is removed after migration, so subsequent commands load the normal API environment:

```powershell
$env:DATABASE_URL = 'postgresql://fernleaf:local_development_only@localhost:5432/fernleaf_test'
pnpm --filter @fernleaf/api migrate:deploy
Remove-Item Env:DATABASE_URL
```

Verification commands from the root:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test` aliases `pnpm test:integration`; normally run either rather than repeat both. Integration tests clean/reseed only the guarded `_test` database. Browser checks use the main synthetic development database and production builds; their Playwright configuration starts API/web servers automatically, or reuses running local servers. Install/build/migrate/seed first. Record actual results below; having a command listed does not mean it passed.

Web type-checking runs `next typegen` first so it works on a fresh checkout. Next.js generates `next-env.d.ts` and route definitions locally; those build artifacts are not committed.

## Environment variables

Placeholder examples are in `apps/api/.env.example` and `apps/web/.env.example`. Never publish infrastructure passwords, session cookies or downloaded provider environment files.

| Location / variable | Purpose |
| --- | --- |
| API `DATABASE_URL` | Prisma PostgreSQL connection string; production secret |
| API `TEST_DATABASE_URL` | Separate database used for integration checks; never production |
| API `WEB_ORIGIN` | Exact permitted web origin for mutation-origin validation; local `http://localhost:3000`, production HTTPS origin |
| API `PORT` | 3001 locally; provider-injected listening port on Railway |
| API `NODE_ENV` | Development/test/production behaviour; production uses Secure cookies |
| API `SESSION_TTL_HOURS` | Session lifetime, default/example 12 hours |
| Web `API_INTERNAL_URL` | Server-side backend origin for the `/api/v1` HTTP rewrite; no duplicate `/api/v1` prefix |
| Browser tests `E2E_BASE_URL` | Optional already-running web origin; disables Playwright-managed local servers for that run |

The browser uses relative `/api/v1` URLs. No database secret or session implementation is exported as `NEXT_PUBLIC_*`. Production cookies are Secure, HttpOnly and SameSite, scoped to the staff web host through the rewrite. Hosted smoke tests must check cookie forwarding and origin/CSRF handling on the actual domains.

## Architecture and module responsibilities

```mermaid
flowchart LR
    Browser[Staff browser or driver phone] -->|Same-origin HTTP /api/v1| Web[Next.js rewrite]
    Web -->|HTTP| API[NestJS controllers and services]
    API --> Guards[Session and central permission guards]
    Guards --> Prisma[Prisma PostgreSQL adapter]
    Prisma --> DB[(PostgreSQL)]
    Contracts[Public contracts package] -. API types .-> Web
    Contracts -. API types .-> API
```

The rewrite is transport only. It does not resolve prices or read Prisma. NestJS validates inputs, authenticates against current database sessions/staff, checks permissions and returns public contracts. Private responses must not be publicly cached.

Current API routes all use `/api/v1`:

| Route | Access and behaviour |
| --- | --- |
| `GET /health` | Public; real PostgreSQL probe |
| `POST /auth/login` | Public, exact `Origin` required, strict email/password DTO; sets opaque cookie and returns identity/permissions/CSRF/expiry |
| `GET /auth/me` | Session and `session.read`; returns current identity/permissions/CSRF/expiry |
| `POST /auth/logout` | Session and `session.logout`, exact origin and `x-csrf-token`; revokes session and returns 204 |
| `GET /settings` | Admin `settings.read`; fixed `{timezone:'Asia/Kolkata',currency:'USD',phase:0}` |
| `POST /settings/check-access` | Admin `settings.manage`, exact origin and CSRF; returns `{allowed:true}` and writes no configuration |

Undeclared route access policies fail closed. Future business capability names are already in the central map, but their declaration does not create those endpoints or implement resource ownership/date checks. Errors have `code`, `message`, optional `fieldErrors` and `requestId`; `X-Request-Id` identifies requests and API responses use `Cache-Control: no-store`.

| Folder | Responsibility / status |
| --- | --- |
| `apps/web` | App Router, login, role/settings shells, typed HTTP client |
| `apps/api` | NestJS auth/access, health/database and settings access shell |
| `apps/api/prisma` | Staff/session schema, committed migration and idempotent seed |
| `packages/contracts` | Public roles, permission identifiers, request/response contracts |
| `tests/integration` | Real PostgreSQL/HTTP auth/access checks |
| `tests/e2e` | Browser login/role/logout and rewrite smoke checks |
| `docs` | [Diagrams](docs/diagrams.md) and [deployment runbook](docs/deployment.md) |
| `Dockerfile.api`, `railway.json` | Repository-root API deployment foundation |

Planned backend modules: catalogue/menu/pricing resolve visibility/prices; companies/employees own customer configuration; orders own quotes/snapshots/lifecycle/timeline; kitchen owns prep units/readiness; dispatch owns drops/driver actions; billing owns invoices/payments/credits; settings/calendar own cutoff rules; jobs/demo own catch-up/rolling fixtures; dashboards own role-scoped aggregates. Controllers stay thin; database access remains in the API.

## Actual Phase 0 data model

Only staff identities and sessions exist in Phase 0. Customer employees will be a separate identity type and will not reuse `StaffUser`.

```mermaid
erDiagram
    STAFF_USER ||--o{ SESSION : has
    STAFF_USER {
        string id PK
        string email UK
        string displayName
        string passwordHash
        enum role
        boolean active
    }
    SESSION {
        string id PK
        string tokenHash UK
        string userId FK
        datetime expiresAt
    }
```

Each account has one role. Normalized email is unique. Both IDs are UUIDs. Only the SHA256 hash of a random opaque cookie token is stored. Sessions have indexes on user/expiry and cascade when their staff user is deleted. Staff has creation/update timestamps; sessions have creation/expiry timestamps. Expiry, current role and active status are checked on protected requests; logout revokes the session. The final migration/schema is authoritative.

[Future ER and workflow diagrams](docs/diagrams.md) are explicitly planned. Future guarantees include one non-null company per employee, same-company owner membership, unique normalized domains/SKUs, one item/tier price, one prep unit per combination, exact company/address/time drop keys and one invoice membership per order. Those are **not Phase 0 tables or verified constraints**.

## Decisions and preserved business rules

| Area | Decision / reason / implementation boundary |
| --- | --- |
| Database | PostgreSQL for relationships, constraints and transactions. Prisma belongs to NestJS. SQLite does not substitute for PostgreSQL concurrency evidence. |
| Authentication | scrypt password hashes; random opaque session tokens hashed in PostgreSQL, expiry and logout invalidation. HttpOnly cookies keep tokens out of browser JavaScript. |
| CSRF | Exact mutation origin plus CSRF token. CORS alone is insufficient. Login and authenticated mutation policies need direct HTTP evidence. |
| Permissions | Central capability map enforced by NestJS against current role. Hidden buttons are presentation. Driver ownership/current-date policies follow with real drops. |
| Frontend | HTTP rewrite keeps same-origin cookies and the required Next-to-Nest boundary. Simple Phase 0 shells precede real workflow forms/query libraries. |
| Money — planned Phase 1 | USD integer cents, exact BigInt/rational intermediate arithmetic. Derived unit prices round upward to five cents; explicit overrides retain entered cents. |
| Time — planned Phase 1/2 | Asia/Kolkata calendar dates/today/cutoffs; UTC actual instants; injectable clock for boundary tests. |
| Snapshots — planned Phase 2 | Placement freezes purchase/company/delivery values; edits/transfers cannot rewrite history. Placed revisions require accepting a fresh quote. |
| Transactions — planned domain work | Conditional versions/state, uniqueness and short serializable transactions with bounded retries for readiness/cutoff/invoice aggregates. Session persistence is not proof of future race safety. |
| Hosting | Vercel web + Railway API/PostgreSQL, repository-root API Docker build. Access pending; no paid purchase, deployment or hiring-form submission claimed. |

The rules below are **planned blueprint behaviour**, not implemented Phase 0 features:

- **Pricing:** choose company tier or default tier; explicit price wins within that tier, otherwise valid cost/reference derivation, otherwise missing. Missing company-tier items do not fall back to another tier. Reject reference cycles. For rational `N/D` cents, rounded derived cents = `5 * ceil(N / (5 * D))`: $2.11 → $2.15; $2.10 remains $2.10. Missing-price options are unavailable; hide dishes with no price or no priced option in a required group.
- **Combinations:** required groups select exactly one option, optional groups zero/one, per combination. Reject foreign-group/duplicate selections and non-positive/fractional quantities; canonical duplicate combinations merge. Combination quantities equal line quantity; duplicate dish lines cannot bypass minimum quantity. Six $8.80 meals and four $9.20 meals total $89.60, producing two prep units of six/four meals.
- **Calendars/cutoff:** company calendar allows delivery dates. Count backwards from before delivery across kitchen working days/holidays only, then use kitchen cutoff time; zero days uses the delivery date. Wednesday 7 October 2026, two days, 16:00 → Monday 5 October 16:00; a kitchen Monday holiday shifts it to Friday 2 October if weekends are closed. At `now >= cutoffAt`, ordinary editing/cancellation locks even if the job has not run.
- **Processing:** scheduled, startup catch-up and Admin/manual processing share an idempotent service. Due Draft cancels; due Placed confirms original amounts, creates unique work/drop membership and records events. Manual action rejects future cutoff. Policy changes cannot reopen processed dates; unprocessed policy changes recompute/catch up. Company-calendar edits cannot silently invalidate live orders.
- **Kitchen:** only active Confirmed orders create work, one unit per distinct combination on a line. Pending → Started → Done; direct completion records both times. Earliest unit start is order start; all units must be Done for readiness, using latest completion. Planned dispatch readiness = delivery minus travel minutes; kitchen readiness = another 30 minutes earlier. Unfinished work is late after its planned time, at risk within a configurable 15 minutes, and an exception if timing is missing. Repeated transitions cannot duplicate work.
- **Orders/drop states:** Draft, Placed, Confirmed, Delivered, Cancelled, Rejected are commercial states. Exact company, canonical actual address and delivery instant group drops, independent of employee/packaging. Drop progression: Awaiting kitchen → Kitchen ready → Dispatch ready → Out for delivery → Delivered. Departure requires driver; delivering atomically updates active members. Driver scope comes from session ID and current kitchen date. On-time = actual delivery ≤ departure-captured target; undelivered timing is unknown.
- **Overrides:** explicit Admin action/reason/timeline. Before departure, address/time changes atomically regroup/recalculate readiness, preserving completed prep. After departure, corrections are drop-wide. Delivered history retains actual times and original target. Cancellation removes undelivered active work; delivered shortages become exceptions/credits.
- **Billing:** currently Confirmed/Delivered orders without invoice are eligible; Cancelled/Rejected excluded from new invoices. Selected orders belong to one company and can be claimed once transactionally. Gross = original immutable order totals. Invoiced cancellation adds full internal credit; delivered shortage may add reasoned partial credit. Credits cannot exceed the order amount or duplicate on retry. Mark-paid records settlement of the current outstanding amount. Net due = gross − credits − payments; negative means company credit. Issued totals/membership and paid history stay historical after later credits.

## Exact dashboard definitions — planned Phase 4

Phase 0 landing pages show identity, role and navigation/access checks. They **do not display operational figures**. The following is the future backend-query contract; zero applies only to an empty query, not an unimplemented feature.

Operational grouping uses **delivery date in Asia/Kolkata**, not created-at date. Cancelled/Rejected orders and empty/cancelled-only drops are excluded from active work. Each future card links to underlying records. Empty counts/sums = zero; zero-denominator ratios = **N/A**; missing data = explicit exception.

| Role / figure | Exact calculation and missing-data treatment | Purpose / intentionally omitted |
| --- | --- | --- |
| Admin: committed orders/meals | Selected delivery date: count Confirmed/Delivered orders; meals = sum their line quantities. Same-date Draft and Placed counts are separate. Cancelled/Rejected excluded. Missing quantities are exceptions. | Committed vs tentative demand; no profit, growth or forecast. |
| Admin: uninvoiced value | **All dates**: sum immutable `totalMinor` for currently Confirmed/Delivered orders without invoice membership. Cancelled/Rejected excluded. Missing totals are reconciliation exceptions. | Exact billing queue; no current-catalogue repricing. |
| Admin: invoice balance | **All invoices/all dates**: each balance = gross − credits − paid amount. Receivables = sum `max(balance,0)`; company credit = sum `max(-balance,0)`, displayed separately. Include paid history with later credits; cancellation never erases an issued invoice. Missing amounts are exceptions. | Reconcile actual balances; no payment processing/refund forecast. |
| Kitchen: remaining units/meals by station | Selected date: Pending/Started units on active Confirmed orders. Count units; separately sum combination quantities. Exclude Done and Delivered/Cancelled/Rejected orders. Null station → Unassigned; missing quantities → exception. | Distinguish units from meals; no billing data or invented throughput. |
| Kitchen: late / at risk / missing plan | Same unfinished-unit scope. Late: `now > plannedKitchenReadyAt`. At risk: `0 <= plannedKitchenReadyAt-now <= riskThreshold` (planned default 15 minutes). Missing plan enters separate exception bucket, neither timing bucket. | Identify action needed; no favourable assumed timing. |
| Dispatch: state counts | Selected drop delivery date; nonempty drops with active Confirmed members (Delivered members for completed history). Count separately Awaiting kitchen, Kitchen ready, Dispatch ready, Out for delivery, Delivered. Missing date is an exception excluded from date cards. | Drop-level queues; employees/orders in one drop do not multiply count. |
| Dispatch: unassigned | Selected-date nonempty drop, no driver, status Awaiting kitchen/Kitchen ready/Dispatch ready/Out for delivery. Exclude Delivered/empty. Out for delivery with null driver is also a state exception. | Assignment queue; its overlap with state cards is labelled. No utilisation estimate. |
| Driver: own route/next stop | Session driver ID; **current** kitchen delivery date. Active valid drops have Confirmed members and are not Delivered; completed valid drops retain Delivered members. Sort `deliveryAt`, stable ID. Next stop = first active item. None = no remaining stop. Missing time → exception list outside ordered route. | Own-today actions; no other-driver/billing data, future-day substitution or route optimisation. |
| Driver: completion today | Own valid Delivered drops for current kitchen date / all own valid active/completed drops for that date; display both counts. Exclude empty/cancelled-only drops; zero denominator = N/A. | Drop-level route progress, one count per grouped delivery. |
| Driver: on-time today | Own Delivered drops for current kitchen date with valid captured target and actual time: numerator actual ≤ departure target; denominator all such eligible delivered drops. Missing target/actual → separate exception, excluded from ratio; no eligible delivered = N/A. Undelivered excluded. | Reproducible punctuality, no grace period or favourable missing-data assumption. |

## Requirement checklist and priorities

Numbers follow the blueprint's PDF mapping; original-source verification is pending. Definitions/plans are not implementation.

| Assignment area | Priority / phase | Current status | Verification / remaining gap |
| --- | --- | --- | --- |
| Accounts/access | Must / 0, 4 | Foundation implemented and locally verified | 20 PostgreSQL/API and 10 browser tests pass; staff CRUD/resource scoping later |
| 4.1 Catalogue/references | Must / 1, 2 | Not started | Dish/option fields/groups, portion-size reference, deactivation/snapshots |
| 4.1 Portions | Should / 6 | Deferred until Must gate | Complete group-wide size/surcharge matrix and snapshot tests |
| 4.2 Menu | Must / 1 | Not started | Active visibility, company hiding, secret links, employee preview |
| 4.3 Pricing | Must / 1 | Not started | Tier matrix; precedence/missing/cycle/rounding tests |
| 4.4 Companies | Must / 1 | Not started | Domains, addresses/billing, owner, calendars/defaults |
| 4.5 Employees | Must / 1 | Not started | One company, transfer/owner rules, flags/allergy guidance |
| 4.5 CSV import | Should / 6 | Deferred until Must gate | Partial success/row errors, duplicate policy and size limit |
| 4.6 Orders/cutoff | Must / 2 | Not started | Quotes/snapshots/lifecycle/timeline, filters/pagination, jobs/overrides |
| 4.7 Kitchen | Must / 3 | Role shell only | Real units/board/risk/readiness, force-completion and races |
| 4.8 Dispatch/Driver | Must / 3 | Role shells only | Exact groups, drivers/transitions, mobile own-today delivery/timing |
| Delivery photo | Optional / 6 | Not started | Persistent storage if added; delivery works without photo |
| 4.9 Billing | Must / 4 | Not started | Unique invoice claims/payments/credits, concurrency/reconciliation |
| 4.10 Settings | Must / 0, 1 | Access shell implemented; API permissions tested | No editable persisted calendar/cutoff/reference configuration |
| 4.11 Dashboards | Must / 4 | Role shells; definitions above | Real aggregates and filtered-record reconciliation |
| Non-functional rules | Must / every phase; 5 gate | Auth/validation/access tests and static/build checks pass | Money/calendar/combinations, domain concurrency, pagination, 400-order evidence later |
| Submission/review | Must / 0, 5, 7 | Public repo verified; deployment files prepared | Commit/push pending; hosting/live smoke, sources/form, rolling fixtures and 14-day availability open |

Later scope is deferred by the authorised phase boundary, not waived; no Must was downgraded. Optional saved filters, shortcuts and decorative visuals wait until Must workflows/tests pass.

| Phase | Current status | Acceptance gate |
| --- | --- | --- |
| 0 Foundation | Local implementation verified; hosted gate blocked | Deployed login, unauthorised API rejection and production database connection |
| 1 Rules/configuration | Not started | Missing/hidden items excluded, derived rounding correct, company/owner/domain rules enforced |
| 2 Orders/cutoff | Not started | Snapshots survive catalogue edits; cutoff confirms/cancels exactly once |
| 3 Fulfilment/delivery | Not started | Valid cross-role journey and invalid/concurrent transitions cannot duplicate work |
| 4 Billing/dashboards | Not started | Concurrent invoice requests cannot double-bill; figures reconcile to filtered records |
| 5 Must release | Not started | All Must acceptance checks pass on deployed app, including access/current data/400-order board |
| 6 Should/optional | Not started; portions then CSV | Must regression suite remains green after each complete enhancement |
| 7 Submission | Not started | Fresh-browser/mobile review, accurate public/live links and actual submission/14-day availability |

## Interpretations and assumptions

Explicit requirements as represented in the blueprint include four accounts/roles, Next/Nest/Prisma, all eleven Must areas, backend rules, immutable history, exact money, calendars, unique invoicing, current-day Driver data and two-week review availability. Compare those to the original assignment/email when supplied.

Our choices: PostgreSQL/pnpm/TypeScript; opaque sessions instead of JWT; USD from dollar examples; Asia/Kolkata kitchen zone; exactly one selection in required groups, zero/one in optional groups; Admin authors configuration/orders/billing; 15-minute risk threshold; public-provider domain denylist without ownership verification; allergies/preferences as warnings rather than automatic filtering; internal credits preserving issued invoices; drop-wide post-departure corrections; portion surcharges independent of tiers. Only applicable foundation decisions are implemented in Phase 0. Later deviations need reasons and evidence.

## Tests and actual evidence

Results recorded on 3 October 2026 for this Phase 0 checkout. No future business-rule test or deployment is counted as passed.

| Check | Evidence |
| --- | --- |
| `pnpm install` / lockfile | PASS; compatible pinned packages installed and lockfile created |
| `pnpm db:up` | PASS; PostgreSQL 17.6 Compose service healthy |
| `pnpm db:generate` | PASS; Prisma 7.10 client generated |
| Main/test migrations and `pnpm db:seed` | PASS; committed auth migration applied to `fernleaf` and `fernleaf_test`; four users seeded |
| `pnpm lint` | PASS; zero warnings allowed |
| `pnpm typecheck` | PASS; contracts/API/web |
| `pnpm test` | Alias for integration suite; use the result below, not a separate test claim |
| `pnpm test:integration` | PASS; 20 tests, one suite, 7.192 seconds, real PostgreSQL |
| `pnpm test:e2e` | PASS; all 10 real Chromium browser tests in 18 seconds after fixing an ambiguous alert locator |
| `pnpm build` | PASS; contracts, compiled NestJS API and Next.js production output |
| GitHub Actions clean checkout | PASS for phase commit `d8aa0b6`; frozen-lockfile install, generation, lint, type-check, migrations, tests, builds and browser suite on Ubuntu/Node 24.10.0 |
| Direct unauthorised API request | PASS in integration suite: 401 without session; 403 for authenticated non-Admin settings access |
| `docker build --file Dockerfile.api --tag fernleaf-api:phase0 .` | PASS; pinned API image builds, generates Prisma and compiles contracts/API |
| Local production-mode API container | PASS; non-root `node` user, committed-migration startup, real PostgreSQL health on localhost:3002 and anonymous settings 401. Synthetic local database, not a production deployment/database. |
| `pnpm dev` | PASS; compiler watch reports zero errors, Next starts, direct API/proxied health match expected JSON and `/login` returns 200 |
| Deployed login / production API-to-DB | **Blocked by hosting access; not run** |
| Pricing/cutoff/combinations/timing | Not run; rule implementations start in phases 1–3 |
| Invoice/domain concurrency/full role journey | Not run; phases 2–5 |
| 400-order kitchen performance | Not run; no order/board model. No latency claim. |

The 20 backend cases cover database-backed health/cache/request IDs, all four login roles, email normalization, password/session hashing, invalid credentials/DTO fields, login origin, unauthenticated/forbidden access, CSRF/origin, logout/revocation, expiry, current role/active checks, sign-in rotation, seed preservation and production cookie flags. The 10 browser cases verify every role's login/refresh/logout, invalid credentials, Admin settings and direct non-Admin permission denial through the Next.js rewrite. The Driver shell passed at 390 × 844 with no horizontal overflow; its saved screenshot was inspected. This verifies the shell, not the later delivery workflow.

Jest 30/NestJS 12 ESM interoperation uses `--experimental-vm-modules` automatically in the test script; Node emits its expected experimental warning. The production API does not need that flag. On this agent's restricted Windows sandbox, `tsx` seed initially hit `uv_os_get_passwd`; the normal Windows user run succeeded without application changes.

Planned pure tests: weekend/holiday/zero-day/exact-boundary cutoff; company/default tier, missing prices, overrides, cycles and five-cent rounding; per-combination groups/sums/MOQ/duplicates; readiness/risk timing. Planned PostgreSQL cases: snapshot stability after catalogue edits/employee transfer, concurrent/repeated cutoff, final-unit readiness races, invoice uniqueness/rollback/credit limits, own-driver/date restrictions, invalid departure/delivery, atomic grouped updates and employee flags against crafted requests. The 400-order check will record dataset, filtering/pagination/query counts, readiness correctness and measured API/UI results. These are acceptance plans, not passing Phase 0 tests.

## Demo accounts and reviewer walkthrough

These intentionally public credentials are for synthetic staff only; the database stores password hashes.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@test.com` | `Test@1234` |
| Kitchen | `kitchen@test.com` | `Test@1234` |
| Dispatch | `dispatch@test.com` | `Test@1234` |
| Driver | `driver@test.com` | `Test@1234` |

Phase 0 walkthrough: run local setup, open the web app, sign in with each account in a fresh session, inspect the correct shell (Admin `/dashboard`, Kitchen `/kitchen`, Dispatch `/dispatch`, Driver `/today`), refresh to retain the session, open Admin's read-only `/settings`, then sign out. The UI does not offer a settings mutation. An unauthenticated `/api/v1/auth/me` request returns 401; a signed-in non-Admin `/api/v1/settings` read or `/settings/check-access` POST is forbidden. The HTTP probe requires valid origin/CSRF to test permission specifically. There is no order, kitchen, delivery or invoice journey yet.

The future journey is Admin quote/place → real passed-cutoff confirmation → Kitchen completion → Dispatch assignment/departure → Driver delivery → Admin invoice/payment/credit. **Manual past-cutoff processing is not implemented in Phase 0.** Phase 2 will add an Admin action selecting a delivery date whose kitchen cutoff has already passed, sharing the scheduler service and returning confirmed/cancelled/skipped/failed counts. It rejects future cutoff; reviewers will not need to change the clock.

Only four staff accounts are seeded now. Future scenarios: at least three companies, 20–30 employees, 12–15 dishes/options/groups, three tiers, hidden/secret categories, missing-price examples, stations, coherent past/today/next-week orders and unpaid/paid/credited invoices. A separate fixture builder uses scenario/date unique keys. Startup catch-up and kitchen-midnight jobs append missing current-day fixtures without resetting reviewer edits; a seven-day demo company/calendar keeps valid Driver work on weekends. Ready/out-for-delivery own-today drops have clearly labelled synthetic prior history. **Rolling fixtures and those scenarios are planned for Phase 4/5, not deployed.**

## Deployment and two-week availability

[Deployment runbook](docs/deployment.md) covers monorepo settings, variables, migration/seed order, health, HTTPS cookies/origins, logs and recovery. Hosting access is pending; no provider project, production database, live URL or production cookie success is claimed.

The target is Vercel web and an always-running Railway API/PostgreSQL in one project/region. Verify account eligibility/current limits and budget before provisioning. Future scheduled jobs need an awake process/catch-up/logs; sleeping-host fallback needs a separately scheduled authenticated trigger and cold-start tests. Paid purchases and hiring-form submission are not authorised by commit permission.

Keep the deployment live at least **14 days after actual submission**. If submitted on 4 October 2026, the corresponding earliest end is 18 October at the same time. Record actual submission/retention timestamps, funding/quota, backups and ownership when deployed; check health and all-role login during review. Do not rely on unverified trial expiry. The actual Google Form/source email is unavailable and has not been submitted.

## Resume point and next phase

Local Phase 0 verification is finished. The phase commit is pushed to verified public `dishitabuilds/fernleaf-kitchen` on `main`, its full hash matched the remote branch, and GitHub CI passed. Hosting access remains the deployed-gate blocker; configure the prepared services and run the hosted acceptance checks when access is available. The subsequent documentation commit records this verified phase result; use `git log` for the latest documentation hash.

Stop after the Phase 0 report until another phase is authorised. **Phase 1 is next:** money/calendar helpers and tests, catalogue/options/reference data including portion sizes, menus/tiers, companies/employees and persisted editable settings. Keep the Phase 0 deployed gate visible until live smoke tests pass. Fresh conversations should read rules/README, inspect Git state and consult relevant blueprint sections before editing.
