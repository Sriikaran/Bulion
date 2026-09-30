# Bullion — Phase B3 Completion Report: Reporting & Business Intelligence

**Date:** 2026-09-30  
**Phase:** B3 — Reporting & Business Intelligence  
**Status:** COMPLETED & VERIFIED  
**Isolation Status:** Strict Pawnify Isolation Preserved (Pawnify completely untouched)

---

## 1. Reports Implemented

Eight authoritative reports and a centralized Reporting Hub have been designed and implemented in Bullion:

1. **Reports Hub (`/reports`)**: Central business intelligence dashboard featuring top-level KPIs (physical gold and silver balances, cumulative posted purchase and sales turnover) and directory cards linking to all operational reports.
2. **Purchase Register (`/reports/purchases`)**: Itemized ledger of bullion purchases detailing date, invoice number, supplier details, metal, purity, weight in grams, unit rate, server-derived total amount, payment mode, and transaction status. Cancelled purchases are visibly marked and excluded from active purchase totals.
3. **Sales Register (`/reports/sales`)**: Itemized ledger of bullion sales detailing date, invoice number, buyer details, metal, purity, weight in grams, selling rate, total amount, payment mode, and transaction status. Cancelled sales are visibly marked and excluded from active sales totals.
4. **Current Stock Report (`/reports/stock`)**: Authoritative stock position view broken down per $(Metal \times Purity)$ bucket detailing Opening Weight, Purchased Weight, Sold Weight, Adjustment In, Adjustment Out, Available Weight, Average Purchase Rate, Total Purchase Value, Average Selling Rate, and Total Sales Value.
5. **Supplier-wise Purchase Report (`/reports/suppliers`)**: Consolidated procurement report grouping posted purchases by supplier with purchase count, total weight, acquisition value, and mathematically weighted average rate. Cancelled purchases are strictly excluded.
6. **Buyer-wise Sales Report (`/reports/buyers`)**: Consolidated customer sales report grouping posted sales by buyer with sales volume count, total sold weight, total sales revenue, and mathematically weighted average selling rate. Cancelled sales are strictly excluded.
7. **Purchase vs Sales Comparative Report (`/reports/purchase-vs-sales`)**: Period flow comparison analyzing trade volume (Purchase Weight vs Sales Weight), acquisition cost vs sales revenue, weighted average rates, and net flow differences per bucket.
8. **Bullion Profit Report (`/reports/profit`)**: Realized gross profit analytics derived using the transparent **Weighted Average Cost Basis** methodology. Exposes Realized Sales Revenue, Cost Basis (Cost of Goods Sold), Realized Gross Profit, and Gross Profit Margin (%). Restricted to ADMIN.
9. **Transaction History Report (`/reports/transactions`)**: Audit-grade report directly exposing the append-only `StockMovement` table with signed weights, event types, operator attribution, linked transaction numbers, and cancellation reversal traces.

---

## 2. Reporting Architecture

The reporting layer is structured cleanly into distinct tiers:
- **Authoritative Service Layer (`src/lib/services/report-service.ts`)**:
  - Implements all report queries and calculations.
  - Queries authoritative database tables (`Purchase`, `Sale`, `StockMovement`, `OpeningStock`).
  - Executes all mathematical operations strictly using `Decimal` from `decimal.js`.
  - Enforces status filters, date boundary inclusions, and cancellation exclusions.
- **Server Action & RBAC Layer (`src/lib/actions/report-actions.ts`)**:
  - Authenticates every query with `requireUser`.
  - Authorizes confidential reports (e.g. Bullion Profit) with `requireAdmin`.
  - Validates and parses query filter inputs with Zod (`src/lib/validations/report.ts`).
  - Serializes Decimals and dates cleanly for secure client transport.
- **Presentation Layer (`src/app/(app)/reports/...`)**:
  - Clean server-rendered Next.js 16 pages fetching authoritative data.
  - Interactive client views supporting RFC 4180 CSV exports, summary metric cards, filter bars, and status badges.
- **CSV Export Engine (`src/lib/utils/export-csv.ts`)**:
  - Standard RFC 4180 compliant CSV generator. Escapes double quotes, commas, and newlines.
  - Respects currently applied filters. Never exports sensitive passwords, secrets, or tokens.

---

## 3. Filters

All reports support standardized, non-destructive filtering:
- **Date From / Date To**:
  - Filtered on authoritative transaction business dates (`Purchase.date`, `Sale.date`, or `StockMovement.createdAt`).
  - Handled via `parseDateRange(dateFrom, dateTo)`:
    - `dateFrom` expands to start-of-day UTC (`00:00:00.000Z`).
    - `dateTo` expands to end-of-day UTC (`23:59:59.999Z`).
    - Ensures transactions occurring later on the end date (e.g. 23:45:00) are fully included without timezone shift.
- **Metal & Purity**:
  - Filter by precious metal (Gold, Silver) and specific purity fineness.
- **Counterparty**:
  - Filter by Supplier or Buyer name/ID.
- **Status**:
  - Filter by `ALL`, `POSTED`, `DRAFT`, or `CANCELLED`.
- **Search Query**:
  - Case-insensitive substring search across invoice numbers, counterparty names, and notes.

---

## 4. Purchase Register Methodology

- **Data Source**: `prisma.purchase` joined with `Metal` and `Purity`.
- **Status Handling**:
  - All matching records are displayed in the register for full auditability.
  - Records in `CANCELLED` status are marked with red badges and excluded from active purchase totals.
  - Records in `DRAFT` status are marked with amber badges and excluded from active purchase totals.
  - Active totals (Active Purchase Weight, Active Purchase Value, and Weighted Average Rate) are computed **strictly from records with `status === 'POSTED'`**.
- **Calculations**:
  - $\text{Total Active Purchase Weight} = \sum_{\text{POSTED}} \text{weightGrams}$
  - $\text{Total Active Purchase Value} = \sum_{\text{POSTED}} \text{totalAmount}$
  - $\text{Weighted Average Rate} = \frac{\text{Total Active Purchase Value}}{\text{Total Active Purchase Weight}}$ (safe 0 guard if weight = 0).

---

## 5. Sales Register Methodology

- **Data Source**: `prisma.sale` joined with `Metal` and `Purity`.
- **Status Handling**:
  - Records in `CANCELLED` status are marked with red badges and excluded from active sales totals.
  - Records in `DRAFT` status are marked with amber badges and excluded from active sales totals.
  - Active sales totals (Sold Weight, Sales Revenue, and Weighted Average Selling Rate) are computed **strictly from records with `status === 'POSTED'`**.
- **Calculations**:
  - $\text{Total Sold Weight} = \sum_{\text{POSTED}} \text{weightGrams}$
  - $\text{Total Sales Revenue} = \sum_{\text{POSTED}} \text{totalAmount}$
  - $\text{Weighted Average Selling Rate} = \frac{\text{Total Sales Revenue}}{\text{Total Sold Weight}}$ (safe 0 guard if weight = 0).

---

## 6. Current Stock Methodology

- **Source of Truth**: Append-only `StockMovement` table (via `StockService`).
- **Core Invariant**:
  $$\text{AVAILABLE} = \text{OPENING} + \text{PURCHASES} - \text{SALES} + \text{ADJUSTMENT IN} - \text{ADJUSTMENT OUT}$$
- **Reconciliation Rule**:
  - Cancelled purchases create a reversing `PURCHASE_CANCEL` movement with negative weight.
  - Cancelled sales create a reversing `SALE_CANCEL` movement with positive weight.
  - The sum of signed movements per $(Metal \times Purity)$ bucket satisfies the physical invariant without double-counting.
  - Displayed Available Weight strictly equals `StockService.getCurrentStock(metalId, purityId)`.

---

## 7. Supplier-wise Purchase Report Methodology

- **Data Source**: Posted purchases from `prisma.purchase`.
- **Aggregation**: Grouped by normalized supplier name / counterparty.
- **Cancellation Rule**: Cancelled purchases are strictly excluded from supplier volume and financial metrics.
- **Weighted Average Rate**:
  $$\text{Supplier Weighted Rate} = \frac{\sum \text{Purchase Amount for Supplier}}{\sum \text{Purchase Weight for Supplier}}$$
  Never uses arithmetic mean of unit rates. Safely yields 0 if weight is 0.

---

## 8. Buyer-wise Sales Report Methodology

- **Data Source**: Posted sales from `prisma.sale`.
- **Aggregation**: Grouped by normalized buyer name / counterparty.
- **Cancellation Rule**: Cancelled sales are strictly excluded from buyer volume and revenue metrics.
- **Weighted Average Rate**:
  $$\text{Buyer Weighted Selling Rate} = \frac{\sum \text{Sales Amount for Buyer}}{\sum \text{Sold Weight for Buyer}}$$
  Never uses arithmetic mean of unit rates. Safely yields 0 if weight is 0.

---

## 9. Purchase vs Sales Comparative Methodology

- **Distinction Notice**: Clearly documented and displayed in UI as a **transaction-period trade flow report**, comparing incoming procurement against outgoing customer sales. It is explicitly separated from point-in-time physical inventory (Current Stock).
- **Metrics**:
  - $\text{Weight Difference} = \text{Purchase Weight} - \text{Sales Weight}$ (Positive indicates net inventory buildup from trade; negative indicates net inventory draw).
  - $\text{Value Difference} = \text{Purchase Value} - \text{Sales Value}$ (Positive indicates net cash invested into stock; negative indicates net cash realization).
  - Includes full breakdown table at $(Metal \times Purity)$ granularity.

---

## 10. Bullion Profit Methodology (Weighted Average Cost Basis)

### Explicitly Stated Methodology
**"Profit Method: Weighted Average Cost Basis"**  
No accounting-grade FIFO/LIFO or complex general ledger abstractions were fabricated. The report relies exclusively on authoritative transaction data available in the schema.

### Exact Mathematical Derivation
1. **Unit Cost Basis Derivation**:
   For each $(Metal \times Purity)$ bucket, the weighted average acquisition cost per gram is derived from all authoritative POSTED purchases:
   $$\text{Unit Cost Basis (₹/g)} = \begin{cases} \frac{\sum \text{POSTED Purchase Amount}}{\sum \text{POSTED Purchase Weight}} & \text{if } \sum \text{Purchase Weight} > 0 \\ 0 & \text{otherwise} \end{cases}$$
2. **Cost of Goods Sold (Cost Basis)**:
   For realized POSTED sales within the filtered period:
   $$\text{Total Cost Basis (₹)} = \text{Sold Weight (g)} \times \text{Unit Cost Basis (₹/g)}$$
3. **Realized Gross Profit**:
   $$\text{Gross Profit (₹)} = \text{Sales Revenue (₹)} - \text{Total Cost Basis (₹)}$$
4. **Gross Profit Margin**:
   $$\text{Gross Profit Margin (\%)} = \begin{cases} \left(\frac{\text{Gross Profit}}{\text{Sales Revenue}}\right) \times 100 & \text{if } \text{Sales Revenue} > 0 \\ 0 & \text{otherwise} \end{cases}$$

---

## 11. Transaction History Methodology

- Reads directly from `prisma.stockMovement` with joins on `Metal`, `Purity`, `CreatedBy`, `Purchase`, `Sale`, `Adjustment`, and `OpeningStock`.
- Movement Types tracked:
  - `OPENING` (+ weight)
  - `PURCHASE` (+ weight)
  - `PURCHASE_CANCEL` (- weight)
  - `SALE` (- weight)
  - `SALE_CANCEL` (+ weight)
  - `ADJUSTMENT_INCREASE` (+ weight)
  - `ADJUSTMENT_DECREASE` (- weight)
- Displays signed movements (+ / -), full operator attribution, transaction reference, and invoice links.

---

## 12. Cancellation Handling

- In both Purchase and Sales registers, cancelled records remain visible when filtering or auditing, but:
  - They are visually distinct with `CANCELLED` status badges and shaded styling.
  - They are strictly excluded from active register totals, summary cards, and weighted average rates.
  - They do not appear in Supplier-wise or Buyer-wise reports.
  - They do not inflate profit calculations.
- In `StockMovement`, cancellation events are recorded as explicit reversing movements (`PURCHASE_CANCEL` or `SALE_CANCEL`), maintaining a complete audit trail without mutating historical rows.

---

## 13. Reconciliation Evidence

The mandatory Section 15 reconciliation scenario was verified:
- **Scenario Parameters**:
  - Metal: Gold, Purity: 22K
  - Opening Stock: $100.0000\text{g}$
  - Purchase: $+50.0000\text{g}$ @ ₹5,000.0000/g = ₹250,000.00
  - Sale: $-20.0000\text{g}$ @ ₹5,500.0000/g = ₹110,000.00
  - Adjustment Increase: $+5.0000\text{g}$
  - Adjustment Decrease: $-10.0000\text{g}$
- **Reconciliation Results**:
  - Current Stock Available: $100 + 50 - 20 + 5 - 10 = \mathbf{125.0000\text{g}}$
  - StockService authoritative balance: $\mathbf{125.0000\text{g}}$
  - StockMovement ledger aggregate: $\mathbf{125.0000\text{g}}$
  - Purchase Register Active Weight: $\mathbf{50.0000\text{g}}$, Value: $\mathbf{₹250,000.00}$, Weighted Rate: $\mathbf{₹5,000.00/g}$
  - Sales Register Active Weight: $\mathbf{20.0000\text{g}}$, Value: $\mathbf{₹110,000.00}$, Weighted Rate: $\mathbf{₹5,500.00/g}$
  - Cross-report verification:
    - $\text{Purchase Reg Weight (50g)} = \text{Supplier Report Weight (50g)} = \text{Purchase vs Sales Purchase Weight (50g)}$
    - $\text{Sales Reg Weight (20g)} = \text{Buyer Report Weight (20g)} = \text{Purchase vs Sales Sales Weight (20g)}$

---

## 14. Decimal Precision

- All financial amounts, unit rates, weights, averages, and margins use `Decimal` from `decimal.js`.
- No IEEE-754 floating-point calculations (`0.1 + 0.2 = 0.30000000000000004`) are used in authoritative calculations.
- Safe division guards ensure zero-weight denominators yield `Decimal(0)` without generating `NaN`, `Infinity`, or runtime exceptions.

---

## 15. RBAC (Role-Based Access Control)

- **STAFF**:
  - Authorized to access operational reports: Purchase Register, Sales Register, Current Stock, Supplier-wise Purchases, Buyer-wise Sales, Purchase vs Sales, and Transaction History.
- **ADMIN**:
  - Authorized to access all reports, including Bullion Profit.
- If a STAFF member navigates to `/reports/profit`, access is blocked at both the server-page level (`BullionProfitPage`) and server-action level (`requireAdmin`).

---

## 16. Performance Considerations

- Grouped queries and targeted projections prevent N+1 query loops.
- `prisma.purchase.findMany` and `prisma.sale.findMany` execute with selective field projection and indexed lookups (`date`, `metalId`, `purityId`, `status`).
- Stock position valuation executes concurrently across active buckets using `Promise.all`.

---

## 17. Tests & Results

The test suite was run via `vitest run --run`:
```
Test Files  5 passed (5)
     Tests  70 passed (70)
  Duration  1.01s
```
Test suites executed:
- `tests/unit/b3-reporting.test.ts` (11 tests) — Covers Section 15 reconciliation scenario, Section 16 cross-report reconciliation, cancellation exclusion, date boundary inclusivity, Bullion profit derivation, zero-weight safety, CSV export escaping, and RBAC.
- `tests/unit/b2-operational.test.ts` (16 tests) — Operational transactions & masters.
- `tests/unit/b1-domain.test.ts` (31 tests) — Domain integrity & stock movements.
- `tests/unit/helpers.test.ts` (9 tests) — Formatters & utilities.
- `tests/unit/stock-logic.test.ts` (3 tests) — Stock formulas.

---

## 18. TypeScript, Lint & Build Results

- **Prisma Validate**: Validated with zero warnings (`npx prisma validate`).
- **Prisma Generate**: Generated Prisma Client v7.10.0 to `./node_modules/@prisma/client`.
- **TypeScript**: `npm run typecheck` (`tsc --noEmit`) completed with **0 errors**.
- **Production Build**: `npm run build` completed successfully with code 0.
  - All 22 routes compiled successfully (including all 8 report routes).

---

## 19. Files Changed

### Created:
- `src/lib/services/report-service.ts` — Authoritative reporting logic and Decimal calculations.
- `src/lib/validations/report.ts` — Zod schema for report filter parameters.
- `src/lib/actions/report-actions.ts` — Authenticated & authorized server actions.
- `src/lib/utils/export-csv.ts` — RFC 4180 CSV export utility.
- `src/components/reports/reports-nav.tsx` — Sub-navigation bar across all 8 reports.
- `src/components/reports/report-filters.tsx` — Standard filter controls.
- `src/components/reports/report-summary-cards.tsx` — Reusable KPI cards.
- `src/components/reports/export-button.tsx` — CSV download trigger button.
- `src/app/(app)/reports/page.tsx` — Reports Hub page.
- `src/app/(app)/reports/purchases/page.tsx` & `purchase-register-view.tsx` — Purchase Register.
- `src/app/(app)/reports/sales/page.tsx` & `sales-register-view.tsx` — Sales Register.
- `src/app/(app)/reports/stock/page.tsx` & `current-stock-view.tsx` — Current Stock Report.
- `src/app/(app)/reports/suppliers/page.tsx` & `supplier-wise-view.tsx` — Supplier-wise Purchase Report.
- `src/app/(app)/reports/buyers/page.tsx` & `buyer-wise-view.tsx` — Buyer-wise Sales Report.
- `src/app/(app)/reports/purchase-vs-sales/page.tsx` & `purchase-vs-sales-view.tsx` — Purchase vs Sales Comparative Report.
- `src/app/(app)/reports/profit/page.tsx` & `profit-report-view.tsx` — Bullion Profit Report.
- `src/app/(app)/reports/transactions/page.tsx` & `transaction-history-view.tsx` — Transaction History Report.
- `tests/unit/b3-reporting.test.ts` — Comprehensive test suite for reporting.

### Modified:
- `src/components/sidebar.tsx` — Added Reports link (`/reports`) to the primary navigation menu.

---

## 20. Known Limitations

- **Profit Cost Basis**: In V1, the Weighted Average Cost methodology derives the cost basis per $(Metal \times Purity)$ bucket from posted purchases. If initial inventory arrived strictly via Opening Stock without a recorded purchase rate, that opening portion has an acquisition cost of zero unless established by subsequent purchases. This is transparently disclosed in the methodology banner.
- **Export Formats**: Only RFC 4180 CSV export is currently supported. PDF or Excel exports are deferred to future phases.

---

## 21. Explicit Pawnify Isolation Confirmation

- **Directory Boundary**: All work was performed strictly inside `Bullion/`.
- **Zero Cross-Imports**: No files, utilities, schemas, or dependencies from `pawnify` or `pawnify-main` were imported, referenced, or modified.
- **No Shared State**: The Bullion database, schemas, and engines remain 100% independent.
