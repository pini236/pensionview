import { describe, it, expect } from "vitest";
import { buildPipelineSteps, getNextStep } from "@/lib/pipeline/queue";

describe("buildPipelineSteps", () => {
  it("creates steps for a 10-page report", () => {
    const steps = buildPipelineSteps(10);
    expect(steps[0]).toBe("download");
    expect(steps[1]).toBe("decrypt");
    expect(steps[2]).toBe("upload_drive");
    expect(steps).toContain("extract_page_1");
    expect(steps).toContain("extract_page_10");
    expect(steps).toContain("validate");
    expect(steps).toContain("generate_insight");
    expect(steps).toContain("complete");
    expect(steps.length).toBe(16);
  });

  it("creates steps for backfill (no download step)", () => {
    const steps = buildPipelineSteps(10, true);
    expect(steps[0]).toBe("decrypt");
    expect(steps).not.toContain("download");
  });
});

describe("getNextStep", () => {
  it("returns decrypt after download", () => {
    expect(getNextStep("download", 10)).toBe("decrypt");
  });

  it("returns extract_page_2 after extract_page_1", () => {
    expect(getNextStep("extract_page_1", 10)).toBe("extract_page_2");
  });

  it("returns validate after last page extraction", () => {
    expect(getNextStep("extract_page_10", 10)).toBe("validate");
  });

  it("returns null after complete", () => {
    expect(getNextStep("complete", 10)).toBeNull();
  });
});
