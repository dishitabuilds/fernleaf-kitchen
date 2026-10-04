# Billing, staff and dashboard release evidence

The inherited `fbfc992` commit added billing/staff/dashboard modules and screens but had no focused Phase 4 tests, failed lint and used a unique `Order.invoiceId` that prevented a multi-order invoice. This release repairs those modules while keeping the Phase 3 order, kitchen and delivery workflow.

## Billing policy and transaction boundaries

- Confirmed and Delivered orders with recorded totals and no invoice are billable. Draft, Placed, Cancelled and Rejected orders are excluded. Selected orders must belong to one recorded `Order.companyId`; employee transfers do not redirect old purchases.
- Each Order row stores at most one invoice ID. Many orders may share one invoice. Creation claims every selected eligible order and creates its immutable gross in one Serializable transaction with conflict retries. Any invalid selection or losing race rolls back the entire invoice and all memberships. Gross is the exact BigInt sum of recorded order cents, checked against the PostgreSQL integer range before conversion.
- Invoice billing identity is captured from the earliest selected order by order number, using its purchase-time company snapshot. Each member separately exposes its original billing snapshot, including when that company changed details between purchases. Invoice identity/gross/billing snapshot and established membership cannot be updated in PostgreSQL. The migration backfills existing invoices from their earliest member, with existing company details only as a fallback for memberless legacy invoices.
- Confirmation freezes purchased quantities/prices. Logistics corrections do not reprice. Cancelling a Confirmed order before invoicing makes it unbillable; after invoicing the same reasoned Admin action adds a credit for its original amount minus prior credits, preserves invoice membership/gross and removes active preparation/drop membership. Delivered orders stay Delivered; a reasoned shortage credit is the separate adjustment.
- Partial shortage credits require a Delivered order on that invoice, a positive whole-cent amount and a nonblank reason. Total order credits cannot exceed its original recorded total. The credit and order timeline event commit together. Concurrent credits use Serializable reads/writes and retries.
- Mark paid records exactly the current `gross − credits − prior payment`, including zero for a fully credited invoice. Arbitrary partial/overpayment is rejected; the UI displays the current settlement amount. Paid amount/time become immutable. Credits issued after payment produce a negative net due explicitly shown as company credit; they do not rewrite gross, erase payment or claim an employee refund.
- Invoice, settlement and shortage actions reuse the existing actor/action-ID/payload-bound transaction replay record. Repeated identical actions return their committed response; different payload reuse returns 409. Cancellation uses the existing order action replay. Failed actions create no replay record.

## Exact dashboard calculations

`GET /dashboard` derives the role from the authenticated session. All its queries share one RepeatableRead PostgreSQL snapshot. Default operational date is actual today in Asia/Kolkata; Admin/Kitchen/Dispatch may supply a validated delivery date. Driver always uses actual kitchen today and own staff ID, ignoring a supplied date for its scope. All amounts are integer USD cents; operational grouping uses `Order.deliveryDate` / `DeliveryDrop.deliveryDate`, never creation date.

| Role / metric | Exact query and calculation |
| --- | --- |
| Admin committed orders/meals | Selected-date Orders with status Confirmed or Delivered; count rows and sum their `OrderLine.quantity`. Draft and Placed row counts on that date appear separately. Cancelled/Rejected are excluded. |
| Admin uninvoiced value, all dates | Sum `Order.totalMinor` for Confirmed/Delivered orders with `invoiceId IS NULL` and nonnull recorded total. The card links to `invoiced=false&billable=true`, matching both statuses. Missing totals are excluded rather than invented; committed totals are required by database constraints. Empty sum is zero. |
| Admin receivables / company credits, all dates | For every invoice, `net = totalMinor − sum(BillingCredit.amountMinor) − paidAmountMinor`. Receivables sum only positive net values. Company credits sum the absolute values of negative net values, separately. Zero balances contribute to neither. Cancelled members remain in original gross with their separate credit. |
| Kitchen station remaining / total | PrepUnits whose combination's line belongs to a selected-date Confirmed Order. Group by recorded station ID/name; missing station is Unassigned. Total counts all included units; remaining counts Pending or Started. This counts combinations, not meals. Cancelled/Rejected/Delivered work is excluded. |
| Kitchen late / at risk / missing plan | Among remaining units, late if order `plannedKitchenReadyAt < now`; otherwise at risk if `plannedKitchenReadyAt − now <= settings.riskThresholdMinutes`. Each unit contributes once, making late and at-risk disjoint. Missing plan contributes only to its exception count. Planned times are nonnull in the current schema, so zero missing plans is expected for valid records. |
| Dispatch waiting / ready / travelling / delivered | Selected-date drops containing at least one Confirmed or Delivered member. Awaiting kitchen = waiting; Kitchen ready and Dispatch ready = ready; Out for delivery = travelling; Delivered = delivered. Empty/cancelled-only groups are excluded. |
| Dispatch unassigned | Included Awaiting kitchen, Kitchen ready or Dispatch ready drops with null driver ID. Delivered and travelling are not queued as unassigned. |
| Driver route / next stop | Own current-kitchen-date drops with at least one Confirmed/Delivered member, ordered by `deliveryAt`, then stable ID. Total counts all included drops, completed counts Delivered. Next stop is first non-Delivered record. Empty/cancelled-only drops and other dates/drivers are excluded. |
| Driver on-time / missing timing | Denominator is Delivered drops having both actual `deliveredAt` and captured `targetAtDeparture`. Numerator has actual delivery `<=` that immutable departure target. Missing timing counts Delivered drops missing either. UI shows numerator/valid denominator; denominator zero is N/A. Completion count uses all delivered drops independently. |

All empty counts are zero. There are no speculative profit, growth, satisfaction or missing-data estimates. Landing routes show role-specific summaries alongside their actionable worklists; summaries refresh every 30 seconds and surface failed requests.

## Staff management

Admin creates normalized valid-email accounts with hashed passwords, edits display names/one role, resets passwords and deactivates accounts. Roles/password changes and deactivation invalidate sessions in the same transaction. Existing sessions also derive current role/active state from the database on every request. Serializable last-Admin checks preserve an active administrator. A Driver used as a company default or assigned to active non-Delivered work must be reassigned before role change/deactivation; historical completed delivery attribution remains.

## Verification

Executed on 4 October 2026 using only guarded `TEST_DATABASE_URL` ending `_test`, separate from application data:

```powershell
pnpm db:generate
pnpm --filter @fernleaf/contracts build
pnpm --filter @fernleaf/api typecheck
pnpm --filter @fernleaf/api test:integration --runTestsByPath ../../tests/integration/billing-release.spec.ts
```

- Focused PostgreSQL/API suite: **10/10 passed, 35.592 seconds**. It covers Admin-only permissions/financial redaction, multi-order invoice reconciliation, immutable billing identity/gross/membership, invoice replay and independent invoice race, rollback on invalid selection, exact settlement/payment replay, post-payment negative credit balance, bounded concurrent shortage credits/payload reuse, invoiced cancellation replay preserving purchase/membership, exact dashboard queue/date exclusions, and staff/session protections.
- Focused ESLint for billing/dashboard/staff API, dashboard/staff frontend and this test passed. API typecheck passed after Prisma generation.
- Shared test cleanup now deletes billing credits before orders and invoices after orders, only within existing guarded isolated test databases.
- Browser tests, full regression/build, local application migration and hosted verification are separate checks recorded by the release handoff. This focused evidence does not claim those checks or deployment succeeded.

CSV import, unfinished portions, delivery photos and decorative charts remain deferred while Must verification and live deployment are prioritized.
