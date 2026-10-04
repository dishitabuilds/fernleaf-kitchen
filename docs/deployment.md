# Deployment runbook

> Historical deployment-preparation notes and earlier checkpoints are preserved below. Current hosting is Vercel Hobby plus Render Free API/PostgreSQL. The final application commit is `7c975ea5cdba62ce9cc42c77ea548a4832ddd0b1`: public `main` push/CI and successful Vercel/Render deployments are verified, including the stable Vercel production domain. Use [README](../README.md) for current deployment identity and final focused smoke evidence; older pending statements and the `93c4991` table describe their original checkpoint.

**Prepared, not deployed.** Hosting access is pending. No provider project, paid resource, production database, live URL or successful hosted login is claimed. Update this file and README after actual checks. Inspect the final committed Dockerfile/configuration before copying provider settings.

Historical Phase 1 evidence: `docker build --file Dockerfile.api --tag fernleaf-api:phase1 .` passed. On 3 October 2026 a production-mode container running as the non-root `node` user applied committed migrations and passed real PostgreSQL health at localhost:3002, all four logins, production cookie attributes, anonymous settings 401, non-Admin settings 403, persisted settings/menu reads and logout. The smoke client supplied cookies explicitly over local HTTP; this does not prove HTTPS browser forwarding through hosted Next.js. Its database is synthetic local data. The temporary API container was stopped after verification; PostgreSQL was retained. These checks **do not satisfy hosted login or production database acceptance**.

## Target and monorepo boundary

| Service | Target | Responsibility |
| --- | --- | --- |
| Web | Vercel, Root Directory `apps/web` | Next.js and same-origin `/api/v1` rewrite |
| API | Railway, repository-root Docker context | NestJS, Prisma, startup/minute cutoff processing; review fixtures later |
| Database | Railway PostgreSQL, API project/region | Staff/configuration and Phase 2 order/history/cutoff/prep/drop persistence; billing later |

Verify account access, quota, current plans and budget before provisioning. This runbook authorises no purchase or hiring-form submission. Keep secrets in provider variables. The implemented in-process cutoff job and future review fixtures require an always-running API.

Historical Phase 2 foundation checkpoint on 3 October 2026: `docker build --file Dockerfile.api --tag fernleaf-api:phase2-foundations .` passed. Its local non-root container applied committed migrations and passed PostgreSQL health, four logins, production cookie flags, 401/403, settings/menu reads, future-cutoff rejection and logout revocation. The temporary container and its environment copy were removed, retaining PostgreSQL. That checkpoint preceded production order registration and the builder, so it is not final Phase 2 order/deployment evidence.

On 4 October, the user confirmed Option A and the current application registered OrdersController/OrdersService with exactly-one required selection, zero/one optional selection, rejected duplicate dish lines, and saved company addresses for ordinary ordering. Custom addresses require a reasoned Admin override. The real registered module passed 24 focused order HTTP/database tests; the complete registered backend suite subsequently passed **118 tests / seven suites in 62.934 seconds**. The create/edit builder is implemented and **the local Phase 2 gate passed**: lint/type-check/production builds and all **20 production-build Chromium tests in 37.6 seconds**, including four new order journeys and two manual-cutoff cases. Final action-form changes also passed focused lint/type checks. Track actual phase commit/push/CI in README/[Phase 2 evidence](phase-2.md). Hosting access and original assignment/submission sources remain absent; no hosted or production-order database verification is claimed.

The rebuilt `docker build --file Dockerfile.api --tag fernleaf-api:phase2 .` **passed**. Its local production-mode temporary container ran as non-root `node` (UID 1000), applied current migration files and passed PostgreSQL health, four-role sign-in/cookie flags, anonymous 401 and non-Admin 403. Real order smoke checks passed: the $89.60 purchase/placement/replay, snapshot stability after catalogue changes, immediate late Confirmed placement with two unique prep units and grouped drop, placement-before-confirmation timeline order and idempotent replay. Repeated cutoff processing, future-cutoff 400 and revoked-session logout 401 also passed. Synthetic API fixtures were appended; the temporary container/environment copy were removed and the existing database was preserved. The smoke client supplied cookies explicitly over local HTTP. Hosted HTTPS browser forwarding, production infrastructure and a published deployment remain unverified.

Vercel supports pnpm workspaces and selecting project Root Directory; retain workspace contracts outside `apps/web` in the build. [Vercel monorepos](https://vercel.com/docs/monorepos), [outside-root source settings](https://vercel.com/docs/monorepos/monorepo-faq). Railway's shared-monorepo build must retain root manifests/lockfile and contracts. [Railway monorepos](https://docs.railway.com/deployments/monorepo).

## Railway API and database

1. Connect the verified public [dishitabuilds/fernleaf-kitchen](https://github.com/dishitabuilds/fernleaf-kitchen) repository and verified `main` branch. Deploy the final phase commit after its checks/push are verified. Create API and PostgreSQL services in one project/region. API source root is the repository root, so the Docker context includes `packages/contracts` and workspace files.
2. Use root `railway.json` with root `Dockerfile.api`. It pins Node 24.10.0/pnpm 10.34.6, installs from lockfile, generates Prisma and builds contracts/API. Migrations belong at startup/deployment, not image build time.
3. Set `DATABASE_URL` through a reference to PostgreSQL's connection string. Set `NODE_ENV=production`, `WEB_ORIGIN` to the exact stable web HTTPS origin and `SESSION_TTL_HOURS=12`. Do not set `TEST_DATABASE_URL` for production. Railway injects `PORT`; API binds to it on `0.0.0.0`.
4. `Dockerfile.api` starts `pnpm --filter @fernleaf/api start:deploy`, whose script runs `prisma migrate deploy && node dist/main.js`. It applies committed migrations before starting the compiled API; migration failure prevents startup. Never use `migrate`/`prisma migrate dev` in production. If moving migrations into a provider pre-deploy command later, use `pnpm --filter @fernleaf/api migrate:deploy` and retain a fail-closed startup sequence.
5. After initial migration, run `pnpm --filter @fernleaf/api seed` explicitly once. Seed inserts missing demo staff without resetting existing accounts and atomically installs synthetic Phase 1 configuration only when kitchen settings are absent. Later runs preserve edited records and removed prices. It is not a reset and is not run on every ordinary startup.
6. Generate an API HTTPS domain and verify `/api/v1/health` from outside. Health must query PostgreSQL; port listening alone does not meet the database gate.
7. Configure healthcheck `/api/v1/health`, timeout and restart policy from `railway.json`. Inspect deployment/migration logs, disable API sleeping and verify database storage/backup/quota for the review window.

Railway admits a new deployment after a healthcheck response and uses the service `PORT`; its deployment healthcheck is not continuous production monitoring. [Railway healthchecks](https://docs.railway.com/deployments/healthchecks). Dockerfile and deploy settings can live in configuration as code. [Railway configuration reference](https://docs.railway.com/config-as-code/reference).

## Vercel web

1. Import the same repository/branch, select Next.js and Root Directory `apps/web`. Enable outside-root source access for contracts/workspace/lockfile if the project setting requires it.
2. Select supported Node 24.x and verify actual runtime in build logs. If Vercel cannot select the exact local patch, record the tested provider runtime honestly. Respect pinned pnpm `packageManager` and install with the lockfile.
3. `apps/web/vercel.json` sets `pnpm install --frozen-lockfile` and `pnpm --filter @fernleaf/contracts build && pnpm --filter @fernleaf/web build`. Retain normal Next.js output detection; database/Prisma secrets do not belong to Vercel's web environment.
4. Set `API_INTERNAL_URL` to the API HTTPS **origin only**, without `/api/v1`; the Next rewrite appends the API path. This is a server setting, not a browser token. Redeploy when the build-time rewrite origin changes.
5. Add the stable web origin as exact API `WEB_ORIGIN`. Treat previews explicitly; do not broadly allow arbitrary origins to work around CSRF. Ensure the review URL has no provider login wall.

The rewrite lives in Next.js configuration and proxies HTTP to NestJS. [Vercel reverse proxy documentation](https://vercel.com/kb/guide/vercel-reverse-proxy-rewrites-external). Hosted cookie/origin smoke checks remain necessary even when local tests pass.

## Phase 0 hosted acceptance checks

| Check | Required evidence |
| --- | --- |
| API/database health | Direct HTTPS `/api/v1/health` succeeds after PostgreSQL query |
| Web HTTP connection | Web HTTPS `/api/v1/health` reaches the same API |
| Four credentials | Fresh browser context per account signs in to correct shell |
| Cookies | Production `__Host-fernleaf_session`, Secure/HttpOnly/SameSite=Lax, `Path=/`, no Domain; forwarded through rewrite |
| Logout | Cookie cleared and deleted session cannot access `/auth/me` |
| Authentication | Direct protected request without valid session returns 401 |
| Permission | Kitchen/Dispatch/Driver settings-access POST returns 403 with valid auth/origin/CSRF |
| Mutation controls | Wrong origin, missing/invalid CSRF and unknown fields rejected according to endpoint policy |
| Persistence | Valid database session/identity survives API restart |
| Public access | Web/API usable without provider login; no secret fields/public private-response cache |

Record date, commit, exact URLs/results/limitations in README. The deployed gate stays open until these pass. Later phases add the full role journey/invoicing, current-day fixture jobs and 400-order board; those are not Phase 0 proof.

## Phase 2 hosted order and cutoff checks

These are required deployment checks, not results already obtained. Use clearly labelled synthetic review orders and preserve reviewer changes.

1. Apply both additive order and timeline-sequence migrations. Verify an existing configuration/session still works; the sequence keeps equal-timestamp placement and confirmation in insertion order.
2. Over the hosted Next.js HTTP rewrite, create a Draft and review/place a separate valid order using its accepted server quote. Confirm delivery information, exact totals, selected options and timeline persist after refresh/API restart.
3. Change a catalogue price/name after placement: the recorded purchase remains unchanged. A fresh quote/revision resolves the new values and requires explicit acceptance; submitting an old fingerprint returns `409 QUOTE_CHANGED` with its replacement quote and no partial order writes.
4. Verify ordinary requests enforce Option A, employee address/time/packaging flags and company calendars. Direct authenticated Kitchen/Dispatch/Driver order-management requests must return 403; hidden navigation is insufficient evidence.
5. Create an explicit reason-required late Admin placement on an allowed past-cutoff date. It must return Confirmed immediately, with one prep unit per canonical combination, exact grouped drop membership and one cutoff event. Repeating the same actor/action ID returns the committed Confirmed response without duplicate effects.
6. Manually process an already-passed cutoff with the Admin session/origin/CSRF controls; verify confirmed/cancelled/skipped/failed counts and repeat/concurrent idempotency. A future cutoff must be rejected. Restart the awake API with overdue Draft/Placed records to verify catch-up across past dates, then verify the minute scan.
7. Change kitchen cutoff/calendar settings: unprocessed order deadlines and timeline/version changes commit together, then newly due orders process. A processed date's original policy cannot reopen. A company-calendar edit that invalidates a live order must return the affected order links.

Phase 2 creates pending work/drop membership. Kitchen start/completion, dispatch/departure, own-today Driver delivery and invoice/dashboard workflows remain Phase 3/4; passing these order checks does not prove them.

## Recovery, migrations and monitoring

Phase 2 cutoff scheduling runs catch-up at API startup and a due-date scan every minute. All dates with due Draft/Placed orders are eligible, including missed past dates and newly eligible orders on a previously processed date. Manual Admin `POST /api/v1/cutoffs/process` accepts `{ "deliveryDate": "YYYY-MM-DD" }` with the normal session/origin/CSRF controls and rejects future cutoff with 400. It shares conditional confirmation/cancellation and unique effects with automatic processing. Explicit late placement calls that same confirmation helper inside the placement/action-response transaction; it never confirms a future cutoff. Failed records are counted and logged with sanitized order references/codes for retry; inspect `failed`/`failures`, rather than treating every HTTP 200 as complete processing. Settings recompute unprocessed cutoffs and run catch-up after commit; processed policies remain frozen. Deploy an awake API and verify restart catch-up/minute scans on the eventual hosted database. An independently scheduled trigger for a sleeping provider is not implemented.

Back up and review SQL before significant later migrations. Prefer compatible schema changes so rolling instances work. Failed migration or healthcheck stops rollout. Inspect logs and correct forward with a new migration/commit; do not erase shared data as a shortcut. Record any restore/recovery decision.

For API failure inspect logs, `PORT`, database/reference variables, migration state and health. For login working directly but failing through web inspect rewrite origin/prefix, forwarded cookies and exact origin/CSRF. Do not disable controls to make smoke tests pass. Add separate recurring health/login checks because provider deploy healthchecks do not continuously monitor the live app.

## Rolling review fixtures and retention

Phase 1 seeds four staff accounts plus initial synthetic catalogue, pricing, references, company, employees and settings. It does not seed orders or deliveries. Phase 4/5 will create synthetic history/current/future scenarios using unique scenario/date keys. Startup catch-up and local-midnight Asia/Kolkata jobs will append missing fixtures, including own-today Driver work, without resetting reviewer changes. The seeded company has a seven-day calendar. Keep real time and label synthetic prior timestamps. Sleeping-host fallback needs an independently scheduled authenticated trigger plus catch-up/cold-start tests.

After actual submission:

- Record instant, URLs, deployed commit and retention-until instant at least 14 days later. Submission on 4 October 2026 implies no earlier than 18 October at the same time.
- Verify funding/quota, persistent storage/backups and ownership across that window; do not rely on unverified trial credits.
- Keep demo credentials, production branch and all-role login available. Inspect health, jobs, date freshness, database state and quota daily; record corrections.
- Do not remove resources before retention ends; extension/shutdown is a separate decision.

## Actual deployment record

| Item | Actual value |
| --- | --- |
| Hosting access | Vercel Hobby (web), Render Free (API + PostgreSQL 17 Singapore) |
| Repository / branch | Verified public [dishitabuilds/fernleaf-kitchen](https://github.com/dishitabuilds/fernleaf-kitchen), `main` |
| Deployed commit | `93c4991` — billing release, demo fixtures, dashboards, deployment config |
| Web URL | https://fernleaf-kitchen-pied.vercel.app |
| API URL | https://fernleaf-kitchen-api.onrender.com |
| Production migrations/seed | Applied via `start:demo-deploy` (migrate deploy + seed + start) |
| Production smoke test | 4 October 2026: health ✅, four logins ✅, 401/403 ✅, cookie attrs ✅, proxy rewrite ✅ |
| Submission/form | Not submitted; original form unavailable |
| Retention-until/budget | Render Free DB ~30 days (≈3 November 2026); keep until at least 18 October |
