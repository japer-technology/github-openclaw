import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkCostThresholds,
  validateCostThresholdsContract,
} from "../scripts/check-cost-thresholds.js";

function createFixtureRoot(costThresholds: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "cost-thresholds-"));
  const runtimeDir = path.join(root, ".GITHUB-MODE", "runtime");
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(
    path.join(runtimeDir, "cost-thresholds.json"),
    JSON.stringify(costThresholds, null, 2),
    "utf8",
  );
  return root;
}

const VALID_CONFIG = {
  schemaVersion: "1.0",
  thresholdsVersion: "v1.0.0",
  enforcementMode: "enforce",
  currency: "USD",
  gates: [
    { id: "per-run-ceiling", description: "Max per run", maxAmount: 5.0, blocksPromotion: true },
    { id: "daily-budget", description: "Max daily", maxAmount: 50.0, blocksPromotion: true },
  ],
};

describe("check-cost-thresholds", () => {
  it("passes when amount is within budget", () => {
    const root = createFixtureRoot(VALID_CONFIG);
    const result = checkCostThresholds([{ gateId: "per-run-ceiling", amount: 3.0 }], root);
    expect(result.passed).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].passed).toBe(true);
  });

  it("fails when amount exceeds budget", () => {
    const root = createFixtureRoot(VALID_CONFIG);
    const result = checkCostThresholds([{ gateId: "per-run-ceiling", amount: 10.0 }], root);
    expect(result.passed).toBe(false);
    expect(result.findings[0].passed).toBe(false);
  });

  it("passes when amount exactly equals max", () => {
    const root = createFixtureRoot(VALID_CONFIG);
    const result = checkCostThresholds([{ gateId: "per-run-ceiling", amount: 5.0 }], root);
    expect(result.passed).toBe(true);
  });

  it("skips unknown gate IDs", () => {
    const root = createFixtureRoot(VALID_CONFIG);
    const result = checkCostThresholds([{ gateId: "unknown-gate", amount: 999.0 }], root);
    expect(result.passed).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("checks multiple gates independently", () => {
    const root = createFixtureRoot(VALID_CONFIG);
    const result = checkCostThresholds(
      [
        { gateId: "per-run-ceiling", amount: 3.0 },
        { gateId: "daily-budget", amount: 100.0 },
      ],
      root,
    );
    expect(result.passed).toBe(false);
    expect(result.findings[0].passed).toBe(true);
    expect(result.findings[1].passed).toBe(false);
  });

  it("skips enforcement when mode is not enforce", () => {
    const root = createFixtureRoot({ ...VALID_CONFIG, enforcementMode: "warn" });
    const result = checkCostThresholds([{ gateId: "per-run-ceiling", amount: 999.0 }], root);
    expect(result.passed).toBe(true);
  });
});

describe("validateCostThresholdsContract", () => {
  it("passes with valid config", () => {
    const root = createFixtureRoot(VALID_CONFIG);
    expect(() => validateCostThresholdsContract(root)).not.toThrow();
  });

  it("fails when schemaVersion is missing", () => {
    const { schemaVersion: _, ...noSchema } = VALID_CONFIG;
    const root = createFixtureRoot(noSchema);
    expect(() => validateCostThresholdsContract(root)).toThrow("schemaVersion");
  });

  it("fails when gates is empty", () => {
    const root = createFixtureRoot({ ...VALID_CONFIG, gates: [] });
    expect(() => validateCostThresholdsContract(root)).toThrow("non-empty array");
  });
});
