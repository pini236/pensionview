import { describe, it, expect } from "vitest";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";

describe("formatCurrency", () => {
  it("formats a positive amount with shekel sign and thousands separator", () => {
    const result = formatCurrency(962767);
    expect(result).toContain("962,767");
    expect(result).toContain("\u20AA"); // ₪
  });

  it("formats a negative amount", () => {
    const result = formatCurrency(-5000);
    expect(result).toContain("-");
  });

  it("formats zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("\u20AA");
    expect(result).toContain("0");
  });
});

describe("formatPercent", () => {
  it("formats a positive percentage", () => {
    const result = formatPercent(1.3);
    expect(result).toContain("1.3");
    expect(result).toContain("%");
  });

  it("formats a negative percentage", () => {
    const result = formatPercent(-0.97);
    expect(result).toContain("-");
    expect(result).toContain("0.97");
  });
});

describe("formatDate", () => {
  it("returns a truthy string for a valid date", () => {
    const result = formatDate("2025-03-15");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });
});
