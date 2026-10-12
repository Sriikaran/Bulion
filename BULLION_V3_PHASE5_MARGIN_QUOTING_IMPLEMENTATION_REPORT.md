# Bullion V3 Phase 5: Margin & Quoting Engine Implementation Report

## Executive Summary
This document details the complete design, implementation, and verification of **Bullion V3 Phase 5: Margin & Quoting Engine**. The engine provides a production-grade commercial quoting capability that calculates buy and sell bullion quotes from active Market Reference Rates and configured Margin Rules, snapshots them into immutable Quote records, and enables optional atomic consumption into downstream Rate Reservations—all while strictly preserving the immutability of historical transaction rates and physical/financial isolation.

---

## 1. Existing Architecture Inspected
The Bullion system architecture was inspected prior to design:
- **Market Reference Rates (V3.4)**: `MarketRate` model, service, and actions. Provides canonical benchmark reference rates per metal and purity per gram without mutating transaction records.
- **Rate Reservations (V3.3)**: `RateReservation` model and service. Temporarily locks commercial rate and weight before final rate-fixing.
- **Physical Fulfilments (V3.2)**: `Fulfilment` model separating commercial transactions from physical `StockMovement`.
- **Fixed / Unfixed Rates (V3.1)**: `RateStatus.FIXED` and `RateStatus.UNFIXED` on `Purchase` and `Sale`.
- **Financial Settlements (V2)**: `Payment` and `Receipt` handling actual monetary settlement.
- **Audit Service**: Immutable `AuditLog` table writing append-only event logs.
- **Decimal Precision**: Strict utilization of `Prisma.Decimal` and `decimal.js` with `Decimal.ROUND_HALF_UP`.
- **RBAC**: Administrator control (`ADMIN`) for margin rules, and authenticated operator execution (`STAFF`) for calculation and quoting.

---

## 2. Margin Model
Implemented the first-class `MarginRule` entity in [schema.prisma](file:///c:/Users/srika/OneDrive/Desktop/pawnify/Bullion/prisma/schema.prisma):
```prisma
enum QuoteDirection {
  BUY
  SELL
}

enum MarginType {
  PERCENTAGE
  FIXED_PER_GRAM
}

model MarginRule {
  id            String         @id @default(cuid())
  metalId       String
  purityId      String
  direction     QuoteDirection
  marginType    MarginType
  marginValue   Decimal        @db.Decimal(14, 4)
  isActive      Boolean        @default(true)
  effectiveFrom DateTime
  effectiveTo   DateTime?
  notes         String?
  createdById   String
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  metal     Metal      @relation(fields: [metalId], references: [id])
  purity    Purity     @relation(fields: [purityId], references: [id])
  createdBy user       @relation("MarginRuleCreatedBy", fields: [createdById], references: [id])
  quotes    Quote[]
  auditLogs AuditLog[]

  @@index([metalId, purityId, direction, effectiveFrom])
  @@index([effectiveFrom])
  @@index([effectiveTo])
  @@index([isActive])
  @@map("margin_rule")
}
```

---

## 3. Margin Semantics
Directional semantics are strictly implemented according to the bullion trading desk specification:
- **BUY (The business is buying bullion from a customer / supplier)**:
  $$\text{Quoted Rate} = \text{Reference Rate} - \text{Margin}$$
  *Example*: Reference = ₹12,500/g, Buy Margin = ₹100/g $\rightarrow$ Quoted BUY rate = ₹12,400/g.
- **SELL (The business is selling bullion to a customer)**:
  $$\text{Quoted Rate} = \text{Reference Rate} + \text{Margin}$$
  *Example*: Reference = ₹12,500/g, Sell Margin = ₹150/g $\rightarrow$ Quoted SELL rate = ₹12,650/g.
- BUY rules and SELL rules are completely independent and never cross-applied.

---

## 4. Percentage Calculation
For percentage-based margins (`MarginType.PERCENTAGE`):
$$\text{Margin Per Gram} = \text{Reference Rate} \times \frac{\text{Margin Value}}{100}$$
- **BUY (1%)**: $\text{Reference} = ₹12,500/\text{g} \rightarrow \text{Margin} = ₹125/\text{g} \rightarrow \text{Quote} = ₹12,375/\text{g}$.
- **SELL (1%)**: $\text{Reference} = ₹12,500/\text{g} \rightarrow \text{Margin} = ₹125/\text{g} \rightarrow \text{Quote} = ₹12,625/\text{g}$.
- Evaluated entirely via `decimal.js` without floating point math.

---

## 5. Fixed-Per-Gram Calculation
For fixed-per-gram margins (`MarginType.FIXED_PER_GRAM`):
$$\text{Margin Per Gram} = \text{Margin Value}$$
- Total quoted amount:
  $$\text{Quoted Amount} = \text{Weight (Grams)} \times \text{Quoted Rate Per Gram}$$
- *Example*: 500g @ ₹12,625/g = ₹63,12,500.00.

---

## 6. Effective-Date Handling
- Margin rules are historical and time-sensitive.
- When creating a rule at `effectiveFrom`:
  1. Prevents duplicate collisions at the exact millisecond for `(metalId, purityId, direction, effectiveFrom)`.
  2. If a future scheduled rule exists, bounds the new rule's `effectiveTo` to the future rule's `effectiveFrom`.
  3. Closes any previous open-ended active rule by setting its `effectiveTo = newEffectiveFrom`.
  4. Scheduled future rules do not activate before their designated timestamp.
  5. Point-in-time lookup (`asOf`) accurately selects the applicable historical rule.

---

## 7. Quote Model
Implemented the first-class `Quote` model in [schema.prisma](file:///c:/Users/srika/OneDrive/Desktop/pawnify/Bullion/prisma/schema.prisma):
```prisma
enum QuoteStatus {
  ACTIVE
  EXPIRED
  CONSUMED
  CANCELLED
}

model Quote {
  id                      String          @id @default(cuid())
  quoteNumber             String          @unique
  direction               QuoteDirection
  metalId                 String
  purityId                String
  unit                    String          @default("GRAM")
  weightGrams             Decimal         @db.Decimal(14, 4)
  marketRateId            String
  referenceRatePerGram    Decimal         @db.Decimal(14, 2)
  marketRateEffectiveFrom DateTime
  marginRuleId            String
  marginType              MarginType
  marginValue             Decimal         @db.Decimal(14, 4)
  marginPerGram           Decimal         @db.Decimal(14, 4)
  quotedRatePerGram       Decimal         @db.Decimal(14, 2)
  quotedAmount            Decimal         @db.Decimal(16, 2)
  status                  QuoteStatus     @default(ACTIVE)
  validUntil              DateTime
  notes                   String?

  rateReservationId       String?         @unique
  rateReservation         RateReservation? @relation(fields: [rateReservationId], references: [id])

  createdById             String
  createdBy               user            @relation("QuoteCreatedBy", fields: [createdById], references: [id])
  consumedById            String?
  consumedBy              user?           @relation("QuoteConsumedBy", fields: [consumedById], references: [id])
  consumedAt              DateTime?
  cancelledById           String?
  cancelledBy             user?           @relation("QuoteCancelledBy", fields: [cancelledById], references: [id])
  cancelledAt             DateTime?

  createdAt               DateTime        @default(now())
  updatedAt               DateTime        @updatedAt

  metal                   Metal           @relation(fields: [metalId], references: [id])
  purity                  Purity          @relation(fields: [purityId], references: [id])
  marketRate              MarketRate      @relation(fields: [marketRateId], references: [id])
  marginRule              MarginRule      @relation(fields: [marginRuleId], references: [id])
  auditLogs               AuditLog[]

  @@index([direction])
  @@index([status])
  @@index([metalId, purityId])
  @@index([validUntil])
  @@index([createdAt])
  @@map("quote")
}
```

---

## 8. Quote Snapshot & Immutability
- On quote creation, all calculation parameters and outputs are permanently snapshotted:
  - Exact reference rate and timestamp
  - Applied margin type, value, and per-gram spread
  - Quoted rate per gram and total quoted amount
  - Metal, purity, weight, direction, and validity deadline
- Once created, a quote's financial figures **never** dynamically recalculate when market reference rates or margin rules subsequently change.

---

## 9. Quote Expiration
- Quotes carry a `validUntil` timestamp (default 30 minutes, or custom duration).
- Evaluated lazily on lookup and strictly before consumption.
- Expired quotes transition to `EXPIRED` status and cannot be consumed or cancelled.
- Expired quotes remain permanently preserved in the ledger for historical reporting.

---

## 10. Quote Consumption
- Consuming an `ACTIVE` quote is an atomic transaction with row locking (`SELECT id FROM "quote" WHERE id = $1 FOR UPDATE`).
- Verifies quote is `ACTIVE` and not expired (`validUntil > now`).
- Creates a downstream `RateReservation` storing the quote's exact `quotedRatePerGram`, `quotedAmount`, and `weightGrams`.
- Sets `Quote.status = "CONSUMED"`, links `Quote.rateReservationId`, records `consumedById` and `consumedAt`.
- If reservation creation fails, the transaction rolls back cleanly; no half-completed state is ever committed.

---

## 11. RateReservation Integration
- Downstream `RateReservation` records the quote's exact quoted rate as `reservedRatePerGram`.
- Subsequent market rate changes or margin changes **never** alter the created `RateReservation`.
- Follows existing V3.3 reservation lifecycle: consumption into deal rate fixing, expiration, or cancellation.

---

## 12. MarketRate Integration
- Directly consumes the canonical `getCurrentMarketRate(metalId, purityId, asOf)` service implemented in V3.4.
- Does not fabricate rates or fall back to arbitrary default values.
- If no active market rate exists, quote calculation fails immediately with a clear business error.

---

## 13. Stock / Settlement / Fulfilment Isolation
- Pure calculation and reference:
  - Quote creation never creates or alters `StockMovement`, `Payment`, `Receipt`, or `Fulfilment`.
  - Quote consumption into `RateReservation` never creates or alters `StockMovement`, `Payment`, `Receipt`, or `Fulfilment`.
- Physical stock movements remain strictly governed by physical delivery fulfilments (V3.2).
- Financial money movements remain strictly governed by actual payments and receipts (V2).

---

## 14. Audit
- Emits structured immutable audit events:
  - `MARGIN_RULE_CREATED` (`action: "CREATE"`, `entityType: "MarginRule"`)
  - `MARGIN_RULE_ACTIVATED` (`action: "ACTIVATE"`, `entityType: "MarginRule"`)
  - `MARGIN_RULE_DEACTIVATED` (`action: "DEACTIVATE"`, `entityType: "MarginRule"`)
  - `QUOTE_CREATED` (`action: "CREATE"`, `entityType: "Quote"`)
  - `QUOTE_CONSUMED` (`action: "UPDATE"`, `entityType: "Quote"`)
  - `QUOTE_CANCELLED` (`action: "CANCEL"`, `entityType: "Quote"`)
- Full state transitions and actor IDs are permanently recorded.

---

## 15. RBAC
- Read access (`calculateQuote`, `getQuoteById`, `getMarginRulesHistory`, `getQuotesReport`) is available to all authenticated users.
- Margin configuration (`createMarginRule`, `toggleMarginRuleActive`) is restricted strictly to `ADMIN`.
- Quote creation and quote consumption are accessible to authorized trading operators (`ADMIN` and `STAFF`).

---

## 16. UI
1. **Margin Management UI**: `/masters/margins` ([margins-client.tsx](file:///c:/Users/srika/OneDrive/Desktop/pawnify/Bullion/src/app/(app)/masters/margins/margins-client.tsx))
   - Metric summary cards: Total Rules, Active Rules, BUY Rules, SELL Rules.
   - "Add Margin Rule" modal with metal/purity pickers, BUY/SELL direction, percentage/fixed margin type, value, effective timestamp, and formula explanation.
   - Filterable configuration and history table with active status toggle and CSV export.
2. **Quote Calculator & Trading Desk UI**: `/quotes` ([quotes-client.tsx](file:///c:/Users/srika/OneDrive/Desktop/pawnify/Bullion/src/app/(app)/quotes/quotes-client.tsx))
   - Interactive quoting calculator with live preview of market benchmark, margin spread, quoted rate per gram, and total proposed amount.
   - "Create & Lock Quote" form with validity period picker.
   - Explicit commercial disclaimer: *"Quote is a calculated commercial reference and is not yet a transaction."*
   - Register of quotes with "Consume → Res" modal and "Cancel" buttons.
3. **Sidebar Navigation**: Added "Quote Calculator" and "Margin Rules" navigation links ([sidebar.tsx](file:///c:/Users/srika/OneDrive/Desktop/pawnify/Bullion/src/components/sidebar.tsx)).

---

## 17. Reports
- **Quotes Report**: `/reports/quotes` ([quotes-report-view.tsx](file:///c:/Users/srika/OneDrive/Desktop/pawnify/Bullion/src/app/(app)/reports/quotes/quotes-report-view.tsx))
  - KPI summary cards: Total Quotes, Active Quotes, Consumed Quotes, Expired/Cancelled Quotes, Total Quoted Value.
  - Multi-parameter filter bar: Date range, Direction, Metal, Purity, Status, and Free-text search.
  - Full audit ledger table with CSV export.
  - Added to Reports navigation bar and Reports hub dashboard.

---

## 18. Concurrency
- `consumeQuote` executes within a Prisma interactive transaction utilizing PostgreSQL row-level locking (`SELECT ... FOR UPDATE`).
- If two users attempt to consume the same quote simultaneously, only the first transaction succeeds; the second receives an explicit error: `"Quote has already been consumed."`
- Margin rule creation prevents concurrent collision on `(metalId, purityId, direction, effectiveFrom)`.

---

## 19. Decimal Precision
- Database precision:
  - `marginValue`: `@db.Decimal(14, 4)`
  - `marginPerGram`: `@db.Decimal(14, 4)`
  - `referenceRatePerGram`: `@db.Decimal(14, 2)`
  - `quotedRatePerGram`: `@db.Decimal(14, 2)`
  - `quotedAmount`: `@db.Decimal(16, 2)`
- All arithmetic uses `Decimal` and standard `Decimal.ROUND_HALF_UP` rounding.

---

## 20. Tests Added
Created unit test suite in [tests/unit/b10-margin-quoting.test.ts](file:///c:/Users/srika/OneDrive/Desktop/pawnify/Bullion/tests/unit/b10-margin-quoting.test.ts) covering 37 comprehensive test specifications:
1. Create BUY margin rule
2. Create SELL margin rule
3. Percentage margin
4. Fixed-per-gram margin
5. BUY subtracts margin
6. SELL adds margin
7. Correct total amount
8. No market rate $\rightarrow$ quote rejected
9. No margin rule $\rightarrow$ quote rejected
10. Wrong direction rule rejected
11. Historical margin rule lookup
12. Effective-time rule selection
13. Future rule not active early
14. Market rate history integration
15. Quote snapshots market rate
16. Quote snapshots margin
17. Market rate changes do not alter quote
18. Margin changes do not alter quote
19. Quote expiration
20. Expired quote cannot be consumed
21. Active quote consumption
22. Quote creates correct RateReservation
23. Reservation stores quoted rate
24. Quote consumption does not alter stock
25. Quote consumption does not alter settlement
26. Quote consumption does not alter fulfilment
27. Concurrent quote consumption
28. Quote cancellation
29. Historical quote immutability
30. Audit events
31. RBAC
32. Decimal precision
33. BUY mathematical case (Market = 12500, BUY margin = 100/g $\rightarrow$ Quote = 12400)
34. SELL mathematical case (Market = 12500, SELL margin = 100/g $\rightarrow$ Quote = 12600)
35. Percentage mathematical case (Market = 12500, BUY 1% $\rightarrow$ 12375; SELL 1% $\rightarrow$ 12625)
36. Fixed margin mathematical case (500g @ 12625 $\rightarrow$ 63,12,500)
37. Schema validations (CreateMarginRuleSchema, CreateQuoteSchema, CalculateQuoteSchema, ConsumeQuoteSchema, CancelQuoteSchema, GetMarginRulesFilterSchema)

---

## 21. Full Regression Results
Ran `npm test -- --run`:
```
Test Files  12 passed (12)
     Tests  294 passed (294)
  Start at  00:35:12
  Duration  1.05s
```
Summary of all 12 passing test suites:
- `tests/unit/b10-margin-quoting.test.ts` (37 tests) — **PASS**
- `tests/unit/b9-market-rate.test.ts` (36 tests) — **PASS**
- `tests/unit/b8-rate-reservation.test.ts` (44 tests) — **PASS**
- `tests/unit/b7-fulfilment.test.ts` (38 tests) — **PASS**
- `tests/unit/b6-rate-fixing.test.ts` (29 tests) — **PASS**
- `tests/unit/b5-financial-settlement.test.ts` (22 tests) — **PASS**
- `tests/unit/b4-hardening.test.ts` (16 tests) — **PASS**
- `tests/unit/b3-reporting.test.ts` (11 tests) — **PASS**
- `tests/unit/b2-operational.test.ts` (16 tests) — **PASS**
- `tests/unit/b1-domain.test.ts` (31 tests) — **PASS**
- `tests/unit/helpers.test.ts` (11 tests) — **PASS**
- `tests/unit/stock-logic.test.ts` (3 tests) — **PASS**

---

## 22. TypeScript
Ran `npm run typecheck`:
```
> bullion@0.1.0 typecheck
> tsc --noEmit
Exit code: 0 (No type errors)
```

---

## 23. ESLint
Ran `npm run lint`:
```
> bullion@0.1.0 lint
> eslint .
Exit code: 0 (0 errors, 30 warnings in test files / seed)
```

---

## 24. Prisma
Ran `npx prisma validate`:
```
Loaded Prisma config from prisma.config.ts.
Prisma schema loaded from prisma\schema.prisma.
The schema at prisma\schema.prisma is valid 🚀
Exit code: 0
```
Database synchronized successfully via `npx prisma db push`.

---

## 25. Production Build
Ran `npm run build`:
```
> bullion@0.1.0 build
> prisma generate && next build

▲ Next.js 16.2.10 (Turbopack)
✓ Compiled successfully in 6.4s
✓ Generating static pages using 15 workers (31/31) in 368ms
Finalizing page optimization ...
Exit code: 0
```
All 31 routes compiled cleanly including `/masters/margins`, `/quotes`, and `/reports/quotes`.

---

## 26. Files Changed
1. `prisma/schema.prisma` — Added `MarginRule`, `Quote`, `QuoteDirection`, `MarginType`, `QuoteStatus`, with indexes and relations on `Metal`, `Purity`, `MarketRate`, `RateReservation`, `user`, and `AuditLog`.
2. `src/lib/services/audit-service.ts` — Added `marginRuleId` and `quoteId` support to `writeAudit`.
3. `src/lib/validations/margin.ts` — Created Zod schemas for margin rule creation and filtering.
4. `src/lib/validations/quote.ts` — Created Zod schemas for quote calculation, creation, consumption, and cancellation.
5. `src/lib/services/margin-service.ts` — Created service logic for margin rule creation, active toggling, and history queries.
6. `src/lib/services/quote-service.ts` — Created service logic for quote calculation, creation, snapshotting, lazy expiration, consumption into `RateReservation`, cancellation, and reporting.
7. `src/lib/actions/margin-actions.ts` — Server actions for margin rule management.
8. `src/lib/actions/quote-actions.ts` — Server actions for quote operations.
9. `src/app/(app)/masters/margins/page.tsx` — Server page for margin management.
10. `src/app/(app)/masters/margins/margins-client.tsx` — Client component for margin management, rule creation modal, and active toggles.
11. `src/app/(app)/quotes/page.tsx` — Server page for the Quoting Engine and Trading Desk.
12. `src/app/(app)/quotes/quotes-client.tsx` — Interactive quote calculator, quote locking, and consumption into reservations.
13. `src/app/(app)/reports/quotes/page.tsx` — Server page for quotes audit report.
14. `src/app/(app)/reports/quotes/quotes-report-view.tsx` — Quotes audit report view with KPI summary metrics and CSV export.
15. `src/components/sidebar.tsx` — Added "Quote Calculator" and "Margin Rules" navigation links.
16. `src/components/reports/reports-nav.tsx` — Added "Quotes" tab to reports navigation.
17. `src/app/(app)/reports/page.tsx` — Added "Commercial Quotes Report (V3.5)" card.
18. `tests/unit/b10-margin-quoting.test.ts` — 37 comprehensive unit tests.

---

## 27. Unresolved Issues
- None. All requirements, mathematical test cases, and constraints are fully implemented, verified, and passing cleanly.
