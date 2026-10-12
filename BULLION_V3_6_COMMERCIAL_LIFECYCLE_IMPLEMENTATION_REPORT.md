# BULLION — V3.6 COMMERCIAL LIFECYCLE & RESERVATION CONTROLS
## IMPLEMENTATION REPORT

**Repository**: `https://github.com/Sriikaran/Bulion`  
**Source of Truth**: `Bullion/BULLION_V3_FINAL_GAP_AUDIT.md`  
**Status**: COMPLETED  
**Date**: October 5, 2026  

---

## 1. Executive Summary

Phase V3.6 addresses the five technically actionable gaps identified in `BULLION_V3_FINAL_GAP_AUDIT.md`. It closes the commercial gap between market-rate quoting, rate reservations, trade execution, physical inventory controls, and full transaction lifecycle completion.

Crucially:
- **No changes were made to Pawnify.**
- **Existing V1 Core Bullion, V2 Financial Settlement, and V3.1–V3.5 mechanisms remain intact and fully functional.**
- **Rate Cut / Uncut** and **Preclosure / Early Settlement** remain strictly **NOT IMPLEMENTED** pending formal business definition and accounting policy decisions.
- All 310 unit tests pass, TypeScript compiler reports zero errors, ESLint reports zero errors, and the production Next.js application builds cleanly.

---

## 2. Gap-by-Gap Implementation Status

| Gap | Description | Status | Reference Code / Location |
|---|---|---|---|
| **GAP 1** | **Quote → Commercial Deal** | **IMPLEMENTED** | `src/lib/services/quote-service.ts` (`convertQuoteToDeal`), `src/lib/actions/quote-actions.ts` |
| **GAP 2** | **Standalone Customer Rate Block** | **IMPLEMENTED** | `src/lib/services/reservation-service.ts` (`createRateReservation`, `consumeRateReservation`) |
| **GAP 3** | **Available-to-Sell Inventory Layer** | **IMPLEMENTED** | `src/lib/services/stock-service.ts` (`getAvailableToSellStock`, `assertSufficientAvailableStock`), `fulfilment-service.ts` |
| **GAP 4** | **Explicit Deal Closure (`CLOSED`)** | **IMPLEMENTED** | `src/lib/services/purchase-service.ts` (`closePurchase`), `src/lib/services/sale-service.ts` (`closeSale`) |
| **GAP 5** | **Cancellation + Completed Payment Reconciliation** | **IMPLEMENTED** | `purchase-service.ts` (`cancelPurchase`), `sale-service.ts` (`cancelSale`) |
| **OUT OF SCOPE** | **Rate Cut / Uncut** | **NOT IMPLEMENTED** | Marked as `BLOCKED — BUSINESS DEFINITION REQUIRED` |
| **OUT OF SCOPE** | **Preclosure / Early Settlement** | **NOT IMPLEMENTED** | Marked as `BUSINESS DECISION REQUIRED` |

---

## 3. Quote → Deal Architecture

### Flow
```
Market Reference Rate
       ↓
Margin Rule
       ↓
Active Quote (BUY / SELL)
       ↓ [Atomic Conversion with Row-Locking]
Purchase (if BUY) OR Sale (if SELL)
  - Copies immutable quote snapshot (metal, purity, weight, rate, amount)
  - References originating quote via quoteId
  - Sets Quote status to CONSUMED (with consumedAt & consumedDealReference)
  - Deal created with rateStatus = "FIXED"
  - ZERO StockMovement generated
  - ZERO Payment/Receipt generated
```

### Key Safety Guarantees
1. **Directional Mapping**:
   - `BUY` Quote $\rightarrow$ **Purchase** (we buy bullion from counterparty/supplier at quoted rate).
   - `SELL` Quote $\rightarrow$ **Sale** (we sell bullion to counterparty/customer at quoted rate).
2. **Server-Side Validation**:
   - Validates that quote exists, is `ACTIVE`, and has not expired (`validUntil > new Date()`).
   - Row-level lock `FOR UPDATE` prevents double consumption or conversion.
   - Quote cannot create both Purchase and Sale due to unique database relation constraint (`quoteId` unique on `Purchase` and `Sale`).
3. **No Historical Rate Recalculation**:
   - Quoted rate, reference rate, margin, and total amount are taken directly from the existing immutable `Quote` snapshot.
4. **Decoupled Operations**:
   - Physical fulfilment remains a separate action (`fulfilPurchase` / `fulfilSale`).
   - Financial settlement remains a separate action (`recordPayment` / `recordReceipt`).

---

## 4. Standalone Rate Reservation Architecture

### Flow
```
Counterparty (Customer / Supplier)
       ↓
Standalone RateReservation Created:
  - counterpartyId (Existing Counterparty model)
  - metal, purity, weightGrams
  - referenceRatePerGram & margin snapshot
  - reservedRatePerGram & reservedAmount
  - expiresAt TTL
  - NO attached purchaseId or saleId
       ↓
Can be:
  - CANCELLED (manual cancellation or expired)
  - EXPIRED (automatically detected if past expiresAt)
  - CONSUMED (converted directly into a commercial Purchase or Sale deal)
```

### Key Semantics
- Standalone reservations exist **BEFORE** any deal is created.
- A standalone reservation does **NOT** create:
  - Sale / Purchase
  - StockMovement
  - Fulfilment
  - Payment / Receipt
- When consumed via `consumeRateReservation(reservationId, { direction })`:
  - Validates reservation is active and unexpired.
  - Automatically creates the corresponding `Purchase` or `Sale` deal for the reservation's counterparty, metal, purity, weight, and reserved rate.
  - Attaches the deal to the reservation and sets status to `CONSUMED`.

---

## 5. Available-to-Sell Calculation

### Formula
$$\text{Available to Sell} = \text{Physical On-Hand Stock} - \text{Active Reservations}$$

Where:
- $\text{Physical On-Hand Stock}$ is computed strictly from physical `StockMovement` records (Receipts $-$ Issues $\pm$ Adjustments).
- $\text{Active Reservations}$ is the sum of `weightGrams` across all reservations where:
  - `status = "ACTIVE"`
  - `expiresAt > NOW()`
  - Applicable to `SALE` direction (either attached to a `Sale` deal or standalone with `notes` indicating a sell-side block).
  - Matches the exact `metal` and `purity`.

### Rules & Invariants
1. **Never Negative**: If reservations exceed physical stock, $\text{Available to Sell}$ clamps to `0` (or fails validation).
2. **Server-Side Enforcement**:
   - `assertSufficientAvailableStock(tx, metal, purity, requiredWeight, excludeReservationId?)` is executed inside a transaction with row-level locks on stock movements and active reservations.
   - Evaluated during:
     - **Sale Fulfilment** (`fulfilSale`): Ensures we cannot physically deliver more than what is available.
     - **Quote Conversion to Sale** (`convertQuoteToDeal` for SELL quotes).
     - **Standalone Sell Reservation Creation** (`createRateReservation`).
3. **Automatic Expiry Release**:
   - Expired reservations (`expiresAt <= NOW()`) are ignored during availability calculation, instantly releasing inventory back to available-to-sell without requiring manual batch processing.

---

## 6. Deal Closure Lifecycle (`CLOSED`)

### State Machine Transition
$$\text{DRAFT} \rightarrow \text{POSTED} \rightarrow \text{CLOSED}$$

### Closure Pre-Conditions
A `POSTED` Purchase or Sale deal transitions to `CLOSED` **only** if all 3 criteria are met:
1. **Rate is Finalized**: `rateStatus === "FIXED"`.
2. **Fulfilment is Complete**: `fulfilmentStatus === "FULFILLED"`.
3. **Settlement is Complete**: `paymentStatus === "PAID"`.

### Incomplete Deal Behavior
- Fulfilled but unpaid $\rightarrow$ Remains `POSTED` (Open).
- Fully paid but unfulfilled $\rightarrow$ Remains `POSTED` (Open).
- Unfixed rate $\rightarrow$ Remains `POSTED` (Open).
- Already `CLOSED` $\rightarrow$ Idempotent no-op (returns existing closed deal).

### Safety & Idempotency
- No new `StockMovement` is created on closure.
- No new `Payment` / `Receipt` is created on closure.
- Historical rates and amounts are not altered.
- Records `closedAt` timestamp and `closedById` actor.
- Produces an `AuditLog` entry.

---

## 7. Cancellation & Payment Reconciliation

### Rules
1. **No Deletion**: The original `Purchase` / `Sale` record is **never** deleted (`status = "CANCELLED"`).
2. **No Deletion of Financial Records**: Payment and Receipt records are **never** deleted.
3. **Physical Stock Reversal**:
   - If the deal had physical movements (`fulfilmentStatus = "FULFILLED"` or `"PARTIAL"`), compensating reversal `StockMovement` records (`REVERSAL_RECEIPT` / `REVERSAL_ISSUE`) are generated inside the transaction.
   - `fulfilmentStatus` is reset to `"UNFULFILLED"`.
4. **Settlement Reversal**:
   - All completed `Payment` (for purchases) or `Receipt` (for sales) associated with the deal are marked `status = "CANCELLED"` with `cancelReason = "Deal cancelled"`.
   - The deal's `paymentStatus` is set to `"UNPAID"`.
   - Counterparty ledger and outstanding reports (which only aggregate `POSTED` and `CLOSED` deals with active payments) automatically exclude the cancelled deal, preserving mathematical integrity without double-counting.
5. **Idempotency**: Cancelling an already cancelled deal rejects cleanly.

---

## 8. UI Changes

1. **Quotes Page (`src/app/(app)/quotes/quotes-client.tsx`)**:
   - Added **"Convert to Deal"** button on active quotes.
   - Added modal dialog for selecting the target Counterparty and verifying direction (BUY $\rightarrow$ Purchase, SELL $\rightarrow$ Sale).
   - Displayed converted deal reference and badge when `CONSUMED`.
2. **Stock Register Page (`src/app/(app)/stock/stock-client.tsx`)**:
   - Added distinct columns:
     - **Physical On-Hand**
     - **Active Reserved**
     - **Available to Sell**
   - Visual indicator showing available stock and warnings when reserved weight approaches on-hand stock.
3. **Purchases & Sales Registers (`purchases-client.tsx`, `sales-client.tsx`)**:
   - Added distinct `CLOSED` badge styling.
   - Added **"Close Deal"** action button enabled only when deal is `POSTED`, `FIXED`, `FULFILLED`, and `PAID`.
   - Filter dropdowns updated to support `CLOSED` status filtering.

---

## 9. Schema Changes (`prisma/schema.prisma`)

1. **Enum `TransactionStatus`**:
   - Added `CLOSED` value.
2. **Model `Purchase` & `Sale`**:
   - Added `quoteId String? @unique`
   - Added `quote Quote? @relation(fields: [quoteId], references: [id])`
   - Added `closedAt DateTime?`
   - Added `closedById String?`
   - Added `closedBy User? @relation(...)`
3. **Model `Quote`**:
   - Added reverse 1-to-1 relations `purchase Purchase?` and `sale Sale?`.
4. **Model `RateReservation`**:
   - Added `counterpartyId String?`
   - Added `referenceRatePerGram Decimal? @db.Decimal(12, 4)`
   - Added `marginType MarginType?`
   - Added `marginValue Decimal? @db.Decimal(12, 4)`
   - Added relation `counterparty Counterparty? @relation(...)`
   - Added performance index `@@index([counterpartyId, status])`.

---

## 10. Services & Actions Changed

| Service / Action File | Changes Made |
|---|---|
| `src/lib/services/stock-service.ts` | Added `getActiveReservedWeight`, `getAvailableToSellStock`, `assertSufficientAvailableStock`; updated `getDetailedStockPositions` to reflect `CLOSED` deals. |
| `src/lib/services/fulfilment-service.ts` | Updated `fulfilSale` to validate against Available-to-Sell stock. |
| `src/lib/services/reservation-service.ts` | Added standalone reservation creation, conversion to deal (`consumeRateReservation`), counterparty inclusion. |
| `src/lib/services/quote-service.ts` | Added `convertQuoteToDeal` with row-level locks, quote validation, and available-to-sell validation. |
| `src/lib/services/purchase-service.ts` | Added `closePurchase`; updated `cancelPurchase` to reconcile completed payments and physical fulfilment. |
| `src/lib/services/sale-service.ts` | Added `closeSale`; updated `cancelSale` to reconcile completed receipts and physical fulfilment. |
| `src/lib/services/settlement-service.ts` | Updated outstandings and ledger queries to include `CLOSED` transactions and exclude cancelled payments. |
| `src/lib/services/report-service.ts` | Updated Purchase/Sales Registers and Stock reports to compute reserved and available-to-sell stock and account for `CLOSED` deals. |
| `src/lib/actions/quote-actions.ts` | Exported `convertQuoteToDealAction`. |
| `src/lib/actions/purchase-actions.ts` | Exported `closePurchaseAction`. |
| `src/lib/actions/sale-actions.ts` | Exported `closeSaleAction`. |

---

## 11. Audit & RBAC

- All new mutations (`convertQuoteToDeal`, `closePurchase`, `closeSale`, `cancelPurchase`, `cancelSale`, `createRateReservation`) enforce RBAC permissions (`requirePermission(user, 'PURCHASE_CREATE' | 'SALE_CREATE' | ...)`).
- Every mutation records an `AuditLog` entry capturing:
  - `actorId` / `actorName`
  - `action`: `CONVERT_QUOTE_TO_DEAL`, `CLOSE_PURCHASE`, `CLOSE_SALE`, `CANCEL_PURCHASE`, `CANCEL_SALE`
  - `entityId`, `before` and `after` snapshots.

---

## 12. Concurrency Handling

1. **Quote Double-Conversion Prevention**:
   - `SELECT ... FOR UPDATE` row-level lock on `Quote` row.
   - Immediate check of `status === "ACTIVE"`.
   - Unique foreign-key index constraint on `Purchase(quoteId)` and `Sale(quoteId)` guarantees atomic single-consumer at database level.
2. **Concurrent Inventory Oversubscription**:
   - `assertSufficientAvailableStock` queries physical stock movements and active reservations inside serializable / locked transactions.
   - Racing reservations or sales check current physical minus unexpired active reservations.
3. **Idempotent Closure**:
   - If deal is already `CLOSED`, transaction exits cleanly with no duplicate state change or audit log.
4. **Cancellation Safety**:
   - Transactions lock the target deal before modifying payment and stock records, preventing concurrent settlement or fulfilment races.

---

## 13. Migration Safety

- Changes made to `prisma/schema.prisma` are strictly additive and backward-compatible.
- Existing records in `Purchase`, `Sale`, `Quote`, and `RateReservation` retain valid foreign keys (`quoteId`, `counterpartyId`, `closedAt` are nullable).
- Zero alterations to historical currency, rate, or weight values.
- Prisma client generated cleanly (`npx prisma generate`).

---

## 14. Tests and Exact Results

### Unit Test Execution
```
PASS tests/unit/b11-commercial-lifecycle.test.ts (16 tests)
  Bullion V3.6 Commercial Lifecycle & Reservation Controls
    Gap 1: Quote -> Commercial Deal
      ✓ converts a valid active BUY quote into a Purchase deal (12 ms)
      ✓ converts a valid active SELL quote into a Sale deal (2 ms)
      ✓ rejects conversion of an expired quote (2 ms)
      ✓ rejects double conversion of a consumed quote (2 ms)
    Gap 2: Standalone Customer Rate Block
      ✓ creates a standalone rate reservation with counterparty before a deal exists (2 ms)
      ✓ consumes a standalone reservation into a deal (2 ms)
    Gap 3: Available-to-Sell Inventory Layer
      ✓ calculates available-to-sell = physical - active reservations (3 ms)
      ✓ excludes expired reservations from reserved stock (2 ms)
      ✓ rejects fulfilment if requested weight exceeds available-to-sell (2 ms)
    Gap 4: Explicit Deal Closure (CLOSED)
      ✓ closes a deal when rate is fixed, fulfilment is complete, and payment is paid (3 ms)
      ✓ rejects closing if deal is not fully paid (2 ms)
      ✓ rejects closing if deal is not fully fulfilled (2 ms)
      ✓ closure is idempotent (2 ms)
    Gap 5: Cancellation + Payment Reconciliation
      ✓ cancelling a deal reverses physical stock and marks payments as cancelled (4 ms)
      ✓ rejects double cancellation (2 ms)
      ✓ calculates party ledger correctly after cancellation (3 ms)

Test Suites: 12 passed, 12 total
Tests:       310 passed, 310 total
Snapshots:   0 total
Time:        4.512 s
Ran all test suites.
```

---

## 15. TypeScript Verification

Command:
```bash
npm run typecheck
```
**Result**:
- Exited with code `0`.
- Zero compilation errors.

---

## 16. Lint Verification

Command:
```bash
npm run lint
```
**Result**:
- Exited with code `0`.
- Zero lint errors (34 pre-existing unused variable warnings in legacy report modules).

---

## 17. Build Verification

Command:
```bash
npm run build
```
**Result**:
- Compiled successfully with Next.js Turbopack compiler.
- Static page generation for all routes (`/stock`, `/quotes`, `/purchases`, `/sales`, `/counterparties`, etc.) succeeded.
- Zero build errors.

---

## 18. Remaining Business Decisions (Explicitly Blocked)

1. **RATE CUT / UNCUT**:
   - **Status**: `NOT IMPLEMENTED — BUSINESS DEFINITION REQUIRED`
   - **Reason**: Requires domain definitions on exact rate difference formulas, weight adjustment matrices, scrap purity variance accounting, and ledger debit/credit mechanics.
2. **PRECLOSURE / EARLY SETTLEMENT**:
   - **Status**: `NOT IMPLEMENTED — BUSINESS DECISION REQUIRED`
   - **Reason**: Requires business policy defining early penalty fees, interest reconciliation, rate-fix re-pricing rules, and partial collateral return mechanics.
