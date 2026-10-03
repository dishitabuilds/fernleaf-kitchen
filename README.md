# Fernleaf Kitchen

An internal kitchen operations application for companies buying individual boxed meals for their employees. Staff enter orders, Kitchen prepares meals, Dispatch organises deliveries, and Driver completes assigned drops. Companies owe the money; employees have no login or payment flow.

The mandated stack is **Next.js + NestJS + Prisma**. This repository uses TypeScript, pnpm workspaces and PostgreSQL. The frontend calls the backend over HTTP; Prisma and authoritative business rules belong to NestJS.

## Current progress and sources

**Phase 1 configuration and the final concurrency fix are implemented and locally verified.** It adds exact money/calendar rules, catalogue/options/groups, reference administration, menus and employee previews, tiers and a bulk price matrix, companies/addresses/domains, employees/transfers, and persisted editable kitchen settings. After adding retry backoff, lint, type-check, 65 backend/rule tests, 14 browser tests, production builds and the rebuilt API container smoke all pass. See [Phase 1 evidence and rules](docs/phase-1.md). Final GitHub synchronization/CI is recorded separately below.

Phase 0's authentication/HTTP/database foundation was verified locally, including four role accounts, 20 backend tests, 10 browser tests and the API Docker smoke. Its hosted gate remains **blocked by pending Vercel/Railway access**. Role landing pages still do not implement operational dashboards. Orders, fulfilment and billing remain later phases.

The complete [Heizen-Implementation-Blueprint.md](Heizen-Implementation-Blueprint.md) was read before implementation. The original assignment PDF and submission email/screenshots are absent from this workspace and have **not** been checked. Requirement numbering, the 4 October 2026 11:59 PM IST deadline, public-repository requirement and submission method below come from the blueprint; comparison with the original sources remains pending. No attachment from another conversation is assumed accessible. [AGENTS.md](AGENTS.md) and [rules.md](rules.md) govern future work.

The user authorised normal phase commits/pushes and creation of this project's GitHub repository. Hosting access is pending. **No deployment or production database has been verified.** Phase 0 requires deployed browser sign-in, rejected unauthorised API access and production API-to-database connectivity; its deployed gate remains open.

| Delivery record | Status |
| --- | --- |
| GitHub URL / visibility | [dishitabuilds/fernleaf-kitchen](https://github.com/dishitabuilds/fernleaf-kitchen), verified public |
| Branch / phase commit / verified push | `main`; Phase 1 commit [`a44792c`](https://github.com/dishitabuilds/fernleaf-kitchen/commit/a44792cf849bce22cfd42c4095c2c3ac141ab891) pushed on 3 October 2026; its full hash matched remote `main` after push. A following documentation commit records this evidence. |
| Web / API live URLs | Not deployed; hosting access pending |
| Local checks | Phase 1 gate PASS: missing/hidden menu items, exact derivation and company/owner/domain rules verified; complete evidence below |
| GitHub Actions | Phase checks PASS for `a44792c` and `cee9856`; [rerun](https://github.com/dishitabuilds/fernleaf-kitchen/actions/runs/37116520005) exposed a bounded 409 conflict where the race test expected 400. Retry backoff and stronger post-race assertions now pass locally; final fix push/CI pending. |

## Scope and four roles

All eleven blueprint functional areas are Musts. Portions and employee CSV import are explicit Shoulds. Delivery photo is optional within the required driver workflow. The current request authorises Phase 1, with a report and stop before Phase 2.

| Role | Responsibility | Current surface |
| --- | --- | --- |
| Admin | Configure catalogue/pricing, companies/employees, staff/settings; manage orders, overrides and billing | Configuration CRUD forms, employee menu/secret-category preview, bulk pricing and editable settings; orders/staff/billing later |
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

The implementation workstation uses an ignored temporary pnpm tool cache; pnpm is not installed globally there. In this existing workspace, add the cache directory to the current PowerShell session's PATH before running scripts so nested workspace commands also find pnpm:

```powershell
$env:PATH = (Join-Path (Get-Location) '.tooling/node_modules/.bin') + ';' + $env:PATH
pnpm dev
```

Reviewers on a fresh checkout should use the normal installation above.

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

Edit the copied environments first. Real `.env` files are Git-ignored. The example database credentials are disposable local-development values; provider secrets belong in provider variables. `db:migrate` runs `prisma migrate deploy` and applies committed migrations without schema generation or reset. For an intentional new schema change, use `pnpm --filter @fernleaf/api migrate --name change-name` (`db:migrate:dev` is the interactive alias); inspect the target and any drift/reset prompt first. Production uses only `migrate:deploy`. Run the seed after migrating: it initializes kitchen settings and synthetic configuration as well as the four accounts. Protected settings returns `503 SETTINGS_NOT_INITIALIZED` when its singleton has not been seeded. Existing staff edits are preserved; configuration seed preservation is described in the reviewer guide.

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

On this workstation Chromium is cached in the ignored `.tooling/browsers` directory. To reuse it, set `$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.tooling/browsers'` before `pnpm test:e2e`. A fresh reviewer checkout can use the normal `playwright install chromium` command above; installation and testing must use the same cache setting.

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
| Browser tests `PLAYWRIGHT_BROWSERS_PATH` | Optional Playwright browser cache path; implementation workstation uses ignored `.tooling/browsers` |

The browser uses relative `/api/v1` URLs. No database secret or session implementation is exported as `NEXT_PUBLIC_*`. Production cookies are Secure, HttpOnly and SameSite, scoped to the staff web host through the rewrite. Hosted smoke tests must check cookie forwarding and origin/CSRF handling on the actual domains.

## Architecture and module responsibilities

```mermaid
flowchart LR
    Browser[Staff browser or driver phone] -->|Same-origin HTTP /api/v1| Web[Next.js rewrite]
    Web -->|HTTP| API[NestJS controllers and services]
    API --> Guards[Session and central permission guards]
    Guards --> Rules[Configuration services and pure money/calendar rules]
    Rules --> Prisma[Prisma PostgreSQL adapter and transactions]
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
| `GET/PATCH /settings` | Admin `settings.read/manage`; persisted kitchen calendar/default tier/cutoff/risk settings; PATCH requires current version |
| `GET /settings/cutoff` | Admin; delivery-date cutoff preview, optional company delivery eligibility |
| `GET/POST/PATCH /reference-data` | Admin; allergens, dietary tags, stations, portion sizes, packaging and public-domain restrictions |
| `/dishes`, `/options`, `/dishes/:id/groups` | Admin; validated catalogue CRUD and ordered reusable-option groups; retire records with active flags |
| `/categories`, `/menu-items` | Admin; active/secret categories, dish membership and display ordering |
| `/price-tiers`, `/price-tiers/:id/matrix` | Admin; manual/cost/reference tiers and paginated dish/option effective-price matrix; bulk override save |
| `/companies`, `/companies/:id/addresses`, `/companies/drivers` | Admin; company setup/updates, address maintenance and active Driver choices |
| `/employees`, `/employees/:id/transfer` | Admin; employee configuration and atomic owner-aware transfers |
| `/employees/:id/menu`, `/employees/:id/menu/categories/:categoryId` | Admin; authoritative normal/direct category previews applying visibility, prices and allergen guidance |
| `POST /settings/check-access` | Admin `settings.manage`, exact origin and CSRF; returns `{allowed:true}` and writes no configuration |

Undeclared route access policies fail closed. Future business capability names are already in the central map, but their declaration does not create those endpoints or implement resource ownership/date checks. Errors have `code`, `message`, optional `fieldErrors` and `requestId`; `X-Request-Id` identifies requests and API responses use `Cache-Control: no-store`.

| Folder | Responsibility / status |
| --- | --- |
| `apps/web` | App Router, login, role landing pages, configuration forms and typed HTTP client |
| `apps/api` | NestJS auth/access/health, catalogue/menu/pricing, companies/employees/settings and pure money/calendar rules |
| `apps/api/prisma` | Staff/session and Phase 1 configuration schema, committed migrations and reviewer-safe seed |
| `packages/contracts` | Public roles, permission identifiers, request/response contracts |
| `tests/integration` | Auth/access, pure money/calendar rules, PostgreSQL configuration/menu/pricing/concurrency checks |
| `tests/e2e` | Browser login/role/logout and configuration workflows through the HTTP rewrite |
| `docs` | [Actual architecture](docs/architecture.md), [planned lifecycle diagrams](docs/diagrams.md), [Phase 1 rules/evidence](docs/phase-1.md) and [deployment runbook](docs/deployment.md) |
| `Dockerfile.api`, `railway.json` | Repository-root API deployment foundation |

Implemented modules: auth/access/health; catalogue/menu/pricing for visibility and prices; companies/employees for customer configuration; settings for references and kitchen policy; pure domain helpers for money, pricing and calendar calculations. Planned modules: orders for quotes/snapshots/lifecycle/timeline; kitchen for prep/readiness; dispatch for drops/driver actions; billing for invoices/payments/credits; jobs/demo for catch-up/rolling fixtures; dashboards for role-scoped aggregates. Controllers stay thin; database access remains in the API.

## Actual data model through Phase 1

Staff identities log in; company employees remain separate customer records without credentials. The diagram shows the implemented schema's important relationships; [architecture details](docs/architecture.md) cover join tables and constraints.

```mermaid
erDiagram
    STAFF_USER ||--o{ SESSION : has
    STAFF_USER o|--o{ COMPANY : default_driver
    PRICE_TIER o|--o{ COMPANY : selected_tier
    PRICE_TIER ||--o| KITCHEN_SETTINGS : default_tier
    PRICE_TIER o|--o{ PRICE_TIER : derived_from
    COMPANY ||--|{ EMPLOYEE : employs
    EMPLOYEE o|--o| COMPANY : owner
    COMPANY ||--|{ COMPANY_ADDRESS : has
    COMPANY ||--|{ COMPANY_DOMAIN : claims
    COMPANY_ADDRESS o|--o| COMPANY : default_address
    CATEGORY ||--o{ MENU_ITEM : contains
    DISH ||--o{ MENU_ITEM : appears_in
    DISH ||--o{ DISH_OPTION_GROUP : defines
    DISH_OPTION_GROUP ||--o{ GROUP_OPTION : orders
    OPTION ||--o{ GROUP_OPTION : reused
    PRICE_TIER ||--o{ DISH_TIER_PRICE : prices
    DISH ||--o{ DISH_TIER_PRICE : has
    PRICE_TIER ||--o{ OPTION_TIER_PRICE : prices
    OPTION ||--o{ OPTION_TIER_PRICE : has
    REFERENCE_VALUE o|--o{ DISH : station
    REFERENCE_VALUE o|--o{ COMPANY : packaging
```

Each account has one role. Normalized email is unique. Both IDs are UUIDs. Only the SHA256 hash of a random opaque cookie token is stored. Sessions have indexes on user/expiry and cascade when their staff user is deleted. Staff has creation/update timestamps; sessions have creation/expiry timestamps. Expiry, current role and active status are checked on protected requests; logout revokes the session. The final migration/schema is authoritative.

Phase 1 enforces one non-null company per employee, normalized unique company domains/SKUs, one explicit price per item/tier and a single settings/default-tier relationship. Composite foreign keys require company owners/default addresses to belong to that company. Employee email is normalized and unique within its company. Company creation inserts its first owner/address in one transaction; transfers replace an outgoing owner first and roll back on target-email conflicts. Calendar arrays use weekdays `0=Sunday` through `6=Saturday` and local-date holidays; API validation checks real dates and unique days. References have one kind and retire through `active` flags, retaining existing joins.

Orders, prep units, drops, invoices and rolling fixture tables are **not implemented**. Their snapshots, grouping and uniqueness guarantees remain [planned lifecycle diagrams](docs/diagrams.md), with current configuration sequences in [actual architecture](docs/architecture.md).

## Decisions and preserved business rules

| Area | Decision / reason / implementation boundary |
| --- | --- |
| Database | PostgreSQL for relationships, constraints and transactions. Prisma belongs to NestJS. SQLite does not substitute for PostgreSQL concurrency evidence. |
| Authentication | scrypt password hashes; random opaque session tokens hashed in PostgreSQL, expiry and logout invalidation. HttpOnly cookies keep tokens out of browser JavaScript. |
| CSRF | Exact mutation origin plus CSRF token. CORS alone is insufficient. Login and authenticated mutation policies need direct HTTP evidence. |
| Permissions | Central capability map enforced by NestJS against current role. Hidden buttons are presentation. Driver ownership/current-date policies follow with real drops. |
| Frontend | HTTP rewrite keeps same-origin cookies and the required Next-to-Nest boundary. Typed forms fetch/save through NestJS and report server validation errors. |
| Money — implemented Phase 1 | USD integer cents bounded to PostgreSQL Int, exact BigInt/rational intermediates. Derived unit prices round upward to five cents; explicit overrides retain entered cents, including zero. Order/invoice reconciliation follows in later phases. |
| Time — implemented helpers/settings | Asia/Kolkata calendar dates/today/cutoff previews; UTC instants; injectable clock. Automatic/manual cutoff processing and order locks follow in Phase 2. |
| Snapshots — planned Phase 2 | Placement freezes purchase/company/delivery values; edits/transfers cannot rewrite history. Placed revisions require accepting a fresh quote. |
| Transactions — configuration implemented | Company/setup/transfer/reference/pricing/settings writes use short serializable transactions with up to three attempts for serialization conflicts. Company/settings versions reject stale saves with 409. Future cutoff/readiness/invoice races need their own checks. |
| Company ownership and references | Composite owner/address foreign keys require same-company membership. Active owners/default addresses cannot retire before replacement. Reference kinds are checked on writes; active packaging/station usage blocks retirement. |
| Seed preservation | Four missing staff accounts are inserted without resetting edited accounts. Configuration installs once in one transaction when settings is absent; later seed runs preserve edits and deliberately removed prices/groups/domains. |
| Hosting | Vercel web + Railway API/PostgreSQL, repository-root API Docker build. Access pending; no paid purchase, deployment or hiring-form submission claimed. |

Pricing, menu/configuration and cutoff calculation below are **implemented in Phase 1**. Order combinations, processing, snapshots, fulfilment and billing remain planned for later phases:

- **Pricing:** choose company tier or default tier; explicit price wins within that tier, otherwise valid cost/reference derivation, otherwise missing. Missing company-tier items do not fall back to another tier. Reject reference cycles. For rational `N/D` cents, rounded derived cents = `5 * ceil(N / (5 * D))`: $2.11 → $2.15; $2.10 remains $2.10. Missing-price options are unavailable; hide dishes with no price or no priced option in a required group.
- **Menu/configuration:** require active category/menu item/dish, company visibility and effective prices. Secret categories are absent from normal preview but have direct staff preview links applying the same restrictions. Ordered required/optional groups reuse options. Employee allergen matches appear as warnings; dietary preferences are guidance and do not automatically remove food. References include portion sizes before the Should portion workflow.
- **Company/employee:** normalize domains with lowercase/IDNA, reject malformed and data-listed public providers, require at least one domain and enforce global domain uniqueness. A denylist does not verify domain ownership. Each employee belongs to one company, with normalized email unique within that company. Owner transfers require an active source-company replacement and roll back every change on failure. Address/time/packaging flags are stored now; enforcing them on order requests belongs to Phase 2.
- **Combinations:** required groups select exactly one option, optional groups zero/one, per combination. Reject foreign-group/duplicate selections and non-positive/fractional quantities; canonical duplicate combinations merge. Combination quantities equal line quantity; duplicate dish lines cannot bypass minimum quantity. Six $8.80 meals and four $9.20 meals total $89.60, producing two prep units of six/four meals.
- **Calendars/cutoff:** company calendar allows delivery dates. Count backwards from before delivery across kitchen working days/holidays only, then use kitchen cutoff time; zero days uses the delivery date. Wednesday 7 October 2026, two days, 16:00 → Monday 5 October 16:00; a kitchen Monday holiday shifts it to Friday 2 October if weekends are closed. Settings allow 0–30 cutoff working days and 0–1440 risk minutes. The helper identifies `now >= cutoffAt`; actual order editing/cancellation locks follow in Phase 2.
- **Processing:** scheduled, startup catch-up and Admin/manual processing share an idempotent service. Due Draft cancels; due Placed confirms original amounts, creates unique work/drop membership and records events. Manual action rejects future cutoff. Policy changes cannot reopen processed dates; unprocessed policy changes recompute/catch up. Company-calendar edits cannot silently invalidate live orders.
- **Kitchen:** only active Confirmed orders create work, one unit per distinct combination on a line. Pending → Started → Done; direct completion records both times. Earliest unit start is order start; all units must be Done for readiness, using latest completion. Planned dispatch readiness = delivery minus travel minutes; kitchen readiness = another 30 minutes earlier. Unfinished work is late after its planned time, at risk within a configurable 15 minutes, and an exception if timing is missing. Repeated transitions cannot duplicate work.
- **Orders/drop states:** Draft, Placed, Confirmed, Delivered, Cancelled, Rejected are commercial states. Exact company, canonical actual address and delivery instant group drops, independent of employee/packaging. Drop progression: Awaiting kitchen → Kitchen ready → Dispatch ready → Out for delivery → Delivered. Departure requires driver; delivering atomically updates active members. Driver scope comes from session ID and current kitchen date. On-time = actual delivery ≤ departure-captured target; undelivered timing is unknown.
- **Overrides:** explicit Admin action/reason/timeline. Before departure, address/time changes atomically regroup/recalculate readiness, preserving completed prep. After departure, corrections are drop-wide. Delivered history retains actual times and original target. Cancellation removes undelivered active work; delivered shortages become exceptions/credits.
- **Billing:** currently Confirmed/Delivered orders without invoice are eligible; Cancelled/Rejected excluded from new invoices. Selected orders belong to one company and can be claimed once transactionally. Gross = original immutable order totals. Invoiced cancellation adds full internal credit; delivered shortage may add reasoned partial credit. Credits cannot exceed the order amount or duplicate on retry. Mark-paid records settlement of the current outstanding amount. Net due = gross − credits − payments; negative means company credit. Issued totals/membership and paid history stay historical after later credits.

## Exact dashboard definitions — planned Phase 4

Current landing pages show identity, role and navigation/access checks. They **do not display operational figures**. The following is the future backend-query contract; zero applies only to an empty query, not an unimplemented feature.

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
| 4.1 Catalogue/references | Must / 1, 2 | Configuration locally verified | Fields/reusable groups/references/retirement API and browser checks pass; purchase snapshot stability follows Phase 2 |
| 4.1 Portions | Should / 6 | Deferred until Must gate | Complete group-wide size/surcharge matrix and snapshot tests |
| 4.2 Menu | Must / 1 | Locally verified | Normal/direct previews apply activity/hiding/pricing/required options; API and browser checks pass |
| 4.3 Pricing | Must / 1 | Locally verified | Exact tiers/matrix/overrides, no missing fallback, cycles and five-cent rounding; rule/API/browser/race checks pass |
| 4.4 Companies | Must / 1 | Locally verified | Domains/addresses/billing/owner/defaults/calendars; FK/race/rollback and browser checks pass |
| 4.5 Employees | Must / 1 | Configuration locally verified | One company/transfer/replacement owner/email/flags/allergy guidance; API/browser checks pass, ordinary order flag enforcement Phase 2 |
| 4.5 CSV import | Should / 6 | Deferred until Must gate | Partial success/row errors, duplicate policy and size limit |
| 4.6 Orders/cutoff | Must / 2 | Not started | Quotes/snapshots/lifecycle/timeline, filters/pagination, jobs/overrides |
| 4.7 Kitchen | Must / 3 | Role shell only | Real units/board/risk/readiness, force-completion and races |
| 4.8 Dispatch/Driver | Must / 3 | Role shells only | Exact groups, drivers/transitions, mobile own-today delivery/timing |
| Delivery photo | Optional / 6 | Not started | Persistent storage if added; delivery works without photo |
| 4.9 Billing | Must / 4 | Not started | Unique invoice claims/payments/credits, concurrency/reconciliation |
| 4.10 Settings | Must / 0, 1 | Locally verified | Kitchen calendar/cutoff/default tier/risk/references and cutoff preview; version/race/browser and cross-timezone checks pass |
| 4.11 Dashboards | Must / 4 | Role shells; definitions above | Real aggregates and filtered-record reconciliation |
| Non-functional rules | Must / every phase; 5 gate | Auth and Phase 1 access/domain/concurrency checks pass | 65 backend/rule and 14 browser tests pass; combination/order/invoice/400-order evidence later |
| Submission/review | Must / 0, 5, 7 | Public repo, Phase 1 push and CI verified; deployment files prepared | Hosting/live smoke, sources/form, rolling fixtures and 14-day availability open |

Later scope is deferred by the authorised phase boundary, not waived; no Must was downgraded. Optional saved filters, shortcuts and decorative visuals wait until Must workflows/tests pass.

| Phase | Current status | Acceptance gate |
| --- | --- | --- |
| 0 Foundation | Local implementation verified; hosted gate blocked | Deployed login, unauthorised API rejection and production database connection |
| 1 Rules/configuration | Implemented and locally verified | PASS: missing/hidden items excluded, derived rounding correct, company/owner/domain rules enforced; lint/types/tests/browser/build/container pass |
| 2 Orders/cutoff | Not started | Snapshots survive catalogue edits; cutoff confirms/cancels exactly once |
| 3 Fulfilment/delivery | Not started | Valid cross-role journey and invalid/concurrent transitions cannot duplicate work |
| 4 Billing/dashboards | Not started | Concurrent invoice requests cannot double-bill; figures reconcile to filtered records |
| 5 Must release | Not started | All Must acceptance checks pass on deployed app, including access/current data/400-order board |
| 6 Should/optional | Not started; portions then CSV | Must regression suite remains green after each complete enhancement |
| 7 Submission | Not started | Fresh-browser/mobile review, accurate public/live links and actual submission/14-day availability |

## Interpretations and assumptions

Explicit requirements as represented in the blueprint include four accounts/roles, Next/Nest/Prisma, all eleven Must areas, backend rules, immutable history, exact money, calendars, unique invoicing, current-day Driver data and two-week review availability. Compare those to the original assignment/email when supplied.

Our choices: PostgreSQL/pnpm/TypeScript; opaque sessions instead of JWT; USD from dollar examples; Asia/Kolkata kitchen zone; exactly one selection in required groups, zero/one in optional groups; Admin authors configuration/orders/billing; 15-minute default risk threshold; public-provider domain denylist without ownership verification; normalized employee email unique within its company; calendar arrays instead of separate weekday/holiday tables; one generic typed reference table; allergies/preferences as warnings rather than automatic filtering; internal credits preserving issued invoices; drop-wide post-departure corrections; portion surcharges independent of tiers. Configuration choices through Phase 1 are implemented; order/billing/portion interpretations remain planned. Later deviations need reasons and evidence.

## Tests and actual evidence

Results recorded on 3 October 2026. The first table preserves the verified **Phase 0** baseline; it is not a claim that those same commands passed after Phase 1 changes. Current-phase evidence follows separately. No future business-rule test or deployment is counted as passed.

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
| Phase 0 pricing/cutoff/combinations/timing | Not run in that phase; current pricing/cutoff evidence follows below |
| Phase 0 invoice/domain concurrency/full role journey | Not run in that phase; current domain concurrency evidence follows below |
| 400-order kitchen performance | Not run; no order/board model. No latency claim. |

The 20 backend cases cover database-backed health/cache/request IDs, all four login roles, email normalization, password/session hashing, invalid credentials/DTO fields, login origin, unauthenticated/forbidden access, CSRF/origin, logout/revocation, expiry, current role/active checks, sign-in rotation, seed preservation and production cookie flags. The 10 browser cases verify every role's login/refresh/logout, invalid credentials, Admin settings and direct non-Admin permission denial through the Next.js rewrite. The Driver shell passed at 390 × 844 with no horizontal overflow; its saved screenshot was inspected. This verifies the shell, not the later delivery workflow.

Jest 30/NestJS 12 ESM interoperation uses `--experimental-vm-modules` automatically in the test script; Node emits its expected experimental warning. The production API does not need that flag. On this agent's restricted Windows sandbox, `tsx` seed initially hit `uv_os_get_passwd`; the normal Windows user run succeeded without application changes.

Final Phase 1 local evidence:

| Check | Actual result / remaining work |
| --- | --- |
| Phase 1 migration | Applied to main and guarded test PostgreSQL databases; Prisma client generated |
| `pnpm lint` / `pnpm typecheck` Phase 1 | PASS; complete repository lint and contracts/API/web type checks |
| `pnpm --filter @fernleaf/api test:integration --runTestsByPath ../../tests/integration/configuration.spec.ts` | PASS; 16 tests, 12.073 seconds; direct role denial, atomic setup, domain claim race, same-company FK constraints, transfer rollback, flags/references and company/settings version races |
| `pnpm test:integration` Phase 1 | PASS after final retry fix; **65 tests / 4 suites in 61.719 seconds**, using isolated PostgreSQL: 20 auth, 15 catalogue/menu/pricing, 17 configuration and 13 pure money/calendar cases |
| Concurrent tier-reference regression | PASS after 20/40 ms rollback backoff: **100 observed focused race pairs**, then 10 pairs in the full suite. Every pair verifies one committed edge and a subsequent `400 PRICE_TIER_CYCLE` for the losing edit. Bounded contention may return only `409 CONCURRENT_CHANGE`; generic 409/500 and persisted cycles fail. The initial HTTP 500 was fixed by handling PrismaPg's structured SQLSTATE `40001`/`40P01` commit conflicts alongside Prisma `P2034`. |
| `pnpm build` Phase 1 | PASS; contracts, compiled NestJS and all Next.js production routes |
| `pnpm test:e2e` Phase 1 | PASS against the final retry build; **14 Chromium tests in 27.1 seconds**, exit 0: 10 authentication/access/phone regression cases and four complete Admin configuration workflows with browser timezone America/Los_Angeles. All owned test servers stopped. |
| `docker build --file Dockerfile.api --tag fernleaf-api:phase1 .` | PASS; current API deployment image generates Prisma and compiles contracts/API |
| Phase 1 local production-mode container | PASS; non-root user, committed migrations, PostgreSQL health, four logins, production cookie attributes, anonymous 401/non-Admin 403, persisted settings/menu and logout. Explicit local HTTP cookie client; hosted HTTPS browser behaviour remains unverified. Temporary API container stopped; PostgreSQL retained. |
| Phase 1 GitHub CI/commit/push | Phase commit `a44792c` pushed and [CI passed](https://github.com/dishitabuilds/fernleaf-kitchen/actions/runs/37116026865); evidence commit `cee9856` also passed. Docs-only `e4f8ded` rerun found a race-test timing failure (64/65 passed): safe 409 versus expected 400. Retry/backoff fix now passes all local checks; final fix push/CI pending. |
| Hosted smoke checks | Blocked by pending hosting access; not run |

[Phase 1 evidence](docs/phase-1.md) maps the blueprint gate to tests. Remaining planned tests: per-combination groups/sums/MOQ/duplicates and readiness/risk timing; snapshot stability after catalogue edits/employee transfer; concurrent/repeated cutoff and final-unit completion; invoice uniqueness/rollback/credit limits; own-driver/date restrictions; invalid departure/delivery; atomic grouped updates and employee flags against crafted order requests. The 400-order check will record dataset, filtering/pagination/query counts, readiness correctness and measured API/UI results. These remain acceptance plans for later phases.

## Demo accounts and reviewer walkthrough

These intentionally public credentials are for synthetic staff only; the database stores password hashes.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@test.com` | `Test@1234` |
| Kitchen | `kitchen@test.com` | `Test@1234` |
| Dispatch | `dispatch@test.com` | `Test@1234` |
| Driver | `driver@test.com` | `Test@1234` |

Run local setup, open the web app and sign in with each account in a fresh session. Check the correct landing page (Admin `/dashboard`, Kitchen `/kitchen`, Dispatch `/dispatch`, Driver `/today`), refresh to retain the session and sign out. The three operational roles currently have landing pages; there is no order/prep/delivery/invoice journey yet. Anonymous `/api/v1/auth/me` returns 401; non-Admin configuration HTTP requests return 403.

Phase 1 Admin walkthrough:

1. Open **Catalogue** at `/catalogue`: inspect dish fields, reusable options, ordered groups and reference lists including portion sizes. Edit a record, save and refresh to confirm persistence. Retire through the active flag rather than deleting a referenced dish.
2. Open **Pricing** at `/pricing`: select **Standard** in the matrix to see explicit dish/option prices and the deliberately missing soup price. Select **Cost plus 15%** to see the rice dish's 211-cent cost resolve to 245 cents through exact derivation and upward five-cent rounding. An explicit override of 211 cents remains 211; clearing an override restores the tier rule or missing status.
3. Open **Menu** at `/menu`, choose employee preview and the demo employee. Standard shows the priced rice box; the unpriced soup is excluded with a diagnostic. Use the Chef's preview direct category link to see its priced secret dish. Secret links still respect company hiding. Categories/items can be created, ordered, edited and retired here.
4. Open **Companies** at `/companies`: edit billing, calendar, price tier, packaging/driver/default address and hidden categories/items. Selecting **Company manual** demonstrates a missing company-tier price without fallback. Refresh employee preview after changing restrictions. Add a company with its initial employee owner and full address; duplicate/public domains and owners from another company are rejected.
5. Open **Employees** at `/employees`: configure allergy/preference guidance and delivery choice flags. Transfer an employee using the dedicated action; an owner requires a replacement from the source company. A conflicting normalized target email rolls back the transfer and replacement.
6. Open **Settings** at `/settings`: edit kitchen working days, holidays, cutoff time/count, default tier and risk minutes; save and refresh. Preview 7 October 2026 with two days and 16:00: weekdays give 5 October 16:00 IST; adding the kitchen holiday 5 October gives 2 October 16:00 IST. A company's holiday affects delivery eligibility without shifting that cutoff. A stale browser save returns a reload-required conflict.

The future journey is Admin quote/place → real passed-cutoff confirmation → Kitchen completion → Dispatch assignment/departure → Driver delivery → Admin invoice/payment/credit. **Manual past-cutoff processing is not implemented through Phase 1.** Phase 2 will add an Admin action selecting a delivery date whose kitchen cutoff has already passed, sharing the scheduler service and returning confirmed/cancelled/skipped/failed counts. It rejects future cutoff; reviewers will not need to change the clock. Current cutoff previews calculate dates without changing any order state.

The initial Phase 1 seed contains four staff accounts; Fernleaf Demo Labs with a seven-day company calendar, owner plus one employee and an address; three tiers (Standard/manual, Cost plus 15%, Company manual/missing); three dishes including unpriced soup and a secret dish; one reusable option/required group; normal/secret categories; packaging, stations, allergen/dietary/portion references and a public-domain denylist. The kitchen starts with Monday–Friday, no holidays, 16:00, two cutoff working days, Standard default and a 15-minute risk threshold. There are no operational orders/drops/invoices yet.

Configuration initializes atomically only when the singleton settings row is absent. Once initialized, rerunning `pnpm db:seed` skips configuration completely, preserving reviewer edits, employee transfers and intentionally removed prices/groups/domains. It continues to insert missing demo staff without overwriting existing accounts. This is an initial fixture installer, not a repair/reset tool; do not delete settings to refresh review data.

Future scenarios: at least three companies, 20–30 employees, 12–15 dishes/options/groups, coherent past/today/next-week orders and unpaid/paid/credited invoices. A separate fixture builder will use scenario/date unique keys. Startup catch-up and kitchen-midnight jobs must append missing current-day fixtures without resetting reviewer edits; a seven-day demo company/calendar will keep valid Driver work on weekends. Ready/out-for-delivery own-today drops will have clearly labelled synthetic prior history. **Rolling operational fixtures are planned for Phase 4/5, not implemented or deployed.**

## Deployment and two-week availability

[Deployment runbook](docs/deployment.md) covers monorepo settings, variables, migration/seed order, health, HTTPS cookies/origins, logs and recovery. Hosting access is pending; no provider project, production database, live URL or hosted HTTPS cookie verification is claimed. Production cookie attributes passed the local API container smoke.

The target is Vercel web and an always-running Railway API/PostgreSQL in one project/region. Verify account eligibility/current limits and budget before provisioning. Future scheduled jobs need an awake process/catch-up/logs; sleeping-host fallback needs a separately scheduled authenticated trigger and cold-start tests. Paid purchases and hiring-form submission are not authorised by commit permission.

Keep the deployment live at least **14 days after actual submission**. If submitted on 4 October 2026, the corresponding earliest end is 18 October at the same time. Record actual submission/retention timestamps, funding/quota, backups and ownership when deployed; check health and all-role login during review. Do not rely on unverified trial expiry. The actual Google Form/source email is unavailable and has not been submitted.

## Resume point and next phase

Phase 1 implementation and its local acceptance gate are verified. Phase completion commit `a44792c` was pushed and clean-checkout CI passed. A later CI rerun exposed a race-test assumption about immediate 400 versus bounded 409; the final retry backoff and graph/post-race assertions now pass 100 focused race pairs and the complete local checks (65 backend/rule tests, 14 browser tests, lint/types/build and rebuilt API container smoke). Push and verify this final fix on `main` before reporting completion. Code and diagrams describe the implemented configuration model; order/fulfilment/billing diagrams remain labelled planned.

Hosting access remains the precise deployed-gate blocker; configure the prepared services and run deployed sign-in, unauthorized-access and production-database checks when access is available. The original assignment PDF/submission instructions remain missing. There is no live URL or deployment claim.

Stop after the Phase 1 report until another phase is authorised. **Phase 2 is next:** order drafts/placement, exact combinations/server quotes, immutable purchase/company/delivery snapshots, lifecycle/timeline/filtering and shared scheduled/startup/manual cutoff processing with explicit Admin overrides. Reuse the configuration/menu/pricing/calendar services and preserve the Phase 0 hosted gate until live checks pass. Fresh conversations should read rules/README, inspect Git state and consult relevant blueprint sections before editing.
