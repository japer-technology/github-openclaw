import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkPolicyDrift } from "../scripts/check-policy-drift.js";

function createFixtureRoot(files: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "policy-drift-"));
  const runtimeDir = path.join(root, ".GITHUB-MODE", "runtime");
  mkdirSync(runtimeDir, { recursive: true });

  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(path.join(runtimeDir, filename), JSON.stringify(content, null, 2), "utf8");
  }

  return root;
}

const VALID_COMMAND_POLICY = {
  schemaVersion: "1.0",
  policyVersion: "v1.0.0",
  enforcementMode: "enforce",
  allowedActions: ["plan", "validate", "open-pr"],
  constraints: ["No direct protected-branch mutation outside pull-request flow."],
};

const VALID_TRUST_LEVELS = {
  schemaVersion: "1.0",
  trustVersion: "v1.0.0",
  levels: [
    { id: "untrusted", allowsSecrets: false, allowsPrivilegedMutation: false },
    { id: "semi-trusted", allowsSecrets: false, allowsPrivilegedMutation: false },
    { id: "trusted", allowsSecrets: true, allowsPrivilegedMutation: true },
  ],
};

const VALID_PARITY_MATRIX = {
  schemaVersion: "1.0",
  matrixVersion: "v1.0.0",
  mappings: [
    {
      workflow: "build-and-test",
      installedRuntime: "pnpm check",
      githubMode: "ci.yml",
      parity: "native",
    },
  ],
};

describe("check-policy-drift", () => {
  it("passes with valid policy, trust levels, and parity matrix", () => {
    const root = createFixtureRoot({
      "command-policy.json": VALID_COMMAND_POLICY,
      "trust-levels.json": VALID_TRUST_LEVELS,
      "parity-matrix.json": VALID_PARITY_MATRIX,
    });

    const result = checkPolicyDrift(root);
    expect(result.drifted).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  it("detects drift when enforcementMode is not enforce", () => {
    const root = createFixtureRoot({
      "command-policy.json": { ...VALID_COMMAND_POLICY, enforcementMode: "warn" },
      "trust-levels.json": VALID_TRUST_LEVELS,
      "parity-matrix.json": VALID_PARITY_MATRIX,
    });

    const result = checkPolicyDrift(root);
    expect(result.drifted).toBe(true);
    expect(result.findings.some((f) => f.field === "enforcementMode")).toBe(true);
  });

  it("detects drift when allowedActions is empty", () => {
    const root = createFixtureRoot({
      "command-policy.json": { ...VALID_COMMAND_POLICY, allowedActions: [] },
      "trust-levels.json": VALID_TRUST_LEVELS,
      "parity-matrix.json": VALID_PARITY_MATRIX,
    });

    const result = checkPolicyDrift(root);
    expect(result.drifted).toBe(true);
    expect(result.findings.some((f) => f.field === "allowedActions")).toBe(true);
  });

  it("detects drift when untrusted level is missing", () => {
    const root = createFixtureRoot({
      "command-policy.json": VALID_COMMAND_POLICY,
      "trust-levels.json": {
        ...VALID_TRUST_LEVELS,
        levels: [{ id: "trusted", allowsSecrets: true, allowsPrivilegedMutation: true }],
      },
      "parity-matrix.json": VALID_PARITY_MATRIX,
    });

    const result = checkPolicyDrift(root);
    expect(result.drifted).toBe(true);
    expect(result.findings.some((f) => f.message.includes("untrusted"))).toBe(true);
  });

  it("detects drift when trusted level is missing", () => {
    const root = createFixtureRoot({
      "command-policy.json": VALID_COMMAND_POLICY,
      "trust-levels.json": {
        ...VALID_TRUST_LEVELS,
        levels: [{ id: "untrusted", allowsSecrets: false, allowsPrivilegedMutation: false }],
      },
      "parity-matrix.json": VALID_PARITY_MATRIX,
    });

    const result = checkPolicyDrift(root);
    expect(result.drifted).toBe(true);
    expect(result.findings.some((f) => f.message.includes("trusted"))).toBe(true);
  });

  it("includes remediation pointers in findings", () => {
    const root = createFixtureRoot({
      "command-policy.json": { ...VALID_COMMAND_POLICY, enforcementMode: "warn" },
      "trust-levels.json": VALID_TRUST_LEVELS,
      "parity-matrix.json": VALID_PARITY_MATRIX,
    });

    const result = checkPolicyDrift(root);
    expect(result.drifted).toBe(true);
    for (const finding of result.findings) {
      expect(finding.remediation).toBeTruthy();
    }
  });
});
