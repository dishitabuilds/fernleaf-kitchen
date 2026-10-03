# Fernleaf Kitchen

An internal kitchen operations application for companies buying individual boxed meals for their employees. Staff enter orders, Kitchen prepares meals, Dispatch organises deliveries, and Driver completes assigned drops. Companies owe the money; employees have no login or payment flow.

The mandated stack is **Next.js + NestJS + Prisma**. This repository uses TypeScript, pnpm workspaces and PostgreSQL. The frontend calls the backend over HTTP; Prisma and authoritative business rules belong to NestJS.

## Current progress and sources

**Phase 2 implementation and local acceptance are verified.** Admin can save/edit drafts, review/accept server quotes, place/revise orders, inspect immutable purchases/timeline, filter lists and perform reasoned exceptions. Shared automatic/manual cutoff cancels Drafts and confirms Placed orders exactly once, creating pending prep units and grouped drops. The real backend passes 118 tests and the production browser suite passes all 20 cases. Lint/types/build and final API image/container checks pass. Phase 3 operational workflows are next; hosting remains pending. See [Phase 2 evidence](docs/phase-2.md) and the publication checkpoint below.

Phase 1 configuration and its final concurrency fix remain implemented and locally verified. They include exact money/calendar rules, catalogue/options/groups, references, menus/previews, tiers/matrix, companies/addresses/domains, employees/transfers and kitchen settings. Its 65 backend/rule tests, 14 browser tests and production/container checks passed. See [Phase 1 evidence](docs/phase-1.md). Phase 2 regression results will be recorded separately.

Phase 0's authentication/HTTP/database foundation was verified locally, including four role accounts, 20 backend tests, 10 browser tests and the API Docker smoke. Its hosted gate remains **blocked by pending Vercel/Railway access**. Role landing pages still do not implement operational dashboards. Orders are the current phase; fulfilment actions and billing remain later phases.

The complete [Heizen-Implementation-Blueprint.md](Heizen-Implementation-Blueprint.md) was read before implementation. The original assignment PDF and submission email/screenshots are absent from this workspace and have **not** been checked. Requirement numbering, the 4 October 2026 11:59 PM IST deadline, public-repository requirement and submission method below come from the blueprint; comparison with the original sources remains pending. No attachment from another conversation is assumed accessible. [AGENTS.md](AGENTS.md) and [rules.md](rules.md) govern future work.

The user authorised normal phase commits/pushes and creation of this project's GitHub repository. Hosting access is pending. **No deployment or production database has been verified.** Phase 0 requires deployed browser sign-in, rejected unauthorised API access and production API-to-database connectivity; its deployed gate remains open.

| Delivery record | Status |
| --- | --- |
| GitHub URL / visibility | [dishitabuilds/fernleaf-kitchen](https://github.com/dishitabuilds/fernleaf-kitchen), verified public |
| Branch / phase commit / verified push | `main`; Phase 1 commit [`a44792c`](https://github.com/dishitabuilds/fernleaf-kitchen/commit/a44792cf849bce22cfd42c4095c2c3ac141ab891) and final retry fix [`47279c3`](https://github.com/dishitabuilds/fernleaf-kitchen/commit/47279c30fe6bd4fefa0362a5ec500daa5c101eaf) pushed on 3 October 2026; each full hash matched remote `main` after push. Following documentation commits record this evidence. |
| Web / API live URLs | Not deployed; hosting access pending |
| Local checks | Phase 1 gate PASS: missing/hidden menu items, exact derivation and company/owner/domain rules verified; complete evidence below |
| GitHub Actions | Final retry fix `47279c3` [clean-checkout checks](https://github.com/dishitabuilds/fernleaf-kitchen/actions/runs/37117393858) **PASS**: frozen install, lint/types, PostgreSQL migrations and 65 tests, production builds, seed and 14 browser tests |

## Scope and four roles

All eleven blueprint functional areas are Musts. Portions and employee CSV import are explicit Shoulds. Delivery photo is optional within the required driver workflow. The current request authorises Phase 2, with a report and stop before Phase 3. Unresolved business choices must be asked with options rather than assumed.

| Role | Responsibility | Current surface |
| --- | --- | --- |
| Admin | Configure catalogue/pricing, companies/employees, staff/settings; manage orders, overrides and billing | Configuration and orders/quotes/snapshots/cutoffs/overrides locally verified; staff/billing later |
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

The implementation workstation uses an ignored temporary pnpm tool cache; pnpm is not installed globally there. After the first-time setup below, the Windows launcher finds either installed pnpm or that cache, starts PostgreSQL and runs both development servers:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

Keep this terminal open while using the app; Ctrl+C stops development. The launcher resolves the project from its own location, so an absolute script path also works from another directory. It checks environment files/dependencies, adds pnpm's directory to PATH for nested commands, and restores the caller's location/PATH afterward. It does not migrate, seed or reset data. Reviewers on a fresh checkout should install pnpm normally and complete the first-time setup below. For direct workspace commands on this workstation, first run `$env:PATH = (Join-Path (Get-Location) '.tooling/node_modules/.bin') + ';' + $env:PATH` from the repository root.

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

### Startup troubleshooting

Chrome's `ERR_CONNECTION_REFUSED` at `localhost:3000` means the web server is not accepting connections; the app does not start just by opening its URL. Start the launcher above, wait for Next.js to report ready and NestJS to finish starting, then reload Chrome. Closing the development terminal or finishing an automated browser test stops its servers. If startup fails, keep the console output: missing environments/dependencies and Docker failures are reported with setup steps. A reachable login page with a failing API health check requires checking NestJS and PostgreSQL as well.

The GitHub email for commit `e4f8ded` describes a historical CI failure: a pricing race test expected only HTTP 400 when a safely exhausted transaction retry could return 409. Commit `47279c3` added bounded retry backoff and verifies the persisted graph and subsequent cycle rejection. Its [full CI run passed](https://github.com/dishitabuilds/fernleaf-kitchen/actions/runs/37117393858); that notification is separate from whether local development servers are running.

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
| `GET /orders`, `GET /orders/:id` | Admin `orders.read`; server-filtered/paginated list and recorded purchase, current logistics, revisions and timeline |
| `POST /orders/quote`, `POST /orders` | Admin `orders.create`; server estimate and action-key-protected Draft/Placed creation; placement needs the accepted current fingerprint |
| `PATCH /orders/:id`, `POST /orders/:id/place`, `/cancel`, `/reject` | Admin `orders.manage`; versioned ordinary changes before cutoff, with accepted quote for placed purchases and reason for cancellation/rejection |
| `POST /orders/override-create`, `POST /orders/:id/override` | Admin `orders.override`; explicit reasoned late placement, stored-draft placement, logistics correction or permitted cancellation/rejection |
| `POST /cutoffs/process` | Admin; already-passed dates only, shared with startup/minute processing; returns confirmed/cancelled/skipped/failed counts and affected order IDs |
| `POST /settings/check-access` | Admin `settings.manage`, exact origin and CSRF; returns `{allowed:true}` and writes no configuration |

Undeclared route access policies fail closed. Future business capability names are already in the central map, but their declaration does not create those endpoints or implement resource ownership/date checks. Errors have `code`, `message`, optional `fieldErrors`, public `details` and `requestId`; `QUOTE_CHANGED` carries the replacement quote, while calendar conflicts identify affected orders. `X-Request-Id` identifies requests and API responses use `Cache-Control: no-store`.

| Folder | Responsibility / status |
| --- | --- |
| `apps/web` | App Router, login, role landing pages, configuration and order forms, quote review, details/timeline and typed HTTP client |
| `apps/api` | NestJS auth/access/health, configuration, orders/cutoffs and pure money/calendar/combination rules |
| `apps/api/prisma` | Staff/configuration plus Phase 2 order/history/cutoff/prep/drop schema, additive migrations and reviewer-safe configuration seed |
| `packages/contracts` | Public roles, permission identifiers, request/response contracts |
| `tests/integration` | Auth/access, money/calendar/combinations, real PostgreSQL configuration/order/cutoff/history/concurrency checks |
| `tests/e2e` | Browser role/auth/configuration, draft/quote/place/history/exceptions and manual cutoff through the HTTP rewrite |
| `scripts/dev.ps1` | Windows development launcher: validates setup, starts Compose PostgreSQL and runs API/web in the foreground |
| `docs` | [Architecture](docs/architecture.md), [lifecycle diagrams with status labels](docs/diagrams.md), [Phase 1 evidence](docs/phase-1.md), [Phase 2 work record](docs/phase-2.md) and [deployment runbook](docs/deployment.md) |
| `Dockerfile.api`, `railway.json` | Repository-root API deployment foundation |

Locally verified modules: auth/access/health, catalogue/menu/pricing, companies/employees, settings, orders and cutoffs. Phase 2 adds exact combinations, accepted server quotes, snapshots/lifecycle/timeline and shared due processing, with create/edit/list/detail/actions over HTTP. Planned modules: kitchen for prep/readiness actions; dispatch for drop/driver actions; billing for invoices/payments/credits; demo for rolling fixtures; dashboards for role-scoped aggregates. Controllers stay thin; database access remains in the API.

## Actual data model and Phase 2 additions

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
    COMPANY ||--o{ ORDER : captured_billing_company
    EMPLOYEE ||--o{ ORDER : historical_employee
    DELIVERY_DATE_CUTOFF ||--o{ ORDER : locks_delivery_date
    ORDER ||--o{ ORDER_LINE : contains
    ORDER_LINE ||--|{ ORDER_COMBINATION : splits_into
    ORDER_COMBINATION ||--o{ SELECTION_SNAPSHOT : records
    ORDER_COMBINATION ||--o| PREP_UNIT : produces_on_confirmation
    ORDER ||--o{ ORDER_REVISION : immutable_purchase_history
    ORDER ||--o{ ORDER_EVENT : immutable_timeline
    ORDER ||--o{ ORDER_ACTION : deduplicates_commands
    COMPANY ||--o{ DELIVERY_DROP : receives
    DELIVERY_DROP o|--o{ ORDER : same_company_membership
    STAFF_USER o|--o{ DELIVERY_DROP : assigned_driver
```

Each account has one role. Normalized email is unique. Both IDs are UUIDs. Only the SHA256 hash of a random opaque cookie token is stored. Sessions have indexes on user/expiry and cascade when their staff user is deleted. Staff has creation/update timestamps; sessions have creation/expiry timestamps. Expiry, current role and active status are checked on protected requests; logout revokes the session. The final migration/schema is authoritative.

Phase 1 enforces one non-null company per employee, normalized unique company domains/SKUs, one explicit price per item/tier and a single settings/default-tier relationship. Composite foreign keys require company owners/default addresses to belong to that company. Employee email is normalized and unique within its company. Company creation inserts its first owner/address in one transaction; transfers replace an outgoing owner first and roll back on target-email conflicts. Calendar arrays use weekdays `0=Sunday` through `6=Saturday` and local-date holidays; API validation checks real dates and unique days. References have one kind and retire through `active` flags, retaining existing joins.

Two additive Phase 2 migrations contain orders, combinations, purchase/history/action records, cutoff policy dates, pending prep units and grouped drops. An order retains its original company independently of the employee's current company. Historical option/group IDs have no live-group foreign key, so replacing a catalogue group cannot erase a purchase. Immutable revision/event records have update protection; an insertion sequence resolves equal-timestamp timeline ordering. Actor/action keys deduplicate retries, and a composite drop foreign key enforces same-company membership. Backend and builder/browser gates pass. Prep/dispatch/driver actions, invoices and rolling fixtures remain later phases. See [current architecture](docs/architecture.md), [lifecycle diagrams](docs/diagrams.md) and [Phase 2 evidence](docs/phase-2.md).

## Decisions and preserved business rules

| Area | Decision / reason / implementation boundary |
| --- | --- |
| Database | PostgreSQL for relationships, constraints and transactions. Prisma belongs to NestJS. SQLite does not substitute for PostgreSQL concurrency evidence. |
| Authentication | scrypt password hashes; random opaque session tokens hashed in PostgreSQL, expiry and logout invalidation. HttpOnly cookies keep tokens out of browser JavaScript. |
| CSRF | Exact mutation origin plus CSRF token. CORS alone is insufficient. Login and authenticated mutation policies need direct HTTP evidence. |
| Permissions | Central capability map enforced by NestJS against current role. Hidden buttons are presentation. Driver ownership/current-date policies follow with real drops. |
| Frontend | HTTP rewrite keeps same-origin cookies and the required Next-to-Nest boundary. Typed forms fetch/save through NestJS and report server validation errors. |
| Money — implemented | USD integer cents bounded to PostgreSQL Int, exact BigInt/rational intermediates. Derived unit prices round upward to five cents; explicit overrides retain entered cents, including zero. Order combinations/lines/totals reconcile exactly; invoice reconciliation follows Phase 4. |
| Time — implemented | Asia/Kolkata dates/cutoffs and UTC instants; injectable real clock. Scheduled/startup/manual processing share a due-only workflow. Ordinary actions lock at `now >= cutoffAt` even before a job runs. Processed date policies stay frozen. |
| Snapshots — implemented | Placement freezes company, delivery, dish, option and price values. Fresh accepted quotes create immutable placed revisions. User-confirmed transfers block purchase edits; logistics corrections preserve the purchase. |
| Transactions — implemented through orders/cutoffs | Short serializable writes retry serialization conflicts up to three attempts; versions reject stale saves. Actor-scoped action IDs replay the committed response and reject reuse with different input. Confirmation creates state, unique work, drop membership and timeline atomically. Readiness/invoice races follow Phase 3/4. |
| Company ownership and references | Composite owner/address foreign keys require same-company membership. Active owners/default addresses cannot retire before replacement. Reference kinds are checked on writes; active packaging/station usage blocks retirement. |
| Seed preservation | Four missing staff accounts are inserted without resetting edited accounts. Configuration installs once in one transaction when settings is absent; later seed runs preserve edits and deliberately removed prices/groups/domains. |
| Hosting | Vercel web + Railway API/PostgreSQL, repository-root API Docker build. Access pending; no paid purchase, deployment or hiring-form submission claimed. |

Pricing, configuration, combinations, quotes/snapshots, lifecycle and cutoff processing are locally verified, including real browser order journeys. Kitchen/dispatch/driver transitions and billing below remain planned:

- **Pricing:** choose company tier or default tier; explicit price wins within that tier, otherwise valid cost/reference derivation, otherwise missing. Missing company-tier items do not fall back to another tier. Reject reference cycles. For rational `N/D` cents, rounded derived cents = `5 * ceil(N / (5 * D))`: $2.11 → $2.15; $2.10 remains $2.10. Missing-price options are unavailable; hide dishes with no price or no priced option in a required group.
- **Menu/configuration:** require active category/menu item/dish, company visibility and effective prices. Secret categories are absent from normal preview but have direct staff preview links applying the same restrictions. Ordered required/optional groups reuse options. Employee allergen matches appear as warnings; dietary preferences are guidance and do not automatically remove food. References include portion sizes before the Should portion workflow.
- **Company/employee:** normalize domains with lowercase/IDNA, reject malformed and data-listed public providers, require at least one domain and enforce global domain uniqueness. A denylist does not verify domain ownership. Each employee belongs to one company, with normalized email unique within that company. Owner transfers require an active source-company replacement and roll back every change on failure. Order requests enforce employee address/time/packaging flags against company defaults. Ordinary addresses must be active saved company addresses; custom addresses require a separate reasoned Admin override.
- **Combinations:** user-confirmed Option A requires exactly one option per required group and zero/one per optional group. Duplicate dish lines are rejected; enter variants as combinations on one line. Validation rejects foreign-group/duplicate selections and non-positive/fractional quantities, merges canonical duplicate combinations, enforces line totals/MOQ and checks overflow. Six $8.80 meals and four $9.20 meals total $89.60, producing two prep units of six/four meals upon confirmation.
- **Calendars/cutoff:** company calendar allows delivery dates. Count backwards from before delivery across kitchen working days/holidays only, then use kitchen cutoff time; zero days uses the delivery date. Wednesday 7 October 2026, two days, 16:00 → Monday 5 October 16:00; a kitchen Monday holiday shifts it to Friday 2 October if weekends are closed. Settings allow 0–30 cutoff working days and 0–1440 risk minutes. Ordinary order editing/cancellation locks at `now >= cutoffAt`.
- **Processing:** scheduled, startup catch-up and Admin/manual processing share an idempotent service. Due Draft cancels; due Placed confirms original amounts, creates unique work/drop membership and records events. Manual action rejects future cutoff. Policy changes cannot reopen processed dates; unprocessed policy changes recompute/catch up. Company-calendar edits cannot silently invalidate live orders.
- **Kitchen:** Phase 2 creates work only for active Confirmed orders, one unit per distinct combination on a line, with planned dispatch readiness = delivery minus captured travel minutes and kitchen readiness another 30 minutes earlier. Phase 3 will implement Pending → Started → Done; direct completion records both times. Earliest unit start is order start; all units must be Done for readiness, using latest completion. Unfinished work is late after its planned time, at risk within the configured threshold, and an exception if timing is missing. Repeated transitions must not duplicate work.
- **Orders/drop states:** Draft, Placed, Confirmed, Delivered, Cancelled, Rejected are commercial states; Delivered is a Phase 3 transition. Exact company, canonical actual address and delivery instant group drops, independent of employee/packaging. Phase 3 drop progression: Awaiting kitchen → Kitchen ready → Dispatch ready → Out for delivery → Delivered. Departure requires driver; delivering atomically updates active members. Driver scope comes from session ID and current kitchen date. On-time = actual delivery ≤ departure-captured target; undelivered timing is unknown.
- **Overrides:** explicit Admin action/reason/timeline. The user confirmed new late placement with an accepted quote and immediate shared due confirmation. Employee transfers block further placed purchase edits while retaining original company/purchase, logistics corrections and permitted cancellation. Authored pre-departure address/time corrections regroup/recalculate readiness and preserve prep history. Departed-drop corrections are blocked until the Phase 3 drop-wide action exists; delivered shortages/credits follow in Phase 4.
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
| 4.1 Catalogue/references | Must / 1, 2 | Locally verified | Fields/groups/references/retirement pass; Phase 2 purchase snapshots survive catalogue/group edits |
| 4.1 Portions | Should / 6 | Deferred until Must gate | Complete group-wide size/surcharge matrix and snapshot tests |
| 4.2 Menu | Must / 1 | Locally verified | Normal/direct previews apply activity/hiding/pricing/required options; API and browser checks pass |
| 4.3 Pricing | Must / 1 | Locally verified | Exact tiers/matrix/overrides, no missing fallback, cycles and five-cent rounding; rule/API/browser/race checks pass |
| 4.4 Companies | Must / 1 | Locally verified | Domains/addresses/billing/owner/defaults/calendars; FK/race/rollback and browser checks pass |
| 4.5 Employees | Must / 1, 2 | Locally verified | One company/transfer/replacement owner/email/flags/allergy guidance; crafted order flag enforcement and stable original-company purchases pass |
| 4.5 CSV import | Should / 6 | Deferred until Must gate | Partial success/row errors, duplicate policy and size limit |
| 4.6 Orders/cutoff | Must / 2 | Implemented and locally verified | Draft/place/edit/cancel/reject, combinations, accepted quotes/snapshots, shared cutoff, list/detail/timeline/filters/overrides; 24 order/15 cutoff/14 combination tests and six new browser cases pass |
| 4.7 Kitchen | Must / 3 | Role shell only | Real units/board/risk/readiness, force-completion and races |
| 4.8 Dispatch/Driver | Must / 3 | Role shells only | Exact groups, drivers/transitions, mobile own-today delivery/timing |
| Delivery photo | Optional / 6 | Not started | Persistent storage if added; delivery works without photo |
| 4.9 Billing | Must / 4 | Not started | Unique invoice claims/payments/credits, concurrency/reconciliation |
| 4.10 Settings | Must / 0, 1, 2 | Locally verified | Kitchen policy/defaults/references/preview, unprocessed cutoff recomputation/catch-up and frozen processed policies; version/race/cross-timezone checks pass |
| 4.11 Dashboards | Must / 4 | Role shells; definitions above | Real aggregates and filtered-record reconciliation |
| Non-functional rules | Must / every phase; 5 gate | Auth/configuration/order/cutoff access and concurrency verified locally | 118 backend tests and 20 browser cases pass; fulfilment/invoice/400-order/hosted evidence remains Phase 3–5 |
| Submission/review | Must / 0, 5, 7 | Public repo, Phase 2 push and CI verified; deployment files prepared | Hosting/live smoke, sources/form, rolling fixtures and 14-day availability open |

Later scope is deferred by the authorised phase boundary, not waived; no Must was downgraded. Optional saved filters, shortcuts and decorative visuals wait until Must workflows/tests pass.

| Phase | Current status | Acceptance gate |
| --- | --- | --- |
| 0 Foundation | Local implementation verified; hosted gate blocked | Deployed login, unauthorised API rejection and production database connection |
| 1 Rules/configuration | Implemented and locally verified | PASS: missing/hidden items excluded, derived rounding correct, company/owner/domain rules enforced; lint/types/tests/browser/build/container pass |
| 2 Orders/cutoff | Implemented and locally verified | PASS: stable recorded purchases, exact repeated/concurrent confirmation and Draft cancellation, usable HTTP builder/detail/exception paths |
| 3 Fulfilment/delivery | Not started | Valid cross-role journey and invalid/concurrent transitions cannot duplicate work |
| 4 Billing/dashboards | Not started | Concurrent invoice requests cannot double-bill; figures reconcile to filtered records |
| 5 Must release | Not started | All Must acceptance checks pass on deployed app, including access/current data/400-order board |
| 6 Should/optional | Not started; portions then CSV | Must regression suite remains green after each complete enhancement |
| 7 Submission | Not started | Fresh-browser/mobile review, accurate public/live links and actual submission/14-day availability |

## Interpretations and assumptions

Explicit requirements as represented in the blueprint include four accounts/roles, Next/Nest/Prisma, all eleven Must areas, backend rules, immutable history, exact money, calendars, unique invoicing, current-day Driver data and two-week review availability. Compare those to the original assignment/email when supplied.

Implemented choices through Phase 1: PostgreSQL/pnpm/TypeScript; opaque sessions; USD from dollar examples; Asia/Kolkata kitchen zone; Admin configuration; 15-minute default risk threshold; public-provider denylist without ownership verification; company-scoped normalized employee email; calendar arrays; typed reference table; allergy/preference guidance as warnings. Phase 2 user-confirmed choices: reasoned late placement with accepted quote/immediate due confirmation; transfer-blocked placed purchase editing; exactly one option per required group and zero/one per optional group; duplicate dish lines rejected; ordinary saved company addresses, with custom addresses requiring a separate reasoned Admin override. These are our confirmed interpretations, not additional wording attributed to the missing assignment PDF. Internal billing credits, drop-wide departed corrections and tier-independent portion surcharges remain later-phase interpretations. Changes need documented reasons and evidence.

## Tests and actual evidence

Results recorded on 3–4 October 2026. The first table preserves the verified **Phase 0** baseline; it is not a claim that those same commands passed after later changes. Current-phase evidence follows separately. No future business-rule test or deployment is counted as passed.

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
| Phase 1 GitHub CI/commit/push | Phase commit `a44792c` and evidence commit `cee9856` passed CI. Docs-only `e4f8ded` rerun exposed a race-test assumption (safe 409 versus expected 400), fixed by backoff and stronger graph/post-race checks in `47279c3`. Final fix pushed; full hash matched remote `main`; [final CI](https://github.com/dishitabuilds/fernleaf-kitchen/actions/runs/37117393858) **PASS**, 65 backend/rule and 14 browser tests (13.8 seconds for CI browser cases). |
| Hosted smoke checks | Blocked by pending hosting access; not run |
| Windows startup repair / Chrome check | PASS on 3 October 2026: `scripts/dev.ps1` starts healthy Compose PostgreSQL and the API/web servers using cached pnpm; direct and proxied health report a connected database and `/login` returns 200. In the user's Chrome, Admin sign-in, session persistence after refresh, saved Settings and the dashboard connection indicator pass. Launcher parsing, actionable missing-environment failure and location/PATH restoration pass; repository lint and diff checks pass. Development servers are deliberately left running for local review. The historical `e4f8ded` notification is fixed; [current main CI at `162cc75`](https://github.com/dishitabuilds/fernleaf-kitchen/actions/runs/37117633051) passed all checks. |

[Phase 1 evidence](docs/phase-1.md) maps the configuration gate to tests. Phase 2 now verifies combinations/MOQ, stable purchases across catalogue edits/transfers, employee flags, order action/version races, repeated/concurrent cutoff and grouping. Remaining planned tests cover preparation readiness/risk and simultaneous final-unit completion; invoice uniqueness/rollback/credit limits; own-driver/date restrictions; invalid departure/delivery and atomic delivered-member updates. The Phase 5 400-order check will record dataset, filtering/pagination/query counts, readiness correctness and measured API/UI results; it has not run.

Phase 2 final local gate on 4 October: both additive migrations passed on development and guarded test databases. `pnpm lint`, `pnpm typecheck` and `pnpm build` pass, with focused web lint/types after the final delivery-form fix. The full backend suite passes **118 tests / seven suites in 62.934 seconds** using real production registration and Option A, including 14 combination, 15 cutoff and 24 order API cases. `pnpm test:e2e` passes **all 20 Chromium cases in 37.6 seconds against production output**: existing auth/configuration plus draft editing/$89.60 placement/immutable history, changed-quote reacceptance, immediate late confirmation and transfer/logistics preserving address/packaging/billing; two manual-cutoff cases verify future rejection and repeated empty past processing. Order/configuration/cutoff browser tests use America/Los_Angeles. The completion commit's [clean-checkout CI passed](https://github.com/dishitabuilds/fernleaf-kitchen/actions/runs/37150985847) in 2m11s, including frozen-lockfile install, Prisma/migrations, lint/types/tests/build, a separate browser database and all browser tests. [Phase 2 evidence](docs/phase-2.md) records coverage and publication. No live deployment is claimed.

The final `fernleaf-api:phase2` Docker build and local production-mode container smoke pass: non-root `node`, committed migrations/real PostgreSQL, four role sessions and production cookie flags, direct 401/403 checks, exact $89.60 quote/place/replay, immutable catalogue-edit purchase, atomic explicit late confirmation with two prep units/drop/ordered events, repeat manual processing and future rejection. This appends labelled synthetic fixtures without resetting reviewer data. Temporary container/environment copy were removed; no hosted HTTPS browser or published-image claim.

The manual screen's two production cases supersede the earlier focused development check. Browser/container fixtures append labelled synthetic records without resetting existing work. A meaningful transfer regression caught asynchronous selectors clearing saved address/packaging; controlled values now retain them. Older configuration tests now search the intended paginated item and identify its exact diagnostic rather than assuming first-page placement or a single global missing-price message. Strict business assertions remain intact.

## Demo accounts and reviewer walkthrough

These intentionally public credentials are for synthetic staff only; the database stores password hashes.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@test.com` | `Test@1234` |
| Kitchen | `kitchen@test.com` | `Test@1234` |
| Dispatch | `dispatch@test.com` | `Test@1234` |
| Driver | `driver@test.com` | `Test@1234` |

Run local setup, open the web app and sign in with each account in a fresh session. Check the correct landing page (Admin `/dashboard`, Kitchen `/kitchen`, Dispatch `/dispatch`, Driver `/today`), refresh to retain the session and sign out. The three operational roles currently have landing pages; kitchen/dispatch/driver transitions and invoices follow Phase 3/4. Anonymous `/api/v1/auth/me` returns 401; non-Admin configuration and Admin order HTTP requests return 403.

Phase 1 Admin walkthrough:

1. Open **Catalogue** at `/catalogue`: inspect dish fields, reusable options, ordered groups and reference lists including portion sizes. Edit a record, save and refresh to confirm persistence. Retire through the active flag rather than deleting a referenced dish.
2. Open **Pricing** at `/pricing`: select **Standard** in the matrix to see explicit dish/option prices and the deliberately missing soup price. Select **Cost plus 15%** to see the rice dish's 211-cent cost resolve to 245 cents through exact derivation and upward five-cent rounding. An explicit override of 211 cents remains 211; clearing an override restores the tier rule or missing status.
3. Open **Menu** at `/menu`, choose employee preview and the demo employee. Standard shows the priced rice box; the unpriced soup is excluded with a diagnostic. Use the Chef's preview direct category link to see its priced secret dish. Secret links still respect company hiding. Categories/items can be created, ordered, edited and retired here.
4. Open **Companies** at `/companies`: edit billing, calendar, price tier, packaging/driver/default address and hidden categories/items. Selecting **Company manual** demonstrates a missing company-tier price without fallback. Refresh employee preview after changing restrictions. Add a company with its initial employee owner and full address; duplicate/public domains and owners from another company are rejected.
5. Open **Employees** at `/employees`: configure allergy/preference guidance and delivery choice flags. Transfer an employee using the dedicated action; an owner requires a replacement from the source company. A conflicting normalized target email rolls back the transfer and replacement.
6. Open **Settings** at `/settings`: edit kitchen working days, holidays, cutoff time/count, default tier and risk minutes; save and refresh. Preview 7 October 2026 with two days and 16:00: weekdays give 5 October 16:00 IST; adding the kitchen holiday 5 October gives 2 October 16:00 IST. A company's holiday affects delivery eligibility without shifting that cutoff. A stale browser save returns a reload-required conflict.

Phase 2 Admin walkthrough:

1. Open **Orders → Create order**, select an active employee and delivery date with a future kitchen cutoff. Company defaults and employee choice flags control saved address, delivery time and packaging. Open a secret category preview explicitly if required; the same visibility/pricing restrictions apply.
2. Add a dish and allocate its line quantity across combinations. Select one option in every required group and zero/one in optional groups. Options start unselected. For the six/four example, configure dish $8.00 with two grain options $0.80/$1.20, then enter six/four meals on one line: the server total is $89.60.
3. **Save draft**, then use **Edit / place draft** to revise it. **Review server quote** shows current prices, delivery, cutoff and allergy guidance. Check **I accept this server quote** before placing. Input changes clear acceptance; a live price change replaces the quote and requires renewed acceptance. Saved Draft placement retains a successful save if placement must be retried.
4. On the detail page inspect **Current delivery**, **Recorded purchase**, immutable revision history and **Progress timeline**. Change a catalogue price/name and reload: the recorded purchase stays unchanged. A permitted Placed purchase revision before cutoff requires a fresh accepted quote; employee transfer blocks further purchase edits while preserving original billing.
5. Cancel/reject with a reason while permitted. Use a separate **Override delivery** action for reasoned logistics corrections, including a custom address. Corrections preserve purchased amounts and regroup Confirmed work before departure. Terminal purchases stay frozen; delivered billing adjustments follow Phase 4.
6. To review a late purchase without changing the clock, create a new order for an allowed date whose cutoff is already passed, enable **Explicit Admin placement exception**, enter a reason, review/accept the quote and **Place with Admin exception**. It immediately returns Confirmed with unique prep units/drop and placement-before-confirmation events. A saved Draft exception places its stored choices; unsaved changes are discarded visibly.

Manual past-cutoff instructions: open **Orders → Process passed cutoff**, choose a delivery date and preview its kitchen cutoff. Only an already-passed cutoff can be processed. The authenticated `POST /api/v1/cutoffs/process` returns confirmed/cancelled/skipped/failed counts and failed-order links; future processing returns `400 CUTOFF_NOT_PASSED`. Due Drafts cancel and due Placed orders confirm their recorded amounts exactly once. Startup catch-up/minute scans may already have processed them, so a repeat correctly reports skipped records; an empty eligible date reports zero transitions. The manual action shares the automatic processor. No clock change is required.

The remaining full journey is Confirmed → Kitchen completion → Dispatch departure → Driver delivery → Admin invoice/payment/credit, implemented in Phase 3/4.

The initial Phase 1 seed contains four staff accounts; Fernleaf Demo Labs with a seven-day company calendar, owner plus one employee and an address; three tiers (Standard/manual, Cost plus 15%, Company manual/missing); three dishes including unpriced soup and a secret dish; one reusable option/required group; normal/secret categories; packaging, stations, allergen/dietary/portion references and a public-domain denylist. The kitchen starts with Monday–Friday, no holidays, 16:00, two cutoff working days, Standard default and a 15-minute risk threshold. There are no operational orders/drops/invoices yet.

Configuration initializes atomically only when the singleton settings row is absent. Once initialized, rerunning `pnpm db:seed` skips configuration completely, preserving reviewer edits, employee transfers and intentionally removed prices/groups/domains. It continues to insert missing demo staff without overwriting existing accounts. This is an initial fixture installer, not a repair/reset tool; do not delete settings to refresh review data.

Future scenarios: at least three companies, 20–30 employees, 12–15 dishes/options/groups, coherent past/today/next-week orders and unpaid/paid/credited invoices. A separate fixture builder will use scenario/date unique keys. Startup catch-up and kitchen-midnight jobs must append missing current-day fixtures without resetting reviewer edits; a seven-day demo company/calendar will keep valid Driver work on weekends. Ready/out-for-delivery own-today drops will have clearly labelled synthetic prior history. **Rolling operational fixtures are planned for Phase 4/5, not implemented or deployed.**

## Deployment and two-week availability

[Deployment runbook](docs/deployment.md) covers monorepo settings, variables, migration/seed order, health, HTTPS cookies/origins, logs and recovery. Hosting access is pending; no provider project, production database, live URL or hosted HTTPS cookie verification is claimed. Production cookie attributes passed the local API container smoke.

The target is Vercel web and an always-running Railway API/PostgreSQL in one project/region. Verify account eligibility/current limits and budget before provisioning. Future scheduled jobs need an awake process/catch-up/logs; sleeping-host fallback needs a separately scheduled authenticated trigger and cold-start tests. Paid purchases and hiring-form submission are not authorised by commit permission.

Keep the deployment live at least **14 days after actual submission**. If submitted on 4 October 2026, the corresponding earliest end is 18 October at the same time. Record actual submission/retention timestamps, funding/quota, backups and ownership when deployed; check health and all-role login during review. Do not rely on unverified trial expiry. The actual Google Form/source email is unavailable and has not been submitted.

## Resume point and next phase

**Phase 2 implementation and local gate are complete.** Read [Phase 2 evidence](docs/phase-2.md), inspect Git state and preserve existing records. Two additive migrations are applied to development and guarded `_test` databases. The 118 backend tests, 20 production browser cases, lint/types/build and final API image/container smoke pass. There are no Phase 3 board/driver transitions or invoices yet.

Confirmed user decisions: (1) late Admin placement needs a reason and accepted server quote, with immediate shared due confirmation; (2) employee transfer blocks further Placed purchase edits, retaining original company/purchase and explicit logistics/cancellation actions; (3) Option A on 4 October: required exactly one/optional zero-or-one; reject duplicate dish lines; ordinary saved company addresses and reason-required custom-address Admin exceptions. These policies are implemented and verified. `rules.md` invariants 6/7 preserve the explicit choices.

Publication: Phase 2 completion commit [`917143c`](https://github.com/dishitabuilds/fernleaf-kitchen/commit/917143c8ce40ecf96fb544631506dcecfe6cab48), `feat(phase-2): complete orders and cutoff processing`, was pushed to public `origin/main`; the full remote hash matched `917143c8ce40ecf96fb544631506dcecfe6cab48`. [Clean-checkout CI passed](https://github.com/dishitabuilds/fernleaf-kitchen/actions/runs/37150985847) in 2m11s. This documentation follow-up records the actual publication proof; use `git log` for subsequent documentation commits. Hosted Phase 0 proof and original-source verification remain open.

Order endpoints and `/orders`, `/orders/new`, `/orders/:id`, `/orders/:id/edit` are registered and browser verified. Development servers were restarted: direct/proxied PostgreSQL health, `/login` and `/orders/new` return 200. Restart local development when needed with `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1`; it checks setup and starts PostgreSQL/API/web without resetting data. Use `http://localhost:3000`, Admin `admin@test.com` / `Test@1234`, then **Orders**. Do not reset the development database to refresh scenarios.

Phase 1's phase commit `a44792c` and final retry fix `47279c3` were pushed/remote verified with successful clean-checkout CI; [Phase 1 evidence](docs/phase-1.md) preserves its 65-test/14-browser baseline and 100 focused race pairs. Current diagrams now show implemented order/cutoff behavior and clearly planned fulfilment/billing actions. Use `git log` for current phase/documentation commits.

Hosting access remains the precise deployed-gate blocker; configure the prepared services and run deployed sign-in, unauthorized-access and production-database checks when access is available. The original assignment PDF/submission instructions remain missing. There is no live URL or deployment claim.

Stop after the requested Phase 2 report until another phase is authorised. **Next concrete task: Phase 3 kitchen → delivery.** Read blueprint sections 12–15, reuse recorded combinations and exact drop membership, implement the station board/start/complete/readiness/risk and reasoned force-completion, then driver assignment/dispatch steps/mobile own-today delivery. Verify one order across all roles, invalid transitions and concurrent final-unit/drop updates. Include packaging-only logistics/readiness behavior before adding dispatch actions. Preserve the Phase 0 hosted gate until live checks pass. Prioritize Must workflows for the 4 October 23:59 IST deadline; keep acceptance checks and phase pushes. Fresh conversations read rules/README, inspect Git and consult the relevant blueprint first.
