import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type PolicyDecision,
  enforcePolicyGatedAdapter,
} from "../scripts/enforce-policy-gated-adapter.js";

function createFixtureRoot(files: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "policy-gated-adapter-"));
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
  allowedCommands: ["explain", "refactor", "test", "diagram"],
  constraints: [
    "No direct protected-branch mutation outside pull-request flow.",
    "Privileged adapters require trusted trigger context.",
    "Secrets are unavailable to untrusted fork pull-request jobs.",
  ],
};

const VALID_ADAPTER_CONTRACTS = {
  schemaVersion: "1.0",
  contractsVersion: "v1.0.0",
  adapters: [
    {
      name: "repo-write",
      capability: "Creates branches and pull requests through policy-gated workflows.",
      trustLevels: ["trusted"],
      constraints: [
        "No direct writes to protected branches.",
        "All mutations must flow through pull-request automation.",
      ],
    },
    {
      name: "policy-sim",
      capability: "Runs deterministic route and policy simulation for validation artifacts.",
      trustLevels: ["untrusted", "semi-trusted", "trusted"],
      constraints: [
        "Read-only execution in untrusted contexts.",
        "No secret material in simulation inputs or outputs.",
      ],
    },
  ],
};

function allValidFiles(): Record<string, unknown> {
  return {
    "command-policy.json": JSON.parse(JSON.stringify(VALID_COMMAND_POLICY)),
    "adapter-contracts.json": JSON.parse(JSON.stringify(VALID_ADAPTER_CONTRACTS)),
  };
}

describe("enforce-policy-gated-adapter", () => {
  describe("enforcePolicyGatedAdapter", () => {
    it("passes for valid adapter and allowed action", () => {
      const root = createFixtureRoot(allValidFiles());
      const decision = enforcePolicyGatedAdapter(root, "repo-write", "open-pr");
      expect(decision.result).toBe("PASS");
      expect(decision.adapter).toBe("repo-write");
      expect(decision.action).toBe("open-pr");
      expect(decision.policyVersion).toBe("v1.0.0");
      expect(decision.enforcementMode).toBe("enforce");
      expect(decision.reason).toContain("passed policy gate");
    });

    it("passes for policy-sim adapter with validate action", () => {
      const root = createFixtureRoot(allValidFiles());
      const decision = enforcePolicyGatedAdapter(root, "policy-sim", "validate");
      expect(decision.result).toBe("PASS");
      expect(decision.adapter).toBe("policy-sim");
      expect(decision.action).toBe("validate");
    });

    it("fails when enforcement mode is not enforce", () => {
      const files = allValidFiles();
      (files["command-policy.json"] as Record<string, unknown>).enforcementMode = "audit";
      const root = createFixtureRoot(files);
      const decision = enforcePolicyGatedAdapter(root, "repo-write", "open-pr");
      expect(decision.result).toBe("FAIL");
      expect(decision.reason).toContain("enforcementMode");
      expect(decision.reason).toContain("audit");
      expect(decision.enforcementMode).toBe("audit");
    });

    it("fails when adapter does not exist in adapter-contracts.json", () => {
      const root = createFixtureRoot(allValidFiles());
      const decision = enforcePolicyGatedAdapter(root, "nonexistent-adapter", "open-pr");
      expect(decision.result).toBe("FAIL");
      expect(decision.reason).toContain("not found");
      expect(decision.reason).toContain("fail-closed");
    });

    it("fails when action is not in allowedActions", () => {
      const root = createFixtureRoot(allValidFiles());
      const decision = enforcePolicyGatedAdapter(root, "repo-write", "delete");
      expect(decision.result).toBe("FAIL");
      expect(decision.reason).toContain("not in allowedActions");
      expect(decision.reason).toContain("delete");
    });

    it("fails when adapter has no constraints", () => {
      const files = allValidFiles();
      const contracts = files["adapter-contracts.json"] as Record<string, unknown>;
      const adapters = contracts.adapters as Record<string, unknown>[];
      const repoWrite = adapters.find((a) => a.name === "repo-write") as Record<string, unknown>;
      repoWrite.constraints = [];
      const root = createFixtureRoot(files);
      const decision = enforcePolicyGatedAdapter(root, "repo-write", "open-pr");
      expect(decision.result).toBe("FAIL");
      expect(decision.reason).toContain("no constraints");
    });

    it("fails when command-policy.json is missing", () => {
      const files = allValidFiles();
      delete files["command-policy.json"];
      const root = createFixtureRoot(files);
      const decision = enforcePolicyGatedAdapter(root, "repo-write", "open-pr");
      expect(decision.result).toBe("FAIL");
      expect(decision.reason).toContain("failed to read command-policy.json");
      expect(decision.policyVersion).toBe("unknown");
    });

    it("fails when adapter-contracts.json is missing", () => {
      const files = allValidFiles();
      delete files["adapter-contracts.json"];
      const root = createFixtureRoot(files);
      const decision = enforcePolicyGatedAdapter(root, "repo-write", "open-pr");
      expect(decision.result).toBe("FAIL");
      expect(decision.reason).toContain("failed to read adapter-contracts.json");
    });

    it("fails when adapters field is not an array", () => {
      const files = allValidFiles();
      (files["adapter-contracts.json"] as Record<string, unknown>).adapters = "invalid";
      const root = createFixtureRoot(files);
      const decision = enforcePolicyGatedAdapter(root, "repo-write", "open-pr");
      expect(decision.result).toBe("FAIL");
      expect(decision.reason).toContain("not an array");
    });

    it("fails when allowedActions is not an array", () => {
      const files = allValidFiles();
      (files["command-policy.json"] as Record<string, unknown>).allowedActions = "invalid";
      const root = createFixtureRoot(files);
      const decision = enforcePolicyGatedAdapter(root, "repo-write", "open-pr");
      expect(decision.result).toBe("FAIL");
      expect(decision.reason).toContain("allowedActions is not an array");
    });

    it("every decision has all required fields", () => {
      const root = createFixtureRoot(allValidFiles());
      const decisions: PolicyDecision[] = [
        enforcePolicyGatedAdapter(root, "repo-write", "open-pr"),
        enforcePolicyGatedAdapter(root, "repo-write", "delete"),
        enforcePolicyGatedAdapter(root, "nonexistent", "open-pr"),
      ];
      for (const d of decisions) {
        expect(d).toHaveProperty("gate");
        expect(d).toHaveProperty("result");
        expect(d).toHaveProperty("adapter");
        expect(d).toHaveProperty("action");
        expect(d).toHaveProperty("reason");
        expect(d).toHaveProperty("evidence");
        expect(d).toHaveProperty("policyVersion");
        expect(d).toHaveProperty("enforcementMode");
        expect(d).toHaveProperty("timestamp");
        expect(d.gate).toBe("policy-gated-adapter");
      }
    });

    it("passes all allowedActions for each adapter", () => {
      const root = createFixtureRoot(allValidFiles());
      for (const action of ["plan", "validate", "open-pr"]) {
        const decision = enforcePolicyGatedAdapter(root, "repo-write", action);
        expect(decision.result).toBe("PASS");
        expect(decision.action).toBe(action);
      }
    });

    it("evidence references both policy files on success", () => {
      const root = createFixtureRoot(allValidFiles());
      const decision = enforcePolicyGatedAdapter(root, "repo-write", "open-pr");
      expect(decision.result).toBe("PASS");
      expect(decision.evidence).toContain("command-policy.json");
      expect(decision.evidence).toContain("adapter-contracts.json");
    });
  });
});
