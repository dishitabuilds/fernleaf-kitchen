# Project rules: Fernleaf Kitchen / Heizen assignment

These are working instructions for Codex in the project repository. Read this file at the start of each task or phase and follow it while making every change. Re-read it when it changes. Read only the relevant detailed blueprint sections after the initial full read; do not repeatedly reload the entire repository for small changes.

## 1. Sources, scope and decisions

- Locate the user's blueprint: normally `blueprint.md`, or `Heizen-Implementation-Blueprint.md`. Preserve the existing filename and contents unless the user requests an update. If multiple different blueprints exist, resolve which is current instead of guessing.
- Read the whole blueprint before initial implementation. Read the supplied Heizen assignment PDF if available, plus supplied submission instructions. Do not assume another chat's attachments exist in this workspace.
- The assignment defines requirements; the blueprint describes our implementation plan; this file governs execution. Maintain a short list of assumptions and decisions in README.md. Label proposed interpretations separately from explicit requirements.
- Honour later explicit user decisions and applicable higher-priority instructions. Explain when a requested change would conflict with an assignment requirement. Do not silently change scope, erase an instruction, lower a completion gate or rewrite the plan to excuse an implementation gap.
- If the original assignment is missing, use the blueprint for unblocked work and explicitly record that the original has not yet been checked. Do not fabricate a file read or pretend a summary is the original source.
- Deadline: 4 October 2026, 11:59 PM IST. Reassess the remaining time using the real current time. The old planning document's elapsed-time estimates are not a fresh time budget.

## 2. Build method and phases

Create the necessary application files and folders yourself. Inspect existing files and Git state first. Preserve unrelated user changes and never scaffold over existing work without inspecting it.

Work one requested phase at a time. Before implementation, briefly state its scope, affected modules and acceptance checks, then proceed with authorised work. Do not stop merely to get approval for ordinary reversible implementation steps. Use small feature slices inside a phase, with short progress updates.

| Phase | Scope |
| --- | --- |
| 0 | Workspace, compatible toolchain, PostgreSQL/Prisma, API health, frontend HTTP connection, authentication, permissions, four seeded users, deployment foundation. |
| 1 | Money/calendar rules; catalogue, options, reference lists, menu, pricing, companies, employees and settings. |
| 2 | Orders, combinations, quotes/snapshots, lifecycle, timeline, filters, automatic/manual cutoff and admin overrides. |
| 3 | Prep units, kitchen board, readiness/risk, grouped drops, dispatch and mobile driver workflow. |
| 4 | Billing, invoice adjustments, role dashboards, realistic seed data and staff-management completion. |
| 5 | All-Must verification, concurrency/access tests, 400-order board check, current-day fixtures, live smoke tests and README completeness. |
| 6 | Portions, then employee CSV import; optional delivery photo if time permits. |
| 7 | Final fixes, submission readiness, verified URLs and two-week availability plan. |

Use the detailed blueprint acceptance gate for each phase. Default to Phase 0 for the first implementation request and stop after its report until asked for the next phase. A later explicit request to continue through multiple phases authorises that progression; keep the same gates and per-phase pushes.

Aim for full scope. All eleven functional areas are Musts; portions and CSV import are the explicit Shoulds. Do not begin optional polish while a relevant Must gate is failing. Tests, documentation and real persistence belong in each feature slice.

Track `not started`, `in progress`, `implemented`, `verified`, and `blocked` accurately. Track GitHub synchronisation and deployment separately. Working locally is not the same as deployed; a local commit is not the same as a successful push.

## 3. Architecture and code boundaries

- Mandatory Next.js frontend, NestJS backend and Prisma ORM. Use PostgreSQL and TypeScript as agreed in the blueprint. Pin compatible dependencies and commit the lockfile.
- Use the monorepo layout: `apps/web`, `apps/api`, `packages/contracts`, `tests`, and `docs`, creating subfolders as needed.
- Frontend business operations must call NestJS over HTTP. Keep Prisma access and authoritative business rules in the API. Next.js rewrites may proxy HTTP; Next.js server actions must not bypass the API.
- Use clear modules and small rule functions. Avoid unnecessary services, queues or infrastructure.
- Share public API contracts rather than database models or backend secrets. Use consistent actionable errors, validated DTOs and server-side pagination.
- Authenticate and authorise on the backend. Use a central permission map and resource-level scope, including driver ownership and kitchen-local today. Hidden buttons are not access control.
- Use compatible current documentation for the exact installed versions; do not paste code for a different Prisma/framework major version.

## 4. Business rules that must survive every change

The detailed blueprint and original assignment remain the full requirements. Preserve at least these invariants:

1. Staff identities and company employee records are different. Each staff account has one role. Admin can manage staff and roles. Each employee belongs to exactly one company; the company's owner is one of its employees.
2. Catalogue includes all specified dish fields, reusable options, ordered required/optional groups and admin-managed references. Deactivate dishes instead of deleting historical references. Include the portion-size reference list even before adding the Should portion workflow.
3. Menu visibility combines active flags, company hiding and effective prices. Secret categories have a direct preview path that still respects restrictions. Employee preview must use the same rules as ordering.
4. Resolve the company's tier or the default tier. A missing item price on the selected tier is not an instruction to fall back to another tier. Explicit prices override derivation. Reject derivation cycles; round derived prices upward to five cents.
5. Use integer minor-unit money and exact intermediate arithmetic. Order totals reconcile to lines; invoice totals reconcile to their original order amounts. No floating-point money, tax or delivery fees.
6. Every combination has valid selected options: user-confirmed Option A requires exactly one selection per required group and zero/one per optional group. Merge canonical duplicate combinations within a line; reject duplicate dish lines and enter variants as combinations. Combination quantities sum exactly to line quantity. Enforce minimum quantities and preserve purchase snapshots.
7. Company domains are normalized, unique and checked against public-provider restrictions. Companies have addresses, billing details, calendars and delivery defaults. Employee delivery-address/time/packaging flags are enforced on the server. User-confirmed ordinary addresses must be active saved company addresses; custom addresses require a separate reason-required Admin override.
8. Company calendars decide allowed delivery dates. Only the kitchen calendar determines working-day cutoff counting. Use Asia/Kolkata explicitly for cutoff, delivery dates and today, independently of machine timezone.
9. At the cutoff, ordinary Draft/Placed edits and cancellation lock. Due processing cancels Draft and confirms Placed orders, making them billable. Automatic, catch-up and manual processing share one idempotent service; the manual action only processes an already-passed cutoff.
10. Only Confirmed orders produce active kitchen work. One distinct combination on an order line produces one prep unit. Repeated start/done cannot duplicate work. Direct completion also records a start; order readiness requires every unit done.
11. Planned dispatch readiness is delivery time minus company delivery minutes; planned kitchen readiness is another 30 minutes earlier. Delivery-time changes update planned times while preserving actual history. Show late/at-risk states and support admin force completion.
12. Drops group by company, actual address and exact delivery time. Transitions enforce preceding steps; departure needs a driver. Delivering a drop updates its member orders consistently. Drivers see and update only permitted own-today drops. Record delivery timing and optional notes; photos remain optional. User-confirmed Phase 3 policy: a packaging change before departure invalidates dispatch readiness without regrouping; packaging locks after departure. Admin may reassign an Out-for-delivery drop only with a recorded reason; Dispatch assignment stays before departure, and Delivered drops retain their Driver.
13. Orders belong to at most one invoice. Use transactions/constraints to prevent double invoicing. Follow and document the chosen policy for confirmed-order changes, cancellation and shortages. Preserve issued invoice totals and use separate internal credits under the blueprint policy.
14. An employee transfer or catalogue edit must not change historical purchases or billing companies. Order details include price breakdown, options, delivery information and a progress timeline.
15. Settings must be editable through the application. Four role dashboards must use explicitly defined, reproducible queries and honest missing-data handling.
16. Concurrent operations must not corrupt state. Conditional transitions, uniqueness and appropriate transactional isolation/retries must protect both individual records and aggregate readiness/billing calculations.

Out of scope: customer storefront, employee payments/refunds, unaffiliated customers, extra order types, automatically included free options, date-based menus, ordering pauses, exports, accounting/recipe integrations, coupons, tax, delivery fees/zones, general audit-log product, real notifications/email and marketing banners. The required order timeline is still in scope.

## 5. README.md: maintain continuously

Create README.md at the beginning if missing. Update the relevant sections as behaviour, commands, schema or decisions change, and before every phase commit/push. Do not leave documentation until the end. Clearly distinguish planned and implemented behaviour; no unsupported claims about deployment, tests, performance or completeness.

README.md must include:

1. **Product and scope:** business overview, four roles, implemented scope and out-of-scope items.
2. **Quick start:** actual prerequisites/versions, install, environment setup, database setup, migrations, seed, web/API start commands and local URLs. Include commands appropriate for the user's Windows setup where relevant.
3. **Environment configuration:** variable names and purposes, `.env.example` with placeholders, local/production differences; never real infrastructure secrets.
4. **Architecture overview:** actual module boundaries, frontend-to-backend HTTP path, chosen stack, folder map and deployment components.
5. **Data model diagram:** maintained Mermaid ER diagram with key relationships and constraints. Keep useful sequence/activity/state/data-flow diagrams in README or linked docs with a concise README explanation.
6. **Key decisions and trade-offs:** database, authentication, permissions, money representation, currency/timezone, snapshots, transaction/idempotency approach, hosting and alternatives considered.
7. **Business-rule documentation:** effective price precedence/rounding/missing-price behaviour, cutoff examples and calendars, combinations/MOQ, order/prep/drop transitions, overrides, invoicing and post-invoice changes.
8. **Dashboard definitions for each role:** what is shown and why; exact calculation, included order statuses, grouping date, cancellation/rejection treatment, missing-data/zero-denominator handling, and what was intentionally omitted. This is an explicit assignment requirement.
9. **Prioritisation and progress:** per-phase status and a requirement matrix mapping assignment sections to Must/Should/optional priority, implementation, verification and known gaps. Say what was built, skipped and why, plus what comes next with more time.
10. **Ambiguities and assumptions:** distinguish source requirements from our choices, explain interpretations and record relevant later changes.
11. **Tests and evidence:** actual test commands and results; coverage of cutoff, pricing, combination counting and invoicing; relevant access/concurrency checks, browser smoke tests and the 400-order performance check. Record not-run checks honestly.
12. **Demo/reviewer guide:** all four exact credentials, role walkthrough, how to manually trigger a passed cutoff, sample scenarios and how current-day data is maintained.
13. **Deployment and submission:** verified live/repository URLs when available, setup/migration/job instructions, known hosting limitations, public-repo requirement and the plan to remain live for at least two weeks. Use explicit pending labels before deployment.
14. **Known issues and resume point:** current blockers, the next concrete task and any incomplete phase gate so a fresh Codex session can resume from files.

Keep README readable. Put long supporting details in `docs/` and link them, but retain the assignment-required overview, decisions, dashboard definitions and prioritisation in README itself.

## 6. Test and completion discipline

- Implement meaningful tests with the rules, especially cutoff calculation, pricing, combination counting and invoicing. Use real PostgreSQL for database/concurrency behaviour.
- Before completing an implementation phase, run applicable lint, type-check, tests and production builds. Define real package scripts first; do not claim a command exists or passed when it was not run.
- Use focused checks during small edits. Run the phase-relevant regression checks at the phase boundary. Fix failures caused by the change without deleting tests, weakening assertions or silently disabling checking.
- Check backend permissions using direct API requests; do not rely only on browser navigation.
- Verify the UI path when a working UI is part of the phase. Test the driver flow at phone width and the kitchen board with the specified busy-day dataset before the Must gate.
- If a check or deployment is blocked by access or missing infrastructure, finish the unblocked work, record the precise blocker and keep that gate open. Do not invent successful verification.
- At a phase boundary report: delivered behaviour, important files, decisions, actual check results, README updates, commit/branch, verified push status, deployment status, how the user can try it and the next phase.

## 7. GitHub: commit and push after every completed phase

The user explicitly authorises normal commits and GitHub pushes for this project after each completed phase. Do not ask for the same push permission again at every phase. Tool/sandbox approval requirements and branch protections still apply.

1. Inspect repository root, working tree, branch and configured remote. Reuse the intended project repository/branch. Initialise Git in the intended project folder if no repository exists; do not create nested repositories.
2. If the destination is missing or ambiguous, ask once for the user's GitHub repository URL. If authentication is missing, request the normal sign-in/setup step without asking for a token in chat. Complete unblocked implementation and a local commit while that is unresolved. Do not invent a remote or push to a different repository.
3. Before the phase commit, update README and relevant docs, run applicable checks, review the diff and stage only intended project changes. Include the lockfile and migrations.
4. Keep meaningful incremental commits when useful, and a clear phase-completion commit such as `feat(phase-2): complete orders and cutoff processing`. Do not fabricate or backdate commit history.
5. Push the completed phase to the verified remote/branch. Verify the remote branch points to the pushed commit; inspect CI for that commit when CI is available, fix attributable failures and push the fix.
6. If push fails, preserve local work and commit, report the concrete error and mark synchronisation blocked. Never claim it was pushed. Retry after the blocker is resolved; do not bypass authentication or network restrictions.
7. Never force-push, discard user work, delete branches, rewrite shared history or bypass protected-branch rules to make a push succeed. If protection requires a branch/PR workflow, use the permitted workflow and report the result.
8. Do not blindly stage everything. Keep real `.env` files, credentials, keys, dependencies, generated build output and private recruiter correspondence out of commits. Public demo credentials and placeholder environment examples are intentional exceptions.
9. The final assignment repository must be public as the submission email requires. Verify existing visibility; do not silently make unrelated/private content public. If a visibility change is needed, prepare a reviewed project-only result and ask specifically about that change.

These instructions authorise commits/pushes for the selected project; they do not authorise paid hosting purchases or submission of the hiring form. Continue already-authorised deployment work and ask only for genuinely missing access or authorisation. Prepare concrete deployable work before requesting a hosting decision.

## 8. Demo data and availability

Seed exactly these staff accounts with hashed passwords and correct isolated roles:

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@test.com | Test@1234 |
| Kitchen | kitchen@test.com | Test@1234 |
| Dispatch | dispatch@test.com | Test@1234 |
| Driver | driver@test.com | Test@1234 |

Use synthetic companies/employees and realistic menu/orders across past dates, today and next week, with all statuses represented appropriately. Maintain today's deliveries for the driver account on whichever day a reviewer signs in, including weekends through suitable demo calendars.

Seed and daily fixture creation must be idempotent and preserve reviewer changes. Keep the actual current clock; do not freeze today at the submission date. Separate demo history construction from the ordinary order API. Document fixtures, scheduling, startup catch-up, hosting limitations and at least two weeks of availability after submission.

## 9. Rule maintenance and explanation

Keep these rules concise enough to use. Add a new permanent guideline only when it captures an explicit user decision or a concrete project lesson; log progress in README, not this file. Do not amend a rule merely to permit an otherwise disallowed shortcut.

Use plain explanations so the user can explain the submitted code. Highlight the decisions behind prices, cutoffs, relationships, permissions and transaction boundaries. When resuming, trust inspected files/Git state and recorded evidence, not recollection of an earlier chat.
