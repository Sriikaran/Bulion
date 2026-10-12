# Bullion V2 — Financial Settlement & Counterparty Outstandings Implementation Report

**Repository**: https://github.com/Sriikaran/Bulion  
**Phase**: Bullion V2 Financial Settlement & Counterparty Outstandings  
**Author**: Antigravity DeepMind Agentic Pair Programmer  
**Date**: October 3, 2026  
**Status**: APPROVED & FULLY VERIFIED (110/110 Tests Passing, Production Build PASS)

---

## 1. Executive Summary & What Was Implemented

Bullion V2 introduces an authoritative financial settlement and counterparty outstandings layer on top of the audited V1 bullion trading foundation.

Prior to V2, Bullion recorded trade contracts (Purchase and Sale) and physical movements (`StockMovement`) with an informative `paymentMode` field, but without actual money movement tracking, split payment reconciliation, or counterparty accounts receivable/payable balances.

In V2, the application now fully supports:
1. **Explicit Financial Transactions**: Money movements are captured as first-class, immutable `Payment` records with directions `PAYMENT` (outward to supplier, reducing purchase payable) and `RECEIPT` (inward from customer, reducing sale receivable).
2. **Transaction Settlement Statuses**: Invoices transition strictly across `UNPAID`, `PARTIALLY_PAID`, and `PAID` based on verified completed financial records.
3. **Split Payments & Multi-Mode Settlements**: Multiple payments/receipts can be posted against a single purchase or sale across diverse payment modes (`CASH`, `UPI`, `BANK_TRANSFER`, `CARD`, `CHEQUE`, `OTHER`).
4. **Over-Settlement Prevention with Row Locking**: Every financial mutation executes within a database transaction using explicit PostgreSQL row locks (`SELECT ... FOR UPDATE`), mathematically preventing over-payment even under concurrent traffic.
5. **Counterparty Outstandings Service & Report**: Real-time aggregated receivables, payables, and net market exposure per supplier/customer.
6. **Counterparty Financial Ledger Service & Report**: Complete chronological statement of debits, credits, invoices, payments, receipts, and running balances with CSV export.
7. **Settlement UI Integration**: Live settlement status badges, payment breakdown cards, and a modal dialog for recording payments/receipts and viewing history on Purchases and Sales.
8. **Reversal & Audit Trail**: Reversing/cancelling a payment is restricted to `ADMIN`, requires an audited reason, recalculates the parent invoice status, and preserves the complete financial audit log without deleting any database records.

---

## 2. Schema Changes & Database Migration Details

The PostgreSQL database schema was updated without any destructive changes to existing tables or data:

### New Enums in `prisma/schema.prisma`
- `PaymentType`: `PAYMENT` (money outward to supplier), `RECEIPT` (money inward from buyer).
- `PaymentStatus`: `COMPLETED`, `CANCELLED`.
- `SettlementStatus`: `UNPAID`, `PARTIALLY_PAID`, `PAID`.

### New Model: `Payment`
```prisma
model Payment {
  id              String        @id @default(uuid())
  paymentNumber   String        @unique
  type            PaymentType
  date            DateTime      @default(now())
  amount          Decimal       @db.Decimal(14, 2)
  paymentMode     PaymentMode
  referenceNumber String?
  notes           String?
  status          PaymentStatus @default(COMPLETED)
  cancelReason    String?
  cancelledAt     DateTime?

  cancelledById   String?
  cancelledBy     user?         @relation("PaymentsCancelled", fields: [cancelledById], references: [id])

  counterpartyId  String
  counterparty    Counterparty  @relation(fields: [counterpartyId], references: [id])

  purchaseId      String?
  purchase        Purchase?     @relation(fields: [purchaseId], references: [id])

  saleId          String?
  sale            Sale?         @relation(fields: [saleId], references: [id])

  createdById     String
  createdBy       user          @relation("PaymentsCreated", fields: [createdById], references: [id])

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  auditLogs       AuditLog[]

  @@index([counterpartyId, date])
  @@index([purchaseId])
  @@index([saleId])
  @@index([status])
  @@map("payment")
}
```

### Relations Added to Existing Tables
- **`Purchase`**: Added `paymentStatus SettlementStatus @default(UNPAID)` and `payments Payment[]`.
- **`Sale`**: Added `paymentStatus SettlementStatus @default(UNPAID)` and `payments Payment[]`.
- **`Counterparty`**: Added `payments Payment[]`.
- **`user`**: Added `paymentsCreated Payment[]` and `paymentsCancelled Payment[]`.
- **`AuditLog`**: Added `paymentId String?` and relation `payment Payment?`.

### Safe Migration
- Applied to remote Supabase PostgreSQL database via `npx prisma db push`.
- All historical Purchase and Sale records safely received the default `paymentStatus = 'UNPAID'`.
- Zero data loss, zero drops.

---

## 3. Payment & Receipt Architecture

Financial settlement is kept completely decoupled from physical inventory and trade contract execution:

```
[ Trade Contract ] ---> [ Physical Inventory ]
  Purchase / Sale          StockMovement (Append-Only Physical Truth)
         |
         v
[ Financial Settlement ]
  Payment / Receipt (Money Movement)
         |
         v
[ Financial Ledger & Outstandings ]
  Counterparty Outstandings & Running Balance
```

### Directional Definitions
- **`PAYMENT`**:
  - Target: `Purchase` invoice.
  - Counterparty: Supplier or Dual-Role party.
  - Accounting Direction: Debits the supplier payable, reducing the amount owed.
- **`RECEIPT`**:
  - Target: `Sale` invoice.
  - Counterparty: Customer or Dual-Role party.
  - Accounting Direction: Credits the customer receivable, reducing the amount receivable.

---

## 4. Settlement Calculation & Over-Settlement Prevention

### Concurrency-Safe Transactional Execution
When recording a payment/receipt in `settlement-service.ts`:
1. Open a Prisma interactive transaction (`prisma.$transaction`).
2. Execute a row lock on the target invoice using raw SQL:
   ```sql
   SELECT id FROM "purchase" WHERE id = $1 FOR UPDATE
   ```
3. Fetch all active (`status = 'COMPLETED'`) payments linked to the invoice.
4. Calculate `existingSettled = sum(completed payments)`.
5. Compute `remainingBalance = invoice.totalAmount - existingSettled`.
6. Validate `requestedAmount <= remainingBalance` and `requestedAmount > 0`.
7. Insert the `Payment` record.
8. Derive new `paymentStatus`:
   - If `newSettled >= invoice.totalAmount` -> `PAID`
   - Else if `newSettled > 0` -> `PARTIALLY_PAID`
   - Else -> `UNPAID`
9. Persist updated `paymentStatus` on the invoice.
10. Insert `AuditLog` entry.

Because step 2 acquires an exclusive row lock, two concurrent requests targeting the same invoice execute sequentially. The second request re-evaluates `remainingBalance` after the first commits, making over-settlement impossible.

---

## 5. Counterparty Outstandings Calculation

Counterparty balances are derived from immutable trade and payment transactions:
- **`totalPurchases`**: Sum of `totalAmount` across all `POSTED` purchases.
- **`totalPaymentsMade`**: Sum of `amount` across all `COMPLETED` payments of type `PAYMENT`.
- **`netPayable`**: `max(0, totalPurchases - totalPaymentsMade)`.
- **`totalSales`**: Sum of `totalAmount` across all `POSTED` sales.
- **`totalReceiptsReceived`**: Sum of `amount` across all `COMPLETED` payments of type `RECEIPT`.
- **`netReceivable`**: `max(0, totalSales - totalReceiptsReceived)`.
- **`netMarketExposure`**: `netReceivable - netPayable`.
  - Positive balance: Counterparty owes us money (Receivable / Dr).
  - Negative balance: We owe the counterparty money (Payable / Cr).
  - Zero balance: Account is fully settled (`SETTLED`).

---

## 6. Counterparty Financial Ledger Behavior

The ledger report provides a chronological running statement of trade and settlement events:

| Event Type | Supplier Direction | Customer Direction | Running Balance Effect |
| :--- | :--- | :--- | :--- |
| **`PURCHASE`** | Credit (Cr) | N/A | Increases amount we owe (negative effect) |
| **`PAYMENT`** | Debit (Dr) | N/A | Decreases amount we owe (positive effect) |
| **`SALE`** | N/A | Debit (Dr) | Increases amount owed to us (positive effect) |
| **`RECEIPT`** | N/A | Credit (Cr) | Decreases amount owed to us (negative effect) |
| **`CANCELLED`** | Struck through / compensated | Struck through / compensated | Historical visibility maintained |

All calculations use strict `Decimal.js` arithmetic with rounding to 2 decimal places.

---

## 7. Cancellation & Reversal Behavior

In accordance with Bullion's non-destructive audit rules:
1. Payments and receipts are **never permanently deleted**.
2. Cancellation sets `status = CANCELLED`, records `cancelReason`, `cancelledAt`, and `cancelledById`.
3. The parent Purchase or Sale invoice automatically recalculates its `paymentStatus` based on remaining completed payments.
4. An `AuditLog` entry is generated documenting the previous and new states.
5. In the counterparty ledger, cancelled payments remain visible with a distinct "Cancelled" indicator, maintaining historical auditability.

---

## 8. Role-Based Access Control (RBAC)

Authorization is strictly enforced server-side in all Server Actions:
- **Viewing Settlement & Outstandings**: Allowed for both `ADMIN` and `STAFF`.
- **Recording Payment / Receipt**: Allowed for authenticated `ADMIN` and `STAFF`.
- **Cancelling / Reversing Payment**: Allowed **ONLY for `ADMIN`**. Any attempt by a `STAFF` user throws `UnauthorizedError` and is rejected.

---

## 9. Audit Logging

Every financial mutation creates an immutable `AuditLog` record:
- **`PAYMENT_RECORDED`**: Records actor, payment ID, amount, payment mode, and reference.
- **`RECEIPT_RECORDED`**: Records actor, receipt ID, amount, payment mode, and reference.
- **`PAYMENT_CANCELLED`**: Records actor, payment ID, cancellation reason, previous status (`COMPLETED`), and new status (`CANCELLED`).

---

## 10. Reports Implemented

Two new comprehensive reports were added to the reporting hub:

### 1. Counterparty Outstandings (`/reports/outstandings`)
- **KPI Summary Cards**:
  - Total Payables to Suppliers
  - Total Receivables from Customers
  - Net Market Exposure
  - Counterparty Accounts Overview
- **Interactive Filters**: Search by counterparty name/phone, filter by Party Type (`ALL`, `SUPPLIER`, `CUSTOMER`, `BOTH`), and filter by Status (`ALL`, `OUTSTANDING_ONLY`, `SETTLED`).
- **Data Table**: Itemized total purchases, payments made, net payable, total sales, receipts, net receivable, and settlement status badge.
- **Actions**: Direct navigation link to individual counterparty ledger.
- **CSV Export**: Secure CSV download using existing `export-csv` utility with formula injection defense.

### 2. Counterparty Financial Ledger (`/reports/ledger`)
- **Counterparty Selector**: Dropdown to select any active supplier or customer.
- **Date Range Filters**: Filter statement between `From Date` and `To Date`.
- **KPI Summary Cards**: Total Debits, Total Credits, Closing Balance, and Balance Direction badge (`RECEIVABLE`, `PAYABLE`, `SETTLED`).
- **Running Ledger Table**: Chronological Date, Event Type, Reference Number, Description, Debit (+), Credit (-), and Running Balance.
- **CSV Export**: Itemized statement download.

### Reports Compatibility
All 8 existing V1 reports remain 100% operational and intact:
1. Purchase Register (`/reports/purchases`)
2. Sales Register (`/reports/sales`)
3. Current Stock (`/reports/stock`)
4. Supplier-wise Purchase (`/reports/suppliers`)
5. Buyer-wise Sales (`/reports/buyers`)
6. Purchase vs Sales (`/reports/purchase-vs-sales`)
7. Bullion Profit (`/reports/profit`)
8. Transaction History (`/reports/transactions`)

---

## 11. Testing & Verification Results

A dedicated test suite `tests/unit/b5-financial-settlement.test.ts` was implemented covering all 22 required test cases:

1. **Unpaid Purchase**: Verified `UNPAID` status and full outstanding payable.
2. **Partially Paid Purchase**: Verified status `PARTIALLY_PAID` and remaining balance.
3. **Fully Paid Purchase**: Verified status `PAID` and outstanding reduced to 0.
4. **Unpaid Sale**: Verified `UNPAID` status and full outstanding receivable.
5. **Partially Paid Sale**: Verified status `PARTIALLY_PAID` and remaining balance.
6. **Fully Paid Sale**: Verified status `PAID` and receivable reduced to 0.
7. **Multiple Split Payments**: Verified multi-mode split payments (Cash + UPI + Bank Transfer).
8. **Payment Over Invoice Rejected**: Server-side error when amount exceeds remaining balance.
9. **Receipt Over Invoice Rejected**: Server-side error when amount exceeds remaining balance.
10. **Zero Payment Rejected**: Validation error when amount <= 0.
11. **Negative Payment Rejected**: Validation error when amount < 0.
12. **Payment Against Cancelled Invoice Rejected**: Prevented payments against cancelled transactions.
13. **Supplier Outstanding Calculation**: Purchases minus payments across transactions.
14. **Customer Outstanding Calculation**: Sales minus receipts across transactions.
15. **Counterparty Ledger Running Balance**: Verified chronological debits, credits, and balance.
16. **Cancellation Preserves Financial History**: Payment status updated to `CANCELLED`, invoice balance re-opened.
17. **Financial Audit Log**: Full audit entries written on create and cancel.
18. **RBAC**: STAFF cancellation rejected, ADMIN cancellation permitted.
19. **Concurrent Payment Simulation**: Serialized locking prevents over-settlement.
20. **Decimal Precision**: Exact math verified on fractional currency amounts.
21. **Stock Invariant Preserved**: Physical `StockMovement` unchanged by financial transactions.
22. **Existing Tests Compatibility**: All 88 existing tests passing without regression.

### Test Execution Metrics
- **Existing V1 Tests**: 88/88 PASS
- **New V2 Tests**: 22/22 PASS
- **Total Tests**: 110/110 PASS (100% passing across 7 test files)
- **TypeScript Typecheck (`tsc --noEmit`)**: PASS (0 errors)
- **ESLint (`eslint .`)**: PASS (0 errors)
- **Prisma Schema (`prisma validate`)**: PASS (valid schema)
- **Production Build (`npm run build`)**: PASS (24/24 static & dynamic pages compiled successfully)

---

## 12. Verification of Critical Invariants

| Invariant | Status | Verification Note |
| :--- | :--- | :--- |
| **No Pawnify Imports** | **VERIFIED** | 0 references to Pawnify codebase or packages. |
| **StockMovement Append-Only** | **VERIFIED** | Stock movements remain the sole physical source of truth; untouched by financial layers. |
| **Historical Rates Unchanged** | **VERIFIED** | Purchase and sale rate calculations are unmodified. |
| **Decimal Precision** | **VERIFIED** | `@db.Decimal(14, 2)` and `Decimal.js` used exclusively for all money math. |
| **Non-Destructive Migration** | **VERIFIED** | No dropped columns or tables; safe default `UNPAID` on historical trades. |
| **Over-Settlement Impossible** | **VERIFIED** | Server-side balance checks with row-level locks protect every mutation. |
| **Auditability** | **VERIFIED** | Every financial mutation writes to `AuditLog`. |

---

## 13. Files Changed / Created

### New Files Created
- `src/lib/validations/settlement.ts`: Zod validation schemas for financial operations.
- `src/lib/services/settlement-service.ts`: Core transactional settlement domain service.
- `src/lib/actions/settlement-actions.ts`: Secure server actions for financial mutations and reports.
- `src/components/settlement-dialog.tsx`: Reusable settlement modal dialog with split payment tracking.
- `src/app/(app)/reports/outstandings/page.tsx`: Outstandings report server page.
- `src/app/(app)/reports/outstandings/outstandings-view.tsx`: Outstandings report view with filters and CSV export.
- `src/app/(app)/reports/ledger/page.tsx`: Counterparty ledger server page.
- `src/app/(app)/reports/ledger/ledger-view.tsx`: Counterparty ledger view with running balance table.
- `tests/unit/b5-financial-settlement.test.ts`: Complete V2 test suite (22 unit tests).
- `BULLION_V2_FINANCIAL_IMPLEMENTATION_REPORT.md`: This comprehensive documentation report.

### Existing Files Modified
- `prisma/schema.prisma`: Added `Payment` model, `PaymentType`, `PaymentStatus`, `SettlementStatus` enums and relations.
- `src/lib/services/audit-service.ts`: Extended `writeAudit` with `paymentId`.
- `src/lib/services/purchase-service.ts`: Included payments in purchase queries.
- `src/lib/services/sale-service.ts`: Included payments in sale queries.
- `src/app/(app)/purchases/page.tsx`: Serialized settlement fields for client.
- `src/app/(app)/sales/page.tsx`: Serialized settlement fields for client.
- `src/app/(app)/purchases/purchases-client.tsx`: Added settlement status badges, Pay action button, and dialog.
- `src/app/(app)/sales/sales-client.tsx`: Added settlement status badges, Receive action button, and dialog.
- `src/components/reports/reports-nav.tsx`: Added navigation links for Outstandings and Party Ledger.
- `src/app/(app)/reports/page.tsx`: Added Outstandings and Party Ledger cards to the Reports Hub.

---

## 14. Final Status

**Bullion V2 Financial Settlement & Counterparty Outstandings**: **PASS (PRODUCTION READY)**
