import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runPreAgentGates } from "../scripts/run-pre-agent-gates.js";

function createFixtureRoot(files: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "pre-agent-gates-"));
  const runtimeDir = path.join(root, ".GITHUB-MODE", "runtime");
  mkdirSync(runtimeDir, { recursive: true });

  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(path.join(runtimeDir, filename), JSON.stringify(content, null, 2), "utf8");
  }

  return root;
}

const VALID_GATE = {
  schemaVersion: "1.0",
  gateVersion: "v1.0.0",
  enforcementMode: "fail_closed",
  allowRuntimeFetch: false,
  trustedWorkflows: ["github-mode-command.yml"],
  requiredMetadata: ["skillDigest", "approvalRecord", "scanArtifact", "policyArtifact"],
};

const VALID_ALLOWLIST = {
  schemaVersion: "1.0",
  allowlistVersion: "v1.0.0",
  keyType: "sha256",
  byDigest: {
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {
      skillName: "test-skill",
      status: "approved_trusted",
      source: {
        repository: "https://github.com/openclaw/skills",
        commitSha: "1111111111111111111111111111111111111111",
      },
      approvalRecord: { securityApprover: "@sec", runtimeApprover: "@rt" },
      evidence: { scanArtifact: "scan-1", policyArtifact: "policy-1" },
    },
  },
  revokedDigests: [],
};

const VALID_COMMAND_POLICY = {
  schemaVersion: "1.0",
  policyVersion: "v1.0.0",
  enforcementMode: "enforce",
  allowedActions: ["plan", "validate", "open-pr"],
  allowedCommands: ["explain", "refactor", "test", "diagram"],
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

function allValidFiles(): Record<string, unknown> {
  return {
    "trusted-command-gate.json": VALID_GATE,
    "trusted-skills-allowlist.json": VALID_ALLOWLIST,
    "command-policy.json": VALID_COMMAND_POLICY,
    "trust-levels.json": VALID_TRUST_LEVELS,
  };
}

describe("run-pre-agent-gates", () => {
  it("passes all three gates with valid contracts and allowed command", () => {
    const root = createFixtureRoot(allValidFiles());
    const result = runPreAgentGates(root, "explain");
    expect(result.passed).toBe(true);
    expect(result.gates).toHaveLength(3);
    expect(result.gates[0].gate).toBe("skill-package-scan");
    expect(result.gates[0].result).toBe("PASS");
    expect(result.gates[1].gate).toBe("lockfile-provenance");
    expect(result.gates[1].result).toBe("PASS");
    expect(result.gates[2].gate).toBe("policy-eval");
    expect(result.gates[2].result).toBe("PASS");
  });

  it("passes for all four MVP commands", () => {
    for (const command of ["explain", "refactor", "test", "diagram"]) {
      const root = createFixtureRoot(allValidFiles());
      const result = runPreAgentGates(root, command);
      expect(result.passed).toBe(true);
    }
  });

  it("fails at gate 1 when enforcementMode is not fail_closed", () => {
    const files = allValidFiles();
    files["trusted-command-gate.json"] = { ...VALID_GATE, enforcementMode: "permissive" };
    const root = createFixtureRoot(files);
    const result = runPreAgentGates(root, "explain");
    expect(result.passed).toBe(false);
    expect(result.gates).toHaveLength(1);
    expect(result.gates[0].gate).toBe("skill-package-scan");
    expect(result.gates[0].result).toBe("FAIL");
    expect(result.gates[0].reason).toContain("not fail_closed");
  });

  it("fails at gate 1 when revokedDigests is not an array", () => {
    const files = allValidFiles();
    files["trusted-skills-allowlist.json"] = { ...VALID_ALLOWLIST, revokedDigests: "bad" };
    const root = createFixtureRoot(files);
    const result = runPreAgentGates(root, "explain");
    expect(result.passed).toBe(false);
    expect(result.gates).toHaveLength(1);
    expect(result.gates[0].gate).toBe("skill-package-scan");
    expect(result.gates[0].result).toBe("FAIL");
  });

  it("fails at gate 2 when allowlist entry is missing provenance field", () => {
    const files = allValidFiles();
    const { source: _, ...withoutSource } =
      VALID_ALLOWLIST.byDigest[
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      ];
    files["trusted-skills-allowlist.json"] = {
      ...VALID_ALLOWLIST,
      byDigest: {
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": withoutSource,
      },
    };
    const root = createFixtureRoot(files);
    const result = runPreAgentGates(root, "explain");
    expect(result.passed).toBe(false);
    expect(result.gates).toHaveLength(2);
    expect(result.gates[0].result).toBe("PASS");
    expect(result.gates[1].gate).toBe("lockfile-provenance");
    expect(result.gates[1].result).toBe("FAIL");
    expect(result.gates[1].reason).toContain("source");
  });

  it("fails at gate 3 when command is not in allowedCommands", () => {
    const root = createFixtureRoot(allValidFiles());
    const result = runPreAgentGates(root, "deploy");
    expect(result.passed).toBe(false);
    expect(result.gates).toHaveLength(3);
    expect(result.gates[0].result).toBe("PASS");
    expect(result.gates[1].result).toBe("PASS");
    expect(result.gates[2].gate).toBe("policy-eval");
    expect(result.gates[2].result).toBe("FAIL");
    expect(result.gates[2].reason).toContain("deploy");
    expect(result.gates[2].reason).toContain("not in allowedCommands");
  });

  it("fails at gate 3 when enforcementMode is not enforce", () => {
    const files = allValidFiles();
    files["command-policy.json"] = { ...VALID_COMMAND_POLICY, enforcementMode: "warn" };
    const root = createFixtureRoot(files);
    const result = runPreAgentGates(root, "explain");
    expect(result.passed).toBe(false);
    expect(result.gates).toHaveLength(3);
    expect(result.gates[2].gate).toBe("policy-eval");
    expect(result.gates[2].result).toBe("FAIL");
    expect(result.gates[2].reason).toContain("warn");
  });

  it("fails at gate 3 when trust levels array is empty", () => {
    const files = allValidFiles();
    files["trust-levels.json"] = { ...VALID_TRUST_LEVELS, levels: [] };
    const root = createFixtureRoot(files);
    const result = runPreAgentGates(root, "explain");
    expect(result.passed).toBe(false);
    expect(result.gates[2].gate).toBe("policy-eval");
    expect(result.gates[2].result).toBe("FAIL");
    expect(result.gates[2].reason).toContain("no defined levels");
  });

  it("stops at first failing gate and does not run subsequent gates", () => {
    const files = allValidFiles();
    // Break gate 1: invalid enforcement mode
    files["trusted-command-gate.json"] = { ...VALID_GATE, enforcementMode: "permissive" };
    // Also break gate 3: invalid enforcement mode (should not be reached)
    files["command-policy.json"] = { ...VALID_COMMAND_POLICY, enforcementMode: "warn" };
    const root = createFixtureRoot(files);
    const result = runPreAgentGates(root, "explain");
    expect(result.passed).toBe(false);
    expect(result.gates).toHaveLength(1);
    expect(result.gates[0].gate).toBe("skill-package-scan");
  });

  it("includes gate, result, reason, and evidence in every gate record", () => {
    const root = createFixtureRoot(allValidFiles());
    const result = runPreAgentGates(root, "explain");
    for (const gate of result.gates) {
      expect(gate).toHaveProperty("gate");
      expect(gate).toHaveProperty("result");
      expect(gate).toHaveProperty("reason");
      expect(gate).toHaveProperty("evidence");
      expect(typeof gate.gate).toBe("string");
      expect(["PASS", "FAIL"]).toContain(gate.result);
      expect(typeof gate.reason).toBe("string");
      expect(typeof gate.evidence).toBe("string");
    }
  });

  it("gates run in correct order: skill-package-scan, lockfile-provenance, policy-eval", () => {
    const root = createFixtureRoot(allValidFiles());
    const result = runPreAgentGates(root, "explain");
    expect(result.gates.map((g) => g.gate)).toEqual([
      "skill-package-scan",
      "lockfile-provenance",
      "policy-eval",
    ]);
  });
});
