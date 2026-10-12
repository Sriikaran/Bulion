# BULLION MODULE — COMPLETE REQUIREMENTS GAP AUDIT
**Repository:** https://github.com/Sriikaran/Bulion  
**Target Path:** `c:\Users\srika\OneDrive\Desktop\pawnify\Bullion`  
**Audit Date:** October 3, 2026  
**Audit Scope:** Full codebase inspection (Database schema, domain services, server actions, client components, reporting engine, validations, RBAC, audit logging, and automated test suite) against:
1. The existing Bullion codebase / repository.
2. The specification document: *“Bullion Module — Developer Requirements / Bullion Trading — Business Logic & Developer Action Guide”*.

---

# 1. Executive Summary

This audit evaluates the current state of the Bullion application against both the Core V1 operational requirements and the expanded Bullion Trading Business Logic Guide.

### Key Audit Findings:
1. **Core V1 Bullion Module: 100% Fully Implemented & Production-Ready**
   - The primary operational V1 scope—Metal/Purity Masters, Counterparty Directory, Purchase Entry & Invoicing, Sales Entry & Invoicing, Authoritative Append-Only Physical Stock Ledger (`StockMovement`), Stock Adjustments, Opening Stock, 8 Comprehensive Business Intelligence Reports, CSV Export with formula injection defenses, Audit Logging, and Server-Side RBAC—is **fully implemented, hardened, and verified with 88 passing tests**.
   - The core invariant:
     $$\text{Current Stock} = \text{Opening} + \text{Purchases} - \text{Sales} \pm \text{Adjustments}$$
     is strictly maintained using `Decimal.js` (4 decimal places for weight, 2 for monetary values) and row-level locking (`SELECT ... FOR UPDATE`) to prevent overselling or race conditions.

2. **Advanced Trading & Financial Workflows: 0% Implemented (Out of V1 Scope)**
   - The expanded trading workflows specified in the Developer Action Guide (unfixed rate bookings, subsequent rate fixing, margin-based live quote engines, customer rate blocks/reservations with expiry timers, market spot reference feeds, true financial payment/receipt ledger with partial payments, counterparty receivables/payables tracking, decoupled physical vault fulfilment vs deal creation, and rate cut/uncut calculations) are **not present** in the V1 codebase.
   - In V1, deals are immediately fixed-rate transactions, payment mode is purely descriptive (not a money ledger), and physical stock moves immediately upon transaction posting.

3. **Major Missing Pieces for Advanced Trading:**
   - No financial transaction ledger (no `Payment` or `Receipt` model; party balances / outstandings cannot be tracked).
   - No rate lifecycle tracking (no `UNFIXED` status, rate fixing history, or fixing timestamps).
   - No rate block / stock reservation mechanism with automated TTL/expiry.
   - No live market rate board (IBJA/MCX spot feeds) or dynamic quoting engine.
   - No physical delivery/fulfilment separation from deal contract creation.

4. **Major Incomplete / Coupling Points:**
   - **Payment Mode vs Cash Flow:** Selecting a payment mode (`CASH`, `UPI`, etc.) records an attribute on the invoice, but does NOT create a journal entry, cash/bank receipt, or reduce counterparty debt.
   - **Deal vs Physical Vault Movement:** Posting an invoice automatically writes a `StockMovement`. There is no intermediate state where a sale is booked/fixed while physical bullion is awaiting vault dispatch or dispatch approval.

---

# 2. Comprehensive Requirement Matrix

Each requirement has been inspected across: UI, State, Actions/API, Domain Services, Database Schema (`Prisma`), Validations (`Zod`), RBAC, Reports, and Tests.

### Classification Key:
- ✅ **FULLY IMPLEMENTED:** Meets all functional, persistence, calculation, and security requirements end-to-end.
- 🟡 **PARTIALLY IMPLEMENTED:** Exists in part (e.g. descriptive attribute exists, but lacks underlying ledger or lifecycle).
- ❌ **NOT IMPLEMENTED:** Not present in database, service layer, or UI.
- ⚠️ **IMPLEMENTED BUT INCORRECT / INCOMPLETE:** Implemented but behaves inconsistently or couples separate domain concepts.
- ➖ **NOT APPLICABLE / NOT REQUIRED FOR CURRENT V1:** Explicitly deferred or undefined requirement (e.g. Rate Cut formula).

| # | Requirement | Classification | Existing Implementation | Missing / Architectural Gap | Relevant Files |
|---|---|:---:|---|---|---|
| **1** | **BULLION MASTER** | | | | |
| 1.1 | Metal Catalog (Gold, Silver) | ✅ FULLY IMPLEMENTED | `Metal` Prisma model, enum `MetalType { GOLD, SILVER }`, unique `code` & `name`. | None for V1. (Platinum/Palladium would require enum expansion). | `prisma/schema.prisma`, `master-service.ts`, `master-actions.ts` |
| 1.2 | Purity Definitions (24K, 22K, 18K, etc.) | ✅ FULLY IMPLEMENTED | `Purity` model with `metalId` FK, `label`, `fineness` (`Decimal(6,4)`). | None. Correctly handles 0.9999, 0.9167, 0.7500. | `prisma/schema.prisma`, `master-service.ts` |
| 1.3 | Unit of Measure (Standardized to Grams) | ✅ FULLY IMPLEMENTED | All database weights, formulas, calculations, and UI displays enforce `weightGrams` (`Decimal(14,4)`). | System is standardized to Grams. Tola/Ounce multi-unit conversions not implemented. | `schema.prisma`, `stock-service.ts`, `helpers.ts` |
| 1.4 | Active / Inactive Status Guards | ✅ FULLY IMPLEMENTED | `isActive Boolean @default(true)` on `Metal` and `Purity`. Actions assert active status before use. | None. Inactive entities cannot be used in new drafts or postings. | `master-service.ts`, `purchase-service.ts`, `sale-service.ts` |
| 1.5 | Metal & Purity Separation in Stock | ✅ FULLY IMPLEMENTED | Stock tracked strictly per `(metalId, purityId)` bucket pair in `StockMovement`. | None. Buckets are 100% isolated. | `stock-service.ts`, `schema.prisma` |
| 1.6 | Master Deletion Protection | ✅ FULLY IMPLEMENTED | Soft deactivation only; no destructive DELETE endpoints exposed if references exist. | None. | `master-actions.ts`, `master-service.ts` |
| **2** | **COUNTERPARTY MASTER** | | | | |
| 2.1 | Counterparty Entity (Supplier, Customer, Both) | ✅ FULLY IMPLEMENTED | `Counterparty` model with enum `CounterpartyType { SUPPLIER, CUSTOMER, BOTH }`. | None. | `schema.prisma`, `counterparty-service.ts` |
| 2.2 | Contact Information & Search | ✅ FULLY IMPLEMENTED | Name, phone, email, address, notes, and search/filter across UI. | None. | `counterparty-service.ts`, `counterparties-client.tsx` |
| 2.3 | Active / Inactive Status | ✅ FULLY IMPLEMENTED | `isActive` boolean flag with server-side guard. | None. | `counterparty-actions.ts` |
| 2.4 | Counterparty Deletion Protection | ✅ FULLY IMPLEMENTED | Foreign key relations on `Purchase` and `Sale` prevent orphaned or corrupted histories. | None. | `schema.prisma`, `counterparty-service.ts` |
| **3** | **PURCHASE / BUY** | | | | |
| 3.1 | Core Fields (Date, Supplier, Invoice, Metal, Purity, Weight, Rate, Total, PaymentMode, Notes) | ✅ FULLY IMPLEMENTED | All 11 required fields captured in `Purchase` model with Zod validations. | None. | `schema.prisma`, `validations/purchase.ts` |
| 3.2 | Authoritative Server Calculation | ✅ FULLY IMPLEMENTED | Total amount strictly calculated on server: `weightGrams × ratePerGram` using `Decimal.js`. Client totals not trusted. | None. | `purchase-service.ts`, `validations/purchase.ts` |
| 3.3 | Supplier Association & Historical Snapshot | ✅ FULLY IMPLEMENTED | Links `counterpartyId` FK and denormalizes `supplierName` and `supplierContact` to preserve history if master changes. | None. | `schema.prisma`, `purchase-service.ts` |
| 3.4 | Historical Rate Preservation | ✅ FULLY IMPLEMENTED | `ratePerGram` stored permanently on `Purchase` row; never updated dynamically. | None. | `schema.prisma`, `purchase-service.ts` |
| 3.5 | Stock Increase on Posting | ✅ FULLY IMPLEMENTED | Posting draft creates `StockMovement` row with `movementType: "PURCHASE"`, `+weightGrams`. | None. | `purchase-service.ts`, `stock-service.ts` |
| 3.6 | Duplicate Posting Prevention | ✅ FULLY IMPLEMENTED | Atomic status transition: asserts `status === "DRAFT"` inside Prisma transaction. | None. | `purchase-service.ts` |
| 3.7 | Purchase Cancellation & Reversal | ✅ FULLY IMPLEMENTED | ADMIN-only cancellation writes compensating `StockMovement` with `PURCHASE_CANCEL` (`-weightGrams`). | None. | `purchase-service.ts`, `purchase-actions.ts` |
| 3.8 | Audit Trail & Immutability | ✅ FULLY IMPLEMENTED | Every draft, post, and cancel writes structured `AuditLog` row. Posted rows cannot be deleted. | None. | `audit-service.ts`, `purchase-service.ts` |
| **4** | **SALES / SELL** | | | | |
| 4.1 | Core Fields (Date, Buyer, Invoice, Metal, Purity, Weight, Rate, Total, PaymentMode, Notes) | ✅ FULLY IMPLEMENTED | All required fields captured in `Sale` model with Zod validations. | None. | `schema.prisma`, `validations/sale.ts` |
| 4.2 | Live Stock Verification | ✅ FULLY IMPLEMENTED | Pre-posting check aggregates available stock in `(metalId, purityId)` bucket. | None. | `sale-service.ts`, `stock-service.ts` |
| 4.3 | Overselling Prevention | ✅ FULLY IMPLEMENTED | Throws `InsufficientStockError` if `requested > available`. | None. | `stock-service.ts`, `sale-service.ts` |
| 4.4 | Concurrent Race Condition Defense | ✅ FULLY IMPLEMENTED | Row-level locking via `SELECT id FROM purity WHERE id = $1 FOR UPDATE` inside transaction. | None. | `stock-service.ts` |
| 4.5 | Authoritative Server Calculation | ✅ FULLY IMPLEMENTED | Total amount strictly calculated on server: `weightGrams × ratePerGram` using `Decimal.js`. | None. | `sale-service.ts` |
| 4.6 | Stock Decrease on Posting | ✅ FULLY IMPLEMENTED | Posting draft creates `StockMovement` row with `movementType: "SALE"`, `-weightGrams`. | None. | `sale-service.ts`, `stock-service.ts` |
| 4.7 | Sale Cancellation & Reversal | ✅ FULLY IMPLEMENTED | ADMIN-only cancellation writes compensating `StockMovement` with `SALE_CANCEL` (`+weightGrams`). | None. | `sale-service.ts`, `sale-actions.ts` |
| 4.8 | Historical Rate Preservation | ✅ FULLY IMPLEMENTED | `ratePerGram` stored permanently on `Sale` row; never updated dynamically. | None. | `schema.prisma`, `sale-service.ts` |
| **5** | **STOCK LEDGER & INTEGRITY** | | | | |
| 5.1 | Mathematical Stock Invariant | ✅ FULLY IMPLEMENTED | Current Stock = Opening + Purchases - Sales ± Adjustments strictly maintained. | None. | `stock-service.ts`, `schema.prisma` |
| 5.2 | Single Source of Truth | ✅ FULLY IMPLEMENTED | Derived 100% from append-only `StockMovement` table. No secondary or cached stock counter columns exist. | None. | `stock-service.ts`, `schema.prisma` |
| 5.3 | Decimal Precision | ✅ FULLY IMPLEMENTED | All weights stored as `Decimal(14,4)`; all financial values stored as `Decimal(16,2)`; zero JS float drift. | None. | `schema.prisma`, `stock-service.ts` |
| 5.4 | Opening Stock Initialization | ✅ FULLY IMPLEMENTED | ADMIN-only one-time setup per bucket; creates immutable `OpeningStock` record and `OPENING` movement. | None. | `opening-stock-service.ts`, `stock-actions.ts` |
| 5.5 | Stock Valuation & Weighted Rates | ✅ FULLY IMPLEMENTED | Weighted Average Purchase Rate and Selling Rate computed dynamically: $\frac{\text{Total Amount}}{\text{Total Weight}}$. | None. | `stock-service.ts`, `report-service.ts` |
| **6** | **STOCK ADJUSTMENT** | | | | |
| 6.1 | Adjustment Fields (Date, Metal, Purity, Direction, Weight, Reason, Notes) | ✅ FULLY IMPLEMENTED | Captured in `StockAdjustment` model. | None. | `schema.prisma`, `adjustment-service.ts` |
| 6.2 | Role-Based Authorization | ✅ FULLY IMPLEMENTED | Restricted to ADMIN role on server side (`requireAdmin`). STAFF calls rejected. | None. | `stock-actions.ts`, `adjustment-service.ts` |
| 6.3 | Stock Movement Creation | ✅ FULLY IMPLEMENTED | Creates `ADJUSTMENT_INCREASE` (+weight) or `ADJUSTMENT_DECREASE` (-weight). | None. | `adjustment-service.ts` |
| 6.4 | Negative Stock Guard on Decrease | ✅ FULLY IMPLEMENTED | Outward adjustments verify available stock; throws `InsufficientStockError` if decrease exceeds balance. | None. | `adjustment-service.ts`, `stock-service.ts` |
| 6.5 | Adjustment Cancellation / Reversal | ✅ FULLY IMPLEMENTED | Reversal writes opposite compensating StockMovement and marks adjustment `CANCELLED`. | None. | `adjustment-service.ts` |
| **7** | **TRANSACTION HISTORY & AUDIT** | | | | |
| 7.1 | Chronological Movement Ledger | ✅ FULLY IMPLEMENTED | Shows all purchases, sales, adjustments, opening stocks, and cancellations chronologically. | None. | `stock-service.ts`, `transactions/page.tsx` |
| 7.2 | Movement Details (Party, Metal, Purity, Signed Weight, Reference, User) | ✅ FULLY IMPLEMENTED | Displays complete metadata, invoice numbers, supplier/buyer names, signed weights, and actor identity. | None. | `transactions-client.tsx`, `transaction-history-view.tsx` |
| 7.3 | System-Wide Audit Log | ✅ FULLY IMPLEMENTED | Immutable `AuditLog` table stores `action`, `entityType`, `entityId`, `prevState`, `nextState`, `actorId`. | None. | `audit-service.ts`, `schema.prisma` |
| **8** | **REPORTING ENGINE** | | | | |
| 8.1 | Report A: Purchase Register | ✅ FULLY IMPLEMENTED | Itemized invoice register, date/supplier/metal/purity filters, active vs cancelled separation, summary cards. | None. | `report-service.ts`, `purchase-register-view.tsx` |
| 8.2 | Report B: Sales Register | ✅ FULLY IMPLEMENTED | Itemized sales journal, date/buyer/metal/purity filters, payment modes, realized revenue summary cards. | None. | `report-service.ts`, `sales-register-view.tsx` |
| 8.3 | Report C: Current Bullion Stock | ✅ FULLY IMPLEMENTED | Bucket breakdown (Opening, Purchased, Sold, Adjustments, Available, Avg Rates, Stock Valuation). | None. | `report-service.ts`, `current-stock-view.tsx` |
| 8.4 | Report D: Supplier-wise Purchase Report | ✅ FULLY IMPLEMENTED | Grouped by supplier: purchase count, total weight, total value, weighted average rate. | None. | `report-service.ts`, `supplier-wise-view.tsx` |
| 8.5 | Report E: Buyer-wise Sales Report | ✅ FULLY IMPLEMENTED | Grouped by buyer: sales count, total weight, total revenue, weighted average selling rate. | None. | `report-service.ts`, `buyer-wise-view.tsx` |
| 8.6 | Report F: Purchase vs Sales Report | ✅ FULLY IMPLEMENTED | Period trade comparison: acquisition vs dispatch weight/value, net flow per bucket. | None. | `report-service.ts`, `purchase-vs-sales-view.tsx` |
| 8.7 | Report G: Bullion Profit Report | ✅ FULLY IMPLEMENTED | ADMIN-only. Weighted Average Cost Basis, realized revenue, cost of goods sold, gross profit, margin %. | None for V1. (FIFO lot allocation not in V1). | `report-service.ts`, `profit-report-view.tsx` |
| 8.8 | Report H: Transaction History Report | ✅ FULLY IMPLEMENTED | Full append-only ledger report with signed weights, movement type filters, and audit traces. | None. | `report-service.ts`, `transaction-history-view.tsx` |
| 8.9 | CSV Export Functionality | ✅ FULLY IMPLEMENTED | RFC 4180 compliant export on all 8 reports. | None. | `export-csv.ts`, `export-button.tsx` |
| 8.10 | CSV Formula Injection Defense | ✅ FULLY IMPLEMENTED | Sanitizes triggers (`=`, `@`, `+`, `-`, `\t`, `\r`) with single quotes; preserves legitimate numbers. | None. | `export-csv.ts`, `tests/unit/helpers.test.ts` |
| **9** | **ADVANCED TRADING & FINANCIAL LOGIC** | | | | |
| 9.1 | Fixed Rate Deal Status | 🟡 PARTIALLY IMPLEMENTED | Rate is fixed and stored at invoice creation time. | No explicit `rateType: "FIXED"` flag or contract state machine. | `purchase-service.ts`, `sale-service.ts` |
| 9.2 | Unfixed Rate Deal Booking | ❌ NOT IMPLEMENTED | None. Rate is mandatory on purchase/sale creation. | No schema or service for booking weight with floating rate. | Requires `rateType`, pending valuation logic. |
| 9.3 | Rate Fixing & Fixing History | ❌ NOT IMPLEMENTED | None. | No mechanism or table to fix rate later, record fixing timestamp, or capture market delta. | Requires `RateFixing` entity. |
| 9.4 | Customer Rate Block / Reservation | ❌ NOT IMPLEMENTED | None. | No customer rate block entity, reference rate capture, margin addition, TTL/expiry timer, or stock reservation. | Requires `RateBlock` entity & reservation logic. |
| 9.5 | Market Reference Rate Board | ❌ NOT IMPLEMENTED | None. Rates are entered manually. | No live spot rate feed, IBJA/MCX rates table, or rate source capture. | Requires `MarketRate` entity. |
| 9.6 | Dynamic Margin Engine | ❌ NOT IMPLEMENTED | None. (Profit report only calculates margin ex-post). | No configurable % or ₹/g margin system to generate real-time customer quotes. | Requires `MarginRule` entity. |
| 9.7 | Descriptive Payment Mode | ✅ FULLY IMPLEMENTED | Enum `PaymentMode { CASH, UPI, BANK_TRANSFER, CARD, CHEQUE, OTHER }`. | None as a descriptive tag. | `schema.prisma` |
| 9.8 | Actual Money Transaction Ledger | ❌ NOT IMPLEMENTED | None. | No `Payment` or `Receipt` model, no cash/bank accounts, no payment voucher generation. | Requires Financial Ledger. |
| 9.9 | Counterparty Outstandings & Debt | ❌ NOT IMPLEMENTED | None. | No payables/receivables tracking, no partial payment settlement, no credit limits. | Requires Account Receivables/Payables. |
| 9.10 | Physical Vault Fulfilment Decoupling | ⚠️ IMPLEMENTED BUT INCOMPLETE | Posting invoice writes immediate physical `StockMovement`. | Deal agreement is coupled to vault movement; no separation between "contract booked" and "goods dispatched". | `purchase-service.ts`, `sale-service.ts` |
| 9.11 | Advanced Deal Lifecycle States | 🟡 PARTIALLY IMPLEMENTED | Status enum: `DRAFT`, `POSTED`, `CANCELLED`. | Missing advanced lifecycle: `OPEN/UNFIXED`, `PART-SETTLED`, `FULFILLED`, `CLOSED`. | `schema.prisma` |
| 9.12 | Rate Cut / Uncut Calculations | ➖ NOT APPLICABLE / NOT REQUIRED FOR V1 | None. | Requirements explicitly state formula is not yet defined; audit only, no implementation. | Undefined by business. |

---

# 3. Core V1 Coverage Summary

The Core V1 requirements represent the operational foundation necessary to record precious metal inventory, execute trade purchases and sales, prevent overselling, and generate business reports.

```
+-------------------------------------------------------------------------+
|                        CORE V1 SCOPE BREAKDOWN                          |
+------------------------------------+---------------+--------------------+
| Functional Area                    | Status        | Implementation %   |
+------------------------------------+---------------+--------------------+
| 1. Bullion Masters (Metals/Purity) | Complete      | 100%               |
| 2. Counterparty Master             | Complete      | 100%               |
| 3. Purchase Operations             | Complete      | 100%               |
| 4. Sale Operations                 | Complete      | 100%               |
| 5. Stock Ledger & Invariant Engine | Complete      | 100%               |
| 6. Stock Adjustments & Opening     | Complete      | 100%               |
| 7. Transaction History & Audit     | Complete      | 100%               |
| 8. 8 Standard Business Reports     | Complete      | 100%               |
| 9. CSV Exports & Security Defense  | Complete      | 100%               |
| 10. Role-Based Access Control      | Complete      | 100%               |
+------------------------------------+---------------+--------------------+
| CORE V1 TOTAL                      | FULLY PASSING | 100%               |
+------------------------------------+---------------+--------------------+
```

### Key Architectural Strengths of V1:
- **Append-Only Ledger**: No update or delete operations on `StockMovement`. Physical inventory is derived from the sum of signed weights, guaranteeing that stock can never get out of sync with transactions.
- **Race Condition Prevention**: `assertSufficientStock` executes inside a Prisma interactive transaction and issues `SELECT id FROM purity WHERE id = $1 FOR UPDATE`, serializing concurrent sales and eliminating race conditions.
- **Decimal Safety**: Complete avoidance of JavaScript IEEE-754 floating-point numbers. `Decimal.js` is used across all domain logic, validations, and report totals.
- **Client/Server Serialization**: Next.js React Server Component (RSC) boundary issues with `Prisma.Decimal` instances are handled via `serializeForClient`, ensuring zero browser serialization crashes.

---

# 4. Advanced Business Logic Coverage Summary

The Developer Action Guide outlines advanced bullion trading features that go beyond simple inventory invoicing into commercial trading desk operations.

```
+-------------------------------------------------------------------------+
|                  ADVANCED TRADING WORKFLOWS BREAKDOWN                   |
+------------------------------------+---------------+--------------------+
| Advanced Feature Area              | Status        | Implementation %   |
+------------------------------------+---------------+--------------------+
| 1. Fixed Rate Deals                | Partial (V1)  | 50%                |
| 2. Unfixed Rate Deal Booking       | Missing       | 0%                 |
| 3. Subsequent Rate Fixing Workflow | Missing       | 0%                 |
| 4. Customer Rate Blocks & TTL      | Missing       | 0%                 |
| 5. Market Reference Rate Feeds     | Missing       | 0%                 |
| 6. Dynamic Quoting Margin Engine   | Missing       | 0%                 |
| 7. Money Transaction Ledger        | Missing       | 0%                 |
| 8. Counterparty Outstandings       | Missing       | 0%                 |
| 9. Physical Fulfilment Decoupling  | Missing       | 0%                 |
| 10. Multi-State Deal Lifecycle     | Partial (V1)  | 25%                |
| 11. Rate Cut / Uncut Calculations  | Not Defined   | 0%                 |
+------------------------------------+---------------+--------------------+
| ADVANCED BUSINESS GUIDE TOTAL      | NOT IN V1     | 6.8%               |
+------------------------------------+---------------+--------------------+
```

### Detailed Evaluation of Advanced Workflows:

#### 4.1 Fixed Rate vs. Unfixed Rate
- **Current State:** Every purchase and sale requires `ratePerGram` upfront. When saved, the rate is fixed and stored permanently.
- **Gap:** In professional bullion trading, counterparties often book quantity (e.g. 500g Gold) when price is floating, and fix the rate in tranches or at market close. The database lacks an `isRateFixed` flag, `rateFixedAt` timestamp, or mechanism to leave `ratePerGram` null/floating.

#### 4.2 Rate Block / Reservation
- **Current State:** Non-existent.
- **Gap:** A customer calls to "block a rate" for 15 minutes. The system must capture the market reference rate, add the firm's margin, set an expiry timestamp, and reserve physical stock so it cannot be sold elsewhere. If the customer does not confirm within the time window, the reservation must auto-expire.

#### 4.3 Market Reference Rates & Margin Engine
- **Current State:** Rates are keyed manually by staff.
- **Gap:** No automated or manual reference rate table (e.g. Spot Ask/Bid, MCX Gold 1kg, IBJA 999). No rules for calculating customer quotes ($Quote = Reference + Margin$).

#### 4.4 Payment/Receipt vs. Descriptive Payment Mode
- **Current State:** `PaymentMode` is an enum (`CASH`, `UPI`, `BANK_TRANSFER`, etc.) on `Purchase` and `Sale`.
- **Gap:** Selecting "CASH" simply prints "CASH" on the invoice. It does **not** create a cash voucher, increase cash balance, record who collected the money, or handle split payments (e.g. ₹200,000 Cash + ₹300,000 RTGS).

#### 4.5 Counterparty Outstandings (Debt & Receivables)
- **Current State:** Non-existent.
- **Gap:** Bullion merchants frequently sell on credit or buy with deferred settlement. Because there is no payment ledger, the system cannot show "Customer X owes ₹450,000" or "Merchant owes Supplier Y ₹1,200,000".

#### 4.6 Fulfilment Decoupling
- **Current State:** Posting an invoice immediately moves physical stock.
- **Gap:** When a deal is agreed at 10:00 AM, the financial deal is struck. Physical delivery to/from the vault might occur hours or days later. The system cannot distinguish "Sold but in Vault" from "Dispatched".

---

# 5. Critical Gaps & Risk Prioritization

| Priority | Category | Gap Description | Business & System Impact |
|:---:|:---|---|---|
| **P0** | **Financial Integrity** | **No Payment / Money Ledger** | Selecting `paymentMode` gives the illusion of payment settlement, but no cash/bank ledger or debt ledger exists. Transactions are purely stock invoices. |
| **P0** | **Financial Integrity** | **No Counterparty Outstandings** | System cannot track unpaid customer balances or outstanding supplier invoices. Partial payments cannot be recorded. |
| **P1** | **Trading Operations** | **Coupled Booking & Physical Fulfilment** | Cannot execute forward bookings or pre-delivery agreements without immediately moving stock out of available physical inventory. |
| **P1** | **Trading Operations** | **No Unfixed Deals / Rate Fixing** | Limits business strictly to "spot immediate cash-and-carry" trading. Cannot support industry-standard unfixed/floating bullion contracts. |
| **P2** | **Quoting & Desk Workflow** | **No Rate Block / Stock Reservation** | Sales desk cannot hold price quotes for customers with a TTL countdown or temporary stock hold. |
| **P2** | **Quoting & Desk Workflow** | **No Market Spot Reference Table** | Traders must manually check external terminals and re-type rates, creating operational fat-finger risk. |
| **P3** | **Advanced Functionality** | **Undefined Rate Cut/Uncut Logic** | Requires business domain stakeholder specification before any architecture or formula can be formulated. |

---

# 6. Recommended Implementation Roadmap (Phased Evolution)

To advance from Core V1 to the complete Bullion Trading Engine without destabilizing existing stock invariants, implementation should proceed in three distinct phases:

```
[ PHASE V1: CURRENT FOUNDATION ] (COMPLETE)
  - Metals/Purities Master
  - Counterparties
  - Purchases & Sales (Fixed Spot)
  - StockMovement Ledger & Invariants
  - 8 Core Reports & CSV Exports
            │
            ▼
[ PHASE V2: FINANCIAL SETTLEMENT & OUTSTANDINGS ] (NEXT LOGICAL STEP)
  - Payment & Receipt Models (Cash, Bank, Ledger)
  - Counterparty Account Ledger (Receivables & Payables)
  - Payment Status on Invoices (UNPAID, PARTIAL, PAID)
  - Multi-mode Split Payments & Payment History
  - Outstanding Balances Report
            │
            ▼
[ PHASE V3: ADVANCED TRADING DESK ]
  - Floating / Unfixed Contracts (`rateType: UNFIXED`)
  - Rate Fixing Workflow & Historical Fixing Journal
  - Fulfilment Decoupling (DEAL_BOOKED vs PHYSICAL_DELIVERY)
  - Rate Blocks & Temporary Stock Reservation Engine
  - Market Reference Rates & Configurable Margin Rules
```

---

# 7. Existing Test Suite Audit

The existing test suite comprises **6 test files and 88 passing tests** executed via Vitest.

### Test Coverage Breakdown:

| Test Suite File | Test Count | Status | Verified Capabilities |
|---|:---:|:---:|---|
| `tests/unit/stock-logic.test.ts` | 3 | **PASS** | Pure stock mathematical balance formula. |
| `tests/unit/b1-domain.test.ts` | 31 | **PASS** | Bucket isolation, purchase draft/post, sale draft/post, stock checks, overselling rejection, decimal precision, audit logs. |
| `tests/unit/b2-operational.test.ts` | 16 | **PASS** | Server-side RBAC (STAFF restricted from cancellations, adjustments, masters), invoice uniqueness, counterparty linkage. |
| `tests/unit/b3-reporting.test.ts` | 11 | **PASS** | Purchase Register, Sales Register, Current Stock, Supplier-wise, Buyer-wise, Comparative flow, Profit (Weighted Average), Transaction history. |
| `tests/unit/b4-hardening.test.ts` | 16 | **PASS** | Concurrent competing sales, tiny weights (0.0001g), high weights (1,000kg), duplicate invoices, inactive master guards, 17-step full lifecycle, CSV formula injection sanitization, error masking. |
| `tests/unit/helpers.test.ts` | 11 | **PASS** | Currency formatting, gram formatting, date formatting, CSV escaping, `serializeForClient` Decimal conversion. |
| **TOTAL** | **88** | **100% PASS** | **All Core V1 requirements covered.** |

### Missing Test Coverage (Due to Unimplemented Features):
- Zero tests for Unfixed deals or rate fixing (features do not exist).
- Zero tests for Rate blocks / stock reservation TTL (features do not exist).
- Zero tests for Payment vouchers, cash/bank ledger, or customer debt balances (features do not exist).
- Zero tests for physical delivery vs deal booking decoupling (features do not exist).

---

# 8. Architectural Assessment

### Can the current architecture support the missing requirements?
**YES, via additive, non-breaking schema expansions.**

The foundational domain architecture built in B0–B5 is clean, modular, and resilient:
1. **The `StockMovement` table is strictly append-only.**  
   This design is sound. Decoupling physical delivery in Phase V3 will simply require adding a `movementType: "FULFILMENT_OUT"` or linking `StockMovement` to a delivery record rather than firing immediately on invoice creation.
2. **Prisma Schema is extensible.**  
   Adding financial models (`Payment`, `Receipt`, `AccountLedger`) will link to `Purchase`, `Sale`, and `Counterparty` via optional foreign keys without modifying or corrupting existing historical transactions.
3. **No Database Pollution.**  
   There are no conflicting or competing stock tables. Stock is derived purely from `StockMovement`.
4. **Clean Layer Separation.**  
   Server Actions (`/src/lib/actions/`) strictly delegate to Domain Services (`/src/lib/services/`), which wrap mutations in interactive Prisma `$transaction` blocks.

---

# 9. Final Verdict

### Core V1 Implementation Score:
$$\mathbf{100\% \quad (Pass)}$$
*All requirements for Phase B0, B1, B2, B3, B4, and B5 are fully implemented, verified, and release-ready.*

### Advanced Business Guide Implementation Score:
$$\mathbf{6.8\% \quad (Out\ of\ V1\ Scope)}$$
*Only fixed-rate invoice snapshots and descriptive payment modes are present. Floating rates, rate fixing, rate blocks, margin quoting, money ledgers, and counterparty debt tracking are not yet implemented.*

---

### READY FOR IMPLEMENTATION: **YES**

**Recommendation:**  
The existing codebase is in a stable, verified, and uncorrupted state. Feature development for Phase V2 (Financial Payment Ledger & Counterparty Outstandings) or Phase V3 (Advanced Trading Desk) can proceed safely on top of this foundation following the recommended implementation roadmap.
