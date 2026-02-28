import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkEvalThresholds,
  validateEvalThresholdsContract,
} from "../scripts/check-eval-thresholds.js";

function createFixtureRoot(evalThresholds: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "eval-thresholds-"));
  const runtimeDir = path.join(root, ".GITHUB-MODE", "runtime");
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(
    path.join(runtimeDir, "eval-thresholds.json"),
    JSON.stringify(evalThresholds, null, 2),
    "utf8",
  );
  return root;
}

const VALID_CONFIG = {
  schemaVersion: "1.0",
  thresholdsVersion: "v1.0.0",
  enforcementMode: "enforce",
  tiers: [{ id: "tier0", minScore: 0.7, maxRegressionDelta: 0.05, blocksPromotion: true }],
  subsystems: [{ id: "policy-validation", tier: "tier0", metric: "pass_rate", baseline: 1.0 }],
};

describe("check-eval-thresholds", () => {
  it("passes when score meets threshold", () => {
    const root = createFixtureRoot(VALID_CONFIG);
    const result = checkEvalThresholds([{ subsystemId: "policy-validation", score: 0.9 }], root);
    expect(result.passed).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].passed).toBe(true);
  });

  it("fails when score is below threshold", () => {
    const root = createFixtureRoot(VALID_CONFIG);
    const result = checkEvalThresholds([{ subsystemId: "policy-validation", score: 0.5 }], root);
    expect(result.passed).toBe(false);
    expect(result.findings[0].passed).toBe(false);
  });

  it("passes when score exactly equals threshold", () => {
    const root = createFixtureRoot(VALID_CONFIG);
    const result = checkEvalThresholds([{ subsystemId: "policy-validation", score: 0.7 }], root);
    expect(result.passed).toBe(true);
  });

  it("skips unknown subsystems", () => {
    const root = createFixtureRoot(VALID_CONFIG);
    const result = checkEvalThresholds([{ subsystemId: "unknown-subsystem", score: 0.1 }], root);
    expect(result.passed).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("passes with empty inputs when enforcement is active", () => {
    const root = createFixtureRoot(VALID_CONFIG);
    const result = checkEvalThresholds([], root);
    expect(result.passed).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("skips enforcement when mode is not enforce", () => {
    const root = createFixtureRoot({ ...VALID_CONFIG, enforcementMode: "warn" });
    const result = checkEvalThresholds([{ subsystemId: "policy-validation", score: 0.1 }], root);
    expect(result.passed).toBe(true);
  });
});

describe("validateEvalThresholdsContract", () => {
  it("passes with valid config", () => {
    const root = createFixtureRoot(VALID_CONFIG);
    expect(() => validateEvalThresholdsContract(root)).not.toThrow();
  });

  it("fails when schemaVersion is missing", () => {
    const { schemaVersion: _, ...noSchema } = VALID_CONFIG;
    const root = createFixtureRoot(noSchema);
    expect(() => validateEvalThresholdsContract(root)).toThrow("schemaVersion");
  });

  it("fails when tiers is empty", () => {
    const root = createFixtureRoot({ ...VALID_CONFIG, tiers: [] });
    expect(() => validateEvalThresholdsContract(root)).toThrow("non-empty array");
  });

  it("fails when subsystems is empty", () => {
    const root = createFixtureRoot({ ...VALID_CONFIG, subsystems: [] });
    expect(() => validateEvalThresholdsContract(root)).toThrow("non-empty array");
  });
});
