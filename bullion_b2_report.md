# Bullion — Phase B2 Implementation Report
**Operational Transactions & Core UI**

---

## 1. Routes & Pages Implemented

| Route | Role Access | Description |
|---|---|---|
| `/dashboard` | ADMIN, STAFF | Real-time bullion metrics, total Gold & Silver physical stock, monthly purchases & sales volume, quick action navigation, recent ledger activity. |
| `/purchases` | ADMIN, STAFF | Purchase register with filters (status, metal, search). Supports draft creation, immediate posting, ADMIN-only cancellation with reversing stock movement, and detailed invoice inspection. |
| `/sales` | ADMIN, STAFF | Sale register with real-time stock availability check. Prevents overselling beyond available physical stock on both client and atomic server transaction boundaries. Supports DRAFT, POST, and ADMIN cancellation. |
| `/stock` | ADMIN, STAFF | Authoritative 12-column physical inventory view per (Metal × Purity) bucket. Displays Opening, Purchased, Sold, Adjustments In/Out, Available, Avg Rates, and Valuation. Supports ADMIN opening stock creation and full ledger drilldown. |
| `/adjustments` | ADMIN (mutate), STAFF (read) | Operational stock adjustment register. Allows ADMIN to record physical stock INCREASES and DECREASES with real-time stock balance previews. Enforces non-negative stock invariants. |
| `/transactions` | ADMIN, STAFF | Complete operational audit view reading directly from the authoritative append-only `StockMovement` table with full event categorization and source transaction tracing. |
| `/masters` | ADMIN (mutate), STAFF (read) | Metal & Purity Master management. Allows viewing and ADMIN creation/editing/activation/deactivation of metals, purities, fineness fractions, and display metadata. |
| `/counterparties` | ADMIN (mutate), STAFF (read) | Counterparties directory for Suppliers, Customers, and Dual-Role (Both) entities with contact details, status toggles, and transaction counts. |
| `/profile` | ADMIN, STAFF | Operator profile view displaying authenticated credentials, system role, and active permission scopes. |

---

## 2. Operational Workflows

### Purchase Flow
1. **Initiation**: Operator opens "New Purchase" from `/purchases`.
2. **Input & Derivation**:
   - Supplier selected from active Counterparties or entered manually.
   - Metal and active Purity selected.
   - Gram weight and rate per gram entered as string-preserved decimals.
   - Total amount is calculated on the client for live user preview, but strictly re-computed and stored on the server via `weightGrams.times(ratePerGram).toDecimalPlaces(2)`.
3. **Execution Choice**:
   - **Save as Draft**: Creates purchase with status `DRAFT`. No stock movement created.
   - **Save & Post Now**: Atomically creates purchase, sets status `POSTED`, writes `PURCHASE` `StockMovement` (+weightGrams), and writes `AuditLog` entry in a single Prisma transaction.
4. **Cancellation**:
   - Available to `ADMIN` only.
   - Requires cancellation reason.
   - Atomically updates status to `CANCELLED` and writes reversing `PURCHASE_CANCEL` `StockMovement` (-weightGrams) with audit record.

### Sale Flow
1. **Initiation**: Operator opens "New Sale" from `/sales`.
2. **Real-Time Stock Validation**:
   - Selecting Metal + Purity queries live available physical stock via `getAvailableStockAction`.
   - UI displays live available balance: `Available Stock: XX.XXXX g`.
   - If requested weight > available stock, UI flags an immediate warning and disables the "Save & Post" action.
3. **Atomic Server Integrity**:
   - When posting, `SaleService` queries `tx.stockMovement.aggregate` **inside the transaction boundary** with `assertSufficientStock`.
   - If stock is insufficient, throws `InsufficientStockError`, immediately rolling back all changes.
   - If sufficient, writes `Sale` (`POSTED`), writes `SALE` `StockMovement` (-weightGrams), and writes `AuditLog`.
4. **Cancellation**:
   - Available to `ADMIN` only.
   - Atomically sets status `CANCELLED` and writes reversing `SALE_CANCEL` `StockMovement` (+weightGrams).

### Stock Flow & Invariant Reconciliation
- Stock is never stored as an editable scalar column.
- The single source of truth is the append-only `StockMovement` table.
- Calculation formula strictly enforced:
  $$\text{Available Stock} = \sum \text{StockMovements} = \text{Opening} + \text{Purchased} - \text{Sold} + \text{Adj In} - \text{Adj Out}$$
- `/stock` displays 12 columns per (Metal × Purity) pair:
  1. Metal Name & Code
  2. Purity Label & Fineness
  3. Opening Weight (g)
  4. Purchased Weight (g)
  5. Sold Weight (g)
  6. Adjustment In (g)
  7. Adjustment Out (g)
  8. Available Physical Weight (g)
  9. Average Purchase Rate (₹/g)
  10. Total Purchase Value (₹)
  11. Average Selling Rate (₹/g)
  12. Total Sales Value (₹)
- Clicking the history icon on any row opens the ledger drawer showing every individual signed movement for that bucket.

### Opening Stock Flow
- ADMIN-only workflow on `/stock`.
- Establishes the initial physical balance for a (Metal × Purity) bucket.
- **Immutable**: Cannot be edited or deleted once created.
- Writes an `OPENING` `StockMovement` (+weightGrams) and audit log.
- Enforces unique constraint: duplicate opening stock for the same bucket is rejected. Subsequent corrections must use auditable Stock Adjustments.

### Adjustment Flow
- ADMIN-only creation on `/adjustments`.
- Direction: `INCREASE` or `DECREASE`.
- Live comparison card shows:
  - Current Available Stock
  - Requested Adjustment (+ / -)
  - Resulting Stock Preview
- If `DECREASE` exceeds available stock, submission is blocked on client and rejected inside the server transaction.
- Writes `ADJUSTMENT_INCREASE` (+weightGrams) or `ADJUSTMENT_DECREASE` (-weightGrams) to `StockMovement`.
- Cancellation creates a reversing movement.

### Transaction History Flow
- Accessible at `/transactions`.
- Queries `StockMovement` directly with links to `Metal`, `Purity`, `User`, `Purchase`, `Sale`, `Adjustment`, and `OpeningStock`.
- Complete trace-back from physical movement to source invoice, reason, and actor.

---

## 3. Server-Side Authorization & RBAC

All server actions in `src/lib/actions/*` strictly enforce session and role requirements:

```
                  ┌───────────────────────────────┐
                  │    Incoming Server Action     │
                  └───────────────┬───────────────┘
                                  ▼
                     [ auth.api.getSession ]
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
           No Session / Invalid               Valid User
                 │                                 │
                 ▼                                 ▼
      Throw UnauthorizedError               Check User Role
                                                   │
                                  ┌────────────────┴────────────────┐
                                  ▼                                 ▼
                             Role = ADMIN                      Role = STAFF
                                  │                                 │
                                  ▼                                 ▼
                        Allowed: All actions            Allowed: Read-only, Drafts,
                        (Master mutate, Opening,        Posts (non-admin operations)
                        Adjustments, Cancels)           Forbidden: Master edit, Opening,
                                                        Adjustments, Cancellations
```

Hiding buttons in the UI is treated as UX only; server-side guards independently verify roles before executing any database mutation.

---

## 4. Precision & Arithmetic Safety

- Zero floating-point math in financial and weight calculations.
- Decimal operations handled using `decimal.js`:
  - Weights: 4 decimal places (`0.0001 g` precision).
  - Rates: 2 decimal places (`₹ 0.01` precision).
  - Fineness: 4 decimal places (`0.0001` fraction precision).
- User inputs parsed from validated strings directly into `Decimal` instances before transaction commit.

---

## 5. Test Suite & Validation Results

### Vitest Unit & Operational Tests
**59 passed out of 59 tests** across 4 test suites:
- `tests/unit/stock-logic.test.ts` (3 tests passed)
- `tests/unit/b1-domain.test.ts` (31 tests passed)
- `tests/unit/helpers.test.ts` (9 tests passed)
- `tests/unit/b2-operational.test.ts` (16 tests passed)

### Critical Tests Verified
1. **Section 19: Stock Reconciliation Test**
   - Opening = `100.0000 g`
   - Purchase = `50.0000 g`
   - Sale = `20.0000 g`
   - Adjustment In = `5.0000 g`
   - Adjustment Out = `10.0000 g`
   - **Calculated Available Stock: `125.0000 g`** (Reconciled with 5 ledger movements)
2. **Section 20: 16-Step End-to-End Operational Lifecycle**
   - Bucket creation, purchase posting, stock increase verification, sale posting, stock decrease verification, overselling rejection, verification that no partial state was written, ADMIN adjustment, final stock verification, transaction history retrieval, and audit trail verification.
3. **TypeScript Typecheck**:
   - `npm run typecheck` (`tsc --noEmit`): **0 errors**.
4. **Prisma Validation**:
   - `npx prisma validate`: **Schema valid**.
   - `npx prisma generate`: **Prisma Client generated**.
5. **Next.js Production Build**:
   - `npm run build`: **Compiled successfully** with all routes statically optimized or server-rendered on demand.

---

## 6. Files Created & Modified

### New Pages & Client Components
- `src/app/(app)/masters/page.tsx` & `masters-client.tsx`
- `src/app/(app)/counterparties/page.tsx` & `counterparties-client.tsx`
- `src/app/(app)/purchases/page.tsx` & `purchases-client.tsx`
- `src/app/(app)/sales/page.tsx` & `sales-client.tsx`
- `src/app/(app)/stock/page.tsx` & `stock-client.tsx`
- `src/app/(app)/adjustments/page.tsx` & `adjustments-client.tsx`
- `src/app/(app)/transactions/page.tsx` & `transactions-client.tsx`
- `src/app/(app)/profile/page.tsx`
- `src/app/(app)/dashboard/page.tsx` (updated with live metrics)

### New Services & Actions
- `src/lib/services/counterparty-service.ts`
- `src/lib/services/master-service.ts` (extended with CRUD & audit)
- `src/lib/services/stock-service.ts` (extended with detailed valuations & movement listings)
- `src/lib/actions/master-actions.ts`
- `src/lib/actions/counterparty-actions.ts`
- `src/lib/actions/purchase-actions.ts`
- `src/lib/actions/sale-actions.ts`
- `src/lib/actions/stock-actions.ts`
- `src/lib/auth/session.ts`

### New Validations
- `src/lib/validations/master.ts`
- `src/lib/validations/counterparty.ts`

### Tests
- `tests/unit/b2-operational.test.ts`

---

## 7. Explicit Pawnify Isolation Confirmation

- **Directory Isolation**: All implementation, edits, configuration, and testing were strictly confined to `Bullion/`.
- **Zero Cross-Imports**: No files, utilities, components, or styles were imported from `Pawnify/` or `pawnify-main`.
- **No Shared Symlinks**: No symlinks or path aliases reference Pawnify.
- **Database Isolation**: Bullion maintains its own distinct PostgreSQL schema and Prisma client.
- **Pawnify Status**: Untouched and fully preserved.

---

## 8. Known Issues / Status
- No blocking issues.
- All B2 operational workflows (Masters, Counterparties, Purchases, Sales, Stock Valuation, Opening Stock, Adjustments, and Transaction History) are functional, validated, and ready for use.
