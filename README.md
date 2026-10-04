# Fernleaf Kitchen

An internal kitchen operations application for companies buying individual boxed meals for their employees. Staff enter orders, Kitchen prepares meals, Dispatch organises deliveries, and Driver completes assigned drops. Companies owe the money; employees have no login or payment flow.

The mandated stack is **Next.js + NestJS + Prisma**. This repository uses TypeScript, pnpm workspaces and PostgreSQL. The frontend calls the backend over HTTP; Prisma and authoritative business rules belong to NestJS.

## Current progress and sources

The last application-code commit on **4 October 2026** is `7c975ea5cdba62ce9cc42c77ea548a4832ddd0b1` on public `main`, pushed with [green CI](https://github.com/dishitabuilds/fernleaf-kitchen/actions/runs/37219674521). Vercel Production was Current/Ready at the stable web domain and Render reported a successful deployment of that exact application commit. The documentation-only commit containing the final submission evidence below follows that application commit without changing application behaviour. Published head, CI and provider deployment identities must match before submission.

Billing, staff management, role dashboards, rolling fixtures, portions, employee CSV import and optional delivery photos are implemented. Earlier phase and takeover checks remain historical evidence in [release evidence](docs/release-verification.md), [billing evidence](docs/phase-4-release.md) and [fixture instructions](docs/demo-fixtures.md). The original eight-page assignment PDF (`hiring-assignment-admin-panel.pdf`, kept locally and not committed) was read fully again for the final submission check on 4 October; all eleven Must areas match the requirement matrix below. The blueprint and `rules.md` remain the execution sources.

| Delivery record | Actual status |
| --- | --- |
| Repository | [dishitabuilds/fernleaf-kitchen](https://github.com/dishitabuilds/fernleaf-kitchen), public verified 4 October |
| Branch / remote | `main`; pushed application commit `7c975ea5cdba62ce9cc42c77ea548a4832ddd0b1`, CI green |
| **Live web** | **https://fernleaf-kitchen-pied.vercel.app** · Vercel Hobby, Next.js; Production Current/Ready and stable domain assigned to the application commit |
| **Live API** | **https://fernleaf-kitchen-api.onrender.com** · Render Free, Docker, PostgreSQL 17 |
| API health | `{"status":"ok","database":"connected","service":"fernleaf-api"}` ✅ |
| Deployed application commit | `7c975ea5cdba62ce9cc42c77ea548a4832ddd0b1` on `main`; Vercel and Render deployment success verified |
| Phase 6 commits | `e408bc3` delivery photo, `4bf7556` portions, `9d50e0c` CSV import: included in the pushed/deployed application commit; local verification is recorded in Tests. Final live spot checks have a separate evidence record. |
| All four logins | admin / kitchen / dispatch / driver @ test.com with `Test@1234` verified on deployed API ✅ |
| Permissions | Unauthenticated 401, Kitchen→Settings 403, production cookie `__Host-fernleaf_session` Secure/HttpOnly/SameSite=Lax ✅ |
| Proxy rewrite | Vercel `/api/v1/health` → Render API health confirmed ✅ |

Normal commits, pushes and production deployment are explicitly authorised. New charges need a separate decision; the hiring form must not be submitted.

## Scope and four roles

All eleven blueprint functional areas are Musts. Portions and employee CSV import are explicit Shoulds. Delivery photo is optional within the required driver workflow. All three are now implemented (Phase 6): driver delivery photo, portions, then employee CSV import. Decorative polish remains deferred.

| Role | Responsibility | Current surface |
| --- | --- | --- |
| Admin | Configure catalogue/pricing, companies/employees, staff/settings; manage orders, overrides and billing | Configuration, orders, overrides, billing/credits, staff management and financial summaries |
| Kitchen | Prepare active confirmed orders and monitor readiness/risk | Station/status/date board, unit start/complete and order readiness; Phase 3 locally verified |
| Dispatch | Assign drivers, check grouped-drop readiness and record departure | Date/status grouped drops, active Driver assignment, readiness/departure and member details; locally verified |
| Driver | Read/complete own assigned drops for kitchen-local today | Own-today route/detail, contact/instructions and grouped delivery; phone/browser locally verified |

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

When the launcher starts new servers, keep that terminal open while using the app; Ctrl+C stops development. If a healthy Fernleaf instance is already running, it reports the existing URLs and returns successfully without starting another instance or invoking Docker. The launcher uses the local default ports 3000/3001, resolves the project from its own location, checks environment files/dependencies for a new start, adds pnpm's directory to PATH for nested commands, and restores the caller's location/PATH afterward. It does not migrate, seed or reset data. Reviewers on a fresh checkout should install pnpm normally and complete the first-time setup below. For direct workspace commands on this workstation, first run `$env:PATH = (Join-Path (Get-Location) '.tooling/node_modules/.bin') + ';' + $env:PATH` from the repository root.

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

`EADDRINUSE` on port 3000 means another process already owns the web port. This occurred when the launcher was run again while the development servers left running for review were still healthy. The launcher now checks occupied ports first: both direct/proxied health responses must identify `fernleaf-api` with a connected database, and `/login` must contain the Fernleaf staff form without redirects. A healthy existing pair is reused with exit 0. Partial startup, an unhealthy instance or unrelated listeners produce an actionable error without starting duplicate servers or stopping any process. If a server is still starting/recompiling, wait for both services to become ready and retry. If PostgreSQL was stopped while the servers stayed running, run `pnpm db:up` and retry. To restart, stop the original development terminal with Ctrl+C first. For a background instance or another application, identify the owning process before stopping it; do not stop all Node processes:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 |
  Select-Object LocalPort,OwningProcess
```

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

`pnpm test` aliases `pnpm test:integration`; normally run either rather than repeat both. Integration tests clean/reseed only the guarded `_test` database. Browser checks exercise production builds and append labelled scenarios through the API. Phase 3's reassignment case needs a test-only second Driver, so run the complete suite against a **separate local database ending `_browser_test`**, using the setup below. Playwright starts API/web servers automatically, or reuses already-running servers at its URLs; stop the original development terminal before testing so it cannot accidentally reuse the application database. Install/build/migrate/seed first. Record actual results below; a listed command is not proof it passed.

For the example Compose database, create `fernleaf_browser_test` once (skip creation if it already exists), then prepare the isolated suite. The environment override is restored afterward; none of these commands reset the application database:

```powershell
docker compose exec -T postgres psql -U fernleaf -d fernleaf -c "CREATE DATABASE fernleaf_browser_test;"
$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = 'postgresql://fernleaf:local_development_only@localhost:5432/fernleaf_browser_test'
  pnpm db:migrate
  pnpm db:seed
  pnpm test:seed-browser
  pnpm build
  pnpm test:e2e
} finally {
  if ($null -eq $previousDatabaseUrl) {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:DATABASE_URL = $previousDatabaseUrl
  }
}
```

`pnpm test:seed-browser` calls the guarded `apps/api/prisma/seed-browser-test.ts`: it accepts only a local database name ending `_browser_test` and inserts a missing `replacement-driver@test.com` / `Test@1234` Driver without changing existing records. An edited/inactive/non-Driver fixture requires explicit review; the script does not reset it. This account is **browser-test-only**, separate from the four main demo accounts below. CI uses the same isolated setup. The default main seed still creates exactly those four demo identities.

`pnpm test:kitchen-load-ui` is a separate, read-only operational workload check. It requires `E2E_BASE_URL` to an already-running local HTTP web/API connected to the prepared guarded 400-order dataset, starts no servers and creates no business fixtures. See [Phase 3 workload instructions/evidence](docs/phase-3.md); its `.check.ts` case is excluded from normal E2E discovery.

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
| `GET /kitchen`, `GET /kitchen/orders/:id` | Admin/Kitchen `prep.read`; filtered/paginated Confirmed work and operational preparation detail (Delivered preparation is readable history) |
| `POST /prep-units/:id/start`, `/complete` | Admin/Kitchen `prep.start/complete`; version/action-ID-protected unit transitions and atomic aggregate readiness |
| `POST /kitchen/orders/:id/force-complete` | Admin `prep.force-complete`; reason-required completion of unfinished units, preserving existing starts and appending history |
| `GET /drops`, `/drops/:id`, `/drops/drivers` | Admin/Dispatch `dispatch.read`; date/status-filtered groups, operational member details and active Driver choices |
| `POST /drops/:id/assign`, `/dispatch-ready`, `/depart` | Admin/Dispatch; active Driver selection, all-member readiness validation and departure-target capture |
| `POST /drops/:id/deliver`, `/correct` | Admin; atomic grouped delivery or reason-required departed/delivered address/time correction preserving original target/outcome |
| `GET /driver/today`, `/driver/drops/:id`, `POST /driver/drops/:id/deliver` | Driver own-today capability routes; session ID/current kitchen date apply on reads, mutations and action replay |
| `POST /settings/check-access` | Admin `settings.manage`, exact origin and CSRF; returns `{allowed:true}` and writes no configuration |

Undeclared route access policies fail closed. Future business capability names are already in the central map, but their declaration does not create those endpoints or implement resource ownership/date checks. Errors have `code`, `message`, optional `fieldErrors`, public `details` and `requestId`; `QUOTE_CHANGED` carries the replacement quote, while calendar conflicts identify affected orders. `X-Request-Id` identifies requests and API responses use `Cache-Control: no-store`.

| Folder | Responsibility / status |
| --- | --- |
| `apps/web` | App Router, login, configuration/order forms, quote/history, Phase 3 Kitchen/Dispatch/Driver worklists/details and typed HTTP client |
| `apps/api` | NestJS auth/access/health, configuration, orders/cutoffs, kitchen/drops/driver operations and pure money/calendar/combination/timing rules |
| `apps/api/prisma` | Staff/configuration/order/history/cutoff/prep/drop schema, Phase 3 operational version/event/replay additions, additive migrations and reviewer-safe configuration seed |
| `packages/contracts` | Public roles, permission identifiers, request/response contracts |
| `tests/integration` | Auth/access, money/calendar/combinations, real PostgreSQL configuration/order/cutoff/history/concurrency checks |
| `tests/e2e` | Browser role/auth/configuration, draft/quote/place/history/exceptions and manual cutoff through the HTTP rewrite |
| `scripts/dev.ps1` | Windows development launcher: validates setup, starts Compose PostgreSQL and runs API/web in the foreground |
| `docs` | [Architecture](docs/architecture.md), [lifecycle diagrams with status labels](docs/diagrams.md), [Phase 1 evidence](docs/phase-1.md), [Phase 2 evidence](docs/phase-2.md), [current Phase 3 record](docs/phase-3.md) and [deployment runbook](docs/deployment.md) |
| `Dockerfile.api`, `railway.json` | Repository-root API deployment foundation |

Implemented modules: auth/access/health, catalogue/menu/pricing, companies/employees, settings, orders/cutoffs, kitchen/drops/Driver operations, billing, staff, rolling demo fixtures and role dashboards. Orders use exact combinations, accepted server quotes, snapshots, a lifecycle/timeline and shared due processing. Billing handles invoices/payments/credits; demo jobs append dated fixtures; dashboards return role-scoped aggregates. Recorded local verification and final focused live checks are tracked separately. Controllers stay thin; database access remains in the API.

## Actual data model

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
    DISH_OPTION_GROUP ||--o{ GROUP_PORTION_SIZE : sells_sizes
    REFERENCE_VALUE ||--o{ GROUP_PORTION_SIZE : portion_size
    GROUP_OPTION ||--o{ OPTION_PORTION_PRICE : surcharge
    GROUP_PORTION_SIZE ||--o{ OPTION_PORTION_PRICE : per_size
    OPTION ||--o{ GROUP_OPTION : reused
    PRICE_TIER ||--o{ DISH_TIER_PRICE : prices
    DISH ||--o{ DISH_TIER_PRICE : has
    PRICE_TIER ||--o{ OPTION_TIER_PRICE : prices
    OPTION ||--o{ OPTION_TIER_PRICE : has
    REFERENCE_VALUE o|--o{ DISH : station
    REFERENCE_VALUE o|--o{ COMPANY : packaging
    COMPANY ||--o{ INVOICE : receives
    INVOICE o|--o{ ORDER : immutable_membership
    INVOICE ||--o{ BILLING_CREDIT : adjusts
    ORDER ||--o{ BILLING_CREDIT : bounded_credit
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
    DELIVERY_DROP ||--o{ DROP_EVENT : operational_timeline
```

Each account has one role. Normalized email is unique. Both IDs are UUIDs. Only the SHA256 hash of a random opaque cookie token is stored. Sessions have indexes on user/expiry and cascade when their staff user is deleted. Staff has creation/update timestamps; sessions have creation/expiry timestamps. Expiry, current role and active status are checked on protected requests; logout revokes the session. The final migration/schema is authoritative.

Phase 1 enforces one non-null company per employee, normalized unique company domains/SKUs, one explicit price per item/tier and a single settings/default-tier relationship. Composite foreign keys require company owners/default addresses to belong to that company. Employee email is normalized and unique within its company. Company creation inserts its first owner/address in one transaction; transfers replace an outgoing owner first and roll back on target-email conflicts. Calendar arrays use weekdays `0=Sunday` through `6=Saturday` and local-date holidays; API validation checks real dates and unique days. References have one kind and retire through `active` flags, retaining existing joins.

Two additive Phase 2 migrations contain orders, combinations, purchase/history/action records, cutoff policy dates, pending prep units and grouped drops. An order retains its original company independently of the employee's current company. Historical option/group IDs have no live-group foreign key, so replacing a catalogue group cannot erase a purchase. Immutable revision/event records have update protection; an insertion sequence resolves equal-timestamp timeline ordering. Actor/action keys deduplicate retries, and a composite drop foreign key enforces same-company membership. Backend and builder/browser gates pass.

Phase 3 migration `20261004030000_phase_3_operations` adds preparation versions, actual drop kitchen readiness, DropEvent timeline and OperationalAction replay results; `20261004030500_operation_history_immutable` protects DropEvent against updates; `20261004031000_readiness_history_system_actor` allows automatic readiness events with no staff actor. All eight migrations passed on development, guarded integration-test and separate browser-test databases without resetting reviewer data. OperationalAction has unique `(actorId,key)` and binds the exact target/payload hash to a successful response; its historical actor ID is a scalar rather than a live-user foreign key. Prep/dispatch/Driver core behavior is implemented; both confirmed policies and final regression/browser checks pass. Invoices and rolling fixtures remain later phases. See [current architecture](docs/architecture.md), [lifecycle diagrams](docs/diagrams.md), [Phase 2 evidence](docs/phase-2.md) and [Phase 3 record](docs/phase-3.md).

Phase 6 migrations: `20261004150000_delivery_photo` adds nullable `DeliveryDrop.photo` (bytea) and `photoMimeType` with a both-or-neither check. `20261004160000_option_portions` adds `GroupPortionSize` (group, size, order) and `OptionPortionPrice` (group, option, size, surcharge ≥ 0). Composite foreign keys tie each surcharge to the group's own `GroupOption` and `GroupPortionSize` rows. It also adds nullable `portionSizeId`/`portionName`/`portionSurchargeMinor` to `SelectionSnapshot`, with an all-or-nothing check.

## Phase 6: portions, employee CSV import and delivery photo

**Portions (4.1 Should).** Portion sizes are the admin-managed `PORTION_SIZE` reference list (seeded Regular, Large). In **Catalogue → Option groups**, a group may tick the sizes it sells. A group *uses portions exactly when it lists at least one size*, so there is no separate flag that could disagree. Saving a portion group is rejected (`GROUP_PORTIONS_INVALID`) unless **every option in it has a surcharge for every one of its sizes**. Surcharges for options or sizes outside the group are also rejected. Use 0.00 for "no extra charge".
- Ordering: every selection in a portion group must name a size the option is priced in (`PORTION_REQUIRED` / `PORTION_INVALID`). A size on a selection in a group without portions is rejected (`PORTION_NOT_OFFERED`).
- Price: selection price = option tier price + surcharge. Combination price = (dish price + Σ selection prices) × quantity, in bigint minor units.
- History: the selection snapshot records size id, name and surcharge, so editing surcharges later never changes a past order. This is covered by a test.
- Kitchen: the size is part of a combination's canonical key, so "Paneer · Regular" and "Paneer · Large" are separate prep units. Unportioned selections keep their original two-part key, so existing orders and prep units are unaffected.
- Deactivated sizes: a deactivated size stops being sold. A portion group whose sizes are all inactive offers no options, so a *required* one hides the dish (`REQUIRED_GROUP_NO_PRICED_OPTION`).
- Demo data: an optional **"Extra protein (choose a size)"** group (Paneer cubes / Smoked tofu, Large +$1.20 / +$1.00) on Paneer tikka bowl, Chickpea vegetable curry and Tofu stir fry. It installs idempotently on the next seed.

*Interpretations:* "an extra charge on top of the option's own price" is read as **one flat surcharge per option × size, the same on every price tier**. Tier pricing still applies to the option itself. Surcharges are configured per group, so the same option can be sized differently on different dishes.

**Employee CSV import (4.5 Should).** Go to **Employees → Import employees from CSV**, choose a company and a file. The API is `POST /api/v1/employees/import` with `{ companyId, csv, dryRun? }`, Admin only.
- Header: `name` and `email` are required. Optional columns are `phone`, `can_choose_address`, `can_change_time`, `can_change_packaging` (yes/no, true/false or 1/0; blank = no), plus `allergens` and `dietary_tags` (reference names separated by `;`, case-insensitive). Header names are case-insensitive.
- Row-level errors: each row is validated independently and reported by **physical line number** with every problem found (missing name, bad email, email already in the company, email repeated in the file, misspelled flag, unknown allergen/tag, too many cells). Valid rows are inserted together in one serializable transaction and invalid rows are skipped, so **one bad row never rejects the file**. *Check file* runs the same validation without writing anything.
- Whole-file rejection: only a file that cannot be read as a table is rejected — empty, unknown or missing columns, duplicated column, unclosed quote, or more than 2,000 rows.
- *Interpretations:* import **creates only**; it never updates an existing employee (the same email in that company is a row error), so re-running a file is safe. Employee emails are not required to match the company's domains, consistent with manual employee creation.

**Driver delivery photo (4.8 optional).** On the stop screen the driver can add a photo with the phone camera (`capture="environment"`) together with the optional note.
- Upload: the browser downsizes the image to at most 1600 px as JPEG before upload, to suit mobile data.
- Validation: the API accepts only `image/jpeg|png|webp` data URLs whose **file signature matches** the declared type, at most 2 MB decoded (`PHOTO_INVALID` / `PHOTO_TOO_LARGE`). The JSON body limit is 3 MB.
- Storage: bytes are stored with the drop and served from `GET /drops/:id/photo` (Dispatch/Admin) and `GET /driver/drops/:id/photo` (the assigned driver, own drops for today only; other drivers get 404). Drop responses carry only `hasPhoto`, so dispatch lists never load image data.
- The delivery event records `hasPhoto` and the byte size. *Trade-off:* PostgreSQL storage avoids a second paid service on free hosting, at the cost of database size, which is bounded by the 2 MB limit and one photo per drop. Object storage would be the next step at real volume.

## Decisions and preserved business rules

| Area | Decision / reason / implementation boundary |
| --- | --- |
| Database | PostgreSQL for relationships, constraints and transactions. Prisma belongs to NestJS. SQLite does not substitute for PostgreSQL concurrency evidence. |
| Authentication | scrypt password hashes; random opaque session tokens hashed in PostgreSQL, expiry and logout invalidation. HttpOnly cookies keep tokens out of browser JavaScript. |
| CSRF | Exact mutation origin plus CSRF token. CORS alone is insufficient. Login and authenticated mutation policies need direct HTTP evidence. |
| Permissions | Central capability map enforced by NestJS against current role. Hidden buttons are presentation. Operational Driver reads/writes/replay additionally enforce session ownership and current kitchen date. |
| Frontend | HTTP rewrite keeps same-origin cookies and the required Next-to-Nest boundary. Typed forms fetch/save through NestJS and report server validation errors. |
| Money — implemented | USD integer cents bounded to PostgreSQL Int, exact BigInt/rational intermediates. Derived unit prices round upward to five cents; explicit overrides retain entered cents, including zero. Order combinations/lines/totals reconcile exactly; invoice reconciliation follows Phase 4. |
| Time — implemented | Asia/Kolkata dates/cutoffs and UTC instants; injectable real clock. Scheduled/startup/manual processing share a due-only workflow. Ordinary actions lock at `now >= cutoffAt` even before a job runs. Processed date policies stay frozen. |
| Snapshots — implemented | Placement freezes company, delivery, dish, option and price values. Fresh accepted quotes create immutable placed revisions. User-confirmed transfers block purchase edits; logistics corrections preserve the purchase. |
| Transactions — implemented through operations | Short serializable writes retry serialization conflicts up to three attempts; versions reject stale saves. Actor-scoped action IDs replay committed responses and reject reuse with different input. Confirmation/readiness/grouped delivery/history are atomic. Every membership change versions its drop, including an unchanged readiness state or travelling-member cancellation. Focused operational races pass; full 143-test regression passes and invoice races are covered by the release billing suite. |
| Company ownership and references | Composite owner/address foreign keys require same-company membership. Active owners/default addresses cannot retire before replacement. Reference kinds are checked on writes; active packaging/station usage blocks retirement. |
| Seed preservation | Four missing staff accounts are inserted without resetting edited accounts. Configuration installs once in one transaction when settings is absent; later seed runs preserve edits and deliberately removed prices/groups/domains. |
| Hosting | Vercel Hobby web and Render Free API/PostgreSQL; retained Railway configuration is an alternative. Render sleeps when idle, so startup catch-up and external maintenance support due processing and rolling fixtures. No new purchase or hiring-form submission. |

Pricing, configuration, combinations, quotes/snapshots, lifecycle and cutoff processing have recorded local verification, including real browser order journeys. Kitchen/dispatch/Driver core transitions have 23 passing focused PostgreSQL tests; billing has focused PostgreSQL/API verification. These historical checks complement the narrower final production spot checks:

- **Pricing:** choose company tier or default tier; explicit price wins within that tier, otherwise valid cost/reference derivation, otherwise missing. Missing company-tier items do not fall back to another tier. Reject reference cycles. For rational `N/D` cents, rounded derived cents = `5 * ceil(N / (5 * D))`: $2.11 → $2.15; $2.10 remains $2.10. Missing-price options are unavailable; hide dishes with no price or no priced option in a required group.
- **Menu/configuration:** require active category/menu item/dish, company visibility and effective prices. Secret categories are absent from normal preview but have direct staff preview links applying the same restrictions. Ordered required/optional groups reuse options. Employee allergen matches appear as warnings; dietary preferences are guidance and do not automatically remove food. References include portion sizes before the Should portion workflow.
- **Company/employee:** normalize domains with lowercase/IDNA, reject malformed and data-listed public providers, require at least one domain and enforce global domain uniqueness. A denylist does not verify domain ownership. Each employee belongs to one company, with normalized email unique within that company. Owner transfers require an active source-company replacement and roll back every change on failure. Order requests enforce employee address/time/packaging flags against company defaults. Ordinary addresses must be active saved company addresses; custom addresses require a separate reasoned Admin override.
- **Combinations:** user-confirmed Option A requires exactly one option per required group and zero/one per optional group. Duplicate dish lines are rejected; enter variants as combinations on one line. Validation rejects foreign-group/duplicate selections and non-positive/fractional quantities, merges canonical duplicate combinations, enforces line totals/MOQ and checks overflow. Six $8.80 meals and four $9.20 meals total $89.60, producing two prep units of six/four meals upon confirmation.
- **Calendars/cutoff:** company calendar allows delivery dates. Count backwards from before delivery across kitchen working days/holidays only, then use kitchen cutoff time; zero days uses the delivery date. Wednesday 7 October 2026, two days, 16:00 → Monday 5 October 16:00; a kitchen Monday holiday shifts it to Friday 2 October if weekends are closed. Settings allow 0–30 cutoff working days and 0–1440 risk minutes. Ordinary order editing/cancellation locks at `now >= cutoffAt`.
- **Processing:** scheduled, startup catch-up and Admin/manual processing share an idempotent service. Due Draft cancels; due Placed confirms original amounts, creates unique work/drop membership and records events. Manual action rejects future cutoff. Policy changes cannot reopen processed dates; unprocessed policy changes recompute/catch up. Company-calendar edits cannot silently invalidate live orders.
- **Kitchen:** confirmation creates work only for active Confirmed orders, one unit per distinct combination on a line, with planned dispatch readiness = delivery minus captured travel minutes and kitchen readiness another 30 minutes earlier. Phase 3 implements Pending → Started → Done; direct completion records both times. Earliest unit start is order start; all units must be Done for readiness, using latest completion. Unfinished work is late strictly after its planned time, at risk within the configured threshold including the exact deadline, and an exception if timing is missing. Repeated transitions do not duplicate work/history; reason-required Admin force completion fills unfinished units while retaining existing starts.
- **Orders/drop states:** Draft, Placed, Confirmed, Delivered, Cancelled, Rejected are commercial states; Delivered is a Phase 3 transition. Exact company, canonical actual address and delivery instant group drops, independent of employee/packaging. Phase 3 drop progression: Awaiting kitchen → Kitchen ready → Dispatch ready → Out for delivery → Delivered. Departure requires driver; delivering atomically updates active members. Driver scope comes from session ID and current kitchen date. On-time = actual delivery ≤ departure-captured target; undelivered timing is unknown.
- **Overrides:** explicit Admin action/reason/timeline. The user confirmed new late placement with an accepted quote and immediate shared due confirmation. Employee transfers block further placed purchase edits while retaining original company/purchase, logistics corrections and permitted cancellation. Predeparture address/time corrections regroup/recalculate readiness and preserve prep history. Departed/delivered address/time corrections use the Admin drop-wide action, retaining actual history, original departure target and timing outcome; grouping-key collisions are rejected rather than silently merging travelling groups. A Delivered same-date historical metadata correction is allowed even if the company later closed that date; changing its date validates the current company calendar. The user confirmed that packaging invalidates dispatch readiness before departure and locks after departure, while reasoned Admin reassignment of an Out-for-delivery Driver is allowed (Dispatch stays before departure; Delivered retains its Driver). These additions have passing direct API tests; travelling Driver handover also has browser coverage. Delivered shortages/credits follow Phase 4.
- **Billing:** currently Confirmed/Delivered orders without invoice are eligible; Cancelled/Rejected excluded from new invoices. Selected orders belong to one company and can be claimed once transactionally. Gross = original immutable order totals. Invoiced cancellation adds full internal credit; delivered shortage may add reasoned partial credit. Credits cannot exceed the order amount or duplicate on retry. Mark-paid records settlement of the current outstanding amount. Net due = gross − credits − payments; negative means company credit. Issued totals/membership and paid history stay historical after later credits.

## Exact dashboard definitions

Operational screens and summaries use server records and the explicit kitchen timezone.

| Current screen / figure | Exact query and calculation | Purpose, missing data and intentionally omitted |
| --- | --- | --- |
| Kitchen `/kitchen`: matching preparation units | Count PrepUnit rows whose parent order is Confirmed on the selected Asia/Kolkata delivery date, applying optional snapshot station ID and Pending/Started/Done status. With no status filter, Done units on still-Confirmed orders are included. Delivered/Cancelled/Rejected parents are excluded. Pagination does not alter the total. | One combination is one unit, regardless of its meal quantity. Cards show recorded combination quantity separately. Null station is Unassigned; no matches is zero. Whole-date station/risk summaries use the definitions below. |
| Kitchen order detail: meals and completed combinations | Meals = sum recorded line quantities; complete = number of its prep units Done, denominator = all its prep units. Confirmed orders are actionable; Delivered order preparation can be read as history. | Earliest unit start is order start; latest completion is readiness only when every unit is Done. Missing actual timestamps are Not recorded. The board/detail omit prices and billing. |
| Kitchen risk labels | Each unfinished unit uses its order's planned kitchen-ready time: late if `now > plan`, at risk if `0 <= plan-now <= configured risk minutes`, otherwise on track. Done units are Complete; absent/invalid plan is Missing planned time. | Compare with current server clock and persisted risk threshold, initially 15 minutes. Missing plan is neither on track nor late. Late/at-risk summary counts are defined below; throughput is omitted. |
| Dispatch `/dispatch`: matching delivery groups | Count drops for selected kitchen delivery date and optional drop status with at least one Confirmed or Delivered member. Card order count is those member rows; meals are sum of their recorded line quantities. Cancelled orders are detached, and empty/cancelled-only drops are excluded. | Count one delivery group once, independent of employee/packaging. Driver absence is Unassigned, not an inferred assignment. Missing actual times are Not recorded. Whole-date state/unassigned summaries are now displayed. |
| Drop detail: planned/actual readiness and timing | Planned kitchen/dispatch deadline = minimum respective plan among eligible member orders; each order keeps its captured travel minutes. Actual drop kitchen readiness = latest member readiness once all are ready. Status is current gate; retained timestamps are last recorded actuals. Delivery on-time = actual delivery `<=` original target captured at departure. | Earliest member deadline is our interpretation for mixed captured travel times. Undelivered/missing target outcome is unknown. Address/time corrections retain original target and outcome. Costs/billing are omitted. |
| Driver `/today`: own matching stops | Same nonempty-drop/member count rules, additionally authenticated Driver ID and **current server-derived Asia/Kolkata delivery date**. Optional status filter; order by delivery instant then stable drop ID. Cards show grouped orders/meals, address, current state, readiness and completed delivery time/outcome. | Own today only, including completed history; no matches is zero. There is no browser-supplied driver/date. Next stop/completion/on-time summaries query all own-today valid drops; route optimisation is omitted. |

Kitchen, Dispatch and Driver lists default to 50 rows per page (API maximum 100), use server filters/pagination and poll every 30 seconds only while visible, refreshing on return to the tab and after actions. Station choices include all recorded stations on that date's Confirmed work independently of the selected status/page. Detail member counts and quantities cover the entire drop/order rather than only the visible board page. Allergy warnings match snapshot employee allergens against recorded dish/selected-option allergen IDs; they are guidance rather than automatic food filtering. Missing contacts/packaging/timestamps are labelled, and lists/errors/empty states stay explicit. [Phase 3 behavior and evidence](docs/phase-3.md) records the acceptance gate.

The role summaries are implemented on Admin dashboard, Kitchen/Dispatch boards and Driver today. Their actual definitions are below; [billing/dashboard release evidence](docs/phase-4-release.md) records reconciliation tests.

Operational grouping uses **delivery date in Asia/Kolkata**, not created-at date. Cancelled/Rejected orders and empty/cancelled-only drops are excluded from active work. Summary queues link to their operational worklists. Empty counts/sums = zero; zero-denominator ratios = **N/A**; missing data = explicit exception.

| Role / figure | Exact calculation and missing-data treatment | Purpose / intentionally omitted |
| --- | --- | --- |
| Admin: committed orders/meals | Selected delivery date: count Confirmed/Delivered orders; meals = sum their line quantities. Same-date Draft and Placed counts are separate. Cancelled/Rejected excluded. Missing quantities are exceptions. | Committed vs tentative demand; no profit, growth or forecast. |
| Admin: uninvoiced value | **All dates**: sum immutable `totalMinor` for currently Confirmed/Delivered orders without invoice membership. Cancelled/Rejected excluded. Missing totals are reconciliation exceptions. | Exact billing queue; no current-catalogue repricing. |
| Admin: invoice balance | **All invoices/all dates**: each balance = gross − credits − paid amount. Receivables = sum `max(balance,0)`; company credit = sum `max(-balance,0)`, displayed separately. Include paid history with later credits; cancellation never erases an issued invoice. Missing amounts are exceptions. | Reconcile actual balances; no payment processing/refund forecast. |
| Kitchen: remaining units/meals by station | Selected date: Pending/Started units on active Confirmed orders. Count units; separately sum combination quantities. Exclude Done and Delivered/Cancelled/Rejected orders. Null station -> Unassigned; missing quantities → exception. | Distinguish units from meals; no billing data or invented throughput. |
| Kitchen: late / at risk / missing plan | Same unfinished-unit scope. Late: `now > plannedKitchenReadyAt`. At risk: `0 <= plannedKitchenReadyAt-now <= riskThreshold` (default 15 minutes). Missing plan enters separate exception bucket, neither timing bucket. | Identify action needed; no favourable assumed timing. |
| Dispatch: state counts | Selected drop delivery date; nonempty drops with Confirmed/Delivered members. Waiting counts Awaiting kitchen; Ready combines Kitchen ready and Dispatch ready; Travelling counts Out for delivery; Delivered counts Delivered. Missing date is an exception excluded from date cards. | Drop-level queues; employees/orders in one drop do not multiply count. |
| Dispatch: unassigned | Selected-date nonempty drop, no driver, status Awaiting kitchen/Kitchen ready/Dispatch ready. Exclude Delivered/empty; departure requires an active assigned Driver. | Assignment queue; its overlap with state cards is labelled. No utilisation estimate. |
| Driver: own route/next stop | Session driver ID; **current** kitchen delivery date. Active valid drops have Confirmed members and are not Delivered; completed valid drops retain Delivered members. Sort `deliveryAt`, stable ID. Next stop = first active item. None = no remaining stop. Missing time → exception list outside ordered route. | Own-today actions; no other-driver/billing data, future-day substitution or route optimisation. |
| Driver: completion today | Own valid Delivered drops for current kitchen date / all own valid active/completed drops for that date; display both counts. Exclude empty/cancelled-only drops; zero denominator = N/A. | Drop-level route progress, one count per grouped delivery. |
| Driver: on-time today | Own Delivered drops for current kitchen date with valid captured target and actual time: numerator actual ≤ departure target; denominator all such eligible delivered drops. Missing target/actual → separate exception, excluded from ratio; no eligible delivered = N/A. Undelivered excluded. | Reproducible punctuality, no grace period or favourable missing-data assumption. |

## Requirement checklist and priorities

Numbers follow sections 4.1–4.11 of the original assignment PDF, read fully for this final check. Every Must area is mapped below. Status distinguishes implementation, recorded local verification and the focused final production checks; this is not a new exhaustive review of every business rule.

| Assignment area | Priority / phase | Current status | Verification / remaining gap |
| --- | --- | --- | --- |
| Accounts/access | Must / 0, 4 | Foundation implemented and locally verified | Current-role authentication plus staff CRUD, session revocation, last-Admin and assigned-Driver protection; release tests tracked separately |
| 4.1 Catalogue/references | Must / 1, 2 | Locally verified | Fields/groups/references/retirement pass; Phase 2 purchase snapshots survive catalogue/group edits |
| 4.1 Portions | Should / 6 | Implemented and locally verified | Complete size × option surcharge matrix enforced on save; required/forbidden size per selection; exact pricing, snapshots and separate prep units; unit + API + browser checks |
| 4.2 Menu | Must / 1 | Locally verified | Normal/direct previews apply activity/hiding/pricing/required options; API and browser checks pass |
| 4.3 Pricing | Must / 1 | Locally verified | Exact tiers/matrix/overrides, no missing fallback, cycles and five-cent rounding; rule/API/browser/race checks pass |
| 4.4 Companies | Must / 1 | Locally verified | Domains/addresses/billing/owner/defaults/calendars; FK/race/rollback and browser checks pass |
| 4.5 Employees | Must / 1, 2 | Locally verified | One company/transfer/replacement owner/email/flags/allergy guidance; crafted order flag enforcement and stable original-company purchases pass |
| 4.5 CSV import | Should / 6 | Implemented and locally verified | Partial success with per-line errors, dry run, in-file/company duplicate policy, 2,000-row limit; API + browser checks |
| 4.6 Orders/cutoff | Must / 2 | Implemented and locally verified | Draft/place/edit/cancel/reject, combinations, accepted quotes/snapshots, shared cutoff, list/detail/timeline/filters/overrides; 24 order/15 cutoff/14 combination tests and six new browser cases pass |
| 4.7 Kitchen | Must / 3 | Implemented and locally verified | 23 focused operational cases, full 143-test backend regression, three affected browser journeys and 400-order API/browser board evidence |
| 4.8 Dispatch/Driver | Must / 3 | Implemented and locally verified | Ownership/today, ordered transitions, atomic delivery, races, correction/history and mobile travelling handover verified |
| Delivery photo | Optional / 6 | Implemented and locally verified | Validated JPEG/PNG/WebP ≤ 2 MB stored in PostgreSQL, served by scoped endpoints; delivery still works without a photo; phone-width browser check |
| 4.9 Billing | Must / 4 | Implemented with recorded local verification | Multi-order claims, exact payment, internal credits, immutable billing snapshots and focused concurrency/API tests; live spot-check evidence is separate |
| 4.10 Settings | Must / 0, 1, 2 | Locally verified | Kitchen policy/defaults/references/preview, unprocessed cutoff recomputation/catch-up and frozen processed policies; version/race/cross-timezone checks pass |
| 4.11 Dashboards | Must / 4 | Four role summaries implemented | Definitions above; reconciliation and browser checks in release evidence |
| Non-functional rules | Must / every phase; 5 gate | Recorded local access, concurrency, money/calendar and workload verification | Historical backend/browser and 400-order API/browser evidence is local; later Phase 6 records 171 tests, lint/types/build. Final hosted access/core-flow spot checks are recorded separately, without a new production load test. |
| Submission/review | Must / 0, 5, 7 | Public repo, application push/CI and both provider deployments verified; focused live smoke passed | Original PDF reviewed; rolling fixtures implemented; final documentation commit requires matching push/deployment checks before submission. Keep resources live at least 14 days after submission. Hiring form remains unsubmitted. |

Portions, CSV import and optional delivery photos are implemented. Saved filters, shortcuts and decorative visuals remain deferred to prioritise business-rule correctness and submission verification; no Must area is downgraded.

| Phase | Current status | Acceptance gate |
| --- | --- | --- |
| 0 Foundation | **Deployed and verified** | All four logins, 401/403, production cookies, health with connected database, proxy rewrite ✅ |
| 1 Rules/configuration | Implemented and locally verified | PASS: missing/hidden items excluded, derived rounding correct, company/owner/domain rules enforced; lint/types/tests/browser/build/container pass |
| 2 Orders/cutoff | Implemented and locally verified | PASS: stable recorded purchases, exact repeated/concurrent confirmation and Draft cancellation, usable HTTP builder/detail/exception paths |
| 3 Fulfilment/delivery | Implemented and locally verified | Cross-role delivery, invalid/concurrent actions, phone journey and 400-order board pass; publication tracked separately |
| 4 Billing/dashboards/staff | Implemented and deployed | Invoice races, original totals/credits, role-summary reconciliation and staff CRUD |
| 5 Must release | **Implemented/deployed; focused final smoke passed** | All Must areas mapped with recorded local evidence; focused production access/current-data/core-flow checks recorded below. The 400-order workload check is local, not a fresh production load test. |
| 6 Should/optional | Implemented, pushed and deployed (photo, portions, CSV) | Recorded local PASS: 171 integration tests, lint, typecheck and production build after enhancements; included in the verified application deployment |
| 7 Review handoff | **In progress** | Deployment proof, accurate URLs, current-day data and two-week availability; form excluded by user |

## Interpretations and assumptions

Explicit requirements checked against the original assignment include four accounts/roles, Next/Nest/Prisma, all eleven Must areas, backend rules, immutable history, exact money, calendars, unique invoicing, current-day Driver data and two-week review availability. The blueprint records the deadline and public-repository instructions from the earlier email screenshots; those screenshots are not independently reverified by this final check.

Implemented choices through Phase 1: PostgreSQL/pnpm/TypeScript; opaque sessions; USD from dollar examples; Asia/Kolkata kitchen zone; Admin configuration; 15-minute default risk threshold; public-provider denylist without ownership verification; company-scoped normalized employee email; calendar arrays; typed reference table; allergy/preference guidance as warnings. Phase 2 user-confirmed choices: reasoned late placement with accepted quote/immediate due confirmation; transfer-blocked placed purchase editing; exactly one option per required group and zero/one per optional group; duplicate dish lines rejected; ordinary saved company addresses, with custom addresses requiring a separate reasoned Admin override. Phase 3 interprets departed address/time corrections as drop-wide, preserves original punctuality and uses the earliest member planned deadline for mixed captured travel times. The user additionally confirmed packaging invalidation/after-departure locking and reasoned Admin reassignment of travelling Drivers; their implementation and applicable recorded checks pass. These are documented interpretations/decisions, not additional wording attributed to the assignment PDF. Internal billing credits and tier-independent portion surcharges are implemented interpretations. Changes need documented reasons and evidence.

## Tests and actual evidence

**Phase 6 (4 October 2026, Node 24.10.0, PostgreSQL 16 local):**
- `pnpm lint`: PASS (0 warnings).
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS.
- `pnpm test`: PASS, **171 tests in 13 suites**, up from 163, including:
  - `combinations.spec` portion pricing, required/forbidden size and the stable legacy key;
  - `should-features.spec`, covering the portion matrix validation and Admin-only access, menu preview sizes, quote/snapshot/total reconciliation, unchanged totals after a surcharge edit, separate Regular/Large prep units, the CSV parser (quotes, CRLF, BOM), a mixed valid/invalid file with dry run, re-import safety and whole-file rejection cases;
  - `billing-release.spec` delivery photo validation (SVG and type-mismatched bytes rejected), byte-exact serving and role scoping.
- Browser smoke on local production builds:
  - the driver at 390 px delivered a stop with a note and a camera-size photo, which was resized to 1600 px and displayed;
  - the Admin portion editor showed the demo protein group with its surcharge matrix;
  - a CSV import created 1 row and listed 2 line errors.
- *Not run here:* the Playwright e2e suite and the deployed-app smoke for Phase 6.


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
| Windows repeat-start regression | PASS on 4 October 2026: PowerShell parsing; repeated launcher calls exit 0 with unchanged server PIDs; one occupied port and two unrelated TCP listeners are rejected while preserving those listeners; caller location/PATH restored on success and failure. Cold start retains PostgreSQL data, direct/proxied connected-database health and `/login` return 200, and Admin HTTP login/orders/logout return 200/200/204 with Origin/CSRF protection. `pnpm lint` passes. App is left running; no Phase 3 implementation was started for this fix. |

[Phase 1 evidence](docs/phase-1.md) and [Phase 2 evidence](docs/phase-2.md) retain earlier baselines. Phase 3 final lint/types/build passed; all **143 backend tests / nine suites** passed. Focused operational coverage passed **23/23**; final affected local production-build browser journeys passed **3/3 in 26.4s**. The local 400-order API and browser checks passed with bounded pages and station/status filters. [Phase 3 measured evidence](docs/phase-3.md) documents precise scope. Later billing and deployment evidence is separate from this historical Phase 3 result.

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

Run local setup, open the web app and sign in with each account in a fresh session. Check the correct landing page (Admin `/dashboard`, Kitchen `/kitchen`, Dispatch `/dispatch`, Driver `/today`), refresh to retain the session and sign out. Phase 3 supplies the Kitchen/Dispatch/Driver worklists/actions below, with its final browser/policy locally verified; Billing is implemented with exact settlement and internal credits. Anonymous `/api/v1/auth/me` returns 401; non-Admin configuration and Admin financial order HTTP requests return 403.

Phase 1 Admin walkthrough:

1. Open **Catalogue** at `/catalogue`: inspect dish fields, reusable options, ordered groups and reference lists including portion sizes. Edit a record, save and refresh to confirm persistence. Retire through the active flag rather than deleting a referenced dish.
2. Open **Pricing** at `/pricing`: select **Standard** in the matrix to see explicit dish/option prices and the deliberately missing soup price. Select **Cost plus 15%** to see the rice dish's 211-cent cost resolve to 245 cents through exact derivation and upward five-cent rounding. An explicit override of 211 cents remains 211; clearing an override restores the tier rule or missing status.
3. Open **Menu** at `/menu`, choose employee preview and the demo employee. Standard shows the priced rice box; the unpriced soup is excluded with a diagnostic. Use the Chef's preview direct category link to see its priced secret dish. Secret links still respect company hiding. Categories/items can be created, ordered, edited and retired here.
4. Open **Companies** at `/companies`: edit billing, calendar, price tier, packaging/driver/default address and hidden categories/items. Selecting **Company manual** demonstrates a missing company-tier price without fallback. Refresh employee preview after changing restrictions. Add a company with its initial employee owner and full address; duplicate/public domains and owners from another company are rejected.
5. Open **Catalogue → Option groups** on *Paneer tikka bowl* to see the portion group (Regular/Large surcharges); create an order for it and choose "Paneer cubes (review) · Large" to see the surcharge in the breakdown and a separate kitchen unit. On **Employees**, use **Import employees from CSV** (template shown in the panel) to see per-line errors. As the Driver, add a photo when marking a stop delivered.
6. Open **Employees** at `/employees`: configure allergy/preference guidance and delivery choice flags. Transfer an employee using the dedicated action; an owner requires a replacement from the source company. A conflicting normalized target email rolls back the transfer and replacement.
7. Open **Settings** at `/settings`: edit kitchen working days, holidays, cutoff time/count, default tier and risk minutes; save and refresh. Preview 7 October 2026 with two days and 16:00: weekdays give 5 October 16:00 IST; adding the kitchen holiday 5 October gives 2 October 16:00 IST. A company's holiday affects delivery eligibility without shifting that cutoff. A stale browser save returns a reload-required conflict.

Phase 2 Admin walkthrough:

1. Open **Orders → Create order**, select an active employee and delivery date with a future kitchen cutoff. Company defaults and employee choice flags control saved address, delivery time and packaging. Open a secret category preview explicitly if required; the same visibility/pricing restrictions apply.
2. Add a dish and allocate its line quantity across combinations. Select one option in every required group and zero/one in optional groups. Options start unselected. For the six/four example, configure dish $8.00 with two grain options $0.80/$1.20, then enter six/four meals on one line: the server total is $89.60.
3. **Save draft**, then use **Edit / place draft** to revise it. **Review server quote** shows current prices, delivery, cutoff and allergy guidance. Check **I accept this server quote** before placing. Input changes clear acceptance; a live price change replaces the quote and requires renewed acceptance. Saved Draft placement retains a successful save if placement must be retried.
4. On the detail page inspect **Current delivery**, **Recorded purchase**, immutable revision history and **Progress timeline**. Change a catalogue price/name and reload: the recorded purchase stays unchanged. A permitted Placed purchase revision before cutoff requires a fresh accepted quote; employee transfer blocks further purchase edits while preserving original billing.
5. Cancel/reject with a reason while permitted. Use a separate **Override delivery** action for reasoned logistics corrections, including a custom address. Corrections preserve purchased amounts and regroup Confirmed work before departure. Terminal purchases stay frozen; a delivered shortage uses a reasoned internal Billing credit.
6. To review a late purchase without changing the clock, create a new order for an allowed date whose cutoff is already passed, enable **Explicit Admin placement exception**, enter a reason, review/accept the quote and **Place with Admin exception**. It immediately returns Confirmed with unique prep units/drop and placement-before-confirmation events. A saved Draft exception places its stored choices; unsaved changes are discarded visibly.

Manual past-cutoff instructions: open **Orders → Process passed cutoff**, choose a delivery date and preview its kitchen cutoff. Only an already-passed cutoff can be processed. The authenticated `POST /api/v1/cutoffs/process` returns confirmed/cancelled/skipped/failed counts and failed-order links; future processing returns `400 CUTOFF_NOT_PASSED`. Due Drafts cancel and due Placed orders confirm their recorded amounts exactly once. Startup catch-up/minute scans may already have processed them, so a repeat correctly reports skipped records; an empty eligible date reports zero transitions. The manual action shares the automatic processor. No clock change is required.

Phase 3 cross-role walkthrough (implemented and locally verified):

1. As Admin, create a meal order for **today in Asia/Kolkata** at an allowed seven-day demo company, with valid recorded combinations. Use the explicit reasoned Admin placement exception and accepted quote when its cutoff has already passed. The result must be Confirmed; a future-cutoff Placed order does not appear on the Kitchen board yet.
2. Sign out and sign in as `kitchen@test.com`. Open `/kitchen`, select that delivery date/station/status and open the recorded order. Start one combination, then complete every combination. Directly completing Pending work records both times. The order stays commercially Confirmed while all-unit readiness advances its drop to Kitchen ready.
3. Sign in as `dispatch@test.com`, open `/dispatch` for the same date and inspect the grouped member meals/packaging/address. Assign `driver@test.com`, **Mark dispatch ready**, then **Depart delivery**. Unfinished members or a missing/inactive Driver must prevent departure.
4. At phone width, sign in as `driver@test.com`, open `/today` and that own-today stop. Inspect contact/instructions/meals, optionally enter a delivery note and **Mark delivered**. Every active group member becomes Delivered together, actual delivery time is recorded, and punctuality compares against the original departure target.
5. Return to Admin order details to inspect kitchen/delivery progress, immutable purchase and new timeline entries. The departed/drop detail's reasoned **Admin drop-wide correction** shows all affected orders and retains actual times, original target and on-time outcome. Admin can invoice Confirmed/Delivered members, mark the exact outstanding amount paid, and add a delivered shortage credit in Billing.

The Driver endpoint uses the real current kitchen date; tomorrow's or another driver's drops are not substituted when today's list is empty. The additive seed now appends labelled historical/current/future operational scenarios. Driver receives a grouped current-day travelling stop, including weekends; completion is preserved on repeat seed.

The initial Phase 1 seed contains four staff accounts; Fernleaf Demo Labs with a seven-day company calendar, owner plus one employee and an address; three tiers (Standard/manual, Cost plus 15%, Company manual/missing); three dishes including unpriced soup and a secret dish; one reusable option/required group; normal/secret categories; packaging, stations, allergen/dietary/portion references and a public-domain denylist. The kitchen starts with Monday–Friday, no holidays, 16:00, two cutoff working days, Standard default and a 15-minute risk threshold. The additive review fixture installer separately provides operational orders/drops/invoices.

Configuration initializes atomically only when the singleton settings row is absent. Once initialized, rerunning `pnpm db:seed` skips configuration completely, preserving reviewer edits, employee transfers and intentionally removed prices/groups/domains. It continues to insert missing demo staff without overwriting existing accounts. This is an initial fixture installer, not a repair/reset tool; do not delete settings to refresh review data.

Current review data adds three companies, 24 employees, 12 dishes and reusable options to the original configuration; every order status and paid/unpaid/credited invoices are represented. Run `pnpm db:migrate` then `pnpm db:seed`; date-keyed insert-if-missing startup/IST-midnight jobs preserve reviewer changes and provide valid own-today Driver work. See [fixture details and actual tests](docs/demo-fixtures.md).

## Deployment and two-week availability

**Deployed 4 October 2026** on Vercel (web) and Render Free (API + PostgreSQL 17).

| Service | URL | Provider / plan |
| --- | --- | --- |
| Web (Next.js) | https://fernleaf-kitchen-pied.vercel.app | Vercel Hobby, `apps/web` root |
| API (NestJS) | https://fernleaf-kitchen-api.onrender.com | Render Free, Docker from `Dockerfile.api` |
| Database | Internal Render PostgreSQL 17 | Render Free, Singapore region |
| Repository | https://github.com/dishitabuilds/fernleaf-kitchen | Public, `main` branch |

**Earlier deployed foundation checks on 4 October 2026:**
- Direct API health with connected database: `{"status":"ok","database":"connected","service":"fernleaf-api"}` ✅
- Vercel proxy rewrite `/api/v1/health` reaches Render API ✅
- All four accounts login successfully through deployed API ✅
- Production cookie `__Host-fernleaf_session`: Secure, HttpOnly, SameSite=Lax, Path=/, no Domain ✅
- Unauthenticated `/auth/me` returns 401 ✅
- Kitchen user settings access returns 403 ✅
- Login through Vercel proxy with correct session cookie ✅
- Foundation application commit `93c4991` deployed on both services at that checkpoint; superseded by the final application commit below.

**Final application deployment identity, 4 October 2026:** public `main` contains pushed application commit `7c975ea5cdba62ce9cc42c77ea548a4832ddd0b1` with green CI. Vercel Production Current/Ready lists that source commit and the stable domain `fernleaf-kitchen-pied.vercel.app`; Render reports successful deployment of the same full SHA. A subsequent documentation-only submission evidence commit is tracked separately. Final live smoke results are recorded after completion and do not imply a new exhaustive Must review or production 400-order load test.

### Final submission spot check — 4 October 2026

Scope: existing release only; no new features, broad review, configuration changes or manual regression rebuild. The original eight-page PDF was read fully, and all eleven Must modules plus required README categories are represented. Earlier local test/load results retain their original scope.

| Production check | Actual result |
| --- | --- |
| Public access and persistence | Stable web login opens without a provider wall. Direct Render and Vercel-proxied health return HTTP 200 with PostgreSQL connected. |
| Four role sessions | All four exact demo credentials sign in through the browser to Admin `/dashboard`, Kitchen `/kitchen`, Dispatch `/dispatch`, Driver `/today`. API logins return the correct roles; logout revokes sessions (204 then 401). |
| Access permissions | Kitchen/Dispatch/Driver forbidden configuration, order-management and billing reads return 403; protected settings mutations return 403. Kitchen browser `/settings` displays Access restricted. Driver yesterday detail/delivery return 404. Another-driver case was not repeated in production because only one demo Driver is seeded; prior local coverage remains separate. |
| Quotes and order lifecycle | Labelled synthetic order #29: accepted 930-cent quote, Draft → Placed → reasoned Cancelled. Synthetic order #30: explicit reasoned late placement immediately Confirmed with one prep unit. Persisted purchase/timeline read back successfully. |
| Fulfilment and grouped delivery | Synthetic drop `aacb160a-106e-4ea5-8fe9-393a64c8ccbb`: Kitchen start/complete all three units, Dispatch assign/ready/depart, Driver delivered; #15/#16/#30 became Delivered atomically. Unfinished kitchen blocks dispatch with 409. Recorded actual time, note and late outcome are consistent. Other current-day travelling/ready demo scenarios remain actionable. |
| Billing | Own smoke order #30 / invoice #8: gross 930 cents, duplicate membership rejected 409, reasoned shortage credit 100 cents, exact payment 830 cents, net due zero; gross remains 930. The browser invoice detail displays those values and the credit reason. No actual payment is processed. |
| Manual cutoff | Admin Orders exposes Process passed cutoff and its date/preview panel. Direct API past processing repeated twice: 200, 0 confirmed/0 cancelled/11 skipped/0 failed. Future processing: 400 `CUTOFF_NOT_PASSED`. Existing due transitions were already processed; this check does not claim a new pending cutoff transition. |
| Menu and prices | Browser employee preview shows priced rice at $8.00 plus its $0.80 option, excluding missing-price soup with a diagnostic. Secret direct preview works; company-hidden direct preview stays hidden. Live cost-plus matrix 211 cents × 115% resolves upward to 245 cents; independently calculated derived rows match both existing cost tiers. |
| Calendar and employee settings | Live API returns separate kitchen/company working days and holidays, cutoff 16:00/two working days, company owner/travel minutes and differing employee choice flags. No settings were changed for the spot check. |
| Driver phone view | Route and travelling-stop detail inspected at 390 × 844; document width 375 equals scroll width 375 (no horizontal overflow). Contact, instructions, meals, optional note/photo input and Mark delivered are present. Photo upload was not repeated live; its recorded local Phase 6 tests remain the evidence. |
| Documentation | Setup/environment commands, architecture and Mermaid ER, decisions/business rules, exact four-role dashboard calculations, prioritisation, assumptions, test evidence, credentials/walkthrough, hosting limits and two-week availability are present. Stale planned/missing-source/push statements corrected; older supporting checkpoints explicitly labelled historical. |

The final documentation change is limited to README and historical labels in three supporting documents. `git diff --check` is the applicable local check; final CI/provider results are checked against the pushed documentation head separately. The assignment form is not submitted by this verification. Use the **web URL** as the live application link and the public GitHub URL as the repository link.

**Hosting notes:**
- Render Free API sleeps after 15 idle minutes; first request after sleep has a cold-start delay (~30-60s). Startup catch-up processes due cutoffs and appends demo fixtures.
- Render Free database expires 30 days after creation (approximately 3 November 2026). Keep services available **at least 14 days after submission** (no earlier than 18 October).
- `DEMO_FIXTURES_ENABLED=true` and `MAINTENANCE_TOKEN` are set. The startup scheduler and IST-midnight job append date-keyed review fixtures.
- The `start:demo-deploy` script runs `prisma migrate deploy && prisma db seed && node dist/main.js` on every container start.

[Deployment runbook](docs/deployment.md) | [Review handoff](docs/review-handoff.md) | [Demo fixtures](docs/demo-fixtures.md)

## Resume point and next phase

The application, including Phase 6 delivery photo, portions and CSV import, is pushed and deployed. All eleven Must areas map to implemented functionality and recorded local evidence; the final check is deliberately limited to deployment identity, public access, demo core flows, role permissions and required README information. With more time: object storage for photos, CSV update-or-create mode with an explicit diff preview, and per-tier portion surcharges if the business needs them.


Deployment is live at the URLs above and the focused production spot checks passed. After the documentation evidence commit's push/CI/provider identities are verified, use the web and public repository links in the assignment form. Keep the deployment available at least 14 days after actual submission. The hiring form has not been submitted. Remaining limitations: idle Render cold starts, no fresh production 400-order load test, and no repeat live photo/CSV/portion mutation tests in this priority check.

Preserved decisions: exactly one required/zero-or-one optional option; reject duplicate dish lines; ordinary saved company addresses; explicit reasoned custom-address/late Admin exceptions; immediate shared confirmation for late placement; historical company after employee transfer; packaging invalidates readiness before departure and locks afterward; reasoned Admin travelling-driver reassignment; drop-wide address/time corrections after departure. Confirmed purchases freeze; invoiced cancellation adds a full remaining internal credit, delivered shortages add reasoned partial credits, issued membership/gross and paid history stay immutable. No decision was changed to bypass a requirement.
