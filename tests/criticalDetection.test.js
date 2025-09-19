import { beforeEach, describe, expect, it } from "vitest";
import { buildCriticalSet, detectNewCritical } from "../app.js";

describe("detectNewCritical", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  it("identifies naujus SLA ir valymo įrašus", () => {
    const previous = buildCriticalSet([
      { order: 0, lova: "101", galutine: "🟩 Sutvarkyta", sla: "⚪ Laukia (≤ SLA)" },
    ]);
    const { newOnes } = detectNewCritical(previous, [
      { order: 0, lova: "101", galutine: "🧹 Reikia sutvarkyti", sla: "⚪ Laukia (≤ SLA)" },
      { order: 1, lova: "102", galutine: "🚫 Užimta", sla: "⛔ Viršyta" },
    ]);
    expect(newOnes).toContain("cleaning|101");
    expect(newOnes).toContain("sla|102");
  });

  it("nežymi pasikartojančių kritinių būsenų", () => {
    const previous = new Set(["cleaning|101", "sla|row-2"]);
    const { newOnes } = detectNewCritical(previous, [
      { order: 0, lova: "101", galutine: "🧹 Reikia sutvarkyti", sla: "" },
      { order: 2, lova: "", galutine: "", sla: "⛔ Viršyta" },
    ]);
    expect(newOnes).toHaveLength(0);
  });

  it("naudoja eilės indeksą, kai trūksta lovos kodo", () => {
    const { newOnes } = detectNewCritical(new Set(), [
      { order: 5, lova: "", galutine: "🧹 Reikia sutvarkyti", sla: "" },
      { order: 6, galutine: "", sla: "⛔ Viršyta" },
    ]);
    expect(newOnes).toContain("cleaning|row-5");
    expect(newOnes).toContain("sla|row-6");
  });
});
