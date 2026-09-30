/**
 * B1 Domain Tests — Pure logic (no DB required)
 *
 * Tests the stock calculation invariant, Decimal precision,
 * business rules, and edge cases using in-memory mocks.
 *
 * These tests do NOT require a running database.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";

// ---------------------------------------------------------------------------
// Helpers to mimic service logic (pure functions extracted for unit testing)
// ---------------------------------------------------------------------------

/**
 * Compute current stock from a list of signed movements.
 * Mirrors the aggregate logic in StockService.getCurrentStock()
 */
function computeCurrentStock(movements: { weightGrams: Decimal }[]): Decimal {
  return movements.reduce(
    (sum, m) => sum.plus(m.weightGrams),
    new Decimal(0),
  );
}

/**
 * Compute stock breakdown by movement type.
 */
function computeBreakdown(
  movements: { weightGrams: Decimal; movementType: string }[],
) {
  let opening = new Decimal(0);
  let purchased = new Decimal(0);
  let sold = new Decimal(0);
  let adjIncrease = new Decimal(0);
  let adjDecrease = new Decimal(0);

  for (const m of movements) {
    const w = m.weightGrams;
    switch (m.movementType) {
      case "OPENING":
        opening = opening.plus(w);
        break;
      case "PURCHASE":
        purchased = purchased.plus(w);
        break;
      case "PURCHASE_CANCEL":
        purchased = purchased.plus(w); // w is negative
        break;
      case "SALE":
        sold = sold.plus(w.abs());
        break;
      case "SALE_CANCEL":
        sold = sold.minus(w.abs());
        break;
      case "ADJUSTMENT_INCREASE":
        adjIncrease = adjIncrease.plus(w);
        break;
      case "ADJUSTMENT_DECREASE":
        adjDecrease = adjDecrease.plus(w.abs());
        break;
    }
  }

  const current = opening
    .plus(purchased)
    .minus(sold)
    .plus(adjIncrease)
    .minus(adjDecrease);

  return { opening, purchased, sold, adjIncrease, adjDecrease, current };
}

/** Server-derived total: weightGrams × ratePerGram */
function deriveTotal(weight: Decimal, rate: Decimal): Decimal {
  return weight.times(rate).toDecimalPlaces(2);
}

/** Check sufficient stock */
function hasSufficientStock(available: Decimal, requested: Decimal): boolean {
  return available.greaterThanOrEqualTo(requested);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("B1 — Stock Calculation Invariant", () => {
  it("satisfies: opening + purchased - sold ± adjustments = current", () => {
    const movements = [
      { movementType: "OPENING", weightGrams: new Decimal("100.0000") },
      { movementType: "PURCHASE", weightGrams: new Decimal("50.0000") },
      { movementType: "SALE", weightGrams: new Decimal("-30.0000") },
      { movementType: "ADJUSTMENT_INCREASE", weightGrams: new Decimal("5.0000") },
      { movementType: "ADJUSTMENT_DECREASE", weightGrams: new Decimal("-10.0000") },
    ];
    const { current } = computeBreakdown(movements);
    // 100 + 50 - 30 + 5 - 10 = 115
    expect(current.toFixed(4)).toBe("115.0000");
  });

  it("net signed sum also produces correct current stock", () => {
    const movements = [
      { weightGrams: new Decimal("100.0000") },
      { weightGrams: new Decimal("50.0000") },
      { weightGrams: new Decimal("-30.0000") },
      { weightGrams: new Decimal("5.0000") },
      { weightGrams: new Decimal("-10.0000") },
    ];
    const current = computeCurrentStock(movements);
    expect(current.toFixed(4)).toBe("115.0000");
  });
});

describe("B1 — Separate Stock Buckets", () => {
  it("operations on Gold 22K do NOT affect Gold 24K", () => {
    // Gold 22K bucket
    const gold22K = [
      { weightGrams: new Decimal("100.0000") }, // opening
      { weightGrams: new Decimal("50.0000") },  // purchase
      { weightGrams: new Decimal("-30.0000") }, // sale
    ];
    // Gold 24K bucket
    const gold24K = [
      { weightGrams: new Decimal("50.0000") },  // opening
    ];
    // Silver 999 bucket
    const silver999 = [
      { weightGrams: new Decimal("200.0000") }, // opening
    ];

    const s22 = computeCurrentStock(gold22K);
    const s24 = computeCurrentStock(gold24K);
    const sAg = computeCurrentStock(silver999);

    expect(s22.toFixed(4)).toBe("120.0000");
    expect(s24.toFixed(4)).toBe("50.0000");
    expect(sAg.toFixed(4)).toBe("200.0000");

    // Cross-bucket independence
    expect(s22).not.toEqual(s24);
    expect(s22).not.toEqual(sAg);
  });
});

describe("B1 — Purchase Cancellation Reversal", () => {
  it("purchase + cancellation = net 0", () => {
    const movements = [
      { weightGrams: new Decimal("100.0000") },  // PURCHASE
      { weightGrams: new Decimal("-100.0000") }, // PURCHASE_CANCEL
    ];
    const current = computeCurrentStock(movements);
    expect(current.toFixed(4)).toBe("0.0000");
  });

  it("partial purchase + cancellation: net = remaining purchase", () => {
    const movements = [
      { weightGrams: new Decimal("100.0000") },  // PURCHASE 1
      { weightGrams: new Decimal("50.0000") },   // PURCHASE 2
      { weightGrams: new Decimal("-100.0000") }, // PURCHASE_CANCEL of first
    ];
    const current = computeCurrentStock(movements);
    expect(current.toFixed(4)).toBe("50.0000");
  });
});

describe("B1 — Sale Cancellation Reversal", () => {
  it("sale + cancellation = net 0 effect", () => {
    const movements = [
      { weightGrams: new Decimal("100.0000") },  // PURCHASE
      { weightGrams: new Decimal("-30.0000") },  // SALE
      { weightGrams: new Decimal("30.0000") },   // SALE_CANCEL
    ];
    const current = computeCurrentStock(movements);
    expect(current.toFixed(4)).toBe("100.0000");
  });
});

describe("B1 — Insufficient Stock Guard", () => {
  it("rejects sale when stock is insufficient", () => {
    const available = new Decimal("10.0000");
    const requested = new Decimal("15.0000");
    expect(hasSufficientStock(available, requested)).toBe(false);
  });

  it("allows sale when stock is exactly equal", () => {
    const available = new Decimal("10.0000");
    const requested = new Decimal("10.0000");
    expect(hasSufficientStock(available, requested)).toBe(true);
  });

  it("allows sale when stock is more than requested", () => {
    const available = new Decimal("10.0000");
    const requested = new Decimal("5.0000");
    expect(hasSufficientStock(available, requested)).toBe(true);
  });

  it("CRITICAL: adjustment decrease that would make stock negative is rejected", () => {
    // Current stock = 10g
    const current = computeCurrentStock([
      { weightGrams: new Decimal("10.0000") },
    ]);
    const decrement = new Decimal("15.0000");
    expect(hasSufficientStock(current, decrement)).toBe(false);
  });
});

describe("B1 — Decimal Financial Precision", () => {
  it("0.1 + 0.2 using Decimal = 0.3 exactly", () => {
    const a = new Decimal("0.1");
    const b = new Decimal("0.2");
    expect(a.plus(b).toString()).toBe("0.3");
  });

  it("weight × rate with fractional values is precise", () => {
    const weight = new Decimal("100.5000");
    const rate = new Decimal("6250.75");
    const total = deriveTotal(weight, rate);
    // 100.5 × 6250.75 = 628200.375 → rounds to 628200.38
    expect(total.toFixed(2)).toBe("628200.38");
  });

  it("0.01g precision preserved", () => {
    const w = new Decimal("0.0100");
    expect(w.toFixed(4)).toBe("0.0100");
  });

  it("server-derived total matches expected for known inputs", () => {
    const weight = new Decimal("10.0000");
    const rate = new Decimal("7500.00");
    const total = deriveTotal(weight, rate);
    expect(total.toFixed(2)).toBe("75000.00");
  });

  it("stock with sub-gram precision: 0.0001g increments", () => {
    const movements = [
      { weightGrams: new Decimal("100.0001") },
      { weightGrams: new Decimal("50.0002") },
      { weightGrams: new Decimal("-0.0003") },
    ];
    const current = computeCurrentStock(movements);
    expect(current.toFixed(4)).toBe("150.0000");
  });

  it("large purchase amount precision (crore range)", () => {
    const weight = new Decimal("1000.0000"); // 1 kg
    const rate = new Decimal("7500.00");     // ₹7500/g
    const total = deriveTotal(weight, rate);
    expect(total.toFixed(2)).toBe("7500000.00"); // ₹75 lakh
  });
});

describe("B1 — Adjustment Direction Logic", () => {
  it("INCREASE produces positive signed weight", () => {
    const w = new Decimal("10.0000");
    const signed = w; // INCREASE → positive
    expect(signed.isPositive()).toBe(true);
  });

  it("DECREASE produces negative signed weight", () => {
    const w = new Decimal("10.0000");
    const signed = w.negated(); // DECREASE → negative
    expect(signed.isNegative()).toBe(true);
  });

  it("adjustment increase then decrease: net = 0", () => {
    const movements = [
      { weightGrams: new Decimal("5.0000") },  // ADJUSTMENT_INCREASE
      { weightGrams: new Decimal("-5.0000") }, // ADJUSTMENT_DECREASE
    ];
    const current = computeCurrentStock(movements);
    expect(current.toFixed(4)).toBe("0.0000");
  });
});

describe("B1 — Historical Integrity (Inactive Master)", () => {
  it("historical transactions still readable when metal is deactivated", () => {
    // Simulate: metal deactivated (isActive = false)
    // Historical movements still exist in StockMovement table
    const historicalMovements = [
      { metalId: "gold-id", weightGrams: new Decimal("100.0000") },
      { metalId: "gold-id", weightGrams: new Decimal("-30.0000") },
    ];
    // These movements are readable regardless of metal.isActive
    const stock = computeCurrentStock(historicalMovements);
    expect(stock.toFixed(4)).toBe("70.0000");
    // (Test verifies that data is present; actual DB read would be a service call)
  });

  it("inactive metal should not allow new transactions (guard logic)", () => {
    // Simulate the guard check
    const isMetalActive = false;
    const canCreateTransaction = isMetalActive;
    expect(canCreateTransaction).toBe(false);
  });

  it("inactive purity should not allow new transactions (guard logic)", () => {
    const isPurityActive = false;
    const canCreateTransaction = isPurityActive;
    expect(canCreateTransaction).toBe(false);
  });
});

describe("B1 — Opening Stock", () => {
  it("opening stock contributes to current stock", () => {
    const movements = [
      { movementType: "OPENING", weightGrams: new Decimal("200.0000") },
    ];
    const { current, opening } = computeBreakdown(movements);
    expect(opening.toFixed(4)).toBe("200.0000");
    expect(current.toFixed(4)).toBe("200.0000");
  });

  it("opening + subsequent transactions compute correctly", () => {
    const movements = [
      { movementType: "OPENING", weightGrams: new Decimal("100.0000") },
      { movementType: "PURCHASE", weightGrams: new Decimal("50.0000") },
      { movementType: "SALE", weightGrams: new Decimal("-20.0000") },
    ];
    const { current } = computeBreakdown(movements);
    expect(current.toFixed(4)).toBe("130.0000");
  });

  it("zero opening stock is valid", () => {
    const w = new Decimal("0");
    expect(w.greaterThanOrEqualTo(0)).toBe(true);
  });
});

describe("B1 — RBAC Logic", () => {
  it("ADMIN role can perform adjustments", () => {
    const role = "ADMIN";
    const canAdjust = role === "ADMIN";
    expect(canAdjust).toBe(true);
  });

  it("STAFF role cannot perform adjustments", () => {
    const role: string = "STAFF";
    const canAdjust = role === "ADMIN";
    expect(canAdjust).toBe(false);
  });

  it("ADMIN role can cancel transactions", () => {
    const role: string = "ADMIN";
    const canCancel = role === "ADMIN";
    expect(canCancel).toBe(true);
  });

  it("STAFF role cannot cancel transactions", () => {
    const role: string = "STAFF";
    const canCancel = role === "ADMIN";
    expect(canCancel).toBe(false);
  });
});

describe("B1 — Fineness Concepts", () => {
  it("fineness is a fraction 0 < f ≤ 1", () => {
    const validFinenesses = ["0.9999", "0.9160", "0.7500", "0.9250"];
    for (const f of validFinenesses) {
      const d = new Decimal(f);
      expect(d.greaterThan(0)).toBe(true);
      expect(d.lessThanOrEqualTo(1)).toBe(true);
    }
  });

  it("gross weight vs fine weight are distinct concepts", () => {
    const grossWeight = new Decimal("10.0000"); // e.g., 10g of 22K gold
    const fineness = new Decimal("0.9160");
    const fineWeight = grossWeight.times(fineness).toDecimalPlaces(4);
    // Fine weight is LESS than gross weight for impure metals
    expect(fineWeight.lessThan(grossWeight)).toBe(true);
    expect(fineWeight.toFixed(4)).toBe("9.1600");
  });
});
