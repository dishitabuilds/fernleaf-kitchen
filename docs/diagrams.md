# Architecture and lifecycle diagrams

The authentication sequence describes Phase 0. The business ER, activity, state and data-flow diagrams are **planned blueprint models**. Only StaffUser and Session exist in the Phase 0 schema. See [README](../README.md) for evidence/status and the [blueprint](../Heizen-Implementation-Blueprint.md) for complete requirements.

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

## Planned business relationships

This core diagram omits reference/option/menu joins and temporarily incomplete Draft children. A Placed order requires valid lines/combinations. Staff login identities and customer employee records stay separate.

```mermaid
erDiagram
    COMPANY ||--|{ EMPLOYEE : employs
    COMPANY ||--|{ COMPANY_ADDRESS : has
    COMPANY ||--o{ ORDER : billed_for
    COMPANY ||--o{ INVOICE : receives
    EMPLOYEE ||--o{ ORDER : ordered_for
    ORDER ||--|{ ORDER_LINE : contains
    ORDER_LINE ||--|{ COMBINATION : splits_into
    COMBINATION ||--o| PREP_UNIT : produces
    COMBINATION ||--o{ SELECTION_SNAPSHOT : records
    DELIVERY_DROP o|--|{ ORDER : groups
    STAFF_USER o|--o{ DELIVERY_DROP : drives
    INVOICE o|--|{ ORDER : includes_once
    INVOICE ||--o{ BILLING_CREDIT : adjusted_by
```

Placement captures company/address/dish/option/quantity/price snapshots. Mutable reference IDs permit navigation without becoming the source of historical amounts. Invoice membership is unique per order. One prep unit represents one combination on its original line; equal dishes on different orders remain separate work records. Drops share exact company, canonical actual address and delivery instant.

## Planned order placement sequence

```mermaid
sequenceDiagram
    actor Admin
    participant Web as Next.js
    participant API as NestJS
    participant DB as PostgreSQL
    Admin->>Web: Choose employee, date, dish and combinations
    Web->>API: GET eligible menu and POST quote
    API->>DB: Read company, calendar, flags and effective prices
    API-->>Web: Quote breakdown and cutoff
    Admin->>Web: Accept quote and place
    Web->>API: POST IDs, choices, quantities and quote fingerprint
    API->>API: Authenticate, authorise and validate DTO
    API->>DB: Begin transaction and reread rules/versions
    API->>API: Check date, cutoff, flags, groups, quantity sums and MOQ
    API->>API: Resolve exact prices and compare accepted quote
    alt Valid and unchanged quote
        API->>DB: Write order, immutable snapshots and timeline event
        DB-->>API: Commit
        API-->>Web: Authoritative order and total
    else Invalid or price changed
        API->>DB: Roll back
        API-->>Web: Field errors or replacement quote
    end
```

## Planned due-cutoff activity

```mermaid
flowchart TB
    Trigger[Scheduler / startup catch-up / Admin manual action] --> Due{Cutoff has passed?}
    Due -->|No| Wait[Reject future manual action or wait]
    Due -->|Yes| Load[Read eligible Draft and Placed orders]
    Load --> Tx[Recheck clock, state and version in transaction]
    Tx --> State{Current commercial state}
    State -->|Draft| Cancel[Cancel and record timeline event]
    State -->|Placed| Confirm[Confirm original purchase and billability]
    State -->|Already processed| Skip[Skip duplicate effects]
    Confirm --> Work[Create unique prep units and attach exact drop]
    Cancel --> Commit[Commit counts and report failures]
    Work --> Commit
    Skip --> Commit
```

One date-processing record does not replace conditional transitions and unique side effects. Retrying a due date also finds newly eligible Admin/demo records without duplicating prior work.

## Planned separate state machines

Commercial order state is separate from preparation and delivery state.

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Placed: Valid placement
    Draft --> Cancelled: Permitted cancellation or due cutoff
    Placed --> Confirmed: Due cutoff once
    Placed --> Cancelled: Before cutoff or explicit Admin policy
    Placed --> Rejected: Admin reason
    Confirmed --> Delivered: Atomic grouped delivery
    Confirmed --> Cancelled: Explicit Admin cancellation policy
```

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

Concurrent/repeated commands use conditional transitions and idempotency. Pre-departure regrouping can invalidate readiness; a departed-drop correction is drop-wide. Completed history retains actual timestamps and the target captured at departure.

## Planned business data flow

```mermaid
flowchart TB
    Config[(Catalogue / tiers / companies / employees / calendars)] --> Resolve[API visibility, eligibility and exact pricing]
    Choices[Staff IDs / choices / quantities] --> Resolve
    Resolve --> Purchase[(Immutable order purchase and delivery snapshots)]
    Purchase --> Cutoff[Idempotent due-cutoff processing]
    Cutoff --> Prep[(Unique prep units / readiness timestamps)]
    Cutoff --> Billable[Eligible original order amounts]
    Prep --> Drop[(Grouped drops / delivery timing)]
    Billable --> Invoice[(Immutable invoices / payments / credits)]
    Prep --> Dashboard[Permission-scoped dashboard queries]
    Drop --> Dashboard
    Invoice --> Dashboard
```

Catalogue changes affect future resolution, not past snapshot amounts. Future dashboard numbers follow exact backend-query definitions in README and reconcile to linked source records.
