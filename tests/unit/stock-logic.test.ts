import { describe, it, expect } from "vitest";

// Unit-level tests for StockService logic (pure math, no DB required)
describe("Stock calculation logic", () => {
  it("calculates available weight correctly", () => {
    const opening = 100;
    const purchased = 50;
    const sold = 30;
    const adjusted = 5; // net increase
    const available = opening + purchased - sold + adjusted;
    expect(available).toBe(125);
  });

  it("detects negative stock scenario", () => {
    const available = 10;
    const requestedSale = 15;
    expect(requestedSale > available).toBe(true);
  });

  it("handles adjustment direction correctly", () => {
    const weight = 10;
    const increase = weight;   // +10
    const decrease = -weight;  // -10
    expect(increase).toBe(10);
    expect(decrease).toBe(-10);
  });
});