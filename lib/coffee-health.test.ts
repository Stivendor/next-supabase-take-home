import { describe, expect, it } from "vitest";
import { parseSearchParams, toHref, toSearchParams } from "./coffee-health";

describe("parseSearchParams", () => {
  it("reads multi-select, ranges and cursor", () => {
    const { filters, cursor } = parseSearchParams({
      country: ["Japan", "South Korea"],
      stress_level: "High",
      age_min: "20",
      bmi_max: "24.5",
      after: "150",
    });
    expect(filters.country).toEqual(["Japan", "South Korea"]);
    expect(filters.stress_level).toEqual(["High"]);
    expect(filters.gender).toEqual([]);
    expect(filters.age).toEqual({ min: 20, max: undefined });
    expect(filters.bmi).toEqual({ min: undefined, max: 24.5 });
    expect(cursor).toEqual({ after: 150 });
  });

  it("drops invalid values", () => {
    const { filters, cursor } = parseSearchParams({
      gender: ["Male", "Robot"],
      sleep_quality: "good", // enums are case-sensitive
      age_min: "twenty",
      age_max: "", // empty form inputs
      coffee_intake_min: "Infinity",
      after: "-3",
      before: "1.5",
    });
    expect(filters.gender).toEqual(["Male"]);
    expect(filters.sleep_quality).toEqual([]);
    expect(filters.age).toEqual({ min: undefined, max: undefined });
    expect(filters.coffee_intake.min).toBeUndefined();
    expect(cursor).toBeNull();
  });

  it("accepts 0 as a range bound", () => {
    expect(parseSearchParams({ coffee_intake_min: "0" }).filters.coffee_intake.min).toBe(0);
  });

  it("prefers after when both cursors are present", () => {
    expect(parseSearchParams({ after: "10", before: "5" }).cursor).toEqual({ after: 10 });
    expect(parseSearchParams({ before: "5" }).cursor).toEqual({ before: 5 });
  });
});

describe("toSearchParams / toHref", () => {
  it("round trip keeps the filters", () => {
    const sp = {
      country: ["Japan", "Spain"],
      gender: "Female",
      health_issues: ["Mild", "Severe"],
      sleep_hours_min: "6",
      sleep_hours_max: "8.5",
    };
    const { filters } = parseSearchParams(sp);
    const roundTrip = parseSearchParams(
      Object.fromEntries(
        [...new Set(toSearchParams(filters).keys())].map((k) => [k, toSearchParams(filters).getAll(k)]),
      ),
    );
    expect(roundTrip.filters).toEqual(filters);
  });

  it("omits empty values and appends the cursor", () => {
    const { filters } = parseSearchParams({ country: "Japan", age_max: "" });
    expect(toHref(filters, { after: 50 })).toBe("/?country=Japan&after=50");
    expect(toHref(parseSearchParams({}).filters)).toBe("/");
  });
});
