# Architecture and lifecycle diagrams

The current application includes configuration, orders/cutoffs, kitchen, grouped dispatch/Driver, billing/credits, staff management, role summaries and rolling review fixtures. Release fixes and actual checks are tracked in [release verification](release-verification.md), [billing evidence](phase-4-release.md), [demo jobs](demo-fixtures.md) and [deployment record](deployment.md). Historical phase evidence below describes its original checkpoint; live verification is a separate gate.

## Phase 0 authentication and HTTP boundary

```mermaid
sequenceDiagram
    actor Staff
    participant Browser
    participant Web as Next.js HTTP rewrite
    participant API as NestJS
    participant DB as PostgreSQL
    Staff->>Browser: Submit email and password
    Browser->>Web: POST /api/v1/auth/login with Origin
    Web->>API: Proxy request over HTTP
    API->>API: Validate origin and strict DTO
    API->>DB: Read active StaffUser and verify scrypt hash
    API->>DB: Store SHA256 token hash and expiry
    API-->>Web: HttpOnly session cookie and public identity / CSRF token
    Web-->>Browser: Cookie scoped to staff web host
    Browser->>Web: GET /api/v1/auth/me with cookie
    Web->>API: Proxy cookie and request
    API->>DB: Read session and current user/role
    API->>API: Check expiry, active status and permission
    alt Authorised
        API-->>Browser: Public identity and permissions
    else Missing/expired session or forbidden permission
        API-->>Browser: 401 or 403
    end
    Browser->>Web: POST logout with Origin and x-csrf-token
    Web->>API: Proxy authenticated mutation
    API->>DB: Delete session
    API-->>Browser: Clear cookie
```

The CSRF value is an HMAC derived from the opaque token. Its validation does not replace the exact `WEB_ORIGIN` check. Current account active status/role are checked on each request; token contents do not grant a stale role. Explicit route policies fail closed when absent.

## Phase 2 persisted business relationships

This core diagram omits the configuration joins shown in [architecture](architecture.md). Drafts may have no lines; placement requires valid lines/combinations. Staff login identities and customer employee records stay separate. Operational action endpoints are not implied by the existence of prep/drop tables.

```mermaid
erDiagram
    COMPANY ||--|{ EMPLOYEE : employs
    COMPANY ||--|{ COMPANY_ADDRESS : has
    COMPANY ||--o{ ORDER : captured_billing_company
    EMPLOYEE ||--o{ ORDER : ordered_for
    DELIVERY_DATE_CUTOFF ||--o{ ORDER : kitchen_deadline
    ORDER ||--o{ ORDER_LINE : contains
    DISH ||--o{ ORDER_LINE : retained_identity
    ORDER_LINE ||--|{ ORDER_COMBINATION : quantity_partition
    ORDER_COMBINATION ||--o| PREP_UNIT : unique_work
    ORDER_COMBINATION ||--o{ SELECTION_SNAPSHOT : records
    ORDER ||--o{ ORDER_REVISION : immutable_purchase_history
    ORDER ||--o{ ORDER_EVENT : timeline
    ORDER ||--o{ ORDER_ACTION : idempotent_response
    COMPANY ||--o{ DELIVERY_DROP : receives
    DELIVERY_DROP o|--o{ ORDER : same_company_members
    STAFF_USER o|--o{ DELIVERY_DROP : drives
```

An order retains its captured company even when the employee transfers. Purchase snapshots and unique order/version revisions preserve company/delivery/dish/options/quantities/prices; current logistics can change separately. Dish remains a restricted live FK, while menu item, selection group/option/tier and prep-station IDs are historical scalars without live FKs. Historical actor IDs also remain scalars, with event actor names captured. Replacing a catalogue group therefore cannot erase past selections. Events sort by timestamp and a unique increasing sequence, keeping same-millisecond placement/confirmation history stable.

One canonical combination on its original line creates one unique prep unit at confirmation; equal combinations on different orders remain separate work. Drops group by company, normalized actual address and exact UTC delivery instant. Address label/ID, employee and packaging are not grouping keys. The composite order/drop/company FK prevents cross-company membership. Invoice membership and credits are persisted; their relationship is shown below.

```mermaid
erDiagram
    COMPANY ||--o{ INVOICE : captured_billing
    INVOICE o|--|{ ORDER : immutable_membership
    INVOICE ||--o{ BILLING_CREDIT : internal_adjustments
```

## Implemented and locally verified quote and mutation sequence

The backend quote-policy provider and order controller/service are registered. The user's confirmed policy chooses exactly one option in required groups, zero/one in optional groups, rejects duplicate dish lines and restricts ordinary addresses to active saved company addresses. Variants use combinations; canonical duplicate combinations merge within their line. Custom addresses and employee-flag exceptions require an explicit reasoned Admin override. The builder acceptance controls and new order journeys have passing local browser evidence.

```mermaid
sequenceDiagram
    actor Admin
    participant Web as Next.js
    participant API as NestJS
    participant DB as PostgreSQL
    participant Cutoff as Shared confirmation helper
    Admin->>Web: Choose employee, date, dish and combination quantities
    Web->>API: POST /orders/quote over HTTP
    API->>DB: Read current menu, company, flags, settings and date policy
    API->>API: Validate selections, sums, MOQ and exact prices
    API-->>Web: Full server quote, cutoff and fingerprint
    Admin->>Web: Review and explicitly accept quote
    Web->>API: Mutation with input, accepted fingerprint and action ID
    API->>API: Authenticate, authorise and validate strict DTO
    API->>DB: Serializable transaction, check actor/action replay and version
    alt Identical committed action already exists
        DB-->>API: Stored response
        API-->>Web: Replay result without duplicate effects
    else New valid action
        API->>API: Requote current rules and compare fingerprint
        alt Accepted quote unchanged
            API->>DB: Write order, purchased rows, revision and timeline
            opt Explicit late Admin placement with reason
                API->>Cutoff: Confirm already-due Placed order in same transaction
                Cutoff->>DB: Freeze date policy and conditionally confirm
                Cutoff->>DB: Unique prep units, exact drop and cutoff event
            end
            API->>DB: Store action payload hash and response, commit
            API-->>Web: Authoritative order, version and total
        else Quote changed
            API->>DB: Roll back
            API-->>Web: 409 QUOTE_CHANGED with replacement server quote
        end
    else Invalid input, stale version or reused action ID with different input
        API->>DB: Roll back
        API-->>Web: Actionable 400/409 with field details
    end
```

The server fingerprint represents resolved employee/company/delivery/pricing/cutoff/purchase values. The frontend never calculates authoritative totals. Draft saves can have no lines and do not imply placement; each supplied line must still have valid combinations. Accepted placed purchase revisions are append-only. A changed quote returns its replacement for review/acceptance. Post-transfer Placed purchase edits are blocked, while explicit logistics/cancellation paths preserve the original purchase. Late creation or draft placement returns and caches Confirmed only after the shared confirmation effects succeed in that same transaction; retries replay that committed response.

## Implemented and locally verified due-cutoff processing

```mermaid
flowchart TB
    Trigger[Startup / minute timer / Admin manual HTTP action] --> Policy[Load or create delivery-date cutoff policy]
    Policy --> Due{Cutoff has passed?}
    Due -->|No| Wait[Reject future manual action or wait]
    Due -->|Yes| Freeze[Freeze date policy on first processing and record latest scan]
    Freeze --> Load[Scan date orders, including newly added records]
    Load --> Tx[Per-order transaction rechecks clock, cutoff, state and version]
    Tx --> State{Current commercial state}
    State -->|Due Draft| Cancel[Conditionally cancel and write unique cutoff event]
    State -->|Due Placed| Confirm[Shared conditional confirmation, retaining purchase prices]
    State -->|Other state or no longer due| Skip[Skip duplicate or ineligible effects]
    Confirm --> Work[Create unique pending prep units and attach exact drop]
    Cancel --> Commit[Commit successful order transaction]
    Work --> Commit
    Tx -->|Failure| Failure[Roll back that order, retain failure reference for retry]
    Commit --> Report[Return confirmed, cancelled, skipped and failed counts]
    Skip --> Report
    Failure --> Report
```

`DeliveryDateCutoff.processedAt` freezes policy; it does not mean every row succeeded. Retrying a date rescans orders, recovering failed/new records without duplicate transitions/work/events. Per-order processing rechecks the delivery date as well as state/version, so a concurrent reschedule cannot confirm under the old date's policy. Late Admin creation or explicit draft placement calls the same helper inside placement, so failure rolls back purchase, confirmation and cached response together. Future placement stays Placed.

Kitchen-settings edits recalculate only unprocessed date policies and affected Draft/Placed deadlines/versions in one transaction, adding `CUTOFF_CHANGED` events. Catch-up begins after commit. Processed dates retain their policy; company-calendar edits that close live order dates return conflicts with order links. Asia/Kolkata supplies local dates; persisted deadlines/delivery times are UTC instants. Startup, timer and manual handlers share this service; hosted scheduling has not been verified.

## Commercial order states: orders plus Phase 3 grouped delivery

Commercial order state is separate from preparation and delivery state. Phase 2 lifecycle endpoints and the builder have passing HTTP/database/browser evidence. Phase 3 implements Delivered through a grouped drop transition, with focused PostgreSQL evidence; its local browser/regression/policy gate passes.

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Placed: Accepted valid server quote
    Draft --> Cancelled: Before cutoff or due processing
    Placed --> Confirmed: Due shared confirmation once
    Placed --> Cancelled: Before cutoff or explicit Admin exception
    Placed --> Rejected: Reason-required rejection
    Confirmed --> Cancelled: Explicit Admin cancellation before delivery
    Confirmed --> Delivered: Atomic Phase 3 grouped delivery
```

Ordinary Draft/Placed purchase edits and cancellation lock at the exact cutoff. Explicit Admin exceptions require reasons and optimistic versions. Predeparture delivery corrections can regroup Confirmed orders without repricing; departed/delivered corrections use the reasoned drop-wide workflow. Confirmed cancellation clears active drop membership while preserving purchased preparation rows/actual history and incrementing its drop version. Active Kitchen reads include only Confirmed parents. Delivered orders retain their delivery fact; later shortages/credits belong to Phase 4.

## Phase 3 preparation and drop transitions — locally verified

Confirmation creates Pending prep units and grouped drops. These start/done/readiness/dispatch/Driver commands are implemented and have 23 focused PostgreSQL cases passing. The local Phase 3 gate passes final regression/browser checks and both confirmed packaging/reassignment policies; [Phase 3 evidence](phase-3.md) records the precise open work.

```mermaid
stateDiagram-v2
    [*] --> Pending
    Pending --> Started: First start
    Started --> Done: Complete
    Pending --> Done: Record both start and done
```

```mermaid
stateDiagram-v2
    [*] --> AwaitingKitchen
    AwaitingKitchen --> KitchenReady: All active member units done
    KitchenReady --> DispatchReady: Dispatch checks complete
    DispatchReady --> OutForDelivery: Active driver assigned
    OutForDelivery --> Delivered: Actual time and atomic member updates
```

Serializable transitions and action replay protect repeated/concurrent commands, aggregate readiness and grouped member updates. Direct completion records a start as well as done. Predeparture regrouping invalidates dispatch checks; every membership change versions the drop even when its state stays unchanged. Current status is the gate, while immutable readiness events preserve before/after actual timestamps. A departed-drop correction is drop-wide and keeps the original target/outcome. The user confirmed packaging invalidation before departure/locking afterward and reasoned Admin travelling-Driver reassignment; implementation and applicable checks for those additions pass.

## Data flow: implemented orders/operations into planned billing/dashboards

```mermaid
flowchart TB
    Config[(Verified catalogue / prices / companies / employees / calendars)] --> Resolve[Server quote and validation]
    Choices[Staff choices and quantities] --> Resolve
    Resolve --> Accept[Review and explicitly accept server quote]
    Accept --> Purchase[(Immutable purchase and revision snapshots)]
    Purchase --> Cutoff[Shared due confirmation]
    Cutoff --> Prep[(Unique pending prep units)]
    Cutoff --> Drop[(Exact grouped drop membership)]
    Cutoff --> Billable[Confirmed original order amounts]
    Prep --> Kitchen[Kitchen completion and aggregate readiness]
    Drop --> Delivery[Dispatch and own-today driver actions]
    Kitchen --> Delivery
    Billable -. Phase 4 .-> Invoice[(Invoices / payments / credits)]
    Kitchen -. Phase 4 .-> Dashboard[Defined permission-scoped dashboards]
    Delivery -.-> Dashboard
    Invoice -.-> Dashboard
```

Catalogue changes affect fresh quotes, not accepted historical prices. Current logistics remain visible separately from recorded purchase snapshots. Future dashboard figures must use the exact status/date/cancellation/missing-data definitions in README and reconcile to linked records. README and Phase 2 evidence record the passing local backend/browser/build/container checks and track commit/push/CI separately. Hosted smoke checks remain blocked.
