# Phase 2: ordering and cutoff

**Implementation and local Phase 2 acceptance verified.** Original assignment/submission attachments and hosting access remain absent. Implementation follows the existing blueprint. Kitchen/dispatch/driver transitions and invoices remain Phase 3/4. Publication status is recorded below independently from local acceptance.

## Confirmed interpretations

- Late Admin placement requires an explicit reason and accepted server quote, then immediate shared due confirmation in the placement transaction. Future cutoffs remain Placed; no clock is fast-forwarded.
- An employee transfer blocks existing Placed purchase edits/requotes. Original billing company/purchase remain; permitted cancellation and reason-required logistics corrections remain available.
- Option A, confirmed 4 October: required groups exactly one option; optional groups zero/one. Duplicate dish lines are rejected; variants use combinations on the same line. Ordinary addresses are active saved company addresses. Custom addresses require a separate explicit reasoned Admin override.

## Implementation

- Two additive migrations: `20261003145500_phase_2_orders` adds order/line/combination/selection snapshots, immutable revisions/events, actor-scoped action keys, cutoff date policy, pending prep units and grouped drops; `20261003153201_phase_2_timeline_sequence` gives equal-timestamp events deterministic insertion ordering. No development reset.
- Order and employee company relations are independent; transfer cannot rewrite the captured company. Drop membership has a same-company composite foreign key. Historical group/option/tier/menu identifiers do not depend on replaceable live rows.
- Database money/quantity/status checks, exact combination multiplication, unique actions/events/combinations/work/drop keys and immutable revision/event update triggers support service-level validation.
- Production `OrdersController`/`OrdersService` and Option A policy are registered. Server quotes reuse the employee menu resolver inside the order transaction, applying active/hidden/secret/pricing/calendar/default/employee rules. Missing prices never substitute another tier.
- Exact server fingerprints must be accepted for placement and Placed purchase revisions. A changed quote returns `409 QUOTE_CHANGED` with its replacement and writes no purchase. Placed edits append an immutable revision; logistics corrections preserve purchase snapshots and actual prep history.
- Draft/Placed ordinary actions require open cutoff and expected version. Replayed actor/action IDs return the original committed response; different input with a used ID conflicts. Separate UI save/place IDs and a saved-draft checkpoint allow retrying placement without repeating a stale draft save.
- Shared due processing cancels Drafts and confirms Placed orders with their original amounts, unique prep units, exact grouped drop membership and ordered timeline atomically. Late Admin placement invokes that same confirmation inside its transaction before caching the response.
- Startup catch-up, minute scan and manual Admin action share due processing. Manual future cutoff returns 400. Processed policy stays frozen; retry scans actual eligible rows, including failures/new eligible orders. Counters identify failed orders.
- Settings changes recompute unprocessed policies/order versions/timeline and catch up after commit. Company-calendar changes reject invalid live orders with affected-order links.
- Next.js orders list/detail/actions/manual cutoff and create/edit quote builder use NestJS HTTP. Details distinguish current delivery from recorded purchase, with immutable revisions and progress timeline. Builder review/acceptance resets on changes or replacement quote; ordinary saved addresses/employee flags and explicit exceptions have separate controls.

## Actual verification on 4 October 2026

| Check | Actual result |
| --- | --- |
| Main and guarded `_test` migrations; Prisma generation | PASS, both additive migrations applied, development records preserved |
| `pnpm test:integration` with real production order registration | **PASS: 118 tests / seven suites, 62.934 seconds**, real PostgreSQL |
| Focused real-registration order HTTP/DB suite | PASS: 24 tests, 23.814 seconds |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | PASS, contracts/NestJS/Next.js; focused web lint/types and rebuilt web after the final asynchronous delivery-select fix |
| `pnpm test:e2e`, production Chromium | **PASS: 20 / 20 tests, 37.6 seconds**, including four new order journeys and two manual-cutoff cases; non-kitchen browser timezone |
| `docker build --file Dockerfile.api --tag fernleaf-api:phase2 .` | PASS, final registered production API |
| Local production-mode container smoke | PASS, non-root node uid1000; migrations/real PostgreSQL, four role sessions/cookie flags/401/403, $89.60 quote/place/replay, stable purchase after catalogue change, atomic late confirmation with two prep units/drop/ordered events/replay, repeat manual processing, future rejection and logout revocation |
| Phase completion commit/push and clean-checkout CI | Pending |
| Hosted HTTPS browser/database/scheduler checks | Blocked: hosting access pending, no live URL |

The 118 tests include 14 combination cases, 15 cutoff/database cases and 24 order cases, plus earlier auth/configuration/money/menu/pricing regressions. Coverage includes the six $8.80/four $9.20 example, canonical merge/cardinality/sum/MOQ/errors/overflow; snapshot stability after catalogue/group replacement and employee transfer; direct permissions/Origin/CSRF/employee flags; versions/action replay/races; exact cutoff lock, repeat/concurrent confirmation/cancellation, drop keys/same-company constraints, rollback, catch-up, settings recomputation/frozen dates, calendar conflicts, filters/pagination and strict timeline chronology.

The final full browser/build results supersede earlier foundation-only evidence. Browser journeys verify a saved draft edited from seven/three to six/four meals, fresh accepted $89.60 placement and recorded snapshot after dish/option/price changes; `QUOTE_CHANGED` replacement requiring renewed acceptance; explicit late Confirmed placement with unique work/drop/ordered events and repeat processing; employee transfer blocking purchase edits while a time-only correction preserves address, packaging, original billing and purchase. Manual cases verify future rejection and repeated empty historical processing. Earlier auth/configuration and Driver phone-shell regressions remain green.

Strict timeline tests exposed UUID tie-breaking at equal timestamps; insertion sequence fixed it without weakening the assertion. Browser checks exposed select-label ambiguity and asynchronous uncontrolled delivery selectors losing saved address/packaging. Explicit accessible names and controlled selectors fix those defects; the transfer regression checks both retained values. Test fixtures now supply required company delivery defaults and identify the exact error alert. Older configuration checks search the intended paginated item and target its missing-price diagnostic; their exact derivation/override/visibility assertions remain. Failed/interrupted exploratory runs were corrected, then the complete production suite passed. The test-only order registration mock has been removed.

Commands from the repository root with pinned pnpm:

```powershell
pnpm db:generate
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test:integration
pnpm build
pnpm test:e2e
docker build --file Dockerfile.api --tag fernleaf-api:phase2 .
```

Integration tests reject missing/shared/non-`_test` database configuration and clean only that isolated database. Browser/container fixtures append labelled synthetic companies/employees/menu/prices/orders and preserve existing reviewer work. Temporary smoke container/environment copy were removed; PostgreSQL remains. Container cookie checks use an explicit local HTTP client, not a hosted HTTPS browser.

## Phase acceptance mapping

| Blueprint gate / supporting check | Evidence / remaining gap |
| --- | --- |
| Placed purchase survives catalogue-price edit | API tests, final production container smoke and full browser assertion PASS |
| Cutoff confirms exactly once and cancels drafts | Real PostgreSQL boundary/repeat/race/Draft-cancellation tests PASS; shared job/manual service; browser late-placement and repeat assertions PASS |
| Draft/place/edit/detail usable through HTTP | Registered API tests and final production builder/browser journeys PASS |
| Permissions, versions, replay, transfer and exceptions | API/DB/production smoke PASS; browser transfer/logistics/changed-quote acceptance PASS |
| Accurate diagrams, README, commit/push/CI | Actual models/sequences/states/data flow and final local evidence documented; publication checkpoint below |

No kitchen-board start/done/readiness actions, dispatch/Driver journey, invoice workflow, operational dashboards or rolling review-day fixtures are claimed. The 400-order performance check belongs to Phase 5 and has not run. Phase 0 hosted proof and original-source verification remain open.

## Publication checkpoint

Local Phase 2 gate is verified. Completion commit/push/clean-checkout CI are pending at this pre-commit documentation checkpoint; record actual hashes/run evidence after publication. Development API/web were restarted; direct/proxied PostgreSQL health, login and `/orders/new` return 200. Report Phase 2, then stop before Phase 3: preparation/readiness/risk, grouped dispatch and mobile own-today Driver delivery. Preserve all existing data and retain the hosted/source blockers.
