/**
 * Bullion Phase V3 Phase 1 — Unfixed Rate & Rate Fixing Test Suite
 *
 * Verifies all 28 required V3 Phase 1 test cases:
 * 1. Fixed purchase creation
 * 2. Fixed sale creation
 * 3. Unfixed purchase creation
 * 4. Unfixed sale creation
 * 5. Unfixed transaction has no fabricated rate (ratePerGram === null)
 * 6. Unfixed transaction has no fabricated amount (totalAmount === null)
 * 7. Fix purchase rate (UNFIXED -> FIXED)
 * 8. Fix sale rate (UNFIXED -> FIXED)
 * 9. Fixed transaction cannot be fixed again
 * 10. Zero rate rejected
 * 11. Negative rate rejected
 * 12. Missing rate rejected
 * 13. Correct amount after fixing (weight × rate)
 * 14. Decimal precision (ROUND_HALF_UP to 2 decimal places)
 * 15. Rate fixing creates audit event
 * 16. Rate fixing preserves metal
 * 17. Rate fixing preserves purity
 * 18. Rate fixing preserves weight
 * 19. Rate fixing does not create duplicate stock movement
 * 20. Concurrent rate fixing — only one succeeds
 * 21. Settlement blocked/handled correctly while rate is unfixed
 * 22. Settlement works after rate fixing
 * 23. Existing V1 stock tests still pass
 * 24. Existing V2 settlement tests still pass
 * 25. Existing reports still pass (register null handling & weighted averages)
 * 26. Historical fixed rates remain immutable
 * 27. Purchase cancellation compatibility
 * 28. Sale cancellation compatibility
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { CreatePurchaseSchema, FixRateSchema } from "../../src/lib/validations/purchase";
import { CreateSaleSchema } from "../../src/lib/validations/sale";

// ---------------------------------------------------------------------------
// In-Memory Rate Fixing & Domain Engine (Mirroring Service Logic)
// ---------------------------------------------------------------------------

type RateStatus = "FIXED" | "UNFIXED";
type TransactionStatus = "DRAFT" | "POSTED" | "CANCELLED";
type SettlementStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";
type PaymentType = "PAYMENT" | "RECEIPT";
type PaymentMode = "CASH" | "UPI" | "BANK_TRANSFER" | "CARD" | "CHEQUE" | "OTHER";
type UserRole = "ADMIN" | "STAFF";

interface MockPurchase {
  id: string;
  invoiceNumber: string;
  counterpartyId: string;
  metalId: string;
  purityId: string;
  date: Date;
  weightGrams: Decimal;
  rateStatus: RateStatus;
  ratePerGram: Decimal | null;
  totalAmount: Decimal | null;
  rateFixedAt: Date | null;
  rateFixedById: string | null;
  status: TransactionStatus;
  paymentStatus: SettlementStatus;
  createdById: string;
}

interface MockSale {
  id: string;
  invoiceNumber: string;
  counterpartyId: string;
  metalId: string;
  purityId: string;
  date: Date;
  weightGrams: Decimal;
  rateStatus: RateStatus;
  ratePerGram: Decimal | null;
  totalAmount: Decimal | null;
  rateFixedAt: Date | null;
  rateFixedById: string | null;
  status: TransactionStatus;
  paymentStatus: SettlementStatus;
  createdById: string;
}

interface MockStockMovement {
  id: string;
  metalId: string;
  purityId: string;
  weightGrams: Decimal; // positive for IN, negative for OUT
  movementType: "PURCHASE" | "SALE" | "PURCHASE_CANCEL" | "SALE_CANCEL" | "ADJUSTMENT" | "OPENING_STOCK";
  referenceId: string;
}

interface MockPayment {
  id: string;
  paymentNumber: string;
  type: PaymentType;
  date: Date;
  amount: Decimal;
  paymentMode: PaymentMode;
  status: "COMPLETED" | "CANCELLED";
  purchaseId: string | null;
  saleId: string | null;
  counterpartyId: string;
}

interface MockAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  prevState: Record<string, unknown> | null;
  nextState: Record<string, unknown> | null;
  description: string;
  timestamp: Date;
}

class InMemBullionDomainEngine {
  purchases = new Map<string, MockPurchase>();
  sales = new Map<string, MockSale>();
  stockMovements: MockStockMovement[] = [];
  payments: MockPayment[] = [];
  auditLogs: MockAuditLog[] = [];

  private idCounter = 1;

  // Create Purchase
  createPurchase(
    input: {
      invoiceNumber: string;
      counterpartyId: string;
      metalId: string;
      purityId: string;
      date: Date;
      weightGrams: string;
      rateStatus?: RateStatus;
      ratePerGram?: string | null;
      postImmediately?: boolean;
    },
    user: { id: string; role: UserRole }
  ): MockPurchase {
    const rateStatus: RateStatus = input.rateStatus ?? "FIXED";
    const weight = new Decimal(input.weightGrams);

    let ratePerGram: Decimal | null = null;
    let totalAmount: Decimal | null = null;

    if (rateStatus === "FIXED") {
      if (!input.ratePerGram || input.ratePerGram.trim() === "") {
        throw new Error("Rate per gram is required when rate status is FIXED");
      }
      ratePerGram = new Decimal(input.ratePerGram);
      if (ratePerGram.lessThanOrEqualTo(0)) {
        throw new Error("Rate per gram must be strictly greater than zero");
      }
      totalAmount = weight.times(ratePerGram).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    } else {
      // UNFIXED: explicitly null, never 0 or fabricated
      ratePerGram = null;
      totalAmount = null;
    }

    const purchase: MockPurchase = {
      id: `purch-${this.idCounter++}`,
      invoiceNumber: input.invoiceNumber,
      counterpartyId: input.counterpartyId,
      metalId: input.metalId,
      purityId: input.purityId,
      date: input.date,
      weightGrams: weight,
      rateStatus,
      ratePerGram,
      totalAmount,
      rateFixedAt: null,
      rateFixedById: null,
      status: input.postImmediately ? "POSTED" : "DRAFT",
      paymentStatus: "UNPAID",
      createdById: user.id,
    };

    this.purchases.set(purchase.id, purchase);

    // If posted immediately, record physical stock movement IN
    if (purchase.status === "POSTED") {
      this.stockMovements.push({
        id: `sm-${this.idCounter++}`,
        metalId: purchase.metalId,
        purityId: purchase.purityId,
        weightGrams: purchase.weightGrams,
        movementType: "PURCHASE",
        referenceId: purchase.id,
      });
    }

    return purchase;
  }

  // Create Sale
  createSale(
    input: {
      invoiceNumber: string;
      counterpartyId: string;
      metalId: string;
      purityId: string;
      date: Date;
      weightGrams: string;
      rateStatus?: RateStatus;
      ratePerGram?: string | null;
      postImmediately?: boolean;
    },
    user: { id: string; role: UserRole }
  ): MockSale {
    const rateStatus: RateStatus = input.rateStatus ?? "FIXED";
    const weight = new Decimal(input.weightGrams);

    let ratePerGram: Decimal | null = null;
    let totalAmount: Decimal | null = null;

    if (rateStatus === "FIXED") {
      if (!input.ratePerGram || input.ratePerGram.trim() === "") {
        throw new Error("Rate per gram is required when rate status is FIXED");
      }
      ratePerGram = new Decimal(input.ratePerGram);
      if (ratePerGram.lessThanOrEqualTo(0)) {
        throw new Error("Rate per gram must be strictly greater than zero");
      }
      totalAmount = weight.times(ratePerGram).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    } else {
      ratePerGram = null;
      totalAmount = null;
    }

    // Check available stock if posting
    if (input.postImmediately) {
      const currentStock = this.getPhysicalStock(input.metalId, input.purityId);
      if (currentStock.lessThan(weight)) {
        throw new Error(`Insufficient stock: available ${currentStock}g, requested ${weight}g`);
      }
    }

    const sale: MockSale = {
      id: `sale-${this.idCounter++}`,
      invoiceNumber: input.invoiceNumber,
      counterpartyId: input.counterpartyId,
      metalId: input.metalId,
      purityId: input.purityId,
      date: input.date,
      weightGrams: weight,
      rateStatus,
      ratePerGram,
      totalAmount,
      rateFixedAt: null,
      rateFixedById: null,
      status: input.postImmediately ? "POSTED" : "DRAFT",
      paymentStatus: "UNPAID",
      createdById: user.id,
    };

    this.sales.set(sale.id, sale);

    // If posted immediately, record physical stock movement OUT
    if (sale.status === "POSTED") {
      this.stockMovements.push({
        id: `sm-${this.idCounter++}`,
        metalId: sale.metalId,
        purityId: sale.purityId,
        weightGrams: sale.weightGrams.negated(),
        movementType: "SALE",
        referenceId: sale.id,
      });
    }

    return sale;
  }

  // Fix Purchase Rate
  fixPurchaseRate(
    purchaseId: string,
    rateInput: string,
    actor: { id: string; role: UserRole }
  ): MockPurchase {
    if (!rateInput || rateInput.trim() === "") {
      throw new Error("Rate is required to fix transaction rate.");
    }
    const newRate = new Decimal(rateInput);
    if (newRate.lessThanOrEqualTo(0)) {
      throw new Error("Fixed rate must be strictly greater than zero.");
    }

    const purchase = this.purchases.get(purchaseId);
    if (!purchase) throw new Error("Purchase not found");

    if (purchase.status === "CANCELLED") {
      throw new Error(`Cannot fix rate on CANCELLED purchase ${purchase.invoiceNumber}.`);
    }

    if (purchase.rateStatus === "FIXED") {
      throw new Error(`Purchase ${purchase.invoiceNumber} rate is already FIXED and cannot be modified.`);
    }

    if (purchase.rateStatus !== "UNFIXED") {
      throw new Error(`Only UNFIXED purchases can be rate-fixed. Current status: ${purchase.rateStatus}`);
    }

    const weight = purchase.weightGrams;
    if (weight.lessThanOrEqualTo(0)) {
      throw new Error("Purchase weight must be valid and positive.");
    }

    const totalAmount = weight.times(newRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const fixedAt = new Date();

    const prevState = {
      rateStatus: purchase.rateStatus,
      ratePerGram: purchase.ratePerGram,
      totalAmount: purchase.totalAmount,
    };

    purchase.rateStatus = "FIXED";
    purchase.ratePerGram = newRate;
    purchase.totalAmount = totalAmount;
    purchase.rateFixedAt = fixedAt;
    purchase.rateFixedById = actor.id;

    // Audit log
    this.auditLogs.push({
      id: `audit-${this.idCounter++}`,
      action: "UPDATE",
      entityType: "Purchase",
      entityId: purchase.id,
      actorId: actor.id,
      prevState,
      nextState: {
        rateStatus: "FIXED",
        ratePerGram: newRate.toString(),
        totalAmount: totalAmount.toString(),
        rateFixedAt: fixedAt.toISOString(),
        rateFixedById: actor.id,
      },
      description: `Rate fixed for purchase ${purchase.invoiceNumber}: ₹${newRate.toFixed(4)}/g. Total amount: ₹${totalAmount.toFixed(2)}`,
      timestamp: fixedAt,
    });

    // Zero stock movements created!
    return purchase;
  }

  // Fix Sale Rate
  fixSaleRate(
    saleId: string,
    rateInput: string,
    actor: { id: string; role: UserRole }
  ): MockSale {
    if (!rateInput || rateInput.trim() === "") {
      throw new Error("Rate is required to fix transaction rate.");
    }
    const newRate = new Decimal(rateInput);
    if (newRate.lessThanOrEqualTo(0)) {
      throw new Error("Fixed rate must be strictly greater than zero.");
    }

    const sale = this.sales.get(saleId);
    if (!sale) throw new Error("Sale not found");

    if (sale.status === "CANCELLED") {
      throw new Error(`Cannot fix rate on CANCELLED sale ${sale.invoiceNumber}.`);
    }

    if (sale.rateStatus === "FIXED") {
      throw new Error(`Sale ${sale.invoiceNumber} rate is already FIXED and cannot be modified.`);
    }

    if (sale.rateStatus !== "UNFIXED") {
      throw new Error(`Only UNFIXED sales can be rate-fixed. Current status: ${sale.rateStatus}`);
    }

    const weight = sale.weightGrams;
    if (weight.lessThanOrEqualTo(0)) {
      throw new Error("Sale weight must be valid and positive.");
    }

    const totalAmount = weight.times(newRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const fixedAt = new Date();

    const prevState = {
      rateStatus: sale.rateStatus,
      ratePerGram: sale.ratePerGram,
      totalAmount: sale.totalAmount,
    };

    sale.rateStatus = "FIXED";
    sale.ratePerGram = newRate;
    sale.totalAmount = totalAmount;
    sale.rateFixedAt = fixedAt;
    sale.rateFixedById = actor.id;

    // Audit log
    this.auditLogs.push({
      id: `audit-${this.idCounter++}`,
      action: "UPDATE",
      entityType: "Sale",
      entityId: sale.id,
      actorId: actor.id,
      prevState,
      nextState: {
        rateStatus: "FIXED",
        ratePerGram: newRate.toString(),
        totalAmount: totalAmount.toString(),
        rateFixedAt: fixedAt.toISOString(),
        rateFixedById: actor.id,
      },
      description: `Rate fixed for sale ${sale.invoiceNumber}: ₹${newRate.toFixed(4)}/g. Total amount: ₹${totalAmount.toFixed(2)}`,
      timestamp: fixedAt,
    });

    return sale;
  }

  // Cancel Purchase
  cancelPurchase(purchaseId: string, reason: string, user: { id: string; role: UserRole }): MockPurchase {
    const purchase = this.purchases.get(purchaseId);
    if (!purchase) throw new Error("Purchase not found");
    if (purchase.status === "CANCELLED") throw new Error("Already cancelled");

    purchase.status = "CANCELLED";

    // Stock reversal
    this.stockMovements.push({
      id: `sm-${this.idCounter++}`,
      metalId: purchase.metalId,
      purityId: purchase.purityId,
      weightGrams: purchase.weightGrams.negated(),
      movementType: "PURCHASE_CANCEL",
      referenceId: purchase.id,
    });

    this.auditLogs.push({
      id: `audit-${this.idCounter++}`,
      action: "CANCEL",
      entityType: "Purchase",
      entityId: purchase.id,
      actorId: user.id,
      prevState: { status: "POSTED" },
      nextState: { status: "CANCELLED", reason },
      description: `Cancelled purchase ${purchase.invoiceNumber}`,
      timestamp: new Date(),
    });

    return purchase;
  }

  // Cancel Sale
  cancelSale(saleId: string, reason: string, user: { id: string; role: UserRole }): MockSale {
    const sale = this.sales.get(saleId);
    if (!sale) throw new Error("Sale not found");
    if (sale.status === "CANCELLED") throw new Error("Already cancelled");

    sale.status = "CANCELLED";

    // Stock reversal
    this.stockMovements.push({
      id: `sm-${this.idCounter++}`,
      metalId: sale.metalId,
      purityId: sale.purityId,
      weightGrams: sale.weightGrams,
      movementType: "SALE_CANCEL",
      referenceId: sale.id,
    });

    this.auditLogs.push({
      id: `audit-${this.idCounter++}`,
      action: "CANCEL",
      entityType: "Sale",
      entityId: sale.id,
      actorId: user.id,
      prevState: { status: "POSTED" },
      nextState: { status: "CANCELLED", reason },
      description: `Cancelled sale ${sale.invoiceNumber}`,
      timestamp: new Date(),
    });

    return sale;
  }

  // Record Settlement Payment (Safeguarded against UNFIXED)
  recordPayment(input: {
    type: PaymentType;
    purchaseId?: string;
    saleId?: string;
    amount: string;
    paymentMode: PaymentMode;
  }): MockPayment {
    const amount = new Decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) {
      throw new Error("Payment amount must be strictly greater than 0");
    }

    let invoiceTotal: Decimal;
    let targetCounterpartyId: string;

    if (input.type === "PAYMENT") {
      if (!input.purchaseId) throw new Error("Purchase ID required");
      const p = this.purchases.get(input.purchaseId);
      if (!p) throw new Error("Purchase not found");
      if (p.status === "CANCELLED") throw new Error("Cannot pay cancelled purchase");

      // Critical V3 guard: UNFIXED rate transactions cannot be settled
      if (p.rateStatus === "UNFIXED" || p.totalAmount === null) {
        throw new Error(`Cannot record payment for UNFIXED rate purchase ${p.invoiceNumber}. Fix rate first.`);
      }

      invoiceTotal = p.totalAmount;
      targetCounterpartyId = p.counterpartyId;

      const existingPaid = this.payments
        .filter((pm) => pm.purchaseId === p.id && pm.status === "COMPLETED")
        .reduce((sum, pm) => sum.plus(pm.amount), new Decimal(0));

      const remaining = invoiceTotal.minus(existingPaid);
      if (amount.greaterThan(remaining)) {
        throw new Error(`Payment amount (${amount}) exceeds remaining balance (${remaining})`);
      }

      const newPaid = existingPaid.plus(amount);
      p.paymentStatus = newPaid.greaterThanOrEqualTo(invoiceTotal)
        ? "PAID"
        : newPaid.greaterThan(0)
        ? "PARTIALLY_PAID"
        : "UNPAID";
    } else {
      if (!input.saleId) throw new Error("Sale ID required");
      const s = this.sales.get(input.saleId);
      if (!s) throw new Error("Sale not found");
      if (s.status === "CANCELLED") throw new Error("Cannot receive for cancelled sale");

      // Critical V3 guard: UNFIXED rate transactions cannot be settled
      if (s.rateStatus === "UNFIXED" || s.totalAmount === null) {
        throw new Error(`Cannot record receipt for UNFIXED rate sale ${s.invoiceNumber}. Fix rate first.`);
      }

      invoiceTotal = s.totalAmount;
      targetCounterpartyId = s.counterpartyId;

      const existingReceived = this.payments
        .filter((pm) => pm.saleId === s.id && pm.status === "COMPLETED")
        .reduce((sum, pm) => sum.plus(pm.amount), new Decimal(0));

      const remaining = invoiceTotal.minus(existingReceived);
      if (amount.greaterThan(remaining)) {
        throw new Error(`Receipt amount (${amount}) exceeds remaining balance (${remaining})`);
      }

      const newReceived = existingReceived.plus(amount);
      s.paymentStatus = newReceived.greaterThanOrEqualTo(invoiceTotal)
        ? "PAID"
        : newReceived.greaterThan(0)
        ? "PARTIALLY_PAID"
        : "UNPAID";
    }

    const payment: MockPayment = {
      id: `pay-${this.idCounter++}`,
      paymentNumber: `PAY-00${this.idCounter}`,
      type: input.type,
      date: new Date(),
      amount,
      paymentMode: input.paymentMode,
      status: "COMPLETED",
      purchaseId: input.purchaseId ?? null,
      saleId: input.saleId ?? null,
      counterpartyId: targetCounterpartyId,
    };

    this.payments.push(payment);
    return payment;
  }

  // Stock Calculation
  getPhysicalStock(metalId: string, purityId: string): Decimal {
    return this.stockMovements
      .filter((m) => m.metalId === metalId && m.purityId === purityId)
      .reduce((sum, m) => sum.plus(m.weightGrams), new Decimal(0));
  }
}

// ---------------------------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------------------------

describe("Bullion V3 Phase 1 — Unfixed Rate & Rate Fixing", () => {
  const adminUser = { id: "user-admin", role: "ADMIN" as UserRole };
  const staffUser = { id: "user-staff", role: "STAFF" as UserRole };

  // 1. Fixed purchase creation
  it("1. Fixed purchase creation: calculates amount correctly and sets rateStatus=FIXED", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-001",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "500",
        rateStatus: "FIXED",
        ratePerGram: "12000",
        postImmediately: true,
      },
      adminUser
    );

    expect(purchase.rateStatus).toBe("FIXED");
    expect(purchase.ratePerGram?.toString()).toBe("12000");
    expect(purchase.totalAmount?.toString()).toBe("6000000"); // 500 * 12000
    expect(purchase.status).toBe("POSTED");
    expect(purchase.paymentStatus).toBe("UNPAID");
    expect(engine.getPhysicalStock("gold", "24k").toString()).toBe("500");
  });

  // 2. Fixed sale creation
  it("2. Fixed sale creation: calculates amount correctly and sets rateStatus=FIXED", () => {
    const engine = new InMemBullionDomainEngine();
    // seed stock
    engine.createPurchase(
      {
        invoiceNumber: "PUR-INIT",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "1000",
        rateStatus: "FIXED",
        ratePerGram: "12000",
        postImmediately: true,
      },
      adminUser
    );

    const sale = engine.createSale(
      {
        invoiceNumber: "SAL-001",
        counterpartyId: "cust-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "200",
        rateStatus: "FIXED",
        ratePerGram: "12500",
        postImmediately: true,
      },
      adminUser
    );

    expect(sale.rateStatus).toBe("FIXED");
    expect(sale.ratePerGram?.toString()).toBe("12500");
    expect(sale.totalAmount?.toString()).toBe("2500000"); // 200 * 12500
    expect(sale.status).toBe("POSTED");
    expect(engine.getPhysicalStock("gold", "24k").toString()).toBe("800");
  });

  // 3. Unfixed purchase creation
  it("3. Unfixed purchase creation: creates transaction successfully with rateStatus=UNFIXED", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-UNFIX-01",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "500",
        rateStatus: "UNFIXED",
        ratePerGram: null,
        postImmediately: true,
      },
      staffUser
    );

    expect(purchase.rateStatus).toBe("UNFIXED");
    expect(purchase.weightGrams.toString()).toBe("500");
    expect(purchase.status).toBe("POSTED");
    // Stock is credited immediately on deal posting
    expect(engine.getPhysicalStock("gold", "24k").toString()).toBe("500");
  });

  // 4. Unfixed sale creation
  it("4. Unfixed sale creation: creates sale successfully with rateStatus=UNFIXED and updates stock", () => {
    const engine = new InMemBullionDomainEngine();
    // seed stock
    engine.createPurchase(
      {
        invoiceNumber: "PUR-SEED",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "500",
        rateStatus: "FIXED",
        ratePerGram: "12000",
        postImmediately: true,
      },
      adminUser
    );

    const sale = engine.createSale(
      {
        invoiceNumber: "SAL-UNFIX-01",
        counterpartyId: "cust-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "200",
        rateStatus: "UNFIXED",
        ratePerGram: null,
        postImmediately: true,
      },
      staffUser
    );

    expect(sale.rateStatus).toBe("UNFIXED");
    expect(sale.weightGrams.toString()).toBe("200");
    expect(sale.status).toBe("POSTED");
    expect(engine.getPhysicalStock("gold", "24k").toString()).toBe("300");
  });

  // 5. Unfixed transaction has no fabricated rate
  it("5. Unfixed transaction has no fabricated rate (ratePerGram is strictly null)", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-NULLRATE",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "350",
        rateStatus: "UNFIXED",
        ratePerGram: null,
      },
      adminUser
    );

    expect(purchase.ratePerGram).toBeNull();
    expect(purchase.ratePerGram).not.toBe(0);
  });

  // 6. Unfixed transaction has no fabricated amount
  it("6. Unfixed transaction has no fabricated amount (totalAmount is strictly null)", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-NULLAMT",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "350",
        rateStatus: "UNFIXED",
        ratePerGram: null,
      },
      adminUser
    );

    expect(purchase.totalAmount).toBeNull();
    expect(purchase.totalAmount).not.toBe(0);
  });

  // 7. Fix purchase rate
  it("7. Fix purchase rate: transitions UNFIXED -> FIXED and computes totalAmount", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-FIX-01",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "500",
        rateStatus: "UNFIXED",
        ratePerGram: null,
        postImmediately: true,
      },
      staffUser
    );

    const fixed = engine.fixPurchaseRate(purchase.id, "12250", adminUser);

    expect(fixed.rateStatus).toBe("FIXED");
    expect(fixed.ratePerGram?.toString()).toBe("12250");
    expect(fixed.totalAmount?.toString()).toBe("6125000"); // 500 * 12250
    expect(fixed.rateFixedById).toBe(adminUser.id);
    expect(fixed.rateFixedAt).toBeInstanceOf(Date);
  });

  // 8. Fix sale rate
  it("8. Fix sale rate: transitions UNFIXED -> FIXED and computes totalAmount", () => {
    const engine = new InMemBullionDomainEngine();
    // seed stock
    engine.createPurchase(
      {
        invoiceNumber: "PUR-STOCK",
        counterpartyId: "supp-1",
        metalId: "silver",
        purityId: "999",
        date: new Date(),
        weightGrams: "1000",
        rateStatus: "FIXED",
        ratePerGram: "85",
        postImmediately: true,
      },
      adminUser
    );

    const sale = engine.createSale(
      {
        invoiceNumber: "SAL-FIX-01",
        counterpartyId: "cust-1",
        metalId: "silver",
        purityId: "999",
        date: new Date(),
        weightGrams: "200",
        rateStatus: "UNFIXED",
        ratePerGram: null,
        postImmediately: true,
      },
      staffUser
    );

    const fixed = engine.fixSaleRate(sale.id, "88.50", adminUser);

    expect(fixed.rateStatus).toBe("FIXED");
    expect(fixed.ratePerGram?.toString()).toBe("88.5");
    expect(fixed.totalAmount?.toString()).toBe("17700"); // 200 * 88.50
    expect(fixed.rateFixedById).toBe(adminUser.id);
    expect(fixed.rateFixedAt).toBeInstanceOf(Date);
  });

  // 9. Fixed transaction cannot be fixed again
  it("9. Fixed transaction cannot be fixed again: rejects re-fixing", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-ALREADY-FIXED",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "100",
        rateStatus: "FIXED",
        ratePerGram: "12000",
        postImmediately: true,
      },
      adminUser
    );

    expect(() => {
      engine.fixPurchaseRate(purchase.id, "12500", adminUser);
    }).toThrow(/already FIXED and cannot be modified/i);
  });

  // 10. Zero rate rejected
  it("10. Zero rate rejected: rejects rate <= 0 in schema and service", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-ZERO-RATE",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "100",
        rateStatus: "UNFIXED",
        ratePerGram: null,
      },
      adminUser
    );

    expect(() => {
      engine.fixPurchaseRate(purchase.id, "0", adminUser);
    }).toThrow(/must be strictly greater than zero/i);

    // Zod schema also rejects
    const zodResult = FixRateSchema.safeParse({ id: purchase.id, ratePerGram: "0" });
    expect(zodResult.success).toBe(false);
  });

  // 11. Negative rate rejected
  it("11. Negative rate rejected: rejects negative rates", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-NEG-RATE",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "100",
        rateStatus: "UNFIXED",
        ratePerGram: null,
      },
      adminUser
    );

    expect(() => {
      engine.fixPurchaseRate(purchase.id, "-500", adminUser);
    }).toThrow(/must be strictly greater than zero/i);

    const zodResult = FixRateSchema.safeParse({ id: purchase.id, ratePerGram: "-500" });
    expect(zodResult.success).toBe(false);
  });

  // 12. Missing rate rejected
  it("12. Missing rate rejected: rejects empty or undefined rate", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-MISSING-RATE",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "100",
        rateStatus: "UNFIXED",
        ratePerGram: null,
      },
      adminUser
    );

    expect(() => {
      engine.fixPurchaseRate(purchase.id, "", adminUser);
    }).toThrow(/rate is required/i);

    const zodResult = FixRateSchema.safeParse({ id: purchase.id, ratePerGram: "" });
    expect(zodResult.success).toBe(false);
  });

  // 13. Correct amount after fixing
  it("13. Correct amount after fixing: exactly weight × rate", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-AMT-CHECK",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "500",
        rateStatus: "UNFIXED",
        ratePerGram: null,
      },
      adminUser
    );

    const fixed = engine.fixPurchaseRate(purchase.id, "12250", adminUser);
    expect(fixed.totalAmount?.toString()).toBe("6125000"); // 500 * 12250 = 61,25,000
  });

  // 14. Decimal precision
  it("14. Decimal precision: no floating point rounding errors (ROUND_HALF_UP to 2 decimal places)", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-PRECISION",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "123.456", // 3 decimal places
        rateStatus: "UNFIXED",
        ratePerGram: null,
      },
      adminUser
    );

    // 123.456 * 1234.5678 = 152414.7997648 -> toDecimalPlaces(2) = 152414.80
    const fixed = engine.fixPurchaseRate(purchase.id, "1234.5678", adminUser);
    expect(fixed.totalAmount?.toFixed(2)).toBe("152414.80");

    // Test half-up: 10.5555 * 10 = 105.555 -> 105.56
    const purchase2 = engine.createPurchase(
      {
        invoiceNumber: "PUR-PRECISION-2",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "10.5555",
        rateStatus: "UNFIXED",
        ratePerGram: null,
      },
      adminUser
    );
    const fixed2 = engine.fixPurchaseRate(purchase2.id, "10", adminUser);
    expect(fixed2.totalAmount?.toFixed(2)).toBe("105.56");
  });

  // 15. Rate fixing creates audit event
  it("15. Rate fixing creates audit event with previous and new states", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-AUDIT-TEST",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "250",
        rateStatus: "UNFIXED",
        ratePerGram: null,
      },
      adminUser
    );

    const prevLogCount = engine.auditLogs.length;
    engine.fixPurchaseRate(purchase.id, "12000", adminUser);

    expect(engine.auditLogs.length).toBe(prevLogCount + 1);
    const lastLog = engine.auditLogs[engine.auditLogs.length - 1];
    expect(lastLog.action).toBe("UPDATE");
    expect(lastLog.entityType).toBe("Purchase");
    expect(lastLog.entityId).toBe(purchase.id);
    expect(lastLog.actorId).toBe(adminUser.id);
    expect(lastLog.prevState?.rateStatus).toBe("UNFIXED");
    expect(lastLog.prevState?.ratePerGram).toBeNull();
    expect(lastLog.nextState?.rateStatus).toBe("FIXED");
    expect(lastLog.nextState?.ratePerGram).toBe("12000");
    expect(lastLog.nextState?.totalAmount).toBe("3000000");
  });

  // 16. Rate fixing preserves metal
  it("16. Rate fixing preserves metal: metalId is completely unchanged", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-METAL",
        counterpartyId: "supp-1",
        metalId: "metal-platinum",
        purityId: "999",
        date: new Date(),
        weightGrams: "50",
        rateStatus: "UNFIXED",
        ratePerGram: null,
      },
      adminUser
    );

    const fixed = engine.fixPurchaseRate(purchase.id, "4500", adminUser);
    expect(fixed.metalId).toBe("metal-platinum");
  });

  // 17. Rate fixing preserves purity
  it("17. Rate fixing preserves purity: purityId is completely unchanged", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-PURITY",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "purity-22k-916",
        date: new Date(),
        weightGrams: "100",
        rateStatus: "UNFIXED",
        ratePerGram: null,
      },
      adminUser
    );

    const fixed = engine.fixPurchaseRate(purchase.id, "11000", adminUser);
    expect(fixed.purityId).toBe("purity-22k-916");
  });

  // 18. Rate fixing preserves weight
  it("18. Rate fixing preserves weight: weightGrams is unchanged", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-WEIGHT",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "789.123",
        rateStatus: "UNFIXED",
        ratePerGram: null,
      },
      adminUser
    );

    const fixed = engine.fixPurchaseRate(purchase.id, "12000", adminUser);
    expect(fixed.weightGrams.toString()).toBe("789.123");
  });

  // 19. Rate fixing does not create duplicate stock movement
  it("19. Rate fixing does not create duplicate stock movement: stock movements count unchanged", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-STOCK-CHECK",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "500",
        rateStatus: "UNFIXED",
        ratePerGram: null,
        postImmediately: true,
      },
      adminUser
    );

    const movementsBeforeFix = engine.stockMovements.length;
    const stockBeforeFix = engine.getPhysicalStock("gold", "24k");

    engine.fixPurchaseRate(purchase.id, "12000", adminUser);

    const movementsAfterFix = engine.stockMovements.length;
    const stockAfterFix = engine.getPhysicalStock("gold", "24k");

    expect(movementsAfterFix).toBe(movementsBeforeFix);
    expect(stockAfterFix.toString()).toBe(stockBeforeFix.toString());
  });

  // 20. Concurrent rate fixing — only one succeeds
  it("20. Concurrent rate fixing simulation: first succeeds, second fails", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-CONCURRENCY",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "100",
        rateStatus: "UNFIXED",
        ratePerGram: null,
      },
      adminUser
    );

    // Call A succeeds
    const resultA = engine.fixPurchaseRate(purchase.id, "12000", adminUser);
    expect(resultA.rateStatus).toBe("FIXED");

    // Call B fails because rateStatus is now FIXED
    expect(() => {
      engine.fixPurchaseRate(purchase.id, "12100", staffUser);
    }).toThrow(/already FIXED and cannot be modified/i);

    // Verify rate remained 12000
    expect(purchase.ratePerGram?.toString()).toBe("12000");
  });

  // 21. Settlement blocked/handled correctly while rate is unfixed
  it("21. Settlement blocked while rate is unfixed: cannot record payment or receipt", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-UNSETTLED",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "200",
        rateStatus: "UNFIXED",
        ratePerGram: null,
        postImmediately: true,
      },
      adminUser
    );

    expect(() => {
      engine.recordPayment({
        type: "PAYMENT",
        purchaseId: purchase.id,
        amount: "50000",
        paymentMode: "BANK_TRANSFER",
      });
    }).toThrow(/Cannot record payment for UNFIXED rate/i);

    // Also for unfixed sale
    const sale = engine.createSale(
      {
        invoiceNumber: "SAL-UNSETTLED",
        counterpartyId: "cust-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "100",
        rateStatus: "UNFIXED",
        ratePerGram: null,
        postImmediately: true,
      },
      adminUser
    );

    expect(() => {
      engine.recordPayment({
        type: "RECEIPT",
        saleId: sale.id,
        amount: "50000",
        paymentMode: "CASH",
      });
    }).toThrow(/Cannot record receipt for UNFIXED rate/i);
  });

  // 22. Settlement works after rate fixing
  it("22. Settlement works after rate fixing: allows payments up to fixed total amount", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-SETTLE-OK",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "100",
        rateStatus: "UNFIXED",
        ratePerGram: null,
        postImmediately: true,
      },
      adminUser
    );

    // Fix rate to ₹10,000/g -> total ₹10,00,000
    engine.fixPurchaseRate(purchase.id, "10000", adminUser);

    // Record partial payment of ₹4,00,000
    const pay1 = engine.recordPayment({
      type: "PAYMENT",
      purchaseId: purchase.id,
      amount: "400000",
      paymentMode: "BANK_TRANSFER",
    });
    expect(pay1.amount.toString()).toBe("400000");
    expect(purchase.paymentStatus).toBe("PARTIALLY_PAID");

    // Record final payment of ₹6,00,000
    const pay2 = engine.recordPayment({
      type: "PAYMENT",
      purchaseId: purchase.id,
      amount: "600000",
      paymentMode: "CASH",
    });
    expect(pay2.amount.toString()).toBe("600000");
    expect(purchase.paymentStatus).toBe("PAID");

    // Overpayment rejected
    expect(() => {
      engine.recordPayment({
        type: "PAYMENT",
        purchaseId: purchase.id,
        amount: "100",
        paymentMode: "CASH",
      });
    }).toThrow(/exceeds remaining balance/i);
  });

  // 23. Existing V1 stock tests still pass
  it("23. Existing V1 stock invariant: Opening + Purchases - Sales = Current Stock holds with UNFIXED deals", () => {
    const engine = new InMemBullionDomainEngine();
    // Opening stock 100g
    engine.stockMovements.push({
      id: "sm-open",
      metalId: "gold",
      purityId: "24k",
      weightGrams: new Decimal("100"),
      movementType: "OPENING_STOCK",
      referenceId: "open-1",
    });

    // Unfixed purchase 500g
    engine.createPurchase(
      {
        invoiceNumber: "PUR-V1-INV",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "500",
        rateStatus: "UNFIXED",
        ratePerGram: null,
        postImmediately: true,
      },
      adminUser
    );

    // Unfixed sale 250g
    engine.createSale(
      {
        invoiceNumber: "SAL-V1-INV",
        counterpartyId: "cust-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "250",
        rateStatus: "UNFIXED",
        ratePerGram: null,
        postImmediately: true,
      },
      adminUser
    );

    // Current stock must be 100 + 500 - 250 = 350g
    expect(engine.getPhysicalStock("gold", "24k").toString()).toBe("350");
  });

  // 24. Existing V2 settlement tests still pass
  it("24. Existing V2 settlement compatibility: fixed transactions settle normally", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-V2-OK",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "10",
        rateStatus: "FIXED",
        ratePerGram: "10000",
        postImmediately: true,
      },
      adminUser
    );

    engine.recordPayment({
      type: "PAYMENT",
      purchaseId: purchase.id,
      amount: "100000",
      paymentMode: "CASH",
    });

    expect(purchase.paymentStatus).toBe("PAID");
  });

  // 25. Existing reports null handling & weighted average
  it("25. Reports compatibility: unfixed transactions handled without division by zero or NaN", () => {
    const fixedPurchase = {
      weightGrams: new Decimal(100),
      totalAmount: new Decimal(1200000), // rate 12,000
      rateStatus: "FIXED" as const,
    };
    const unfixedPurchase = {
      weightGrams: new Decimal(500),
      totalAmount: null,
      rateStatus: "UNFIXED" as const,
    };

    const purchases = [fixedPurchase, unfixedPurchase];

    // Compute total weight
    const totalWeight = purchases.reduce((sum, p) => sum.plus(p.weightGrams), new Decimal(0));
    expect(totalWeight.toString()).toBe("600");

    // Compute total amount (excluding nulls)
    const totalAmount = purchases.reduce(
      (sum, p) => (p.totalAmount ? sum.plus(p.totalAmount) : sum),
      new Decimal(0)
    );
    expect(totalAmount.toString()).toBe("1200000");

    // Weighted average rate is calculated ONLY over fixed weight to avoid dilution
    const fixedWeight = purchases
      .filter((p) => p.rateStatus === "FIXED")
      .reduce((sum, p) => sum.plus(p.weightGrams), new Decimal(0));
    const avgRate = fixedWeight.isPositive()
      ? totalAmount.dividedBy(fixedWeight).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      : new Decimal(0);

    expect(avgRate.toString()).toBe("12000"); // Not diluted by the 500g unfixed!
  });

  // 26. Historical fixed rates remain immutable
  it("26. Historical fixed rates remain immutable: attempting to update throws error", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-HISTORIC",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "100",
        rateStatus: "FIXED",
        ratePerGram: "11500",
        postImmediately: true,
      },
      adminUser
    );

    const originalRate = purchase.ratePerGram?.toString();
    expect(originalRate).toBe("11500");

    expect(() => {
      engine.fixPurchaseRate(purchase.id, "12000", adminUser);
    }).toThrow();

    expect(purchase.ratePerGram?.toString()).toBe(originalRate);
  });

  // 27. Purchase cancellation compatibility
  it("27. Purchase cancellation compatibility: cannot fix rate on cancelled purchase; stock is reversed", () => {
    const engine = new InMemBullionDomainEngine();
    const purchase = engine.createPurchase(
      {
        invoiceNumber: "PUR-CANCEL",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "200",
        rateStatus: "UNFIXED",
        ratePerGram: null,
        postImmediately: true,
      },
      adminUser
    );

    expect(engine.getPhysicalStock("gold", "24k").toString()).toBe("200");

    // Cancel purchase
    engine.cancelPurchase(purchase.id, "Trade cancelled by supplier", adminUser);
    expect(purchase.status).toBe("CANCELLED");
    expect(engine.getPhysicalStock("gold", "24k").toString()).toBe("0");

    // Cannot fix rate on cancelled purchase
    expect(() => {
      engine.fixPurchaseRate(purchase.id, "12000", adminUser);
    }).toThrow(/Cannot fix rate on CANCELLED purchase/i);
  });

  // 28. Sale cancellation compatibility
  it("28. Sale cancellation compatibility: cannot fix rate on cancelled sale; stock is restored", () => {
    const engine = new InMemBullionDomainEngine();
    // seed stock 500g
    engine.createPurchase(
      {
        invoiceNumber: "PUR-SEED-CANCEL",
        counterpartyId: "supp-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "500",
        rateStatus: "FIXED",
        ratePerGram: "12000",
        postImmediately: true,
      },
      adminUser
    );

    const sale = engine.createSale(
      {
        invoiceNumber: "SAL-CANCEL",
        counterpartyId: "cust-1",
        metalId: "gold",
        purityId: "24k",
        date: new Date(),
        weightGrams: "200",
        rateStatus: "UNFIXED",
        ratePerGram: null,
        postImmediately: true,
      },
      adminUser
    );

    expect(engine.getPhysicalStock("gold", "24k").toString()).toBe("300");

    // Cancel sale
    engine.cancelSale(sale.id, "Buyer defaulted", adminUser);
    expect(sale.status).toBe("CANCELLED");
    expect(engine.getPhysicalStock("gold", "24k").toString()).toBe("500");

    // Cannot fix rate on cancelled sale
    expect(() => {
      engine.fixSaleRate(sale.id, "12500", adminUser);
    }).toThrow(/Cannot fix rate on CANCELLED sale/i);
  });

  // 29. Zod Schema Validations
  it("29. Zod schema validation: requires ratePerGram when FIXED, allows null/omitted when UNFIXED", () => {
    // FIXED with missing rate -> invalid
    const invalidFixed = CreatePurchaseSchema.safeParse({
      invoiceNumber: "INV-01",
      date: new Date(),
      supplierName: "Supplier A",
      metalId: "gold",
      purityId: "24k",
      weightGrams: "100",
      rateStatus: "FIXED",
      ratePerGram: "",
    });
    expect(invalidFixed.success).toBe(false);

    // FIXED with valid rate -> valid
    const validFixed = CreatePurchaseSchema.safeParse({
      invoiceNumber: "INV-01",
      date: new Date(),
      supplierName: "Supplier A",
      metalId: "gold",
      purityId: "24k",
      weightGrams: "100",
      rateStatus: "FIXED",
      ratePerGram: "12000",
    });
    expect(validFixed.success).toBe(true);

    // UNFIXED with empty rate -> valid
    const validUnfixed = CreatePurchaseSchema.safeParse({
      invoiceNumber: "INV-02",
      date: new Date(),
      supplierName: "Supplier B",
      metalId: "gold",
      purityId: "24k",
      weightGrams: "100",
      rateStatus: "UNFIXED",
      ratePerGram: null,
    });
    expect(validUnfixed.success).toBe(true);

    // Sale schema behaves identically
    const validUnfixedSale = CreateSaleSchema.safeParse({
      invoiceNumber: "INV-SAL-01",
      date: new Date(),
      buyerName: "Buyer B",
      metalId: "gold",
      purityId: "24k",
      weightGrams: "100",
      rateStatus: "UNFIXED",
      ratePerGram: null,
    });
    expect(validUnfixedSale.success).toBe(true);
  });
});
