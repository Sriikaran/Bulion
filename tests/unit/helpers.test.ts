import { describe, it, expect } from "vitest";
import { cn, formatCurrency, formatGrams, formatDate } from "@/lib/utils/helpers";

describe("cn (class merger)", () => {
  it("merges classes correctly", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("resolves Tailwind conflicts", () => {
    const result = cn("px-4", "px-8");
    expect(result).toBe("px-8");
  });
});

describe("formatCurrency", () => {
  it("formats positive number as INR", () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain("1,234.56");
  });

  it("handles zero", () => {
    expect(formatCurrency(0)).toContain("0.00");
  });

  it("handles null/undefined gracefully", () => {
    expect(() => formatCurrency(null)).not.toThrow();
    expect(() => formatCurrency(undefined)).not.toThrow();
  });
});

describe("formatGrams", () => {
  it("formats with 4 decimal places", () => {
    expect(formatGrams(100)).toBe("100.0000 g");
  });

  it("handles fractional grams", () => {
    expect(formatGrams(10.5678)).toBe("10.5678 g");
  });
});

describe("formatDate", () => {
  it("returns dash for null", () => {
    expect(formatDate(null)).toBe("-");
  });

  it("formats a valid date", () => {
    const result = formatDate(new Date("2024-01-15"));
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});

describe("serializeForClient", () => {
  it("converts Decimal instances to strings", async () => {
    const { serializeForClient } = await import("@/lib/utils/serialize");
    const Decimal = (await import("decimal.js")).default;
    const input = {
      id: "123",
      amount: new Decimal("500.25"),
      nested: {
        rate: new Decimal("5000.00"),
      },
    };
    const serialized = serializeForClient(input);
    expect(serialized.amount).toBe("500.25");
    expect(serialized.nested.rate).toBe("5000");
    expect(typeof serialized.amount).toBe("string");
  });

  it("handles null and undefined gracefully", async () => {
    const { serializeForClient } = await import("@/lib/utils/serialize");
    expect(serializeForClient(null)).toBeNull();
    expect(serializeForClient(undefined)).toBeUndefined();
  });
});