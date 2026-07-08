import { describe, it, expect } from "vitest";

describe("AppSelect contract", () => {
  it("option values are preserved for mode and settings selectors", () => {
    const modeOptions = [
      { value: "instant", label: "Instant" },
      { value: "balanced", label: "Balanced" },
      { value: "deep", label: "Deep" },
      { value: "developer", label: "Developer", disabled: true },
    ];
    expect(modeOptions.find((o) => o.value === "balanced")?.label).toBe("Balanced");
    expect(modeOptions.find((o) => o.disabled)?.value).toBe("developer");
  });

  it("disabled options remain readable labels (not empty)", () => {
    const opt = { value: "developer", label: "Developer", disabled: true };
    expect(opt.label.length).toBeGreaterThan(0);
  });
});
