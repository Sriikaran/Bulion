# BULLION — V3 PHASE 2: FULFILMENT / PHYSICAL DELIVERY SEPARATION IMPLEMENTATION REPORT

**Repository**: `https://github.com/Sriikaran/Bulion`  
**Date**: October 3, 2026  
**Status**: APPROVED & FULLY VERIFIED (Zero TypeScript Errors, Zero ESLint Errors, 100% Tests Passing, Production Build Passing)

---

## 1. Existing Architecture & Transition Context

Prior to V3.2, posting a commercial deal directly recorded physical inventory movements:
- `postPurchase` atomically inserted a `PURCHASE` record in `StockMovement` (+weight).
- `postSale` asserted available physical stock and inserted a `SALE` record in `StockMovement` (-weight).

While suitable for simple spot counter trades, this tightly coupled the commercial contract with vault logistics. In commercial bullion trading, deals are often agreed upon in forward commitments, unfixed rates, or delivered in multiple physical consignments across days or weeks.

In V3 Phase 2, a strict 3-tier decoupling is established:
```
COMMERCIAL DEAL (Purchase / Sale)
        ↓
FULFILMENT (Tranche / Delivery Event)
        ↓
PHYSICAL STOCK MOVEMENT (Append-only StockMovement Ledger)
```

No physical stock enters or leaves the vault merely because a commercial Purchase or Sale is created or posted.

---

## 2. Fulfilment Model

A dedicated first-class `Fulfilment` domain entity has been introduced in Prisma schema:

```prisma
enum FulfilmentStatus {
  PENDING
  PARTIALLY_FULFILLED
  FULFILLED
  CANCELLED
}

enum FulfilmentType {
  PURCHASE
  SALE
}

model Fulfilment {
  id               String           @id @default(cuid())
  fulfilmentNumber String           @unique
  purchaseId       String?
  purchase         Purchase?        @relation(fields: [purchaseId], references: [id], onDelete: Restrict)
  saleId           String?
  sale             Sale?            @relation(fields: [saleId], references: [id], onDelete: Restrict)
  type             FulfilmentType
  status           FulfilmentStatus @default(PENDING)
  weightGrams      Decimal          @db.Decimal(12, 4)
  fulfilledAt      DateTime         @default(now())
  fulfilledById    String
  fulfilledBy      User             @relation("FulfilledByUser", fields: [fulfilledById], references: [id], onDelete: Restrict)
  notes            String?
  stockMovements   StockMovement[]
  auditLogs        AuditLog[]
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@index([purchaseId])
  @@index([saleId])
  @@index([type])
  @@index([status])
  @@index([fulfilledAt])
}
```

Key characteristics:
- Belongs to exactly one commercial Purchase OR Sale.
- Supports multiple fulfilments per commercial deal (one-to-many relationship).
- Uses `Decimal(12, 4)` for high-precision sub-milligram weight accounting.
- Directly references `User` (`fulfilledBy`) for accountability.

---

## 3. Status Lifecycle

Transactions follow an explicit lifecycle state machine:
- **`PENDING`**: When a commercial Purchase or Sale is created or posted, 0g has been physically received/delivered. Physical stock is unchanged.
- **`PARTIALLY_FULFILLED`**: At least one delivery has occurred, but total fulfilled weight is strictly less than agreed weight (`0 < fulfilled < agreed`).
- **`FULFILLED`**: Total fulfilled weight exactly equals agreed weight (`fulfilled === agreed`). Physical delivery is 100% complete.
- **`CANCELLED`**: The commercial deal has been cancelled. No further deliveries may be recorded against it.

---

## 4. Purchase Fulfilment Flow

When `fulfilPurchase` is executed:
1. Locks the `Purchase` row via `SELECT ... FOR UPDATE`.
2. Validates that `status === 'POSTED'` and `fulfilmentStatus !== 'CANCELLED'`.
3. Validates requested weight: `weightGrams > 0` and `weightGrams <= (agreed - alreadyFulfilled)`.
4. Creates a `Fulfilment` record with type `PURCHASE` and auto-generated `FUL-PUR-XXXXXX` voucher number.
5. Inserts an immutable `StockMovement` row (+weight, type `PURCHASE`) linked to `fulfilmentId` and `purchaseId`.
6. Evaluates new cumulative fulfilled weight and transitions purchase `fulfilmentStatus` to `PARTIALLY_FULFILLED` or `FULFILLED`.
7. Records an audit entry in `AuditLog` capturing previous vs new fulfilment statuses and actor ID.

---

## 5. Sale Fulfilment Flow

When `fulfilSale` is executed:
1. Locks the `Sale` row via `SELECT ... FOR UPDATE`.
2. Validates that `status === 'POSTED'` and `fulfilmentStatus !== 'CANCELLED'`.
3. Validates requested weight: `weightGrams > 0` and `weightGrams <= (agreed - alreadyFulfilled)`.
4. **Physical Stock Invariant Check**: Queries current physical stock (`StockService.getAvailableStock`) and asserts `availableStock >= requestedWeight`. Fails immediately if vault balance is insufficient.
5. Creates a `Fulfilment` record with type `SALE` and `FUL-SAL-XXXXXX` voucher number.
6. Inserts an immutable `StockMovement` row (-weight, type `SALE`) linked to `fulfilmentId` and `saleId`.
7. Transitions sale `fulfilmentStatus` to `PARTIALLY_FULFILLED` or `FULFILLED`.
8. Records an audit log entry.

---

## 6. Partial Fulfilment

Partial delivery consignments are supported with exact Decimal precision:
- Commercial Deal: 500.000g Gold
- Consignment 1: 150.000g → Purchase status becomes `PARTIALLY_FULFILLED`, Vault gets +150.000g.
- Consignment 2: 200.000g → Purchase status remains `PARTIALLY_FULFILLED`, Vault gets +200.000g.
- Remaining: 150.000g.
- Consignment 3: 150.000g → Purchase status transitions to `FULFILLED`, Vault gets +150.000g.
- Total Physical Stock Movement: 150 + 200 + 150 = 500.000g.

---

## 7. StockMovement Behaviour

`StockMovement` is created **ONLY** upon physical fulfilment:
- Creating a Draft Purchase/Sale: 0 movements.
- Posting a Purchase/Sale: 0 movements (`fulfilmentStatus` set to `PENDING`).
- Recording Fulfilment: Exactly 1 signed movement per consignment.
- No phantom inventory can ever enter the system from unfulfilled paper agreements.

---

## 8. Settlement Separation

Financial settlement (V2) and physical fulfilment (V3.2) are orthogonal dimensions:
- A deal can be `RATE: FIXED`, `SETTLEMENT: PAID`, `FULFILMENT: PENDING` (Supplier paid in advance, waiting for metal delivery).
- A deal can be `RATE: FIXED`, `SETTLEMENT: UNPAID`, `FULFILMENT: FULFILLED` (Metal physically received in vault, payment on 30-day credit terms).
- A deal can be `RATE: UNFIXED`, `SETTLEMENT: UNPAID`, `FULFILMENT: PARTIALLY_FULFILLED` (Consignment received before rate fixing and settlement).

Neither status mutates the other.

---

## 9. Rate-Status Separation

Fulfilment and V3.1 Rate Fixing (`FIXED` vs `UNFIXED`) are decoupled:
- Physical delivery may take place while rate is `UNFIXED` (fixing weight and purity delivered, with monetary price fixed later).
- Rate fixing does not trigger physical delivery.
- Both status dimensions are recorded independently on `Purchase` and `Sale`.

---

## 10. Cancellation & Reversal Handling

When a transaction is cancelled:
- **If cancelled before any fulfilment (`fulfilledWeight === 0`)**:
  - No physical inventory ever entered/left the vault.
  - No `StockMovement` reversal records are created.
  - `fulfilmentStatus` is marked `CANCELLED`.
- **If cancelled after partial or full fulfilment (`fulfilledWeight > 0`)**:
  - Preserves historical fulfilment consignments and original `StockMovement` records for full auditability.
  - Creates a single compensating `StockMovement` reversal record (`PURCHASE_CANCEL` or `SALE_CANCEL`) for exactly the fulfilled weight.
  - `fulfilmentStatus` is marked `CANCELLED`.

---

## 11. Historical Data Migration Strategy

To guarantee that legacy V1/V2 transactions remain consistent without duplicating stock:
- Built and ran `scripts/backfill-fulfilments.ts`.
- Identified all existing historical POSTED purchases and sales that already had legacy `StockMovement` records attached.
- Created corresponding `FULFILLED` `Fulfilment` entities linking to those existing transactions and movements.
- Marked historical transactions as `fulfilmentStatus: "FULFILLED"`.
- Did NOT insert new `StockMovement` rows, preserving existing historical stock balances with 100% precision.

---

## 12. Audit Behaviour

Every fulfilment consignment writes an immutable event to `AuditLog`:
- Action: `FULFILMENT_RECORDED`
- EntityType: `Fulfilment`
- EntityId: `fulfilmentId`
- Details: `{ transactionType, invoiceNumber, deliveredWeightGrams, totalFulfilledGrams, agreedWeightGrams, previousFulfilmentStatus, newFulfilmentStatus }`
- Logged with timestamp and authenticated actor ID.

---

## 13. UI Changes

1. **Purchases Register (`/purchases`)**:
   - Added `Fulfilment` column displaying badge (`PENDING`, `PARTIAL`, `FULFILLED`, `CANCELLED`) and weight ratio (`fulfilled / agreed`).
   - Added `Fulfil` button in Actions menu for unfulfilled posted deals.
   - Connected `FulfilmentDialog` modal.
2. **Sales Register (`/sales`)**:
   - Added `Fulfilment` column and live ratio.
   - Added `Fulfil` button in Actions menu.
   - Connected `FulfilmentDialog` modal.
3. **Fulfilment Dialog (`src/components/fulfilment-dialog.tsx`)**:
   - Clean modal showing Transaction, Invoice #, Metal, Purity, Agreed Weight, Already Fulfilled, and Remaining Weight.
   - Real-time calculation formula: `Already Fulfilled + This Fulfilment = Total Fulfilled (Remaining After)`.
   - Client-side validation preventing `<= 0` or `> remaining` inputs before submit.

---

## 14. Fulfilment Report

Accessible at `/reports/fulfilment`:
- **Filters**: Date From, Date To, Deal Type (Purchases / Sales), Status (`PENDING`, `PARTIALLY_FULFILLED`, `FULFILLED`, `CANCELLED`), Metal, Purity, Counterparty, Search (invoice/party/notes).
- **Summary Cards**: Total Agreed Weight, Total Fulfilled Weight, Remaining Weight, Fully Fulfilled Deals Count.
- **Columns**: Date, Type (PURCHASE/SALE), Invoice #, Party, Metal & Purity, Agreed Weight, Fulfilled Weight, Remaining Weight, Status.
- **CSV Export**: Fully formatted CSV export via `bullion-fulfilment-report-{date}.csv`.
- Added to `ReportsNav` and main Reports Hub directory.

---

## 15. Concurrency Protection

Fulfilment operations prevent race conditions and overshooting:
- Wrapped in `prisma.$transaction`.
- Acquires pessimistic row-level lock: `SELECT id FROM purchase/sale WHERE id = $1 FOR UPDATE`.
- Re-reads fulfilled total inside the lock.
- Atomically validates remaining weight before inserting `Fulfilment` and `StockMovement`.
- Prevents concurrent requests from over-allocating remaining inventory.

---

## 16. Performance Considerations

- Added database indexes on `Fulfilment([purchaseId])`, `Fulfilment([saleId])`, `Fulfilment([type])`, `Fulfilment([status])`, and `Fulfilment([fulfilledAt])`.
- Avoided N+1 queries by querying aggregated fulfilment records via Prisma `include` with indexed foreign keys.
- Streaming CSV exports and filtered server-side queries.

---

## 17. Tests Added (`tests/unit/b7-fulfilment.test.ts`)

Added 38 unit tests covering all 34 required test cases:
1. New purchase starts PENDING (0 stock movements)
2. New sale starts PENDING (0 stock movements)
3. Purchase fulfilment creates StockMovement IN (+weight)
4. Sale fulfilment creates StockMovement OUT (-weight)
5. Partial purchase fulfilment updates status to PARTIALLY_FULFILLED
6. Partial sale fulfilment updates status to PARTIALLY_FULFILLED
7. Full purchase fulfilment updates status to FULFILLED
8. Full sale fulfilment updates status to FULFILLED
9. Correctly calculates remaining quantity across deliveries
10. Rejects fulfilment exceeding remaining quantity
11. Rejects zero quantity fulfilment
12. Rejects negative quantity fulfilment
13. Rejects fulfilment against cancelled transaction
14. Multiple partial deliveries sum up to exact agreed weight
15. Last delivery tranche marks status FULFILLED
16. Initial delivery tranche transitions PENDING -> PARTIALLY_FULFILLED
17. Pure commercial deal posting leaves physical stock at zero
18. Physical delivery succeeds on UNFIXED rate purchase/sale
19. Physical delivery works smoothly on FIXED rate deals
20. Fulfilment does not alter financial settlement status
21. Concurrency protection prevents overshooting remaining weight
22. Each delivery creates exactly one StockMovement tied to the fulfilmentId
23. Invariant holds: `Opening + Purchase Fulfilments - Sale Fulfilments = Current Stock`
24. Cancelling deal before fulfilment creates NO reversal StockMovements
25. Cancelling deal after partial fulfilment reverses ONLY fulfilled quantity
26. Cancelling fully fulfilled deal reverses full weight
27. Reversal preserves original delivery movements in append-only log
28. Existing V1 stock math remains strictly additive and sign-correct
29. Existing V2 financial outstanding math works completely independently of physical delivery
30. Existing V3.1 rate fixing produces accurate monetary total
31. Report derivation correctly calculates fulfilled vs remaining
32. Decimal weight precision maintains sub-milligram accuracy without IEEE-754 drift
33. Every physical delivery creates an immutable audit trail entry
34. Fulfilment report aggregates agreed, fulfilled, and remaining weights accurately
35-38. Zod schema validation edge case tests for `CreateFulfilmentSchema`.

---

## 18. Full Test Results

```
 RUN  v4.1.11 Bullion

 ✓ tests/unit/stock-logic.test.ts (3 tests)
 ✓ tests/unit/b1-domain.test.ts (31 tests)
 ✓ tests/unit/helpers.test.ts (11 tests)
 ✓ tests/unit/b7-fulfilment.test.ts (38 tests)
 ✓ tests/unit/b6-rate-fixing.test.ts (29 tests)
 ✓ tests/unit/b5-financial-settlement.test.ts (22 tests)
 ✓ tests/unit/b2-operational.test.ts (16 tests)
 ✓ tests/unit/b3-reporting.test.ts (11 tests)
 ✓ tests/unit/b4-hardening.test.ts (16 tests)

 Test Files  9 passed (9)
      Tests  177 passed (177)
   Duration  909ms
```

---

## 19. TypeScript Verification

```
> bullion@0.1.0 typecheck
> tsc --noEmit

Exit code: 0
Errors: 0
```

---

## 20. ESLint Verification

```
> bullion@0.1.0 lint
> eslint .

Exit code: 0
Errors: 0
Warnings: 27 (pre-existing unused variables across legacy components)
```

---

## 21. Prisma Schema Verification

```
Loaded Prisma config from prisma.config.ts.
Prisma schema loaded from prisma\schema.prisma.
The schema at prisma\schema.prisma is valid 🚀
```

---

## 22. Production Build Verification

```
> bullion@0.1.0 build
> prisma generate && next build

✔ Generated Prisma Client (v7.10.0) in 387ms
▲ Next.js 16.2.10 (Turbopack)
✓ Compiled successfully in 20.3s
✓ Generating static pages (25/25) in 472ms
✓ Finalizing page optimization ...

Route (app)
├ ƒ /reports/fulfilment (New Fulfilment Report)
... 24 other routes compiled successfully
Exit code: 0
```

---

## 23. Files Changed

### Schema & Database
- `prisma/schema.prisma`
- `scripts/backfill-fulfilments.ts`

### Backend Services & Actions
- `src/lib/validations/fulfilment.ts`
- `src/lib/services/fulfilment-service.ts`
- `src/lib/services/purchase-service.ts`
- `src/lib/services/sale-service.ts`
- `src/lib/services/audit-service.ts`
- `src/lib/services/report-service.ts`
- `src/lib/actions/fulfilment-actions.ts`

### UI Components & Pages
- `src/components/fulfilment-dialog.tsx`
- `src/components/reports/reports-nav.tsx`
- `src/app/(app)/purchases/purchases-client.tsx`
- `src/app/(app)/purchases/page.tsx`
- `src/app/(app)/sales/sales-client.tsx`
- `src/app/(app)/sales/page.tsx`
- `src/app/(app)/reports/page.tsx`
- `src/app/(app)/reports/fulfilment/page.tsx`
- `src/app/(app)/reports/fulfilment/fulfilment-report-view.tsx`

### Unit Tests
- `tests/unit/b7-fulfilment.test.ts`

---

## 24. Unresolved Issues

None. All 34 test requirements and verification gates have passed with 100% adherence to constraints.
